## REQ-241. `posts` に列を追加したら列 GRANT を貼り直す（FR-241-04）

**ルール**: `posts` に列を追加する migration は、必ず列単位 GRANT の貼り直しをセットで行う。

`20260616000005_fix_reporter_ip_column_protection.sql` は「`posts` のテーブルレベル SELECT を
anon/authenticated から剥がし、`reporter_ip` を**除く**全列に列単位 SELECT を貼り直す」方式で PII 列を
保護している。この列単位 GRANT は **migration 実行時点の `information_schema` の列集合を固定**する。
そのため、後から `posts` に列を追加する migration が入ると、**その新列は anon/authenticated から不可視**
（列単位 GRANT の対象外）になる。挙動は fail-closed（漏洩ではなく機能欠落）で安全側だが、公開してよい新列を
追加したのに一覧/詳細に出ない、という機能回帰を招く。

**手順**（`posts` へ列を追加する migration に含める）:

1. 列を追加する（`ALTER TABLE posts ADD COLUMN ...`）。
2. 追加列を anon/authenticated に見せてよいか判断する。
   - **見せてよい**（例: 表示用メタデータ）→ 列単位 GRANT を貼り直す（下記）。`reporter_ip` などの
     PII 除外列は引き続き除外する。
     ```sql
     -- reporter_ip 等の PII 除外列を除く全列に列単位 SELECT を貼り直す
     -- （20260616000005 と同じ information_schema 動的列挙で冪等に再付与）。
     GRANT SELECT (<新列を含む・reporter_ip 等を除いた全列>) ON public.posts TO anon, authenticated;
     ```
     実装は `20260616000005` の `DO` ブロック（`information_schema.columns` から除外列以外を列挙して
     `GRANT SELECT (col) ...`）を踏襲すると、列の増減に自動追随する。
   - **見せない**（例: 新しい PII / 内部運用列）→ 除外リストに加え、列単位 GRANT を付与しない。
3. `npm run schema:check` を通し、正本 `schema.sql`（末尾の REQ-179 列保護ブロック）と migration の
   両方で同じ除外・付与になっていることを確認する。
4. 検証: `has_column_privilege('anon','public.posts','<新列>','SELECT')` が意図どおり（公開列 = true /
   非公開列 = false）であることを確認（`つまずきポイント` の `has_column_privilege` の罠に注意）。

> 参考: 過去に列保護対象へ追加された列（`audio_url` / `location_source` / `survey_method` 等）は
> `schema.sql` 末尾で全 `ALTER` の後に列挙してから GRANT する設計のため取りこぼしが無い。migration 側で
> 個別に列を足す場合はこのルールの適用漏れに注意する。

---
