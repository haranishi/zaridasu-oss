## 背景

### 問題A: 支援技術向け文言の日本語ハードコード 17 箇所 — Medium

言語を en/ko/zh に切り替えても、以下は日本語のまま支援技術へ渡る。**これらは支援技術に渡る唯一の情報源**（アイコンのみのボタン名、写真ビューア、地図の読み込み状態、パンくず）であり、代替の可視テキストが存在しないため、読めなければ機能そのものが使えない。

| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/ui/PhotoViewer.tsx` | 61 | `sr-only`「写真ビューア」（`aria-labelledby="photo-viewer-title"` の参照先） |
| `src/components/ui/PhotoViewer.tsx` | 74 | `aria-label="閉じる"` |
| `src/components/ui/PhotoViewer.tsx` | 83 | `alt={`写真 ${current + 1}`}` |
| `src/components/ui/PhotoViewer.tsx` | 100 | `aria-label="前の写真"` |
| `src/components/ui/PhotoViewer.tsx` | 108 | `aria-label="次の写真"` |
| `src/components/modals/MapModal.tsx` | 67 | `aria-label="位置確認マップ"`（ダイアログ名） |
| `src/components/modals/MapModal.tsx` | 68 | `aria-label="閉じる"`（背景クローズボタン） |
| `src/components/modals/MapModal.tsx` | 72 | `aria-label="閉じる"` |
| `src/components/ui/Breadcrumb.tsx` | 20 | `aria-label="パンくず"` |
| `src/app/species/[species]/page.tsx` | 101 | `aria-label="パンくず"` |
| `src/components/features/posts/LocationSection.tsx` | 14 | `aria-label="地図を読み込み中"` |
| `src/components/features/map/MapViewWrapper.tsx` | 8 | `aria-label="地図を読み込み中"` |
| `src/components/features/map/MiniMap.tsx` | 9 | `aria-label="地図を読み込み中"` |
| `src/components/features/posts/AudioRecorder.tsx` | 375 | `aria-label="音声の入力方法"` |
| `src/views/SurveyRequestsListPage.tsx` | 252 | `aria-label="調査依頼を立てる"` |
| `src/components/modals/EditDialog.tsx` | 107 | `sr-only`「投稿の種類・情報種別・写真などを編集できます」（`aria-describedby` の参照先） |
| `src/app/dataset/page.tsx` | 122 | `aria-label="ホームに戻る"` |

補足: `src/components/modals/DeleteDialog.tsx:46,49`（`aria-label="キャンセル"` / `"削除する"`）も同種だが、**可視テキストとの不一致（WCAG 2.5.3 Label in Name）という別の問題を併発している**ため REQ-302 FR-302-10 で扱う。上の 17 箇所には含めない。

#### 網羅の補足（本要件作成時の再走査で確認）

監査の 17 箇所は**利用者向け画面**に絞ったリストである。`aria-label` / `alt` の日本語リテラルを機械走査すると、以下も残存している。

- **管理画面側（内部向けのため優先度は最低）**: `src/components/features/admin/ReviewCard.tsx:61,80,100,186,193,200` / `src/components/modals/RejectDialog.tsx:76,82` / `src/views/admin/AdminLayout.tsx:258` / `src/views/admin/AdminAiCostPage.tsx:141` / `src/views/admin/AdminPostsPage.tsx:374,455` / `src/views/admin/AdminReportsPage.tsx:240`
- **監査リストから漏れていた利用者向けの `alt`**: `src/components/ui/PhotoViewer.tsx:132`（サムネイルの `alt={`写真 ${i + 1}`}`）／`src/components/modals/EditDialog.tsx:166,180`（`alt={`写真${i+1}`}` / `alt={`新規${i+1}`}`）
- **参考（可視テキストのハードコードなので REQ-277 側の網羅漏れ候補）**: `src/components/features/posts/LocationSection.tsx:194,195,202`（「オフラインのため自動取得できません。手動で選択してください。」「市区町村の自動取得に失敗しました。手動で選択してください。」「再試行」）

対応時は上のリストを起点に**着手時点で再走査して件数を確定させる**こと（17 という数字を固定値として扱わない）。

### 問題B: SSR 段階の `<html lang>` が常に "ja" — Low

- `src/app/layout.tsx:77` は `<html lang="ja" ...>` を固定出力する。クライアント側の上書きは `src/lib/i18n.ts:113`（`languageChanged` イベント）と `:119`（初期言語の反映）で**ハイドレーション後に初めて走る**。
- したがって `localStorage` に `en` / `ko` / `zh` を持つ利用者でも、**初回描画は `lang="ja"`** である。加えて次の2ケースでは最後まで `ja` のままになる。
  1. JavaScript 無効環境。
  2. Googlebot が初期 HTML を評価する段階。
- ハイドレーション前に読み上げを開始したスクリーンリーダーは、**誤った言語の音声エンジンで発話する**。WCAG 3.1.1（ページの言語、レベル A）。

### 問題C: 全画面共通バナーが t() を通らず、さらに ⚠️ が二重表示される — Medium

- `src/app/providers.tsx:101` は `setPendingNotice(`未送信の下書きが${count}件あります。マイページから送信できます。`)` と**日本語を直書き**している。これは全画面共通のグローバルバナーで、オフラインから復帰したときに未送信下書きがあれば必ず出る。
  - **ほぼ同一内容のキーが既に4言語存在する**: `dashboard.canSendNow`（ja `:1246` / en・ko・zh 各 `:1091`。例: en = "You're back online. You can now send your unsent drafts."）。翻訳資産があるのに使われていない。
  - `src/app/providers.tsx` は **REQ-277 の Phase 1 コミットにも Phase 2 の対象表にも含まれていない**。つまり最も広い範囲に出るグローバルバナーが両フェーズの網から漏れている。
- 同じファイルの `:119-123` はオフラインバナーとして `<span aria-hidden="true">⚠️</span>`（`:121`）＋ `<span>{t('app.offline')}</span>`（`:122`）を描画するが、**`app.offline` の値自体が4言語すべて `⚠️` で始まる**。
  - ja: `⚠️ オフラインです。一部の機能が利用できません。`
  - en: `⚠️ You are offline. Some features may not be available.`
  - ko: `⚠️ 오프라인 상태입니다. 일부 기능을 사용할 수 없습니다.`
  - zh: `⚠️ 当前处于离线状态。部分功能不可用。`
  - 結果として実際の描画は「⚠️ ⚠️ オフラインです。…」となる。JSX 側の `aria-hidden` は片方にしか効かないため、**支援技術には残る1つの警告記号が本文として読み上げられる**。

### 問題D: `public/` 配下が REQ-277 の対象表から漏れている — Low（実装は REQ-293 と分担）

- Service Worker のオフラインフォールバックは `public/sw.js.tpl:61` で `caches.match('/offline.html')` に固定されており、`public/offline.html` は `:2` が `<html lang="ja">`、`:6` が `<title>オフラインです</title>`、`:57` が `<h1>現在オフラインです</h1>` と**日本語のみ**。英語 UI の利用者にも日本語だけが表示される。
- i18n 済みの `src/views/OfflinePage.tsx` ＋ `src/app/offline/page.tsx`（4言語対応）は**存在するが SW からは使われていない**。
- 本要件では **「REQ-277 の Phase 1/2 対象表が `src/` のみを走査対象としており、`public/` 配下の静的 HTML が網羅から漏れている」という網羅漏れの観点で 1 問題として記録する**にとどめる。**SW のキャッシュ／フォールバック配線そのものの変更は REQ-293 の担当**であり、本要件では実装しない（二重実装・競合を避ける）。
