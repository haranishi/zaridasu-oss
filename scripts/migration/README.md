# TursoとD1を同じ合成データで起動する

移行検証を担当する開発者向けのローカル試験環境。
[実装タスク6.7](../../.kiro/specs/cloudflare-migration/implementation-tasks.md)のセットアップを扱う。
6.8は[権限と原子性](authorization-atomicity.md)、6.9は[再送・退会・復元](recovery-and-restore.md)を参照する。
アプリのデータ層から独立させ、既存DB・Auth・Storageの正本を維持する。
初回は実行手順と境界を読み、以降は必要な項目を参照する。

## 独立lockから検査する

Node 22.23.4を使用する。rootの依存を再インストールする必要はない。
cacheの保存先を変える場合だけ、npmコマンドへ任意の`--cache <path>`を追加する。

```sh
cd scripts/migration
npm ci --ignore-scripts --userconfig=/dev/null --globalconfig="$PWD/.runtime/npm-globalconfig"
node --test --test-concurrency=1 ./*.checks.mjs
npm audit --audit-level=low --userconfig=/dev/null --globalconfig="$PWD/.runtime/npm-globalconfig"
```

インストール時のscriptを停止した状態でも、配布済みnative packageで実エンジンが起動することを確認した。
`.env`・`.dev.vars`・Wrangler設定やログイン済みTurso CLIは読み込まない。
検査は既知のcredentialパスの読取りとNodeの外部通信を拒否し、Miniflare側でも外部通信を拒否する。
このguardはNodeの対象経路を検査し、OS syscall全体の遮断は保証しない。
DBの接続先は生成したローカルパスとD1 bindingに固定され、環境変数のURL/tokenから接続先を選ばない。
依存取得・npm監査の通信と、DB試験中の通信は別に扱う。

## closeとresetを使い分ける

`createLocalFixture('turso')`または`createLocalFixture('d1')`で、毎回新しい合成DBを作る。
生成先はこのディレクトリ内の`.runtime/`。DB・WAL・workerdの状態はGit対象外。
`close()`は接続だけを閉じ、`reopen()`は同じ保存先を開く。再seedはしない。
`reset()`はそのfixtureが所有する保存先を削除し、新しい保存先へseedし直す。
`destroy()`は接続と所有する保存先を片付ける。破棄後の再開は拒否する。
所有markerや実パスが違う保存先、差し替えられたsymlinkは削除しない。
ライフサイクル操作は順番に呼び、検査の`finally`で`destroy()`を実行する。

`query`・`execute`はbind値を受け取るINTERNALな試験用SQLアダプター。
`database`は後続試験でengine固有のtransaction/batchを検証するための実SDKオブジェクト。
これらをブラウザへ公開せず、HTTPでSQLを受け付ける経路も作らない。
認証済み主体の検証や一般利用者の認可は、別のローカル参照APIで検査する。

## 原票と公開投影を混ぜない

fixtureは34表の完全移植ではなく、後続試験に使う代表データである。
UID・UUID・観察日・UTC受付時刻・NULL・0件・JSON・審査状態を決定的な値で保存する。
`created_at`は受付時刻、`observed_at`は観察日。審査は元の受付時刻を維持する。
6.8はプロフィールと審査の入力制限を扱い、投稿受付時刻の固定は6.9の保存処理で検査する。
公開座標は[現行schema](../../supabase/schema.sql)どおりpreciseが原座標、coarsenedが小数3桁、hiddenがNULL。
原座標と非公開地名は`posts_raw`、公開値は`posts_public`に分け、公開表にはtoken/IPを置かない。
`water_reports`は非公開原票、`community_water_bodies`は審査済みの公開投影を表す。
プロフィールの配信停止tokenと写真の参照は合成値だけで、写真の実体は作らない。
fixtureの公開投影は明示した初期データであり、審査APIやDB権限の実装済み証拠にはならない。

投稿の所有者はNULLを許し、6.9で退会後の匿名化と監査保持を検証した。
6.9の削除jobは合成の外部操作を使い、進捗と失敗を記録して退会を再試行する。
[現行privacy](../../docs/current/privacy.md)の投稿保持・非公開原票削除を後続試験へ引き継ぐ。
コメントの退会時の扱いは現行でも判断待ちであり、このfixtureで決めない。
監査の対象IDにはFKを付けず、対象の削除後もactorをNULLにして行を保持できる。
outboxの対象FKは試作用の制約で、原票削除には先にoutboxを扱う必要がある。
6.8の固定quota予約とは別に、6.9で直近60分と総数の制限を原票保存へ結合して検査した。

## 今回確認したエンジンと限界

2026-11-15にNode 22.23.4、darwin arm64、Node modules ABI 127／N-API 10で確認した。
`@tursodatabase/database`・`database-common`・`database-darwin-arm64`は全て0.8.3。
nativeファイルはMach-O arm64で、実際にcreate/seed/query/close/reopenを実行した。
D1はMiniflare 5.20261113.0-beta、workerd 1.20261113.1の実local bindingを使った。
V4形式の設定は、同梱の`convertV4MiniflareOptions`を通してV5へ渡す。
両engineでbind、PK/UNIQUE/CHECK/FK拒否、件数・主キー・正規化SHA-256・FK不整合0を確認する。
他OS/CPU、remote版の接続・Workers SDK・遅延・一貫性・料金plan・実Auth/メディア復元は未検証。

[公式Turso TS資料](https://docs.turso.tech/sdk/ts/reference)は、今回のlocal engine、remote用の
`@tursodatabase/serverless`、旧libSQL用の`@libsql/client`を区別している。
今回のlockにはremote SDKと旧libSQL clientを含めていない。
D1 bindingの根拠は[公式Miniflare資料](https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/)を参照する。
6.8の認可・原子性に続き、6.9で再送・削除の部分失敗・合成の暗号化論理復元を検査した。
疑義や採用判断は[移行仕様](../../.kiro/specs/cloudflare-migration/database-decision.md)へ戻す。
local検査の合格だけでTurso/D1の採用、remote配備、既存基盤の廃止を決めない。
