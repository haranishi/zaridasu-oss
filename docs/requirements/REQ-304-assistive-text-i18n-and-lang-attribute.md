# REQ-304: 支援技術向け文言の i18n 化と言語属性の整合

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **Medium** ／ 種別: アクセシビリティ・i18n
状態: **提案 / 未実装**
関連: REQ-277（i18n 半翻訳の解消 / FR-277-01・FR-277-03）, REQ-145（ロケール chunk 分割・languageChanged フック）, REQ-293（Service Worker 配線・別途起票）, REQ-302（DeleteDialog の aria-label / L-1）, REQ-114（i18n パリティ検証スクリプト）

## 概要

本アプリは ja/en/ko/zh の4言語に対応し、ロケール JSON のキーは**1277 キーが4言語で完全一致**している（`npm run i18n:check` は OK）。しかし支援技術に渡る文言（`aria-label` / `alt` / `sr-only`）と、文書の言語宣言（`<html lang>`）だけが翻訳の外に取り残されている。

`src/lib/i18n.ts:113,119` は言語切替時と初期化時に `document.documentElement.lang` を `en` / `ko` / `zh` へ書き換える。**したがって英語 UI を選んだ利用者のスクリーンリーダーは、文書言語が英語であると宣言されたページ上で、英語音声エンジンを使って日本語文字列を読み上げようとする。** 可視テキストはすべて翻訳済みなので、結果として「画面は英語なのに、アイコンボタン名・写真ビューア・地図の読み込み状態・パンくずだけが判読不能」という状態になる。これは可視テキストのハードコード（REQ-277）とは影響の性質が異なるため、a11y 課題として分離する。

**構造的な原因**: `scripts/check-i18n-parity.ts` は設計上、**ロケール JSON 間のキー集合 diff のみ**を検証する（`:28-43` の `flatten` ＋ `:52-53` の集合差分）。値が未翻訳であること、ソース側に翻訳キーを通らないリテラルがあることは**検出範囲外**である。これが本要件の問題A・問題C が CI をすり抜けてきた理由であり、REQ-277 FR-277-03（ハードコード日本語の lint 化）が担うべき層と一致する。

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と概要のみ）。

- [01-background-issues.md](REQ-304-assistive-text-i18n-and-lang-attribute/01-background-issues.md) — 背景の問題A〜D（支援技術向け文言の日本語ハードコード17箇所＋再走査の網羅補足／SSR段階の `<html lang>` が常に "ja"／全画面共通バナーが t() を通らず ⚠️ が二重表示／`public/` 配下が REQ-277 の対象表から漏れている）
- [02-requirements-acceptance-and-scope.md](REQ-304-assistive-text-i18n-and-lang-attribute/02-requirements-acceptance-and-scope.md) — 機能要件 FR-304-01〜、受入基準、対象外（他要件との分担）

### 要点

- キー集合は 1277 キーが4言語一致で `npm run i18n:check` は OK。**取り残されているのは `aria-label` / `alt` / `sr-only` と `<html lang>` だけ**。
- 実害は「画面は英語なのに、アイコンボタン名・写真ビューア・地図の読み込み状態・パンくずだけが判読不能」。可視テキストのハードコード（REQ-277）とは影響の性質が違うため a11y 課題として分離する。
- CI をすり抜けた構造的原因は、`scripts/check-i18n-parity.ts` が**ロケール JSON 間のキー集合 diff しか見ない**こと。ソース側のリテラル検出は REQ-277 FR-277-03 が担う層。
