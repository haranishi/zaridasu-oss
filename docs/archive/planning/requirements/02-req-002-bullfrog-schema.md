### REQ-002: bullfrog とスキーマの不整合修正

**背景**
`constants.js` の `SPECIES` に `bullfrog`（ウシガエル）が定義されているが、`schema.sql` の `CHECK` 制約は `('american', 'bullfrog')` を含んでいる。ただし `bullfrog` が追加された経緯・意図が不明確であり、マーカーアイコン・フィルタ・統計などが `american` のみを想定している箇所が存在する可能性がある。

#### ユーザーストーリー

```
As a 開発者,
I want to constants.js の定義と DB スキーマが完全に一致している状態にしたい,
So that 予期しないデータが投入されてもシステムが正常に動作する。

受け入れ条件:
- [ ] SPECIES の定義が constants.js と schema.sql で完全に一致する
- [ ] bullfrog を正式サポートするか、削除するかを決定し、一方に統一する
- [ ] bullfrog を追加する場合、マーカーアイコン・凡例・統計・フィルタが対応する
- [ ] bullfrog を削除する場合、既存データへの影響（マイグレーション）を考慮する
- [ ] 今後の種類追加時のチェックリストを README に追記する
```

#### 機能要件（bullfrog 正式サポートする場合）

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `SPECIES` に bullfrog を正式追加し、日本語名・色・アイコンを定義 | 高 |
| F2 | MapView.jsx のマーカーアイコンが bullfrog に対応する（色: 現状 #16A34A） | 高 |
| F3 | 凡例（legend）に bullfrog を表示する | 高 |
| F4 | フィルタバーの種類選択に bullfrog を追加する | 高 |
| F5 | 統計（stats）の種類別集計に bullfrog を含める | 中 |

#### 機能要件（bullfrog を削除する場合）

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `constants.js` から bullfrog を削除する | 高 |
| F2 | schema.sql の CHECK 制約を `('american')` のみに変更するマイグレーションを作成 | 高 |
| F3 | 既存の bullfrog データが存在する場合は `american` に変換する、または削除する | 高 |

#### 判断基準

ザリガニダス（ザリガニ情報マップ）というサービス定義からは `bullfrog` はスコープ外。
**推奨: bullfrog を定数・スキーマ両方から削除し、将来的に「外来種マップ」として拡張する際に正式に追加する。**

---
