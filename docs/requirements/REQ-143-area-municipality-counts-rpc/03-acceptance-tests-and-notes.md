## 受入条件
- [ ] AC-01: `supabase/migrations/` に当該マイグレーションが追加され、`supabase db reset` で正常に apply される。
- [ ] AC-02: ローカル `psql` で `SELECT * FROM public.get_municipality_post_counts();` を実行し、approved 行のみの集計結果が返る。
- [ ] AC-03: `/area` ページが現状と同じ市区町村並び順（postCount 降順）で表示される。
- [ ] AC-04: 投稿数 = 0 の市町村も `MUNICIPALITY_DATA` 由来で残り、`postCount: 0` で末尾に並ぶ（既存挙動の保持）。
- [ ] AC-05: DevTools / supabase log で `/area` 生成時の posts SELECT が消滅し、`rpc('get_municipality_post_counts')` 1 回のみ呼ばれている。
- [ ] AC-06: anon（未ログイン）と authenticated（一般ユーザー）で同一結果が返る。
- [ ] AC-07: `npm run build` / `npm run typecheck` / `npm test` が pass。

## テスト要件
- [ ] T-143-01: pg-tap / SQL テスト：fixture で approved/pending/rejected 行と municipality NULL 行を投入し、RPC の結果が「approved かつ municipality 非 NULL のみ」で集計されることを assert。
- [ ] T-143-02: pg-tap / SQL テスト：行数 0 件のときに RPC が空配列を返す（エラーにならない）。
- [ ] T-143-03: pg-tap / SQL テスト：anon ロールで EXECUTE 可能、かつ RLS（approved の anon SELECT）と整合する。
- [ ] T-143-04: Vitest（component）: `AreaListPage` を Server Component としてレンダーし、Supabase mock で `rpc('get_municipality_post_counts')` の呼び出しと結果整形を確認。
- [ ] T-143-05: Playwright（E2E）: `/area` を開いて市区町村カードが現状並び順で表示されること。supabase fixture で投稿数を制御し、降順ソートと postCount=0 末尾配置を assert。
- [ ] T-143-06: ベンチマーク：approved 5,000 行 fixture で before/after の RSC 生成時間 + レスポンスサイズを比較し、PR に記録する。

## 影響範囲
- `supabase/migrations/<timestamp>_area_municipality_counts_rpc.sql`（新規）
- `supabase/schema.sql`（RPC 定義を追記）
- `src/app/area/page.tsx`（集計ロジック差し替え）
- `src/types/database.types.ts` 等の自動生成型（Supabase CLI で再生成）
- （任意）`supabase/migrations/<timestamp>_posts_status_municipality_index.sql`（部分インデックス）
- Tests: `supabase/tests/` 配下（pg-tap）+ `src/__tests__/` + `tests/e2e/`

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 現時点では `revalidate=3600` のキャッシュで救われているが、approved 投稿数の増加に対して非線形にコストが増える設計上の負債。市区町村別ページは SEO 流入の入口になるため、将来のスケーラビリティに直結する。S 規模で副作用も限定的なので、早めの対応が望ましい。

## 実装メモ
- `SECURITY INVOKER` を選ぶ理由：anon でも閲覧可能な集計だが、approved 行に対する SELECT は既存 RLS で許可されているはず。RLS をバイパスしたい強い理由がなければ INVOKER で良い。仮にパフォーマンスのため `SECURITY DEFINER` を選ぶ場合は、関数の中で明示的に `status='approved'` フィルタが効いていることを再確認し、search_path 固定を必須化する。
- `STABLE` 宣言により同一トランザクション内の重複呼び出しが PostgreSQL レイヤで最適化される可能性がある。
- `bigint` の戻り値は JS では `number` に変換できる範囲（< 2^53）に収まる前提。万一を考えるなら `Number(row.count)` で明示変換するか、`int` にキャストしても良い。
- materialized view 案：将来 approved が 100k を超えるなら検討。materialized view + `pg_cron` で 5 分おき refresh は典型パターン。
- 関連の `/area/[municipality]` 詳細ページや `useStats` も同様の集計ロジックを抱えている可能性があり、横展開を検討（REQ-032 / 別 REQ で対応）。
