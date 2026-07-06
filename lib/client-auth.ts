import type { NextRequest } from 'next/server'
import { validateTelegramInitData } from '@/lib/telegram'
import { supabaseAdmin } from '@/lib/supabase'
import type { User } from '@/types/index'

/**
 * Every Mini App API route must call this first. Reads the `x-telegram-init-data`
 * header (the raw initData string from the Telegram WebApp JS SDK) and validates
 * its HMAC signature server-side. Never trust a telegram_id passed any other way.
 */
export function requireTelegramUser(
  request: NextRequest
): { telegram_id: string; first_name: string; last_name: string | null } | null {
  const initData = request.headers.get('x-telegram-init-data')
  if (!initData) return null
  return validateTelegramInitData(initData)
}

export async function getOrCreateUser(telegramUser: {
  telegram_id: string
  first_name: string
  last_name: string | null
}): Promise<User> {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('telegram_id', telegramUser.telegram_id)
    .maybeSingle()

  if (existing) return existing as User

  const { data: created, error } = await supabaseAdmin
    .from('users')
    .insert({
      telegram_id: telegramUser.telegram_id,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
    })
    .select('*')
    .single()

  if (error || !created) throw new Error(`Failed to create user: ${error?.message}`)
  return created as User
}
