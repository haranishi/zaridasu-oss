# REQ-036: error.tsx の i18n 対応とエラーメッセージ非表示化

## 背景
本アプリの UI は日本語をデフォルトとし、多言語対応（ja / zh / ko）が進んでいる。一方でグローバルエラーバウンダリである `src/app/error.tsx` のみ英語固定文言（"Something went wrong" / "Retry" / "Back to Home"）が残っており、日本語 UI の中で浮いている。また `error.message` をそのまま DOM に出しているため、内部的なスタック・ライブラリ由来のメッセージ・実装詳細がエンドユーザーに露出する可能性がある。

## 現状の問題
- `src/app/error.tsx:72-98` エラー UI 全体が英語ハードコード、かつ `error.message` をそのまま表示している。

  ```tsx
  <h1 className="mt-6 text-2xl font-bold text-gray-800">
    Something went wrong
  </h1>

  <p className="mt-2 max-w-md text-gray-600">
    {error.message || 'An unexpected error occurred. Please try again.'}
  </p>

  {error.digest && (
    <p className="mt-1 text-xs text-gray-400">Error ID: {error.digest}</p>
  )}

  <div className="mt-8 flex gap-4">
    <button
      onClick={handleRetry}
      ...
    >
      Retry
    </button>

    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error boundary needs full page reload */}
    <a
      href="/"
      ...
    >
      Back to Home
    </a>
  </div>
  ```

- `error.message` は Next.js 側で本番ビルドでも Client Components からのエラーが素通しになりうるため、情報露出リスクと UX 劣化を同時に抱えている。

## 目的
- エラーバウンダリの UI を日本語（または i18n key）に統一し、他ページと一貫したトーンにする。
- `error.message` の DOM 出力を止め、ユーザーには「何か問題が発生しました」という抽象メッセージと `digest`（識別子）のみを提示することで、内部情報の露出を防ぐ。

## 要件

### 機能要件
- [ ] FR-036-01: タイトル／説明／ボタン文言を日本語に置き換える。既存の i18n 仕組みが RSC 外の client error boundary で使えない場合は `lang="ja"` に合わせ日本語直書きで良い。
  - タイトル例: 「エラーが発生しました」
  - 説明例: 「一時的な問題が発生しました。ページを再読み込みしてください。」
  - ボタン例: 「再試行」「トップへ戻る」
- [ ] FR-036-02: `error.message` を UI に表示しない（レンダリングツリーから削除）。
- [ ] FR-036-03: `error.digest` が存在する場合のみ「エラー ID: {digest}」を小さく表示する（サポート問い合わせ用）。
- [ ] FR-036-04: `useEffect` 内で `console.error(error)`（または既存の `logError`）は継続して呼び、開発者が詳細を追える状態を保つ。
- [ ] FR-036-05: 既存の chunk load エラー自動リロード挙動（`hardReloadWithCacheReset` / `sessionStorage` キー `chunk-reload-attempted`）は維持する。

### 非機能要件
- [ ] NFR-036-01: 文字列定数を将来 i18n 化しやすいよう、同一ファイル上部のオブジェクトに集約する（例: `const MESSAGES = { title: '...', description: '...' } as const`）。

## 受入条件
- [ ] AC-01: 任意のページで意図的に throw して誘発したエラーページに、日本語のタイトル・説明・2 ボタンが表示される。
- [ ] AC-02: DOM（開発者ツール Elements）に `error.message` の文字列が含まれていない。
- [ ] AC-03: `error.digest` が付与されたケースで「エラー ID: {digest}」が表示される。digest がない場合は表示されない。
- [ ] AC-04: Chunk load エラー（ディスク上の JS ハッシュ不一致）では従来通り 1 回自動リロードが走り、2 回目はリロードループに陥らない。
- [ ] AC-05: `console.error` にはエラーオブジェクトが出力される（開発環境で確認）。

## 影響範囲
- 変更対象ファイル
  - `src/app/error.tsx`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 生の `error.message` 露出による情報漏えいリスクと、英語固定文言による UX・ブランド毀損の両面を抱えるため。

