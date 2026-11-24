## 機能要件

- **FR-313-01（プッシュ ON 失敗の可視化）**: `EditProfileModal.handlePushToggle`（:76-79）で `subscribe()` の戻り値を判定し、`false` のときはインラインエラー（`error` state・REQ-193 FR-193-04 と同型）を表示してトグルを元の状態へ戻す。理由が分かる文言（許諾拒否／未対応ブラウザ／保存失敗）を i18n キーで出し分ける。
- **FR-313-02（プッシュ OFF 失敗の可視化と状態保持）**: `usePushSubscription.unsubscribe`（:207-219）の戻り値を `Promise<boolean>` へ変更し、`push_subscriptions` の DELETE と `user_profiles` の opt-in 解除の error を参照する。**いずれかが失敗した場合は `setSubscribed(false)` を実行しない**。呼び出し側は `false` を受けてインラインエラーを表示し、トグルは ON のまま維持する。
- **FR-313-03（`useQuality` の error / refetch）**: `UseQualityResult`（`useProfile.ts:220-223`）に `error` と `refetch` を追加し、:237 の `error ? []` による握りつぶしをやめる。オフライン（:233）も「無言で空」ではなくエラー扱いにする（`useRanking` / `useDiversity` と同形にする）。
- **FR-313-04（品質タブの LoadErrorState）**: `RankingPage.tsx:268-276` に `qualityError` 分岐を追加し、`LoadErrorState` ＋再試行（`refetchQuality`）を表示する。実装は同ファイル :188-191 / :357-360 と同型にする。**エラーを `quality.length === 0` の空状態分岐へ落とさない。**
- **FR-313-05（いいね再同期の安全化）**: `useLike.ts:137-141` の catch 内再同期で `error` を確認し、**再同期が失敗した場合はカウントと `liked` を書き換えない**（押下前の値を維持する）。`count` が `null` のときも同様に触らない（`count || 0` を廃止）。初回取得 `fetchLikes`（:70-74）も同じく error 確認を追加し、失敗時は 0 を表示しない。
- **FR-313-06（CSV の0件と失敗の扱い）**: `useCsvExport.ts` で
  - :59 のクエリ失敗に `logError(error, 'useCsvExport:query')` を追加する
  - `data.length === 0` のときは**ファイルを生成せず**、`toast.info` 相当で「該当する記録がありません」を提示して `false`（または専用の戻り値）を返す
  - `<a>` を `document.body.appendChild` → `click()` → `remove()` の順に扱い、`URL.revokeObjectURL` は `setTimeout` で遅延実行する（iOS Safari のダウンロード安定化）
- **FR-313-07（回帰テスト）**: (a) `unsubscribe` の DB 削除が失敗したとき `subscribed` が `false` にならないこと、(b) `useQuality` が RPC エラー時に `error` を立てること、(c) いいね再同期の失敗でカウントが 0 に変わらないこと、(d) 0件時に CSV を生成しないこと、をテストで固定化する。
