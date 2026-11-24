# REQ-239: 漏洩認証情報のローテーションと git 履歴からの秘匿値除去

## 背景
ザリダス（秋田県の外来生物＝アメリカザリガニ／ウシガエルの市民科学情報マップ、卒研 PF。Next.js 15 + Supabase）は、REQ-210〜221 で CI 供給チェーン防御・gitleaks・Sentry PII スクラブ・Supabase ハードニング等のセキュリティ整備を完了している。その一方で、過去のセッションで作業メモに **平文の本番認証情報が記録され、それが git 履歴に残ったまま**という既知の重大課題（REQ-017 系）が未クローズで残っている。作業ツリー上の値は 2026-06-28 にマスキング済みだが、**マスキングはワーキングツリーの伏字に過ぎず、git 履歴（過去コミット）には旧実値が平文で残存**している。この状態が続く限り、リポジトリのクローンや GitHub 上の履歴から実キーを取り出せてしまう。

## 現状の問題
（ファイルパス:行番号つき・秘匿値そのものは本要件書に転記しない）

### 1. 作業ツリーはマスク済みだが、git 履歴に平文の実キーが残っている
- `docs/verification-2026-05-13.md:192-193` は現在マスク済み（`<GEMINI_API_KEY_REDACTED>` / `<SUPABASE_ACCESS_TOKEN_REDACTED>`）。
- 同 `:195-197` が明記：「マスキングは作業ツリー上の伏字に過ぎず、**git 履歴には旧実値が残っている**。失効（rotate）と git 履歴除去の具体手順は `runbooks/secret-rotation-and-history-purge.md` を参照（順序の鉄則: **まず失効 → 最後に履歴除去**）」。
- 実際に、当ファイルを追加したコミット `cfc2b4f`（`docs: 2026-05-13 セッションの動作確認チェックリストを追加`）の版を確認すると、Gemini API キー（`AIzaSy…`）と Supabase access token（`sbp_…`）が**平文で 2 件**含まれている（`git show cfc2b4f:docs/verification-2026-05-13.md` で確認）。
- 漏洩している認証情報の内訳（`docs/verification-2026-05-13.md:192-193` の対象）:
  - **Gemini API キー**（AI 画像/音声解析に使用。従量課金 → 悪用で課金爆発リスク）
  - **Supabase access token**（`sbp_…`。Supabase の管理操作＝プロジェクト設定・secrets・DB への広範な権限を持つ管理トークン。最も危険）

### 2. gitleaks は「検出回避のためのピン留め」であって「除去」ではない
- `.gitleaks.toml:28,51-53,72` は、既知漏洩ドキュメント `docs/verification-2026-05-13.md` を **paths で allowlist にピン留め**して CI を通している（8.24.3 が commits+matchCondition のネストを無視するための実務対応）。
- これは CI をグリーンに保つための一時措置であり、**履歴からの実値除去でも、キーの失効でもない**。ピン留めがあるために「gitleaks が通る＝安全」と誤認されるリスクがある。ピン留めは REQ-017/本 REQ 完了後に**削除**すべき負債である。

### 3. 未追跡の runbook が作成途中（対応が着手済みだが未完了）
- `docs/runbooks/secret-rotation-and-history-purge.md` が作業ツリーに存在するが **git 未追跡（untracked）**。手順の整備は始まっているが、実際のローテーション・履歴除去・ピン留め削除まで完了していない。

## 目的
漏洩した 2 つの認証情報（Gemini API キー・Supabase access token）を**確実に無効化（ローテーション）**し、その後に **git 履歴から平文の秘匿値を除去**して、クローン・過去履歴からの取得を不可能にする。完了後に gitleaks の一時ピン留めを撤去し、「検出できるから安全」ではなく「そもそも履歴に無いから安全」な状態にする。

> **順序の鉄則**: **① 失効（rotate）→ ② 新値の再設定・疎通確認 → ③ git 履歴除去 → ④ ピン留め撤去**。履歴除去を先に行っても、既にクローン/フォーク/キャッシュされた旧履歴からキーは漏れうるため、**無効化を最優先**する。

## 要件

### 機能要件
- [ ] FR-239-01: **Gemini API キーの失効・再発行**。Google AI Studio で旧キーを削除（revoke）し、新キーを発行する。新キーは**チャット/エージェント経由で平文を扱わず**、Supabase Dashboard の Edge Function secrets（`GEMINI_API_KEY` 等）へ直接投入する（`docs/verification-2026-05-13.md:200` の運用方針に一致）。
- [ ] FR-239-02: **Supabase access token（`sbp_…`）の失効・再発行**。Supabase Dashboard（Account > Access Tokens）で旧トークンを revoke し、必要な CI/ローカル運用向けに新トークンを発行して Secrets/環境変数に格納する。トークンの権限範囲（管理操作）を踏まえ、失効を最優先で実施する。
- [ ] FR-239-03: **影響調査**。旧キー/トークンの失効前に、それらが使われている箇所（GitHub Actions secrets、Vercel env、ローカル `.env`、Supabase secrets、`supabase link` 済みの CLI 設定等）を洗い出し、新値へ差し替える計画を作る。失効による正規経路の停止（AI 解析停止・CI 失敗）を避ける。
- [ ] FR-239-04: **git 履歴からの秘匿値除去**。`git filter-repo`（推奨）等で `docs/verification-2026-05-13.md` を含む全履歴から平文の Gemini キー・Supabase token を除去（該当箇所を伏字へ置換）する。force-push を伴うため、共同作業者・フォーク・CI キャッシュへの影響と再クローン手順を runbook に明記する。
- [ ] FR-239-05: **runbook の確定と追跡化**。`docs/runbooks/secret-rotation-and-history-purge.md` を git 追跡下に置き、実施記録（実施日・担当・revoke 確認・filter-repo 実行コマンド・検証結果）を残す。
- [ ] FR-239-06: **gitleaks ピン留めの撤去**。履歴除去の完了後、`.gitleaks.toml` の `docs/verification-2026-05-13.md` に対する paths ピン留め（`:51-53,72`）を削除し、全履歴スキャンでリークが検出されないことを確認する。

### 非機能要件
- [ ] NFR-239-01: 本要件の作業では**秘匿値の実値を新規にコミット・チャット・ログへ出力しない**。値の受け渡しは Supabase/GitHub/Vercel の secret ストア経由に限定する。
- [ ] NFR-239-02: 失効から新値反映までの間、AI 解析（analyze-image / analyze-audio）・CI が停止する可能性があるため、実施タイミングは低トラフィック帯を選び、`docs/runbooks/gemini-key-rotation.md`（REQ-126）と整合させる。
- [ ] NFR-239-03: 履歴の force-push はチーム/フォークに破壊的影響を与えるため、事前告知と再クローン手順（backup 取得含む）を runbook に記載してから実行する。

## 受入条件
- [ ] AC-01: 旧 Gemini キー・旧 Supabase token の双方が**無効化**され、旧値での API 呼び出し／管理操作が失敗することを確認した（revoke 確認ログを runbook に添付）。
- [ ] AC-02: 新値が正規経路（Edge Function AI 解析・CI・ローカル）に反映され、AI 解析と CI が正常動作する（health-gemini 等で疎通確認）。
- [ ] AC-03: `git log -p` / `git rev-list --all | xargs git grep` 相当で全履歴を検索しても、Gemini キー（`AIza…`）・Supabase token（`sbp_…`）の平文が**ヒットしない**。
- [ ] AC-04: `.gitleaks.toml` から当該ドキュメントの paths ピン留めを削除した状態で、`gitleaks detect`（全履歴）が**0 検出**で通る。
- [ ] AC-05: `docs/runbooks/secret-rotation-and-history-purge.md` が git 追跡下にあり、実施記録が記入済み。

## 影響範囲
- `docs/verification-2026-05-13.md`（履歴からの秘匿値除去）／git 全履歴（filter-repo・force-push）
- `docs/runbooks/secret-rotation-and-history-purge.md`（追跡化・記録）／`docs/runbooks/gemini-key-rotation.md`（REQ-126 と整合）
- `.gitleaks.toml`（ピン留め撤去）
- Supabase Edge Function secrets / GitHub Actions secrets / Vercel env / ローカル `.env`（新値反映）
- 関連 REQ: REQ-017（旧・秘匿値マスキング）、REQ-126/128/131（Gemini キー運用・webhook）、REQ-210（供給チェーン・secret scanning）、REQ-211（Sentry PII）。

## 優先度
- **緊急度**: Critical / **重要度**: Critical
- **理由**: 有効な本番認証情報が公開/共有され得る git 履歴に平文で残存している。特に Supabase access token は管理権限を持ち、悪用されればデータ流出・DB 改竄・課金悪用に直結する。作業ツリーのマスキングでは履歴の実値は消えないため、**失効（無効化）→履歴除去**を最優先で完了させる必要がある。
