/**
 * REQ-251 FR-251-02: 調査ミッション（クエスト）の宣言的定義と、クライアント集計ロジック。
 *
 * 【設計方針】
 * - **量ではなく質/多様性**を促す（Goodhart 対策 / research-rq1 の内発的動機整合）。
 * - **任意参加・未達成を罰しない**（NFR-251-02）。喪失ベースのストリーク・偽の緊急性は持たない。
 * - 集計は既存の DB 権威データ（get_user_collection = useCollection）から**クライアント側で導出**する。
 *   新しい DB テーブル/マイグレーション/RPC は追加しない（NFR-251-03）。
 * - コレクションは承認済み投稿からトリガーで積み上がる（schema.sql update_collection_on_approval）ため、
 *   本人（owner）は常に自分の集計を取得できる（レベル解放前でも user_collection は populate される）。
 * - クエスト達成は「その行動が既存 REQ-248 の XP エンジンで自然に加点される」ことで反映される。
 *   クエスト自体は追加報酬を与えない（**二重報酬なし** / AC-02）。ここは表示・促しのみ。
 *
 * 純関数のみ（React / Supabase 非依存）でユニットテストできる。
 */

import type { CollectionEntry } from '@/hooks/useProfile'

/** コレクションから導出した多様性/質のシグナル（クエスト判定の入力）。 */
export interface CollectionSignals {
  /** 承認済み観察がある種数（アメリカザリガニ / ウシガエル）。 */
  speciesCount: number
  /** 記録した情報種別の異なり数（目撃・捕獲・痕跡・農業被害・不在のうち何種類か）。 */
  infoTypeCount: number
  /** 観察した市区町村の異なり数。 */
  municipalityCount: number
  /** 「不在確認」を 1 度でも記録したか（貴重な負データ）。 */
  hasAbsence: boolean
  /** 検証済み（承認）観察の合計。 */
  verifiedTotal: number
}

/** 種ごとの info_types_seen / municipalities_seen を横断集計して多様性シグナルにする。 */
export function deriveCollectionSignals(collection: CollectionEntry[]): CollectionSignals {
  const infoTypes = new Set<string>()
  const municipalities = new Set<string>()
  let verifiedTotal = 0
  for (const c of collection) {
    for (const it of c.info_types_seen ?? []) infoTypes.add(it)
    for (const m of c.municipalities_seen ?? []) municipalities.add(m)
    verifiedTotal += c.verified_count ?? 0
  }
  return {
    speciesCount: collection.length,
    infoTypeCount: infoTypes.size,
    municipalityCount: municipalities.size,
    hasAbsence: infoTypes.has('absence'),
    verifiedTotal,
  }
}

export type QuestKind = 'diversity' | 'quality'

export interface QuestDef {
  /** 安定キー（localStorage / テスト用）。 */
  id: string
  /** 色に依存しない識別用の絵文字（装飾・aria-hidden）。 */
  emoji: string
  /** 見出しの i18n キー。 */
  titleKey: string
  /** 説明の i18n キー。 */
  descKey: string
  kind: QuestKind
  /** 達成目標値（進捗表示用・任意）。 */
  target?: number
}

export interface QuestState extends QuestDef {
  /**
   * 達成状態。
   * - `true`  = 達成済み（穏やかな「達成しています」を表示）。
   * - `false` = 未達（**罰さず**「やってみましょう」と誘う。進捗 target があれば併記）。
   * - `null`  = クライアントでは判定しない自由提案（定点観察 / GPS 精度は collection に現れないため）。
   *             取り組めば既存 XP エンジンで自然に加点される。
   */
  done: boolean | null
  /** target があるときの現在値（進捗表示用）。 */
  current?: number
}

/**
 * クエスト定義（小さく調整可能なリスト / FR-251-02）。
 * すべて質・多様性に寄せ、単純な投稿量は称えない。REQ-172(GPS)/173(空間バイアス)/174(定点観察) と整合。
 */
export const QUESTS: readonly QuestDef[] = [
  { id: 'info_variety', emoji: '🔎', titleKey: 'quests.items.info_variety.title', descKey: 'quests.items.info_variety.desc', kind: 'diversity', target: 3 },
  { id: 'absence',      emoji: '🌾', titleKey: 'quests.items.absence.title',      descKey: 'quests.items.absence.desc',      kind: 'quality' },
  { id: 'new_area',     emoji: '🗺️', titleKey: 'quests.items.new_area.title',     descKey: 'quests.items.new_area.desc',     kind: 'diversity', target: 2 },
  { id: 'both_species', emoji: '🐸', titleKey: 'quests.items.both_species.title', descKey: 'quests.items.both_species.desc', kind: 'diversity', target: 2 },
  { id: 'structured',   emoji: '📍', titleKey: 'quests.items.structured.title',   descKey: 'quests.items.structured.desc',   kind: 'quality' },
  { id: 'gps_precise',  emoji: '🛰️', titleKey: 'quests.items.gps_precise.title',  descKey: 'quests.items.gps_precise.desc',  kind: 'quality' },
  // REQ-263: 新機能（水域レイヤー=REQ-259/264 / 調査努力=CPUE=REQ-258）を「質・生息環境」の観点で
  // クエスト化した自由提案（collection には現れないため done:null）。喪失ストリークや二重報酬は持たない。
  { id: 'near_water',   emoji: '💧', titleKey: 'quests.items.near_water.title',   descKey: 'quests.items.near_water.desc',   kind: 'quality' },
  { id: 'effort_log',   emoji: '⏱️', titleKey: 'quests.items.effort_log.title',   descKey: 'quests.items.effort_log.desc',   kind: 'quality' },
]

/** シグナルからクエストの達成状態を算出する（純関数）。 */
export function computeQuests(signals: CollectionSignals): QuestState[] {
  return QUESTS.map((q): QuestState => {
    switch (q.id) {
      case 'info_variety':
        return { ...q, current: signals.infoTypeCount, done: signals.infoTypeCount >= (q.target ?? 3) }
      case 'new_area':
        return { ...q, current: signals.municipalityCount, done: signals.municipalityCount >= (q.target ?? 2) }
      case 'both_species':
        return { ...q, current: signals.speciesCount, done: signals.speciesCount >= (q.target ?? 2) }
      case 'absence':
        return { ...q, done: signals.hasAbsence }
      // 定点観察 / GPS 精度 / 水辺調査 / 努力量記録は collection には現れないため、
      // クライアントでは達成判定しない自由提案（取り組めば既存 XP エンジンで自然に加点）。
      case 'structured':
      case 'gps_precise':
      case 'near_water':
      case 'effort_log':
      default:
        return { ...q, done: null }
    }
  })
}

/**
 * 図鑑（コレクション）の充足率（%）。FR-251-01 の「収集率」表示に使う。
 * 種 × info_type 網羅で 0..100 を滑らかに返す（SpeciesDexCard の「コンプリート＝info_type 全網羅」と整合）。
 * 市区町村（総数 25）は探索の伸びしろとして分母に含めない（SpeciesDexCard の complete 判定と同方針）。
 */
export function collectionCompletionPct(
  collection: CollectionEntry[],
  speciesTotal: number,
  infoTypeTotal: number,
): number {
  if (speciesTotal <= 0 || infoTypeTotal <= 0) return 0
  let seen = 0
  for (const c of collection) seen += Math.min(c.info_types_seen?.length ?? 0, infoTypeTotal)
  const denom = speciesTotal * infoTypeTotal
  return Math.max(0, Math.min(100, Math.round((seen / denom) * 100)))
}
