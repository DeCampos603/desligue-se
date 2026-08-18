# Auditoria Técnica — Desligue-se

**Última revisão:** 18/08/2026 · versão `2.4.1`

Este documento tem duas partes: o histórico da auditoria de 17/08 (que originou
as correções estruturais) e a revisão de 18/08, feita após a reestruturação em
dois modos de interface.

---

## Parte II — Revisão de 18/08/2026

### Reestruturação: dois modos de interface

O site misturava apresentação e aplicativo na mesma tela. A home ficava
pendurada acima de qualquer aba, o menu do app aparecia para quem nunca tinha
entrado, e o cabeçalho tinha duas chamadas concorrentes ("Entrar" e "Começar
agora"). Agora existem dois estados excludentes:

| | Visitante | Autenticada |
| :-- | :-- | :-- |
| Apresentação (`#viewHome`) | única tela | escondida |
| Menu do aplicativo | escondido | visível |
| Barra inferior (celular) | escondida | visível |
| Ação do cabeçalho | "Entrar" (primária) | nome da conta (discreta) |

A regra vive em um lugar só: `switchView()` intercepta qualquer tentativa de
abrir uma tela do aplicativo sem sessão e converte em convite para entrar.
Não há caminho alternativo para burlar — nem pelos cards, nem pelo rodapé, nem
pela barra inferior.

**Rascunho preservado:** o texto escrito na caixa da home vai para
`sessionStorage` antes do login e é despejado no diário assim que a sessão
existe. Escrever e ser mandada para o cadastro deixou de custar o texto.

### Achados corrigidos nesta revisão

| # | Achado | Correção |
| :-- | :--- | :--- |
| A-1 | `/api/classify` aceitava chamadas anônimas — proxy do Gemini aberto na cota do projeto | Passou a exigir sessão (`requireUser`); limite agora é por usuária, não por IP |
| A-2 | Cabeçalho com duas ações de entrada competindo | Uma só, que muda de forma conforme o estado |
| A-3 | `renderPlanBadge` reescrevia o rótulo "Planos" do menu para "Premium" | Só o `title` reflete o estado da assinatura |
| A-4 | Seletores para elementos que não existem mais (`btnDismissPremium`, `btnMobHistory`, `btnMobMorning`, `btnMobPremium`) | Removidos, junto com o ouvinte órfão |
| A-5 | Caminho de limite diário para visitante, sem uso após a mudança | Removido: só a contagem do servidor vale |
| A-6 | Textos de "modo visitante" e "degustação" descrevendo comportamento que não existe mais, inclusive nos Termos | Reescritos |
| A-7 | Caixas de consentimento sem rótulo acessível | `aria-label` explícito nas duas |
| A-8 | 5 `console.log` de desenvolvimento no código publicado | Removidos |
| A-9 | CSS órfão (`.info-note-visitor`) após a remoção do elemento | Removido |

### Verificações automatizadas (repetíveis)

- IDs duplicados no HTML: **nenhum**
- `getElementById` sem elemento correspondente: **nenhum**
- Campos de formulário sem rótulo: **nenhum**
- Botões apenas com ícone e sem nome acessível: **nenhum**
- Funções declaradas e nunca chamadas: **nenhuma**
- `console.log` em produção: **0**

### Verificações no navegador

- Visitante: apresentação visível, menu e barra inferior ocultos, uma única ação de conta.
- Os 5 CTAs da apresentação abrem o login — nenhum leva a tela vazia.
- As 7 telas do aplicativo são inacessíveis sem sessão; a view ativa não muda.
- Autenticada: apresentação some, menu aparece com os 8 itens, rótulos corretos.
- Console sem erros em ambos os modos.

---

## Riscos conhecidos que permanecem

Estes não são defeitos de código, e sim decisões ou limites de infraestrutura
que valem revisão quando o produto crescer:

1. **Limite de requisições em memória.** Cada instância serverless tem o seu
   próprio contador, então o teto por minuto contém abuso casual, não abuso
   determinado. O limite que realmente vale é o do banco (1 registro/dia no
   plano gratuito). Bloqueio forte exige contador compartilhado (Vercel KV).
2. **Stripe em modo de teste.** Nenhuma cobrança real acontece até que a chave
   secreta e a publicável sejam trocadas juntas.
3. **Histórico local sem criptografia.** O diário é gravado em `localStorage`
   em texto claro. Quem tiver acesso ao aparelho desbloqueado lê o conteúdo.
   Criptografar no cliente exigiria uma chave derivada da senha — e quebraria a
   recuperação de conta. É um trade-off, não um esquecimento.
4. **Luz azul.** A paleta azul contraria a justificativa original do âmbar
   (supressão de melatonina). Decisão de produto registrada no README; a
   mitigação possível seria um seletor de tema âmbar para uso na cama.
5. **Vozes da narração variam por sistema.** A qualidade depende das vozes
   instaladas no aparelho. Voz neural consistente exigiria TTS pago no servidor.

---

## Parte I — Auditoria de 17/08/2026 (histórico)

A auditoria original encontrou 26 achados, entre eles quatro bloqueadores: o
aplicativo não inicializava em produção (erro de zona morta temporal), os
contatos de emergência nunca chegavam à tela, o Stripe estava em modo de teste
sem webhook, e o plano pago era concedido pelo próprio navegador.

Todos foram corrigidos. O detalhamento permanece no histórico do Git, nos
commits `780c9c8`, `8a4583a`, `53b031d` e `c1c6ae8`.

**Lição que virou regra no código:** o laço de inicialização dos módulos fica no
fim do `app.js`, depois de todas as constantes. O mesmo defeito de acesso
antecipado reapareceu três vezes durante o desenvolvimento; com o laço no fim,
a classe inteira de bug deixou de ser possível.
