### 問題B: iOS Safari のオフライン時にオフライン画面が出ない（判定文字列の不一致） — High

`public/sw.js.tpl:32-39` の `isNetworkError()` は、`TypeError` の `error.message` が `'fetch'` / `'network'` / `'Failed to fetch'` を含むかで判定している。

```js
function isNetworkError(error) {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') ||
     error.message.includes('network') ||
     error.message.includes('Failed to fetch'))
  )
}
```

WebKit（iOS Safari）がオフライン時に `fetch()` から投げる `TypeError` のメッセージは **`Load failed`** であり、上記3パターンのいずれにも一致しない。そのため `:58-64` のナビゲーション catch は `:63` の

```js
return new Response('Service Unavailable', { status: 503 })
```

に落ち、`install` で precache 済み（`:6-11` の `STATIC_ASSETS`）の `/offline.html` が**返らない**。ユーザーにはブラウザ既定のエラー画面が出る。

iPhone が主要ターゲット端末であるにもかかわらず、**主要プラットフォームだけオフラインUIが不発**という非対称が生じている。Chromium 系（`Failed to fetch`）では動くため、開発時の確認をすり抜ける。

なお「HTTPエラー（4xx/5xx）ではオフライン画面を出さない」という FR-020 の要件は `.then` 側（`:54-57`）でレスポンスをそのまま返すことで既に担保されている。したがって **catch 側で `isNetworkError()` による絞り込みを行う理由が無い**（catch に到達する＝ネットワーク層で失敗している）。

### 問題C: ナビゲーションを一切キャッシュしないため、オフライン下書き保存に到達できない — High

`public/sw.js.tpl:6-11` の `STATIC_ASSETS` は `/offline.html` とアイコン・OG画像のみで、**HTMLを1枚もキャッシュしない**。`:51-64` のナビゲーション処理は network-first だが、成功レスポンスを `cache.put` しない（`:54-57` はレスポンスを素通し）。

結果、**一度訪問したページでもオフラインでは開けない**。圏外の水辺でPWAアイコン（またはブラウザ）からアプリを開くと、たどり着けるのは `/offline.html` だけである。

ここで失われるのは表示だけではない。アプリ内には**オフライン下書き保存機能が実装済み**である。

- `src/hooks/posts/usePostForm.ts:413` `saveOffline()` — 写真・音声を含むフォーム内容を IndexedDB（`src/lib/offlineStore.ts`）へ保存
- 保存後の案内 `postForm.draftSaved`（ja: 「下書きに保存しました。オンライン時にマイページから送信できます。」／en/ko/zh も存在）
- 復帰後の送信UI `src/components/features/dashboard/PendingPostsSection.tsx` + `src/hooks/useOfflineQueue.ts`

つまり「**アプリを開いたまま圏外に入った**」場合だけこの機能は使えるが、「**圏外でアプリを開いた**」場合は到達不能である。市民科学の現地調査という主要ユースケース（電波の弱い水辺で観察 → その場で記録 → 帰ってから送信）が、オフラインでは丸ごと機能しない。
