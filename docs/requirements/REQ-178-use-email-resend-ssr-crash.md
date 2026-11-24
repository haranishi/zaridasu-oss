# REQ-178: `useEmailResend` がフック本体で `localStorage` を直接参照し `/post/[id]` の SSR をクラッシュさせる

## 背景

REQ-140 で投稿詳細ページ `/post/[id]` は、サーバーコンポーネント（RSC）で投稿本体・コメント・いいねを 1 リクエストにまとめて取得し、初期 HTML を SSR する設計になった（`src/app/post/[id]/page.tsx`）。これにより本文・コメントが初回 HTML に含まれ、SEO とファーストビューが改善されるはずだった。

しかし、投稿詳細の子コンポーネント `CommentSection` / `LikeShareSection` が共有フック `useEmailResend` を呼び出しており、このフックがレンダー中（＝サーバー実行時）にブラウザ専用 API `localStorage` を `typeof window` ガードなしで参照している。RSC のサーバーレンダリング時に `localStorage is not defined` の `ReferenceError` が発生し、SSR が失敗する。

## 現状の問題

（ファイルパス:行番号つき）

1. **フック本体（レンダー中）で `localStorage.getItem` を無ガードで実行**
   - `src/hooks/useEmailResend.ts:21-23`：
     ```ts
     const stored = localStorage.getItem(COOLDOWN_KEY)
     const cooldownUntil = stored ? Number(stored) : 0
     const resendCooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
     ```
     これは `useEffect` 内ではなく**フックのトップレベル（毎レンダーで実行される本体）**にあり、サーバー実行時に `localStorage` が未定義のため `ReferenceError: localStorage is not defined` を投げる。
   - 同フックの `resendEmail` 内 `src/hooks/useEmailResend.ts:40` でも `localStorage.setItem` を使うが、こちらはユーザー操作（クリック）時のみ＝クライアント実行のため SSR では問題にならない。問題はあくまで本体の `getItem`。

2. **この壊れたフックが SSR 対象の投稿詳細から到達される**
   - `src/components/features/posts/CommentSection.tsx:14,46`：`'use client'`（同ファイル:1）ながら、`/post/[id]` の初期 HTML 生成時にサーバーで一度レンダーされる過程でフックが評価される。
   - `src/components/features/posts/LikeShareSection.tsx:6,46`：同様に `useEmailResend()` を呼ぶ。
   - `src/app/post/[id]/page.tsx:99-126` は `DetailPageClient` に `initialPost` / `initialComments` / `initialLikes` を渡して SSR させる（REQ-140 の RSC シード）。この経路で上記コンポーネント → フック本体の `localStorage` 参照に到達する。
   - 監査時に digest `1549428254` のサーバーエラーとして実測。

3. **症状: SSR が loading フォールバックのみになり、SEO/SSR 改善が無効化**
   - RSC レンダリングが例外で打ち切られ、`src/app/post/[id]/loading.tsx` 相当のフォールバックのみが初期 HTML として返る。REQ-140 が意図した「本文・コメントを含む SSR HTML」が得られず、SEO 改善が成立しない。
   - さらに**投稿詳細を 1 回開くたびにサーバーログへ `ReferenceError` が記録**され、エラーログのノイズと監視の信頼性低下を招く。

4. **`EmailVerificationBanner` も同フックを使用するが SSR 経路ではない**
   - `src/components/features/dashboard/EmailVerificationBanner.tsx:1,10` でも `useEmailResend()` を呼ぶが、ダッシュボードは middleware 保護下のクライアント描画であり、本不具合の主経路ではない。ただし**フック自体を直せば 3 つの利用箇所すべてが同時に堅牢化**される。

## 目的

`useEmailResend` をサーバー・クライアント双方で安全に評価できるようにし、`/post/[id]` の SSR が REQ-140 の意図どおり本文・コメントを含む HTML を返し、投稿閲覧時にサーバーエラーが記録されない状態にする。

## 要件

### 機能要件

- [ ] FR-178-01: `useEmailResend` のクールダウン初期値読み取りを、レンダー本体での直接 `localStorage.getItem` から、`useState` の遅延初期化（initializer 関数）へ移す。initializer 内で `typeof window === 'undefined'` を判定し、サーバー時は安全な既定値（クールダウンなし）を返す。
- [ ] FR-178-02: `localStorage` アクセス（`getItem` / `setItem`）を `typeof window !== 'undefined'` ガードかつ `try/catch` で囲み、`localStorage` が無効・例外時（プライベートモード等）でも機能の主要部（再送信自体）が動作するようにする。`getItem` 失敗時はクールダウン 0 として扱う。
- [ ] FR-178-03: クールダウン残秒数 `resendCooldownSec` の算出ロジック（`src/hooks/useEmailResend.ts:21-23` 相当）と 1 秒ごとの更新（`useEffect` + `setInterval`、同:25-29）の挙動は現状を維持する。再送信成功時に `RESEND_COOLDOWN_MS` で次回可能時刻を保存する挙動（同:39-41）も維持する。
- [ ] FR-178-04: フックの公開インターフェース `UseEmailResendResult`（`resendEmail` / `resendLoading` / `resendCooldownSec` / `resendMessage` / `resendError`、同:7-13）は変更しない。3 つの呼び出し側（`CommentSection` / `LikeShareSection` / `EmailVerificationBanner`）の改修を不要にする。

### 非機能要件

- [ ] NFR-178-01: クライアントでの挙動（初回マウント後にクールダウン残秒が正しく表示され、カウントダウンが進む）が SSR 化により後退しないこと。ハイドレーション不整合の警告を出さないこと（サーバーは常にクールダウン 0 でレンダーし、クライアントで `localStorage` 値に補正する設計を許容する）。

## 受入条件

- [ ] AC-01: `npm run build && npm run start` の後、承認済み投稿に対して `curl -s http://localhost:3000/post/<承認済みID>` を実行すると、レスポンス HTML に**投稿本文（`comment` の文言）が含まれる**（loading フォールバックのみではない）。
- [ ] AC-02: 上記 `curl` の実行中・実行後に、サーバーログ（`npm run start` の標準出力）へ `ReferenceError: localStorage is not defined` が**出力されない**。
- [ ] AC-03: ブラウザで投稿詳細を開き、メール未確認状態で再送信ボタンを押すと、従来どおりクールダウンが開始しカウントダウン表示される。再読み込み後もクールダウン残時間が `localStorage` から復元される。
- [ ] AC-04: プライベートブラウジング等で `localStorage` が例外を投げる状況でも、再送信操作自体は実行でき、アプリがクラッシュしない（`try/catch` のフォールバックが効く）。

## 影響範囲

**変更対象ファイル:**
- `src/hooks/useEmailResend.ts`（本体修正。これ 1 ファイルで完結する想定）

**他機能への影響（呼び出し側・改修不要だが回帰確認対象）:**
- `src/components/features/posts/CommentSection.tsx`
- `src/components/features/posts/LikeShareSection.tsx`
- `src/components/features/dashboard/EmailVerificationBanner.tsx`
- `src/app/post/[id]/page.tsx`（SSR が正常化することの確認対象。コード変更なし）

## 関連・補足
- **`AuthModal` のクールダウン二重実装**: 認証モーダル側にも再送信クールダウンの独自実装が存在する（`useEmailResend` への統合余地あり）。本 REQ では `localStorage` の SSR クラッシュ修正に範囲を限定し、クールダウンロジックの一元化は **REQ-209 で別途扱う**（ここでは言及のみ）。

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: REQ-140 で実装した投稿詳細の SSR/SEO 改善が**実質的に無効化**されており、かつ投稿が閲覧されるたびにサーバーエラーが記録される（監視ノイズ・パフォーマンス劣化）。投稿詳細は検索流入・SNS シェアの主要着地点であり影響が大きい。修正は単一フックの局所変更で、インターフェース不変・低リスク。
