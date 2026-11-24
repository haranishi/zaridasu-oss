## 要件

### 機能要件
- [ ] FR-145-01: `src/locales/{ja,en,zh,ko}/translation.json` を `public/locales/{ja,en,zh,ko}/translation.json` に移動するか、`src/app/api/locales/[lang]/route.ts` でハンドラ配信する。Next.js 15 App Router での経路は以下のいずれか：
  - **案 A**: ファイルを `public/locales/` へ移動し、`i18next-http-backend` で `loadPath: '/locales/{{lng}}/translation.json'` を指定（静的配信、CDN にキャッシュ可）。
  - **案 B**: API ルートで配信し `Cache-Control: public, max-age=86400, immutable` を付ける。
  - **案 C**: コード分割案として `const loadLocale = async (lng: string) => (await import(\`@/locales/${lng}/translation.json\`)).default` で動的 import。Next.js が言語ごとに別 chunk を生成するので、追加 fetch URL を露出せず Webpack chunk-graph に任せられる。
  - 実装簡易度・キャッシュ性から**案 A を第一候補**とし、不可なら案 C にフォールバック。
- [ ] FR-145-02: `src/lib/i18n.ts` を書き換え：
  - 初期言語 1 つだけ resources に渡す。
  - `changeLanguage` 呼び出し時に未ロード言語を遅延 fetch して addResourceBundle する。
  - 案 A 採用時は `i18next-http-backend` を `i18n.use(HttpBackend)` で導入。
- [ ] FR-145-03: 初期言語の決定ロジックを SSR にも導入：
  - `middleware.ts` で `Accept-Language` を見て `cookie: zaridasu_lang` を発行（既存の LocalStorage 'zaridasu_lang' と一貫性を取る）。
  - Server Component（`src/app/layout.tsx`）で `cookies().get('zaridasu_lang')` を読み、`<html lang="...">` に反映。
  - Client 側 i18n は cookie / localStorage / navigator の順で初期言語を決定する。
- [ ] FR-145-04: SSR 側で必要言語だけを `getInitialResources(lang)` で読み（Server-only utility を `src/lib/i18n/server.ts` 等に切り出し）、`<script>` で `window.__INITIAL_I18N__ = { lang, resources }` に埋め込む、または案 A の場合は HTTP backend が自動 fetch するので不要。**選択した案に合わせて整理**。
- [ ] FR-145-05: 言語切替 UI（既存 `LanguageSwitcher` 系）で `i18n.changeLanguage(lng)` を呼んだ際、未ロード言語の場合に loader / suspense / トースト等で fetch 待ちを許容する UX を組む（既存 component を編集）。
- [ ] FR-145-06: `.size-limit.json` に i18n リソース監視を追加：
  - `i18n initial locale (gzip)`: 個別言語 JSON 1 ファイルぶんを 20 KB 以下（gzip）に維持。
  - `i18n total bundled (gzip)`: client bundle に乗る翻訳合計を 25 KB 以下（gzip）に制限（=「初期は ja のみ、他は遅延」を強制）。
- [ ] FR-145-07: `npm run analyze` で初期 chunk に zh / ko / en の翻訳が含まれないことを確認、結果をレポートに残す。

### 非機能要件
- [ ] NFR-145-01: 言語切替時の翻訳取得は < 300 ms（4G 同等回線）。
- [ ] NFR-145-02: 既存 `react-i18next` API（`useTranslation`, `t(...)`）の使用箇所は無改修で動作すること。
- [ ] NFR-145-03: dev で `saveMissing` / `missingKeyHandler`（REQ-114）の挙動を維持。
- [ ] NFR-145-04: SSR で言語が一致しない場合のハイドレーション警告を出さない（`<html lang>` と client 初期言語が一致）。
