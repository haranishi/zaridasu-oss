## 5. 要件

### 5.1 機能要件

#### FR-286-01（即時）: 未追跡ファイルのコミット

- `supabase/migrations/20260728000001_drop_legacy_analyze_image_webhook.sql`
- `docs/requirements/REQ-283-field-exploration-mode.md`
- `docs/requirements/REQ-284-intro-story-modal-and-permanent-optout.md`
- `docs/requirements/REQ-285-…` / `REQ-286-…`（本要件群）

を、**共通 Git ブランチ運用ルール（main / develop / feat）に従って** develop 経由で取り込む。migration と要件文書はコミットを分けること（migration は CI の検証対象であり、レビュー単位を分離したほうが安全）。

> [!note] 前提確認
> ブランチを切る前に `git rev-list --left-right --count main...origin/main` が `0 0` であることを確認する。現時点では `main` と `develop` は origin と完全一致している（実測 `0 0`）。

#### FR-286-02: migration 索引の是正

`supabase/migrations/README.md` を次のとおり更新する。

- 冒頭の本数を **58 → 59** に更新
- 適用状況の節を「`20240101000000` 〜 `20260728000001` の全 59 本が本番適用済み（2026-07-29 確認）」に更新
- 索引テーブルに 1 行追加:

  | ファイル | 日付 | 目的 | REQ | 本番反映 |
  |---|---|---|---|---|
  | `20260728000001_drop_legacy_analyze_image_webhook.sql` | 2026-07-28 | ダッシュボード由来の旧 Webhook トリガー `analyze-image-on-insert` を削除し、リポジトリ管理下の `analyze_image_on_insert` 経路へ一本化（二重起動の解消・埋め込み service_role JWT の除去） | REQ-286 / REQ-287 | ✅ |

#### FR-286-03: schema.sql 同期要否の記録

当該 migration について「schema.sql の変更は不要（削除対象は schema.sql に存在しないダッシュボード由来オブジェクトのため）」を README のチェックリスト節または索引の備考に明記する。以後、**同期要否の判定結果を必ず残す**ことをルール化する。

#### FR-286-04: migration 乖離の機械的検知

本番の `supabase_migrations.schema_migrations` とリポジトリの `supabase/migrations/*.sql` を突合し、次の 2 方向の差分を検出する仕組みを追加する。

- **本番にあるがリポジトリに無い**（＝今回の事象）→ **error**。リポジトリが本番を再現できない
- **リポジトリにあるが本番に無い**（＝未適用）→ **warning**。デプロイ待ちの正常状態でもありうる

実装上の考慮:

- 既存の `supabase migration list` は両者を並べて表示できるため、これを機械可読に解釈する形が最も素直である
- 実行には `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` が要る。`check-edge-deploy-lag.sh` と同様に**未設定なら skip（exit 0）**とし、secrets が無い環境（fork PR 等）で CI を壊さないこと
- main への push 時のみ error で落とし、PR では warning に留める（`check-edge-deploy-lag.sh` の MODE 方式を踏襲する）

#### FR-286-05: 索引の陳腐化を検知

`supabase/migrations/README.md` の冒頭に書かれた本数と、実際の `supabase/migrations/*.sql` の本数が一致することを CI で検証する。不一致なら fail する。索引テーブルの行数まで厳密に検証するかは実装時に判断してよい（最低限、本数の一致を保証する）。

#### FR-286-06: 要件定義文書を未コミットで滞留させない運用

- REQ 文書を新規作成したら、実装着手前でも**その時点でコミットする**（状態欄が「起票 / 未実装」であることが状態管理として機能する）
- `docs/README.md` の運用ルール節にこの方針を追記する

### 5.2 非機能要件

- [ ] **NFR-286-01**: FR-286-04 の検知は本番 DB へ**読み取りのみ**でアクセスすること
- [ ] **NFR-286-02**: 検知スクリプトの出力に接続情報・トークン・秘密値を含めないこと
- [ ] **NFR-286-03**: CI 実行時間の増加は 1 分以内に収めること

---
