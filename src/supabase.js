import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_PUBLISHABLE_KEY. Zkontroluj soubor .env.'
  )
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)
