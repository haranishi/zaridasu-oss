# 第三者素材と依存パッケージの表示

ソースコードは [MIT License](LICENSE) だが、次の素材は第三者の権利物で、それぞれのライセンスに従う。
削除・差し替え・追加をしたときはこの一覧も直す。

| 場所 | 中身 | 権利者・ライセンス | 扱い |
|---|---|---|---|
| `.kiro/settings/templates/` | cc-sdd 3.1.0から生成した日本語の仕様・steeringテンプレート | © 2025 gotalab, [MIT](.kiro/settings/LICENSE)。[公式リポジトリ](https://github.com/gotalab/cc-sdd) | 構成を保持し、末尾空白・末尾改行とMarkdownの改行記法を正規化 |
| `public/map-tile-placeholder.png` | 秋田市中心のタイル1枚の静的コピー（トップ地図の LCP 改善用の先行表示） | 地図データ © OpenStreetMap contributors（[ODbL 1.0](https://www.openstreetmap.org/copyright)）。標準タイルは ODbL のProduced Work（[2020年改定](https://blog.openstreetmap.org/2020/06/25/new-licence-for-the-standard-style-tiles-from-openstreetmap-org/)） | 未改変。地図の隅に出典を表示する。`AKITA_CENTER` を変えたら取得し直す |
| `public/images/leaflet/marker-icon.png` / `marker-icon-2x.png` / `marker-shadow.png` | Leaflet 同梱のマーカー画像（REQ-111 でセルフホスト化） | © 2010–2023 Volodymyr Agafonkin / © 2010–2011 CloudMade、[BSD-2-Clause全文](public/images/leaflet/LICENSE) | 未改変 |
| Inter（`next/font/google`） | 本文書体。ビルド時に取得してセルフホストする（リポジトリには含まれない） | © The Inter Project Authors, [SIL Open Font License 1.1](https://openfontlicense.org/) | 未改変 |
| `public/images/intro/*.webp` | 紹介ストーリーのイラスト（現行2枚）（REQ-284） | リポジトリ所有者が画像生成モデル（OpenAI・Codex CLI 経由）で生成し保有 | MIT の対象 |
| `public/mascot*.svg` / `public/brand-symbol*.svg` / `public/logo-horizontal*.svg` / `public/icon-*` / `public/apple-touch-icon.png` / `public/favicon.ico` / `public/og-image*` | マスコット・ロゴ・アイコン・OG 画像（REQ-225 のブランド資産） | リポジトリ所有者の自作 | MIT の対象 |
| `public/lp/hero.svg` / `hero.png` / `hero.webp` | REQ-206の地図の説明図。SVGに外部画像なし。PNG/WebPは再描画との一致から派生物と判断 | 同梱SVGの既存MIT表明に従う | 公開用sourceの説明画像にも使う |

npm の依存パッケージはリポジトリに含まれず、それぞれのライセンスに従う。大半はMIT・Apache-2.0・ISC・BSD 系だが、条件の違うものが次の表のとおりある。
一覧は次のコマンドで出せる。

```sh
npx license-checker-rseidelsohn --production --summary
```

### 条件の違う依存パッケージ（2026-11-23時点のロックファイル）

`npm ci` が取得する。ザリダス本体のMITは変わらない。

| パッケージ | ライセンス | 使う場所 | 知っておくこと |
|---|---|---|---|
| `react-leaflet` / `@react-leaflet/core` | Hippocratic License 2.1 | 地図画面（本番で使用） | 人権に関わる法令・原則に反する用途で使わないことが条件。ライセンス文と著作権表示を保つ必要がある。違反時の補償の条項と、人権原則をめぐる紛争を国際仲裁（資料は公開）で扱う条項があり、仲裁に応じないと許諾が終わる。倫理条項つきのライセンスで、OSI承認ではない。採用・再配布の前に、各自で条件を確かめる |
| `sentry`（Sentry公式CLI） | FSL-1.1-Apache-2.0 | ビルド時（Sentry公式SDKのビルド用プラグインが依存） | 競合する商用サービスに使う場合を除き自由に使える。公開から2年後にApache-2.0へ移る |
| `@img/sharp-libvips-*` / `@img/sharp-win32-*` | LGPL-3.0-or-later を含む | `sharp` の実行環境別バイナリ。画像処理（ブランド画像の生成スクリプトなど）に使う | npmが環境に合うものだけ取得する。リポジトリには含まれない |
| `axe-core` / `lightningcss` ほか | MPL-2.0 | 検査・CSS処理 | ファイル単位のコピーレフト。ビルド・検査に使うだけなら追加の義務は生じない。成果物に含めて配布するなら、そのソースの入手方法を示す必要がある |
| `caniuse-lite` | CC-BY-4.0 | 対応ブラウザのデータ（ビルド時） | 帰属表示が条件。成果物には含めて配布しない |

lockファイルでlicense欄が空の依存は、実物を確かめた。`fast-glob`（2件）は `tools/` に置いたこのリポジトリ自作の代替（MIT）、`leaflet.heat` はBSD-2-Clause、`react-leaflet-cluster` はMITである。

公開データセット（承認済み投稿のスナップショット）のライセンスは CC BY 4.0 で、コードとは別に扱う。
手順は [オープンデータ スナップショット公開＋DOI 発行 手順書](docs/runbooks/open-data-doi.md)。

## 出所と再配布条件を確認できていない素材（この公開用sourceには含めない）

| 場所 | 確認できること | 未確認事項 |
| --- | --- | --- |
| `public/images/home/*-v2.webp` | OpenAIでの6回の生成記録を確認。実際の観察記録ではない | 再配布条件は未確認。公開用sourceには含めず、LP図に代替 |
| `public/images/american.png` / `bullfrog.png` | 生きものの紹介に使う画像 | 原作者・取得元・再配布条件 |

未確認は第三者の権利があると断定するものではないが、公開可能という判定にも使わない。
保守者の確認か許諾済み素材への差し替えが終わるまで、この公開用sourceには含めない。

公開用sourceは`npm run oss:export`で作る。未確認の8画像は同梱せず、許諾条件を確認できるLeafletマーカーとLP図のコピーを配置する。
代替先と元素材・条件は、`public/OSS_ASSET_MANIFEST.json`に記録している。稼働中サービスの原画像は変更しない。

## この公開用sourceに含まれる代替素材

この配布物のamerican.pngとbullfrog.pngはLeafletマーカーのコピー（BSD-2-Clause）です。生きもののイラストではありません。
ホーム6画像は同梱LP図のコピー（MIT）です。元の写真風画像ではありません。
上記の確認待ち事項は、ここに同梱していない原画像についてのものです。
対応する出所とライセンス全文は、public/OSS_ASSET_MANIFEST.jsonの参照先と、[public/images/leaflet/LICENSE](public/images/leaflet/LICENSE)（BSD-2-Clause）で確認できます。
