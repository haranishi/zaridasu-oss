# REQ-167: E2E `admin-gemini-banner` のバナー不可視による e2e ジョブ失敗

## 背景
`tests/e2e/admin-gemini-banner.spec.ts` は REQ-126 FR-126-16（AdminLayout の Gemini 認証エラーバナー）を検証する
Playwright E2E。直近1時間に `ai_call_logs.error_kind='gemini_auth'` が存在する場合にバナー
（`data-testid="gemini-auth-banner"`）が表示されることを確認する。

CI `e2e` ジョブで1件目のテストが失敗し、`playwright.config` の maxFailures により以降24件が実行されず全体が赤になっている。

## 現状の問題
- 失敗テスト: `tests/e2e/admin-gemini-banner.spec.ts:101`「直近 1 時間に gemini_auth が 1 件あれば admin にバナーが見える」。
- アサーション `:111` `await expect(banner).toBeVisible({ timeout: 10_000 })` が `element(s) not found` でタイムアウト。
- テストの構成（`:38-88` `setupAdminRoutes`）:
  - `/auth/v1/user**` を admin ロール付き user で 200 返却（middleware getUser 用）。
  - `/rest/v1/ai_call_logs**` を `Content-Range: 0-0/1` で count=1 返却。
  - その他 `/rest/v1/**` は空配列。
- バナーはレイアウト側フックが初回 count fetch 後に表示されるが、CI 環境では 10s 以内に可視化されない。
- 想定される要因（要調査・切り分け）:
  1. クライアント側 `useAuth()` のセッションが（cookie クリア済みのため）確立されず、AdminLayout もしくはバナー用フックの
     初期化条件が満たされない（middleware は getUser をモックで通すが、ブラウザ内 Supabase クライアントのセッション状態は別）。
  2. バナー用フックの count 取得クエリ（`count: 'exact', head: true`）の経路・ヘッダが route mock の glob/メソッド条件に
     一致していない、または PostgREST の `apikey`/preflight でブロックされている。
  3. 30s ポーリング設計に対し 10s タイムアウトが短い等のタイミング依存。
- なお本失敗は REQ-147〜164 の変更とは別系統（REQ-126 のバナー機構）であり、当該変更がバナー実装/レイアウトに触れていない
  ことを確認済み。回帰ではなく E2E のフレーキー/環境依存が主因と推定されるが、根本原因の特定を要件に含める。

### 再現
```
npm run e2e
# => admin-gemini-banner.spec.ts:111 banner toBeVisible timeout (element not found)
```

## 目的
バナー表示の前提条件を E2E 内で決定論的に成立させ、当該テストを安定して通過させる。あわせて maxFailures による
「1件失敗で全 e2e が止まる」状態を解消する。

## 要件
### 機能要件
- [ ] FR-167-01: 失敗の根本原因を切り分ける（trace.zip / screenshot を確認し、(1) auth セッション未確立 (2) count クエリ未一致
  (3) タイミング のどれかを特定する）。
- [ ] FR-167-02: 特定した原因に応じてテストを決定論化する。例:
  - クライアント側セッションが必要なら、`addInitScript` で Supabase セッションを localStorage/cookie に注入する、
    またはバナー用フックの count 取得経路を確実にモックする。
  - count クエリの route 条件（メソッド・パス・ヘッダ）を実リクエストに一致させる。
- [ ] FR-167-03: バナー表示待ちのタイムアウト/ポーリング前提を実装に合わせて調整する（過剰な待機やフレークを生まない範囲で）。
- [ ] FR-167-04: 同 spec の他2テスト（dismiss 永続化、count=0 で非表示）も引き続き安定通過すること。

### 非機能要件
- [ ] NFR-167-01: テスト本体（バナーの仕様検証内容）を弱めない。表示条件を実態に合わせて確実化するに留める。
- [ ] NFR-167-02: （任意）`playwright.config` の maxFailures 設定を見直し、1件失敗で全停止する運用が妥当か検討する。

## 受入条件
- [ ] AC-01: `npm run e2e`（または対象 spec 単体）でバナー表示テストが安定して通過する（リトライ無しでも可）。
- [ ] AC-02: CI `e2e` ジョブがグリーンになる（24件が実行され全通過）。
- [ ] AC-03: 根本原因と対処内容がテストコメントまたは本要件にレポートされている。

## 影響範囲
- `tests/e2e/admin-gemini-banner.spec.ts`
- 必要に応じて `playwright.config.ts`（maxFailures / タイムアウト）
- AdminLayout の Gemini バナー用フック（実装の表示条件確認のみ。仕様変更は想定しない）

## 優先度
- **緊急度**: High / **重要度**: Medium
- **理由**: main CI の e2e ジョブを赤にしており、かつ maxFailures により他 E2E の検証もブロックしている。機能仕様の欠陥ではなく
  テスト安定性の問題のため重要度は Medium だが、CI 健全化のため早期対応が必要。
