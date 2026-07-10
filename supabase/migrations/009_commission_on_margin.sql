-- Migration 009 — Commission on margin + payout snapshots (Phase 1 refactor)
--
-- Additive + a one-time backfill. Run in the Supabase SQL editor.
--
-- 1) New columns:
--    - orders.margin / driver_payout / owner_net : payout snapshot frozen at
--      delivery (decision D5) so driver pay is deterministic and read-models
--      don't recompute historical orders under the new formula.
--    - affiliate_commissions.commission_base : the base the commission was
--      charged on. New rows store the MARGIN; old rows (charged on CA/order.total)
--      stay NULL so the two eras are distinguishable without rewriting history.
--
-- 2) Backfill: for orders already delivered BEFORE this refactor, snapshot their
--    payout using the OLD formula (revenue-based, delivery double-counted as it
--    was at the time) so those drivers keep exactly what they were owed. This
--    is NOT a rule change to history — it just freezes the old numbers into the
--    new columns. New deliveries write the new-formula snapshot from app code.

alter table orders add column if not exists margin decimal(10,2);
alter table orders add column if not exists driver_payout decimal(10,2);
alter table orders add column if not exists owner_net decimal(10,2);

alter table affiliate_commissions add column if not exists commission_base decimal(10,2);

-- One-time backfill of already-delivered orders under the OLD formula.
-- OLD: grossProfit = total − COGS ; driver = isOwner?0 : delivery_fee + grossProfit×0.38 ;
--      owner_net = grossProfit×0.62 − commission ; margin(display) = subtotal − COGS.
update orders o set
  margin = round(
    o.subtotal - coalesce((select sum(oi.unit_cost_price * oi.quantity) from order_items oi where oi.order_id = o.id), 0)
  , 2),
  driver_payout = round(
    case when coalesce((select d.is_owner from drivers d where d.id = o.driver_id), false)
      then 0
      else o.delivery_fee
         + (o.total - coalesce((select sum(oi.unit_cost_price * oi.quantity) from order_items oi where oi.order_id = o.id), 0)) * 0.38
    end
  , 2),
  owner_net = round(
    (o.total - coalesce((select sum(oi.unit_cost_price * oi.quantity) from order_items oi where oi.order_id = o.id), 0)) * 0.62
    - coalesce((select sum(ac.commission_amount) from affiliate_commissions ac where ac.order_id = o.id), 0)
  , 2)
where o.status = 'delivered' and o.driver_payout is null;
