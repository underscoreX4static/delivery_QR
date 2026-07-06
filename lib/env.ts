/**
 * NEXT_PUBLIC_APP_URL with surrounding whitespace and any trailing slash
 * stripped, so callers can safely do `${getAppUrl()}/path`. Trimming
 * whitespace matters in practice — a trailing space pasted into Vercel's env
 * var UI produced a URL like "https://example.com /order", which Telegram
 * rejects outright for web_app buttons ("Disallowed character in URL host").
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL!.trim().replace(/\/+$/, '')
}
