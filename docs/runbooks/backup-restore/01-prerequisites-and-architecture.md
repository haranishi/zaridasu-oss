## 0. 重要な前提（読み飛ばし厳禁）

- ザリダスは卒研の市民科学 PF で、**収集データ（投稿・写真・音声・調査依頼・コメント）＝研究成果**である。
  データ消失は研究成果の喪失に直結する（REQ-217 優先度: 緊急 High / 重要 Critical）。
- **DB ダンプだけでは写真 / 音声は戻らない。** `pg_dump` / `supabase db dump` は Storage オブジェクトの
  バイナリを含まない。`posts.photo_url` / `posts.audio_url` は URL 文字列が戻るだけで、実体が無ければ
  リンク切れになる。**必ず DB と Storage の両方**をバックアップ・リストアする（FR-217-03）。
- **暗号鍵の秘密鍵は CI / リポジトリに置かない。** バックアップは age（無ければ gpg）で**公開鍵暗号**し、
  復号できるのは運用者ローカルの秘密鍵のみ（NFR-217-01）。秘密値・鍵の実体はこの runbook にも書かない。
- 現プラン（無料 / Pro）はリポジトリから判別できない (推測)。本書は**無料枠でも動く最小構成**を基本とし、
  Pro 固有の PITR は §(i) のチェックリストに分離する。**実装着手時に運用者が現プランを確認**し、本書の
  該当箇所に追記すること。

### 構成（何がどう動くか）

| 層 | ファイル | 役割 |
|---|---|---|
| 定期ジョブ | `.github/workflows/backup.yml` | 毎日 1 回（cron）+ 手動（`workflow_dispatch`）。DB ダンプ + Storage エクスポート → 暗号化 → Artifacts（+ 任意でオフサイト R2/B2）|
| DB バックアップ | `scripts/backup-db.sh` | `pg_dump`（無ければ `supabase db dump`）→ age/gpg 暗号化 → 平文破棄 → `.sha256` 併記 |
| Storage バックアップ | `scripts/backup-storage.sh` | S3 互換 API（aws/rclone）で `post-photos` / `post-audio` / `rare-photos` / `water-report-photos` をミラー → tar.gz → age/gpg 暗号化 |
| DB 復元 | `scripts/restore-db.sh` | 暗号化ダンプを復号 → 整合チェック → `psql` でリストア（DRY_RUN 対応）|
| Storage 復元 | `scripts/restore-storage.sh` | 暗号化アーカイブを復号 → 展開 → S3 互換 API でバケットへ投入（DRY_RUN 対応）|
| バケット / RLS / トリガー定義 | `supabase/schema.sql` / `supabase/migrations/*` | リストア先で再適用すると `post-photos`/`post-audio` とポリシー・RLS・トリガーが再構築される |

### 本番プロジェクト情報

- 本番 project ref: **`edxmkqmjzbarjdgnkcvc`**（`docs/runbooks/edge-function-deploy.md:20` と同じ）
- ローカル config の project_id: `zarigani-das`（`supabase/config.toml:1`）
- 対象バケット: `post-photos`（public・5MB・jpeg/png/webp/heic）、`post-audio`（public・1MB・webm/mp4/mpeg/ogg）、`rare-photos`（非公開・5MB・jpeg/png/webp。希少種の記録）、`water-report-photos`（非公開。水域情報の提供）

---
