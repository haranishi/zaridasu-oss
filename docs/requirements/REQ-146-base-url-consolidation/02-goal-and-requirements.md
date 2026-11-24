## 目的

- `BASE_URL` の参照箇所を **`src/lib/constants.ts`（または `src/lib/url.ts` 等の URL 専用モジュール）の単一定義** に集約する。
- 将来のドメイン変更時に 1 箇所の編集だけで全体反映できる構造にする。
- `process.env.NEXT_PUBLIC_APP_URL` を直接参照する箇所を lint で検出可能にする（任意、優先度低）。

## 要件

### 機能要件
- [ ] FR-146-01: `src/lib/constants.ts` の `BASE_URL` を**Server-safe**に書き換える、または `src/lib/url.ts` に**Server-only な BASE_URL**を別途定義する。
  - 推奨：`src/lib/constants.ts` の `BASE_URL` は SSR でも client でも安全な式に統一：
    ```ts
    export const BASE_URL: string =
      process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'
    ```
    （`window.location.origin` フォールバックは別 helper `getRuntimeOrigin()` として切り出す。SSR で使う箇所は環境変数 / リテラルにフォールバックする現挙動を維持。）
- [ ] FR-146-02: 以下 7 箇所をすべて `import { BASE_URL } from '@/lib/constants'` に統一：
  - `src/app/robots.ts:4` → `sitemap: \`${BASE_URL}/sitemap.xml\``
  - `src/app/sitemap.ts:5` → ローカル `const BASE_URL` を削除し import に置換
  - `src/app/layout.tsx:15` → `metadataBase: new URL(BASE_URL)`
  - `src/app/layout.tsx:52` → `const siteUrl = BASE_URL`（または直接 `BASE_URL` を使う）
  - `src/app/area/page.tsx:41-42` → JSON-LD 内のテンプレートリテラルを `\`${BASE_URL}/\``、`\`${BASE_URL}/area\`` に置換
  - `src/app/area/[municipality]/page.tsx:8` → ローカル `const BASE_URL` を削除し import に置換
- [ ] FR-146-03: 置換後の挙動が変わらないこと。**特に末尾スラッシュの有無に注意**（`new URL(BASE_URL)` 等で trailing `/` の扱いが変わるとカノニカル URL がズレる）。BASE_URL の末尾スラッシュポリシーをコメントで明記する。
- [ ] FR-146-04（任意）: `eslint-plugin-no-restricted-syntax` または `no-restricted-properties` で `process.env.NEXT_PUBLIC_APP_URL` の直接参照を禁止する ESLint ルールを `eslint.config.mjs` に追加し、`src/lib/constants.ts` を allowlist する：
  ```js
  {
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='NEXT_PUBLIC_APP_URL']",
        message: '直接参照禁止。@/lib/constants の BASE_URL を使ってください。'
      }]
    }
  }
  ```
  - constants.ts に対しては `overrides` で例外設定。
- [ ] FR-146-05（任意）: 同様に散らばっている他の URL / ドメインリテラル（`zaridasu.com` の直書きなど）を grep し、ある場合は 0〜1 件以内なら本 REQ で同時整理、それ以上なら別 REQ にスピンオフする。
- [ ] FR-146-06: README / docs 内に環境変数 `NEXT_PUBLIC_APP_URL` の役割（プロダクション URL 設定）を 1 行追記（既存ドキュメントがあれば更新のみ）。

### 非機能要件
- [ ] NFR-146-01: 変更による振る舞いの変化は基本的に**ゼロ**（純粋なリファクタ）。
- [ ] NFR-146-02: 型エラー / lint エラー / build エラーゼロ。
- [ ] NFR-146-03: Server Component / Client Component / API ルート すべてで `BASE_URL` が SSR-safe（`window` 未定義環境で評価エラーにならない）。

