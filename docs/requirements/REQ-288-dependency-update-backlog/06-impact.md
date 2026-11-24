## 影響範囲

### 変更対象ファイル

- `package.json` / `package-lock.json`
- `.github/dependabot.yml`（コメント追記のみ）
- `.github/workflows/*.yml`（#29 の github-actions SHA 更新）
- `eslint.config.js`（eslint 10 が要求する場合）
- `tsconfig.json`（typescript 7 が要求する場合）
- `docs/runbooks/`（新規 runbook）
- i18n 関連ソース（i18next 26 の API 変更が及ぶ場合）

### 他機能への影響

- **REQ-277（i18n 直書き撲滅）**: `i18next` 26 の API 変更が作業中の実装と衝突しうる。着手順序を調整すること
- **REQ-281 FR-281-03**: private リポで動く脆弱性スキャン（osv-scanner / trivy / Semgrep OSS）の導入は本要件の安全網そのものであり、先に入っていると本要件の判断が楽になる
- **REQ-283 / REQ-284**: 未実装のため衝突しない

---
