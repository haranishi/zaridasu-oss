<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- cc-sdd-project:v1 -->

## cc-sddによる開発

- 開発依頼は、まず [.kiro/README.md](.kiro/README.md) と `.kiro/steering/` の案内に従って整理する。
- 設計思想・コードの役割・処理の流れは [設計とコードの案内](docs/architecture/README.md) から確認する。
- 現在の挙動は `docs/current/`、既存の変更要件と進捗は `docs/requirements/` を参照する。既存REQを重複して仕様化しない。
- 新規仕様は `.kiro/specs/<機能名>/` に置き、要件 → 設計 → タスクの承認後に実装する。承認状態を推測で埋めない。
- 小さな修正は既存仕様への影響を確認して直接修正・検証する。commit・push・公開は、本人が当該操作を指示した範囲で行う。

<!-- /cc-sdd-project -->
