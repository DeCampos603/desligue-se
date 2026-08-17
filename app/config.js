/**
 * DESLIGUE-SE — Configuração pública do front-end
 *
 * Todas as chaves abaixo são públicas por natureza (aparecem no navegador de
 * qualquer visitante). O que é segredo — chave secreta do Stripe, service role
 * do Supabase, chave do Gemini — vive apenas nas variáveis de ambiente da
 * Vercel e nunca neste arquivo.
 *
 * ⚠️ AO ENTRAR EM PRODUÇÃO: troque stripePublishableKey de pk_test_ para
 * pk_live_ NO MESMO MOMENTO em que trocar a STRIPE_SECRET_KEY na Vercel.
 * Chave publicável de teste com chave secreta de produção (ou o contrário)
 * quebra o checkout silenciosamente.
 */
window.DESLIGUESE_CONFIG = {
  supabaseUrl: 'https://vycflbcaphehlcjkqcjw.supabase.co',

  // Chave "anon" do Supabase: pública por design, protegida pelo Row Level
  // Security configurado em database/schema.sql.
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5Y2ZsYmNhcGhlaGxjamtxY2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4Mjk4NDMsImV4cCI6MjEwMjQwNTg0M30.E1Trkta-chncOdWc9FU5v4tYPHZAvoq_dYCRrPsjvvo',

  // MODO ATUAL: TESTE. Nenhuma cobrança real acontece com esta chave.
  stripePublishableKey: 'pk_test_51U57k8IZTTcAGD4KX607B2pXl4qoX0OIabqI8WwhVHR6i4YamOfUrDj8Mehp5hMShhtEczt41rj0QbBRxK5qymcs00RzYTY7bM'
};
