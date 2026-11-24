// REQ-231 (NFR-231-01(a) / AC-03(a)): Nominatim Usage Policy「絶対上限 1req/秒」を
// サーバー側で担保するためのグローバル直列スロットラ。
//
// 設計:
//   - モジュールスコープのシングルトン Promise チェーンで「前のリクエスト完了 + 最小間隔」
//     を待ってから次を発火させる。これにより、同一 Edge Function インスタンス内で
//     複数の付与（複数投稿の同時 webhook 等）が走っても、外部 API への発火が直列化され
//     合算で 1req/秒を超えない（NFR-231-01(a)）。
//   - Edge Function はリクエストごとに別インスタンスになりうるが、本 REQ の付与は
//     「posts INSERT → 1 投稿 1 起動」かつ DB 永続キャッシュ（geo_cache）で重複呼び出しを
//     抑えるため、実効レートはさらに低い。bulk バックフィルを公開 Nominatim で無制限に
//     走らせる経路は設けない（AC-03 / NFR-231-01(d)）。
//   - 最小間隔は env GEOCODE_MIN_INTERVAL_MS（既定 1100ms = 1req/秒 + 安全マージン）。

const DEFAULT_MIN_INTERVAL_MS = 1100

function getMinIntervalMs(): number {
  const raw = Deno.env.get('GEOCODE_MIN_INTERVAL_MS')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_INTERVAL_MS
}

// 直列化用のチェーン。各 runThrottled は前の完了を待ってから自分を実行する。
let chain: Promise<unknown> = Promise.resolve()
let lastStartedAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 渡した非同期処理を「前の処理完了 + 最小間隔」を空けて直列実行する。
 * 戻り値は task の解決値。task が throw しても次の処理がブロックされないよう
 * チェーンはエラーを飲み込んで継続する（呼び出し側には正しく伝播する）。
 */
export function runThrottled<T>(task: () => Promise<T>): Promise<T> {
  const minInterval = getMinIntervalMs()
  const run = chain.then(async () => {
    const now = Date.now()
    const wait = minInterval - (now - lastStartedAt)
    if (wait > 0) await sleep(wait)
    lastStartedAt = Date.now()
    return task()
  })
  // チェーン継続用（エラーは握り潰す。呼び出し側は run で受け取る）。
  chain = run.then(() => undefined, () => undefined)
  return run
}

/** テスト用: スロットラ状態をリセットする */
export function resetThrottle(): void {
  chain = Promise.resolve()
  lastStartedAt = 0
}
