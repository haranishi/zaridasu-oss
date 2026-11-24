# REQ-189: SurveyRequestForm のモーダル a11y 改修（改修群からの対象漏れ）

## 背景
ザリダスのモーダル群は、REQ-151（label/input 関連付け）・REQ-158（エラー表示統一）・REQ-160（focus trap 共通化）・REQ-163（aria-labelledby とボタン統一）で順次アクセシビリティ改修されてきた。しかし `src/components/modals/SurveyRequestForm.tsx`（調査依頼の作成モーダル）は、これら改修群の対象一覧から漏れており、他モーダルでは解消済みの問題が広範に残存している。

参照すべき既存の正しいパターン:
- `src/components/modals/AuthModal.tsx` / `src/components/features/posts/PostForm.tsx`: `useFocusTrap` + `useEscapeKey` + `aria-labelledby`（見出し `id` 接続）+ 初期フォーカス管理。
- `src/components/features/posts/PostForm.tsx:326`: 種選択ボタンに `aria-pressed={species === s.value}` を付与済み。
- PostForm のエラー方式: 送信ボタンを `disabled` にせず、押下時にバリデーションしてエラーバナー（REQ-158）を表示する（「押せるが、押すと理由が出る」方式）。

WCAG 2.1 の関連:
- **2.1.2 キーボードトラップなし / 2.4.3 フォーカス順序（レベル A）**: モーダルはフォーカスを内部に保持し、背景へ抜けないこと。
- **4.1.2 名前・役割・値（レベル A）**: ダイアログ名・ボタン名・選択状態を提供。
- **1.3.1 情報及び関係性（レベル A）**: label と入力の関連付け、グループ化。
- **4.1.3 ステータスメッセージ（レベル AA）**: エラーを `role="alert"` / `aria-live` で通知。
- **1.4.3 コントラスト（最低）（レベル AA）**: エラーテキストの可読性。

## 現状の問題
`src/components/modals/SurveyRequestForm.tsx` にて:

1. **ダイアログ名の欠落**: ルート `<div role="dialog" aria-modal="true" ...>`（86〜87行）に `aria-labelledby` がない。見出し `<h2>`（95〜98行）にも `id` がない。→ ダイアログに accessible name がない。
2. **focus trap / Escape / 初期フォーカスの欠落**: `useFocusTrap` / `useEscapeKey` を未使用。Escape はオーバーレイ要素の `onKeyDown`（90行）頼みで、モーダルを開いた直後（オーバーレイにフォーカスが無い状態）では効かない。`Tab` がモーダル外（背景の地図・ヘッダー）へ抜ける。開いた際の初期フォーカス移動もない。
3. **label と入力の未関連付け**: 調査理由 `<textarea>`（153〜161行）に `id` がなく、対応する `<label>`（150〜152行）に `htmlFor` がない。
4. **対象種ボタン群のグループ化・状態欠落**: 対象種ボタン群（126〜145行、`<div className="flex gap-2">` 内の各 `<button>`）に `role="group"` + `aria-labelledby`（「対象の種類」見出し参照）がなく、各ボタンに選択状態を表す `aria-pressed` がない（PostForm.tsx:326 にはある）。
5. **エラー表示の非通知・低コントラスト**: エラー表示（193〜196行）に `role="alert"` / `aria-live` がない。`text-red-400` がダーク分岐なしで、ライトモードの淡い背景（`bg-red-500/10`）上で約 2.6:1 となり WCAG AA（4.5:1）未達。
6. **閉じるボタンの名前欠落**: 閉じるボタン（99〜101行、`X` アイコン）に `aria-label` がない。
7. **到達不能なバリデーション文言 / 押せないボタン問題**: 送信ボタンが `disabled={loading || !position || !reason.trim()}`（200〜203行）のため、`handleSubmit` 内の `setError(t('survey.errors.noPosition'))` / `setError(t('survey.errors.noReason'))`（55〜56行）に**到達できない**。位置未選択のユーザーには「押せないボタン」だけが見え、なぜ押せないか・何をすべきかの説明が一切ない（PostForm は送信可能にしてエラーバナーを出す方式で、本フォームは方針が逆）。

## 目的
SurveyRequestForm を他モーダル（AuthModal / PostForm）と同一の a11y 構成（`useFocusTrap` + `useEscapeKey` + `aria-labelledby` + 初期フォーカス）へ統一する。label 関連付け・グループ化・選択状態・エラー通知・コントラスト・閉じるボタン名を是正し、送信不能時のユーザー説明を提供する。WCAG レベル A/AA を満たす。

## 要件
### 機能要件
- [ ] FR-189-01: 見出し `<h2>`（95行）に一意な `id`（例: `survey-form-title`）を付与し、ルート `<div role="dialog">`（86行）に `aria-labelledby="survey-form-title"` を付与して接続する。
- [ ] FR-189-02: `useFocusTrap`（`src/hooks/useFocusTrap.ts`）と `useEscapeKey`（`src/hooks/useEscapeKey.ts`）を導入し、モーダルパネル `<div>`（92行）に `ref` を付ける。これによりフォーカスをモーダル内に保持し、`Escape` で `onClose` を呼ぶ。あわせて旧来のオーバーレイ `onKeyDown={(e)=>e.key==='Escape'...}`（90行）は二重実装にならないよう整理する（`useEscapeKey` に一本化）。
- [ ] FR-189-03: モーダルを開いた際、内部の最初の操作要素（または閉じるボタン/見出し）へ初期フォーカスを移動する（他モーダルの初期フォーカス挙動に合わせる）。
- [ ] FR-189-04: 調査理由 `<textarea>`（153行）に `id="survey-reason"` を付与し、`<label>`（150行）に `htmlFor="survey-reason"` を付与して関連付ける。
- [ ] FR-189-05: 対象種ボタン群を囲むコンテナ（129行付近の `<div className="flex gap-2">`）に `role="group"` と `aria-labelledby`（「対象の種類」見出し `<label>` に付与した `id` を参照）を付与する。各種ボタン（131〜144行）に `aria-pressed={species === s.value}` を付与する（PostForm.tsx:326 と同一方針）。
- [ ] FR-189-06: エラー表示（193〜196行）に `role="alert"` を付与し（必要に応じ `aria-live="assertive"`）、テキスト色をライトモードで `text-red-600` 系（AA 充足。ダークモードは `dark:text-red-300` 等）に変更してコントラスト 4.5:1 以上を満たす。
- [ ] FR-189-07: 閉じるボタン（99行）に `aria-label={t('common.close')}`（既存キー。4 ロケール済み）を付与する。
- [ ] FR-189-08: 送信不能時のユーザー説明を提供する。次のいずれかを採用する（**(A) を推奨**）:
  - **(A) PostForm 方式に統一（推奨）**: 送信ボタンの `disabled` から `!position || !reason.trim()` を外し（`disabled={loading}` のみ残す）、`handleSubmit` 内のバリデーション（55〜56行）に到達させて `role="alert"` のエラーバナーで `survey.errors.noPosition` / `survey.errors.noReason` を表示する。これにより「なぜ送れないか」が支援技術・視覚双方に伝わる。
  - **(B) disabled を維持する場合**: 送信ボタン付近に常設のヘルパーテキスト（例: 「場所の選択と調査理由の入力で送信できます」）を表示し、`disabled` の理由を常時可視化する。ヘルパーテキストは i18n キー化し、必要なら `aria-describedby` で送信ボタンに関連付ける。

### 非機能要件（該当する場合のみ）
- [ ] NFR-189-01: 改修は他モーダル（AuthModal/PostForm/DeleteDialog）の既存フック・パターンを再利用し、SurveyRequestForm 独自の a11y 実装を新規に作らない（DRY・一貫性）。
- [ ] NFR-189-02: 新規 i18n 文言（採用案 (B) のヘルパーテキスト等）は 4 ロケール（ja/en/ko/zh）に追加する。

## 受入条件
- [ ] AC-01: SurveyRequestForm を開くとフォーカスがモーダル内に入り、`Tab` / `Shift+Tab` の巡回がモーダル内に閉じる（背景の地図・ヘッダーへ到達しない）。
- [ ] AC-02: モーダルを開いた直後に `Escape` を押すと閉じる。
- [ ] AC-03: スクリーンリーダーでダイアログを開くと、見出し（`survey.formTitle`）がダイアログ名として読み上げられる。
- [ ] AC-04: 調査理由 `<textarea>` がラベル「調査理由」と関連付き、対象種ボタン群が group としてラベル付けされ、選択中ボタンが `aria-pressed=true` になる。
- [ ] AC-05: 位置未選択または理由空のまま送信を試みると（採用案 (A) ならボタン押下で）、`role="alert"` のエラーが表示され、対応する文言が読み上げられる。採用案 (B) の場合はヘルパーテキストが常時表示される。
- [ ] AC-06: エラーテキストのコントラスト比がライト/ダーク両モードで 4.5:1 以上。
- [ ] AC-07: 閉じるボタンが空でない accessible name を持つ。
- [ ] AC-08: SurveyRequestForm（または同等スニペット）に対する vitest-axe テストを新規追加し、`button-name` / `label` / `aria-dialog-name` 等の違反が 0 件。
- [ ] AC-09: 既存のモーダル・調査依頼関連テストが全て成功する。

## 影響範囲
- `src/components/modals/SurveyRequestForm.tsx`（86〜87行: dialog、95〜101行: 見出し/閉じる、126〜145行: 種ボタン、150〜161行: 理由、193〜196行: エラー、200〜203行: 送信）
- `src/hooks/useFocusTrap.ts` / `src/hooks/useEscapeKey.ts`（再利用）
- `src/locales/{ja,en,ko,zh}/translation.json`（採用案 (B) のヘルパーテキスト追加時）
- 新規テスト: `src/components/modals/__tests__/SurveyRequestForm.a11y.test.tsx`（vitest-axe）
- 関連: REQ-151 / REQ-158 / REQ-160 / REQ-163

## 優先度
- **緊急度**: 高 / **重要度**: 高 / **理由**: 複数の WCAG レベル A（focus trap・ダイアログ名・label・ボタン名）違反が単一コンポーネントに集中。さらに「押せない送信ボタン＋説明なし」は支援技術利用者だけでなく一般ユーザーの離脱要因にもなる UX 欠陥。改修群（REQ-151/158/160/163）の明確な対象漏れであり、既存パターン流用で確実に解消できるため優先度が高い。
