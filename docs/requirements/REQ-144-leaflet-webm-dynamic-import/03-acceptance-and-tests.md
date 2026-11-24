## 受入条件
- [ ] AC-01: `grep -rn "from 'react-leaflet'" src/ | grep -v "import("` の結果が **dynamic 経由のみ** （SSR safe な dynamic / next/dynamic）になっている。
- [ ] AC-02: `grep -rn "from 'fix-webm-duration'" src/` の結果が空、もしくは `await import('fix-webm-duration')` のみ。
- [ ] AC-03: `npm run build` 成功。
- [ ] AC-04: `npm run analyze` で生成された stats から、`SurveyRequestForm` / `PostForm` / `MiniMap` / `LocationSection` の chunk に `leaflet*` / `react-leaflet*` が含まれていないことを目視確認（独立した `leaflet` 系 vendor chunk に切り出されているか、表示時に lazy 取得される形）。
- [ ] AC-05: ホーム `/` を開いた直後の Network タブで、`react-leaflet` / `leaflet` 由来の JS が 読み込まれない（地図モーダルや MapView オープン前は来ない）。
- [ ] AC-06: 録音 → 停止 後に `fix-webm-duration*.js` が初めて取得されることを Network タブで確認。
- [ ] AC-07: 既存 E2E（home / post / admin-guard / survey-request 一覧）が緑。
- [ ] AC-08: 録音 → 投稿フローの手動 smoke 通過（duration metadata がブラウザに正しく認識される）。
- [ ] AC-09: size-limit 新規追加項目が pass。CI でも通る。

## テスト要件

### ユニット / コンポーネント
- [ ] `src/components/features/posts/__tests__/LocationSection.test.tsx`（存在しない場合は新規）で、dynamic 化後も `MapContainer` 等が render されることを確認（`vi.mock('react-leaflet', ...)` 形で副作用なしに描画できることを担保）。
- [ ] `src/lib/audio/__tests__/fixWebmDuration.test.ts` で：
  - webm 以外の blob は dynamic import が起きずに早期 return する。
  - webm の場合のみ `fix-webm-duration` が呼ばれ、失敗時に元 blob を返す（`vi.mock('fix-webm-duration', ...)`）。

### E2E
- [ ] 既存 `tests/e2e/post.spec.ts` の録音シナリオを通す（既存テスト群で十分なら新規不要）。
- [ ] 既存 `tests/e2e/survey-request.spec.ts` で SurveyRequestForm モーダルを開き、地図がレンダリングされることを確認。

### バンドル計測
- [ ] `.size-limit.json` の新規閾値で `npm run size` が pass。
