## 要件

### 機能要件
- [ ] FR-143-01: Postgres 関数 `public.get_municipality_post_counts()` を作成する。
  ```sql
  CREATE OR REPLACE FUNCTION public.get_municipality_post_counts()
  RETURNS TABLE (municipality text, count bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
  AS $$
    SELECT municipality, count(*)::bigint
    FROM posts
    WHERE status = 'approved' AND municipality IS NOT NULL
    GROUP BY municipality
    ORDER BY count DESC;
  $$;
  ```
  - `SECURITY INVOKER`：呼び出し元の RLS を尊重する（`/area` は anon でも閲覧可能なため、approved 行に対する anon SELECT の RLS ポリシーが既存で許可されている前提に依存）。
- [ ] FR-143-02: マイグレーションファイルを `supabase/migrations/<timestamp>_area_municipality_counts_rpc.sql` として追加し、`supabase/schema.sql` にも反映する。
- [ ] FR-143-03: `src/app/area/page.tsx` の集計ロジックを `supabase.rpc('get_municipality_post_counts')` に置き換える：
  ```ts
  const { data: counts } = await supabase.rpc('get_municipality_post_counts')
  const countMap = new Map<string, number>(
    (counts ?? []).map((row) => [row.municipality, Number(row.count)])
  )
  const municipalities = MUNICIPALITY_DATA.map((m) => ({
    ...m,
    postCount: countMap.get(m.name) ?? 0,
  })).sort((a, b) => b.postCount - a.postCount)
  ```
- [ ] FR-143-04: `revalidate = 3600` の ISR を維持する（変更不要）。RPC 側で `STABLE` 宣言してあるため Supabase / PostgREST のレベルでの最適化も享受できる。
- [ ] FR-143-05: Supabase の型ジェネレーション（`Database` 型 / `src/types/database.types.ts` 等）を再生成して、RPC のレスポンス型を保証する。
- [ ] FR-143-06: 複合インデックスの最適化検討：
  - 必要であれば `CREATE INDEX IF NOT EXISTS idx_posts_status_municipality ON posts (status, municipality) WHERE status = 'approved' AND municipality IS NOT NULL;` 部分インデックスを追加する。
  - 既存の `idx_posts_municipality` / `idx_posts_status` がカバーする範囲を `EXPLAIN ANALYZE` で確認した上で判断（過剰追加は INSERT/UPDATE コストを増やすため）。
- [ ] FR-143-07:（任意 / フォローアップ）将来的に approved 投稿が **数十万行** 規模になった場合、materialized view + `pg_cron` で 5〜10 分ごとに refresh する案を検討する。本 REQ では実装範囲外として記載のみ。

### 非機能要件
- [ ] NFR-143-01: approved 投稿 10,000 行を仮置きしたデータで `/area` の SSR 応答が 200ms 以内（ローカル / Preview env で計測）。
- [ ] NFR-143-02: RPC のレスポンスサイズは「市区町村数 × 数十バイト」に収まる（25 市町村なら数 KB 未満）。
- [ ] NFR-143-03: RLS 違反による空配列・誤集計が発生しない。anonymous ユーザーで approved 集計が現状と一致する。
- [ ] NFR-143-04: RPC の権限：anon と authenticated に EXECUTE を許可する（`GRANT EXECUTE ON FUNCTION public.get_municipality_post_counts() TO anon, authenticated;`）。
