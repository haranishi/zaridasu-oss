import { describe, expect, it } from 'vitest'
import { addDays, diffDays, jstDay, jstToday, weekdayMonday0 } from '../jstDate'
import {
  ACTIVITY_LEVEL_CAP,
  ACTIVITY_WEEKS,
  activityStart,
  buildActivityCalendar,
  legendSteps,
  levelFor,
  type ActivityRow,
} from '../activityCalendar'

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  observed_at: null,
  created_at: '2026-10-10T03:00:00Z',
  info_type: 'sighting',
  status: 'approved',
  ...over,
})

describe('jstDate（日本時間の日付の計算）', () => {
  it('UTC 15:00 を境に日付が変わる', () => {
    expect(jstDay('2026-10-08T14:59:59Z')).toBe('2026-10-08')
    expect(jstDay('2026-10-08T15:00:00Z')).toBe('2026-10-09')
    expect(jstToday(new Date('2026-10-19T15:00:00Z'))).toBe('2026-10-20')
  })

  it('月末・うるう日・年またぎを暦どおりに足し引きする', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(diffDays('2026-10-19', '2025-10-20')).toBe(364)
  })

  it('曜日は月曜を0、日曜を6とする', () => {
    expect(weekdayMonday0('2026-10-19')).toBe(0) // 月
    expect(weekdayMonday0('2026-10-21')).toBe(2) // 水
    expect(weekdayMonday0('2026-10-25')).toBe(6) // 日
  })
})

describe('levelFor（濃さ。5件で頭打ち）', () => {
  it('0件は塗らず、1・2件はそのまま、3〜4件は3、5件以上は4', () => {
    expect(ACTIVITY_LEVEL_CAP).toBe(5)
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(levelFor)).toEqual([0, 1, 2, 3, 3, 4, 4, 4])
    expect(levelFor(-1)).toBe(0)
  })
})

describe('legendSteps（凡例の段。levelFor から作る）', () => {
  it('0・1・2・3〜4・5以上の5段。最後だけ上限が無い', () => {
    expect(legendSteps()).toEqual([
      { level: 0, from: 0, to: 0 },
      { level: 1, from: 1, to: 1 },
      { level: 2, from: 2, to: 2 },
      { level: 3, from: 3, to: ACTIVITY_LEVEL_CAP - 1 },
      { level: 4, from: ACTIVITY_LEVEL_CAP, to: null },
    ])
  })

  it('どの件数も、その件数の濃さの段に入る（凡例と塗り分けが食い違わない）', () => {
    const steps = legendSteps()
    for (let count = 0; count <= ACTIVITY_LEVEL_CAP + 20; count++) {
      const step = steps.find(s => count >= s.from && (s.to === null || count <= s.to))
      expect(step?.level, `count=${count}`).toBe(levelFor(count))
    }
  })
})

describe('buildActivityCalendar（週の並び）', () => {
  const total = (rows: { length: number }[]) => rows.reduce((sum, r) => sum + r.length, 0)

  it('今日が月曜なら、右端の週は今日だけ。全部で365日分', () => {
    const calendar = buildActivityCalendar([], '2026-10-19')
    expect(calendar.start).toBe('2025-10-20')
    expect(calendar.rows).toHaveLength(7)
    expect(calendar.rows[0]).toHaveLength(ACTIVITY_WEEKS)
    for (const r of calendar.rows.slice(1)) expect(r).toHaveLength(ACTIVITY_WEEKS - 1)
    expect(total(calendar.rows)).toBe(365)
    expect(calendar.rows[0]!.at(-1)!.day.date).toBe('2026-10-19')
    expect(calendar.rows[0]![0]!.day.date).toBe('2025-10-20')
  })

  it('今日が週の途中でも、今日を含む週が右端・範囲外の日は含めず、どの曜日でも365日分', () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = addDays('2026-10-19', offset)
      const calendar = buildActivityCalendar([], today)
      expect(total(calendar.rows)).toBe(365)
      const lastWeekDates = calendar.rows.flatMap(r => r.filter(c => c.week === ACTIVITY_WEEKS - 1).map(c => c.day.date))
      expect(lastWeekDates).toContain(today)
      expect(lastWeekDates.every(date => date <= today)).toBe(true)
      expect(Object.keys(calendar.byDate)).toHaveLength(365)
    }
  })

  it('うるう日を含む年でも、365日が重複なく並ぶ', () => {
    const calendar = buildActivityCalendar([row({ created_at: '2028-02-29T03:00:00Z' })], '2028-03-01')
    expect(Object.keys(calendar.byDate)).toHaveLength(365)
    expect(calendar.byDate['2028-02-29']!.count).toBe(1)
    expect(new Set(calendar.rows.flat().map(c => c.day.date)).size).toBe(365)
  })

  it('月の名前は、今日から1年分が古い順に1回ずつ（最初の週が月末の数日だけなら外す）', () => {
    const calendar = buildActivityCalendar([], '2026-10-19')
    expect(calendar.monthLabels.map(l => l.month)).toEqual([11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const weeks = calendar.monthLabels.map(l => l.week)
    for (let i = 1; i < weeks.length; i++) expect(weeks[i]! - weeks[i - 1]!).toBeGreaterThanOrEqual(3)
  })
})

describe('buildActivityCalendar（数え方）', () => {
  const today = '2026-10-19'

  it('日付は日本時間で区切る（UTC 15:00 で次の日）', () => {
    const calendar = buildActivityCalendar([
      row({ created_at: '2026-10-08T14:59:59Z' }),
      row({ created_at: '2026-10-08T15:00:00Z' }),
    ], today)
    expect(calendar.byDate['2026-10-08']!.count).toBe(1)
    expect(calendar.byDate['2026-10-09']!.count).toBe(1)
  })

  it('観察日があれば観察日で数え、なければ投稿日で数える', () => {
    const calendar = buildActivityCalendar([
      row({ observed_at: '2026-10-01T03:00:00Z', created_at: '2026-10-10T03:00:00Z' }),
      row({ observed_at: null, created_at: '2026-10-12T03:00:00Z' }),
    ], today)
    expect(calendar.byDate['2026-10-01']!.count).toBe(1)
    expect(calendar.byDate['2026-10-10']!.count).toBe(0)
    expect(calendar.byDate['2026-10-12']!.count).toBe(1)
  })

  it('審査待ちも投稿した日に数える（件数に含め、審査待ちの内数も持つ）。却下と未知の状態は数えない', () => {
    const calendar = buildActivityCalendar([
      row({ status: 'approved' }),
      row({ status: 'pending' }),
      row({ status: 'rejected' }),
      row({ status: 'draft' }),
    ], today)
    const day = calendar.byDate['2026-10-10']!
    expect(day.count).toBe(2)
    expect(day.pending).toBe(1)
    expect(calendar.totalRecords).toBe(2)
    expect(calendar.pendingRecords).toBe(1)
  })

  it('1日の件数は5件で頭打ち。不在確認も1件として数え、種類ごとの件数を持つ', () => {
    const rows = [
      ...Array.from({ length: 7 }, () => row({ info_type: 'absence' })),
      row({ info_type: 'sighting' }),
    ]
    const day = buildActivityCalendar(rows, today).byDate['2026-10-10']!
    expect(day.count).toBe(8)
    expect(day.level).toBe(4)
    expect(day.byType).toEqual({ absence: 7, sighting: 1 })
  })

  it('今日より先の日と、365日より前の日は数えない。範囲の最初の日は数える', () => {
    const calendar = buildActivityCalendar([
      row({ created_at: '2026-10-25T03:00:00Z' }), // 未来
      row({ created_at: '2025-10-19T03:00:00Z' }), // 366日前
      row({ created_at: '2025-10-20T00:00:00+09:00' }), // 範囲の最初の日（364日前）
    ], today)
    expect(calendar.totalRecords).toBe(1)
    expect(calendar.byDate['2025-10-20']!.count).toBe(1)
  })

  it('年をまたぐ日付も、日本時間で数える', () => {
    const calendar = buildActivityCalendar([row({ created_at: '2025-12-31T20:00:00Z' })], '2026-01-05')
    expect(activityStart('2026-01-05')).toBe('2025-01-06')
    expect(calendar.byDate['2026-01-01']!.count).toBe(1)
  })

  it('合計の日数・件数と、活動した日の一覧（新しい順）', () => {
    const calendar = buildActivityCalendar([
      row({ created_at: '2026-10-03T03:00:00Z' }),
      row({ created_at: '2026-10-10T03:00:00Z' }),
      row({ created_at: '2026-10-10T05:00:00Z' }),
      row({ created_at: '2026-09-01T03:00:00Z' }),
    ], today)
    expect(calendar.totalDays).toBe(3)
    expect(calendar.totalRecords).toBe(4)
    expect(calendar.activeDays.map(d => [d.date, d.count])).toEqual([['2026-10-10', 2], ['2026-10-03', 1], ['2026-09-01', 1]])
  })

  it('記録が無ければ、合計は0で一覧は空', () => {
    const calendar = buildActivityCalendar([], today)
    expect(calendar.totalDays).toBe(0)
    expect(calendar.totalRecords).toBe(0)
    expect(calendar.activeDays).toEqual([])
  })
})
