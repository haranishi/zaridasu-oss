# REQ-213: ユーザー入力検証の zod 統一（サーバー寄り検証の一元化）

これは何か: 散在したクライアント入力検証を zod スキーマ（許可リスト方式）で一元化し、あわせて「本当の信頼境界は DB である」という多層防御の役割分担を明文化する要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

ザリダスは **Server Actions を一切持たず**、クライアントから Supabase JS で直接 insert/update する設計のため、検証層が「クライアントの散在した個別実装」「DB の CHECK 制約」「RLS とトリガー」の3つに分断されている。個別実装は書式・対象・上限値がバラバラで単一ソースが無く、TypeScript の型注釈は実行時に強制されない。実際に `useSurveyRequests` の reason はクライアント500字・DB300字で**食い違って**おり、`useSurveySites` / `useProfile` に至ってはクライアント検証が**完全欠落**している。

## 主要な決定事項（要点）

- **zod をサーバー側の唯一の検証に据えることはできない**（関所が無いため）。zod の役割は (a) 送信前のクライアント検証＝UX 向上と第一の網、(b) 共有スキーマによる型・検証の単一ソース化に限定する。**敵対的入力への最終防御は既存の DB 制約（CHECK / RLS / トリガー）が担う**。
- **本REQは緊急の脆弱性修正ではない**。DB の CHECK と RLS が最終防御として機能しており、不正値は `23514` / `42501` で拒否されている。目的は検証ドリフト解消・網羅・単一ソース化・信頼境界の明文化という堅牢化。
- **ライブラリは zod を採用**（yup / joi / valibot は不採用。TS 親和性・`z.infer` による型導出・採用実績が理由）。
- **DB CHECK 制約と `src/lib/constants.ts` を正本**とし、zod スキーマをそれに一致させる。マジックナンバーは constants に集約してドリフトを恒久的に防ぐ。
- **reason 上限は 300 に統一**（`useSurveyRequests.ts` の 500 を修正）。ReportModal の comment は UI 300 / DB 500 の食い違いを本REQで統一する。
- **`password.ts` と `sanitizeOgParams()` は原則現状維持**（過剰移行を避ける）。とくに OG は「不正入力でも 500 を返さず既定値で描画する」フォールバック挙動を壊さない。
- **DB 側は一切変更しない**（NFR-213-05）。pgTAP に回帰を生じさせない。
- **zod は書き込みコードパス限定**。読み取り主体ルートのトップレベルバンドルに混入させず、`npm run size` の perf-budget 内に収める（超過時は動的 import か `zod/mini`）。
- 緊急度 Low〜Medium / 重要度 Medium。

## 分割ファイル

- [01-background-and-problems.md](REQ-213-input-validation-zod-unification/01-background-and-problems.md) — 背景（3層に分断された検証と zod の位置づけの前提）＋ 現状の問題5点（散在した3実装、書き込み8経路それぞれの検証状況、型と検証の二重管理、信頼境界の不明確さ、影響評価）
- [02-goals-and-requirements.md](REQ-213-input-validation-zod-unification/02-goals-and-requirements.md) — 目的4点 ＋ 機能要件 FR-213-01〜08（スキーマ定義の一覧と各上限値の根拠、移行方針、多層防御の明文化、i18n 方針）＋ 非機能要件 NFR-213-01〜05
- [03-acceptance-impact-and-priority.md](REQ-213-input-validation-zod-unification/03-acceptance-impact-and-priority.md) — 受入条件 AC-01〜08 ＋ 影響範囲（新規/変更/**変更しないもの＝最終防御の正本**）＋ 優先度と理由
