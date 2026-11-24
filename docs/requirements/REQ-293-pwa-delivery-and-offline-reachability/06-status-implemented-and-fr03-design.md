## 実施状況（2026-07-30）

### 実装済み

| FR | 内容 | 主な変更 |
|---|---|---|
| FR-293-01 | manifest リンク先を App Router の生成パスへ | `src/app/layout.tsx`（`/manifest.json` → `/manifest.webmanifest`） |
| FR-293-02 | ナビゲーション catch を無条件フォールバック化（`isNetworkError()` 撤去） | `public/sw.js.tpl`（WebKit の `Load failed` 等、文言に依存しない） |
| FR-293-03 | ナビゲーションの stale-while-revalidate ＋ **install 時の app shell ウォーム** | `public/sw.js.tpl` |
| FR-293-04 | キャッシュ2本分離（precache=バージョン付き / `zaridasu-assets`=バージョン非依存・200件上限） | `public/sw.js.tpl`・`scripts/build-sw.mjs` |
| FR-293-05 | 入力中（dirty）なら更新時の自動リロードを抑止。REQ-267 の `hadController` 判定は維持 | `src/app/providers.tsx`（`hasUnsavedFormInput()`） |
| FR-293-06 | オフライン画面の4言語化（方式A）＋ `<html lang>` の動的差し替え | `public/offline.html` |
| FR-293-07（一部） | `PendingPost.sendingStartedAt` 追加・5分経過で `'pending'` へ自動復帰（`sendAll` 実行中は巻き戻さない） | `src/lib/offlineStore.ts`・`src/hooks/useOfflineQueue.ts`（`SENDING_STALE_AFTER_MS` / `isStaleSending()`） |
| FR-293-08（一部） | manifest 配信の E2E（AC-01 / AC-02） | `tests/e2e/pwa-delivery.spec.ts`（`/manifest.webmanifest` の 200 と必須項目、配信HTMLの `<link rel="manifest">` のリンク先突合） |

#### FR-293-03 の設計（install 時ウォームを併用した理由）

ナビゲーション HTML は **バージョン付き precache** に入る。したがって stale-while-revalidate だけでは
**デプロイのたびに activate のパージで `/` と `/dashboard` のキャッシュ HTML が消え、オフラインの
コールドスタートが再び失敗する**（FR-293-03 の狙い＝圏外の水辺でアプリを起動して下書きを書く、が
デプロイ直後には満たされない）。そこで `install` で app shell をウォームし、新しい SW が activate した
直後から「そのデプロイ自身のチャンクと整合した HTML」がオフラインで使える状態にした。

- **バージョン非依存キャッシュに HTML を置く案は採らない**: 古い HTML が purge 済みのチャンクを参照して
  白画面になるリスクがあるため。HTML とチャンクの世代は必ず揃える。
- **`cache.addAll` は使わない**: 1 件でも失敗すると install 全体が失敗する。個別 fetch ＋ catch ＋
  全体のソフトタイムアウト（20 秒・超過しても install は成功）で、ウォームの失敗が install を壊さない。
- **HTML が参照する `/_next/static/` も併せてウォームする**: `/` の本体は client component のため、
  HTML だけあってもチャンクが無ければオフライン起動は白画面になる。ウォームした HTML から
  `js` / `css` / `woff2` を抽出し（上限 60 件）`zaridasu-assets` へ入れる。個別失敗は無視する。
- **`cache: 'reload'`** で HTTP キャッシュを迂回し、そのデプロイの HTML を確実に取得する。
- **`/dashboard` は best-effort**: middleware が未認証を `/` へ 302 するため、未ログイン時は
  `response.redirected` のガードで弾かれ**キャッシュされない**（＝リダイレクト結果を `/dashboard` として
  保存する事故が起きない）。ログイン中に新しい SW が install されたときだけウォームされる。
  `/dashboard` は「復帰後に下書きを送る」画面でオンライン前提なので、この非対称は許容する。
  キャッシュされる HTML はハイドレーション前のシェルでユーザー固有データを含まない
  （→「要確認: `/dashboard` のHTMLキャッシュとプライバシー」への回答）。
- ウォーム側と fetch ハンドラ側でキャッシュキー生成を `navigationCacheKey()` に一本化した
  （Cache API の照合は URL ＋ 保存レスポンスの `Vary` で行うため、キー構成が揃っていないと
  「書いたのに引けない」取りこぼしが起きる）。
- 回帰テスト: `scripts/__tests__/build-sw.test.ts`（生成 `public/sw.js` を Cache Storage / fetch の
  フェイクで実際に評価し、**オフラインのコールドスタートでウォーム済み HTML が返る**ことまで検証）。
