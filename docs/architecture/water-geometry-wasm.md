# 重い水域計算をWorker内のRustへ渡す

水域検索の正解となるJavaScript実装を残し、計算量の多い場合だけWebAssembly（Wasm）を使う。
対象は岸・距離・外接矩形・公開記録数の計算で、通信や地図描画をRustへ移しているわけではない。
全体のデータ取得は[水域](water-geometry.md)、ビルドの根拠は[Rust README](../../rust/water-geometry/README.md)を参照する。

## 検索時だけ起動し、失敗したらJavaScriptへ戻す

[acceleratedCandidates.ts](../../src/features/water/lib/acceleratedCandidates.ts)がブラウザ側の呼出し口になる。
頂点数×（完全取得した公開点数＋1）が50,000以上の場合にWorkerへ渡す。
少量データはシリアライズやWorkerとの往復を避け、[candidates.ts](../../src/features/water/lib/candidates.ts)で計算する。
Workerの生成とWasmのウォームアップは水域検索開始時にだけ行い、上流APIの待ち時間と重ねる。

| 実装 | 意味 |
|---|---|
| [waterGeometry.worker.ts](../../src/features/water/workers/waterGeometry.worker.ts) | 6秒期限でハッシュ付きWasmを取得し、readyを通知。要求IDごとに結果を返す |
| [waterGeometryKernel.ts](../../src/features/water/lib/waterGeometryKernel.ts) | exportとABIを検証し、モジュール所有メモリへ入力を書き、結果をコピーする |
| [waterGeometryPacket.ts](../../src/features/water/lib/waterGeometryPacket.ts) | オブジェクトを数値列へ変換し、出力の長さ・有限値・件数・位置を検証して候補へ戻す |
| [lib.rs](../../rust/water-geometry/src/lib.rs) | 入出力Vecを所有し、確保・計算・結果ポインターをC ABIで公開する |
| [packet.rs](../../rust/water-geometry/src/packet.rs) | 境界検査付きreaderで入力を解釈し、不正パケットをエラーにする |
| [geometry.rs](../../rust/water-geometry/src/geometry.rs) | 外周・内周、線分への射影、球面距離、150m内の記録数を計算する |

起動・計算の期限は各10秒。Worker非対応、Wasm欠落、ABI不一致、不正入力、通信・計算失敗でJavaScriptへ戻る。
起動失敗やWorker全体の失敗後はそのモジュール内で再生成を止める。
入力・結果のArrayBufferはtransferで渡し、Wasmメモリへの転記と結果コピーは明示的に残す。
取消は未完了要求を待機表から外し、古い検索の結果を採用しない。既に走っているRust計算そのものを中断する仕組みではない。

## ABI v1はFloat64のパケットで境界を固定する

ABIはJavaScriptとWasmの間で数値を受け渡す約束。バージョンは1。
入力の先頭は`version, 候補数, 公開点数, 中心lng, 中心lat, 余白m, 完全取得フラグ`。
続いてPointまたはPolygon/MultiPolygonの面数・リング数・頂点数とlng/lat列、最後に公開点列を置く。
出力は候補ごとに8値で、`minLat, maxLat, minLng, maxLng, 岸lat, 岸lng, 距離m, 公開件数`の順。
不完全取得時の件数は内部値`-1`、画面へ返す型では`null`にする。

| 上限・検査 | 目的 |
|---|---|
| 候補512、公開点1000、数値1,000,000 | メモリと極端な処理量の上限を設ける |
| 各面・リング数4096以内 | 入力中の個数を有限の整数として検査する |
| 閉じたリング、有限座標、末尾余剰なし | 破損・世代違いの入力を黙って解釈しない |
| module-owned buffer | Rustへ任意の外部ポインターを渡して読ませない |
| 結果を新しいFloat64Arrayへコピー | Rustのメモリ成長や次回計算による上書きを呼び手から切り離す |

外接矩形で候補を減らしてから精密な距離を比較する。島と離れた複数水面、地域のPointも扱う。
150m境界では平方根・逆三角関数を省ける場合を選び、最終的には元のメートル比較を保つ。
日本の小さい水域を想定した近似射影であり、日付変更線をまたぐ地理計算の一般ライブラリではない。
Wasmへ渡す投稿位置は公開用display座標だけで、原位置・非公開調査を入力へ足さない。

## 配布物はソースと一緒に整合を検査する

[build-water-geometry.mjs](../../scripts/build-water-geometry.mjs)はCargo設定・lock・Rustソース・ビルド手順自身をハッシュする。
[artifact.json](../../rust/water-geometry/artifact.json)にはソースハッシュ、バイナリハッシュ、配布URL、コンパイラーを記録する。
[waterGeometryAsset.ts](../../src/features/water/lib/waterGeometryAsset.ts)が同じハッシュ付きURLを参照する。
通常の`npm run build`はコミット済みWasmを検証するだけでRustの導入を要求しない。
`wasm:build`で再生成し、`wasm:check`は再ビルド結果と配布物を比較する。CIはRust 1.99.0を使用する。
プロジェクトとRust sysrootのパスをremapし、開発者のマシンパスが配布物へ埋め込まれるのを抑える。

Rust変更時はソース、artifact、生成TS、Wasmを組で更新する。
古いブラウザセッションが参照し得るハッシュ付きWasmは保持する。[next.config.ts](../../next.config.ts)がWasmを1年のimmutable配信にする。
現行Service Workerの永続アセット対象は`/_next/static/`と`/images/`で、`/wasm/`は含まれない。
そのためWasmが圏外で取れない場合もJavaScriptへ戻れることが必要になる。

検査は[Rust tests](../../rust/water-geometry/src/tests.rs)と[実Wasmの等価性テスト](../../src/features/water/lib/__tests__/waterGeometry.test.ts)を組み合わせる。
[bench:water](../../scripts/bench-water-geometry.ts)には梱包・結果構築まで含めるが、ネットワーク、Worker往復、地図描画は含めない。
合成データの速度差を、そのまま実ページの高速化率とは解釈しない。
