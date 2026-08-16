/**
 * DESLIGUE-SE — Vercel Serverless API: Criação de Sessão de Checkout do Stripe
 * Suporta Plano Mensal (R$ 19,90/mês) e Plano Anual (R$ 144,00/ano = 12x R$ 12,00)
 */

module.exports = async function handler(req, res) {
  // CORS & Security Headers
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
    console.error('STRIPE_SECRET_KEY não configurada no ambiente da Vercel.');
    return res.status(500).json({ error: 'Chave secreta do Stripe não configurada nas variáveis de ambiente da Vercel.' });
  }

  const { planType, userEmail, userId } = req.body || {};

  // Configuração dos Produtos/Preços
  let planName = 'Desligue-se Premium (Mensal)';
  let unitAmount = 1990; // R$ 19,90 em centavos
  let interval = 'month';
  let intervalCount = 1;

  if (planType === 'annual') {
    planName = 'Desligue-se Premium (Anual - 12x R$ 12)';
    unitAmount = 14400; // R$ 144,00 em centavos (12x R$ 12)
    interval = 'year';
    intervalCount = 1;
  }

  const origin = req.headers.origin || 'https://desliguese.vercel.app';
  const successUrl = `${origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${planType || 'monthly'}`;
  const cancelUrl = `${origin}/?status=cancelled`;

  // Montagem do payload form-urlencoded para a API REST oficial do Stripe
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('payment_method_types[0]', 'card');

  if (userEmail) {
    params.append('customer_email', userEmail);
  }

  if (userId) {
    params.append('client_reference_id', userId);
    params.append('metadata[userId]', userId);
  }
  params.append('metadata[planType]', planType || 'monthly');

  // Line Items com dados do produto e recorrência
  params.append('line_items[0][price_data][currency]', 'brl');
  params.append('line_items[0][price_data][unit_amount]', unitAmount.toString());
  params.append('line_items[0][price_data][recurring][interval]', interval);
  params.append('line_items[0][price_data][recurring][interval_count]', intervalCount.toString());
  params.append('line_items[0][price_data][product_data][name]', planName);
  params.append('line_items[0][price_data][product_data][description]', 'Acesso ilimitado à IA do sono, histórico completo, sons binaurais e relatórios de bem-estar.');
  params.append('line_items[0][quantity]', '1');

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const sessionData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe API error:', sessionData);
      return res.status(502).json({ 
        error: 'Erro ao criar sessão de pagamento no Stripe.',
        detail: sessionData.error?.message || sessionData
      });
    }

    // Retorna a URL direta de checkout do Stripe para redirecionamento
    return res.status(200).json({ 
      sessionId: sessionData.id,
      url: sessionData.url 
    });

  } catch (err) {
    console.error('Erro no handler de checkout:', err);
    return res.status(500).json({ error: 'Erro interno ao processar checkout.', detail: err.message });
  }
};
