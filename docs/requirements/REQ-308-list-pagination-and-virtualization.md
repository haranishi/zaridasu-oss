# REQ-308: 一覧取得のページングと仮想化（写真ギャラリー・管理一覧・ユーザー一覧）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **Medium** ／ 種別: 性能（データ取得・描画）
状態: **提案 / 未実装**
関連: REQ-278（フロントエンド性能改善 / FR-278-05 items メモ化）, REQ-142（一覧のページング）, REQ-138（管理画面）, REQ-209（date-fns の named / deep import）, REQ-243（hidden 投稿の座標欠損）, REQ-274（AbortController / stale 上書き対策）, REQ-307（地図描画の最適化＝本REQの件数設計と相互依存）, REQ-282（dead code の棚卸し）

## これは何か

写真ギャラリー・通報一覧・ユーザー一覧の 4 つの取得／描画問題（A〜D）をまとめて直す性能要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

管理画面のページングは **AdminReports と AdminUsers を除いて実装済み**で、`ADMIN_PAGE_SIZE = 20` という方針は既に確立している。つまり 2 画面だけが取り残されている状態。一方フロント側は取得件数の設計に **50 件 ⇄ 最大 2000 件という段差**があり、下側では機能欠落（データが出ない）、上側では描画肥大として現れる。

## 主要な決定事項の要点

- **問題A**: PhotoGallery が `items.map()` で全件を仮想化なしに一括描画。`MAX_PHOTOS = 3` × `QUERY_LIMITS.posts = 2000` で**理論上最大 6000 枚のカード**。REQ-278 でメモ化されたのは派生配列の計算だけで、**描画は一切間引かれていない**。`loading="lazy"` はネットワーク取得を抑えるだけで DOM・レイアウト・日付整形は全件分発生する。
- **対応はコスト対効果で CSS が先** — 第一候補は `content-visibility: auto` ＋ `contain-intrinsic-size`（JS・ライブラリ追加ゼロ）。不足したら初期 100 件＋IntersectionObserver の段階追加へ進む。
- **問題B は性能問題ではなく機能的欠落** — `HomePage` が `fetchMore` / `hasMore` / `loadingMore` を配線しておらず、既定状態では**最新 50 件で打ち止め**。蓄積が増えるほど見えないデータの割合が増える。sentinel を持つ `PostList.tsx` は存在するが**どこからも import されていない dead code**（テストの `vi.mock` だけが参照）。
- **50 と 2000 の間に段階が無いこと自体を設計として直す**。表示範囲フィルタ ON の瞬間に跳ね上がり、問題A と REQ-307 問題A が同時に顕在化する。
- **dead code のまま放置は不可** — `PostList` / `PostCard` / `StatsBar` は「再利用する」か「削除する」かを必ず決める。復活させる場合は `PostCard` の 400px 固定 URL × `sizes` によるアップスケール不整合も同時に直す。
- **問題C**: `/admin/reports` は `.limit()` も `.range()` も無く `select('*')`。とくに「対応済み」タブは運用と共に単調増加する。**方針からの単純な取り残し**。`reporter_ip` は IP 重複カウントに必要なので残すが、他の未使用列を落として **PII 露出面も縮小**する。
- **問題D**: `get_admin_user_list()` に LIMIT/OFFSET が無く全ユーザーを返す。さらに `AdminUsersPage` が**モバイル用カードと PC 用テーブルで 2 回 map を回し DOM に 2 セット**存在。`AdminLogsPage` はログ本体をページングしているのに**名前解決だけ全件 RPC**という不整合 → `p_user_ids uuid[]` を受ける軽量 RPC に分離する。
- `SECURITY DEFINER` と JWT の admin チェックは **必ず維持**する（権限面の問題は無く、純粋に取得量・描画量の問題）。
- **REQ-307 とは実装順序を調整する** — REQ-307 を先に入れて「2000 件でも軽い」状態を作ってから本REQで件数設計を触る方が安全。
- 対象外: PostGIS 等の地理空間インデックス最適化、地図マーカー描画（REQ-307）、管理画面の検索・並び替えの全面刷新、`reporter_ip` の保持方針そのもの。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-308-list-pagination-and-virtualization/01-background.md) | 背景 — 既存ページング実装の現状と、箇所別の取得／描画と問題の対応表 |
| [02-issues-a-b.md](REQ-308-list-pagination-and-virtualization/02-issues-a-b.md) | 問題A（PhotoGallery の全件描画・上限 6000 枚の裏取り・対応候補 2 案）と問題B（`fetchMore` 未配線による 50 件打ち止めと dead code の `PostList`） |
| [03-issues-c-d.md](REQ-308-list-pagination-and-virtualization/03-issues-c-d.md) | 問題C（AdminReports の limit なし `select('*')`）と問題D（`get_admin_user_list` 全件返却・DOM 2 重描画・ログ画面の全件呼び出し） |
| [04-functional-requirements.md](REQ-308-list-pagination-and-virtualization/04-functional-requirements.md) | 機能要件 FR-308-01〜09（描画間引き、日付整形、件数段差の解消 (a)/(b)、dead code の処遇、管理画面のページングと列明示、RPC 拡張、2 重 map の統合） |
| [05-acceptance-criteria.md](REQ-308-list-pagination-and-virtualization/05-acceptance-criteria.md) | 受入基準 AC-01〜11（`npm run size` の予算、`schema:check`、既存 652 テスト、REQ-274 の非破壊を含む） |
| [06-out-of-scope.md](REQ-308-list-pagination-and-virtualization/06-out-of-scope.md) | 対象外 4 項目と、REQ-307 との実装順序の調整方針 |
