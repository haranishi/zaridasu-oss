# REQ-211: Sentry への個人情報(PII)送信防止・データスクラビング

## これは何か

Sentry へ送るイベント／トランザクションから PII（メールアドレス・IP・トークン・投稿本文・
位置情報など）を送信前に確実に除去する要件。現状 `beforeSend` は「想定済みバリデーションエラーを
捨てる」だけで PII 除去を一切しておらず、`sendDefaultPii` の明示指定も無い。

## SDK 11での現行実装と検証（2026-11-15）

以下の要件本文はSDK 10時点の記録。現行の11.11.0では、FR-211-01の収集停止を
`Required<DataCollection>`で全項目を指定した`SENTRY_DATA_COLLECTION`で維持する。
FR-211-04の`beforeSendTransaction`は既定の`stream`では呼ばれないため、
3つの初期化を共有定数`SENTRY_TRACE_LIFECYCLE = 'static'`に固定した。サンプル率は0.1を維持する。
実SDKを使う`sentryTraceSdk.test.ts`では、修正前にフック未実行と合成PIIの残存を再現した。
修正後はメモリ内transportで、フック1回・トランザクション1件・子span1件を確認し、
メール・IP・トークンを除去して操作名・spanの識別子・時刻を保持した。実Sentryへの送信は行わない。
`sentryScrub.test.ts`は3つの実設定を読み、収集抑止・8192文字制限・エラーフィルタ・送信条件も確認する。
検証結果：対象35件、全1,982件が成功。型検査・lint・webpackビルドも成功（AC-04 / AC-08）。

## 主要な決定事項の要点

- **多層防御にする**：クライアントで一次スクラブ、サーバー/Edge で二次スクラブ、
  Sentry サーバー側 Data Scrubbing で三次スクラブ。同じ `scrubEvent` を各ランタイムで二重適用する。
- **`sendDefaultPii: false` を明示してコードに意図を固定する**。既定が false でも、
  SDK 更新や将来の既定変更で挙動がドリフトしないようにする。
- **`beforeSendTransaction` も必ず登録する**。`tracesSampleRate: 0.1` のトランザクションは
  span 名・トランザクション名に PII を含み得るが、現状スクラブが無い。
- **既存の `beforeSend` 挙動（バリデーションエラーの破棄）は維持する**。スクラブを追加で適用する。
- **スクラブは有用性を過度に損なわない**。スタックトレースのファイル/行・エラー型・`context` タグ等の
  非 PII は保持し、PII のみマスクする。
- **正規表現は ReDoS を招かない形にする**（メール / IPv4 / IPv6 / JWT を線形時間で処理）。
- **スクラブ関数は部分的な `event` でも例外を投げない純粋関数にする**（二次例外で監視自体を壊さない）。
- **Sentry の Additional Sensitive Fields はリポジトリ外の設定**なので、
  `reporter_ip` / `request_ip` / `email` / `ip_address` の登録内容と手順を `docs/` に記録して再現可能にする。
- **REQ-179 と対の関係**：DB 側で守った `reporter_ip` を監視経路で素通しにしない。
- **REQ-200 とは同じ `sentry.*.config.ts` を触るため整合が必要**。どちらが先に実装されても、
  最終状態で `global-error.tsx` を含む全初期化箇所にスクラブが適用されていること。
- **バージョン依存に注意**：`sendDefaultPii` の既定値・`beforeSendTransaction` の引数型・
  Data Scrubbing の設定場所は、実際にインストールされている `@sentry/nextjs ^10.52.0` の
  公式ドキュメント／型定義で最終確認すること。
- **緊急度 Medium / 重要度 High**（送信ガードで露出母数は限定されるが、機微データ保護の重要度は高い）。

## 目次（各部品）

- [01-background-and-req-boundaries.md](REQ-211-sentry-pii-scrubbing/01-background-and-req-boundaries.md)
  — 背景（Sentry の初期化構成と送信ガード、ザリダスが扱う PII の範囲、バージョン確認の注意）と、REQ-200 / REQ-179 との境界。
- [02-current-problems.md](REQ-211-sentry-pii-scrubbing/02-current-problems.md)
  — 現状の問題 1〜5：`sendDefaultPii` 未指定、`beforeSend` が PII を一切スクラブしていない（`beforeSendTransaction` も未設定）、サーバー側 Data Scrubbing に自社固有フィールド未登録、`captureException` 呼び出し側の規律欠如、Edge Function のメール平文ログ（CWE-532）。
- [03-goals-and-requirements.md](REQ-211-sentry-pii-scrubbing/03-goals-and-requirements.md)
  — 目的と機能要件 FR-211-01〜07（`sendDefaultPii: false`、共通スクラブ関数の除去対象 a〜d、`beforeSend` 拡張、`beforeSendTransaction`、Additional Sensitive Fields、Edge Function のログ是正、埋め込み規律）、非機能要件 NFR-211-01〜05。
- [04-acceptance-impact-and-priority.md](REQ-211-sentry-pii-scrubbing/04-acceptance-impact-and-priority.md)
  — 受入条件 AC-01〜08、影響範囲（変更ファイルと Sentry プロジェクト設定）、優先度と理由。
