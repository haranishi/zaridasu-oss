# Cloudflare移行の判断基準

更新日：2026-11-14。本人の依頼でWeb候補の実装・DB候補の試作を開始。本番はSupabase/Vercelを維持して検証する。
詳細の正本：[移行仕様](../specs/cloudflare-migration/brief.md)。

## データの保護と復元を先に考える

Webの実行先をWorkersへ寄せ、メディアはR2、業務DBはTurso/D1を比較する。
DBはTursoを第一検証候補とするが、採用は権限・原子性・性能・費用・復元の試験で決める。
無料枠だけを理由に、既存のRLSや非公開位置の保護を弱めない。

## 一度に替える境界を限定する

Web → メディア → API/業務DBの順で、正本と復旧方法を定めて移す。
Supabase Authは移行中も維持し、撤去後は[Better Auth案](../specs/cloudflare-migration/auth-design.md)を先に試す。
メールはResend継続を基本にCloudflare Sendingも比較し、認証切替と配信業者変更を分ける。
全14の非同期処理・補助Storage状態・認証DBの復元まで確認してからSupabase全廃を判断する。
製品を追加するたびに、認可・鍵・バックアップ・監視の管理負担を数える。
ブラウザ内のWeb WorkerとCloudflare Workersを混同しない。

## 将来案を現在の挙動へ混ぜない

この文書と移行仕様のマージは、移行実装・DNS/DB切替・リソース削除の許可ではない。
現行構成は[tech.md](tech.md)と `docs/current/` を正とし、実装後に各段階の証拠を添えて更新する。
公開ゲートと、書込み後の差分を失わない切り戻しが成立してから、本番切替を判断する。
