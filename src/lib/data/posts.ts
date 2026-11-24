// posts テーブルの公開読み取りを1か所に集める層。
//
// **なぜ要るか。** 2026-09-14 の実測で、DB アクセス（`.from('テーブル名')`）が
// 36 ファイル・86 箇所、うち「公開＝approved」の判定が 18 箇所に散っていた。唯一の定数だった
// `PUBLIC_STATUS` は CSV 書き出しのルート（`app/dataset/zaridasu.csv/route.ts`）に住み、
// 3 ファイルだけがそれを import し、残りは文字列を直書きしていた。つまり
// **「どの投稿を公開してよいか」という仕様が、CSV 出力の付属物として置かれていた**。
//
// さらに重いのが REQ-243 の不変条件（下記 PUBLIC_COORD_COLUMN）で、これは 8 ファイル・11 箇所に
// コピペされた select 文とその脇のコメントで保たれていた。破ると「型は通るのに実行時に落ちる」か、
// 権限次第では **正確な位置が漏れる**。仕様をコメントではなくコードで持つのが、この層の主目的。
//
// ここに置くもの: 公開の定義（status）・公開してよい列の組・粗化座標の扱い。
// ここに置かないもの: 画面固有の並べ替え・検索条件・ページング（呼び出し側が続けて足す）。
//
// **select 文字列を引数で受け取る汎用関数にはしないこと。** supabase-js は select 文を
// 型レベルで解析して行型を決めるため、`select<S extends string>` のようにジェネリックで
// 渡すと型の展開が発散し、tsc がヒープ不足で落ちる（2026-09-14 に実測）。
// 用途ごとに関数を分け、select 文はそれぞれのリテラルとして書く。
//
// **クライアント側のフックからこの層を呼ぶときは、バンドル予算を測ってから入れること。**
// `useStats`（件数を数えるだけ）をこの層に通したら、`/`（ホーム）のチャンクが
// 9.73 kB → 10.3 kB になり、10 kB の予算を 302 B 超えた（2026-09-14 実測。内訳は
// useStats が約 520 B、usePostList が約 50 B）。モジュールを「定数と件数」「列の組」
// 「サーバ専用」に割り直しても数字は動かなかったので、原因はモジュールの中身ではなく
// チャンク分割の副作用。`useStats` は座標の不変条件に関係しない件数クエリなので、
// 移行を見送って直呼びのままにしてある（`/` は 9.78 kB）。移すなら bundle analyzer で
// 先に増分の出どころを掴むこと。

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'
import type { Species } from '@/types'

export type PostsClient = SupabaseClient<Database>

/**
 * 公開対象の status（FR-230-06）。approved 固定で、未承認・却下は公開しない。
 *
 * 直書きの `'approved'` を増やさないこと。公開の条件が変わる日に 44 箇所を探して回ることになる。
 */
export const PUBLIC_POST_STATUS = 'approved' as const

/**
 * **REQ-243: 生の `lat` / `lng` を select にも WHERE にも書かない。**
 *
 * 生 lat/lng は anon / authenticated から列 GRANT で剥奪済みなので、書くと実行時に落ちる。
 * 公開用には約 111m グリッドへ粗化した `display_lat` / `display_lng` があり、位置を
 * 非公開にした投稿ではこれが NULL になる（＝範囲比較から自然に外れ、地図に出ない）。
 * 呼び出し側が `lat` / `lng` の名前で受け取れるよう、select ではエイリアスする。
 *
 * この層の関数を使っていれば自動的に守られる。直に `.from('posts')` を書くときだけ、
 * 自分で思い出す必要がある（だからこそ直呼びを増やさない）。
 */
export const PUBLIC_COORD_COLUMN = { lat: 'display_lat', lng: 'display_lng' } as const

/** 投稿者で絞った公開投稿の件数。プロフィールページが使う。 */
export function countPublicPostsByUser(client: PostsClient, userId: string) {
  return countPublicPosts(client).eq('user_id', userId)
}

/** 公開投稿の件数だけを取る。返り値の `count` を読む。 */
export function countPublicPosts(client: PostsClient) {
  return client
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', PUBLIC_POST_STATUS)
}

/** 市町村で絞った公開投稿の件数。エリアページと sitemap の両方が使う。 */
export function countPublicPostsByMunicipality(client: PostsClient, municipality: string) {
  return countPublicPosts(client).eq('municipality', municipality)
}

/** 種で絞った公開投稿の件数。 */
export function countPublicPostsBySpecies(client: PostsClient, species: Species) {
  return countPublicPosts(client).eq('species', species)
}

/** 市町村×種で絞った公開投稿の件数。エリア×種ページが使う。 */
export function countPublicPostsByMunicipalityAndSpecies(
  client: PostsClient,
  municipality: string,
  species: Species
) {
  return countPublicPostsByMunicipality(client, municipality).eq('species', species)
}

/** 地図と一覧。MapView のポップアップが字・水系を出すため地理列まで含む（REQ-231）。 */
export function selectPublicPostsForMap(client: PostsClient) {
  return client
    .from('posts')
    .select(
      'id, created_at, lat:display_lat, lng:display_lng, species, info_type, municipality, comment, photos, count, survey_duration_minutes, locality, water_body'
    )
    .eq('status', PUBLIC_POST_STATUS)
}

/** エリアページのカード一覧。地図ほど列が要らない。 */
export function selectPublicPostsForCards(client: PostsClient) {
  return client
    .from('posts')
    .select(
      'id, species, info_type, municipality, locality, water_body, lat:display_lat, lng:display_lng, photos, comment, created_at'
    )
    .eq('status', PUBLIC_POST_STATUS)
}

/** Home cards never need coordinates, private profile data, or moderation fields. */
export function selectPublicPostsForHome(client: PostsClient) {
  return client.from('posts').select(
    'id, species, info_type, municipality, photos, comment, created_at, likes(id), comments(id, content, created_at)'
  ).eq('status', PUBLIC_POST_STATUS)
}

/**
 * ホームの「次に足りない記録」用の集計の材料。種・種類・市町村だけを返し、座標も投稿者も含まない。
 * 呼び出し側で `.limit()` を続ける（PostgREST の上限は通常1000行）。
 */
export function selectPublicPostCoverage(client: PostsClient) {
  return client.from('posts').select('species, info_type, municipality').eq('status', PUBLIC_POST_STATUS)
}

/** sitemap の lastmod 用。 */
export function selectPublicPostsForSitemap(client: PostsClient) {
  return client.from('posts').select('id, updated_at').eq('status', PUBLIC_POST_STATUS)
}

/**
 * 期間（最古・最新）を出すための `created_at` だけのクエリ。
 * `order` + `limit(1)` を続けて min/max の代わりにする。
 */
export function selectPublicPostCreatedAt(client: PostsClient) {
  return client.from('posts').select('created_at').eq('status', PUBLIC_POST_STATUS)
}

/**
 * 収録期間（観察日時の最小・最大）を出すための `observed_at` だけのクエリ。
 * 観察日時が無い行は除く。
 */
export function selectPublicPostObservedAt(client: PostsClient) {
  return client
    .from('posts')
    .select('observed_at')
    .eq('status', PUBLIC_POST_STATUS)
    .not('observed_at', 'is', null)
}

/** 種ページの「最近の報告」一覧。市町村と日付だけ出す。 */
export function selectPublicPostsForRecentList(client: PostsClient) {
  return client
    .from('posts')
    .select('id, municipality, created_at')
    .eq('status', PUBLIC_POST_STATUS)
}

/** エリア×種の集計用。 */
export function selectPublicPostsForAreaSpecies(client: PostsClient) {
  return client.from('posts').select('municipality, species').eq('status', PUBLIC_POST_STATUS)
}

/**
 * 詳細ページ（`/post/[id]`）の 1 件取得。コメントと Like を結合して 1 往復で取る。
 *
 * 公開分だけでなく自分の未承認投稿も開けるよう `status` 列まで取り、公開判定は
 * 呼び出し側が行う（`.eq('status', ...)` を掛けない）。座標は粗化列のエイリアス。
 */
export function selectPostDetailById(client: PostsClient, postId: string) {
  return client
    .from('posts')
    .select(
      'id, created_at, lat:display_lat, lng:display_lng, location_disclosure, species, info_type, municipality, comment, photos, user_id, is_anonymous, is_official, count, observed_at, status, rejection_message, weather, temperature, humidity, audio_url, audio_duration_ms, ai_result, comments(id, post_id, user_id, content, is_admin, created_at), likes(id, user_id)'
    )
    .eq('id', postId)
    .single()
}

/**
 * アプリ内の CSV 書き出し。**公開データセット（`/dataset`）とは列が違う。**
 * あちらは locality / water_body を含む公開データの契約で、こちらは天候・気温・湿度を
 * 含む利用者向け。どちらかに寄せると配布済みデータの列が変わるので、統一しないこと。
 */
export function selectPostsForUserCsv(client: PostsClient) {
  return client
    .from('posts')
    .select(
      'id, created_at, observed_at, lat:display_lat, lng:display_lng, species, info_type, municipality, comment, photos, count, weather, temperature, humidity, survey_method'
    )
}
