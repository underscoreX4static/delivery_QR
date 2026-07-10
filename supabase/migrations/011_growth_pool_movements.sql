-- Migration 011 — Growth pool ledger (Phase 4)
--
-- Additive. Run in the Supabase SQL editor.
--
-- One append-only ledger for the whole "growth" spend, split into two tracked
-- pockets so acquisition can always be reported apart from driver bonuses:
--   - category 'driver_bonus' : a real budget. IN = owner-net set-aside on each
--     delivery; OUT = bonuses granted to drivers. Its balance =
--     settings.driver_pool_balance (kept as the OPENING balance) + ledger net.
--   - category 'acquisition'  : a spend tracker. OUT = commission + promo
--     discount + referral credit actually borne by the owner on delivered
--     orders. Lets finance answer "how much acquisition cost this month".
--
-- settings.driver_pool_balance is NO LONGER mutated by the app after this — it
-- freezes as the opening balance and the ledger takes over. (No historical
-- movements are reconstructed; the ledger is forward-only.)

create table if not exists pool_movements (
  id uuid primary key default gen_random_uuid(),
  category text not null,            -- 'acquisition' | 'driver_bonus'
  direction text not null,           -- 'in' | 'out'
  amount decimal(10,2) not null,     -- always positive; direction carries the sign
  order_id uuid references orders(id) on delete set null,
  reference text,                    -- 'delivery_contribution' | 'grant' | 'commission' | 'promo_discount' | 'referral_credit'
  created_at timestamptz not null default now()
);

create index if not exists idx_pool_movements_category on pool_movements(category, created_at);
create index if not exists idx_pool_movements_order on pool_movements(order_id);

alter table pool_movements enable row level security;
create policy "no_access" on pool_movements for all using (false);
