## 3. gitleaks pre-commit フック（ローカル・FR-210-08）

> 方針: 本リポジトリは npm 依存を増やさない（`package-lock.json` を本 REQ で変更しない）ため、
> husky 等は導入せず **gitleaks 本体 + git ネイティブフック** で構成する。CI 側の `gitleaks` ジョブが
> 最終防衛線なので、pre-commit はローカルの早期検知（任意だが強く推奨）という位置づけ。

### 3-1. gitleaks をインストール
```bash
# macOS
brew install gitleaks
# それ以外は https://github.com/gitleaks/gitleaks/releases からバイナリ取得
gitleaks version   # 8.x を想定
```

### 3-2. pre-commit フックを作成（リポジトリ直下で 1 回だけ）
```bash
# フック用ディレクトリを使う（既存 .git/hooks を汚さない）
mkdir -p .githooks
cat > .githooks/pre-commit <<'EOF'
#!/usr/bin/env bash
# REQ-210 FR-210-08: コミット前にステージ済み差分の秘密混入を gitleaks で弾く。
# 設定は .gitleaks.toml（公開前提値・既知漏洩のピン留めを許可リスト化済み）。
set -euo pipefail
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks 未インストール: brew install gitleaks（フックをスキップ）" >&2
  exit 0
fi
exec gitleaks protect --staged --config .gitleaks.toml --redact --verbose
EOF
chmod +x .githooks/pre-commit

# このリポジトリでフックパスを有効化（リポジトリローカル設定）
git config core.hooksPath .githooks
```

> `git config core.hooksPath .githooks` は **クローンごとに 1 回**実行が必要（git はフックを自動配布しない）。
> npm の `secrets:protect` スクリプトでも同じスキャンを手動実行できる: `npm run secrets:protect`。

### 3-3. 動作確認
```bash
echo 'aws_key = "AKIAIOSFODNN7EXAMPLE"' > /tmp/leak && git add -f /tmp/leak 2>/dev/null || true
npm run secrets:protect   # 検知され exit 1 になればOK
```

---
