# 実装根拠と公式仕様の確認記録

確認日：2026-10-30。ソースは `develop` の `f820066`。本番適用・課金・利用量は未確認。
外部資料はこの日の設計根拠であり、実装開始時に再確認する。

## リポジトリで確認した依存

| 領域 | 根拠と移行への影響 |
| --- | --- |
| Web | [package.json](../../../package.json)・lockはNext.js 16.4.2系、React 19、Sentry 11。独自webpack manifest生成が[next.config.ts](../../../next.config.ts)にある |
| Data API | [posts.ts](../../../src/lib/data/posts.ts)のほかhooks/views/contextにも `.from()`・`.rpc()` が分散。data層のみの差替えでは終わらない |
| 認証 | [認証ガイド](../../../docs/architecture/authentication.md)、[AuthContext](../../../src/context/AuthContext.tsx)。Supabase Auth・Cookie SSR・Google OAuth・退会・端末清掃 |
| DB | [schema](../../../supabase/schema.sql)と[migrations](../../../supabase/migrations/README.md)。PL/pgSQL・RLS・GRANT・JSONB・配列・行/並行ロック |
| 審査 | [水域migration](../../../supabase/migrations/20261008100350_water_discovery_reports.sql)。非公開原票・公開投影・監査の原子的更新 |
| 退会 | [退会migration](../../../supabase/migrations/20261021120400_account_deletion_fixes.sql)。所有者のNULL化・私有行の削除・監査維持 |
| メディア | [データモデル](../../../docs/architecture/data-model.md)。公開写真/音声と非公開2種。行削除だけではファイルは消えない |
| 非同期 | [Edge Functions](../../../docs/architecture/edge-functions.md)の14関数。DBトリガー・pg_net・Vault・cronからAI/通知等へ接続 |
| 復元 | [運用](../../../docs/architecture/operations-ci.md)、[backup-storage](../../../scripts/backup-storage.sh)。既定で4バケットを暗号化バックアップ |

schema・全migrationの調査でPostGIS、地理型、GiST、`ST_*`の主要地理関数は未検出。
srcでRealtimeの購読処理も未検出。設定が有効であることを、アプリが購読中である根拠にしない。
水域の地理計算は[専用設計](../../../docs/architecture/water-geometry.md)にあり、TS/Rust/Wasmを引き継ぐ。
既存の非公開情報の防御は[security-hardening](../security-hardening/requirements.md)から引き継ぐ。

## Web移行で先に確かめる点

Cloudflareの[OpenNext案内](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)は、
新規Next.jsアプリにvinextを推奨し、OpenNextは互換性を見ながら扱う方針になっている。
ザリダスは既存Next.jsアプリなので、即座にビルド基盤を替えず両案の互換性を試す。
OpenNext公式の[対応表](https://opennext.js.org/cloudflare)ではNode Middlewareが未対応。現行Node Proxyが障害になり得る。
`/api/og` のEdge runtimeもOpenNextでは非対応で、参照確認後にNode移植または撤去を判断する。
現行 `src/proxy.ts` を単に改名するだけで済むとはしない。セッション更新・管理画面保護を回帰試験する。
vinextのbeta状態とProxy対応は[公式Next.js案内](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)を参照する。
webpack非対応は[vinextの制限](https://github.com/cloudflare/vinext#known-limitations)に照らして評価する。

| 項目 | スパイクで確認すること |
| --- | --- |
| IP制限 | [proxy.ts](../../../src/proxy.ts)はVercelヘッダー優先。Workersの信頼ヘッダーを選び、持込みヘッダーの偽装を試す |
| ISR | [キャッシュ案内](https://opennext.js.org/cloudflare/caching)に沿い、R2/DO等の要否・再検証・障害時・private cache禁止を確認 |
| 画像 | [画像案内](https://opennext.js.org/cloudflare/howtos/image)。Images bindingを先に試す。minimumCacheTTL非対応、custom loaderのorigin制限を別途検証 |
| Sentry | Node/Edge設定・source map・DSN・環境名・スクラブをworkerdで確認。動かない時のSDK差替えは別判断 |
| WASM/PWA | 同梱Wasm・Web Worker・SWのscope/update・CSP・MIME・キャッシュヘッダーを実配信相当で検査 |
| ビルド | prebuildのWasm検証/SW生成、webpack plugin、ルート容量予算を再現。通常next buildだけでは合格にしない |
| URL | Vercel由来の環境名/URLを列挙し、正規URL・OGP・sitemap・OAuth戻り先・CSPを保持 |

静的資産の[ヘッダー設定](https://developers.cloudflare.com/workers/static-assets/headers/)はWorker生成SSR/APIへ適用されない。
キャッシュのbinding・revalidation queue・tag cacheは、採用adapterと利用機能に応じて選び、業務DBと混同しない。

## データ基盤に関する一次資料

| 資料 | 設計で使う事実 |
| --- | --- |
| [D1概要](https://developers.cloudflare.com/d1/) | SQLite系SQL。PostgreSQL互換の置換とは扱わない |
| [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) | 連続するSQLをtransactionとして扱い、失敗時に全体rollback |
| [D1制限](https://developers.cloudflare.com/d1/platform/limits/) | プラン別容量等を実スキーマ/負荷と照合する必要 |
| [Turso TS](https://docs.turso.tech/sdk/ts/reference) | TursoとlibSQLでremote SDK/transactionの選択が異なる |
| [WorkersとTurso](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/) | libSQLをWorkerから使う場合は `/web` importとサーバー専用認証情報 |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Data API直アクセスを保護するDBの仕組み。DB撤去時は認可の再設計が必要 |
| [R2非公開アクセス](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) | 署名URLも所持者に権限を与える。期限・公開範囲・ログへの流出を管理 |

Supabase changelogのMarkdown入口は取得できなかった。実装開始時に関連変更を再確認する。
資料の対応表は本アプリの動作保証ではない。互換性試験と復元試験は今回実施していない。

## 認証・メール・残存障害の追加調査

追加依頼の基点は `ab4fd3f`。認証と残存依存を別セッションで読み取り監査した。
認証の根拠/方式は[auth-design](auth-design.md)、メールは[email-design](email-design.md)、
コード根拠・対策・未確認区分は[障害台帳](migration-blockers.md)へ記録した。
Better Auth公式のSupabase移行例はPostgres/Node用で、既存sessionの失効を前提とし、RLS/MFA移植を網羅しない。
管理サービスの対案も[Clerkの移行案内](https://clerk.com/docs/guides/development/migrating/overview)と実施時に照合する。
Cloudflare Email SendingにはWorkers binding/REST/SMTPがあり、任意宛先送信にはPaidと送信ドメイン設定が要る。
Email Routingと同一視せず、beta/用途/送信枠/イベントと抑止を[メール比較](email-design.md)で評価する。
SDK/adapterの版固定、実hash/Google/MFA/SMTPの照合、実端末/到達/負荷試験は未実施。
