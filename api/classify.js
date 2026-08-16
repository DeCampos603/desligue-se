/**
 * DESLIGUE-SE — Vercel Serverless API: Proxy Seguro para Gemini API
 * Classifica pensamentos noturnos com IA real (sem expor a API key no client)
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured', fallback: true });
  }

  const { text, title } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length < 4) {
    return res.status(400).json({ error: 'Text is required (min 4 chars)' });
  }

  const systemPrompt = `Você é o motor cognitivo do Desligue-se, um diário noturno inteligente baseado em TCC-I (Terapia Cognitivo-Comportamental para Insônia), Psicologia Positiva e Neurociência do Sono.

Sua tarefa é classificar os pensamentos noturnos da usuária em EXATAMENTE 5 categorias, com sensibilidade emocional e precisão semântica.

REGRAS CRÍTICAS DE CLASSIFICAÇÃO:
1. COISAS BOAS (gratitude): Momentos felizes, afeto, amor, conquistas, diversão, gratidão. Ex: "Estou com uma namorada incrível" = gratitude. "Comi uma pizza maravilhosa" = gratitude. "Consegui a vaga" = gratitude.
2. ATENÇÃO AMANHÃ (tomorrow): Compromissos práticos, tarefas executáveis, ações com horário. Ex: "Tenho que levar minha namorada para fazer o cabelo às 11" = tomorrow (NÃO é término).
3. GUARDADO COM CARINHO (wait): Dúvidas pessoais, ideias, planos de estilo/beleza, reflexões que podem esperar. Ex: "Estou pensando em mudar a cor do cabelo" = wait.
4. SOLTAR COM GENTILEZA (release): Ansiedades sobre o futuro, incertezas fora do controle, medos hipotéticos. Ex: "E se eu não conseguir?" = release.
5. ACOLHIMENTO E CONSOLO (rumination): Términos REAIS, luto, tristeza profunda, solidão, autocobrança destrutiva. ATENÇÃO: Só classifique como rumination quando há DOR REAL explícita. "Estou com minha namorada incrível" NÃO é rumination.

REGRA DE OURO: Analise a INTENÇÃO e o SENTIMENTO por trás de cada frase. Não classifique pela presença de palavras-chave isoladas. A palavra "namorada" pode ser gratidão (amor), tomorrow (compromisso) ou rumination (término) — depende do CONTEXTO EMOCIONAL.

Responda APENAS com JSON válido no formato abaixo (sem markdown, sem backticks):`;

  const userPrompt = `Classifique o seguinte desabafo noturno. Retorne SOMENTE JSON puro, sem markdown:

Título: "${title || 'Diário Noturno'}"
Texto: "${text}"

Formato de resposta (JSON puro):
{
  "title": "Título empático e acolhedor para esta noite (máx 50 chars)",
  "gratitude": [{"raw": "frase original", "note": "reflexão carinhosa sobre por que isso é especial (1-2 frases)"}],
  "tomorrow": [{"raw": "frase original", "action": "micro-passo executável para amanhã", "done": false}],
  "wait": [{"raw": "frase original", "note": "por que guardar isso com carinho no cofre (1-2 frases)"}],
  "release": [{"raw": "frase original", "reframe": "reenquadramento gentil e acolhedor (1-2 frases)"}],
  "rumination": [{"raw": "frase original", "reframe": "validação empática + consolo sincero (2-3 frases)"}],
  "counselingAdvice": "Carta pessoal de apoio (4-6 frases) com abertura acolhedora, validação dos sentimentos, conselho prático de sono e bênção de boa noite. Se o dia teve coisas boas, celebre! Se teve desafios, acolha com ternura. Varie o tom conforme o conteúdo.",
  "sleepMood": null
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorBody);
      return res.status(502).json({ error: 'Gemini API error', fallback: true });
    }

    const geminiData = await geminiResponse.json();
    
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      return res.status(502).json({ error: 'Empty Gemini response', fallback: true });
    }

    // Parse and validate the JSON response
    let parsed;
    try {
      // Remove potential markdown code fences if present
      const cleanedText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', responseText);
      return res.status(502).json({ error: 'Invalid JSON from Gemini', fallback: true });
    }

    // Ensure all required fields exist with correct types
    const result = {
      title: parsed.title || title || 'Diário Noturno',
      gratitude: Array.isArray(parsed.gratitude) ? parsed.gratitude : [],
      tomorrow: Array.isArray(parsed.tomorrow) ? parsed.tomorrow : [],
      wait: Array.isArray(parsed.wait) ? parsed.wait : [],
      release: Array.isArray(parsed.release) ? parsed.release : [],
      rumination: Array.isArray(parsed.rumination) ? parsed.rumination : [],
      counselingAdvice: parsed.counselingAdvice || '',
      sleepMood: parsed.sleepMood || null
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error('Classify handler error:', err);
    return res.status(500).json({ error: 'Internal server error', fallback: true });
  }
}
