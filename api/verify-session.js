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

    return res.status(200).json({
      paid,
      status: session.status,
      planType: session.metadata?.planType || 'monthly'
    });
  } catch (err) {
    console.error('Erro ao verificar sessão:', err.message);
    return res.status(502).json({ error: 'Não foi possível confirmar o pagamento agora.' });
  }
};
