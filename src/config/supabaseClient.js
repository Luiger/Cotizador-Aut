const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Creamos y exportamos una única instancia del cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;