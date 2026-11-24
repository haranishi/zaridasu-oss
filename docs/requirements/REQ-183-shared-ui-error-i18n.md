# REQ-183: 共有UI・フック・エラーメッセージ基盤の i18n 漏れ

## これは何か

共有 UI・カスタムフック層・エラーメッセージ生成基盤に残る**日本語ハードコードを `t()` 化**し、
あわせて**パリティチェックの死角を塞ぐ**要件。緊急度 High / 重要度 High。

## 目的・背景（要約）

ザリダスは ja / en / ko / zh の 4 言語対応で、CI にキー欠落検出（`i18n:check`）もある。しかし
`check-i18n-parity.ts` は **`translation.json` のキー差分（ja をベースに比較）しか見ない**ため、
次の 2 種類の漏れは**構造的に検出できない**。

1. JSX / TS に直書きされた日本語リテラル（そもそも JSON にキーが無い）
2. **ja を含む全 4 言語に一様に欠落**したキー（差分ゼロなので pass してしまう）

2026-06-12 の監査で、共有 UI・フック層・エラー基盤に日本語固定が多数残ることが確認された。
これらは個別ページ（REQ-184）とは別系統の**横断的な土台**で、ここが日本語固定のままだと
他をいくら翻訳しても多言語体験が成立しない。

## 主要な決定事項（要点）

- **`getErrorMessage()` は完成した日本語文字列ではなく i18n キー（またはエラーコード）を返す設計に変える。**
  純 TS（React 外）で `useTranslation()` を呼べないため、表示側で `t()` する。
  `P0001`（DB レートリミット）のようなサーバ由来メッセージは別扱いにできる形にする。
- フック層は React Hooks なので `useTranslation()` を呼べる。`throw new Error('<日本語>')` は
  **キーまたはコードを投げ、表示側で `t()`** する方針に統一する。
- **既存キーが活用されていない問題がある。** `species.*` / `infoType.*` は 4 言語整備済みなのに、
  画面が `constants.ts` の日本語 `label` を直接表示している。`label` フィールド自体は SEO/OG で
  参照されている可能性があるため**削除は必須とせず**、「画面表示は t() を使う」ことを満たす。
- 日付は `toLocaleString('ja-JP')` 固定と `date-fns` の `ja` 直 import をやめ、`i18n.language` 連動と
  既存の `getDateLocale()` に寄せる。
- `auth.errors.invalidEmail` は 4 言語に追加し、`AuthModal` から **`defaultValue` 引数を撤去**する
  （フォールバックでの日本語露出を無くす）。
- **再発防止の生日本語リテラル検出 lint は FR-183-15 としてオプション扱い**。段階導入（warn → error）可。
- 既存挙動（表示順・アイコン・GTM イベント・エラーログ・レートリミット同期）は変更しない。文言とロケールのみ。
- 改修は層ごとに分割でき、段階適用が可能。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-183-shared-ui-error-i18n/01-background-and-problems.md) | 背景（パリティチェックの限界）と現状の問題 A〜H（エラー基盤・フック・レイアウト・ホーム・UI 部品・constants ラベル・日付/数値・全言語一様欠落キー。ファイルパス:行番号つき） |
| [02-goals-and-requirements.md](REQ-183-shared-ui-error-i18n/02-goals-and-requirements.md) | 目的と機能要件 FR-183-01〜15（層ごと: エラー基盤 / hooks / layout / UI 部品 / constants / 日付・数値 / 欠落キー / 再発防止 lint）、非機能要件 NFR-183-01〜03 |
| [03-acceptance-impact-priority.md](REQ-183-shared-ui-error-i18n/03-acceptance-impact-priority.md) | 受入条件 AC-01〜09、影響範囲（層別のファイル一覧）、優先度と理由 |
