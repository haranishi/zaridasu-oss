# REQ-143: `/area` 一覧の市区町村別集計を RPC 化（全件 SELECT → サーバー側 GROUP BY）

これは何か: `/area` の市区町村別カウントを、全 approved 行を取得して JS でループする実装から Postgres の RPC（GROUP BY）へ移す要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

`/area` は表示のたびに `posts` から approved 投稿の `municipality` 列を**全件**取得し、Node 側の for ループで集計している。`revalidate = 3600` の ISR で救われてはいるが、再生成のたびに全件 fetch とループが走り、データ量増加に対してスケールしない。典型的な `SELECT municipality, COUNT(*) … GROUP BY municipality` であり、Postgres 側で実行すべき処理である。加えて Supabase の row limit（既定1000）に到達すると**集計値そのものが壊れる**リスクがあり、明示的な `range()` 指定も無い。

## 主要な決定事項（要点）

- **`public.get_municipality_post_counts()` を新設**し、`STABLE` / **`SECURITY INVOKER`** / `SET search_path = public` で定義する。RLS をバイパスする強い理由が無いため INVOKER を選ぶ。DEFINER を選ぶ場合は `status='approved'` フィルタの再確認と search_path 固定を必須にする。
- **ネットワーク転送を「行データ全件」から「市区町村数 × 数十バイト」へ圧縮**する。25市町村なら数 KB 未満。
- **`revalidate = 3600` の ISR は維持**（変更不要）。
- **既存の並び順・挙動を保持**する。投稿数0の市町村も `MUNICIPALITY_DATA` 由来で残り `postCount: 0` で末尾に並ぶ。
- **`(status, municipality)` の部分インデックスは EXPLAIN ANALYZE で確認してから判断**する（過剰追加は INSERT/UPDATE コストを増やす）。既存インデックスに approved 集計最適化のものは無い。
- **materialized view + `pg_cron` 案は本REQの実装範囲外**（approved が 10万行を超えるなら検討）。
- **RPC の EXECUTE は anon と authenticated に GRANT** する。anon と authenticated で同一結果になることを受入条件に含める。
- 緊急度 Medium / 重要度 High。市区町村別ページは SEO 流入の入口であり、将来のスケーラビリティに直結する。
- `/area/[municipality]` や `useStats` も同様の集計を抱えている可能性があり、横展開は別REQで扱う。

## 分割ファイル

- [01-background-and-goals.md](REQ-143-area-municipality-counts-rpc/01-background-and-goals.md) — 関連REQ ＋ 背景 ＋ 現状の問題（該当コード、row limit のリスク、既存インデックス一覧）＋ 目的3点
- [02-requirements.md](REQ-143-area-municipality-counts-rpc/02-requirements.md) — 機能要件 FR-143-01〜07（RPC の SQL 全文、`page.tsx` の置き換えコード、インデックス検討、将来のフォローアップ）＋ 非機能要件 NFR-143-01〜04
- [03-acceptance-tests-and-notes.md](REQ-143-area-municipality-counts-rpc/03-acceptance-tests-and-notes.md) — 受入条件 AC-01〜07 ＋ テスト要件 T-143-01〜06（pg-tap / Vitest / Playwright / ベンチマーク）＋ 影響範囲 ＋ 優先度 ＋ 実装メモ
