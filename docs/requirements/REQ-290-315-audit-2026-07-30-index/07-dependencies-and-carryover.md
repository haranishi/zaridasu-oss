## 相互依存・注意点

- **REQ-302 と REQ-307 が `DrawerMenu` の閉状態DOM残存で重複する**。a11y（tabbable/aria-modal）と性能（毎パン再構築）の両観点から同じ `if (!open) return null` を要求するため、**実装は REQ-307 FR-307-07 に一本化**。スライドアニメーション（300ms）維持のため閉アニメ完了後にアンマウントする遅延解除が必要で、`useProgress` の progress 保持（REQ-278 FR-278-01）を壊さないようフックは外殻に残す。
- **`/dashboard` の h1 追加は REQ-315 が正本**（FR-315-07 / AC-08）。REQ-302 側の問題J・FR-302-11・AC-08 は参照に変更済みで着手対象外。二重実装しないこと。
- **REQ-299 は REQ-292/REQ-309 とDB例外の扱いで接触する**。ERRCODE 導入は3REQの前提になるので、先に機械可読キーの命名規約を決める。
- **REQ-298 の「CIの一括GRANTが関数EXECUTEのREVOKEを打ち消し、pgTAPに権限assertionが0件」は REQ-292 で部分的に解消済み**（2026-07-30）。`supabase/ci/reapply-after-grants.txt` に REQ-292 の migration を追記して既定GRANT後に再適用するようにし、同ファイル冒頭の運用ルールを「関数の EXECUTE REVOKE も再適用対象」へ拡張した。権限assertionも `supabase/tests/req292_anon_granted_rpc_authz.sql` で0件ではなくなった（`has_function_privilege` の直接検査を含む28アサーション）。**REQ-298 側で残るのは「宣言リストへの追記漏れをCIが機械的に検知する仕組み」**（現状はレビュー依存）であり、この観点だけを扱うこと。
- **REQ-293 と REQ-304 が `public/offline.html` で重複する**。SW配線はREQ-293、i18n網羅漏れの観点はREQ-304で扱う分担にした。
- **REQ-296 は「更新」と「ゲート昇格」の2段構え**。High 4パッケージが滞留していた理由は新規advisoryでも実行タイミングでもなく、CIの audit ステップが warning 専用に組まれていたため（上記「経緯」参照）。更新だけして昇格を忘れると同じ滞留が再発するので、`hard-fail への昇格` を同じREQ内のFRとして扱う。
- **REQ-290 のCI検知には構造的な限界がある**。CI はクリーン checkout で動くため**未追跡のローカルファイルは CI に存在せず**、「CI に `gitleaks dir` を足せば検知される」は成立しない。実際に捕まえる層はローカルの pre-commit だが、REQ-210 FR-210-08 の pre-commit 導入は未実施で `.git/hooks` に有効なフックがない。REQ-290 では「CIでは検知できない」ことを前提にした対策（gitignore＋失効台帳＋pre-commit導入）を要件化している。
- **REQ-312 の S-5（hreflang / 多言語URL）は意思決定待ち**。4言語分の翻訳が検索流入に結びついていない事実は確認済みだが、`/[locale]` ルーティング導入は工数が大きく、取りに行くかどうかはプロダクト判断。

## 前回監査からの積み残し（今回対象外）

REQ-276（動的OG画像の配線・manifest強化）・REQ-277 Phase2（i18n残ハードコード）・REQ-279（DB性能・ログ保持）・REQ-280（通知冪等性）・REQ-281（CI・運用強化）は起票済み未実装のまま。今回の REQ-293（manifest）は REQ-276 と、REQ-298 は REQ-281 と範囲が隣接するため、着手時に統合を検討する。
