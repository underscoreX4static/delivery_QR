import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { TelegramProvider } from '@/components/client/TelegramProvider'

export const metadata: Metadata = {
  title: 'HAZE Delivery',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TelegramProvider>
        <div className="min-h-dvh bg-neutral-50 text-neutral-900">{children}</div>
      </TelegramProvider>
    </>
  )
}
