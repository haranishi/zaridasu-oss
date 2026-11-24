## 非機能要件

### UX
- 再生開始時にプログレスバーがアニメーション、停止時は静止
- ボタンのタップ領域 44px 以上（モバイル）
- ダークモード対応

### パフォーマンス
- timeupdate に依存するため、`requestAnimationFrame` ではなく React state でも十分
- 一覧ページに複数 player があっても再生中は 1 つだけ（既存挙動を継承）

### アクセシビリティ
- 再生 / 停止ボタンに aria-label
- プログレスバーは role="slider" + aria-valuenow / aria-valuemax
- エラー時は role="alert"

---

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260425000001_add_audio_duration_ms.sql`（新規） | カラム追加 + CHECK + column-protection 拡張 |
| `src/hooks/usePostForm.ts` | insert payload に audio_duration_ms を追加 |
| `src/components/ui/AudioPlayer.tsx` | カスタム UI 化、durationMs prop 追加 |
| `src/components/features/dashboard/MyPostsSection.tsx` | AudioPlayer に audio_duration_ms 渡し |
| `src/views/DetailPage.tsx` | 同上 |
| `src/components/features/posts/AudioRecorder.tsx` | preview の `<audio>` を AudioPlayer に置換、durationMs 渡し |
| `src/types/index.ts` / `src/types/post.ts` | 型に audio_duration_ms 追加 |

---
