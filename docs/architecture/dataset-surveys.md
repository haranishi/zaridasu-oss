# 公開配布と調査依頼は異なるデータ契約を持つ

公開データセットは外部の研究利用者へ配る成果物、調査依頼は利用者同士が現地調査を募る機能である。
前者は配布列と位置精度の互換性、後者は依頼・協力意思・観察結果の違いを保つことが変更時の要点になる。
基礎の表は[data-model](data-model.md)、研究指標と実験は[data-model-research](data-model-research.md)を参照する。

## 配布列は1つの定義からすべて導く

[CSV route](../../src/app/dataset/zaridasu.csv/route.ts)の`DATASET_COLUMNS`がヘッダー、SELECT、値、GeoJSON採用有無、説明文の正本である。
[GeoJSON route](../../src/app/dataset/zaridasu.geojson/route.ts)と[/datasetページ](../../src/app/dataset/page.tsx)もこれを再利用し、ヘッダーと値のずれ・説明表の更新漏れを避ける（REQ-310）。
CSVは14列、GeoJSONは座標をgeometryへ置くため12プロパティ。GeoJSONの座標順は経度・緯度である。
種・情報種別は安定コードと日本語ラベルの両方を持ち、画面の翻訳変更で配布コードを変えない。
配布済みの列名・順序・意味を変えず、新しい列は末尾へ追加する。コードのMITと配布データのCC BY 4.0は別の契約である。

## 配布物は公開投稿の位置をさらに制限する

| 対象 | 出力規則 |
| --- | --- |
| status | 承認済みだけ。本人のCookieを使わないanon読取 |
| 座標 | display_lat/lngを再度小数3桁へ丸める。precise投稿も配布では粗化 |
| hidden・不正座標 | 行を除外。0,0などの代替値を作らない |
| 個人情報 | user_id・IP・メール・自由記述・写真URL・accuracyを列へ持ち込まずSELECTもしない |
| メタ情報 | ライセンス、粗化、生成日時、件数、任意投稿で観察努力に偏りがある旨を明記 |

`useCsvExport`のアプリ内CSVとは別の契約で、公開側のlocality／water_bodyと画面側の天候・気温を統一しない。
CSVのセルは共通[lib/csv](../../src/lib/csv.ts)で引用と数式先頭文字の無害化を行う。配布物だから生の利用者入力を無処理で結合してよいわけではない。

## キャッシュと取得上限には完全性の限界がある

フィルターは種・秋田の市町村・日付を検証し、日付はcreated_atに適用する。観察日時での並べ替えとは別である。
1000件ずつ、観察日時＋一意idの順序でoffsetを進め、最大10万行で止める。各ページでクエリを組み直し、短いページを終端とする。
環境未設定なら空、途中のDBエラーなら取得済み分を返す。エラー時も部分データが200のファイルとして返り得るため、HTTP成功を全件取得の証明にしない。
最大件数到達は警告するが、継続取得用のcursorを配るAPIではない。ページ間の更新を固定するスナップショット取得でもない。
日次のCDNキャッシュとstale-while-revalidateを許す。大量取得の分散レート制御はアプリ外のFirewall等が担当し、設定済みかは[runbook](../runbooks/dataset-og-rate-limiting.md)で別に確認する。
固定版の研究公開・DOIは[open-data-doi](../runbooks/open-data-doi.md)へ進む。今回の文書化はデータの公開操作やDOI登録を含まない。

## 調査依頼・協力意思・結果投稿を分ける

| データ | コードと意味 |
| --- | --- |
| survey_requests | [useSurveyRequests](../../src/hooks/survey/useSurveyRequests.ts)。場所・対象・理由・緊急度とopen／responded／closed |
| survey_request_responses | [useSurveyResponses](../../src/hooks/survey/useSurveyResponses.ts)。「協力する」の意思表示であり観察結果ではない |
| posts.survey_request_id | 結果投稿と依頼の関係。種・位置・審査はposts側の規則 |
| survey_request_comments | [useSurveyRequestComments](../../src/hooks/survey/useSurveyRequestComments.ts)。依頼についての直接会話 |
| survey_sites | 自分の定点調査地点。募集する依頼や日別の行動計画とは別 |

依頼はunknown種も許す。理由は1〜300文字で、入力スキーマとDB CHECKを合わせる。作成・編集・削除は本人、閲覧は公開の規則を持つ。
公開座標は常に小数3桁のdisplay列で、生列はSELECT権限から外す。投稿のようなprecise／hiddenの段階は無い。
[protect_survey_request_columns](../../supabase/schema.sql)は本人の直接UPDATEで所有者・作成時刻・集計値・座標・対象・理由などを旧値に戻す。statusはclosedへの変更だけを許す。

## respondedは結果の承認を意味しない

[statusトリガー](../../supabase/migrations/20260425000002_survey_request_status_trigger.sql)はsurvey_request_id付きのposts INSERTでopenをrespondedへ変える。クライアントが二重に変更しない。
トリガーは投稿のstatusを承認済みに限定しないため、依頼がrespondedでも結果はまだpendingの場合がある。
「協力する」を押すだけではこの遷移は起きない。response_countは[応答migration](../../supabase/migrations/20260425000003_survey_request_responses.sql)のINSERT／DELETEトリガーで同期し、同じ利用者×依頼は一意にする。
closedへの新規協力・直接コメントはDBが拒否する。既存の協力取消は本人のDELETEで、画面は楽観的な件数を失敗時に戻す。
依頼statusの`updateStatus`はerrorだけを確認し、影響行の0件を検出していない。投稿データ層の成功検証が全機能へ一律に移行済みとは扱わない。

## 詳細取得と会話には独自の公開経路がある

`get_survey_request_detail`はSECURITY INVOKERでRLSを維持し、依頼・プロフィール・承認済み関連投稿の最大10件を1往復で返す。通信エラー・対象なし・中止をフックで分ける。
[コメントmigration](../../supabase/migrations/20260425000005_survey_request_comments.sql)はsoft_delete_request_commentで本人削除を扱い、`survey_request_timeline`で依頼コメントと関連投稿コメントを統合する。
ただし現行の直接コメントフックはtimelineビューを読まず、自表とプロフィールを取得する。DBにビューがあることと画面で使うことを区別する。
イベント通知は[notify-survey-request](../../supabase/functions/notify-survey-request/index.ts)が担当し、通知設定・本人除外などは[notifications-ai](notifications-ai.md)に記載する。

検証は[CSV](../../src/app/dataset/zaridasu.csv/__tests__/route.test.ts)・[GeoJSON](../../src/app/dataset/zaridasu.geojson/__tests__/route.test.ts)・[依頼RLS](../../supabase/tests/rls_survey_requests.sql)・[依頼通知](../../supabase/functions/notify-survey-request/__tests__/handler.test.ts)を入口にする。
利用者に見える現行仕様は[public-dataset](../current/public-dataset.md)・[survey-requests](../current/survey-requests.md)にあり、変更履歴は既存REQへ残す。今回、本番データの件数や配布の完全性は照合していない。
