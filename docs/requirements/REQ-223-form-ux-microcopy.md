# REQ-223: 投稿フォームの入力体験とマイクロコピー最適化（構造・モバイル入力・文言の4言語統一）

## これは何か

投稿フォーム・認証モーダル・調査依頼フォームの「入力のしやすさ」と「文言」を横断点検して是正する要件。
詳細は `REQ-223-form-ux-microcopy/` 配下に分割している。

## 目的・背景（要約）

現地でスマホから投稿してもらえるかどうかがそのままデータ獲得 KPI になるため、フォームの摩擦は
研究データの欠損に直結する。既存 REQ で機能面（検証ロジック・ラベル関連付け・a11y）は段階的に
整備されてきたが、**(A) フォーム構造 (B) モバイル入力最適化 (C) マイクロコピーの 4 言語統一**は
横断点検されていない。本 REQ はこの 3 点に集中する。下敷きは Obsidian のフォームデザイン／
アクセシビリティとUXライティング／コピーライティングの各ノート。

## 主要な決定事項（要点）

- **検証ロジックそのものは本 REQ で新設しない**。REQ-029 / REQ-213 / REQ-151 / REQ-189 に委ね、
  本 REQ は「入力体験と文言」に限定する。
- **入力欄を 16px 以上に**して iOS Safari の自動ズームを防ぐ（`text-sm` = 14px が全入力欄で使われている）。
  ラベル・補助テキスト・カウンターの文字サイズは変えない。
- `inputMode` / `enterKeyHint` は **src 全体で 0 件**。数値は numeric / 小数は decimal / メールは email を付与し、
  `type="number"` は維持して併用する。
- **CTA は「動詞＋成果」に統一**、エラー文は「何が・なぜ・どう直すか＋具体例」に揃える。
  変更は必ず ja/en/ko/zh の 4 ファイルを同時更新する（1 言語だけ変えるとフォールバック露出が起きる）。
- `usePostForm.ts` のファイル形式・サイズ・画像ゲートのエラーは**ハードコード日本語**なので `t()` 経由にする。
- **SurveyRequestForm だけが「押せない送信ボタン」**になっており、押下時集約に到達できない。
  PostForm 方式（`disabled={loading}` のみ）に統一する。a11y 属性側は REQ-189 と協調。
- 二重送信は**送信ハンドラ先頭の同期再入ガード＋ UI disabled**の二層とし、最終防衛はサーバー側冪等
  （DB レートリミット・画像 hash dedup）である旨をコメントで明記する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-223-form-ux-microcopy/01-background.md) | 背景（下敷きにした 3 ノートの原則と、本 REQ が扱う 3 点の切り出し） |
| [02-problems-mobile-input.md](REQ-223-form-ux-microcopy/02-problems-mobile-input.md) | 問題 1〜2: `inputmode`/`enterkeyhint` が皆無、入力欄 14px による iOS 自動ズーム |
| [03-problems-microcopy.md](REQ-223-form-ux-microcopy/03-problems-microcopy.md) | 問題 3〜4: CTA が「動詞＋成果」で不統一、エラー文の粒度不揃いとハードコード日本語 |
| [04-problems-submit.md](REQ-223-form-ux-microcopy/04-problems-submit.md) | 問題 5〜6: SurveyRequestForm の押せない送信ボタン、二重送信ガードの薄さ |
| [05-goals-and-functional-requirements.md](REQ-223-form-ux-microcopy/05-goals-and-functional-requirements.md) | 目的と機能要件 FR-223-01〜08（16px 化・inputmode・CTA/エラー文言・i18n 化・押せる化・再入ガード） |
| [06-non-functional-requirements.md](REQ-223-form-ux-microcopy/06-non-functional-requirements.md) | 非機能要件 NFR-223-01〜05（回帰ゼロ・i18n 完全性・検証不変・a11y 非退行・タップ領域） |
| [07-acceptance.md](REQ-223-form-ux-microcopy/07-acceptance.md) | 受入条件 AC-01〜08 |
| [08-impact.md](REQ-223-form-ux-microcopy/08-impact.md) | 影響範囲（担う範囲のファイル／REQ-029・213・151・189・224・222 との境界／他機能への影響リスク） |
| [09-priority.md](REQ-223-form-ux-microcopy/09-priority.md) | 優先度（緊急度 Medium / 重要度 High）とその理由 |
