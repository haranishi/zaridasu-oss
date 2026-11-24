## 影響範囲

### 変更対象ファイル
- `src/lib/i18n.ts`（中核改修）
- `src/lib/i18n/server.ts` または `src/lib/i18n/loadLocale.ts`（新規 utility）
- `src/locales/{ja,en,zh,ko}/translation.json` → `public/locales/...` への移動（案 A 採用時）
- `src/middleware.ts`（Accept-Language → cookie ハンドオフ）
- `src/app/layout.tsx`（`<html lang>` を cookie 駆動に）
- `src/components/`（既存 LanguageSwitcher / 言語切替 UI、必要に応じて loading 状態追加）
- `package.json`（案 A 採用時、`i18next-http-backend` 追加）
- `.size-limit.json`
- 新規テスト群

### 影響しないこと
- 翻訳キーの内容（既存の `t()` 呼び出し）
- Server Component 側の文言（既に SSR 時 ja 固定だったため、cookie 駆動化で en/zh/ko ユーザーは正しい言語の HTML を受け取れるようになる＝改善方向のみ）
- DB / RLS / Edge Functions

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: i18n は機能としては動いているが、共通バンドルに 50-60 KB（gzip 後）の固定オーバーヘッドが乗っている状態。REQ-024 / REQ-114 で翻訳キー数が増えるほど効きが悪化する構造。REQ-124 の First Load JS 予算（ホーム 250 KB）を達成するためには、i18n 分割が最も効率の良いレバーの一つ。一方で middleware / SSR / cookie の連携が必要で工数は中程度。導入後の劣化は size-limit で監視できる。
