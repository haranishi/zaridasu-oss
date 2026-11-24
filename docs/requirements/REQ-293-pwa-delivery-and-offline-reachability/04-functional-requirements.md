## 機能要件

- **FR-293-01（P0・1行修正）**: `src/app/layout.tsx:51` の `manifest: '/manifest.json'` を `'/manifest.webmanifest'` に修正する。`public/manifest.json` の新規作成や `rewrites` の追加ではなく、**App Router の生成パスに合わせる**方針を採る（manifest の正本は `src/app/manifest.ts` の1箇所に保つ）。

- **FR-293-02（P0）**: `public/sw.js.tpl` のナビゲーション catch を**無条件でオフラインフォールバックを返す**形に変更し、`isNetworkError()` による絞り込みを撤去する。catch に到達する＝ネットワーク層で失敗したケースであり、「4xx/5xxではオフライン画面を出さない」という FR-020 の意図は `.then` 側（`:54-57`）で既に担保されている。`isNetworkError()` が他から参照されていないなら関数自体を削除する（WebKit の `Load failed` を文字列で追加する対症療法は、次の新しい文言で再発するため採らない）。

- **FR-293-03（P0）**: ナビゲーションリクエストを **stale-while-revalidate** 化し、少なくとも `/`（ホーム＝投稿導線）と `/dashboard`（未送信下書きの送信画面）の HTML をキャッシュする。オフラインでコールドスタートしても投稿フォームと下書き一覧に到達できることを要件とする。実現方式は次のいずれかを選ぶ（→ 未確定事項1）。
  - (a) ナビゲーション成功レスポンスを precache とは別のキャッシュへ `cache.put` し、オフライン時はキャッシュ→無ければ `/offline.html`
  - (b) app shell（`/` の HTML と必須チャンク）を install 時に precache
  - いずれの方式でも、認証状態に依存する画面（`/dashboard` 等）のキャッシュが**他ユーザーへ漏れない**こと（Cache Storage はオリジン単位でユーザー間共有されないが、共用端末での表示残りは考慮する）を確認する。

- **FR-293-04（P1）**: SWのキャッシュを**2本に分離**する。
  - (a) **precache（バージョン付き）**: `CACHE_NAME = zaridasu-precache-v<sha8>`。activate で旧バージョンをパージする。対象は `/offline.html`・アイコン・app shell 等、デプロイ内容に追随すべきもの
  - (b) **不変アセット用ランタイムキャッシュ（バージョン非依存）**: `zaridasu-assets`。`/_next/static/`（コンテンツハッシュ名）と `/images/`（immutable 指定）を格納し、**activate でパージしない**。無限成長を防ぐためエントリ数の上限（例: 200件）を設け、超過分を挿入順で削除する簡易LRUを実装する
  - activate の削除条件は「`zaridasu-precache-v*` で現行バージョン以外」に限定し、(b) と将来追加するキャッシュを誤って消さない（現行 `:25` の `k !== CACHE_NAME` は全消しなので必ず書き換える）

- **FR-293-05（P1）**: デプロイ時の強制リロードで入力中の内容を失わせない。`src/app/providers.tsx:75-80` の `controllerchange` 即時 `window.location.reload()` を見直し、次のいずれかにする。
  - (a) 投稿フォーム等の dirty 状態を検知できる場合はリロードを保留し、「新しいバージョンがあります／今すぐ更新」の明示的な操作に委ねる
  - (b) 少なくとも dirty 時は自動リロードを抑止する
  - REQ-267 の「初回インストールではリロードしない（`hadController` 判定）」は**維持する**。

- **FR-293-06（P1）**: オフライン画面を多言語化する。方式は次のいずれかを選ぶ（→ 未確定事項2）。
  - (a) `public/offline.html` に ja/en/ko/zh の文言を埋め込み、`navigator.language` で切り替える。`<html lang>` も JS で対応言語に書き換える。この場合の文言はロケールJSONの外にあるため、`offline.*` キーとの**二重管理になる旨をファイル冒頭にコメントで明示**し、`check-i18n-parity` の対象外である事実を記録する
  - (b) SWのフォールバック先を `/offline`（`src/views/OfflinePage.tsx`）のプリキャッシュHTMLに変更し、既存の `offline.*` 4言語キーをそのまま使う。この場合 `/offline` のレンダリングに必要なチャンクも precache する必要があるため、FR-293-03/04 と同時に設計する
  - どちらを選んでも、`public/offline.html` を残す場合は `<html lang="ja">` 固定をやめる。

- **FR-293-07（P0）**: `'sending'` スタックからの復帰手段を設ける。
  - `PendingPost` に送信開始時刻（例 `sendingStartedAt`）を追加し、`useOfflineQueue.ts:60` の `'sending'` 書き込み時に併せて記録する
  - `refresh()`（`:36-47`）および初期ロード時に、`status === 'sending'` かつ送信開始から一定時間（既定 5分・定数化）経過したレコードを `'pending'` へ戻す（stale復帰）。この復帰は `sendAll` の実行中には行わない（`sendingRef` を参照して現世代の送信を巻き戻さないこと）
  - `PendingPostsSection` の「送信中」表示に、stale と判定された場合の**「送信を再開」ボタン**を追加する。ラベルは i18n キー（ja/en/ko/zh 4言語）で追加する
  - 既存データ（`sendingStartedAt` を持たない `'sending'` レコード）も救出できるよう、未設定時は `createdAt` を代替に用いるか、初回マイグレーションで一律 `'pending'` に戻す方針を選ぶ（→ 未確定事項3）

- **FR-293-08（P1・再発防止）**: 配信物としての回帰ガードを追加する。
  - E2E（`tests/e2e/`）に PWA 配信の検証を追加: `GET /manifest.webmanifest` が **200** を返し、レスポンスの JSON に `name` と `icons`（192/512、`purpose: 'maskable'` を含む）が存在すること。加えて配信HTMLの `<link rel="manifest">` の `href` が実際に 200 を返すこと（リンク先とルートの突合）
  - E2E に「オフライン下書きに到達できる」検証を追加（`context.setOffline(true)` でコールドスタートし、投稿フォームに到達できること）
  - `.lighthouserc.json` に manifest 系 assertion（`installable-manifest` 等）を追加する。共有 runner でのノイズが問題になる指標は `warn` でよいが、**`installable-manifest` は決定論的なため `error` を検討する**（→ 未確定事項4）
