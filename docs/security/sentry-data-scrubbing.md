# Sentry サーバー側 Data Scrubbing 設定手順（REQ-211 FR-211-05 / AC-06）

> 本ドキュメントは **Sentry プロジェクト設定 UI 側（リポジトリ外）の人手の運用作業**を再現可能に記録するもの。
> コード側（SDK の `beforeSend` / `beforeSendTransaction` による多層防御）は `src/lib/sentryScrub.ts` と
> 各 `Sentry.init` で実装済み。Sentry サーバー側 Data Scrubbing は**三次防御**として併用する。

## 背景 / 多層防御の位置づけ

ザリダスが Sentry に送るイベントから PII（メール・IP・トークン・投稿本文等）を除去する防御は 3 段構え:

1. **一次（クライアント）**: `src/instrumentation-client.ts` の `beforeSend` → `scrubEvent()`
2. **二次（サーバー / エッジ）**: `sentry.server.config.ts` / `sentry.edge.config.ts` の `beforeSend` → `scrubEvent()`、`beforeSendTransaction` → `scrubTransaction()`
3. **三次（Sentry サーバー側 Data Scrubbing）**: 本ドキュメントの設定（SDK を通らない経路・将来の取りこぼしに対する保険）

SDK 側（1・2）は自動収集を止め（`src/lib/sentryScrub.ts` の `SENTRY_DATA_COLLECTION`。@sentry/nextjs 10 までの `sendDefaultPii: false` の後継）、メール / IPv4 / IPv6 / JWT / Bearer / `apikey` などをマスクするが、
ザリダス固有のフィールド名（`reporter_ip` 等）は Sentry 標準パターンに含まれないため、サーバー側にも明示登録する。

## SDK 11のトレース送信（FR-211-04 / AC-04）

11.11.0の既定`traceLifecycle: 'stream'`は`beforeSendTransaction`を呼ばない。
既存のスクラブを確実に通すため、3つの初期化で共有定数`SENTRY_TRACE_LIFECYCLE`を使い、
`static`に固定する。サンプル率0.1と`SENTRY_DATA_COLLECTION`による収集停止は維持する。
回帰テスト`sentryTraceSdk.test.ts`は、実SDKの送信内容をメモリ内で検査し、
合成メール・IP・トークンが消えて有用な子spanが残ることを確認する。外部には送信しない。
SDKの型定義は`beforeSendTransaction`のv12での廃止を予告しているため、更新時はこの検証も再実行する。

## 設定手順（Sentry UI）

Sentry の Data Scrubbing は **Organization（組織）レベル**と **Project（プロジェクト）レベル**の両方で設定でき、
プロジェクト側で組織設定を継承 or 上書きできる。ザリダスは **プロジェクトレベル**で明示登録する。

1. Sentry にログイン → 対象組織 → **ザリダスのプロジェクト**を開く。
2. **Settings → Security & Privacy**（プロジェクト設定）を開く。
3. **Data Scrubbing** セクションで以下を確認・設定する:
   - **Data Scrubber**: `Enabled`（既定の機微フィールド `password` / `secret` / `passwd` / `api_key` / `apikey` / `credit card` / `authorization` 等を自動除去）。
   - **Use Default Scrubbers**: `Enabled`（標準パターンを使う）。
   - **Scrub IP Addresses**: `Enabled`（サーバー受信 IP の自動付与を防ぐ。SDK 側の `SENTRY_DATA_COLLECTION`（`userInfo: false`）と二重で担保）。
4. **Additional Sensitive Fields** に以下のフィールド名を 1 行ずつ追加する（大文字小文字は区別されない）:

   ```
   email
   ip_address
   reporter_ip
   request_ip
   ip
   client_ip
   remote_addr
   x-forwarded-for
   x_forwarded_for
   phone
   ```

   - これらのキー名を持つフィールドは値が `[Filtered]` に置換される。
   - `password` / `token` / `secret` / `authorization` / `apikey` は **Default Scrubbers** が処理するため重複登録は不要（登録しても害はない）。
5. （任意）**Safe Fields** には何も追加しない（誤って PII を素通しにしないため、ザリダスでは空のままにする）。
6. **Save** で保存。

### 確認方法

- 設定後、本番でテスト例外を送る（または既存イベントを確認）し、Sentry のイベント詳細で
  `user.email` / `request.headers.authorization` / `extra.reporter_ip` 等が `[Filtered]` または除去されていることを確認する。
- SDK 側スクラブ（`scrubEvent`）が先に効くため通常はイベント到達時点で既にマスク済み。Data Scrubbing は
  SDK を通らない経路（将来の SDK 変更・別経路の取り込み）に対する保険として機能する。

## 関連

- コード側スクラブ: `src/lib/sentryScrub.ts`（`scrubEvent` / `scrubTransaction` / `scrubString`）
- 初期化: `src/instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`
- 要件: `docs/requirements/REQ-211-sentry-pii-scrubbing.md`
- 関連要件: REQ-179（`reporter_ip` の DB 列保護 — DB で守った IP を監視経路でも漏らさない対の関係）/ REQ-200（Sentry 可観測性の堅牢化）

## 公式ドキュメント（実装時の最終確認先）

`@sentry/nextjs` のバージョン更新時は、自動収集の設定（v11 で `sendDefaultPii` が廃止され `dataCollection` へ。新しい既定は「すべて集める」）・`beforeSendTransaction` の型・
Data Scrubbing の UI 文言が変わり得るため、導入済みバージョン（確認済み `11.11.0`）の公式ドキュメントで確認すること:

- Sentry「Data Collected / Scrubbing Sensitive Data」
- Sentry「Manage Your Data → Server-Side Data Scrubbing」（Additional Sensitive Fields / Safe Fields）
