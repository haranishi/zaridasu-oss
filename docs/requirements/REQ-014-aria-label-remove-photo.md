# REQ-014: 写真削除ボタンの aria-label 欠落

## 背景
投稿フォーム（PostForm）では、ユーザーが選択した写真のプレビューに削除ボタン（`x`）が表示される。スクリーンリーダーユーザーがこのボタンにフォーカスした際、ボタンの目的が正しくアナウンスされる必要がある。

## 現状の問題
- `src/components/features/posts/PostForm.tsx`（625-628行目）に写真削除ボタンが存在する:
  ```tsx
  <button
    type="button"
    onClick={() => removePhoto(i)}
    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow leading-none"
  >×</button>
  ```
- このボタンに `aria-label` が設定されていない
- スクリーンリーダーはボタンのテキストコンテンツ `x`（Unicode: U+00D7 MULTIPLICATION SIGN）を読み上げるため、「times」や「かける」とアナウンスされる
- ユーザーはこのボタンが何をするのか（どの写真を削除するのか）を理解できない
- 同ファイル内の他のボタン（閉じるボタン 211行目、エラーバナー閉じるボタン 246行目、EXIF バナー閉じるボタン 662行目）には適切に `aria-label` が設定されており、一貫性が欠けている

## 目的
写真削除ボタンにスクリーンリーダーが理解可能な `aria-label` を付与し、どの写真を削除するボタンなのかを明確にする。

## 要件

### 機能要件
- [ ] FR-014-01: 各写真削除ボタンに `aria-label` を付与する（例: `aria-label={t('postForm.removePhoto', { index: i + 1 })}`）
- [ ] FR-014-02: `aria-label` のテキストは、何番目の写真を削除するかが分かる内容にする（例: 「写真1を削除」「写真2を削除」）
- [ ] FR-014-03: 翻訳キーを `src/locales/ja/translation.json`、`en/translation.json`、`zh/translation.json`、`ko/translation.json` に追加する

### 非機能要件
- [ ] NFR-014-01: WCAG 2.1 Level A（SC 1.1.1 Non-text Content、SC 4.1.2 Name, Role, Value）準拠

## 受入条件
- [ ] AC-01: スクリーンリーダー（VoiceOver / NVDA）でボタンにフォーカスした際、「写真Nを削除」のようにアナウンスされる（「times」「かける」とは読み上げられない）
- [ ] AC-02: 全4言語（ja, en, zh, ko）で適切な翻訳テキストが表示される
- [ ] AC-03: 既存の視覚デザイン・レイアウトに変更がない

## 影響範囲
- `src/components/features/posts/PostForm.tsx`（625-628行目: ボタンに `aria-label` 追加）
- `src/locales/ja/translation.json`（翻訳キー追加）
- `src/locales/en/translation.json`（翻訳キー追加）
- `src/locales/zh/translation.json`（翻訳キー追加）
- `src/locales/ko/translation.json`（翻訳キー追加）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: WCAG 2.1 Level A 要件であり、スクリーンリーダーユーザーの操作性に直接影響する。修正は1行の属性追加と翻訳キーの追加のみで、工数は最小限。同ファイル内の他のボタンとの一貫性も向上する。
