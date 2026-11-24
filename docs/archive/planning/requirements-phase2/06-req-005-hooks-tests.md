#### 優先度 高: hooks のテスト（週1）

##### usePostForm.test.js

```
テストグループ:
  handleFileChange():
    - 許可形式（JPEG, PNG, WebP, HEIC）は受け入れる
    - 不許可形式（GIF, PDF）はエラーをセットして弾く
    - 5MB超過ファイルはエラーをセットして弾く
    - MAX_PHOTOS(3枚)を超える選択は先頭3枚に切り捨てる
    - エラーメッセージにファイル名が含まれる

  checkSpamLimit():
    - 0件の場合は allowed: true
    - 4件以内(SPAM_LIMIT_WINDOW内)は allowed: true
    - 5件(上限)は allowed: false + nextAvailable を返す
    - 24時間以前のタイムスタンプは無視される（カウント外）
    - isAdmin === true の場合は常に allowed: true

  uploadPhotos():
    - 成功時は publicUrl の配列を返す
    - 1枚失敗時に成功済みファイルをロールバック削除する（REQ-008後）
    - uploadProgress が正しく遷移する

  submitPost():
    - スパムチェック失敗時は Supabase を呼ばない
    - photos が空の場合は uploadPhotos を呼ばない
    - insertError 時に setError が呼ばれる
    - P0001 エラー時のメッセージが正しい
    - 成功時に true を返す、失敗時に false を返す
```

##### useDeletePost.test.js

```
テストグループ:
  handleDelete():
    - photos がある場合、storage.remove() を呼ぶ
    - photos がない場合、storage.remove() を呼ばない
    - DB 削除成功後に onDeleted() コールバックを呼ぶ
    - DB 削除失敗時にエラーをセットする
    - storage 削除失敗でも DB 削除を実行する（現状の挙動を文書化）
    - deleting フラグが処理中に true になり、完了後に false になる
```

##### useReverseGeocode.test.js

```
テストグループ:
  基本動作:
    - position が null の場合は何もしない
    - 同じ座標を2回渡した場合は1回だけ API を呼ぶ
    - 500ms デバウンス後に API を呼ぶ

  成功パターン:
    - API成功 + MUNICIPALITIESにマッチ → municipality が設定される
    - API成功 + マッチなし → municipality = '', geocodeError = 'market'

  失敗パターン:
    - オフライン → geocodeError = 'offline', municipality = ''
    - タイムアウト → geocodeError = 'timeout', municipality = ''
    - HTTP エラー(res.ok=false) → geocodeError = 'timeout', municipality = ''

  retry():
    - retry() 呼び出しで現在の座標を再取得する
    - retry() 呼び出し中は geocoding = true になる
```
