/**
 * DESLIGUE-SE — Checkout hospedado do Stripe (fallback do checkout embutido)
 *
 * Mesmas correções do create-subscription: exige autenticação, usa o Customer
 * já vinculado à conta, centraliza os preços em _lib/billing.js e não repassa
 * o erro cru do Stripe (que expunha o id da conta e a URL de log do dashboard).
 */

const { applyCors, getAuthenticatedUser, stripeRequest } = require('./_lib/http');
const { resolvePlan, appendLineItems, getOrCreateStripeCustomer } = require('./_lib/billing');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const user = await getAuthenticatedUser(req);
  const plan = resolvePlan((req.body || {}).planType);
  const origin = req.headers.origin || 'https://desliguese.vercel.app';
  const userId = user ? user.id : (req.body?.userId || 'guest');
  const userEmail = user ? user.email : (req.body?.email || null);

  try {
    let customerId = null;
    if (user) {
      try {
        customerId = await getOrCreateStripeCustomer(user);
      } catch (custErr) {
        console.warn('Aviso ao resolver customer no Stripe:', custErr.message);
      }
    }

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', `${origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan.key}`);
    params.append('cancel_url', `${origin}/?status=cancelled`);
    if (customerId) {
      params.append('customer', customerId);
    } else if (userEmail) {
      params.append('customer_email', userEmail);
    }
    params.append('client_reference_id', userId);
    params.append('metadata[userId]', userId);
    params.append('metadata[planType]', plan.key);
    params.append('subscription_data[metadata][userId]', userId);
    appendLineItems(params, plan);

    const session = await stripeRequest('POST', 'checkout/sessions', params);

    return res.status(200).json({
      sessionId: session.id,
      url: session.url
    });
  } catch (err) {
    console.error('Erro no handler de checkout:', err.message);
    const status = err.isConfigError ? 500 : 502;
    return res.status(status).json({
      error: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.'
    });
  }
};
