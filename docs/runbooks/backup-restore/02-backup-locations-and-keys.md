## (a) バックアップの所在と暗号鍵の管理

### バックアップの所在（3-2-1 / FR-217-02・04・AC-03）

| # | 拠点 | 何が置かれるか | 保持 | 設定元 |
|---|---|---|---|---|
| コピー1 | **本番**（Supabase DB + Storage）| 稼働中の実データ | — | — |
| コピー2 | **GitHub Actions Artifacts** | 暗号化済み `*.age`/`*.gpg` + `*.sha256` | `retention-days: 14`（自動パージ）| `backup.yml` の `upload-artifact` |
| コピー3 | **オフサイトオブジェクトストレージ**（任意・推奨）| 同上を `YYYY/MM/DD/` プレフィックスで | プロバイダ側のライフサイクル | `backup.yml` の offsite push（`BACKUP_OFFSITE_*` secrets が揃うと有効）|
| -1（イミュータブル/オフライン）| **手元 HDD or オブジェクトロック付きバケット**（手動・月 1）| 月次世代 | 手動管理 | §(g) の月次チェックリスト |

> 2 拠点（コピー1 + コピー2）で最低限の 3-2-1 を満たす。コピー3・-1 を足すほどランサムウェア /
> アカウント停止耐性が上がる（FR-217-07）。**オフサイト / オフライン世代は本番への書き込み権限を
> 奪われても遡及破壊されない**のが肝。

### 暗号鍵の管理（NFR-217-01）

- 方式: **公開鍵暗号**。受信者の**公開鍵**を GitHub Secrets に入れ、CI はそれで暗号化するだけ。
  **秘密鍵は CI に置かず**、運用者のローカル（できればパスワードマネージャ / ハードウェアトークン）に保管。
- 第一選択は **age**（鍵が短く運用が楽）。age が使えない環境向けに **gpg** フォールバックも実装済み。

#### age 鍵ペアの生成（推奨）

```bash
# 秘密鍵をローカルに生成（このファイルは厳重保管・バックアップ先には置かない）
mkdir -p ~/.age && age-keygen -o ~/.age/zaridasu-backup.key
# 出力に "Public key: age1...." が表示される。公開鍵を控える。
grep 'public key' ~/.age/zaridasu-backup.key   # => # public key: age1xxxx...
```

- **公開鍵（`age1...`）** → GitHub Secret `BACKUP_AGE_RECIPIENTS` に設定（複数なら**カンマ区切り**で
  2 つ以上推奨＝鍵紛失時の復旧冗長性）。
- **秘密鍵ファイル（`~/.age/zaridasu-backup.key`）** → 復号時に `AGE_IDENTITY_FILE` で指す。
  **絶対にコミットしない・バックアップ保管先に置かない**（そこに置くと暗号化の意味が消える）。

#### gpg を使う場合（フォールバック）

```bash
gpg --full-generate-key                 # ECC(ed25519) 推奨。メール/識別子を控える
gpg --armor --export <fingerprint>      # 公開鍵をエクスポート（共有用）
```

- 受信者（メール / fingerprint）→ GitHub Secret `BACKUP_GPG_RECIPIENTS`（カンマ区切り可）。
- 秘密鍵は運用者のキーリングのみ。復号時 `restore-*.sh` が gpg-agent 経由で自動使用。

### 必要な GitHub Secrets（値はここに書かない / 取得元のみ）

| Secret 名 | 取得元 | 用途 |
|---|---|---|
| `SUPABASE_DB_URL` | Supabase Dashboard → Project Settings → Database → Connection string（URI）。pooler の `:6543` or direct の `:5432` | DB ダンプの接続文字列 |
| `SUPABASE_PROJECT_REF` | 既存（`ci.yml` で使用済み）= `edxmkqmjzbarjdgnkcvc` | dump フォールバック / S3 エンドポイント組み立て |
| `SUPABASE_ACCESS_TOKEN` | 既存（`ci.yml`）。`supabase login` のトークン | `supabase db dump` フォールバック |
| `SUPABASE_STORAGE_S3_ACCESS_KEY` / `..._SECRET_KEY` | Dashboard → Storage → **S3 Connection**（Access Keys 発行）| Storage の S3 互換ミラー |
| `SUPABASE_STORAGE_S3_REGION` | プロジェクトのリージョン（例 `ap-northeast-1`）| 同上 |
| `BACKUP_AGE_RECIPIENTS` | 上記 age 公開鍵（`age1...`、カンマ区切り）| バックアップ暗号化（推奨）|
| `BACKUP_GPG_RECIPIENTS` | 上記 gpg 受信者 | 暗号化フォールバック |
| `BACKUP_OFFSITE_S3_*`（ENDPOINT/BUCKET/REGION/ACCESS_KEY/SECRET_KEY）| R2 / B2 / 別 S3 の発行値 | 任意のオフサイト第 3 拠点 |

> `BACKUP_AGE_RECIPIENTS` も `BACKUP_GPG_RECIPIENTS` も未設定だと、`scripts/backup-*.sh` は
> **平文を残さず exit 1** する（暗号化必須の安全側 / NFR-217-01）。最低どちらか一方は必須。

---
