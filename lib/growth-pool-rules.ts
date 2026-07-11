/** Pure growth-pool math — no DB/I/O, so it's unit-testable in isolation. */

export type PoolCategory = 'acquisition' | 'driver_bonus'
export type PoolDirection = 'in' | 'out'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Net balance from an opening amount + a list of movements. */
export function poolBalanceFromMovements(
  opening: number,
  movements: { direction: PoolDirection; amount: number }[]
): number {
  let balance = opening
  for (const m of movements) balance += m.direction === 'in' ? m.amount : -m.amount
  return round2(balance)
}

/** Acquisition spend = out − in across a set of acquisition movements. */
export function acquisitionSpendFromMovements(movements: { direction: PoolDirection; amount: number }[]): number {
  let spend = 0
  for (const m of movements) spend += m.direction === 'out' ? m.amount : -m.amount
  return round2(spend)
}
