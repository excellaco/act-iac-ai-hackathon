import {
  risColor,
  risFillColor,
  risLabel,
  risLabelShort,
  SUB_SCORE_META,
  BUPU_STOPS,
  LEGEND_STOPS,
  type SubScoreKey,
} from '../lib/ris'

describe('risColor', () => {
  it('returns darkest BuPu for scores >= 70', () => {
    expect(risColor(70)).toBe('#045a8d')
    expect(risColor(100)).toBe('#045a8d')
  })

  it('returns mid BuPu for scores 40–69', () => {
    expect(risColor(40)).toBe('#2b8cbe')
    expect(risColor(69)).toBe('#2b8cbe')
  })

  it('returns lightest usable BuPu for scores < 40', () => {
    expect(risColor(0)).toBe('#74a9cf')
    expect(risColor(39)).toBe('#74a9cf')
  })

  it('threshold boundaries are exact', () => {
    expect(risColor(39)).toBe('#74a9cf')
    expect(risColor(40)).toBe('#2b8cbe')
    expect(risColor(69)).toBe('#2b8cbe')
    expect(risColor(70)).toBe('#045a8d')
  })
})

describe('risFillColor', () => {
  it('returns gray for undefined scores', () => {
    expect(risFillColor(undefined)).toBe('#e5e7eb')
  })

  it('maps each BuPu stop correctly', () => {
    expect(risFillColor(0)).toBe('#f1eef6')
    expect(risFillColor(19)).toBe('#f1eef6')
    expect(risFillColor(20)).toBe('#bdc9e1')
    expect(risFillColor(40)).toBe('#74a9cf')
    expect(risFillColor(60)).toBe('#2b8cbe')
    expect(risFillColor(80)).toBe('#045a8d')
  })

  it('handles score of exactly 100', () => {
    expect(risFillColor(100)).toBe('#045a8d')
  })
})

describe('risLabel', () => {
  it('returns full labels at threshold boundaries', () => {
    expect(risLabel(70)).toBe('High Restrictiveness')
    expect(risLabel(40)).toBe('Moderate Restrictiveness')
    expect(risLabel(39)).toBe('Low Restrictiveness')
  })
})

describe('risLabelShort', () => {
  it('returns short labels at threshold boundaries', () => {
    expect(risLabelShort(70)).toBe('High')
    expect(risLabelShort(40)).toBe('Moderate')
    expect(risLabelShort(39)).toBe('Low')
  })
})

describe('SUB_SCORE_META', () => {
  const expectedKeys: SubScoreKey[] = ['dci', 'dcoi', 'pci', 'crp']

  it('contains exactly the 4 sub-score keys', () => {
    expect(Object.keys(SUB_SCORE_META).sort()).toEqual([...expectedKeys].sort())
  })

  it('each entry has label, shortLabel, and description', () => {
    for (const key of expectedKeys) {
      const meta = SUB_SCORE_META[key]
      expect(meta.label).toBeTruthy()
      expect(meta.shortLabel).toBeTruthy()
      expect(meta.description).toBeTruthy()
    }
  })
})

describe('palette constants', () => {
  it('BUPU_STOPS has 5 entries covering 0–100', () => {
    expect(BUPU_STOPS).toHaveLength(5)
    expect(BUPU_STOPS[0].min).toBe(0)
    expect(BUPU_STOPS[4].max).toBe(100)
  })

  it('LEGEND_STOPS has 5 entries matching BUPU_STOPS colors', () => {
    expect(LEGEND_STOPS).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(LEGEND_STOPS[i].color).toBe(BUPU_STOPS[i].color)
    }
  })
})
