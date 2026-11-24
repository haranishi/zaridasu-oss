## 受入基準

- **AC-01（A）**: `git ls-files | grep -c '^coverage/'` が 0。`npm run test:coverage` 実行後も `git status` が汚れない。
- **AC-02（B-1）**: `migrations/README.md` に「未適用」「reporter_ip が読める」の記述が存在せず、索引が58本と一致する。
- **AC-03（B-2/C-1）**: `ci.yml` に存在しないファイル（`001_`/`002_`）への言及が無く、schema.sql適用方針の根拠が実測結果で書かれている。
- **AC-04（B-3/B-4/B-5）**: `docs/README.md` から全サブディレクトリの役割と「正の文書」が辿れる。`docs/requirements/` 直下は `REQ-*` とインデックスのみ。アーカイブ文書はすべて冒頭注記付きで `docs/archive/` にある（削除ゼロ）。
- **AC-05（D）**: D-1〜D-7 適用後に `type-check` / `lint --max-warnings 0` / `test` / `build` / `i18n:check` が全緑。`MiniProfile` への参照が0件。
- **AC-06（全体）**: 本REQのどのコミットも**ユーザー可視の挙動を変更しない**（スナップショット的にUI/APIレスポンス不変）。

## 実施順序の推奨

1. **A（10分・即効）** → 2. **B-1/B-2（stale警告の是正・誤情報の解消）** → 3. **D（コード精度一括）** → 4. **B-3〜B-6（docs再編）** → 5. **C（migration索引・検証）**

## 対象外（他REQとの線引き）

- RLS initplanラップ・ログ保持パージ・FK索引 → **REQ-279**
- 通知/AI解析の冪等性 → **REQ-280**
- CIへのmigrations順次適用ジョブ常設・バックアップ復元検証・代替SAST → **REQ-281**（C-1の実測結果を引き継ぐ）
- i18n半翻訳の残り（Phase 2） → **REQ-277**
- 巨大コンポーネントの実際の分割 → 個別REQを起票して実施
- 適用済みmigrationファイルの改名・統合・削除 → **恒久的に対象外**（運用ルール）
