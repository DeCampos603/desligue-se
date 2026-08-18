/**
 * DESLIGUE-SE — Reconciliação de assinatura sob demanda
 *
 * Consulta o Stripe e regrava o plano da usuária autenticada a partir do que
 * existe LÁ. Serve para destravar quem pagou mas não recebeu o acesso —
 * webhook não cadastrado, segredo errado, evento perdido, vínculo do customer
 * quebrado. Sem isto, o único conserto era editar o banco à mão.
 *
 * É seguro: nada vem do cliente. O usuário é identificado pelo JWT e o estado
 * da assinatura é lido diretamente da API do Stripe.
 */

const { applyCors, requireUser, supabaseAdmin, stripeRequest } = require('./_lib/http');
const { applySubscriptionToProfile } = require('./_lib/billing');

/** Descobre o customer da usuária: primeiro pelo perfil, depois pelo e-mail. */
async function findCustomerId(user) {
  const rows = await supabaseAdmin(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`
  );
  const salvo = Array.isArray(rows) && rows[0]?.stripe_customer_id;
  if (salvo) return salvo;

  if (!user.email) return null;

  // Assinatura feita antes de o vínculo existir: procura pelo e-mail no Stripe.
  const busca = await stripeRequest('GET', `customers?email=${encodeURIComponent(user.email)}&limit=10`);
  const candidatos = busca?.data || [];
  if (candidatos.length === 0) return null;

  // Prefere o customer cujo metadata aponta para esta conta
  const doUsuario = candidatos.find(c => c.metadata?.supabase_user_id === user.id);
  return (doUsuario || candidatos[0]).id;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const user = await requireUser(
    req,
    res,
    "Entre na sua conta para consultarmos a sua assinatura."
  );
  if (!user) return;

  try {
    const customerId = await findCustomerId(user);

    if (!customerId) {
      return res.status(200).json({
        atualizado: false,
        plano: 'free',
        mensagem: 'Não encontramos nenhuma assinatura vinculada a esta conta.'
      });
    }

    const lista = await stripeRequest(
      'GET',
      `subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`
    );

    const assinaturas = lista?.data || [];
    const prioridade = ['active', 'trialing', 'past_due'];
    const vigente = assinaturas.find(s => prioridade.includes(s.status)) || assinaturas[0];

    if (!vigente) {
      return res.status(200).json({
        atualizado: false,
        plano: 'free',
        mensagem: 'Encontramos seu cadastro, mas nenhuma assinatura foi criada ainda.'
      });
    }

    if (!vigente.metadata) vigente.metadata = {};
    if (!vigente.metadata.userId) vigente.metadata.userId = user.id;

    const aplicado = await applySubscriptionToProfile(vigente);

    return res.status(200).json({
      atualizado: aplicado,
      statusStripe: vigente.status,
      mensagem: aplicado
        ? 'Assinatura sincronizada com sucesso.'
        : 'Não conseguimos gravar o plano no seu perfil. Fale com o suporte.'
    });
  } catch (err) {
    console.error('Erro ao sincronizar assinatura:', err.message);
    return res.status(502).json({ error: 'Não foi possível consultar sua assinatura agora.' });
  }
};
