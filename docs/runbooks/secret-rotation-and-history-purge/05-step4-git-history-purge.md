## Step 4. git 履歴からの除去（★破壊的・ユーザー判断で実行）

> **このエージェントは実行しない。** 以下はユーザーが手で行う手順。**必ずバックアップを取ってから**。

### 4-0. 事前調査（どこに何が残っているか）

```bash
# 値そのものではなく「どのコミット / ファイルに含まれるか」を特定する
git log --all --oneline -S 'AIzaSy'      # Gemini キー型の文字列を含むコミット
git log --all --oneline -- docs/verification-2026-05-13.md
git log --all --oneline -- .env.local supabase/functions/.env   # 秘密ファイルが履歴にあるか
```

### 4-1. バックアップ（必須）

```bash
# どちらか。後で戻せるように完全な控えを取る
git bundle create ../zaridasu-backup-$(date +%Y%m%d).bundle --all
# もしくはディレクトリごと
cp -a <repo> <repo>.backup
```

### 4-2. 方法A: git filter-repo（推奨）

`git filter-repo` は高速・公式推奨。Homebrew 等で導入（`brew install git-filter-repo`）。

**(a) 値だけを履歴全体から伏字化する（ファイルは残す。今回の verification ドキュメント向け）**

`verification-2026-05-13.md` は伏字化した上で**ドキュメントとして残したい**ので、ファイル削除ではなく**文字列置換**を使う。

```bash
# 置換定義ファイルを作る。★絶対にコミットしない（作業後に削除）。
# secrets-to-purge.txt （1 行 1 シークレット。"==>" の右が置換後の文字列）:
#   literal:<旧 GEMINI_API_KEY の実値（AIzaSy で始まる文字列）>==>***REMOVED-GEMINI-KEY***
#   literal:<旧 SUPABASE_ACCESS_TOKEN の実値（sbp_ で始まる文字列）>==>***REMOVED-SUPABASE-TOKEN***
#
# 実値は本書に書かない。マスキング前の版から取得する:
#   git show <マスキング前コミット>:docs/verification-2026-05-13.md
git filter-repo --replace-text secrets-to-purge.txt

rm -f secrets-to-purge.txt   # 置換定義ファイルを必ず削除
```

**(b) 秘密ファイルごと履歴から消す（`.env.local` 等、そもそも存在すべきでないファイル）**

```bash
git filter-repo --path .env.local --path supabase/functions/.env --invert-paths
```

> 補足: `git filter-repo` は安全のため remote（origin）を自動で外す。実行後に `git remote add origin <URL>` で付け直す。

### 4-3. 方法B: BFG Repo-Cleaner（代替）

Java 製。大きなリポジトリで手軽。**BFG は最新コミット（HEAD / protected）を書き換えない**ため、
**HEAD は先にマスキング済みであること**が前提（本タスクで `verification-2026-05-13.md` は伏字化済み）。

```bash
# ミラークローンに対して実行するのが定石
git clone --mirror git@github.com:<org>/<repo>.git zaridasu.git

# 文字列置換（replacements.txt は "旧値==>置換後" 形式。これもコミットしない）
java -jar bfg.jar --replace-text replacements.txt zaridasu.git
# もしくは秘密ファイルごと削除
java -jar bfg.jar --delete-files .env.local zaridasu.git

cd zaridasu.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### 4-4. force push と共同作業者への周知

```bash
git push --force --all
git push --force --tags
```

- **force push は履歴を上書きする破壊的操作**。実行前に上記バックアップを確認。
- **共同作業者がいる場合**: 既存のローカルクローンは履歴が分岐して壊れる。全員に **再クローン**（または `git fetch` + `git reset --hard origin/<branch>`）を周知する。古いクローンから誤って force push し戻すと**漏洩値が復活する**。
- **既存の Pull Request** は履歴のずれで無効化されることがある。必要なら作り直す。
- **GitHub 上のキャッシュ / フォーク**: force push 後も、過去コミットが GitHub のキャッシュ・フォーク・既存 PR・Secret scanning の記録に残ることがある。完全消去が要るなら GitHub Support に「特定コミットのパージ」を依頼する。**いずれにせよ ①失効が済んでいれば実害はない**（だから順序が重要）。

> ザリダスは個人〜少人数の卒研 PF。共同作業者・フォークが無ければ「再クローン周知」は実質不要だが、
> 自分の別マシンのクローンや CI のキャッシュがあれば同様に更新する。

---
