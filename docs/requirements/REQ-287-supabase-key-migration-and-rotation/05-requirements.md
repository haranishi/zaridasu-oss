## 5. 要件

### 5.1 機能要件

#### FR-287-01: Edge Function のキー参照を切り替え可能にする

14 本の非テストソースについて、`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` の直接参照をやめ、**共有ヘルパー 1 箇所に集約**する。

- `supabase/functions/_shared/` に service_role クライアント生成のヘルパーを新設し、全関数がそれを使う
- ヘルパーは `SUPABASE_SECRET_KEY` を優先し、未設定なら `SUPABASE_SERVICE_ROLE_KEY` にフォールバックする（**段階移行のため。FR-287-05 完了後にフォールバックを削除する**）
- 既存のテスト 10 本が壊れないこと。必要ならヘルパーのモックに寄せる

> 集約する理由: 14 箇所を個別に書き換えると、次回のキー変更でも同じ規模の作業が再発する。今回の移行を機に単一点にする。

#### FR-287-02: Edge Function の env を設定

- Supabase の Function Secrets に `SUPABASE_SECRET_KEY` を登録する
- デプロイ済み関数を再デプロイして反映する。**REQ-285 のデプロイ作業と同時に行えばデプロイ回数を節約できる**

#### FR-287-03: Vault のキーを差し替え

- `vault.secrets` の `edge_function_service_role_key` の値を新方式 secret キーへ更新する
- 更新後、pg_net 経由の呼び出し（`analyze_image_on_insert` / `analyze_audio_on_insert_or_update` / `enrich_place_on_insert` / cron 3 本）が 200 を返すことを `net._http_response` で確認する
- Vault のキー名は現行のまま据え置いてよい（名前が `service_role` を含むが、実体が変わるだけ）。改名する場合は参照している migration 群を新しい migration で再定義すること（既存 migration を書き換えないこと）

#### FR-287-04: 全経路の疎通確認

レガシーキー無効化の**前に**、次の全経路が新キーで動作することを確認する。

| 経路 | 確認方法 |
|---|---|
| `analyze-image`（投稿 INSERT トリガー） | テスト投稿 1 件で `ai_call_logs` に成功記録 |
| `analyze-audio` | 同上 |
| `enrich-place` | `geo_enriched_at` が埋まる（REQ-285 FR-285-01 の完了が前提） |
| `notify-post-status` / `notify-comment` / `notify-survey-request` | 各イベントを 1 回発生させメール到達を確認 |
| cron 3 本 | `net._http_response` が 200（REQ-285 の判断次第では対象外） |
| `scripts/calc-ai-cost.ts` | ローカル実行が通る |

#### FR-287-05: レガシー `service_role` キーの無効化

FR-287-04 完了後、Management API でレガシー `service_role` キーを無効化する。無効化後 24 時間、`net._http_response` と Edge Function ログにエラーが出ないことを確認する。

その後、FR-287-01 で入れたフォールバック（`SUPABASE_SERVICE_ROLE_KEY` 参照）を削除する。

#### FR-287-06: publishable への移行方針を決めて記録

レガシー `anon` → `sb_publishable_` の切り替えについて、次を `docs/runbooks/supabase-hardening-checklist.md` に方針として記載する（実施は別要件）。

- 差し替え対象の環境変数（Vercel / `.env.example` / CI）
- バンドル焼き込みのため**再デプロイ完了までレガシー anon を無効化してはいけない**こと
- 切り替え順序（新キーを環境変数へ → 再デプロイ → 疎通確認 → レガシー無効化）

#### FR-287-07: 秘密値の混入を検知する

- Supabase ダッシュボードの Database Webhooks 機能を**使わない**ことをルール化する（リポジトリ管理外のオブジェクトが増え、かつ定義に秘密値が入るため）。`docs/README.md` または `supabase/migrations/README.md` の運用ルールに追記する
- 定期的に「トリガー / 関数定義に JWT らしき文字列が含まれていないか」を検査する手順を runbook に追加する。`pg_get_triggerdef()` / `pg_get_functiondef()` を走査し `eyJ` で始まる文字列を探す形でよい
- 既存の `gitleaks`（`.gitleaks.toml`）はリポジトリ内しか見ないため、**DB 内の秘密値は対象外**であることを明記する

### 5.2 非機能要件

- [ ] **NFR-287-01（無停止）**: 作業中にユーザーのログアウト・サービス停止を発生させないこと
- [ ] **NFR-287-02（可逆性）**: レガシーキー無効化（FR-287-05）の直前まで、各ステップは切り戻し可能であること
- [ ] **NFR-287-03（秘密値の非記録）**: 作業ログ・コミット・Obsidian ノート・runbook にキーの実値を残さないこと
- [ ] **NFR-287-04（テスト）**: FR-287-01 のヘルパー集約後も Edge Function のテストが緑であること

---
