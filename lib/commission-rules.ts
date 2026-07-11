/** Pure commission-related rules — no DB/I/O, unit-testable in isolation. */

/**
 * Whether THIS delivery is the one that unlocks a commercial's welcome bonus.
 * `priorCommissions` is how many commissions they already had before this
 * order's own commission row was inserted, so the Nth delivery is the one where
 * priorCommissions === triggerOrders − 1 (trigger is 1, 2 or 3). Defaults a
 * missing/invalid trigger to 1.
 */
export function isWelcomeBonusTriggered(priorCommissions: number, triggerOrders: number | null | undefined): boolean {
  const trigger = triggerOrders && triggerOrders > 0 ? triggerOrders : 1
  return priorCommissions === trigger - 1
}
