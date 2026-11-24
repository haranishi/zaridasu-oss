# REQ-272: 日付処理のローカル日付統一（JST早朝に観測日が1日ズレる）

優先度: **P0** ／ 深刻度: **High** ／ 種別: データ品質（正確性）

## 背景

「今日の日付文字列」を `new Date().toISOString().split('T')[0]` で導出している箇所が複数ある。`toISOString()` は **UTC** の日付を返すため、JST 0:00〜8:59 の間は「昨日」の日付になる。

### 影響箇所

| 場所 | 影響 | 深刻度 |
|---|---|---|
| `src/components/features/posts/PostForm.tsx:74`（`today`→ 既定観測日 `:102` と `<input type="date" max>` `:414`） | JST早朝の投稿で観測日の既定が昨日になり、かつ `max` が昨日のため**今日を選択できない**。観測日データが毎日9時間の窓で劣化 | High |
| `src/components/modals/EditDialog.tsx:145` | 編集時も同じく今日を選べない | High |
| `src/hooks/useWeather.ts:75-87` | `date >= today` の forecast/archive 分岐が誤り、**昨日の観測に「今の天気」を記録**し得る | Medium |
| `src/hooks/useCsvExport.ts:89`、`src/views/admin/AdminPostsPage.tsx:144`、`src/views/admin/AdminLogsPage.tsx:123` | CSVファイル名が前日日付になる（表示のみ） | Low |
| `src/components/features/admin/DateRangePicker.tsx:14-16` | プリセット選択時の `<input type="date">` 表示が前日になる（クエリ境界は Date インスタンスなので正しい） | Low |

なお `observedAtToIso`（`src/lib/post/postFields.ts:39-41`）はローカルパースで正しく、「today の導出」だけが UTC で不整合。

## 機能要件

- **FR-272-01**: ローカル日付ヘルパー `todayLocalISODate(): string` と `toLocalISODate(d: Date): string`（`YYYY-MM-DD`、端末ローカルタイムゾーン）を `src/lib/` に新設し、ユニットテストを付ける（タイムゾーン非依存の検証: `new Date(2026, 0, 1)` → `'2026-01-01'` 等）。
- **FR-272-02**: 上表の全6箇所を新ヘルパーへ置換する。
- **FR-272-03**: `PostForm` の観測日は「既定＝ローカル今日・max＝ローカル今日」となり、JST早朝でも今日を選択できること。
- **FR-272-04**: `useWeather` の分岐は「観測日（ローカル日付文字列）とローカル今日」の比較になること。

## 受入基準

- **AC-01**: 新ヘルパーのユニットテストがタイムゾーンに依存せずパスする。
- **AC-02**: `TZ=Pacific/Kiritimati`（UTC+14）と `TZ=Pacific/Honolulu`(UTC-10) で `npm run test` がパスする（date系テストがローカル日付前提で堅牢）。
- **AC-03**: `grep -rn "toISOString().split('T')\[0\]" src/` の残存が、意図的にUTCで良い箇所（存在する場合はコメントで理由明示）のみになる。

## 対象外

- サーバー側・DB側の日付処理（既に `Asia/Tokyo` 指定や日付境界の扱いが仕様通りのもの）。
- `useStats.ts:172` の月ラベルUTCパース（要検証としてREQ-281の技術負債リストに記録）。
