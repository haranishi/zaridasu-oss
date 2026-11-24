## 背景

管理画面のページングは **AdminReports と AdminUsers を除いて実装済み**（`useAdminPosts.ts:151` の `.range(page * ADMIN_PAGE_SIZE, ...)` / `ADMIN_PAGE_SIZE = 20`＝`constants.ts:80`、`AdminCommentsPage.tsx:83` の `.range()`、`AdminLogsPage.tsx:78-79` の `p_limit` / `p_offset`）。つまり**方針は既に確立していて、2 画面だけが取り残されている**。

一方フロント側の一覧は、取得件数の設計に **50 件 ⇄ 最大 2000 件という段差**があり、下側では機能欠落（データが出ない）、上側では描画肥大（DOM が膨らむ）として現れる。

| 箇所 | 現状の取得／描画 | 問題 |
|---|---|---|
| ホーム（表示範囲フィルタ OFF＝既定） | `range(0, PAGE_SIZE-1)` = **50 件**、追加読込の経路なし | 問題B（機能欠落） |
| ホーム（表示範囲フィルタ ON） | `range(0, QUERY_LIMITS.posts-1)` = **最大 2000 件** | 問題A・REQ-307 問題A が同時に顕在化 |
| PhotoGallery | `items.map()` で全件を一括描画（仮想化なし） | 問題A（理論上**最大 6000 枚のカード**） |
| /admin/reports | `.limit()` / `.range()` なし・`select('*')` | 問題C（単調増加） |
| /admin/users | `get_admin_user_list()` に LIMIT/OFFSET なし・DOM に 2 セット | 問題D（線形劣化） |

---
