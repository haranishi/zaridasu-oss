// REQ-306 FR-306-01 / FR-306-02 / FR-306-03: 性能予算の実効化（ルート単位 First Load JS のゲート）
//
// ## なぜ必要か（2026-07-30 監査 / develop 89495e9）
//
// `.size-limit.json` の予算対象は全エントリが「ルート固有チャンク」(`app/**/page-*.js`) であり、
// 実際にユーザーへ落ちてくる First Load JS の 3% 程度しかゲートしていなかった。
// 共有チャンク（Sentry + app-router ランタイム 123.6 kB / Supabase 53.6 kB / i18next 20.4 kB /
// ja 翻訳 23.0 kB / zod 16.9 kB）は全て予算外で、/dashboard と /ranking には予算エントリ自体が無い。
// 結果として「+49 kB 規模の常駐 SDK が全ルートに載る」ような退行が CI をグリーンのまま通過していた。
//
// 本スクリプトは「ルートごとに実際に落ちてくる JS の合計バイト数」を直接ゲートする。
// 共有チャンクを含む 100% を見るため、チャンク構成が変わっても監視範囲が抜けない。
//
// ## 計測方法と、その正しさの根拠
//
// `.next/app-build-manifest.json` の `pages[<route>]` は、そのルートの初期ロードで読まれる
// チャンクの一覧である。これを gzip(level 9) して合算した値は `next build` が出力する
// 「First Load JS」列と一致することを実測で確認済み（2026-07-30 / develop 89495e9）:
//
//   ルート        本スクリプト   next build の First Load JS
//   /              340.4 kB       340 kB
//   /lp            219.4 kB       219 kB
//   /post/[id]     337.1 kB       337 kB
//   /collection    343.3 kB       343 kB
//   /trends        312.4 kB       312 kB
//   /ranking       312.3 kB       312 kB
//   /dashboard     355.3 kB       355 kB
//
// gzip level 9 は `@size-limit/file`（`createGzip({ level: 9 })`）と同一設定なので、
// 本スクリプトの数値は `npm run size` の数値と直接足し引きできる。
//
// ## 単位について（重要）
//
// kB = 1000 バイト。size-limit の `"15 KB"` は 15000 バイトと解釈され、`next build` の
// First Load JS 表記も 1000 進である。KiB(1024) と混同すると約 2.4% ずれるので揃えている。
//
// ## 閾値の運用（ラチェット / FR-306-08）
//
// 閾値は「直近実測 × 1.05（＝約 5% のヘッドルーム）を切り上げ」で置いている。
// ヘッドルームは日常的な依存更新のゆらぎを吸収するためのもので、恒久的な余白ではない。
// **REQ-305（初期バンドル削減）などでサイズを削ったら、必ず閾値も同じだけ下げること。**
// 削った分をそのまま次の余裕にすると、この予算はまた「通るだけのゲート」に戻る。
// 閾値を変更するときは `baseline`（実測値）と日付も必ず同時に更新する（AC-06）。
//
// 実行: `npm run size:routes`（事前に `npm run build` が必要）
// CI  : .github/workflows/ci.yml の perf-budget ジョブ

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const APP_BUILD_MANIFEST = join(root, '.next', 'app-build-manifest.json')
const SIZE_LIMIT_CONFIG = join(root, '.size-limit.json')
const SIZE_LIMIT_BIN = join(root, 'node_modules', 'size-limit', 'bin.js')

/** kB = 1000 バイト（size-limit / next build と同じ 1000 進） */
const kB = 1000

// --- CHECK 1: ルート単位の First Load JS 予算（主ゲート / FR-306-01, FR-306-02） -----------------
//
// budget   = 直近実測 × 1.05 を 5 kB 単位で切り上げ
// baseline = 直近実測値（ラチェット時の比較元。閾値・実測日と同時に更新する）
const ROUTE_BUDGETS = [
  // [REQ-306 AC-06: 2026-08-12実測395.3 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/dashboard', manifestKey: '/dashboard/page', baseline: 395.3 * kB, budget: 420 * kB },
  // [REQ-306 AC-06: 2026-08-12実測386.0 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/collection', manifestKey: '/collection/page', baseline: 386.0 * kB, budget: 410 * kB },
  // 2026-10-19: 新ホームの実測318.3 kB + 約5%。本人の集計UIは分割読込。
  { route: '/', manifestKey: '/(home)/page', baseline: 318.3 * kB, budget: 335 * kB },
  // 2026-10-19: 旧ホームの地図を /map に分離。実測357.6 kB + 約5%。
  { route: '/map', manifestKey: '/map/page', baseline: 357.6 * kB, budget: 376 * kB },
  // 2026-10-19: 新規の記録ガイド。実測311.1 kB + 約5%。
  { route: '/guide', manifestKey: '/guide/page', baseline: 311.1 * kB, budget: 327 * kB },
  // [REQ-306 AC-06: 2026-08-12実測376.9 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/post/[id]', manifestKey: '/post/[id]/page', baseline: 376.9 * kB, budget: 400 * kB },
  // [REQ-306 AC-06: 2026-08-12実測352.9 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/trends', manifestKey: '/trends/page', baseline: 352.9 * kB, budget: 375 * kB },
  // [REQ-306 AC-06: 2026-08-12実測353.0 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/ranking', manifestKey: '/ranking/page', baseline: 353.0 * kB, budget: 375 * kB },
  // [REQ-306 AC-06: 2026-08-12実測258.4 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
  { route: '/lp', manifestKey: '/lp/page', baseline: 258.4 * kB, budget: 275 * kB },
]

// --- CHECK 2: 全ルート共通の共有チャンク合計（補助 / FR-306-03） --------------------------------
//
// 上記の全ルートすべてに含まれるチャンクの合計。webpack の採番（`9898-*.js` 等）に一切依存せず
// マニフェストから毎回導出するため、チャンク番号が変わっても監視が外れない。
// 「新しい依存が共有チャンクに入って全ルートが重くなる」退行はここに直接現れる。
// [REQ-306 AC-06: 2026-08-12実測244.8 kB × 1.05を切り上げ / Next.js 16.3.0 のランタイム増加]
const SHARED_CHUNK_BASELINE = 244.8 * kB
const SHARED_CHUNK_BUDGET = 260 * kB

// --- CHECK 3: `.size-limit.json` の自己点検（FR-306-03 / AC-03） --------------------------------
//
// size-limit の `path` は `9898-*.js` のように webpack の採番へ依存しており、番号が変わると
// glob が「対象 0 件」になりうる。size-limit 12.1.0 は 0 件を検出して非 0 終了することを実測で
// 確認済みだが、その挙動はバージョン依存なので、ここでも明示的に検査してバージョンに依らず担保する。
//
// さらに「番号が変わった結果、glob が別の（無関係で小さい）チャンクにマッチしてしまい、
// 予算はパスするが本来の対象を見ていない」という静かな劣化も起きうる。これを検知するため、
// 各エントリの実測サイズが予算の MIN_SIZE_FRACTION 未満なら「別チャンクを指している疑い」として落とす。
const MIN_SIZE_FRACTION = 0.1

// ---------------------------------------------------------------------------------------------

const failures = []
const lines = []

function fmt(bytes) {
  return `${(bytes / kB).toFixed(1)} kB`
}

function pct(value, base) {
  const diff = ((value - base) / base) * 100
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
}

function readJson(path, hint) {
  if (!existsSync(path)) {
    console.error(`ERROR: ${path} が見つかりません。${hint}`)
    process.exit(1)
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`ERROR: ${path} を JSON として読めません: ${error.message}`)
    process.exit(1)
  }
}

/** .next 配下の相対パスを gzip(level 9) したバイト数 */
function gzipBytes(relativeToNext) {
  const path = join(root, '.next', relativeToNext)
  if (!existsSync(path)) {
    failures.push(`マニフェストが参照するファイルが存在しません: .next/${relativeToNext}`)
    return 0
  }
  return gzipSync(readFileSync(path), { level: 9 }).length
}

const manifest = readJson(
  APP_BUILD_MANIFEST,
  '先に `npm run build` を実行してください（本スクリプトはビルド成果物を計測します）。'
)

if (!manifest.pages || typeof manifest.pages !== 'object') {
  console.error('ERROR: app-build-manifest.json に pages がありません。Next.js のバージョン変更を確認してください。')
  process.exit(1)
}

// ===== CHECK 1: ルート単位の First Load JS =====================================================
lines.push('CHECK 1: ルート単位の First Load JS 合計（gzip / 主ゲート）')
lines.push('  ルート          現在値      予算     2026-08-12実測比   判定')

const routeChunkSets = []

for (const entry of ROUTE_BUDGETS) {
  const files = manifest.pages[entry.manifestKey]
  if (!Array.isArray(files)) {
    // ルートを rename / 削除すると予算が静かに消えるので、必ず失敗させる。
    failures.push(
      `ルート ${entry.route} がビルド成果物に見つかりません（app-build-manifest.json の "${entry.manifestKey}" が無い）。` +
        'ルートを rename / 削除した場合は ROUTE_BUDGETS も更新してください。'
    )
    lines.push(`  ${entry.route.padEnd(14)} (マニフェストに存在しない)`)
    continue
  }

  const jsFiles = files.filter((file) => file.endsWith('.js'))
  routeChunkSets.push(new Set(jsFiles))

  const total = jsFiles.reduce((sum, file) => sum + gzipBytes(file), 0)
  const over = total > entry.budget
  if (over) {
    failures.push(
      `ルート ${entry.route} の First Load JS が予算超過: ${fmt(total)} > ${fmt(entry.budget)} ` +
        `(2026-08-12 実測 ${fmt(entry.baseline)} から ${pct(total, entry.baseline)})`
    )
  }
  lines.push(
    `  ${entry.route.padEnd(14)} ${fmt(total).padStart(9)} ${fmt(entry.budget).padStart(9)} ` +
      `${pct(total, entry.baseline).padStart(10)}        ${over ? 'FAIL' : 'ok'}`
  )
}

lines.push(
  '  ※ 監視カバー率 100%（ルート固有チャンクだけでなく共有チャンクを含む First Load JS 全量が対象）'
)

// ===== CHECK 2: 共有チャンク合計 ==============================================================
lines.push('')
lines.push('CHECK 2: 全対象ルート共通の共有チャンク合計（webpack の採番に依存しない集計）')

if (routeChunkSets.length === ROUTE_BUDGETS.length && routeChunkSets.length > 0) {
  const sharedFiles = [...routeChunkSets[0]].filter((file) =>
    routeChunkSets.every((set) => set.has(file))
  )
  // 合計だけでなく、重い依存を採番に依存せず追えるようチャンク別の内訳も表示する。
  const sharedChunks = sharedFiles
    .map((file) => ({ file, size: gzipBytes(file) }))
    .sort((a, b) => b.size - a.size)
  const sharedTotal = sharedChunks.reduce((sum, chunk) => sum + chunk.size, 0)
  const over = sharedTotal > SHARED_CHUNK_BUDGET
  if (over) {
    failures.push(
      `共有チャンク合計が予算超過: ${fmt(sharedTotal)} > ${fmt(SHARED_CHUNK_BUDGET)} ` +
        `(2026-08-12 実測 ${fmt(SHARED_CHUNK_BASELINE)} から ${pct(sharedTotal, SHARED_CHUNK_BASELINE)})。` +
        '全ルートに常駐する依存が増えていないか確認してください。'
    )
  }
  lines.push(
    `  共有チャンク ${sharedFiles.length} 本  ${fmt(sharedTotal).padStart(9)} ` +
      `${fmt(SHARED_CHUNK_BUDGET).padStart(9)} ${pct(sharedTotal, SHARED_CHUNK_BASELINE).padStart(10)}` +
      `        ${over ? 'FAIL' : 'ok'}`
  )
  lines.push('  共有チャンク内訳（gzip / 大きい順）')
  for (const chunk of sharedChunks) {
    lines.push(`    ${fmt(chunk.size).padStart(9)}  ${chunk.file}`)
  }
} else {
  lines.push('  (CHECK 1 で取得できなかったルートがあるため、共有チャンクの算出は見送りました)')
}

// ===== CHECK 3: .size-limit.json の自己点検 ====================================================
lines.push('')
lines.push('CHECK 3: .size-limit.json の各エントリが実ファイルにマッチしているか')

const sizeLimitConfig = readJson(SIZE_LIMIT_CONFIG, '')

if (!existsSync(SIZE_LIMIT_BIN)) {
  failures.push(
    `size-limit が見つかりません (${SIZE_LIMIT_BIN})。devDependencies を install してください。`
  )
} else {
  const result = spawnSync(process.execPath, [SIZE_LIMIT_BIN, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  let report = null
  try {
    report = JSON.parse(result.stdout)
  } catch {
    failures.push(
      'size-limit --json の出力を解析できませんでした。size-limit を単体で実行して原因を確認してください。\n' +
        `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    )
  }

  if (Array.isArray(report)) {
    for (const entry of sizeLimitConfig) {
      const measured = report.find((item) => item.name === entry.name)
      const label = `  ${String(entry.name).slice(0, 60)}`
      if (!measured) {
        failures.push(`.size-limit.json の "${entry.name}" が size-limit の出力に見つかりません。`)
        lines.push(`${label}\n      -> 出力に存在しない  FAIL`)
        continue
      }
      // 対象 0 件。size-limit は size:0 / sizeLimit 未設定で返す（＝静かに通過しうる形）。
      if (!measured.size || measured.sizeLimit === undefined) {
        failures.push(
          `.size-limit.json の "${entry.name}" が 1 件もファイルにマッチしていません ` +
            `(path: ${entry.path})。webpack のチャンク採番が変わった可能性があります。` +
            'path を現在のチャンク名に更新してください（対象 0 件のまま放置すると、この予算は何も守りません）。'
        )
        lines.push(`${label}\n      -> 対象 0 件  FAIL`)
        continue
      }
      const floor = measured.sizeLimit * MIN_SIZE_FRACTION
      if (measured.size < floor) {
        failures.push(
          `.size-limit.json の "${entry.name}" のマッチ結果が予算に対して極端に小さいです ` +
            `(${fmt(measured.size)} < 予算 ${fmt(measured.sizeLimit)} の ${MIN_SIZE_FRACTION * 100}%)。` +
            'glob が本来と別のチャンクにマッチしている疑いがあります。意図的に削減した場合は予算も下げてください。'
        )
        lines.push(`${label}\n      -> ${fmt(measured.size)} / 予算 ${fmt(measured.sizeLimit)}  FAIL(小さすぎ)`)
        continue
      }
      if (measured.passed === false) {
        failures.push(
          `.size-limit.json の "${entry.name}" が予算超過: ${fmt(measured.size)} > ${fmt(measured.sizeLimit)}`
        )
        lines.push(`${label}\n      -> ${fmt(measured.size)} / 予算 ${fmt(measured.sizeLimit)}  FAIL(超過)`)
        continue
      }
      lines.push(`${label}\n      -> ${fmt(measured.size)} / 予算 ${fmt(measured.sizeLimit)}  ok`)
    }
  }
}

// ===== 出力 ====================================================================================
console.log('REQ-306 バンドル予算チェック（単位: kB = 1000 バイト / gzip level 9）')
console.log('')
console.log(lines.join('\n'))
console.log('')

if (failures.length > 0) {
  console.error(`NG: ${failures.length} 件の予算違反があります。`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('')
  console.error(
    '意図的にサイズを増やす場合は scripts/check-bundle-budget.mjs / .size-limit.json の予算を、' +
      '根拠となる実測値と日付のコメント付きで更新してください（REQ-306 AC-06）。'
  )
  process.exit(1)
}

console.log('OK: すべてのルート予算・共有チャンク予算・size-limit エントリの検査に合格しました。')
