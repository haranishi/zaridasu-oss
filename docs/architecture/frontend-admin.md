# 管理画面の責任と操作の流れ

基点：`6070714870e5`。画面の案内。審査と権限の正本は [現行審査仕様](../current/moderation.md)・[認可](authorization.md)。

## 管理者の入口

[admin/layout](../../src/app/admin/layout.tsx) が配下の `noindex`、[保護layout](../../src/app/admin/(protected)/layout.tsx) がサーバー認可を持つ。
保護layoutはAuthで利用者を検証し、未認証なら `/admin/login`、管理者以外なら `/` へ返す。
`/admin/login` は保護グループの外にあり、未ログインでも到達できる。
[AdminLayoutClient](../../src/app/admin/AdminLayoutClient.tsx) はエラー境界とセッション監視を付け、[AdminLayout](../../src/views/admin/AdminLayout.tsx) がナビとclient側表示判定を行う。
clientの `isAdmin` だけで許可する構成ではない。[proxy](../../src/proxy.ts)・保護layout・DBの認可がそれぞれ境界になる。

[AdminLoginPage](../../src/views/admin/AdminLoginPage.tsx) はメール認証、失敗回数の扱い、管理者の確認、認証結果の記録を受け持つ。
[useAdminSessionTimeout](../../src/hooks/admin/useAdminSessionTimeout.ts) は操作イベントを監視し、無操作25分で警告、30分でsignOutとログイン画面への移動を行う。
明示ログアウトはAuthContextの送信待ち確認を通るが、無操作タイムアウトは直接Authを呼ぶ。両経路を同一とみなさない。

## 運営ページの分担

| ページ本体 | 扱う判断・データの出どころ |
| --- | --- |
| [AdminDashboardPage](../../src/views/admin/AdminDashboardPage.tsx) | 期間比較、投稿内訳、最近の投稿・監査ログ。[useAdminStats](../../src/hooks/admin/useAdminStats.ts) が集計する |
| [AdminPostsPage](../../src/views/admin/AdminPostsPage.tsx) | 審査待ち・承認・却下の一覧、表示形式、単件・一括操作、CSV。操作は専用hookへ渡す |
| [AdminReportsPage](../../src/views/admin/AdminReportsPage.tsx) | 未対応／対応済みの通報、投稿削除、通報の解決。IPは [maskIp](../../src/lib/maskIp.ts) で既定表示を伏せる |
| [AdminCommentsPage](../../src/views/admin/AdminCommentsPage.tsx) | コメント検索・公式コメントの抽出・削除と監査記録 |
| [AdminUsersPage](../../src/views/admin/AdminUsersPage.tsx) | 管理者専用RPCで利用者と活動を取得し、確認後に権限付与・解除を依頼する |
| [AdminSpotsPage](../../src/views/admin/AdminSpotsPage.tsx) | 非公開スポットの研究用閲覧・CSV。公開投稿の審査表とは分ける |
| [希少種管理](../../src/features/fieldwork/admin/)・[水域報告管理](../../src/features/water/admin/AdminWaterReportsView.tsx) | 機能単位の管理画面。[調査](fieldwork.md)・[水域](water-geometry.md) |
| [AdminLogsPage](../../src/views/admin/AdminLogsPage.tsx) | `get_audit_logs` による操作・期間・管理者別の閲覧、表示中の記録をCSV化 |
| [AdminAiCostPage](../../src/views/admin/AdminAiCostPage.tsx) | 期間別のAI利用・費用集計。`get_ai_cost_summary` を表示する |
| [AdminExperimentsPage](../../src/views/admin/AdminExperimentsPage.tsx) | `get_experiment_metrics` による実験群ごとの指標比較 |
| [AdminKpiPage](../../src/views/admin/AdminKpiPage.tsx) | 参加、承認品質、継続コホート、AI精度の研究指標。[useAdminKpi](../../src/hooks/admin/useAdminKpi.ts) が取得する |

広い画面ではサイドバー、狭い画面では主要4項目と「その他」を使う。公開アプリの下部ナビとは別の操作体系。
集計カード、期間入力、円・棒・面グラフは [admin components](../../src/components/features/admin/) の表示部品へ分ける。
管理用と一般用の `StatCard`・`DonutChart` はpropsや幾何・markupが異なるため、規約上も別の部品として残っている。

## 審査操作の流れ

1. [useAdminPosts](../../src/hooks/admin/useAdminPosts.ts) が状態タブ・検索条件・ページ・選択ID・進捗・エラーを持つ。
2. 読み取り列と書き込みは [posts-admin](../../src/lib/data/posts-admin.ts) へ委ね、AIの保存値は [normalizeAIResult](../../src/lib/normalizeAIResult.ts) で画面用に揃える。
3. [ReviewCard](../../src/components/features/admin/ReviewCard.tsx) が記録を提示し、[ReviewCardAI](../../src/components/features/admin/ReviewCardAI.tsx) が根拠・画像／音声結果・再解析状態を見せる。
4. 承認・却下・削除などを確定したあと、監査を書き、一覧・未審査件数を取り直す。

[RejectDialog](../../src/components/modals/RejectDialog.tsx) は却下理由と補足、[DeletePostDialog](../../src/components/modals/DeletePostDialog.tsx) は対象を示す最終確認。
[BulkActionBar](../../src/components/features/admin/BulkActionBar.tsx) は選択件数と一括処理の入口を担う。
一括処理は各投稿を順に処理し、成功と失敗を数える。途中の1件の失敗を全件成功として扱わない。
正確な位置は専用RPCで必要時に取り、公開列を正確座標に置き換える共通読み取りは作らない。
CSVも公開アプリのCSVとは別の列・権限を持つ。[投稿と審査](posting-moderation.md)

## AI・取得失敗との付き合い方

画像／音声の再解析は専用Edge Functionへ依頼する。画面でAI結果を表示することと、人の審査は分けて読む。
[useGeminiAuthBanner](../../src/hooks/useGeminiAuthBanner.ts) は直近の認証エラーを調べ、管理画面共通の警告とセッション内の閉じる状態を持つ。
通知・AIのサーバー側経路は [通知とAI](notifications-ai.md) を参照する。
統計・KPIは [settleAll](../../src/lib/settleAll.ts) で一部失敗を他の指標から隔離する。取得できなかった項目を実測ゼロと解釈しない。
運営一覧の状態と操作エラーはview／hookに残るため、UIの変更時は成功表示だけでなく再試行・部分失敗も確認する。

## 変更と確認

審査の取得・更新・一括処理はhook、カードの情報階層はcomponents、運営指標はStats／KPIのhookが変更箇所。
権限・正確座標・公開条件を変える場合は、画面と [認可](authorization.md)・DBテストを一緒に確認する。
[管理画面テスト](../../src/views/admin/__tests__/)、[管理投稿hookテスト](../../src/hooks/admin/__tests__/useAdminPosts.test.ts)、[AIカードテスト](../../src/components/features/admin/__tests__/ReviewCardAI.test.tsx) を参照する。
[noindex契約](../../src/app/admin/__tests__/admin-noindex.test.ts) と [タイムアウトテスト](../../src/hooks/admin/__tests__/useAdminSessionTimeout.test.ts) は管理領域共通の境界を固定している。
