## 影響範囲

**本 REQ が担う範囲（地名/水系/水辺の付与とデータ品質・素材供給）:**
- DB: `supabase/schema.sql`（`posts` への列追加、`geo_cache` テーブル、任意で `survey_sites` 列追加）＋新規連番 migration（過去 migration は不改変）。
- Edge Function: `supabase/functions/enrich-place`（新設。逆ジオ集約・スロットリング・キャッシュ・フォールバック）と `_shared/`（スロットリング/プロバイダ抽象のヘルパ）、`__tests__`。
- 起動経路: `posts` INSERT トリガー → `net.http_post`（pg_net、既存 `migrations/20260421000001_*.sql`・`20260425000004_*.sql` のパターン）で非同期起動。
- クライアント: `src/hooks/useReverseGeocode.ts`（字/水系/標高はサーバー集約へ寄せる方針。市区町村の即時表示は維持しつつ UA 規約問題を是正）、`src/lib/geocodeCache.ts`（DB キャッシュとの役割整理）、`src/types/database.types.ts`・`src/types/post.ts`・`src/types/index.ts`（型追加）。
- 提示（素材供給）: `src/app/area/[municipality]/page.tsx`、`src/components/features/map/MapView.tsx`、`src/app/post/[id]/page.tsx`。
- 設定: `.env.example`（`GEOCODE_PROVIDER`/`OPENCAGE_API_KEY`/`GEOAPIFY_API_KEY`/kill switch フラグ/連絡先 UA の注記）。

**本 REQ が担わない範囲（隣接 REQ との境界＝重複回避）:**
- 地名ロングテール SEO・programmatic ページの本文/内部リンク設計は **REQ-227/228**（本 REQ は字/水系/水辺の値を供給）。
- `Dataset`/`Place` JSON-LD・学名エンティティ連携は **REQ-229**（本 REQ は値を供給）。
- 外部 API のコスト予算・kill switch・暴走防止の運用基盤は **REQ-218**、入口 bot/頻度制限は **REQ-212**（本 REQ は逆ジオ呼び出し固有のスロットリング/キャッシュ/フォールバックを実装し、運用は 218/212 に整合・参照）。
- 既存の市区町村判定（クライアント Nominatim → 文字列マッチ）の**置き換えはしない**（維持・補完）。eDNA データ自体の取り込み/解析は将来 REQ。

**他機能への影響リスク:**
- 列追加は NULL 許容のため既存表示/集計を壊さないが、`SELECT` カラム列挙箇所（`area/[municipality]/page.tsx:70`・`schema.sql:989,998` 等）に新列を足す場合は型同期（`supabase gen types`）と RLS テスト/E2E の回帰確認が必要。
- 逆ジオのサーバー集約は、誤ると**全利用者合算で Nominatim 規約違反/ブロック**や OpenCage/Geoapify の課金増につながる。必ずスロットリング・キャッシュ・kill switch をテストしてから本番投入する。
- クライアント Nominatim 呼び出し（`useReverseGeocode.ts`）の変更はフォームの市区町村自動入力 UX に影響するため、変更時は投稿フォーム E2E を確認する。

## 優先度

- **緊急度**: Low / **重要度**: Medium
- **理由**: 現状でも投稿・地図・地域ページは市区町村単位で機能しており、字/水系/水辺が無くても致命的ではない（緊急度 Low）。一方で、(1) **データ品質**＝外来生物分布は水系・水辺と不可分で、eDNA 等の研究利用や外れ値検知に字/水系/水辺フラグの価値が高い、(2) **地名ロングテール SEO・地域ページ情報密度**の底上げ（REQ-227/228/229 の素材になる）、という二重の便益があり、卒研 PF の研究価値と集客の双方に効く（重要度 Medium）。技術的リスクは主に **Nominatim 利用規約（1req/秒・UA 必須・bulk 禁止）と外部 API コスト**で、これはサーバー側集約＋スロットリング＋DB キャッシュ＋kill switch＋OpenCage/Geoapify フォールバックで管理でき、REQ-218/212 と整合させれば一人運用でも現実的に回せる。まず `posts` への付与（FR-231-01〜06）を最小スコープで入れ、定点サイト拡張（FR-231-07）・本格的な品質異常検知（FR-231-08 の発展）は後続に分割するのが妥当。
