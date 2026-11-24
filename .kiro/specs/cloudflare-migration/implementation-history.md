# 6.1〜6.12の実装メモ

- OpenNext 1.20.17はNode Proxy対応とSentryのworkerd解決修正を含む。Nextはadapter対応の16.4.6へpatch更新する。
- Cloudflare/Turso CLIは認証済み。Supabase connectorはproject一覧が空のため、認証済みCLIで読取metadataを照合する。
- Supabase RLS、32種のRPC、Auth UID、5つ目の告知状態bucketをDB単体の置換で失わない。

- 6.1証拠：read-only CLI aggregate照合、台帳照合/JSON/links/diff検査0、独立review APPROVED。実レコードの取得なし。
- Turso公式は現行engineのlocal SDK `@tursodatabase/database` と旧libSQL用 `@libsql/client` を区別する。候補試作はengine/版を明記し、別engineの成功を流用しない。
- adapterの画像redirectは許可originを再検査せず、未使用cdn-cgi経路は別処理になる。Cloudflare構成でredirect無効・未使用経路拒否を実リクエストで検証する。
- 6.2レビューでNext用fileリンクの不整合とnode-minify経由のbraces再導入を検出。既存の除去検査を維持し、consumer別にAPI互換性とclean installを検証して修正する。
- 6.2証拠：clean npm ci、186ファイル/2,000 tests、型/lint/audit0、CF build/dry-run/型生成/容量予算、修正後の独立review APPROVED。raw23,797,895B/gzip5,247,953B。runtimeは6.3以降。
- 6.3証拠：実workerd 7/7（認証/backend、全Workerのegress拒否、R2/reset/close、秘密ファイル読取0）、clean install・2000unit・型/lint、修正後独立review APPROVED。
- 6.4証拠：safe fixture build/dry-run/型生成、実workerd13/13、2022unit、型/lint/秘密検査、独立review APPROVED。Cookie差分更新とNext Varyを維持。
- SSRは変更のないCookie chunkを再送しない。browser jarへ差分/削除を反映して検証する。passthroughのCookie VaryはNext側を上書きするためprivate no-storeのみを追加。
- 6.5証拠：実workerd/browser18/18、2040unit、root/CF型・型生成・lint・build/dry-run・容量・OSS audit0、独立review APPROVED。合成DSN/GTMでも送信0、実SDKのevent/自動spanをscrub。
- SDK11.11の既定streamはbeforeSendTransactionを無視するため4初期化ともstaticを指定。_headersの同一path重複は後勝ちになるためglobal noindexを同じblockへ統合する。

- 6.6証拠：実workerd/browser26/26・skip0、画像の取得前拒否/変換、日本語OG、native R2/DO ISR・再起動、実Wasm、取得済みshellの安定配信、独立review APPROVED。
- 未訪問Drawerの圏外chunk欠落で既存復旧がSW/cacheを消す制限を因果対照で特定。取得済み実メニューの読込後1500ms安定と区別し、本番切替前の残件へ保持する。

- 6.7証拠：隔離clean npm ci、実Turso0.8.3/nativeとlocal D1の12/12・skip0、独立再実行/review APPROVED。bind/制約/正規化snapshot・永続化/reset/所有dir清掃を確認、audit/lint/秘密検査0。

- 6.8証拠：実DB36/36・独立再実行と認可直後の失効probe10/10、review APPROVED。本人token除外、全取消/版競合、並行quota予約を確認。固定時間枠の予約と保存/直近60分の同等性は6.9へ区別する。

- 6.9証拠：実DB62/62・独立再実行/review APPROVED。rolling60分と保存/再送の原子性、退会の部分失敗/再開、非空運用状態のAES-GCM復元と権限を照合。msZ限定・実Auth/media/µs精度等の採用条件を明記した。

- 6.10証拠：CI構造/権限/必須8名維持、DB62・coverage2047・fresh CF26、独立review APPROVED。[PR190](https://github.com/haranishi/zaridasu/pull/190)はdevelop向けに作成済み。初回code head a543adcのUbuntu必須8名とperfが成功した。

- 6.11証拠：source 9e40517、8代替/全文license一致、元画像混入0、source/assets秘密検出0。clean install・実build/dry-run/型・CF26、独立review APPROVED。private server走査34件は25code+9内部生成鍵と分類し、鍵の公開側byte出現0を確認した。

- 6.12事前確認：対象アカウントのWorker既存8件・候補名衝突0、R2未有効。subscription APIは権限不足でplan未確定。本人へR2有効化を依頼中で、新規remote資源・課金契約の変更は0件。

- 6.12 local準備：新private buildとoverlay15件・licensed source全件を照合し、実build/2 Worker dry-run/型・lint、専用verify16/16が成功。remote配備はR2未有効で未完了。
