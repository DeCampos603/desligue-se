/**
 * DESLIGUE-SE — Portal de Cobrança do Stripe (cancelamento self-service)
 *
 * O aplicativo não oferecia nenhuma forma de cancelar a assinatura. O Código de
 * Defesa do Consumidor exige que o cancelamento seja tão simples quanto a
 * contratação — este endpoint abre o portal oficial do Stripe, onde a usuária
 * cancela, troca de cartão e baixa as faturas sozinha.
 *
 * Requer que o Portal do Cliente esteja ativado uma vez no painel:
 * https://dashboard.stripe.com/settings/billing/portal
 */

const { applyCors, requireUser, supabaseAdmin, stripeRequest } = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const user = await requireUser(
    req,
    res,
    "Entre na sua conta para gerenciar a sua assinatura."
  );
  if (!user) return;

  try {
    const rows = await supabaseAdmin(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`
    );
    const customerId = Array.isArray(rows) && rows[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({
        error: 'Não encontramos uma assinatura ativa vinculada a esta conta.'
      });
    }

    const origin = req.headers.origin || 'https://desliguese.vercel.app';
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', (req.body || {}).returnUrl || origin);

    const session = await stripeRequest('POST', 'billing_portal/sessions', params);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erro ao abrir o portal de cobrança:', err.message);
    return res.status(502).json({
      error: 'Não foi possível abrir o portal de assinatura agora. Tente novamente em instantes.'
    });
  }
};
