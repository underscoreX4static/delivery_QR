/**
 * Shared admin UI primitives for the "Foundry & Apothecary" system.
 * Kept in one file so the whole design language (serif display, brass
 * micro-labels, tabular numerals, button hierarchy) lives in one place.
 */

/* ---------- Button ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:brightness-[1.07]',
  secondary: 'border border-border bg-transparent text-foreground hover:border-brass hover:text-brass',
  ghost: 'bg-transparent text-muted hover:text-foreground',
  danger: 'border border-danger/30 bg-transparent text-danger hover:bg-danger/10',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  )
}

/* ---------- PageHeader ---------- */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-brass">{eyebrow}</p>
        )}
        <h1 className="text-balance font-serif text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[52ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

/* ---------- Card ---------- */

export function Card({
  title,
  eyebrow,
  action,
  className = '',
  children,
}: {
  title?: string
  eyebrow?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${className}`}>
      {(title || action || eyebrow) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="mb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-brass">{eyebrow}</p>
            )}
            {title && <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* ---------- StatCard ---------- */

export function StatCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string
  value: string | number
  meta?: string
  tone?: 'danger' | 'default'
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-brass">{label}</p>
      <p
        className={`mt-2 font-serif text-3xl font-semibold tabular-nums tracking-tight ${
          tone === 'danger' ? 'text-danger' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {meta && <p className="mt-1.5 text-xs text-muted">{meta}</p>}
    </div>
  )
}
