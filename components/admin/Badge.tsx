const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  neutral: 'bg-border text-foreground',
}

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${VARIANT_CLASSES[variant]}`}>{children}</span>
  )
}
