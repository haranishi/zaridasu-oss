# REQ-146: BASE_URL ハードコード 7 箇所を `src/lib/constants.ts` に集約し DRY を確保する

## これは何か

`process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'` の直書き 7 箇所を単一定義へ集約する純粋リファクタの要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

`src/lib/constants.ts:4-5` に正規の `BASE_URL` 定義があるにもかかわらず、`layout.tsx`（2 箇所）・`sitemap.ts`・`robots.ts`・`area/page.tsx`（2 箇所）・`area/[municipality]/page.tsx` の計 7 箇所が同じ式をコピペしており、`window.location.origin` フォールバックの有無で挙動も微妙に異なる。ドメイン変更や preview / staging 追加のたびに 7 箇所すべてを直す必要があり、漏れリスクが高い。REQ-030（DRY コード品質）の延長として整理する。

## 主要な決定事項の要点

- 参照箇所を `src/lib/constants.ts`（または URL 専用モジュール）の単一定義へ集約し、ドメイン変更時に 1 箇所の編集で全体へ反映できるようにする。
- `BASE_URL` は SSR でも client でも安全な式に統一し、`window.location.origin` フォールバックは `getRuntimeOrigin()` として切り出す（Server Component で `window` を参照しない）。
- **末尾スラッシュの有無に注意する**。`new URL(BASE_URL)` 等で trailing `/` の扱いが変わるとカノニカル URL がズレるため、末尾スラッシュポリシーをコメントで明記する。
- 再発防止として `process.env.NEXT_PUBLIC_APP_URL` の直接参照を禁じる ESLint ルールを追加し、`src/lib/constants.ts` のみ allowlist する（任意・優先度低）。
- 振る舞いの変化はゼロ（純粋なリファクタ）。緊急度・重要度とも High だが工数は 1〜2 時間で、隣接する REQ-144 / REQ-145 と同時に実施するのが効率的。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-146-base-url-consolidation/01-background-and-problems.md) | 背景（grep 結果と正規定義の乖離）と現状の問題4件（重複定義7箇所・constants.ts 未使用・フォールバック文字列の散在・lint 検出機構なし） |
| [02-goal-and-requirements.md](REQ-146-base-url-consolidation/02-goal-and-requirements.md) | 目的、機能要件 FR-146-01〜06（Server-safe 化・7箇所の import 統一・末尾スラッシュ・ESLint ルール・他リテラル整理・ドキュメント）、非機能要件 NFR-146-01〜03 |
| [03-acceptance-and-tests.md](REQ-146-base-url-consolidation/03-acceptance-and-tests.md) | 受入条件と、テスト要件（ユニット・E2E・Lint） |
| [04-impact-and-priority.md](REQ-146-base-url-consolidation/04-impact-and-priority.md) | 影響範囲（変更対象ファイル一覧・影響しないこと）と優先度の判断 |
