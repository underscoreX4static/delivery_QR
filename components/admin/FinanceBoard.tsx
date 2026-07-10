'use client'

import { useEffect, useMemo, useState } from 'react'

type Period = 'today' | 'week' | 'month' | 'all'

interface EarningsSummary {
  orderCount: number
  grossRevenue: number
  grossProfit: number
  driverPayouts: number
  affiliateCommissions: number
  ownerNet: number
  bonusPoolContributions: number
  ownerTakeHome: number
}

interface Snapshot {
  period: Period
  earnings: EarningsSummary
  rates: {
    driverPayoutShare: number
    ownerProfitShare: number
    bonusPoolRate: number
    referralRewardAmount: number
    deliveryFee: number
    freeDeliveryThreshold: number
    discountThreshold: number
    discountRate: number
    discountThreshold2: number
    discountRate2: number
    avgPartnerCommissionRate: number
    ownerFloor: number
  }
  pools: {
    driverPoolSetAside: number
    acquisitionSpendWindow: number
    driverBonusesOwed: number
    commissionsOwed: number
    welcomeBonusesOwed: number
    referralCreditFloat: number
    codInTransit: number
    totalCommitted: number
  }
  treasury: {
    startingCash: number
    codInTransit: number
    grossCash: number
    committedOutflows: number
    availableCashNoBFR: number
    stockValue: number
    availableCashWithBFR: number
    referralCreditFloat: number
  }
  growth: {
    windowDays: number
    newCustomers: number
    activeBuyers: number
    weeklyBurn: number
    burnBreakdown: {
      referralCredits: number
      driverPoolContributions: number
      discountsGranted: number
    }
    runwayWeeksNoBFR: number | null
    runwayWeeksWithBFR: number | null
    costPerNewCustomer: number | null
  }
  simBasis: {
    weeklyRevenue: number
    weeklyPoolableOwnerNet: number
    weeklyReferralPairs: number
    weeklyDiscounts: number
    availableCashNoBFR: number
    availableCashWithBFR: number
  }
}

const TABS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`

function runwayLabel(weeks: number | null): string {
  if (weeks === null) return '∞'
  if (weeks >= 52) return `${(weeks / 52).toFixed(1)} yr`
  if (weeks >= 8) return `${(weeks / 4.345).toFixed(1)} mo`
  return `${weeks.toFixed(1)} wk`
}

export function FinanceBoard() {
  const [period, setPeriod] = useState<Period>('all')
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/admin/finance?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setSnap(d.snapshot)
      })
    return () => {
      active = false
    }
  }, [period])

  if (!snap) return <p className="text-sm text-muted">Loading…</p>

  const { rates, pools, treasury, growth } = snap

  return (
    <div className="flex flex-col gap-4">
      {/* HERO — the countdown: runway with and without the BFR */}
      <div className="grid gap-3 sm:grid-cols-2">
        <RunwayCard
          title="Runway — excl. inventory"
          subtitle="Free cash, stock counted as cash"
          weeks={growth.runwayWeeksNoBFR}
          cash={treasury.availableCashNoBFR}
          tone="optimistic"
        />
        <RunwayCard
          title="Runway — incl. inventory"
          subtitle="Free cash, stock locked away removed"
          weeks={growth.runwayWeeksWithBFR}
          cash={treasury.availableCashWithBFR}
          tone="realistic"
        />
      </div>

      {/* Growth vs burn */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={`New customers (${growth.windowDays}d)`} value={growth.newCustomers.toString()} />
        <Tile label={`Active buyers (${growth.windowDays}d)`} value={growth.activeBuyers.toString()} />
        <Tile label="Growth burn / week" value={money(growth.weeklyBurn)} accent="burn" />
        <Tile
          label="Cost / new customer"
          value={growth.costPerNewCustomer === null ? '—' : money(growth.costPerNewCustomer)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT — engaged money / pools */}
        <div className="flex flex-col gap-4">
          <Card title="Treasury — waterfall">
            <Waterfall
              rows={[
                { label: 'Cash on hand (declared)', value: treasury.startingCash },
                { label: '+ COD held by drivers', value: treasury.codInTransit, sign: '+' },
                { label: '= Gross cash', value: treasury.grossCash, subtotal: true },
                { label: '− Committed outflows', value: -treasury.committedOutflows, sign: '−' },
                { label: '= Available (excl. inventory)', value: treasury.availableCashNoBFR, subtotal: true },
                { label: '− Stock locked in inventory', value: -treasury.stockValue, sign: '−' },
                { label: '= Really available (incl. inventory)', value: treasury.availableCashWithBFR, subtotal: true, strong: true },
              ]}
            />
            <p className="mt-3 text-xs text-muted">
              Referral credit in circulation: {money(treasury.referralCreditFloat)} — a future liability (discounts to
              come), not subtracted from cash.
            </p>
          </Card>

          <Card title="Committed money (pools)">
            <div className="flex flex-col divide-y divide-border/60">
              <PoolRow label="Driver pool budget (available to grant)" value={pools.driverPoolSetAside} muted />
              <PoolRow label="Acquisition spend (30d)" value={pools.acquisitionSpendWindow} muted />
              <PoolRow label="Driver bonuses granted, unpaid" value={pools.driverBonusesOwed} />
              <PoolRow label="Commercial commissions owed" value={pools.commissionsOwed} />
              <PoolRow label="Welcome bonuses owed" value={pools.welcomeBonusesOwed} />
              <PoolRow label="Referral credit in circulation" value={pools.referralCreditFloat} muted />
              <PoolRow label="COD to collect (owner share)" value={pools.codInTransit} muted />
              <PoolRow label="Total committed (hard)" value={pools.totalCommitted} strong />
            </div>
            <p className="mt-3 text-xs text-muted">
              The driver pool budget and referral credit are set-aside / circulating figures, not firm outflows. The
              &quot;hard&quot; total (driver bonuses + commissions + welcome bonuses) is what actually has to be paid out.
            </p>
          </Card>
        </div>

        {/* RIGHT — profitability & levers */}
        <div className="flex flex-col gap-4">
          <Card
            title="Profitability"
            action={
              <div className="flex gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setPeriod(t.key)}
                    className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                      period === t.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="rounded-lg bg-foreground p-4 text-background">
              <p className="text-xs text-background/60">In your pocket (owner net after pool)</p>
              <p className="font-serif text-4xl font-semibold tracking-tight">{money(snap.earnings.ownerTakeHome)}</p>
              <div className="mt-2 flex flex-col gap-0.5 text-xs text-background/60">
                <div className="flex justify-between">
                  <span>Owner net (before pool)</span>
                  <span className="text-background/80">{money(snap.earnings.ownerNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span>− Set aside in the driver pool</span>
                  <span className="text-warning">−{money(snap.earnings.bonusPoolContributions)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MiniStat label="Gross revenue" value={money(snap.earnings.grossRevenue)} />
              <MiniStat label="Margin" value={money(snap.earnings.grossProfit)} />
              <MiniStat label="Driver payouts" value={money(snap.earnings.driverPayouts)} />
              <MiniStat label="Commissions" value={money(snap.earnings.affiliateCommissions)} />
            </div>
          </Card>

          <Card title={period === 'today' ? 'Breakdown — daily close' : 'Period breakdown'}>
            <p className="mb-3 text-xs text-muted">
              Where every dollar of delivered revenue goes. Commission is charged on the margin and comes out of your
              share; the pool is taken from what&apos;s left before your take-home.
            </p>
            <Waterfall
              rows={[
                { label: 'Delivered revenue (collected)', value: snap.earnings.grossRevenue },
                {
                  label: '− Product cost (COGS)',
                  value: -(snap.earnings.grossRevenue - snap.earnings.driverPayouts - snap.earnings.affiliateCommissions - snap.earnings.ownerNet),
                  sign: '−',
                },
                { label: '− Driver share (delivery + 38% of margin)', value: -snap.earnings.driverPayouts, sign: '−' },
                { label: '− Commercial commission (on margin)', value: -snap.earnings.affiliateCommissions, sign: '−' },
                { label: '= Owner net', value: snap.earnings.ownerNet, subtotal: true },
                { label: '− To the driver pool', value: -snap.earnings.bonusPoolContributions, sign: '−' },
                { label: '= In your pocket', value: snap.earnings.ownerTakeHome, subtotal: true, strong: true },
              ]}
            />
          </Card>

          <Card title="Active rates">
            <div className="flex flex-col divide-y divide-border/60 text-sm">
              <RateRow label="Driver share (of margin)" value={pct(rates.driverPayoutShare)} />
              <RateRow label="Owner share (of margin)" value={pct(rates.ownerProfitShare)} />
              <RateRow label="Owner floor (min kept)" value={pct(rates.ownerFloor)} />
              <RateRow label="Driver pool (of owner net)" value={pct(rates.bonusPoolRate)} />
              <RateRow label="Avg commercial commission (on margin)" value={pct(rates.avgPartnerCommissionRate)} />
              <RateRow label="Referral (per side)" value={money(rates.referralRewardAmount)} />
              <RateRow label="Free delivery from" value={money(rates.freeDeliveryThreshold)} />
              <RateRow
                label="Discount tiers"
                value={`${pct(rates.discountRate)} from ${money(rates.discountThreshold)} · ${pct(rates.discountRate2)} from ${money(rates.discountThreshold2)}`}
              />
            </div>
          </Card>
        </div>
      </div>

      <Simulator snap={snap} />
    </div>
  )
}

/* ---------- Simulator ---------- */

function Simulator({ snap }: { snap: Snapshot }) {
  const { rates, simBasis, growth } = snap
  const [bonusPoolRate, setBonusPoolRate] = useState(rates.bonusPoolRate)
  const [referralReward, setReferralReward] = useState(rates.referralRewardAmount)
  const [promoRate, setPromoRate] = useState(0)

  const projected = useMemo(() => {
    const referralBurn = simBasis.weeklyReferralPairs * 2 * referralReward
    const bonusPoolBurn = simBasis.weeklyPoolableOwnerNet * bonusPoolRate
    const promoBurn = simBasis.weeklyRevenue * promoRate
    const weeklyBurn =
      referralBurn + bonusPoolBurn + simBasis.weeklyDiscounts + promoBurn

    const runwayNoBFR = weeklyBurn > 0.01 ? simBasis.availableCashNoBFR / weeklyBurn : null
    const runwayWithBFR = weeklyBurn > 0.01 ? simBasis.availableCashWithBFR / weeklyBurn : null
    return { weeklyBurn, runwayNoBFR, runwayWithBFR }
  }, [bonusPoolRate, referralReward, promoRate, simBasis])

  const burnDelta = projected.weeklyBurn - growth.weeklyBurn
  const touched =
    bonusPoolRate !== rates.bonusPoolRate || referralReward !== rates.referralRewardAmount || promoRate !== 0

  return (
    <Card title="Simulator — how far can I push?">
      <p className="mb-4 text-xs text-muted">
        Drag the sliders to see the impact on burn and runway. Pure simulation — nothing is changed. When you&apos;re
        happy with it, apply it yourself in{' '}
        <a href="/admin/settings" className="text-primary underline">
          settings
        </a>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="Driver pool"
          value={bonusPoolRate}
          min={0}
          max={0.5}
          step={0.01}
          display={pct(bonusPoolRate)}
          baseline={rates.bonusPoolRate}
          onChange={setBonusPoolRate}
        />
        <Slider
          label="Referral / side"
          value={referralReward}
          min={0}
          max={100}
          step={1}
          display={money(referralReward)}
          baseline={rates.referralRewardAmount}
          onChange={setReferralReward}
        />
        <Slider
          label="Promo on revenue (new)"
          value={promoRate}
          min={0}
          max={0.3}
          step={0.01}
          display={pct(promoRate)}
          baseline={0}
          onChange={setPromoRate}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <SimResult
          label="Projected burn / week"
          value={money(projected.weeklyBurn)}
          hint={touched ? `${burnDelta >= 0 ? '+' : ''}${money(burnDelta)} vs current` : 'unchanged'}
          tone={burnDelta > 0.01 ? 'burn' : undefined}
        />
        <SimResult label="Runway excl. inventory" value={runwayLabel(projected.runwayNoBFR)} tone="optimistic" />
        <SimResult label="Runway incl. inventory" value={runwayLabel(projected.runwayWithBFR)} tone="realistic" />
      </div>
    </Card>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  baseline,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  baseline: number
  onChange: (v: number) => void
}) {
  const changed = Math.abs(value - baseline) > 1e-9
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase text-muted">{label}</span>
        <span className={`text-sm font-semibold ${changed ? 'text-primary' : 'text-muted'}`}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

/* ---------- Presentational bits ---------- */

function RunwayCard({
  title,
  subtitle,
  weeks,
  cash,
  tone,
}: {
  title: string
  subtitle: string
  weeks: number | null
  cash: number
  tone: 'optimistic' | 'realistic'
}) {
  const danger = weeks !== null && weeks < 4
  const warn = weeks !== null && weeks < 8 && !danger
  const bar = tone === 'realistic' ? 'border-border bg-surface' : 'border-border bg-page-bg'
  return (
    <div className={`rounded-xl border p-5 ${bar}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="text-[11px] text-muted">{subtitle}</p>
      <p
        className={`mt-2 font-serif text-4xl font-semibold tracking-tight ${
          danger ? 'text-danger' : warn ? 'text-warning' : 'text-foreground'
        }`}
      >
        {runwayLabel(weeks)}
      </p>
      <p className="mt-1 text-xs text-muted">{money(cash)} free cash</p>
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: 'burn' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-serif text-2xl font-semibold tracking-tight ${accent === 'burn' ? 'text-danger' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-page-bg px-3 py-2">
      <p className="text-[10px] uppercase text-muted">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  )
}

function Waterfall({
  rows,
}: {
  rows: { label: string; value: number; sign?: '+' | '−'; subtotal?: boolean; strong?: boolean }[]
}) {
  return (
    <div className="flex flex-col divide-y divide-border/60">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex items-center justify-between py-2 ${r.subtotal ? 'font-semibold' : ''} ${
            r.strong ? 'text-base' : 'text-sm'
          }`}
        >
          <span className={r.subtotal ? 'text-foreground' : 'text-muted'}>{r.label}</span>
          <span className={r.strong ? (r.value < 0 ? 'text-danger' : 'text-foreground') : r.value < 0 ? 'text-muted' : 'text-foreground'}>
            {money(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function PoolRow({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className={muted ? 'text-muted/70' : 'text-muted'}>{label}</span>
      <span className={muted ? 'text-muted' : 'text-foreground'}>{money(value)}</span>
    </div>
  )
}

function RateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function SimResult({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'burn' | 'optimistic' | 'realistic' }) {
  return (
    <div className="rounded-lg border border-border bg-page-bg p-3 text-center">
      <p className="text-[10px] uppercase text-muted">{label}</p>
      <p className={`text-xl font-bold ${tone === 'burn' ? 'text-danger' : 'text-foreground'}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  )
}
