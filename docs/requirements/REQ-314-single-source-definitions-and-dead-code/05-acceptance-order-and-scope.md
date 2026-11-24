## 受入基準

- **AC-01**: `AKITA_BOUNDS.latMin` / `lngMin` / `latMax` / `lngMax` ちょうどの座標に対し、**GPS 自動入力・EXIF 採用・zod 検証の3経路がすべて同じ判定を返す**（包含）。`AKITA_BOUNDS` を書き換えたときに直す箇所が1つ（`targetArea.ts`）だけである。
- **AC-02**: `grep -rn "AKITA_BOUNDS.latMin" src/` の結果が `targetArea.ts` とテストに限られる（インライン再実装が0件）。
- **AC-03**: EXIF GPS を持つ写真を添付して EXIF 位置を適用した投稿が `location_source = 'exif'` として保存される。地図タップで選んだ投稿は `'manual'`、端末 Geolocation は `'gps'` のまま。`LocationSource` 型が `database.types.ts` の `location_source` から導出されており、DB に値を追加すると TS 側が自動で追随する。
- **AC-04**: `.from('post-photos')` および `'/post-photos/'` のリテラルが `src/lib/storage.ts` の1箇所（定数定義）に集約され、他ファイルからのバケット名直書きが0件（`grep` で確認）。バケット名定数を変更すると全経路（アップロード・削除・URL解析）が追随する。
- **AC-05**: 写真アップロードの全経路が `processImage`（EXIF 除去。REQ-243 FR-243-04）を通る。
- **AC-06**: `npm run schema:check` が**テーブル修飾**で列挙値を検証し、`posts.status` の許容値を `schema.sql` 側だけで変更すると**落ちる**。`reports.reason` がテーブルの CHECK 制約を見ている（RLS ポリシー側の列挙を消しても検査結果が変わらない）。
- **AC-07**: `COUNT_MAX` / `MAX_FILE_SIZE` / `SURVEY_DURATION_MAX` のいずれかを `constants.ts` 側だけで変更すると `npm run schema:check` が落ちる。
- **AC-08**: `useSurveyRequests` の一覧取得と `createRequest` の返却が**同一の列リスト定数**を参照しており、片方だけ変更できない。`area/[municipality]` と `area/[municipality]/[species]` も同様。
- **AC-09**: `AdminExperimentsPage` の実験セレクトが `EXPERIMENTS` から生成され、`EXPERIMENTS` にキーを1つ追加すると `<option>` が自動で増える。生文字列の実験キーが同ファイルに残っていない。
- **AC-10**: `PostExtendedFields` に `database.types.ts` の `posts.Row` と重複する列が残っていない。`PostWithAI` 等の交差型を使う既存コードが型エラーなくコンパイルされる（外部から見た型が変わっていない）。
- **AC-11**: 参照0件のシンボルが `isMediaRecorderSupported` の削除で解消し、`resetErrorReporter` は**削除されていない**（`errorHandler.test.js` が緑）。`clearGeocodeCache` がテストの `beforeEach` から実関数として呼ばれている。`isWithinTargetBBox` の本番参照が3箇所以上ある。
- **AC-12**: `MapSettingsProvider` を外した状態で `useMapSettings` を使うコンポーネントをレンダーすると、開発時に警告が出る（本番は従来どおり fail-soft）。DrawerMenu のヒートマップトグルが MapView へ伝わることを検証するテストが存在し、Provider の外へ移すと落ちる。
- **AC-13**: 写真表示について I-1 / I-2 の判断が記録され、`next.config.ts` の `remotePatterns` が**実際に使われている経路と一致している**（未使用の remotePattern が残っていない、または使われるようになっている）。「Supabase 変換 ＋ Next.js 変換の二重変換」が発生していないことを確認する。
- **AC-14**: 本REQのどのコミットも、**FR-314-04 の境界値（`latMin` ちょうどで GPS 自動入力が働くようになる）と FR-314-08 の `location_source` 記録値を除いて、ユーザー可視の挙動を変更しない**。
- **AC-15**: `lint` / `type-check` / 既存652テストがパスする。**ただし FR-314-13 で I-1（`PostCard.tsx` 削除）を選んだ場合は `PostCard.test.tsx` の9件が減るため、その分を差し引いた件数で全件緑になることを確認する**（テスト件数の減少理由をコミットメッセージに明記する）。

## 実施順序の推奨

1. **群2の FR-314-04（bbox 単一化）** — 既にテスト済みのヘルパへ寄せるだけで、`targetArea.test.ts` が3経路の契約になる。最小の変更で最大の再発防止。
2. **群3の FR-314-08（`LocationSource` 導出）** — 型を広げてから EXIF 経路を直す順。逆順だと型エラーで進まない。
3. **群2の FR-314-05〜07（バケット名・列リスト・実験キー）** — 純粋な機械的置換。
4. **群4の FR-314-10〜12（テスト・デッドコード・Context）**
5. **群1の FR-314-01〜02（`schema:check` 拡張）** — **REQ-297（scripts の静的検査有効化）の後**に着手する（FR-314-03）。
6. **FR-314-13（写真経路の判断）** — **REQ-308 の方針確定後**。

## 対象外（他REQとの線引き）

- **`scripts/` と `tests/e2e/` を lint / tsc の対象に入れること** → **REQ-297**（CI静的検査の適用範囲拡張）。本REQは `check-schema-types-sync.ts` の**中身**の拡張のみ。
- **レートリミット判定の日本語部分文字列マッチ（`usePostForm.ts:387` の `message?.includes('投稿上限')`）と DB 例外の機械可読化** → **REQ-299**（エラー分類の機械可読化）。定数と DB リテラルの「3箇所独立」問題（`SPAM_LIMIT_POSTS` / `schema.sql:262` / メッセージ内 `（5件）`）は REQ-299 と FR-314-02 の両方に関わるため、着手時に分担を確認する。
- **Edge Function 側の重複（`SPECIES_LABELS` 6重複・`escapeHtml` 5再実装）** → **REQ-309**（Edge Function の共通化）。本REQはクライアント側の重複のみ。
- **公開オープンデータの列定義が6箇所に分散（CSV ヘッダと行の位置対応）** → **REQ-310**（公開データセットの整合）。同じ「列リストの単一化」だが、ラベルと値がズレたデータが配布されるという実害の大きさが違うため別REQ。
- **`PostgREST` エイリアス select の `as unknown as` 二段キャストに中間 Row 型を定義すること** → **REQ-282 FR-282-D1（D-4）** の未実施分。`useSurveyRequests.ts:159` の `as unknown as SurveyRequest` は FR-314-06 では解消しない（列リストを共有しても型は付かない）ため、REQ-282 側で扱う。
- **ホームの `fetchMore` 未配線・`PhotoGallery` の仮想化** → **REQ-308**。
- **`DrawerMenu` の閉状態 DOM 残存（`if (!open) return null`）** → **REQ-302 / REQ-307**（a11y と性能の両観点で重複。実装は一方に寄せる）。FR-314-12 のテストはこの変更と接触するため、着手順に注意する。
