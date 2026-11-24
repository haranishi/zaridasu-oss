# REQ-136: posts.owner_update でのカラム保護不足（REQ-034 の追加カラムへの拡張）

これは何か: REQ-034 / REQ-079 以降に `posts` へ増えた管理系カラムが `protect_post_status` で保護されておらず、投稿者本人が自由に書き換えられる問題と、その修正要件。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

`owner_update` policy（`auth.uid() = user_id`）は「自分の row なら自由に UPDATE」を許すため、トリガーで OLD に固定しない限り一般ユーザーが管理系カラムを改竄できる。REQ-034 は当時存在した status 系6列＋運用5列、REQ-079 は hash 2列までしか射程に入っておらず、その後に増えた `ai_failure_count`・`audio_url`・気象3列・`survey_request_id` などが未保護のまま残っている。さらに `20260424000001` の `CREATE OR REPLACE FUNCTION` が REQ-034 拡張を**上書きして5列の保護を消した疑い**があり、これも併せて解消する。

## 主要な決定事項（要点）

- **本REQは REQ-034 とは独立した別ファイルとして起票する**。REQ-034 / REQ-079 は完了扱いのまま残し、本REQで延長線上の対策（純粋な「追加」）を行う。
- **`protect_post_status` を全20列保護版へ再拡張**（FR-136-01・新規 migration `20260513000008_protect_post_status_full_columns.sql`）。status系6＋運用3＋AI3＋hash2＋音声2＋気象3＋調査2＋`user_id`。
- **`supabase/schema.sql` を `protect_post_status` 定義の正本にする**（FR-136-02）。以後の migration で再上書きされても整合が崩れないようにし、migration drift を止める。
- **`user_id` は policy で既に守られているが二重防御として OLD 固定**する（policy 変更時のリグレッションに強くする）。
- **`audio_url` は安全側に倒して全面 OLD 固定**（差し替えたいなら削除→新規投稿）。承認前の自己差し替えを許すかは要議論として残す。
- **編集 UI が触ってよい列を明示**（FR-136-03）: `lat` `lng` `species` `info_type` `municipality` `comment` `photos` `count` `observed_at` `is_anonymous` `updated_at`。対応表は `docs/architecture/posts-column-policy.md` に残す。
- **admin / service_role は従来通り素通り**（NFR-136-03）。Edge Function の自動承認フローを壊さないことを回帰テストで担保する。
- 緊急度・重要度ともに High。REQ-133/134/135 と並ぶ RLS・トリガー drift 統合修正シリーズの4本目。

## 分割ファイル

- [01-background-and-req-034-relation.md](REQ-136-posts-owner-update-column-protection-extension/01-background-and-req-034-relation.md) — 背景（保護済み列の履歴と、未保護カラムごとの攻撃シナリオ）＋ REQ-034 との関係・切り分け方針
- [02-current-problems.md](REQ-136-posts-owner-update-column-protection-extension/02-current-problems.md) — 現状の `protect_post_status` 実装、`owner_update` policy の挙動分析、未保護カラム棚卸し表（14列）
- [03-goals-and-functional-requirements.md](REQ-136-posts-owner-update-column-protection-extension/03-goals-and-functional-requirements.md) — 目的3点 ＋ 機能要件 FR-136-01〜04（新 migration の SQL 全文、schema.sql 同期、編集可能列の明示、UI整合確認）
- [04-non-functional-tests-and-acceptance.md](REQ-136-posts-owner-update-column-protection-extension/04-non-functional-tests-and-acceptance.md) — 非機能要件 NFR-136-01〜03 ＋ テスト要件 FR-136-05〜07（pg-tap）＋ 受入条件 AC-136-01〜08
- [05-impact-and-priority.md](REQ-136-posts-owner-update-column-protection-extension/05-impact-and-priority.md) — 影響範囲（変更対象ファイル表・他機能への影響）と優先度・理由
