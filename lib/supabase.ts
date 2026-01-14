import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase - obtidas das variáveis de ambiente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Função auxiliar para validar URLs
const isValidUrl = (url: string | undefined): url is string => {
  if (!url || typeof url !== 'string' || url.trim() === '') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Valores finais com fallbacks seguros para desenvolvimento
const FINAL_URL = isValidUrl(supabaseUrl) ? supabaseUrl : 'https://placeholder.supabase.co';
const FINAL_KEY = (supabaseAnonKey && supabaseAnonKey.length > 20) ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

// Log informativo se as configurações não estiverem completas
if (!isValidUrl(supabaseUrl) || !supabaseAnonKey || FINAL_KEY.includes('placeholder')) {
  console.info(
    "%c TaskFlow Status %c Aguardando configuração do Supabase para persistência de dados. %c",
    "background: #1f6b7a; color: white; font-weight: bold; border-radius: 3px 0 0 3px; padding: 2px 5px;",
    "background: #f1f5f9; color: #475569; border-radius: 0 3px 3px 0; padding: 2px 5px;",
    "background: transparent;"
  );
}

// Cliente Supabase configurado
export const supabase = createClient(FINAL_URL, FINAL_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});