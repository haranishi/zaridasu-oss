# REQ-114: i18n 未翻訳キーの自動検出

> 親 REQ: REQ-092
> 関連 REQ: REQ-024（i18n-completion）

## 背景
ザリダスは `i18next` + `react-i18next` で日本語・英語の i18n を実装しているが、**未翻訳キーの検出機構が無い**：
- 開発時に `t('typo.in.key')` を書いてもエラーにならず、fallback の英語 / キー文字列がそのまま画面に出る
- リリース後にユーザーが気づいて報告する後手対応
- 言語別 JSON（`src/locales/ja/*.json` / `src/locales/en/*.json`）のキー数差分が CI でチェックされない

REQ-024 で「i18n-completion」が要件定義されているが、自動検出は未実装。

## 現状の問題
- `src/lib/i18n.ts` に `missingKeyHandler` 設定なし
- `src/locales/ja/` と `src/locales/en/` のキー差分を検出する CI スクリプトなし
- 翻訳漏れが本番に届くまで気づけない

## 目的
開発時 / CI 時の両方で未翻訳キーを自動検出し、リリース後の翻訳漏れをゼロにする。

## 要件

### 機能要件
- [ ] FR-114-01: `src/lib/i18n.ts` の `i18next.init()` に `missingKeyHandler` を仕込み、dev 環境で `console.warn` 出力：
  ```ts
  saveMissing: process.env.NODE_ENV !== 'production',
  missingKeyHandler: (lng, ns, key) => {
    console.warn(`[i18n] missing key: ${ns}:${key} (lang=${lng})`)
  },
  ```
- [ ] FR-114-02: `scripts/check-i18n-parity.ts`（新規）を作成し、`src/locales/ja/` と `src/locales/en/` のキー差分を検出
- [ ] FR-114-03: `package.json` の `scripts` に `i18n:check` を追加
- [ ] FR-114-04: `.github/workflows/ci.yml` の test ジョブまたは新規ジョブで `npm run i18n:check` を実行し、差分があれば fail
- [ ] FR-114-05: 現存する翻訳漏れがあれば本 REQ の対応 PR で全て埋める

### 非機能要件
- [ ] NFR-114-01: dev 環境で missing key warning が console に出るが、ユーザー体験には影響しない
- [ ] NFR-114-02: CI チェックが 5 秒以内で完走する

## 受入条件
- [ ] AC-01: dev で `t('non.existent.key')` を書くと console に warning が出る
- [ ] AC-02: `npm run i18n:check` 実行で言語間のキー差分が 0
- [ ] AC-03: GitHub Actions で `i18n:check` ジョブが pass
- [ ] AC-04: 意図的にキー差分を作ると CI が fail
- [ ] AC-05: 既存の翻訳ファイルに不整合がない（ja / en のキーセット完全一致）

## 影響範囲
- `src/lib/i18n.ts`
- `scripts/check-i18n-parity.ts`（新規）
- `package.json`
- `.github/workflows/ci.yml`
- `src/locales/ja/` / `src/locales/en/`（差分があれば修正）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: ユーザー目視の「英語のままの画面」が減る。S 規模（半日）。

## 実装メモ
- `check-i18n-parity.ts` の実装例：
  ```ts
  // scripts/check-i18n-parity.ts
  import { readdirSync, readFileSync } from 'node:fs'
  import { join } from 'node:path'

  function flatten(obj: any, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null
        ? flatten(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]
    )
  }

  const langs = ['ja', 'en']
  const namespaces = readdirSync(`src/locales/${langs[0]}`)
  let diffs = 0
  for (const ns of namespaces) {
    const keys = langs.map((lng) =>
      new Set(flatten(JSON.parse(readFileSync(join('src/locales', lng, ns), 'utf8'))))
    )
    const onlyJa = [...keys[0]].filter((k) => !keys[1].has(k))
    const onlyEn = [...keys[1]].filter((k) => !keys[0].has(k))
    if (onlyJa.length || onlyEn.length) {
      console.error(`[i18n] ${ns}: ja-only=${onlyJa.length}, en-only=${onlyEn.length}`)
      console.error(' ja-only:', onlyJa)
      console.error(' en-only:', onlyEn)
      diffs++
    }
  }
  if (diffs > 0) process.exit(1)
  ```
- `i18next.init()` の `saveMissing: true` を本番で有効化すると性能影響があるので dev のみ
- `react-i18next` の `<Trans>` 内のネスト構造はキー検出が漏れるので、grep ベースの追加チェックも検討
