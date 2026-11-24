# 投稿フォーム・位置・写真・音声

基点：`6070714870e5`。投稿の契約は [現行posts](../current/posts.md)。DBの防御は [投稿と審査](posting-moderation.md)。

## 入力と送信を分ける

[PostForm](../../src/components/features/posts/PostForm.tsx) が入力・地図・案内・モーダルを持ち、[usePostForm](../../src/hooks/posts/usePostForm.ts) が素材準備・検証・保存を持つ。
依頼由来の初期値は下書きより優先し、地点から開いた位置はGPSで上書きしない。依頼の `unknown` は投稿種の選択肢とは区別する。
調査方法、地点ID、位置非公開の固定理由を受け取り、通常投稿と調査の記録を同じ投稿経路へ渡す。[調査](fieldwork.md)
[usePostDraft](../../src/hooks/posts/usePostDraft.ts) は入力途中を利用者ごとに保存する。地点由来・非公開固定のフォームでは入力下書きを読み書きしない。
入力の持ち主はフォームを開いた時点で固定し、別タブの利用者変更後に次の人の下書きとして保存しない。
圏外送信用の下書きは別の保存機能で、写真・音声を含む。[オフライン](offline.md)

## 位置の由来を残す

[LocationSection](../../src/components/features/posts/LocationSection.tsx) は地図と入力・精度表示をまとめる。
[ManualLocationInput](../../src/components/features/posts/ManualLocationInput.tsx) は緯度経度の入力と、利用者操作によるGPS取得を受け持つ。
[LocationPicker](../../src/components/features/posts/LocationPicker.tsx) は地図クリック、Enter／Spaceによる中心位置の選択を親へ返す。
GPSでは水平精度を残し、手動・EXIF・下書き復元では精度を破棄してmanualとする。座標の小数桁を測位精度と混同しない。
精度の表示は色に加えアイコンと文字を使い、良好・注意・警告を示す。
[targetArea](../../src/lib/area/targetArea.ts) の範囲検査と県名の判定で対象地域を扱い、世界全体の入力可能範囲とは区別する。

[useReverseGeocode](../../src/hooks/useReverseGeocode.ts) は500ms待って地名を解決し、[geocodeCache](../../src/lib/geocodeCache.ts) の粗い座標キーを再利用する。
通信は [fetchMunicipality](../../src/lib/reverseGeocodeMunicipality.ts) がまとめる。古い要求の結果は画面へ戻さない。
[useWeather](../../src/hooks/useWeather.ts) は座標・観察日からOpen-Meteoへ問い合わせ、今日と過去でAPIを分ける。
粗い座標と日付をキーに5分のsessionキャッシュを使う。失敗はweatherErrorと手動入力へ返す。
[WeatherSelector](../../src/components/features/posts/WeatherSelector.tsx) が自動値と手動修正を見せる。観察日は [localDate](../../src/lib/localDate.ts) で端末の暦日に揃える。

## 写真を公開Storageへ渡す前

[PhotoUploadSection](../../src/components/features/posts/PhotoUploadSection.tsx) は選択・進捗・削除・EXIF位置の採用を提示する。
usePostFormは原本を一度に並行デコードせず、1枚ずつ [processImage](../../src/lib/imageProcessor.ts) に渡す。
Worker／CanvasでEXIFを落とし、長辺1280pxのJPEGにする。変換が原本へ戻った・空・サイズ超過の場合は添付しない。
元写真のGPSは追加の位置候補としてだけ読む。写真から取り出せた位置を無断で入力へ反映しない。
低解像度・ぼけの検査は助言で、強制却下ではない。プレビューのBlob URLは差し替え・アンマウントで解放する。

送信時は準備済みJPEGから [SHA-256](../../src/lib/hash/sha256.ts) を計算し、本人IDのprefixで `post-photos` へ保存する。
ハッシュは実際に保存するバイト列に対応する。オンラインと圏外再送で別の画像を計算しない。
途中の写真アップロードが失敗した場合は、その試行で保存した写真の削除を試みる。DBとStorage全体のトランザクションを保証する処理ではない。
AI用の小さい別画像はfeature flagがあるときだけ作り、その失敗で投稿本体を止めない。[通知とAI](notifications-ai.md)

## 音声の準備

[AudioRecorder](../../src/components/features/posts/AudioRecorder.tsx) は録音／既存音声選択・波形レベル・試聴・確定を持つ。
既定録音時間は10秒、添付上限は1MB。MediaRecorder非対応や許可拒否ではファイル選択への導線を用意する。
[permission](../../src/lib/audio/permission.ts) は拒否・機器なし・占有・非HTTPSなどを分け、[MicPermissionGuide](../../src/components/features/posts/MicPermissionGuide.tsx) が端末別の手順を示す。
[inAppBrowser](../../src/lib/audio/inAppBrowser.ts) の検出結果は外部ブラウザでの再開案内に使う。許可の取得成功そのものを保証する判定ではない。
[silenceDetect](../../src/lib/audio/silenceDetect.ts) は音の確認、[fixWebmDuration](../../src/lib/audio/fixWebmDuration.ts) は再生時間metadataの補完を担う。
[AudioPlayer](../../src/components/ui/AudioPlayer.tsx) は録音・投稿の再生UIを共有し、DBに保存したdurationも使う。
録音終了やアンマウントではマイクtrack・AudioContext・timerを止める。投稿送信時は [uploadAudio](../../src/lib/uploadAudio.ts) が保存する。

## 送信の順序と失敗

1. 利用者・二重実行・写真準備中・投稿頻度を確認する。頻度の端末履歴は成功投稿だけを数えるUX用で、DB制限の代わりではない。
2. [postFields](../../src/lib/post/postFields.ts) と [postInputValidation](../../src/lib/post/postInputValidation.ts) で入力を整え、写真保存前に検証する。
3. 写真と音声を保存し、実験割付を得る。解析結果やXPをクライアントで作って確定しない。
4. [posts-write](../../src/lib/data/posts-write.ts) の共通INSERTへ渡し、成功IDを返す。圏外再送も同じ列の組み立てを使う。
5. 成功後の地点との関連付けが失敗しても、作成済み投稿まで失敗とは表示しない。

音声保存失敗なら送信を止め、INSERT失敗なら保存済み音声の削除を試す。Storageの後処理は各経路を確認する。
審査待ちの投稿が公開地図に即座に現れるとは限らない。送信成功と公開承認を分けて案内する。

## 変更と確認

[フォームテスト](../../src/components/features/posts/__tests__/)、[送信hookテスト](../../src/hooks/posts/__tests__/usePostForm.test.ts)、[画像処理テスト](../../src/lib/__tests__/imageProcessor.test.ts) が入口。
入力型・列追加は通常送信と圏外再送、位置由来の初期値、プレビュー解放、連打、失敗後の再試行を一緒に確認する。
UIの項目はPostForm、準備と送信はusePostForm、検証は共有schema、許可・公開条件はDBが変更箇所。
