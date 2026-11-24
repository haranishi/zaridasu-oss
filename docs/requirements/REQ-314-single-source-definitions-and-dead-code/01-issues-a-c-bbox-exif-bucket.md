### 問題A: 対象エリア bbox 判定が4実装あり、境界の包含/排他が不一致・正規ヘルパは未使用 — Medium

正規ヘルパは `src/lib/area/targetArea.ts:51-58` にある。**包含（`>=` / `<=`）・非有限値ガード付き・テストあり**。

```
export function isWithinTargetBBox(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const { latMin, latMax, lngMin, lngMax } = AKITA_BOUNDS
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax
}
```

`isWithinTargetBBox` の参照は**定義（`targetArea.ts:51`）とテスト（`targetArea.test.ts`）のみ**で、本番コードからの参照は0件。同じ述語が3箇所にインライン再実装されている。

| 場所 | 境界 | 非有限値ガード | 用途 |
|---|---|---|---|
| `src/lib/area/targetArea.ts:51-58` | **包含** `>=` `<=` | あり | 正規ヘルパ（**未使用**） |
| `src/components/features/posts/PostForm.tsx:156-157` | **排他** `>` `<` | なし | マウント時の現在地（GPS）自動入力 |
| `src/hooks/posts/usePostForm.ts:99-100` | 包含 | なし | EXIF GPS の採用判定 |
| `src/lib/validation/schemas.ts:95-105` | 包含（zod `refine`） | （zod が数値を保証） | 投稿の入力検証 |

結果として、**`AKITA_BOUNDS.latMin = 38.8` ちょうどの地点では GPS 自動入力だけが働かない**。`PostForm.tsx:153-164` の `getCurrentPosition` 成功コールバックは、条件が偽のとき `setPosition` を呼ばずに何もしない（`else` も無く、失敗コールバック `:164` の「無視」コメントの経路にも入らない）ため、**サイレントに無視される**。同じ座標を EXIF 経由（`usePostForm.ts:99-100`）と zod 検証（`schemas.ts:95-105`）は通す。ユーザーから見ると「境界付近では現在地が入るときと入らないときがある」という再現しにくい挙動になる。

加えて、対象県を秋田以外へ広げる／`AKITA_BOUNDS` を差し替える場面で**4箇所を直す構造**になっている（`targetArea.ts` のテストだけが緑のまま残る最悪パターンがあり得る）。

### 問題B: EXIF 由来の座標が `location_source = 'manual'` として記録される（ドメイン型が生成型より狭い）— Medium

DB列・zod・生成型は**3値**なのに、ドメイン型だけが2値に狭められている。

- `src/types/database.types.ts:78` — `location_source: 'gps' | 'manual' | 'exif' | null`（Insert `:129` / Update `:175` も同じ）
- `src/lib/validation/schemas.ts:80-82` — `locationSourceSchema = z.enum(['gps', 'manual', 'exif'], …)`
- `src/types/index.ts:49` — **`export type LocationSource = 'gps' | 'manual'`** ← 狭い

そして `src/components/features/posts/PostForm.tsx:480` の EXIF 適用ハンドラが

```
onApplyExif={(pos) => { selectManualPosition(pos); applyExifPosition() }}
```

と `selectManualPosition` を呼び、その実体（`PostForm.tsx:96-100`）は `setGpsAccuracy(null)` ＋ **`setLocationSource('manual')`** である。したがって EXIF GPS から採用した投稿も `manual` として保存され、`locationSourceSchema` の `'exif'` 分岐は**実質デッド**になる。

影響は市民科学データの品質メタデータである。**位置来歴（provenance）が誤記録され、後から復元できない。** REQ-172 は `accuracy`（GPS 水平位置精度）と取得手段を、REQ-174 は `survey_method` を「データの信頼度を判断するためのメタデータ」として導入したが、そのうち位置来歴だけが「手動選択」と「写真のEXIF」を区別できない。研究利用側から見れば、地図を指でタップした概位置と撮影機器のGPSが同じラベルになる。

さらに**型が狭いため、この欠落をコンパイラが指摘できない**。`'exif'` を代入しようとすれば型エラーになるので、正しい実装のほうが弾かれる。`InfoType`（`src/types/index.ts:16`）は既に `NonNullable<Post['info_type']>` で生成型から導出する方式（REQ-148）を採っているので、**同じ方式を適用すれば構造的に解決する**。

### 問題C: `post-photos` バケット名が直書きされ、`src/lib/storage.ts` の抽象が迂回されている — Medium

`.from('post-photos')` は**6ファイル13箇所**（テスト除く。実測）。

| ファイル | 行 |
|---|---|
| `src/lib/storage.ts` | 11, 25, 28 |
| `src/hooks/posts/usePostForm.ts` | 155, 162, 184, 197 |
| `src/hooks/useOfflineQueue.ts` | 71, 74 |
| `src/hooks/posts/useDeletePost.ts` | 27 |
| `src/hooks/admin/useAdminPosts.ts` | 269, 334 |
| `src/views/admin/AdminReportsPage.tsx` | 139 |

これに加えて、**URL からパスを切り出すための `'/post-photos/'` リテラルが4箇所**ある（`src/lib/storage.ts:5` の `url.split('/post-photos/')[1]`、`useAdminPosts.ts:266, 329`、`AdminReportsPage.tsx:136`）。合計17箇所。

音声側は**非対称に正しい**。`src/lib/uploadAudio.ts:3` が `const BUCKET = 'post-audio'` として1箇所に集約している。

より本質的な問題は、**`src/lib/storage.ts` が `uploadPhoto` / `deletePhotos` / `extractPhotoPath` という抽象として存在するのに、多くの呼び出し側がそれを迂回して直接 `supabase.storage.from('post-photos')` を叩いている**ことである。`src/lib/storage.ts` を import しているのは `useDeletePost.ts:3`（`extractPhotoPath` のみ）と `useEditPost.ts:4`（`deletePhotos` / `uploadPhoto`）の**2ファイルだけ**で、`usePostForm` / `useAdminPosts` / `AdminReportsPage` / `useOfflineQueue` は同等の処理を各々インラインで書いている。結果として

- EXIF 除去パイプライン（`storage.ts:20-31` の `uploadPhoto` は `processImage` を通す。REQ-243 FR-243-04）を通る経路と通らない経路が並存する構造になっている
- `extractPhotoPath` がバケット名を**パス解析文字列にも埋め込んでいる**ため、バケットを改名すると `.from()` の13箇所だけでなく**URL解析4箇所まで追わないと写真の削除が静かに失敗する**（`split` が `undefined` を返し `|| ''` で空文字になり、`remove([])` 相当になる）
