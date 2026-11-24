# REQ-313: 状態同期の信頼性（通知トグル・品質タブ・いいね・CSV）

作成日: 2026-07-30
優先度: **P2** ／ 深刻度: **Medium** ／ 種別: UX（エラーハンドリング）
状態: **提案 / 未実装**
関連: REQ-273（データ取得失敗の可視化）, REQ-192（fetch失敗と空状態の分離）, REQ-193（操作失敗のフィードバック）, REQ-226（いいねの楽観更新）, REQ-237（Web Push）, REQ-103/REQ-243（CSV列とプライバシー）

## これは何か

「失敗を空状態や成功に見せない」方針から**個別に漏れた4箇所**（プッシュ通知トグル・ランキング品質タブ・
いいね・CSV エクスポート）を是正する要件。詳細は `REQ-313-state-sync-reliability/` 配下に分割している。

## 目的・背景（要約）

共通する失敗の形は 2 つ。(1) 失敗を「0」や「空」として表示する（`count || 0` / `error ? [] : …`）ため
ユーザーが誤った値を真値だと信じてしまう。(2) サーバーへ反映されていない状態を UI で確定として見せる。
とくに通知の OFF 操作では **UI が OFF なのに通知が届き続ける**。模範実装は同じ画面の兄弟タブにあり、
品質タブだけが REQ-192 の修正から漏れている。

## 主要な決定事項（要点）

- **問題A（プッシュ）**: `subscribe()` の戻り値を破棄しているため ON 失敗が無言。OFF 側は DELETE と
  opt-in 解除の error を見ずに**無条件で `setSubscribed(false)`** している。
  → **サーバーに反映されるまで OFF 表示にしない**（失敗時はトグル ON のままエラー表示）。
- **問題B（品質タブ）**: `useQuality` の返り値に `error` が無く、エラーもオフラインも空配列に握りつぶされる。
  → `error` と `refetch` を追加し、`LoadErrorState` ＋再試行を出す。**空状態分岐に落とさない**。
- **問題C（いいね）**: 楽観更新の catch 内の再同期が失敗すると `count || 0` で **42 が 0 に化ける**。
  → 再同期失敗時はカウントと `liked` を**書き換えない**（`count || 0` を廃止）。初回取得も同様。
- **問題D（CSV）**: クエリ失敗だけ `logError` を通らず、0 件でも**ヘッダ行だけの CSV** が落ちてくる。
  → 失敗を logError に載せ、0 件ならファイルを生成せず明示する。`<a>` の append と revoke 遅延も入れる。
- FR-313-07 で 4 つの退行をテストで固定化する。i18n キーは 4 言語必須。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-313-state-sync-reliability/01-background.md) | 背景（共通する 2 つの失敗の形と、同一画面にある模範実装との対比） |
| [02-problems-push-and-quality.md](REQ-313-state-sync-reliability/02-problems-push-and-quality.md) | 問題A: プッシュ通知トグルの無言失敗と OFF 反映漏れ／問題B: 品質タブのエラー握りつぶし |
| [03-problems-like-and-csv.md](REQ-313-state-sync-reliability/03-problems-like-and-csv.md) | 問題C: いいね再同期でカウントが 0 に化ける／問題D: CSV の 0 件・失敗・iOS ダウンロードの 3 点 |
| [04-functional-requirements.md](REQ-313-state-sync-reliability/04-functional-requirements.md) | 機能要件 FR-313-01〜07（可視化・状態保持・error/refetch 追加・再同期の安全化・CSV 対応・回帰テスト） |
| [05-acceptance-and-notes.md](REQ-313-state-sync-reliability/05-acceptance-and-notes.md) | 受入基準 AC-01〜08 と備考（要確認事項: 中間状態の表示・iOS 実機検証・toast.info の有無） |
