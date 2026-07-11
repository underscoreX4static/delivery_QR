import { describe, expect, it } from 'vitest'
import { isWelcomeBonusTriggered } from './commission-rules'

describe('isWelcomeBonusTriggered — unlocks on the Nth referred sale', () => {
  it('trigger 1 fires on the very first commission (0 prior)', () => {
    expect(isWelcomeBonusTriggered(0, 1)).toBe(true)
    expect(isWelcomeBonusTriggered(1, 1)).toBe(false)
  })

  it('trigger 2 fires on the second (1 prior), not the first or third', () => {
    expect(isWelcomeBonusTriggered(0, 2)).toBe(false)
    expect(isWelcomeBonusTriggered(1, 2)).toBe(true)
    expect(isWelcomeBonusTriggered(2, 2)).toBe(false)
  })

  it('trigger 3 fires on the third (2 prior)', () => {
    expect(isWelcomeBonusTriggered(2, 3)).toBe(true)
  })

  it('a missing/invalid trigger defaults to 1', () => {
    expect(isWelcomeBonusTriggered(0, null)).toBe(true)
    expect(isWelcomeBonusTriggered(0, undefined)).toBe(true)
    expect(isWelcomeBonusTriggered(0, 0)).toBe(true)
  })
})
