# REQ-024: i18n対応の完了（ハードコード文字列の翻訳キー化）

## 背景
i18nシステム（react-i18next）は導入済みだが、20箇所以上の日本語文字列がハードコードのまま残っている。将来の多言語対応や翻訳管理の一元化を阻害している。

## 現状の問題
- `src/components/features/posts/PostForm.tsx`:
  - 653行: `"写真の位置情報を検出しました。地図ピンに適用しますか?"`
  - 672行: `"オフラインです — 下書きとして端末に保存できます"`
  - 690行: `"保存中..."`, 692行: `"下書き保存"`
- `src/views/DetailPage.tsx`:
  - 162行: `"審査中 — この投稿はまだ公開されていません"`
  - 177行: `"不承認 — この投稿は公開されていません"`
  - 294行: `"🤖 AI判定"`, 296行: `"判定中…"`
- `src/components/features/dashboard/PendingPostsSection.tsx`:
  - 26行: `"未送信の下書き（"`, 34行: `"送信中..."`, `"すべて送信"`, `"オフライン"`
- `src/views/admin/AdminPostsPage.tsx`:
  - 25-28行: `"審査待ち"`, `"公開中"`, `"却下済み"`, `"全件"`
- `src/components/features/dashboard/MyPostsSection.tsx`:
  - 98行: `"不明"`

## 目的
全てのユーザー向け表示文字列を翻訳キーに置換し、翻訳リソースの一元管理を実現する。

## 要件

### 機能要件
- [ ] FR-024-01: 上記の全ハードコード文字列を `t('key')` 呼び出しに置換する
- [ ] FR-024-02: 対応する翻訳キーを日本語翻訳ファイル（`public/locales/ja/translation.json`）に追加する
- [ ] FR-024-03: 英語翻訳ファイル（`public/locales/en/translation.json`）にも対応キーを追加する
- [ ] FR-024-04: 管理画面のステータスラベル（審査待ち、公開中、却下済み等）も翻訳キー化する

### 非機能要件
- [ ] NFR-024-01: 翻訳キーはドット区切りのネームスペースに統一する（例: `postForm.exifBanner`, `detail.pendingNotice`）
- [ ] NFR-024-02: 翻訳ファイルに未使用キーが残らないようにする

## 受入条件
- [ ] AC-01: `grep -r "[\u3000-\u9fff]" src/components/ src/views/` でハードコード日本語がヒットしない（コメント・型定義を除く）
- [ ] AC-02: 言語を英語に切り替えた際、該当箇所が英語で表示される
- [ ] AC-03: 日本語表示時に既存の表示と差異がない

## 影響範囲
- `src/components/features/posts/PostForm.tsx`
- `src/views/DetailPage.tsx`
- `src/components/features/dashboard/PendingPostsSection.tsx`
- `src/components/features/dashboard/MyPostsSection.tsx`
- `src/views/admin/AdminPostsPage.tsx`
- `public/locales/ja/translation.json`
- `public/locales/en/translation.json`

## 優先度
- **緊急度**: Low
- **重要度**: High
- **理由**: 多言語対応の基盤として重要だが、現時点では日本語のみの運用であり即時対応は不要
