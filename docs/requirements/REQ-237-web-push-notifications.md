# REQ-237: Web Push 通知基盤（再訪・リエンゲージ）

## 背景
ザリダスはメール（Resend）以外の再訪チャネルを持たない。Obsidian メモ（`会社経営/04_デジタルマーケ・グロース・営業.md` の Customer Success／早期介入／リエンゲージ）が示すとおり、休眠の早期復帰や「周辺の新着」「自分の投稿が承認された」といった即時性のある通知は継続率に効く。ザリダスは既に PWA（Service Worker）対応済みで、Web Push を載せる土台がある。本 REQ は Web Push 基盤を整備し、メールのライフサイクル通知（REQ-234）と相補的に機能させる。

## 現状の問題
（ファイルパス:行番号つき）

### 1. Service Worker に push / notificationclick ハンドラが無い
- SW テンプレート `public/sw.js.tpl` のイベントハンドラは `install`（:14）・`activate`（:22）・`fetch`（:42）の3つのみで、`push`・`notificationclick`・`showNotification` は**存在しない**（`grep -nc "push\|notificationclick\|showNotification" public/sw.js.tpl` が 0）。SW はキャッシュ／オフライン用途（`scripts/build-sw.mjs` がキャッシュバージョンを付与）に限定されている。

### 2. プッシュ購読（PushManager）も VAPID も未実装
- SW 登録は `src/app/providers.tsx:56-72`（`navigator.serviceWorker.register('/sw.js')`）にあるが、`registration.pushManager.subscribe(...)` は呼ばれていない。
- `grep -rn "PushManager\|VAPID\|Notification.requestPermission\|web-push" src supabase scripts` は**ヒット無し**。購読を保存するテーブル（例 `push_subscriptions`）も無い。

### 3. 通知チャネルがメールのみで、即時の再訪導線が無い
- ユーザーへの通知は Supabase Edge Functions（`notify-post-status` 投稿承認/却下・`notify-comment` コメント・`notify-survey-request`）から Resend で送るメールのみ。投稿承認・コメント・周辺の新着を**即時にプッシュで再訪させる**手段が無い。メールは到達が確実だが即時性・再訪率で Push に劣る。

### 4. PWA manifest はあるが通知関連設定が無い
- manifest は `src/app/manifest.ts`（App Router 動的生成）。Push 許諾の文脈（`gcm_sender_id` 不要だが）や通知アイコンの整理が未着手。

## 目的
既存の Service Worker / PWA 基盤の上に Web Push を実装し、メール（REQ-234）と選択可能な即時リエンゲージ・チャネルを提供する。投稿承認・コメント・周辺の新着など継続に効くイベントをプッシュで届け、休眠復帰と再訪率を高める。

## 要件

### 機能要件
- [ ] FR-237-01: `public/sw.js.tpl` に `push` イベントハンドラ（受信ペイロードから `showNotification`）と `notificationclick` ハンドラ（該当ページへフォーカス/遷移）を追加する。既存の `install`/`activate`/`fetch`（:14/:22/:42）とキャッシュ戦略を壊さないこと。
- [ ] FR-237-02: VAPID 鍵ペアを用意し、購読フローを実装する。`providers.tsx`（または専用フック）で `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` を呼び、購読情報をサーバーへ保存する。**VAPID 秘密鍵はサーバー専用**（`NEXT_PUBLIC_` 厳禁、REQ-211 のシークレット方針）。公開鍵のみクライアントへ。
- [ ] FR-237-03: 購読管理テーブル（例 `push_subscriptions`：`user_id`・`endpoint`・`p256dh`・`auth`・`created_at`・`enabled`）を追加し、RLS で本人のみ読み書き可、`SECURITY DEFINER` 関数は `search_path` 固定（REQ-221）。失効した購読（送信 410/404）を無効化・削除する。
- [ ] FR-237-04: 許諾 UX を「いきなり出さない」設計にする。初回訪問では要求せず、価値が伝わったタイミング（例：初回投稿の完了後、コメント機能の利用時など）で文脈付きのプリプロンプト→ブラウザ許諾の二段にする。拒否後に繰り返し出さない。
- [ ] FR-237-05: 通知イベントを定義し送信する：投稿承認/却下（`notify-post-status` と統合）・自分の投稿へのコメント（`notify-comment`）・周辺/フォロー地域の新着。送信は `web-push` ライブラリ等でサーバー（Edge Function / Route Handler）から行う。
- [ ] FR-237-06: REQ-234（メール）とチャネルを選べる通知設定 UI を用意する（イベント種別 × チャネル[メール/プッシュ] のオプトイン/アウト）。同一イベントをメールと Push の双方で出すか片方かをユーザーが選べる。
- [ ] FR-237-07: 通知文言を i18n 4言語（`src/locales/*/translation.json`）で用意する（`i18n:check` 通過）。

### 非機能要件
- [ ] NFR-237-01: VAPID 秘密鍵・送信トークンはサーバー専用。クライアントバンドル・Git・ログに載せない（REQ-211）。
- [ ] NFR-237-02: iOS/Safari の Web Push は「ホーム画面に追加した PWA」でのみ動作する等の制約があるため(推測、実装時に最新仕様を確認)、非対応環境では設定 UI で Push を無効表示にしメールへフォールバックする。
- [ ] NFR-237-03: 配信はレート制限・バッチ・失敗リトライ上限（REQ-218 の暴走防止）を備え、無効購読を自動で刈り込むこと。
- [ ] NFR-237-04: 既存の SW キャッシュ／オフライン（`build-sw.mjs`・`/offline`）と PWA 更新フロー（`providers.tsx:60-66` の `controllerchange` リロード）に回帰を起こさないこと。

## 受入条件
- [ ] AC-01: 対応ブラウザで許諾後、`push_subscriptions` に購読が保存され、テスト送信でプッシュ通知が表示される。
- [ ] AC-02: 通知をクリックすると該当ページ（投稿詳細・コメント等）が開く。
- [ ] AC-03: 投稿が承認されると、設定で Push を有効にしたユーザーにプッシュが届く（メール=REQ-234 と二重・選択が機能する）。
- [ ] AC-04: 許諾は初回訪問では要求されず、文脈のあるタイミングでプリプロンプト経由で出る。拒否後に繰り返し要求しない。
- [ ] AC-05: VAPID 秘密鍵がクライアントバンドルに含まれない（ビルド成果物を grep して確認）。
- [ ] AC-06: 失効した購読（410/404）が無効化され、再送対象から外れる。
- [ ] AC-07: 通知文言が4言語に存在し `i18n:check` が通る。

## 影響範囲
- `public/sw.js.tpl`（push/notificationclick ハンドラ）、`scripts/build-sw.mjs`（必要なら）
- `src/app/providers.tsx`（購読フロー）または新規フック、通知設定 UI
- `supabase/schema.sql` / `supabase/migrations/`（`push_subscriptions` テーブル・RLS）
- 新規：プッシュ送信の Edge Function / Route Handler、`notify-*` との統合
- `src/locales/*/translation.json`（4言語）、`src/app/manifest.ts`（必要なら通知アイコン）
- 関連REQ: REQ-234（メールのライフサイクル通知＝チャネルの相方）・REQ-211（VAPID 秘密鍵の管理）・REQ-218（配信の暴走防止）・REQ-185 等（Service Worker 共有）

## 優先度
- **緊急度**: Low / **重要度**: Medium
- **理由**: メール（REQ-234）があるため必須ではないが、Web Push は即時性・再訪率でメールを補完し、休眠復帰と継続に効く。PWA/Service Worker の土台が既にあるため追加コストは中程度。iOS 制約やシークレット管理（VAPID）に注意が必要なため、メール（REQ-234）の後続として位置づける。
