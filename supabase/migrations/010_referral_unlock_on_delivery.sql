-- Migration 010 — Asymmetric referral credit (Phase 3)
--
-- Additive. Run in the Supabase SQL editor.
--
-- The two sides of a referral are now credited at different moments:
--   - The REFERRED customer (filleul) is credited at admin APPROVAL, so the
--     credit is usable on their FIRST order (the acquisition hook).
--   - The REFERRER (parrain) is credited only once that new customer's first
--     order is actually DELIVERED (proof the referral converted to a sale).
-- Each timestamp doubles as the anti-double-pay / idempotency guard for its side.

alter table referrals add column if not exists referred_credited_at timestamptz;
alter table referrals add column if not exists referrer_credited_at timestamptz;

-- History guard (IMPORTANT, runs by default): any referral already 'approved'
-- under the OLD rule already credited BOTH sides at approval time. Stamp both
-- new columns so the new logic never re-credits them.
update referrals
  set referred_credited_at = coalesce(referred_credited_at, reviewed_at, now()),
      referrer_credited_at = coalesce(referrer_credited_at, reviewed_at, now())
  where status = 'approved';
