# REQ-230: オープンデータ公開＋DOI 引用可能化（研究データの利活用）

## これは何か

集めた観察データを匿名化・位置粗化のうえライセンス付きで機械可読に公開し、スナップショットに
DOI を付けて引用可能にするための要件。詳細は `REQ-230-open-data-doi/` 配下に分割している。

## 目的・背景（要約）

核心課題は「**データはあるが使われない**」こと。唯一のエクスポート経路がダッシュボードの
CSV ダウンロード（要ログイン・人手操作）に閉じており、外部の研究者・行政・他の卒論から
発見・取得・引用ができない。公開ページも GeoJSON もライセンスも座標粗化も DOI も無い。
一次データの公開はリンカブルアセット／AI 引用という SEO 上の波及効果も併せ持つ。

## 主要な決定事項（要点）

- **`/dataset` 公開ページを新設**（ログイン不要・index 許可・sitemap 追加）。ここが REQ-229 の
  `Dataset` JSON-LD の `distribution` が指す配布先になる。
- 配布物は **CSV と GeoJSON（RFC 7946・`[lng, lat]`）**の 2 形式。`status='approved'` のみを収録。
  **anon クライアントの全件 SELECT は避け**、サーバー側で粗化済みの結果だけを返す。
- **位置粗化は必須**。生 lat/lng は出さず、桁丸めまたはグリッドスナップを不可逆に適用し、
  `accuracy` は公開データに含めない。高精度が要る場合は申請ベースの個別提供に回す。
- **ライセンスは CC BY 4.0 が第一候補**で、本 REQ がライセンス確定の主管。確定値を REQ-229 の
  `Dataset.license` に供給する（REQ-229 側は確定まで未出力）。規約とプライバシーポリシーにも反映する。
- **DOI は Zenodo または OSF で発行**。登録は手作業でよいが手順を runbook 化し、versioning 方針も記録する。
- **プライバシーが全要件の最優先制約**。粗化漏れ・PII 混入を DOI スナップショットに固定すると
  **回収不能**なため、緊急度は High ではなく Medium とし、条件を満たしてから段階公開する。
- 既存のログイン版 CSV エクスポートは「投稿者本人が自分の生データを扱う用途」として残し、公開版と役割分担する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-230-open-data-doi/01-background.md) | 背景（現状の欠落 5 点と、下敷きにした Obsidian ノート群＝リンカブルアセット・AI 引用・OSF/GBIF） |
| [02-current-problems.md](REQ-230-open-data-doi/02-current-problems.md) | 現状の問題 1〜6（配布ページ不在・機械可読形式なし・生座標・ライセンス未定・DOI なし・絞り込み設計なし） |
| [03-goals-and-functional-requirements.md](REQ-230-open-data-doi/03-goals-and-functional-requirements.md) | 目的と機能要件 FR-230-01〜07（/dataset・CSV/GeoJSON・粗化・ライセンス・DOI・絞り込み・caveats） |
| [04-non-functional-requirements.md](REQ-230-open-data-doi/04-non-functional-requirements.md) | 非機能要件 NFR-230-01〜06（PII 非公開・粗化の一貫性と不可逆性・相互運用性・運用手順・性能・秘密値） |
| [05-acceptance.md](REQ-230-open-data-doi/05-acceptance.md) | 受入条件 AC-01〜08 |
| [06-impact.md](REQ-230-open-data-doi/06-impact.md) | 影響範囲（新規/変更ファイル・REQ-229/103/174/172/179/025/217 との境界・他機能への影響リスク） |
| [07-priority.md](REQ-230-open-data-doi/07-priority.md) | 優先度（緊急度 Medium / 重要度 High）とその理由 |
