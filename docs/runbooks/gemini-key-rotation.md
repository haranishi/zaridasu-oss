# Gemini API キー ローテーション手順書

> 参照要件: REQ-126
> 所要時間: **10 分以内**（新規キー発行 → secret 更新 → 動作確認）

---

## これは何か

Gemini API キーが無効になった（または漏洩した）ときに、新規キーを発行して Supabase の secret を
差し替え、動作確認のうえ旧キーを revoke するまでの手順書。切り分け（本当に認証エラーか）と、
新キーでも復旧しない場合のエスカレーション先も含む。

## 目的・背景

キーが無効だと **AI 種判定が完全停止**し、新規投稿は `pending` に滞留して管理者の手動審査負荷が増える。
一方で**投稿自体は受け付けられる**（書き込みフローは AI に依存しない）ため、サービス全断ではない。
この前提で「10 分以内に AI を復帰させる」ことを目標にしている。

## 主要な決定事項（要点）

- **まず `gemini_auth` かを確認する。** `gemini_transient`（5xx / 429）が主体なら Gemini 側障害の可能性が高く、本手順ではなく Status 確認が先。
- **新キーをチャット・Slack・CLI 履歴・コミット差分に貼らない。**
- **secret は Supabase Dashboard 上で直接編集する**（CLI / チャット経由は履歴に残る）。反映には 1〜2 分かかる。
- **旧キーの Delete は動作確認の後**（先に消すと復旧手段を失う）。漏洩対応の場合は待たずに実施する（→ incident/01-secret-leak）。
- 復旧しないときの確認順は **モデル名 → API 有効化 → Billing → クォータ → キー制約**。それでも駄目なら REQ-126 に追記して issue 化する。

## 各部品

- [01-when-to-use-impact-and-pre-checks.md](./gemini-key-rotation/01-when-to-use-impact-and-pre-checks.md) — いつ使うか（管理画面の表示・`error_kind`・API レスポンス・アラートメール）、影響範囲、事前確認の SQL と `gemini_transient` との切り分け。
- [02-rotation-steps.md](./gemini-key-rotation/02-rotation-steps.md) — ローテーション手順 Step 1 新規キー発行 / Step 2 Supabase secret の編集 / Step 3 動作確認（再判定 or curl）/ Step 4 旧キーの Revoke。
- [03-verification-escalation-and-links.md](./gemini-key-rotation/03-verification-escalation-and-links.md) — 検証チェックリスト、エスカレーション（モデル名・API 有効化・Billing・クォータ・キー制約の 5 点）、関連要件と対象コード。
