# REQ-006: Content-Security-Policy から script-src 'unsafe-inline' を除去

## 背景

`next.config.ts` で定義されているContent-Security-Policy（CSP）ヘッダーの `script-src` ディレクティブに `'unsafe-inline'` が本番環境でも含まれている。`'unsafe-inline'` はインラインスクリプトの実行を許可するため、XSS脆弱性が存在した場合の被害を大幅に拡大させる。特にREQ-005（JSON-LD XSS）と組み合わさると、CSPが防御層として機能しない。

## 現状の問題

- **`next.config.ts:32`**: `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com` と定義されている。`'unsafe-inline'` は `isDev` の条件分岐の外にあり、本番環境でも常に適用される。
- **`next.config.ts:34`**: `style-src 'self' 'unsafe-inline' https://unpkg.com` も `'unsafe-inline'` を含むが、これはLeafletの動的スタイル注入に必要とコメントで明記されている（style-srcのunsafe-inlineはscript-srcほどの危険性はない）。
- 本番環境での `script-src 'unsafe-inline'` は、CSPの主目的であるXSS緩和を事実上無効化する。攻撃者がHTML内にインラインスクリプトを注入できればそのまま実行される。

### 技術的背景

Next.jsはビルド時にインラインスクリプトを生成する（`__NEXT_DATA__` 等）。これに対応するため `'unsafe-inline'` を追加したと推定されるが、Next.js 13以降では `nonce` ベースのCSPがサポートされており、`'unsafe-inline'` は不要にできる。

## 目的

本番環境のCSPから `script-src 'unsafe-inline'` を除去し、`nonce` ベースまたは `strict-dynamic` ベースのCSPに移行することで、XSS攻撃に対する防御層を強化する。

## 要件

### 機能要件

- [ ] FR-006-01: Next.js の `nonce` サポートを利用し、`middleware.ts` でリクエストごとにランダムな nonce を生成してCSPヘッダーに挿入する仕組みを実装する。
- [ ] FR-006-02: `next.config.ts` の `script-src` から `'unsafe-inline'` を除去し、`'nonce-{random}'` に置き換える。
- [ ] FR-006-03: Google Tag Manager等の外部スクリプトが nonce ベースCSPの下で正常に動作することを確認する。
- [ ] FR-006-04: JSON-LDの `<script type="application/ld+json">` タグにも nonce 属性を付与する（または `strict-dynamic` を使用して伝播させる）。

### 非機能要件

- [ ] NFR-006-01: nonce の生成には暗号学的に安全な乱数生成器（`crypto.randomUUID()` 等）を使用すること。
- [ ] NFR-006-02: CSP違反が発生した場合のレポーティング先（`report-uri` または `report-to`）を設定し、意図しないブロックを検知可能にすること（段階的導入のため `Content-Security-Policy-Report-Only` での試行を推奨）。
- [ ] NFR-006-03: CSP変更によるページロード時間への影響が 50ms 以内に収まること。

## 受入条件

- [ ] AC-01: 本番ビルドのレスポンスヘッダーの `Content-Security-Policy` に `'unsafe-inline'` が含まれていないこと。
- [ ] AC-02: 本番環境で全ページが正常に表示され、コンソールにCSP違反エラーが発生しないこと。
- [ ] AC-03: Google Tag Manager が正常にロード・動作すること。
- [ ] AC-04: Leafletの地図が正常に表示されること（`style-src 'unsafe-inline'` は許容）。
- [ ] AC-05: `<script type="application/ld+json">` のJSON-LDが正常に出力されること。

## 影響範囲

- `next.config.ts` （CSPヘッダー定義の修正: L29-42）
- `src/middleware.ts` （新規作成または既存に nonce 生成ロジックを追加）
- `src/app/post/[id]/page.tsx` （JSON-LD script タグへの nonce 付与）
- `src/app/area/[municipality]/page.tsx` （JSON-LD script タグへの nonce 付与）
- `src/app/layout.tsx` （Google Tag Manager 等の外部スクリプトへの nonce 付与）

## 優先度

- **緊急度**: High
- **重要度**: Critical
- **理由**: `'unsafe-inline'` はCSPによるXSS防御を事実上無効化する。REQ-005のJSON-LD XSSと組み合わさるとCSPが防御層として全く機能しないため、XSS対策の多層防御に不可欠。ただし `nonce` 導入は広範囲の変更を伴うため、REQ-005の直接的なサニタイズ修正を先行させ、本件は段階的に実施することを推奨。

---

## ステータス更新（2026-05-08）

**無期限保留 / REQ-116 で判断記録済**

Next.js 15 の SSR インラインスクリプト（`__NEXT_DATA__`, chunk loading bootstrap）に対し `'unsafe-inline'` 除去は現状の `headers()` config では対応不能と判断した。詳細な判断記録および再検討条件は [REQ-116](./REQ-116-csp-unsafe-inline-decision.md) を参照。

XSS 緩和策は REQ-005（JSON-LD サニタイズ）/ サーバー側入力サニタイゼーション / React JSX エスケープの多層防御で対応済。
