## 影響範囲

### 新規

- 外部施策向け計測 URL ユーティリティ（FR-289-02）
- `from` 台帳モジュール（FR-289-03 / 04 / NFR-289-03）
- `docs/runbooks/` 計測検証手順（FR-289-08）
- ベースライン記録文書（FR-289-07）

### 変更

- `src/lib/shareUtm.ts` — `utm_content` 対応
- `src/views/HomePage.tsx:160-172` — `from` の検証・丸め
- `src/components/modals/AuthModal.tsx:85-99, 312-318` — 台帳モジュールの利用
- `src/views/AuthCallbackPage.tsx:19-24` — 同上
- `src/components/features/…/SignupBanner`（FR-289-06 を実施する場合）

### 他機能への影響

- **REQ-284（紹介ストーリー）**: `/lp` 導線と役割が重複する。**どちらを初見ユーザーの入口にするかを先に決めないと、両方が中途半端になる**
- **REQ-283（フィールド探索モード）**: 未実装。将来 `utm_content` の粒度に探索セル由来の流入が加わりうる
- **zarigani-game**: 送客リンクに `from` / UTM を付ける改修が別リポジトリ側に必要。**本要件の台帳が決まるまでゲーム側を触らない**こと（値の不一致を防ぐ）

---
