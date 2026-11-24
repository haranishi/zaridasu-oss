# 調査依頼の画面と投稿への引き継ぎ

基点：`6070714870e5`。状態遷移・座標の契約は [survey-requests](../current/survey-requests.md)。

## 依頼と記録の違い

投稿は観察結果、調査依頼は「この場所を調べてほしい」という働きかけ。
協力するという意思表示・依頼へのコメント・現地で得た投稿は、それぞれ異なるデータとして扱う。
希少種の非公開な調査計画とは別の公開機能。[調査計画](fieldwork.md) と混ぜない。

## 一覧と新規作成

[SurveyRequestsListPage](../../src/views/SurveyRequestsListPage.tsx) はURLクエリの状態・種・市町村・自分の依頼・並び順を取得条件へ変える。
フィルタをURLへ残し、ページ内stateにだけ閉じ込めない。取得は [useSurveyRequests](../../src/hooks/survey/useSurveyRequests.ts) に渡す。
既定は終了した依頼を除外し、作成順または緊急度を優先する。件数には取得上限がある。
一覧の取得失敗は再試行できる表示にし、0件の案内と分ける。
`/requests?create=1` は認証の復元を待って作成へ進む。未ログインなら共通AuthModalを開く。

[SurveyRequestForm](../../src/components/modals/SurveyRequestForm.tsx) は位置・市町村・種・理由・緊急度を入力する。
「何がいるか分からない」依頼のために種の `unknown` を許す。投稿側の種enumへそのまま拡張しない。
理由は1〜300文字、緊急度はnormal／urgent。hookが送信時に共有schemaを読み、DB到達前に検証する。
zodの読込を送信時に置く理由は、ホームにも載る依頼hookから初期bundleを増やさないため。
保存結果は公開の粗化座標を `lat/lng` の別名で返す。INSERT後に無指定の全列SELECTをしない。

## 詳細から現地記録へ

[request/[id]/page](../../src/app/request/[id]/page.tsx) はanon経路で存在とmetadataを取得し、未存在なら404にする。
本文の [SurveyRequestPage](../../src/views/SurveyRequestPage.tsx) は `get_survey_request_detail` を使い、本体・プロフィール・関連する承認投稿を得る。
このSSRは投稿詳細の初期値注入とは異なり、詳細viewは専用hookで取得する。両者を同じseed構成として扱わない。
所有者には確認付き終了操作を見せる。`responded` は紐付き投稿によるDB遷移なので、画面から先回りして設定しない。

「調査結果を投稿する」は依頼ID・種・公開位置・市町村・理由をsessionStorageへ退避してホームへ進む。
[HomePage](../../src/views/HomePage.tsx) が一度だけ読み取り、削除したあとPostFormへ渡す。依頼への紐付けは投稿の `survey_request_id` で保存する。
未ログインなら認証後に意図を再開する。sessionStorageが使えない場合はホームへ進むが初期値の引き継ぎは保証しない。
依頼がunknownのとき、投稿フォームは対象種の選択へ戻る。[投稿フォーム](map-posts-media.md)

## 協力意思と会話

[useSurveyResponses](../../src/hooks/survey/useSurveyResponses.ts) は協力人数・最近の協力者・本人の協力状態を取得する。
協力／取り消しは先に件数を変え、DB失敗なら戻す。成功後は一覧を取り直す。
協力表明は現地観察を実施済みという意味ではなく、投稿結果とも別に表示する。

[useSurveyRequestComments](../../src/hooks/survey/useSurveyRequestComments.ts) は削除されていないコメントを取得し、公開プロフィールを表示へ合わせる。
本文は共有schemaでtrim後1〜500文字を確認する。本人の削除操作は `soft_delete_request_comment` RPCへ渡す。
公開投稿のcommentsとは別の表・hook・削除方式なので、共通化時に同じ削除契約と思い込まない。
詳細viewは認証、協力、終了、コメント送信、削除確認の進行状態をそれぞれ持つ。

## 通知・変更・確認

新しい依頼と応答のメール通知は、UIの成功表示とは別のサーバー経路で送る。[通知とAI](notifications-ai.md)
メール設定の入口は [プロフィール](participation-profile.md)。送信処理失敗で依頼作成を失敗扱いにしない。
公開位置の粗化を表示側だけで外さない。読む列やRPCの権限を変える場合は [認可](authorization.md) を確認する。

一覧条件・フォーム初期値はview、CRUDはuseSurveyRequests、協力はuseSurveyResponses、会話は専用コメントhookが変更箇所。
[サーバー詳細テスト](../../src/app/request/[id]/__tests__/page.test.tsx) と [依頼フォームa11y](../../src/components/modals/__tests__/SurveyRequestForm.a11y.test.tsx) を参照する。
UIの操作検証では、認証復元中、unknownからの投稿、終了した依頼、失敗後の再試行、クエリ付き直アクセスを確認する。
DBの状態・権限・通知の検証入口は [検証案内](validation.md) と [現行仕様](../current/survey-requests.md)。
