# 権限は画面・DBの行・列・関数で重ねて守る

ザリダスはブラウザからSupabaseへ直接読み書きする。画面でボタンを隠すだけではデータを守れないため、DB側の権限が最終的な境界になる。
以下はローカルSQLと実装から読める契約で、本番の権限設定を再検証した結果ではない。セッションの成立と画面の入口は[authentication](authentication.md)を参照する。

## 読み書きの可否は4種類の仕組みで決まる

| 仕組み | 守るもの | このコードでの例 |
| --- | --- | --- |
| GRANT／REVOKE | ロールが表・列・関数を操作できるか | 生座標、通報IP、内部表、通知起動RPCの公開を制限 |
| RLS（行ごとのポリシー） | 操作できる行 | 自分の投稿だけ編集、公開投稿だけ閲覧 |
| CHECK／トリガー | 値の整合性と変更できる列 | 一般利用者の審査状態を旧値に戻す、INSERTをpendingに固定 |
| RPC本体の認可 | 所有者権限で実行する関数の入口 | 管理集計の管理者確認、本人の正確座標の取得 |

GRANTが無ければ、RLSで対象行が許されても操作できない。RLSが通っても、トリガーで送った値が戻されることがある。
`SECURITY DEFINER`は関数の所有者権限で実行する指定であり、呼び出した利用者のRLSだけに頼れない。`SECURITY INVOKER`は呼び出し元の権限で動く。

## 利用者・管理者・バックエンドの権限を混同しない

| 経路 | 閲覧・変更の範囲 |
| --- | --- |
| 未ログイン（anon） | 承認済み投稿など公開データの閲覧と通報。投稿INSERTは不可 |
| ログインした本人 | 自分の全状態の投稿、編集・削除、自分の非公開スポットや調査。審査列は変更不可 |
| 管理者 | `app_metadata.role === 'admin'`。審査、管理用読取、対象表で許された削除・設定 |
| service-roleのEdge処理 | RLSを迂回する。AI結果・運用情報の書き戻しや配信。呼び出し元の検証は各関数の責務 |

管理者の判定に、本人が編集できる`user_metadata`は使わない。middleware・管理レイアウト・RLS／RPCがそれぞれ確認する。
「管理者なら全表を自由に編集できる」わけでもない。調査計画と希少種の4表では、管理者の読取・削除は広げても作成／編集は自分の分に限る（[fieldwork](fieldwork.md)）。

## 公開座標をSQLの列権限まで分ける

`posts.lat/lng`と`survey_requests.lat/lng`はanon／authenticatedの列SELECTから外す。SELECTだけでなくWHEREでの参照もできない。
投稿の公開用生成列`display_lat/lng`は、`precise`なら生値、`coarsened`なら小数3桁、`hidden`ならNULLになる。NULLを0へ置き換えると位置非公開の契約が崩れる。
所有者も生列を直接SELECTせず、`get_my_post_location` RPCで自分の正確座標を取る。管理者の一括取得は`get_admin_post_locations`を使う。

一般利用者は位置を`hidden`へ変更でき、公開へ戻す・精度を上げる操作はできない。
`zz_stash_hidden_post_geo`は細かな地名も`post_hidden_geo`へ移し、公開列から消す。位置だけ伏せて水系名から場所が割れるのを避ける。
[posts.ts](../../src/lib/data/posts.ts)は公開列を明示し、画面用には`display_*`をlat/lngへ別名で返す。[dataset](dataset-surveys.md)はさらに3桁へ統一する。

## INSERTとUPDATEの保護は別々に存在する

[schema.sql](../../supabase/schema.sql)の`protect_post_insert_columns`は一般利用者が送ったstatus・運用列・AI列・地理付与列を初期化し、種の既定公開レベルを適用する。
`protect_post_status`はUPDATE時に審査・AI・hash・音声・気象・精度・研究採用・所有者などを旧値へ戻す。`is_anonymous`も別のトリガーで固定する。
管理者とservice-role、JWT claimsが無いDB内部の処理は通す分岐がある。これを「JWTが無くても外部APIから更新できる」と読み替えない。外側のGRANTとRLSが別に適用される。

UPDATE／DELETEはRLSで対象が消えると、エラー無しの0行として返ることがある。[posts-write](../../src/lib/data/posts-write.ts)・[posts-admin](../../src/lib/data/posts-admin.ts)・[private-spots](../../src/lib/data/private-spots.ts)は返却idを確認し、0行を成功表示にしない。
既存の別機能がすべてこの検出を持つわけではない。例えば調査依頼の`updateStatus`はerrorだけを見るため、無権限と成功を影響行から区別しない（[dataset-surveys](dataset-surveys.md)）。

## RPCはPUBLIC経由の実行権限も閉じる

`anon`から直接REVOKEしても、`PUBLIC`のEXECUTEが残れば呼べる。既存の教訓と是正対象は[REQ-298 migration](../../supabase/migrations/20260803000002_req298_revoke_function_execute_from_public.sql)にある。
[REQ-316 migration](../../supabase/migrations/20260926175847_req316_notification_rpc_and_admin_guard.sql)は通知ラッパーと外側のバッチ入口を`PUBLIC, anon, authenticated`から閉じ、service-roleへ限定する。
管理用RPCは明示GRANTに加えて本体の管理者確認を持つ。`get_ai_cost_summary`はrole欠落を`IS NOT TRUE`で拒否する。公開ランキングや配信停止RPCは用途に必要な公開入口として別扱いにする。

## Supabaseクライアントを用途で選ぶ

| 実装 | 用途と失敗時の扱い |
| --- | --- |
| [client.ts](../../src/lib/supabase/client.ts) | ブラウザ用singleton。遅延Proxyでimport時の環境参照を避け、設定不足は呼出時に例外 |
| [server.ts](../../src/lib/supabase/server.ts) | Cookie付きSSR。ログイン本人として読み書きする |
| [anon.ts](../../src/lib/supabase/anon.ts) | Cookieを読まない公開SSR／ISR。設定不足はnullで、呼び出し側が空・既定表示にする |
| [supabaseAdmin.ts](../../supabase/functions/_shared/supabaseAdmin.ts) | Edge専用のservice client生成点。新方式secretを優先し、legacyキーへfallback |

公開ルートをCookie付きクライアントへ寄せるとキャッシュ方針も変わる。アダプターの統一を理由に認証と配信特性を変えない。

権限の根拠は[SQLテスト群](../../supabase/tests)の`rls_posts`・`rls_location_privacy`・`rls_req329_*`・`rls_req330_*`・`req298_*`・`req316_*`。
CIでの構築順と本番反映は[operations-ci](operations-ci.md)、手作業の確認範囲は[hardening runbook](../runbooks/supabase-hardening-checklist.md)を参照する。
