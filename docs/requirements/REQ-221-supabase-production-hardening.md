# REQ-221: Supabase 本番ハードニング（プロジェクト設定・GRANT・Advisor 運用）チェックリスト

Supabase の「行/列/トリガーの防御」の一段下・一段外にあたる、**プロジェクト設定・スキーマ全体の GRANT / `search_path` / `security_invoker`・Security Advisor（Splinter）の恒常運用**をまとめた設定/運用ハードニングのチェックリスト。本文は逐語で分割済み（この入口は目次と目的のみ）。

## 目的

- ザリダスの Supabase を、行/列/トリガーの防御（既存 REQ）に加えて **(A) プロジェクト設定（SSL/Network/Exposed schemas/MFA）**、**(B) スキーマ全体の最小権限 GRANT と `search_path`/`security_invoker` の網羅固定**、**(C) Security Advisor 検知ゼロの恒常運用** という設定・運用面まで多層化する。
- 一人運用の卒研 PF として現実的に回せる **チェックリスト**（コード側＝schema.sql の追補、ダッシュボード側＝設定）と、その**検証/回帰手順**を確立する。
- 「Advisor 検知ゼロ」をリリース判定の一項目として明文化し、CI ゲート実装は REQ-180/REQ-210 に接続する。

## 分割ファイル

- [01-background-and-current-issues.md](REQ-221-supabase-production-hardening/01-background-and-current-issues.md) — 背景（クライアント直結の脅威モデル、既存REQで整備済みの防御、下敷きにした Security_Research ノート）と現状の問題1〜6（最小権限の土台が無い／`SECURITY DEFINER` 2関数の `search_path` 未固定／`admin_user_list` の `security_invoker` 未設定／Exposed schemas 未最小化／ダッシュボード設定がコードで追跡されていない／Advisor を恒常的に回す仕組みが無い）
- [02-requirements.md](REQ-221-supabase-production-hardening/02-requirements.md) — 機能要件 FR-221-01〜07 と非機能要件
- [03-acceptance-impact-and-priority.md](REQ-221-supabase-production-hardening/03-acceptance-impact-and-priority.md) — 受入条件、影響範囲（本REQが担う範囲／担わない範囲＝既存REQとの境界／他機能への影響リスク）、優先度

### 境界と注意点

- 行/列/トリガーの防御は REQ-025 / REQ-034・REQ-208 / REQ-179 の担当で、**個別ポリシーの中身は本REQでは変更しない**。PITR 詳細は REQ-217、メール認証は REQ-219、CI ゲートのジョブ実装は REQ-180 / REQ-210 が主管。
- GRANT 明示化と Exposed schemas 最小化は**誤ると投稿一覧・地図・詳細が機能停止しうる**。ステージング/CI で RLS テスト＋E2E を通してから本番へ。
- `handle_new_user` は OAuth サインアップ経路に関わるため、`search_path` 固定の適用後にサインアップ E2E を確認する。
