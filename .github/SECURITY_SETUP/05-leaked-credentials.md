## 5. 既知の漏洩クレデンシャル（REQ-017 へハンドオフ）

`docs/verification-2026-05-13.md`（commit `cfc2b4f`）に、過去セッションで漏れた以下が
**revoke 手順として平文記載**されている。これは「scanning で検知すべき本物の漏洩」であり、
gitleaks のパターン許可リストでは隠していない。代わりに **commit+path 限定で一時ピン留め**してある
（`.gitleaks.toml` のブロック4）。

| 種類 | 状態 | 対応先 |
|---|---|---|
| Gemini API キー（`AIza...`） | 要 **revoke** + git 履歴除去 | **REQ-017**（機密ローテーション・履歴クリーンアップ） |
| Supabase access token（`sbp_...`） | 要 **revoke** + git 履歴除去（gitleaks 既定ルールでは未検知だが平文残存） | **REQ-017** |

- [ ] REQ-017 で両キーを **失効（rotate）**。
- [ ] REQ-017 で git 履歴から該当値を除去（`git filter-repo` 等）。
- [ ] 完了後、`.gitleaks.toml` のブロック4（commit+path ピン留め）を**削除**する。

> 一次対応順序は常に「**まず失効（rotate）→ 次に履歴除去**」（`23_Leak_Response_Playbook`）。
> 履歴除去前でも、まず失効すれば漏洩値は無効化できる。

---
