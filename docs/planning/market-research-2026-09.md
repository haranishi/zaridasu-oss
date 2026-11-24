# ザリダス 市場調査レポート（事業検証用）

> 本文は 2026-09-26 に Claude が作成（検索結果ベース。§10-2 の数字は外部提出前に原典で確認すること）。Obsidian の既存メモとは照合していない（このクラウド環境から参照できないため）。

- 作成日: 2026-09-26（調査時点 2026年9月）／対象: ザリダス（本番 https://zaridasu.com/ 、LP https://zaridasu.com/lp ）
- 表記ルール: **【事実】**＝出典URLあり ／ **【推計】**＝計算式と前提を明記 ／ **【仮説】**＝未検証（ヒアリングで確かめる） ／ **【判断】**＝筆者の評価
- 調査の制約: Web 情報は検索エンジンの結果（タイトル・URL・抜粋）で確認した。この調査環境からは各ページ本文と zaridasu.com を直接開けなかった。外部に出す前に §10-2 のチェックリストで原典を確認すること。リポジトリ内に書かれている事実は再調査せず引用した（§10-3）。

---

## 0. 結論

- **事業としての筋の良さ: 中（小さく確実に稼ぐ型。VC型スタートアップには向かない）。** 制度の追い風は強い（2023年の条件付特定外来生物指定、改正法で県に防除措置・市町村に努力義務、交付金＋特別交付税で自治体の実質負担は最大1/4、農水省の防除手引 2026年3月）。
- ただしアメリカザリガニ×秋田の市場は小さく（推計: 全国TAM 年5.6億〜45.9億円／東北SAM 年0.7億〜6.0億円／3年目SOM 年36万〜1,260万円）、無料の代替（いきものログ・iNaturalist）と、自治体案件の実績が多い Biome がいる。
- 勝ち筋はアプリ利用料ではない。防除の判断に使える検証済みデータ（不在確認・努力量、eDNA 照合、希少種の位置保護）を成果物にして、県・市町村・土地改良区・保全団体に売る。
- **最優先の次の一手: 10月末までに秋田県・県内2〜3市町・土地改良区と活動組織・保全NPOの計10者に「防除判断レポート」の試作を見せ、令和9年度の予算・交付金に載るか（支払い意思と予算枠）を確かめる。並行して、研究データとブランドの帰属を指導教員・大学と文書で確認する。**

---

## 1. 解くべき課題と顧客セグメント

### 1-1. 課題（一文）

**アメリカザリガニとウシガエルの分布と被害が見えていない。防除（どこで・どれだけ駆除し、効果があったか）の判断に使える粒度と品質で、継続的に把握できていない。**

| 根拠 | 区分 | 出典 |
|---|---|---|
| 秋田では目撃情報が個人や一部の専門家の間に留まる。行政と専門家だけで全県の分布を継続して把握するにはコストがかかる | 事実（リポジトリ） | `README.md`、`docs/philosophy/background.md` |
| 茨城県の約21ha の水田地帯で、畦畔の掘削穴が 30.6個/100m（2008年）、深さは最大100cm、1穴からの流出は最大 1.5L/s | 事実 | [農研機構](https://www.naro.go.jp/project/results/laboratory/nkk/2008/nkk08-20.html) |
| 農水省の2023年度アンケート（回答268名）では、条件付特定外来生物の指定を「知らなかった」が半数以上 | 事実 | [三田(2023) J-STAGE](https://www.jstage.jst.go.jp/article/sscawnrjs/14/0/14_59/_article/-char/ja/) |
| 全国では、規制を「知っている／聞いたことがある」が 45.4%（令和7年度認知度調査、中学生以上 1,541件） | 事実 | [環境省](https://www.env.go.jp/press/press_04972.html) |
| 秋田・千葉・兵庫でジュンサイ栽培池の食害懸念が報告されている。秋田県三種町はじゅんさい生産量が日本一 | 事実 | [環境省 手引き](https://www.env.go.jp/nature/intro/3control/files/r_amezari_tebiki2.pdf)、[秋田県](https://www.pref.akita.lg.jp/uploads/public/archive_0000005099_00/%E4%BB%A4%E5%92%8C%E5%85%83%E5%B9%B4_%E7%A7%8B%E7%94%B0%E7%9C%8C%E3%81%AE%E6%97%A5%E6%9C%AC%E4%B8%80%E3%81%A8%E5%85%A8%E5%9B%BD%E3%83%99%E3%82%B9%E3%83%88%EF%BC%93.pdf) |
| 秋田に生息するゼニタナゴが 2025-02-12 に特定第一種国内希少野生動植物種に指定された。捕獲圧が減少要因の一つとされる | 事実 | [環境省 資料(2025-10)](https://www.env.go.jp/content/000347939.pdf)、[J-STAGE](https://www.jstage.jst.go.jp/article/sscawnrjs/17/0/17_1/_pdf/-char/ja) |
| キタノメダカ（日本海側のメダカ）は環境省レッドリスト2020で絶滅危惧II類（VU）。秋田県は希少野生動植物の保護条例を定めていない県として一覧に載っている（時点は要確認）→ 位置情報を自主的に守る意味が大きい | 事実 | [全国レッドデータ検索](https://jpnrdb.com/database/taxon/detail/1021/?o=%E3%83%80%E3%83%84)、[地方自治研究機構](https://www.rilg.or.jp/htdocs/img/reiki/118_endangered_species.htm) |

### 1-2. セグメント表

| セグメント | Jobs-to-be-done | 痛み | 現在の代替手段 | 支払い意思（根拠／仮説） | 優先度 |
|---|---|---|---|---|---|
| **市民投稿者** | 見つけた外来種を、正しく手間なく伝えたい。役に立った実感がほしい／子どもと観察を楽しみたい | 名前や規制が分からない（規制の認知は45.4%）。報告先が分からない。報告しても反応がない | [いきものログ](https://www.env.go.jp/nature/biodic/ikilog/index.html)（無料）、[iNaturalist](https://www.inaturalist.org/pages/geoprivacy)（無料）、[Biome](https://biome.co.jp/app-biome/)（無料・広告なし・課金なし）、自治体の窓口、SNS | 【事実】主要な競合アプリはどれも無料。ザリダスのLPも「登録はずっと無料」と書いている（`src/locales/ja/translation.json`）。→ **支払い意思はほぼゼロ。収益源ではなく、データの供給側** | 必須（課金しない） |
| **自治体の環境部局**（県 自然保護課／市町村 環境課） | 改正外来生物法の防除措置（県）・努力義務（市町村）を、少ない人員と予算で果たしたい。議会や住民に説明できる形で示したい | 全域の分布と推移が見えない。委託すると高く、単発で終わる。交付金申請に使う根拠資料を作る手間 | 環境コンサルへの委託、通報フォームやメール（[福島県の外来種マップ](https://www.pref.fukushima.lg.jp/sec/16035b/gairaishuhoukoku.html)など）、いきものログの団体調査（無料）、Biome の市民協働調査（[千葉県が外来水生植物で採用](https://www.pref.chiba.lg.jp/shizen/press/2026/260601nagaetyosa.html)） | 【事実】交付金1/2＋特別交付税で、自治体の実質負担は最大1/4（[環境省](https://www.env.go.jp/nature/intro/3control/zaiseishien.html)）。類似の自治体向け捕獲記録SaaS「いのしかレコード」は年132,000円（税込）から（[Forex Robotics](https://www.forexrobotics.jp/inoshika)）。→【仮説】年13万〜150万円 | ★★★ 最優先 |
| **自治体の農政部局・土地改良区・多面的機能支払の活動組織** | 畦畔やため池の漏水・崩れを減らしたい。駆除活動を記録・報告して、交付金を適正に受けたい | 漏水被害。事務負担が重い（活動組織の8割以上が負担を感じ、1割は年1,000時間超: [農水省 施策の評価 2019](https://www.maff.go.jp/j/nousin/kanri/attach/pdf/tamen_sesaku-4.pdf)）。高齢化 | 紙・Excelの活動記録と写真、[農水省 外来生物早期発見ツール](https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/gairai_soukihakken.html)（メールで報告） | 【推計】資源向上支払（共同）の交付額は平均的な組織で最大約215万円/年（式は §3-5）。その0.5〜2.5%を記録に充てると1〜5万円/年。【仮説】 | ★★ 数が多い |
| **研究者・保全団体・NPO** | 希少種の生息地を守りながら、外来種の侵入を早く知りたい。論文や報告に使える検証済みデータがほしい | 位置情報の漏えい（盗掘・密漁）。人手が足りない。データの形式がばらばら | 自前のExcel/GIS、iNaturalist（位置の不明瞭化あり）、いきものログ、[eDNA受託分析](https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/) | 【事実】活動資金は助成金が中心（例: [地球環境基金](https://www.akita-kenmin.jp/docs/2026090500013) 基礎型50〜200万円、[セブン-イレブン記念財団](https://www.aiinanpo.org/info/20260806_56187/) 自然共生サイト認定団体助成は上限300万円/年）。→【仮説】助成金の費目として1件5〜30万円 | ★★ 希少種機能の共同開発相手 |
| **学校・環境教育** | 地域の自然を題材に、安全で手間の少ない探究学習をしたい | 教員の準備負担。生きものの扱いの法令リスク（ウシガエルは生きたままの運搬禁止: [環境省](https://www.env.go.jp/nature/intro/1law/regulation.html)） | 出前授業（[あきた環境学習応援隊](https://www.pref.akita.lg.jp/pages/archive/36470)、[環境あきた県民フォーラム](https://eco-akita.org/)）、環境省の教材 | 【事実】出前授業は無料〜3万円程度が相場という民間の解説がある（[解説記事](https://blog.studyvalley.jp/2024/07/01/onsite-class-cost/)）。講師謝金の基準例は、千葉市で大学教授1時間10,000円（[千葉市](https://www.city.chiba.jp/kyoiku/kyoikusomu/somu/documents/20-10.pdf)）。→【仮説】1回1〜3万円。費用は学校予算より、自治体や企業の事業費から出ることが多い | ★ 投稿者を集めるチャネル |
| **企業**（TNFD・ネイチャーポジティブ・自然共生サイト） | 自社地の生物多様性の状態を見続け、開示・認定・支援証明の証跡を残したい | 専門人材が足りない。調査コスト。指標化が難しい | 環境コンサル（[建設環境研究所](https://www.kensetsukankyo.co.jp/business/biodiversity/oecm.html)など）、Biome（[BiomeSurvey](https://biome.co.jp/products/biomesurvey/)、[BiomeViewer](https://biome.co.jp/products/biomeviewer/)） | 【事実】日本のTNFDアダプターは154社で世界最多（2025-04-11、世界562社: [環境省](https://www.env.go.jp/press/press_04827.html)）。自然共生サイトは累計610（[環境省](https://www.env.go.jp/press/press_05186.html)）。価格は多くが非公開。→【仮説】年10〜100万円。**秋田県内で該当する企業はまだ確認できていない** | ★ 2年目以降 |

### 1-3. 最初に狙う顧客の条件（チェックリスト）

- [ ] アメリカザリガニかウシガエルの被害・苦情・防除計画が、**今年度**話題になっている
- [ ] 交付金や多面的機能支払など、使える外部財源がある
- [ ] 担当者（1人でよい）が「データを見て判断したい」と言っている
- [ ] 希少種や農地など、位置情報の扱いに気を遣う事情がある（ザリダスの強みが効く）

---

## 2. 市場環境（制度・政策・トレンド）

| 分野 | 事実（時点） | ザリダスにとっての意味 | 出典 |
|---|---|---|---|
| 法改正 | 外来生物法の改正（2022年5月公布、**2023-04-01施行**）。都道府県は定着した特定外来生物の被害防止措置を講じ、市町村もこれに努める。「条件付特定外来生物」を新設 | 県と市町村が顧客になる法的根拠 | [環境省 交付金ページ](https://www.env.go.jp/nature/intro/3control/zaiseishien.html)、[e-Gov 法令](https://laws.e-gov.go.jp/law/416AC0000000078/) |
| 指定 | アメリカザリガニ・アカミミガメは **2023-06-01** から条件付特定外来生物。野外への放出、輸入、販売・頒布・購入、販売・頒布目的の飼養等は禁止。一般家庭での飼養と少数への無償譲渡は許可不要 | 投稿画面の注意書きと、駆除個体の利活用の設計に直結 | [環境省](https://www.env.go.jp/nature/intro/2outline/regulation/jokentsuki.html)、[規制内容と手続き](https://www.env.go.jp/nature/intro/2outline/regulation/kisei.html) |
| ウシガエル | 特定外来生物。飼養・保管・生きたままの運搬・輸入・譲渡・放出は原則禁止（その場ですぐ放すのは可）。罰則は個人が3年以下の拘禁刑または300万円以下の罰金、法人が1億円以下の罰金（2025-06-01から懲役は拘禁刑） | 捕獲の投稿画面で「生きたまま持ち帰らない」を必ず表示する | [環境省 禁止事項](https://www.env.go.jp/nature/intro/1law/regulation.html)、[環境省 罰則](https://www.env.go.jp/nature/intro/1law/bassoku.html) |
| 位置づけ | アメリカザリガニは2015年に「緊急対策外来種」に位置づけられた | 優先度の高い対策対象 | [環境省 手引き](https://www.env.go.jp/nature/intro/3control/files/r_amezari_tebiki2.pdf) |
| 交付金 | 特定外来生物防除等対策事業（交付金）。防除事業は交付率1/2、早期防除計画策定事業は定額（上限250万円）。外来種対策戦略検討等事業も定額250万円（2023年時点の資料） | 交付金メニューに入る成果物を売れば、自治体の実質負担が下がる | [環境省](https://www.env.go.jp/nature/intro/3control/zaiseishien.html)、[内閣府 提案募集資料](https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/r05/tb_r5fu_16env_163_a.pdf)、[ERCA](https://www.erca.go.jp/gairaikofukin/index.html) |
| 特別交付税 | 2023年度から対象。交付金事業の地方負担分の5/10、単独事業費の3/10 → **実質負担は最大1/4 または 7/10** | 単独事業でも3割の財源措置がある | [環境省 概要PDF](https://www.env.go.jp/nature/intro/3control/files/zaiseishien_gaiyou02.pdf) |
| 予算 | 環境省の令和8年度**概算要求**で「地方公共団体の外来生物対策支援＋ヒアリ定着防止等」が19億円（前年度6億円）。当初予算の確定額は要確認 | 支援予算は増える方向 | [補助金ポータル](https://hojyokin-portal.jp/columns/kankyosho_gaisanyokyu_r8)、[環境省 外来生物対策費](https://www.env.go.jp/content/000279236.pdf) |
| 申請時期 | 令和7年度から内示を4月上旬に前倒しし、申請締切も早まった（案内は前年度の冬に都道府県経由） | 12〜1月には自治体の計画に載っている必要がある | [内閣府 資料](https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/r05/tb_r5fu_16env_163_b.pdf) |
| 農水 | 「農村地域におけるアメリカザリガニ防除の手引」（**2026年3月**）。駆除手法、評価手法、駆除計画、地域の体制を整理 | 土地改良区と活動組織に「駆除の評価（モニタリング）」の需要が生まれる | [農水省](https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/nouson_amezari.html) |
| 行動計画 | 外来種被害防止行動計画 第2版（2025-03-28）、ベストプラクティス集（2026-03）。生態系被害防止外来種リストを2026-09-11に改定（429→596種類） | 対象種を広げる余地（「水辺の外来種パッケージ」） | [行動計画 第2版](https://www.env.go.jp/content/000301745.pdf)、[ベストプラクティス集](https://www.env.go.jp/nature/intro/2outline/actionplan2/best_practice.pdf)、[農水省 プレス](https://www.maff.go.jp/j/press/kanbo/b_kankyo/260911.html)、[EICネット](https://econavi.eic.or.jp/news/detail/53350) |
| 30by30 | 陸域の保護地域＋OECM は 29.86%、海域は 13.79%（2026年2月時点）。自然共生サイトは累計 **610**（令和8年度第1回、2026年6月） | 企業・団体のモニタリング需要 | [環境省](https://www.env.go.jp/press/press_05186.html)、[農水省](https://www.maff.go.jp/j/press/kanbo/b_kankyo/260630_1.html) |
| 増進法 | 地域生物多様性増進法が **2025-04-01施行**。企業等の「増進活動実施計画」と市町村の「連携増進活動実施計画」を認定する。増進活動には外来生物の防除と希少種の保護を含み、計画にはモニタリングを書く | 「外来種防除のモニタリング」を計画の部品として提供できる | [環境省](https://www.env.go.jp/press/press_04681.html)、[ERCA 手引き](https://www.erca.go.jp/nature/pdf/30by30site-Body-of-Letter.pdf) |
| 支援証明書 | 自然共生サイトを支援した企業等に証明書を出す制度（2024年試行→2025年4月本格運用）。TNFD や IR での活用を想定 | 企業がスポンサーになってお金が流れる経路 | [環境省](https://www.env.go.jp/press/press_04619.html) |
| 保全の交付金 | 生物多様性保全推進交付金（令和8年度）は6メニュー。例: 活動基盤強化は定額上限150万円、国内希少種の生息環境改善は定額上限250万円または150万円 | 保全団体や協議会の資金源 | [環境省](https://www.env.go.jp/press/press_03555.html) |
| 地域戦略 | 生物多様性地域戦略の策定済みは 234（47都道府県＋187市区町村、2026-01-01）。秋田県戦略（2021-2030）は短期目標に「外来種への対応」を入れている | 戦略を持つ自治体が一次ターゲット | [環境省](https://www.env.go.jp/nature/biodiversity/local_gov.html)、[秋田県](https://www.pref.akita.lg.jp/pages/genre/68973) |
| TNFD・ISSB | TNFD の採用は 733組織（2025年11月発表）。日本は154社（2025-04-11、世界562社中で最多）。ISSB は 2026年10月に自然関連の公開草案を出す予定 | 企業の自然データ需要は中期で増える | [TNFD](https://tnfd.global/issb-decision-on-nature-related-standard-setting-drawing-on-tnfd-framework/)、[環境省](https://www.env.go.jp/press/press_04827.html)、[IFRS](https://www.ifrs.org/news-and-events/news/2026/05/issb-agrees-proposed-way-forward-nature-related-disclosures/) |
| 政策の数字 | ネイチャーポジティブ経済移行戦略（2024年3月）は、2030年の国内ビジネス機会を約47兆円と推計（WEF2020ベース。4分の3以上はカーボンニュートラル・循環経済と関連） | 数字は大きいが、外来種モニタリングはそのごく一部。**過大評価しない** | [環境省](https://www.env.go.jp/page_01353.html)、[techno-fer](https://www.technofer-enews.jp/2024/03/29/post-17008/) |
| 国家戦略 | 生物多様性国家戦略2023-2030（2023-03-31 閣議決定）。中間評価は2026年2月 | 市民参加とデータ基盤は国の方針 | [環境省](https://www.env.go.jp/press/press_01379.html)、[中間評価](https://www.env.go.jp/content/000379260.pdf) |
| 国際 | 昆明・モントリオール生物多様性枠組の目標6。外来種の導入・定着率を2030年までに50%以上減らす | 早期発見の需要 | [CBD](https://www.cbd.int/gbf/targets/6) |
| 市民科学 | iNaturalist は観察2億件超・観察者330万人（2024年9月）。Biome は125万ダウンロード・生物データ1,000万件超（2026年3月） | 投稿者集めは大手が強い | [BioScience 2025](https://academic.oup.com/bioscience/article/75/11/953/8185761)、[PR TIMES](https://prtimes.jp/main/html/rd/p/000000083.000044108.html) |
| 環境DNA | 環境省の手引き（淡水魚類・両生類、2024年5月）、環境DNA学会マニュアル ver3.1（2026年5月）、ANEMONE（東北大学、2019年から）。分析は1検体・1種で15,000円（ろ過抽出7,000円＋qPCR 8,000円、3検体から）〜27,500円（税込） | 標準化と低価格化が進んでいる。市民投稿×eDNAの検証は現実的 | [環境省](https://www.biodic.go.jp/edna/edna_top.html)、[環境DNA学会](https://ednasociety.org/wp-content/uploads/2026/05/%E7%92%B0%E5%A2%83DNA%E8%AA%BF%E6%9F%BB%E3%83%BB%E5%AE%9F%E9%A8%93%E3%83%9E%E3%83%8B%E3%83%A5%E3%82%A2%E3%83%AB_ver3_1.pdf)、[東北大学](https://www.tohoku.ac.jp/japanese/2025/04/press20250421-01-dna.html)、[生物技研](https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/)、[日吉](https://hiyoshi-online.com/SHOP/B_KD20_001.html) |
| 調達 | 少額随意契約の基準額を引き上げ（2025-04-01）。都道府県・指定都市の「その他の契約」は200万円、市町村は原則その1/2 | 年100万円以下のパッケージは市町村で随意契約しやすい（各自治体の規則で要確認） | [総務省](https://www.soumu.go.jp/main_content/001026062.pdf)、[ジチタイワークス](https://jichitai.works/articles/3144) |
| 近い市場 | 鳥獣害の捕獲記録アプリ「スマートHOKAKU」は198市町村が導入（2024年10月）。「いのしかレコード」は年132,000円から | 「捕獲記録のデジタル化に自治体がお金を払う」前例 | [農研機構](https://www.naro.go.jp/laboratory/brain/contents/fukyu/episode/episode_list/166482.html)、[Forex Robotics](https://www.forexrobotics.jp/inoshika) |

---

## 3. 市場規模

### 3-1. 定義

- **対象市場**: 外来種や生物多様性の現場データ（市民投稿、捕獲・痕跡・被害・不在の記録、検証）を、防除や保全の判断に使える形で提供するサービスへの年間支出。
- **含めないもの**: 環境コンサルの調査業務全体、eDNA分析会社の売上、助成金（売上ではないので §6 で別に扱う）。

### 3-2. TAM（全国・年額）【推計】

| セグメント | 顧客数（事実） | 年間単価（前提） | 計算式 | 年額（低〜高） | 出典・根拠 |
|---|---|---|---|---|---|
| B2G（都道府県＋市区町村） | 1,788（47都道府県＋1,741市区町村） | 13.2万〜150万円 | 1,788 × 13.2万 〜 1,788 × 150万 | **2.36億〜26.8億円** | 市区町村数: [e-Stat](https://www.e-stat.go.jp/municipalities/number-of-municipalities)、[SSDSE解説](https://www.nstac.go.jp/sys/files/kaisetsu-A-2024.pdf)（792市・743町・183村・23特別区）。単価は §3-5 |
| 農業（多面的機能支払の活動組織） | 25,967組織（令和4年度、農地維持支払） | 1万〜5万円 | 25,967 × 1万 〜 25,967 × 5万 | **2.60億〜13.0億円** | [農水省 資料](https://www.maff.go.jp/j/nousin/kanri/tamen_siharai/n_sansya/attach/pdf/r5_2kai-3.pdf)。単価は §3-5 |
| 企業・団体（自然共生サイト） | 610サイト（累計、2026年6月） | 10万〜100万円 | 610 × 10万 〜 610 × 100万 | **0.61億〜6.10億円** | [環境省](https://www.env.go.jp/press/press_05186.html)。単価は【仮説】 |
| **合計 TAM** | | | | **約5.6億〜45.9億円/年** | |

### 3-3. SAM（東北6県・年額）【推計】

- 東北の市町村数: 青森40＋岩手33＋宮城35＋秋田25＋山形35＋福島59 ＝ **227**（[J-LIS 都道府県別市区町村数](https://www.j-lis.go.jp/spd/code-address/kenbetsu-inspection/cms_11914151.html)、秋田は13市9町3村: [J-LIS 秋田](https://www.j-lis.go.jp/spd/code-address/touhoku/cms_12614180.html)）
- 活動組織数と自然共生サイト数の東北の内訳は見つからなかった。そこで **市町村数の東北シェア 227 ÷ 1,741 ＝ 13.0%** で代用する（粗い前提）。

| セグメント | 計算式 | 年額（低〜高） |
|---|---|---|
| B2G | （6県＋227市町村＝233）× 13.2万〜150万 | 0.31億〜3.50億円 |
| 農業 | 25,967 × 13.0% ≒ 3,386組織 × 1万〜5万 | 0.34億〜1.69億円 |
| 企業・団体 | 610 × 13.0% ≒ 80サイト × 10万〜100万 | 0.08億〜0.80億円 |
| **合計 SAM** | | **約0.7億〜6.0億円/年** |

前提となる製品の変更: 投稿を秋田県外にも開く（現在の投稿は秋田県内のみ: LP FAQ `src/locales/ja/translation.json`）。自治体ごとの閲覧権限も必要。

### 3-4. SOM（3年以内・秋田中心・3年目の年額）【推計】

| 項目 | 低 | 基本（仮置き） | 高 | 前提 |
|---|---|---|---|---|
| B2G | 2件 × 13.2万 ＝ 26.4万 | 3件 × 50万 ＝ 150万 | 5件 × 150万 ＝ 750万 | 県1＋県内25市町村のうち数件 |
| 農業 | 5組織 × 1万 ＝ 5万 | 10 × 2万 ＝ 20万 | 30 × 5万 ＝ 150万 | 秋田市だけで資源向上支払は63地区（[秋田市 R7予算案](https://www.city.akita.lg.jp/_res/projects/default_project/_page_/001/009/191/toushoyosannann07.pdf)） |
| 企業・団体 | 0 | 1 × 30万 ＝ 30万 | 3 × 100万 ＝ 300万 | 県内の該当企業は未確認 |
| 教育 | 5回 × 1万 ＝ 5万 | 10 × 2万 ＝ 20万 | 20 × 3万 ＝ 60万 | 謝金基準・相場（§1） |
| **合計（売上）** | **36.4万円** | **220万円** | **1,260万円** | 助成金は別枠（§6-2） |

【判断】1人で運営する限り、年間に回せる B2G 案件は数件が上限。SOM の上側に届くかは、協力者と法人化の判断（2027年春）で決まる。

### 3-5. 単価の根拠（計算式つき）

| 単価 | 根拠 | 区分 |
|---|---|---|
| B2G 下限 13.2万円/年 | 自治体向け捕獲記録SaaS「いのしかレコード」の公開価格は年132,000円（税込）から（[Forex Robotics](https://www.forexrobotics.jp/inoshika)） | 事実を流用 |
| B2G 上限 150万円/年 | 生物多様性保全推進交付金「活動基盤強化」の定額上限150万円（[環境省](https://www.env.go.jp/press/press_03555.html)）。市町村の少額随意契約の上限（都道府県200万円の原則1/2: [総務省](https://www.soumu.go.jp/main_content/001026062.pdf)）とも近い水準 | 仮説 |
| 自治体の実質負担の例 | 事業費150万円を交付金事業で行う場合: 国の交付金 1/2 ＝ 75万円 → 残り75万円の 5/10 ＝ 37.5万円が特別交付税 → **実質負担は37.5万円（事業費の1/4）**（[環境省](https://www.env.go.jp/nature/intro/3control/zaiseishien.html)、[概要PDF](https://www.env.go.jp/nature/intro/3control/files/zaiseishien_gaiyou02.pdf)） | 推計 |
| 農業 1万〜5万円/年 | 1組織あたりの平均面積 ＝ 2,329,276ha（令和7年度の農地維持支払の認定農用地: [農水省](https://www.maff.go.jp/j/press/nousin/tyusan/260831.html)）÷ 25,967組織（令和4年度）≒ 89.7ha（**年度が違う点に注意**）。資源向上支払（共同）の田の単価は都府県で 2,400円/10a ＝ 24,000円/ha（[農水省](https://www.maff.go.jp/j/nousin/kanri/tamen_siharai.html)）。89.7ha × 24,000円 ≒ **215万円/年**（全面積が田で、資源向上に取り組む場合の上限的な推計）。その0.5〜2.5%を記録ツールに充てると **1.1万〜5.4万円** | 推計 |
| 企業 10万〜100万円/年 | 公開価格は見つからなかった。上限は、自然共生サイトを管理する団体向けの助成が上限300万円/年（[セブン-イレブン記念財団](https://www.aiinanpo.org/info/20260806_56187/)）なので、その1/3程度をモニタリングに回すと仮定 | 仮説 |
| 教育 1万〜3万円/回 | 相場の民間解説（[記事](https://blog.studyvalley.jp/2024/07/01/onsite-class-cost/)）と謝金基準の例（[千葉市](https://www.city.chiba.jp/kyoiku/kyoikusomu/somu/documents/20-10.pdf)） | 仮説 |

### 3-6. 不確実性と感度

- 最大の不確実性は **B2G の件数と単価**。SOM の B2G 部分（件数 × 単価）は次のとおり。

| 件数 ＼ 単価 | 15万円 | 50万円 | 100万円 |
|---|---|---|---|
| 1件 | 15万 | 50万 | 100万 |
| 3件 | 45万 | 150万 | 300万 |
| 5件 | 75万 | 250万 | 500万 |

- 桁感の確認【推計・参考】: 環境省の R8 概算要求19億円（ヒアリ対策を含む）を交付率1/2で割り戻すと、交付金事業の事業費は最大で数十億円規模になる。B2G の TAM（2.4億〜26.8億円）は同じ桁に収まる。
- 【判断】VC が求める規模（TAM 数百億円以上）には届かない。対象種と対象業務を広げない限り、小規模事業として設計すべき。

---

## 4. 競合・代替手段の比較表

### 4-1. 比較表

| 名称 | 運営・種別 | ビジネスモデル | 価格（公開情報） | 強み | 弱み | ザリダスとの違い |
|---|---|---|---|---|---|---|
| **iNaturalist** | 米国の独立非営利（2023年7月から: [FAQ](https://www.inaturalist.org/pages/spinoff_faq)） | 無料。寄付、財団、企業の現物支援 | 無料 | 観察2億件超・330万人（2024年9月: [BioScience](https://academic.oup.com/bioscience/article/75/11/953/8185761)）。AI同定、GBIF連携、geoprivacy | 日本の行政の実務（捕獲・被害の記録、議会向け報告）は想定していない【推測】。日本のレッドリスト種の自動保護は分類群ごとの運用（§4-3） | 特定種×地域に絞り、不在確認・努力量を記録し、行政向けレポートを出す |
| **Biome**（株式会社バイオーム） | 京都大学発のスタートアップ（2017年設立） | アプリは無料（広告・課金なし: [公式](https://biome.co.jp/app-biome/)）。自治体と企業からの受託とツール利用料 | BiomeSurvey などの料金は非公開（[料金ページ](https://biome-survey.com/price/)に価格の記載なし） | 125万ダウンロード・1,000万件超（2026年3月: [PR TIMES](https://prtimes.jp/main/html/rd/p/000000083.000044108.html)）。企業500社超・自治体と官公庁120以上・研究機関30以上との実績（2026年2月: [PR TIMES](https://prtimes.jp/main/html/rd/p/000000082.000044108.html)）。TNFD公認ツール。千葉県の外来水生植物マップに採用 | 汎用（全生物）で、防除の実務（捕獲・痕跡・被害・不在）は主目的ではない【推測】。秋田での自治体案件は未確認 | 防除判断と eDNA 検証に特化し、希少種と外来種を同時に管理する |
| **いきものログ**（環境省） | 国（生物多様性センター、2013年10月開始） | 無料（公費） | 無料 | 公的で無料。団体を登録すれば独自の市民調査を作れる。レッドリスト種はメッシュ表示に制限あり（[いきものログ](https://ikilog.biodic.go.jp/Guide/)） | 使いやすさや継続参加の仕掛けは弱い【推測】。防除の現場支援はない | 使いやすさ、ゲーミフィケーション、地域での個別支援 |
| **自治体の通報フォーム・県マップ**（例: [福島県](https://www.pref.fukushima.lg.jp/sec/16035b/gairaishuhoukoku.html)、[あきる野市](https://www.city.akiruno.tokyo.jp/0000015249.html)）、**農水省 早期発見ツール**（[メール報告](https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/gairai_soukihakken.html)） | 自治体・国 | 内製、無料 | 無料 | 窓口がはっきりしていて、行政が直接受け取る | 写真と位置の質がそろわない。分析や投稿者への返事がない【推測】 | 品質管理、分析、投稿者への還元 |
| **環境DNA受託**（[生物技研](https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/)、[日吉](https://hiyoshi-online.com/SHOP/B_KD20_001.html)、[山口大学 環境DNA研究センター](http://cedna.kenkyu.yamaguchi-u.ac.jp/analysis.html) など） | 企業・大学 | 検体単価の受託分析 | 1検体・1種 15,000円（3検体から）／27,500円（税込） | 客観的に在・不在を検出できる。標準化が進んでいる | 採水地点を選ぶ必要がある。面で分布を把握すると高くつく | **補完関係（提携先）**。市民投稿で地点を絞り、eDNAで確かめる |
| **建設・環境コンサル**（[いであ](https://www.ideacon.co.jp/pdf/ir/library/earnings/25_4quarterly.pdf)、[建設環境研究所](https://www.kensetsukankyo.co.jp/business/biodiversity/oecm.html) など） | 上場・大手 | 入札やプロポーザルでの受託 | 非公開（案件ごと） | 専門家、入札資格、実績。いであの環境コンサルタント事業の売上は159.6億円（2025年12月期）。自然共生サイトの認定支援や TNFD 支援もある | 単発で高コスト。継続的な市民データは弱い【推測】 | 継続モニタリングを安く提供する。**下請けや協業の相手にもなる** |
| **鳥獣害の捕獲記録SaaS**（[スマートHOKAKU](https://www.naro.go.jp/laboratory/brain/contents/fukyu/episode/episode_list/166482.html)、[いのしかレコード](https://www.forexrobotics.jp/inoshika)） | 公的研究発・企業 | 自治体向けSaaS | いのしかレコードは年132,000円から | スマートHOKAKU は198市町村に導入（2024年10月） | 外来種や水辺は対象外 | 直接の競合ではない。**価格と営業の参考になる前例** |
| **ザリマップ**（[maps.zaritsuri.com](https://maps.zaritsuri.com/)） | 不明（ザリガニ釣り愛好家向け） | 不明 | 不明 | 愛好家のコミュニティ | 行政や研究の用途ではない | 目的が違う |
| **EDDMapS**（米国: [About](https://www.eddmaps.org/about/)） | ジョージア大学の研究センター | 行政・財団の助成で無料提供 | 無料 | 外来種専用。米国とカナダ全域で運用 | 日本にはない | **「外来種専用の通報基盤は公的資金で回ることが多い」**＝事業モデル上の注意点 |

### 4-2. Biome の自治体・企業向け事業（深掘り）

| 項目 | 事実 | 出典 |
|---|---|---|
| 提供物 | 市民協働いきもの調査（自治体専用の生物データ収集・基盤構築）、BiomeSurvey（組織向けの生物調査支援ツール）、BiomeViewer（TNFD公認ツール、約1kmメッシュの分布推定、2026年5月に分析を強化）、BiomeDB、TNFD対応支援パッケージ、外来種対策支援 | [市民協働](https://biome.co.jp/services/citizen-science/)、[BiomeSurvey](https://biome.co.jp/products/biomesurvey/)、[BiomeViewer](https://biome.co.jp/products/biomeviewer/)、[2026-05 プレス](https://biome.co.jp/news/press_20260511/)、[外来種対策支援](https://biome.co.jp/services/invasive-species-solutions/) |
| 外来種の事例 | 千葉県「みんなでつくろう！ちば外来水生植物マップ」（2025年・2026年、Biome を使用）。国立環境研究所とのアメリカナマズ全国調査（2020年度）。KDDI などとの西表島の外来種調査（2023年9月） | [千葉県](https://www.pref.chiba.lg.jp/shizen/press/2026/260601nagaetyosa.html)、[国環研](https://www.nies.go.jp/whatsnew/20210325/20210325.html)、[KDDI](https://newsroom.kddi.com/news/detail/kddi_pr-982.html) |
| 自治体との連携 | 東京都「東京いきもの調査団」、足立区など | [PR TIMES](https://prtimes.jp/main/html/rd/p/000000074.000044108.html) |
| 資金と提携 | シリーズBで3.3億円（2023年4月）。NTTドコモ・ベンチャーズが出資（2025年3月、金額非公開）。日本自然保護協会と連携協定（2026-03-26） | [Biome](https://biome.co.jp/news/seriesb-fundraising/)、[共同通信PR](https://kyodonewsprwire.jp/release/202503256267)、[PR TIMES](https://prtimes.jp/main/html/rd/p/000000083.000044108.html) |
| 希少種の扱い | 希少種の位置は地図上で強制的に非公開（DB には保持）。撮影地は市区町村単位で表示し、非公開にもできる | [Biome マニュアル](https://manual.biome.co.jp/faq/data/) |

- **ザリダスにとっての意味【判断】**: 自治体が「市民参加の生きもの調査」を考えるとき、最初に思い浮かぶのは Biome になりやすい。汎用のクエストで勝負せず、「防除の実務」（捕獲・痕跡・被害・不在、eDNA 検証、希少種の保護）で差をつける。Biome の汎用データとザリダスの防除データは補い合うので、連携の余地もある【仮説】。

### 4-3. iNaturalist の geoprivacy と、希少種の位置保護の比較

| 項目 | iNaturalist | Biome | いきものログ | ザリダス（現状） | ザリダス（希少種機能の推奨） |
|---|---|---|---|---|---|
| 公開する粒度 | 本当の座標を含む 0.2°×0.2° のセル内のランダムな点（赤道で約500km²。秋田の緯度では約22km×17km【推計: 111.3km×0.2、111.3km×cos39.7°×0.2】） | 市区町村単位。希少種は地図で強制非公開 | レッドリスト種は指定メッシュ（80/20/10/5/1km）で見られない場合がある | 記録ごとに「正確／約111m に粗化／非公開」。2種の既定は粗化（111m は緯度方向。経度方向は秋田で約86m【推計】） | 既定は「非公開」。公開は10km以上のメッシュ集計だけ |
| 自動保護 | 保全状況で自動的に不明瞭化し、一部は非公開（taxon geoprivacy） | 希少種は強制非公開 | 公開してよい種を選んでいる | 種ごとの既定値のみ。**REQ-329（本ブランチ・未デプロイ）で、投稿者が「位置を非公開」を選べる／名前付きの非公開スポットを保存できる／非公開投稿の字名・水系名も公開列から外す**を追加。種による自動保護はまだ無い | 環境省レッドリスト、秋田県RDB、国内希少種のリストで自動的に保護 |
| 正確な座標を見られる人 | 本人、信頼したユーザー、信頼したプロジェクト管理者（プロジェクトの trust 機能は2021年2月から） | 運営（DB に保持） | 不明 | 本人と管理者 | 本人＋指名した保全団体・自治体の担当者（期限付き、監査ログあり） |
| 公開データ | GBIF へ（不明瞭化した座標） | 要望に応じて提供 | ダウンロード可（制限あり） | 承認済みだけ。小数第3位に粗化し、個人情報は除く（CC BY 4.0） | 希少種は公開データから除く |
| 出典 | [Geoprivacy](https://www.inaturalist.org/pages/geoprivacy)、[Help](https://help.inaturalist.org/en/support/solutions/articles/151000169938-what-is-geoprivacy-what-does-it-mean-for-an-observation-to-be-obscured-)、[Sensitive species](https://help.inaturalist.org/en/support/solutions/articles/151000233080-how-does-inaturalist-protect-the-locations-of-sensitive-species-)、[Forum: trust](https://forum.inaturalist.org/t/clarifying-geoprivacy-reasons-for-obscured-coordinates-user-to-user-trust/730) | [マニュアル](https://manual.biome.co.jp/faq/data/) | [ガイド](https://ikilog.biodic.go.jp/Guide/) | `docs/current/privacy.md`、`docs/current/public-dataset.md` | 本レポートの提案 |

- **日本での注意点**: iNaturalist で環境省レッドリストの保全状況を登録する作業は、コミュニティで議論しながら分類群ごとに進められた。位置の既定が「公開」で登録されたケースもある（[投稿 38308](https://www.inaturalist.org/posts/38308)、[投稿 43955](https://www.inaturalist.org/posts/43955-)。コミュニティの投稿なので要確認）。**秋田の希少な淡水魚や両生類が自動で守られるとは限らない。** ここはザリダスが差をつけられる点。
- **公的な考え方**: 重要な種の生息・生育場所を特定できる情報は、盗掘などのおそれがあれば開示しない（組み合わせて特定できる情報も含む）（[国交省 資料](http://www.cgr.mlit.go.jp/okakawa/kouhou/takahashi_asesu/doc/com02/03.pdf)）。
- **ザリダス特有のリスク**: ゼニタナゴのいるため池でザリガニの捕獲報告を出すと、外来種の投稿から希少種の池が推定されてしまう。→ **「センシティブ地点」の周辺では、外来種の投稿も自動で非公開にする**機能が要る（§8）。

---

## 5. ザリダスのポジショニングと差別化

### 5-1. ポジショニング（一文・コピペ用）

> **「秋田のため池と水田で、特定外来種を“どこから・どれだけ駆除するか”決めるための、検証済みの市民データと行政レポート」**

### 5-2. 位置取り

| | 汎用（全生物） | 特定種・特定業務 |
|---|---|---|
| **楽しむ・学ぶ**（投稿者が中心） | iNaturalist、Biome アプリ、いきものログ | ザリマップ |
| **判断する・報告する**（行政と現場が中心） | 環境コンサル、Biome の法人向け | **ザリダス（狙う位置）**、鳥獣害の捕獲記録SaaS |

### 5-3. 差別化の要素（実装済みの事実から）

| 要素 | ザリダスの実装（事実） | 顧客にとっての価値 | 競合との比較 |
|---|---|---|---|
| 特定種×地域特化 | 情報種別に 目撃・捕獲・痕跡・農業被害・不在確認。秋田の全25市町村。市町村別ページ（`src/lib/constants.ts`、LP） | 防除計画に要る「被害」「痕跡」「不在」まで取れる | 汎用アプリは「いた」の記録が中心【推測】 |
| 研究品質 | AI は判断材料で、自動承認はしない（人が審査）。XP は承認された投稿だけに付き、不在確認に加点、1日の上限あり。調査時間・調査手法を記録。監査ログ。CC BY 4.0 と DOI（予定）（`docs/current/moderation.md`、`gamification.md`、`public-dataset.md`） | 行政や論文で使える | 努力量や不在の扱いは競合側を要確認 |
| 位置プライバシー | 記録ごとに正確・粗化・非公開を選べ、既定は粗化。EXIF を除去。座標は列レベルの権限で守る（RLS）（`docs/current/privacy.md`）。REQ-329 で投稿者自身が非公開を選べ、希少種の地点を非公開スポットとして記録できる（未デプロイ） | 地権者と希少種を守れる | iNaturalist や Biome にも保護はある。**同等以上にする必要がある** |
| 行政の意思決定につなぐ | 調査依頼（依頼→応答→完了）、定点サイト、CSV・GeoJSON（`docs/current/survey-requests.md`） | 「次にどこを見に行くか」を行政や団体が指示できる | コンサルは単発 |
| 環境DNAで検証 | 研究で Cohen's κ を使って一致度を検証（仮説 H1: 鳥海ダム周辺で κ ≥ 0.4）（`README/01-research-context.md`） | 市民データの信頼性を数値で示せる | 公開事例は少ない【推測】 |
| 地元の研究者 | 秋田県立大学の卒業研究。日本環境教育学会でポスター発表（P実07） | 信頼され、現地に行ける | 大手は遠くから対応 |

**実績（公開ページ記載値）**: LP（/lp の「Numbers」）には累計の報告数と参加者数が表示される実装になっている。ただし本調査では zaridasu.com に接続できず取得できなかった。**提案書に入れる前に、次の欄を本人が埋めること。**

| 指標 | 値 | 取得日 | 出典 |
|---|---|---|---|
| 集まった報告（件） | （未取得） | | https://zaridasu.com/lp |
| いっしょに参加している人（人） | （未取得） | | https://zaridasu.com/lp |

### 5-4. 弱点（正直に）

1. **対象が2種で、投稿は秋田県内だけ** → 市場が小さい（§3）。
2. **運営が1人。** 審査（AI は自動承認しない）、開発、営業、研究をすべて1人で担う。卒業（2027年3月）で続けられなくなるリスクもある。
3. **契約・導入の実績がゼロ。** 法人格も入札参加資格もない（個人事業）ので、行政調達で不利。
4. **データは CC BY 4.0 で公開している** → データを囲い込めない。差別化は運用、関係づくり、検証でつくるしかない。
5. **季節性。** 冬は投稿が大きく減る見込み【仮説: 自社データで確認】。データ収集は7〜9月が中心（`README/01-research-context.md`）。
6. **AI 同定は外部の汎用モデル（Gemini）頼み** → コストと精度を外部に依存している。
7. **学生プロジェクトというブランド** → 行政の信頼を得るには、大学や NPO との連名が要る。
8. **Biome などの大手**は、外来種のクエストを低コストで提供できる。

### 5-5. 勝ち筋の条件【判断】

- 「アプリ」ではなく、**防除判断の成果物**（分布図、優先地点、効果検証）を売る。
- **eDNA とセット**で信頼性を示す（ザリダスの研究そのもの）。
- **希少種の保護を先に作り**、保全団体を味方にする。
- 対象種を広げる（例: 水辺の特定外来生物パッケージ）のは、**秋田で有料顧客を3件得てから**。

---

## 6. 収益モデル候補

### 6-1. 比較表（◎＝初年度から現実的、○＝可能性あり、△＝難しい、×＝初年度は無理）

| # | モデル | 顧客 | 提供物 | 単価の根拠 | 実現難度 | 初年度の現実性 |
|---|---|---|---|---|---|---|
| 1 | B2G ダッシュボード（年額） | 市町村・県 | 市町村別の分布と推移、月次レポート、CSV | 年13.2万円から（類似SaaS: [いのしかレコード](https://www.forexrobotics.jp/inoshika)）。市町村は100万円以下なら随意契約しやすい（[総務省](https://www.soumu.go.jp/main_content/001026062.pdf)） | 中（実績と信頼） | △（1件取れれば上出来） |
| 2 | B2G 受託（交付金事業の一部） | 県・市町村 | 分布調査の設計、市民調査イベント、eDNA 10地点、効果検証の報告 | 交付金の定額250万円メニュー、防除事業は1/2（[環境省](https://www.env.go.jp/nature/intro/3control/zaiseishien.html)）。eDNA の原価は 10地点×(7,000＋8,000円) ＝ 15万円【推計: [生物技研](https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/)の価格、税の扱いは原典で確認】 | 高（法人格、入札資格、実績） | △（県や大学との連携受託なら可能性あり） |
| 3 | 農業（活動組織・土地改良区） | 活動組織 | 駆除と痕跡の記録、写真つき活動記録の自動整形 | 1〜5万円/年【推計 §3-5】 | 中（IT リテラシー、合意形成） | ○（無料パイロット）→ 有料化は2年目 |
| 4 | 保全団体・NPO | NPO・研究者 | 希少種を非公開で記録する専用スペース、侵入アラート | 助成金の費目として5〜30万円/件【仮説】 | 低〜中 | ○ |
| 5 | 企業（自然共生サイト・TNFD） | 事業所 | 自社地の外来種モニタリングと報告書 | 10〜100万円/年【仮説】 | 高（営業力、Biome などとの競合） | ×〜△ |
| 6 | 教育プログラム | 学校・自治体 | 出前授業、教材、クラス用の投稿 | 1〜3万円/回（[相場の解説](https://blog.studyvalley.jp/2024/07/01/onsite-class-cost/)、[謝金基準の例](https://www.city.chiba.jp/kyoiku/kyoikusomu/somu/documents/20-10.pdf)） | 低 | ○（金額は小さい） |
| 7 | 助成金・財団 | — | 研究・普及活動の費用 | §6-2 | 中（受け皿の団体が要る） | ◎ |
| 8 | 駆除個体の利活用 | 飲食、イベント、肥料 | 食用、肥料化 | 豊洲で1kg約3,000円という報道（[nippon.com](https://www.nippon.com/ja/japan-topics/g02070/)、掲載年は原典で確認）。イベントで唐揚げが短時間で完売した事例（[シナイモツゴ郷の会](https://www.jstage.jst.go.jp/article/sscawnrjs/16/0/16_53/_article/-char/ja/)） | 高（生きたままの販売は禁止。死んだ個体の料理提供は規制外だが、商業的に繁殖させる場合は許可が要る: [環境省](https://www.env.go.jp/nature/intro/2outline/regulation/kisei.html)。食品衛生の手続きも必要） | ×（研究の RQ2 として検証する段階） |
| 9 | データ提供 | 研究・行政 | 公開データは無料（CC BY）。付加価値のある分析は受託で出す | — | 中（利用規約の範囲） | △（**精密座標の有償提供はしない**） |

### 6-2. 助成金・財団（締切が近い順・2026-09-26時点）

| プログラム | 金額 | 締切・時期 | 対象・注意 | 出典 |
|---|---|---|---|---|
| SOMPO環境財団 環境保全プロジェクト助成（2026年度） | 上限20万円（10団体程度） | **2026-10-16**（当日消印有効） | 環境分野で実践や普及啓発をする団体 | [SOMPO環境財団](https://www.sompo-ef.org/project/project.html)、[岩手県NPOセンター](https://www.aiinanpo.org/info/20260922_56996/) |
| セブン-イレブン記念財団 2027年度 環境市民活動助成 | 地域美化助成は最大50万円/年。自然共生サイト認定団体助成は上限300万円/年・原則3年（認定済み団体のみ）。ほかに活動助成・未来へつなごう助成など | **2026-10-30** | 非営利の任意団体・NPO など | [財団](https://www.7midori.org/josei/)、[EPO中国](https://epo-cg.jp/blog/261030seven-elevenbika/)、[岩手県NPOセンター](https://www.aiinanpo.org/info/20260806_56187/) |
| 地球環境基金 2027年度（ERCA） | 通常助成の基礎型は50〜200万円・1年。発展型は200〜800万円・最大3年 | **2026-10-13 正午〜11-16 13:00** | 民間団体 | [秋田県市民活動情報ネット](https://www.akita-kenmin.jp/docs/2026090500013)、[ERCA](https://www.erca.go.jp/jfge/subsidy/) |
| みちのくGAPファンド（MASP） | ソーシャル・イノベーション枠は1件200万円以下（令和8年度、5件程度） | 令和8年度は 2025-12-01〜2026-01-16。令和9年度も同じ時期と推測（要確認） | MASP に参画する大学の研究者・大学院生が対象。**秋田県立大学が参画しているかは未確認** | [MASP](https://michinoku-academia-startup.jp/r8michinokugapfund-2/)、[MASPとは](https://michinoku-academia-startup.jp/about/) |
| 秋田県 シン・若者チャレンジ応援事業 | トライアル10万円（10/10）、2年間で最大400万円 | 令和8年度は 2026-07-31 に締切済み。次回は2027年夏と推測 | 18歳以上40歳未満の個人など | [秋田県](https://www.pref.akita.lg.jp/pages/archive/97653)、[特設サイト](https://akita-wakamono-challenge.com/) |
| プロ・ナトゥーラ・ファンド（自然保護助成基金） | 50〜200万円（区分による） | 第37期は 2026-07-09 に締切済み。次期は2027年夏と推測 | 3人以上のグループ | [基金](https://www.pronaturajapan.com/foundation/pronatura_fund.html)、[秋田県市民活動情報ネット](https://www.akita-kenmin.jp/docs/2026052900011) |
| 経団連自然保護基金（国内） | 一般枠は上限100万円/年、地域型市民活動枠は上限50万円 | 公式サイトで要確認 | 要件あり | [基金](https://www.keidanren.net/kncf/fund)、[京都市民活動](https://shimisen-kyoto.org/subsidy/47597) |
| イオン環境財団 環境活動助成 | 総額1億円/年 | 第37回の公募は2027年6月開始予定 | — | [財団](https://www.aeonkankyozaidan.or.jp/environmental_activities_grant/public_offering/about.html) |
| パタゴニア 環境助成金プログラム | 5,000〜20,000米ドル | 2026年度は 2026-08-31 に締切済み | 草の根の非営利環境団体 | [パタゴニア](https://www.patagonia.jp/environmental-grants-and-support.html)、[ELEMINIST](https://eleminist.com/article/4741) |

**注意【判断】**: ほぼすべてが「団体」向け。個人事業ライラックとは別に、受け皿として**3人以上の任意団体**（例: 本人、協力する教員や研究者、地元 NPO）を作るのが前提になる。

---

## 7. Go-to-Market

### 7-1. 基本方針

- 売るのはアプリ利用料ではなく、**防除判断の成果物**（分布図、優先地点、効果検証）。
- **自治体の予算カレンダーに合わせる。** 5〜8月に事業の種まき、9〜10月に予算要求、11〜12月に査定、1月に首長査定、2〜3月に議会（[千葉市 予算編成の流れ](https://www.city.chiba.jp/zaiseikyoku/zaisei/zaisei/documents/01nagare_3.pdf)）。交付金は前年度の冬に申請する（[内閣府 資料](https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/r05/tb_r5fu_16env_163_b.pdf)）。→ **2026年9〜12月は、令和9年度に入れる最後の窓。**
- **価格は、市町村の少額随意契約に収まる年額パッケージ（100万円以下）を基本にする**（各自治体の規則で要確認）。

### 7-2. 地域展開の順序

| フェーズ | 期間 | 地域 | 目標 | KPI | 必要な製品の変更 |
|---|---|---|---|---|---|
| 0 検証 | 2026-10〜2027-03 | 秋田（県＋2〜3市町） | 10者ヒアリング、LOI か覚書を1件、助成を1件 | ヒアリング数、「来年度に検討する」の回答数 | レポート出力（PDF/CSV） |
| 1 初期の有料化 | 2027-04〜2028-03 | 秋田 | 有料3〜5件（B2G 1〜2件＋活動組織・NPO） | 年間売上、継続率 | 自治体別の閲覧権限、希少種機能 |
| 2 東北 | 2028-04〜 | 宮城・山形・岩手 | 提携経由で東北の2県 | 導入自治体数 | 投稿エリアを県外に開く |
| 3 全国・拡張 | 2029〜 | 全国 | 対象種や業務を広げる、または大手と提携 | 年間経常収益 | 多種対応 |

### 7-3. 最初の10顧客（候補。すべて未接触で、困りごとは仮説）

| # | 候補 | 困っていそうなこと（仮説） | 提案 | 入口 | 根拠 |
|---|---|---|---|---|---|
| 1 | 秋田県 生活環境部 自然保護課 | 地域戦略の短期目標「外来種への対応」の進み具合が見えない | 県全域のダッシュボード＋年次の分布レポート（交付金事業に組み込む） | 指導教員、学会発表の資料 | [秋田県戦略](https://www.pref.akita.lg.jp/pages/genre/68973) |
| 2 | 秋田県 農林水産部（農村整備の担当） | 2026年3月の手引を県内にどう広げるか | 活動組織向けの駆除記録テンプレート＋県での集計 | 秋田県多面的機能支援協議会 | [農水省 手引](https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/nouson_amezari.html)、[協議会](https://www.hozen.vt-akita.com/) |
| 3 | 秋田市 | 資源向上支払の63地区。大森山動物園でのゼニタナゴ保全 | 市版のダッシュボード＋希少種の保護 | 環境部局、動物園 | [秋田市](https://www.city.akita.lg.jp/_res/projects/default_project/_page_/001/009/191/toushoyosannann07.pdf)、[大森山動物園](https://www.city.akita.lg.jp/zoo/milve/1003816.html) |
| 4 | 由利本荘市 | 鳥海ダム周辺（研究フィールド） | eDNA×市民投稿の検証レポート | 研究協力 | `README/01-research-context.md`、[鳥海ダム工事事務所](https://www.thr.mlit.go.jp/chokai/) |
| 5 | 三種町 | ジュンサイ池の食害 | 生産池の被害と捕獲の記録 | JA、生産者団体 | [環境省 手引き](https://www.env.go.jp/nature/intro/3control/files/r_amezari_tebiki2.pdf) |
| 6 | 土地改良区（秋田市内の各区など） | 畦畔や水路の漏水 | 痕跡（巣穴）マップ | 水土里ネット秋田 | [農研機構](https://www.naro.go.jp/project/results/laboratory/nkk/2008/nkk08-20.html)、[水土里ネット秋田](https://www.akita-midori.net/midori/area.htm) |
| 7 | 多面的機能支払の活動組織（2〜3組織） | 記録と報告の事務負担 | 写真つき活動記録 | 市町村の農政担当 | [農水省 施策の評価](https://www.maff.go.jp/j/nousin/kanri/attach/pdf/tamen_sesaku-4.pdf) |
| 8 | NPO法人秋田水生生物保全協会 | ゼニタナゴがいる池の保護 | 希少種の非公開記録＋ザリガニ侵入アラート | 大学、動物園 | [秋田市 広報 2021](https://www.city.akita.akita.jp/city/pl/pb/koho/htm/20210618/061808.html) |
| 9 | 学校（あきた環境学習応援隊経由） | 探究学習の題材 | 出前授業＋クラスでの投稿 | 応援隊に登録 | [秋田県](https://www.pref.akita.lg.jp/pages/archive/36470) |
| 10 | 企業・国の事業（県内事業所の緑地やため池、ダムの環境モニタリングを受託している会社） | 自然共生サイト、事後調査 | 外来種モニタリングの報告 | 県の SDGs パートナー、コンサル経由 | [環境省](https://www.env.go.jp/press/press_05186.html) |

### 7-4. チャネルと提携先の候補

| 種別 | 候補 | 期待する役割 | 出典 |
|---|---|---|---|
| 研究・技術 | 東北大学（ANEMONE・eDNA） | eDNA 分析と共同研究 | [東北大学](https://www.tohoku.ac.jp/japanese/2025/04/press20250421-01-dna.html) |
| 研究・技術 | 生物技研、日吉 | eDNA の受託（原価を固める） | [生物技研](https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/)、[日吉](https://hiyoshi-online.com/SHOP/B_KD20_001.html) |
| 実践 | シナイモツゴ郷の会（宮城） | 防除と捕獲の技術、利活用の知見、東北のネットワーク | [J-STAGE](https://www.jstage.jst.go.jp/article/sscawnrjs/14/0/14_78/_article/-char/ja/) |
| 行政モデル | 山形県×山形大学 | 県と大学が組んで早期発見から防除まで進める先行例（提案書で使う） | [山形大学](https://www.yamagata-u.ac.jp/yamapura/works/example/works202503311702/) |
| 保全 | 大森山動物園、秋田水生生物保全協会 | 希少種機能の共同設計 | [大森山動物園](https://www.city.akita.lg.jp/zoo/milve/1003816.html) |
| 農業 | 秋田県多面的機能支援協議会、水土里ネット秋田 | 活動組織への展開 | [協議会](https://www.hozen.vt-akita.com/) |
| 教育 | 環境あきた県民フォーラム、あきた環境学習応援隊 | 学校への窓口 | [フォーラム](https://eco-akita.org/) |
| 起業支援 | A-STA（秋田県）、MASP | 資金とメンター | [A-STA](https://a-sta.a-iju.jp/basic-policy/)、[MASP](https://michinoku-academia-startup.jp/about/) |
| 発信 | 日本環境教育学会、水辺の自然再生共同シンポジウム（J-STAGE で論文集を公開） | 実績をつくる、東北の実務家とつながる | [学会](https://www.jsfee.jp/annual-conference/37th_annual-conference/)、[J-STAGE](https://www.jstage.jst.go.jp/article/sscawnrjs/14/0/14_59/_article/-char/ja/) |
| 協業（条件付き） | 環境コンサル | 入札資格と実績を補う（下請けや共同体） | [いであ](https://www.ideacon.co.jp/pdf/ir/library/earnings/25_4quarterly.pdf)、[建設環境研究所](https://www.kensetsukankyo.co.jp/business/biodiversity/oecm.html) |

### 7-5. 提案書「1枚」の骨子（コピペ用）

```
【件名】アメリカザリガニ・ウシガエルの防除判断レポート（令和9年度）のご提案
1. 課題: 分布・被害が見えず、防除の優先地点と効果が説明できない
   （例: 畦畔の穴 30.6個/100m〔農研機構〕、規制の認知 45.4%〔環境省 R7〕）
2. 提供物: 市町村別の分布・推移、次に調べる地点、駆除前後の比較、eDNA確認（任意）
3. 費用: 年○○万円（少額随契の範囲）
   交付金事業に組み込む場合の実質負担例: 事業費150万円 → 37.5万円（1/4）
4. 体制: ザリダス（秋田県立大学の研究）＋ 保全団体 ＋ eDNA分析機関
5. 実績: 報告 ○○件・参加 ○○人（取得日 ○/○）、学会発表（日本環境教育学会 P実07）
6. 位置情報の扱い: 公開は粗化・非公開を選択、希少種は非公開、写真の位置情報は除去
```

---

## 8. リスクと対策

| # | リスク | どう起きるか | 影響 | 対策 | 早めに気づく指標 |
|---|---|---|---|---|---|
| 1 | データ品質 | 誤同定、位置の精度不足、道路沿いへの偏り | 行政に使ってもらえない | AI は補助にとどめ、人が審査する（現行）。精度30m以内の割合を KPI にする。調査依頼で空白域を埋める。eDNA で検証する | 却下率、精度内率（`docs/runbooks/kpi-weekly-review/01-kpi-register.md`） |
| 2 | 継続率 | 投稿が一部の人に集中する（Zooniverse の研究では約10%の参加者が約80%の作業を担った） | データが止まる | 継続して投稿する人を「調査員」として役割と特典を用意する。地域の団体単位で参加してもらう | 週次アクティブ投稿者（[PNAS 2015](https://www.pnas.org/doi/10.1073/pnas.1408907112)） |
| 3 | 季節性 | 冬は活動も観察も減る（収集は7〜9月中心） | 年額契約の価値を説明しにくい | 冬は営業・分析・報告の期間にする。年次レポート型の価格にする。冬も痕跡と不在確認は取る | 月別の投稿数 |
| 4 | 運営者1人への依存 | 審査・開発・営業・研究が1人。卒業（2027年3月） | 続けられなくなる | 審査協力者のロールを追加する。手順書（既存の runbook）を整える。NPO や大学と共同で運営する。**法人化は2027年春に判断** | 未審査の滞留日数 |
| 5 | 希少種の位置漏えい | 公開地図、データ、外来種の投稿の近さから生息池が推定される | 取り返しがつかない（盗掘） | 既定は非公開。公開は10km以上のメッシュだけ。センシティブ地点の周辺は外来種の投稿も自動で非公開。DOI スナップショットから除く。アクセスを監査する。第三者にレビューしてもらう | 詳細地図の閲覧ログ |
| 6 | 法令 | 利用者が生きたウシガエルを持ち帰る。ザリガニを放流したり売ったりする | 利用者の違法行為、信用の失墜 | 投稿時と捕獲時に注意を表示する（LP の FAQ には既にある）。利活用は死んだ個体の加工に限り、許可を確認する（[環境省](https://www.env.go.jp/nature/intro/2outline/regulation/kisei.html)） | 問い合わせ、通報 |
| 7 | 研究と事業の境界 | 研究データの帰属、大学名の使用、利益相反、規約の目的外利用 | 事業を止めざるを得なくなる | 指導教員・大学と文書にする。利用規約の「目的」に事業での利用を書き、同意を取り直す | — |
| 8 | 資金・コスト | 利用が増えると従量課金（Supabase、Vercel、Gemini）が膨らむ | 赤字 | 既存のコストガードレール（kill switch、週次確認）を使う。「1承認投稿あたり AI コスト」を KPI にする（`docs/runbooks/cloud-cost-guardrails.md`） | AI コスト／承認件数 |
| 9 | 競合 | Biome などが秋田で外来種のクエストを受注する | 価格競争 | 防除の成果物、eDNA、希少種で差をつける。場合によっては連携する | 県と市の調達情報 |
| 10 | 行政特有の事情 | 担当者の異動、単年度予算、入札 | 続かない | 複数の部局・複数年の計画に入れる。覚書を結ぶ。NPO 経由で関わる | — |

---

## 9. 次の検証アクション（今後90日: 2026-09-26〜2026-12-25）

| 優先 | アクション | 期限 | 重要度 | 顧客検証（確かめること／合格ライン） | 費用 | 費用対効果 | 委任 |
|---|---|---|---|---|---|---|---|
| 1 | 指導教員・大学（地域連携・研究推進センター）と、データ・ブランド・ドメインの帰属、事業での利用、利益相反、大学名の使い方を確認し、文書にする | 10/09 | A | 前提条件（ここが NG なら全体を組み直す） | ほぼ0 | 最高 | 不可 |
| 2 | ヒアリングの設計（下の10問、1枚提案、モック） | 10/10 | A | — | ほぼ0 | 高 | 下書きは AI に任せられる |
| 3 | 既存データで「防除判断レポート」の試作を作る（市町村別の分布と推移、空白域、次に見る地点） | 10/17 | A | モックを見せて「使う／払う」を聞ける状態にする | ほぼ0 | 高 | 一部は任せられる |
| 4 | 10者ヒアリング（§7-3 の候補） | 10/31 | A | **合格: 3者以上が「来年度の予算・交付金で検討する」と答える、または予算額や時期を具体的に示す** | 交通費程度 | 最高 | 不可 |
| 5 | 公開ページの実績数値（報告数・参加者数）を取得日つきで記録する（§5-3 の表） | 10/05 | B | — | 0 | 中 | 不可 |
| 6 | 任意団体を作る（3名以上、規約、口座）。助成の受け皿にする | 10/24 | B | — | ほぼ0 | 中 | 規約の作成は任せられる |
| 7 | SOMPO（10/16）とセブン-イレブン記念財団（10/30）の要件を確認し、応募するか決める | 10/16・10/30 | C | — | 0 | 中〜低 | 下書きは任せられる |
| 8 | 地球環境基金2027 の基礎型に応募する | 11/16 13:00 | B | 採択されれば50〜200万円 | 0 | 高 | 下書きは任せられる |
| 9 | 交付金のスケジュールを確認する（県の外来生物担当に、令和9年度の要望調査の時期と様式を聞く） | 11/15 | A | **合格: 県が令和9年度の事業候補としてザリダスの名前を挙げる** | 0 | 高 | 不可 |
| 10 | 希少種の位置非公開機能について、NPO・動物園と要件を合意する（自動で非公開にする種リスト、センシティブ地点、閲覧権限、監査） | 11/30 | A | **合格: 1団体が試験利用に同意する** | 0 | 高 | 実装は本人 |
| 11 | 価格仮説のテスト（15万・50万・100万円の3案を出して反応を記録する） | 11/30 | A | **合格: 50万円案に「予算化を検討する」が1件以上** | 0 | 高 | 不可 |
| 12 | MASP GAP（令和9年度）の申請資格を確認する（秋田県立大学が参画しているか、学生や卒業生が対象になるか） | 11/30 | B | — | 0 | 中 | 問い合わせのみ |
| 13 | 90日の振り返り。Go（秋田で有料化）／Pivot（研究・非営利中心）／Stop を決める | 12/25 | A | **Go の条件: LOI か覚書が1件以上、かつ助成の申請が1件以上** | 0 | 最高 | 不可 |

**ヒアリング10問（自治体向け・30分。コピペ用）**

1. 今年度、アメリカザリガニ・ウシガエルについて住民・議会・農家から何件くらい相談がありましたか。
2. 分布や被害を、いま何で把握していますか（委託、通報、職員の調査、なし）。
3. 直近で防除や調査に使った予算と財源は何ですか（交付金、単独、なし）。
4. 来年度（令和9年度）に外来種関連の予算要求の予定はありますか。締切はいつですか。
5. 交付金（特定外来生物防除等対策事業）を使ったこと、または使う予定はありますか。
6. （モックを見せて）このレポートがあったら、何の判断に使いますか。
7. 使わないとしたら、何が足りませんか（精度、範囲、様式、信頼）。
8. 位置情報の公開で困ったこと（地権者、希少種）はありますか。
9. 年15万・50万・100万円のどれなら現実的ですか。どの費目から出ますか。
10. ほかに話を聞くべき部署や団体はどこですか（紹介のお願い）。

**やらないこと（この90日間）**

- [ ] 全国展開や多種対応の開発
- [ ] 精密座標や希少種データの販売
- [ ] ネイティブアプリ化や大きな機能追加（ヒアリングの前には）
- [ ] VC からの資金調達の検討
- [ ] 駆除個体の食品販売（研究で経済性を確かめるまで）
- [ ] 実績ゼロでの単独入札
- [ ] 有料広告で投稿者を集めること

**委任できること**

- 議事録、文字起こし、提案書や助成申請の下書き（AI）。最終確認は本人と指導教員
- eDNA 分析（受託会社）、採水（研究室、協力団体）
- 会計・税務（税理士、会計ソフト）
- 学校との日程調整（環境あきた県民フォーラム、応援隊の窓口）
- 投稿審査の一部（信頼できる協力者に審査ロールを付ける。実装と規約の整備が必要）

---

## 10. 出典一覧

アクセス日はすべて **2026-09-26**（検索エンジンの結果で確認）。

### 10-1. Web 出典

**法令・制度・予算**
- 環境省 条件付特定外来生物の規制 https://www.env.go.jp/nature/intro/2outline/regulation/jokentsuki.html
- 環境省 アカミミガメ・アメリカザリガニの規制内容と手続き https://www.env.go.jp/nature/intro/2outline/regulation/kisei.html
- 環境省 何が禁止されているの？ https://www.env.go.jp/nature/intro/1law/regulation.html
- 環境省 罰則について https://www.env.go.jp/nature/intro/1law/bassoku.html
- e-Gov 外来生物法 https://laws.e-gov.go.jp/law/416AC0000000078/
- 環境省 防除に関する交付金・特別交付税措置 https://www.env.go.jp/nature/intro/3control/zaiseishien.html
- 環境省 特別交付税措置の概要 https://www.env.go.jp/nature/intro/3control/files/zaiseishien_gaiyou02.pdf
- ERCA 特定外来生物防除等対策事業（交付金） https://www.erca.go.jp/gairaikofukin/index.html
- 内閣府 地方分権提案募集資料（交付金メニュー・申請スケジュール） https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/r05/tb_r5fu_16env_163_a.pdf ／ https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/r05/tb_r5fu_16env_163_b.pdf
- 補助金ポータル 環境省 令和8年度概算要求 https://hojyokin-portal.jp/columns/kankyosho_gaisanyokyu_r8 ／ 環境省 外来生物対策費 https://www.env.go.jp/content/000279236.pdf
- 環境省 アメリカザリガニ対策の手引き（2023年改訂） https://www.env.go.jp/nature/intro/3control/files/r_amezari_tebiki2.pdf
- 農水省 農村地域におけるアメリカザリガニ防除の手引（2026年3月） https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/nouson_amezari.html
- 三田康祐（2023）アメリカザリガニによる農業被害と農村環境保全のとりくみ https://www.jstage.jst.go.jp/article/sscawnrjs/14/0/14_59/_article/-char/ja/
- 農水省 外来生物早期発見ツール https://www.maff.go.jp/j/nousin/kankyo/kankyo_hozen/gairai_soukihakken.html
- 農研機構 畦畔掘削による漏水（2008） https://www.naro.go.jp/project/results/laboratory/nkk/2008/nkk08-20.html
- 外来種被害防止行動計画 第2版 https://www.env.go.jp/content/000301745.pdf ／ ベストプラクティス集 https://www.env.go.jp/nature/intro/2outline/actionplan2/best_practice.pdf
- 生態系被害防止外来種リスト（2026年改定版） https://www.maff.go.jp/j/press/kanbo/b_kankyo/260911.html ／ https://econavi.eic.or.jp/news/detail/53350
- 環境省 令和7年度 外来生物問題等認知度調査 https://www.env.go.jp/press/press_04972.html
- 環境省 地域生物多様性増進法の施行 https://www.env.go.jp/press/press_04681.html
- 環境省 自然共生サイト認定（令和8年度第1回） https://www.env.go.jp/press/press_05186.html ／ 農水省 https://www.maff.go.jp/j/press/kanbo/b_kankyo/260630_1.html
- ERCA 地域生物多様性増進活動の手引き https://www.erca.go.jp/nature/pdf/30by30site-Body-of-Letter.pdf
- 環境省 自然共生サイトに係る支援証明書 https://www.env.go.jp/press/press_04619.html
- 環境省 令和8年度 生物多様性保全推進交付金の公募 https://www.env.go.jp/press/press_03555.html
- 環境省 生物多様性地域戦略 https://www.env.go.jp/nature/biodiversity/local_gov.html
- 秋田県 生物多様性地域戦略 https://www.pref.akita.lg.jp/pages/genre/68973
- 総務省 少額随意契約の基準額の見直し https://www.soumu.go.jp/main_content/001026062.pdf ／ ジチタイワークス https://jichitai.works/articles/3144
- 千葉市 予算編成の流れ https://www.city.chiba.jp/zaiseikyoku/zaisei/zaisei/documents/01nagare_3.pdf

**統計・農業**
- e-Stat 市区町村数 https://www.e-stat.go.jp/municipalities/number-of-municipalities ／ SSDSE 解説 https://www.nstac.go.jp/sys/files/kaisetsu-A-2024.pdf
- J-LIS 都道府県別市区町村数 https://www.j-lis.go.jp/spd/code-address/kenbetsu-inspection/cms_11914151.html ／ 秋田県内市町村 https://www.j-lis.go.jp/spd/code-address/touhoku/cms_12614180.html
- 農水省 令和7年度 日本型直接支払の実施状況 https://www.maff.go.jp/j/press/nousin/tyusan/260831.html
- 農水省 令和4年度 多面的機能支払の取組状況（活動組織数） https://www.maff.go.jp/j/nousin/kanri/tamen_siharai/n_sansya/attach/pdf/r5_2kai-3.pdf
- 農水省 多面的機能支払交付金（単価） https://www.maff.go.jp/j/nousin/kanri/tamen_siharai.html
- 農水省 多面的機能支払交付金の施策の評価（2019年3月） https://www.maff.go.jp/j/nousin/kanri/attach/pdf/tamen_sesaku-4.pdf
- 秋田市 令和7年度 当初予算案の概要 https://www.city.akita.lg.jp/_res/projects/default_project/_page_/001/009/191/toushoyosannann07.pdf
- 秋田県多面的機能支援協議会 https://www.hozen.vt-akita.com/ ／ 水土里ネット秋田 https://www.akita-midori.net/midori/area.htm
- 秋田県 日本一と全国ベスト3（じゅんさい） https://www.pref.akita.lg.jp/uploads/public/archive_0000005099_00/%E4%BB%A4%E5%92%8C%E5%85%83%E5%B9%B4_%E7%A7%8B%E7%94%B0%E7%9C%8C%E3%81%AE%E6%97%A5%E6%9C%AC%E4%B8%80%E3%81%A8%E5%85%A8%E5%9B%BD%E3%83%99%E3%82%B9%E3%83%88%EF%BC%93.pdf

**希少種・保全**
- 環境省 国内希少野生動植物種の保全に係る現状と課題（2025年10月、ゼニタナゴ） https://www.env.go.jp/content/000347939.pdf ／ J-STAGE https://www.jstage.jst.go.jp/article/sscawnrjs/17/0/17_1/_pdf/-char/ja
- 秋田市大森山動物園 ゼニタナゴ保全活動 https://www.city.akita.lg.jp/zoo/milve/1003816.html
- 秋田市 広報あきた（2021-06-18） https://www.city.akita.akita.jp/city/pl/pb/koho/htm/20210618/061808.html
- 全国レッドデータ検索システム（キタノメダカ） https://jpnrdb.com/database/taxon/detail/1021/?o=%E3%83%80%E3%83%84
- 秋田県版レッドデータブック https://www.pref.akita.lg.jp/pages/genre/59619
- 国交省 重要な種等の情報開示の考え方 http://www.cgr.mlit.go.jp/okakawa/kouhou/takahashi_asesu/doc/com02/03.pdf
- 地方自治研究機構 希少野生生物の保護に関する条例 https://www.rilg.or.jp/htdocs/img/reiki/118_endangered_species.htm

**TNFD・政策・国際**
- TNFD（ISSB 決定と733組織） https://tnfd.global/issb-decision-on-nature-related-standard-setting-drawing-on-tnfd-framework/
- 環境省 TNFD イベント（日本154社／562社） https://www.env.go.jp/press/press_04827.html
- IFRS ISSB（2026年5月） https://www.ifrs.org/news-and-events/news/2026/05/issb-agrees-proposed-way-forward-nature-related-disclosures/
- 環境省 ネイチャーポジティブ経済移行戦略 https://www.env.go.jp/page_01353.html ／ https://www.technofer-enews.jp/2024/03/29/post-17008/
- 環境省 生物多様性国家戦略2023-2030 https://www.env.go.jp/press/press_01379.html ／ 中間評価 https://www.env.go.jp/content/000379260.pdf
- CBD GBF 目標6 https://www.cbd.int/gbf/targets/6

**環境DNA**
- 環境省 生物多様性センター 環境DNA調査 https://www.biodic.go.jp/edna/edna_top.html
- 環境DNA学会 調査・実験マニュアル ver3.1 https://ednasociety.org/wp-content/uploads/2026/05/%E7%92%B0%E5%A2%83DNA%E8%AA%BF%E6%9F%BB%E3%83%BB%E5%AE%9F%E9%A8%93%E3%83%9E%E3%83%8B%E3%83%A5%E3%82%A2%E3%83%AB_ver3_1.pdf
- 東北大学 ANEMONE https://www.tohoku.ac.jp/japanese/2025/04/press20250421-01-dna.html
- 生物技研 種特異的解析 https://gikenbio.com/dnaanalysis/ngs/environment/qpcr/
- 日吉 環境DNA（種特異的分析） https://hiyoshi-online.com/SHOP/B_KD20_001.html
- 山口大学 環境DNA研究センター http://cedna.kenkyu.yamaguchi-u.ac.jp/analysis.html

**競合・類似**
- iNaturalist Geoprivacy https://www.inaturalist.org/pages/geoprivacy ／ Help https://help.inaturalist.org/en/support/solutions/articles/151000169938-what-is-geoprivacy-what-does-it-mean-for-an-observation-to-be-obscured- ／ Sensitive species https://help.inaturalist.org/en/support/solutions/articles/151000233080-how-does-inaturalist-protect-the-locations-of-sensitive-species- ／ Forum（trust） https://forum.inaturalist.org/t/clarifying-geoprivacy-reasons-for-obscured-coordinates-user-to-user-trust/730
- iNaturalist 日本のレッドリスト登録に関する投稿 https://www.inaturalist.org/posts/38308 ／ https://www.inaturalist.org/posts/43955-
- iNaturalist 非営利化 FAQ https://www.inaturalist.org/pages/spinoff_faq ／ BioScience（2025） https://academic.oup.com/bioscience/article/75/11/953/8185761
- Biome アプリ https://biome.co.jp/app-biome/ ／ マニュアル（希少種） https://manual.biome.co.jp/faq/data/
- Biome × 日本自然保護協会 https://prtimes.jp/main/html/rd/p/000000083.000044108.html ／ 経団連入会（実績数） https://prtimes.jp/main/html/rd/p/000000082.000044108.html ／ シリーズB https://biome.co.jp/news/seriesb-fundraising/ ／ NTTドコモ・ベンチャーズ https://kyodonewsprwire.jp/release/202503256267
- BiomeSurvey https://biome.co.jp/products/biomesurvey/ ／ 料金ページ https://biome-survey.com/price/ ／ BiomeViewer https://biome.co.jp/products/biomeviewer/ ／ https://biome.co.jp/news/press_20260511/ ／ 市民協働 https://biome.co.jp/services/citizen-science/ ／ 外来種対策支援 https://biome.co.jp/services/invasive-species-solutions/
- 千葉県 ちば外来水生植物マップ2026 https://www.pref.chiba.lg.jp/shizen/press/2026/260601nagaetyosa.html ／ 2025 https://www.pref.chiba.lg.jp/shizen/press/2025/250630nagaetyosa.html
- 東京都×バイオーム https://prtimes.jp/main/html/rd/p/000000074.000044108.html ／ 国環研×Biome https://www.nies.go.jp/whatsnew/20210325/20210325.html ／ KDDI https://newsroom.kddi.com/news/detail/kddi_pr-982.html
- いきものログ https://www.env.go.jp/nature/biodic/ikilog/index.html ／ https://ikilog.biodic.go.jp/Guide/
- 福島県 外来種発見報告フォーム https://www.pref.fukushima.lg.jp/sec/16035b/gairaishuhoukoku.html ／ あきる野市 https://www.city.akiruno.tokyo.jp/0000015249.html ／ 山形大学×山形県 https://www.yamagata-u.ac.jp/yamapura/works/example/works202503311702/
- いであ 2025年12月期 決算短信 https://www.ideacon.co.jp/pdf/ir/library/earnings/25_4quarterly.pdf ／ 建設環境研究所 https://www.kensetsukankyo.co.jp/business/biodiversity/oecm.html
- いのしかレコード https://www.forexrobotics.jp/inoshika ／ 農研機構 スマートHOKAKU https://www.naro.go.jp/laboratory/brain/contents/fukyu/episode/episode_list/166482.html
- ザリマップ https://maps.zaritsuri.com/ ／ EDDMapS https://www.eddmaps.org/about/
- Sauermann & Franzoni（2015, PNAS） https://www.pnas.org/doi/10.1073/pnas.1408907112

**助成金・起業支援**
- 地球環境基金 2027年度 https://www.akita-kenmin.jp/docs/2026090500013 ／ https://www.erca.go.jp/jfge/subsidy/
- セブン-イレブン記念財団 https://www.7midori.org/josei/ ／ https://epo-cg.jp/blog/261030seven-elevenbika/ ／ https://www.aiinanpo.org/info/20260806_56187/
- SOMPO環境財団 https://www.sompo-ef.org/project/project.html ／ https://www.aiinanpo.org/info/20260922_56996/
- プロ・ナトゥーラ・ファンド https://www.pronaturajapan.com/foundation/pronatura_fund.html ／ https://www.akita-kenmin.jp/docs/2026052900011
- 経団連自然保護基金 https://www.keidanren.net/kncf/fund ／ https://shimisen-kyoto.org/subsidy/47597
- イオン環境財団 https://www.aeonkankyozaidan.or.jp/environmental_activities_grant/public_offering/about.html
- パタゴニア https://www.patagonia.jp/environmental-grants-and-support.html ／ https://eleminist.com/article/4741
- MASP みちのくGAPファンド https://michinoku-academia-startup.jp/r8michinokugapfund-2/ ／ https://michinoku-academia-startup.jp/about/
- 秋田県 シン・若者チャレンジ応援事業 https://www.pref.akita.lg.jp/pages/archive/97653 ／ https://akita-wakamono-challenge.com/
- A-STA（秋田県） https://a-sta.a-iju.jp/basic-policy/

**教育・利活用・その他**
- あきた環境学習応援隊 https://www.pref.akita.lg.jp/pages/archive/36470 ／ 環境あきた県民フォーラム https://eco-akita.org/
- 千葉市 講師謝金基準 https://www.city.chiba.jp/kyoiku/kyoikusomu/somu/documents/20-10.pdf ／ 出前授業の費用（民間の解説） https://blog.studyvalley.jp/2024/07/01/onsite-class-cost/
- nippon.com（豊洲の相場） https://www.nippon.com/ja/japan-topics/g02070/
- シナイモツゴ郷の会（利活用） https://www.jstage.jst.go.jp/article/sscawnrjs/16/0/16_53/_article/-char/ja/ ／ （ゼニタナゴ池の防除） https://www.jstage.jst.go.jp/article/sscawnrjs/14/0/14_78/_article/-char/ja/
- 日本環境教育学会 第37回年次大会 https://www.jsfee.jp/annual-conference/37th_annual-conference/
- 国交省 鳥海ダム工事事務所 https://www.thr.mlit.go.jp/chokai/

### 10-2. 外部提出の前に原典で確かめる数字（チェックリスト）

- [ ] 環境省 R8 の外来生物対策支援「19億円（前年度6億円）」が概算要求の額か当初予算の額か
- [ ] 交付金メニュー（定額250万円）と特別交付税の割合が、令和9年度も同じか
- [ ] 少額随意契約の基準額（秋田県と各市町村の規則での金額）
- [ ] 自然共生サイト累計610、保護地域の割合 29.86%／13.79%
- [ ] TNFD の日本の最新採用数（公式リスト）
- [ ] いのしかレコードの価格（年132,000円から、税込）と含まれる内容
- [ ] 生物技研・日吉の eDNA 価格（税込か税別か、最低検体数）
- [ ] 地球環境基金・セブン-イレブン記念財団・SOMPO の締切と要件（団体の要件）
- [ ] MASP の参画大学に秋田県立大学が入っているか
- [ ] ゼニタナゴの法的な位置づけ（特定第一種国内希少野生動植物種の規制内容）
- [ ] 秋田県に希少野生動植物の保護条例がないこと（地方自治研究機構の一覧の時点）
- [ ] iNaturalist での日本のレッドリスト種の現在の位置保護の設定

### 10-3. リポジトリ内の参照（再調査せず引用）

- `/home/user/zaridasu/README.md`（目的、位置の粗化、公開データの方針、ライセンス）
- `/home/user/zaridasu/README/01-research-context.md`（研究題目、RQ1〜4、仮説 H1/H2、収集時期、学会発表）
- `/home/user/zaridasu/docs/philosophy/background.md`（動機と課題）
- `/home/user/zaridasu/docs/current/privacy.md`、`public-dataset.md`、`moderation.md`、`gamification.md`、`survey-requests.md`
- `/home/user/zaridasu/src/lib/constants.ts`（対象2種、情報種別）、`src/locales/ja/translation.json`（LP の文言: 無料、秋田県内のみ、運営者の説明）
- `/home/user/zaridasu/docs/runbooks/kpi-weekly-review/01-kpi-register.md`（NSM とガードレール指標）、`docs/runbooks/cloud-cost-guardrails.md`（コスト管理）
- `/home/user/zaridasu/docs/requirements/REQ-283-field-exploration-mode/23-open-issues-and-references.md`（Biome・iNaturalist の既存参照）
