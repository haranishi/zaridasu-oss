# REQ-197: 未送信下書きの「すべて送信」ボタンのオンライン状態リアクティブ化

## 背景
ザリダスはオフライン投稿をサポートしており、回線が無いときに作成した投稿は IndexedDB のキューに保存され、マイページ（ダッシュボード）の「未送信の下書き」セクション（`PendingPostsSection`）から手動で一括送信できる。送信ボタンの活性状態とラベルはオンライン/オフラインで切り替わる設計だが、`PendingPostsSection` はオンライン状態をレンダー時に `navigator.onLine` で直接読むだけで、`online`/`offline` イベントを購読していない。

そのため、オフラインでマイページを開いたまま回線が復帰しても、何らかの理由で再レンダーが起きるまでボタンは「オフライン」表示・送信不可のまま据え置かれる。逆に、オンラインで開いた後に切断された場合もボタンは活性のままになり、状態と実態が乖離する。

同じ機能領域でも `PostForm`（`src/components/features/posts/PostForm.tsx`）は `online`/`offline` イベントを購読してオフライン state を更新しており、実装が不統一である。さらに、回線復帰時の自動送信が無く、キューの送信はこの画面の手動操作にのみ依存している。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **「すべて送信」ボタンが `navigator.onLine` の render 時直読みで、イベント購読が無い**
   - `src/components/features/dashboard/PendingPostsSection.tsx:32` — `disabled={sending || !navigator.onLine}`。`navigator.onLine` をレンダー時に評価するだけ。
   - `src/components/features/dashboard/PendingPostsSection.tsx:36` — `{sending ? ... : navigator.onLine ? t('dashboard.sendAll') : t('dashboard.offlineLabel')}`。同上。
   - このコンポーネントには `online`/`offline` の `addEventListener` が無いため、回線状態が変化しても再レンダーが誘発されず、ボタンの `disabled`/ラベルが更新されない。

2. **実装が PostForm と不統一**
   - `src/components/features/posts/PostForm.tsx:101` — `const [isOffline, setIsOffline] = useState(!navigator.onLine)`。
   - `src/components/features/posts/PostForm.tsx:117-123` — `online`/`offline` イベントを購読して `setIsOffline` を更新。PostForm は状態化されているが PendingPostsSection はされていない。
   - `src/app/providers.tsx:31` でも `setIsOffline(!navigator.onLine)` を独自に実装しており、オンライン判定ロジックがアプリ内に重複している（共通フック不在）。

3. **回線復帰時の自動送信が無い**
   - 現状、キューの送信は `PendingPostsSection.tsx:31` の `onClick={sendAll}` 手動操作のみ。オフライン中に作成した下書きは、ユーザーが復帰後に自らこの画面を開いてボタンを押すまで送信されない。

## 目的
オンライン/オフライン状態を `online`/`offline` イベント（または `useSyncExternalStore`）で購読する共通フック `useOnlineStatus` を新設し、`PendingPostsSection` の送信ボタンを回線状態にリアクティブにする。`PostForm` も同フックへ寄せて重複実装を解消する。あわせて、回線復帰時のキュー送信の扱い（自動送信 or 復帰通知）を定義し実装する。

## 要件
### 機能要件
- [ ] FR-197-01: オンライン状態を返す共通フック `useOnlineStatus`（例 `src/hooks/useOnlineStatus.ts`）を新設する。`useSyncExternalStore` で `navigator.onLine` を購読し（`online`/`offline` イベントを subscribe）、`isOnline: boolean` を返す。SSR/jsdom で `navigator` 未定義でも安全な初期値を返す（`getServerSnapshot`）。
- [ ] FR-197-02: `PendingPostsSection.tsx` で `useOnlineStatus` を使い、ボタンの `disabled`（32行）とラベル（36行）を `isOnline` に基づいて切り替える。`navigator.onLine` の render 時直読みを廃止する。
- [ ] FR-197-03: `PostForm.tsx` の独自オフライン購読（101行の state、117-123行のイベント購読）を `useOnlineStatus` に置き換え、重複実装を解消する。`providers.tsx:31` も可能なら同フックへ寄せる（最小限、挙動を変えない範囲で）。
- [ ] FR-197-04: 回線復帰時のキュー送信ポリシーを次の判断基準で決定し、いずれかを実装する:
  - (a) **自動送信**: 復帰検知時にキューが空でなく、かつ「送信中でない」場合に `sendAll` 相当を自動実行する。重複送信防止（送信中フラグ・冪等性）と、ユーザーが明示削除した下書きを再送しないことを保証できる場合に採用。
  - (b) **復帰通知**: 自動送信の安全性が担保できない場合、復帰時に「送信できます」トースト（`ToastContext`）を表示し、ユーザーに手動送信を促す。
  - 採用根拠（重複送信リスク・ユーザーの意図しない送信の回避）を実装コメントまたは本要件への追記で明示する。
- [ ] FR-197-05: 自動送信/復帰通知で新たに表示する文言（例 `dashboard.canSendNow`）は ja/en/ko/zh の 4 ロケール i18n キーで定義する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-197-01: `useOnlineStatus` は `useSyncExternalStore` を用いることで、複数コンポーネントから購読しても tearing（不整合）を起こさず、リスナーを購読側でリークさせない。
- [ ] NFR-197-02: オンライン判定ロジックの一元化により、`navigator.onLine` 直読み箇所（少なくとも PendingPostsSection・PostForm・providers）の重複を削減する（DRY）。

## 受入条件
- [ ] AC-01: jsdom で `useOnlineStatus` をマウントし、`window.dispatchEvent(new Event('offline'))` で `isOnline` が `false`、`new Event('online')` で `true` に変わる（フックのユニットテスト）。
- [ ] AC-02: `PendingPostsSection` を下書きあり状態でレンダーし、`offline` イベント発火でボタンが `disabled` かつオフラインラベルに、`online` イベント発火で活性かつ送信ラベルに変わる（testing-library / jsdom）。
- [ ] AC-03: `online` イベント発火時に、選択したポリシーに応じて (a) `sendAll` 相当が呼ばれる、または (b) 「送信できます」トーストが表示される（ユニットテスト）。
- [ ] AC-04: 自動送信を採用する場合、送信中（`sending=true`）に `online` イベントが再発火しても二重に送信が開始されない（重複送信防止のテスト）。
- [ ] AC-05: 追加した i18n キーが ja/en/ko/zh の 4 ファイルに存在する。
- [ ] AC-06: `PostForm` のオフライン表示が `useOnlineStatus` 経由でも従来どおり機能する（回帰テスト）。

## 影響範囲
- 新規: `src/hooks/useOnlineStatus.ts`
- 改修: `src/components/features/dashboard/PendingPostsSection.tsx`、`src/components/features/posts/PostForm.tsx`、`src/app/providers.tsx`（最小）
- 連携: `src/hooks/useOfflineQueue.ts`（`sendAll` の自動呼び出しを採用する場合）、`src/context/ToastContext.tsx`（復帰通知を採用する場合）
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`
- 関連テスト: useOnlineStatus / PendingPostsSection のユニットテスト

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: オフライン投稿はモバイル屋外利用（市民科学の現場）で重要な機能であり、回線復帰してもボタンが「オフライン」のままだと収集済みデータが送信されず失われ得る。ただしリロードで回復可能で、データ自体は端末に保持されるため致命ではない。共通フック化で他の navigator.onLine 直読み箇所の品質も底上げできるため優先する。
