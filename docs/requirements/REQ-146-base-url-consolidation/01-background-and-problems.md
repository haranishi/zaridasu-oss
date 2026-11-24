## 背景

サイトのベース URL を構築する式 `process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'` が、`src/lib/constants.ts` の `BASE_URL` export とは別に **7 箇所のソースコードに直接コピペされて散在**している。

```
$ grep -rn "NEXT_PUBLIC_APP_URL" src/
src/lib/constants.ts:4:        ← BASE_URL の定義（正規）
src/app/layout.tsx:15:         ← metadataBase
src/app/layout.tsx:52:         ← const siteUrl
src/app/sitemap.ts:5:          ← const BASE_URL (重複)
src/app/robots.ts:4:           ← const baseUrl (重複)
src/app/area/page.tsx:41:      ← JSON-LD item (inline)
src/app/area/page.tsx:42:      ← JSON-LD item (inline)
src/app/area/[municipality]/page.tsx:8:  ← const BASE_URL (重複)
```

`src/lib/constants.ts:4-5` には既に正規定義がある：
```ts
export const BASE_URL: string = process.env.NEXT_PUBLIC_APP_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'https://zaridasu.com')
```

しかし他 7 箇所では `process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'` を**直接書いており**、`window.location.origin` のフォールバックも持たないため挙動が微妙に異なる（Server-only コンテキストでは問題ないが、Cookie 環境変更時にズレるリスクがある）。

将来ドメイン変更や追加環境（preview / staging）対応時、7 箇所すべてを更新する必要があり、漏れリスクが高い。REQ-030（DRY コード品質）の延長として整理する。

## 現状の問題

### 1. 重複定義（7 箇所）
| ファイル | 行 | 文脈 |
|---|---|---|
| `src/app/robots.ts` | 4 | `const baseUrl = process.env... \|\| 'https://zaridasu.com'` |
| `src/app/sitemap.ts` | 5 | `const BASE_URL = process.env... \|\| 'https://zaridasu.com'` |
| `src/app/layout.tsx` | 15 | `metadataBase: new URL(process.env... \|\| 'https://zaridasu.com')` |
| `src/app/layout.tsx` | 52 | `const siteUrl = process.env... \|\| 'https://zaridasu.com'` |
| `src/app/area/page.tsx` | 41 | JSON-LD `item` 文字列内に inline 展開 |
| `src/app/area/page.tsx` | 42 | 同上 |
| `src/app/area/[municipality]/page.tsx` | 8 | `const BASE_URL = process.env... \|\| 'https://zaridasu.com'` |

### 2. constants.ts の BASE_URL を使っていない
- `src/lib/constants.ts` の `BASE_URL` は `window.location.origin` フォールバック付きで「より気の利いた」フォールバックだが、`'use server'`/Server Component で `window` を参照するとビルドエラーになる懸念があり、安全のため SSR/Server Component で使うには「Server-safe な BASE_URL」を別 export として用意するか、`typeof window !== 'undefined'` の分岐が SSR で `false` 評価されるのを確認する必要がある。

### 3. `'https://zaridasu.com'` フォールバック文字列の散在
- 7 箇所すべてに `'https://zaridasu.com'` がリテラルで書かれている。
- 環境変数未設定時のフォールバック先を変更する場合に全箇所書き換えが必要。

### 4. lint 検出機構がない
- 同様の重複を将来的に再導入してしまうのを防ぐ lint ルールがない。

