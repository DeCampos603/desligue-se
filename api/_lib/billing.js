/**
 * DESLIGUE-SE — Regras de assinatura compartilhadas entre os endpoints do Stripe
 *
 * Um único lugar define preço, intervalo e nome dos planos. Antes o valor
 * estava duplicado em checkout.js e create-subscription.js, com risco de
 * divergirem (e de divergirem também do que a interface anuncia).
 */

const { supabaseAdmin, stripeRequest } = require('./http');

const PLANS = {
  monthly: {
    key: 'monthly',
    plano: 'premium_mensal',
    title: 'Desligue-se Pro (Mensal)',
    unitAmount: 1990, // R$ 19,90
    interval: 'month',
    priceEnvVar: 'STRIPE_PRICE_MONTHLY'
  },
  annual: {
    key: 'annual',
    plano: 'premium_anual',
    title: 'Desligue-se Pro (Anual)',
    unitAmount: 14400, // R$ 144,00 (equivalente a R$ 12,00/mês)
    interval: 'year',
    priceEnvVar: 'STRIPE_PRICE_YEARLY'
  }
};

const PLAN_DESCRIPTION =
  'Acesso ilimitado à triagem por IA, histórico completo na sua conta, ' +
  'todas as rotinas de relaxamento e as paisagens sonoras noturnas.';

function resolvePlan(planType) {
  return PLANS[planType] === undefined ? PLANS.monthly : PLANS[planType];
}

/**
 * Monta os parâmetros de line_items.
 * Se houver um Price cadastrado no painel do Stripe (recomendado em produção),
 * usamos o id dele; caso contrário criamos o preço na hora (price_data).
 */
function appendLineItems(params, plan) {
  const priceId = process.env[plan.priceEnvVar];

  if (priceId) {
    params.append('line_items[0][price]', priceId);
  } else {
    params.append('line_items[0][price_data][currency]', 'brl');
    params.append('line_items[0][price_data][unit_amount]', String(plan.unitAmount));
    params.append('line_items[0][price_data][recurring][interval]', plan.interval);
    params.append('line_items[0][price_data][recurring][interval_count]', '1');
    params.append('line_items[0][price_data][product_data][name]', plan.title);
    params.append('line_items[0][price_data][product_data][description]', PLAN_DESCRIPTION);
  }

  params.append('line_items[0][quantity]', '1');
  return params;
}

/**
 * Garante que a usuária tenha um Customer no Stripe e que o id fique gravado
 * no perfil. É esse vínculo que permite ao webhook saber de quem é a assinatura
 * e ao portal de cobrança abrir a assinatura certa.
 */
async function getOrCreateStripeCustomer(user) {
  const rows = await supabaseAdmin(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`
  );

  const existing = Array.isArray(rows) && rows[0]?.stripe_customer_id;
  if (existing) return existing;

  const params = new URLSearchParams();
  if (user.email) params.append('email', user.email);
  params.append('metadata[supabase_user_id]', user.id);

  const customer = await stripeRequest('POST', 'customers', params);

  // UPSERT, e não PATCH: se a linha do perfil não existir (conta criada antes
  // do gatilho handle_new_user, por exemplo), um PATCH não afeta nenhuma linha
  // e falha em silêncio — o vínculo se perde e o webhook depois não acha de
  // quem é a assinatura. Era o caminho para "paguei e não ativou".
  const saved = await supabaseAdmin('profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: user.id,
      // Só envia o e-mail quando existe, para não sobrescrever com vazio
      // o valor já gravado no perfil.
      ...(user.email ? { email: user.email } : {}),
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString()
    })
  });

  if (!Array.isArray(saved) || saved.length === 0) {
    throw new Error(`Não foi possível vincular o cliente ${customer.id} ao perfil ${user.id}.`);
  }

  console.log(`Customer ${customer.id} vinculado ao perfil ${user.id}.`);
  return customer.id;
}

/** Traduz o status do Stripe para o que guardamos no perfil. */
function mapSubscriptionToProfile(subscription) {
  const stripeStatus = subscription.status; // active, trialing, past_due, canceled, unpaid, incomplete...
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;

  const isPaid = ['active', 'trialing', 'past_due'].includes(stripeStatus);

  // current_period_end vem em segundos; guardamos como data ISO
  const fimDoPeriodo = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  if (!isPaid) {
    return { plano: 'free', subscription_status: stripeStatus, subscription_ends_at: fimDoPeriodo };
  }

  // Descobre o plano pelo intervalo de cobrança do item da assinatura
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const plano = interval === 'year' ? 'premium_anual' : 'premium_mensal';

  return {
    plano,
    subscription_status: cancelAtPeriodEnd ? 'canceling' : stripeStatus,
    subscription_ends_at: fimDoPeriodo
  };
}

/**
 * Grava o plano no perfil da usuária. Só o servidor faz isso —
 * o navegador não tem permissão para alterar estas colunas.
 */
async function applySubscriptionToProfile(subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  const { plano, subscription_status, subscription_ends_at } = mapSubscriptionToProfile(subscription);
  const patch = {
    plano,
    subscription_status,
    subscription_ends_at,
    updated_at: new Date().toISOString()
  };

  const write = async (filtro, extra) => {
    const enviar = async (dados) => {
      const rows = await supabaseAdmin(`profiles?${filtro}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(dados)
      });
      return Array.isArray(rows) ? rows.length : 0;
    };

    const dados = { ...patch, ...(extra || {}) };

    try {
      return await enviar(dados);
    } catch (err) {
      // subscription_ends_at é uma coluna nova. Se o schema.sql ainda não foi
      // aplicado, o PATCH inteiro é recusado e a assinante NÃO recebe o Pro —
      // um campo cosmético derrubando a ativação. Repetimos sem ele.
      const colunaFaltando = /subscription_ends_at/.test(err.message || '');
      if (!colunaFaltando) throw err;

      console.warn('Coluna subscription_ends_at ausente no banco; gravando o plano sem ela. Rode database/schema.sql.');
      const { subscription_ends_at, ...semColuna } = dados;
      return await enviar(semColuna);
    }
  };

  // 1ª tentativa: pelo cliente do Stripe já vinculado ao perfil.
  let afetadas = 0;
  if (customerId) {
    afetadas = await write(`stripe_customer_id=eq.${encodeURIComponent(customerId)}`);
  }

  // 2ª tentativa: pelo id da usuária, que viajamos junto na assinatura
  // (subscription_data[metadata][userId]). Sem esta rede de proteção, qualquer
  // falha no vínculo do customer resultava em pagamento sem ativação — e o
  // PATCH "com sucesso" em zero linhas não deixava nem rastro no log.
  const userId = subscription.metadata?.userId;
  if (afetadas === 0 && userId && userId !== 'guest') {
    afetadas = await write(
      `id=eq.${encodeURIComponent(userId)}`,
      customerId ? { stripe_customer_id: customerId } : null
    );
    if (afetadas > 0) {
      console.log(`Perfil ${userId} atualizado pelo metadata (vínculo do customer estava ausente).`);
    }
  }

  if (afetadas === 0) {
    console.error(
      `ASSINATURA ÓRFÃ: ${subscription.id} (customer ${customerId}, userId ${userId || 'ausente'}) ` +
      'não corresponde a nenhum perfil. A pessoa pagou e NÃO recebeu o acesso — é preciso corrigir à mão.'
    );
    return false;
  }

  console.log(`${afetadas} perfil(is) atualizado(s) para ${plano} (${subscription_status}).`);
  return true;
}

module.exports = {
  PLANS,
  PLAN_DESCRIPTION,
  resolvePlan,
  appendLineItems,
  getOrCreateStripeCustomer,
  mapSubscriptionToProfile,
  applySubscriptionToProfile
};
