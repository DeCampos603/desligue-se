# Auditoria Master — Desligue-se

**Data:** 18/08/2026 · versão auditada `3.2.1` · commit `7968a8d`
**Método:** leitura integral do repositório + medição no navegador (320px a 1440px), sem alterar código.

---

## 1. Resumo executivo

O Desligue-se **já não é uma landing page**, mas também **ainda não é um aplicativo profissional**. Ele está num meio-termo que é o pior lugar para se estar antes de um lançamento: a estrutura de aplicativo existe (12 telas, troca sem scroll, player, modo sono), mas convive com resíduos de página, com uma base de código que não se sustenta em manutenção, e com quatro falhas que quebram promessas feitas ao usuário pagante.

Os três problemas que mais atrapalham, em ordem:

1. **A base de código é um arquivo só.** `app.js` tem **5.564 linhas e 148 funções dentro de um único `DOMContentLoaded`**. Não há módulos, não há build, não há teste. Todo bug recente desta iteração — sete telas apagadas, variável inexistente derrubando o login, `</div>` a mais vazando o diário para todas as telas — é consequência direta dessa arquitetura, não de descuido pontual. Enquanto isso não mudar, cada correção continuará tendo chance alta de criar duas.
2. **O produto não tem memória.** Recarregar a página devolve a pessoa ao início; não há rota, hash, histórico do navegador nem estado salvo. O áudio para. Num app de sono usado no celular, onde a tela apaga e a aba é descartada pelo sistema, isso é grave.
3. **O desktop é o mobile esticado.** 832px de conteúdo em 1440px de tela (58%), lista de escolhas em coluna única de 795px de largura. É exatamente o que se pediu para evitar.

**Score geral: 5,4/10.** Detalhe na seção 18.

---

## 2. Entendimento do produto

Aplicativo web de higiene do sono, em português, focado em descompressão mental noturna com base em TCC-I.

**Stack:** front-end estático sem framework e **sem nenhuma dependência** (`package.json` tem zero `dependencies`), servido pela Vercel. Back-end são 9 funções serverless em Node puro. Supabase para autenticação e Postgres com RLS; Stripe para assinatura; Google Gemini para a IA.

**Ausência de build é uma decisão defensável** para um projeto deste tamanho: elimina toolchain, elimina quebra de dependência, o deploy é instantâneo. O preço é não ter módulos, minificação nem tree-shaking — e esse preço já venceu.

| Camada | Arquivo | Tamanho |
| :-- | :-- | --: |
| Interface | `app/index.html` | 92 KB · 1.900 linhas |
| Design system | `app/styles.css` | 100 KB · 4.211 linhas |
| Camada de app | `app/sistema.css` | 18 KB · 558 linhas |
| Lógica | `app/app.js` | **233 KB · 5.564 linhas** |
| **Primeira carga** | | **449 KB sem compressão** |

**Funcionalidades reais:** diário com triagem por IA + carta de acolhimento; conversa com IA (Pro); 6 paisagens sonoras sintetizadas em Web Audio; 3 histórias originais com narração por síntese de fala; ritual de respiração 4-7-8; check-in matinal com horários; métricas de ritmo de sono; histórico; assinatura com portal de cancelamento; exclusão de conta (LGPD).

**O que é genuinamente bom e deve ser preservado:** o áudio sintetizado (sem licença, sem download, nunca se repete) é uma decisão de produto acima da média; o protocolo de crise com CVV é sério e está no lugar certo; a segurança do plano pago (só o webhook escreve, com gatilho no Postgres) está bem resolvida; e não há segredo no front-end.

---

## 3. Diagnóstico: landing page vs aplicativo

**Veredito: 65% aplicativo, 35% página.**

### O que já é aplicativo

- Navegação troca telas de verdade (`switchView`, `app.js:559`) — **nenhum item de menu faz scroll**, o que era a suspeita principal do briefing e não se confirmou.
- Dois modos excludentes: visitante vê só apresentação, autenticada vê só o app.
- Player persistente entre telas e Modo Sono em tela cheia.
- Navegação inferior fixa no celular.

### O que ainda é página

| Resíduo | Onde | Por que atrapalha |
| :-- | :-- | :-- |
| **6 telas ainda têm `card-hero`** | `index.html` | Título grande + subtítulo + badge é cabeçalho de página. Numa tela de app, o menu já diz onde a pessoa está. Já removi de Chat e Diário; faltam Sons, Histórias, Check-in, Histórico, Ritmo, Configurações. |
| **Rodapé institucional completo** | `index.html`, 4 colunas | Escondido no modo app (`sistema.css`), mas 60 linhas de HTML carregadas em toda visita. |
| **`viewHome` (apresentação) sempre no DOM** | `index.html` | ~200 linhas de marketing baixadas por quem já é usuária. |
| **7 modais no DOM permanentemente** | `index.html` | Termos de uso sozinho tem ~90 linhas. |
| **1.361 nós no DOM inicial** | medido | Nada é carregado sob demanda. |

### O teste decisivo

Recarregar a página no meio de uma sessão devolve tudo ao início: tela inicial, áudio parado, conversa preservada só por sorte (localStorage). **Aplicativo tem estado; página não tem.** Hoje o Desligue-se não tem.

---

## 4. Auditoria UX

### Navegação — 🟡

**Funciona, mas o usuário não sabe onde está.** Não há indicador de tela ativa consistente: o menu lateral marca (`marcarItemAtivoNoMenu`), a barra inferior marca, mas os atalhos do cabeçalho e o próprio conteúdo não trazem título de contexto depois que removi os `card-hero` do Chat e do Diário. Numa tela sem cabeçalho e sem breadcrumb, o único sinal é um item de 12px na barra inferior.

**Problemas concretos:**

| # | Problema | Severidade |
| :-- | :-- | :-- |
| N-1 | **Botão voltar do navegador não funciona.** Nenhuma troca de tela usa `history.pushState`. No Android, o botão físico "voltar" fecha o app inteiro em vez de voltar uma tela. | 🔴 CRÍTICO |
| N-2 | **Não há rota nem hash.** Impossível recarregar na tela em que se estava, compartilhar link de uma seção ou usar favoritos do navegador. | 🔴 CRÍTICO |
| N-3 | **Três caminhos para a mesma tela** (atalho no cabeçalho, menu lateral, barra inferior) com rótulos diferentes: "Início" no cabeçalho e na barra, "Início" no menu, mas a tela se chama `viewDashboard` no código. | 🟡 MÉDIO |
| N-4 | `div.brand-group` é clicável mas não é `<button>` nem `<a>` — inacessível por teclado. | 🟠 ALTO |

### Hierarquia — 🟢 na Home, 🟠 no resto

A Home está **certa**: uma pergunta, cinco escolhas, nenhum número. É a melhor tela do produto hoje.

O resto não acompanhou. A tela de Sons abre com badge "Paisagens Sonoras" + `<h1>` + parágrafo de duas linhas explicando que o som é sintetizado — **informação de vendedor, não de usuário sonolento**. Ninguém às 23h47 precisa saber que o áudio é gerado em tempo real.

### Fricção — contagem real de cliques

| Objetivo | Cliques hoje | Ideal |
| :-- | --: | --: |
| Abrir → ouvir chuva | 3 (Início → Sons → card) | 2 |
| Abrir → respirar 3 min | 3 (Início → Respirar → Começar) | 2 |
| Abrir → escrever no diário | 2 + digitar | 2 ✅ |
| Abrir → configurar timer 30 min | 4 (som → mini-player → Modo Sono → timer) | 3 |
| **Retomar o que ouvia ontem** | **impossível** | 1 |

Não existe "continuar de onde parou", nem favoritos, nem histórico de reprodução.

---

## 5. Auditoria UI

### O que está inconsistente

**Dois sistemas visuais convivendo.** O design antigo (`styles.css`, 4.211 linhas, classes em inglês: `step-card`, `badge-tag`, `cat-item`) e o novo (`sistema.css`, 558 linhas, classes em português: `tela`, `escolha`, `aba`). Ambos ativos ao mesmo tempo, em telas diferentes. A tela de Sons e a tela de Início parecem de produtos diferentes.

| Sintoma | Medida |
| :-- | :-- |
| `!important` no CSS | **29 ocorrências** — sinal de guerra de especificidade |
| Blocos `:root` | **4** (3 em `styles.css`, 1 em `sistema.css`) |
| Estilos inline no HTML | **22 elementos** com `style=` |
| Seletores duplicados nos dois arquivos | 2 (`.prompt-chips`, `.title-input-wrapper`) |

**Raios de borda sem sistema:** `--radius-sm: 8px`, `--radius-md: 14px`, `--radius-lg: 22px`, `--raio-suave: 18px`, mais valores soltos de 10px, 12px, 16px e 999px. São **oito raios diferentes** em uso.

**Duas famílias tipográficas** (Playfair Display + Plus Jakarta Sans) com **9 pesos carregados** do Google Fonts. Para um app noturno, uma família com 3 pesos resolveria.

### Identidade — 🟠

Cai parcialmente no clichê que o briefing pediu para evitar. O azul (#3B82F6) é o azul padrão do Tailwind — a cor mais genérica de SaaS que existe hoje. A lua aparece no logotipo, no favicon e em ícones. As artes SVG que criei para os sons são o elemento com mais personalidade do produto, e são justamente as menos aproveitadas (aparecem em miniatura de 104px).

Há uma ironia registrada no próprio README: a paleta era âmbar por decisão científica (luz azul suprime melatonina) e virou azul por decisão estética. **Um app de sono cuja identidade contraria a própria tese é uma fragilidade de posicionamento**, não só de design.

---

## 6. Auditoria para experiência noturna

> **"Eu conseguiria usar isso às 23h47, cansado, sem querer pensar?"**
> **Resposta: na Home e no Modo Sono, sim. No resto, não.**

### O que passa no teste

- Home: uma pergunta, cinco alvos de 5rem de altura, sem números.
- Modo Sono: fundo #070C16, pulso de 7s, quatro controles. É a melhor tela do produto.
- Transições de 520ms, sem bounce, `prefers-reduced-motion` respeitado.
- Contraste medido, todos acima do mínimo AA:

| Token | Contraste sobre o fundo |
| :-- | --: |
| `--text-main` | 15,93:1 |
| `--text-muted` | 7,16:1 |
| `--text-dim` | 5,37:1 |
| `--acento` | 5,09:1 |

### O que reprova

| # | Problema | Severidade |
| :-- | :-- | :-- |
| S-1 | **Nenhum controle de brilho.** Às 23h47, no escuro, mesmo #0B1220 queima a retina. Falta um modo "luz mínima" que reduza a luminância geral. | 🟠 ALTO |
| S-2 | **Tela do celular apaga e o áudio para.** Não há Media Session API nem `wake lock`. A pessoa não pode bloquear o telefone e dormir ouvindo — que é o fluxo principal do produto. | 🔴 CRÍTICO |
| S-3 | **18 alvos de toque abaixo de 44px.** Os piores: as carinhas de humor da Home são **32×32px**; links do rodapé, 33×24px. | 🟠 ALTO |
| S-4 | **Excesso de texto nas telas internas.** A tela de Sons tem 3 blocos de texto antes do primeiro card. | 🟡 MÉDIO |
| S-5 | **O diário exige digitar** — a funcionalidade mais anunciada é a que mais exige energia cognitiva. Há entrada por voz, mas ela está escondida atrás de um botão pequeno. | 🟡 MÉDIO |

**S-2 é o achado mais importante desta auditoria.** Todo o Modo Sono foi construído para que a pessoa largue o telefone — e o sistema operacional interrompe o áudio quando a tela apaga. A promessa central do produto não se cumpre no celular.

---

## 7. Auditoria dos fluxos

### Fluxo 1 — Ouvir um som até dormir 🔴

```
Abrir → Início → Sons → card → mini-player → Modo Sono → timer → bloquear tela
                                                                       ↓
                                                          ÁUDIO PARA (S-2)
```
**Ponto de abandono:** o último passo, que é o objetivo inteiro.

### Fluxo 2 — Descarregar a mente 🟡

```
Abrir → Início → "Tirar da cabeça" → digitar → Organizar → [IA 3-8s] → resultado → ritual → boa noite
```
Funciona. Dois problemas: não há indicação de progresso durante a espera da IA além de um orbe pulsante sem texto de estado; e o resultado abre com 5 categorias expandidas de uma vez — muita informação para quem já está com sono.

### Fluxo 3 — Ouvir história 🟠

```
Início → Histórias → card → leitor → Narrar
```
A narração depende de vozes instaladas no aparelho. Em Android sem voz pt-BR, o botão "Narrar" existe e não produz nada de útil — **não há verificação prévia nem aviso**.

### Fluxo 4 — Assinar 🟡

```
Planos → escolher → Stripe → volta → verify-session → Pro liberado
```
Robusto depois das últimas correções (ativação não depende mais do webhook). Mas o checkout embutido tem fallback para o hospedado, e **os dois caminhos ficaram no código** — dois fluxos de pagamento para manter.

### Fluxo 5 — Voltar ao app no dia seguinte 🔴

```
Abrir → Início → ...e nada indica o que fazer diferente de ontem
```
Sem histórico de reprodução, sem favoritos, sem "continuar", sem sugestão baseada no uso. **Não há nenhum mecanismo de retorno.**

---

## 8. Auditoria do player

### Estado atual

| Recurso | Situação |
| :-- | :-- |
| Play/pause | ✅ suspende o contexto de áudio (sem corte seco) |
| Volume | ✅ com rampa de 0,25s |
| Timer | ✅ 15/30/45/60/90/∞ com esmaecimento de 20s |
| Persistência entre telas | ✅ mini-player |
| Modo tela cheia | ✅ Modo Sono |
| **Progresso** | ❌ inexistente (sons são infinitos; para histórias, faria sentido) |
| **Avançar/retroceder** | ❌ inexistente |
| **Áudio em segundo plano** | ❌ **para quando a tela apaga** |
| **Controle na tela de bloqueio** | ❌ sem Media Session API |
| **Sobrevive a recarga** | ❌ para tudo |
| **Misturar sons** | ❌ um por vez (chuva **ou** lareira, nunca os dois) |

### Problema estrutural: dois players no DOM

Medido no navegador: **`soundPlayerBar` (antigo) e `miniPlayer` (novo) coexistem**. O antigo está oculto, mas:

- os elementos `sleepTimer`, `soundVolume`, `btnStopSound`, `playerIcon`, `playerTitle`, `playerSubtitle` continuam no HTML;
- `app.js:4726-4727` ainda registra ouvintes neles;
- `styles.css` mantém ~11 regras do player antigo.

É código morto ativo — o pior tipo, porque parece vivo.

> **"Depois de iniciar o áudio, dá para largar o celular e dormir?"**
> **Não.** E esse é o motivo pelo qual o produto ainda não pode ser lançado como app de sono.

---

## 9. Auditoria mobile

Medido a 320px e 375px.

**O que está certo:** sem rolagem horizontal em nenhuma largura; barra inferior com 5 itens de 64px cada a 320px; `env(safe-area-inset-bottom)` respeitado; menu lateral com 88vw.

**O que está errado:**

| # | Problema | Medida | Severidade |
| :-- | :-- | :-- | :-- |
| M-1 | Carinhas de humor | 32×32px (mínimo 44) | 🟠 ALTO |
| M-2 | Botões de ação secundária | 94×36px, 108×37px, 95×31px | 🟡 MÉDIO |
| M-3 | Links do rodapé | 33×24px | 🟡 MÉDIO |
| M-4 | Conversa ocupa 57% da tela | o resto é composer + sugestões + aviso legal | 🟡 MÉDIO |
| M-5 | Sem `100dvh` em todos os cálculos | a barra do navegador móvel corta conteúdo | 🟡 MÉDIO |

---

## 10. Auditoria desktop

**Medido a 1440px: conteúdo com 832px, ou 58% da janela. 297px de margem vazia de cada lado.**

A lista de escolhas da Home fica em **coluna única de 795px de largura** — cinco cards larguíssimos e baixos, empilhados. É a definição de mobile esticado.

O que o desktop deveria fazer e não faz:
- grade de 2 ou 3 colunas para as escolhas e para as bibliotecas;
- navegação lateral permanente em vez de barra flutuante (o espaço existe e está vazio);
- player em coluna fixa à direita, permitindo navegar enquanto se vê o que toca;
- Modo Sono usando a tela inteira com a arte em grande, em vez de um pulso de 190px centralizado numa tela de 1440px.

---

## 11. Auditoria de acessibilidade

| # | Item | Situação | Severidade |
| :-- | :-- | :-- | :-- |
| A-1 | Contraste | ✅ tudo acima de 5:1 | — |
| A-2 | Anel de foco | ✅ `:focus-visible` global | — |
| A-3 | Rótulos de formulário | ✅ nenhum campo sem label | — |
| A-4 | **4 `<h1>` na mesma tela** | `viewNights` tem o próprio + 3 dos painéis movidos | 🟠 ALTO |
| A-5 | **`div` clicável sem semântica** | `.brand-group`, `.audio-toggle-btn` | 🟠 ALTO |
| A-6 | Alvos < 44px | 18 elementos | 🟠 ALTO |
| A-7 | Modais sem `aria-modal` consistente | 7 modais, marcação irregular | 🟡 MÉDIO |
| A-8 | Anúncio de troca de tela | leitor de tela não avisa que a tela mudou | 🟡 MÉDIO |
| A-9 | Cor como único indicador | aba ativa e duração selecionada distinguem-se só por cor de fundo | 🟡 MÉDIO |

---

## 12. Auditoria de performance

### Medições

| Métrica | Valor |
| :-- | --: |
| Primeira carga (sem compressão) | **449 KB** |
| `app.js` | **233 KB** |
| `styles.css` | **100 KB** |
| DOM interativo | 966 ms |
| DOM completo | 2.277 ms |
| Nós no DOM | 1.361 |
| Requisições | 10 |

### Gargalos reais

| Arquivo | Problema | Impacto | Solução |
| :-- | :-- | :-- | :-- |
| `app/app.js` | 233 KB não minificados, sem divisão. Inclui 3 histórias completas em texto, 6 geradores de áudio, 9 artes SVG e todo o motor de triagem local — tudo baixado mesmo por quem só quer ouvir chuva | ~700ms de parse em celular mediano | Dividir em módulos ES e carregar histórias/sons sob demanda |
| `app/styles.css` | 100 KB, com estilos de 2 sistemas visuais + player morto | Bloqueia a primeira pintura | Remover o sistema antigo; ~40% é morto |
| Google Fonts | 2 famílias, 9 pesos, requisição bloqueante | +72ms + FOUT | Reduzir a 3 pesos ou hospedar local |
| `js.stripe.com` | **416ms**, carregado em toda visita | Atrasa tudo | Carregar só ao abrir o checkout |
| `index.html` | 92 KB com 7 modais e a apresentação sempre presentes | +DOM, +memória | Renderizar modais sob demanda |
| `sw.js` | Cacheia tudo com `?v=`, exigindo bump manual em 3 arquivos | Risco de servir versão velha | Gerar a versão no build |

---

## 13. Auditoria de código

### O problema central

```
app/app.js — 5.564 linhas · 148 funções · 1 único DOMContentLoaded · 137 addEventListener
```

Tudo vive num escopo só. Isso produz três consequências mensuráveis, todas observadas nesta iteração:

1. **Ordem de declaração vira armadilha.** Constantes declaradas no fim são lidas por funções chamadas no meio. Aconteceu 3 vezes (`CATALOGO_SONS`, `HISTORIAS`, `narrador`), com o mesmo `ReferenceError`. A solução aplicada — mover o laço de inicialização para o fim — é um curativo, não uma cura.
2. **Erros silenciosos.** 56 blocos `try/catch`, muitos engolindo exceções sem reportar. Foi assim que `logada is not defined` derrubou o login inteiro sem aparecer como erro vermelho.
3. **Impossível testar.** Sem módulos e sem exportações, não há como testar `normalizarHistorico`, `calcularRitmo` ou `descreverTempoRestante` isoladamente. Todas foram verificadas reimplementando a lógica por fora — o que valida o raciocínio, não o código publicado.

### Outros achados

| Achado | Medida |
| :-- | :-- |
| **Idiomas misturados** | 69 funções em inglês, 43 em português, no mesmo arquivo |
| `innerHTML =` com dados | 57 ocorrências (escapadas, mas frágeis) |
| `console.log` em produção | 0 ✅ |
| TODO/FIXME/HACK | 0 ✅ |
| Código morto | player antigo (JS + HTML + CSS), `stepGoodNight`, `modalTrialBlock`, `viewHome` no modo app |
| Duplicação | dois fluxos de checkout; dois sistemas de CSS; dois players |
| Estilos inline | 22 elementos |

### O que está bem feito

O back-end. Os 9 endpoints em `api/` são pequenos, com responsabilidade única, comentados com o porquê das decisões, e a segurança está correta: `requireUser`/`requireProUser` validam no servidor, o plano só é escrito pelo webhook com service role, e um gatilho no Postgres reverte tentativas do cliente. `_lib/http.js`, `_lib/billing.js` e `_lib/gemini.js` são exemplos de como o front-end deveria estar organizado.

---

## 14 e 15. O que remover

Remover é metade do trabalho aqui.

| Remover | Onde | Por quê |
| :-- | :-- | :-- |
| **Player antigo inteiro** | `index.html`, `app.js:4726-4727`, `styles.css` (11 regras) | Código morto que parece vivo |
| **`card-hero` das 6 telas restantes** | `index.html` | Cabeçalho de página dentro de app |
| **Texto "os sons são gerados aqui no seu aparelho"** | tela de Sons | Argumento de venda numa tela de uso |
| **Rodapé institucional de 4 colunas** | `index.html` | 60 linhas para quem nunca as verá |
| **`stepGoodNight`** | `index.html` | Tela de "boa noite" que o Modo Sono tornou redundante |
| **`modalTrialBlock`** | `index.html` | Sobra do modelo de degustação que não existe mais |
| **Um dos dois fluxos de checkout** | `create-subscription.js` ou `checkout.js` | Manter dois caminhos de pagamento dobra a superfície de falha |
| **Um dos dois sistemas de CSS** | `styles.css` vs `sistema.css` | ~40% de `styles.css` é do design anterior |
| **Playfair Display ou 6 dos 9 pesos** | `index.html` | Duas famílias e nove pesos para um app de 12 telas |
| **Badges "Pro" espalhados** | várias telas | Já ocultos para assinantes, mas ainda ruído para quem não é |

---

## 16. O que melhorar (além de remover)

1. **Rotas e histórico** — `history.pushState` por tela, hash ou path. Resolve N-1, N-2 e a recarga.
2. **Áudio em segundo plano** — Media Session API + `navigator.wakeLock`. Resolve S-2, o problema mais grave.
3. **Persistência de sessão** — lembrar tela, som tocando e posição.
4. **Modo luz mínima** — um toque reduz a luminância global.
5. **Continuar de onde parou + favoritos** — o único mecanismo de retenção coerente com um app de sono.
6. **Mistura de sons** — chuva + lareira ao mesmo tempo. O motor Web Audio já suporta; é diferencial real e barato.
7. **Layout de desktop próprio** — grade, navegação lateral, player em coluna.
8. **Verificação de voz antes de oferecer narração**.
9. **Onboarding de 3 telas** na primeira sessão.
10. **Identidade visual própria** — sair do azul Tailwind e aproveitar as artes SVG em tamanho grande.

---

## 17. Matriz de problemas

| # | Problema | Categoria | Sev. | Impacto | Arquivo/Local | Solução |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Áudio para quando a tela apaga | Funcionalidade | 🔴 | Quebra o fluxo principal do produto | `app.js` (player) | Media Session API + wakeLock |
| 2 | Sem rotas; recarregar volta ao início | Navegação | 🔴 | Perde contexto, sessão e áudio | `switchView` `app.js:559` | `history.pushState` + restaurar no load |
| 3 | Botão voltar do Android fecha o app | Navegação | 🔴 | Abandono imediato | idem | `popstate` |
| 4 | Nenhum mecanismo de retorno | Retenção | 🔴 | Sem motivo para voltar amanhã | produto | Continuar + favoritos |
| 5 | `app.js` monolítico de 5.564 linhas | Código | 🔴 | Cada correção gera regressão | `app/app.js` | Módulos ES |
| 6 | Dois players coexistindo | Código | 🟠 | Manutenção dupla, bugs fantasma | `index.html`, `app.js:4726` | Remover o antigo |
| 7 | Desktop usa 58% da tela | Desktop | 🟠 | Parece protótipo | `sistema.css` | Grade e sidebar |
| 8 | 18 alvos < 44px | Acessibilidade | 🟠 | Erro de toque com sono | vários | Mínimo 44×44 |
| 9 | Sem controle de brilho | Sono | 🟠 | Ofusca no escuro | — | Modo luz mínima |
| 10 | 4 `<h1>` em `viewNights` | Acessibilidade | 🟠 | Leitor de tela confuso | `index.html` | 1 `h1` + `h2` nos painéis |
| 11 | `div` clicável sem semântica | Acessibilidade | 🟠 | Inacessível por teclado | `.brand-group` | `<button>` |
| 12 | Narração sem verificar voz | Funcionalidade | 🟠 | Botão que não faz nada | `narrarHistoria` | Checar `getVoices()` |
| 13 | Dois sistemas de CSS | UI | 🟠 | Telas parecem produtos diferentes | `styles.css`+`sistema.css` | Unificar |
| 14 | 233 KB de JS sem divisão | Performance | 🟠 | ~700ms de parse no celular | `app.js` | Carregar sob demanda |
| 15 | Stripe.js em toda visita (416ms) | Performance | 🟡 | Atrasa a primeira pintura | `index.html` | Carregar no checkout |
| 16 | 6 telas com `card-hero` | UX | 🟡 | Linguagem de página | `index.html` | Remover |
| 17 | 29 `!important` | UI | 🟡 | Guerra de especificidade | CSS | Refatorar cascata |
| 18 | Sem estado de carregamento na IA | UX | 🟡 | Parece travado por 3-8s | `stepLoading` | Texto de progresso |
| 19 | Resultado abre 5 categorias | UX | 🟡 | Excesso de informação | `renderTriagedResults` | Recolher por padrão |
| 20 | Conversa em 57% da tela | Mobile | 🟡 | Pouca área de leitura | `sistema.css` | Reduzir moldura |
| 21 | Dois fluxos de checkout | Código | 🟡 | Superfície dupla | `api/` | Escolher um |
| 22 | 8 raios de borda distintos | UI | 🟢 | Inconsistência sutil | CSS | 3 raios |
| 23 | 2 fontes, 9 pesos | Performance | 🟢 | +requisição | `index.html` | 1 família, 3 pesos |
| 24 | Cor como único indicador | Acessibilidade | 🟢 | Daltonismo | abas, durações | + ícone ou peso |

---

## 18. Scores

| Dimensão | Nota | Justificativa |
| :-- | :--: | :-- |
| UX | 6,0 | Home excelente; telas internas ainda com linguagem de página; fricção aceitável |
| UI | 5,0 | Dois sistemas visuais convivendo; 29 `!important`; 8 raios diferentes |
| Navegação | 4,0 | Troca telas corretamente, mas sem rota, sem voltar, sem recarga |
| Mobile | 6,5 | Sem overflow, barra inferior boa; 18 alvos pequenos |
| Desktop | 3,0 | Mobile esticado; 58% da tela desperdiçada |
| Performance | 4,5 | 449 KB, 233 KB de JS, Stripe bloqueando 416ms |
| Acessibilidade | 6,0 | Contraste e foco corretos; semântica e alvos falham |
| Arquitetura | 3,5 | Back-end exemplar; front-end monolítico de 5.564 linhas |
| Funcionalidades | 7,0 | Muitas, reais e funcionando; áudio em segundo plano é a falha grave |
| Clareza | 6,5 | Home clara; telas internas explicam demais |
| Experiência noturna | 6,0 | Modo Sono ótimo; falta brilho e áudio com tela apagada |
| Sensação de aplicativo | 5,5 | Estrutura certa, memória ausente |

### **SCORE GERAL: 5,4 / 10**

**Por que não é mais.** Um app de sono é julgado por uma única pergunta: *dá para começar e dormir?* Hoje não dá — o áudio para quando a tela apaga, e recarregar perde tudo. Some a isso um front-end de 5.564 linhas num arquivo só, que já produziu três regressões graves em uma semana, e um desktop que é o mobile esticado.

**Por que não é menos.** O produto tem funcionalidades reais e diferenciadas (áudio sintetizado, histórias originais, triagem por IA), segurança de cobrança bem resolvida, protocolo de crise sério, contraste correto e uma tela inicial que acerta o tom. A fundação existe; o acabamento e a arquitetura do front-end não.

---

## 19. Comparação conceitual

Referências de qualidade (Calm, Headspace, Endel, Portal, Pillow):

| Prática do mercado | Desligue-se |
| :-- | :-- |
| Áudio toca com a tela bloqueada, com controles na tela de bloqueio | ❌ para ao apagar |
| Retomar exatamente de onde parou | ❌ |
| Favoritos / "meus sons" | ❌ |
| Mistura de camadas sonoras | ❌ (um por vez) |
| Download para uso offline | ❌ (mitigado: áudio é sintetizado) |
| Onboarding curto que personaliza | ❌ |
| Rotina/lembrete de hora de dormir | ❌ |
| Sleep timer | ✅ (bom) |
| Modo tela cheia minimalista | ✅ (bom) |
| Diário integrado com IA | ✅ **acima do mercado** |
| Áudio gerado, nunca repetido | ✅ **diferencial real** |

**Onde o Desligue-se pode ganhar:** o diário com triagem e a IA que conversa não existem nos concorrentes de sono; e o áudio sintetizado resolve custo de licenciamento e repetição de uma vez. **Onde perde feio:** o básico de player de áudio em celular.

---

## 20. Roadmap

### FASE 1 — CRÍTICO (o que impede lançar)

| Item | Solução | Esforço | Impacto |
| :-- | :-- | :-- | :-- |
| Áudio em segundo plano | Media Session API + `navigator.wakeLock` | 1-2 dias | Cumpre a promessa central |
| Rotas e recarga | `pushState` + restauração | 1 dia | App passa a ter memória |
| Voltar do Android | `popstate` | 2 horas | Evita abandono |
| Retomar reprodução | Persistir o que tocava | meio dia | Continuidade |

### FASE 2 — UX

| Item | Solução | Esforço | Impacto |
| :-- | :-- | :-- | :-- |
| Remover `card-hero` das 6 telas | Excluir e reduzir texto | meio dia | Menos leitura à noite |
| Favoritos + continuar | Nova área e persistência | 2 dias | Único vetor de retenção |
| Modo luz mínima | Alternador de luminância | meio dia | Conforto real no escuro |
| Alvos de toque ≥44px | Ajuste de CSS | 2 horas | Menos erro com sono |
| Onboarding de 3 telas | Primeira sessão | 1 dia | Descoberta |

### FASE 3 — UI

| Item | Solução | Esforço | Impacto |
| :-- | :-- | :-- | :-- |
| Unificar os dois sistemas de CSS | Migrar tudo para a camada nova | 2-3 dias | Coerência visual |
| Layout de desktop | Grade + sidebar + player lateral | 2 dias | Sai do mobile esticado |
| Sistema de raios e tipografia | 3 raios, 1 família, 3 pesos | meio dia | Acabamento |
| Identidade própria | Sair do azul padrão; artes SVG em destaque | 2 dias | Diferenciação |

### FASE 4 — PERFORMANCE

| Item | Solução | Esforço | Impacto |
| :-- | :-- | :-- | :-- |
| Modularizar `app.js` | Módulos ES + carga sob demanda | 3-4 dias | Fim das regressões |
| Stripe sob demanda | Carregar no checkout | 1 hora | −416ms |
| Limpar CSS morto | Remover player antigo e sistema anterior | meio dia | −40% de CSS |
| Modais sob demanda | Renderizar ao abrir | 1 dia | −DOM |

### FASE 5 — POLIMENTO

Anúncio de troca de tela para leitores, indicadores que não dependem só de cor, progresso na narração, mistura de sons, estados de carregamento com texto, microinterações do player.

---

## Top 10 mudanças que mais aumentam a qualidade

1. **Áudio tocando com a tela bloqueada** (Media Session + wakeLock) — sem isso não é app de sono.
2. **Rotas com histórico e recarga** — sem isso não é aplicativo.
3. **Modularizar `app.js`** — sem isso toda correção arrisca uma regressão.
4. **Retomar de onde parou + favoritos** — sem isso não há motivo para voltar amanhã.
5. **Remover o player antigo e o CSS do design anterior** — elimina bugs fantasma e 40% do CSS.
6. **Layout próprio de desktop** — hoje são 58% de tela desperdiçada.
7. **Remover `card-hero` e o texto explicativo das telas internas** — menos leitura à noite.
8. **Modo luz mínima** — o produto é usado no escuro.
9. **Alvos de toque ≥44px** — 18 elementos falham hoje.
10. **Identidade visual própria** — sair do azul mais genérico do mercado.

**Fases 1 e 2 antes de qualquer lançamento comercial.** As fases 3 a 5 podem acontecer com o produto no ar.
