#!/usr/bin/env node
// REQ-100: Service Worker のキャッシュバージョンを自動付与する
// public/sw.js.tpl の __PRECACHE_VERSION__ を、Vercel コミット SHA（先頭8桁）か
// ローカルの場合は git の HEAD SHA、いずれも取れなければ Date.now() で置換し
// public/sw.js を生成する。
//
// 同じコミットで再ビルドしても同一バージョンになるよう、Vercel/git の SHA を優先する。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

const tplPath = resolve(projectRoot, 'public/sw.js.tpl')
const outPath = resolve(projectRoot, 'public/sw.js')

if (!existsSync(tplPath)) {
  console.error(`[build-sw] テンプレートが見つかりません: ${tplPath}`)
  process.exit(1)
}

function resolveVersion() {
  // 1. Vercel ビルドではコミット SHA が自動で入る
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
  }
  // 2. dev モードは固定値で安定化
  if (process.env.NODE_ENV === 'development' || process.env.SW_BUILD_DEV === '1') {
    return 'dev'
  }
  // 3. ローカル/CI ビルドは git HEAD を試す（再現可能性 AC-02）
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    if (sha) return sha.slice(0, 8)
  } catch {
    // git が無い・リポジトリ外などはフォールバックへ
  }
  // 4. 最終フォールバック（再現性は失うがビルドは通す）
  return String(Date.now())
}

const version = resolveVersion()
const tpl = readFileSync(tplPath, 'utf8')
const out = tpl.replaceAll('__PRECACHE_VERSION__', version)
writeFileSync(outPath, out)

console.log(`[build-sw] public/sw.js を生成しました (PRECACHE_VERSION=${version})`)
