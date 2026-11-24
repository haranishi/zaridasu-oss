## 画面別ビフォーアフター

### PostCard（投稿一覧の1行）

```
【変更前】
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│ 🦞 アメリカザリガニ  目撃  ✓認証済み       │ text-sm + text-xs badges
│ 📍 由利本荘市 · 3匹                       │ text-xs text-gray-400 ← 薄い+小さい
│ ウシガエルではありませんがAI判定ど...       │ text-xs text-gray-500 truncate ← 切れる
│ 2026/3/20 07:50                           │ text-xs text-gray-400 ← 薄い+小さい
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘

【変更後】
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│ 🦞 アメリカザリガニ  目撃  ✓認証済み        │ text-sm + text-xs badges（維持）
│ 📍 由利本荘市 · 3匹                        │ text-sm text-gray-500 ← 読める
│ ウシガエルではありませんがAI判定どうで       │ text-sm text-gray-600 line-clamp-2
│ すか？実際に捕獲して確認しました。          │ ← 2行表示 + title で全文
│ 2026/3/20 07:50                            │ text-sm text-gray-500 ← 読める
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

### StatsBar

```
【変更前】 text-xs, text-gray-500, text-[10px]
 234件 | 今月 12件 ▲3 | ザリ 180 カエル 54

【変更後】 text-sm, text-gray-600, text-xs
 234件 | 今月 12件 ▲3 | ザリ 180 カエル 54
```
