作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: セキュリティ（依存）
状態: **✅ 実装済み（2026-07-30。本番依存 High 0 件・CI ゲートを hard-fail へ昇格）** ／ 残り: FR-296-04（Vercel プレビューでのビルド互換確認）・AC-06（`supabase/functions/deno.lock` 再生成）は**未実施**（→ 末尾「実施状況」）
関連: REQ-210（依存監査を CI に導入。audit ジョブの warning 化はここで決まった）, REQ-269（依存脆弱性更新。同じ「High 0 件」を目標に掲げた先行要件）, REQ-288（依存更新の滞留解消）
参照: `.github/workflows/ci.yml:370-402`（audit ジョブ）, `package.json:27-28`（`audit` / `audit:all` スクリプト）, `.github/SECURITY_SETUP.md`（依存監査 allowlist 台帳）

## 背景

`npm audit --omit=dev`（＝本番依存ツリーのみ）の実測で **High 4 件**が滞留している。REQ-269（2026-07-17）が「本番依存の High を 0 件にする」を掲げた後、**再び 4 件に戻っている**状態である。

### 実測（2026-07-30）

`npm audit --omit=dev --json` の `metadata.vulnerabilities` は `{"high":4,"moderate":0,"low":0,"critical":0,"total":4}`。High と判定された 4 パッケージは以下。**4 件すべて `fixAvailable: true`**（`npm audit fix` で解消可能と報告されている）。

| パッケージ | 現行 | 影響範囲 | 主なアドバイザリ | ツリー上の位置 |
|---|---|---|---|---|
| **`sharp`** | 0.34.5 | `<0.35.0` | **GHSA-f88m-g3jw-g9cj**（libvips 継承の **CVE-2026-33327 / CVE-2026-33328 / CVE-2026-35590 / CVE-2026-35591**） | `node_modules/sharp`。`next@15.5.20` の依存 |
| **`postcss`** | 8.4.31 | `<=8.5.17` | **GHSA-6g55-p6wh-862q**（攻撃者制御の `sourceMappingURL` による任意ファイル読取・情報漏洩／High）、**GHSA-r28c-9q8g-f849**（Previous Source Map 自動読込のパストラバーサルによる任意 `.map` ファイル開示／High）、GHSA-qx2v-qp2m-jg93（`</style>` 未エスケープの XSS／Moderate） | **`node_modules/next/node_modules/postcss`**（Next.js 同梱の入れ子。トップレベルの `postcss` は 8.5.23 で影響外） |
| `next` | 15.5.20 | `>=13.0.0 <15.5.21` 系 | GHSA-m99w-x7hq-7vfj（Server Actions の DoS／High）、GHSA-89xv-2m56-2m9x（カスタムサーバ上の Server Actions の SSRF／High）、GHSA-p9j2-gv94-2wf4（rewrites の宛先ホスト名経由の SSRF／High）ほか Moderate 5 件（キャッシュ混同・Image Optimization API の SVG DoS・Server Function エンドポイントの開示 等） | `node_modules/next`（直接依存） |
| `brace-expansion` | 5.0.7 | `<=5.0.7` | GHSA-mh99-v99m-4gvg（無制限展開による OOM クラッシュ／High） | `@sentry/nextjs` → `@sentry/bundler-plugin-core` → `glob` → `minimatch` → `brace-expansion` |

> [!note] 本要件のタイトルが `sharp / postcss` である理由
> 起票の起点となった実測報告が sharp と postcss を指摘していたためである。同日の再実測では **`next` と `brace-expansion` も High として現れた**。`next` のアドバイザリはいずれも **15.5.21 で修正**されており、現行 15.5.20 との差は 1 パッチである。すなわち**直近に公開されたアドバイザリ**である可能性が高い（要確認）。**対応は 4 件すべてを対象にする。**

### 問題A: 画像最適化経路が脆弱な sharp を使っている — High

`next.config.ts:16-18` は `images.formats = ['image/avif', 'image/webp']` を指定しており、`next/image` の最適化（リサイズ・AVIF/WebP 変換）は Next.js のビルトイン最適化＝**`sharp`（内部で libvips）**が実行する。CVE-2026-33327 / 33328 / 35590 / 35591 は libvips 由来の脆弱性であり、**攻撃者が用意した画像を最適化経路に通せる場合に影響しうる**。

本アプリはユーザー投稿写真（`post-photos` バケット）を扱い、`next.config.ts:20` 以降の `remotePatterns` で許可した外部ホストの画像も最適化対象になるため、「攻撃者が内容を選べる画像がこの経路を通る」条件は満たされる。

### 問題B: Next.js 同梱の PostCSS が入れ子で古いまま残っている — High

トップレベルの `postcss` は 8.5.23（`@tailwindcss/postcss@4.3.3` / `vite` と共有）で影響外だが、**`node_modules/next/node_modules/postcss` が 8.4.31 で固定されている**。GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 はいずれも `sourceMappingURL`（CSS コメント内）を経由して**任意ファイルの読み取り・`.map` ファイルの開示**に至るもので、CSS の処理主体がビルド時である本アプリでは実行到達はビルド環境に限られる（＝任意 CSS を投入できる第三者がいない前提なら実害は限定的）。ただし「トップレベルだけ上げて入れ子が古いまま」という状態は audit の指摘が消えない構造的な負債であり、`next` を上げる以外に解消できない。

### 問題C: CI に `--audit-level=high` のゲートがあるのに High 4 件が滞留していた — Medium（構造的な原因）

`package.json:27` の `audit` は `npm audit --omit=dev --audit-level=high` で、High 以上があれば **exit 1 する**。しかし CI 側でその exit code を**打ち消している**。

```yaml
# .github/workflows/ci.yml:395-401
- name: Audit production dependencies (high+)
  run: |
    if npm run audit; then
      echo "::notice::npm audit: 本番依存に high 以上の脆弱性はありません。"
    else
      echo "::warning title=npm audit::本番依存に high 以上の脆弱性があります（初期チューニング中のため warning）。…"
    fi
```

同ジョブの冒頭コメント（`ci.yml:370-381`）が理由を明記している——REQ-210 導入時点で既に `next` / `ws` の High が存在したため、CI を初手から赤にしないよう **warning に落とし、「既存 high が解消され次第 hard-fail に昇格する」**と決めた。つまり**ゲートは最初から発火しない設定であり、High の滞留を止める力を持っていない**。

加えて次の 2 点が滞留を長引かせている。

1. **新規アドバイザリは後から到着する**: `next` の High 3 件は 15.5.21 で修正されており、現行 15.5.20 は「更新を怠った結果」ではなく「新しい指摘が来た結果」である可能性が高い。この性質上、`npm audit` は「一度 0 にしたら終わり」ではなく継続的に再発する
2. **依存更新の運用が滞留していた**: Dependabot の grouping は minor/patch のみで、メジャー更新は個別 PR として溜まる（REQ-288 の記録どおり 2026-07-20 の PR 4 本が `main` 宛てで滞留していた）。**REQ-296 は REQ-288 の続きにあたる**——REQ-288 が「滞留した PR の処理」を扱うのに対し、本要件は「脆弱性を根拠にした更新」を扱う。両者は同じ `package-lock.json` を触るため、実施タイミングを揃えると衝突を避けられる
