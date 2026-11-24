# REQ-214: サーバー側認可の getSession 非依存化の全面監査と回帰防止

サーバー側の認可で `getSession()` を使っていないことを全経路で棚卸しし、**その健全な状態を機械的に回帰防止する**要件。新規脆弱性の修正ではなく既存の良い状態の固定化（regression guard）。本文は逐語で分割済み（この入口は目次と目的のみ）。

## 目的

- サーバー側（Server Components / Server Actions / Route Handler / middleware / Edge Functions）で **`getSession()` を認可に使わない**ことを、棚卸しで保証し、**機械的に回帰防止**する（lint ルール or `auth-route:check` 拡張）。
- 既存 `auth-route:check` を**拡張**して getSession の認可利用検出を担わせる（新規の重複チェックを作らず、既存資産の強化として位置づける）。
- 誤解を招く middleware コメント（`middleware.ts:40`）を実態（getUser のみ）に合わせて是正する。
- 高リスク操作（権限昇格 / 剥奪 / 削除）の **freshness 方針を明文化**し、DB 側 re-check（`set_user_admin_role`）の回帰テストを担保する。Edge Function の admin 判定が JWT クレーム依存であることを許容範囲として記録し、必要なら DB 再確認に寄せる方針を残す。


## 分割ファイル

- [01-background-and-audit-findings.md](REQ-214-server-auth-getuser-audit/01-background-and-audit-findings.md) — 背景（SSRで `getSession()` を認可に使わない理由、認可はデータ層で多層に、CVE-2025-29927、JWT freshness）と現状の問題1〜4（回帰防止の欠落／middleware の実態と食い違うコメント／freshness の明文化とテストが薄い／「健全」と評価できる事実の記録）
- [02-requirements-acceptance-and-impact.md](REQ-214-server-auth-getuser-audit/02-requirements-acceptance-and-impact.md) — 機能要件 FR-214-01〜06、非機能要件、受入条件、影響範囲（変更対象・参照のみ・他機能への影響）、優先度

### 監査の結論（前提として重要）

- 実コードの `grep` と各ファイル確認の結果、**サーバー側の認可に `getSession()` を使っている箇所は無い**。実使用はクライアントの `src/context/AuthContext.tsx:35` とテストのみ。
- middleware は既に `getUser()` で /admin・/dashboard を保護しており、`next` も CVE 修正版。**認可の振る舞いは本REQで変更しない**。
- やることは (1) lint / `auth-route:check` 拡張による回帰防止、(2) 誤解を招く middleware コメントの是正、(3) 高リスク操作の freshness 方針の明文化と `set_user_admin_role` の pgTAP 追加。
