import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rhewjraklopujpssayzg.supabase.co'
const supabasePublishableKey = 'sb_publishable_W2acY0LwN0B4BignBD_VmQ_V1JPPVTF'

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)
