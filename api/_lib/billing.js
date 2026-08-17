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
  let existing = null;
  try {
    const rows = await supabaseAdmin(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`
    );
    existing = Array.isArray(rows) && rows[0]?.stripe_customer_id;
  } catch (e) {
    console.warn('Aviso: supabaseAdmin não disponível para buscar customer_id:', e.message);
  }

  if (existing) return existing;

  const params = new URLSearchParams();
  if (user.email) params.append('email', user.email);
  params.append('metadata[supabase_user_id]', user.id);

  const customer = await stripeRequest('POST', 'customers', params);

  try {
    await supabaseAdmin(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.warn('Aviso: não foi possível gravar stripe_customer_id no Supabase:', e.message);
  }

  return customer.id;
}

/** Traduz o status do Stripe para o que guardamos no perfil. */
function mapSubscriptionToProfile(subscription) {
  const stripeStatus = subscription.status; // active, trialing, past_due, canceled, unpaid, incomplete...
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;

  const isPaid = ['active', 'trialing', 'past_due'].includes(stripeStatus);

  if (!isPaid) {
    return { plano: 'free', subscription_status: stripeStatus };
  }

  // Descobre o plano pelo intervalo de cobrança do item da assinatura
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const plano = interval === 'year' ? 'premium_anual' : 'premium_mensal';

  return {
    plano,
    subscription_status: cancelAtPeriodEnd ? 'canceling' : stripeStatus
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

  if (!customerId) {
    console.warn('Assinatura sem customer associado:', subscription.id);
    return false;
  }

  const { plano, subscription_status } = mapSubscriptionToProfile(subscription);

  await supabaseAdmin(`profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      plano,
      subscription_status,
      updated_at: new Date().toISOString()
    })
  });

  console.log(`Perfil do customer ${customerId} atualizado para ${plano} (${subscription_status}).`);
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
