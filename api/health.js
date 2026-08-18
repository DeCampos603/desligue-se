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

const { applyCors, getAuthContext, supabaseAdmin } = require('./_lib/http');
const { gerarTexto, MODELOS } = require('./_lib/gemini');

function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key.startsWith('sk_live_')) return 'producao';
  if (key.startsWith('sk_test_')) return 'teste';
  return 'nao configurada';
}

/**
 * Faz uma chamada minima ao Gemini para provar se a IA responde de verdade.
 * Vale um punhado de tokens e responde a pergunta que os logs nao respondem
 * de fora: "o problema esta no modelo ou no resto do caminho?".
 */
async function testarGemini() {
  const inicio = Date.now();
  try {
    const { texto, modelo } = await gerarTexto({
      contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }],
      systemInstruction: 'Voce responde em uma palavra.',
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
      orcamentoMs: 18000
    });
    return { ok: true, modelo, resposta: (texto || '').trim().slice(0, 40), ms: Date.now() - inicio };
  } catch (err) {
    return { ok: false, porModelo: err.porModelo || [err.message.slice(0, 300)], ms: Date.now() - inicio };
  }
}

/** Relata o plano de quem chamou, quando houver sessao valida. */
async function planoDeQuemChamou(req) {
  const { user, reason } = await getAuthContext(req);
  if (!user) return { autenticada: false, motivo: reason };

  try {
    const linhas = await supabaseAdmin(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=plano,subscription_status,stripe_customer_id`
    );
    const perfil = Array.isArray(linhas) ? linhas[0] : null;
    if (!perfil) return { autenticada: true, perfilExiste: false };

    return {
      autenticada: true,
      perfilExiste: true,
      plano: perfil.plano,
      subscription_status: perfil.subscription_status,
      temCustomerNoStripe: Boolean(perfil.stripe_customer_id),
      podeUsarOChat: ['premium_mensal', 'premium_anual'].includes(perfil.plano) &&
        (!perfil.subscription_status ||
         ['active', 'trialing', 'canceling', 'past_due'].includes(perfil.subscription_status))
    };
  } catch (err) {
    return { autenticada: true, erroAoLerPerfil: err.message.slice(0, 200) };
  }
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

  const resposta = {
    ok: problemas.length === 0,
    ambienteStripe: stripeMode(),
    modelosConfigurados: MODELOS,
    variaveis: env,
    problemas,
    verificadoEm: new Date().toISOString()
  };

  // ?gemini=1 executa uma chamada real ao modelo
  if (req.query?.gemini === '1') {
    resposta.gemini = await testarGemini();
  }

  // ?modelos=1 lista o que a chave realmente pode usar hoje. Modelos sao
  // descontinuados sem aviso, e uma lista fixa no codigo envelhece calada.
  if (req.query?.modelos === '1' && process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }
      });
      const dados = await r.json();
      resposta.modelosDisponiveis = (dados.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
    } catch (err) {
      resposta.modelosDisponiveis = { erro: err.message };
    }
  }

  // Com sessao valida, informa o plano lido pelo servidor — que e o mesmo
  // criterio usado para liberar a conversa com a IA.
  if (req.headers.authorization) {
    resposta.suaConta = await planoDeQuemChamou(req);
  }

  return res.status(200).json(resposta);
};
