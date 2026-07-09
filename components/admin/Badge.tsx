export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/14 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/14 text-info',
  neutral: 'bg-muted/12 text-muted',
}

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${VARIANT_CLASSES[variant]}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
