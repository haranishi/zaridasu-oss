## 現状の問題

（ファイルパス:行番号、または「機能が存在しない」事実つき）

### 1. 公開オープンデータページ（`/dataset` 等）が存在しない

- `src/app/` 配下のルートは `(home)/about/admin/api/area/auth/dashboard/lp/post/privacy/profile/ranking/request/requests/trends` 等であり、**`dataset`/`opendata`/`data` といった公開配布ページは無い**（`ls src/app/` に該当ディレクトリ無し）。
- `src/app/sitemap.ts` の `staticPages`（`:32-35` 付近に `/area`・`/terms`・`/privacy` 等）にもデータ配布ページの URL は無い。
- 結果、外部の研究者が「ザリダスのデータをまとめて取得する」入口がブラウザ上に存在せず、Google Dataset Search のクロール対象になる配布ページ（`Dataset` JSON-LD の `distribution` が指す先）も無い。

### 2. エクスポートはログイン必須・ブラウザ内 CSV 生成のみで、機械可読な配布物が無い

- 既存エクスポートは `src/hooks/useCsvExport.ts` の `exportCSV()` がブラウザで Blob を生成しダウンロードさせる方式（`:79-87`：`new Blob([bom + csv]) → a.download = 'zarigani_export_YYYY-MM-DD.csv'`）。
- 呼び出し元 `src/components/features/dashboard/CSVExportSection.tsx:12-14` は `useAuth()` の `user` 前提でダッシュボード（`/dashboard`）内にあり、**ログインユーザーの手動操作でしか出力されない**。匿名の外部研究者がプログラムから取得できる安定 URL が無い。
- 出力は **CSV のみ**で、空間データの標準である **GeoJSON（`application/geo+json`）が無い**（`grep -rni "geojson\|application/geo" src` ヒットなし＝REQ-229 でも確認済み）。GIS ツール・QGIS・地図ライブラリで直接読める形式が提供されていない。

### 3. 位置情報が生の緯度経度のまま公開・出力されており、粗化（丸め）が無い

- 既存 CSV は `lat`/`lng` を**生値のまま**出力する（`src/hooks/useCsvExport.ts:42` の `select(... lat, lng ...)`、`:63-64` で `p.lat`/`p.lng` をそのまま行に）。丸め・グリッド化・メッシュ化の処理は無い。
- 自治体ページの SSR でも生の `lat, lng` を取得し（`src/app/area/[municipality]/page.tsx:70` の `select('... lat, lng ...')`）クライアントに渡している（地図表示用途）。
- 投稿の `lat/lng` は端末 GPS 由来だと高精度（`accuracy` 列あり＝`src/types/post.ts:101-102`、REQ-172）。**観察者の自宅・私有地が高精度座標で機械可読公開されると、投稿者個人やレッドリスト種の採集圧（密猟誘発）に直結する**。オープンデータ公開では座標粗化が事実上必須だが、現状その手段が無い。

### 4. データのライセンス・利用条件が明示されていない（再利用・引用が法的に不能）

- プライバシーポリシー `src/views/PrivacyPage.tsx:64-65`（第三者提供）は「統計的・匿名化された形での公開・研究利用は行う場合があります」と**運営側の公開可能性に触れるのみ**で、**第三者がそのデータをどの条件で使えるか（ライセンス）を定めていない**。
- 利用規約 `src/views/TermsPage.tsx:49-51`（第3条 投稿内容について）は「投稿情報は本サービス上で公開される」とあるが、**投稿者から運営へのデータ利用許諾の範囲**、および**運営が公開データに付すライセンス（例 CC BY 4.0）と帰属表示（attribution）の方法**が明文化されていない。
- ライセンス未定のデータは、研究者が引用・再配布する法的根拠を欠く。REQ-229 でも `Dataset` の `license` は「確定するまで出力しない」と保留されており（`docs/requirements/REQ-229-dataset-structured-data-entity.md:102`）、**本 REQ がライセンス確定の主管**となる。

### 5. データセットに DOI（永続識別子）が無く、卒論・他研究から引用できない

- リポジトリ全体に DOI / Zenodo / OSF への登録フローやリンクは無い（`grep -rni "doi\|zenodo\|osf"` で配布/登録関連の実装ヒットなし。`docs/requirements/REQ-229-*.md` で言及があるのみ）。
- DOI が無いと、(a) 卒論の参考文献としてデータセットを正式引用できない、(b) URL 切れ（プロジェクト終了・ドメイン失効）で参照が永久に切れる、(c) 被引用数の追跡（研究インパクト測定）ができない。卒研 PF として「データが研究成果として残る／引用される」ための最後のピースが欠けている。

### 6. 研究者向けの絞り込み・全件取得の設計が無い

- 既存 CSV のフィルタは `from/to/species/municipality/myOnly`（`src/hooks/useCsvExport.ts:6-12`）で、UI（`CSVExportSection.tsx:28-80`）からの手動指定のみ。`myOnly`（自分の投稿）はログイン前提で、**公開オープンデータの文脈では不要**。
- 研究者が必要とする「approved のみ・期間指定・種指定・列セット指定（位置粗化版/詳細版の別）」をパラメータで安定取得する経路（API もしくは静的生成された配布ファイル）が無い。自治体ページの集計 RPC（`get_municipality_post_counts`＝`src/app/area/page.tsx:19`、`get_admin_post_stats` 等＝`src/types/database.types.ts:157-168`）はあるが、**生データのオープン配布用ではない**。
