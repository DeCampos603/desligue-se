/**
 * DESLIGUE-SE — Vercel Serverless API: Stripe Embedded Checkout (Oficial)
 * Cria uma Checkout Session com ui_mode: 'embedded' para renderizar o formulário
 * do Stripe diretamente dentro do modal da aplicação, com tema noturno e suporte a assinaturas.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY não configurada na Vercel.' });
  }

  const { planType, userEmail, userId } = req.body || {};

  const isAnnual = planType === 'annual';
  const unitAmount = isAnnual ? 14400 : 1990; // R$ 144,00 (12x R$ 12) ou R$ 19,90
  const interval = isAnnual ? 'year' : 'month';
  const planTitle = isAnnual ? 'Desligue-se Pro (Anual - 12x R$ 12)' : 'Desligue-se Pro (Mensal)';

  const origin = req.headers.origin || 'https://desliguese.vercel.app';
  const returnUrl = `${origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${planType || 'monthly'}`;

  const params = new URLSearchParams();
  params.append('ui_mode', 'embedded_page');
  params.append('mode', 'subscription');
  params.append('return_url', returnUrl);
  params.append('payment_method_types[0]', 'card');

  if (userEmail) {
    params.append('customer_email', userEmail);
  }
  if (userId) {
    params.append('client_reference_id', userId);
    params.append('metadata[userId]', userId);
  }
  params.append('metadata[planType]', planType || 'monthly');

  // Line Items com dados do plano
  params.append('line_items[0][price_data][currency]', 'brl');
  params.append('line_items[0][price_data][unit_amount]', unitAmount.toString());
  params.append('line_items[0][price_data][recurring][interval]', interval);
  params.append('line_items[0][price_data][recurring][interval_count]', '1');
  params.append('line_items[0][price_data][product_data][name]', planTitle);
  params.append('line_items[0][price_data][product_data][description]', 'Acesso ilimitado à inteligência artificial do sono, histórico completo na nuvem, todas as paisagens sonoras e relatórios de bem-estar.');
  params.append('line_items[0][quantity]', '1');

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Erro na criação de sessão embedded:', session);
      return res.status(502).json({ error: session.error?.message || 'Falha ao criar sessão do Stripe.' });
    }

    return res.status(200).json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      planTitle: planTitle
    });

  } catch (err) {
    console.error('Erro no handler create-subscription:', err);
    return res.status(500).json({ error: err.message });
  }
};
