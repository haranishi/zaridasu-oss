### 受入基準の達成状況

| AC | 結果 |
|---|---|
| **AC-01** | ✅ `npm audit --omit=dev` → **found 0 vulnerabilities**。`npm run audit`（`--audit-level=high`）**exit 0**。クリーンな `npm ci`（593 パッケージのコールドインストール）でも再現し、lockfile のドリフト無し |
| **AC-02** | ✅ `npm ls sharp postcss next --omit=dev` → `next@15.5.22` / `postcss@8.5.25` / `sharp@0.35.3`。`node_modules/next/node_modules/postcss` は**存在しない**（トップレベルへ dedupe） |
| **AC-03** | ✅ `npm run build` 成功。`next start` に対し `Accept: image/avif,image/webp,*/*` → `Content-Type: image/avif`（実体も `ISO Media, AVIF Image` 512x512・3,601B、`Cache-Control: max-age=2678400` は `minimumCacheTTL` 由来）。`Accept: image/webp,*/*`（AVIF 非対応 UA 相当）→ `Content-Type: image/webp`（実体も `RIFF/WEBP` 1080x567）。sharp 単体でも AVIF/WebP 変換と `sharp.concurrency()` の動作を確認 |
| **AC-04** | ⏸ **未実施**（Vercel プレビューデプロイが必要。`vercel.json` は `git.deploymentEnabled: false` のため自動デプロイされない）。lockfile に `@img/sharp-linux-x64@0.35.3` / `@img/sharp-libvips-linux-x64@1.3.2` が optional として記録済みであることは確認 |
| **AC-05** | ✅ `.github/workflows/ci.yml` の audit ステップを `run: npm run audit` の**単純実行に変更**し、hard-fail へ昇格。ジョブ冒頭コメントと `.github/SECURITY_SETUP.md` §4 に恒久方針（warning へ戻さない／台帳運用）を記録 |
| **AC-06** | ⏸ **未実施**（`supabase/` を触らない制約下での作業のため）。→ 下記「残作業」 |
| **AC-07** | ✅ `type-check` / `lint` / `test`（**77 ファイル・695 テスト全パス**）／ `build` ／ `size`（size-limit 8 バジェットすべて予算内・exit 0）／ `i18n:check`（ja/en/ko/zh 1298 キー parity OK）。e2e は未実行 |

CSS 生成（Tailwind v4 × PostCSS 8.5.25 経路）の確認: ビルド出力 `.next/static/css/98f03920ce453930.css`（152,519B）に `--tw-*` カスタムプロパティ 1,207 個・`@media` 25 個・`@supports` 180 個を確認し、postcss 8.5.25 でパースして rules 1,807 / atrules 309 / decls 2,989 を取得（構文エラー無し）。`next start` からも `text/css` で 200 配信されることを確認した。

### 残作業

1. **AC-06: `supabase/functions/deno.lock` の再生成**（未実施）。npm 依存の更新とは独立だが、REQ-288 の落とし穴どおり `edge-functions` ジョブの `deno cache --frozen` が落ちる可能性がある。**本作業は `supabase/` を変更しない制約下で行ったため未着手**。CI が赤くなった場合は下記を実行する。
   ```bash
   deno cache --lock=supabase/functions/deno.lock --frozen=false $(find supabase/functions -name '*.ts')
   ```
   > なお本更新は npm ツリーのみを変更しており Deno の依存グラフには触れていないため、影響は無い見込み（**未検証**）。
2. **AC-04: Vercel プレビューでのビルド互換確認**（未実施）。macOS arm64 でしか実測できていないため、Linux x64 での `sharp` ネイティブバイナリ解決をプレビューのビルドログで確認する必要がある。`sharp@0.35.3` は `engines.node: ">=20.9.0"`（0.34.5 は `^18.17.0 || ^20.3.0 || >=21.0.0`）に**厳格化**されているため、Node 18 系のランタイム指定が残っていないかも併せて確認する（CI の `node-version: '20'` は 20.9.0 以上に解決されるため問題無し）。
3. **e2e（Playwright）未実行**。`next` のマイナー更新のためルーティング挙動への影響は小さいと見込むが、AC-07 の一部として別途実行が望ましい。
4. **`overrides` の解消**。上流の `next` が sharp 0.35 / postcss 8.5 を正式採用した時点（16.3 系の想定）で `overrides` を外して再評価する。

## 要確認

- ~~**同日の 2 回の実測で High の内訳が異なった**~~ → **決着**: 着手時の再実測は起票時と同一の 4 件だった（上記「着手時の再実測」）。
- `brace-expansion` の実行到達がビルド時に限られるという評価（FR-296-01 の判断点）は、`@sentry/bundler-plugin-core` の利用箇所から推定したもので、実測による確認は行っていない。→ **受容せず 5.0.9 へ更新して解消したため、台帳への allowlist 記載は不要になった。**
- REQ-288 で見送られた `typescript` 5.9.3 → 7.0.2（PR #24）は本要件のスコープ外。`package-lock.json` を同時に触るため、**REQ-288 の残作業と本要件のどちらを先に入れるか**を決めてから着手する。→ 本要件を先に入れた。REQ-288 側の残 PR は本要件の lockfile 変更の上に rebase する必要がある。
