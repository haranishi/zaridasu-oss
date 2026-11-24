## 受入条件

- [ ] AC-01: `/species/american` と `/species/bullfrog` が 200 で表示され、`generateStaticParams` により両パスが静的生成される。`SPECIES` に無い値（例 `/species/foo`）は 404（`notFound`）になる。
- [ ] AC-02: 各種ページの `<title>` に当該種名が含まれ、メインキーワードが 1 種に限定されている（種をまたがない）。root template による `| ザリダス` の二重付与が無い（REQ-199 と整合）。
- [ ] AC-03: 各種ページの `<head>` に `canonical = /species/{species}`、`og:*`、`twitter:card` が出力される（`area` ページと同水準）。
- [ ] AC-04: ページ本文に `<h1>`（種名）が 1 つだけ存在し、`species_info` / `law_info` 由来の解説（status・形態・被害・法的禁止事項）と学名が表示される。コピーに「大学」「卒業研究」「卒研」の語が含まれない。
- [ ] AC-05: 種ページから `/area/{slug}`（地域）と `/post/{id}`（投稿）への内部リンクが存在する。逆に、地域ページの種別表示（`AreaPageClient`）と投稿詳細の種ラベルから `/species/{species}` への内部リンクが存在する（クラスター↔ピラーの相互リンク）。
- [ ] AC-06: `/sitemap.xml` に `${BASE_URL}/species/american` と `${BASE_URL}/species/bullfrog` の `<loc>` が含まれる。
- [ ] AC-07: 各種ページに `BreadcrumbList` の JSON-LD が出力され、`safeJsonLd` でエスケープされている。Dataset/学名 sameAs は **本 REQ では出力されない**（REQ-229 のスコープであることが本ドキュメントに明記されている）。
- [ ] AC-08: `next build` が成功し、種ページ・地域ページ・投稿詳細・sitemap の既存 E2E/型チェックが回帰しない。新規 i18n キーを追加した場合、ja/en/ko/zh の 4 言語に存在する（または ja フォールバックが壊れない）。

## 影響範囲

**本 REQ が新規に追加するもの:**
- `src/app/species/[species]/page.tsx`（新規 Server Component：`generateStaticParams` / `generateMetadata` / 本文・JSON-LD 出力）
- `src/app/species/[species]/SpeciesPageClient.tsx`（必要に応じて。本文のインタラクティブ部分。`area` の Client 分割パターンに倣う／不要なら Server のみでも可）
- `src/lib/seo.ts`（種ページ用の最小 JSON-LD/メタ生成ヘルパを追加。`generatePostSEO` と並置）

**本 REQ が変更するもの:**
- `src/app/sitemap.ts`（`SPECIES.map(...)` による種別 URL を `staticPages`/`areaPages` と並べて追加）
- `src/app/area/[municipality]/AreaPageClient.tsx`（種別カウント表示から `/species/{value}` への内部リンク追加）
- `src/app/post/[id]/DetailPageClient.tsx`（種ラベルから `/species/{species}` への内部リンク追加）
- `src/locales/{ja,en,ko,zh}/translation.json`（種ページ用の見出し・導入文キーを追加する場合のみ。既存 `species_info`/`law_info` は再利用）

**本 REQ が担わない範囲（重複回避・後続 REQ への橋渡し）:**
- **種 × 地域のクラスターページ量産（`/species/[species]/area/[municipality]` 等）＝ REQ-228**。本 REQ はピラー（種単独）のみを新設し、URL 設計とリンク枠だけ前方互換に用意する。
- **Dataset 構造化データ・学名（`Procambarus clarkii`/`Lithobates catesbeianus`）の `sameAs`/`taxon` エンティティ連携＝ REQ-229**。本 REQ の JSON-LD は `BreadcrumbList`＋種の `about`（`Thing`）までに留める。
- **オープンデータ公開/DOI＝ REQ-230**、**種別 OG 画像の自動生成＝ REQ-181/REQ-225 系**（本 REQ は `/og-image.png` 流用で可）。
- 既存メタ/配信の是正（REQ-027 動的メタ・REQ-199 小修正・REQ-177 sitemap/robots 整理）とは独立（本 REQ は新規ページ群の新設であり是正ではない）。

**他機能への影響リスク:**
- 新規ルート追加のため既存ルートへの破壊的影響は小さいが、`sitemap.ts` の戻り値配列に種別 URL を足すため sitemap スナップショット/件数を検証するテストがあれば期待値を更新する。
- `AreaPageClient` / `DetailPageClient` への内部リンク追加は表示変更を伴うため、当該ページの E2E（リンク存在・遷移）を更新・確認する。
- i18n キー追加時は 4 言語の整合（欠落キーで実行時警告が出ないか）を確認する。

## 優先度

- **緊急度**: Medium / **重要度**: High
- **理由**: 本番動作を壊す不具合ではないが、ザリダスの SEO 構造における**最大の空白（種を軸にした権威ページの不在）**を埋める施策で、トピッククラスター戦略のピラーに当たる中核ページである。種名の情報収集型ロングテール（見分け方・駆除・法律・秋田での状況）は安定需要がある一方で現状は受け皿ゼロであり、ピラーを立てることで後続の REQ-228（種×地域クラスター）・REQ-229（Dataset/学名構造化）が乗る土台が整う。実装コストは既存 `area` ページのパターン流用＋既存 i18n テキスト再利用で比較的小さく、得られる検索流入・内部リンク構造の改善（投資対効果）が大きいため重要度は高い。種×地域の量産（REQ-228）や高度な構造化データ（REQ-229）は本 REQ 完了後に段階的に積む前提とし、本 REQ はまず「2 種ぶんのピラーを正しく公開し、相互内部リンクと sitemap・パンくずまで通す」ことに集中する。
