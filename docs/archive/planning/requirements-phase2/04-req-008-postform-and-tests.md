#### PostForm.jsx の変更箇所

```jsx
// usePostForm から uploadProgress を受け取る
const { ..., uploadProgress } = usePostForm()

// 送信ボタン付近に進捗表示を追加
{loading && uploadProgress && (
  <p className="text-xs text-center text-slate-400 mb-2">
    写真をアップロード中... {uploadProgress.current}/{uploadProgress.total}
  </p>
)}
```

---

### テストケース

| # | シナリオ | 期待結果 |
|---|---------|---------|
| T1 | 3枚全て成功 | 全パス返却、ロールバックなし |
| T2 | 2枚成功後に3枚目失敗 | 2枚分ロールバック、エラーメッセージに「3枚中2枚成功」 |
| T3 | 1枚目から失敗 | ロールバックなし（削除対象ゼロ）、汎用エラーメッセージ |
| T4 | ロールバック自体が失敗 | エラーログ記録、ユーザーには通常のエラーメッセージ |
| T5 | オフライン状態で投稿 | アップロード前に失敗、適切なメッセージ |
| T6 | uploadProgress の遷移 | null → {0,3} → {1,3} → {2,3} → {3,3} → null |

---

---
