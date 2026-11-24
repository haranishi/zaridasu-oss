# REQ-290: 資格情報の失効とローカル秘密の封じ込め

作成日: 2026-07-30
優先度: **P0** ／ 深刻度: **High** ／ 種別: セキュリティ（運用）
状態: **提案 / 未実装**
関連: REQ-017（機密ローテーションと履歴クリーンアップ）, REQ-210（CI secret scanning / pre-commit）, REQ-239（secret rotation と git 履歴 purge）, REQ-287（Supabase キー移行）
runbook: `docs/runbooks/secret-rotation-and-history-purge.md`

> [!important] 本要件の性質（スコープの切り分け）
> **主体は「人手の運用タスク」であり、コード変更は FR-290-03（`.gitignore`）と FR-290-04（gitleaks の走査範囲拡張）の 2 つだけ**である。
> FR-290-01（失効）・FR-290-02（allowlist の掃除）・FR-290-05（runbook 終了条件の実チェックと台帳化）はリポジトリを変更しても達成できない。
> 実装者は「コードを直せば終わる要件」として扱わないこと。逆に、コード側だけ先に入れても資格情報が生きている限りリスクは下がらない。**FR-290-01 を最優先で行う。**

## 背景

### 問題A: `.claude/settings.local.json` に資格情報 7 種が平文で常駐している — High

`.claude/settings.local.json` は `permissions.allow` のみを持つ 540 行・533 エントリの許可リストで、その中に **secret 形状の文字列が 30 箇所・7 種**、平文で埋め込まれている（実測・2026-07-30）。

| 種別 | 数 | 出現箇所（代表） |
|---|---:|---|
| Supabase Personal Access Token（`sbp_` 始まり） | 3 種 | `.claude/settings.local.json:46-49`, `:52` 付近, `:152`, `:154-155`, `:160-169` |
| Gemini API キー（`AIzaSy` 始まり） | 2 種 | `:47`, `:165` |
| JWT（`eyJ` 始まり。**本番プロジェクトの anon JWT を含む**） | 2 種 | `:52` |

いずれも「過去に一度実行したコマンド文字列がそのまま許可パターンとして保存された」結果であり、たとえば `:46`・`:160-169` は `SUPABASE_ACCESS_TOKEN=sbp_… npx supabase functions deploy …` の形、`:48` は `Authorization: Bearer sbp_…` を付けて `https://api.supabase.com/v1/projects/<project-ref>/database/query` を直接叩く形である。

**悪用シナリオ**: Supabase PAT は Management API のフルアクセス資格情報である。`:48` のエントリが示すとおり、この PAT で任意 SQL を実行できる。したがって PAT が 1 本でも生きていれば、**DB 全体のダンプ・全 API キー（`service_role` を含む）の再取得・Edge Function の差し替え・プロジェクト削除**まで到達する。Gemini API キーは課金の消費、anon JWT は公開前提値だが「どの環境の値か」を攻撃者に教える手がかりになる。

### 問題B: リポジトリの `.gitignore` がこのファイルを無視していない — High

`git check-ignore -v .claude/settings.local.json` の実測結果は次の 1 行のみである。

```
<user-global-gitignore>:1:**/.claude/settings.local.json	.claude/settings.local.json
```

つまり無視の根拠は**このマシンのユーザーグローバル設定だけ**であり、リポジトリの `.gitignore` に `.claude` の記載は**ない**（grep 0 件。`.gitignore` は `node_modules/`〜`coverage/` までを列挙するが `.claude` を含まない）。

現在このファイルは**未追跡**である（`git ls-files --error-unmatch .claude/settings.local.json` → `did not match any file(s) known to git`）。**したがって「コミット済みの漏洩」ではない。** 問題は将来の一手で成立する点にある。

- 別マシン・別クローン・CI コンテナ・他の作業者の環境（グローバル `~/.config/git/ignore` を持たない環境）では無視されない
- そこで `git add -A` / `git commit -a` を 1 回実行すればコミットされ、private リポジトリでも「履歴に残る秘密」に転じる
- 同種の事故は本プロジェクトで既に起きている（`docs/verification-2026-05-13.md` に実値が入り、git 履歴に旧値が残ったことが REQ-017 の記録）

ローカル秘密の保護をユーザーのグローバル設定に依存させている限り、この事故は「起きるかどうか」ではなく「いつ起きるか」の問題になる。

### 問題C: 伏字化により「どのトークンが失効済みか」を台帳から判別できない — High（意思決定を止めている）

docs 側は REQ-017 のマスキング作業で `<GEMINI_API_KEY_REDACTED>` 等に**伏字化済み**である（`docs/archive/verification-2026-05-13.md:190-192`）。伏字化そのものは正しい対応だが、**「失効させた値」と「まだ生きている値」を突き合わせる台帳が別に無いため、いま `.claude/settings.local.json` に載っている 7 種のうちどれが既に無効かを文書から判定できない。**

生存状況はコードからは判定不能である（本監査は読み取り専用で、発行元コンソール／Management API での確認を行っていない）。

したがって安全側に倒す唯一の選択は **7 種すべてを失効させる**ことである。「たぶん REQ-017 で失効済み」という推測に基づいて一部を残す判断はしない。

### 問題D: runbook の終了条件が全項目未チェックのまま残っている — Medium

`docs/runbooks/secret-rotation-and-history-purge.md:242-249` の「終了条件（チェックリスト）」は **8 項目すべてが `- [ ]`（未チェック）**である。特に `:249` の

> `.claude/settings.local.json` 等、**ローカルのみ（gitignore 済み）に残る旧値**も、必要なら手元で消去した

が未完であることが、問題A の状態そのものである。「失効したか」「履歴から消したか」「ローカルから消したか」がどれも記録されていないため、REQ-017 / REQ-239 の完了判定ができない。

### 問題E: gitleaks は追跡ファイル／git 履歴しか見ないため、この 7 種を検知できない — Medium

- CI の gitleaks ジョブ（`.github/workflows/ci.yml:406-429`、`gitleaks/gitleaks-action@…` v3.0.0、`GITLEAKS_CONFIG: .gitleaks.toml`）
- ローカル用スクリプト `package.json:29` の `secrets:scan`（`gitleaks detect --config .gitleaks.toml --redact --verbose`）

`gitleaks detect` は git のコミット／履歴を走査するモードであり、**未追跡ファイルは対象外**である。よって現状の検知層は問題A を構造的に見つけられない。加えて `secrets:protect`（`package.json:30`、`gitleaks protect --staged`）はステージ済み差分しか見ず、かつ **pre-commit フックは未導入**（`.git/hooks` に有効なフックが無く、husky / lint-staged も無い。REQ-210 FR-210-08 が未実施）なので、自動で走る経路が存在しない。

## 機能要件

- **FR-290-01（失効・最優先／人手）**: 問題A の **7 種すべてを発行元で失効させる**。Supabase PAT 3 種は Supabase ダッシュボードの Access Tokens で revoke、Gemini API キー 2 種は Google AI Studio / GCP コンソールで削除（手順は `docs/runbooks/gemini-key-rotation.md`）、JWT 2 種は「本番プロジェクトの anon / それ以外」を切り分けて扱う。**anon JWT は公開前提値であり、無効化はフロントエンドのバンドル差し替えを伴うため本要件では失効させず、REQ-287 FR-287-06（publishable 移行）に委ねる**。失効後、新しい値は Secrets（Vercel / Supabase Function Secrets / GitHub Actions）に直接登録し、コマンド文字列・チャット・ノートに残さない。
- **FR-290-02（allowlist の掃除／人手＋設定）**: `.claude/settings.local.json` の `permissions.allow` から **secret を含むエントリを削除**する。削除により失われる利便性は、既に存在する `Bash(npx supabase:*)`（`:45`）のようなワイルドカード許可で代替し、`SUPABASE_ACCESS_TOKEN` などの値は**シェルの環境変数や `.env`（gitignore 済み）から外部供給**する形に統一する。すなわち「許可パターンの中に値を書く」運用そのものをやめる。
- **FR-290-03（コード変更）**: リポジトリの `.gitignore` に `.claude/settings.local.json` を追記する。ユーザーグローバル設定に依存せず、どのクローンでも無視される状態にする。**判断点**: `.claude/` ごと無視するか、`settings.local.json` のみを無視して共有設定（`.claude/settings.json` 等）は追跡可能に残すか。後者を推奨するが、リポジトリで共有したい Claude 設定があるかは実装時に確認する。
- **FR-290-04（コード変更）**: secret スキャンを**未追跡ファイルも対象にする形へ拡張**する。`gitleaks dir`（gitleaks v8 系では `gitleaks detect --no-git`）相当のモードを `package.json` に別スクリプトとして追加し（例: `secrets:scan:workdir`）、CI にも配線する。
  **判断点（重要）**: CI はクリーンな checkout 上で動くため、**未追跡のローカルファイルは CI には存在しない**。したがって「CI に走査を足せば問題A が検知される」は成立しない。CI 側の価値は「追跡されてしまった直後に落とすこと」であり、**問題A を実際に捕まえる層はローカル（pre-commit フックまたは手動実行）である**。実装者はこの二層を混同せず、少なくともローカル層（REQ-210 FR-210-08 の pre-commit 導入）を含めること。
- **FR-290-05（台帳化／人手＋ドキュメント）**: `docs/runbooks/secret-rotation-and-history-purge.md:242-249` の終了条件を**実際に検証してチェックする**。あわせて同 runbook に「**資格情報台帳**」を新設し、資格情報ごとに `種別 / 用途 / 発行元 / 発行日 / 失効日 / 現在の状態（有効・失効） / 保管先（どの Secrets ストアか）` を記録する。**実値は書かない**（種別と末尾数文字などの識別子のみ）。これは問題C（伏字化により追跡不能になった）の再発防止であり、「秘密を隠す」と「秘密の所在と生死を管理する」を分離する仕組みである。

## 受入基準

- **AC-01**: Supabase PAT 3 種が失効していること。失効した PAT で `curl -H "Authorization: Bearer <旧PAT>" https://api.supabase.com/v1/projects` を叩くと 401 が返る（新 PAT では 200）。
- **AC-02**: Gemini API キー 2 種が失効していること。旧キーで `generativelanguage.googleapis.com` の generateContent を叩くと 4xx（`API_KEY_INVALID` 相当）が返り、本番の AI 種判定は新キーで成功する（テスト投稿 1 件で `ai_call_logs` に成功記録）。
- **AC-03**: `grep -nE 'sbp_[A-Za-z0-9]|AIzaSy[A-Za-z0-9_-]|eyJ[A-Za-z0-9_.-]{20,}' .claude/settings.local.json` が **0 件**。
- **AC-04**: `git check-ignore -v .claude/settings.local.json` の出力が**リポジトリの `.gitignore`** を指し（グローバル `~/.config/git/ignore` ではない）、`grep -n '\.claude' .gitignore` が 1 件以上ヒットする。
- **AC-05**: 未追跡ファイルを含む走査（`gitleaks dir` 相当）が leak 0 件で終了する。走査コマンドは `package.json` の scripts から実行できる。
- **AC-06**: `docs/runbooks/secret-rotation-and-history-purge.md` の終了条件チェックリストが全項目 `- [x]`（該当なしの項目は理由を併記）になっている。
- **AC-07**: 同 runbook に資格情報台帳が存在し、7 種それぞれの状態（失効済み／有効・保管先）が判別できる。台帳に**実値が含まれていない**（AC-03 と同じ grep が docs 配下でも 0 件）。
- **AC-08**: `lint` / `type-check` / 既存 652 テストがパスする。

## 要確認

- 7 種それぞれの**現在の生存状況**は本要件の起票時点で未検証（読み取り専用監査のため）。FR-290-01 の作業中に発行元コンソールで確認し、結果を FR-290-05 の台帳に記録すること。「既に失効していた」場合も台帳にその事実を残す（次回の判断材料になるため）。
- `.claude/settings.local.json` の `:52` に含まれる JWT 2 種のうち、**どちらが本番 anon でどちらがそれ以外か**は要確認。本番 anon 以外の JWT（別プロジェクトの値・`service_role` 系）が混ざっている場合は FR-290-01 の除外対象にせず失効させる。
- 過去のマシン／別クローンに同じファイルが残っていないか（バックアップ・Time Machine・別 PC）。残っている場合、失効さえ済んでいれば無害だが、台帳には「回収不能なコピーが存在しうる」と明記する。
