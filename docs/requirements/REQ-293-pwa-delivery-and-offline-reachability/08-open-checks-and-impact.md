## 要確認

- **WebKit のオフライン時 `TypeError` メッセージ**: 本要件は「`Load failed` は現行 `isNetworkError()` の3パターンに一致しない」ことを根拠に catch の無条件フォールバック化を求めている。**メッセージ文言はWebKitのバージョンで変わり得る**ため、文言に依存しない実装（無条件フォールバック）を採ることで検証負荷を消す方針である。実機（iOS Safari）での確認は AC-04 で担保する。
- **`/dashboard` のHTMLキャッシュとプライバシー**: 認証後画面のHTMLをCache Storageに置くことの是非（共用端末での表示残り）は本要件で断定していない。FR-293-03 の実装時に、キャッシュ対象を「ログイン前でも同一のシェル部分」に限定するか、`/dashboard` を含めるかを判断する。
- **Lighthouse の PWA カテゴリ**: Lighthouse のバージョンによって PWA カテゴリ・PWA系auditの提供状況が異なる。FR-293-08 の assertion 名は導入時に実際の audit ID を確認して確定する。

## 影響範囲

### 変更（コード）

- `src/app/layout.tsx:51` — manifest リンク先（1行）
- `public/sw.js.tpl` — オフライン判定、ナビゲーションキャッシュ、キャッシュ2本分離、フォールバック先
- `scripts/build-sw.mjs` — キャッシュ名の構成（precache 側のみバージョン付与）
- `src/app/providers.tsx:75-80` — 更新時リロードの条件
- `public/offline.html` — 多言語化（方式Aの場合）／削除または縮小（方式Bの場合）
- `src/lib/offlineStore.ts` — `PendingPost` に送信開始時刻を追加（IndexedDB のバージョン更新が必要か確認する）
- `src/hooks/useOfflineQueue.ts:60,185` および `refresh()` — stale復帰
- `src/components/features/dashboard/PendingPostsSection.tsx:115-119` — 「送信を再開」
- `src/locales/{ja,en,ko,zh}/translation.json` — 追加キー
- `tests/e2e/` — manifest 配信・オフライン到達性の新規spec
- `.lighthouserc.json` — manifest系assertion

### 他要件への影響

- **REQ-276**: FR-276-02（`screenshots` / `id` の追加）は、FR-293-01 が入るまで**効果を持たない**。REQ-276 を実施する場合は本要件の FR-293-01 を先行させる
- **REQ-267**: FR-293-05 は REQ-267 の `hadController` 判定を壊さないこと（初回インストールでリロードしない）が退行条件
- **REQ-277**: `public/` 配下がPhase 1/2 いずれの対象表にも入っていない取りこぼしを、本要件の FR-293-06 が個別に解消する。`check-i18n-parity` がソース側ハードコードを検出できない構造的限界（REQ-277 FR-277-03 のlint化）は本要件のスコープ外
