# REQ-081: マイク権限不可問題の根治と権限失敗時の救済 UX

> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-069（音声録音）/ REQ-079（hash dedup）/ REQ-080（音声プレビュー）
> **優先度**: 🔴 最優先（音声機能が**完全に使えない**バグ）

---

## これは何か

「🎤 鳴き声で投稿」がユーザーの許可有無に関係なく必ず失敗する不具合の原因特定と、
権限が取れなかった場合の救済 UX を定義した要件。詳細は
`REQ-081-mic-permission-and-fallback/` 配下の各部品に分割している。

## 目的・背景（要約）

録音ボタンを押すと即「マイク権限が必要です」と出るが、実際はユーザーの拒否ではなく
アプリのレスポンスヘッダがマイクを全面禁止しているため `getUserMedia` が
`NotAllowedError` を即投げている。加えて Permissions API の事前確認、Secure Context
チェック、In-App ブラウザ検出、OS 別の再設定案内がいずれも実装されていない。

## 主要な決定事項（要点）

- **真因は `next.config.ts:24` の `Permissions-Policy: camera=(), microphone=()`**。
  `microphone=()` は「どのオリジンも不許可」の意味で `self` も含まれない。
- **修正は `microphone=(self)`**（third-party iframe からの横取り防止は維持）。これだけで P0 は解消見込み。
- 権限フローを強化する: Permissions API 事前確認 / Secure Context 検証 / In-App ブラウザ検出 /
  getUserMedia のエラー名ごとの分岐メッセージ。
- 拒否時は**強制で弾かず** `mode='upload'` へ自動フォールバックし、「許可方法を見る」で OS 別手順を出す。
- In-App ブラウザ（LINE / X / Instagram / Facebook）は明示的に未サポート扱いとし外部ブラウザへ誘導。
- ネイティブアプリ化と波形ビジュアライザ強化はスコープ外。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview-and-problem.md](REQ-081-mic-permission-and-fallback/01-overview-and-problem.md) | 要件概要・問題の特定（スモーキングガン）・スコープ・前提条件と制約 |
| [02-user-stories.md](REQ-081-mic-permission-and-fallback/02-user-stories.md) | ユーザーストーリー US-081-01〜04（正常録音・拒否後の代替手段・再設定案内・In-App 対応） |
| [03-functional-requirements.md](REQ-081-mic-permission-and-fallback/03-functional-requirements.md) | 機能要件 FR-081-01〜07（ヘッダ是正・Permissions API・環境検出・エラー詳細化・手順モーダル・自動フォールバック・テスト） |
| [04-non-functional-requirements.md](REQ-081-mic-permission-and-fallback/04-non-functional-requirements.md) | 非機能要件（性能・UX 文言方針・セキュリティ・対応ブラウザ・アクセシビリティ） |
| [05-screen-spec-and-api.md](REQ-081-mic-permission-and-fallback/05-screen-spec-and-api.md) | 画面仕様 SC-081-01〜03 と、API / データモデル / マイグレーション（いずれも変更なし） |
| [06-impact-and-i18n.md](REQ-081-mic-permission-and-fallback/06-impact-and-i18n.md) | 影響範囲（変更・新規ファイル一覧）と追加する i18n キー |
| [07-acceptance-and-risks.md](REQ-081-mic-permission-and-fallback/07-acceptance-and-risks.md) | 受け入れ基準 AC-081-01〜08 とリスク・トレードオフ |
| [08-plan-and-hypotheses.md](REQ-081-mic-permission-and-fallback/08-plan-and-hypotheses.md) | 実装優先度と計画（P0〜P3）、仮説検証マトリクス H1〜H4 |
| [09-summary.md](REQ-081-mic-permission-and-fallback/09-summary.md) | サマリーと次のアクション |
