## B. ダッシュボードでしか設定できない分（人手・毎リリース前に点検）

UI のラベル・メニュー位置は Supabase 側で変わりやすい。本文の経路は **要確認**（実画面表記を優先）。記録は末尾のチェック表に残す。

### B-1. SSL Enforcement（平文接続の拒否）

- **経路（要確認）**: Project Settings → Database → **SSL Configuration / Enforce SSL on incoming connections** をオン。
- **狙い**: DB への平文接続を拒否し、中間者・盗聴を防ぐ。
- **注意**: 直接接続しているツール（psql / マイグレーション CLI / 監視）が `sslmode=require` 以上で接続できることを事前確認してからオンにする。Vercel からの接続は Supabase クライアント経由（HTTPS）のため影響しない。
- ✅ 合格: **Enforce SSL = 有効**。

### B-2. Network Restrictions（DB 直接接続元の IP 制限）

- **経路（要確認）**: Project Settings → Database → **Network Restrictions / Network Bans** で許可 CIDR を設定。
- **狙い**: Postgres への直接接続を許可 IP に限定し、攻撃面を狭める。
- **注意**:
  - アプリ本体（Vercel）の DB アクセスは PostgREST（Data API, HTTPS）経由で **直接 5432 接続ではない**ため、Data API は IP 制限の影響を受けない。制限対象は psql / マイグレーション適用 / 管理ツールなどの **直接接続**。
  - Vercel の送信 IP は動的なため、ビルド/Edge から直接 DB に繋ぐ運用がある場合は固定 IP（または許可レンジ）を要設計。現状ザリダスはアプリから直接 5432 に繋がない方針。
  - 許可 IP の **生値は本書に書かない**（ダッシュボードにのみ保持）。
- ✅ 合格: **必要範囲に限定**（管理者の作業元 + CI/IaC が直接接続するなら其の経路）。直接接続が皆無なら最小許可。

### B-3. アカウント / 組織の MFA とオーナー冗長化

- **経路（要確認）**: アカウント → Account → **Security / Multi-Factor Authentication**、および Organization → **Members / Owners**。
- **狙い**: ダッシュボード乗っ取り（= service_role 相当の全権）を防ぐ。`config.toml` では制御不能なアカウント設定。
- **注意**: Owner が単一だと退会/ロックアウト時に詰むため **Owner を複数**にする（信頼できる予備アカウント）。MFA は全 Owner で有効化。手順は Obsidian `runbooks/MFA・パスキー有効化手順.md` 参照。
- ✅ 合格: **全 Owner で MFA 有効 かつ Owner が複数**。

### B-4. PITR / バックアップ（REQ-217 と相互参照・本書は参照確認のみ）

- **経路（要確認）**: Project Settings → Database → **Point-in-Time Recovery / Backups**。
- **狙い**: 誤操作・障害からの復旧。詳細運用・復元テストの主管は **REQ-217（`docs/requirements/REQ-217-backup-bcp.md`）**。
- 本書での確認: **PITR 有効 かつ REQ-217 側で復元テスト済み** であることを参照確認するのみ（詳細手順は重複させない）。
- ✅ 合格: **PITR 有効・復元テスト済み（REQ-217 で確認）**。

### B-5. 本番 SMTP（REQ-219 と相互参照・本書は参照確認のみ）

- **経路（要確認）**: Authentication → **SMTP Settings**（`config.toml` の `[auth.email.smtp]` はローカル用でコメントアウト）。
- **狙い**: 本番メール（確認/復旧/変更）の到達性。メール認証（SPF/DKIM/DMARC）の主管は **REQ-219**。
- 本書での確認: **本番 SMTP 構成済み** であることを参照確認するのみ。
- ✅ 合格: **本番 SMTP 設定済み（REQ-219 で SPF/DKIM/DMARC を確認）**。

### B-6. Exposed schemas（Data API）の本番値を config と一致させる

- **経路（要確認）**: Project Settings → **API → Exposed schemas**（または Integrations → Data API → Settings）。
- **狙い**: `config.toml [api] schemas = ["public"]`（REQ-221 で `graphql_public` を除外）と本番ダッシュボードを一致させ、ドリフトを防ぐ。
- **注意**: 内部テーブル（`audit_logs` / `admin_login_attempts` / `experiment_assignments` / `ai_call_logs` 系）の `private` スキーマ移設など大規模なスキーマ移動は回帰リスク・型再生成コストが大きいため **別 REQ に切り出し**、本 REQ では C-3 の GRANT 点検で代替する。
- ✅ 合格: 本番 Exposed schemas = `public` のみ（GraphQL を使い始めるまで）。

---
