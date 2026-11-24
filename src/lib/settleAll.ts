import { logError } from '@/lib/errorHandler'

/**
 * REQ-247 M3: `useAdminStats` / `useAdminKpi` で重複していた
 * 「`Promise.allSettled` → fulfilled は値・rejected は null（＋ `logError`）」の共通化。
 *
 * 各クエリ（Supabase ビルダー等の `PromiseLike`）を並列実行し、結果を
 * 「成功なら resolve 値・失敗なら null」の配列に丸めて返す。失敗（rejected）は
 * `logError(reason, `${ctx}[i]`)` で記録する。ただし `isAborted()` が true の間は
 * 記録しない（AbortController でキャンセル済みクエリのノイズを避ける従来挙動を踏襲）。
 *
 * 呼び出し側は返り値配列から `count` / `data` / `error` を取り出す（Supabase レスポンスは
 * これらを同一オブジェクトに持つ）。ジェネリック `T` で共通レスポンス形を与える。
 *
 * @param queries   並列実行する `PromiseLike` の配列（順序は返り値と一致）
 * @param ctx       `logError` に付けるコンテキスト名（`${ctx}[i]` で index を付与）
 * @param isAborted true を返す間は rejection のログを抑制する（既定: 常に false）
 * @returns         各クエリの resolve 値（失敗インデックスは null）の配列
 */
export async function settleAll<T = unknown>(
  queries: ReadonlyArray<PromiseLike<unknown>>,
  ctx: string,
  isAborted: () => boolean = () => false,
): Promise<Array<T | null>> {
  const results = await Promise.allSettled(queries)
  return results.map((r, i): T | null => {
    if (r.status === 'fulfilled') return r.value as T
    if (!isAborted()) {
      logError(
        r.reason instanceof Error ? r.reason : new Error(String(r.reason)),
        `${ctx}[${i}]`,
      )
    }
    return null
  })
}
