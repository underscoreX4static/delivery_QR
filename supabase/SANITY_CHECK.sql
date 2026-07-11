-- ============================================================================
-- SANITY CHECK — verify the money refactor against your REAL prod data.
-- Read-only (only SELECTs). Run in the Supabase SQL editor AFTER migrations
-- 007, 009, 010, 011. Each block says what result means "all good".
-- No app clicking needed — this checks the layer that actually carries risk.
-- ============================================================================


-- 1) Every delivered order has a frozen payout snapshot (migration 009 + backfill).
--    ✅ want: 0
select count(*) as delivered_orders_missing_snapshot_want_0
from orders
where status = 'delivered'
  and (margin is null or driver_payout is null or owner_net is null);


-- 2) THE BIG ONE — cash reconciles on new-formula orders:
--    driver_payout + owner_net + commission + COGS = order.total
--    (discount/credit are already netted into total and absorbed by owner_net).
--    ⚠️ EDIT the date below to when you deployed the refactor (Phase 1). Older
--    orders were backfilled under the OLD formula and won't reconcile here
--    (they carried the old delivery double-count) — that's expected.
--    ✅ want: 0 rows returned
with parts as (
  select o.id, o.total, o.driver_payout, o.owner_net, o.created_at,
    coalesce((select sum(a.commission_amount) from affiliate_commissions a where a.order_id = o.id), 0) as commission,
    coalesce((select sum(i.unit_cost_price * i.quantity) from order_items i where i.order_id = o.id), 0) as cogs
  from orders o
  where o.status = 'delivered'
    and o.created_at >= '2026-07-11'   -- <<< set to your Phase-1 deploy date
)
select id, total, driver_payout, owner_net, commission,
       round(cogs::numeric, 2) as cogs,
       round((driver_payout + owner_net + commission + cogs - total)::numeric, 2) as diff
from parts
where abs(driver_payout + owner_net + commission + cogs - total) > 0.05
order by created_at desc;


-- 3) Commission never exceeds the uncapped margin×rate (the owner floor only
--    ever caps it DOWN, never up). New commissions carry commission_base.
--    ✅ want: 0 rows returned
select id, commission_base, commission_rate, commission_amount
from affiliate_commissions
where commission_base is not null
  and commission_amount > round((commission_base * commission_rate)::numeric, 2) + 0.01;


-- 4) Growth pool ledger — eyeball the two pockets (informational).
--    driver_bonus: in = delivery set-asides, out = grants.
--    acquisition:  out = commission + promo + referral credit.
select category, direction, count(*) as movements, round(sum(amount)::numeric, 2) as total
from pool_movements
group by category, direction
order by category, direction;

--    Driver-bonus pocket balance = opening (settings) + ledger net. Should match
--    the "Driver pool budget" shown on /admin/drivers and /admin/finance.
select
  coalesce((select value::numeric from settings where key = 'driver_pool_balance'), 0)
  + coalesce(sum(case when direction = 'in' then amount else -amount end), 0) as driver_pool_balance
from pool_movements
where category = 'driver_bonus';


-- 5) No approved referral could be double-credited. After migration 010's
--    history guard, every pre-existing 'approved' referral is stamped; a new
--    one has referred_credited_at set at approval.
--    ✅ want: 0
select count(*) as approved_referrals_unstamped_want_0
from referrals
where status = 'approved'
  and referred_credited_at is null
  and referrer_credited_at is null;


-- ============================================================================
-- Reading it: blocks 1, 3, 5 should be 0 / no rows. Block 2 (reconciliation)
-- should return NO ROWS — any row is a real money mismatch worth a look.
-- Block 4 is just a snapshot of the pool. If all green, the money math holds
-- on your real data — go to sleep.
-- ============================================================================
