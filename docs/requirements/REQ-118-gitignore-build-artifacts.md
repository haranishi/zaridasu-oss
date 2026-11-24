# REQ-118: ビルド成果物の .gitignore 整備（tsbuildinfo / supabase .temp）

> 親 REQ: REQ-092

## 背景
リポジトリに **生成成果物 / CLI メタデータ** がトラッキングされており、PR の差分が常に汚れる：

1. `tsconfig.tsbuildinfo` — TypeScript の incremental build cache。`tsc --noEmit` で常に更新される
2. `supabase/.temp/cli-latest` — Supabase CLI のバージョンメタデータ。`supabase` コマンドで自動更新

`.gitignore` には `supabase/.temp/` のディレクトリ指定があるが、**既に履歴に追加されたファイルは追跡され続ける**ため `git rm --cached` が必要。`tsconfig.tsbuildinfo` は `.gitignore` 自体に未登録。

## 現状の問題
- `tsconfig.tsbuildinfo` が毎回 modified 表示され、`git status` のノイズになる
- `supabase/.temp/cli-latest` が CLI 実行ごとに更新され、無関係なコミットに混じる
- 直前の REQ-092 コミット（commit 3cd21f7）でも除外対応済だが、リポジトリレベルの解決が未着手

## 目的
ビルド成果物 / CLI メタデータをリポジトリ追跡から完全に外し、PR 差分をクリーンに保つ。

## 要件

### 機能要件
- [ ] FR-118-01: `.gitignore` に以下を追加：
  ```
  # TypeScript incremental build cache
  tsconfig.tsbuildinfo
  ```
- [ ] FR-118-02: 既に追跡されているファイルを履歴から外す：
  ```bash
  git rm --cached tsconfig.tsbuildinfo
  git rm --cached supabase/.temp/cli-latest
  ```
- [ ] FR-118-03: コミット時に対象ファイルが含まれないことを確認
- [ ] FR-118-04: `.gitignore` の他のセクションと整合性のあるコメント形式で追加

### 非機能要件
- [ ] NFR-118-01: 既存ビルドが正常に動作
- [ ] NFR-118-02: チームメンバーの初回 `git pull` で混乱が起きないよう README / CHANGELOG に注記

## 受入条件
- [ ] AC-01: `.gitignore` に `tsconfig.tsbuildinfo` が含まれる
- [ ] AC-02: `git ls-files | grep -E "tsconfig.tsbuildinfo|supabase/.temp"` が空（追跡 0 件）
- [ ] AC-03: ローカルで `npm run build` 後に `git status` がクリーン
- [ ] AC-04: `supabase` コマンド実行後も `git status` がクリーン
- [ ] AC-05: 過去のコミット差分には影響しない（履歴改変なし）

## 影響範囲
- `.gitignore`
- `tsconfig.tsbuildinfo`（履歴から外す）
- `supabase/.temp/cli-latest`（履歴から外す）

## 優先度
- **緊急度**: Low
- **重要度**: Low
- **理由**: 開発体験の改善。XS 規模（10 分）。ただし全員の手元のリポジトリに影響するため、merge 後にチーム周知が必要。

## 実装メモ
- `git rm --cached` は履歴を書き換えず、現在のインデックスから削除するだけ。過去のコミットには残る
- `git filter-branch` / `git filter-repo` で履歴改変も可能だが、本 REQ では実施しない（チーム影響大）
- `.gitignore` の追加例：
  ```
  # 依存パッケージ
  node_modules/

  # ビルド成果物
  dist/
  .next/
  tsconfig.tsbuildinfo

  # ...
  ```
- マージ後の周知文例：「`tsconfig.tsbuildinfo` をリポジトリから外しました。`git pull` 後に `rm -f tsconfig.tsbuildinfo` を実行してください（ビルドで再生成されます）」
