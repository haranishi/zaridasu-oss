## 詳細手順

### Step 1. 記録・保全

- [evidence-preservation.md](./evidence-preservation.md) の記録テンプレに「何が・いつから・全体か自分だけか」。
- エラー画面・Sentry の該当イベント・各社 Status・**直近のデプロイ / 設定変更**をスクショ。
- **データ損失の疑いがある場合は、ここで保全を厚く取る**（現在の件数・該当テーブルのスナップショット）。復旧操作で上書きされる前に。
  ```sql
  -- 主要データの件数を控える（損失の規模把握 / 保全）
  select 'posts' as t, count(*) from posts
  union all select 'reports', count(*) from reports
  union all select 'survey_requests', count(*) from survey_requests;
  ```

### Step 2. 影響範囲特定
- 上の切り分け表で、落ちている機能と推定原因を絞る。プロバイダ障害か自分の変更（直近デプロイ / 設定）かを判定。

### Step 3. 一次連絡
- 利用者向けに「確認中」を出す（→ [contacts.md](./contacts.md) §4-1）。**復旧時刻・原因は確約しない。**

### Step 4. 暫定回避
- **直近デプロイ起因** → Vercel で**ひとつ前の正常デプロイにロールバック**（Promote / Rollback）。
- **AI 起因** → [`gemini-key-rotation.md`](../gemini-key-rotation.md)（キー）/ [`ai-model-rollback.md`](../ai-model-rollback.md)（モデル / 閾値）。AI が止まっても**投稿フロー自体は AI 非依存**で受け付けられる点を踏まえ、被害を最小化。
- **プロバイダ障害** → 復旧待ち。利用者には状況を継続共有。
- **Edge Function 起因** → [`edge-function-deploy.md`](../edge-function-deploy.md) を参照して再デプロイ / 切り戻し。

### Step 5. 復旧（データ損失時の引き継ぎ）

- 機能障害は、原因を直して本番を戻し、Step 6 の検証へ。
- **データ損失（誤 DELETE / DROP / 破壊 / ランサムウェア・乗っ取り由来）の場合**:
  - **`docs/runbooks/backup-restore.md`（REQ-217 で整備予定）に引き継ぐ。** 直近の正常世代を選び、復元手順（復号 → DB リストア → Storage 再投入 → 整合チェック）に従う。
  - 不審な削除なら、復元と並行して [01-secret-leak.md](./01-secret-leak.md) / [02-account-takeover.md](./02-account-takeover.md) で侵入経路を塞ぐ（塞がずに復元すると再度破壊される）。

### Step 6. 検証
- 主要フロー（投稿・地図表示・AI 種判定・ログイン）を 1 周して通ることを確認。
- データ損失からの復元時は、`posts` の写真 / 音声 URL がバケット上の実体と一致するか（REQ-217 の整合チェック）も確認。

---
