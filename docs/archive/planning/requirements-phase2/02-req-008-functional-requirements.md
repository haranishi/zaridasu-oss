### 機能要件

#### F1: 逐次アップロードへの変更（高）

`Promise.all`（並列）を逐次実行（`for...of`）に変更し、成功ファイルのパスをトラッキングする。

**変更理由**: 並列実行では途中で失敗しても他の処理が止まらないため、成功済みファイルの追跡と削除が困難。逐次なら失敗時点で停止し、ロールバック対象が明確になる。

```
変更前: Promise.all([upload1, upload2, upload3])  ← 全並列
変更後: for (photo of photos) { await upload(photo) }  ← 逐次
```

#### F2: ロールバック処理の実装（高）

失敗時に `supabase.storage.from('post-photos').remove(uploadedPaths)` を呼び出して成功済みファイルを削除する。

```
フロー:
  uploadedPaths = []  ← 成功パスを蓄積

  for photo of photos:
    try:
      path = upload(photo)
      uploadedPaths.push(path)    ← 成功したら追跡
    catch:
      rollback(uploadedPaths)     ← 失敗したら全削除
      throw UploadError(...)

  return uploadedPaths.map(toPublicUrl)
```

#### F3: アップロード進捗の状態管理（中）

`usePostForm` が返す値に `uploadProgress` を追加する。

```javascript
// 返り値に追加
uploadProgress: { current: number, total: number } | null
// null = アップロード中でない
// { current: 2, total: 3 } = 3枚中2枚完了
```

#### F4: 失敗枚数を含むエラーメッセージ（中）

```
成功0枚: 「写真のアップロードに失敗しました。もう一度お試しください。」
成功1枚以上: 「写真のアップロードに失敗しました（3枚中1枚成功）。再試行してください。」
```

#### F5: ネットワーク切断時の即時失敗（中）

アップロード開始前に `navigator.onLine` をチェックし、オフライン時は早期リターンする。

---
