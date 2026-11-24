## 影響範囲

### 変更（コード）

- `scripts/check-edge-deploy-lag.sh:192, :211-219` — `_shared` 展開、`_shared` 時刻比較
- `scripts/check-migration-drift.sh:88, :105-107` — `statements` 取得と正規化ハッシュ突合
- `supabase/ci/migration-drift-ignore.txt`（新規）— 内容ドリフト検知の除外リスト
- `supabase/ci/pgnet_vault_stub.sql`（新規）— vault / pg_net スタブ
- `supabase/ci/reapply-after-grants.txt` または `supabase/ci/revoke-function-execute.sql` — 関数 EXECUTE の再確定
- `supabase/tests/` — 関数権限（`function_privs_are`）と webhook ヘッダの pgTAP を追加
- `.github/workflows/ci.yml:234, :274, :307, :469-470` — PG17、REVOKE再確定ステップ、deploy の needs、ゲート判定の分離
- `supabase/config.toml:29-30`（または `supabase/seed.sql` 新規）
- `docs/runbooks/edge-function-deploy.md` — `_shared` 変更時の運用と、CIが検知する内容の更新

### 他要件への影響

- **REQ-287**: FR-298-01/02 が入るまで、`_shared/supabaseAdmin.ts` の変更（FR-287-05 のレガシーフォールバック削除を含む）は**CI緑のまま本番が旧バンドルで動く**リスクを負う。REQ-287 の残作業を進める前に FR-298-01 を先行させることを推奨する
- **REQ-285**: FR-285-07（DB参照名の突合）の一部を、FR-298-07 の pgTAP が DB 側から補完する。静的解析による突合と併存させるか一本化するかは REQ-285 側で判断する
- **REQ-286**: 本要件の FR-298-03 は REQ-286 が塞いだ「1本足りない」型に対して「内容が違う」型を追加するものであり、REQ-286 の設計思想の延長である
- **REQ-281 / REQ-282**: CI の PostgreSQL バージョン統一（FR-298-08）と reapply 宣言ファイルの拡張（FR-298-05）は、いずれも REQ-282 で確立した方式の上に載る

## 優先度の内訳

| 要件 | 優先度 | 理由 |
|---|---|---|
| FR-298-01（`_shared` 全関数展開） | **P0** | REQ-287 の鍵ローテーションが目前で、この穴に落ちると本番12関数が無言で認証失敗する |
| FR-298-04（デプロイゲート化） | P1 | 順序事故を機械的に防ぐ層が現在ゼロ |
| FR-298-03（内容ドリフト検知） | P1 | 実在パターン。ただし実装前に `statements` 形式の実測が必要 |
| FR-298-05 / 06（関数権限の再確定と検証） | P1 | 「CIが本番と逆の権限状態でテストを通している」状態の解消 |
| FR-298-07（pg_net ラッパのCI検証） | P1 | 通知・AI・Push の起動経路がカバレッジ0 |
| FR-298-02（`_shared` 時刻比較） | P2 | FR-298-01 で大半は拾える。取りこぼしの補完 |
| FR-298-08（PG17統一） | P2 | 現に不具合が出ているわけではないが、宣言と実行の乖離は解消すべき |
| FR-298-09（seed.sql） | P3 | ローカル再構築の利便性 |

---
