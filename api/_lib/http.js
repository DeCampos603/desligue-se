/**
 * DESLIGUE-SE — Utilidades compartilhadas das funções serverless
 *
 * Arquivos e pastas dentro de /api iniciados por "_" NÃO viram rotas na Vercel,
 * então este módulo é privado e não fica exposto na internet.
 *
 * Responsabilidades:
 *  - CORS restrito a origens conhecidas (antes era "*", o que transformava
 *    /api/classify em um proxy público do Gemini na cota do projeto);
 *  - validação do JWT do Supabase, para saber QUEM está chamando;
 *  - acesso administrativo ao Postgres do Supabase via service role.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Origens autorizadas a chamar a API.
 * Configure ALLOWED_ORIGINS na Vercel (lista separada por vírgula) para
 * incluir o domínio próprio quando ele existir.
 */
function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const defaults = [
    'https://desliguese.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  return [...new Set([...defaults, ...fromEnv])];
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (getAllowedOrigins().includes(origin)) return true;
  // Previews DESTE projeto (ex.: desliguese-git-main-usuario.vercel.app).
  // O prefixo é obrigatório: liberar *.vercel.app permitiria que qualquer
  // aplicação hospedada na Vercel consumisse a nossa cota do Gemini.
  return /^https:\/\/desliguese-[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

/**
 * Aplica os cabeçalhos de CORS e segurança.
 * Retorna true quando a requisição já foi respondida (preflight ou origem negada).
 */
function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  // Requisição de navegador vinda de outra origem: recusa explicitamente.
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Origem não autorizada.' });
    return true;
  }

  return false;
}

/** Extrai o token Bearer do cabeçalho Authorization. */
function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Valida o JWT contra o próprio Supabase e devolve o usuário autenticado.
 * Retorna null se não houver token ou se ele for inválido/expirado.
 */
async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) return null;

    const user = await response.json();
    return user && user.id ? user : null;
  } catch (err) {
    console.warn('Falha ao validar sessão do Supabase:', err.message);
    return null;
  }
}

/** Exige autenticação; responde 401 e retorna null quando não houver. */
async function requireUser(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente na sua conta.' });
    return null;
  }
  return user;
}

/**
 * Consulta/escreve no Postgres com a service role (ignora RLS).
 * Use APENAS no servidor — jamais exponha esta chave no navegador.
 */
async function supabaseAdmin(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (e) { body = text; }
  }

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return body;
}

/** Chamada autenticada à API REST do Stripe (form-urlencoded). */
async function stripeRequest(method, path, params) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const err = new Error('STRIPE_SECRET_KEY não configurada no ambiente.');
    err.isConfigError = true;
    throw err;
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  if (params) options.body = params.toString();

  const response = await fetch(`https://api.stripe.com/v1/${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    // O erro cru do Stripe expõe o id da conta e a URL de log do dashboard:
    // registramos no servidor e devolvemos só a mensagem ao cliente.
    console.error(`Stripe ${method} ${path} falhou:`, JSON.stringify(data));
    const err = new Error(data?.error?.message || 'Falha na comunicação com o Stripe.');
    err.stripeCode = data?.error?.code;
    err.status = response.status;
    throw err;
  }

  return data;
}

module.exports = {
  applyCors,
  getBearerToken,
  getAuthenticatedUser,
  requireUser,
  supabaseAdmin,
  stripeRequest
};
