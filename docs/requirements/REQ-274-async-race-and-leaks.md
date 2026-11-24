# REQ-274: 非同期race・リソースリーク修正

優先度: **P1** ／ 深刻度: **Medium** ／ 種別: コード品質（正確性）

## 背景

`useStats`/`useProfile` 系は AbortController＋aborted ガードを一貫適用済みだが、以下が取り残されている。

### 問題A: `usePostList` に中断機構がなく、フィルタ/地図境界の高速切替で古い結果が勝つ
`src/hooks/posts/usePostList.ts:94-142`。`fetchPosts` は `await buildQuery().range(...)` 後に無条件 `setPosts(...)`。HomePage は `useEffect(..., [fetchPosts, filters])` で filters 変更ごとに再実行するが、in-flight の前回クエリはキャンセルされず、遅く解決した旧クエリが新結果を上書きし得る（last-resolved-wins）。フィルタと不一致の投稿が地図/一覧に表示される。

### 問題B: `useReverseGeocode` / `useWeather` のデバウンスがタイマーのみクリーンアップ
`src/hooks/useReverseGeocode.ts:81-100` / `src/hooks/useWeather.ts:121-137`。開始済み fetch は新入力でも中断されず、地図でピンを連続移動すると古い座標の市区町村・天気が後から上書き。アンマウント後 setState も発生。

### 問題C: AudioRecorder のカウントダウン interval がクリーンアップ漏れ
`src/components/features/posts/AudioRecorder.tsx:213-221`。`tick` interval を ref に保持せず、`cleanup()`（`:80-91`）も `recorder.onstop` も clear しない。録音中アンマウントで最大60秒 setState が発火し続け、手動停止後も残時間UIがカウントダウンを継続する。

## 機能要件

- **FR-274-01**: `usePostList.fetchPosts`/`fetchMore` に AbortController（PostgRESTの `.abortSignal()`）またはシーケンストークンを導入し、「最新の要求のみが state を書く」ことを保証する。中断エラー（AbortError）はエラー表示・トーストの対象にしない。
- **FR-274-02**: `useReverseGeocode` / `useWeather` に要求シーケンス（位置キー or 連番）を導入し、解決時に最新要求か照合してから setState する。アンマウント後 setState を発生させない。
- **FR-274-03**: AudioRecorder の tick interval を ref 管理にし、`cleanup()` と `onstop` の双方で clearInterval する。手動停止後に残時間表示が変化しないこと。

## 受入基準

- **AC-01**: フィルタ（種別/期間）を高速切替しても、最終的な一覧・地図が最後に選択したフィルタと一致する（人工遅延を入れたユニットテストで検証）。
- **AC-02**: `usePostList` / 対象フックのテストで「古い応答が新しい応答を上書きしない」ケースが追加される。
- **AC-03**: 録音の開始→手動停止→残時間表示が停止時点で固定される。録音中アンマウントで console にアンマウント後 setState 警告が出ない。
- **AC-04**: `lint` / `type-check` / 既存テストパス。
