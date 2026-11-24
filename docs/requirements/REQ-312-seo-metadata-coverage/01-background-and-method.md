## 背景

`alternates.canonical` は indexable な全ページに自己参照で入っており（`src/app/` 配下に17箇所）、sitemap × robots × canonical の整合は REQ-275 で回復済みで退行もない。**残っているのは「共有カード（og / twitter）の情報がページ単位になっていない」という一群の欠陥**である。

Next.js App Router の metadata は `openGraph` / `twitter` を**トップレベルのキー単位で浅くマージ（shallow merge）する**。すなわち

- 子が `openGraph` を**定義しなければ**、親（root layout）の openGraph が**丸ごと**継承される（→ 問題A）
- 子が `openGraph` を**部分的に定義すると**、親の残りのフィールドは**引き継がれず消える**（→ 問題B）

この挙動はリポジトリ内で既に明文化されている。`src/app/lp/page.tsx:18-21`:

```
// REQ-181: Next.js の metadata は openGraph/twitter をトップレベル単位で浅くマージするため、
// 子(LP)で openGraph を定義すると親(root layout)の images/type/siteName/locale が丸ごと消える。
// shallow merge で失われる値を明示的に再指定し、SNS/広告共有時のカードを正しく出力する。
```

LP はこの注意書きどおり `type` / `siteName` / `locale` / `title` / `description` / `url` / `images` を全て再指定している（`lp/page.tsx:23-31`）。**同じ知見が他のページに展開されていない**のが本REQの問題である。

### 検証方法（本REQの根拠）

以下の記述は、コード読解に加えて**ローカルビルド成果物 `.next/server/app/*.html`（BUILD_ID 2026-07-29 10:13、HEAD 89495e9 の直前ビルド。以降のコミットは `supabase/functions/deno.lock` のみでメタデータ生成コードは不変）から実際に出力された `<meta>` タグを抽出して確認**している。og:url のホスト部はそのビルドの `NEXT_PUBLIC_APP_URL` に依存するため、以下では「サイトルート（`/`）」と表記する。
