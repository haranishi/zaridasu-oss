## 2. 施策 URL の作り方

**手で URL を組まない。** 表記ゆれとパラメータ漏れが必ず起きる。
`src/lib/shareUtm.ts` の `buildCampaignUrl()` を使う。

```ts
import { buildCampaignUrl } from '@/lib/shareUtm'

buildCampaignUrl({
  medium: 'instagram',      // utm_source（媒体）
  from: 'ig_story',         // ?from=（台帳の値のみ・型で強制される）
  campaign: 'deadline_list',// utm_campaign（施策名）
  content: '2026-08-02_a',  // utm_content（クリエイティブ単位）★施策開始前に決める
})
// → https://zaridasu.com/?auth=signup&from=ig_story&utm_source=instagram
//    &utm_medium=campaign&utm_campaign=deadline_list&utm_content=2026-08-02_a
```

### パラメータの役割

| パラメータ | 何を分ける | 例 |
|---|---|---|
| `utm_source` | 媒体 | `instagram` / `x` / `game` / `flyer` / `meishi` / `univ` |
| `utm_medium` | 経路の種別 | 外部施策は `campaign`、アプリ内シェアは `social`（`buildShareUrl`） |
| `utm_campaign` | 施策 | `deadline_list` / `class_handout` |
| `utm_content` | **クリエイティブ／投稿単位** | `2026-08-02_a` / `thumb_b` |
| `from` | CV（サインアップ）への帰属 | 台帳の値（下記） |

`utm_*` は GA4 のセッション帰属、`from` はサインアップイベントへの帰属で、**役割が違う**。
両方付ける。

### `from` の台帳

`src/lib/acquisition.ts` の `ACQUISITION_SOURCES` が唯一の正。現在の値:

`lp` / `game` / `ig_profile` / `ig_story` / `ig_post` / `flyer_qr` / `meishi` / `univ`

台帳に無い値は集計時に **`other` へ丸められ**、元の値は `from_raw` として別プロパティで送られる
（丸めるだけだと台帳の追加漏れに気づけないため）。
**新しい施策を始めるときは、URL を配る前に台帳へ追加する。**

---
