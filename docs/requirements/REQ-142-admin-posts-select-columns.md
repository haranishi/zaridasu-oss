# REQ-142: AdminPostsPage の `select('*')` を列指定に変更

> 関連 REQ: REQ-103（select-star 全廃）/ REQ-032（データ取得効率化）/ REQ-009（admin page split）

## 背景
REQ-103 で全アプリの `select('*')` を順次列指定に置き換えてきたが、`/admin/posts` 画面の一覧クエリだけが取り残されている。
管理画面は AI 判定結果 `ai_result`（JSONB、数〜数十 KB／行）や rejection 関連列を含む `posts` テーブルの全列を都度 20 件分取得しており、ネットワーク負荷と Supabase egress、ブラウザのメモリ消費が無視できないサイズになっている。

## 現状の問題
- `src/views/admin/AdminPostsPage.tsx:68`：
  ```ts
  let query = supabase.from('posts').select('*', { count: 'exact' })
  ```
  `*` で全列取得。`ai_result` JSONB（per_photo 配列、AI のレスポンス全文）が含まれる。
- 同ファイル他箇所の CSV 出力（`handleExportCSV`, 252 行付近）と `fetchPendingCount`（head: true で OK）は **既に REQ-103 で列指定済み**。「fetchPosts のみ取り残し」状態。
- 同画面の `ReviewCard` / `AIBadge` / `RejectDialog` / `DeletePostDialog` / 表セルで参照される列を確認すると、以下で網羅できる：
  - id, created_at, lat, lng
  - species, info_type, municipality, comment
  - photos, audio_url, audio_duration_ms（音声プレビューに使用）
  - status, rejection_reason, rejection_message
  - is_anonymous, is_official, auto_approved
  - user_id（owner 判定）, count, observed_at
  - weather, temperature, humidity
  - ai_result（AIBadge / 判定詳細で表示）
  - image_hashes（重複チェック表示で利用される場合あり）
  - ai_failure_count（AI 失敗カウント表示・REQ-125 系で追加）
- 「一覧時点で `ai_result` を全件取る必要があるか」は要検討。`AIBadge` の最低限表示なら `ai_result -> 'confidence'` 等の限定取得 or 詳細展開時取得が望ましい。
- 結果として 1 ページ（20 件）で数百 KB のレスポンスになるケースがあり、admin 管理体験が劣化。Supabase egress も無駄。

## 目的
- `/admin/posts` 一覧取得の `select('*')` を画面で実際に使うカラム列挙に置き換え、ネットワーク転送量とブラウザ側メモリ消費を削減する。
- 可能であれば `ai_result` のような重 JSONB は「カード上で必要な要素のみ」or「詳細展開時に分離 fetch」に縮退する。

## 要件

### 機能要件
- [ ] FR-142-01: `AdminPostsPage.tsx:68` の `select('*', { count: 'exact' })` を以下のような列指定に置換する：
  ```ts
  const ADMIN_POSTS_LIST_COLUMNS = [
    'id', 'created_at', 'lat', 'lng',
    'species', 'info_type', 'municipality', 'comment',
    'photos', 'audio_url', 'audio_duration_ms',
    'status', 'rejection_reason', 'rejection_message',
    'is_anonymous', 'is_official', 'auto_approved',
    'user_id', 'count', 'observed_at',
    'weather', 'temperature', 'humidity',
    'ai_result',
    'image_hashes',
    'ai_failure_count',
  ].join(', ')

  let query = supabase.from('posts').select(ADMIN_POSTS_LIST_COLUMNS, { count: 'exact' })
  ```
- [ ] FR-142-02: 列リストは定数（できれば `src/lib/admin/columns.ts` のような共通モジュール）に切り出し、CSV 出力や別画面でも再利用できる形にする。
- [ ] FR-142-03: 画面のセル / `ReviewCard` / `AIBadge` / `DeletePostDialog` / `RejectDialog` / `AudioPlayer` で参照される列を grep で網羅確認し、新列リストで不足がないことを検証する。
- [ ] FR-142-04:（推奨）`ai_result` の一覧取得を「最小サブセット」に縮退する選択肢を検証する。
  - 例：一覧では `ai_result->>'species_match'` `ai_result->>'confidence'` `ai_result->>'image_quality'` 程度のみ表示するなら、PostgREST の `ai_result_summary` 派生カラム / view / 計算列を提案。
  - 完全な ai_result はカード展開時 or 詳細モーダル時に別 fetch とする。これは Optional（FR-142-04a）/ もしくは別 REQ に分離可。
- [ ] FR-142-05: `AdminPost` 型 (`src/types/post.ts`) との整合：列リストから抜けた列を参照しているコードがあれば、参照側のフォールバック or 型修正を行う。
- [ ] FR-142-06: 一括承認 / 一括削除 / 個別承認 / 個別却下 / official トグル / 削除のいずれの操作後にも `fetchPosts()` で同じ列を取り直すこと（current 実装の挙動を保つ）。

### 非機能要件
- [ ] NFR-142-01: `/admin/posts` 1 ページ取得時のレスポンスサイズが現状比で **40% 以上** 削減される（ai_result を含まない場合は 80%+）。DevTools Network で計測。
- [ ] NFR-142-02: 一覧の体感速度（クリック → 表示）が現状以上で、悪化させない。
- [ ] NFR-142-03: PII 漏洩リスクのある列（例：`reporter_ip` / `email` 等）が誤って取得されていないことをコードレビューで確認。

## 受入条件
- [ ] AC-01: `AdminPostsPage.tsx` の `fetchPosts` 内に `select('*'` が **存在しない**（grep で 0 件）。
- [ ] AC-02: status タブ pending / approved / rejected / all を切り替えて従来表示が回帰しない（種名、AI バッジ、写真サムネ、音声、コメント、却下理由）。
- [ ] AC-03: 個別操作（承認 / 却下 / 削除 / official 切替 / 再判定）と一括操作（一括承認 / 一括削除）が現状どおり動作する。
- [ ] AC-04: フィルタ（species, info_type, municipality, keyword, auth）/ ページング / ソートが回帰しない。
- [ ] AC-05: CSV 出力（`handleExportCSV`）の出力列が現状と一致する。
- [ ] AC-06: DevTools Network で 1 ページのレスポンスサイズが NFR-142-01 を満たす。
- [ ] AC-07: `npm run build` / `npm run typecheck` / `npm test` が pass。

## テスト要件
- [ ] T-142-01: Vitest（unit）: `AdminPostsPage` を `@testing-library/react` でレンダーし、supabase mock の `select` 引数が `'*'` ではなく列リストになっていることを assert。
- [ ] T-142-02: Vitest（unit）: status タブ切替 / フィルタ切替時にも同一列リストが渡されることを確認。
- [ ] T-142-03: Playwright（E2E）: admin ログイン → `/admin/posts` を開き、ReviewCard に種別・AI バッジ・写真サムネが現状どおり描画されることを確認。
- [ ] T-142-04: Playwright（E2E）: 個別操作 1 件（approve / reject / delete）と一括操作 1 件を実行し、画面が refresh されて正しく反映される。
- [ ] T-142-05: 計測：before / after で `/admin/posts` 1 ページのレスポンスサイズと `chrome-devtools` Memory Heap を記録し、PR にスクショ添付。

## 影響範囲
- `src/views/admin/AdminPostsPage.tsx`（メイン変更）
- `src/lib/admin/columns.ts`（新設、共通定数）
- `src/types/post.ts`（必要なら `AdminPost` の `Required` 範囲を見直し）
- `src/components/features/admin/ReviewCard.tsx`（参照列の確認のみ、変更不要のはず）
- `src/components/features/admin/AIBadge.tsx`（ai_result サブセット化を選ぶ場合の参照箇所）
- Tests: `src/__tests__/admin/` 配下 + `tests/e2e/admin*` 配下

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 管理体感速度と Supabase egress コストへのインパクトが大きい。REQ-103 で他は全て列指定化済みなのに 1 箇所だけ取り残されており、整合性の意味でも処理が望ましい。S/M 規模で副作用が小さい。

## 実装メモ
- 列リストは `src/lib/admin/columns.ts` に `ADMIN_POSTS_LIST_COLUMNS` / `ADMIN_POSTS_CSV_COLUMNS` / `ADMIN_POSTS_DETAIL_COLUMNS` を切って共通管理する。CSV 側との重複は今後も生じうるため。
- `ai_result` を一覧から外す場合は、`AIBadge` が必要とするフィールドを `posts` の generated column（例：`ai_summary jsonb`）として SQL レイヤで派生させる手も検討可能（別 REQ）。
- `*` を残したい場合の代替として、Supabase の `select('*')` には型生成（`Database` 型）と整合する利点があるが、本プロジェクトでは既に他箇所で列指定に統一済みなので、整合性優先で列指定とする。
