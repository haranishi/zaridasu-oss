// REQ-214 / REQ-035: サーバー認可とログイン導線のソース監査 (CI ゲート)
//
// このスクリプトは 2 種類の不変条件を機械的に守る:
//   1) 未ログイン導線: アプリ内から /auth ページへ直接遷移しない (AuthModal に統一する)。
//      対象: src/** の .js/.jsx/.ts/.tsx
//   2) サーバー側の getSession 認可禁止 (REQ-214): SSR / Server Components / Server Actions /
//      Route Handler / middleware / Edge Functions で `supabase.auth.getSession()` を
//      認可判断に使わない。getSession() は Cookie をそのまま返すだけで Auth サーバーで
//      再検証しないため、Cookie を偽装されると戻り値も偽装され得る。サーバーでは
//      getUser() (Auth サーバー検証) / getClaims() (JWT 署名検証) を使う。
//      対象: src/** (ただし 'use client' ファイルとテストは除外) + supabase/functions/**
//
// CI: .github/workflows/ci.yml の lint ジョブで `npm run auth-route:check` として実行される。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const srcDir = join(root, 'src')
const functionsDir = join(root, 'supabase', 'functions')
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx'])

// --- 不変条件 1: /auth への直接遷移禁止 (src のみ) ---
const forbiddenAuthRoutePatterns = [
  /router\.(push|replace)\(\s*['"`]\/auth['"`]\s*\)/,
  /href\s*=\s*['"`]\/auth['"`]/,
  /['"`]\/auth['"`]/,
]

// --- 不変条件 2: サーバー側 getSession 認可禁止 ---
// `.auth.getSession(` のみにマッチさせる。これにより:
//   - getSessionCache() (src/hooks/useWeather.ts) … `.auth.` 接頭辞が無いので非対象
//   - navigator.mediaDevices.getUserMedia() … getSession ではないので非対象
//   - supabase.auth.admin.getUserById() (Edge Functions の管理 API) … getUserById は非対象
//   - getUser() / getClaims() (正しいサーバー検証) … 非対象
// は誤検出されない。
const serverGetSessionPattern = /\.auth\s*\.\s*getSession\s*\(/

function extname(file) {
  const index = file.lastIndexOf('.')
  return index === -1 ? '' : file.slice(index)
}

function walk(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    // ディレクトリが存在しない環境 (例: functions 未配置) では静かにスキップ
    return files
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (entry === 'node_modules' || entry === '.next') continue
    if (statSync(path).isDirectory()) walk(path, files)
    else if (extensions.has(extname(path))) files.push(path)
  }
  return files
}

// テストファイル (getSession をモックする) は認可実装ではないので除外する。
function isTestFile(rel) {
  return (
    /(^|[\\/])__tests__[\\/]/.test(rel) ||
    /\.test\.[jt]sx?$/.test(rel) ||
    /\.spec\.[jt]sx?$/.test(rel)
  )
}

// 'use client' ディレクティブを持つファイルはクライアントコンポーネント。
// クライアントでの getSession は表示用 (例: AuthContext の isAdmin 出し分け) で適正。
function isClientComponent(text) {
  // ファイル冒頭の (コメント/空行を除いた) 最初の文字列リテラルが 'use client' か判定する。
  const head = text.slice(0, 500)
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(head)
}

const authRouteViolations = []
const getSessionViolations = []

// 不変条件 1: src のみ
for (const file of walk(srcDir)) {
  const rel = relative(root, file)
  const text = readFileSync(file, 'utf8')
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes('/auth/callback')) return
    if (forbiddenAuthRoutePatterns.some((pattern) => pattern.test(line))) {
      authRouteViolations.push(`${rel}:${index + 1}: ${line.trim()}`)
    }
  })
}

// 不変条件 2: src + supabase/functions (client / test を除外)
for (const file of [...walk(srcDir), ...walk(functionsDir)]) {
  const rel = relative(root, file)
  if (isTestFile(rel)) continue
  const text = readFileSync(file, 'utf8')
  if (isClientComponent(text)) continue
  text.split(/\r?\n/).forEach((line, index) => {
    if (serverGetSessionPattern.test(line)) {
      getSessionViolations.push(`${rel}:${index + 1}: ${line.trim()}`)
    }
  })
}

let failed = false

if (authRouteViolations.length > 0) {
  failed = true
  console.error('未ログイン導線で /auth への直接遷移が残っています。AuthModal に統一してください。')
  console.error(authRouteViolations.join('\n'))
}

if (getSessionViolations.length > 0) {
  failed = true
  console.error(
    'サーバー側で supabase.auth.getSession() を認可に使っている疑いがあります (REQ-214)。\n' +
    'getSession() は Cookie を再検証しないため改ざんに弱いです。getUser() / getClaims() を使ってください。\n' +
    "クライアント表示用に getSession が必要な場合は 'use client' ファイルへ移してください。"
  )
  console.error(getSessionViolations.join('\n'))
}

if (failed) {
  process.exit(1)
}

console.log('OK: /auth への直接遷移およびサーバー側 getSession 認可利用は検出されませんでした。')
