# REQ-195: エラー/成功メッセージのライブリージョン通知（ErrorAlert・成功領域・Toast）

## 背景
ザリダスでは動的に出現するエラー/成功メッセージが複数の画面・モーダルで使われるが、それらが支援技術（スクリーンリーダー）に通知されない実装になっている。REQ-158 では `PostForm` のエラーバナーに `role="alert"` を付与したが、その対象は PostForm 内のバナー要素に限られ、共通コンポーネント `ErrorAlert`（`src/components/ui/ErrorAlert.tsx`）自体や、その他の利用箇所（AuthModal のログイン失敗・ReportModal 等）はライブリージョン指定が無いまま残っている。

WCAG 2.1 の以下に関連する:
- **4.1.3 ステータスメッセージ（レベル AA）**: フォーカスを移動せずに発生するエラー/成功/状態メッセージは、`role="alert"` / `role="status"` / `aria-live` 等で支援技術へ通知される必要がある。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **共通コンポーネント `ErrorAlert` 自体にロール/ライブリージョンが無い**
   - `src/components/ui/ErrorAlert.tsx:14-25` — ルート `<div>` に `role` / `aria-live` が無い。視覚的には赤いバナーだが、出現しても読み上げられない。
   - 利用箇所はこの欠落をそのまま継承する:
     - `src/components/modals/AuthModal.tsx:400-402` — ログイン/サインアップ失敗時 `<ErrorAlert message={error} />`。通知されない。
     - `src/components/modals/ReportModal.tsx:131` — `<ErrorAlert message={error} />`。通知されない。

2. **AuthModal の成功メッセージにライブリージョンが無い**
   - `src/components/modals/AuthModal.tsx:429-434` — `{message && (<div className="bg-emerald-500/10 ...">...<p>{message}</p>...</div>)}`。メール送信完了などの成功通知だが `role="status"` / `aria-live` が無く、スクリーンリーダーに伝わらない。

3. **Toast コンテナが空のとき null を返し、初回トーストが読み上げられない**
   - `src/components/ui/Toast.tsx:54-55` — `ToastContainer` は `if (toasts.length === 0) return null`。ライブリージョン領域（57-63行の `<div aria-live="polite" role="status">`）が**トースト発生と同時に DOM へ挿入される**ため、多くの SR 実装では「最初から存在していたリージョンの中身が変化した」と認識されず、初回トーストが読み上げられない。
   - `src/hooks/useToast.ts:28-37` — `addToast` で `toasts` が空配列→1件へ変化する設計のため、上記と相まって初回挿入問題が起きる。
   - `src/components/ui/Toast.tsx:61` — コンテナは `role="status"` / `aria-live="polite"` 固定。`error` トーストも polite で通知されるため、緊急度の高いエラーが他の読み上げに割り込めず後回しになる（`assertive` が適切）。

## 目的
エラー/成功/トーストの各動的メッセージを、WCAG 4.1.3 に沿って支援技術へ確実に通知する。共通コンポーネント `ErrorAlert` にロールを内蔵して全使用箇所へ波及させ、成功メッセージ領域にステータスロールを付与し、Toast コンテナを常時マウントして初回読み上げ抜けを解消するとともに、エラートーストを `assertive` で通知する。

## 要件
### 機能要件
- [ ] FR-195-01: `ErrorAlert`（`ErrorAlert.tsx:14-25`）のルート要素に `role="alert"` を内蔵する（`role="alert"` は暗黙で `aria-live="assertive"` を伴うため二重指定は避ける）。これにより AuthModal・ReportModal を含む全使用箇所へ通知が波及する。
- [ ] FR-195-02: `ErrorAlert` をすでに `role="alert"` を持つ要素（例: REQ-158 で PostForm が独自に付与したバナー）の内側で使う箇所がある場合、`role` の二重ネストによる二重読み上げが起きないことを確認する。重複する場合は外側 or 内側のいずれかへロールを一本化する。
- [ ] FR-195-03: AuthModal の成功メッセージ領域（`AuthModal.tsx:429-434`）に `role="status"` と `aria-live="polite"` を付与する。
- [ ] FR-195-04: `ToastContainer`（`Toast.tsx:54-63`）を、`toasts.length === 0` でも**ライブリージョンのコンテナ要素は常時マウント**し、中身（トースト群）だけを出し入れする実装へ変更する（`return null` を廃止）。これにより初回トーストでもリージョンの内容変化として読み上げられる。
- [ ] FR-195-05: トーストを種別で分け、`error` トーストは `role="alert"` / `aria-live="assertive"` の別リージョンへ、`success`/`info` は `role="status"` / `aria-live="polite"` のリージョンへ振り分けて表示する（両リージョンとも常時マウント）。
- [ ] FR-195-06: 上記リージョンの `aria-label`（「通知」）および各閉じるボタンの `aria-label`（「閉じる」）の i18n 化は REQ-183 の対応範囲と連動させる。本要件では当該 `aria-label` をハードコード日本語のまま残さない方針を明記し、REQ-183 で定義される i18n キーを参照する（REQ-183 未完了時は暫定キーで先行可）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-195-01: ライブリージョンの過剰読み上げを避けるため、即時性が必要なエラーは `assertive`、成功/情報は `polite` を使い分ける（REQ-158 NFR-158-02 と同方針）。
- [ ] NFR-195-02: 常時マウント化したトーストの空リージョンが視覚レイアウト（クリック透過・レイアウトずれ）に影響しないことを保証する（空時は視覚的に不可視/サイズ 0）。

## 受入条件
- [ ] AC-01: `ErrorAlert` を `message` 付きでレンダリングすると、`role="alert"` を持つ要素が存在する（testing-library `getByRole('alert')`）。
- [ ] AC-02: AuthModal のログイン失敗で表示される `ErrorAlert` が `role="alert"` を持ち、二重の alert ネストが無いことを確認できる（testing-library）。
- [ ] AC-03: AuthModal の成功メッセージ表示時に `role="status"` を持つ要素が存在する（testing-library）。
- [ ] AC-04: トーストが 1 件も無い初期状態でも、ライブリージョンのコンテナ要素が DOM 上に存在する（`return null` していない）ことを確認できる。
- [ ] AC-05: `error` トーストを発火すると `role="alert"`（assertive）リージョンに、`success`/`info` トーストを発火すると `role="status"`（polite）リージョンにメッセージが入る（testing-library）。
- [ ] AC-06: 空リージョン常時マウント後も、トーストが無いときに画面操作（背後要素のクリック）を妨げない（クリック透過の確認）。

## 影響範囲
- 共通コンポーネント: `src/components/ui/ErrorAlert.tsx`、`src/components/ui/Toast.tsx`
- フック: `src/hooks/useToast.ts`（種別ごとの振り分けに合わせた最小調整があれば）
- 利用箇所（波及確認）: `src/components/modals/AuthModal.tsx`、`src/components/modals/ReportModal.tsx`、`src/components/features/posts/PostForm.tsx`（REQ-158 で付与した role との重複確認）、その他 `ErrorAlert` 利用箇所全般
- REQ-158（PostForm の role 付与）と整合、REQ-183（aria-label の i18n）と連動
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`（aria-label の i18n は REQ-183 連動）
- 関連テスト: ErrorAlert / Toast / AuthModal のアクセシビリティテスト

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: WCAG 4.1.3（AA）に直結し、スクリーンリーダー利用者がエラー/成功/状態の発生に気づけない実害がある。特に初回トーストの読み上げ抜けは通知機構の根幹に関わる。共通コンポーネントへの 1 箇所修正で広く波及でき費用対効果が高い。データ自体への影響は無いため致命ではなく中程度とする。
