import { useMemo } from 'react'
import { FEATURE_UNLOCKS, type FeatureKey } from '@/lib/constants'

// REQ-249 FR-249-01: 段階的機能解放の判定フック。
// REQ-248 の get_user_progress が返す「レベル」を入力に、宣言的な FEATURE_UNLOCKS 表を引いて
// 「この機能は解放済みか／解放レベルはいくつか」を返す。純関数・メモ化で軽量（NFR-249-01）。
// データ取得は一切しない（Supabase 非依存）ので、レベルを渡すだけで単体テストできる。
export interface UnlocksApi {
  /** 判定に用いた正規化レベル。不明（匿名/未取得）は null。 */
  level: number | null
  /**
   * featureKey が現在のレベルで解放済みか。
   * - 未登録キー（＝中核貢献など、表に載せない機能）は常に true（絶対にゲートしない）。
   * - レベル不明（匿名/進捗未取得/読み込み中）は true＝フェイルオープン（NFR-249-03 / AC-04：
   *   既存・匿名の利用者からこれまで使えた機能を剥奪せず、ロック表示のちらつきも避ける）。
   *   進行のゲートがかかるのは「レベルが判明している登録ユーザー」のみ。新規登録直後の Lv1 は
   *   実レベルが判明しているため、しきい値未満の機能がゲートされ、解放予告（ティーザー）が出る。
   */
  isUnlocked: (key: FeatureKey) => boolean
  /** featureKey の解放レベル（未定義キーは undefined）。ティーザーの「Lv N で解放」に使う。 */
  unlockLevelOf: (key: FeatureKey) => number | undefined
  /** featureKey の i18n ラベルキー（機能名）。 */
  labelKeyOf: (key: FeatureKey) => string | undefined
}

export function useUnlocks(level: number | null | undefined): UnlocksApi {
  return useMemo(() => {
    const known = typeof level === 'number' && Number.isFinite(level) && level >= 1
    const norm = known ? (level as number) : null
    return {
      level: norm,
      isUnlocked: (key: FeatureKey) => {
        const def = FEATURE_UNLOCKS[key]
        if (!def) return true // 中核貢献など未登録キー＝常時解放
        if (norm == null) return true // レベル不明＝フェイルオープン（剥奪しない）
        return norm >= def.level
      },
      unlockLevelOf: (key: FeatureKey) => FEATURE_UNLOCKS[key]?.level,
      labelKeyOf: (key: FeatureKey) => FEATURE_UNLOCKS[key]?.labelKey,
    }
  }, [level])
}
