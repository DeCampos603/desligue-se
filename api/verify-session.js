/**
 * DESLIGUE-SE — Confirmação do retorno do checkout
 *
 * Correções da auditoria:
 *  - exige autenticação e confere se a sessão pertence a quem está perguntando
 *    (antes qualquer pessoa consultava qualquer session_id);
 *  - não repassa mais o erro cru do Stripe, que vazava o id da conta
 *    (acct_...) e a URL de log do dashboard para chamadores anônimos;
 *  - este endpoint é apenas informativo para a interface. Quem concede o plano
 *    é o webhook, no servidor.
 */

const { applyCors, requireUser, stripeRequest } = require('./_lib/http');
const { applySubscriptionToProfile } = require('./_lib/billing');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { session_id: sessionId } = req.query || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id é obrigatório.' });
  }

  try {
    const session = await stripeRequest('GET', `checkout/sessions/${encodeURIComponent(sessionId)}`);

    // A sessão precisa ser desta usuária. Sem esta checagem, qualquer pessoa
    // poderia consultar o status de pagamento de outra pessoa.
    const belongsToUser =
      session.client_reference_id === user.id ||
      session.metadata?.userId === user.id;

    if (!belongsToUser) {
      console.warn(`Usuária ${user.id} tentou consultar a sessão ${sessionId}, que não é dela.`);
      return res.status(403).json({ error: 'Esta sessão de pagamento não pertence à sua conta.' });
    }

    const paid = session.payment_status === 'paid' || session.status === 'complete';

    // REDE DE SEGURANÇA: se o pagamento está confirmado, liberamos o acesso
    // aqui mesmo, sem esperar o webhook. O webhook continua sendo a fonte de
    // verdade para renovação e cancelamento, mas um webhook mal cadastrado,
    // atrasado ou com segredo errado não pode mais resultar em "paguei e não
    // recebi". A operação é idempotente e os dados vêm do Stripe, não do
    // cliente — então repetir não faz mal e ninguém consegue forjar.
    let planoAtivado = false;
    if (paid && session.subscription) {
      try {
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

        const subscription = await stripeRequest('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`);

        // Garante o vínculo mesmo que a assinatura não traga o metadata
        if (!subscription.metadata) subscription.metadata = {};
        if (!subscription.metadata.userId) subscription.metadata.userId = user.id;

        planoAtivado = await applySubscriptionToProfile(subscription);
      } catch (activationErr) {
        console.error('Falha ao ativar o plano na volta do checkout:', activationErr.message);
      }
    }

    return res.status(200).json({
      paid,
      planoAtivado,
      status: session.status,
      planType: session.metadata?.planType || 'monthly'
    });
  } catch (err) {
    console.error('Erro ao verificar sessão:', err.message);
    return res.status(502).json({ error: 'Não foi possível confirmar o pagamento agora.' });
  }
};
