### 問題A: プッシュ通知トグルの失敗が無言／OFF 失敗でも UI は OFF 表示 — Medium

`src/components/modals/EditProfileModal.tsx:76-79`。

```
const handlePushToggle = async (next: boolean) => {
  if (next) await push.subscribe()
  else await push.unsubscribe()
}
```

`subscribe()` の戻り値（`Promise<boolean>`）を**破棄している**。`src/hooks/usePushSubscription.ts` は全ての失敗パスを `return false` で表現する（:154 endpoint/鍵の欠落、:169 `push_subscriptions` upsert のエラー、:183-184 catch）。したがって ON に失敗すると `setSubscribed(true)` に到達せず、**トグルが勝手に元へ戻るだけで理由が一切表示されない**。ユーザーは何度押しても同じ結果になり、原因を知る手段がない。

OFF 側はさらに悪い。`unsubscribe`（:207-219）は

```
let del = supabase.from('push_subscriptions').delete().eq('user_id', user.id)
if (endpoint) del = del.eq('endpoint', endpoint)
await del                       // ← エラーを見ない
await supabase.from('user_profiles').update({ notify_push_*: false })…  // ← エラーを見ない
setSubscribed(false)            // ← 無条件
```

と DB 削除・opt-in 解除の失敗を無視して**必ず `setSubscribed(false)`** する。結果、**UI は OFF なのにサーバー側は購読を保持し、通知が届き続ける**。ユーザーから見れば「オフにしたのに通知が来る」という信頼を損なう挙動で、しかも画面上は正常である。

### 問題B: ランキング「品質」タブだけエラー状態がなく空状態に化ける — Medium

`src/hooks/useProfile.ts:220-246`（`useQuality`）。返り値の型 `UseQualityResult`（:220-223）は `quality` と `loading` のみで **`error` を持たない**。:237 が

```
setQuality(error ? [] : (data as QualityEntry[]) ?? [])
```

とエラーを**空配列へ握りつぶす**。さらに :233 の `if (!navigator.onLine) { setLoading(false); return }` はオフライン時に無言で空表示へ落とす。

表示側 `src/views/RankingPage.tsx:268-276` は `qualityLoading ? … : quality.length === 0 ? EmptyState : …` の2分岐しかない。取得失敗もオフラインも「まだ誰も品質スコアがありません」に見える。

一方で同じ画面の兄弟タブは `diversityError`（:188-191）と `rankingError`（:357-360）で `LoadErrorState` ＋再試行を出しており、`useQuality` だけが REQ-192 の対象から漏れている。
