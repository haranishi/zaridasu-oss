## 受入条件

- [ ] AC-01: `src/lib/analytics.ts` に `trackEvent` が存在し、SSR/production ガードと `dataLayer` 初期化を内包する。`window.dataLayer` 型宣言が `src/types/gtm.d.ts` に一本化され、`WebVitalsReporter.tsx` の重複宣言が無い。
- [ ] AC-02: 投稿フローで `post_start`→`post_media_attached`→`post_submit`→`post_success`（または `post_fail`）が、それぞれ FR-232-02 記載の箇所で発火する（GA4 DebugView もしくは単体テストで `trackEvent`/`dataLayer.push` の呼び出しを確認）。`post_save_offline` がオフライン保存時に発火する。
- [ ] AC-03: `like`・`comment_post`・`report_submit`・`ai_identify_view` が FR-232-03 の箇所で発火し、パラメータに自由記述・PII・生 confidence（バケット化前の値を送らない方針なら）が含まれない。
- [ ] AC-04: `map_interact`・`gallery_view`・`search` が発火し、`map_interact`/`gallery_view` はデバウンス/間引きにより連続発火が抑制される。パラメータに座標/bounds の生値が無い。
- [ ] AC-05: `survey_request_start`・`survey_request_submit` が発火し、`survey_request_submit` のパラメータに `reason`（自由記述）・座標が含まれない。
- [ ] AC-06: 既存の `login`/`sign_up`/`sign_up_initiated`/`lp_*`/`web_vital` の名前・パラメータ・発火条件が不変である（差分レビュー or テストで確認、REQ-033 の created_at 判別が保持）。
- [ ] AC-07: 本 REQ に「計測仕様書（tracking plan）」表が存在し、全イベントのイベント名/発火箇所/パラメータ/PII 有無/キーイベント指定/カウント方法/カスタムディメンション要否が埋まっている。
- [ ] AC-08: `post_success`・`survey_request_submit`・`sign_up` のキーイベント化手順と、レポート用カスタムパラメータのカスタムディメンション登録手順が runbook/チェックリスト化されている。
- [ ] AC-09: `npm run build`・`tsc --noEmit`・lint が成功し、`page_view` を手動送出するコードが追加されていない（二重計上ガード）。
