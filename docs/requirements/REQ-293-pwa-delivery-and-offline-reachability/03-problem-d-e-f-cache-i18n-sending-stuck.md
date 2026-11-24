### 問題D: キャッシュ名がコミットSHAのため、デプロイ毎に全キャッシュ破棄＋タブ強制リロード — Medium

`scripts/build-sw.mjs:26-49` は `CACHE_VERSION` を Vercel/git のコミットSHA先頭8桁で置換し、`public/sw.js.tpl:4-5` が `CACHE_NAME = zaridasu-v<sha8>` を作る。`:22-29` の activate は**現行キャッシュ以外を全削除**する。

一方、同じ1本のキャッシュに次の2種類が混在して溜まっている。

- `/_next/static/`（`:95-110`）— ファイル名にコンテンツハッシュを含むため**内容が変わればURLが変わる**。バージョンで捨てる必要がない
- `/images/` `/icon-*` 等（`:70-92`）— セキュリティヘッダ側で immutable 指定されている不変アセット

したがって**文言1文字の修正デプロイでも、全ユーザーの画像・チャンクキャッシュが空になる**。次回起動時に全アセットを再取得するため、モバイル回線では体感が悪化し帯域も無駄になる。

さらに `sw.js.tpl:18` の `skipWaiting()` ＋ `:28` の `clients.claim()` と `src/app/providers.tsx:75-80` の `controllerchange` リロードが組み合わさり、**デプロイ毎に開いているタブが強制リロードされる**。

```js
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!hadController || refreshing) return
  refreshing = true
  window.location.reload()
})
```

REQ-267 が対処したのは「初回インストール時の無条件リロード」であり、**更新時のリロードは意図的に残されている**。しかし投稿フォームを記入中（写真選択済み・録音済み・コメント入力中）にデプロイが起きると、リロードで写真・音声が失われる（`usePostDraft` はテキストのみ復元）。

### 問題E: オフライン画面が日本語固定で、4言語対応済みの `/offline` は一度も表示されない — Medium

SWのフォールバックは `public/sw.js.tpl:61` の `caches.match('/offline.html')` に固定されている。

- `public/offline.html:2` は `<html lang="ja">` 固定。文言（`現在オフラインです` / `ネットワーク接続を確認して…` / `再読み込み`）も日本語のみ
- 一方 `src/views/OfflinePage.tsx` + `src/app/offline/page.tsx` は `offline.title` / `offline.body1` / `offline.body2` / `offline.reconnect` / `offline.backToTop` の**4言語キーを持つ実装済み画面**だが、実際のオフライン時に**一度も表示されない**

英語UI利用者にも日本語のみが出る。`lang="ja"` 固定のためスクリーンリーダーも日本語として読み上げる（WCAG 3.1.1 の観点でも不正確）。

`public/` 配下は REQ-277 の Phase 1（グローバル導線）にも Phase 2（画面ローカル）の対象表にも入っておらず、**取りこぼされた領域**である。`check-i18n-parity` はロケールJSONのキー集合diffのみを見るため、`public/*.html` のハードコード日本語は構造的に検出範囲外。

### 問題F: オフライン下書きが `status:'sending'` で永久スタックし、再送不可 — High

`src/hooks/useOfflineQueue.ts:60` は送信開始時に IndexedDB へ `status: 'sending'` を**永続化**する。

```ts
await updatePendingPost(post.id, { status: 'sending' })
```

一方 `:185` の `sendAll` は `'sending'` を**恒久的に除外**する。

```ts
const pending = (await getPendingPosts()).filter(p => p.status !== 'sending')
```

したがって、送信中にタブを閉じる・アプリが落ちる・端末がスリープでプロセスを終了する等で `sendOne` の catch（`:171-187` の `status:'error'` 更新）に到達できなかった場合、その下書きは **`'sending'` のまま永久に残り、再送対象から外れる**。

UI（`PendingPostsSection.tsx:115-119`）は `post.status === 'sending'` で「送信中」スピナーを出し続けるだけで、再送ボタンも復帰手段も無い。**唯一の脱出路は下書きの削除＝観察記録の破棄**である。屋外で撮った写真・録音を含む一次データが失われる。

> 実装上の注意: `src/lib/offlineStore.ts` の `PendingPost` は `createdAt`（:14）と `status`（:48）を持つが、**「送信を開始した時刻」を保持するフィールドが無い**。5分などの経過判定に `createdAt` を流用すると「昨日作った下書きを今送信開始した」ケースが即座に stale 判定されるため、`sendingStartedAt` 相当のフィールド追加が必要である。
