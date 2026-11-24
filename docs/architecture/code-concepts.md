# コードに出てくる言葉

実装を読むための用語案内。ここではザリダスでの使われ方に絞る。

| 言葉・記法 | 意味 | このリポジトリで読む場所 |
|---|---|---|
| `.ts` | TypeScript。型を付けて処理やデータの形を書く | `src/lib`、`src/types` |
| `.tsx` | TypeScriptで画面の構造も書く | `src/views`、`src/components` |
| `@/` | `src/` を基準にしたimportの短縮形 | [tsconfig](../../tsconfig.json) |
| `page.tsx` | URLに対応するページの入口 | [frontend](frontend.md) |
| `layout.tsx` | 複数ページを囲む共通の枠 | [frontend](frontend.md) |
| `route.ts` | HTTPリクエストへJSON等を返す入口 | [system-overview](system-overview.md) |
| Server Component | サーバー側で実行するReactの部品 | `src/app` のページ等 |
| `'use client'` | ブラウザ側の状態・イベントを使う境界 | `src/views`、Provider等 |
| component | 画面を構成する部品。propsで入力を受ける | `src/components` |
| hook・`use...` | Reactから取得・状態・副作用を再利用する仕組み | `src/hooks` |
| context・Provider | ログインやテーマなどを配下へ共有する仕組み | `src/context`、`app/providers.tsx` |
| `async`・`await` | 通信などの完了を待って次の処理へ進む記法 | 保存・取得関数全般 |
| API | 別の処理やサービスを呼ぶ窓口 | Next.js、Supabase、外部連携 |
| Data API・PostgREST | DBのテーブルや関数をHTTPから操作する窓口 | `supabase.from(...)` |
| RPC | DB側の関数を名前で呼ぶ仕組み | `supabase.rpc(...)` |
| schema | テーブル、関数、制約などのDBの定義 | [schema.sql](../../supabase/schema.sql) |
| migration | 既存のDBを変更する順序付きのSQL | `supabase/migrations` |
| RLS | 行ごとに読取・書込を許可するDBの規則 | [authorization](authorization.md) |
| GRANT・REVOKE | テーブル・列・関数への権限の付与・取消 | [authorization](authorization.md) |
| trigger | INSERT等をきっかけにDBで自動実行する処理 | 投稿保護・通知・集計等 |
| JWT | 認証済み利用者や役割を伝えるトークン | AuthとDB認可 |
| service role | 強い権限を持つサーバー専用の役割 | Edgeの管理クライアント |
| Edge Function | Supabase側で動くHTTP関数 | [edge-functions](edge-functions.md) |
| Storage | 写真や音声などを保存する場所 | 添付・希少種写真等 |
| Worker | ブラウザの画面処理とは別に計算する実行場所 | 画像、水域の幾何計算 |
| Wasm | Rust等から生成しブラウザで実行する形式 | `rust/water-geometry` |
| ABI | 別の実行環境間で値を渡すための取り決め | [水域Wasm](water-geometry-wasm.md) |
| PWA・Service Worker | インストールやキャッシュ等を支えるWebの仕組み | [offline](offline.md) |
| IndexedDB | 端末内で下書き等を保持するDB | 未送信キュー |
| `null`・unknown | 値が無い／まだ分からない状態 | 座標・件数・AI判定等 |
| CI | PR等で自動的に検査する仕組み | `.github/workflows` |
| unit・E2E・pgTAP | 関数、画面操作、DB権限をそれぞれ検査する手段 | [validation](validation.md) |

## 1つの機能を読む順番

1. ページやボタンで、利用者が何を入力し、何を見られるかを確認する。
2. hookやdata関数で、送る値、読む列、成功と失敗の分岐を見る。
3. DBのRLS・制約・trigger・RPCで、直接APIを呼んでも守られる条件を見る。
4. テストで、想定する成功・拒否・途中失敗を確認する。

型が合うこと、通信が200を返すこと、利用者の操作が完了することは、それぞれ別の確認になる。
