# プロジェクト構造・命名規約（REQ-266）

2026-07-08 の構造整理（REQ-266）で確立した `src/` の配置・命名ルール。**新規コードはこれに従う**（逸脱が再発すると「どこに何があるか分からない」状態に戻る）。

## ディレクトリの役割

| ディレクトリ | 役割 |
|---|---|
| `src/app/` | **ルーティングのみ**。`page.tsx` / `layout.tsx` / `route.ts` / `loading.tsx` / `error.tsx` と、SSR のデータ取得・`metadata` / `generateMetadata` / `generateStaticParams` / セグメント設定（`revalidate` / `dynamic`）だけを置く。UI 本体は置かない。 |
| `src/views/` | **ページ本体**（`*Page.tsx`）。インタラクティブなら先頭に `'use client'`。 |
| `src/components/` | 再利用コンポーネント。`ui/`（汎用プリミティブ）／`ui/charts/`（チャート）／`features/<ドメイン>/`（機能別）／`layout/`／`modals/`。 |
| `src/hooks/` | カスタムフック。明確なドメインクラスタは `hooks/{admin,posts,survey}/`、汎用・横断フックは `hooks/` 直下。 |
| `src/lib/` | UI 以外の共有ロジック全般（API・検証・SEO・ストレージ・エラー等）。**`utils/` は廃止し `lib/` に一本化**。 |
| `src/context/` `src/types/` `src/locales/` | React Context ／ 型 ／ i18n（ja/en/ko/zh）。 |
| `src/features/<名前>/` | **独立した機能を、層に分けず 1 フォルダに置く場所**（REQ-331）。置く条件は下の節。部品を機能別に分ける `src/components/features/<ドメイン>/` とは別物。 |

## 主要ルール

1. **app は薄く、views に本体**。`app/X/page.tsx` は原則 `export { default } from '@/views/XPage'` で view を**直 re-export**する（client 境界は view 側の `'use client'` が持つ）。`metadata` 等の server export がある場合は page.tsx に併記（手本: `app/requests/page.tsx`）。
2. **薄い `*Client` ラッパを作らない**。`page.tsx → *Client.tsx → views/*Page` の3層は禁止。ただし *Client が**実ロジックを持つ**場合（例: `admin/AdminLayoutClient` のセッションタイムアウト、`post/[id]/DetailPageClient` の prop 既定化）は許容。
3. **命名**: ページ本体は `*Page`。ラッパ接尾辞（旧 `*PageClient` / `*Client` / `*Shell`+`*Interactive`）は増やさない。
4. **テストはコロケーション**。テスト対象の隣の `__tests__/` に置く（`ui/StatCard` のテストは `ui/__tests__/`、`features/` 配下に置かない）。
5. **`lib` と `utils` を分けない**（`utils/` は無い）。新規の共有ロジックは `lib/` へ。
6. **components 分類**: 汎用は `ui/`、機能固有は `features/<ドメイン>/`。`common/` は作らない（廃止済み）。

## 独立した機能は `src/features/<名前>/` に 1 フォルダでまとめる（REQ-331）

層ごとのフォルダ（components / hooks / lib）に機能を割ると、1 機能を足すたびに多くのディレクトリを触ることになり、REQ-329 では変更が src の 13 ディレクトリに散った。

**置いてよいのは、次の 3 つをすべて満たす機能だけ。** posts・地図本体・認証のような中核は動かさない。

1. 自分の表を持つ
2. 入口が地図のレイヤー・シート・管理画面のどれか
3. ほかの機能からは、決めた 1〜2 ファイルでしか使われない

中は役割で分ける。テストは各フォルダの `__tests__/` に置く（主要ルール 4）。

| フォルダ | 置くもの |
|---|---|
| `data/` | DB アクセス。ESLint は `src/lib/data/` と同じく `.from('表')` を許す（機能フォルダのほかの場所では止める） |
| `lib/` | 純粋な計算・定数 |
| `hooks/` | 状態と副作用 |
| `components/` | 画面の部品と入口（地図のレイヤー・シート） |
| `admin/` | 管理画面 |

- **`index.ts` でまとめて再 export しない（バレル禁止）。** 1 関数を import しただけで、機能全体がホームの JS に載りうる。`/` のページ JS は上限 10 kB で余裕がほぼ無く、超えると CI の予算検査で止まる。import は実体のファイルを直に指す
- `src/app/` には再 export の 1 行だけを置く（主要ルール 1 と同じ）
- 翻訳キーは機能名を接頭辞にする（機能 `fieldwork` なら `fieldwork.*`）。4 言語のファイルの中で機能ごとにまとまり、消すときに探しやすい
- 機能フォルダの `README.md` に、持っている表・外から呼ぶ関数・pg-tap のファイル・差し込み口（MapView に足した 1 行など）を書く。機能を外すときに触る場所が、ここを読めば全部わかる

## 機能を足すときは、型検査も ESLint も拾わない書き忘れをこの表で確かめる（REQ-331）

PR を出す前に、変えたものの行を確かめる。右の列にある検査は CI でも走るが、「なし」の行は誰も止めないので、レビューで見るしかない。自動の検査に置き換えた項目は表から消す。

| 変えるもの | 同じ PR で触る場所 | 検査するもの |
|---|---|---|
| DB（表・列・関数・権限） | migration・`supabase/schema.sql`・`src/types/database.types.ts`・`scripts/check-schema-types-sync.ts`（CHECK の許容値を足したとき）・`supabase/tests/*.sql`（pg-tap）・列の権限を剥がしたら `supabase/ci/reapply-after-grants.txt`・migration の索引（`supabase/migrations/README.md` と、同じフォルダの `README/05-…`（一覧）・`README/06-…`（本数）） | `npm run schema:check`（型と CHECK の許容値）／CI の `rls-tests`（pg-tap）／CI の `migration-gate`（README の本数と実ファイル数）。schema.sql に表を書き忘れても、まだ止まらない |
| 画面の文言 | `src/locales/{ja,en,ko,zh}/translation.json` の 4 つ | `npm run i18n:check`（4 言語のキーの一致） |
| 挙動 | `docs/current/` の該当ページ | なし（レビューで見る） |

## 意図的な例外・残課題（REQ-266 時点）
- `app/species/[species]/page.tsx` と `app/dataset/page.tsx` は server+UI がインライン。views への抽出は**未実施**（フォローアップ）。
- `area/[municipality]/AreaPageClient`・`profile/ProfilePageClient`・`request/[id]/SurveyRequestPageClient`・`u/unsubscribe` 由来の view など、ロジックを持つ *Client は温存（本体は views へ移設済み、export 名は consumer の server component 名との衝突回避で維持している箇所あり）。
- `ui/StatCard` と `features/admin/AdminStatCard`、`ui/charts/DonutChart` と `features/admin/AdminDonutChart` は **props・幾何・markup が異なるため統合していない**（別物）。
- hooks は明確クラスタ（admin/posts/survey）のみサブフォルダ化。残り18フックは root。バレル（`hooks/index.ts`）は設けていない（import は実体パス直指定）。
