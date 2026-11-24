# REQ-040: PostForm のラベル/入力を htmlFor+id で関連付け

## 背景
投稿フォーム `PostForm` は、生き物の目撃情報を登録する中核 UI。スクリーンリーダーや音声入力を利用するユーザーがフォームを適切に操作できることは、WCAG 2.1 AA 準拠のため必須である。

## 現状の問題
`src/components/features/posts/PostForm.tsx` 各フィールドの `<label>` は、対応する `<input>` / `<textarea>` と htmlFor/id で関連付けられておらず、かつラベルが入力をラップしてもいない。支援技術がフィールド名を読み上げられず、クリック領域も広がらない。

- `src/components/features/posts/PostForm.tsx:307-311`（目撃数 count）

```tsx
<label className={`block text-sm font-semibold mb-1 ${label}`}>
  {t('postForm.count')}
  <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.countUnit')}</span>
</label>
<input type="number" min="1" max={COUNT_MAX} value={count}
```

- `src/components/features/posts/PostForm.tsx:332-336`（observedAt）

```tsx
<label className={`block text-sm font-semibold mb-1 ${label}`}>
  {t('postForm.observedAt')}
  <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.observedAtUnit')}</span>
</label>
<input type="date" max={today} value={observedAt}
```

- `src/components/features/posts/PostForm.tsx:343-347`（surveyDuration）

```tsx
<label className={`block text-sm font-semibold mb-1 ${label}`}>
  {t('postForm.surveyDuration')}
  ...
</label>
<input type="number" min="1" max="480" value={surveyDurationMinutes}
```

- `src/components/features/posts/PostForm.tsx:369-373`（comment）

```tsx
<label className={`block text-sm font-semibold mb-1 ${label}`}>
  {t('postForm.comment')}
  ...
</label>
<textarea value={comment} ... />
```

- 関連: `src/components/features/posts/WeatherSelector.tsx:103, 108` も同様に htmlFor 未指定（気温・湿度ラベル）

## 目的
全フォームフィールドで label-control の関連付けを確立し、支援技術利用者がフィールド名を正しく認識できるようにする。またクリック領域拡大により、タッチデバイスでの操作性も向上させる。

## 要件

### 機能要件
- [ ] FR-040-01: count 入力に一意 id（例 `postform-count`）を付与し、対応する label に `htmlFor` を設定
- [ ] FR-040-02: observedAt 入力に id を付与し、label と関連付け
- [ ] FR-040-03: surveyDuration 入力に id を付与し、label と関連付け
- [ ] FR-040-04: comment textarea に id を付与し、label と関連付け
- [ ] FR-040-05: `WeatherSelector.tsx` 内の温度・湿度入力についても同様に htmlFor/id を設定
- [ ] FR-040-06: id 衝突を避けるため、`useId()` を用いるか、コンポーネント接頭辞を付ける

### 非機能要件
- WCAG 2.1 AA 準拠（1.3.1 情報及び関係性, 3.3.2 ラベル又は説明, 4.1.2 名前・役割・値）

## 受入条件
- [ ] AC-01: axe-core（`@axe-core/react` or Testing Library 連携）で `label` 関連のルール違反が 0
- [ ] AC-02: 既存の `PostForm` 関連テストが全て通過する
- [ ] AC-03: 手動でラベルテキストをクリックすると、対応する入力にフォーカスが移る
- [ ] AC-04: VoiceOver もしくは NVDA でフィールド移動時に日本語ラベルが読み上げられる

## 影響範囲
- `src/components/features/posts/PostForm.tsx`
- `src/components/features/posts/WeatherSelector.tsx`
- `src/**/__tests__/PostForm.*`（該当テスト）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 機能的な不具合ではないが、アクセシビリティ基準（WCAG AA）を満たすために必要。市民投稿を受け付けるサービス特性上、多様な利用者への対応が望ましい。
