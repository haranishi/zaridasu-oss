> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリガニダス 課題別 要件定義書

> 対象アプリ: ザリガニダス（秋田県ザリガニ出没情報マップ）
> 技術スタック: React + Vite / Supabase / Tailwind CSS / Leaflet.js
> 作成日: 2026-03-14

---

## これは何か

2026-03-14 時点で洗い出した課題を REQ-001〜REQ-014 として定義した要件定義書。長いため REQ 単位で分割し、本文は `requirements/` 配下へ逐語で移した。この入口ファイルは目次と要点のみを持つ。

## 目的・背景の要約

初期リリース後のコードレビューで見つかった課題を、緊急（セキュリティ・データ整合性）／重要（品質基盤）／パフォーマンス／UX の 4 カテゴリに分類し、それぞれ背景・ユーザーストーリー・機能要件・実装指針の形で記述したもの。優先度は末尾のマトリクスで一覧化している。

## 主要な決定事項（要点）

- **即対応（🔴 緊急）**: REQ-001 スパム対策（localStorage 依存をやめサーバー側で制限）、REQ-002 bullfrog のスキーマ不整合、REQ-003 エラーハンドリング統一、REQ-004 写真削除時の orphan ファイル防止。
- **1週間以内**: REQ-007 逆ジオコーディング失敗通知、REQ-008 複数写真アップロードの途中失敗処理、REQ-012 モバイルキーボード対応。
- **計画対応**: REQ-005 テストカバレッジ拡大、REQ-006 TypeScript 導入、REQ-009 / REQ-010 の再計算・再描画最適化、REQ-013 フォーカス管理、REQ-014 楽観的更新。
- **将来対応**: REQ-011 管理画面ページネーション最適化。

---

## 目次

### 🔴 緊急
- [REQ-001: スパム対策強化](#req-001-スパム対策強化)
- [REQ-002: bullfrog とスキーマの不整合修正](#req-002-bullfrog-とスキーマの不整合修正)
- [REQ-003: エラーハンドリングの統一化](#req-003-エラーハンドリングの統一化)
- [REQ-004: 写真削除の不整合修正（orphan ファイル防止）](#req-004-写真削除の不整合修正orphan-ファイル防止)

### 🟠 重要
- [REQ-005: テストカバレッジの拡大](#req-005-テストカバレッジの拡大)
- [REQ-006: TypeScript 導入](#req-006-typescript-導入)
- [REQ-007: 逆ジオコーディング失敗時の通知](#req-007-逆ジオコーディング失敗時の通知)
- [REQ-008: 複数写真アップロードの途中失敗処理](#req-008-複数写真アップロードの途中失敗処理)

### 🟡 パフォーマンス
- [REQ-009: mapBounds 変更時の再計算最適化](#req-009-mapbounds-変更時の再計算最適化)
- [REQ-010: ヒートマップの再描画最適化](#req-010-ヒートマップの再描画最適化)
- [REQ-011: 管理画面ページネーションの最適化](#req-011-管理画面ページネーションの最適化)

### 🔵 UX
- [REQ-012: モバイルキーボード表示時のフォーム対応](#req-012-モバイルキーボード表示時のフォーム対応)
- [REQ-013: フォーカス管理の改善](#req-013-フォーカス管理の改善)
- [REQ-014: 楽観的更新の導入](#req-014-楽観的更新の導入)

---

## 分割ファイル

- [01-req-001-spam-defense.md](requirements/01-req-001-spam-defense.md) — 🔴 緊急カテゴリの入口と REQ-001 スパム対策強化
- [02-req-002-bullfrog-schema.md](requirements/02-req-002-bullfrog-schema.md) — REQ-002 bullfrog とスキーマの不整合（正式サポート／削除の判断基準つき）
- [03-req-003-error-handling.md](requirements/03-req-003-error-handling.md) — REQ-003 エラーハンドリング統一化（メッセージ設計・ハンドラー設計）
- [04-req-004-photo-delete-orphan.md](requirements/04-req-004-photo-delete-orphan.md) — REQ-004 写真削除の不整合修正とフロー設計
- [05-req-005-test-coverage.md](requirements/05-req-005-test-coverage.md) — 🟠 重要カテゴリの入口と REQ-005 テストカバレッジ拡大・テスト環境
- [06-req-006-typescript.md](requirements/06-req-006-typescript.md) — REQ-006 TypeScript 導入と移行戦略
- [07-req-007-reverse-geocoding.md](requirements/07-req-007-reverse-geocoding.md) — REQ-007 逆ジオコーディング失敗時の通知と UI 設計
- [08-req-008-multi-photo-upload.md](requirements/08-req-008-multi-photo-upload.md) — REQ-008 複数写真アップロードの途中失敗処理とフロー設計
- [09-req-009-mapbounds-optimization.md](requirements/09-req-009-mapbounds-optimization.md) — 🟡 パフォーマンスカテゴリの入口と REQ-009 mapBounds 再計算最適化
- [10-req-010-011-render-and-pagination.md](requirements/10-req-010-011-render-and-pagination.md) — REQ-010 ヒートマップ再描画最適化／REQ-011 管理画面ページネーション最適化
- [11-req-012-mobile-keyboard.md](requirements/11-req-012-mobile-keyboard.md) — 🔵 UX カテゴリの入口と REQ-012 モバイルキーボード表示時のフォーム対応
- [12-req-013-focus-management.md](requirements/12-req-013-focus-management.md) — REQ-013 フォーカス管理の改善と実装指針
- [13-req-014-optimistic-update.md](requirements/13-req-014-optimistic-update.md) — REQ-014 楽観的更新の導入
- [14-priority-matrix.md](requirements/14-priority-matrix.md) — 改善優先度マトリクス（影響度・実装コスト・推奨対応）
