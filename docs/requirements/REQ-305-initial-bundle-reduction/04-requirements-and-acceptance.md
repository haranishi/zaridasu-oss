## 機能要件

- **FR-305-01**: まず `npm run analyze`（`ANALYZE=true next build`）でチャンク 9898 の内訳を確定し、問題Aの案①〜③それぞれの削減見込みを実測で出す。**この結果なしに②③を選定しない。**
- **FR-305-02**: `instrumentation-client.ts:24` の `tracesSampleRate: 0.1` を撤去する（案①）。あわせて不要になる `beforeSendTransaction` / `scrubTransaction` のクライアント側呼び出しを整理する（サーバー／エッジ側の適用は維持する＝REQ-211 の多層防御を壊さない）。
- **FR-305-03**: FR-305-01 の結果を踏まえ、案②（遅延初期化）と案③（/lp のみ Sentry 無効）の採否を決定し、決定と根拠（取りこぼしを許容する範囲）を本ファイルに追記する。**どちらも採らない判断も可**とするが、その場合は /lp の First Load JS 目標（AC-01）を満たす別手段を示す。
- **FR-305-04**: `src/hooks/useProfile.ts` を分割し、**zod 非依存のフック（`useProgress` / `useCollection` / `useRanking` / `useDiversity` / `useQuality` / `useBadgeDefinitions`）を zod 依存のない別ファイルへ移す**。`updateProfile` 内の `profileUpdateSchema` は `useSurveyRequests.ts:123` と同じ手法で `await import` に変更し、`schemas.ts` を同期グラフから外す。既存の import パスは互換 re-export で壊さないか、呼び出し側を一括更新する（**re-export で zod が再び静的に繋がらないよう注意**）。
- **FR-305-05**: `globals.css:4` の `@import 'leaflet/dist/leaflet.css'` を削除し、`MapView.tsx` 側の `import 'leaflet/dist/leaflet.css'` に移す（Next.js がコンポーネント CSS として dynamic チャンクに同梱する）。`globals.css:531-555` の Leaflet 上書きルール（ズームボタン 44px 化を含む）も同じ場所へ移す。`MiniMap` / `ReviewCardMiniMap` など MapView を経由しない Leaflet 利用箇所が Leaflet CSS を得られることを確認する（REQ-026 の「集約」意図を、グローバル固定ではなく**地図チャンクへの集約**に読み替える）。
- **FR-305-06**: `public/images/bullfrog.png` / `american.png` を 128×128 程度に再書き出しする（見た目の劣化がないことを最大表示 36×36 と Retina 2x で確認）。`og-image.png` / `og-image-lp.png` は変更しない。
- **FR-305-07**: ja 翻訳を namespace 分割する（`common` / `map` / `admin` / `collection` / `survey` を想定）。**最低限 `admin.*` を別 namespace へ切り出す**ことを必須とし、消費側は `useTranslation('ns')` でルート単位に絞る。`npm run i18n:check`（4言語パリティ）が通る形を保つこと（en/zh/ko 側の分割方針も同時に決める）。

## 受入基準

- **AC-01**: /lp の First Load JS が **185 kB 以下**（現状 **214.6 kB** から **-29.6 kB 以上**）。理論下限は Sentry を完全に外した場合の 165.6 kB（214.6 − 49.0）で、そこまで下げられれば望ましい。測定は `next build` の出力と `app-build-manifest.json` の合算の両方で確認する。
- **AC-02**: `ANALYZE=true npm run build` の内訳で、Sentry 由来モジュールの gzip 合計が **49.0 kB から減少している**ことを確認できる（減少幅は FR-305-03 の決定に従う。減少 0 は不可）。
- **AC-03**: `app-build-manifest.json` で **`/`・`/post/[id]`・`/collection`・`/trends`・`/ranking`・`/dashboard` の6ルートのエントリに zod チャンクが含まれない**（現 `5653-*.js`。ハッシュ変動に備え `ZodError` / `ZodObject` / `invalid_type` / `too_small` の grep で同定する）。各ルートの First Load JS が **約 -16.5 kB** 減少していること（例: / は 332.2 → **316 kB 以下**）。
- **AC-04**: ビルド後のグローバル CSS に `.leaflet-*` セレクタが **0 種**（現状 69 種）・文字列 `"leaflet"` が **0 回**（現状 241 回）。`.next/server/app/lp.html` と `about.html` が参照する CSS に Leaflet スタイルが含まれない。一方で **/（地図）・/post/[id]・/area/[municipality]・調査依頼フォーム・MapModal のいずれでも地図の表示崩れ（タイル位置・ポップアップ・ズームボタン 44px）が発生しない**。
- **AC-05**: `public/images/bullfrog.png` ＋ `american.png` の合計が **832 kB から 40 kB 以下**（**約 -800 kB**）。`public` 配下の合計が 844 kB → 約 50 kB 台。`og-image.png` / `og-image-lp.png` は 56 kB のまま変更されていない。
- **AC-06**: ja の初期チャンク（現 `4600-*.js` = **22.0 kB gzip** / 原本 79,783 B raw）が減少し、**非管理ルートの初期チャンクに `admin.*` の文言が含まれない**（チャンク内の grep で確認）。`npm run i18n:check` がパスする。
- **AC-07**: `npm run size`（`npx size-limit`）がパスする。現行の実測は home 9.32/10、/post/[id] 14.04/18、framework 54.39/60、crayfish3d 233.9/250 kB。**REQ-306 で追加された共有チャンク／ルート合算の予算も同時にパスする**こと。
- **AC-08**: Sentry のエラー送信が本番で維持されている（FR-305-03 で「取りこぼしを許容する」と決めた範囲を除く）。dev / preview では送信しないというガード（`instrumentation-client.ts:19` の `dsn && isProd`）が壊れていない。
- **AC-09**: `lint` / `type-check` / 既存 **652 テスト**がパスする。

## 対象外

- Supabase チャンク（6962 = 52.4 kB）と React 系（4bd1b696 = 53.2 kB）の削減。前者はアプリの中核依存、後者はフレームワーク下限のため本REQでは触らない。
- `unused-javascript` 系の網羅的な棚卸し。本REQは実測で特定できた5点に限定する。
- dead code（`PostList.tsx` / `PostCard.tsx` / `StatsBar.tsx` と `imageUtils.toThumbnailUrl` / `next.config.ts` の `render/image` remotePattern が未使用）の削除。監査で検出済みだが、`PostList.tsx` は REQ-308 の問題B（無限スクロール sentinel の唯一の実装）と絡むため、**REQ-308 の方針決定後に別途扱う**。
- 予算・CI ゲートの追加そのもの（**REQ-306**）。
