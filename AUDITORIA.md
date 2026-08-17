# Auditoria Técnica — Desligue-se

**Data:** 17/08/2026
**Escopo:** `app/` (SPA), `api/` (serverless Vercel), `database/schema.sql`, configuração de deploy e site em produção (https://desliguese.vercel.app)
**Commit auditado:** `f227d33`

---

## Resumo executivo

O produto está bem pensado (conceito, copy, design system, base teórica) e a estrutura de código é limpa e legível. Mas **o aplicativo está 100% inoperante em produção** por um erro de JavaScript que impede a inicialização, e a camada de monetização não funciona de ponta a ponta: o Stripe está em modo de teste, não há webhook, e o plano Pro é concedido apenas pelo navegador — qualquer pessoa se torna Pro com uma linha no console.

Além disso, há um risco de conformidade relevante: o diário íntimo da usuária (dado pessoal **sensível**, art. 11 da LGPD) é enviado ao Google Gemini, enquanto os Termos de Uso afirmam que nenhum dado é compartilhado com terceiros e que o histórico é "criptografado de ponta a ponta". Nenhuma das duas afirmações é verdadeira hoje.

| Severidade | Qtd. | Corrigidos no código | Dependem de configuração sua |
| :--- | :--- | :--- | :--- |
| 🔴 Bloqueador (P0) | 4 | 4 | 2 (chaves live, webhook no painel) |
| 🟠 Alto (P1) | 5 | 5 | 1 (SQL a executar) |
| 🟡 Médio (P2) | 9 | 9 | 1 (e-mail do DPO) |
| ⚪ Baixo (P3) | 8 | 8 | — |

> **Correção de rota desta auditoria.** Ao aplicar as correções, descobri que
> `renderCrisisAlert()` estava **definida mas nunca chamada** em nenhum lugar do
> código. Isso significa que o banner de crise com o CVV 188, o chat e o SAMU
> **nunca aparecia** — e, somado ao corte da carta em 120 caracteres, uma
> usuária em risco no plano gratuito não veria nenhum telefone de ajuda. Meu
> relatório original dizia que os contatos continuavam visíveis pelo banner;
> isso estava errado, e o achado é bem mais grave do que classifiquei. Ver P2-1.

---

## 🔴 P0 — Bloqueadores

### P0-1. O app não inicializa: `ReferenceError` na linha 64 de `app.js`

**Evidência (console do site em produção):**
```
✅ Supabase conectado: https://vycflbcaphehlcjkqcjw.supabase.co
Uncaught ReferenceError: Cannot access 'appState' before initialization
    at app.js?v=2.0.3:64:14
```

**Causa.** O objeto `appState` é construído com `history: loadHistoryFromLocalStorage()` (app.js:64), e essa função lê `appState.currentUser` (app.js:2081) — ou seja, `appState` é lido antes de existir (temporal dead zone).

**Impacto.** A exceção acontece no topo do handler de `DOMContentLoaded`, antes de `modulesToInit`. **Nenhum listener é registrado**: nenhum botão funciona, o Service Worker nunca é registrado, o Supabase Auth nunca é verificado, o checkout nunca abre. Confirmado por interação na página: clicar em "Premium" e em "Diário" não produz efeito algum.

**Correção:**
```js
// app.js:64
history: [],   // era: loadHistoryFromLocalStorage()
```
`loadHistoryFromLocalStorage()` já retorna `[]` quando não há usuário logado, e o histórico real é carregado em `handleUserLoggedIn()`. A troca é segura e resolve por completo.

> Depois de corrigir, suba a versão do cache (`?v=`) nos três lugares — `index.html`, `sw.js` (`CACHE_NAME` e `ASSETS_TO_CACHE`) — senão quem já visitou continuará recebendo o `app.js` quebrado do Service Worker.

---

### P0-2. Stripe em modo de teste na produção

Uma chamada a `/api/verify-session` devolve o log da requisição no dashboard: `.../acct_1U57k8IZTTcAGD4K/**test**/workbench/logs`. A `STRIPE_SECRET_KEY` configurada na Vercel é uma chave de **teste**, e `STRIPE_PUBLISHABLE_KEY` está fixa no código como `pk_test_...` (app.js:2440).

**Impacto.** Nenhuma cobrança real pode ocorrer. E há uma armadilha: trocar apenas a chave secreta para `sk_live_` quebra o checkout, porque a `pk_test_` do front-end não consegue confirmar um `client_secret` de sessão live. As duas precisam mudar juntas — e a publicável deveria vir de configuração, não hardcoded.

---

### P0-3. Não existe webhook do Stripe

O `.env.example` prevê `STRIPE_WEBHOOK_SECRET`, mas não há `api/webhook.js`. Sem ele:

- renovações, cancelamentos, falhas de pagamento e chargebacks nunca chegam ao seu banco;
- quem cancelar continua Pro para sempre;
- a única "confirmação" de pagamento é o retorno do navegador (`?status=success`).

**Correção.** Criar `api/webhook.js` validando a assinatura (`stripe-signature`) e tratando `checkout.session.completed`, `customer.subscription.updated` e `customer.subscription.deleted`, gravando em `profiles` com a **service role key** (nunca pelo cliente).

---

### P0-4. O paywall é decorativo — qualquer usuária vira Pro

Duas rotas de burla, ambas triviais:

1. `isUserPro()` (app.js:869) confia em `localStorage.getItem('desliguese_user_plan')`. Um `localStorage.setItem('desliguese_user_plan','pro')` no console libera tudo.
2. O próprio cliente escreve o plano: `supabase.from('profiles').upsert({ plano: 'premium_anual' })` (app.js:2626). A policy `"Usuária atualiza seu próprio perfil"` permite `UPDATE` do dono sobre a linha inteira, sem `WITH CHECK` e sem proteger a coluna `plano`.

O mesmo vale para o limite diário gratuito: `desliguese_last_dump_date` no `localStorage` — apagar a chave dá registros ilimitados.

**Correção.** A coluna `plano` só pode ser escrita pelo servidor (webhook + service role). Remover a policy de `UPDATE` ampla, ou restringi-la a colunas não sensíveis com uma policy `WITH CHECK` e uma função `SECURITY DEFINER` para o restante. O limite diário precisa ser contado no banco (`journal_entries` do usuário no dia), não no navegador.

---

## 🟠 P1 — Alto

### P1-1. A IA nunca é usada: `/api/classify` leva ~60s e o cliente desiste em 12s

Medido duas vezes na produção: **63,1s** e **61,1s** (a segunda já quente, então não é cold start). O cliente aborta em 12s (`app.js:1169`) e cai no `analyzeThoughtsWithTCCI` — o classificador heurístico local por palavras-chave.

Ou seja: **hoje o produto entrega triagem por `if/else`, não IA**, mesmo quando o endpoint funciona (ele funciona: testei e a resposta do Gemini é boa).

**Causa provável.** A autodescoberta em `classify.js:125-135` substitui a lista curada de 5 modelos por **todos** os modelos que suportam `generateContent` na sua chave (hoje são dezenas), em ordem arbitrária, e o loop tenta um por um em série. Modelos obsoletos, com quota zerada ou lentos são tentados antes dos rápidos.

**Correção.** Remover a autodescoberta (ou cachear o resultado), fixar `gemini-2.5-flash` com um único fallback, e alinhar os timeouts: cliente 25s, `maxDuration` da função na `vercel.json`, e um `AbortController` também no `fetch` para o Gemini.

### P1-2. APIs abertas ao mundo (`Access-Control-Allow-Origin: *`)

Os quatro endpoints aceitam qualquer origem. Consequências concretas:

- `/api/classify` é um **proxy Gemini gratuito e público** rodando na sua cota e no seu cartão;
- `/api/checkout` e `/api/create-subscription` criam sessões na sua conta Stripe a partir de qualquer site.

O rate limit de `classify.js` é um `Map` em memória — em serverless cada instância tem o seu, e a Vercel escala instâncias sob carga; na prática o limite de 30/min não existe.

**Correção.** Trocar `*` pela origem do próprio app; validar o JWT do Supabase no servidor para `classify`; usar um rate limit compartilhado (Vercel KV/Upstash) por usuário, não por IP.

### P1-3. LGPD: dado sensível enviado a terceiro, com Termos que dizem o contrário

O texto integral do desabafo vai para a API do Google (`generativelanguage.googleapis.com`) — transferência internacional de **dado pessoal sensível de saúde** (art. 11 e art. 33 da LGPD). Os Termos (index.html, cláusula 4) afirmam:

> "Nenhum dado pessoal ou conteúdo de desabafo é comercializado, alugado ou **compartilhado com terceiros**"

E a interface promete, em dois lugares, criptografia que não existe:
- `app.js:2123` — "salvas na nuvem com **criptografia de ponta a ponta**";
- `index.html:777` — "nuvem criptografada"; README — "histórico criptografado".

Os dados estão em texto plano no Postgres do Supabase (TLS em trânsito e criptografia de disco, que não é E2E).

Faltam ainda: política de privacidade própria (não só uma cláusula em modal), contato do encarregado/DPO, base legal declarada para dado sensível (art. 11 exige **consentimento específico e destacado**), e o mecanismo de exclusão de conta que os Termos prometem ("você pode solicitar a exclusão total") — não existe nem botão nem e-mail.

**Correção mínima:** (a) declarar o Google Gemini como operador e a transferência internacional; (b) remover as afirmações de E2E ou implementar criptografia no cliente de fato; (c) consentimento específico e destacado para o tratamento de dado sensível; (d) botão de excluir conta e dados; (e) contato do encarregado.

### P1-4. Usuária paga perde o Pro ao trocar de navegador

Após o pagamento, `initStripeReturnStatus()` faz `profiles.upsert({...})`. A tabela `profiles` **não tem policy de `INSERT`** (`schema.sql` só cria `SELECT` e `UPDATE`), e um upsert do PostgREST exige `INSERT` — o RLS rejeita a operação, que é engolida pelo `catch`. Resultado: o plano só existe no `localStorage` daquele navegador. Limpar o cache, trocar de celular ou usar o app instalado = volta a ser gratuita, tendo pago.

Isso desaparece junto com a correção de P0-4 (gravação do plano pelo webhook no servidor).

### P1-5. `/api/verify-session` vaza o erro cru do Stripe e não valida o dono da sessão

Qualquer pessoa, sem autenticação, recebe: `acct_1U57k8IZTTcAGD4K`, o `request_log_url` do seu dashboard e o `type` do erro. Além disso o endpoint aceita qualquer `session_id` e não confere se pertence ao usuário logado.

**Correção.** Não repassar `sessionData` no corpo do erro (logar no servidor, devolver mensagem genérica) e conferir `client_reference_id` contra o usuário autenticado.

---

## 🟡 P2 — Médio

### P2-1. 🔴 Os contatos de emergência nunca chegavam à tela (reclassificado)

Dois defeitos que, juntos, escondiam por completo os telefones de ajuda de uma usuária em crise no plano gratuito:

1. **O banner de crise era código morto.** `renderCrisisAlert()` existia, mas nenhuma linha do aplicativo a chamava. O elemento `#crisisAlert` nasce com a classe `hidden` no HTML e nada jamais a removia — ou seja, o bloco com "CVV 188", "Chat CVV" e "SAMU 192" **nunca foi exibido para ninguém**.
2. **A carta de acolhimento era cortada em 120 caracteres** para quem não é Pro. No caminho de crise, o texto começa com *"Eu ouço você e a sua dor é real. Você não está sozinha neste momento. Por favor, ligue agora para o C…"* — o número do CVV caía exatamente dentro da parte borrada, sob o botão "🔒 Desbloquear Conselho Completo (Pro)".

Resultado prático: o app detectava a crise, montava a mensagem de socorro e não mostrava nada disso — oferecia um upgrade.

**Correção aplicada:** `renderCrisisAlert()` passou a ser chamada no início de `renderTriagedResults()`, e a carta nunca é truncada nem recebe oferta de upgrade quando `crisisDetected === true`. Verificado no navegador: com um relato de risco, o banner aparece com o 188 e a carta é exibida na íntegra (405 caracteres, sem paywall); com um relato comum, o banner some e o teaser volta ao normal.

### P2-2. Falsos positivos no detector de crise
`CRISIS_KEYWORDS` contém o termo solto `'matar'` (app.js:1082) e a checagem é `includes` puro: "matar a saudade", "matar aula", "matar o tempo" disparam o alerta de suicídio. O fallback heurístico (app.js:1580) também usa `'não aguento mais'`, comum em desabafo de cansaço. Usar limites de palavra e expressões mais específicas.

### P2-3. Bug de fuso horário bloqueia a usuária um dia antes
`getTodayDateString()` usa data **local**; a comparação do histórico usa `new Date(...).toISOString().split('T')[0]`, que é **UTC** (app.js:906). No Brasil (UTC-3), um registro feito às 22h do dia D vira `D+1` em UTC — e no dia D+1 o app considera que a usuária "já registrou hoje", bloqueando o dia inteiro. Como este é um app de uso noturno, o caso afetado é justamente o caso comum. Usar a mesma função local nos dois lados.

### P2-4. A nota de sono da noite mais recente nunca chega ao banco
`saveNightEntry()` guarda a entrada local sem `id` (o id é do Postgres e não é lido de volta no `insert`). Depois, `saveMorningRating()` faz `.update({sleep_mood}).eq('id', appState.history[0].id)` com `id` indefinido. O check-in matinal só persiste na nuvem para entradas já ressincronizadas. Usar `.insert(...).select().single()` e guardar o `id` retornado.

### P2-5. Histórico anterior ao login é descartado
`syncCloudHistory()` sobrescreve `appState.history` com o que veio da nuvem; e `saveNightEntry()` não grava nada para visitante. Quem escreve e depois cria a conta perde o registro. Fazer merge por data/conteúdo, ou migrar o rascunho local no primeiro login.

### P2-6. Promessa de tela x comportamento real
O card "Seu Diário Pessoal" (index.html:119) diz *"tudo o que você escreve fica salvo e guardado no seu diário"* — mas para visitante nada é salvo (comportamento intencional, por privacidade). O texto precisa dizer isso antes de a pessoa escrever, não depois.

### P2-7. Não existe cancelamento de assinatura
Não há portal do cliente Stripe nem qualquer fluxo de cancelamento no app. O CDC exige que o cancelamento seja tão simples quanto a contratação. A "Garantia incondicional de 7 dias" anunciada no modal também não tem procedimento descrito nos Termos (e convive com o direito de arrependimento do art. 49 do CDC).

### P2-8. Preços e regras do plano gratuito divergem entre README e app
| | README | Aplicação |
| :-- | :-- | :-- |
| Plano anual | R$ 147,00 | R$ 144,00 (`unitAmount: 14400`) |
| Plano gratuito | 3 encerramentos por semana | 1 por dia |
| Rotina gratuita | áudio de 3 min | 3 min (ok) |

Divergência de preço anunciado é risco de consumo — alinhar README, HTML e API.

### P2-9. Sem Content-Security-Policy
A `vercel.json` traz HSTS, X-Frame-Options, nosniff e Referrer-Policy (bom), mas não há CSP. Com `innerHTML` em várias telas e três CDNs externos (Supabase, Stripe, Google Fonts), uma CSP com allowlist é a rede de proteção que falta. Nota positiva: **o escape de HTML está consistente** — `escapeHTML()` é aplicado em todos os pontos onde texto da IA ou da usuária entra via `innerHTML`; não encontrei XSS explorável.

---

## ⚪ P3 — Baixo / dívida técnica

1. **Código duplicado:** `openModal`, `closeModal` e `closeAllModals` estão definidos duas vezes (app.js:264-278 e 2316-2330). A segunda definição vence; a primeira é morta.
2. **Código morto:** `STORAGE_KEY_ENTRIES`, `getTrialCount()` e `incrementTrialCount()` nunca são usados.
3. **Variável global implícita:** `btnSubmitLogin` (app.js:702) nunca é declarada — funciona só porque o navegador expõe `window.btnSubmitLogin` a partir do `id` do elemento. Frágil; declarar com `getElementById`.
4. **Acessibilidade:** os cabeçalhos de categoria têm `role="button" tabindex="0"` sem handler de teclado (Enter/Espaço não abrem a explicação); os modais não têm focus trap nem devolvem o foco ao fechar; feedbacks de auth não têm `aria-live`; `alert()` nativo é usado para eventos importantes (pagamento confirmado, cancelamento).
5. **Service Worker:** o `CACHE_NAME` e as querystrings `?v=` precisam ser bumpados manualmente em três arquivos a cada deploy; um esquecimento serve versão velha indefinidamente.
6. **`index.html` da raiz é inalcançável:** com `outputDirectory: "app"` na `vercel.json`, o redirect da raiz nunca é servido — só serve para abrir por `file://`. Sem prejuízo, mas confunde.
7. **Chave do Gemini na querystring** (`?key=...`) em vez do header `x-goog-api-key` — aparece em logs e traces.
8. **`sleepMood` inconsistente:** o Gemini devolve texto livre (recebi `"Reflexivo"`), enquanto o `CHECK` do banco só aceita `terrible|medium|great`. Hoje não quebra porque esse campo não é gravado no insert, mas é uma bomba-relógio.

---

## Nota positiva

Não há segredos vazados: o histórico do Git está limpo (nenhuma `sk_`, `whsec_` ou chave do Google commitada), a `anon key` do Supabase exposta no front é pública por design, e o RLS está habilitado nas duas tabelas com policies por `auth.uid()`. O `.gitignore` cobre `.env`. O tratamento de XSS é consistente. O prompt do Gemini tem instrução anti-injection e protocolo de crise explícito com CVV/SAMU.

---

## Status das correções (aplicadas em 17/08/2026)

| # | Achado | Status | Onde |
| :-- | :--- | :--- | :--- |
| P0-1 | App não inicializa (TDZ) | ✅ corrigido e verificado no navegador | `app/app.js` |
| P0-2 | Stripe em modo teste | ⚠️ código pronto; **troca das chaves é sua** | `app/config.js` + Vercel |
| P0-3 | Sem webhook | ✅ endpoint criado; **cadastro no painel é seu** | `api/webhook.js` |
| P0-4 | Paywall burlável | ✅ plano só do servidor + gatilho no banco | `app.js`, `schema.sql` |
| P1-1 | IA nunca usada (60s x 12s) | ✅ modelos fixos, orçamento de 22s, cliente 28s | `api/classify.js` |
| P1-2 | CORS `*` e APIs abertas | ✅ allowlist + JWT obrigatório em cobrança | `api/_lib/http.js` |
| P1-3 | LGPD e promessas falsas | ✅ termos reescritos, consentimento e exclusão | `index.html`, `schema.sql` |
| P1-4 | Pro perdido ao trocar de aparelho | ✅ política de INSERT + gravação pelo webhook | `schema.sql`, `api/webhook.js` |
| P1-5 | Vazamento no verify-session | ✅ erro genérico + checagem de dono | `api/verify-session.js` |
| P2-1 | Contatos de emergência ocultos | ✅ corrigido e verificado | `app/app.js` |
| P2-2 | Falso positivo de crise | ✅ expressões com limite de palavra | `app/app.js` |
| P2-3 | Fuso bloqueava um dia antes | ✅ data local nos dois lados | `app/app.js` |
| P2-4 | Nota do sono não sincronizava | ✅ `.select().single()` guarda o id | `app/app.js` |
| P2-5 | Histórico anterior ao login perdido | ✅ merge em vez de sobrescrita | `app/app.js` |
| P2-6 | Promessa de persistência falsa | ✅ aviso antes de escrever | `app/index.html` |
| P2-7 | Sem cancelamento | ✅ portal do Stripe no app | `api/portal.js` |
| P2-8 | Preços divergentes | ✅ preço único em `_lib/billing.js` | vários |
| P2-9 | Sem CSP | ✅ CSP com hash do JSON-LD | `vercel.json` |
| P3-1..8 | Dívida técnica e acessibilidade | ✅ todos | vários |

### Verificações feitas no navegador (servidor local)

- app inicializa sem erro no console (antes: `ReferenceError` na linha 64);
- navegação entre abas, modais, chips e botão de processar: funcionando;
- `Esc` fecha modais; `Enter`/`Espaço` abrem as explicações clínicas; `aria-expanded` alterna;
- fluxo de crise: banner com CVV visível e carta íntegra sem paywall;
- fluxo comum: banner oculto, teaser Pro presente, limite diário disparando;
- cadastro bloqueado sem o consentimento específico de dado sensível;
- avisos em toast estilizados corretamente (substituíram os `alert()`).
