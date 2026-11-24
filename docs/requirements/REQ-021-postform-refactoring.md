# REQ-021: PostFormコンポーネントのリファクタリング

## 背景
投稿フォーム `PostForm.tsx` は702行、useState 20個超の巨大コンポーネントとなっており、フォームロジック・天気取得・位置情報処理・下書き管理・画像アップロードが1ファイルに混在している。保守性・テスト容易性・可読性が低く、バグ修正や機能追加のコストが高い。

## 現状の問題
- `src/components/features/posts/PostForm.tsx`: 702行の単一コンポーネント
- useState が20個以上（position, species, infoType, municipality, comment, count, observedAt, weather, locationError 等）
- フォームロジック・天気API呼び出し・EXIF解析・下書き管理・オフライン対応が1ファイルに集中
- `WEATHER_CATEGORIES` がローカル定義（`constants.ts` と重複）
- `beforeunload` イベント未実装（未保存データ消失リスク）

## 目的
PostForm を責務ごとにサブコンポーネント・カスタムフックに分割し、保守性とテスト容易性を向上させる。

## 要件

### 機能要件
- [ ] FR-021-01: フォーム状態管理を `useReducer` またはカスタムフック `usePostFormState` に切り出す
- [ ] FR-021-02: 写真アップロードセクションを `PhotoUploadSection` コンポーネントに分離する
- [ ] FR-021-03: 位置情報選択セクションを `LocationSection` コンポーネントに分離する
- [ ] FR-021-04: 天気選択UIを `WeatherSelector` コンポーネントに分離する
- [ ] FR-021-05: `WEATHER_CATEGORIES` を `src/lib/constants.ts` に移動し、PostForm からインポートする
- [ ] FR-021-06: フォームに未保存データがある状態でページ離脱時、`beforeunload` で警告を表示する
- [ ] FR-021-07: 分割後の各コンポーネントが400行以下になること

### 非機能要件
- [ ] NFR-021-01: リファクタリング後も既存の全機能（投稿・下書き保存・オフライン保存・EXIF検出）が動作すること
- [ ] NFR-021-02: 分割した各サブコンポーネントに対してユニットテストを追加する

## 受入条件
- [ ] AC-01: PostForm.tsx が400行以下に削減されている
- [ ] AC-02: `PhotoUploadSection`, `LocationSection`, `WeatherSelector` が独立コンポーネントとして存在する
- [ ] AC-03: `WEATHER_CATEGORIES` が `constants.ts` で定義され、PostForm からインポートされている
- [ ] AC-04: フォーム入力後にタブを閉じようとすると `beforeunload` 警告が表示される
- [ ] AC-05: 既存のE2Eテスト・ユニットテストが全てパスする
- [ ] AC-06: `npm run build` が成功する

## 影響範囲
- `src/components/features/posts/PostForm.tsx`（分割元）
- `src/components/features/posts/PhotoUploadSection.tsx`（新規）
- `src/components/features/posts/LocationSection.tsx`（新規）
- `src/components/features/posts/WeatherSelector.tsx`（新規）
- `src/lib/constants.ts`（WEATHER_CATEGORIES 追加）
- `src/hooks/usePostForm.ts`（状態管理リファクタ）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 最も変更頻度が高いコンポーネントであり、技術的負債がバグ修正・機能追加のコストを増大させている
