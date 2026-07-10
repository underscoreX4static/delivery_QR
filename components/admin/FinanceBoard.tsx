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
          title="Runway — sans BFR"
          subtitle="Cash libre, stock traité comme du cash"
          weeks={growth.runwayWeeksNoBFR}
          cash={treasury.availableCashNoBFR}
          tone="optimistic"
        />
        <RunwayCard
          title="Runway — avec BFR"
          subtitle="Cash libre, stock immobilisé retiré"
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
          <Card title="Trésorerie — cascade">
            <Waterfall
              rows={[
                { label: 'Cash déclaré', value: treasury.startingCash },
                { label: '+ COD chez les livreurs', value: treasury.codInTransit, sign: '+' },
                { label: '= Trésorerie brute', value: treasury.grossCash, subtotal: true },
                { label: '− Engagements à payer', value: -treasury.committedOutflows, sign: '−' },
                { label: '= Dispo (sans BFR)', value: treasury.availableCashNoBFR, subtotal: true },
                { label: '− Stock immobilisé', value: -treasury.stockValue, sign: '−' },
                { label: '= Dispo réel (avec BFR)', value: treasury.availableCashWithBFR, subtotal: true, strong: true },
              ]}
            />
            <p className="mt-3 text-xs text-muted">
              Crédits parrainage en circulation : {money(treasury.referralCreditFloat)} — passif futur (remises à venir),
              non retiré du cash.
            </p>
          </Card>

          <Card title="Argent engagé (pools)">
            <div className="flex flex-col divide-y divide-border/60">
              <PoolRow label="Budget pool livreurs (dispo à donner)" value={pools.driverPoolSetAside} muted />
              <PoolRow label="Dépense acquisition (30j)" value={pools.acquisitionSpendWindow} muted />
              <PoolRow label="Bonus livreurs attribués, non payés" value={pools.driverBonusesOwed} />
              <PoolRow label="Commissions commerciales dues" value={pools.commissionsOwed} />
              <PoolRow label="Primes de bienvenue dues" value={pools.welcomeBonusesOwed} />
              <PoolRow label="Crédits parrainage en circulation" value={pools.referralCreditFloat} muted />
              <PoolRow label="COD à encaisser (part owner)" value={pools.codInTransit} muted />
              <PoolRow label="Total engagé (hard)" value={pools.totalCommitted} strong />
            </div>
            <p className="mt-3 text-xs text-muted">
              « Provisionné » et « en circulation » ne sont pas des sorties fermes — informatifs. Le total « hard » (primes
              + commissions + bienvenue) est ce qui doit réellement sortir.
            </p>
          </Card>
        </div>

        {/* RIGHT — profitability & levers */}
        <div className="flex flex-col gap-4">
          <Card
            title="Rentabilité"
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
              <p className="text-xs text-background/60">Dans la poche (owner net après pool)</p>
              <p className="font-serif text-4xl font-semibold tracking-tight">{money(snap.earnings.ownerTakeHome)}</p>
              <div className="mt-2 flex flex-col gap-0.5 text-xs text-background/60">
                <div className="flex justify-between">
                  <span>Bénéf owner (avant pool)</span>
                  <span className="text-background/80">{money(snap.earnings.ownerNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span>− Mis dans le pool livreurs</span>
                  <span className="text-warning">−{money(snap.earnings.bonusPoolContributions)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MiniStat label="Gross revenue" value={money(snap.earnings.grossRevenue)} />
              <MiniStat label="Gross profit" value={money(snap.earnings.grossProfit)} />
              <MiniStat label="Driver payouts" value={money(snap.earnings.driverPayouts)} />
              <MiniStat label="Commissions" value={money(snap.earnings.affiliateCommissions)} />
            </div>
          </Card>

          <Card title={period === 'today' ? 'Répartition — clôture du jour' : 'Répartition de la période'}>
            <p className="mb-3 text-xs text-muted">
              Où va chaque dollar de CA livré sur la période. Le pool est prélevé sur ta part avant ce qui te reste.
            </p>
            <Waterfall
              rows={[
                { label: 'CA livré (encaissé)', value: snap.earnings.grossRevenue },
                { label: '− Coût des produits', value: -(snap.earnings.grossRevenue - snap.earnings.grossProfit), sign: '−' },
                { label: '= Profit brut', value: snap.earnings.grossProfit, subtotal: true },
                { label: '− Part livreurs (38% + livraison)', value: -snap.earnings.driverPayouts, sign: '−' },
                { label: '− Commissions commerciaux', value: -snap.earnings.affiliateCommissions, sign: '−' },
                { label: '= Bénéf owner', value: snap.earnings.ownerNet, subtotal: true },
                { label: '− À mettre dans le pool livreurs', value: -snap.earnings.bonusPoolContributions, sign: '−' },
                { label: '= Dans ta poche', value: snap.earnings.ownerTakeHome, subtotal: true, strong: true },
              ]}
            />
          </Card>

          <Card title="Taux actifs">
            <div className="flex flex-col divide-y divide-border/60 text-sm">
              <RateRow label="Part livreur (du profit brut)" value={pct(rates.driverPayoutShare)} />
              <RateRow label="Part owner (du profit brut)" value={pct(rates.ownerProfitShare)} />
              <RateRow label="Cagnotte livreur (du net owner)" value={pct(rates.bonusPoolRate)} />
              <RateRow label="Commission moyenne commerciaux" value={pct(rates.avgPartnerCommissionRate)} />
              <RateRow label="Parrainage (par côté)" value={money(rates.referralRewardAmount)} />
              <RateRow label="Livraison gratuite dès" value={money(rates.freeDeliveryThreshold)} />
              <RateRow
                label="Remise paliers"
                value={`${pct(rates.discountRate)} dès ${money(rates.discountThreshold)} · ${pct(rates.discountRate2)} dès ${money(rates.discountThreshold2)}`}
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
    <Card title="Simulateur — jusqu'où je pousse ?">
      <p className="mb-4 text-xs text-muted">
        Bouge les curseurs pour voir l&apos;impact sur le burn et le runway. Simulation pure — rien n&apos;est modifié.
        Quand ça te convient, applique-le toi-même dans{' '}
        <a href="/admin/settings" className="text-primary underline">
          les réglages
        </a>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="Cagnotte livreur"
          value={bonusPoolRate}
          min={0}
          max={0.5}
          step={0.01}
          display={pct(bonusPoolRate)}
          baseline={rates.bonusPoolRate}
          onChange={setBonusPoolRate}
        />
        <Slider
          label="Parrainage / côté"
          value={referralReward}
          min={0}
          max={100}
          step={1}
          display={money(referralReward)}
          baseline={rates.referralRewardAmount}
          onChange={setReferralReward}
        />
        <Slider
          label="Promo sur le CA (nouveau)"
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
          label="Burn / week projeté"
          value={money(projected.weeklyBurn)}
          hint={touched ? `${burnDelta >= 0 ? '+' : ''}${money(burnDelta)} vs actuel` : 'inchangé'}
          tone={burnDelta > 0.01 ? 'burn' : undefined}
        />
        <SimResult label="Runway sans BFR" value={runwayLabel(projected.runwayNoBFR)} tone="optimistic" />
        <SimResult label="Runway avec BFR" value={runwayLabel(projected.runwayWithBFR)} tone="realistic" />
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
      <p className="mt-1 text-xs text-muted">{money(cash)} de cash libre</p>
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
