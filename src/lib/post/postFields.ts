/**
 * REQ-247 (H2): 投稿 insert ペイロード生成に含まれる純粋な「フィールド決定ルール」を
 * usePostForm.submitPost / useOfflineQueue.sendOne から切り出したユニット。
 *
 * これらのルールは従来 submitPost（オンライン）と sendOne（オフライン再送）に重複コピーされて
 * いた（survey_method / status / observed_at）。単一ソース化して両経路が同じ規則を共有し、
 * かつ個別に単体テストできるようにする。副作用は無く、入出力は元の式と完全一致させる。
 */

/**
 * REQ-174: 調査手法の決定。定点サイト指定時は 'structured'、それ以外は指定値 or 既定 'opportunistic'。
 * submitPost（送信・計測）と sendOne（再送）で共有する単一ソース。
 */
export function resolveSurveyMethod(
  surveySiteId: string | null | undefined,
  surveyMethod: 'structured' | 'opportunistic' | null | undefined,
): 'structured' | 'opportunistic' {
  return surveySiteId ? 'structured' : (surveyMethod ?? 'opportunistic')
}

/**
 * 不在確認（info_type = 'absence'）は審査不要・自動承認、それ以外は審査待ち（pending）。
 */
export function resolvePostStatus(infoType: string): 'approved' | 'pending' {
  return infoType === 'absence' ? 'approved' : 'pending'
}

/**
 * REQ-079: 画像 hash 配列の確定ルール。全要素が算出成功（string）のときのみ配列で送る。
 * 1 件でも null が混じる/空配列なら null（NULL 混入配列は DB CHECK で弾かれるため）。
 */
export function resolveImageHashes(hashes: (string | null)[]): string[] | null {
  return hashes.length > 0 && hashes.every((h): h is string => typeof h === 'string') ? hashes : null
}

/**
 * observed_at の正規化。YYYY-MM-DD 文字列を当日 00:00（ローカル）の ISO 文字列へ。未指定は null。
 */
export function observedAtToIso(observedAt: string | null | undefined): string | null {
  return observedAt ? new Date(`${observedAt}T00:00:00`).toISOString() : null
}
