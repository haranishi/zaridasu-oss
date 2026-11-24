# REQ-083: 音声 duration を DB 由来でカスタム表示する確実なプレーヤー実装

> **作成日**: 2026-04-25
> **ステータス**: TODO
> **関連要件**: REQ-080 / REQ-082
> **優先度**: 🔴 P0（音声機能の体感品質を確実に修正）

---

## これは何か

音声プレーヤーが `0:00 / 0:00` を表示し続ける問題を、ファイル形式に依存しない形で根治する要件。
REQ-082 の `fix-webm-duration` によるメタデータ修復では不十分だったため、
**DB に duration を保存し、再生 UI 側で確実に表示する**構成へ移行する。

## 主要な決定事項の要点

- **native `<audio controls>` を捨て、自前の小さな player に差し替える**。
  duration 表示は file metadata 依存で fragile なため、ブラウザや webm container の不備に
  依存しない描画を保証する。再生本体は `<audio hidden>` を続投する。
- **合計時刻のソース優先度**：① `audio.duration` が finite なら採用 → ② props の `durationMs`
  （DB 由来）→ ③ どちらも無ければ `--:--`。ベストエフォートのフォールバックで既存音声も動かす。
- **`fix-webm-duration` の patch は defense-in-depth として残す**（削除しない）。
- **既存投稿のバックフィルはしない**。`audio_duration_ms` は NULL のまま許容する。
- **完全な scrub/seek サポートは含まない**（最低限の play/pause + progress + 時間表示）。
- **`audio_duration_ms` は column-protection で保護**する。INSERT 時のみ許可し、
  user による直接更新を禁止する。
- 工数見積もりは 1〜2 時間。

## 目次（各部品）

- [01-overview-scope-preconditions.md](REQ-083-audio-duration-from-db-and-custom-player/01-overview-scope-preconditions.md)
  — 要件概要：背景・目的（REQ-082 で解決しなかった原因 3 点）、スコープ（含む／含まない）、前提条件。
- [02-user-stories.md](REQ-083-audio-duration-from-db-and-custom-player/02-user-stories.md)
  — US-083-01（投稿者が再生時間を必ず確認できる）の受け入れ条件 AC-1〜3 と、US-083-02（ベストエフォートのフォールバック）。
- [03-functional-requirements.md](REQ-083-audio-duration-from-db-and-custom-player/03-functional-requirements.md)
  — FR-083-01〜05：カラム追加（型・CHECK・column-protection）、usePostForm からの保存、AudioPlayer のカスタム UI 化と表示ソース優先度、呼び出し箇所の props 受け渡し、型定義更新。
- [04-nfr-and-impact.md](REQ-083-audio-duration-from-db-and-custom-player/04-nfr-and-impact.md)
  — 非機能要件（UX・パフォーマンス・アクセシビリティ）と影響範囲の変更ファイル表。
- [05-acceptance-criteria-and-summary.md](REQ-083-audio-duration-from-db-and-custom-player/05-acceptance-criteria-and-summary.md)
  — 受け入れ基準 AC-083-01〜06 とサマリー・工数。
