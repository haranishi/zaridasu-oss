## 目的

- 匿名化・**位置粗化**済みの観察データを **CSV / GeoJSON** で機械可読に公開し、ブラウザからの入口となる **`/dataset` 公開ページ**を新設する（ログイン不要・安定 URL・robots 許可）。
- 公開データに **明示的なライセンス（CC BY 4.0 を第一候補）と帰属表示の方法**を定め、利用規約・プライバシーポリシーに投稿者からの利用許諾とライセンス条項を反映する。
- データセットの**スナップショットを OSF / Zenodo に登録して DOI を発行**し、`/dataset` ページと卒論から正式に引用可能にする（引用フォーマットも掲示）。
- **研究者向けの絞り込みエクスポート**（approved・期間・種・粗化レベルの指定）を提供し、CSV のみだった出力に GeoJSON を加える。
- これにより「集めたが使われないデータ」をリンカブルアセット／AI 引用されやすい一次データへと転換し、`Dataset` JSON-LD（REQ-229）の `distribution`/`license` を実在させる。**プライバシー（位置粗化・PII 非公開）を全要件の最優先制約**とする。

## 要件

### 機能要件

- [ ] FR-230-01: **公開オープンデータページ `/dataset` を新設する。** `src/app/dataset/page.tsx`（ログイン不要・`robots` index 許可・`sitemap.ts` に追加）を作成し、最低限以下を掲示する：(a) データの概要・対象種・対象地域・収集方法（市民科学・REQ-174 の定点/機会記録の別）、(b) **収録項目（カラム）とその意味**（observed_at / species / info_type / municipality / 粗化座標 / count / survey_method 等）と**含めない項目（PII）**の明示、(c) **ライセンス表記**（FR-230-04）、(d) **ダウンロードリンク**（CSV / GeoJSON。FR-230-02）、(e) **DOI と引用方法**（FR-230-05、発行後に掲示）、(f) 最終更新日・収録期間・件数。本ページは REQ-229 が出力する `Dataset` JSON-LD の **`distribution` が指す配布先**となる（URL を REQ-229 と一致させる）。i18n はまず ja を正本とし、about/lp（REQ-141 静的辞書）に倣う（en/ko/zh は後続でも可、その旨を記す）。

- [ ] FR-230-02: **CSV / GeoJSON の公開配布物を生成する。** approved 投稿（`status = 'approved'`）の匿名化・粗化済みデータを、(A) CSV（既存 `useCsvExport` の列構成＝`src/hooks/useCsvExport.ts:56` を基礎にしつつ、後述の粗化座標・ライセンスヘッダコメントを反映）と、(B) **GeoJSON**（`FeatureCollection`、各 `Feature` は `Point` 幾何＝粗化座標、`properties` に species/info_type/municipality/observed_at/count/survey_method 等）として配布する。生成方式は次のいずれかを選定し記録する：(a) **ビルド時/ISR の静的生成**（例 `src/app/dataset/zaridasu.csv/route.ts`・`.../zaridasu.geojson/route.ts` の Route Handler、`revalidate` で日次更新）、(b) **定期ジョブでオブジェクトストレージへ出力**（バックアップ系 REQ-217 のジョブ基盤に相乗り可）。**anon クライアントが直接全件 SELECT する方式は避け**、サーバー側（RPC もしくはサーバーコンポーネント/Route Handler）で `approved` 限定・粗化済みの結果のみを返す。`Content-Type` は CSV=`text/csv; charset=utf-8`、GeoJSON=`application/geo+json` とする。

- [ ] FR-230-03: **位置情報の粗化（プライバシー保護）を必須とする。** 公開する座標は**生の lat/lng を出さず**、(a) 小数点以下の桁丸め（例：小数第3位≒約 111m グリッド／第2位≒約 1.1km。粗化レベルは実装時に研究有用性とプライバシーのトレードオフで決定し記録する）、または (b) 規則的グリッド/メッシュへのスナップ（例 約 1km メッシュ中心へ丸め＝GBIF 等の慣行）、のいずれかを適用する。`accuracy`（GPS 精度・REQ-172）は**公開データに含めない**（高精度の手がかりを与えない）。粗化レベルは `/dataset` ページとファイル内（CSV 先頭コメント／GeoJSON のトップレベル `properties`）に明記し、「正確な地点ではなく粗化済み」であることを利用者に伝える。**研究上どうしても高精度が要る場合は、ライセンス・申請ベースの個別提供に回す方針**とし、無条件のオープン配布には粗化版のみを置く。粗化は CSV・GeoJSON・REQ-229 の `spatialCoverage` 全てで一貫させる。

- [ ] FR-230-04: **ライセンスと帰属表示を確定し、規約・ポリシーに反映する。** 公開データのライセンスを **CC BY 4.0 を第一候補**として決定し（外来種の分布データは行政・研究での再利用価値が高く、帰属表示のみを課す CC BY が一般的＝(推測)）、(a) `/dataset` ページにライセンス名・条文 URL・**推奨される帰属表示（attribution）文字列**（例：「ザリダス（出典 URL / DOI）」）を掲示、(b) `src/views/TermsPage.tsx`（第3条付近）に**投稿者から運営への、匿名化・粗化したうえでのオープンデータ公開・再配布の許諾**を明文化、(c) `src/views/PrivacyPage.tsx:64-65` の第三者提供条項を、**公開されるのは匿名化・位置粗化済みの集約データであり PII（メール・`reporter_ip` 等）は含まない**ことが分かる記述へ更新する。確定したライセンス（SPDX 文字列または URL）は **REQ-229 の `Dataset.license`** に供給する（REQ-229 側は本 REQ 確定までは `license` 未出力＝`REQ-229-*.md:102`）。

- [ ] FR-230-05: **OSF / Zenodo でスナップショットを登録し DOI を発行する。** 配布データ（FR-230-02 の CSV/GeoJSON＋データ説明＝メタデータ）の**バージョン付きスナップショット**を、研究データリポジトリ（**Zenodo** または **OSF**＝`公開API一覧/39_Science & Math.md:38`）に登録して **DOI を取得**する。最低限、(a) リポジトリ選定（Zenodo は DOI 発行・GitHub 連携が容易／OSF は研究プロジェクト一体管理が容易＝それぞれ一長一短。卒研 PF として 1 つ選び理由を記録）、(b) アップロードするファイルとメタデータ（タイトル・著者・所属の扱い〔ブランディング方針で大学名・「卒業研究」語は LP では NG だが学術アーカイブのメタデータでは適切に記載してよい＝判断を記録〕・ライセンス・キーワード・収録期間）の確定、(c) **発行された DOI を `/dataset` ページに掲示し、`Dataset` JSON-LD（REQ-229）の `sameAs`/識別子に反映**、(d) **更新時の versioning 方針**（Zenodo は新バージョンに concept-DOI を維持しつつ version-DOI を発行）。登録自体は運用者の手作業でよい（IaC 化不要）が、手順を runbook 化する（NFR-230-04）。

- [ ] FR-230-06: **研究者向けの絞り込みエクスポートを提供する。** 公開配布物に対し、(a) 既存 CSV フィルタのうち**公開文脈で有効な軸**（`from`/`to`/`species`/`municipality`。`myOnly` は公開版では除外＝`src/hooks/useCsvExport.ts:9` の `myOnly` は使わない）を、`/dataset` の UI もしくは Route Handler のクエリパラメータ（例 `?species=american&from=2026-01-01&format=geojson`）として受けられるようにする、(b) 出力形式（`csv` / `geojson`）の選択、(c) 既定は**全件・粗化版**とする。`status='approved'` 固定（未承認・却下データは公開しない）。**既存ダッシュボードのログイン版エクスポート（`CSVExportSection.tsx`）は、投稿者本人が自分の生データ（`myOnly`）を扱う用途として残し、公開版とは分離する**（重複ではなく役割分担＝影響範囲に明記）。

- [ ] FR-230-07: **データ品質・出所の透明性を担保する。** `/dataset` ページに、(a) データは**市民科学による任意投稿であり悉皆調査ではない**こと（観察努力の偏りがある旨）、(b) AI 一次判定＋人手レビュー（既存の `status` 運用）を経た approved のみを収録すること、(c) `survey_method`（structured=定点反復 / opportunistic=機会記録＝REQ-174）で取得文脈が異なること、(d) 座標は粗化済みで正確な地点ではないこと、を**データの限界（caveats）**として明記する。これは AI 引用・学術利用での誤用を防ぎ、一次データとしての信頼性（`04_AI検索時代とローカルSEO.md` のコンセンサス/権威）を高める。
