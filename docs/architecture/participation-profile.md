# プロフィール・通知設定・配信停止

基点：`6070714870e5`。公開範囲の正本は [privacy](../current/privacy.md)、通知方針は [notifications](../current/notifications.md)。

## 本人管理と公開プロフィール

[DashboardPage](../../src/views/DashboardPage.tsx) が本人のプロフィール管理、[ProfilePage](../../src/views/ProfilePage.tsx) が他の人に見せる紹介と活動を担う。
`/profile` または本人IDを開いた場合はマイページへ送る。公開ページに本人のメールや管理操作を置かない。
[useProfile](../../src/hooks/useProfile.ts) は `get_user_profile` でプロフィールと集計を取得する。非公開・該当なしと取得エラーを分ける。
`useBadgeDefinitions` は定義を読み、ProfilePageが獲得IDに照合して表示する。
[useCountUp](../../src/hooks/useCountUp.ts) と [achievement](../../src/lib/achievement.ts) は数値や新しいバッジの表示演出を担う。
端末に残す「既に見た」印は報酬の正本ではない。動きを減らす設定でも最終値と獲得状態を表示する。

[EditProfileModal](../../src/components/modals/EditProfileModal.tsx) が表示名・自己紹介・絵文字・公開可否・通知設定をまとめる。
保存はuseProfileの検証と本人のUPDATEを通り、成功後に取り直す。失敗時はモーダルを閉じずインラインに残す。
拡張絵文字には段階解放があるが、既に選んでいる絵文字は奪わない。[参加UI](participation.md)
`is_public` は公開プロフィール・比較表示の境界になる。回答地域などの非公開情報を同じ表へ足さない。
user_profilesの公開時の列保護は [認可](authorization.md) を確認する。UIのチェック項目だけでは秘密列を保護できない。

## メールとPushは別の設定

メールは既定で受け取り、Pushは既定で無効。編集モーダルのメール設定は調査依頼・研究採用・再訪案内・週次ダイジェストを保存する。
DBにある全通知列に個別の設定UIがあるわけではない。例えば応答ダイジェストの列と、このモーダルの保存項目を区別して読む。
メールの送信・通知カテゴリのサーバー側契約は [通知とAI](notifications-ai.md) を参照する。

[usePushSubscription](../../src/hooks/usePushSubscription.ts) はブラウザ対応、許可、端末購読、DB保存と進行状態を管理する。
マウントだけでは許可を求めず、利用者がトグルをONにしたときだけ要求する。
iOSはホーム追加が必要な場合を分け、API非対応・公開VAPID key未設定もUIへ理由を返す。
ブラウザで拒否済みなら再要求せず、設定の案内を出す。メール設定の保存ボタンとは別の即時操作になる。

購読時はSWのPushManagerから端末購読を得て、本人IDとendpointで `push_subscriptions` にupsertする。
審査結果・コメント・近隣投稿のPush opt-inをまとめてONにする。カテゴリ別の個別トグルを持つという意味ではない。
解除時は端末購読とDB行の削除を試み、プロフィールのPush設定をまとめてOFFにする。
プロフィールのPush設定はアカウント単位なので、単一端末の解除と全端末の受信方針の関係を改修時に確認する。
通知endpointや購読鍵は認証情報として扱い、コード説明・ログへ実値を転記しない。

## メールリンクからの配信停止

[UnsubscribePage](../../src/views/UnsubscribePage.tsx) はメール由来のtokenとカテゴリを読み、`apply_unsubscribe` RPCへ渡す。
メールから直接止められるよう、ログインは求めない。token付きURLを共有用URLや計測へ混ぜない。
着地時に対象カテゴリを停止し、成功後は全部停止の操作も用意する。
処理中・成功・無効リンク・通信失敗を分け、失敗時に再試行できる表示を返す。
サーバーのtoken検証が認可の境界であり、カテゴリ表示の切り替えだけで本人性が成立するわけではない。

## 変更と確認

公開内容はProfilePage、設定項目はEditProfileModal、取得・保存はuseProfile、端末購読はusePushSubscriptionが入口。
設定追加ではDB既定値、本人更新権限、送信側の参照列、配信停止カテゴリ、4言語を併せて確認する。
退会とログアウトは [認証](authentication.md)、公開プロフィールのnoindexは [SEO](localization-ui-seo.md)。
[プロフィールhookテスト](../../src/hooks/__tests__/useProfile.test.ts)、[ダッシュボードa11y](../../src/views/__tests__/DashboardPage.a11y.test.tsx)、[獲得演出テスト](../../src/lib/__tests__/achievement.test.ts) を参照する。
ブラウザ許可・端末購読・配信はコードの読み取りだけでは動作保証にならない。実行した検証と未確認を [検証案内](validation.md) に沿って分ける。
