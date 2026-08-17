# 🌙 Desligue-se

> **Seu diário noturno inteligente que organiza a mente e te ajuda a dormir tranquila.**

---

## 🎯 1. Visão Geral do Produto (MicroSaaS)

O **Desligue-se** não é mais um aplicativo genérico de meditação ou biblioteca com 500 horas de áudios passivos. Ele foi concebido para resolver uma dor específica, profunda e diária: **a hiperatividade mental noturna feminina decorrente do acúmulo de carga mental diária**.

### 💡 Proposta de Valor Única (UVP)
> *"Você não tem insônia. Às vezes você simplesmente levou o dia inteiro para a cama."*

O sistema atua como uma ponte de descompressão entre o dia agitado e a noite de descanso:
1. **Descarrego Mental (Brain Dump):** a mulher fala ou digita livremente tudo o que está rondando seus pensamentos.
2. **Triagem Cognitiva com IA (TCC-I & Efeito Zeigarnik):** o algoritmo separa com gentileza tarefas acionáveis, pendências seguras, pensamentos repetitivos e incertezas incontroláveis.
3. **Fechamento do Dia & Permissão:** ancoragem psicológica de que tudo está seguro e que nada será esquecido.
4. **Ritual de Desaceleração Sob Medida (3, 5 ou 10 minutos):** guias somatossensoriais de respiração 4-7-8, coerência cardíaca, relaxamento muscular e frequências relaxantes.
5. **Check-in Matinal & Aprendizado Contínuo:** avaliação do descanso e entrega suave das prioridades do dia.

---

## 🔬 2. Pilares de Neurociência e Comportamento

- **Efeito Zeigarnik Mitigado:** o cérebro mantém loops abertos até que tarefas recebam um local confiável de guarda. O Desligue-se fecha esses loops.
- **Constructive Worry Time:** protocolo padrão-ouro da TCC-I que desassocia a cama da ansiedade de planejamento.
- **Desativação Simpática & Tônus Vagal:** técnicas somáticas de respiração com expiração prolongada para acionar o sistema nervoso parassimpático.
- **Design de Baixo Estímulo:** paleta azul-noite de baixa luminância, com superfícies escuras e contraste suave para não agredir a vista no escuro.

> ⚠️ **Nota sobre luz azul.** A versão anterior usava âmbar quente justamente porque comprimentos de onda curtos (azul) são os que mais suprimem a melatonina. O modelo visual de 2026 adota o azul por decisão de produto. A mitigação aplicada foi manter luminância baixa em todas as superfícies e reservar o azul saturado para acentos pequenos — nunca para grandes áreas de fundo. Se quiser reduzir ainda mais a exposição, o caminho é oferecer um seletor de tema âmbar para uso na cama.

---

## 📂 3. Estrutura do Projeto

```
Agente-Desligue-Se/
├── app/                        # Front-end estático (SPA sem build)
│   ├── index.html              # Interface noturna responsiva
│   ├── styles.css              # Design System noturno anti-estresse
│   ├── config.js               # Chaves PÚBLICAS (Supabase anon, Stripe pk)
│   ├── app.js                  # Motor de triagem, Web Audio API e persistência
│   ├── sw.js                   # Service Worker (PWA offline)
│   └── manifest.json
├── api/                        # Funções serverless da Vercel
│   ├── _lib/http.js            # CORS, validação de JWT e acesso admin (privado)
│   ├── _lib/billing.js         # Planos, preços e vínculo com o Stripe (privado)
│   ├── classify.js             # Proxy seguro para o Google Gemini
│   ├── checkout.js             # Stripe Checkout hospedado
│   ├── create-subscription.js  # Stripe Checkout embutido
│   ├── verify-session.js       # Confirmação do retorno do pagamento
│   ├── webhook.js              # ⭐ Fonte de verdade do plano pago
│   └── portal.js               # Portal de cancelamento self-service
├── database/schema.sql         # Tabelas, RLS, gatilhos e exclusão de conta
├── conhecimento/               # Base teórica e científica
├── AUDITORIA.md                # Auditoria técnica e status das correções
└── vercel.json                 # Headers de segurança, CSP e limites das funções
```

---

## 💰 4. Modelo de Negócio

| Plano | Preço | O que inclui |
| :--- | :--- | :--- |
| **Gratuito** | R$ 0 | 1 registro por dia, triagem completa dos pensamentos, rotina de respiração de 3 min, 3 noites visíveis no histórico. |
| **Pro Mensal** | R$ 19,90/mês | Registros ilimitados, carta de acolhimento completa, rotinas de 5 e 10 min, paisagens sonoras, histórico integral e sincronizado. |
| **Pro Anual** | R$ 144,00/ano *(R$ 12,00/mês)* | Tudo do mensal, com 40% de economia. |

Cancelamento a qualquer momento pelo Portal do Cliente do Stripe, dentro do próprio app.

---

## 🚀 5. Como Rodar Localmente

O front-end é estático e não precisa de build:

```bash
npx serve app
```

Ou, sem Node instalado:

```bash
python -m http.server 8000 --directory app
```

As rotas `/api/*` só existem na Vercel. Rodando localmente sem elas, o app usa automaticamente o classificador heurístico local — a interface continua funcional para testes visuais. Para exercitar as funções serverless, use `vercel dev`.

---

## ⚙️ 6. Configuração de Produção

### 6.1 Variáveis de ambiente (Vercel)

Copie de [`.env.example`](.env.example). Todas são obrigatórias, exceto as marcadas como opcionais:

| Variável | Para quê |
| :--- | :--- |
| `GEMINI_API_KEY` | Triagem por IA |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Validação da sessão da usuária no servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Gravação do plano pelo webhook (**nunca no front-end**) |
| `STRIPE_SECRET_KEY` | Criação de sessões de pagamento |
| `STRIPE_WEBHOOK_SECRET` | Verificação da assinatura do webhook |
| `ALLOWED_ORIGINS` | Origens autorizadas na API (opcional) |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Usar Prices do painel em vez de preço dinâmico (opcional) |
| `GEMINI_MODELS` | Sobrescrever a ordem dos modelos (opcional) |

### 6.2 Banco de dados

Execute [`database/schema.sql`](database/schema.sql) no SQL Editor do Supabase. O script é idempotente e pode ser reaplicado com segurança.

### 6.3 Webhook do Stripe

Em **Developers → Webhooks**, cadastre `https://SEU-DOMINIO/api/webhook` com os eventos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copie o *signing secret* para `STRIPE_WEBHOOK_SECRET`. **Sem o webhook, nenhum pagamento libera o plano Pro** — por design: o navegador não concede acesso a si mesmo.

### 6.4 Portal do Cliente

Ative uma única vez em [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal), habilitando o cancelamento de assinatura. É o que faz funcionar o botão "Gerenciar ou cancelar minha assinatura".

### 6.5 Chaves de teste x produção

`app/config.js` guarda a chave **publicável** do Stripe e a Vercel guarda a **secreta**. As duas precisam estar sempre no mesmo modo. Hoje o projeto está em **modo de teste** — nenhuma cobrança real ocorre.

---

## 🔐 7. Modelo de Segurança

- O plano pago vive somente na coluna `plano` do perfil, escrita apenas pelo webhook com a service role. Um gatilho no Postgres reverte qualquer tentativa de alteração vinda do cliente.
- Row Level Security em todas as tabelas: cada usuária só enxerga as próprias linhas.
- Os endpoints `/api/*` aceitam apenas origens conhecidas e exigem JWT válido do Supabase para qualquer operação de cobrança.
- Nenhum segredo no front-end: `config.js` contém apenas chaves públicas.

## 🛡️ 8. Privacidade (LGPD)

O conteúdo do diário é **dado pessoal sensível**. O tratamento se apoia em consentimento específico e destacado, coletado no cadastro. Os operadores (Google Gemini, Supabase, Vercel e Stripe) estão declarados nos Termos dentro do app, assim como a transferência internacional de dados e o canal do encarregado. A exclusão total da conta é self-service, imediata e irreversível.

O aplicativo **não** usa criptografia de ponta a ponta, e nenhuma tela afirma o contrário.
