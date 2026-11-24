## 要件概要

### 背景・目的
現状の `analyze-audio` / `analyze-image` には以下の課題が残る:

1. **同一音声/画像の再判定**: ユーザーが同じファイルを別投稿で再使用しても、毎回新規に Gemini を呼ぶ
2. **reanalysis 連打**: ユーザー側からの再判定要求（`reanalysis=true`）に **回数制限がない**

スパム/連投シナリオやデバッグ目的での再判定連打により、不必要な API 呼び出しが発生している。本要件はこれらを抑止する。

### スコープ
**含む:**
- `posts` テーブルに `audio_hash` / `image_hash` カラム追加（SHA-256）
- 投稿作成時のハッシュ計算（クライアント側）
- Edge Function での同一ハッシュ判定結果の **再利用ロジック**
- `reanalysis=true` の投稿あたり日次回数制限
- rate limit 違反時の 429 レスポンス

**含まない:**
- ハッシュベースの完全な投稿重複検知（同一ハッシュでの新規投稿拒否などの UX 機能は別要件）
- Storage 上の物理的な重複ファイル統合

### 前提条件・制約
- 既存 `posts` テーブルへの **カラム追加**を伴う（migration 必須）
- 既存 RLS（`REQ-034: posts-rls-column-protection`）への追記が必要 — `audit_logs` 経由で hash カラムも user 編集禁止に
- `reanalysis` の所有者チェックは既に実装済み（`analyze-audio/index.ts:260-280`）
- Phase 4 は他 Phase より削減効果が小さい（**-10% 程度**）が、悪用防止としての側面が大きい

---
