> ⚠️ **アーカイブ（2026-07-18 / REQ-282）**: REQ-268（スマホ・レスポンシブ総仕上げ）に統合済み。現況は `docs/requirements/REQ-268-mobile-responsive-hardening.md` を参照。

# レスポンシブ対応 全面改善 要件定義書

**プロジェクト:** ザリガニダス（秋田県外来生物情報マップシステム）
**作成日:** 2026-03-23
**バージョン:** 2.0

> **📌 後継ドキュメント（2026-07-12）:** 本書以降に追加された画面（LP・コレクション3D・調査依頼・種別/地域/データセット等）を含む現行コードの再監査結果と、本書の未解決項目（EditProfileModal・focus-visible統一・date入力・ローディング統一）の引き継ぎは **[REQ-268](REQ-268-mobile-responsive-hardening.md)** に統合済み。今後は REQ-268 を参照。

---

## これは何か

2026-03-23 時点のレスポンシブ対応 全面改善の要件定義書（v2.0）。長いため Step 単位で分割し、本文は `responsive-mobile/` 配下へ逐語で移した。この入口ファイルは要点と部品への index のみを持つ。

## 目的・背景の要約

ザリガニダスは野外でスマホから投稿する利用シーンが中心だが、管理画面のモーダル・ボトムナビ（8項目）・44px 未満のタッチターゲット・フォントと余白・ダークモードのコントラストにモバイル起因の問題が残っていた。これを全画面（モバイル 375px〜／タブレット 768px〜／PC 1024px〜）で解消するのが本書の目的。新機能追加・バックエンド/DB 変更・PWA オフライン改善・デスクトップ専用レイアウトは対象外。

## 主要な決定事項（要点）

- フロントエンドのみの変更とし、**API 変更・DB 変更・マイグレーションは不要**（Step 6〜8）。
- 機能要件は FR-001〜FR-008。P1 は管理テーブルのカード変換・セーフエリア統一・モーダル最適化・タッチターゲット 44px 保証で、いずれも ✅ 完了。
- P2 の FR-004（ローディング状態のモバイル対応）のみ 🟡 部分完了で、他（ボトムナビ改善・フォント/余白・ダークモードコントラスト）は完了。
- 残存は 🟢 LOW の 2 件（AdminLogsPage の `type="date"` フィルター、全画面の `focus-visible:ring-2` 統一）。これらは後継の REQ-268 へ引き継いだ。
- 検証は 375px / 768px / 1280px の 3 ブレークポイントでチェックリスト方式。

## 分割ファイル

- [01-step-1-overview.md](responsive-mobile/01-step-1-overview.md) — Step 1 要件概要（背景・目的／スコープ／前提条件・制約）
- [02-step-2-user-stories-us-001-003.md](responsive-mobile/02-step-2-user-stories-us-001-003.md) — US-001 管理テーブル閲覧／US-002 フォーム入力／US-003 ダッシュボード
- [03-step-2-user-stories-us-004-006.md](responsive-mobile/03-step-2-user-stories-us-004-006.md) — US-004 管理ナビ／US-005 統計・ランキング／US-006 地図・リスト切替
- [04-step-3-fr-001-003.md](responsive-mobile/04-step-3-fr-001-003.md) — FR-001 テーブル→カード変換／FR-002 44px 保証／FR-003 セーフエリア統一
- [05-step-3-fr-004-007.md](responsive-mobile/05-step-3-fr-004-007.md) — FR-004 ローディング／FR-005 モーダル／FR-006 ボトムナビ／FR-007 フォント・余白
- [06-step-3-fr-008-and-step-4-nonfunctional.md](responsive-mobile/06-step-3-fr-008-and-step-4-nonfunctional.md) — FR-008 ダークモードコントラストと Step 4 非機能要件
- [07-step-5-screen-specs.md](responsive-mobile/07-step-5-screen-specs.md) — Step 5 画面仕様 SC-001〜SC-010（ホーム・管理各画面・トレンド・ランキング等）
- [08-step-6-9-plan-and-remaining-issues.md](responsive-mobile/08-step-6-9-plan-and-remaining-issues.md) — Step 6〜8（変更不要の判断）、Step 9 実装優先度表、画面別 残存問題一覧
- [09-verification-checklist-and-summary.md](responsive-mobile/09-verification-checklist-and-summary.md) — 375/768/1280px の検証チェックリストとサマリー・次のアクション
