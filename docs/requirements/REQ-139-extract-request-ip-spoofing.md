# REQ-139: `extract_request_ip()` の X-Forwarded-For 無検証信用による rate limit バイパス

これは何か: 匿名投稿の IP レート制限が `X-Forwarded-For` 偽装で完全にバイパスできる脆弱性と、その修正要件。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

`extract_request_ip()` は `x-forwarded-for` の**先頭値**を無条件に信頼している。このヘッダーはクライアントが自由に設定でき、エッジに届く時点で「攻撃者の指定値, エッジが追記した実IP」の形になるため、先頭を取ると攻撃者の値がそのまま採用される。結果、curl 1行で毎回ランダムな IP を名乗れば **1分3件 / 24時間10件の制限を無制限にバイパス**でき、`reporter_ip` にも偽装値が保存されて監査・IP BAN が無効化される。最も信頼できない値を採用している現状を、エッジが上書きする値を使う形に反転させる。

## 主要な決定事項（要点）

- **信頼ヘッダーの優先順位を反転**（FR-139-01）: ①`cf-connecting-ip` を最優先 → ②`x-forwarded-for` は**末尾**を採用 → ③`x-real-ip` フォールバック → NULL。
- **fingerprint 併用**（FR-139-02）: `posts.reporter_ua_hash`（`md5(user-agent)`・生UAは保存しない）を追加し、匿名投稿は `(reporter_ip, reporter_ua_hash)` ペアで判定。複合インデックスも追加。
- **緊急停止スイッチ**（FR-139-03）: `system_settings.anonymous_post_enabled`（既定 TRUE）を追加。匿名投稿の恒久廃止是非は別REQ。
- **既存データはクリーンアップしない**（FR-139-04）。監査ログとの整合性を優先し、新規 INSERT 以降のみ信頼性が上がる。
- **レート制限の数値は変更しない**（NFR-139-01。認証24時間5件／匿名1分3件・24時間10件）。集計対象IPが変わることによる一時的な変動のみ受け入れる。
- **`cf-connecting-ip` は「Supabase が Cloudflare 経由」前提に依存**（NFR-139-03）。確認できない場合は `x-forwarded-for` 末尾のみ採用に切り替える。
- **Phase 分け**: P0＝FR-139-01＋テスト（最小コストで主要リスクを潰す）／P1＝FR-139-02・04／P2＝FR-139-03＋admin UI。緊急度・重要度ともに High。

## 分割ファイル

- [01-background.md](REQ-139-extract-request-ip-spoofing/01-background.md) — 背景（現行 `extract_request_ip()` の SQL 全文、偽装が成立する理由、信頼できる値の候補）
- [02-current-problems-and-goals.md](REQ-139-extract-request-ip-spoofing/02-current-problems-and-goals.md) — 現状の問題（該当コード行・影響データ・curl による攻撃シナリオ・既存テストの穴）と目的4点
- [03-functional-requirements.md](REQ-139-extract-request-ip-spoofing/03-functional-requirements.md) — 機能要件 FR-139-01〜05（新 `extract_request_ip()` の実装案SQL、UAハッシュ併用、匿名投稿スイッチ、既存データ方針、UI誘導のメモ）
- [04-non-functional-and-data-model.md](REQ-139-extract-request-ip-spoofing/04-non-functional-and-data-model.md) — 非機能要件 NFR-139-01〜04 ＋ データモデル変更（migration の全体像SQL）
- [05-test-requirements-and-acceptance.md](REQ-139-extract-request-ip-spoofing/05-test-requirements-and-acceptance.md) — テスト要件 FR-139-06〜09（pg-tap の case 一覧）＋ 受入条件 AC-139-01〜08
- [06-impact-and-priority.md](REQ-139-extract-request-ip-spoofing/06-impact-and-priority.md) — 影響範囲（変更対象ファイル表、REQ-034/007/020 など他機能への影響）と優先度・Phase 分け
