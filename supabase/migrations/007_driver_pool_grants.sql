-- Migration 007 — Driver bonus pool: global budget + discretionary grants
--
-- Shifts the driver bonus system from per-driver auto-accumulation + fixed
-- milestones to: ONE global pool budget (funded by a share of owner net on
-- every non-owner-driver delivery), from which the owner grants fixed bonuses
-- to any driver(s) at will. Grants are paid out with the driver's settlement.
--
-- Run this in the Supabase SQL editor before/at deploy. The app degrades
-- gracefully if it hasn't run yet (pool reads as 0, no grants), so order
-- isn't fatal — but grants can't be created until it's applied.

-- Discretionary bonuses drawn from the global pool budget.
create table if not exists driver_bonus_grants (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  amount decimal(10,2) not null,
  note text,
  paid_out boolean not null default false,
  paid_out_at timestamptz,
  -- Frozen at settlement creation, mirroring settlement_orders — tells the
  -- settlement exactly which grants it covers so later grants don't leak in.
  settlement_id uuid references settlements(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_bonus_grants_driver on driver_bonus_grants(driver_id, paid_out);
create index if not exists idx_driver_bonus_grants_settlement on driver_bonus_grants(settlement_id);

alter table driver_bonus_grants enable row level security;
create policy "no_access" on driver_bonus_grants for all using (false);

-- Global pool balance as a running counter. Seeded from whatever was already
-- accumulated across the old per-driver bonus_pool_balance columns so no
-- set-aside budget is lost in the switch.
insert into settings (key, value)
  values ('driver_pool_balance', (select coalesce(sum(bonus_pool_balance), 0)::text from drivers))
  on conflict (key) do nothing;
