# 貢献の報酬と研究集計はDBの観察記録から作る

研究では参加・継続に加えて、位置精度や写真の有無などデータの質を追う。画面の派手さやいいね数を、研究に使える観察記録と同一視しない。
設計理由は[現行gamification仕様](../current/gamification.md)、データの公開配布は[dataset-surveys](dataset-surveys.md)にある。

## バッジ・XP・コレクションは本人が書き換えない

| 表・関数 | 管理する状態 |
| --- | --- |
| badge_definitions／user_badges | バッジの定義と獲得。投稿承認やコメントのDBトリガーで付与 |
| user_progress | XP・レベル・当日の獲得。承認の遷移で品質・初回発見・日次上限を反映 |
| user_collection | 種ごとの初観察、情報種別・市町村の集合、承認数。図鑑・水槽の素材 |
| get_user_progress／get_user_collection | 本人または公開プロフィールの進行を読み、非公開の他人には行を返さない |

XPはいいね・pending・rejectedを報酬にしない。写真・AI同定・測位・structured調査・不在記録・初回の種や地域などを加味する。
日次上限は120XP。量だけを増やす動機を抑え、不在や未調査地域にも記録を促す理由が[仕様](../current/gamification.md)に記録されている。
レベル曲線と報酬係数のSQLは[schema.sql](../../supabase/schema.sql)のxp_for_level／xp_for_post／xp_daily_capが持ち、表示側の[constants](../../src/lib/constants.ts)と同期する。
進行・コレクションのトリガーは失敗を警告にし、承認を止めない。保存済みlevelとxpがずれていても読取RPCはxpからlevelを計算し直す。

トリガーはapproved以外からapprovedへのUPDATEで動き、投稿ごとの不変な報酬台帳を持つわけではない。再審査・削除・再計算を、履歴を自動で完全に巻き戻す操作とは扱わない。
再計算は承認済み投稿のある人へUPSERTするため、0件になった人の進行・図鑑が残る。バッジには自動剥奪が無い。整理時の注意点は[現行仕様](../current/gamification.md)に従う。
これらは表示の集計であり、承認済み観察行の正本を置き換えない。

## 公開ランキングと管理研究データを分ける

| RPC群 | 返すものと境界 |
| --- | --- |
| get_user_ranking／get_user_diversity／get_user_quality | 公開プロフィールの量・種類・品質ランキング。主な実績は承認済み、品質の承認率は全投稿を分母にする |
| get_undersurveyed_areas／get_municipality_post_counts／get_dashboard_stats | 地域別などの公開集計。個人の調査計画・希少種は母集団に含めない |
| get_retention_cohorts | 獲得月別の利用者数と月次の活動・継続の集計 |
| get_kpi_quality_funnel／get_kpi_summary | 投稿の審査、写真・位置精度、承認あたりのAI token等の管理用指標 |
| get_ai_accuracy_stats | 信頼度区間ごとの承認・却下・一致、人手審査分の区別 |
| get_ai_cost_summary／detect_ai_anomalies | AI呼出・使用量の集計と異常監視。利用者公開の集計ではない |

管理用はSECURITY DEFINERの本体で管理者またはservice-roleを確認する。単にauthenticatedへのGRANTがあるだけで一般利用者へ公開する意味ではない（[authorization](authorization.md)）。
管理画面の集計はDBで済ませ、全投稿の個人情報をブラウザへ転送してから数える処理を避けている、と構造から読める。これは実装からの解釈である。
公開RPCも個人表へ触れ始めれば境界が変わる。[fieldwork](fieldwork.md)の公開経路検査を通し、非公開4表とrare-photosを混ぜない。

## 「精度」の指標は真の正答率と同じではない

KPIの完全率は写真ありかつaccuracy非NULL、測位の閾値は既定30mで数える。写真の内容が科学的に正しいことを、この完全率だけでは確認できない。
get_ai_accuracy_statsのmatch_rateは「承認済みかつ検出種が申告種と一致」の割合で、独立した正解ラベルとの比較ではない。自動承認したデータも含むので、人手審査分の値を分けて見る。
このRPCはai_result直下のconfidence／detected_speciesを読む。音声のnested結果をすべて同じように評価する関数ではない。
比率の分母が0ならNULLとする箇所があり、0％と同じ意味にしない。指標の目的・母集団を変える変更は既存の研究REQと照合する。

## 実験は割付と投稿時点の値を別々に残す

`experiments`は有効状態・rollout率・variants・seedを持ち、`get_my_experiment_variants`がseedと利用者idの決定的なhashで群を決める。
`experiment_assignments`は現在の割付、`posts.experiment_assignments`は投稿を送った時点の写しである。rollout設定を変えてRPCを呼び直すと、現在の割付が更新されることがある。
[lib/experiments](../../src/lib/experiments/index.ts)は1セッションで結果をキャッシュし、失敗・未ログインは空マップでcontrol相当へ戻す。認証変化時にキャッシュを破棄する。
圏外下書きの再送も送信時点の割付を取得する。観察時点や下書き作成時点に割り付け済みだったと解釈しない。

`get_experiment_metrics`は投稿に残ったvariant、開始前後、写真率、GPS率、再投稿率などをDBでまとめる。管理者／service-role限定である。
この集計はpostsのstatusをapprovedに限定していない。承認済みだけを母数とする貢献ランキングとは揃えない。
hash割付・前後比較の出力だけで、設定変更や欠測を補正した因果効果が自動的に証明されるわけではない。

## 運用と検査の入口

研究集計のSQLは[研究KPI migration](../../supabase/migrations/20260615000003_research_kpi_rpcs.sql)・[AI精度](../../supabase/migrations/20260708000001_ai_accuracy_stats.sql)、実験は[実験migration](../../supabase/migrations/20260603000002_experiments.sql)を参照する。
進行は[rls_user_progress](../../supabase/tests/rls_user_progress.sql)、コレクションは[rls_user_collection](../../supabase/tests/rls_user_collection.sql)、AI管理境界は[rls_detect_ai_anomalies](../../supabase/tests/rls_detect_ai_anomalies.sql)と[req316](../../supabase/tests/req316_notification_rpc_admin_guard.sql)が検査する。
指標を読む作業は[kpi-weekly-review](../runbooks/kpi-weekly-review.md)、AIコストは[cloud-cost-guardrails](../runbooks/cloud-cost-guardrails.md)へ進む。今回、実験の稼働状態や本番の研究指標値は照合していない。
