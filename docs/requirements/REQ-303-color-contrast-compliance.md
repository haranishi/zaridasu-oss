# REQ-303: カラーコントラストの適合（placeholder・text-gray-400・写真上テキスト）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: アクセシビリティ（視認性）
状態: **提案 / 未実装**
関連: REQ-268（モバイル対応の底上げ）, REQ-224（デザイントークン・色の a11y / FR-224-05・FR-224-07）, REQ-180（color-contrast 修正）, REQ-302（jsx-a11y / axe の検出基盤）

## 概要

配色トークンの設計自体は完了している。`src/app/globals.css:390-397`（ライト）と `:474-482`（ダーク）は**全ニュートラルトークンにコントラスト実測値のコメントを添えて定義**されており、`--color-text-faint` には「最弱でも 4.6:1 を確保（旧 gray-400=2.8:1 を底上げ）」と明記されている。`src/lib/themeClasses.ts:25` には `faint()` というトークン参照ヘルパーまで用意されている。

**問題はトークンを使っていない箇所が広範に残っていること**である。具体的には (1) placeholder が生の slate スケールのまま素通りしている、(2) `text-gray-400` が 186 箇所残存している、(3) 投稿写真の上に載る文字が背景次第でコントラストを保証できない構造になっている、の3点。いずれも「設計思想の欠落」ではなく「移行の未完」である。

## 背景

WCAG 1.4.3（コントラスト・最低限、レベル AA）の要求は**通常文字 4.5:1 以上／大きな文字 3:1 以上**。大きな文字の定義は 24px 以上、または 18.66px 以上の太字。以下の値はいずれもこれを満たしていない。

### 問題A: ダークモードの placeholder コントラストが 1.9〜3.1:1 — High

| 場所 | 組み合わせ | 実測比 |
|---|---|---|
| `src/lib/formStyles.ts:24` | `bg-slate-800` (#1e293b) × `placeholder-slate-600` (#475569) | **1.93:1** |
| `src/lib/formStyles.ts:32` | `bg-slate-700` × `placeholder-slate-500` | **2.17:1** |
| `src/components/modals/ReportModal.tsx:149` | `bg-slate-800` × `placeholder-slate-600` | **1.93:1** |
| `src/components/features/dashboard/FilterBar.tsx:127` | `bg-slate-800` × `placeholder-slate-600` | **1.93:1** |
| `src/components/features/posts/CommentSection.tsx:324` | `bg-slate-800` × `placeholder-slate-500` | **3.07:1** |

- **`formStyles.ts:24` は共有入力スタイル `formInputCls()` の内部**であり、`PostForm` / `SurveyRequestForm` / `AuthModal` / `AuthCallbackPage` / `LocationSection` など**このヘルパーを使う全入力欄に 1.93:1 が波及している**。`:32` の `dialogInputCls()` も同様に `EditDialog` 系へ波及する。
- 本アプリの placeholder は装飾ではなく**入力指示そのものを担っている**（例: `postForm.countPlaceholder`、`survey.reasonPlaceholder`、`report.commentPlaceholder`）。単なる例示ではなく「何をどう入力すべきか」の情報源であるため、WCAG 1.4.3 の対象テキストとして扱う必要がある。ロービジョン利用者や屋外の明環境では読めない。
- テーマ側は `--color-text-faint` にコントラストを明記して設計済みなのに、**placeholder だけが生の slate スケールで素通りしている**という非対称が問題の本質である。

### 問題B: `text-gray-400`（白地 2.54:1）が 186 箇所残存 — Medium

- `#9ca3af`（gray-400）は白地で **2.54:1**。通常文字 4.5:1・大きな文字 3:1 のいずれも未達。
- 残存件数: **監査時点で 185 箇所。本要件作成時に `src/**/*.tsx` を再走査した結果は 186 箇所 / 58 ファイル**（ほぼ同数。厳密な件数は着手時に再カウントする）。
- 代表的な分布: `DrawerMenu.tsx`（8）, `SurveyRequestPage.tsx`（7）, `AuthModal.tsx`（4）, `DashboardPage.tsx`（3）, `SurveyRequestForm.tsx`（3）, `ReportModal.tsx`（3）, `MapModal.tsx`（3）, `PostCard.tsx`（3）, `CommentSection.tsx`（3）, `FilterBar.tsx:128`（`placeholder-gray-400`）。
- **不足は既知である。** `src/components/layout/BottomNav.tsx:106-108` のコメントは「旧 light: active=text-red-500(#ef4444→3.76:1) / inactive=text-gray-400(#9ca3af→2.53:1) は不足」と明記し、**BottomNav だけを gray-500 へ底上げ済み**。`globals.css:397` も「旧 gray-400=2.8:1 を底上げ」と記載している。つまり方針は確定していて移行が完了していない。
- 該当箇所は日付・補足説明・カウンタなど**小さめの文字が多く、実害が出やすい**（大きな文字の 3:1 緩和も適用できない）。

### 問題C: 写真グリッドの 10px 文字が投稿写真の上に半透明白で載る — Low（ただし保証不能な構造）

- `src/components/features/posts/PhotoGallery.tsx:101`（`text-white/80` の市区町村名）と `:103`（`text-white/70` ＋ `text-[10px]` の日付）。
- 背景は `:95` の `bg-linear-to-t from-black/70 to-transparent`。**グラデーションの上端が完全に透明**なため、テキスト位置での実効背景は**投稿写真そのもの**になる。
- 投稿写真は利用者が撮影した任意の画像（明るい水面・空・砂利・雪など）であり、**コントラスト比が背景次第で決まる＝設計上どの値も保証できない**。10px の日付が `white/70` では明るい背景で判読不能になる。

## 機能要件

- **FR-303-01**: placeholder の色をトークン系（ダーク時 slate-400 相当＝`--color-text-faint`）へ置換する。`src/lib/formStyles.ts` の `formInputCls()` / `dialogInputCls()` に**一本化**し、`ReportModal.tsx:149` / `FilterBar.tsx:127` / `CommentSection.tsx:324` のインライン重複を共有ヘルパー呼び出しへ寄せる（インラインで placeholder 色を再掲する箇所を残さない）。
- **FR-303-02**: `text-gray-400` を `text-ink-faint`（`globals.css:54` の `--color-ink-faint` → `--color-text-faint`）へ一括置換する。既存ヘルパー `faint()`（`src/lib/themeClasses.ts:25`）が使える箇所はヘルパー経由に寄せる。`placeholder-gray-400`（`FilterBar.tsx:128`）は FR-303-01 と同時に処理する。
- **FR-303-03**: 置換後の退行を防ぐため、**`text-gray-400` / `placeholder-slate-600` / `placeholder-slate-500` などコントラスト不足が確定しているユーティリティを lint で禁止**する。REQ-302 FR-302-01 で整える lint 基盤に相乗りし、禁止クラスと理由（実測比）をルール側のメッセージに記載する。例外が必要な場合は理由コメント付きの `eslint-disable` で明示する。
- **FR-303-04**: 写真上テキスト（`PhotoGallery.tsx:95-105`）のコントラストを背景画像に依存しない形にする。次のいずれか、または組み合わせを採る。
  - スクリムを不透明寄りに変更（例 `from-black/80 via-black/50`）してテキスト位置での背景を確定させる。
  - テキストに `text-shadow` を付与する。
  - 日付・市区町村を**固定背景のピル**（不透明な背景を持つ小さなラベル）に載せる。
  - 併せて `text-[10px]` の妥当性を見直す（REQ-268 のモバイル文字サイズ方針と整合を取る）。
- **FR-303-05**: **色の正本は `src/app/globals.css` のトークン定義**とする方針を明文化する。Tailwind v4 では `@theme` 由来のユーティリティとトークンが直結するため、コンポーネント側で生の色スケール（`gray-*` / `slate-*`）を新規に書かず、トークン参照（`text-ink-faint` / `text-(--color-text-faint)` / `faint()`）を使う。トークン定義には現行と同様に**実測コントラスト比をコメントで残す**（`globals.css:397`, `:482` の既存記法を踏襲）。

## 受入基準

- **AC-01**: ライト／ダークの両テーマで、修正対象の**通常文字が 4.5:1 以上**、**大きな文字（24px 以上、または 18.66px 以上の太字）が 3:1 以上**であることを実測し、値を記録する。placeholder も通常文字として 4.5:1 以上を満たす。
- **AC-02**: `src/**/*.tsx` に `text-gray-400` および `placeholder-gray-400` が**0 件**である（`grep` で確認できる）。
- **AC-03**: `formStyles.ts` 以外のファイルに placeholder 色のインライン指定が残っていない（`placeholder-slate-500` / `placeholder-slate-600` が 0 件）。
- **AC-04**: FR-303-03 の lint が有効で、`text-gray-400` を新規に追加すると `npm run lint` が失敗する（意図的な違反コードで確認する）。
- **AC-05**: `PhotoGallery` の日付・市区町村が、**明るい写真（白い空・雪・水面の反射など）の上でも判読できる**。実効背景が確定する実装になっており、コントラスト比を計測できる（背景画像に依存して不定にならない）。
- **AC-06**: axe の `color-contrast` 違反が、REQ-302 FR-302-02 で拡大する a11y テストの対象画面で 0 件である。
- **AC-07**: `lint` / `type-check` / 既存652テストがパスする。

## 検討事項 / 要確認

- ダークモードの入力欄背景（`bg-slate-800` = `#1e293b`）上で `--color-text-faint`（`hsl(215 16% 65%)` ≒ slate-400）が 4.5:1 を満たすかを**実測して確認する**。globals.css:482 のコメントは「暗地で 4.5:1+」としているが、これはページ背景基準の記述であり、入力欄の面色は別途検証が必要（要確認）。満たさない場合は入力欄専用の placeholder トークンを追加する。
- `text-gray-400` の 186 箇所には**ダークモード分岐の light 側だけを指すもの**が混在する（例: `dark ? 'text-slate-400' : 'text-gray-400'`）。一括置換時に dark 側の値を壊さないこと。
- REQ-268 で対応済みの箇所（BottomNav など）を再度書き換えて退行させないよう、REQ-180 / REQ-224 の実測コメントが残っている箇所は**コメントごと維持**する。

---

## 追加の実測（2026-07-31 / REQ-306 のモバイル LHCI 導入で顕在化）

REQ-306 で Lighthouse CI に **モバイル計測と `/lp`** を追加したところ、`color-contrast` が **error で落ちる**ことが判明した。**デスクトップ計測では出ていなかった**ため、本要件の起票時点では見えていない分である。

失敗ノードは `/lp` の**装飾テキスト2件**（ローカル実測 / axe 経由）。

| # | セレクタ | 実測コントラスト比 | 前景 / 背景 | 備考 |
|---|---|---:|---|---|
| 1 | `div.lp-marquee-track > span.flex > span.mx-5.lp-outline` | **2.49** | `#7d3c44` / `#020617` | マーキーの縁取り文字（22.5pt / bold） |
| 2 | `footer.relative > p.pointer-events-none`（`aria-hidden="true"`） | **1.12** | `#0f172a` / `#020617` | フッターの巨大ゴースト文字（約40pt / bold） |

いずれも WCAG 1.4.3 の違反である。#2 は `aria-hidden="true"` かつ `pointer-events-none select-none` の**純粋な装飾**だが、**axe の `color-contrast` は「視覚的に描画されているテキスト」を対象にするため `aria-hidden` でも除外されない**（晴眼者には見えているため）。したがって「装飾だから対象外」という整理は通らない。取り得る方向は (a) 実際にコントラストを上げる、(b) テキストではなく画像/SVG として描画して text ノードでなくする、のいずれか。

### 現在の扱い（暫定）

REQ-306 側で **`assertMatrix` により `/lp` のみ `color-contrast` を warn へ限定降格**している（`.lighthouserc.json` / `.lighthouserc.mobile.json` の `_comment_lp_color_contrast` に記録）。他URLでは error のまま維持。

> **本要件でこの2件を解消したら、両 config の `/lp` 側 `color-contrast` 降格を削除して error に戻すこと。** 戻し忘れると `/lp` のコントラスト退行が永久に検知されなくなる。
