/**
 * DESLIGUE-SE — Checkout embutido do Stripe (ui_mode: embedded_page)
 *
 * Correções da auditoria:
 *  - exige sessão autenticada: a assinatura precisa estar vinculada a uma conta,
 *    senão não há onde gravar o plano e a usuária perde o acesso ao trocar de
 *    aparelho. O e-mail e o id vêm do token validado, não do corpo da requisição;
 *  - cria/reaproveita o Customer do Stripe, o que faz o webhook e o portal de
 *    cancelamento funcionarem;
 *  - CORS restrito e erros do Stripe não são mais repassados crus ao cliente.
 */

const { applyCors, requireUser } = require('./_lib/http');
const { resolvePlan, appendLineItems, getOrCreateStripeCustomer } = require('./_lib/billing');
const { stripeRequest } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const plan = resolvePlan((req.body || {}).planType);
  const origin = req.headers.origin || 'https://desliguese.vercel.app';
  const returnUrl = `${origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan.key}`;

  try {
    let customerId = null;
    try {
      customerId = await getOrCreateStripeCustomer(user);
    } catch (custErr) {
      console.warn('Aviso ao resolver customer no Stripe:', custErr.message);
    }

    const params = new URLSearchParams();
    params.append('ui_mode', 'embedded_page');
    params.append('mode', 'subscription');
    params.append('return_url', returnUrl);
    if (customerId) {
      params.append('customer', customerId);
    } else if (user.email) {
      params.append('customer_email', user.email);
    }
    params.append('client_reference_id', user.id);
    params.append('metadata[userId]', user.id);
    params.append('metadata[planType]', plan.key);
    params.append('subscription_data[metadata][userId]', user.id);
    appendLineItems(params, plan);

    const session = await stripeRequest('POST', 'checkout/sessions', params);

    return res.status(200).json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      planTitle: plan.title
    });
  } catch (err) {
    console.error('Erro ao criar sessão embutida:', err.message);
    const status = err.isConfigError ? 500 : 502;
    return res.status(status).json({
      error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.'
    });
  }
};
