/**
 * DESLIGUE-SE — Vercel Serverless API: Stripe Payment Element (Embedded In-App)
 * Cria uma Assinatura com status 'default_incomplete' e retorna o clientSecret do PaymentIntent
 * para renderizar o formulário embutido com tema noturno dentro do próprio app.
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
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY não configurada nas variáveis da Vercel.' });
  }

  const { planType, userEmail, userId } = req.body || {};

  // Valores em centavos BRL
  // Mensal: R$ 19,90 (1990 centavos)
  // Anual: R$ 144,00 (14400 centavos = 12x R$ 12,00)
  const isAnnual = planType === 'annual';
  const unitAmount = isAnnual ? 14400 : 1990;
  const interval = isAnnual ? 'year' : 'month';
  const planTitle = isAnnual ? 'Desligue-se Pro (Anual - 12x R$ 12)' : 'Desligue-se Pro (Mensal)';

  try {
    // 1. Cria ou recupera o Customer no Stripe
    const customerParams = new URLSearchParams();
    if (userEmail) customerParams.append('email', userEmail);
    if (userId) customerParams.append('metadata[userId]', userId);
    customerParams.append('description', `Usuária Desligue-se (${userEmail || 'Anônima'})`);

    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: customerParams.toString()
    });

    const customer = await customerRes.json();
    if (!customerRes.ok) {
      throw new Error(customer.error?.message || 'Falha ao criar cliente no Stripe.');
    }

    // 2. Cria o Preço Dinâmico (Price) recorrente no Stripe
    const priceParams = new URLSearchParams();
    priceParams.append('currency', 'brl');
    priceParams.append('unit_amount', unitAmount.toString());
    priceParams.append('recurring[interval]', interval);
    priceParams.append('product_data[name]', planTitle);

    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: priceParams.toString()
    });

    const price = await priceRes.json();
    if (!priceRes.ok) {
      throw new Error(price.error?.message || 'Falha ao criar preço no Stripe.');
    }

    // 3. Cria a Assinatura (Subscription) com payment_behavior: default_incomplete
    const subParams = new URLSearchParams();
    subParams.append('customer', customer.id);
    subParams.append('items[0][price]', price.id);
    subParams.append('payment_behavior', 'default_incomplete');
    subParams.append('payment_settings[save_default_payment_method]', 'on_subscription');
    subParams.append('expand[0]', 'latest_invoice.payment_intent');
    subParams.append('metadata[planType]', planType || 'monthly');
    if (userId) subParams.append('metadata[userId]', userId);

    const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: subParams.toString()
    });

    const subscription = await subRes.json();
    if (!subRes.ok) {
      throw new Error(subscription.error?.message || 'Falha ao criar assinatura no Stripe.');
    }

    const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;

    if (!clientSecret) {
      throw new Error('Não foi possível obter o client_secret do pagamento.');
    }

    return res.status(200).json({
      subscriptionId: subscription.id,
      clientSecret: clientSecret,
      planTitle: planTitle,
      amountFormatted: isAnnual ? 'R$ 144,00 / ano' : 'R$ 19,90 / mês'
    });

  } catch (err) {
    console.error('Erro ao inicializar Elements:', err);
    return res.status(500).json({ error: err.message });
  }
};
