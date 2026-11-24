## 🧑 コードでは解決できない運用タスク（最優先）

### REQ-290 資格情報の失効とローカル秘密の封じ込め
`.claude/settings.local.json` に **Supabase PAT 3種・Gemini APIキー 2種・JWT 2種**（本番anon JWT含む）が平文で残存（secret形状の文字列30箇所）。

- 無視しているのは**グローバル `~/.config/git/ignore` のみ**。リポジトリの `.gitignore` に `.claude` の記載がない。現在は未追跡だが、別クローン・別マシンでは `git add -A` で即コミットされる
- docs は REQ-017 で伏字化済みのため**どれが失効済みか台帳から判別できない** → **7件すべて失効が唯一の安全側**
- ⚠️ **CI では原理的に検知できない**。CIはクリーンcheckoutで動くので未追跡ファイルは存在しない。実際に捕まえる層はローカルの pre-commit だが、REQ-210 FR-210-08 の pre-commit 導入は未実施で `.git/hooks` に有効なフックがない

### REQ-291 webhook認証チェーンの本番有効化
Vault に `webhook_secret` が未登録のため grace period が常時成立し、**webhook系 Edge Function 12本が公開anonキーだけで到達可能**。メール爆撃・ライフサイクルメール一斉送信・Gemini課金消費・SNS強制投稿の経路になる。

手順: Vault と Edge secrets に同一値で登録 → 疎通確認 → `WEBHOOK_SECRET_ENFORCE=true` で grace period を閉じる（REQ-270 FR-270-04 の④完了）

### その他
- **Vercel の Node ランタイム確認**（REQ-296 の sharp が `>=20.9.0` 要求）
- REQ-292 の本番適用（`supabase db push` → Auth Hook 有効化と正常系実測 → GRANT実測 → 汚染調査）

---
