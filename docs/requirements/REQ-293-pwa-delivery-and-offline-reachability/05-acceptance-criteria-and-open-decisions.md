## 受入基準

- **AC-01**: `GET /manifest.webmanifest` が **200** を返し、ボディに `name` / `short_name` / `display: 'standalone'` / `start_url` / `icons`（192・512・maskable を含む）/ `shortcuts` が含まれる。この検証がE2Eに存在し、`npm run test:e2e` で実行される。
- **AC-02**: 配信された HTML の `<link rel="manifest">` の `href` を実際に取得すると 200 が返る（404 でない）。E2Eで固定化されている。
- **AC-03**: Chrome DevTools の Application → Manifest でエラーが出ず、インストール可能（A2HS が提示される）。iOS Safari で「ホーム画面に追加」後、standalone で起動する。
- **AC-04**: iOS Safari（または WebKit エンジンの Playwright プロジェクト）でオフラインにしてナビゲートすると、`Service Unavailable` ではなく**オフライン画面が表示される**。同条件で Chromium でも表示される。
- **AC-05**: 一度 `/` を訪問した後にネットワークを遮断し、**タブを閉じて再度アプリを開く（コールドスタート）**と投稿フォームに到達でき、写真とコメントを入力して「下書きに保存」（`postForm.draftSaved`）まで完了する。その後オンラインに復帰し `/dashboard` から送信できる。この一連がE2Eで検証されている。
- **AC-06**: 文言のみを変更したコミットをデプロイした後、`/_next/static/` と `/images/` のキャッシュエントリが**保持されている**（Cache Storage を確認）。precache 側のみが新バージョン名に切り替わり、旧 precache が削除されている。
- **AC-07**: 投稿フォームに写真とコメントを入力した状態で新しいSWが有効化されても、入力内容が失われない（自動リロードされない、または明示操作まで保留される）。初回インストール時に無条件リロードが起きない（REQ-267 の退行が無い）。
- **AC-08**: 言語を en / ko / zh に切り替えた状態でオフライン画面を表示すると、当該言語の文言が表示され、ドキュメントの `lang` 属性が当該言語になっている。
- **AC-09**: `'sending'` 状態の下書きを人為的に作り（送信中にプロセスを終了する、または IndexedDB を直接編集する）、アプリを再読み込みすると、5分経過後の再読み込みで当該下書きが再送可能になる（`sendAll` の対象に戻る、または「送信を再開」ボタンから送信できる）。削除以外の脱出路が存在する。
- **AC-10**: 追加した i18n キー（「送信を再開」等）が **ja/en/ko/zh 4言語すべてに存在**し、`npm run i18n:check` がパスする。
- **AC-11**: `lint` / `type-check` / 既存652テストがパスする。SWの変更に対するユニットテスト（キャッシュ名の分離・stale復帰の判定関数）が追加されている。

## 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | app shell の実現方式 | A. ナビゲーションの stale-while-revalidate（動的キャッシュ） / B. install 時の app shell precache | **A ＋ B の併用**（下記「実施状況」参照。A だけではデプロイ直後にキャッシュが空になるため B で補う） |
| 2 | オフライン画面の多言語化方式 | A. `public/offline.html` に4言語埋め込み＋`navigator.language` / B. `/offline`（i18n済み）のプリキャッシュへ切替 | **A**（B は `/offline` のレンダリングに必要なチャンクの precache が前提になり、失敗時に何も出せなくなる。二重管理である旨をファイル冒頭にコメントで明示） |
| 3 | 既存 `'sending'` レコードの扱い | A. `createdAt` を代替に stale 判定 / B. 初回起動時に一律 `'pending'` へ戻す | **B 相当**（`isStaleSending()` は `sendingStartedAt` 未設定を無条件 stale と判定＝初回の `refresh()` で一律 `'pending'` へ戻る。`createdAt` 流用による「昨日の下書きを今送信開始した」誤判定を避ける） |
| 4 | Lighthouse の `installable-manifest` の重み | A. `error`（決定論的なので厳格） / B. `warn` | **未定**（FR-293-08 が未実装のため。次の波で決める） |
| 5 | 不変アセットキャッシュの上限 | A. エントリ数上限（例200） / B. 上限なし（ブラウザの eviction に委ねる） | **A（200件・挿入順で削除する簡易LRU）** |

---
