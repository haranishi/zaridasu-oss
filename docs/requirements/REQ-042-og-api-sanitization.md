# REQ-042: /api/og のクエリ文字列バリデーション

## 背景
OGP 画像を動的生成する Edge Runtime API `/api/og` は、投稿詳細や地域ページの SNS 共有で使用される。`title` / `species` / `area` をクエリで受け取り `ImageResponse` に流し込むが、入力検証がなく、極端に長い文字列や不正な値でレイアウト崩れ・CDN キャッシュ汚染を招く恐れがある。

## 現状の問題
- `src/app/api/og/route.tsx:6-16`

```tsx
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const title = searchParams.get('title') || 'ザリダス'
  const species = searchParams.get('species') || ''
  const area = searchParams.get('area') || '秋田県'

  const speciesEmoji: Record<string, string> = {
    american: '\uD83E\uDD9E',
    bullfrog: '\uD83D\uDC38',
  }
  const emoji = speciesEmoji[species] || '\uD83D\uDDFA\uFE0F'
```

- `title` / `area` に長さ制限が無く、10000 文字超の値でも `ImageResponse` 内部で折り返し崩壊・描画異常を起こし得る
- `species` はホワイトリスト照合が無く、任意文字列がそのまま lookup キーになる（現状は絵文字にしか使われないが、将来テキスト表示に拡張されたときに XSS/崩壊の温床）
- `Cache-Control: public, max-age=86400, s-maxage=604800` が効くため、悪意あるクエリでキャッシュを汚染すると長期にわたり影響が残る
- `src/lib/constants.ts:68-71` に `SPECIES` 定数（value: `'american' | 'bullfrog'`）があるが流用されていない

## 目的
OG 画像生成 API の入力を堅牢化し、想定外のクエリでもレイアウトが崩れず、キャッシュを汚染しないようにする。

## 要件

### 機能要件
- [ ] FR-042-01: `title` は `String(raw).trim().slice(0, 80)` に正規化し、空文字の場合は既定値 `'ザリダス'` を使用
- [ ] FR-042-02: `area` は同様に `trim().slice(0, 40)`、空文字の場合は既定値 `'秋田県'` を使用
- [ ] FR-042-03: `species` は `SPECIES`（`src/lib/constants.ts`）の `value` 配列に含まれるかチェックし、不一致は空文字に正規化（汎用絵文字 `🗺️` が選ばれる）
- [ ] FR-042-04: 検証後の値のみを `ImageResponse` に渡す
- [ ] FR-042-05: `SPECIES` を Edge Runtime から import 可能な形で参照する（ブラウザ依存コードを経由しないよう確認）

### 非機能要件
- Edge Runtime 上で追加の外部依存を増やさないこと
- レスポンスは常に 200（不正入力でも 400 を返さず、安全デフォルトへフォールバック）

## 受入条件
- [ ] AC-01: `GET /api/og?title={10000文字}` が 200 を返し、画像レイアウトが崩れない
- [ ] AC-02: `GET /api/og?species=<script>alert(1)</script>` が 200 を返し、汎用絵文字（🗺️）で描画される
- [ ] AC-03: `GET /api/og?species=american` が従来どおり 🦞 で描画される
- [ ] AC-04: `GET /api/og?area={5000文字}` が 200 かつレイアウト維持
- [ ] AC-05: 既存のユニットテスト／ビルドがすべて通過

## 影響範囲
- `src/app/api/og/route.tsx`
- 参照: `src/lib/constants.ts`（`SPECIES` 定数）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 現時点で実被害は確認されていないが、CDN キャッシュ汚染の可能性があり、入力バリデーションは OG 画像 API の基本防御として早期に整備すべき。
