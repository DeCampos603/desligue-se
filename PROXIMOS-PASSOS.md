# Passo a passo — o que depende de você

As correções de código já estão aplicadas e verificadas no navegador. O que resta são ações em painéis externos (Vercel, Supabase, Stripe) e duas decisões suas. Siga na ordem: cada passo depende do anterior.

Tempo estimado total: **40 a 60 minutos**.

---

## Passo 1 — Publicar as correções (5 min) 🔴 urgente

O site está fora do ar funcionalmente desde o commit `f227d33`. Este passo sozinho já ressuscita o aplicativo.

```bash
cd "G:/Meu Drive/REPO/Agente-Desligue-Se"
git add -A
git status
```

Revise o que aparecer e então:

```bash
git commit -m "fix: corrige crash de inicializacao, contatos de crise ocultos e brechas de seguranca"
```

```bash
git push origin main
```

A Vercel publica sozinha em ~1 minuto.

**Como conferir:** abra https://desliguese.vercel.app, aperte `F12` → aba *Console*. Não pode haver nenhum erro vermelho. Clique em "Premium": o modal precisa abrir.

> Se você já tinha aberto o site antes, force uma atualização com `Ctrl+Shift+R` — o Service Worker antigo pode servir a versão quebrada.

---

## Passo 2 — Variáveis de ambiente na Vercel (10 min)

Sem elas, os endpoints de cobrança e o webhook não funcionam.

Vá em **Vercel → projeto desliguese → Settings → Environment Variables** e acrescente (marque *Production*, *Preview* e *Development* em todas):

| Nome | Onde pegar o valor |
| :--- | :--- |
| `SUPABASE_URL` | Supabase → Settings → API → *Project URL* |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → *anon public* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → *service_role* ⚠️ segredo |

As que já existem (`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`) podem ficar como estão.

> ⚠️ A `service_role` ignora todas as regras de segurança do banco. Ela só pode existir na Vercel. Nunca cole esse valor em `app/config.js`, em um commit ou em qualquer arquivo dentro de `app/`.

Depois de salvar, force um redeploy: **Deployments → ... → Redeploy**.

---

## Passo 3 — Atualizar o banco de dados (5 min)

1. Abra o **Supabase → SQL Editor → New query**.
2. Cole o conteúdo inteiro de [`database/schema.sql`](database/schema.sql).
3. Clique em **Run**.

O script é idempotente: pode ser executado quantas vezes você quiser, sem apagar dados.

**Como conferir:** rode esta consulta; ela precisa devolver uma linha.

```sql
select tgname from pg_trigger where tgname = 'protect_billing_columns_trigger';
```

O que esse gatilho faz: impede que alguém se promova a Premium pelo console do navegador. Antes, `profiles.upsert({plano:'premium_anual'})` funcionava para qualquer pessoa.

---

## Passo 4 — Cadastrar o webhook do Stripe (10 min)

**Sem este passo nenhum pagamento libera o plano Pro.** Isso é intencional: o acesso pago agora só é concedido pelo servidor.

1. Vá em **Stripe → Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://desliguese.vercel.app/api/webhook`
3. Em *Select events*, marque exatamente estes quatro:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Salve e copie o **Signing secret** (começa com `whsec_`).
5. Cole na Vercel como `STRIPE_WEBHOOK_SECRET` e faça o redeploy.

**Como conferir:** no próprio Stripe, clique em **Send test webhook** com `customer.subscription.updated`. A resposta precisa ser `200`. Se vier `400 Assinatura inválida`, o `whsec_` foi colado errado ou o redeploy não aconteceu.

---

## Passo 5 — Ativar o Portal do Cliente (2 min)

É o que faz funcionar o botão "Gerenciar ou cancelar minha assinatura" — e o que atende à exigência do CDC de que cancelar seja tão fácil quanto assinar.

1. Abra https://dashboard.stripe.com/settings/billing/portal
2. Ative **"Customers can cancel subscriptions"**.
3. Salve.

---

## Passo 6 — Testar o pagamento de ponta a ponta (10 min)

Ainda em modo de teste, portanto sem dinheiro real envolvido.

1. Abra o site e **crie uma conta** (o pagamento agora exige login).
2. Clique em **Premium → Assinar Mensal**.
3. Use o cartão de teste: `4242 4242 4242 4242`, validade qualquer no futuro, CVC qualquer.
4. Ao voltar para o app, a mensagem "Bem-vinda ao Desligue-se Pro" deve aparecer em poucos segundos.
5. No Supabase → **Table Editor → profiles**, confira que a sua linha está com `plano = premium_mensal` e `subscription_status = active`.
6. Volte ao app → **Minha Conta → Gerenciar assinatura → Cancelar**. Em seguida confira que `subscription_status` virou `canceling`.

Se o passo 5 não mudar o banco, o problema está no webhook (volte ao Passo 4 e veja o log da tentativa no Stripe).

---

## Passo 7 — Decisões que são suas

### 7.1 🔴 Quando migrar para cobrança real

Hoje **tudo está em modo de teste** e nenhuma cobrança acontece. Para valer de verdade, os dois lados precisam mudar **ao mesmo tempo**:

1. Na Vercel: `STRIPE_SECRET_KEY` → valor `sk_live_...`
2. Em [`app/config.js`](app/config.js): `stripePublishableKey` → valor `pk_live_...`
3. Refaça o Passo 4 (o webhook de produção é um cadastro separado do de teste, com outro `whsec_`).
4. Redeploy.

Misturar uma chave de teste com uma de produção quebra o checkout sem mensagem de erro clara. Por isso deixei as duas apontadas no mesmo lugar, com aviso no arquivo.

### 7.2 E-mail do encarregado de dados (DPO)

Os Termos agora informam `privacidade@desliguese.com.br` como canal para exercer direitos da LGPD. **Esse endereço precisa existir e ser lido**, com resposta em até 15 dias. Se você preferir outro (um Gmail seu, por exemplo), troque em `app/index.html` — o texto aparece uma vez, na cláusula 4.

### 7.3 Visitante sem login pode usar a IA?

Hoje quem não tem conta ainda consegue fazer 1 triagem por dia — é a "degustação" do produto. Isso custa cota do Gemini e não é rastreável por usuária (o limite fica no `localStorage`, que qualquer pessoa apaga).

Duas opções:

- **Manter** (bom para conversão, custo baixo enquanto o volume for pequeno);
- **Exigir login para usar a IA** — mais seguro e previsível em custo. Se quiser, eu faço: é uma linha em `handleProcessDump`.

Se mantiver, vale acompanhar o custo no Google AI Studio nas primeiras semanas.

### 7.4 Revisão jurídica

Reescrevi os Termos para que descrevam **a verdade técnica** do sistema: quem recebe os dados, que há transferência internacional, que não existe criptografia de ponta a ponta, como cancelar e como excluir a conta. Isso corrige afirmações que estavam factualmente erradas.

Ainda assim, eu não sou advogado e o produto trata dado sensível de saúde mental. Antes de divulgar para fora do seu círculo, vale uma leitura por alguém especializado em LGPD e direito do consumidor.

---

## Passo 8 — Conferência final depois do deploy (5 min)

Com tudo publicado, confira no console do navegador (`F12`) da página em produção:

- Nenhum erro de **CSP** bloqueando script, fonte ou conexão. Se algum aparecer, me mande a mensagem: é só acrescentar o domínio em `vercel.json`.
- A triagem por IA respondendo em menos de 30 segundos. No resultado, o campo `model` da resposta de `/api/classify` mostra qual modelo atendeu.
- O ícone de instalação do PWA aparecendo no celular.

---

## Resumo em uma linha

**Faça o Passo 1 hoje** — ele tira o aplicativo do estado quebrado. Os passos 2 a 6 são obrigatórios antes de qualquer cobrança real, e o Passo 7 é onde só você pode decidir.
