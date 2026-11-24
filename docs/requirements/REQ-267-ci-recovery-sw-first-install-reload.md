# REQ-267: CI復旧 — 未push修正の反映とSW初回リロード起因のe2eフレーク解消

## これは何か

feat/security-hardening の CI が赤のまま放置されている状態を全ジョブ緑に戻す要件。
修正済み 2 コミットの push に加え、**SW 初回インストール時の無条件リロード**という
e2e フレークの真因（かつ本番の初回訪問 UX 欠陥）をプロダクト修正として解消する。

## 主要な決定事項の要点

- **CI 都合のテスト緩和ではなくプロダクト修正で直す**。`controllerchange` のリロードは
  「登録時点で既にコントローラが存在した場合（＝真の SW 更新）のみ」に限定し、
  初回インストール（`null` → `clients.claim()` で獲得）ではリロードしない。
  `hadController` の評価は必ず**登録開始前**に行う。多重発火は `refreshing` フラグで防ぐ。
- **修正は `providers.tsx` に閉じる**。`sw.js.tpl` / `sw.js` / `build-sw.mjs` は変更しない
  （`skipWaiting` ＋ `clients.claim` は初回からのオフライン制御に必要）。
- **恒真アサーションを廃止する**。`expect(html).not.toMatch(/^Not Found$/i)` は HTML 全体への
  完全一致否定で常に成功していた。実文言への肯定アサーション（ロケータの自動待機）へ置換する。
- **`maxFailures: 1` は据え置く**。フレーク根治が本筋で、fail-fast は CI 時間節約として妥当。
- **push は fast-forward**（force-push・rebase は不要）。
- **🔴 sha256 3件の真因は jsdom 28**：Node 20 でも `crypto.subtle` プロパティ「だけ」は生えるため
  ポリフィルの条件が偽になる。テストを `// @vitest-environment node` で node 環境に移して jsdom 差を排除する。
- **🔴 `unused-css-rules` の失敗はリロード廃止の副作用**：旧コードは初回リロードしていたため
  Lighthouse が「SW 温まり後の再描画」を計測して 0 になっていた。**正直な初回描画**を測るように
  なった結果 1 機会が常に残る（`maxLength: 0` は非現実的閾値）。姉妹監査 `unused-javascript` が
  既に `off` なので整合のため `off` にし、根拠をコメントに明記する。
- **緊急度 High / 重要度 High**。修正はクライアント 2 ファイルに閉じておりリスクは低い。

## 目次（各部品）

- [01-background-failing-jobs.md](REQ-267-ci-recovery-sw-first-install-reload/01-background-failing-jobs.md)
  — 背景：失敗 4 ジョブの一覧表と失敗内容、3 ジョブは修正済みだが未 push である事実、e2e のみ未対応であること。
- [02-current-problems-a-b-c.md](REQ-267-ci-recovery-sw-first-install-reload/02-current-problems-a-b-c.md)
  — 問題A（未 push の 2 コミット）、問題B（SW 初回リロードと `page.content()` のレース：因果連鎖 5 段と緑→赤になった推定理由）、問題B-2（恒真アサーション）、問題C（本番でも全新規訪問者がリロードされる）。
- [03-goals-and-functional-requirements.md](REQ-267-ci-recovery-sw-first-install-reload/03-goals-and-functional-requirements.md)
  — 目的 2 点と機能要件 FR-267-01〜04（`controllerchange` のガード実装骨子、e2e のロケータ化、push、`maxFailures` 据え置きの判断）。
- [04-additional-requirements-and-nfr.md](REQ-267-ci-recovery-sw-first-install-reload/04-additional-requirements-and-nfr.md)
  — push 後の CI で判明した追加要件 FR-267-05（sha256 と jsdom 28 / Node 20）・FR-267-06（`unused-css-rules`）と、非機能要件 NFR-267-01〜03。
- [05-acceptance-impact-and-priority.md](REQ-267-ci-recovery-sw-first-install-reload/05-acceptance-impact-and-priority.md)
  — 受入条件 AC-01〜06、影響範囲（変更対象ファイル表・push 対象コミット・他機能への影響）、優先度と理由。
