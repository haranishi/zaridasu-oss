## 3. パフォーマンス確認

| # | 確認項目 | ツール | 目標値 | OK |
|---|---------|-------|--------|-----|
| 1 | Lighthouse Performance | Chrome DevTools → Lighthouse | モバイル 70+ | [ ] |
| 2 | LCP | Lighthouse | 2.5秒以下 | [ ] |
| 3 | CLS | Lighthouse | 0.1以下 | [ ] |
| 4 | バンドルサイズ | `npm run build` 出力 | 前回比でFirst Load JS削減 | [ ] |

---

## 4. 変更ファイル一覧

### 新規作成ファイル
- `supabase/migrations/001_rls_and_audit_triggers.sql`
- `supabase/migrations/002_dashboard_stats_rpc.sql`
- `src/types/leaflet.heat.d.ts`
- `src/components/ui/ErrorAlert.tsx`
- `src/components/ui/LoadingButton.tsx`
- `src/components/features/posts/PhotoUploadSection.tsx`
- `src/components/features/posts/WeatherSelector.tsx`
- `src/components/features/posts/LocationSection.tsx`
- `src/hooks/useAdminSessionTimeout.ts`
- `.env.example`

### 削除ファイル
- `src/lib/rpcThrottle.ts`

### 主な変更ファイル
- `src/components/features/posts/PostForm.tsx` (702行→391行 リファクタ)
- `src/components/features/map/MapView.tsx` (型安全性、動的import、AKITA_BOUNDS)
- `src/components/modals/AuthModal.tsx` (パスワード要件、ErrorAlert、メール検証)
- `src/views/admin/AdminLoginPage.tsx` (レート制限、ErrorAlert/LoadingButton)
- `src/lib/supabase/middleware.ts` (SameSite Cookie)
- `src/app/layout.tsx` (preconnect)
- `src/hooks/useStats.ts` (RPC化)
- `src/locales/*/translation.json` (47キー追加 × 4言語)
- その他多数（詳細は各REQの要件定義書を参照）
