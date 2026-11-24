## API仕様

新規 API なし。既存 `useSurveyRequests.createRequest`（`survey_requests` テーブルへの直接 insert）を `SurveyRequestForm` 経由で利用するのみ。

| 既存 API | 用途 | 変更 |
|---|---|---|
| `POST supabase.from('survey_requests').insert(...)` | 依頼作成 | なし |
| `useSurveyRequests().fetchRequests()` | 一覧再取得 | 呼び出し追加のみ |

---

## データモデル・DB設計

新規テーブル / カラム / インデックス / RLS 変更 **すべて無し**。

- 既存 `survey_requests` テーブルおよび関連 RLS（REQ-084 / 085 で整備済み）をそのまま利用

---

## マイグレーション計画

**該当なし**（DB 変更を伴わない UI 修正のため）。

---
