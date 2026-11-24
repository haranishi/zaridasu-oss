# REQ-293: PWA配信基盤の修復とオフライン到達性の確保

作成日: 2026-07-30
優先度: **P0** ／ 深刻度: **High** ／ 種別: PWA・配信基盤
状態: **一部実装済み（2026-07-30）** ／ 未実装: **FR-293-07 の「送信を再開」ボタン**（i18n キー追加が必要）と **FR-293-08 の回帰ガード**（E2E・Lighthouse assertion）（→ 末尾「実施状況」）
関連: REQ-267（SW初回インストールのリロード回避）, REQ-276（動的OG・manifest強化）, REQ-020(FR-018/FR-020: SWキャッシュバージョニングとオフライン判定の初出), REQ-277（i18nハードコード日本語）, REQ-183（オフライン下書きの i18n キー保持）

## これは何か

「屋外の水辺で現地から投稿する」というザリダスの前提を支える PWA 配信基盤が、
配信物レベルで壊れていた（manifest 404・オフライン画面不発・HTML 無キャッシュ）ことの修復要件。
最小修復（manifest 1行）からオフライン到達性の回復、キャッシュ戦略の分離、
オフライン画面の多言語化、送信中スタック下書きの救出までを扱う。

## 主要な決定事項の要点

- **manifest は App Router の生成パスに合わせる**（`/manifest.json` → `/manifest.webmanifest`）。
  `public/manifest.json` の新設や `rewrites` は採らず、正本を `src/app/manifest.ts` の1箇所に保つ。
- **オフライン判定は文言に依存させない**。`isNetworkError()` を撤去し、ナビゲーション catch は
  無条件でオフラインフォールバックを返す（WebKit の `Load failed` を文字列追加する対症療法は採らない）。
- **app shell は stale-while-revalidate ＋ install 時ウォームの併用**（未確定事項1＝A＋B）。
  HTML とチャンクの世代を必ず揃えるため、バージョン非依存キャッシュに HTML は置かない。
- **キャッシュを2本に分離**：precache（バージョン付き・activate でパージ）と
  `zaridasu-assets`（バージョン非依存・200件上限の簡易LRU・パージしない）。
- **オフライン画面の多言語化は方式A**（`public/offline.html` に4言語埋め込み＋`navigator.language`）。
  二重管理である旨をファイル冒頭にコメントで明示する（未確定事項2）。
- **`'sending'` スタックは `sendingStartedAt` ＋ 5分の stale 復帰で救出**。既存レコードは
  未設定を無条件 stale と判定＝初回 `refresh()` で一律 `'pending'` へ戻す（未確定事項3＝B相当）。
- 未確定のまま残っているのは **未確定事項4（`installable-manifest` を error にするか warn か）** のみ。

## 実施状況（要約）

FR-293-01〜06 と FR-293-07 の一部（`sendingStartedAt`・自動 stale 復帰）、
FR-293-08 の一部（manifest 配信 E2E）が 2026-07-30 に実装済み。
未実装は **「送信を再開」ボタン**（i18n キー競合のため未着手・自動復帰で救出自体は可能）と、
**オフライン下書き到達の E2E**（AC-05 未達）・**Lighthouse の manifest 系 assertion**。
AC-03 / AC-04 / AC-06 / AC-08 は実機確認が残っている。

## 目次（各部品）

- [01-summary-and-problem-a-manifest-404.md](REQ-293-pwa-delivery-and-offline-reachability/01-summary-and-problem-a-manifest-404.md)
  — 0. 要件サマリー、および問題A（配信HTMLの manifest リンクが404でPWAインストール導線が全滅／CIで検知されない）。
- [02-problem-b-c-offline-unreachable.md](REQ-293-pwa-delivery-and-offline-reachability/02-problem-b-c-offline-unreachable.md)
  — 問題B（iOS Safari の `Load failed` が `isNetworkError()` に一致せずオフライン画面が出ない）と問題C（HTML 無キャッシュでオフライン下書き保存に到達できない）。
- [03-problem-d-e-f-cache-i18n-sending-stuck.md](REQ-293-pwa-delivery-and-offline-reachability/03-problem-d-e-f-cache-i18n-sending-stuck.md)
  — 問題D（キャッシュ名がコミットSHAでデプロイ毎に全破棄＋タブ強制リロード）、問題E（オフライン画面が日本語固定）、問題F（`status:'sending'` で永久スタックし再送不可）。
- [04-functional-requirements.md](REQ-293-pwa-delivery-and-offline-reachability/04-functional-requirements.md)
  — 機能要件 FR-293-01〜08（manifest 修正・無条件フォールバック・app shell・キャッシュ分離・リロード抑止・多言語化・stale復帰・回帰ガード）。
- [05-acceptance-criteria-and-open-decisions.md](REQ-293-pwa-delivery-and-offline-reachability/05-acceptance-criteria-and-open-decisions.md)
  — 受入基準 AC-01〜AC-11 と、未確定事項1〜5の選択肢および決定内容の表。
- [06-status-implemented-and-fr03-design.md](REQ-293-pwa-delivery-and-offline-reachability/06-status-implemented-and-fr03-design.md)
  — 実施状況（2026-07-30）の実装済み一覧と、FR-293-03 で install 時ウォームを併用した設計理由・採らなかった案。
- [07-status-not-implemented.md](REQ-293-pwa-delivery-and-offline-reachability/07-status-not-implemented.md)
  — 未実装（次の波）：「送信を再開」ボタン、オフライン到達 E2E、Lighthouse assertion、実機確認が必要な AC。
- [08-open-checks-and-impact.md](REQ-293-pwa-delivery-and-offline-reachability/08-open-checks-and-impact.md)
  — 要確認（WebKit のメッセージ文言、`/dashboard` のHTMLキャッシュとプライバシー、Lighthouse の audit ID）と影響範囲（変更コード一覧・他要件への影響）。
