## 6. OIDC / 短命トークンへの段階移行（将来 TODO・FR-210-09）

当面は Vercel / Supabase の長期トークン（`secrets.VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` 等）を使う。
各プロバイダが OIDC（Workload Identity）をサポートする範囲で短命トークンへ段階移行する。

- 移行時は、対象ジョブにのみ `permissions: id-token: write` を付与する（workflow 全体には付けない）。
- 移行できたら対応する長期トークン secret を削除する。

---

## 7. fork PR / pull_request_target の方針（FR-210-06）

- `ci.yml` は `pull_request`（`pull_request_target` 不使用）。fork PR に secrets は渡らない安全側。
- **`pull_request_target` を安易に導入しない**（fork の untrusted コードに secrets が露出しうる）。
- secrets を要するジョブは fork PR で実行されない設計を維持する:
  - `deploy`: `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`（main push 限定）。
  - `edge-functions-deploy-lag`: secrets 未設定時は scripts 側で notice を出して exit 0。
  - `dependency-review`: `if: github.event_name == 'pull_request'`（secrets 不要・GITHUB_TOKEN のみ）。

---
