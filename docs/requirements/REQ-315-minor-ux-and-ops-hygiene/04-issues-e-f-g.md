### 問題E: 未クリアの `setTimeout` — Low（AuthCallbackPage は実害あり）

**E-1（実害あり）**: `src/views/AuthCallbackPage.tsx:81`

```
setMode('confirmed')
setTimeout(() => router.replace('/dashboard'), 3000)
```

このタイマーは `onAuthStateChange` のコールバック内（`:71-110`）で作られており、`useEffect` の cleanup（`:110` の `return () => subscription.unsubscribe()`）では**クリアされない**。メール確認完了画面が出てから3秒以内にユーザーが別のリンクへ移動すると、**タイマーが後から発火して意図しない `/dashboard` への遷移が上書きで起きる**（`router.replace` なので戻ることもできない）。

**E-2**: `src/app/providers.tsx:101-102`

```
setPendingNotice(`未送信の下書きが${count}件あります。マイページから送信できます。`)
setTimeout(() => setPendingNotice(''), 8000)
```

`:95` の `let cancelled = false` と `:106` の `return () => { cancelled = true }` は**async 処理だけを守り、タイマーは残る**。アンマウント後に `setPendingNotice('')` が走る。

> この行の文言が日本語ハードコードである問題（UX監査 M-8）は **REQ-304**（支援技術向け文言のi18n化）の対象。本REQはタイマーの解放だけを扱う。

**E-3**: `src/components/features/posts/LikeShareSection.tsx:109`

```
setCopied(true)
setTimeout(() => setCopied(false), 2000)
```

同様に cleanup されない。実害は「コピー済み」表示のリセットが遅延発火するだけで軽微。

良い前例は `src/components/features/dashboard/FilterBar.tsx:58-59`。

```
// アンマウント時にデバウンスタイマーを掃除する。
useEffect(() => () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }, [])
```

### 問題F: `/dashboard` に `<h1>` が無い — Low

`src/views/DashboardPage.tsx` の最初の見出しは `:208` の `<h2>`（表示名）で、`<h1>` が存在しない（`grep "<h1"` で0件）。`/dashboard` は noindex なので**SEO への影響は無い**。影響はスクリーンリーダー利用者で、見出しジャンプ（VoiceOver のローターや NVDA の H キー）で移動すると**ページの主題が伝わらず、いきなり表示名の h2 に着地する**。

REQ-275 FR-275-03 は indexable ページの h1 を網羅したが、noindex ページは対象外だった。`src/app/(home)/page.tsx:14-22` が採っている手法（デザインを変えずに sr-only の h1 ＋ 説明文を SSR 出力する）がそのまま使える。

```
{/* REQ-275 FR-275-03: … 地図UIのデザインを変えないよう sr-only で SSR テキストを出す
    （スクリーンリーダーの見出しナビにも有効）。 */}
<h1 className="sr-only">ザリダス - 秋田県外来生物情報マップ</h1>
```

### 問題G: Vercel の実行リージョンがリポジトリ上どこにも固定されていない — Low（運用衛生としては影響が広い）

`vercel.json` の全文は**6行**で、リージョン指定が無い。

```
{
  "framework": "nextjs",
  "git": {
    "deploymentEnabled": false
  }
}
```

`preferredRegion` の export もリポジトリ全体で**0件**（`grep -rn "preferredRegion" src/`）。

対象となるサーバー実行は次のとおり。

- ISR: `/area/[municipality]` / `/area/[municipality]/[species]` / `/species/[species]` / `/trends`（`revalidate = 3600`）/ `/ranking`（`revalidate = 3600`）/ `/dataset`（`revalidate = 86400`）/ `/area`（`revalidate = 3600`）
- 動的: `/api/nearby-water`（`force-dynamic`）・`/u/unsubscribe`

これらが既定の `iad1`（米国東部）で実行される可能性がある。秋田県ローカル向けのアプリで、Supabase も ap-northeast 想定であるため、**全SSRが太平洋を往復し、さらにそこから Supabase へ往復する**構成になり得る。

ただし**本項の本質的な問題は遅延ではなく、設定が Vercel ダッシュボードにしか存在しうる状態そのもの**である。リポジトリに書かれていないため、

- 現在どのリージョンで動いているのかコードレビューで判別できない
- 別環境（preview / 別アカウント / 移設先）で同じ構成を再現できない
- 誰かがダッシュボードで変更しても差分として残らない

という状態になっている。`api/og` は `runtime = 'edge'` なのでリージョン指定の影響を受けない。

---
