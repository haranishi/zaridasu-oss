# REQ-245: 運用強度の小改善バンドル（パスワード下限・データセット完全性/レート制限・管理サーバゲート・IPv6 マスク）

## 背景
アプリ層セキュリティ監査で確認された、単体では Low だが放置すると運用リスクや説明責任のほころびになる小課題を 1 本にまとめる。いずれも既存の堅牢な設計（RLS・middleware・CAPTCHA・Sentry PII スクラブ）の隙間を埋める補強であり、低リスクで実装できる。

## 現状の問題
（ファイルパス:行番号つき）

### 1.（Low）サーバー側パスワード下限が UI ポリシーより弱い
- `supabase/config.toml:61` `minimum_password_length = 6`。アプリのクライアント検証 `validatePasswordStrength`（REQ-152）より弱く、**GoTrue へ直接サインアップすれば 6 文字パスワードで UI ポリシーを迂回**できる。
- 推奨: サーバー下限をクライアントポリシーに合わせて引き上げる（例: 8+ かつ強度要件）。

### 2.（Low・正確性）公開データセットが 1000 行で暗黙に切り詰められる
- `supabase/config.toml:17` `[api] max_rows = 1000`。`fetchPublicDataset`（`src/app/dataset/zaridasu.csv/route.ts:109-152`）は**ページング/明示 limit を行わない**ため、承認投稿が 1000 件を超えると CSV/GeoJSON が**黙って不完全**になる。オープンデータ（REQ-230）の完全性・再現性を損なう。
- 推奨: レンジ指定のページネーションで全件取得、または明示的な上限とその告知。

### 3.（Low・DoS/コスト）データセット/OG エンドポイントがレート制限外・CSV 非有界
- `src/middleware.ts:165-170` の matcher は `/dashboard`・`/admin` のみで、`/dataset/*.csv|.geojson` と `/api/og`（`src/app/api/og/route.tsx`）はエッジのレート制限を受けない（設計どおり）。CSV は `approved` 全件を行数上限なしで返す。`s-maxage=86400` の CDN キャッシュと許可リスト化フィルタで緩和されるが、`from`/`to` を細かく変えたユニークなクエリはキャッシュミスで都度 DB へ到達し得る。
- 推奨: データセットの行数上限/ページング、`/api/og`・`/dataset/*` へのプラットフォーム側（Vercel/Cloudflare）レート制限を検討し、REQ-218 のコストガードと整合させる。

### 4.（Low・DiD）管理ページにサーバー側 `getUser()` ゲートが無い
- `src/app/admin/layout.tsx` は**クライアント**コンポーネント（`AdminLayoutClient.tsx`）を描画し、各 `src/app/admin/**/page.tsx` もクライアントビューを再エクスポート。ページ層のゲートは **middleware のみ**で、実データは RLS＋admin チェック RPC が保護する（＝特権データ/書き込みは漏れない）。
- ただし middleware 単独依存であり、サーバーコンポーネントで `getUser()`＋role チェックを行えば**多層防御（defense-in-depth）**が強化され、matcher 依存を解消できる。
- 推奨: admin ルートにサーバー側の認可ゲート（`getUser()` の role 検証で未認可なら `notFound()`/`redirect`）を追加。

### 5.（Low・管理限定）IP マスクが IPv4 のみ
- `src/views/admin/AdminReportsPage.tsx:21` の `ip.replace(/(\.\d+)$/, '.xxx')` は **IPv6 アドレスをマスクしない**（フルで表示）。管理者限定画面で影響は小さいが、PII 最小化（REQ-211）の観点で一貫させたい。
- 推奨: IPv6 も含めてマスクする（末尾セグメント/ホスト部の丸め）。

## 目的
上記 5 点の小さな隙間を埋め、既存のハードニングを運用強度・データ完全性・多層防御の観点で底上げする。

## 要件

### 機能要件
- [ ] FR-245-01: `config.toml` の `minimum_password_length` をクライアントの強度ポリシー（REQ-152）と一致させ、直接サインアップでも UI 相当の下限が効くようにする。
- [ ] FR-245-02: 公開データセット取得をページネーション化し、承認投稿が `max_rows` を超えても CSV/GeoJSON が全件（または明示的に上限告知された件数）を返すようにする。
- [ ] FR-245-03: `/dataset/*` と `/api/og` にプラットフォーム側レート制限／行数上限を設定し、キャッシュミス経路の DB 到達・生成コストを抑える。
- [ ] FR-245-04: admin ルートにサーバー側 `getUser()`＋role 認可ゲートを追加し、middleware 単独依存を解消する（未認可は `notFound()` 等）。
- [ ] FR-245-05: 管理画面の IP 表示マスクを IPv6 対応にする。

### 非機能要件
- [ ] NFR-245-01: 各変更は既存機能（サインアップ・データセット DL・OG 生成・管理画面）を回帰させないこと。
- [ ] NFR-245-02: パスワード下限引き上げは既存ユーザーのログインに影響しない（新規/変更時のみ適用）。
- [ ] NFR-245-03: データセットのページネーションは CDN キャッシュ（`s-maxage`）と両立し、性能バジェット（REQ-124）を悪化させないこと。

## 受入条件
- [ ] AC-01: GoTrue 直接サインアップでも UI ポリシー未満のパスワードが拒否される。
- [ ] AC-02: 承認投稿が 1000 件超でも CSV/GeoJSON が完全（or 明示上限）で返る。
- [ ] AC-03: `/dataset/*`・`/api/og` に過剰アクセスした際、レート制限/上限が機能する。
- [ ] AC-04: 未認可ユーザーが admin ルートへ到達すると、サーバー側で拒否される（middleware を無効化しても RLS＋サーバゲートで守られる）。
- [ ] AC-05: 管理画面で IPv6 アドレスがマスクされて表示される。

## 影響範囲
- `supabase/config.toml`（`minimum_password_length` / `max_rows` 方針）
- `src/app/dataset/zaridasu.csv/route.ts`・`zaridasu.geojson/route.ts`（ページネーション）／`src/app/api/og/route.tsx`（レート制限）
- `src/app/admin/layout.tsx`（サーバーゲート）／`src/middleware.ts`（matcher 方針）
- `src/views/admin/AdminReportsPage.tsx:21`（IPv6 マスク）
- 関連 REQ: REQ-152（パスワード強度）、REQ-230（オープンデータ）、REQ-218（コストガード）、REQ-212（レート制限）、REQ-211（PII 最小化）、REQ-214（サーバー認可）。

## 優先度
- **緊急度**: Low / **重要度**: Low〜Medium
- **理由**: いずれも単体では実害が限定的だが、データセット完全性（研究再現性）・多層防御・PII 一貫性という「信頼性の総和」に効く。低リスクでまとめて対応でき、既存ハードニングの隙間を埋める。
