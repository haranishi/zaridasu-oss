# REQ-296: 本番依存の既知脆弱性更新（sharp / PostCSS）

これは何か: 本番依存ツリーに滞留していた High 4件（sharp / postcss / next / brace-expansion）を解消し、CI の audit ゲートを hard-fail へ昇格させた要件定義と実施記録（P1 / High / セキュリティ（依存）/ **✅ 実装済み 2026-07-30**）。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

`npm audit --omit=dev` で High 4件が滞留していた。REQ-269 が「本番依存の High を0件にする」を掲げた後、**再び4件に戻っている**状態である。うち `sharp` は `next/image` の最適化経路で実際に使われ、ユーザー投稿写真という「攻撃者が内容を選べる画像」がその経路を通る。構造的な原因は、CI の audit ステップが `npm run audit` の exit code を `if…else echo "::warning"` で**打ち消していた**こと——REQ-210 導入時に既存 High があったため warning に落とし、「解消され次第 hard-fail に昇格する」と決めたまま昇格していなかった。

## 主要な決定事項（要点）

- **対応は起票タイトルの2件だけでなく High 4件すべてを対象にする**（再実測でも同一の4件だった）。
- **`npm audit fix` だけでは2件が解消しない**ことが判明。`next@15.5.22` は `sharp@^0.34.3`（`<0.35.0`）と `postcss@8.4.31`（厳密指定）を要求し、**`next` を 16.2.12 に上げても同じ**。よって **`package.json` の `overrides` が必須**と判断した。
- **`next` のメジャー更新（16.x）は見送り**（影響が大きく本要件のスコープ外）。適用は `next` 15.5.20→15.5.22、`brace-expansion` 5.0.7→5.0.9、`overrides` で `sharp` 0.35.3・`postcss` 8.5.25（入れ子は dedupe で消滅）。
- **`overrides` の妥当性の根拠**: Next.js 上流の canary が既に `sharp@^0.35.3` / `postcss@8.5.23` を採用しており、image-optimizer が使う sharp API は `sharp()` と `sharp.concurrency()` の2つのみで 0.35 系でも不変。
- **落とし穴**: npm 11.6.2 は `package-lock.json` の root に `overrides` を書かないため、**`package.json` の `overrides` を消すと lockfile 再生成で 0.34.5 / 8.4.31 に戻る**。両ファイルはセットで扱う。
- **CI ゲートを hard-fail へ昇格**（FR-296-05・AC-05 達成）。「warning のまま放置」に戻さないことが本要件の眼目で、恒久方針は `.github/SECURITY_SETUP.md` §4 に記録。
- **残作業2件**: AC-04（Vercel プレビューでの Linux x64 `sharp` 解決確認。`sharp@0.35.3` は `engines.node: ">=20.9.0"` に厳格化）と AC-06（`supabase/functions/deno.lock` 再生成）は**未実施**。ほか e2e 未実行、上流が sharp 0.35 を正式採用したら `overrides` を解消。

## 分割ファイル

- [01-summary-and-background.md](REQ-296-dependency-vulnerabilities-sharp-postcss/01-summary-and-background.md) — 作成日・優先度・状態・関連・参照 ＋ 背景（実測4件の一覧表とアドバイザリ、問題A: 画像最適化経路、問題B: 入れ子 PostCSS、問題C: CIゲートが発火しない構造）
- [02-requirements-and-acceptance.md](REQ-296-dependency-vulnerabilities-sharp-postcss/02-requirements-and-acceptance.md) — 機能要件 FR-296-01〜05（overrides の判断点を含む）＋ 受入基準 AC-01〜07（検証コマンド付き）
- [03-implementation.md](REQ-296-dependency-vulnerabilities-sharp-postcss/03-implementation.md) — 実施状況: 着手時の再実測、`npm audit fix` で2件が解消しない理由、適用した更新の before/after 表、overrides の根拠と lockfile の注意
- [04-status-and-remaining.md](REQ-296-dependency-vulnerabilities-sharp-postcss/04-status-and-remaining.md) — 受入基準の達成状況（AC-01〜07）、CSS生成の確認、残作業4件、要確認3件（うち2件は決着済み）
