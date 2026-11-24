# 業務DBはTursoを先に検証し、D1と同じ条件で選ぶ

状態：採用未確定。[実行契約9.5](execution-20261114.md)の合成local試作まで実施。性能・料金・本番復元は未検証。
CloudflareのSQL DBはD1、オブジェクト保存はR2。この計画では「R1」という製品を前提にしない。

## 候補ごとの得失

| 判断軸 | Supabase PostgreSQL継続 | Turso Cloud | Cloudflare D1 |
| --- | --- | --- | --- |
| 現行SQL・RLS・RPC | 既存方式を維持できる | PostgreSQL固有処理を移植 | PostgreSQL固有処理を移植 |
| 接続と認可 | Data APIとRLSを継続 | Workers API＋サーバー専用トークン | Workers API＋binding |
| 運用先 | CloudflareとSupabase | Cloudflare・Turso・移行中のAuth | Cloudflare・移行中のAuth |
| 持ち運び | PostgreSQL資産を維持 | SQLite系SQLとHTTP接続を利用しやすい | SQLite系SQL。binding/APIの接続部は専用 |
| 競合と複数行更新 | 既存行ロック等を維持 | 選ぶエンジン/SDKの原子性を検証 | batch・条件付きSQLで原子性を検証 |
| 復元 | 現行暗号化dump＋Storage | プランの復旧機能＋暗号化exportを検証 | Time Travel＋暗号化exportを検証 |
| 主な費用 | DB/Auth/Storageの実利用 | DB読書き・容量・通信＋Workers/R2/Auth | DB読書き・容量＋Workers/R2/Auth |
| 向く判断 | まずWebを安全に移す | DBをCloudflare外からも扱う余地を残す | 運用・権限管理をCloudflareへ寄せる |

Tursoを先に試す理由は、DBの接続をWorkers固有bindingから分離できることと、SQLite系を検討する意向にある。
D1は運用をまとめやすい。移植工数が同等でTurso側の運用や復元に利点が無ければ、D1を選ぶ。
どちらも採用条件を満たさなければSupabaseを継続する。無理にDB移行をWeb移行の必須条件にしない。
安い・速いという結論は、実測と契約確認の前には置かない。

## Tursoのエンジンを混同しない

Turso CloudにはTursoエンジンとlibSQLの選択があり、同じSDKや機能だと扱えない。
公式TS資料は新エンジンのremote接続に `@tursodatabase/serverless`、libSQLに `@libsql/client` を案内する。
まず既存資産の移植しやすさを検証し、WorkersならlibSQLの `/web` 経路を比較対象にする。
エンジン・SDK・トランザクション・バックアップ形式・復旧範囲を記録し、選定後に版を固定する。
端末内SQLite・Turso Sync・Workersからのremote DB接続は別物。今回、端末へ研究DBを同期しない。
根拠：[Turso TS](https://docs.turso.tech/sdk/ts/reference)、[Workers連携](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/)。

## SQLの移植で必要な対応

| 現在の契約 | SQLite系への移植案・試験 |
| --- | --- |
| RLS・列GRANT・`auth.uid()` | APIで本人/役割/操作と許可列を検査。匿名・他人・権限昇格の拒否試験 |
| PL/pgSQL・SECURITY DEFINER RPC | 用途別サーバー処理へ移し、管理操作は専用認可。内部関数を公開しない |
| UUID・timestamptz・DECIMAL・NULL | UUID文字列維持、UTC表現統一、精度と丸め・NULL・日時境界の照合 |
| JSONB・配列・enum・生成列 | JSON/子表/CHECK等を選び、検索・公開座標・制約を同等性試験 |
| `FOR UPDATE`・advisory lock | 一意制約・条件付き更新・version・transactionで同時審査/上限/再送を試験 |
| `auth.users` FK・退会CASCADE | UIDを維持し、DB外のAuth削除と清掃を再実行可能な状態機械にする |
| `pg_net`・Vault・`pg_cron` | Outbox・Queues・Cron・Worker Secretsへ責務を分離 |

PostGISはschemaとmigrationで未検出。水域計算はTS/Rust/Wasmを維持し、DB移行の理由にしない。
RLSを失う負担は大きい。SQLファイルの変換だけで移行完了とはせず、認可試験を公開ゲートにする。

## 採用を決める試験

1. 同じ合成データで、公開一覧・本人の非公開位置・水域審査・退会を小さく実装する。
2. 審査・原票・投影・監査の全成功/全取消、並行審査、回数制限の同時送信を試す。
3. UUID・時刻・精度・配列/JSON・集計値を照合し、権限の許可/拒否を既存SQL試験と対応づける。
4. 秋田からの閲覧・投稿と想定ピークでp50/p95、失敗率、DB往復数、CPU、読書き量を測る。
5. 書込み直後の読取り一貫性を試し、レプリカを使う場合はSDK/D1 Session等の方式を決める。
6. 暗号化exportから別環境へ復元し、削除・権限・メディア参照まで確認する。

性能の暫定合格案は、同条件の現行p95比1.2倍以内・追加エラーなし。採用前に負荷条件と閾値を確定する。
D1のDB容量・列数・bind数・クエリ時間は[公式制限](https://developers.cloudflare.com/d1/platform/limits/)と実スキーマを照合する。
libSQLの対話transactionには時間制約があるため外部通信を中へ入れず、新エンジンへ同じ制約を一般化しない。
原子性の根拠：[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Turso TS](https://docs.turso.tech/sdk/ts/reference)。

## AuthとStorageは別に判断する

業務DBを替えてもAuthとStorageが自動的に消えるわけではない。StorageはR2へ別段階で移す。
Authを残す間はSupabase契約が残る。完全廃止の候補は[Better Auth案](auth-design.md)、メールは[配信設計](email-design.md)へ。
認証DBのadapter/原子性/hash処理も業務DBの採用条件に加え、新Tursoエンジンの対応をlibSQLと同一視しない。
Cloudflare Accessをそのまま一般利用者の登録・パスワード回復の代替とはしない。

## 6.7〜6.9で確認した範囲と採用の条件

2026-11-15にTurso 0.8.3/nativeとlocal D1を同じ合成データで比較した。
[6.8の認可/原子性](../../../scripts/migration/authorization-atomicity.md)と
[6.9の再送/削除/復元](../../../scripts/migration/recovery-and-restore.md)の実エンジン試験が根拠である。

| 比較軸 | Turso/native local | D1 local | 未検証・採用前の条件 |
| --- | --- | --- | --- |
| 認可・原子性 | native IMMEDIATE transactionで合格 | native batchで合格 | Workersの実Auth/API、RLS/RPC全契約 |
| 再送・上限 | 本人/client ID、60分20件/総数1000件を保存と結合 | 同じ契約で合格 | remote/replica read-after-write、負荷と上限 |
| 退会部分失敗 | DB全取消、合成media/Authの再試行が合格 | 同じ契約で合格 | 実session/署名URL失効、公開UID入りメディア、保持期限 |
| 復元 | 合成AES-GCM論理exportから復元が一致 | 同じ形式で復元が一致 | 実Auth/鍵/R2メディア、PITR、RPO/RTO |

合成日時はUTCのミリ秒形式 `.sssZ` に限定し、PostgreSQLのマイクロ秒・offset付き表現を拒否する。
`timestamptz` の精度を保つ正規化と照合は未検証で、実データ移行前の採用条件に残す。

新Turso 0.8.3はUPSERT更新条件内のEXISTSをparseできなかった。認可をINSERT候補側へ置くSQLは両者で通った。
これは今回観測した構文差で、SQLite系全体の互換性やbinary DB形式の交換を証明しない。
live34表/114関数/80policyと25件のAuth FK、同UID登録とプロフィール作成、Storage、14 Edge処理/cronは未移植。
provider adapter/原子性/native hash・Google/メール・実端末の再認証と所有者別キュー保持も採用の条件に残る。
Workers用serverless SDKとlibSQLの対応、実負荷の遅延/失敗率、費用/plan・容量・予算・切り戻し/書込正本を比較してから決める。
このlocal結果だけでTurso/D1の勝者やSupabase廃止を決めず、[認証切替](auth-cutover.md)の条件を維持する。
