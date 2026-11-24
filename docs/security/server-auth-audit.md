# サーバー側認可監査 — getSession 非依存性と freshness（REQ-214）

- **対象**: ザリダス（Next.js 15 App Router / Supabase SSR / TypeScript）
- **目的**: 全認可経路で `getSession()` を認可に使っていないことの棚卸し（FR-214-01）と、
  高リスク操作（権限昇格/剥奪/削除）の freshness 方針の明文化（FR-214-05）。
- **最終確認日**: 2026-06-16
- **結論（先出し）**:
  - サーバー側で `getSession()` を**認可に使っている箇所は 0 件**（後述の一覧参照）。
  - middleware・Edge Functions の呼び出し元検証はすべて `getUser()`（Auth サーバー検証）。
  - `next` は **15.5.14**（CVE-2025-29927 修正版 15.2.3 以降を満たす）。
  - **ただし** `set_user_admin_role` の管理者チェックに NULL 比較バグがあり、freshness 保護が
    実際には破れている（後述「重大な発見」）。本 REQ の変更対象外（schema.sql は参照のみ）の
    ため未修正。要対応。

---

## 補足（要点）

- **判断基準**: `getSession()` は Cookie のセッションをそのまま返すためサーバーでは認可に使わない。サーバー側は `getUser()`（Auth サーバー検証）か `getClaims()`（JWT 署名検証）を使う。
- **回帰防止は lint と CI スクリプトの 2 重**。`getSessionCache()` / `getUserMedia()` / `auth.admin.getUserById()` は誤検出させない設計。
- **高リスク操作（昇格・剥奪・削除）は JWT クレームではなく DB を都度再確認する**。低リスクな Edge Function の admin 判定だけは JWT クレームを許容する。
- **未修正の脆弱性が 1 件残っている**（§5）。schema.sql は本 REQ の変更対象外のため手を付けていない。

## 各節

| 節 | 文書 | 内容 |
|---|---|---|
| §1 | [監査方法](server-auth-audit/01-audit-method.md) | grep の対象と分類の枠組み、`getSession` を認可に使わない理由 |
| §2 | [棚卸し一覧](server-auth-audit/02-inventory.md) | `getSession` / `getUser` の全ヒット、誤検出しやすい語、Route Handler・Server Component・Edge Function 設定・依存 CVE |
| §3 | [回帰防止](server-auth-audit/03-regression-prevention.md) | ESLint の AST セレクタと除外、`auth-route:check` の不変条件、検出例 |
| §4 | [freshness 方針](server-auth-audit/04-freshness-policy.md) | DB 側 re-check の設計意図、Edge Function の JWT クレーム判定を許容する範囲、回帰テスト |
| §5 | [重大な発見: NULL 比較バグ](server-auth-audit/05-critical-finding-null-comparison.md) | `set_user_admin_role` で三値論理により管理者チェックが素通りする症状・再現・推奨修正 |
| §6 | [受入確認](server-auth-audit/06-acceptance-criteria.md) | REQ-214 の AC-01〜06 と現状の対応表 |
