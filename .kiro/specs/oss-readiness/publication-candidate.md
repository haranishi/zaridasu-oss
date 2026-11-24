# 履歴なしのOSS公開候補

2026-11-16。既存要件1〜5とタスク9.4・9.5の実行範囲。

## 準備するもの

- 元のprivate repoと本番運用を保持する。
- 最新developのcommitから、既存exporterで履歴なしのsourceを別の新規ディレクトリへ出す。
- 元の画像8点は許諾確認済みの代替画像へ置換し、manifestとライセンス全文を保持する。
- exportは変更せず保管し、独立した候補へコピーして公開先のclone・PRリンクと配備説明を調整する。
- 候補のGitは新規初期化する。旧repoの履歴・PR・ログ・artifact・Secretsを取得しない。
- GitHub側は別のprivate repoを作り、保守者以外を招待せず、main/developと8件の必須CIを設定する。
- mainを最初から完成扱いにせず、候補sourceはPRで検証して統合する。

## 受け入れ条件

1. 元の履歴のcommitが候補のGitから到達できず、source revisionだけをprovenanceとして示す。
2. 元の画像8点・本番/backup workflow・私的設定を配布せず、代替素材のバイト列と出所が一致する。
3. 現行sourceと候補の全Git履歴で、除外を使わないOSS秘密検査が0件。
4. npm ci、lint、型、単体、本番buildを候補で再現する。CIの必須8件も成功する。
5. repository/Environment Secretsは0件、Actions tokenは既定read・PR承認権なし、本番配備workflow・登録deploymentがない。
6. main/developはstrictな必須CIとPRを要求し、管理者にも適用、force push・削除を禁止する。
7. Publicでのみ使える外部fork承認と非公開脆弱性報告は、切替後のゲートとして準備し、実施済みとしない。

## 検証と停止条件

- アプリコードとlockはexportから変更しない。候補向け文書変更の一覧を記録する。
- 候補には本番の環境ファイル・キー・DB・クラウド設定を渡さない。CIの公開された擬似値だけを使う。
- 既存export・worktree・ビルド・ログは削除しない。以前隔離したビルドは使用しない。
- 元repoのSecrets移設は未確認として保持し、値をActions等から取り出さない。Google旧キーは、2026-11-24に失効した。
- Public切替・告知・有料機能の有効化は行わない。候補と検証結果を示して最後の公開判断へ渡す。
