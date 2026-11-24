### 非機能要件

| # | 要件 | 基準 |
|---|------|------|
| NF1 | ロールバック失敗時でも、エラーログは記録する | `logError()` 呼び出し必須 |
| NF2 | 逐次処理への変更で合計アップロード時間が増加する | 許容する（整合性を優先） |
| NF3 | ロールバック中もユーザー向けメッセージは「アップロードに失敗しました」のみ | 内部処理をユーザーに見せない |

---

### 実装設計

#### usePostForm.js の変更箇所

```javascript
// 追加するstate
const [uploadProgress, setUploadProgress] = useState(null)
// null | { current: number, total: number }

// uploadPhotos() の変更
const uploadPhotos = async () => {
  const uploadedPaths = []
  setUploadProgress({ current: 0, total: photos.length })

  try {
    for (const [i, photo] of photos.entries()) {
      const stripped = await stripExif(photo)
      const prefix = currentUser?.id ?? 'anon'
      const fileName = `${prefix}/${crypto.randomUUID()}.jpg`

      const { data, error } = await supabase.storage
        .from('post-photos')
        .upload(fileName, stripped, { cacheControl: '3600', upsert: false })

      if (error) {
        // 失敗 → ロールバック
        const successCount = uploadedPaths.length
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('post-photos').remove(uploadedPaths)
            .catch((rollbackErr) => logError(rollbackErr, 'uploadPhotos:rollback'))
        }
        throw Object.assign(error, { successCount, totalCount: photos.length })
      }

      uploadedPaths.push(data.path)
      setUploadProgress({ current: i + 1, total: photos.length })
    }

    return uploadedPaths.map((path) => {
      const { data: { publicUrl } } = supabase.storage.from('post-photos').getPublicUrl(path)
      return publicUrl
    })
  } finally {
    setUploadProgress(null)
  }
}

// submitPost() のエラーメッセージ更新
} catch (err) {
  logError(err, 'submitPost')
  if (err.successCount !== undefined && err.successCount > 0) {
    setError(`写真のアップロードに失敗しました（${err.totalCount}枚中${err.successCount}枚成功）。再試行してください。`)
  } else {
    setError(getErrorMessage(err))
  }
  return false
}
```
