# 合成DBで再送・退会再試行・暗号化復元を比較する

移行検証者向けの[6.9](../../.kiro/specs/cloudflare-migration/implementation-tasks.md)の証拠と制約。
[実行契約9.5](../../.kiro/specs/cloudflare-migration/execution-20261114.md)のローカル試作で、アプリの保存先は変更しない。
起動・隔離条件は[README](README.md)、既存の認可と審査は[6.8](authorization-atomicity.md)を参照する。
確認日は2026-11-15。Turso 0.8.3/native、Miniflare 5.20261113.0-beta/workerdのlocal D1を使用した。

## 同じ送信キーの再試行をquotaより先に解決する

水域原票は検証済み本人と端末のclient IDを組にする。端末の元所有者が本人と違えば拒否する。
同じキー・同じ入力は元のIDと受付時刻を返し、内容変更はCONFLICTにする。上書きしない。
写真は本人のUUID/JPEGパス1〜3件だけを許可する。写真の実体・署名URLは今回の対象に含めない。
役割・審査・研究状態・ハッシュ・受付時刻の入力は拒否し、受付時刻はサーバー側の時計で決める。
水域原票には観察日が無い。投稿fixtureの観察日と受付時刻は復元比較で区別する。

制限は保存済み原票から直近60分20件・本人総数1000件を数える。[現行SQL](../../supabase/schema.sql)の条件に合わせた。
00:01時点の23:50の記録と60分ちょうどを数え、60分と1ms前は除外する。
6.8の固定時間枠カウンターは独立した競合試験のまま保持し、原票保存のquotaには使わない。
検査では保存・重複防止の受領記録・outboxを同じnative transaction/batchへ入れた。
競合・上限・現在の退会状態で対象が見つからない場合、NOT NULL制約で全取消してCONFLICTを返す。
SQLへ渡す値はbindし、時刻・上限・時間枠をリクエストから受け取らない。

最初の応答だけをcommit後に落とし、本人の照会と再送で二重行・二重イベントが無いことを確認した。
両者同時に同じキーを送る32要求と、上限付近の並行要求も実行した。
Tursoは同じファイルへの2接続、D1は同じbindingへの並行batchを使い、アプリmutexは置かない。
最後のoutboxに実UNIQUE制約エラーを起こしても、原票と受領記録は残らない。

## 退会の失敗箇所を記録して再試行する

退会要求でアカウントをdeletingにし、古い認証での読書きと未配信イベントの取得を止める。
削除workerの試験用認証はoutbox用と分ける。NULL・他人の申告・内部purposeの流用を拒否する。
DB清掃後も非公開メディアの削除が失敗すればAuth削除へ進まない。
メディア清掃後にAuth削除が失敗した場合は、その段階から再試行する。
外部例外の本文は保存せず、失敗箇所と試行回数を残す。

投稿は所有者をNULLにして残し、監査は行を残してactorだけNULLにする。
本人の非公開水域原票・プロフィール・quota・受領記録を除去する。
原票のoutboxと審査claimを先に除去し、退会者が審査した別原票のreviewed_byもNULLにする。
outbox対象IDのNOT NULLは維持する。[6.8](authorization-atomicity.md)の更新0件を失敗にする条件を弱めない。
所有者を持たない審査済み公開水域と他人の原票は残す。
コメントは現行schemaとmigrationの削除方針が未解決なので、このfixtureには追加しない。

外部操作は合成callbackで、DBだけは実エンジンを使う。メディア側の削除後timeoutも再現した。
外部削除は対象が既に無くても成功する契約が必要で、厳密な一度限りの実行を保証しない。
DB清掃への実FKエラーでは全清掃が取り消され、試行回数とdeleting状態を保持した。
再試行後のcompletedは追加の外部呼出や匿名化のやり直しを生まない。

削除済みUIDを再登録・復元で有効化しないため、accountsと削除jobにtombstoneを保持する。
メディア参照は削除成功後に空にする。UID・監査・削除job・受領記録の保持期間と消去条件は採用前に定める。
古いsnapshotだけでは、その後の退会や失効を再現しない。再開前に差分台帳を照合する検証が必要である。
公開写真/音声の実体と旧UID入りURL、既発行の非公開署名URL、実session失効は未検証である。

## 書込みを止めた論理snapshotから新規DBへ戻す

呼出側がpeer接続と削除workerを含む全writerを止めてから、quiescedを明示する。
同じnative transaction/batchで全登録表とFKを読み、稼働中のDB/WALファイルはコピーしない。
暗号化はNode標準のAES-256-GCMを使い、鍵は試験ごとの乱数をメモリだけに置く。
これは合成データ用の最小envelopeで、鍵管理サービスや本番バックアップの実装ではない。
誤鍵・改ざんは復元前に拒否する。既存backupや実ユーザーの鍵・tokenは読み込まない。

format・schema hash・表・列を固定し、2MiB・1表5000行・合計10000行・JSON深さ10を上限にする。
UUID・数値・日時・JSON・文字列も型と長さを検査し、artifact内のSQLは実行しない。
新規の所有dir内にschemaだけを作り、bind値から原子的に復元する。
実FK/CHECK失敗ではtransactionを取り消して新規dirを清掃し、元fixtureを保持する。
投稿/原票に加え、審査claim・受領記録・outbox・削除job・quotaも復元対象である。
ID/UID・UTC・観察日・NULL/0・JSON・位置精度・件数・主キー集合・正規化SHA-256・FK不整合0を比較した。
受付・審査時刻はUTCの `YYYY-MM-DDTHH:mm:ss.sssZ` に限定し、`Date.toISOString()` との一致で検査する。
PostgreSQLのマイクロ秒・offset付き表現は拒否するため、精度を保つ正規化の証拠にはしない。
`timestamptz` を精度を落とさず正規化する処理と照合は未検証で、採用前の条件に残る。
復元後も本人/他人/匿名/管理者/内部のAPI許可と拒否、同じキーの再送、退会の続きを検査した。
TursoからD1への論理復元も一致した。両者のbinary DB形式が交換可能という証拠にはしない。

## 採用前には実Auth・端末・remote運用の証拠を追加する

| 対象 | Turso/native local と D1 local の結果 | 採用前に必要な証拠 |
| --- | --- | --- |
| 再送・制限・部分失敗 | 同じ契約で合格 | 実Workers APIとremote/replicaのread-after-write |
| 復元 | 合成の暗号化論理復元と認可が一致 | Auth・R2実メディア・鍵を含む隔離復元、PITR/RPO/RTO |
| 認証とUID | 不透明な試験用認証と退会状態のみ | 実UID/同UIDプロフィール作成、25件のAuth FK、provider adapter/原子性/hash、Google/メール全経路 |
| 端末保存 | 元所有者と別人の再送を拒否 | 再認証UI・通常logout・古いSW/別タブ/別UID/実端末の保持と凍結 |
| 基盤全体 | 代表fixtureだけ | live34表/114関数/80policy、Storage、14 Edge処理/cron/remote outboxの移植 |
| 負荷・運用 | local原子性だけ | SDK/plan制限、秋田からのp50/p95・失敗率・費用/予算・容量・切り戻しと書込正本 |

[AuthContext](../../src/context/AuthContext.tsx)のSIGNED_OUTは計画控えとフォーム草稿を清掃する。
送信待ち・圏外IndexedDBはそのイベントだけでは消さず、通常logoutの明示的な破棄と退会で清掃する。
移行再認証で草稿を消さず、元UIDのキューを凍結し、同UIDだけで再送するUIは未実装である。
[認証切替](../../.kiro/specs/cloudflare-migration/auth-cutover.md)と[DB判断](../../.kiro/specs/cloudflare-migration/database-decision.md)を採用判断へ引き継ぐ。
新TursoのWorkers/serverless SDKと旧libSQLは別検証で、今回のnative結果を流用しない。
合格件数から速度・料金の優位や採用製品は決めない。本番書込先とSupabaseの正本を維持する。
