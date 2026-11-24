// ローカルで CI と同じ検査をまとめて回すゲート。
//
// なぜ要るか: CI のゲートは 10 種類あり、npm スクリプトとしては全部揃っているのに、
// それらを CI と同じ順序でまとめて回す入口が無かった。結果、push してから 12 分待って
// 赤を見る運用になっていた（2026-09-14 の実測: CI 全体の所要 12分30秒、直近 20 本の
// うち 6 本が失敗。失敗はいずれもフレークではなく実バグ）。ローカルで先に落とせば、
// その 12 分を待たずに済む。
//
// 使い方:
//   npm run precheck        速いゲートだけ（ビルドなし・数十秒〜2分）。日常の確認用
//   npm run precheck:full   ビルドと e2e も含めて CI 相当（数分）。PR を出す前
//   npm run precheck -- --all    最初の失敗で止めず、全部走らせて一覧を出す
//
// **このスクリプトが緑でも CI が緑とは限らない**。Docker や本番シークレットが要る
// ゲート（rls-tests / schema-drift / migration-gate / Lighthouse）はローカルでは回せない。
// 実行の最後に「CI でしか回らないもの」を必ず表示するので、そこを読んでから push する。

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const FULL = args.includes('--full')
const RUN_ALL = args.includes('--all')

// CI (.github/workflows/ci.yml) の test ジョブと同じ順序。速いものから並べ、
// 最初の失敗で止める（--all で最後まで走る）。
// needs: そのゲートに要る外部コマンド。無ければ SKIP にして理由を出す（黙って飛ばさない）。
const GATES = [
  { name: 'lint', cmd: 'npm run lint', tier: 'fast', ci: 'test' },
  { name: 'type-check', cmd: 'npm run type-check', tier: 'fast', ci: 'test' },
  { name: 'i18n:check', cmd: 'npm run i18n:check', tier: 'fast', ci: 'test' },
  { name: 'schema:check', cmd: 'npm run schema:check', tier: 'fast', ci: 'test' },
  { name: 'auth-route:check', cmd: 'npm run auth-route:check', tier: 'fast', ci: 'test' },
  { name: 'private-tables:check', cmd: 'npm run private-tables:check', tier: 'fast', ci: 'test' },
  { name: 'test', cmd: 'npm run test', tier: 'fast', ci: 'test' },
  { name: 'audit', cmd: 'npm run audit', tier: 'fast', ci: 'audit' },
  { name: 'secrets:scan', cmd: 'npm run secrets:scan', tier: 'fast', ci: 'gitleaks', needs: 'gitleaks' },
  {
    name: 'edge-functions',
    // CI の edge-functions ジョブを文字どおり写す。どれを外しても検査が静かに壊れる:
    //   --frozen  … 付けないと deno.lock を書き換えてしまう（追跡ファイルが汚れる）
    //   --lock    … 付けないと CI と違う依存解決で通ってしまう
    //   find で列挙 … `**` は globstar 無効なシェルで1階層に退化し、__tests__ を取りこぼす
    //                （CI の注記いわく実測 49 件中 29 件）。0 件なら落とす番人も同じ理由。
    //   DENO_NO_PACKAGE_JSON=1 … これが無いとローカルだけ落ちる。CI の edge-functions ジョブは
    //                npm ci を回さないので node_modules が無く、Deno は npm ワークスペースを
    //                検出しない。手元には両方あるため Deno が lock に "workspace" 節を足したがり、
    //                --frozen と衝突する。package.json を見せないことで CI と同じ条件に揃える。
    cmd: [
      'DENO_NO_PACKAGE_JSON=1 deno cache --lock=supabase/functions/deno.lock --frozen $(find supabase/functions -name "*.ts" | sort)',
      'files=$(find supabase/functions -name "*.ts" | sort)',
      'n=$(printf "%s\\n" "$files" | grep -c .)',
      'echo "deno check 対象: $n ファイル"',
      '[ "$n" -gt 0 ] || { echo "deno check の対象が 0 件。パス構成を確認すること"; exit 1; }',
      'DENO_NO_PACKAGE_JSON=1 deno check --lock=supabase/functions/deno.lock $files',
      'DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net --allow-read --lock=supabase/functions/deno.lock --cached-only --no-check supabase/functions/',
    ].join(' && '),
    tier: 'fast',
    ci: 'edge-functions',
    needs: 'deno',
  },
  { name: 'build', cmd: 'npm run build', tier: 'full', ci: 'test / perf-budget' },
  // CI の perf-budget は size と size:routes の**両方**を回す。size（size-limit）を抜かすと
  // ルート予算だけ見て通り、ページチャンクの予算超過を手元で拾えない（2026-09-14 に実害。
  // `/` が 9.74 kB → 10.3 kB になった変更が、size:routes だけでは緑のまま push された）。
  { name: 'size', cmd: 'npm run size', tier: 'full', ci: 'perf-budget', afterBuild: true },
  { name: 'size:routes', cmd: 'npm run size:routes', tier: 'full', ci: 'perf-budget', afterBuild: true },
  { name: 'e2e', cmd: 'npm run e2e', tier: 'full', ci: 'e2e', afterBuild: true },
]

// ローカルでは回せないゲート。緑を過信させないため、毎回これを出す。
const CI_ONLY = [
  ['rls-tests', 'pg-tap。Supabase をローカル起動して流す必要がある'],
  ['schema-drift', 'Docker で schema.sql を適用して型を再生成する'],
  ['migration-gate', '本番 DB と突き合わせる。シークレットが要る'],
  ['perf-budget の Lighthouse', 'CI 上の実測環境でしか意味のある数字にならない'],
]

const CI_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key-for-ci-build',
}

const C = {
  reset: '[0m',
  dim: '[2m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  bold: '[1m',
}

function has(command) {
  const paths = (process.env.PATH || '').split(':')
  return paths.some((p) => p && existsSync(join(p, command)))
}

function run(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...CI_ENV } })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

function secs(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

async function main() {
  const gates = GATES.filter((g) => FULL || g.tier === 'fast')
  const label = FULL ? 'precheck:full（ビルドと e2e を含む）' : 'precheck（速いゲートのみ）'
  console.log(`\n${C.bold}${label}${C.reset} — ${gates.length} ゲート\n`)

  const results = []
  const started = Date.now()
  let failed = false

  for (const gate of gates) {
    if (gate.needs && !has(gate.needs)) {
      console.log(`${C.yellow}SKIP${C.reset} ${gate.name} — ${gate.needs} が入っていない（CI では回る）`)
      results.push({ ...gate, status: 'skip', ms: 0, reason: `${gate.needs} 未インストール` })
      continue
    }
    // build を飛ばした回で build 成果物に依存するゲートを回しても意味が無い。
    if (gate.afterBuild && !results.some((r) => r.name === 'build' && r.status === 'pass')) {
      console.log(`${C.yellow}SKIP${C.reset} ${gate.name} — build が通っていない`)
      results.push({ ...gate, status: 'skip', ms: 0, reason: 'build 未実行' })
      continue
    }

    console.log(`${C.dim}──── ${gate.name}${C.reset}`)
    const t = Date.now()
    const code = await run(gate.cmd)
    const ms = Date.now() - t
    if (code === 0) {
      console.log(`${C.green}PASS${C.reset} ${gate.name} ${C.dim}${secs(ms)}${C.reset}\n`)
      results.push({ ...gate, status: 'pass', ms })
    } else {
      console.log(`${C.red}FAIL${C.reset} ${gate.name} ${C.dim}${secs(ms)}${C.reset}\n`)
      results.push({ ...gate, status: 'fail', ms, code })
      failed = true
      if (!RUN_ALL) break
    }
  }

  const width = Math.max(...results.map((r) => r.name.length), 12)
  console.log(`${C.bold}結果${C.reset}`)
  for (const r of results) {
    const mark = r.status === 'pass' ? `${C.green}PASS${C.reset}` : r.status === 'fail' ? `${C.red}FAIL${C.reset}` : `${C.yellow}SKIP${C.reset}`
    const note = r.reason ? ` ${C.dim}(${r.reason})${C.reset}` : ''
    console.log(`  ${mark} ${r.name.padEnd(width)} ${C.dim}${r.status === 'skip' ? '' : secs(r.ms)}${C.reset}${note}`)
  }
  const skipped = gates.length - results.length
  if (skipped > 0) console.log(`  ${C.dim}（最初の失敗で止めたため ${skipped} ゲート未実行。全部見るなら --all）${C.reset}`)
  console.log(`  ${C.dim}合計 ${secs(Date.now() - started)}${C.reset}\n`)

  console.log(`${C.bold}ローカルでは回せないゲート${C.reset} ${C.dim}（push 後に CI で初めて判定される）${C.reset}`)
  for (const [name, why] of CI_ONLY) console.log(`  ${C.dim}-${C.reset} ${name} — ${C.dim}${why}${C.reset}`)
  if (!FULL) {
    console.log(`  ${C.dim}-${C.reset} build / size / size:routes / e2e — ${C.dim}この実行では省いた。${C.bold}npm run precheck:full${C.reset}${C.dim} で回る${C.reset}`)
  }
  console.log()

  if (failed) {
    const first = results.find((r) => r.status === 'fail')
    console.log(`${C.red}${C.bold}${first.name} で落ちた${C.reset}`)
    console.log(`  そこだけ回し直す: ${C.bold}${first.cmd}${C.reset}`)
    console.log(`  CI では ${first.ci} ジョブが同じものを見る\n`)
    process.exit(1)
  }

  console.log(`${C.green}${C.bold}全ゲート通過${C.reset}\n`)
}

main()
