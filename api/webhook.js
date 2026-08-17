/**
 * DESLIGUE-SE — Webhook do Stripe (fonte de verdade do plano pago)
 *
 * Este arquivo não existia. Sem ele, cancelamentos, falhas de pagamento e
 * estornos nunca chegavam ao banco: quem cancelasse continuaria Pro para
 * sempre, e o acesso pago era concedido pelo próprio navegador.
 *
 * Regra de ouro: a coluna `plano` do perfil só é escrita aqui, com a service
 * role. O cliente nunca concede acesso a si mesmo.
 *
 * Configure no painel do Stripe (Developers > Webhooks):
 *   URL:      https://SEU-DOMINIO/api/webhook
 *   Eventos:  checkout.session.completed
 *             customer.subscription.created
 *             customer.subscription.updated
 *             customer.subscription.deleted
 *   Copie o "Signing secret" (whsec_...) para STRIPE_WEBHOOK_SECRET na Vercel.
 */

const crypto = require('crypto');
const { stripeRequest } = require('./_lib/http');
const { applySubscriptionToProfile } = require('./_lib/billing');

// Desliga o parser automático da Vercel: a verificação de assinatura exige o
// corpo exatamente como o Stripe o enviou, byte a byte.
const config = {
  api: {
    bodyParser: false
  }
};

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutos

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Verifica o cabeçalho Stripe-Signature (mesmo algoritmo do
 * stripe.webhooks.constructEvent, implementado sem dependências externas).
 */
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key === 't') acc.timestamp = value;
    if (key === 'v1') acc.signatures.push(value);
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  // Proteção contra replay
  const age = Math.floor(Date.now() / 1000) - Number(parts.timestamp);
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');

  return parts.signatures.some(signature => {
    const candidate = Buffer.from(signature, 'utf8');
    return candidate.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidate, expectedBuffer);
  });
}

/** Busca a assinatura direto no Stripe — nunca confiamos no corpo recebido. */
async function fetchSubscription(subscriptionId) {
  return stripeRequest('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function handleEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subscription = await fetchSubscription(session.subscription);
      await applySubscriptionToProfile(subscription);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Rebuscamos no Stripe para trabalhar sempre com o estado atual,
      // e não com o retrato que veio no evento (que pode chegar fora de ordem).
      const subscription = await fetchSubscription(event.data.object.id);
      await applySubscriptionToProfile(subscription);
      return;
    }

    default:
      console.log(`Evento ignorado: ${event.type}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET não configurada — webhook recusado.');
    return res.status(500).json({ error: 'Webhook não configurado.' });
  }

  let rawBody = '';
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Falha ao ler o corpo do webhook:', err.message);
    return res.status(400).json({ error: 'Corpo inválido.' });
  }

  // Se o corpo já tiver sido consumido pelo runtime, ainda assim não confiamos
  // nele: seguimos apenas com o id do evento e recarregamos tudo do Stripe.
  let event = null;
  let signatureOk = false;

  if (rawBody) {
    signatureOk = verifyStripeSignature(rawBody, req.headers['stripe-signature'], webhookSecret);
    if (!signatureOk) {
      console.warn('Assinatura do webhook inválida — requisição descartada.');
      return res.status(400).json({ error: 'Assinatura inválida.' });
    }
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
  } else if (req.body && req.body.id) {
    // Caminho de contingência: valida o evento buscando-o na API do Stripe.
    try {
      event = await stripeRequest('GET', `events/${encodeURIComponent(req.body.id)}`);
    } catch (err) {
      console.error('Não foi possível confirmar o evento no Stripe:', err.message);
      return res.status(400).json({ error: 'Evento não confirmado.' });
    }
  } else {
    return res.status(400).json({ error: 'Requisição sem corpo.' });
  }

  try {
    await handleEvent(event);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Erro ao processar ${event?.type}:`, err.message);
    // 500 faz o Stripe repetir o envio — é o comportamento desejado.
    return res.status(500).json({ error: 'Falha ao processar o evento.' });
  }
};

module.exports.config = config;
