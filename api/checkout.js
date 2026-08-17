/**
 * DESLIGUE-SE — Checkout hospedado do Stripe (fallback do checkout embutido)
 *
 * Mesmas correções do create-subscription: exige autenticação, usa o Customer
 * já vinculado à conta, centraliza os preços em _lib/billing.js e não repassa
 * o erro cru do Stripe (que expunha o id da conta e a URL de log do dashboard).
 */

const { applyCors, requireUser, stripeRequest } = require('./_lib/http');
const { resolvePlan, appendLineItems, getOrCreateStripeCustomer } = require('./_lib/billing');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  // Login obrigatório: sem perfil de destino, o webhook não tem onde gravar o
  // plano e a assinante pagaria sem nunca receber o acesso.
  const user = await requireUser(req, res);
  if (!user) return;

  const plan = resolvePlan((req.body || {}).planType);
  const origin = req.headers.origin || 'https://desliguese.vercel.app';

  try {
    // Se o Customer não puder ser criado/vinculado, não seguimos: uma sessão
    // de pagamento sem vínculo com a conta é exatamente o caso "paguei e não
    // recebi", impossível de corrigir automaticamente depois.
    const customerId = await getOrCreateStripeCustomer(user);

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', `${origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan.key}`);
    params.append('cancel_url', `${origin}/?status=cancelled`);
    params.append('customer', customerId);
    params.append('client_reference_id', user.id);
    params.append('metadata[userId]', user.id);
    params.append('metadata[planType]', plan.key);
    params.append('subscription_data[metadata][userId]', user.id);
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
