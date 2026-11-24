# REQ-291: webhook 認証チェーンの本番有効化と無認可経路の閉塞

作成日: 2026-07-30
優先度: **P0** ／ 深刻度: **High** ／ 種別: セキュリティ（運用＋コード）
状態: **提案 / 未実装**
関連: REQ-131（webhook auth 導入）, REQ-240（fail-closed 化）, REQ-270（送出側 secret 付与）, REQ-280（通知の冪等性・未実装）, REQ-287（Supabase キー移行。§2-C に本件の実測記述あり）
runbook: `docs/runbooks/edge-function-deploy.md`

## これは何か

webhook 系 Edge Function 12 本が本番で検証ゼロのまま通過している状態を閉じる要件。**主体は人手の運用タスクであり、コード変更は監視とエラー応答の固定文言化のみ**。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

REQ-131 → REQ-240 → REQ-270 で**コード側のチェーンは完成している**。残っているのは「本番に値を供給して grace period を閉じる」①〜④の運用手順（Vault 登録 → Edge env → Webhook ヘッダ → enforce）だが、**本番でどれも実施されていない**。そのため「コードは fail-closed 可能なのに本番だけ fail-open」という状態が続いている。

## 主要な決定事項の要点

- **問題A（High）**: `WEBHOOK_SECRET` 未設定かつ enforce 無効のとき `requireWebhookSecret()` は warn を出して**通過する**。送出側も Vault に secret が無ければヘッダを付けずに送る。結果 **12 本すべてが検証ゼロで通過**。`verify_jwt = true` は効いているが、そのゲートを通るのに必要なのは**フロントのバンドルに焼き込まれた公開 anon キーだけ**＝実質誰でも到達できる。
- 未設定の判断は推論に基づく — REQ-287 §2-C の実測記述に加え、「もし設定済みなら送出側がヘッダ無しで送るため既存通知が全て 401 で壊れているはず」という整合性から。**作業の最初に実値を確認すること**。
- **問題B（High）**: `notify-post-status` は payload の `record` を信用せず DB から再 fetch する設計だが、**それは文面細工を防ぐだけで連投は防がない**。REQ-280 未実装で送信済みマーカーもレート制限も無いため、**1 投稿あたり無制限のメール爆撃**が可能。ライフサイクルメールの一斉送信、Web Push の任意配信、ジオコーディング／Gemini の課金消費、SNS 自動投稿の強制起動も起こせる。
- **問題C（Medium）**: 8 本が catch で `String(e)` をそのまま応答本文に載せている。呼び出し元が第三者になり得るため内部エラー文字列が外部へ渡る。REQ-270 FR-270-03 で `{error:'internal_error'}` への一般化方針は既に決まっており、**残り 8 本への適用漏れ**という不統一。
- **問題D（Medium）**: `event=webhook_secret_unset_passthrough` は安定タグ付きで警告を出す設計なのに、**アラートが設定されていないため半年近く検知されていない**。設計の意図が運用側で受け取られていない。
- **作業順序を逆にしないこと** — enforce を先に有効化すると全経路が即 401 になる。値の登録と疎通確認の後に enforce する。
- **Function Secrets の変更は再デプロイまで既存インスタンスに届かない**ため 12 本を再デプロイする。REQ-287 FR-287-02 と同時に行えば再デプロイが 1 回で済む。
- **FR-291-02 の判断点**: ダッシュボード作成の Database Webhook が残っている場合、ヘッダ追加ではなく**削除して migration 管理の pg_net ラッパへ寄せる**方が REQ-287 FR-287-07 の方針に整合する。
- **FR-291-04 の判断点**: `_shared` に汎用 Sentry ヘルパが無いため、**Supabase 側のログアラート設定のみ（コード変更ゼロ）で足りる**と判断してよい。ただし enforce 後に通過ログが出るのは設定巻き戻りの合図なので、**アラート自体は恒久的に残す**。
- 対象外: 通知の冪等性そのもの（REQ-280）。本要件は「無認可の到達を止める」ことに限り、**両方揃って初めて多層防御になる**。`notify-comment` は JWT ＋所有者一致で守られており別経路。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-issue-a.md](REQ-291-webhook-secret-production-enablement/01-background-and-issue-a.md) | 本要件の性質（important 注記）、背景（①〜④の運用手順）、問題A — grace period の成立条件、未設定と判断した根拠、対象 12 関数の一覧 |
| [02-issues-b-c-d.md](REQ-291-webhook-secret-production-enablement/02-issues-b-c-d.md) | 問題B（関数別の具体的な影響の表）、問題C（`String(e)` 露出の 8 箇所）、問題D（アラート未設定） |
| [03-functional-requirements.md](REQ-291-webhook-secret-production-enablement/03-functional-requirements.md) | 機能要件 FR-291-01〜05（値の登録、ダッシュボード側、enforce、監視、情報露出の是正） |
| [04-acceptance-criteria.md](REQ-291-webhook-secret-production-enablement/04-acceptance-criteria.md) | 受入基準 AC-01〜07（401 確認の curl、正規経路 5 種の疎通、ヘッダ付与の SQL、24 時間のログ 0 件、grep 0 件） |
| [05-out-of-scope-and-to-confirm.md](REQ-291-webhook-secret-production-enablement/05-out-of-scope-and-to-confirm.md) | 対象外（REQ-280 との切り分け、`notify-comment`）と要確認（実値の確認手順、残存 Webhook の有無） |
