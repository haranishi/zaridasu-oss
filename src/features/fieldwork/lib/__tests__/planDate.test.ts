import { describe, expect, it } from 'vitest'

import { addDays, defaultPlannedOn, EVENING_HOUR, planDay, shortDate } from '../planDate'

// REQ-330（採点 2 周目 A5）: 計画は前の晩に作ることが多い。16 時以降は予定日の既定を明日にする。

describe('planDate', () => {
  it('16 時より前は今日、16 時ちょうどからは明日を既定にする', () => {
    expect(EVENING_HOUR).toBe(16)
    expect(defaultPlannedOn(new Date(2026, 9, 2, 15, 59))).toBe('2026-10-02')
    expect(defaultPlannedOn(new Date(2026, 9, 2, 16, 0))).toBe('2026-10-03')
    // 月末・年末をまたぐ
    expect(defaultPlannedOn(new Date(2026, 9, 31, 20, 0))).toBe('2026-11-01')
    expect(defaultPlannedOn(new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01')
  })

  it('日数を足す・「10/2」の形・今日／明日／それ以外', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-10-02', -1)).toBe('2026-10-01')
    expect(shortDate('2026-10-02')).toBe('10/2')
    expect(planDay('2026-10-02', '2026-10-02')).toBe('today')
    expect(planDay('2026-10-03', '2026-10-02')).toBe('tomorrow')
    expect(planDay('2026-10-05', '2026-10-02')).toBe('other')
  })
})
