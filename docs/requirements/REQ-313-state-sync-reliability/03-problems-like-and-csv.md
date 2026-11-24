### 問題C: いいね失敗時の再同期でカウントが0に化ける — Medium

`src/hooks/useLike.ts:137-141`。楽観更新の catch 節は、まず押下前の値へロールバックした後、サーバー実値へ再同期する。

```
const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId)
setLikeCount(count || 0)      // ← :138
```

**再同期クエリ自体が失敗すると `count` は `null` になり `|| 0` で 0 になる**。同じ catch 内の `liked` 再取得も `setLiked(!!data)` なので `false` に落ちる。ネットワークが不安定な状況（いいねが失敗する状況そのもの）では再同期も失敗しやすいため、**画面の「42」が「0」に変わる**という最悪の見え方になる。

初回取得の `fetchLikes`（:70-74）も `const { count } = …` で error を確認せず `setLikeCount(count || 0)`（:74）としており、同じ問題を持つ。

呼び出し側（`DetailPage` 等）は戻り値 `false` を見て `toast.error(t('like.error'))` を出すが、**表示された 0 が本当に0件なのか失敗値なのかを利用者は判別できない**。リロードするまで誤った数値が残る。

### 問題D: CSV エクスポートが0件でも無言でヘッダ行だけを落とす／失敗が監視に載らない — Medium

`src/hooks/useCsvExport.ts`。3点ある。

1. **:59 `if (error || !data) return false`** — このフックで `logError` を通らない唯一の失敗パス。他の失敗は :94 付近の catch が `logError(error, 'useCsvExport:exportCSV')` するのに、クエリ失敗だけ運用側から原因を追えない。
2. **:84-93** — `data` が空配列でも `const csv = [headers, ...rows]` を生成してそのままダウンロードする。フィルタ条件に該当0件のとき、**ヘッダ行だけの CSV が落ちてくる**。研究利用者はダウンロードできた＝データがあると受け取るため、「0件だった」ことが伝わらない。
3. **:87-92** — `URL.revokeObjectURL(url)`（:92）を `a.click()`（:91）直後に同期実行し、かつ `<a>` を DOM に append していない。iOS Safari ではこの書き方でダウンロードが不安定になる（実機での再現条件は要確認）。
