# REQ-019: CSRF保護の実装

## 背景
管理者操作（投稿削除・ユーザーロール変更・レポート処理等）は状態変更を伴う高権限操作であるが、現状CSRFトークンによる保護がない。攻撃者が管理者をフィッシングサイトに誘導し、管理者のセッションを利用して意図しない操作を実行される可能性がある。

## 現状の問題
- 管理画面の全操作（POST相当）にCSRFトークン検証がない
- `src/views/admin/AdminLoginPage.tsx:20`: ログインフォームにCSRFトークンなし
- `src/views/admin/AdminPostsPage.tsx`: 投稿の削除・承認・却下操作にCSRFトークンなし
- `src/views/admin/AdminUsersPage.tsx`: ロール変更操作にCSRFトークンなし
- Supabaseのcookieベースセッションによる暗黙的CSRF保護に依存している状態

## 目的
管理者操作をCSRF攻撃から保護し、正当なリクエストのみが受け付けられるようにする。

## 要件

### 機能要件
- [ ] FR-019-01: セッション生成時にCSRFトークンを発行し、cookieに保存する（SameSite=Strict）
- [ ] FR-019-02: 状態変更を伴う全ての管理者操作で、リクエストにCSRFトークンを含める
- [ ] FR-019-03: サーバーサイド（middleware）でCSRFトークンを検証し、不一致時はリクエストを拒否する（403）

### 非機能要件
- [ ] NFR-019-01: Cookie属性を `SameSite=Strict; Secure; HttpOnly` に設定する
- [ ] NFR-019-02: トークンはセッションごとに再生成し、ログアウト時に無効化する

## 受入条件
- [ ] AC-01: 管理者操作のリクエストにCSRFトークンが含まれている（DevToolsで確認）
- [ ] AC-02: CSRFトークンなしで管理者APIを直接叩くと403が返る
- [ ] AC-03: 通常の管理者操作が正常に動作する（既存機能への影響なし）

## 影響範囲
- `src/lib/supabase/middleware.ts`
- `src/views/admin/` 配下の全ページ
- `src/lib/auditLog.ts`（トークン含むリクエストへの対応）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 管理者操作の保護は基本的なセキュリティ要件。Supabase cookieのSameSite設定で暗黙的保護がある程度機能しているため、Criticalではなく High
