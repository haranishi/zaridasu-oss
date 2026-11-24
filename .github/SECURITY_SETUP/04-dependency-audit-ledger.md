## 4. 依存監査 allowlist 台帳（FR-210-03 / NFR-210-02 / AC-02）

CI の `audit` ジョブは `npm run audit`（= `npm audit --omit=dev --audit-level=high`）を実行する。
`npm audit` には組み込みの allowlist が無いため、**即時修正できない既知 advisory はこの台帳に記録**して運用する。

### 現状の既知 high

**現在 allowlist エントリは 0 件**（本番依存と開発依存を含む監査の両方で0件 / 2026-10-23実測）。

### CI ゲートの状態: **hard-fail（2026-07-30 昇格済み・REQ-296 FR-296-05）**

REQ-210 導入時は既存 high（`next` / `ws`）があったため warning 表示にとどめていたが、
REQ-296 で本番依存の high を 0 件にしたうえで `ci.yml` の `audit` ステップのガード
（`if npm run audit; then ... else warning`）を外し、**high+ でジョブが fail する**ように昇格した。

### 対応履歴

| 日付 | パッケージ | 経路 | advisory | 対応 | 結果 |
|---|---|---|---|---|---|
| 2026-10-23 | `braces` 3.0.3（開発依存） | `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` | GHSA-vfj7-8cjw-p6xm（high・深い入れ子でのスタック枯渇） | Next.jsのlint専用に、fast-globをtinyglobby 0.2.17を使うローカル互換処理へ置換。探索と内部リンク検出を回帰検証。経緯は [REQ-210の保守記録](../../docs/requirements/REQ-210-ci-supply-chain-sast-secret-scanning/04-braces-remediation-20261023.md) | 依存ツリーから除去。全依存・本番依存とも監査0件 |
| 2026-07-30 | `next` 15.5.20→**15.5.22** | direct | GHSA-m99w-x7hq-7vfj / GHSA-89xv-2m56-2m9x / GHSA-p9j2-gv94-2wf4（high）ほか moderate 5 件 | `npm audit fix`（semver 範囲内パッチ） | 解消 |
| 2026-07-30 | `brace-expansion` 5.0.7→**5.0.9** | `@sentry/nextjs`→`@sentry/bundler-plugin-core`→`glob`→`minimatch` | GHSA-mh99-v99m-4gvg（high・無制限展開による OOM） | `npm audit fix` | 解消 |
| 2026-07-30 | `sharp` 0.34.5→**0.35.3** | `next` の optionalDependency（`^0.34.3` 固定のため audit fix では上がらない） | GHSA-f88m-g3jw-g9cj（libvips 継承 CVE-2026-33327 / 33328 / 35590 / 35591） | `package.json` の **`overrides.sharp: "^0.35.3"`** | 解消 |
| 2026-07-30 | `postcss` 8.4.31→**8.5.25** | `node_modules/next/node_modules/postcss`（next が `8.4.31` を**厳密指定**するため audit fix では上がらない） | GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849（high・`sourceMappingURL` 経由の任意ファイル読取／パストラバーサル）, GHSA-qx2v-qp2m-jg93（moderate） | `package.json` の **`overrides.postcss: "^8.5.23"`**（トップレベルへ dedupe され入れ子は消滅） | 解消 |

> [!note] `overrides` を使った理由と妥当性
> `next@15.5.22` は `sharp@^0.34.3`（＝`<0.35.0`）と `postcss@8.4.31`（厳密指定）を要求するため、
> **`npm audit fix` だけでは sharp / postcss の high は解消できない**（実測確認済み）。
> 一方で **Next.js 上流の canary（`next@16.3.0-canary`）は既に `sharp@^0.35.3` / `postcss@8.5.23`
> を採用済み**であり、この組み合わせは上流の想定内。`next` の image-optimizer が使う sharp API は
> `sharp()` と `sharp.concurrency()` のみで、0.35 系でも変化していない。
> `overrides` は `npm ci` のコールドインストールでも同一に解決されることを確認済み
> （sharp 0.35.3 / libvips 8.18.3、`/_next/image` の AVIF・WebP 変換が実動）。
> **`next` のメジャー更新（16.x）は影響が大きいため本対応では見送っている。**

> 運用ルール:
> - `npm install` は使わず **`npm ci`** のみ（lockfile を唯一の真実とする）。
> - 新規に追加された advisory は、まず `npm audit fix` / 個別更新 / `overrides` で解消する。
> - 直ちに修正できない場合のみ本台帳に「無視理由・影響評価・再評価期日」を明記する。
>   **`ci.yml` の audit ステップを warning へ戻すのは禁止**（2026-07-30 以前に high 4 件が
>   滞留した原因そのもの）。
> - allowlist は恒久化しない。各エントリに必ず再評価期日を残す。
> - `overrides` は上流が追いついたら外す。`next` が sharp 0.35 / postcss 8.5 を正式採用した
>   時点（16.3 系の想定）で再評価する。

---
