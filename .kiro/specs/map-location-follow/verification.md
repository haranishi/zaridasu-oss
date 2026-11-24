# 地図の現在地追従の検証

2026-10-21。機能全体の検証（`kiro-validate-impl`）と、完了の証拠の確認（`kiro-verify-completion`）の手順で行った。実装と同じセッションの自己点検に、別セッションの評価（下の「独立した確認」）を足している。

## 判定

**GO。ただし実機は MANUAL_VERIFY_REQUIRED。** 車での追従・画面ロック・電池は、私には確かめられない（tasks.md の17）。

## 機械的な確認（最終のコードで）

| 確認 | コマンド | 結果 |
|---|---|---|
| 追従の単体・結合 | `npx vitest run`（5ファイル） | 121件通過（本物のLeaflet） |
| 全単体 | `npx vitest run` | 176ファイル・1,922件通過 |
| 変異試験 | 71か所を1つずつ壊す（リポジトリの外の道具） | 71か所すべてで試験が落ちた。生き残りなし |
| E2E（実ブラウザ） | `npx playwright test tests/e2e/map-location-follow.spec.ts` | 18件通過（位置の間隔0〜500ms×ページのCPU1〜20倍遅い） |
| 事前検査 | `npm run precheck` | 10ゲート通過（lint・型・翻訳・schema・auth-route・private-tables・全単体・audit・秘密情報・Edge） |
| 翻訳 | `npm run i18n:check` | 4言語1,987キー |
| 本番ビルド | `npm run build` | 成功 |
| サイズ予算 | `npm run size:routes` | `/map` のページ分 9.3kB／予算12kB。`/map` 全体 359.4kB／予算376.0kB |
| 未解決の印 | `grep TBD/TODO/FIXME/HACK/XXX`（機能のファイル） | 0件 |
| 秘密の直書き | `grep password/api_key/secret/token =`、`secrets:scan` | 0件、通過 |
| 起動 | 本番ビルドを起動し、E2Eと評価者の操作で `/map`・追従・プライバシーのページを開いた | 起動時のエラー0件（E2Eが、ページの例外とReactの典型的なエラーを集めている） |

試験は、直す前に落ちることを確かめた。単体は直す前の形に戻した変異で、E2Eは直す前の形に戻した写しで（札と通知の重なり防止の2件が落ちた）。

## 要件との対応

| 要件 | 証拠 |
|---|---|
| 1 開いただけでは位置を取らない／取得中の明滅と `aria-busy` | `LocateControl.test.tsx`、E2E |
| 2 最初の位置で寄せ、点と円を置く。ズームを下げない。点はマーカーより上 | 同上（点の層の試験、E2Eの `dotIsOnTop`） |
| 3 追従中は点を動かし、8px以上離れたら寄せる／追従の札 | 同上、E2E（立て続けに届く場面×CPU遅延） |
| 4 動かしたら一時停止。ズーム・サイズ変更では止めない。取得中に動かしたら引き戻さない | 同上、E2E |
| 5 一時停止から押して再開。一時停止の見た目と札 | 同上 |
| 6 追従中に押すと停止し、点と円を消す | 同上、E2E |
| 7 ページが見えない間は止める | `useLocationWatch.test.tsx` |
| 8 画面を点けたままにする | `useScreenWakeLock.test.tsx` |
| 9 エラーの通知（拒否・非対応・時間切れ）。重ねない | `locationFollow.test.ts`、`LocateControl.test.tsx`、E2E |
| 10 座標を自動で外へ出さない／絞り込みを自動でオフ | `LocateControl.test.tsx`（通信・保存・ログに出ない）、E2E |
| 11 プライバシーのページ | `PrivacyPage.location.test.tsx` 6件 |
| 12 県外でも点を出す | `LocateControl.test.tsx` |
| 13 ボタンの名前・押下状態・44px・キーボード | `LocateControl.test.tsx`、E2E（3幅） |
| 14 4言語 | `i18n:check` |
| 15 位置の状態で `MapView` を再描画しない | `LocateControl.test.tsx` |

15件すべてに、少なくとも1つの証拠がある。受け入れ条件の文言は、評価の結果を受けて更新してある（札・縁取り・失敗の通知の書き方）。

## 設計との整合と、境界

- 構成は設計書の表のとおり。置き場所は `docs/project-structure-conventions.md` に従い、`src/features/` には置いていない（表を持たないため）。
- 依存の向きは、`LocateControl`（部品）→ フック → `lib/maps/locationFollow.ts`（純粋なロジック）。逆向きの参照は無い。
- 境界を越えた変更：`MapView.tsx`（旧ボタンの置き換え）、翻訳4言語、`PrivacyPage.tsx`（追記）。DB・権限・計測・他の位置取得（投稿・クイック保存・調査）は触っていない。
- 見送った共通部品の変更：お知らせ（トースト）の位置・折り返し・延長。設計書の「捨てた案」に理由を書いた。

## 独立した確認

- Codex（読み取り専用）3担当のレビュー：重大1・中2を直した（tasks.md）。
- Opus（別セッション）の評価を3周：第1周は全員不合格（11〜14点）、第3周は全員合格（18〜20点）。仕分けは `.agent-harness/runs/follow-evaluation/round*-triage.md`。

## ブロックされたタスク

- 16 PRのマージ、17 実機の確認（どちらも本人）。それ以外は完了。

## 限界

実機（iOS・Android・車）、画面ロックと電池、2〜3pxの指の揺れで一時停止になるか、直射日光の下での見え方は未確認。評価は代理指標で、人間の最終確認の代わりにはならない。評価の第3周のあとに直した分は、評価者が見ていない。
