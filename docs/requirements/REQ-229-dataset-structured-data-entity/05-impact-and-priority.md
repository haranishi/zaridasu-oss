## 影響範囲

**本 REQ が変更する範囲（Dataset 拡充＋学名エンティティ）:**
- `src/lib/constants.ts`（`SpeciesOption`/`SPECIES` に `scientificName`・`sameAs`〔・分類〕を追加＝単一の出どころ化）
- `src/app/area/[municipality]/page.tsx`（`Dataset` に `about`/学名/`sameAs`・`temporalCoverage`・`variableMeasured`・`isAccessibleForFree`・`creativeWorkStatus` を追加。期間取得の軽量クエリ追加）
- `src/lib/seo.ts`（`generatePostSEO` の `Report.about` に学名・`sameAs`）
- `src/hooks/useDetailSEO.ts`（`Report.about` をマスタ参照に統一、`sameAs` 追加、重ねキャスト解消）
- `src/views/AboutPage.tsx`（図鑑の学名表示をマスタ参照に切替）
- （将来）`src/app/species/[species]/…`（REQ-227/228 で新設される種/種×地域ページに同パターンを適用＝本 REQ は方針提供のみ）

**本 REQ が担わない範囲（重複回避・境界）:**
- JSON-LD の XSS エスケープ実装は REQ-005（`safeJsonLd`）が主管。本 REQ はそれを利用するのみ。
- 動的メタ（title/description/OGP）の整備は REQ-027 ほかが主管。本 REQ は `<title>`/OGP を変更しない（JSON-LD のみ）。
- 種別ピラーページ／種×地域ページの**新設**は REQ-227/228 が主管（本 REQ はそこへ適用する Dataset/エンティティのパターンを定義・接続）。
- オープンデータ実体（CSV/GeoJSON 配布、ライセンス確定、DOI 引用可能化）は REQ-230 が主管。本 REQ の `distribution`・`license` は REQ-230 の配布先・条件と整合させ、実体が無い段階では出力しない。
- 逆ジオコーディングによる地名/水系の付与は REQ-231 が主管（`spatialCoverage` の粒度向上はそちらと連携可能だが本 REQ では現行の自治体座標を用いる）。

**他機能への影響リスク:**
- 学名・`sameAs` の**誤同定**が最大のリスク（間違ったエンティティに紐付けると AI 検索で誤った関連付けを誘発）。一次ソースでの裏取りを必須にする（NFR-229-03）。
- `temporalCoverage` で全件の期間を出すための追加クエリが SSR コストを増やす。head-count 同様に軽量化し、ISR（`revalidate=86400`）前提を崩さない（NFR-229-04）。
- SSR（`seo.ts`）とクライアント（`useDetailSEO.ts`）の `about` 構造がズレると検索側で不整合になるため、両者を同一データ・同一形に揃える（FR-229-05 / AC-05）。

## 優先度

- **緊急度**: Low / **重要度**: Medium
- **理由**: 本番動作を壊すものではなく、効果（Google Dataset Search への露出、AI 検索でのエンティティ認識・引用獲得）は中長期で表れる種類の改善。一方、(a) `Dataset` 型は既に存在し**拡充は数十行**で済む、(b) 学名は既にコード内（AboutPage/useDetailSEO/i18n）に存在しマスタへ寄せるだけ、(c) 市民科学データ × 地域 × 学名エンティティは競合が薄く差別化に効く、という費用対効果の高さから優先度は中。卒研 PF として「データセットとしての発見可能性」と「種エンティティの権威付け」を低コストで獲得できる施策。なお `distribution`（配布実体）は REQ-230 が前提のため、本 REQ は「実在する集計のみのマークアップ拡充＋学名 `sameAs`」を確実に締めることに集中する。
