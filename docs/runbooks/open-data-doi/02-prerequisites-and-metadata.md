## 前提

- 本番 URL: `https://zaridasu.com`
- 配布エンドポイント:
  - CSV: `https://zaridasu.com/dataset/zaridasu.csv`
  - GeoJSON: `https://zaridasu.com/dataset/zaridasu.geojson`
- 学術リポジトリのアカウント（**Zenodo を第一候補**。理由は下記）
- ライセンスは確定済み: **CC BY 4.0**（`https://creativecommons.org/licenses/by/4.0/`）

### リポジトリ選定（本プロジェクトの決定）

| 候補 | 長所 | 短所 | 判断 |
|---|---|---|---|
| **Zenodo** | DOI 発行が容易・GitHub 連携・concept DOI と version DOI の二層管理・ORCID 連携 | 研究プロジェクト全体の管理機能は弱い | **採用**（DOI 発行と versioning が目的に最適） |
| OSF | プロジェクト一体管理・プレレジ等と統合 | DOI 発行までの導線がやや手間 | 補助（プロジェクト資料の集約に使うなら可） |

**結論: スナップショット＋DOI は Zenodo を使う。** OSF はプロジェクト資料アーカイブとして任意併用。

### メタデータ方針（確定）

- **タイトル**: `ザリダス: 秋田県の外来生物（アメリカザリガニ・ウシガエル）市民科学観察データ`
- **著者・所属**: 学術アーカイブのメタデータでは著者名・所属を**適切に記載してよい**（LP/サービス UI では大学名・「卒業研究」の語を出さないブランディング方針があるが、それは LP に対する制約であり、学術リポジトリのメタデータには適用しない＝REQ-230 影響範囲の判断）。
- **ライセンス**: CC BY 4.0
- **キーワード**: `外来種, アメリカザリガニ, ウシガエル, 市民科学, citizen science, biodiversity, invasive species, Akita, Japan, occurrence`
- **説明（abstract）**: データの概要・対象種/地域・収集方法（市民科学）・**座標は粗化済み（約111mグリッド）**・PII 非含有・status=approved のみ・データの限界（非悉皆/観察努力バイアス）を明記（`/dataset` ページの文面を流用）。
- **収録期間**: スナップショット時点の最小〜最大 `observed_at`。

