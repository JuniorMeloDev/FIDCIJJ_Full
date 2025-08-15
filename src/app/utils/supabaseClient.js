import { createClient } from '@supabase/supabase-js'

// Estas variáveis de ambiente são lidas a partir das configurações da Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Cria e exporta uma única instância do cliente Supabase para ser usada em toda a aplicação
export const supabase = createClient(supabaseUrl, supabaseKey)