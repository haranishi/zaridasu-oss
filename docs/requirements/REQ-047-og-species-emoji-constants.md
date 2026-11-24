# REQ-047: /api/og の種別絵文字を SPECIES 定数から派生

## 背景
OGP 画像生成エンドポイント（`/api/og`）は、`species` クエリに応じてキャラクター絵文字を切り替える。しかしこのマッピングがエンドポイント内にハードコードされており、`SPECIES` 定数への種追加時に更新漏れが起きやすい。種の一覧は `src/lib/constants.ts` の `SPECIES` に一元化されているため、そこから派生させるべきである。

## 現状の問題
- `src/app/api/og/route.tsx:12-16` で `american` と `bullfrog` のみハードコードされている：
  ```tsx
  const speciesEmoji: Record<string, string> = {
    american: '\uD83E\uDD9E',
    bullfrog: '\uD83D\uDC38',
  }
  const emoji = speciesEmoji[species] || '\uD83D\uDDFA\uFE0F'
  ```
- `src/lib/constants.ts:68-71` の `SPECIES` にはすでに `value` / `label` / `color` / `image` があるが、`emoji` フィールドは無い：
  ```ts
  export const SPECIES: readonly SpeciesOption[] = [
    { value: 'american', label: 'アメリカザリガニ', color: '#DC2626', image: '/images/american.png' },
    { value: 'bullfrog', label: 'ウシガエル', color: '#16A34A', image: '/images/bullfrog.png' },
  ]
  ```
- 将来 `SPECIES` に新種を追加しても `/api/og` のマップが更新されず、デフォルトの地図絵文字で表示される不具合が起きうる。

## 目的
種別に紐づく表示メタ情報（絵文字）を `SPECIES` 定数に集約し、`/api/og` は lookup のみで動作するようにする。

## 要件
### 機能要件
- [ ] FR-047-01: `src/lib/constants.ts` の `SpeciesOption` interface に `emoji: string` を追加する。
- [ ] FR-047-02: `SPECIES` の各要素に適切な `emoji` を設定：
  - `american`: `🦞`（`\uD83E\uDD9E`）
  - `bullfrog`: `🐸`（`\uD83D\uDC38`）
- [ ] FR-047-03: `src/app/api/og/route.tsx` からハードコードされた `speciesEmoji` オブジェクトを削除し、以下のように書き換える：
  ```tsx
  import { SPECIES } from '@/lib/constants'
  const emoji = SPECIES.find(s => s.value === species)?.emoji ?? '\uD83D\uDDFA\uFE0F'
  ```
- [ ] FR-047-04: 未知の `species` クエリに対しては従来どおり地図絵文字（`🗺️`）へフォールバックする。
- [ ] FR-047-05: `SURVEY_SPECIES` など `SPECIES` を spread している箇所の型整合性を保つ（`unknown` 要素にも `emoji` を付与するか、`emoji` を optional にするかを決める）。

### 非機能要件
- [ ] NFR-047-01: `/api/og` は引き続き edge runtime で動作し、レスポンスヘッダのキャッシュ指定は変更しない。

## 受入条件
- [ ] AC-01: `SPECIES` に新しい種（例: `crayfish-test`）を追加すると、`/api/og?species=crayfish-test` で対応する絵文字が表示される。
- [ ] AC-02: 既存 2 種（`american` / `bullfrog`）の `/api/og` 出力が従来と同じ絵文字で回帰なく描画される。
- [ ] AC-03: `species` クエリ未指定 or 不明値で地図絵文字（🗺️）にフォールバックする。
- [ ] AC-04: `npm run type-check` / `npm run build` がエラーなく通過する。

## 影響範囲
- `src/lib/constants.ts`（`SpeciesOption` / `SPECIES` / 必要なら `SURVEY_SPECIES`）
- `src/app/api/og/route.tsx`
- `SPECIES.emoji` を将来参照しうる他コンポーネント（新規参照箇所は本要件では触らない）

## 優先度
- **緊急度**: Low
- **重要度**: Low
- **理由**: 現時点では種が 2 つしかなく顕在化していないが、将来の追加漏れを防ぐ低コストな改善である。
