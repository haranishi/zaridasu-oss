## 実施状況（2026-07-30）

### 着手時の再実測（要確認の 1 点目に対応）

`npm audit --omit=dev --json` の `metadata.vulnerabilities` は **`{"info":0,"low":0,"moderate":0,"high":4,"critical":0,"total":4}`**（prod 依存 173／総計 727）。内訳は起票時の記載と**同一の 4 パッケージ**で、差分は無かった。

| パッケージ | 実測バージョン | 影響範囲 | ツリー上の位置 |
|---|---|---|---|
| `sharp` | 0.34.5 | `<0.35.0` | `node_modules/sharp`（`next` の optionalDependency） |
| `postcss` | 8.4.31 | `<=8.5.17` | `node_modules/next/node_modules/postcss`（入れ子。トップレベルは 8.5.23 で影響外） |
| `next` | 15.5.20 | `>=12.0.0 <15.5.21` 系（high 3 / moderate 5） | `node_modules/next`（直接依存） |
| `brace-expansion` | 5.0.7 | `<=5.0.7` | `@sentry/nextjs`→`@sentry/bundler-plugin-core`→`glob@13`→`minimatch@10.2.5`→`brace-expansion` |

### 判明した重要な事実: `npm audit fix` だけでは 2 件が解消しない

起票時は「4 件すべて `fixAvailable: true`」だったが、**実際に `npm audit fix` で解消したのは `next` と `brace-expansion` の 2 件のみ**だった。理由は上流の依存指定にある。

- `next@15.5.22` の `optionalDependencies.sharp` は **`^0.34.3`**（＝`<0.35.0`）。semver 範囲内に修正版が存在しない
- `next@15.5.22` の `dependencies.postcss` は **`8.4.31`（厳密指定）**。範囲更新の余地が無い
- **`next` を 16.2.12（latest）に上げても同じ**（`sharp@^0.34.5` / `postcss@8.4.31`）。すなわちメジャー更新でも解決しない

したがって **`package.json` の `overrides` が必須**と判断した。`next` のメジャー更新（16.x）は影響が大きいため**見送っている**（本要件のスコープ外）。

### 適用した更新

| パッケージ | before | after | 手段 |
|---|---|---|---|
| `next` | 15.5.20 | **15.5.22** | `npm audit fix`（`^15.3.4` の範囲内） |
| `brace-expansion`（prod 経路） | 5.0.7 | **5.0.9** | `npm audit fix` |
| `sharp` | 0.34.5 | **0.35.3**（libvips 8.18.3） | `overrides.sharp: "^0.35.3"` |
| `postcss`（`next` 入れ子） | 8.4.31 | **8.5.25**（トップレベルへ dedupe。入れ子は消滅） | `overrides.postcss: "^8.5.23"` |

付随して dev 依存の `eslint-config-next` 15.5.14→15.5.22、`@next/eslint-plugin-next`、`@next/env`、`@next/swc-*`、dev 経路の `brace-expansion` 1.1.16→1.1.18 も更新された。

`overrides` の妥当性の根拠: **Next.js 上流の canary（`next@16.3.0-canary.103`）が既に `sharp@^0.35.3` / `postcss@8.5.23` を採用**しており、この組み合わせは上流の想定内である。また `next` の image-optimizer が使う sharp API は **`sharp()` と `sharp.concurrency()` の 2 つのみ**で、0.35 系でも変化していない（`node_modules/next/dist/server/image-optimizer.js` を実測）。

> [!warning] `overrides` は lockfile の root には記録されない
> npm 11.6.2 では `package-lock.json` の `packages[""]` に `overrides` フィールドが書かれない（解決済みバージョンとしてのみ反映される）。**`package.json` の `overrides` を消すと lockfile 再生成時に 0.34.5 / 8.4.31 へ戻る**ため、両ファイルをセットで扱うこと。クリーンな `npm ci` で同一に解決されることは確認済み（下記 AC-01）。
