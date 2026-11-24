## 受入条件

- [ ] AC-01: `src/app/area/[municipality]/[species]/page.tsx` が存在し、`generateStaticParams` が 2 種 × 24 市町村＝**48 件**の `{ municipality, species }` を返す（`MUNICIPALITY_DATA` 24 件 × `SPECIES` 2 件）。未知の `municipality`/`species` スラッグは 404（`notFound()`）になる。
- [ ] AC-02: 投稿が存在する種×地域（例: `/area/akita-shi/american`、件数 ≥ しきい値）が 200 で表示され、`<title>` に市町村名と種名の両方が入り、`<link rel="canonical">` が自分自身（`/area/akita-shi/american`）を指す。robots に noindex が無い。
- [ ] AC-03: 投稿 0 件（しきい値未満）の種×地域ページが、FR-228-04 で確定した隔離方式（noindex のみ／親 canonical 併用／親リダイレクトのいずれか）で **index 対象から外れている**（`<meta name="robots" content="noindex">` を持つ等）。1 ページ内で index 可と noindex が同居しない。
- [ ] AC-04: `/sitemap.xml` に **index 対象（しきい値以上）の種×地域 URL のみ**が `${BASE_URL}/area/{slug}/{species}` 形式で含まれ、しきい値未満の組み合わせ URL は含まれない。サイトマップと各ページの robots/canonical が矛盾しない。
- [ ] AC-05: 種×地域ページの JSON-LD が `Dataset` と `BreadcrumbList`（**ホーム → 地域別 → 市町村 → 種**の 4 階層）を含み、種名が `Dataset.name`/`keywords` とパンくず末尾に反映されている。`safeJsonLd` でエスケープされている。
- [ ] AC-06: 親 `/area/[municipality]` から各種の種×地域ページへの内部リンクがあり（件数のある種を優先）、種×地域ページから親地域・同市町村のもう一方の種への内部リンクがある。noindex の薄いページへリンクを集中させていない。
- [ ] AC-07: REQ-227（種ピラー `/species/[species]`）とのキーワード/canonical 棲み分けが本ドキュメントの方針どおり実装されている（種×地域ページの canonical はピラーに向かず自分自身。title/H1 が市町村名主語で、種ピラーと実質重複しない）。REQ-227 未実装時はピラー向けリンクが無効化コメント付きで準備されている。
- [ ] AC-08: 既存 `/area/[municipality]`（2 種まとめ）の表示・メタデータ・既存テスト（`src/app/area/[municipality]/__tests__/page.test.tsx`）が非回帰。
- [ ] AC-09: 種ラベル・見出し・パンくずが ja/en/ko/zh で既存地域ページと同水準に多言語表示される。URL スラッグ（`american`/`bullfrog`）は全ロケール共通。

## 影響範囲

**本 REQ が新規追加・変更する範囲:**
- `src/app/area/[municipality]/[species]/page.tsx`（新規。Server Component: `generateStaticParams`/`generateMetadata`/データ取得/JSON-LD）
- `src/app/area/[municipality]/[species]/`（必要なら表示用クライアントコンポーネント。既存 `AreaPageClient` を流用・薄くラップする想定。推測: 種で絞った props を渡せば再利用可能）
- `src/app/area/[municipality]/AreaPageClient.tsx`（親→種×地域への内部リンク追加。FR-228-08）
- `src/lib/constants.ts`（`getSpeciesBySlug` ヘルパ・index しきい値定数 `AREA_SPECIES_INDEX_MIN_POSTS` の追加。種スラッグ方針確定。`MUNICIPALITY_DATA`/`SPECIES` 自体は不変）
- `src/app/sitemap.ts`（`areaPages`〔:38-43〕の後に index 対象の種×地域 URL を追加。集計クエリ・しきい値フィルタ・`SITEMAP_LIMITS`/`warnIfTruncated` 整合）
- `src/locales/{ja,en,ko,zh}/translation.json`（種ラベル/見出し/パンくずの翻訳キー。既存キーで足りる場合は追加不要）

**本 REQ が担わない範囲（重複回避・相互参照）:**
- 種そのものの総合解説（生態・分布・駆除手順）と `/species/[species]` ピラーページ本体は **REQ-227** が主管。本 REQ は種×地域の各論＋programmatic 生成＋空ページ運用に集中し、ピラーとは canonical を分け、内部リンクで連結する（FR-228-11）。
- Dataset 構造化データの精緻化（学名エンティティ・`sameAs`・DOI 引用）は **REQ-229/REQ-230** が主管。本 REQ は既存 Dataset 形を種で拡張する範囲に留める。
- 逆ジオコーディングによる地名/水系の付与は **REQ-231** が主管（本 REQ は `MUNICIPALITY_DATA` の既存 24 市町村粒度を使う）。
- サイトマップ全体の方針（profile 除外・/requests 追加・title 二重ブランド）は **REQ-199** が確立済み。本 REQ はその「sitemap と robots を矛盾させない」原則に従う。

**他機能への影響リスク:**
- 種×地域ページの追加自体は新規ルートのため既存ページへの破壊的影響は小さい。ただし (a) サイトマップ生成に集計クエリを足すため、素朴な 48 回 head-count は sitemap 生成コストを上げ得る（NFR-228-01 で 1 本集計に寄せる）。(b) index しきい値や canonical 方式（FR-228-04）を誤ると「薄いページの大量 index（スパムリスク）」または「価値あるページを誤って noindex」する両方向の事故があり得るため、しきい値・隔離方式を 1 本化して AC-02/03/04 で検証する。(c) 親 `AreaPageClient` への種リンク追加は既存 UI/テストの前提を壊さない範囲で行う（NFR-228-03）。

## 優先度
- **緊急度**: Low / **重要度**: Medium
- **理由**: 本番動作を壊すバグではなく、SEO 流入の「面」を広げる施策。卒研 PF として「市民科学データの可視性向上＝協力者の発見性」に効くため重要度は中。ただし投稿実データが少ない初期に 48 ページを軽率に index 投入すると scaled content abuse（`04_AI検索時代とローカルSEO.md:92,133`）でサイト全体の評価を下げる**逆効果リスク**があるため、「空ページの noindex/canonical 運用」を伴わない単純実装は避けるべきで、データ蓄積と歩調を合わせて段階的に index を解禁する（しきい値の運用引き上げ）。REQ-227（種ピラー）と対で実装すると内部リンク構造（ハブ＆スポーク）が完成し効果が高まるため、REQ-227 と前後して着手するのが望ましい。
