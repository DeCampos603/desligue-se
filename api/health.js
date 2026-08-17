/**
 * DESLIGUE-SE — Diagnóstico de configuração
 *
 * Responde QUAIS variáveis de ambiente estão presentes — nunca os valores.
 * Serve para descobrir em segundos por que um endpoint está devolvendo 401 ou
 * 502, sem precisar abrir os logs da Vercel.
 *
 * Uso:  curl https://desliguese.vercel.app/api/health
 *
 * Pode ser apagado quando a configuração estiver estável.
 */

const { applyCors } = require('./_lib/http');

function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key.startsWith('sk_live_')) return 'producao';
  if (key.startsWith('sk_test_')) return 'teste';
  return 'nao configurada';
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

  const env = {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_PRICE_MONTHLY: Boolean(process.env.STRIPE_PRICE_MONTHLY),
    STRIPE_PRICE_YEARLY: Boolean(process.env.STRIPE_PRICE_YEARLY),
    ALLOWED_ORIGINS: Boolean(process.env.ALLOWED_ORIGINS)
  };

  // O que quebra qual funcionalidade
  const problemas = [];
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    problemas.push('SUPABASE_URL/SUPABASE_ANON_KEY ausentes: o servidor não consegue validar o login, então TODO checkout responde 401.');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    problemas.push('SUPABASE_SERVICE_ROLE_KEY ausente: o webhook não consegue gravar o plano pago no perfil.');
  }
  if (!env.STRIPE_SECRET_KEY) {
    problemas.push('STRIPE_SECRET_KEY ausente: nenhuma sessão de pagamento pode ser criada.');
  }
  if (!env.STRIPE_WEBHOOK_SECRET) {
    problemas.push('STRIPE_WEBHOOK_SECRET ausente: o webhook recusa todos os eventos e ninguém vira Pro.');
  }

  return res.status(200).json({
    ok: problemas.length === 0,
    ambienteStripe: stripeMode(),
    variaveis: env,
    problemas,
    verificadoEm: new Date().toISOString()
  });
};
