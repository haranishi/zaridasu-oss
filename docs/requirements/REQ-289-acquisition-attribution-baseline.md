# REQ-289: 流入計測の基盤整備（utm_content・from 台帳・LP 導線・ベースライン確定）

作成日: 2026-07-29
状態: **一部実装済み（2026-07-29）**

関連: REQ-033（GTM signup 精度）, REQ-176（マーケLP / FR-176-08・FR-176-12）, REQ-182（LP signup アトリビューション）, REQ-206（LP 残作業 / FR-206-08）, REQ-232（trackEvent 一本化）, REQ-236（シェア UTM）, REQ-284（紹介ストーリー）
参照: Obsidian `[[10_ザリダス_全体構造図（Figma）]]` / `[[11_ザリダス_マーケティング全体構造]]` / `[[08_ザリダス_KGI・部門別KPI・実行計画]]`

## これは何か

施策を開始する前に「どの流入元から何人来たか」を分離して計測できる器を用意し、ベースラインを確定する要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

KGI は 2027-03-31 までに認証済み登録 1,000 人、North Star Metric は週次アクティブ投稿者数（WAC）。全体構造図の残タスクに「2026-08-02 のベースライン確定後に仮目標を実測値へ差し替える」があり、これが最も近い期限。**そして流入計測は後付けができない** — 一度配布した URL・QR コード・SNS 投稿に後からパラメータは足せず、施策開始後に「どれが効いたか分からない」と気づいてもその期間のデータは永久に復元できない。

## 主要な決定事項の要点

- 現状の問題は 6 つ。**A（🔴）`utm_content` が無くクリエイティブ単位で分離できない**、B `from` にホワイトリストが無く表記ゆれで名寄せ不能、C メール登録経路で `from` が失われる、D 計測が本番でしか発火せず事前検証できない、E `/lp` がアプリ内から到達不能、F ベースライン実測値が未記録。
- **外部施策用の URL 生成の仕組みがそもそも存在しなかった**（`shareUtm` はアプリ内シェア専用）ため `buildCampaignUrl` を新設。
- 台帳外の `from` は **`other` へ丸めつつ元値を `from_raw` で併送**する。集計軸を汚さず、台帳追加漏れに後から気づける。
- **C の非対称性が重要** — メール登録は流入元不明になりやすく、同一タブで完結する Google OAuth だけが確実に帰属する。これを知らずに集計すると **OAuth 経路の施策が過大評価される**。
- **ベースライン実測値（2026-07-29）**: `auth.users` 9 / `posts` 18 / うち approved 12 / **WAC 1** / 投稿経験者 3 / `push_subscriptions` 0 / `lifecycle_email_log` 0。**2026-07-28 にテスト投稿 33 件等を削除した後の値**であり、削除前と混同しないこと。
- **実施済み（2026-07-29）**: FR-289-01 / 02 / 03 / 04 / 07 / 08、NFR-289-03（`AUTH_FROM_TTL_MS` の二重定義解消）。テスト 21 件追加で全体 652 passed。
- **未実施**: FR-289-05（メール経路の `from` 引き継ぎ。現状は集計上の前提として文書化のみ）と FR-289-06（`/lp` 導線）。
- **FR-289-06 は単独で進めない** — REQ-284 の紹介ストーリーと役割が重複するため、**どちらを初見ユーザーの入口にするかの決定が先**。
- **zarigani-game 側は本要件の台帳が決まるまで触らない**（値の不一致を防ぐため）。
- 優先度は緊急度・重要度ともに High。理由は 2026-08-02 の期限と、計測の**不可逆性**。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-implementation-status-and-background.md](REQ-289-acquisition-attribution-baseline/01-implementation-status-and-background.md) | 実施済み一覧（done 注記）と背景 — KGI / NSM、2026-08-02 の期限、計測が後付けできない理由 |
| [02-current-problems.md](REQ-289-acquisition-attribution-baseline/02-current-problems.md) | 現状の問題 A〜F（該当コードと行番号、ベースライン実測値の表と削除前後の注意） |
| [03-goals-and-requirements.md](REQ-289-acquisition-attribution-baseline/03-goals-and-requirements.md) | 目的 4 点、機能要件 FR-289-01〜08（`from` 台帳の対象施策リストを含む）、非機能要件 NFR-289-01〜04 |
| [04-acceptance-criteria.md](REQ-289-acquisition-attribution-baseline/04-acceptance-criteria.md) | 受入条件 AC-01〜07 |
| [05-impact.md](REQ-289-acquisition-attribution-baseline/05-impact.md) | 影響範囲 — 新規／変更ファイル、他機能（REQ-284・REQ-283・zarigani-game）への影響 |
| [06-priority.md](REQ-289-acquisition-attribution-baseline/06-priority.md) | 優先度の判断理由と、要件ごとの個別優先度表 |
