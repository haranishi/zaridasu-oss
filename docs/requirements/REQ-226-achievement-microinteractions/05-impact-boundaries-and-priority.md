## 影響範囲

**本 REQ が改修する範囲（達成感の即時フィードバック・表示側のみ）:**
- `src/hooks/useLike.ts`（楽観的 `toggleLike`＋ロールバック）
- `src/components/features/posts/LikeShareSection.tsx`（いいね pop アニメ）
- `src/components/features/posts/CommentSection.tsx`（楽観的送信＋入場アニメ＋失敗トースト）
- `src/views/ProfilePage.tsx`・`src/components/features/dashboard/BadgeSection.tsx`（バッジ解放アニメ／新規判定）
- 観察進捗カウンタの表示先（`src/views/ProfilePage.tsx` の統計部、必要なら `/area/[slug]`＝`DetailPage.tsx:541-544` 周辺）
- `src/app/globals.css`（`transform`/`opacity` ベースの軽量キーフレーム追加）
- `src/context/ToastContext.tsx` の利用（成功/失敗トースト。基盤は既存・改修不要の想定）
- `src/locales/{ja,en,ko,zh}/translation.json`（新規文言）
- 新規（任意）: 楽観的 UI／バッジ新規判定／カウントアップを共通化する hook・util（DRY のため）

**本 REQ が担わない範囲（重複回避）:**
- バッジ付与の判定・サーバトリガー（`check_and_grant_badges()`）・スキーマ・RLS は不変。
- ランキングの設計・フレーミングは REQ-171。LP（`/lp`）のアニメ・無限演出は REQ-204。pending 投稿のオンライン反応性（送信ボタンの online/offline 化）は REQ-197。`prefers-reduced-motion` の基盤導入は REQ-015。
- **データ品質に連動した称号・ゲーミフィケーション設計は REQ-235 に委ねる**（本 REQ は「達成の瞬間の視覚フィードバック」に限定）。

**他機能への影響リスク:**
- 楽観的 UI 化は、失敗時のロールバックを誤ると「いいね/コメントが消えない・件数が狂う」体感バグになり得る。失敗注入テストで収束を必ず確認する。
- バッジ「新規判定」を localStorage に持つ場合、別端末・キャッシュクリアで解放アニメが再生され得る点を許容（実害は装飾の再生のみ）として明記する。
- 進捗カウンタは集計クエリを既存指標の再利用に限定し、新規 RPC で egress を増やさない。

## 優先度

- **緊急度**: 中 / **重要度**: 中〜高
- **理由**: 機能不具合ではなく体験（UX）の改善であり、欠けていても操作自体は成立するため緊急度は中。一方で、市民科学 PF の生命線は「参加し続けてもらえるか（継続動機）」であり、いいね/コメントの即時手応えとバッジ解放・進捗の可視化は離脱低減に直結する卒研 PF の価値そのものに効く。実装は表示側に閉じ（スキーマ・RLS 不変）、既存のトースト基盤・reduced-motion 基盤・サーバ側バッジ付与の上に**軽量に積める**ため費用対効果が高く、重要度を高めに置く。`useOptimistic` の作法をここで確立しておくと、後続アクションの楽観的 UI 化にも横展開できる。
