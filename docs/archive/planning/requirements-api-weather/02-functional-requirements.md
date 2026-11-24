## 機能要件

**F1: 投稿フォームでの自動天気取得**

- 位置ピン確定から 1 秒以内に気象庁 API を呼び出す
  - エンドポイント: `https://www.jma.go.jp/bosai/forecast/data/forecast/050000.json`
  - 秋田県コード `050000` は定数 `JMA_AREA_CODE` として `constants.js` に定義
- 取得した天気概況と最高・最低気温予報を投稿フォームに表示（読み取り専用バナー）
- API 失敗時はサイレント無視（`weather = null` で投稿継続）

**F2: DB スキーマ追加**

```sql
ALTER TABLE posts
  ADD COLUMN weather TEXT
    CHECK (weather IN ('sunny','cloudy','rainy','snowy','unknown')),
  ADD COLUMN temperature_max INTEGER,
  ADD COLUMN temperature_min INTEGER;

CREATE INDEX idx_posts_weather ON posts(weather);
```

**F3: TrendsPage 天気別分析**

- TrendsPage に「天気別内訳」棒グラフを追加
- weather カラムが全件 NULL の場合はセクションを非表示にする

**F4: DetailPage 天気表示**

- post.weather / temperature_max / temperature_min が非 NULL の場合に表示
- Lucide アイコン使用: Sun, Cloud, CloudRain, CloudSnow

**F5: useWeather フック**

```typescript
// src/hooks/useWeather.ts
export function useWeather(position: [number, number] | null): {
  weather: WeatherType | null
  tempMax: number | null
  tempMin: number | null
  fetching: boolean
}
```

- `useReverseGeocode.ts` と同じパターンで実装（AbortSignal, オフライン検知, sessionStorage キャッシュ 5 分）

---
