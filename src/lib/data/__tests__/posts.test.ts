import { describe, it, expect } from 'vitest'

import {
  PUBLIC_COORD_COLUMN,
  PUBLIC_POST_STATUS,
  countPublicPosts,
  countPublicPostsByMunicipality,
  countPublicPostsByMunicipalityAndSpecies,
  countPublicPostsBySpecies,
  countPublicPostsByUser,
  selectPublicPostCreatedAt,
  selectPublicPostObservedAt,
  selectPublicPostsForAreaSpecies,
  selectPublicPostsForCards,
  selectPublicPostsForMap,
  selectPublicPostsForRecentList,
  selectPublicPostsForSitemap,
  type PostsClient,
} from '../posts'

/** 組み立てたクエリの中身を記録するだけの偽クライアント。 */
function recordingClient() {
  const calls = {
    table: '' as string,
    select: '' as string,
    options: undefined as unknown,
    eq: [] as [string, unknown][],
    not: [] as [string, string, unknown][],
  }
  const builder = {
    select(select: string, options?: unknown) {
      calls.select = select
      calls.options = options
      return builder
    },
    eq(column: string, value: unknown) {
      calls.eq.push([column, value])
      return builder
    },
    not(column: string, operator: string, value: unknown) {
      calls.not.push([column, operator, value])
      return builder
    },
  }
  const client = {
    from(table: string) {
      calls.table = table
      return builder
    },
  }
  return { client: client as unknown as PostsClient, calls }
}

/** この層が公開する「クエリを組む関数」を全部。新しく足したらここにも足す。 */
const BUILDERS: [string, (c: PostsClient) => unknown][] = [
  ['countPublicPosts', (c) => countPublicPosts(c)],
  ['countPublicPostsByMunicipality', (c) => countPublicPostsByMunicipality(c, '秋田市')],
  [
    'countPublicPostsByMunicipalityAndSpecies',
    (c) => countPublicPostsByMunicipalityAndSpecies(c, '秋田市', 'american'),
  ],
  ['countPublicPostsBySpecies', (c) => countPublicPostsBySpecies(c, 'american')],
  ['countPublicPostsByUser', (c) => countPublicPostsByUser(c, 'user-1')],
  ['selectPublicPostCreatedAt', (c) => selectPublicPostCreatedAt(c)],
  ['selectPublicPostObservedAt', (c) => selectPublicPostObservedAt(c)],
  ['selectPublicPostsForAreaSpecies', (c) => selectPublicPostsForAreaSpecies(c)],
  ['selectPublicPostsForCards', (c) => selectPublicPostsForCards(c)],
  ['selectPublicPostsForMap', (c) => selectPublicPostsForMap(c)],
  ['selectPublicPostsForRecentList', (c) => selectPublicPostsForRecentList(c)],
  ['selectPublicPostsForSitemap', (c) => selectPublicPostsForSitemap(c)],
]

// 2 モジュールに分かれているが、不変条件は同じものを満たす必要があるのでまとめて見る。
// 分割の理由は posts-select.ts の冒頭に書いてある（クライアントバンドルの予算）。
describe('lib/data/posts', () => {
  it('公開の定義は approved', () => {
    expect(PUBLIC_POST_STATUS).toBe('approved')
  })

  describe.each(BUILDERS)('%s', (_name, build) => {
    it('posts テーブルを status=approved で引く', () => {
      const { client, calls } = recordingClient()
      build(client)
      expect(calls.table).toBe('posts')
      expect(calls.eq).toContainEqual(['status', PUBLIC_POST_STATUS])
    })

    // REQ-243: 生 lat/lng は anon/authenticated から列 GRANT で剥奪済み。select に書くと
    // 実行時に落ち、権限次第では粗化前の座標が出る。この層を通る限り起きないことを機械で担保する。
    it('生の lat / lng を select しない（粗化列のエイリアスだけ）', () => {
      const { client, calls } = recordingClient()
      build(client)
      const columns = calls.select.split(',').map((c) => c.trim())
      expect(columns).not.toContain('lat')
      expect(columns).not.toContain('lng')
      for (const column of columns) {
        if (column.startsWith('lat') || column.startsWith('lng')) {
          expect(column).toMatch(/^(lat:display_lat|lng:display_lng)$/)
        }
      }
    })
  })

  it('地図用は粗化座標をエイリアスして返す', () => {
    const { client, calls } = recordingClient()
    selectPublicPostsForMap(client)
    expect(calls.select).toContain('lat:display_lat')
    expect(calls.select).toContain('lng:display_lng')
  })

  it('件数クエリは行を転送しない（head + exact count）', () => {
    const { client, calls } = recordingClient()
    countPublicPosts(client)
    expect(calls.options).toEqual({ count: 'exact', head: true })
  })

  it('範囲フィルタに使う列名も粗化列', () => {
    // WHERE 句でも生 lat/lng は使えない（同 REQ-243）。
    expect(PUBLIC_COORD_COLUMN).toEqual({ lat: 'display_lat', lng: 'display_lng' })
  })

  it('観察日時のクエリは observed_at が NULL の行を除く', () => {
    const { client, calls } = recordingClient()
    selectPublicPostObservedAt(client)
    expect(calls.not).toContainEqual(['observed_at', 'is', null])
  })
})
