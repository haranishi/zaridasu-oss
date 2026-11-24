> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# SOS-001: 助っ人募集 / 調査依頼ピン機能

## 概要

マップ上に「助けてほしい」ピンを立て、近隣ユーザーに協力を呼びかける機能。
「捕獲したいが一人では難しい」「鳴き声がするが場所が特定できない」など、**既存の目撃・捕獲報告とは異なるアクション誘発型の投稿**を実現する。

---

## これは何か

上記 SOS 機能の要件定義書。ユーザーストーリー US-1〜US-4、データモデル、フロントエンド設計、
通知 Edge Function、承認フロー、実装優先度、非機能要件、i18n キーまでを定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 背景の要約

既存の投稿は「報告完了型」（目撃／捕獲／痕跡／被害／不在確認）のみで、進行中の状況に対する協力要請の手段がない。
一人では対処できない場面で外部 SNS に頼るしかなく、地域の調査協力者とのマッチング手段もない。
「今まさに助けが必要な場所」がマップ上で可視化されておらず、解決済み SOS が残ると情報が陳腐化するリスクもある。

## 主要な決定事項の要点

- **SOS は即時公開**（admin 承認を挟まない）。緊急性が高く承認待ちでは機能しないため、
  通常投稿の `投稿 → pending → 承認 → approved` に対し SOS は `投稿 → approved（自動）→ 解決/期限切れ` とする。
  代わりにレート制限（24 時間で 3 件・通常投稿とは別カウント）、ハニーポット、秋田県範囲チェックを適用。
- **認証ユーザー限定**（匿名不可、RLS で `auth.uid() IS NOT NULL` を強制）。応答も認証必須で 1 ユーザー 1 応答の UNIQUE 制約。
- **Phase 1（高）**：`info_type` への `sos` 追加と SOS 専用カラム、`sos_responses` テーブル、PostForm 拡張、
  マップの SOS ピン（オレンジ＋パルス）、詳細ページの「協力する」＋応答者表示、即時承認ロジック。
- **Phase 2（中）**：`notify-sos` / `notify-sos-response` Edge Function、自動期限切れ cron、ステータス変更、
  FilterBar の SOS フィルター、user_profiles の SOS 通知設定。
- **Phase 3 以降（低）**：SOS 専用一覧ビュー、協力バッジ、ブラウザ Push 通知。
- **表示・性能の判断**：パルスは CSS のみ（`prefers-reduced-motion` で無効化）、応答数は
  `sos_response_count` キャッシュカラムで JOIN を減らす、SOS ピンの色はオレンジ #F59E0B で WCAG AA を確保。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-current-issues-and-user-stories.md](requirements-sos-help-request/01-current-issues-and-user-stories.md) | 1. 現状の課題サマリー、2. ユーザーストーリー US-1 投稿／US-2 確認と応答／US-3 解決と終了／US-4 通知 |
| [02-information-architecture.md](requirements-sos-help-request/02-information-architecture.md) | 3. 情報アーキテクチャ：画面遷移フロー、コンテンツ優先度 |
| [03-data-model.md](requirements-sos-help-request/03-data-model.md) | 4. データモデル設計：posts 拡張、sos_responses 新規、user_profiles 拡張、pg_cron による自動期限切れ |
| [04-frontend-design.md](requirements-sos-help-request/04-frontend-design.md) | 5. フロントエンド設計：constants.js の定数、マップピンデザイン、PostForm 拡張、DetailPage 拡張 |
| [05-notifications-and-approval-flow.md](requirements-sos-help-request/05-notifications-and-approval-flow.md) | 6. 通知設計（`notify-sos` / `notify-sos-response` Edge Function）、7. 承認フロー（即時公開の理由と自動チェック） |
| [06-priority-non-functional-and-i18n.md](requirements-sos-help-request/06-priority-non-functional-and-i18n.md) | 8. 改善提案一覧（実装優先度）、9. 非機能要件、10. i18n キー設計 |
