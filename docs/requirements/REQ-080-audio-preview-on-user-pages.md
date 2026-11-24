# REQ-080: マイページ / 投稿詳細での音声プレビュー実装

> **作成日**: 2026-04-24
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-069（音声投稿機能）/ REQ-070（post-audio Storage）/ REQ-073（AI 音声判定）

---

## 要件概要

### 背景・目的
現状、音声を添付した投稿に対して **音声を再生して確認できる UI が一般ユーザー画面に存在しない**。

| 画面 | audio 再生 UI | 実装状況 |
|---|---|---|
| 投稿フォーム（録音直後のプレビュー） | ✅ あり（blob URL の `<audio>`） | 既存 |
| 管理画面投稿一覧 (`AdminPostsPage.tsx`) | ✅ あり（`AudioPlayer` コンポーネント） | REQ-073 で実装済み（fa5c13b） |
| 管理画面審査カード (`ReviewCard.tsx`) | ✅ あり | 既存 |
| **マイページ (`MyPostsSection.tsx`)** | ❌ **無い** | **本要件で追加** |
| **投稿詳細ページ (`/post/[id]`)** | ❌ **無い** | **本要件で追加** |

ユーザーは自分の鳴き声録音が AI にどう判定されたかは確認できる（REQ-079 関連で実装済み）が、**録音内容そのものを聴き直せない**ため「なぜこの判定になったか」を音声レベルで確認できない。

### スコープ
**含む:**
- マイページ投稿一覧 (`MyPostsSection.tsx`) の各投稿カードに音声プレビューを追加
- 投稿詳細ページ（`src/app/post/[id]/page.tsx` or `src/views/PostDetailPage.tsx`）に音声プレビューを追加
- 既存 `AudioPlayer` コンポーネントを再利用（VBR MP3 workaround 継承）
- `audio_url` が NULL の投稿は当該 UI を表示しない（後方互換）
- 読み込み失敗時のフォールバック UI（ダウンロードリンク）

**含まない:**
- 再生位置シーク UI（`<audio controls>` のデフォルトで十分）
- 波形表示（waveform visualization）
- 音声編集・トリミング
- ストリーミング配信（全体ダウンロード再生で十分）

### 前提条件・制約
- `post-audio` Storage bucket は **public = true**、RLS `public_read_audio` が anon 許可 → 未ログインでも再生可能
- 既存 `AudioPlayer` (`src/components/ui/AudioPlayer.tsx`) は `<audio controls>` を VBR 対応でラップしたコンポーネント
- 音声ファイル最大 1MB / 10 秒以内
- モバイル Safari は autoplay 不可、ユーザータップ必須

---

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と要件概要のみ）。

- [01-user-stories.md](REQ-080-audio-preview-on-user-pages/01-user-stories.md) — US-080-01〜03（自分の録音を聴き直す／他ユーザーが投稿詳細で聴く／読み込み失敗時の救済）
- [02-functional-and-nfr.md](REQ-080-audio-preview-on-user-pages/02-functional-and-nfr.md) — FR-080-01〜04（マイページ・投稿詳細のプレーヤー、エラーハンドリング、アクセシビリティ）と非機能要件（パフォーマンス・UX・互換性・セキュリティ）
- [03-screen-api-data-and-impact.md](REQ-080-audio-preview-on-user-pages/03-screen-api-data-and-impact.md) — SC-080-01/02 の画面仕様、API・データモデル・マイグレーション（いずれも変更なし）、影響範囲（コード・型定義・i18n）
- [04-acceptance-risks-and-plan.md](REQ-080-audio-preview-on-user-pages/04-acceptance-risks-and-plan.md) — 受け入れ基準、リスク・トレードオフ、実装優先度と計画
- [05-hypotheses-and-summary.md](REQ-080-audio-preview-on-user-pages/05-hypotheses-and-summary.md) — 仮説検証リスト H1〜H6（「音声プレビューできない」の原因特定）、サマリーと次のアクション

### 要点

- 最有力原因は **UI そのものの不在**。`AudioPlayer` は管理画面（`AdminPostsPage` / `ReviewCard`）にしか置かれていない。
- 対応は **UI 追加2箇所＋エラー救済** の3タスク。既存 `AudioPlayer`（VBR MP3 workaround 込み）を流用するので新規コンポーネントは不要、工数は XS。
- 着手前に仮説 H3〜H6（`audio_url` が NULL／iOS Safari preload／Storage CORS／ファイル欠損）を実機とDBで確認する。
