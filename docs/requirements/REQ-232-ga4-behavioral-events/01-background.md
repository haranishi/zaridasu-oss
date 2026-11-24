## 背景

ザリダス（秋田県の外来生物＝アメリカザリガニ／ウシガエルの市民科学情報マップ、卒研 PF）は Next.js 15 App Router + Supabase SSR + Vercel 構成で、GTM 経由で GA4 を導入済み（`src/app/layout.tsx:65-77` で `NEXT_PUBLIC_GTM_ID` があれば GTM スニペットを `afterInteractive` で注入、`:138-144` に noscript）。計測経路は **GTM 1 系統に統一されており**（Vercel Analytics は REQ-107 で撤去済み）、`window.dataLayer.push()` でイベントを送る形が確立している。

現状、実装済みの計測イベントは以下に限られる（実コード棚卸し: `grep -rn "dataLayer\|gtag\|sendGAEvent\|pushLpEvent" src`）：

- **LP（/lp）系**: `src/lib/lpAnalytics.ts:8-13` の `pushLpEvent()` が `lp_view`/`lp_scroll`/`lp_cta_signup`/`lp_cta_map`/`lp_faq_open` を送出（`src/views/LandingPage.tsx:138,148,184,196,234,548,650`）。production 限定ガード付き。
- **Web Vitals**: `src/components/common/WebVitalsReporter.tsx:12-27` が `web_vital` イベントを送出。
- **認証**: `login`（`AuthModal.tsx:130-133`）/ `sign_up_initiated`（`AuthModal.tsx:173-177`）/ `sign_up`・`login`（`AuthCallbackPage.tsx:53-79`、created_at で新規/既存を判別＝REQ-033）。

一方で、**市民科学の参加ファネルの中核である行動イベントは一切計測されていない**。具体的には、投稿フロー（フォーム開始→写真添付→送信→成功）、地図操作、写真ギャラリー閲覧、調査依頼の送信、いいね、コメント投稿、通報のいずれも `dataLayer.push` を持たない（後述の各ファイルに計測呼び出しが存在しないことを確認）。GA4 拡張計測の `page_view` だけでは「マップを見たユーザーのうち何割が投稿を開始し、何割が完了したか」「調査依頼がどれだけ生まれたか」といった**卒研の KPI（参加率・投稿転換率・エンゲージ率）を測れない**。

本 REQ は Obsidian `02_notes/実務ガイド/GA4設定とコンバージョン設定 実務ガイド.md` を下敷きにする。同ガイドの要点：

- GA4 の旧「コンバージョン」は **キーイベント（Key events）** に名称変更された（同ガイド冒頭 `:11-14`, `:192-205`）。重要アクションを「キーイベント化」することで卒研 KPI と Google 広告（将来）に橋渡しできる。
- **推奨イベント**（名前固定: `sign_up`/`login`/`search`/`generate_lead` 等）をまず使い、該当が無いときだけカスタムイベントにする（同ガイド `:208-210`）。カスタムパラメータは **カスタムディメンション/指標として登録しないとレポートに出ない**（同 `:210`）。
- **二重計上の最頻出原因**は「拡張計測の `page_view` と手動 `page_view` の併走」「1 プロパティに複数の実装経路」（同 `:181-188`）。ザリダスは GTM 1 経路で `page_view` を拡張計測に任せているため、**本 REQ で追加するのは行動イベントのみ**とし `page_view` を手動送出しない。
- Next.js App Router の公式推奨は `@next/third-parties` の `sendGAEvent`（同 `:108-139`）。ただしザリダスは既に GTM 経由 dataLayer パターンが全社的に確立しているため、本 REQ は**そのパターンを一般化する方針**を採る（後述 FR-232-01 の論点）。
- キーイベントの**カウント方法は「イベントごと（once per event）」**が既定で、参加アクション（投稿・調査依頼）には適切（同ガイド「カウント方法」節）。
