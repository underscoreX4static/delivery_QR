import { describe, expect, it } from 'vitest'
import { acquisitionSpendFromMovements, poolBalanceFromMovements } from './growth-pool-rules'

describe('poolBalanceFromMovements — pocket balance = opening + ledger net', () => {
  it('opening balance with no movements', () => {
    expect(poolBalanceFromMovements(100, [])).toBe(100)
  })

  it('adds ins, subtracts outs', () => {
    const movements = [
      { direction: 'in' as const, amount: 12.5 }, // delivery contribution
      { direction: 'in' as const, amount: 7.5 },
      { direction: 'out' as const, amount: 15 }, // grant
    ]
    expect(poolBalanceFromMovements(100, movements)).toBe(105)
  })

  it('can go negative (owner grants more than set aside)', () => {
    expect(poolBalanceFromMovements(0, [{ direction: 'out' as const, amount: 40 }])).toBe(-40)
  })

  it('rounds to cents', () => {
    expect(poolBalanceFromMovements(0, [{ direction: 'in' as const, amount: 0.1 }, { direction: 'in' as const, amount: 0.2 }])).toBe(0.3)
  })
})

describe('acquisitionSpendFromMovements — spend = out − in', () => {
  it('sums outs (commission + promo + credit) as spend', () => {
    const movements = [
      { direction: 'out' as const, amount: 6 }, // commission
      { direction: 'out' as const, amount: 20 }, // promo discount
      { direction: 'out' as const, amount: 5 }, // referral credit
    ]
    expect(acquisitionSpendFromMovements(movements)).toBe(31)
  })

  it('nets any refund-style ins back out of the spend', () => {
    expect(acquisitionSpendFromMovements([{ direction: 'out' as const, amount: 20 }, { direction: 'in' as const, amount: 5 }])).toBe(15)
  })

  it('no movements = zero spend', () => {
    expect(acquisitionSpendFromMovements([])).toBe(0)
  })
})
