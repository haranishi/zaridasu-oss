# REQ-210: CI サプライチェーン防御の導入（依存監査・Dependabot・Actions SHA 固定・secret scanning・SAST）

これは何か: CI に欠けているソフトウェアサプライチェーン防御（依存監査・Dependabot・Actions のSHA固定・秘密スキャン・CODEOWNERS・SAST）をまとめて導入する要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

ザリダスの CI は品質・テスト系ジョブを揃えている一方、**サプライチェーン側の防御がほぼ未整備**である。GitHub Actions の `uses:` 17箇所はすべて可変タグ参照でコミット SHA に固定されておらず、上流タグの付け替えや上流アカウント侵害でビルドが取り込む中身がサイレントに差し替わりうる。`.github/dependabot.yml` も `npm audit` も CODEOWNERS も secret scanning も存在しない。OWASP A03（脆弱で古いコンポーネント）/ A08（ソフトウェア・データ完全性の不全）への対応にあたる。

## 主要な決定事項（要点）

- **REQ-180 / REQ-017 との境界**: REQ-180 は「CI 品質ゲートの実効性」、本REQは「サプライチェーン・ビルド基盤・secret scanning・SAST・CODEOWNERS」。**REQ-017 NFR-017-01 の一行（secret scan 導入）の正式な実装先が本REQ**であり、REQ-017 は失効・履歴除去に専念する。
- **GitHub 標準機能を主軸**にし、重いエンタープライズ施策は「任意 / 将来」へ段階化する。一人運用で継続可能な粒度に収めることが前提。
- **全 `uses:` を40桁コミット SHA に固定**し、行末に元タグをコメントで残す。とくにサードパーティ Action（`denoland/setup-deno`・`nick-fields/retry`・`supabase/setup-cli`）は必須。以後の更新は `github-actions` Dependabot に追従させる。
- **workflow レベルの安全側デフォルト `permissions: contents: read` を追加**し、必要なジョブだけが昇格する形にする（ジョブ追加時の書き忘れ対策）。
- **`pull_request_target` を安易に導入しない**ことを明文化する。現状 `pull_request` のため fork PR に secrets が渡らない安全側の設計を維持・確認する。
- **秘密の誤コミットは3層で防ぐ**: pre-commit（gitleaks）／push protection／リポジトリ全体スキャン。検知時の一次対応は「**まず失効（rotate）、次に履歴除去**」の順。
- **`NEXT_PUBLIC_*` や placeholder 値を誤検知しない allowlist 調整**を必須とする（運用を阻害しない）。
- **long-lived な静的キーより OIDC / 短命トークンを優先**する方針を明記（当面は長期トークン、段階移行は将来 TODO）。
- **新ジョブの fail は「実害ある検知時のみ」**。ノイズで常時赤にしない。`npm audit` の allowlist には必ず「無視理由・再評価期日」を残す。Dependabot は週次より細かくしない。
- **CodeQL（SAST）と OIDC 全面移行は任意 / 将来**。まず標準機能から着手する。
- 緊急度 Medium / 重要度 High。アプリ本体（`src/`）には変更なし。

## 分割ファイル

- [01-background-and-problems.md](REQ-210-ci-supply-chain-sast-secret-scanning/01-background-and-problems.md) — 背景 ＋ REQ-180/REQ-017 との境界 ＋ 現状の問題6点（可変タグ参照、`GITHUB_TOKEN` の既定権限、Dependabot と依存監査の不在、secret scanning/pre-commit の不在、CODEOWNERS とブランチ保護の不在、SAST の不在）
- [02-goals-and-requirements.md](REQ-210-ci-supply-chain-sast-secret-scanning/02-goals-and-requirements.md) — 目的4点 ＋ 機能要件 FR-210-01〜12（A. 依存サプライチェーン / B. Actions・トークン堅牢化 / C. secret scanning / D. CODEOWNERS・ブランチ保護 / E. SAST）＋ 非機能要件 NFR-210-01〜04
- [03-acceptance-impact-and-priority.md](REQ-210-ci-supply-chain-sast-secret-scanning/03-acceptance-impact-and-priority.md) — 受入条件 AC-01〜08 ＋ 影響範囲（新規/変更ファイル、コード外の GitHub 設定、他REQとの関係）＋ 優先度と理由
- [04-braces-remediation-20261023.md](REQ-210-ci-supply-chain-sast-secret-scanning/04-braces-remediation-20261023.md) — 開発依存のbraces警告の受け入れ条件・置換方針・検証記録
