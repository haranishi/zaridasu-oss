# REQ-043: sitemap.ts に revalidate を設定

## 背景
`src/app/sitemap.ts` は Next.js App Router の動的 sitemap 生成ハンドラで、Supabase から投稿・調査依頼・公開ユーザープロフィールを最大計 2000 件クエリして XML を返す。再検証時間が明示されていないため、クローラーがアクセスするたびに Supabase へクエリが飛ぶ可能性がある。

## 現状の問題
- `src/app/sitemap.ts` には `export const revalidate` の宣言がない

```ts
// src/app/sitemap.ts:7-11
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

- `src/app/sitemap.ts:32-66` で `posts`（1000 件）、`survey_requests`（500 件）、`user_profiles`（500 件）を取得。全てキャッシュなしだとアクセスごとに DB 往復が発生
- 一方 `src/app/area/[municipality]/page.tsx:18` には `export const revalidate = 3600` が設定されており、サイト内で再検証戦略が非一貫

```ts
// src/app/area/[municipality]/page.tsx:18
export const revalidate = 3600
```

- 結果としてクローラーアクセス頻度に比例して Supabase コストが増え、レスポンスも遅くなる懸念

## 目的
sitemap 生成を ISR で 1 時間キャッシュし、Supabase への不要なクエリを削減、クローラーレスポンスを安定化させる。サイト全体の revalidate 戦略を揃える。

## 要件

### 機能要件
- [ ] FR-043-01: `src/app/sitemap.ts` に `export const revalidate = 3600` を追加する（1 時間）
- [ ] FR-043-02: 変更に伴い `sitemap` 関数のシグネチャは維持する（返り値型は `Promise<MetadataRoute.Sitemap>` のまま）
- [ ] FR-043-03: 将来的な値変更に備え、マジックナンバーを避けてコメントで「1 hour」などの注釈を付ける

### 非機能要件
- クローラーからのアクセスに対する p95 レスポンスタイム短縮（キャッシュヒット時）
- Supabase の sitemap 由来の read 数が日次で削減されること

## 受入条件
- [ ] AC-01: `npm run build` 後に `.next/server/app/sitemap.xml*` のメタデータ（`revalidate` 情報）で 3600 秒が確認できる
- [ ] AC-02: 本番相当環境で連続アクセス時、2 回目以降が ISR キャッシュヒット（レスポンスヘッダの `x-nextjs-cache: HIT` 等）する
- [ ] AC-03: 既存のビルド／テストが全て通過する
- [ ] AC-04: `src/app/area/[municipality]/page.tsx` との revalidate 値が揃っている（共に 3600）

## 影響範囲
- `src/app/sitemap.ts`

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: パフォーマンス／運用コストの最適化。機能不具合ではないが、小さな変更で DB クエリ負荷を大きく削減できるためコスパが良い。
