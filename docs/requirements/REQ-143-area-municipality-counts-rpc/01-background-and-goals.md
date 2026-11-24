> 関連 REQ: REQ-032（データ取得効率化）/ REQ-010（admin stats 最適化）/ REQ-103（select-star 全廃）

## 背景
`/area` ページ（市区町村一覧）は、表示のたびに `posts` テーブルから approved 投稿の `municipality` 列を **全件** 取得し、JavaScript 側で `for ループ` を回して集計している。
現状は `revalidate = 3600` の ISR でキャッシュは効いているものの、再生成時に全 approved 行をネットワーク越しに取り、Node ランタイム上で集計するため、データ量増加に対してスケールしない。
集計は典型的な `SELECT municipality, COUNT(*) FROM posts WHERE status='approved' GROUP BY municipality` であり、Postgres 側で実行すべき処理。

## 現状の問題
- `src/app/area/page.tsx:19-30`：
  ```ts
  const { data: posts } = await supabase
    .from('posts')
    .select('municipality')
    .eq('status', 'approved')
    .not('municipality', 'is', null)

  const countMap: Record<string, number> = {}
  for (const p of posts || []) {
    if (p.municipality) {
      countMap[p.municipality] = (countMap[p.municipality] || 0) + 1
    }
  }
  ```
- approved 行数が数千〜数万に増えると、1 行ずつ TEXT カラムを返してきて Node 側で集計する設計は明らかに非効率。
- Supabase の row limit（デフォルト 1000）に到達すると、`municipality=NULL` などのフィルタ漏れでなく **集計値そのものが壊れる** リスクがある（現状未確認だが、明示的な `range()` 指定もない）。
- `revalidate=3600` の ISR でキャッシュされてはいるが、再生成 build や on-demand revalidate のたびに全件 fetch + ループ実行。
- 既存インデックス：
  - `idx_posts_municipality (municipality)`
  - `idx_posts_status (status)`
  - `idx_posts_status_created (status, created_at DESC)`
  - `idx_posts_municipality_species_created (municipality, species, created_at DESC)`
  - approved 集計に最適化された `(status, municipality)` 複合インデックスは未定義。

## 目的
- 市区町村別の approved 投稿カウントを Postgres 側 SQL で集計し、RPC で取得する。
- ネットワーク転送量を「行データ全件」→「集計済み市区町村数 × 数十バイト」に圧縮する。
- 投稿数が増えても応答時間が概ね一定になる設計に移行する。
