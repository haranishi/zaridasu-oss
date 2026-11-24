# 2026-11-14の実行契約

## 依頼と対象

本人がSupabase依存の代替検討、Turso候補、VercelからCloudflareへの移行実行を依頼した。
旧計画の文書限定の許可を今回の依頼で更新し、まず依存照合・Web移植・非本番検証を進める。
Googleキー、旧本番の認証/上限/health更新、公開repo設定は本人担当。新実装の安全検証は実装側で行う。
業務DB/Authの採用と全廃、本番DNS/書込先の切替、既存資産の削除は、この段階の合格とは別に判断する。
既存Secretsを抽出してartifactへ保存する拒否済みの移設方式は実行しない。

## 今回の受け入れ条件

- 9.1 ソースのSupabase依存と実環境の読取metadataを照合し、未確認を区別する。実データや秘密値を保存しない。
- 9.2 既存NextをOpenNext 1.20.17・Wrangler 4.162.0でbuildし、workerdでページ・API・保護経路を実行する。
- 9.3 Cloudflareの信頼IP、認証失敗時の拒否、Cookie、preview監視停止、収集抑止、private no-storeを維持する。
- 9.4 画像のorigin制限、ISR、OG PNG、CSP、Wasm/SWの配信を検証し、Worker容量と起動条件を測る。
- 9.5 Turso/D1候補は合成データの認可・原子性・再送・復元試験で比較する。実データをコピーせず、採用確定と混同しない。
- 9.6 検証用アカウントと保存先を確定し、既存Vercel経路を維持して移行候補をPR化する。previewはnoindex・本番鍵なし。

## Boundary Commitments

Webの実行先を替えるためのtoolchain・runtime差分・安全な配備候補と、DB候補の限定試作を担当する。
既存のSupabase Auth/UID・Storage・Data API・RLS・Edge/cronとVercel本番を、このWeb段階では正本として維持する。
ブラウザにDB管理tokenやSQL実行口を置かず、privateデータを全件取得してから隠す方式にしない。

## Out of Boundary

実ユーザーのDB/Auth/ファイル移送、Supabase解約、旧asset削除、課金プラン変更、既存repoの公開切替。
2026-11-15に本人が使うCloudflareアカウントを選択。対象を固定し、権限/plan/binding照合後に隔離previewへ進む。
選択したアカウントではR2未有効（API 10042）。2026-11-16に超過課金禁止が確定し、有効化依頼を取り下げた。[9.7](zero-overage-execution-20261116.md)を優先し、旧R2 profileのremote配備は行わない。

## Allowed Dependencies

最初はOpenNextを採用し、既存のwebpack/Sentry/容量検査を再利用する。
Nextと関連lint/analyzerはadapterが要求する16.4.6へpatch更新。vinext 1.4.5は互換性比較の対案。
既存のglob防御とbraces除去を維持し、追加consumerは用途別adapterと実利用テストで確認する。
cacheはR2 incremental cacheとDO queue、画像はIMAGES binding。業務メディアのR2移送とは別物。
Cloudflare画像取得はredirectを無効にし、未使用の `/cdn-cgi/image/` 経路を閉じて、許可origin以外を取得しない。
Sentryは既存11.11.0のcloudflare wrapperを使い、同じdataCollection・scrub hooksを渡す。
Cloudflare buildは明示したpreview環境を既定にし、継承DSN/GTM値があってもpreviewで起動しない。本番Vercelの監視とsource-map経路は維持する。
IPの配備元は信頼する設定で選ぶ。CloudflareではVercel/XFFを参照せず、信頼IPが欠落/不正/loopbackでも制限をskipしない。既存Vercel/localのIP扱いは維持する。
認証Cookieの更新はredirect応答にも引き継ぎ、保護経路の成功/拒否ともprivate no-storeにする。
Turso試作はlocal SDK/CLI、D1はlocal bindingを使う。現行Turso engineと旧libSQLを区別し、SDK版と検証範囲を記録する。新しい本番サービスへ直結しない。

## File Structure Planと実装順

| 段階 | ファイル/責任 | 条件 |
| --- | --- | --- |
| 6.1 | 仕様・依存台帳・privateな読取照合記録 | 9.1 |
| 6.2 | toolchain、Next/OG、OpenNext/Wrangler/型・build script | 9.2、9.4 |
| 6.3–6.6 | 合成runtime harness→認証/IP→監視/headers→workerd統合試験 | 9.2–9.4 |
| 6.7–6.9 | scripts/migration/内のSDK/CLI・fixture・認可/再送/復元試験 | 9.5 |
| 6.10–6.11 | CI・証拠・PR、代替画像exportの非本番build | 9.6 |
| 6.12 | 選択済みアカウントのplan/binding照合と隔離preview | 9.6 |

## 実行・検証

- [実装タスク](implementation-tasks.md)の依存順を守る。WebとDB候補の結果を揃えて現段階の完了を判定する。
- 既存precheck全10項目、next build、8つの必須CI、実ブラウザの既存重要経路を維持する。
- CF buildとwrangler dry-run後、workerdで401/redirect/管理者拒否・Cookie更新・偽装IP・PNG・画像・Wasm/SWを実測する。
- 通常SDKテストとNode上のmockだけでworkerd合格とは扱わない。previewのSentry/外部AI/メールは実送信しない。
- remote previewは選択済みアカウントに隔離し、未確認8画像を除いたexportを使う。実投稿・非公開地点・本番鍵を含めない。
- 追加の有料契約やプラン変更が必要なら、必要性・金額・候補を具体化して本人の判断へ返す。
- 本番切替前は既存の公開前検証・復旧手順・利用量/予算/停止枠を確定する。合格前にDNSや旧配備を変えない。

## Revalidation Triggers

adapter/Next/SDKの更新、信頼ヘッダー、Cookie、画像origin、cache/公開投影、配備先や書込先を変えた時は関連ゲートを再実行する。
改善は最大3周、同一失敗2周で原因と残件を整理する。未確認やskipを合格に数えない。
