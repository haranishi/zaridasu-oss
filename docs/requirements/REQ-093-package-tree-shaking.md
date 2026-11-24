# REQ-093: パッケージ tree-shaking 強化

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
`package.json` に含まれる依存のうち、tree-shaking が効きにくい / 効かせるための設定が不足しているライブラリがある。

- `lucide-react`（^0.577）：barrel import（`import { X, Y } from 'lucide-react'`）でも公式が ESM tree-shaking 対応しているが、Next.js 側で `experimental.optimizePackageImports` に登録するとビルド時に確実に個別チャンク化される。
- `date-fns`（^2.30.0）：v2 系。v3 で ESM ネイティブ + named export 単位の tree-shaking 効率が大幅改善している。`src/lib/dateLocales.ts` でロケールを集約しているので、v3 化のアダプタ層は最小限で済む。
- `react-i18next` / `i18next` / `i18next-browser-languagedetector`：barrel exports が大きく、初期 bundle に乗りやすい。
- `fix-webm-duration`：録音機能（AudioRecorder）でのみ使用。録音を含まないルートで剥がれているか不明。
- `exifr`：画像 EXIF 解析（投稿フォームのみ）。投稿フォーム自体は dynamic 化済み（HomePage の `dynamic(() => import('@/components/features/posts/PostForm'))`）→ そのまま閉じ込められているか要確認。

## 現状の問題
- `next.config.ts` に `experimental.optimizePackageImports` の指定がない。
- `package.json` の `date-fns` が `^2.30.0`（古い）。
- `lucide-react` の import が「barrel import」されているが、最適化対象に登録されていない。
- `fix-webm-duration` / `exifr` がホームの初回 bundle に混入していないかの根拠が無い（バンドル分析は REQ-098 で導入予定）。

## 目的
依存パッケージを tree-shaking しやすくし、ホーム / 一覧系ルートの First Load JS を 20〜40KB 削減する。

## 要件

### 機能要件
- [ ] FR-093-01: `next.config.ts` の `experimental.optimizePackageImports` に少なくとも以下を追加する：
  ```ts
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'react-i18next',
      'date-fns',
    ],
  }
  ```
- [ ] FR-093-02: `date-fns` を `^3` 系にアップグレードする。`src/lib/dateLocales.ts` 経由で参照されているロケール / フォーマットの API 差分をアダプタで吸収する。
- [ ] FR-093-03: `fix-webm-duration` が AudioRecorder 以外のルートに混入していないことを bundle-analyzer（REQ-098）で確認する。混入していれば `dynamic` import 化する。
- [ ] FR-093-04: `exifr` が PostForm の dynamic 境界の中だけで参照されていることを確認する（呼び出し元が PostForm 経由のみであれば追加対応不要）。
- [ ] FR-093-05: `lucide-react` の import を「barrel import を維持しつつ optimizePackageImports に任せる」方針で統一する（個別 import を ESLint で強制しない）。

### 非機能要件
- [ ] NFR-093-01: `npm run build` 後の First Load JS が、ホーム（`/`）で **少なくとも 15KB** 削減されること（gzip 後）。
- [ ] NFR-093-02: 既存テスト（vitest / Playwright / pg-tap）が全て pass すること。
- [ ] NFR-093-03: i18n 翻訳の挙動（言語切替・補間）が回帰しないこと。

## 受入条件
- [ ] AC-01: `next.config.ts` に `experimental.optimizePackageImports` 設定が存在する。
- [ ] AC-02: `package.json` の `date-fns` が `^3.x` に更新されている。
- [ ] AC-03: `npm run build` が成功し、size-limit が pass する（REQ-062 の閾値を超えない）。
- [ ] AC-04: bundle-analyzer のレポート（REQ-098 導入後）で、ホームの初回チャンクから `fix-webm-duration` / `exifr` が消えている、または PostForm chunk 内に閉じ込められている。
- [ ] AC-05: `src/lib/dateLocales.ts` の dateFns 呼び出しが v3 API に対応している。
- [ ] AC-06: i18n の Playwright E2E（既存）で言語切替が pass する。

## 影響範囲
- `next.config.ts`
- `package.json` / `package-lock.json`
- `src/lib/dateLocales.ts`
- `src/lib/i18n.ts`
- `date-fns` を直接 import している全ファイル（`grep -rn "from 'date-fns'" src/`）
- `src/components/features/posts/AudioRecorder.tsx` 周辺（`fix-webm-duration` を切り離す場合）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 1 PR で 15〜40KB 削減が見込めるコスパ最良施策。ただし date-fns v3 アップグレードは API 差分検証が必要なため、独立 PR にする。

## 実装メモ
- `optimizePackageImports` は Next.js 15 で stable に近づきつつあるが `experimental` 名のまま。挙動変更には PR を分けて size-limit の差分で検証。
- date-fns v3 では `format`, `parseISO`, `differenceInDays` などの基本 API はほぼ互換。`date-fns/locale/ja` のパスのみ変更（v2: `date-fns/locale` の named import → v3: `date-fns/locale/ja` の direct import 推奨）。
- `lucide-react` を `optimizePackageImports` に入れた後でも、`Icon as Foo` のような re-export パターンは効きにくい。grep で確認。
