## 機能要件

- **FR-296-01（更新の適用）**: `npm audit fix`（semver 範囲内更新）を適用し、本番依存の High を 0 件にする。`next` は **15.5.21 以上**へ上げる（これにより入れ子の `postcss` も追随する見込み）。
  **判断点（`sharp`）**: `sharp` は直接依存ではなく `next` の依存である。`next` の更新で `sharp >= 0.35.0` が入らない場合は、`package.json` に `overrides` で `"sharp": "^0.35.0"` を置く必要がある。**overrides はビルド互換を壊しうる（sharp はネイティブバイナリを持つ）ため、Vercel 本番のビルドで実際に解決されることを FR-296-04 で確認するまで完了としない。**
  **判断点（`brace-expansion`）**: `@sentry/nextjs` → `@sentry/bundler-plugin-core` → `glob` → `minimatch` の経路であり、実行到達はビルド時のバンドラプラグイン内に限られる（**評価・要確認**）。`@sentry/nextjs` の更新で解消しない場合、overrides で `brace-expansion` を上げるか、`.github/SECURITY_SETUP.md` の allowlist 台帳に「ビルド時のみ・再評価期日」を記録して受容するかを選ぶ。
- **FR-296-02（監査結果の確認）**: 更新後に `npm audit --omit=dev` の High / Critical が **0 件**になること。`npm run audit`（`--audit-level=high`）が **exit 0** で終わること。
- **FR-296-03（画像最適化の動作確認）**: `next build` が成功し、**画像最適化が実際に走る**ことを確認する。ビルドが通るだけでは不十分で、`sharp` の実処理まで到達させる。
  - `next start`（または `npm run dev`）で投稿写真を含むページを開き、`/_next/image?url=…&w=…&q=…` のレスポンスが `Content-Type: image/avif`（AVIF 非対応 UA なら `image/webp`）で返ること
  - `Accept: image/avif` を明示したリクエストで AVIF が返ることを確認する（下記 AC-03 のコマンド）
- **FR-296-04（Vercel 本番のビルド互換確認）**: Vercel のプレビューデプロイでビルドが成功し、`sharp` のネイティブバイナリ解決に失敗していないことをビルドログで確認する。**本番（`main`）へ入れる前にプレビューで確認すること**（ローカル macOS と Vercel の Linux でネイティブモジュールの解決が異なるため）。デプロイ後、本番の投稿一覧・詳細で画像が表示され、`/_next/image` が 200 を返すことを確認する。
- **FR-296-05（CI ゲートの昇格）**: High が 0 件になった時点で、`.github/workflows/ci.yml:395-401` の `if … else echo "::warning…"` ガードを外し、**audit ジョブを hard-fail に昇格させる**。これは REQ-210 のコメント（`ci.yml:378-380`）が明記した「既存 high が解消され次第」の条件を満たす作業である。
  **判断点**: hard-fail にすると「新しいアドバイザリが公開された日に CI が赤になる」（＝上流の都合で自分の PR が止まる）。これを避けるため、`.github/SECURITY_SETUP.md` の allowlist 台帳運用（無視理由・再評価期日を記録）を併用するか、audit ジョブのみ `continue-on-error: true` で PR は通しつつ通知を強くするかを決める。**どちらを選ぶにせよ「warning のまま放置」に戻さないこと**が本要件の眼目である。

## 受入基準

- **AC-01**: `npm audit --omit=dev` の High / Critical が **0 件**（`metadata.vulnerabilities` で確認）。`npm run audit` が exit 0。
- **AC-02**: `npm ls sharp postcss next --omit=dev` で、`sharp >= 0.35.0`、`postcss >= 8.5.18`（入れ子を含めすべて）、`next >= 15.5.21` であること。特に `node_modules/next/node_modules/postcss` に 8.5.17 以下が残っていないこと。
- **AC-03**: `next build` が成功し、画像最適化が実動する。
  ```bash
  npm run build && npm start &
  curl -s -o /dev/null -D - -H 'Accept: image/avif,image/webp,*/*' \
    'http://localhost:3000/_next/image?url=%2Ficons%2Ficon-512.png&w=640&q=75' | grep -i 'content-type'
  # 期待: content-type: image/avif（AVIF が無効な環境なら image/webp）
  ```
- **AC-04**: Vercel のプレビューデプロイでビルドが成功し、ビルドログに `sharp` の解決エラー・インストール警告が無い。プレビュー環境で投稿写真が表示され、`/_next/image` が 200 を返す。
- **AC-05**: `.github/workflows/ci.yml` の audit ステップが High で **fail する**（または allowlist 台帳と併用した恒久方針が同ファイルのコメントと `.github/SECURITY_SETUP.md` に記録されている）。
- **AC-06**: `supabase/functions/deno.lock` を再生成済みで、`deno cache --lock=supabase/functions/deno.lock --frozen` が通る。
  > REQ-288 の落とし穴: npm 依存を更新すると同 lock が古くなり `edge-functions` ジョブの `deno cache --frozen` が「lockfile is out of date」で落ちる。ローカルの `deno test --cached-only` は `--frozen` を伴わないため**すり抜ける**。
  ```bash
  deno cache --lock=supabase/functions/deno.lock --frozen=false $(find supabase/functions -name '*.ts')
  ```
- **AC-07**: `lint` / `type-check` / 既存 652 テストがパスする。あわせて `npm run size`（size-limit）と e2e が緑であること（`next` のマイナー更新はバンドルサイズとルーティング挙動に影響しうるため）。
