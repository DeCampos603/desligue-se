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
 *             charge.refunded          <- estorno retira o acesso
 *             charge.dispute.created   <- contestação retira o acesso
 *             charge.dispute.closed
 *   Copie o "Signing secret" (whsec_...) para STRIPE_WEBHOOK_SECRET na Vercel.
 */

const crypto = require('crypto');
const { stripeRequest } = require('./_lib/http');
const { applySubscriptionToProfile, revogarAcessoPago } = require('./_lib/billing');

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

function idDe(valor) {
  if (!valor) return null;
  return typeof valor === 'string' ? valor : (valor.id || null);
}

/**
 * Descobre a assinatura por trás de uma cobrança: cobranca -> fatura -> assinatura.
 * Devolve null para cobranças avulsas (sem fatura ou sem assinatura).
 */
async function assinaturaDaCobranca(charge) {
  const faturaId = idDe(charge.invoice);
  if (!faturaId) return null;

  const fatura = await stripeRequest('GET', `invoices/${encodeURIComponent(faturaId)}`);

  // O campo mudou de lugar entre versões da API do Stripe; aceitamos os três.
  const assinaturaId =
    idDe(fatura.subscription) ||
    idDe(fatura.parent?.subscription_details?.subscription) ||
    idDe(fatura.lines?.data?.[0]?.subscription);

  if (!assinaturaId) return null;
  return fetchSubscription(assinaturaId);
}

/** Encerra a assinatura no Stripe para que não haja cobrança no próximo ciclo. */
async function encerrarAssinatura(assinatura, motivo) {
  if (!assinatura || assinatura.status === 'canceled') return assinatura;
  console.log(`Encerrando a assinatura ${assinatura.id} — ${motivo}.`);
  return stripeRequest('DELETE', `subscriptions/${encodeURIComponent(assinatura.id)}`);
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

    case 'charge.refunded': {
      const charge = event.data.object;
      const integral = Number(charge.amount_refunded || 0) >= Number(charge.amount || 0);

      // Estorno parcial (um crédito de cortesia, um ajuste) não tira o acesso.
      if (!integral) {
        console.log(
          `Estorno parcial em ${charge.id} (${charge.amount_refunded} de ${charge.amount}). ` +
          'Acesso mantido.'
        );
        return;
      }

      const assinatura = await assinaturaDaCobranca(charge);

      // Cobrança avulsa: não há assinatura para encerrar, só o acesso a retirar.
      if (!assinatura) {
        await revogarAcessoPago({
          customerId: idDe(charge.customer),
          status: 'refunded',
          motivo: 'Estorno integral de cobrança avulsa',
          referencia: charge.id
        });
        return;
      }

      // Estorno de uma fatura antiga (compensação por um mês ruim, por exemplo)
      // não é pedido de saída: quem continua assinando continua com o acesso.
      const ultimaFatura = idDe(assinatura.latest_invoice);
      const faturaEstornada = idDe(charge.invoice);
      if (ultimaFatura && faturaEstornada && ultimaFatura !== faturaEstornada) {
        console.log(
          `Estorno da fatura antiga ${faturaEstornada} (a atual é ${ultimaFatura}). ` +
          `Assinatura ${assinatura.id} segue ativa e o acesso foi mantido.`
        );
        return;
      }

      // Devolver o dinheiro e continuar cobrando no mês seguinte seria pior do
      // que não devolver: encerramos a assinatura junto.
      await encerrarAssinatura(assinatura, `estorno integral da cobrança ${charge.id}`);
      await revogarAcessoPago({
        customerId: idDe(charge.customer) || idDe(assinatura.customer),
        userId: assinatura.metadata?.userId,
        status: 'refunded',
        motivo: 'Estorno integral',
        referencia: charge.id
      });
      return;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const chargeId = idDe(dispute.charge);
      const charge = chargeId
        ? await stripeRequest('GET', `charges/${encodeURIComponent(chargeId)}`)
        : null;
      const assinatura = charge ? await assinaturaDaCobranca(charge) : null;

      // Contestação retira o acesso na hora, mesmo antes do desfecho: o dinheiro
      // já saiu da conta e o banco pode levar semanas para decidir.
      await encerrarAssinatura(assinatura, `contestação ${dispute.id}`);
      await revogarAcessoPago({
        customerId: idDe(charge?.customer) || idDe(assinatura?.customer),
        userId: assinatura?.metadata?.userId,
        status: 'disputed',
        motivo: 'Contestação (chargeback) aberta',
        referencia: dispute.id
      });
      return;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      if (dispute.status !== 'won') {
        console.log(`Contestação ${dispute.id} encerrada como "${dispute.status}". Acesso segue retirado.`);
        return;
      }
      // Ganhamos a disputa: o dinheiro ficou. Mas a assinatura foi encerrada e
      // não dá para recriá-la sem uma nova autorização do cartão — restaurar
      // exige contato humano. Não fingimos que está resolvido.
      console.warn(
        `CONTESTAÇÃO GANHA: ${dispute.id} (cobrança ${idDe(dispute.charge)}). ` +
        'O acesso foi retirado quando a disputa abriu e NÃO volta sozinho — ' +
        'fale com a pessoa e reative à mão se for o caso.'
      );
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
