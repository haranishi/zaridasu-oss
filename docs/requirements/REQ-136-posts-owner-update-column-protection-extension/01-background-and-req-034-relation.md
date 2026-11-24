## 背景

REQ-034 で `protect_post_status` トリガーを拡張し、以下 11 列を非 admin / 非 service_role の UPDATE から保護した:

- `status`, `rejection_reason`, `rejection_message`, `reviewed_at`, `reviewed_by`, `auto_approved`（status 系 6 列）
- `is_official`, `is_flagged`, `reporter_ip`, `ai_result`, `ai_analyzed_at`（運用制御 5 列）

さらに REQ-079 で hash 改竄禁止のため以下 2 列も追加保護された（`supabase/migrations/20260424000001_add_post_hashes.sql:58-83`）:

- `audio_hash`, `image_hashes`

しかし `posts` テーブルにはその後も REQ ベースでカラムが追加され続けており、`protect_post_status` で保護されていない管理系カラムが多数残存している。`owner_update` policy（`auth.uid() = user_id`）は「自分の row なら自由に UPDATE」を許すため、トリガー側で OLD に固定しない限り、一般ユーザーが任意のタイミングで以下を書き換え可能:

- **`user_id`** — 他人 UUID への移譲。owner_update を満たした瞬間だけ書き換え、再 UPDATE は当然不可だが、所有権を譲渡できる時点で audit 切断 + 投稿の盗難が成立
- **`ai_failure_count`** — REQ-125 / REQ-128 で導入。3 回以上で再判定スキップ・通知抑制が決まる運用フラグ。手動で 0 に戻されると再判定ループ攻撃を作成可能
- **`audio_url`, `audio_duration_ms`** — REQ-070 / REQ-082。承認後に audio_url を別 URL に挿げ替え（既に承認バッジが付いた状態で違法/不適切音声に差し替え）
- **`weather`, `temperature`, `humidity`** — REQ-051 系で導入。観測時刻と乖離した気象を後付け改竄して、調査データの信頼性を破壊
- **`survey_request_id`, `survey_duration_minutes`** — REQ-084 系。他人の survey_request に自分の投稿を関連付けるなりすまし

## REQ-034 との関係

**重要: 本 REQ は REQ-034 とは独立して別ファイルとして起票する。**

- REQ-034 (`docs/requirements/REQ-034-posts-rls-column-protection.md`) は **status 系 + 当時存在した 5 列の管理列** が対象範囲。`audio_url` / `survey_request_id` / `weather` 等は当時未導入のため当然射程外。
- REQ-079 で `audio_hash` / `image_hashes` が追加保護されたが、これも音声・画像 hash の話だけで完結。
- 本 REQ は **REQ-034 と REQ-079 以降に増えた管理系カラム**を改めて棚卸しし、`protect_post_status` を再拡張する純粋な「追加」要件。**REQ-034 は完了済み扱いのまま残し、本 REQ で延長線上の対策を行う**。

`supabase/schema.sql:540-578` および `supabase/migrations/20260424000001_add_post_hashes.sql:58-83` が今の最新の `protect_post_status` 実装。
