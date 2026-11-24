## 影響範囲

**本 REQ が担う範囲（行動イベントの設計・実装＋計測仕様書）:**
- `src/lib/analytics.ts`（新規・汎用 `trackEvent`）、`src/lib/lpAnalytics.ts`（`trackEvent` への寄せ）、`src/types/gtm.d.ts`（型一本化）
- 投稿: `src/hooks/usePostForm.ts`（`handleFileChange`/`submitPost`/`saveOffline`）、`src/app/(home)/HomeInteractive.tsx`（`handlePostClick`/`onSurveyClick`/`onBoundsChange`/`MapGalleryPager`）、`src/components/features/posts/PostForm.tsx`（必要に応じ開始計測）
- エンゲージ: `src/hooks/useLike.ts`、`src/components/features/posts/CommentSection.tsx`、`src/components/modals/ReportModal.tsx`、`src/views/DetailPage.tsx`（AI 判定カード）
- 地図/検索/ギャラリー: `src/components/features/dashboard/FilterBar.tsx`（検索）、`HomeInteractive.tsx`（MapGalleryPager/bounds）
- 調査依頼: `src/components/modals/SurveyRequestForm.tsx`
- 認証（リファクタのみ・挙動不変）: `src/components/modals/AuthModal.tsx`、`src/views/AuthCallbackPage.tsx`、`src/components/common/WebVitalsReporter.tsx`
- GA4 / GTM 設定（IaC 化不可）: キーイベント化・カスタムディメンション登録・DebugView 検証＝runbook/チェックリストで管理

**本 REQ が担わない範囲（重複回避・境界）:**
- `sign_up`/`login` の**正確性ロジック**（created_at による新規/既存判別）は **REQ-033** が主管。本 REQ は送出口を `trackEvent` に寄せるのみで挙動を変えない。
- **計測ツールの統一**（Vercel Analytics 撤去・GA4 一本化）は **REQ-107** で完了済み。本 REQ は新経路を増やさず既存 GTM 経路に乗せる。
- **LP（/lp）の計測**（`lp_view`/`lp_scroll`/`lp_cta_*`/`lp_faq_open`）は **REQ-176** が主管。本 REQ は `lpAnalytics` を `trackEvent` に一般化するが LP イベント定義は変更しない。
- **プライバシー/同意計測**（検索語や識別子の扱い、Consent Mode、IP/位置の匿名化方針）は **REQ-233** と連携。本 REQ は「PII を送らない」原則と縮退オプションを定義し、同意基盤の実装は REQ-233 側で受ける。
- **卒研 KPI ダッシュボード**（本 REQ のイベントを用いた集計・可視化）は **REQ-233/関連 KPI REQ** が消費側。本 REQ はイベントの発生源とスキーマ（tracking plan）を提供する。

**他機能への影響リスク:**
- 計測コードはユーザー操作の主経路（投稿・いいね・通報・調査依頼）に挿入されるため、`dataLayer.push` 失敗や例外が**本来の処理を止めないこと**（try 内に閉じる/no-op 設計）が必須。特に `submitPost`/`createRequest` の成功判定の手前で投げないよう注意。
- 高頻度イベント（`map_interact`）の間引き不足は GA4 のイベント上限・課金とノイズに直結するため、デバウンス実装を必ず入れる。
