# 実DBで権限境界と審査の原子性を検査する

移行検証の担当者向け。[6.8](../../.kiro/specs/cloudflare-migration/implementation-tasks.md)のローカル試作を扱う。
起動と隔離条件は[README](README.md)を参照し、初回はこの文書の認証と公開列の節まで読む。
実アプリ・本番Auth・DB接続先は変更していない。

## 合成の認証情報をサーバー側で検証する

`test-identity.mjs`の発行器を、試験準備だけが保持する。
発行器は一時的な不透明tokenを生成し、検証器は発行元・期限・失効を確認する。
呼出側のUID・role・`user_metadata`・`admin: true`を認証済み主体として受け取らない。
利用者の役割と状態は毎回DBへ照会し、変更SQLも現在のactive状態や管理者権限を条件にする。
不明・NULL・期限切れ・失効済みの認証、退会中・退会済みアカウントは非公開操作を拒否する。

これは試験専用の認証機構であり、実際のJWT署名検証・Cookie・CSRF・回復・ログアウトの代替ではない。
`reference-api.mjs`はSQLやDBオブジェクトを公開せず、HTTP経路も作らない。
時刻と操作IDの注入はサーバー側の試験準備に限り、操作の入力項目には含めない。

| 操作 | 匿名 | 本人A | 他人B | 管理者 | 内部ジョブ |
| --- | --- | --- | --- | --- | --- |
| 公開投稿・公開プロフィール・審査済み水域 | 可 | 可 | 可 | 可 | 可 |
| Aの非公開プロフィール | 拒否 | 可 | 0行 | 0行 | 拒否 |
| Aの水域原票・非公開写真の参照 | 拒否 | 可 | 0行 | 可 | 拒否 |
| 自分のプロフィール変更 | 拒否 | 可 | B本人の分のみ | 管理者本人の分のみ | 拒否 |
| 水域審査 | 拒否 | 拒否 | 拒否 | 可 | 拒否 |
| 未配信outboxの読取り | 拒否 | 拒否 | 拒否 | 拒否 | 可 |

配信停止tokenは本人のプロフィールにも返さない。合成DB内の保管値だけを維持する。
写真の参照は非公開原票の文字列であり、写真の実体や署名付きURLは生成しない。

## 公開列を問い合わせの時点で限定する

公開投稿は`posts_public`、水域は`community_water_bodies`だけを読む。
プロフィールは`uid`と`display_name`を明示し、`is_public = 1`の行だけを返す。
原票を全件取得してから隠す処理は置かない。
投稿のpreciseは原座標、coarsenedは小数3桁、hiddenは座標・地名・水域名がNULLになる。
審査済み水域にも小数3桁の座標と確認済み公開名だけを保存し、原票名・メモ・写真を含めない。

プロフィール変更は表示名と公開設定だけを受け付ける。
所有者・役割・審査・研究状態・ハッシュ・受付時刻などの追加項目は拒否する。
この検査はプロフィール操作の許可列と審査入力の検査であり、投稿受付全体の同等性は示さない。
投稿受付・再送・quotaと保存の同時確定は[6.9](recovery-and-restore.md)で別途検査する。

## 審査をDB内で全成功か全取消にする

Tursoは実SDKの`transactionAsync(...).immediate()`、D1は実bindingの`batch()`を使う。
最初の条件付きINSERTが、現在の管理者・原票ID・期待版を確認して`review_claims`へ操作IDを記録する。
以降の投影・原票更新・監査は、その操作IDに一致する行だけを使う。
最後のoutbox INSERTは、同じ操作で原票の版が1増えたことを再確認する。
対象欠落・古い版・更新0行ではNOT NULL制約により全体を取り消し、競合として返す。
別の要求が同じ版まで更新していても、その要求の操作IDを借りて公開できない。

承認には80文字以内の確認済み公開名を求める。再承認では既存の公開IDを維持する。
承認後の却下は公開投影を削除し、原票・審査者・審査日時・監査・outboxを同時に確定する。
写真は非公開のまま、原票の受付日時も維持する。却下後も直前の確認済み公開名を保持する。
公開向けoutbox payloadには状態と公開水域IDだけを入れ、原座標・原票ID・メモ・写真・UIDを入れない。
監査の対象IDにFKを付けず、監査actorのNULL許容を維持する。

最後のoutbox INSERTに実UNIQUE制約エラーを起こし、承認・再承認・却下の全取消を検査する。
原票・公開投影・監査・outbox・操作claimはすべて正規化snapshotの対象に含む。
操作claimの清掃とoutbox対象FKは[6.9](recovery-and-restore.md)の削除・復元試験で確認した。

## 同時要求の実行方法と確認できた範囲

Tursoは同じファイルを開く2本のnative接続へ同時要求を送る。
SDK内の接続単位の待機処理と、DBのIMMEDIATE書込みロックによる直列化を使う。
D1は1つのlocal bindingへ同時batch要求を送り、workerdがDBトランザクションを直列化する。
共有アプリmutexやSQL mockは使わない。MVCCの同時commitやremoteの性能を測った結果ではない。

異なる同時審査は1件だけ成功し、原票・公開投影・監査・イベントが勝った状態にそろう。
上限予約は1つのSQL文でactiveな本人をINSERT候補にし、既存カウンターは上限未満だけ加算する。
各40同時要求で、時間枠の使用数2から成功18件で20、総数997から成功3件で1000になった。
時間枠と総数は別々のカウンター試験であり、投稿保存と結合した処理ではない。
時間枠は試験用の固定1時間枠。現行の直近1時間集計との同等性は6.9で検査する。
Turso 0.8.3ではUPSERTの更新条件内にあるEXISTS式をparseできなかったため、認可条件をINSERT候補側に置く。

実行日は2026-11-15。エンジンと版は[README](README.md)の6.7と同じで、全36検査・skip 0。
Node guardは既知のcredentialパスとNodeの外部通信を対象とし、OS syscall全体の遮断証明ではない。
6.9の合成試験を経ても、remote配備・認証の全経路・実メディア・採用判断は別途検証する。
不一致や採用条件は[DB判断](../../.kiro/specs/cloudflare-migration/database-decision.md)へ戻す。

根拠：[Turso公式TS資料](https://docs.turso.tech/sdk/ts/reference)、[D1 batchの原子性](https://developers.cloudflare.com/d1/worker-api/d1-database/)。
現行契約は[schema](../../supabase/schema.sql)と[water権限試験](../../supabase/tests/rls_water_discovery.sql)、
[token列権限試験](../../supabase/tests/rls_unsubscribe_token_column.sql)を参照する。
