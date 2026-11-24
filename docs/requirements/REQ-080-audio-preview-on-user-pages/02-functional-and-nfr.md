## 機能要件

### FR-080-01: マイページ投稿一覧に音声プレーヤー
- **説明:** `MyPostsSection.tsx` の各投稿カードに `AudioPlayer` を表示
- **配置:** AI 判定の根拠ブロックの下、rejection_reason の上
- **表示条件:** `post.audio_url != null`
- **処理:** `<AudioPlayer src={post.audio_url} className="w-full max-w-xs" />` を呼び出し
- **バリデーション:** 既存 AudioPlayer の `if (!src) return null` を利用
- **エラーハンドリング:** 既存 VBR workaround を継承

### FR-080-02: 投稿詳細ページに音声プレーヤー
- **説明:** 詳細ページで投稿に音声があれば再生 UI を表示
- **配置:** 写真プレビューの下、コメントの上
- **表示条件:**
  - `post.audio_url != null` かつ
  - 投稿が `status='approved'` または `post.user_id === currentUser?.id`
- **処理:** `AudioPlayer` を同 props で呼び出し

### FR-080-03: エラーハンドリングとフォールバック
- **説明:** 音声読み込みに失敗した場合のフォールバック UI
- **処理:**
  1. `<audio onError>` で state `loadError = true` をセット
  2. エラー時は「音声の読み込みに失敗しました」メッセージ + 生 URL への `<a href download>` リンクを表示
- **配置:** `AudioPlayer` 内部を拡張

### FR-080-04: アクセシビリティ
- **説明:** 再生プレーヤーのアクセシビリティ確保
- **処理:**
  - `<audio>` に `aria-label="音声プレビュー"`
  - キーボード操作（Space 再生停止）は `<audio controls>` のブラウザデフォルトで満たす
  - Reduced motion は音声には無関係（波形アニメは無いため）

---

## 非機能要件

### パフォーマンス
- `preload="metadata"` で総ダウンロード量を最小化（一覧に複数 AudioPlayer があってもメタデータのみ先読み）
- 一覧のスクロール中に読み込みを遅延させる必要はない（メタデータは数 KB）

### UX
- プレーヤーサイズはモバイルでも破綻しない幅（`max-w-xs` or `max-w-sm`）
- ダークモードで背景が浮かない（既存 `AudioPlayer` の themeClasses 準拠）

### 互換性
- Chrome / Safari (iOS 含む) / Firefox / Edge で動作確認
- VBR ヘッダ無し MP3 でも duration が表示される（既存 AudioPlayer の workaround 継承）

### セキュリティ
- 音声 URL は Storage の public_read_audio ポリシーに依存（anon 可）
- **将来的にプライベート音声を導入する場合は signed URL への切替を別要件で検討**（今回スコープ外）

---
