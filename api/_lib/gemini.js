/**
 * DESLIGUE-SE — Cliente do Google Gemini compartilhado
 *
 * Um único lugar concentra: lista de modelos, orçamento de tempo, timeout por
 * tentativa e o envio da chave no cabeçalho. Antes essa lógica vivia só dentro
 * de classify.js e teria de ser copiada para o chat — cópia que envelheceria
 * mal, como já aconteceu com os preços dos planos.
 */

const MODELOS = (process.env.GEMINI_MODELS || 'gemini-flash-latest,gemini-3.5-flash,gemini-2.5-flash')
  .split(',')
  .map(m => m.trim())
  .filter(Boolean);

const TIMEOUT_POR_MODELO_MS = 11000;

async function chamarModelo(modelo, apiKey, corpo, timeoutMs) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
      {
        method: 'POST',
        signal: controlador.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(corpo)
      }
    );

    if (!resposta.ok) {
      const erro = await resposta.text();
      throw new Error(`status ${resposta.status}: ${erro.slice(0, 300)}`);
    }

    return await resposta.json();
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Extrai o texto da resposta.
 *
 * Os modelos da geracao 3 devolvem varias "parts", alguma delas marcadas como
 * `thought` (raciocinio interno, que nao deve ser mostrado). Ler apenas
 * parts[0].text — como fazia antes — devolvia string vazia sempre que a
 * primeira parte era de raciocinio, e a IA parecia estar fora do ar.
 */
function extrairTexto(dados) {
  const candidato = dados?.candidates?.[0];
  const partes = candidato?.content?.parts || [];

  const texto = partes
    .filter(p => p && typeof p.text === 'string' && p.thought !== true)
    .map(p => p.text)
    .join('')
    .trim();

  return { texto, motivoDeParada: candidato?.finishReason };
}

/**
 * Percorre os modelos em ordem de preferência até um responder.
 * Devolve { texto, modelo } ou lança quando o orçamento acabar.
 */
async function gerarTexto({ contents, generationConfig, systemInstruction, orcamentoMs = 22000 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const erro = new Error('GEMINI_API_KEY não configurada.');
    erro.semChave = true;
    throw erro;
  }

  const inicio = Date.now();
  const erros = [];

  for (const modelo of MODELOS) {
    const restante = orcamentoMs - (Date.now() - inicio);
    if (restante < 3000) break;

    try {
      const corpo = { contents, generationConfig };
      if (systemInstruction) {
        corpo.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const dados = await chamarModelo(
        modelo,
        apiKey,
        corpo,
        Math.min(TIMEOUT_POR_MODELO_MS, restante)
      );

      const { texto, motivoDeParada } = extrairTexto(dados);
      if (!texto) {
        // MAX_TOKENS aqui costuma significar que o raciocinio interno consumiu
        // todo o orcamento antes de sobrar espaco para a resposta.
        erros.push(`${modelo}: resposta vazia (motivo: ${motivoDeParada || 'desconhecido'})`);
        continue;
      }

      return { texto, modelo };
    } catch (err) {
      const descricao = `${modelo}: ${err.name === 'AbortError' ? 'tempo esgotado' : err.message}`;
      erros.push(descricao);
      console.warn('Gemini —', descricao);
    }
  }

  const erro = new Error(erros.join(' | ') || 'Nenhum modelo respondeu.');
  erro.indisponivel = true;
  erro.porModelo = erros;
  throw erro;
}

module.exports = { gerarTexto, MODELOS };
