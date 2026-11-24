# REQ-284: はじめてのユーザー向け「ザリダス紹介ストーリー」モーダルと、バナーの恒久的「今後表示しない」

作成日: 2026-07-28
更新日: 2026-08-05（**v2**: イラストによる説明を追加。開発動機を「保全の意思決定を早める／市民の意識」まで書き切る。生態系への影響を環境省の一次情報で具体化）
状態: **初期仕様の履歴 / 後継仕様あり（条件別の完了状況は未判定）**
関連: REQ-176（LP）, REQ-206（LP残作業・FR-206-08 の `/lp` 導線）, REQ-222（Empty state のオンボーディング化）, REQ-227（種別ピラー）, REQ-249（段階解放）, REQ-251（UnlockCelebration）, REQ-277（i18n 直書き撲滅）

> 現行仕様の案内（2026-10-17）: 紹介は実装があり、回答型の案内へ置き換えられている。入口と後継要件は [紹介の現行仕様](../current/introduction.md)、現在の4画面・保存・離脱条件は [auth.md](../current/auth.md#オンボーディング) を参照する。以下の6画面は当時の要件として読む。

> [!note] v2 での変更点（2026-08-05）
> 1. **6画面すべてにイラストを置く**（§5.3）。文字だけでは「池から生きものが消える」が伝わらないため。イラストは Codex で生成した**オリジナル**とし、環境省の図は引き続き転載しない（§6 の方針は不変）。
> 2. **開発動機を書き切る**（§1.1）。「細かい地図をつくりたい」で止めず、**何のために作るのか＝どこを守るかの判断を早めるため／一人ひとりが自分ごとにするため**まで言う。
> 3. **1枚目「こまっていること」を具体化**（§6.4）。環境省「生態系等への影響」（`amezari_mondai.html`）の実地の事例を根拠にする。

---

## これは何か

初回訪問者に「ザリダスは何のサービスか／自分は何をすればいいか」を30秒で伝える紹介ストーリー（6画面のモーダル）と、その誘い口・既存バナーに**恒久的な「今後表示しない」**を入れる要件定義。本文は下記の部品ファイルに分割してある（内容は逐語のまま）。

## 目的・背景の要約

入口（`/`）が地図なので初見の人には文脈がない。一方で「国の分布情報は市区町村より細かくないので、となりの池にいるかは分からない。だからみんなの目で細かい地図をつくりたい」という動機はアプリ内のどこにも書かれていない。その先の目的（**どこを先に守るかの判断を早める／一人ひとりが自分ごとにする**）も同様。加えて既存の2バナーは24時間・7日で勝手に復活し、「消したのにまた出る」状態になっている。

## 主要な決定事項の要点

- **押しつけない設計**: 誘いポップアップは5秒後・小型、［読んでみる］／［あとで］／［今後表示しない］の3択。opt-out した人には二度と出さず、それでも `DrawerMenu` からいつでも読み直せる。
- **恒久 opt-out キー**: `zaridasu_intro_optout_v1` / `zaridasu_intro_read_at` / `zaridasu_signup_banner_optout_v1` / `zaridasu_install_banner_optout_v1`。既存の期限付きスヌーズは残す。保存失敗時は try/catch でフェイルソフト。
- **匿名前提**: DB（`user_profiles`）に列を足さず localStorage のみで完結させる。
- **6画面すべてにオリジナルのイラストを置く**（v2）。Codex 生成・**画像に文字を焼き込まない**・赤緑で対比を表さない・実在の県境を描かない。
- **環境省資料は無加工引用＋出典明記＋通常リンクのみ**。画像の転載・ホットリンク・iframe 埋め込みはしない。NIES ホストの市区町村アンケート数値は許可制のため**使わないで確定**（v2）。
- **前提となる是正**: 公開中の `about.law_info.american.*` が「飼育禁止」と誤記しており、実装前に4言語で直す（正しくは飼うのはOK・野外に放すのはNG・売る買う配る輸入はNG）。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-summary.md](REQ-284-intro-story-modal-and-permanent-optout/01-summary.md) | §0 要件サマリー。2つの実装対象と、ストーリーの中核メッセージ・2つの目的 |
| [02-background.md](REQ-284-intro-story-modal-and-permanent-optout/02-background.md) | §1 背景。なぜ必要か／文字だけでは伝わらない理由／押しつけない形にする根拠（クラウドアウト） |
| [03-current-problems.md](REQ-284-intro-story-modal-and-permanent-optout/03-current-problems.md) | §2 現状の問題（A〜D）。ファイルパス:行番号つきの実地調査結果 |
| [04-goals-and-scope.md](REQ-284-intro-story-modal-and-permanent-optout/04-goals-and-scope.md) | §3 目的（5点）と §4 スコープ外 |
| [05-functional-requirements.md](REQ-284-intro-story-modal-and-permanent-optout/05-functional-requirements.md) | §5.1 機能要件 FR-284-01〜16（誘い／ストーリー本体6画面／導線／バナー opt-out／計測） |
| [06-nfr-and-illustrations.md](REQ-284-intro-story-modal-and-permanent-optout/06-nfr-and-illustrations.md) | §5.2 非機能要件 NFR-284-01〜07 と §5.3 イラスト要件 FR-284-28〜35（6枚の絵の内容つき） |
| [07-moe-citation-sources.md](REQ-284-intro-story-modal-and-permanent-optout/07-moe-citation-sources.md) | §6.1 引用する資料と逐語／§6.1.1 NIES の市区町村データと利用条件の注意／FR-284-17〜20 |
| [08-moe-license-and-link-fixes.md](REQ-284-intro-story-modal-and-permanent-optout/08-moe-license-and-link-fixes.md) | §6.2 PDL1.0 等の利用条件と FR-284-24/25／§6.3 リンク切れ（404）の是正 FR-284-23 |
| [09-moe-impact-evidence.md](REQ-284-intro-story-modal-and-permanent-optout/09-moe-impact-evidence.md) | §6.4 1枚目の根拠（環境省「アメリカザリガニによる被害」）と FR-284-36〜38 |
| [10-legal-copy-correction.md](REQ-284-intro-story-modal-and-permanent-optout/10-legal-copy-correction.md) | §7 公開中の法令説明の誤りと是正 FR-284-21/22/26/27、§7.1「見つけたらどうするか」の4原則 |
| [11-acceptance-criteria.md](REQ-284-intro-story-modal-and-permanent-optout/11-acceptance-criteria.md) | §8 受入条件 AC-01〜20（イラスト関連 AC-15〜20 を含む） |
| [12-open-questions.md](REQ-284-intro-story-modal-and-permanent-optout/12-open-questions.md) | §9 未確定事項1〜8と、v2 で決着した項目 |
| [13-impact-and-priority.md](REQ-284-intro-story-modal-and-permanent-optout/13-impact-and-priority.md) | §10 影響範囲（新規・変更・他機能）と §11 優先度 |
