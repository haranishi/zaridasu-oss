### 3. Zenodo へアップロードして DOI を取得

> Web UI 推奨（トークンを CLI 履歴に残さない＝NFR-230-06）。

1. Zenodo にログイン → **New upload**。
2. **Upload type**: Dataset。
3. ファイル: 手順 1 の CSV / GeoJSON を両方アップロード。さらに `/dataset` の説明文を `README.md` として添えると親切。
4. メタデータ: 上記「メタデータ方針」を入力（タイトル・著者/所属・**License = Creative Commons Attribution 4.0 International**・キーワード・説明・収録期間）。
5. **Publish** を押すと **DOI が発行**される。Zenodo は 2 種類の DOI を出す:
   - **Concept DOI**（全バージョン共通・常に最新版へ解決）→ `/dataset` や引用には原則こちらを使う。
   - **Version DOI**（このスナップショット固有）→ 特定版を指す引用に使う。

> API トークンを使う自動化を行う場合でも、トークンは Secrets（環境変数 / シークレットマネージャ）で扱い、**本書・コミット・ログ・公開物に平文で書かない**（NFR-230-06）。

### 4. DOI をアプリへ反映

1. `/dataset` ページの「引用方法（DOI）」セクションに、発行された **DOI（URL 形式 `https://doi.org/10.5281/zenodo.XXXXXXX`）と引用フォーマット**を掲示する。
   - 編集対象: `src/app/dataset/page.tsx` の DOI セクション（現状はプレースホルダ文言）。
   - 引用フォーマット例:
     > 著者名 (年). ザリダス: 秋田県の外来生物市民科学観察データ [Data set]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX
2. **REQ-229 への供給**: `Dataset` JSON-LD（REQ-229 が主管）の `license`（`https://creativecommons.org/licenses/by/4.0/`）・`distribution`（CSV/GeoJSON の URL）・`sameAs`/`identifier`（DOI）に反映されるよう、REQ-229 側の値を更新する（本 REQ はこれらの確定値の供給元）。
3. 変更をデプロイし、`/dataset` に DOI が表示されることを確認する。

### 5. versioning（更新時）

- 大きな更新（収録期間の延長・列追加・粗化方針変更）を反映するときは、Zenodo の該当レコードで **New version** を作成 → 新しいファイルをアップロード → Publish。
- **Concept DOI は維持**され、新しい **Version DOI** が発行される。`/dataset` の引用は Concept DOI を基本に保ち、必要に応じて Version DOI を併記する。
- 軽微な日次更新は配布エンドポイント（`/dataset/*.csv|geojson`）の自動更新で足り、**毎回 DOI を振り直す必要はない**。

