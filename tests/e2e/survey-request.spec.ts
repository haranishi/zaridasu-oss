import { test, expect } from '@playwright/test'

// REQ-110 FR-110-03 / AC-06: 調査依頼フロー E2E
//
// 注意: 詳細ページ → 「調査結果を投稿する」リンクで survey_request_id がセットされる動作は
// 「実在する調査依頼レコード」と「ログイン済ユーザー」の両方が必要なため、
// テストデータ（FR-110-04 / 05）整備までは以下の観点に絞ってカバーする：
//   1. /requests 一覧ページが描画される
//   2. 一覧のフィルタ UI が表示される
//   3. 「依頼を立てる」FAB が表示される（aria-label）
//   4. 未ログインで FAB 押下時に AuthModal が開き、/requests から離脱しない
//   5. sessionStorage に zaridasu:surveyRequestForPost を仕込んで /
//      に遷移すると HomeInteractive の useEffect が seed を消費する
//   6. 各 spec が独立して /requests を開ける（NFR-110-02）

test.beforeEach(async ({ context, page }) => {
  // FR-110-06: 独立性担保
  await context.clearCookies()
  await page.addInitScript(() => {
    try { window.localStorage.setItem('zaridasu_lang', 'ja') } catch { /* noop */ }
  })
})

test('/requests 一覧ページが描画される', async ({ page }) => {
  const res = await page.goto('/requests')
  expect(res?.status()).toBeLessThan(500)
  await expect(page).toHaveURL(/\/requests/)
  // FAB の aria-label は固定日本語なのでこちらで存在確認
  await expect(page.getByRole('button', { name: '調査依頼を立てる' })).toBeVisible()
})

test('/requests のフィルタ UI（ステータス・種別・市区町村・ソート）が表示される', async ({ page }) => {
  await page.goto('/requests')
  // FilterSelect の label は SurveyRequestsListPage 内でハードコードされた日本語
  await expect(page.getByText('ステータス', { exact: true })).toBeVisible()
  await expect(page.getByText('種別', { exact: true })).toBeVisible()
  await expect(page.getByText('市区町村', { exact: true })).toBeVisible()
  await expect(page.getByText('ソート', { exact: true })).toBeVisible()
})

test('/requests に「依頼を立てる」FAB が表示される', async ({ page }) => {
  await page.goto('/requests')
  const fab = page.getByRole('button', { name: '調査依頼を立てる' })
  await expect(fab).toBeVisible()
})

test('未ログインで /requests の FAB を押すと AuthModal が開く', async ({ page }) => {
  await page.goto('/requests')
  const fab = page.getByRole('button', { name: '調査依頼を立てる' })
  await fab.click()
  await expect(page).toHaveURL(/\/requests/)
  await expect(page.getByRole('dialog')).toBeVisible()
  // FAB は AuthModal を defaultTab="signup" で開く（SurveyRequestsListPage）。
  // 新規登録の導線はタブ UI（REQ-207/210: role="tab" + aria-selected）として描画されるため、
  // role="button" ではなく role="tab" で照会する。beforeEach で ja 固定だが、
  // 4 言語の新規登録ラベルを許容して言語非依存にしておく。
  const signupTab = page.getByRole('tab', { name: /新規登録|Sign Up|회원가입|注册/i })
  await expect(signupTab).toBeVisible()
  await expect(signupTab).toHaveAttribute('aria-selected', 'true')
})

test('sessionStorage 経由で survey_request_id がホームに引き継がれる（HomeInteractive useEffect）', async ({ page }) => {
  // REQ-086 Phase 2 / AC-06: SurveyRequestPage の handleRespondClick が
  // sessionStorage('zaridasu:surveyRequestForPost') にシードを書いて router.push('/') する。
  // HomeInteractive の useEffect がそれを読み取り、消費（removeItem）して PostForm を即時オープンする。
  //
  // 実 DB の調査依頼が無くてもこの引き渡しロジック自体は検証可能：seed を仕込んだ状態で
  // / を開き、HomeInteractive の useEffect が seed を消費（removeItem）することを確認する。
  //
  // 安定化（CI フレーク対策）:
  //   旧実装は `/requests` を開いてから page.evaluate で sessionStorage を書き、さらに `/map` へ
  //   再 goto していたため、(1) /requests の hydrate 中ナビゲーションで evaluate の実行コンテキスト
  //   が破棄される、(2) 多重 goto が互いに割り込む、という競合が起きていた。
  //   ここでは seed を addInitScript で「ナビゲーション前」に注入し、`/map` へ一度だけ goto する。
  //   addInitScript は同一 context の全ドキュメント生成時に走るため、page.evaluate を介さずに
  //   遷移前から sessionStorage が用意され、context 破棄/多重ナビゲーションの競合を構造的に排除する。
  const SEED = {
    id: 'e2e-test-request-id',
    species: 'crayfish',
    lat: 39.72,
    lng: 140.1,
    municipality: '秋田市',
    reason: 'E2E テスト用の調査理由',
  }
  await page.addInitScript((seed) => {
    try {
      window.sessionStorage.setItem('zaridasu:surveyRequestForPost', JSON.stringify(seed))
    } catch { /* sessionStorage 不可環境では何もしない */ }
  }, SEED)

  // /map に一度だけ遷移して HomeInteractive を hydrate させる（多重 goto を排除）
  await page.goto('/map')
  await page.waitForLoadState('load')

  // useEffect は hydrate 後に走り seed を removeItem する。消費完了をポーリングで待つ
  // （固定 waitForTimeout に依存せず、CI の遅延でも安定する）。
  await expect
    .poll(
      () => page.evaluate(() => window.sessionStorage.getItem('zaridasu:surveyRequestForPost')),
      { timeout: 15_000 },
    )
    .toBeNull()
})

test('/requests から各 spec が単独で実行できる（NFR-110-02）', async ({ page }) => {
  // 他テストの状態に依存せず /requests を直接表示できる
  await page.goto('/requests')
  // FAB が見えれば SurveyRequestsListPage が hydrate 済
  await expect(page.getByRole('button', { name: '調査依頼を立てる' })).toBeVisible()
})
