### 問題G: デッドコードと「定数があるのに効いていない」罠 — Low〜Medium（実害の差が大きいので個別に扱う）

参照0件のシンボルを一律に「削除」してよいわけではない。**実害の性質が5通りに分かれる**。監査報告の一部は現況と食い違っていたため、下表は本REQ作成時に `grep` で再確認した結果である。

| # | シンボル | 実測した参照状況 | 実害の性質 | 妥当な処置 |
|---|---|---|---|---|
| G-1 | `SURVEY_DAILY_LIMIT = 3`（`constants.ts:594`） | **完全未参照**（`src/` `supabase/` `scripts/` 全体で定義行のみ） | 実際の制限は `schema.sql:2209` の裸リテラル `>= 3` とメッセージ内の `3件`。**「定数がある」と誤認して `constants.ts` だけ直すと挙動が変わらない罠** | DB側リテラルと機械照合（→ FR-314-01）するか、誤認を招くので削除 |
| G-2 | `EXPERIMENTS`（`src/lib/experiments/index.ts:10-13`） | **完全未参照** | `AdminExperimentsPage.tsx:39, 83, 84` が `'ai_feedback'` / `'new_ranking'` を生文字列で直書き。**実験キーの正本が二重管理**（型安全な参照のための定数だと自称しているのに、その目的を誰も享受していない） | `<option>` を `Object.entries(EXPERIMENTS)` から生成して生き返らせる |
| G-3 | `isWithinTargetBBox`（`targetArea.ts:51`） | 定義とテストのみ | 問題Aのとおり。**テストが緑なのに本番は3実装のインライン** | 問題Aの単一化で参照を復活（削除してはいけない） |
| G-4 | `clearGeocodeCache`（`src/lib/geocodeCache.ts:47`） | 唯一の参照が `src/hooks/__tests__/useReverseGeocode.test.js:15` の **`vi.fn()` モック** | 「テスト間のキャッシュリーク防止用」と明記されているのに**実関数が一度も呼ばれない**。`geocodeCache.ts:19` の `const cache = new Map(...)` はモジュールスコープのシングルトンで、同一座標を使う別テストファイルがキャッシュヒットして fetch モックを通らず**偽陽性を生みうる** | `beforeEach` から**実関数を呼ぶ**（モックを外す） |
| G-5 | `resetErrorReporter`（`src/lib/errorHandler.ts:78`） | **`src/lib/__tests__/errorHandler.test.js:132, 137, 163` から実際に呼ばれている**（監査報告の「未参照」は誤り） | テスト専用ユーティリティとして機能している。**削除すると `errorHandler.test.js` が壊れる** | 削除しない。テスト専用である旨をコメントで明示するだけ |
| G-6 | `isMediaRecorderSupported`（`src/lib/audio/permission.ts:57`） | **完全未参照**（定義行のみ） | 実害なし | 削除 |

> **訂正の記録**: 監査報告（codequality Q-17）は G-2 について「`new_ranking` は `<option>` に存在しない（実験を追加しても管理画面から選べない）」と報告したが、`AdminExperimentsPage.tsx:84` に `<option value="new_ranking">new_ranking（REQ-171 新ランキング）</option>` が**存在する**（`git show HEAD:` でも確認）。したがって「選べない」という実害は無い。残る実害は「実験キーの正本が2箇所に分かれており、追加時に両方直す必要がある」ことだけである。G-5 についても監査報告の「未参照」は誤りで、テストから実際に呼ばれている。

### 問題H: Context のサイレントフォールバックで Provider 配置ミスが検知できない — Low

- `src/context/MapSettingsContext.tsx:53-64` — `useMapSettings` は Provider 不在時に**ローカル state へフォールバックする**（`if (ctx) return ctx` の後、`useState` のペアを返す）。コメントは「テスト・単体利用向け」。
- `src/context/ToastContext.tsx:15-20` — `createContext` の既定値が `noop`（`const noop: ToastFn = (_msg, _duration) => 0`）。Provider 不在でも例外を出さず**通知が黙って消える**。

**現構成では実バグでないことを確認済み**（`providers.tsx` の Provider 配置と Header / DrawerMenu の位置関係を確認）。問題は将来の変更耐性である。Header / DrawerMenu を Provider の外へ移すと、**ヒートマップ切替が「押せるのに効かない」状態になり、エラーも警告も出ない**（ドロワー内のトグルはローカル state を書き換え、地図側は別のローカル state を読む）。Toast 側も同様に通知が消える。

### 問題I: 投稿写真の表示経路が Supabase 変換を通っておらず、`next.config.ts` の設定が未使用 — Low・**2択の判断が必要**

現況（`grep` で実測）:

- `src/lib/imageUtils.ts:6-13` の `toThumbnailUrl`（`/storage/v1/object/public/` を `/storage/v1/render/image/public/` へ書き換えて `?width=&quality=80` を付ける）を呼ぶのは **`PostCard.tsx:80` の1箇所だけ**
- `PostCard` を import するのは **`PostList.tsx:4` だけ**
- **`PostList` はどこからも import されていない**（`src/` 全体で `PostList` の import は `PostList.tsx` 内の `PostCard` のみ）。`src/components/features/dashboard/StatsBar.tsx` も同様に未使用
- 実際にユーザーが見る写真表示経路は `PhotoGallery.tsx:87-94` と `DetailPage.tsx:434` の**生 public URL → `next/image`**

したがって `next.config.ts:29-33` の

```
// REQ-147: toThumbnailUrl は public パスを render/image パスへ書き換える
// （?width=&quality= 付き）。サムネ URL を Next.js Image Optimization の
// 対象に含めるため render/image パスも許可する。search 未指定により任意のクエリを許可。
{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/render/image/public/**' },
```

の remotePattern は**現状使われていない**。

**重要（良い状態の確認）**: 逆に言えば「Supabase 変換 ＋ Next.js 変換の二重変換」は**本番では発生していない**。`PostCard` を復活させると二重変換になる。また `PostCard.tsx:80-84` は `toThumbnailUrl(..., 400)` で幅400px固定のURLに対し `sizes="(max-width:640px) 100vw, …"` を指定しており、モバイルで 640/750/828px の srcset を 400px ソースから生成する**アップスケールの不整合**もある。

したがって本項は「設定と実態の乖離を解消する」ことが目的で、**どちらに寄せるかを決める必要がある**。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| I-1（生URL + `next/image` に一本化） | `PostList.tsx` / `PostCard.tsx` / `StatsBar.tsx` を削除し、`toThumbnailUrl`（`imageUtils.ts`）と `render/image` の remotePattern も撤去 | 実態に設定を合わせる最短路。二重変換の再発余地が構造的に消える。無限スクロール実装の唯一の消費者が dead code だという混乱も解消 | `PostCard.test.tsx`（9件）を削除するためテスト総数が減る。将来 Supabase 変換を使いたくなったら再導入 |
| I-2（Supabase 変換に寄せる） | `PhotoGallery` / `DetailPage` の写真URLを `toThumbnailUrl` 経由にし、`next/image` を `unoptimized` にして二重変換を避ける | Vercel の Image Optimization 変換回数（課金対象）を削減できる可能性 | Supabase Image Transformation は**有料プランの機能**（`imageUtils.ts:1-4` のコメントが「有効な場合に…」と条件付きで書かれている）。有効性の確認が前提。`unoptimized` にすると AVIF/WebP 変換・`minimumCacheTTL` などの既存最適化（性能監査でクリーン確認済み）を失う |

**本REQでは実装を決めつけない。** 判断材料として「Supabase の Image Transformation が現在のプランで有効か」「Vercel の Image Optimization 変換回数が費用上の懸念になっているか（REQ-218 クラウドコストガードレール）」の2点を確認してから決める。

> **依存関係の注意**: `PostList.tsx` は無限スクロールの sentinel（`:110-125`）を持つ唯一のコードで、性能監査 P-7（ホームが `fetchMore` を配線しておらず既定状態で最新50件で打ち止め）の**参考実装**でもある。P-7 は **REQ-308**（一覧取得のページングと仮想化）の対象。**I-1 で `PostList.tsx` を削除する前に REQ-308 側が sentinel 実装を必要としないか確認する**（あるいは REQ-308 の完了後に削除する）。

---
