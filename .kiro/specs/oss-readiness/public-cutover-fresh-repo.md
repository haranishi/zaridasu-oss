# 案B：公開の直前に、履歴1コミットの新しいrepoを作る

[公開切替の確認](public-cutover.md)の案B。採否は本人の判断待ち。
検証用の `zaridasu-oss` はprivateのまま残す。前提は、切替前の6〜8を満たすことと、新しいrepoの名前を決めること。元の本番repoが `zaridasu` を使っているので、名前は未決。

## 1. 材料をそろえる

- 運用repoのdevelopから `npm run oss:export -- <新しい場所>` を実行する。元の監査とexport後の監査が、どちらも0件であること。
- 公開用repo固有の調整を重ねる。`docs/oss/release-status.md` のexport元とmanifestのSHA-256を更新する。
- gitleaks 0件、個人・大学のアドレスと稼働中の宛先の検索0件、`npm ci`・lint・型・単体・本番buildを確認する。
- 検証用repoのPRで、必須8検査が通ることを確かめる。

## 2. 新しいrepoを作る（本人の承認後）

`--add-readme` は使わない。GitHubが作る最初のコミットに主メールが入るので、最初のコミットは手元で作る。作者・記録者は、匿名のGitHub用アドレスにする。

```sh
gh repo create <owner>/<name> --private --description "<説明>" --homepage "<URL>"
cd <材料の場所>
git init -b main
git config user.name <ユーザー名>
git config user.email <ID>+<ユーザー名>@users.noreply.github.com
git add -A && git commit -m "Initial public source"
git remote add origin https://github.com/<owner>/<name>.git
git push -u origin main && git push origin main:develop
```

## 3. 保護設定を張り直す

mainとdevelopの両方へ、検証用repoと同じ値を入れる。2026-11-24に、検証用repoの実設定から読み出した値。

```sh
gh api -X PUT repos/<owner>/<name>/branches/<main または develop>/protection --input protection.json
gh api -X PUT repos/<owner>/<name>/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "audit", "app_id": 15368 },
      { "context": "e2e", "app_id": 15368 },
      { "context": "edge-functions", "app_id": 15368 },
      { "context": "gitleaks", "app_id": 15368 },
      { "context": "rls-tests", "app_id": 15368 },
      { "context": "rust-geometry", "app_id": 15368 },
      { "context": "schema-drift", "app_id": 15368 },
      { "context": "test", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false, "require_last_push_approval": false },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

秘密は置かない。Secrets・Environment・deploy keyは作らない。CIは `pull_request` だけで動くので、最初の小さなPR（状態文書の更新）で必須8検査を走らせ、保護が効くことを確かめる。

## 4. Publicへ切り替える（本人の最終判断後）

```sh
gh repo edit <owner>/<name> --visibility public --accept-visibility-change-consequences
```

直後に、切替後の設定を新しいrepo名で行う（fork承認、非公開の脆弱性報告、Dependency graphなど）。
説明・ホームページ・トピックも設定する。
README・SECURITY.mdの「公開候補」「窓口は未開通」の記述と、CITATION.cffの宛先は、最終のURLに直す。
