# CLAUDE.md — HAZE Delivery App
## Complete build instructions for a fresh project

Read this entire file before writing a single line of code.
This is the single source of truth for the entire project.

---

## 0. What You Are Building

A QR code-based cash-on-delivery platform for Brisbane, Australia.

- Physical shops display QR codes → customer scans → Telegram Mini App opens → orders products → pays cash on delivery
- One owner (HAZE), internal drivers, shop partners who earn affiliate commission
- Cash on delivery only — no online payment integration
- Brisbane only — postcode-validated delivery zone
- Fully operational Telegram ecosystem: Mini App for customers, Bot for drivers and notifications, Web dashboard for admin

---

## 1. Owner Identity

```
Owner name:        HAZE
Owner Telegram ID: 8376671012
Admin email:       leshit.fr@gmail.com
Admin password:    (set manually in Supabase Auth dashboard after setup)
```

This Telegram ID must be seeded into the `drivers` table on first migration with `is_owner = true`.
This email is the only admin account. There is only ever ONE admin.

---

## 2. Prerequisites — Do These Before Writing Any Code

### 2.1 Create Telegram Bot
1. Open Telegram, search `@BotFather`
2. Send `/newbot`
3. Name: `HAZE Delivery`
4. Username: `HAZEDeliveryBot` (or available variant)
5. Save the bot token → `TELEGRAM_BOT_TOKEN`
6. Send `/setmenubutton` → set Web App URL to `https://your-vercel-domain.vercel.app/order`
7. Send `/setdomain` → add your Vercel domain

### 2.2 Create Supabase Project
1. Go to supabase.com → New project
2. Name: `haze-delivery`
3. Save: Project URL → `NEXT_PUBLIC_SUPABASE_URL`
4. Save: anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Save: service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 2.3 Init Next.js Project
```bash
npx create-next-app@latest haze-delivery \
  --typescript --tailwind --eslint \
  --app --src-dir=false --import-alias="@/*"
cd haze-delivery
```

### 2.4 Install Dependencies
```bash
npm install @supabase/supabase-js @supabase/ssr \
  node-telegram-bot-api \
  papaparse qrcode \
  date-fns \
  recharts \
  @types/node-telegram-bot-api \
  @types/papaparse \
  @types/qrcode
```

---

## 3. Environment Variables

Create `.env.local` at project root:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=generate_a_random_32char_string
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=HAZEDeliveryBot
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
CRON_SECRET=generate_another_random_32char_string
```

Add `.env.local` to `.gitignore` immediately.

---

## 4. Project Structure

```
haze-delivery/
├── app/
│   ├── (client)/
│   │   ├── order/          ← Telegram Mini App (catalogue, cart, checkout)
│   │   └── chat/           ← Per-order chat for customers
│   ├── admin/
│   │   ├── orders/         ← Live order management
│   │   ├── products/       ← Product + batch management + CSV import
│   │   ├── inventory/      ← Inventory intelligence + restock alerts
│   │   ├── partners/       ← Partners/affiliates with commission rates
│   │   ├── qr-codes/       ← QR code generation + stats
│   │   ├── drivers/        ← Driver management
│   │   ├── settlements/    ← Payout tracking
│   │   ├── earnings/       ← Revenue dashboard
│   │   ├── schedule/       ← Hourly heatmap
│   │   └── settings/       ← Store config
│   └── api/
│       ├── telegram/       ← Single webhook endpoint
│       ├── cart/           ← Cart preview (FIFO price)
│       ├── orders/         ← Order CRUD
│       ├── admin/          ← Admin API routes
│       └── cron/
│           └── inventory-refresh/  ← Nightly cron
├── lib/
│   ├── supabase.ts         ← supabaseAdmin client (service_role)
│   ├── calculations.ts     ← ALL financial calculations (single source of truth)
│   ├── inventory.ts        ← ALL stock operations (single source of truth)
│   ├── inventory-intelligence.ts  ← Velocity, tiers, restock alerts
│   ├── telegram.ts         ← Bot helpers
│   └── zones.ts            ← Brisbane postcodes whitelist
├── types/
│   └── index.ts            ← All TypeScript types
├── components/
│   ├── client/             ← Mini App components
│   ├── admin/              ← Dashboard components
│   └── shared/             ← Shared components
├── supabase/
│   └── migrations/         ← SQL migration files
├── CLAUDE.md               ← This file
└── vercel.json             ← Cron config
```

---

## 5. Database Schema — Complete SQL

Run these migrations in order in Supabase SQL editor.

### Migration 001 — Core tables

```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ENUMS
create type order_status as enum (
  'pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'
);
create type settlement_type as enum ('driver', 'partner');
create type settlement_status as enum (
  'proposed', 'confirmed', 'paid', 'payment_received'
);
create type velocity_tier as enum ('bestseller', 'normal', 'slow_mover');
create type sender_role as enum ('customer', 'driver', 'owner');

-- PARTNERS (shops that display QR codes, earn affiliate commission)
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_name text,
  contact_phone text,
  commission_rate decimal(5,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- QR CODES
create table qr_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  slug text not null unique,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- QR SCANS (attribution log)
create table qr_scans (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references qr_codes(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  telegram_user_id text,
  scanned_at timestamptz not null default now()
);

-- USERS (Telegram customers)
create table users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique,
  first_name text,
  last_name text,
  phone text,
  default_address text,
  first_qr_source uuid references qr_codes(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Fix forward reference: add FK after users table exists
alter table qr_scans
  add constraint qr_scans_user_id_fkey
  foreign key (user_id) references users(id) on delete set null;

-- CATEGORIES
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- PRODUCTS
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  name text not null,
  brand text,
  subcategory text,
  description text,
  image_url text,
  stock_qty int not null default 0,
  target_margin decimal(5,4) not null default 0.55,
  velocity_tier velocity_tier not null default 'normal',
  avg_daily_units decimal(10,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- PRODUCT BATCHES (FIFO inventory)
create table product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  quantity_total int not null,
  quantity_remaining int not null,
  cost_price decimal(10,2) not null,
  sell_price decimal(10,2) not null,
  supplier text,
  received_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint quantity_remaining_positive check (quantity_remaining >= 0),
  constraint quantity_remaining_lte_total check (quantity_remaining <= quantity_total)
);

-- DRIVERS
create table drivers (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique,
  first_name text not null,
  last_name text,
  is_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ORDERS
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  qr_code_id uuid references qr_codes(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  status order_status not null default 'pending',
  delivery_address text not null,
  delivery_fee decimal(10,2) not null default 10,
  subtotal decimal(10,2) not null,
  discount decimal(10,2) not null default 0,
  total decimal(10,2) not null,
  notes text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ORDER ITEMS (one row per batch consumed)
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid not null references product_batches(id) on delete restrict,
  quantity int not null,
  unit_sell_price decimal(10,2) not null,
  unit_cost_price decimal(10,2) not null,
  line_total decimal(10,2) not null
);

-- ORDER STATUS HISTORY
create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  changed_at timestamptz not null default now(),
  changed_by text
);

-- ORDER MESSAGES (per-order chat)
create table order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sender_role sender_role not null,
  sender_id text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- SETTLEMENTS
create table settlements (
  id uuid primary key default gen_random_uuid(),
  type settlement_type not null,
  status settlement_status not null default 'proposed',
  driver_id uuid references drivers(id) on delete set null,
  period_start date not null,
  period_end date not null,
  total_cash decimal(10,2) not null,
  payout_amount decimal(10,2) not null,
  proposed_by text not null,
  proposed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  payment_confirmed_at timestamptz,
  notes text
);

-- SETTLEMENT ORDERS (join table)
create table settlement_orders (
  settlement_id uuid not null references settlements(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  primary key (settlement_id, order_id)
);

-- AFFILIATE COMMISSIONS
create table affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  order_total decimal(10,2) not null,
  commission_rate decimal(5,4) not null,
  commission_amount decimal(10,2) not null,
  paid_out boolean not null default false,
  paid_out_at timestamptz,
  created_at timestamptz not null default now()
);

-- SETTINGS (config only, never transient state)
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Default settings
insert into settings (key, value) values
  ('open_time', '10:00'),
  ('close_time', '24:00'),
  ('is_manually_closed', 'false'),
  ('delivery_fee', '10'),
  ('free_delivery_threshold', '150'),
  ('discount_threshold', '250'),
  ('discount_rate', '0.10'),
  ('reorder_days_default', '7');
```

### Migration 002 — Indexes

```sql
create index idx_orders_status on orders(status);
create index idx_orders_user_id on orders(user_id);
create index idx_orders_driver_id on orders(driver_id);
create index idx_orders_created_at on orders(created_at desc);
create index idx_order_items_order_id on order_items(order_id);
create index idx_order_items_batch_id on order_items(batch_id);
create index idx_product_batches_product_id on product_batches(product_id);
create index idx_product_batches_active on product_batches(product_id, is_active, received_at);
create index idx_qr_scans_qr_code_id on qr_scans(qr_code_id);
create index idx_qr_scans_user_id on qr_scans(user_id);
create index idx_settlements_driver_id on settlements(driver_id);
create index idx_affiliate_commissions_partner_id on affiliate_commissions(partner_id);
create index idx_affiliate_commissions_paid_out on affiliate_commissions(paid_out);
```

### Migration 003 — DB Trigger (stock sync)

```sql
-- Trigger: keep products.stock_qty in sync with batches
create or replace function sync_product_stock()
returns trigger as $$
begin
  update products
  set stock_qty = (
    select coalesce(sum(quantity_remaining), 0)
    from product_batches
    where product_id = coalesce(new.product_id, old.product_id)
    and is_active = true
  )
  where id = coalesce(new.product_id, old.product_id);
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_product_stock
after insert or update or delete on product_batches
for each row execute function sync_product_stock();

-- Trigger: auto-update orders.updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_orders_updated_at
before update on orders
for each row execute function update_updated_at();
```

### Migration 004 — RLS

```sql
-- Enable RLS on all tables
alter table partners enable row level security;
alter table qr_codes enable row level security;
alter table qr_scans enable row level security;
alter table users enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_batches enable row level security;
alter table drivers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table order_messages enable row level security;
alter table settlements enable row level security;
alter table settlement_orders enable row level security;
alter table affiliate_commissions enable row level security;
alter table settings enable row level security;

-- Block all direct client access (service_role bypasses RLS)
create policy "no_access" on partners for all using (false);
create policy "no_access" on qr_codes for all using (false);
create policy "no_access" on qr_scans for all using (false);
create policy "no_access" on users for all using (false);
create policy "no_access" on categories for all using (false);
create policy "no_access" on products for all using (false);
create policy "no_access" on product_batches for all using (false);
create policy "no_access" on drivers for all using (false);
create policy "no_access" on orders for all using (false);
create policy "no_access" on order_items for all using (false);
create policy "no_access" on order_status_history for all using (false);
create policy "no_access" on order_messages for all using (false);
create policy "no_access" on settlements for all using (false);
create policy "no_access" on settlement_orders for all using (false);
create policy "no_access" on affiliate_commissions for all using (false);
create policy "no_access" on settings for all using (false);
```

### Migration 005 — Seed owner driver

```sql
-- Seed owner as first driver
insert into drivers (telegram_id, first_name, last_name, is_owner, is_active)
values ('8376671012', 'HAZE', '', true, true);
```

### Migration 006 — Admin auth

```
In Supabase dashboard → Authentication → Users → Add user:
  Email: leshit.fr@gmail.com
  Password: (set a strong password)
  Email confirm: skip confirmation
```

---

## 6. Supabase Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

**Rules:**
- ONLY use `supabaseAdmin` in server components and API routes
- NEVER import supabaseAdmin in client components
- For admin auth only: use `@supabase/ssr` createServerClient with anon key

---

## 7. Telegram Bot Setup

### Webhook registration
After deploying to Vercel, register the webhook:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-domain.vercel.app/api/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### Webhook handler structure
```
app/api/telegram/route.ts
  ├── Verify secret header
  ├── Route by update type:
  │   ├── message.text starting with / → command handler
  │   ├── message.text (plain) → context handler (e.g. cancel reason)
  │   └── callback_query → inline button handler
  └── Always return 200 immediately
```

### Active commands
| Command | Handler | Action |
|---|---|---|
| `/start [payload]` | handleStart | Create/get user, resolve QR slug, send Order button |
| `/orders` | handleDriverOrders | List confirmed unassigned orders (drivers only) |

### Active callback buttons
| Callback data | Action |
|---|---|
| `confirm_order:<id>` | Owner confirms → status: confirmed → notify driver |
| `self_handle:<id>` | Owner takes delivery → assign self → notify |
| `on_the_way:<id>` | Driver en route → status: on_the_way → notify customer |
| `delivered:<id>` | Delivered → status: delivered → create affiliate_commission → notify all |
| `cancel_order:<id>` | Start cancel flow → await reason text |

### ❌ NEVER implement these (dead from previous version)
`chat_reply`, `accept_assigned`, `refuse_assigned`, `take_order`, `assign broadcast`

### Notification triggers
| Event | Notify |
|---|---|
| Order placed | Owner (8376671012) |
| Order confirmed | Customer + Driver |
| On the way | Customer |
| Delivered | Customer + Owner |
| Cancelled | Customer + Driver (if assigned) |
| Low stock alert | Owner (max 1/product/24h) |

---

## 8. Business Rules

### Delivery fees & discounts
```
subtotal >= $150  → delivery_fee = $0
subtotal < $150   → delivery_fee = $10
subtotal >= $250  → discount = subtotal × 10%
total = subtotal + delivery_fee - discount
```
Values come from `settings` table, not hardcoded.

### Payout formula — lib/calculations.ts ONLY
```typescript
revenue = subtotal + delivery_fee - discount
cost = sum(order_items.unit_cost_price × quantity)
grossProfit = revenue - cost

driverPayout = delivery_fee + (grossProfit × 0.38)
// Exception: if driver.is_owner === true → driverPayout = 0

affiliateCommission = order.total × partner.commission_rate  // snapshot

ownerNet = (grossProfit × 0.62) - affiliateCommission
```

**⚠️ CRITICAL:** There must be ONLY ONE place in the codebase that calculates financials. That is `lib/calculations.ts`. No other file may contain payout or profit calculations.

### FIFO inventory — lib/inventory.ts ONLY
All stock operations go through these functions:
```typescript
planConsumption(items)      // dry-run FIFO, returns batch breakdown, no DB writes
commitConsumption(items)    // actual stock decrement, called on order confirm
refundConsumption(orderItems) // reverse on cancellation
refreshProductPrice(productId) // update product display price from oldest active batch
```
**⚠️ CRITICAL:** Never decrement stock directly. Always use lib/inventory.ts.

### Batch sell price auto-calculation
```typescript
suggestedSellPrice = costPrice / (1 - product.targetMargin)
// Admin can override before saving
```

### Split batch warning
If `planConsumption` returns items from more than one batch:
→ Show warning at checkout: "Heads up — X items are from a newer batch at a slightly higher price."
→ Show itemised prices per batch
→ Never hide price differences

### Brisbane delivery zones
```typescript
// lib/zones.ts — ~70 Brisbane suburbs/postcodes
// Validated SERVER-SIDE only in every checkout/order creation route
// Never trust client-side postcode validation
```

### Timezone
UTC+10 fixed. No DST. All `new Date()` displays converted to UTC+10.
Use `date-fns` with explicit timezone offset for all time calculations.

### Store hours
- Calculated from `settings.open_time` / `settings.close_time`
- `settings.is_manually_closed = "true"` overrides immediately
- When closed: ASAP disabled, scheduled slots for next opening still available
- Slots calculated in 30-minute increments from opening time

---

## 9. Client Mini App (/order)

### Auth flow
1. Telegram passes `initData` automatically (telegram_id, first_name, last_name)
2. Validate `initData` signature server-side on every API call
3. New user → onboarding screen (confirm phone + default delivery address)
4. Returning user → straight to catalogue

### Cart persistence
- localStorage key: `cart_${telegramUserId}_${qrSlug}`
- TTL: 24 hours
- Survives app close/Telegram navigation

### Checkout flow
1. Cart review
2. Delivery address (pre-filled, editable)
3. Time slot: ASAP (if open) or scheduled slots
4. Split batch warning (if applicable)
5. COD confirmation checkbox ("I will pay cash on delivery")
6. Server-side price confirmation via `POST /api/cart/preview`
7. Order summary → Confirm
8. Confirmation screen with order number

### Cart preview API
`POST /api/cart/preview`
- Runs real `planConsumption` FIFO calculation
- Returns exact prices per batch
- Used to avoid any discrepancy between displayed and charged price
- Must be called before final order creation

---

## 10. Admin Back-office (/admin/*)

### Auth
Supabase email/password. Single admin account: leshit.fr@gmail.com
Protect all `/admin/*` routes with middleware checking Supabase session.

### Pages

**`/admin/orders`**
- Live order list, polling every 5s
- Status machine: pending → confirmed → preparing → on_the_way → delivered / cancelled
- Assign driver dropdown
- Cancel with reason (triggers refundConsumption)
- Waze link to delivery address
- Chat panel per order (order_messages)

**`/admin/products`**
- Product list with current stock + price (from active batch)
- Create/edit product (name, brand, category, subcategory, image, target_margin)
- Batch management per product: list batches, add new batch
  - New batch form: supplier, quantity, cost_price → auto-suggests sell_price → admin can override
- CSV bulk import (papaparse)
  - Headers: `category_name, subcategory, brand, product_name, variant_size, description, price_sell, price_cost, stock_qty, image_url, is_active`
  - Preview table before import, single transaction, import summary after
  - Route: `POST /api/admin/catalogue/import`

**`/admin/inventory`**
- Top stats: total SKUs, needing restock 🔴, order soon 🟡, OK 🟢
- Main table sorted by urgency (days_remaining ASC):
  - Product name/brand, status badge, velocity tier badge, stock qty, days remaining, avg/day, profit 30d, revenue 30d, "➕ New batch" button
- Strategic view (3 columns):
  - 🟢 Invest more: bestseller + days < 14 + positive trend
  - 🟡 Watch: good volume but margin < 30% or slowing
  - 🔴 Cut: slow mover + days > 30 + low profit
- Filters: All / Restock needed / Bestsellers / Slow movers / By category

**`/admin/partners`**
- CRUD partners/affiliates
- commission_rate field (input as % e.g. "5" stored as 0.05)
- Show total commissions owed per partner

**`/admin/qr-codes`**
- Generate QR code for partner
- Slug auto-generated (nanoid), URL: `https://t.me/HAZEDeliveryBot?start=qr_<slug>`
- Download as PNG
- Stats: total scans, unique users, orders generated, conversion rate

**`/admin/drivers`**
- CRUD drivers
- is_owner flag (only one driver should have is_owner = true: telegram_id 8376671012)
- Show active orders per driver

**`/admin/settlements`**
- Driver settlements (daily)
- Partner settlements (on-demand, any period)
- Settlement flow with Telegram confirmation (see section 12)

**`/admin/earnings`**
- Today / This week / This month / All time tabs
- 14-day revenue chart (recharts)
- Gross revenue, gross profit, driver payouts, affiliate commissions, owner net
- All calculations from lib/calculations.ts

**`/admin/schedule`**
- Hourly heatmap: order volume by hour of day (last 30 days)
- Identifies peak hours for staffing decisions
- Day-of-week breakdown

**`/admin/settings`**
- Store hours (open_time, close_time)
- Manual open/close toggle with optional Telegram broadcast
- Delivery fee, free delivery threshold, discount threshold, discount rate
- Reorder days default (for inventory intelligence)

---

## 11. Inventory Intelligence

### Nightly cron
Route: `app/api/cron/inventory-refresh/route.ts`
Vercel schedule: `"0 16 * * *"` (2am Brisbane = 16:00 UTC)

vercel.json:
```json
{
  "crons": [{
    "path": "/api/cron/inventory-refresh",
    "schedule": "0 16 * * *"
  }]
}
```

Protect with `CRON_SECRET` header check.

### Cron steps
1. Calculate `avg_daily_units` per product (last 30 days delivered orders)
2. Rank all active products by gross profit (last 30 days)
3. Assign velocity_tier:
   - top 20% → bestseller
   - bottom 20% → slow_mover
   - middle 60% → normal
4. Update `products.velocity_tier` + `products.avg_daily_units`
5. For each product where `days_remaining < effective_threshold`:
   - `days_remaining = stock_qty / avg_daily_units`
   - `effective_threshold = reorder_days_default × multiplier`
     - bestseller: × 1.5
     - normal: × 1.0
     - slow_mover: × 0.5
   - Skip if avg_daily_units = 0 (never sold)
   - Send Telegram alert to owner, deduplicated: check `settings` key `last_restock_alert:<product_id>` — skip if sent < 24h ago, else send and update key

### Alert message format
```
⚠️ Restock alert — [Product Name]
Stock: X units (~Y days remaining)
Avg sales: Z units/day
Tier: 🔥 Bestseller | 📦 Normal | 🐌 Slow mover

Tap below to create a new batch.
[➕ Add batch] ← inline button linking to admin
```

---

## 12. Settlement Flows

### Driver settlement (daily)
1. Admin clicks "Create settlement" for a driver in `/admin/settlements`
2. System calculates: all delivered orders for that driver today not yet settled
3. Shows: total cash collected, driver payout (delivery_fee + 38% gross profit per order)
4. Admin confirms → Bot sends to driver:
   "You collected $X today (N deliveries). Your share: $Y. Do you confirm? ✅ ❌"
5. Driver taps ✅ → status: confirmed
6. Admin hands cash to driver physically
7. Admin marks "paid" in dashboard
8. Bot sends to driver: "Did you receive $Y? ✅ ❌"
9. Driver taps ✅ → status: payment_received → settlement locked
10. If driver taps ❌ at any step → Telegram alert to owner to resolve

### Partner/affiliate settlement (on-demand)
1. Admin selects partner + date range in `/admin/settlements`
2. System sums all `affiliate_commissions` for that partner in range (paid_out = false)
3. Admin reviews → confirms → marks paid_out = true on all included commissions

---

## 13. Code Conventions

### Absolute rules
- `supabaseAdmin` in server code only — never in client components
- All financial calculations in `lib/calculations.ts` only
- All stock operations in `lib/inventory.ts` only
- Postcode validation server-side only
- Telegram `initData` validated server-side on every Mini App API call
- All times displayed in UTC+10 (no DST)

### API routes
- All admin routes: `app/api/admin/*` — check Supabase session
- All telegram routes: `app/api/telegram/*` — check webhook secret
- All client/order routes: validate Telegram initData

### Error handling
- All API routes return consistent `{ error: string }` on failure
- Never expose internal errors to client
- Log errors server-side

### TypeScript
- All DB types defined in `types/index.ts`
- Use database enum types (order_status, velocity_tier, etc.)
- No `any` types

---

## 14. Build Order

Follow this exact order. Do not skip steps.

```
Step 1:  Project init + folder structure + dependencies
Step 2:  Run all SQL migrations in Supabase
Step 3:  lib/supabase.ts + lib/calculations.ts + lib/inventory.ts + lib/zones.ts + types/index.ts
Step 4:  Telegram bot webhook (app/api/telegram/) — /start + basic notifications
Step 5:  Client Mini App — catalogue + cart + checkout (/order)
Step 6:  Admin auth middleware + login page
Step 7:  Admin orders page (core operations)
Step 8:  Admin products page + batch management + CSV import
Step 9:  Driver bot flows (on_the_way, delivered, cancel)
Step 10: Admin partners + QR codes generation
Step 11: Admin drivers + settlements
Step 12: lib/inventory-intelligence.ts + cron + /admin/inventory page
Step 13: Admin earnings + schedule dashboards
Step 14: Admin settings page
Step 15: Order chat (/chat + admin chat panel)
Step 16: vercel.json cron config + deploy to Vercel
Step 17: Register Telegram webhook
Step 18: End-to-end test: scan QR → order → assign driver → deliver → settle
```

---

## 15. What NOT to Build

These features existed in a previous version. Do not recreate them.

| Feature | Reason |
|---|---|
| `warehouses` table/page/routes | Fully isolated, never used |
| Broadcast order assignment to all drivers | Dead route, no UI, don't build |
| Cron for delegated order follow-up | Dead, depends on broadcast |
| Telegram buttons: `chat_reply`, `accept_assigned`, `refuse_assigned`, `take_order` | Never handled, confuses users |
| Online payment (Stripe, Apple Pay, etc.) | Cash only for now |
| Multiple admin accounts | One admin only: leshit.fr@gmail.com |
| White-label / multi-tenant | Not in scope |
| Live map / GPS tracking | Not in scope |