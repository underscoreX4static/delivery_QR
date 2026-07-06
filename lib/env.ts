/** NEXT_PUBLIC_APP_URL with any trailing slash stripped, so callers can safely do `${getAppUrl()}/path`. */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL!.replace(/\/+$/, '')
}
