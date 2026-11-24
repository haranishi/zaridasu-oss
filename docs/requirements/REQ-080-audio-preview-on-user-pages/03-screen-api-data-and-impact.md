## 画面仕様

### SC-080-01: マイページ投稿カード（拡張）
- **URL:** `/dashboard`
- **追加要素:**
  ```
  ウシガエル 目撃 由利本荘市 [公開中] [🎤 鳴き声一致 85%]
  ┌─────────────────────────────┐
  │ 🤖 画像判定: …             │ ← 既存
  │ 🎤 音声判定: …             │
  └─────────────────────────────┘
  ▶️ [━━━━●━━━━━] 0:03 / 0:08   ← 本要件で追加
  2026/4/24 21:36
  ```

### SC-080-02: 投稿詳細ページ
- **URL:** `/post/[id]`
- **追加要素:** 写真グリッドの下にセクション「🎤 録音された音声」として `AudioPlayer` を配置

---

## API 仕様
変更なし（クライアントで `post.audio_url` を直接参照）。

## データモデル・DB 設計
変更なし。`posts.audio_url` は既存カラム。

## マイグレーション計画
不要。

---

## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/components/features/dashboard/MyPostsSection.tsx` | AudioPlayer 表示を追加 |
| `src/views/PostDetailPage.tsx` または `src/app/post/[id]/page.tsx` | AudioPlayer 表示を追加 |
| `src/components/ui/AudioPlayer.tsx` | onError ハンドリング + フォールバックリンクを追加 |

### 型定義追加
- `MyPost` 型に既に `audio_url?: string | null` を追加済み（REQ-074〜079 実装時に済み）

### i18n 追加
- `audioPreviewError`: 「音声の読み込みに失敗しました」
- `audioDownloadFallback`: 「ファイルを開く」
- `audioSectionTitle`: 「録音された音声」（投稿詳細で使用）

---
