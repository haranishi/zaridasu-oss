## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | 完全無料（気象庁 API は公開 JSON） |
| キャッシュ | sessionStorage に 5 分 TTL（同日同セッションで重複呼び出しを防ぐ） |
| オフライン | `navigator.onLine` チェック後 fetch。失敗時は `weather = null` で継続 |
| CORS | 気象庁 API は CORS 制限なしを確認済み（変更時は Supabase Edge Function プロキシに切り替え） |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/hooks/useWeather.ts` | 気象庁 API 呼び出しフック |
| `supabase/migrations/20260316000000_add_weather_columns.sql` | posts テーブルに 3 カラム追加 |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/constants.js` | `JMA_AREA_CODE`, `WEATHER_TYPES` 追加 |
| `src/types/index.ts` | `WeatherType`, `UseWeatherResult` 型追加 |
| `src/hooks/usePostForm.ts` | insert ペイロードに `weather`, `temperature_max`, `temperature_min` 追加 |
| `src/components/features/posts/PostForm.jsx` | `useWeather` フック呼び出し + 天気バナー UI |
| `src/pages/TrendsPage.jsx` | 天気別分析セクション追加 |
| `src/pages/DetailPage.jsx` | 天気情報カード追加 |
| `src/locales/*/translation.json` | `weather.*` キー追加 |

---
