> [!done] 実施済み（2026-07-29）
> - **FR-288-01**: #29（github-actions グループ）・#30（開発依存グループ）を取り込み。
> - **FR-288-03**: `jsdom` 29.1.1 / `eslint` 10.8.0 / `i18next` 26.3.6 を更新。
> - 検証はすべてローカルで緑: lint / type-check / i18n:check（4 ロケール 1277 キー）/ unit 652 / build / size / e2e 33。
>   ※ Playwright 1.62 はブラウザビルド 1234 を要求するため `npx playwright install` が要る（CI は package-lock 連動のキャッシュキーで自動再取得）。
> - **落とし穴（CI で検知・2026-07-29）**: npm 依存を更新したら **`supabase/functions/deno.lock` の再生成が要る**。同 lock はルート `package.json` の npm 指定も記録しており、`edge-functions` ジョブの `deno cache --frozen` が「lockfile is out of date」で落ちる。ローカルの `deno test --cached-only` は `--frozen` を伴わないため**すり抜ける**。
>   再生成: `deno cache --lock=supabase/functions/deno.lock --frozen=false $(find supabase/functions -name '*.ts')` → `--frozen` で検証。
>
> **未実施**: **`typescript` 5.9.3 → 7.0.2（#24）は見送り**。メジャー 2 つ分の差で型全域に影響するため単独 PR で検証する。FR-288-05（runbook）も未着手。

---
