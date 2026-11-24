### 問題D: `schema:check` の保証範囲が2列のみで、乖離の大半を検知できない — Medium

`scripts/check-schema-types-sync.ts:35-47` の `CHECKS` は **`posts.info_type` と `reports.reason` の2件のみ**。

未検証の CHECK 列は多数あり、いずれも `database.types.ts` に literal union として**手書き**されている: `posts.weather` / `posts.status` / `posts.location_disclosure` / `posts.geo_source`（`database.types.ts:74`）/ `posts.survey_method`（`:80`）/ `posts.location_source`（`:78`）/ `badges.category` / `admin_logs.action`・`target_type`。

さらに**数値・長さの上限は一切対象外**である。実測した対応関係:

| TS 定数 | 値 | DB 側リテラル |
|---|---|---|
| `COUNT_MAX`（`constants.ts:399`） | 999 | `schema.sql:45` `CHECK (count > 0 AND count <= 999)` ／ `:72` にも同一 CHECK |
| `MAX_FILE_SIZE`（`constants.ts:395`） | `5 * 1024 * 1024` | `schema.sql:663` `5242880, -- 5MB`（バケット定義） |
| `SURVEY_DURATION_MAX`（`constants.ts:421`） | 480 | `schema.sql:1607` `CHECK (survey_duration_minutes > 0 AND survey_duration_minutes <= 480)` |

そして `schemaAllowed()`（`:60-68`）は正規表現の**最後の出現**を採用する実装である。

```
const re = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')
while ((m = re.exec(sql)) !== null) last = m[1]
```

これはテーブル修飾を持たないため、`reason` はテーブルの CHECK 制約（`schema.sql:359`）ではなく **RLS ポリシーの `WITH CHECK` 内の列挙（`schema.sql:384`）を見ている**。両者が同じ値を並べているため結果として通っているが、**テーブル側だけを変更した場合の検知は「たまたま」成立しているだけ**で、意図とはズレている。

同スクリプトのコメント（`:32-34`）自身が「列名はテーブル間で衝突しうる（例: `species` は posts と survey_requests で許容値が異なる）。本チェックはアプリ全体で許容値が一意に定まる列のみを対象とする」と限界を明記している。**テーブル修飾化して初めて `species` のような列（posts=2値 / survey_requests=3値）が検査可能になる。**

### 問題E: select 列リストのローカル重複 — Low

REQ-142 が `src/lib/admin/columns.ts` で確立した「列リストを定数化して一覧と CSV で共有する」パターンが、survey / area 系に未適用。

- **`src/hooks/survey/useSurveyRequests.ts:75` と `:156` — 同一ファイル内に12列の同一リストが2回**（一覧取得と `createRequest` の返却）。

  ```
  .select('id, user_id, lat:display_lat, lng:display_lng, municipality, species, reason, urgency, status, created_at, closed_at, response_count')
  ```

  ズレると**作成直後だけ一部フィールドが `undefined` になる**（一覧を再取得すると直る、という追いにくい症状）。`:159` の `return data as unknown as SurveyRequest` が型でも捕まえない。
- `src/app/area/[municipality]/page.tsx:80` と `src/app/area/[municipality]/[species]/page.tsx:104` — 11列の同一リストが2ファイル（`display_lat` / `display_lng` のエイリアスと REQ-243 のコメントまで含めて重複）。

### 問題F: `PostExtendedFields` が生成型と重複し、コメントが陳腐化している — Low

`src/types/post.ts:99-141`。コメントは

```
/**
 * 管理画面で使う拡張Postフィールド
 * DB定義にはまだ含まれていないが実際に存在するカラム
 */
```

だが、宣言されている `status` / `weather` / `temperature` / `humidity` / `accuracy` / `rejection_reason` / `rejection_message` / `reviewed_at` / `reviewed_by` / `survey_method` / `survey_site_id` / `survey_request_id` / `audio_url` / `auto_approved` / `ai_failure_count` は**すべて `database.types.ts:39-82` の `posts.Row` に存在する**。コメントの前提が既に成り立っていない。

しかも生成型より**広く**再宣言している。

- `src/types/post.ts:104` — `status?: string`（生成型は literal union）
- `src/types/post.ts:112` — `weather?: string | null`（生成型は literal union）

現状は使われ方が交差型（`export type PostWithAI = Post & PostExtendedFields`、`:143` ほか）だけなので、TS の交差でユニオン側が勝ち型穴にはなっていない。しかし**`PostExtendedFields` の単体使用が生まれた瞬間に `status` の許容値チェックが失われる**（`status: 'aproved'` のタイポが通る）。
