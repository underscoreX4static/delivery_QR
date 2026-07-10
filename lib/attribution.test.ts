import { describe, expect, it } from 'vitest'
import { resolveFirstTouch } from './attribution'

describe('resolveFirstTouch — first-touch exclusive lock', () => {
  it('organic start (no QR) leaves the customer unattributed', () => {
    expect(resolveFirstTouch(null, null)).toBe(null)
  })

  it('first QR scanned attributes the customer', () => {
    expect(resolveFirstTouch(null, 'qr-A')).toBe('qr-A')
  })

  it('an already-attributed customer is NEVER reassigned by a later QR', () => {
    // Scanned QR-A first, then QR-B later → stays A.
    expect(resolveFirstTouch('qr-A', 'qr-B')).toBe('qr-A')
  })

  it('an organic-then-scan customer gets attributed on their first scan', () => {
    // current null (organic signup) + later scans QR-A → A wins.
    expect(resolveFirstTouch(null, 'qr-A')).toBe('qr-A')
  })

  it('a later organic start does not clear an existing attribution', () => {
    expect(resolveFirstTouch('qr-A', null)).toBe('qr-A')
  })
})
