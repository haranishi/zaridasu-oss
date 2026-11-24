## 目的

- 初回描画 chunk および「モーダル等を開いた瞬間に取得する chunk」から `react-leaflet` / `fix-webm-duration` を切り離す。
- 地図系コンポーネント chunk を「地図が実際に表示されるとき」にだけ取得する形に統一する。
- 機能・UX への悪影響なし（待ち時間は最大数十 ms、loading skeleton で吸収）。

## 要件

### 機能要件
- [ ] FR-144-01: `src/components/modals/SurveyRequestForm.tsx` の `react-leaflet` 静的 import を撤去し、`MapContainer` / `TileLayer` をコンポーネント内で `dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })` 等で wrap する（既存パターン `src/views/DetailPage.tsx:21` と同形）。
- [ ] FR-144-02: `src/components/features/posts/LocationSection.tsx` も同様に `react-leaflet` を dynamic 化。`LocationPicker` 配下の `Marker` / `useMapEvents` の扱いを `src/components/features/posts/LocationPicker.tsx:3` と整合させること。
- [ ] FR-144-03: `src/components/features/map/MiniMap.tsx` の `react-leaflet` を dynamic 化する。あるいは MiniMap 全体を `react-leaflet` の lazy 取得後のみマウントする形（`useEffect` + `useState` で `Map` を遅延設定）に書き換える。
- [ ] FR-144-04: `src/components/features/admin/ReviewCardMiniMap.tsx` について、bundle-analyzer で `react-leaflet` が現状 chunk に乗っているかを確認し、必要なら IntersectionObserver の `visible=true` 後に `await import('react-leaflet')` する形へ変更する。**実測結果を本 REQ の影響範囲に追記し、不要なら理由付きで NoOp とする**。
- [ ] FR-144-05: `src/lib/audio/fixWebmDuration.ts:5` を以下の形に変更：
  ```ts
  export async function patchWebmDuration(...) {
    if (!mime.startsWith('audio/webm')) return blob
    if (!Number.isFinite(durationMs) || durationMs <= 0) return blob
    try {
      const { default: fixWebmDuration } = await import('fix-webm-duration')
      return await fixWebmDuration(blob, durationMs, { logger: false })
    } catch {
      return blob
    }
  }
  ```
- [ ] FR-144-06: dynamic 化した地図ラッパー部分には適切な loading placeholder（高さを保つ skeleton）を出し、レイアウトシフトを起こさない。
- [ ] FR-144-07: `.size-limit.json` に以下のチャンク監視を追加：
  - `SurveyRequestForm chunk (gzip)`
  - `PostForm chunk (gzip)` または `LocationSection chunk (gzip)`
  - 上限値は実測ベースで `現状値 + 5%` 程度を初期閾値とする。
- [ ] FR-144-08: `npm run analyze` を再実行し、`react-leaflet` / `fix-webm-duration` を含む chunk が想定通り分割されているかを確認。レポートを本 REQ または別ドキュメントへ追記。

### 非機能要件
- [ ] NFR-144-01: 録音 → 保存 → プレビュー再生のフロー全体で、ユーザー体感が劣化しない（dynamic import の追加 RTT は数十 ms オーダー、許容）。
- [ ] NFR-144-02: 地図表示までのレイアウトシフト (CLS) を増やさない。loading skeleton で高さを確保する。
- [ ] NFR-144-03: TypeScript 型エラー / ESLint 警告ゼロ。
- [ ] NFR-144-04: 既存 vitest / Playwright が緑のまま。
