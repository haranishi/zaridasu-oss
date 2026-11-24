## 目的

1. feat/security-hardening のリモート CI を全ジョブ緑に戻し、main へマージ可能な状態にする。
2. SW 初回インストール時の無条件リロードを廃し、e2e を SW タイミングに依存しない堅牢なテストにする（＝本番初回訪問の UX 欠陥も同時に解消する）。

## 要件

### 機能要件

- [ ] FR-267-01: `src/app/providers.tsx` の `controllerchange` リスナーを「**登録時点で既にコントローラが存在した場合（＝真のSW更新）のみ**リロードする」ようガードする。初回インストール（controller が `null` → `clients.claim()` で獲得）ではリロードしない。実装骨子:
  ```ts
  // 登録前に現在の制御状態を捕捉。true のときだけ controllerchange = 「新版への切替」とみなす
  const hadController = Boolean(navigator.serviceWorker.controller)
  let refreshing = false // controllerchange の多重発火による二重リロード防止
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    window.location.reload()
  })
  ```
  （リスナー登録位置は `register().then()` 内でも外でも可だが、`hadController` の評価は必ず登録開始前に行うこと）
- [ ] FR-267-02: `tests/e2e/error-boundary.spec.ts` を自動待機ロケータベースに強化する。
  - `page.goto('/__does_not_exist__')` のレスポンス 404 アサートは維持。
  - 恒真の `expect(html).not.toMatch(/^Not Found$/i)` を廃止し、`src/views/NotFoundPage.tsx` の実文言に対する肯定アサーションへ置換する（例: `await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()`）。ロケータの自動待機はナビゲーション中エラーを吸収するため、FR-267-01 適用前でもレース耐性が上がる。
  - 生の `page.content()` 即時呼び出しは使わない。
- [ ] FR-267-03: 未pushの修正コミット `c2704e7`・`77fdf65` を含めて、本要件の修正コミットとともに `origin/feat/security-hardening` へ push する（リモートは `2e1539c` で fast-forward 可能。force-push・rebase は不要）。
- [ ] FR-267-04（任意・据え置き推奨）: `playwright.config.ts:10` の `maxFailures: 1` は変更しない。フレーク根治（FR-267-01/02）が本筋であり、fail-fast は CI 時間節約として妥当。将来「1失敗で残り全部が見えない」ことが調査コストになる場合のみ `maxFailures: 3` 等への緩和を別途検討する。
