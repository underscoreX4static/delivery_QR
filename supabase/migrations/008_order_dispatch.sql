-- Migration 008 — Order dispatch (offer/accept flow)
--
-- Lets the owner route a new order to drivers instead of hand-assigning:
--   • assign     — offer to one chosen driver
--   • broadcast  — offer to all active drivers at once, first accept wins
--   • sequential — offer to one driver at a time, 1 min each, advance on timeout
-- A driver ACCEPTING is what confirms the order (commits stock) and assigns
-- them — same downstream flow as before (confirmed → on_the_way → delivered).
--
-- FUTURE (owner's idea): the sequential mode's driver ORDER should eventually
-- be a stats-based algorithm — rank who gets offered first by acceptance rate,
-- lifetime deliveries, speed, and rotation fairness. When built, it lives in a
-- single getDispatchOrder(drivers) function so nothing else has to change.
--
-- Run in the Supabase SQL editor. Additive: existing orders/flows are
-- unaffected until a dispatch is actually started.

-- How this order was routed. Null = legacy / hand-assigned, untouched.
alter table orders add column if not exists dispatch_mode text;

-- One row per (order, driver) offer. The set of rows for an order is also the
-- record of who's already been tried, so sequential rotation just skips
-- drivers that already have a non-pending offer here.
create table if not exists order_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  -- pending: awaiting the driver's tap. accepted: they took it (terminal, one
  -- per order). refused: they declined. expired: sequential 1-min window
  -- elapsed. superseded: another driver won a broadcast first.
  status text not null default 'pending',
  offered_at timestamptz not null default now(),
  -- Only set for sequential offers (the 1-min deadline the tick cron checks).
  expires_at timestamptz,
  -- The Telegram message id of the offer, so its buttons can be edited away
  -- once the offer is resolved.
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_offers_order on order_offers(order_id, status);
create index if not exists idx_order_offers_driver on order_offers(driver_id, status);
-- The tick cron scans for pending sequential offers past their deadline.
create index if not exists idx_order_offers_pending_expiry on order_offers(status, expires_at);

alter table order_offers enable row level security;
create policy "no_access" on order_offers for all using (false);
