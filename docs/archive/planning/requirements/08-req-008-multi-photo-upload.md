### REQ-008: 複数写真アップロードの途中失敗処理

**背景**
`usePostForm.js` の `uploadPhotos()` は写真を並列アップロードしているが、一部失敗した場合に成功済みの写真が Storage に残り、後続の DB 挿入も失敗するため孤立ファイルが発生する。

#### ユーザーストーリー

```
As a 投稿者,
I want to 写真のアップロードが一部失敗しても安全に中断されてほしい,
So that 意図しないデータが残ることなく、再試行できる。

受け入れ条件:
- [ ] 1枚でもアップロード失敗した場合、成功済みの写真を Storage から削除する
- [ ] 失敗時に「写真のアップロードに失敗しました（N枚中M枚成功）。再試行してください。」と表示する
- [ ] 失敗後も再試行できる（写真の選択は維持される）
- [ ] アップロード進捗が分かる（例: 「1/3 アップロード中」）
- [ ] 個別ファイルのアップロード失敗理由を特定できる（サイズ超過 / 形式不正 / ネットワーク）
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `uploadPhotos()` を逐次実行に変更し、成功したファイルパスをトラッキングする | 高 |
| F2 | 途中失敗時に `rollbackUploadedPhotos(uploadedPaths)` を呼び出して削除する | 高 |
| F3 | アップロード進捗状態 `uploadProgress: { current, total }` を返す | 中 |
| F4 | 各ファイルのエラー理由を個別に返す（`uploadErrors: { fileName, reason }[]`） | 中 |
| F5 | 失敗した写真のみ再アップロードする（成功分はスキップ）オプション | 低 |

#### フロー設計

```javascript
// 改善後の uploadPhotos() 疑似コード
async function uploadPhotos(photos) {
  const uploaded = []
  try {
    for (const [i, photo] of photos.entries()) {
      setUploadProgress({ current: i + 1, total: photos.length })
      const { path, error } = await supabase.storage.upload(...)
      if (error) throw new UploadError(photo.name, error)
      uploaded.push(path)
    }
    return uploaded.map(toPublicUrl)
  } catch (err) {
    // ロールバック
    await supabase.storage.remove(uploaded)
    throw err
  }
}
```

---
