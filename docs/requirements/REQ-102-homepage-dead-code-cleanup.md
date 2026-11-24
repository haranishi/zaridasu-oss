# REQ-102: HomePage の死コード 5 件を削除

> 親 REQ: REQ-092
> 関連 REQ: REQ-021（postform-refactoring）— リファクタリング後の残骸

## 背景
ESLint の `@typescript-eslint/no-unused-vars` 警告がビルドログに恒常的に出ており、特に `src/views/HomePage.tsx` に 5 件の未使用変数が集中している。REQ-021 のリファクタリング後の取り残しと推定。

## 現状の問題
- `src/views/HomePage.tsx:99` — `const { t } = useTranslation()` の `t` 未使用
- `src/views/HomePage.tsx:103` — `useReducer` の destructuring で `activeTab` 未使用
- `src/views/HomePage.tsx:133` — `const [surveyRoute, setSurveyRoute] = useState(...)` の両方未使用
- `src/views/HomePage.tsx:134` — `const mapRef = useRef<L.Map | null>(null)` の `mapRef` 未使用

`useState` / `useRef` 呼び出しが残っているため、僅かながら React 内部状態と JS 実行コストが発生する。

## 目的
死コードを除去し、コード可読性向上 + 微小な JS 実行コスト削減を行う。lint warning も減る。

## 要件

### 機能要件
- [ ] FR-102-01: `src/views/HomePage.tsx:99` の `const { t } = useTranslation()` を削除（`useTranslation` 自体の import が他で使われていなければ import も削除）
- [ ] FR-102-02: `src/views/HomePage.tsx:103` の destructuring から `activeTab` を除去（reducer 側の state も削除可なら削除）
- [ ] FR-102-03: `src/views/HomePage.tsx:133` の `const [surveyRoute, setSurveyRoute] = useState(...)` 行を削除し、`L.LatLngExpression[]` 型 import が他で使われていなければ削除
- [ ] FR-102-04: `src/views/HomePage.tsx:134` の `const mapRef = useRef<L.Map | null>(null)` を削除
- [ ] FR-102-05: 削除後にビルド・テストが pass すること

### 非機能要件
- [ ] NFR-102-01: 既存テスト（vitest / Playwright）が全て pass すること
- [ ] NFR-102-02: 機能挙動に変化がないこと

## 受入条件
- [ ] AC-01: `npm run lint` の出力で HomePage.tsx に関する `no-unused-vars` warning が 0 件
- [ ] AC-02: `npm run build` が成功し、HomePage の First Load JS が現状以下
- [ ] AC-03: 既存 Playwright `home.spec.ts` が pass
- [ ] AC-04: `grep -n "surveyRoute\|setSurveyRoute\|mapRef\|activeTab" src/views/HomePage.tsx` が空（同名変数の他用途が無いことの確認）

## 影響範囲
- `src/views/HomePage.tsx` のみ

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 単純削除 5 行。実装コスト XS（5 分）。実害はほぼ無いが「使ってない useState/useRef がある」という事実は将来の RSC 化時の判断ノイズになるので潰しておきたい。

## 実装メモ
- もし `activeTab` が reducer の他のアクションで参照されていれば、reducer 内の参照箇所も整合性を取って削除する
- `useReducer` の initial state から `activeTab` を消す場合、`UIAction` 型からも該当 action を削除
- 完了後 `npm run lint -- --max-warnings=0` で warning 全消し条件を試して、HomePage 由来の警告が無いことを確認
