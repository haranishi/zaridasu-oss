# Supabase依存の実装台帳

確認日：2026-11-14〜15。現行source基点：bdb97062。実環境の照合はmetadataのみで、実レコード・秘密値は取得しない。
容量・ユーザー数等の詳細metadataはprivate作業記録に置き、repoへは転記しない。

## ソースと実環境の区別

- canonical `supabase/schema.sql` 単体は29テーブル・89関数・82ポリシー。migration追加分を含む現在の総数ではない。
- live public領域は34テーブル・114関数・80ポリシー・62独自trigger。34テーブルともRLS有効をmetadataで確認した。全ポリシーの正しさをこの件数で証明するものではない。
- `ai_call_logs`、`ai_cache_registry`、`admin_alerts`、調査依頼のコメント/応答等は追加migrationも参照する。
- liveでpublic領域からAuth領域へのFK参照は25件。AuthのUIDを替えるときは所有者・退会連動も移す必要がある。
- srcで文字列指定するRPCは32種。PostGISの実利用とRealtime購読は今回のsource調査では見つからなかった。

## 代替時に引き継ぐ機能

| 領域 | 現在の依存 | 移行時の条件 |
| --- | --- | --- |
| 業務DB | Postgres、Data API、SQL関数、RLS/GRANT、trigger | SQLを移すだけでは認可が消える。Worker側の検証済み主体と公開投影が必要 |
| 認証 | Supabase Auth/SSR、Google OAuth、UID、app_metadata.role、Cookie更新 | getUser相当の検証を維持。Cookie decodeやuser_metadataを管理権限にしない |
| メディア | public投稿写真/音声、private希少種/水域報告写真、派生.ai.jpgと変換URL | private ACL、削除連動、署名とorigin制限を維持 |
| バックグラウンド | 14のEdge handler、trigger/pg_net、Vault、cron、browser invoke | Outbox、retry/idempotency、実行者認可、通知の重複防止が必要 |
| 通知/削除 | recipient RPC、unsubscribe token、Auth FK/CASCADE、退会処理 | 内部RPCの実行権限と列GRANT、部分失敗後の再試行を維持 |
| offline | IndexedDBの未送信記録、AuthのSIGNED_OUT処理 | 再認証の強制やUID変更で未送信記録を失わない |

sourceには補助的なprivate `social-announce-state` bucketの参照もある。live metadataのbucketは通常の4つで、この補助bucketは見つからなかった。
告知重複防止の状態が不要とは推測せず、背景処理を移す段階で実稼働と保存先を照合する。

## 公開境界

- 投稿は `display_lat/display_lng` の公開投影を使う。hidden位置はNULL。raw座標を取得して画面で隠す方式にしない。
- private/他人の調査記録、unsubscribe token、内部recipient RPCをanonymousへ開放しない。
- DB管理tokenやSQL実行APIをブラウザへ置かない。Turso/D1にはPostgres RLSの自動移植を期待しない。
- AuthとDBを分ける場合、同じUIDと退会状態を保ち、跨る更新の部分失敗を再送できる設計が必要。

## 今回の実装判断と未確認

WebはOpenNextでCloudflareへ移す候補を実装し、SupabaseのDB/Auth/Storage/背景処理は維持する。
Turso（本人の「TaaS」が指す候補は確認中）とD1は、合成データで認可・transaction・再送・復元を比較する。
CloudflareとTurso CLIは認証済み。Cloudflareの移行先アカウントは本人へ確認中で、remote配備のみ保留する。
Supabase connectorはproject一覧が空だったため、正しいlinked projectを認識する認証済みCLIでmetadataを照合した。
Vercel connectorでは対象projectを取得できなかったが、認証済CLIの読取APIで同一projectを照合した。
Gitのproduction branchはmain。repoの `vercel.json` はGit自動配備を無効化し、専用production workflowはmain pushだけが対象。
Vercelのfork保護は有効で、custom domain以外はSSO保護。既存の配備経路や設定は変更していない。
料金・実負荷・研究日程・DB/Authの切替方法は未確定で、今回のlocal buildや合成試験を本番移行完了と扱わない。
