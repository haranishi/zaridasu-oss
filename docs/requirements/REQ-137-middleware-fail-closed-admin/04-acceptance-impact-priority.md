## 受入条件

- [ ] **AC-137-01**: **Given** Supabase Auth API が 503 を返す環境、**When** 未認証ユーザーが `/admin/posts` にアクセス、**Then** `/admin/login?reason=auth_unavailable` に 307/302 redirect され、Server Component には到達しない。
- [ ] **AC-137-02**: **Given** 同上、**When** `/dashboard` にアクセス、**Then** `/?reason=auth_unavailable` に redirect。
- [ ] **AC-137-03**: **Given** 同上、**When** `/`（公開ページ）にアクセス、**Then** 200 で正常レンダリング（公開ページの可用性は維持）。
- [ ] **AC-137-04**: **Given** middleware で例外が発生、**When** catch が動作、**Then** Sentry に `middleware:updateSession` タグでエラーが 1 回送信される。
- [ ] **AC-137-05**: **Given** `/admin/login?reason=auth_unavailable` を開く、**When** ページレンダリング、**Then** 「認証サービスに一時的にアクセスできません」の alert が表示される。
- [ ] **AC-137-06**: **Given** `/admin/login` を `reason` クエリなしで開く、**When** 同上、**Then** alert は表示されない（既存挙動）。
- [ ] **AC-137-07**: **Given** `admin` ロールで正常ログイン済み、**When** `/admin/posts` にアクセス、**Then** middleware を通過し、admin layout の Server Component も再度 `getUser()` で role 検証を行ったうえでレンダリングされる。
- [ ] **AC-137-08**: **Given** Supabase が正常稼働、**When** middleware が例外を投げない通常パス、**Then** 既存の REQ-049 テストが全て通過（regression なし）。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/supabase/middleware.ts` | catch ブロックの fail-closed 化（path 別 redirect）、`logError` 呼び出し追加 |
| `src/app/(admin)/admin/login/page.tsx`（もしくは対応する RSC） | `searchParams.reason === 'auth_unavailable'` の alert 表示追加 |
| `src/app/(admin)/admin/layout.tsx` | Server Component 側で `supabase.auth.getUser()` 再検証（defense in depth）。既に存在する場合は変更不要 |
| `src/lib/supabase/__tests__/middleware.test.ts` | FR-137-06 のユニットテスト追加 |
| `tests/e2e/middleware-fail-closed.spec.ts` | 新規。FR-137-07 |
| `src/utils/errorHandler.ts` | 変更なし（既存の `logError` を import するのみ） |

### 他機能への影響

- **REQ-018 (admin auth hardening)**: 本要件は REQ-018 の延長線上にあり、middleware の最終防御も hardening する。
- **REQ-035 (dashboard middleware getuser)**: `/dashboard` も同じ fail-closed ポリシーに乗せる。REQ-035 の挙動と矛盾しない。
- **REQ-049 (test-middleware-auth)**: 既存テストの regression を必ず通すこと。
- **REQ-016 (error monitoring)**: middleware の例外も Sentry に送られるようになるため、本要件で error monitoring カバレッジが拡大する。
- **公開ページ可用性**: fail-open を維持するため、Supabase 障害時にも `/` などの閲覧機能は止まらない。

## 優先度

- **緊急度**: Critical（認証バイパスは admin の核機能を貫通するため、潜在的なデータ漏洩リスク）
- **重要度**: Critical（middleware は admin への single point of defense であり、ここの fail-open は全体ポリシーの抜け穴）
- **理由**: 攻撃者が Supabase の rate limit を意図的に発火させる、または DoS で getUser を timeout させることで、middleware の認可をバイパスできる可能性がある。Server Component 側の二重チェックで救われる構成にはなっているが、middleware を「通過する」ことそのものが望ましくない（RSC によっては getUser を呼ばずに DB 取得を開始するものも残存）。実装コストは低く、リスクは大きい典型的な Critical 案件。
