# REQ-194: プロフィール編集モーダルの共通化・ダイアログセマンティクス付与・死にコード削除

## 背景
REQ-160（フォーカストラップの共通化）・REQ-163（モーダルの aria 属性とボタン整合）で、アプリ内モーダルには `role="dialog"` / `aria-modal` / `aria-labelledby` と `useFocusTrap` / `useEscapeKey` を付与する方針が定められ、`src/components/modals/` 配下（AuthModal・EditDialog・ReportModal・DeleteDialog 等）には適用済みである。`useFocusTrap`（`src/hooks/useFocusTrap.ts`）・`useEscapeKey`（`src/hooks/useEscapeKey.ts`）は共通フックとして存在する。

しかし、実際にユーザーが使うプロフィール編集モーダルは `src/components/modals/` ではなく `src/views/DashboardPage.tsx` 内にローカル定義された `EditProfileModal` であり、上記方針の**対象から漏れている**。さらに、同等のモーダル定義が `src/views/ProfilePage.tsx` にも複製されているが、こちらは呼び出し経路が存在しない**死にコード**になっている。文言も日本語ハードコードで i18n 化されていない。

## 現状の問題
（ファイルパス:行番号つき。コードは実値で確認済み）

1. **実利用される EditProfileModal にダイアログセマンティクス・フォーカストラップが無い**
   - `src/views/DashboardPage.tsx:38-125` — `EditProfileModal` 本体。ルート要素（64-76行付近）に `role="dialog"` / `aria-modal="true"` / `aria-labelledby` が無い。`useFocusTrap` / `useEscapeKey` も未使用。
   - `src/views/DashboardPage.tsx:278` の `onClick={() => setEditing(true)}`（プロフィールカードの編集ボタン）から開かれる、**実際に使われるモーダル**である。

2. **文言が日本語ハードコード**
   - `DashboardPage.tsx:75`「プロフィール編集」、`:99`「ニックネーム（20文字以内）」、`:104`「自己紹介（100文字以内）」、`:111`「ランキングに表示する」、`:120`「保存」、`:80`「アイコン」が `t()` を経由せず直書き。ja/en/ko/zh 切替に追従しない。

3. **ラベルと入力の関連付けが無い**
   - `DashboardPage.tsx:99-100`（ニックネーム）、`:104-105`（自己紹介）等の `<label>` に `htmlFor` が無く、対応 `<input>`/`<textarea>` に `id` が無い。クリック/支援技術でのラベル関連付けが成立していない。

4. **閉じるボタンがテキスト「✕」**
   - `DashboardPage.tsx:76` — `<button onClick={onClose} ...>✕</button>`。REQ-163 のアイコンボタン整合（`aria-label` 付きアイコン）から外れ、生のテキスト記号を使用。

5. **DeleteAccountModal も dialog セマンティクスが無い**
   - `src/views/DashboardPage.tsx:134-214` — `DeleteAccountModal`。ルート要素（153-162行付近）に `role="dialog"` / `aria-modal` / `aria-labelledby` 無し、`useFocusTrap` / `useEscapeKey` 未使用。インラインエラー（190-192行）は持つが、ダイアログセマンティクスは欠落。

6. **ProfilePage に到達不能な EditProfileModal の複製が存在（死にコード）**
   - `src/views/ProfilePage.tsx:38-148` — `EditProfileModal` のほぼ同一複製。閉じるボタンは `<X size={18} />`（79-81行）で DashboardPage 版（✕ テキスト）と実装が微妙に異なり、`notify_survey_request`（調査依頼通知）チェックボックス（132-135行）を持つなど差分もある。
   - `src/views/ProfilePage.tsx:162` で `const [editing, setEditing] = useState(false)`、`:330-337` で `{editing && <EditProfileModal ... />}` を描画するが、`setEditing(true)` を呼ぶ箇所がファイル内に存在しない（`setEditing(false)` が 334行にあるのみ）。`editing` は常に `false` のため**このモーダルは描画されない**。ProfilePage は他者プロフィール閲覧専用で、自分のプロフィールは `dashboard` へリダイレクトされる（166-174行）ため、本来編集 UI は不要。

結果として、(a) 実利用モーダルがアクセシビリティ方針の対象漏れ、(b) i18n 非対応、(c) ラベル未関連付け、(d) 同一目的のコードが 2 箇所に重複し片方は死にコード、という保守性・品質上の問題が併存する。

## 目的
プロフィール編集モーダルを `src/components/modals/` 配下の共通コンポーネントへ一本化し、REQ-160/163 と同等のダイアログセマンティクス（`role="dialog"` / `aria-modal` / `aria-labelledby`）・フォーカストラップ・Esc クローズ・i18n・ラベル関連付けを実装する。ProfilePage の死にコード複製を削除し、DeleteAccountModal にも同セマンティクスを付与する。

## 要件
### 機能要件
- [ ] FR-194-01: `EditProfileModal` を `src/components/modals/` 配下（例 `EditProfileModal.tsx`）の単一の共通コンポーネントとして定義し、`DashboardPage.tsx` のローカル定義をこれに置き換える。`notify_survey_request` を含む現行 DashboardPage 版の機能セット（is_public 等）を踏襲する。
- [ ] FR-194-02: 共通 `EditProfileModal` のルート要素に `role="dialog"`、`aria-modal="true"`、`aria-labelledby`（タイトル `<h3>` の id を参照）を付与する。
- [ ] FR-194-03: 共通 `EditProfileModal` で `useFocusTrap`（`src/hooks/useFocusTrap.ts`）と `useEscapeKey`（`src/hooks/useEscapeKey.ts`）を使用し、開いている間フォーカスを閉じ込め、Esc キーで `onClose` を呼ぶ。`src/components/modals/EditDialog.tsx` 等の既存実装を参照パターンとする。
- [ ] FR-194-04: モーダル内の全表示文言（タイトル/各ラベル/プレースホルダ/保存ボタン/アイコン見出し等）を ja/en/ko/zh の 4 ロケール i18n キーへ置き換え、日本語ハードコードを排除する。
- [ ] FR-194-05: 各 `<label>` に `htmlFor` を、対応する `<input>`/`<textarea>` に一意な `id` を付与して関連付ける（ニックネーム・自己紹介・チェックボックス類）。
- [ ] FR-194-06: 閉じるボタンを、`aria-label`（i18n の「閉じる」）付きのアイコンボタン（例 lucide `X`）に統一し、テキスト「✕」直書きを廃止する。REQ-163 のボタン整合方針に従う。
- [ ] FR-194-07: `DeleteAccountModal`（`DashboardPage.tsx:134-214`）にも `role="dialog"` / `aria-modal="true"` / `aria-labelledby` を付与し、`useFocusTrap` / `useEscapeKey` を使用する。
- [ ] FR-194-08: `src/views/ProfilePage.tsx` の死にコード（`EditProfileModal` 定義 38-148行、`editing` state、330-337行のレンダリング、不要になった `useState`/インポート）を削除する。ProfilePage から編集 UI への参照を完全に除去する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-194-01: 共通化により EditProfileModal の重複定義を 1 つに集約する（DRY）。DashboardPage / ProfilePage 双方からの重複を解消する。
- [ ] NFR-194-02: 既存のプロフィール保存挙動（`onSave` の引数形・成功時クローズ）を回帰させない。REQ-193 の保存失敗インラインエラーと両立する実装にする。

## 受入条件
- [ ] AC-01: 共通 `EditProfileModal` を開いた状態で vitest-axe（jest-axe 相当）を実行し、重大な a11y 違反が無い（dialog ロール・ラベル関連付けを含む）。
- [ ] AC-02: `grep -rn "EditProfileModal" src/views/ProfilePage.tsx` が 0 件（ProfilePage に EditProfileModal が存在しない）。
- [ ] AC-03: `grep -rn "function EditProfileModal" src/views/DashboardPage.tsx` が 0 件（ローカル定義が共通コンポーネントへ移動済み）。
- [ ] AC-04: モーダルを開いた状態で Tab 連打してもフォーカスがモーダル外へ出ず、Esc キーで閉じる（testing-library のキーイベントテスト）。
- [ ] AC-05: モーダル内に日本語ハードコード文言が無く、追加した i18n キーが ja/en/ko/zh の 4 ファイルに存在する（grep / キー網羅テスト）。
- [ ] AC-06: `DeleteAccountModal` を開いた状態で `role="dialog"` が存在し、vitest-axe を通過する。
- [ ] AC-07: ニックネーム・自己紹介の各 `<label>` がそれぞれの入力要素に `htmlFor`/`id` で関連付いている（testing-library `getByLabelText` で取得できる）。

## 影響範囲
- 新規/移動: `src/components/modals/EditProfileModal.tsx`（共通コンポーネント）
- 改修: `src/views/DashboardPage.tsx`（ローカル EditProfileModal 削除・差し替え、DeleteAccountModal へのセマンティクス付与）
- 削除: `src/views/ProfilePage.tsx`（死にコードの EditProfileModal とその周辺）
- 共通フック: `src/hooks/useFocusTrap.ts`、`src/hooks/useEscapeKey.ts`（利用）
- ロケール: `src/locales/{ja,en,ko,zh}/translation.json`
- REQ-160 / REQ-163 の方針に準拠、REQ-193 と連動
- 関連テスト: EditProfileModal / DeleteAccountModal の a11y・フォーカストラップテスト

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 実利用モーダルが REQ-160/163 のアクセシビリティ方針から漏れており、キーボード/支援技術ユーザーがプロフィール編集で不利益を被る。死にコード重複は保守時の混乱・二重修正リスクを生む。致命的なデータ問題ではないが、既存の共通資産で低コストに是正でき品質負債を減らせるため優先する。
