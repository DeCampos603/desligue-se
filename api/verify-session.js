/**
 * DESLIGUE-SE — Vercel Serverless API: Verificação de Sessão do Stripe
 * Valida se o pagamento foi concluído com sucesso e retorna o status do plano
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { session_id } = req.query || {};
  if (!session_id) {
    return res.status(400).json({ error: 'session_id é obrigatório.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY não configurada.' });
  }

  try {
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`
      }
    });

    const sessionData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return res.status(502).json({ error: 'Erro ao consultar sessão no Stripe.', detail: sessionData });
    }

    const isPaid = sessionData.payment_status === 'paid' || sessionData.status === 'complete';
    const planType = sessionData.metadata?.planType || 'monthly';

    return res.status(200).json({
      paid: isPaid,
      status: sessionData.status,
      customerEmail: sessionData.customer_email || sessionData.customer_details?.email,
      planType: planType
    });

  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
    return res.status(500).json({ error: 'Erro interno ao verificar pagamento.' });
  }
};
