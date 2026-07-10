/**
 * First-touch exclusive attribution: a customer belongs to the FIRST QR code
 * they ever scan, forever. Commission is paid to that partner (see markDelivered
 * in lib/orders.ts), regardless of which QR opened any later order.
 */

/**
 * The value `users.first_qr_source` should hold after a /start scan.
 *
 * - Already attributed (current set) → never changes (the lock).
 * - Not yet attributed (current null) → takes the incoming QR (which may itself
 *   be null for an organic start, leaving the customer unattributed).
 *
 * Pure so it can be unit-tested; the caller does the DB write only when this
 * returns a different, non-null value.
 */
export function resolveFirstTouch(current: string | null, incomingQrCodeId: string | null): string | null {
  return current ?? incomingQrCodeId
}
