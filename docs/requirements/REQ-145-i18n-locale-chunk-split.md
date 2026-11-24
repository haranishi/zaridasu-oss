# REQ-145: i18n 4 言語ファイルをチャンク分割し初期バンドルから 3 言語ぶんを除去する

## これは何か

`src/lib/i18n.ts` が 4 言語の翻訳 JSON を静的 import している構造を改め、
**現に使う言語だけを初期バンドルに乗せる**ようにするバンドル軽量化の要件。

## 目的・背景（要約）

4 言語の翻訳 JSON（**合計 約 157,917 bytes raw ≒ gzip 50〜60 KB**）が `init({ resources })` に
渡されており、`'use client'` の i18n 初期化を通じて**全言語が初期バンドルに固定で乗っている**。
日本語デフォルトのユーザーが zh / ko / en を毎ページ読み込むのは無駄。

現状は SSR HTML が常に ja 前提で、辞書がバンドル内にあるため切替が即時に済んでいる。
**chunk 分割すると切替時に遅延が出る**ので、SSR 側で言語ヒントを送る仕組みが同時に必要になる。
REQ-024 / REQ-114 で翻訳整備は進んでいるが、ロード戦略だけが未対応。

## 主要な決定事項（要点）

- 配信方式は3案（A: `public/locales/` + `i18next-http-backend` ／ B: API ルート ／ C: 動的 import）。
  **実装簡易度とキャッシュ性から案 A を第一候補**とし、不可なら案 C にフォールバックする。
- 初期言語の決定を SSR にも導入する。**`middleware.ts` が `Accept-Language` から cookie
  `zaridasu_lang` を発行**し、`layout.tsx` がそれを読んで `<html lang>` に反映する。
  クライアントは **cookie → localStorage → navigator** の順で決定する（既存の LocalStorage キーと一貫させる）。
- 既存の `useTranslation` / `t(...)` の呼び出しは**無改修で動くこと**が前提（NFR-145-02）。
- `.size-limit.json` に **「初期言語 1 ファイル 20 KB 以下」「client bundle の翻訳合計 25 KB 以下」**の
  2 項目を追加し、「初期は ja のみ・他は遅延」を機械的に強制する。
- SSR と client の初期言語が一致することでハイドレーション警告を出さない（NFR-145-04）。
- 緊急度 Medium / 重要度 High。**REQ-124 の First Load JS 予算（ホーム 250 KB）達成に最も効率の良い
  レバーの一つ**だが、middleware / SSR / cookie の連携が必要で工数は中程度。
- 副次的な改善として、en/zh/ko ユーザーが**正しい言語の SSR HTML を受け取れるようになる**。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-problems-goals.md](REQ-145-i18n-locale-chunk-split/01-background-problems-goals.md) | 背景（該当コードと4言語のファイルサイズ実測）、現状の問題 1〜4、目的 |
| [02-requirements.md](REQ-145-i18n-locale-chunk-split/02-requirements.md) | 機能要件 FR-145-01〜07（配信方式 案 A/B/C・i18n.ts 改修・SSR 言語決定・切替 UX・size-limit・analyze）と非機能要件 NFR-145-01〜04 |
| [03-acceptance-and-tests.md](REQ-145-i18n-locale-chunk-split/03-acceptance-and-tests.md) | 受入条件 AC-01〜08 とテスト要件（ユニット／E2E／監視） |
| [04-impact-and-priority.md](REQ-145-i18n-locale-chunk-split/04-impact-and-priority.md) | 影響範囲（変更対象ファイル・影響しないこと）と優先度・理由 |
