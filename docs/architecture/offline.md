# 圏外では表示用キャッシュと送信待ちを分ける

Service Workerは画面を開くためのHTMLと静的アセットを保存する。
投稿・調査記録の送信待ちはアプリ側が利用者別に管理する。この二層のどちらか一方だけでは、圏外の記録を扱えない。
画面構成は[フロントエンド](frontend.md)、非公開調査の業務ルールは[調査計画](fieldwork.md)を参照する。

## Service Workerはアプリの入口を保つ

正本は[sw.js.tpl](../../public/sw.js.tpl)。[build-sw.mjs](../../scripts/build-sw.mjs)がビルド時に`public/sw.js`を生成する。
版はVercel commit SHA、開発固定値、Git HEAD、時刻の順に決める。HTMLとアセットの世代を合わせるための識別子である。

| 保存先・対象 | 戦略 |
|---|---|
| `zaridasu-precache-v<版>` | offline HTML、アイコン等を事前保存。`/`・`/dashboard`のHTMLもこの世代へ保存 |
| `/`・`/dashboard`の遷移 | 保存HTMLを優先し、裏で取得して更新するstale-while-revalidate |
| ナビゲーションの保存条件 | 成功・非redirect・想定パス・HTMLのみ。認証redirectやHTTPエラーは保存しない |
| install時のウォーム | HTMLと参照JS/CSS/fontを最大60件。20秒のソフト期限、失敗しても必須アセットが揃えば導入継続 |
| `zaridasu-assets` | `/_next/static/`・`/images/`をcache-firstで保存。最大200件、デプロイをまたいで保持 |
| `/api`・`/auth`、その他の遷移 | HTMLを動的保存しない。ネットワーク例外時に`offline.html`へ |
| 非GET・別オリジン | fetchハンドラーの対象外 |

activateで旧世代のprecacheと旧命名キャッシュを削除し、汎用アセットは残す。
記録されている理由は、古いHTMLが削除済みチャンクを参照して白画面になる事故と、更新直後だけ圏外起動できなくなる事故を防ぐこと。
ウォームはbest effortなので、一度オンラインで開いただけで全画面・全地図・全データの圏外利用を保証するものではない。
外部地図タイル、SupabaseのAPI・写真、Wasmはこのfetchキャッシュの対象に含まれない。

[providers.tsx](../../src/app/providers.tsx)は`updateViaCache=none`で登録し、初回のcontroller取得では再読込しない。
既存controllerから更新したときだけ、未保存の入力が無ければ再読込する。
Push受信・通知クリックも同じSW内の別ハンドラーで扱う。購読や送信側は[通知・AI](notifications-ai.md)を参照する。

## 公開投稿の下書きはIndexedDBに利用者を付けて保存する

[offlineStore.ts](../../src/lib/offlineStore.ts)の`zaridasu-offline` v2、`pending-posts`が実体。
入力値、処理後の写真Blob、任意の音声Blob、利用者ID、地点ID、送信状態を持つ。上限は利用者あたり10件。
保存前に入力と概算空き容量を検査し、v1からは音声・調査関連項目を後方補完する。
通常の表示・送信は本人分だけに絞る。所有者が無い旧下書きは自動で本人のものと扱わない。
[useOfflineQueue](../../src/hooks/useOfflineQueue.ts)は旧下書きを確認して自分の名義で送る操作と、破棄する操作を提供する。
`sending`が5分以上残った下書きは再試行可能な`pending`に戻す。

送信の共通入口は[sendPendingPost](../../src/lib/offlineSend.ts)。送信直前にも所有者を照合する。
写真・音声をアップロードし、共有Zodスキーマで再検証して、通常投稿と共通の行組立て関数からINSERTする。
成功後に下書きを削除する。失敗時は翻訳キーを保存し、音声は削除を試みるが、アップロード済み写真の孤立は許容している。
公開投稿には水域原票のようなclient UUIDによるINSERT重複防止がなく、応答消失時の完全な一度限り送信は保証しない。

地点から作った下書きは、送信前に[offlinePost.ts](../../src/features/fieldwork/data/offlinePost.ts)が近くの本人の希少種記録を再確認する。
通信失敗なら送らず残し、それ以外の確認失敗は位置を非公開にする。成功後の地点との紐付け失敗は投稿成功を取り消さない。

## 調査の控えと送信待ちには別の役割がある

| 実装 | 保存・更新の約束 |
|---|---|
| [localData.ts](../../src/features/fieldwork/lib/localData.ts) | localStorageキーを利用者IDで分け、ログアウト・退会時の削除入口を共通化 |
| [planCache.ts](../../src/features/fieldwork/lib/planCache.ts) | 計画・地点・結果印・希少種保護印と同期時刻を保存。圏外では最後の控えを表示 |
| [queue.ts](../../src/features/fieldwork/lib/queue.ts) | 不在、地点状態、写真なし希少種、投稿との紐付け、位置保護を最大100件保存 |
| [flushBeforeSignOut.ts](../../src/features/fieldwork/data/flushBeforeSignOut.ts) | 調査キューと投稿下書きの両方を送る。残件があれば理由を返す |

計画の控えは表示専用で、圏外の計画編集をDBへ自動統合する仕組みは持たない。
キューは同じclientIdの追加を防ぎ、送信直前に保存先と利用者を読み直す。対応端末ではnavigator.locksでタブ間も排他する。
希少種はDB一意制約も使い、不在投稿は途中生成した投稿IDをキューへ保存して再生成を抑える。
端末保存は平文で、利用者ごとのキーは暗号化やブラウザ内の別利用者に対する完全な隔離ではない。

[AuthContext](../../src/context/AuthContext.tsx)は送信待ちがあるログアウトで送信・破棄・取消を扱い、送れないまま自動で捨てない。
ログアウトでは計画の控えやフォーム下書きを消し、退会では本人の投稿下書き・調査キューも片付ける。
水域投稿の写真・原票はこの永続キューへ保存せず、開いているシート内の一時状態で再送する。

## 画像変換は処理失敗の戻り値まで読む

[imageProcessor.ts](../../src/lib/imageProcessor.ts)は長辺1280px・JPEG品質0.85へ再エンコードし、EXIFを除去する。
[imageProcessor.worker.ts](../../src/workers/imageProcessor.worker.ts)のOffscreenCanvasを優先し、非対応・失敗・30秒期限でメインスレッドCanvasへ戻す。
待機は最大10件で、古い待機はフォールバックへ回す。転送バッファ、ImageBitmap、Object URLを処理後に解放する。
汎用処理は変換できない場合に元Fileを返すため、戻り値が必ず無害化済みとは限らない。
水域の[prepareWaterPhoto](../../src/features/water/data/photos.ts)はこの戻り値を検査し、変換成功したJPEGだけを受け入れる。
IndexedDB・Web Locks・Canvas・SWのブラウザ差と容量不足は[検証](validation.md)で個別に確かめる。
