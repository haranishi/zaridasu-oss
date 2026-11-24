# REQ-288: 依存更新の滞留解消（Dependabot 6 PR・メジャー4本・旧設定の main 宛て PR）

作成日: 2026-07-29
状態: **一部実装済み（2026-07-29）**

関連: REQ-210（Dependabot 導入）, REQ-269（依存脆弱性更新）, REQ-281 問題C（private リポで CodeQL / dependency-review が無効）, REQ-286（リポジトリと本番の乖離）
参照: 共通 Git ブランチ運用ルール（main / develop / feat）

---

## これは何か

Dependabot の PR が 6 本滞留し、うち 4 本が旧設定のまま `main` 宛て・かつメジャー更新である状態を
解消する要件。詳細は `REQ-288-dependency-update-backlog/` 配下に分割している。

## 目的・背景（要約）

`target-branch: develop` を明示したのは 2026-07-23 のコミット `174ff30` で、それ**より前**に作られた
PR 4 本が `main` 宛てのまま残っている。いずれもメジャー更新で `groups`（minor/patch 限定）の対象外のため
個別 PR として滞留している。依存更新は止めるほど破壊的変更が重なりコストが上がる。
目的は (1) 6 PR をブランチ運用ルールに沿って処理、(2) メジャーを 1 本ずつ検証、(3) 再発防止の手順化。

## 主要な決定事項（要点）

- **`main` へ直接マージしない**。base を `develop` へ付け替え、`mergeable` が UNKNOWN のままなら
  close して `@dependabot recreate` で作り直させる。
- **メジャー 4 本はまとめず 1 本ずつ**。推奨順序は jsdom → eslint → typescript → i18next
  （影響範囲が狭い順。`i18next` は唯一の本番依存なので最後に表示確認込みで）。
- **`typescript` 5.9.3 → 7.0.2（#24）は今回見送り**。メジャー 2 つ分の差で型全域に影響するため単独 PR で検証する。
- `groups` に major を含めない現行設定は正しい。その意図を `.github/dependabot.yml` にコメントで記録する。
- **落とし穴**: npm 依存を更新したら `supabase/functions/deno.lock` の再生成が要る。
  ローカルの `deno test --cached-only` は `--frozen` を伴わないため**すり抜ける**（CI で落ちる）。
- 安全網が薄い点（private リポで CodeQL / dependency-review が動かず、npm audit も fail しない）は
  REQ-281 側の対応が入ると本要件の判断が楽になる。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-status.md](REQ-288-dependency-update-backlog/01-status.md) | 実施済み記録（2026-07-29）: 取り込んだ PR・検証結果・deno.lock の落とし穴・未実施項目 |
| [02-background.md](REQ-288-dependency-update-backlog/02-background.md) | 背景（Dependabot の運用設定と、target-branch 変更前後で PR が分かれた経緯） |
| [03-current-problems.md](REQ-288-dependency-update-backlog/03-current-problems.md) | 現状の問題 A〜C: main 宛て 4 本の実測表、メジャー 4 本の影響評価、安全網の薄さ |
| [04-goals-and-requirements.md](REQ-288-dependency-update-backlog/04-goals-and-requirements.md) | 目的と機能要件 FR-288-01〜06（処理順序・base 付け替え・1本ずつ検証・runbook 化）、非機能要件 |
| [05-acceptance.md](REQ-288-dependency-update-backlog/05-acceptance.md) | 受入条件 AC-01〜06 |
| [06-impact.md](REQ-288-dependency-update-backlog/06-impact.md) | 影響範囲（変更対象ファイル）と他要件（REQ-277 / REQ-281 等）への影響 |
| [07-priority.md](REQ-288-dependency-update-backlog/07-priority.md) | 優先度（Medium）の理由と、要件ごとの個別優先度 |
