/**
 * DESLIGUE-SE — Motor Cognitivo de Triagem Noturna & Ritual de Sono (TCC-I)
 * Integração com Supabase (Auth Google/Email, Banco de Dados PostgreSQL & RLS)
 * Inteligência Emocional de Polaridade (Positivo vs Negativo), Gratidão,
 * Balanço de Vida a Longo Prazo e Combate ao Viés de Negatividade
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // CONFIGURAÇÃO DO SUPABASE (DATABASE & AUTH)
  // ==========================================
  // As chaves públicas ficam centralizadas em config.js — um único arquivo para
  // trocar ao migrar do modo de teste para produção.
  const CONFIG = window.DESLIGUESE_CONFIG || {};
  const SUPABASE_URL = CONFIG.supabaseUrl;
  const SUPABASE_ANON_KEY = CONFIG.supabaseAnonKey;

  let supabase = null;
  try {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (err) {
    console.warn('Supabase não inicializado localmente:', err);
  }

  // ==========================================
  // ESTADO DA APLICAÇÃO & PERSISTÊNCIA
  // ==========================================
  let appState = {
    currentUser: null,
    userProfile: null,
    currentDumpTitle: '',
    currentDumpText: '',
    currentTriagedData: null,
    selectedRoutineMinutes: 3,
    routineInterval: null,
    routineSecondsRemaining: 180,
    breathingPhase: 'inhale',
    breathingTimeouts: [],  // Rastreia setTimeout IDs para cancelamento limpo
    countdownIntervals: [], // Rastreia setInterval IDs dos countdowns de respiração
    soundActive: false,
    audioCtx: null,
    noiseNode: null,
    isRecording: false,
    userWantsRecording: false,
    voiceBaseText: '',
    // IMPORTANTE: não chamar loadHistoryFromLocalStorage() aqui — a função lê
    // appState.currentUser e criaria uma referência circular (TDZ) que aborta
    // toda a inicialização do app. O histórico real é carregado no login.
    history: [],
    dailyEntriesToday: null, // contagem autoritativa vinda do servidor (null = desconhecida)
    activeDetailEntry: null,
    activeDetailTab: 'all'
  };

  // ==========================================
  // SELETORES DOM
  // ==========================================
  const views = {
    home: document.getElementById('viewHome'),
    dashboard: document.getElementById('viewDashboard'),
    settings: document.getElementById('viewSettings'),
    night: document.getElementById('viewNight'),
    morning: document.getElementById('viewMorning'),
    history: document.getElementById('viewHistory'),
    stories: document.getElementById('viewStories'),
    sounds: document.getElementById('viewSounds'),
    rhythm: document.getElementById('viewRhythm'),
    chat: document.getElementById('viewChat'),
    breathe: document.getElementById('viewBreathe'),
    nights: document.getElementById('viewNights')
  };

  const steps = {
    dump: document.getElementById('stepDump'),
    loading: document.getElementById('stepLoading'),
    result: document.getElementById('stepResult'),
    routine: document.getElementById('stepRoutine'),
    goodNight: document.getElementById('stepGoodNight')
  };

  // Navegação Desktop & Mobile
  const navBtns = {
    night: document.getElementById('btnTabNight'),
    morning: document.getElementById('btnTabMorning'),
    history: document.getElementById('btnTabHistory'),
    premium: document.getElementById('btnOpenPremium'),
    auth: document.getElementById('btnOpenAuth'),
    logo: document.getElementById('btnLogoHome')
  };

  const mobNavBtns = {
    night: document.getElementById('btnMobNight'),
    chat: document.getElementById('btnMobChat'),
    sounds: document.getElementById('btnMobSounds'),
    rhythm: document.getElementById('btnMobRhythm'),
    auth: document.getElementById('btnMobAuth')
  };

  const userAvatarIcon = document.getElementById('userAvatarIcon');
  const userAuthLabel = document.getElementById('userAuthLabel');
  const mobAvatarIcon = document.getElementById('mobAvatarIcon');
  const mobAuthLabel = document.getElementById('mobAuthLabel');

  const journalTitleInput = document.getElementById('journalTitleInput');
  const journalInput = document.getElementById('journalInput');
  const btnProcessDump = document.getElementById('btnProcessDump');
  const btnVoiceInput = document.getElementById('btnVoiceInput');
  const voiceBtnLabel = document.getElementById('voiceBtnLabel');

  // Navegação entre passos (Retorno)
  const btnBackToDump = document.getElementById('btnBackToDump');
  const btnBackToResult = document.getElementById('btnBackToResult');
  const btnRestartNight = document.getElementById('btnRestartNight');
  const btnMorningToNight = document.getElementById('btnMorningToNight');
  const btnHistoryToNight = document.getElementById('btnHistoryToNight');

  // Carta de Consolo e Conselhos
  const counselingBox = document.getElementById('counselingBox');
  const counselingText = document.getElementById('counselingText');
  const btnCopyAdvice = document.getElementById('btnCopyAdvice');
  const copyAdviceIcon = document.getElementById('copyAdviceIcon');
  const copyAdviceLabel = document.getElementById('copyAdviceLabel');

  // Categorias & Listas
  const resultEntryTitle = document.getElementById('resultEntryTitle');
  const catGratitudeContainer = document.getElementById('catGratitudeContainer');
  const listGratitude = document.getElementById('listGratitude');
  const listTomorrow = document.getElementById('listTomorrow');
  const listWait = document.getElementById('listWait');
  const listRelease = document.getElementById('listRelease');
  const listRumination = document.getElementById('listRumination');
  const catRuminationContainer = document.getElementById('catRuminationContainer');

  // Rotina de Relaxamento
  const durationBtns = document.querySelectorAll('.duration-btn');
  const routineTimeBadge = document.getElementById('routineTimeBadge');
  const btnStartRoutine = document.getElementById('btnStartRoutine');
  const btnFinishRoutine = document.getElementById('btnFinishRoutine');
  const btnToggleSound = document.getElementById('btnToggleSound');
  const soundIcon = document.getElementById('soundIcon');

  const breathCircle = document.getElementById('breathCircle');
  const breathGuideText = document.getElementById('breathGuideText');
  const breathSeconds = document.getElementById('breathSeconds');
  const timerProgress = document.getElementById('timerProgress');
  const timerRemaining = document.getElementById('timerRemaining');
  const somaticStepTitle = document.getElementById('somaticStepTitle');
  const somaticStepDesc = document.getElementById('somaticStepDesc');
  const routinePhaseTag = document.getElementById('routinePhaseTag');

  // Check-in Matinal
  const btnNewMorningCheckin = document.getElementById('btnNewMorningCheckin');
  const moodBtns = document.querySelectorAll('.mood-btn');
  const morningTasksList = document.getElementById('morningTasksList');
  const morningFeedbackMessage = document.getElementById('morningFeedbackMessage');
  const insightText = document.getElementById('insightText');

  // Modais
  const modalPremium = document.getElementById('modalPremium');
  const btnCloseModal = document.getElementById('btnCloseModal');

  const modalAuth = document.getElementById('modalAuth');
  const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');

  // Modal Explicativo de Tags TCC-I
  const modalTagDetail = document.getElementById('modalTagDetail');
  const btnCloseTagModal = document.getElementById('btnCloseTagModal');
  const btnDismissTagModal = document.getElementById('btnDismissTagModal');
  const tagDetailBadge = document.getElementById('tagDetailBadge');
  const tagDetailTitle = document.getElementById('tagDetailTitle');
  const tagDetailMeaning = document.getElementById('tagDetailMeaning');
  const tagDetailNeuro = document.getElementById('tagDetailNeuro');

  // Modal de Termos de Uso, Isenção Médica & LGPD
  const modalTerms = document.getElementById('modalTerms');
  const btnCloseTermsModal = document.getElementById('btnCloseTermsModal');
  const btnDismissTermsModal = document.getElementById('btnDismissTermsModal');
  const linkOpenTermsAuth = document.getElementById('linkOpenTermsAuth');
  const linkOpenTermsFooter = document.getElementById('linkOpenTermsFooter');
  const checkTermsConsent = document.getElementById('checkTermsConsent');
  const checkSensitiveDataConsent = document.getElementById('checkSensitiveDataConsent');

  // Modal de Bloqueio de Trial & Planos
  const modalTrialBlock = document.getElementById('modalTrialBlock');
  const btnCloseTrialBlock = document.getElementById('btnCloseTrialBlock');
  const btnTrialOpenLogin = document.getElementById('btnTrialOpenLogin');
  const btnTrialOpenPremium = document.getElementById('btnTrialOpenPremium');
  const btnSubscribeMonthly = document.getElementById('btnSubscribeMonthly');
  const btnSubscribeAnnual = document.getElementById('btnSubscribeAnnual');

  // Banner de Limite Diário
  const dailyLimitBanner = document.getElementById('dailyLimitBanner');
  const dumpInputContainer = document.getElementById('dumpInputContainer');
  const btnUpgradeDailyLimit = document.getElementById('btnUpgradeDailyLimit');

  // Modal Stripe Elements (Pagamento In-App)
  const modalStripeElements = document.getElementById('modalStripeElements');
  const btnCloseElementsModal = document.getElementById('btnCloseElementsModal');
  const elementsModalPlanTitle = document.getElementById('elementsModalPlanTitle');
  const elementsModalPlanPrice = document.getElementById('elementsModalPlanPrice');
  const paymentForm = document.getElementById('payment-form');
  const paymentElementContainer = document.getElementById('payment-element');
  const btnSubmitPayment = document.getElementById('btnSubmitPayment');
  const btnSubmitPaymentText = document.getElementById('btnSubmitPaymentText');
  const paymentMessage = document.getElementById('payment-message');

  // Botão de Instalação PWA
  const btnInstallApp = document.getElementById('btnInstallApp');

  // Modal de Detalhes da Noite & Conteúdo do Diário
  const modalHistoryDetail = document.getElementById('modalHistoryDetail');
  const btnCloseHistoryDetailModal = document.getElementById('btnCloseHistoryDetailModal');
  const btnDismissHistoryDetail = document.getElementById('btnDismissHistoryDetail');
  const historyDetailBadge = document.getElementById('historyDetailBadge');
  const historyDetailTitle = document.getElementById('historyDetailTitle');
  const historyDetailDate = document.getElementById('historyDetailDate');
  const historyDetailCounselingWrapper = document.getElementById('historyDetailCounselingWrapper');
  const historyDetailCounselingText = document.getElementById('historyDetailCounselingText');
  const historyDetailListContainer = document.getElementById('historyDetailListContainer');
  const historyDetailRawText = document.getElementById('historyDetailRawText');
  const countTabGratitude = document.getElementById('countTabGratitude');
  const countTabTomorrow = document.getElementById('countTabTomorrow');
  const countTabWait = document.getElementById('countTabWait');
  const countTabRelease = document.getElementById('countTabRelease');
  const countTabRumination = document.getElementById('countTabRumination');
  const historyTabBtns = document.querySelectorAll('.history-tab-btn');

  // Balanço Emocional (Longo Prazo)
  const balanceRatioBadge = document.getElementById('balanceRatioBadge');
  const balanceBarGood = document.getElementById('balanceBarGood');
  const balanceBarBad = document.getElementById('balanceBarBad');
  const countGoodThings = document.getElementById('countGoodThings');
  const countChallengingThings = document.getElementById('countChallengingThings');
  const balanceInsightText = document.getElementById('balanceInsightText');

  // Auth Elements
  const authViewLoggedOut = document.getElementById('authViewLoggedOut');
  const authViewLoggedIn = document.getElementById('authViewLoggedIn');
  const btnGoogleLogin = document.getElementById('btnGoogleLogin');
  const formEmailAuth = document.getElementById('formEmailAuth');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const btnSubmitLogin = document.getElementById('btnSubmitLogin');
  const btnSubmitSignup = document.getElementById('btnSubmitSignup');
  const btnManageSubscription = document.getElementById('btnManageSubscription');
  const btnDeleteAccount = document.getElementById('btnDeleteAccount');
  const btnSyncPlan = document.getElementById('btnSyncPlan');
  const authFeedbackMsg = document.getElementById('authFeedbackMsg');
  const loggedUserName = document.getElementById('loggedUserName');
  const loggedUserEmail = document.getElementById('loggedUserEmail');
  const loggedUserPlanBadge = document.getElementById('loggedUserPlanBadge');
  const btnSignOut = document.getElementById('btnSignOut');

  // Stats & Histórico
  const statTotalNights = document.getElementById('statTotalNights');
  const statAvgMood = document.getElementById('statAvgMood');
  const statTasksCleared = document.getElementById('statTasksCleared');
  const historyListContainer = document.getElementById('historyListContainer');

  // ==========================================
  // GERENCIADOR CENTRAL DE MODAIS (com acessibilidade)
  // ==========================================
  const ALL_MODALS = [modalPremium, modalAuth, modalTagDetail, modalHistoryDetail, modalTerms, modalTrialBlock, modalStripeElements];
  let lastFocusedElement = null;

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(modal) {
    if (!modal) return;

    // O modal de planos muda de conteúdo conforme a assinatura: vitrine de
    // preços para quem não assina, estado da assinatura para quem já assina.
    if (modal === modalPremium) {
      try { renderizarPainelDaAssinante(); } catch (e) {}
    }

    lastFocusedElement = document.activeElement;
    modal.classList.remove('hidden');
    modal.removeAttribute('hidden');
    // Move o foco para dentro do modal (leitores de tela e teclado)
    const firstFocusable = modal.querySelector(FOCUSABLE_SELECTOR);
    if (firstFocusable) {
      setTimeout(() => { try { firstFocusable.focus(); } catch (e) {} }, 30);
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    const wasOpen = !modal.classList.contains('hidden');
    modal.classList.add('hidden');
    modal.setAttribute('hidden', '');
    // Devolve o foco a quem abriu o modal
    if (wasOpen && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      try { lastFocusedElement.focus(); } catch (e) {}
      lastFocusedElement = null;
    }
  }

  function closeAllModals() {
    ALL_MODALS.forEach(closeModal);
  }

  // Mantém o foco preso dentro do modal aberto enquanto ele estiver visível
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const openedModal = ALL_MODALS.find(m => m && !m.classList.contains('hidden'));
    if (!openedModal) return;

    const focusables = Array.from(openedModal.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ==========================================
  // AVISOS NA INTERFACE (substitui alert() nativo)
  // ==========================================
  function showToast(message, type = 'info', durationMs = 6000) {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Fechar aviso');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toast.remove());
    toast.appendChild(closeBtn);

    host.appendChild(toast);
    if (durationMs > 0) {
      setTimeout(() => toast.remove(), durationMs);
    }
  }

  // ==========================================
  // INICIALIZAÇÃO RESILIENTE
  // ==========================================
  closeAllModals();

  btnUpgradeDailyLimit?.addEventListener('click', () => {
    openModal(modalPremium);
  });

  journalInput?.addEventListener('input', () => {
    const hasText = (journalInput.value || '').trim().length > 3;
    if (btnProcessDump) btnProcessDump.disabled = !hasText;
  });

  btnProcessDump.addEventListener('click', handleProcessDump);
  btnStartRoutine.addEventListener('click', startRelaxationRoutine);
  btnFinishRoutine.addEventListener('click', finishNightToGoodnight);
  btnToggleSound.addEventListener('click', toggleAudioSoundscape);
  btnNewMorningCheckin.addEventListener('click', () => switchView('morning'));

  // Botões de Retorno
  if (btnBackToDump) {
    btnBackToDump.addEventListener('click', () => {
      checkDailyLimitUI();
      showStep('dump');
    });
  }
  if (btnBackToResult) {
    btnBackToResult.addEventListener('click', () => {
      if (appState.routineInterval) clearInterval(appState.routineInterval);
      cancelBreathingCycle();
      stopAudioSoundscape();
      showStep('result');
    });
  }
  if (btnRestartNight) {
    btnRestartNight.addEventListener('click', () => {
      journalTitleInput.value = '';
      journalInput.value = '';
      btnProcessDump.disabled = true;
      checkDailyLimitUI();
      showStep('dump');
      switchView('night');
    });
  }
  if (btnMorningToNight) btnMorningToNight.addEventListener('click', () => switchView('night'));
  if (btnHistoryToNight) btnHistoryToNight.addEventListener('click', () => switchView('night'));

  // ==========================================
  // NAVEGAÇÃO DESKTOP & MOBILE SINCRONIZADA
  // ==========================================
  // ==========================================================================
  // MENU LATERAL
  // O cabeçalho não comportava as oito telas, e a rolagem horizontal deixava
  // metade do aplicativo invisível. O menu concentra o mapa completo; o
  // cabeçalho fica só com atalhos, e apenas quando há espaço.
  // ==========================================================================
  let focoAntesDoMenu = null;

  function menuEstaAberto() {
    return document.getElementById('menuLateral')?.classList.contains('aberto');
  }

  function abrirMenu() {
    const painel = document.getElementById('menuLateral');
    const fundo = document.getElementById('menuOverlay');
    const botao = document.getElementById('btnOpenMenu');
    if (!painel || !fundo) return;

    focoAntesDoMenu = document.activeElement;

    fundo.hidden = false;
    painel.hidden = false;

    // Força o cálculo de layout para que a transição tenha um estado inicial.
    // requestAnimationFrame seria o caminho natural, mas ele não dispara em
    // aba sem composição (segundo plano, janela minimizada) — e o menu ficava
    // sem abrir. O reflow é síncrono e não depende de quadro nenhum.
    void painel.offsetWidth;

    fundo.classList.add('aberto');
    painel.classList.add('aberto');

    botao?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';

    marcarItemAtivoNoMenu();
    setTimeout(() => painel.querySelector('.menu-item')?.focus(), 120);
  }

  function fecharMenu() {
    const painel = document.getElementById('menuLateral');
    const fundo = document.getElementById('menuOverlay');
    const botao = document.getElementById('btnOpenMenu');
    if (!painel || !fundo) return;

    painel.classList.remove('aberto');
    fundo.classList.remove('aberto');
    botao?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';

    // Espera a animação terminar para tirar do fluxo e dos leitores de tela
    setTimeout(() => {
      if (!painel.classList.contains('aberto')) {
        painel.hidden = true;
        fundo.hidden = true;
      }
    }, 260);

    if (focoAntesDoMenu && typeof focoAntesDoMenu.focus === 'function') {
      try { focoAntesDoMenu.focus(); } catch (e) {}
    }
    focoAntesDoMenu = null;
  }

  /** Destaca no menu a tela que está aberta. */
  function marcarItemAtivoNoMenu() {
    const ativa = Object.keys(views).find(k => views[k]?.classList.contains('active'));
    document.querySelectorAll('.menu-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === ativa);
    });
  }

  function initMenuLateral() {
    document.getElementById('btnOpenMenu')?.addEventListener('click', () => {
      menuEstaAberto() ? fecharMenu() : abrirMenu();
    });
    document.getElementById('btnFecharMenu')?.addEventListener('click', fecharMenu);
    document.getElementById('menuOverlay')?.addEventListener('click', fecharMenu);

    document.getElementById('btnMenuConta')?.addEventListener('click', () => {
      fecharMenu();
      openModal(modalAuth);
    });

    // Esc fecha o menu antes de qualquer modal
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && menuEstaAberto()) {
        e.stopPropagation();
        fecharMenu();
      }
    }, true);

    // Prende o foco dentro do painel enquanto ele estiver aberto
    document.getElementById('menuLateral')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focaveis = [...document.querySelectorAll('#menuLateral button')].filter(b => b.offsetParent !== null);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    });
  }

  function initNavigation() {
    // Os botões com data-view são ligados em initNovoSite (fonte única).
    // Aqui ficam só os que não representam uma view.
    navBtns.logo?.addEventListener('click', () => switchView('home'));
    mobNavBtns.auth?.addEventListener('click', () => openModal(modalAuth));
  }

  // Telas que só existem depois do login. A apresentação ('home') é o oposto:
  // some assim que a pessoa entra, para não competir com o aplicativo.
  const VIEWS_DO_APP = ['dashboard', 'breathe', 'night', 'nights', 'stories', 'sounds', 'chat', 'settings'];

  /**
   * Define o modo da interface a partir do estado de autenticação.
   *
   * Visitante  → só a apresentação do produto e o convite para entrar.
   * Autenticada → só o aplicativo; a apresentação sai de cena.
   *
   * Antes as duas coisas conviviam na mesma tela e a apresentação ficava
   * pendurada acima de qualquer aba — era o que deixava o site confuso.
   */
  function aplicarModoDeAcesso() {
    const logada = Boolean(appState.currentUser);

    document.body.classList.toggle('modo-app', logada);
    document.body.classList.toggle('modo-visitante', !logada);

    const rotulo = document.getElementById('userAuthLabel');
    const botaoConta = document.getElementById('btnOpenAuth');
    if (rotulo && !logada) rotulo.textContent = 'Entrar';
    if (botaoConta) {
      botaoConta.title = logada ? 'Minha conta' : 'Entrar ou criar conta gratuita';
      botaoConta.classList.toggle('btn-header-primary', !logada);
      botaoConta.classList.toggle('btn-header-ghost', logada);
    }

    // Corrige a tela ativa caso ela não pertença ao modo atual
    const ativa = Object.keys(views).find(k => views[k]?.classList.contains('active'));
    if (!logada && ativa && ativa !== 'home') switchView('home');
    if (logada && (!ativa || ativa === 'home')) switchView('dashboard');
  }

  function switchView(viewName) {
    // Ritmo, check-in e histórico deixaram de ser telas: viraram abas de
    // "Minhas noites". Quem chamar pelo nome antigo continua chegando ao
    // lugar certo — links, botões e memória muscular não quebram.
    if (ABAS_DAS_NOITES.includes(viewName)) {
      const aba = viewName;
      viewName = 'nights';
      setTimeout(() => abrirAbaDasNoites(aba), 0);
    }

    if (!views[viewName]) return;

    // Porta de entrada única: qualquer tentativa de abrir o aplicativo sem
    // sessão vira convite para entrar, em vez de uma tela vazia ou quebrada.
    if (VIEWS_DO_APP.includes(viewName) && !appState.currentUser) {
      guardarRascunhoDaApresentacao();
      openModal(modalAuth);
      showAuthFeedback('Crie sua conta gratuita para começar — leva menos de um minuto e o seu diário fica guardado.', 'success');
      return;
    }

    // Quem já entrou não volta para a página de vendas
    if (viewName === 'home' && appState.currentUser) viewName = 'dashboard';

    Object.keys(views).forEach(k => {
      views[k]?.classList.toggle('active', k === viewName);
    });

    // Marca o item ativo em todas as barras de navegação de uma vez
    document.querySelectorAll('[data-view]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    // No celular a sidebar e gaveta e precisa fechar ao navegar;
    // no desktop ela e fixa e o metodo simplesmente nao faz nada.
    if (menuEstaAberto()) fecharMenu();
    marcarItemAtivoNoMenu();

    if (viewName === 'dashboard') {
      renderizarPainel();
    } else if (viewName === 'settings') {
      renderizarConfiguracoes();
    } else if (viewName === 'night') {
      checkDailyLimitUI();
    } else if (viewName === 'morning') {
      renderMorningView();
    } else if (viewName === 'history') {
      updateHistoryUI();
    } else if (viewName === 'nights') {
      abrirAbaDasNoites(abaAtual);
    } else if (viewName === 'home') {
      renderizarRitmo();
    } else if (viewName === 'stories') {
      fecharHistoria();
    } else if (viewName === 'chat') {
      prepararChat();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showStep(stepName) {
    Object.keys(steps).forEach(k => {
      steps[k].classList.toggle('hidden', k !== stepName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================
  // CAIXAS EXPLICATIVAS DE TCC-I & MODAL DE TAGS
  // ==========================================
  const TAG_INFO_DICTIONARY = {
    gratitude: {
      title: 'Coisas Boas, Vitórias & Gratidão',
      badge: 'Psicologia Positiva & Ocitocina',
      meaning: 'Momentos felizes, demonstrações de afeto, conquistas e motivos de orgulho. Guardamos essas memórias com carinho para que a mente durma ancorada na segurança e na alegria.',
      neuro: 'Estimula a liberação de dopamina e ocitocina, reduzindo a hiperatividade da amígdala e neutralizando o viés biológico de negatividade.'
    },
    tomorrow: {
      title: 'Atenção Amanhã (Ação Imediata)',
      badge: 'Prioridade Executável • TCC-I',
      meaning: 'Tarefas e compromissos práticos de alta relevância. A IA organizou o primeiro micro-passo para você iniciar o dia com clareza e leveza.',
      neuro: 'Descarrega a memória de trabalho do córtex pré-frontal. Ao saber que a tarefa está agendada no papel, o cérebro desliga a hipervigilância noturna.'
    },
    wait: {
      title: 'Guardado com Carinho (No Cofre)',
      badge: 'Autocuidado & Fechamento • Efeito Zeigarnik',
      meaning: 'Dúvidas pessoais, planos de estilo (como cor de cabelo), ideias e projetos guardados com amor. Eles estão protegidos no seu cofre digital para você revisitar no momento certo.',
      neuro: 'O Efeito Zeigarnik faz o cérebro remoer assuntos sem encerramento. Guardar no cofre sinaliza que nada se perderá, autorizando o descanso profundo.'
    },
    release: {
      title: 'Soltar com Gentileza (Fora de Controle)',
      badge: 'Aceitação Radical • ACT',
      meaning: 'Incertezas futuras, resultados pendentes ou expectativas alheias que você não tem como resolver deitada no escuro da noite.',
      neuro: 'Acalma o Eixo HPA e cessa a produção de cortisol. Reconhecer o que está fora do seu alcance permite ao corpo ativar o sistema parassimpático e adormecer.'
    },
    rumination: {
      title: 'Acolhimento, Conforto & Consolo',
      badge: 'Escuta Empática • Autocompaixão',
      meaning: 'Dores do coração (como términos e perdas), tristeza, solidão e autocobranças. Aqui seus sentimentos são ouvidos com carinho, respeito e acolhimento humano.',
      neuro: 'A validação empática reduz a hiperatividade da amígdala e da Default Mode Network (DMN), aliviando a dor emocional e trazendo paz.'
    }
  };

  function initCategoryWhyToggles() {
    const toggles = [
      { triggerId: 'headerGratitude', boxId: 'whyBoxGratitude' },
      { triggerId: 'headerTomorrow', boxId: 'whyBoxTomorrow' },
      { triggerId: 'headerWait', boxId: 'whyBoxWait' },
      { triggerId: 'headerRelease', boxId: 'whyBoxRelease' },
      { triggerId: 'headerRumination', boxId: 'whyBoxRumination' }
    ];

    toggles.forEach(({ triggerId, boxId }) => {
      const trigger = document.getElementById(triggerId);
      const box = document.getElementById(boxId);
      if (trigger && box) {
        const toggleBox = () => {
          const isHidden = box.classList.toggle('hidden');
          trigger.setAttribute('aria-expanded', String(!isHidden));
        };

        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', boxId);

        trigger.addEventListener('click', (e) => {
          if (e.target.closest('.cat-list') || e.target.closest('input') || e.target.closest('button')) return;
          toggleBox();
        });

        // Acessibilidade: o elemento tem role="button", então Enter e Espaço precisam ativá-lo
        trigger.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
          if (e.target.closest('.cat-list') || e.target.closest('input') || e.target.closest('button')) return;
          e.preventDefault();
          toggleBox();
        });
      }
    });

    document.querySelectorAll('.btn-info-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.getAttribute('data-tag');
        openTagDetailModal(tag);
      });
    });
  }

  // ==========================================================================
  // PAINEL DA ASSINANTE
  // Quem já paga não deve ver vitrine de preços ao abrir "Planos" — deve ver
  // o estado da própria assinatura e quanto tempo de acesso ainda tem.
  // ==========================================================================
  const MS_POR_DIA = 24 * 60 * 60 * 1000;

  function diasRestantes(dataISO) {
    if (!dataISO) return null;
    const fim = new Date(dataISO);
    if (isNaN(fim.getTime())) return null;
    return Math.max(0, Math.ceil((fim.getTime() - Date.now()) / MS_POR_DIA));
  }

  /** "12 dias", "1 mês e 3 dias" — linguagem de gente, não de sistema. */
  function descreverTempoRestante(dias) {
    if (dias === null) return null;
    if (dias === 0) return 'termina hoje';
    if (dias === 1) return '1 dia';
    if (dias < 30) return `${dias} dias`;

    const meses = Math.floor(dias / 30);
    const resto = dias % 30;
    const parteMeses = meses === 1 ? '1 mês' : `${meses} meses`;
    if (resto === 0) return parteMeses;
    return `${parteMeses} e ${resto === 1 ? '1 dia' : `${resto} dias`}`;
  }

  function renderizarPainelDaAssinante() {
    const painel = document.getElementById('painelAssinante');
    const grade = document.getElementById('gradeDePlanos');
    const rodape = document.querySelector('#modalPremium .modal-footer-guarantee');
    const cabecalho = document.querySelector('#modalPremium .modal-header');
    if (!painel || !grade) return;

    const isPro = isUserPro();
    painel.classList.toggle('hidden', !isPro);
    grade.classList.toggle('hidden', isPro);
    if (rodape) rodape.classList.toggle('hidden', isPro);
    if (cabecalho) cabecalho.classList.toggle('hidden', isPro);

    if (!isPro) return;

    const perfil = appState.userProfile || {};
    const anual = perfil.plano === 'premium_anual';
    const cancelando = perfil.subscription_status === 'canceling';
    const atrasado = perfil.subscription_status === 'past_due';

    const definir = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };

    definir('assinantePlano', anual ? 'Pro Anual' : 'Pro Mensal');

    const dias = diasRestantes(perfil.subscription_ends_at);
    const restante = descreverTempoRestante(dias);

    if (perfil.subscription_ends_at && restante) {
      const data = new Date(perfil.subscription_ends_at)
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      definir('assinanteRotuloData', cancelando ? 'Acesso até' : 'Renova em');
      definir('assinanteData', data);
      definir('assinanteRestante', restante);
    } else {
      // Assinatura antiga, anterior ao registro da data de término
      definir('assinanteRotuloData', cancelando ? 'Acesso até' : 'Renovação');
      definir('assinanteData', 'a confirmar');
      definir('assinanteRestante', '—');
    }

    const nome = (appState.currentUser?.user_metadata?.full_name || '').split(' ')[0];
    definir('assinanteTexto', nome
      ? `${nome}, seu acesso completo está ativo. Obrigado por sustentar este projeto.`
      : 'Seu acesso completo está ativo. Obrigado por sustentar este projeto.');

    const nota = document.getElementById('assinanteNota');
    if (nota) {
      if (cancelando) {
        nota.textContent = restante
          ? `O cancelamento já está agendado: você continua com tudo liberado por mais ${restante}, e depois disso a conta volta ao plano gratuito. Nenhuma nova cobrança será feita.`
          : 'O cancelamento já está agendado. Nenhuma nova cobrança será feita.';
        nota.className = 'assinante-nota aviso';
      } else if (atrasado) {
        nota.textContent = 'Houve um problema no último pagamento. Atualize a forma de pagamento em "Gerenciar assinatura" para não perder o acesso.';
        nota.className = 'assinante-nota alerta';
      } else {
        nota.textContent = anual
          ? 'A renovação é automática, uma vez por ano. Você pode cancelar quando quiser, sem multa.'
          : 'A renovação é automática, todo mês. Você pode cancelar quando quiser, sem multa.';
        nota.className = 'assinante-nota';
      }
    }
  }

  function initPainelDaAssinante() {
    document.getElementById('btnAssinanteFechar')?.addEventListener('click', () => closeModal(modalPremium));
    document.getElementById('btnAssinanteGerenciar')?.addEventListener('click', () => {
      closeModal(modalPremium);
      openModal(modalAuth);
      document.getElementById('btnManageSubscription')?.focus();
    });
  }

  function openTagDetailModal(tagType) {
    const info = TAG_INFO_DICTIONARY[tagType] || TAG_INFO_DICTIONARY.tomorrow;
    tagDetailTitle.textContent = info.title;
    tagDetailBadge.textContent = info.badge;
    tagDetailMeaning.textContent = info.meaning;
    tagDetailNeuro.textContent = info.neuro;
    openModal(modalTagDetail);
  }

  function initCopyAdviceButton() {
    if (!btnCopyAdvice) return;
    btnCopyAdvice.addEventListener('click', () => {
      if (!counselingText) return;
      const textToCopy = counselingText.textContent.trim();
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyAdviceIcon.textContent = '✨';
        copyAdviceLabel.textContent = 'Mantra copiado com amor!';
        setTimeout(() => {
          copyAdviceIcon.textContent = '📋';
          copyAdviceLabel.textContent = 'Guardar como mantra';
        }, 2500);
      }).catch(() => {});
    });
  }

  // ==========================================
  // MODAL DE DETALHES DO DIÁRIO (CONTEÚDO DAS TAGS)
  // ==========================================
  function initHistoryDetailTabs() {
    historyTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        historyTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appState.activeDetailTab = btn.getAttribute('data-tab');
        renderHistoryDetailList();
      });
    });
  }

  function openHistoryEntryDetailModal(entryIndex, initialTab = 'all') {
    const entry = appState.history[entryIndex];
    if (!entry) return;

    appState.activeDetailEntry = entry;
    appState.activeDetailTab = initialTab;

    const d = new Date(entry.date);
    const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    historyDetailTitle.textContent = entry.title || 'Diário Noturno';
    historyDetailDate.textContent = `Registrado em ${formattedDate}`;
    historyDetailRawText.textContent = `"${entry.rawText}"`;

    if (entry.counselingAdvice) {
      historyDetailCounselingWrapper.classList.remove('hidden');
      historyDetailCounselingText.textContent = `"${entry.counselingAdvice}"`;
    } else {
      historyDetailCounselingWrapper.classList.add('hidden');
    }

    if (countTabGratitude) countTabGratitude.textContent = entry.gratitude ? entry.gratitude.length : 0;
    countTabTomorrow.textContent = entry.tomorrow ? entry.tomorrow.length : 0;
    countTabWait.textContent = entry.wait ? entry.wait.length : 0;
    countTabRelease.textContent = entry.release ? entry.release.length : 0;
    countTabRumination.textContent = entry.rumination ? entry.rumination.length : 0;

    historyTabBtns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === initialTab);
    });

    renderHistoryDetailList();
    openModal(modalHistoryDetail);
  }

  function renderHistoryDetailList() {
    const entry = appState.activeDetailEntry;
    if (!entry) return;

    historyDetailListContainer.innerHTML = '';
    const tab = appState.activeDetailTab;

    let itemsToRender = [];

    if (tab === 'all' || tab === 'gratitude') {
      (entry.gratitude || []).forEach(item => {
        itemsToRender.push({
          type: 'gratitude',
          tagLabel: 'Coisas Boas',
          tagStyle: 'background: rgba(59, 130, 246, 0.25); color: var(--acento);',
          title: item.raw,
          note: item.note || 'Momento bom guardado no coração'
        });
      });
    }

    if (tab === 'all' || tab === 'tomorrow') {
      (entry.tomorrow || []).forEach(item => {
        itemsToRender.push({
          type: 'tomorrow',
          tagLabel: 'Amanhã',
          tagStyle: 'background: rgba(59, 130, 246, 0.2); color: var(--acento);',
          title: item.action || item.raw,
          note: 'Ação executável agendada para a manhã'
        });
      });
    }

    if (tab === 'all' || tab === 'wait') {
      (entry.wait || []).forEach(item => {
        itemsToRender.push({
          type: 'wait',
          tagLabel: 'No Cofre',
          tagStyle: 'background: rgba(149, 167, 136, 0.2); color: var(--sage-calm);',
          title: item.raw,
          note: item.note || 'Guardado com carinho no cofre digital'
        });
      });
    }

    if (tab === 'all' || tab === 'release') {
      (entry.release || []).forEach(item => {
        itemsToRender.push({
          type: 'release',
          tagLabel: 'Soltura',
          tagStyle: 'background: rgba(181, 131, 141, 0.2); color: var(--lilac-twilight);',
          title: item.raw,
          note: item.reframe || 'Preocupação solta com gentileza'
        });
      });
    }

    if (tab === 'all' || tab === 'rumination') {
      (entry.rumination || []).forEach(item => {
        itemsToRender.push({
          type: 'rumination',
          tagLabel: 'Acolhimento',
          tagStyle: 'background: rgba(181, 131, 141, 0.28); color: var(--lilac-twilight);',
          title: item.raw,
          note: item.reframe || 'Sentimento acolhido com compaixão'
        });
      });
    }

    if (itemsToRender.length === 0) {
      historyDetailListContainer.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">
          Nenhum item nesta categoria para esta noite.
        </div>
      `;
      return;
    }

    itemsToRender.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-detail-item';
      div.innerHTML = `
        <div class="history-detail-item-header">
          <span class="cat-item-tag" style="${item.tagStyle}">${item.tagLabel}</span>
          <span class="history-detail-item-text">${escapeHTML(item.title)}</span>
        </div>
        ${item.note ? `<div class="history-detail-item-note">✨ ${escapeHTML(item.note)}</div>` : ''}
      `;
      historyDetailListContainer.appendChild(div);
    });
  }

  // ==========================================
  // AUTENTICAÇÃO COM SUPABASE
  // ==========================================
  async function initSupabaseAuth() {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        handleUserLoggedIn(session.user);
      } else {
        handleUserLoggedOut();
      }

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          handleUserLoggedIn(session.user);
        } else {
          handleUserLoggedOut();
        }
      });
    } catch (e) {
      console.warn('Erro ao checar sessão Supabase:', e);
    }

    // Google Login
    btnGoogleLogin?.addEventListener('click', async () => {
      // O aceite dos Termos e o consentimento para dado sensível valem para
      // QUALQUER forma de entrada. Antes só o cadastro por e-mail era barrado,
      // e quem entrava pelo Google criava conta sem nunca ter aceitado nada.
      if (!validarConsentimentos()) return;

      registrarConsentimentoLocal();
      showAuthFeedback('Redirecionando para login seguro do Google...', 'success');
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) showAuthFeedback(error.message, 'error');
      } catch (err) {
        showAuthFeedback('Erro ao conectar com Google: ' + err.message, 'error');
      }
    });

    // Função Executora de Login com E-mail
    async function executeEmailLogin() {
      const email = authEmail?.value?.trim() || '';
      const password = authPassword?.value || '';

      if (!email || !password) {
        showAuthFeedback('Preencha seu e-mail e senha para entrar.', 'error');
        return;
      }

      showAuthFeedback('Entrando na sua conta...', 'success');
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          showAuthFeedback('Erro ao entrar: ' + error.message, 'error');
        } else {
          showAuthFeedback('Login realizado com sucesso!', 'success');
          setTimeout(() => modalAuth?.classList.add('hidden'), 800);
        }
      } catch (err) {
        showAuthFeedback(err.message, 'error');
      }
    }

    // Submissão do Formulário de Login (Enter ou Botão)
    formEmailAuth?.addEventListener('submit', (e) => {
      e.preventDefault();
      executeEmailLogin();
    });

    btnSubmitLogin?.addEventListener('click', (e) => {
      e.preventDefault();
      executeEmailLogin();
    });

    // Cadastro
    btnSubmitSignup?.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value;

      if (!validarConsentimentos()) return;
      registrarConsentimentoLocal();

      if (!email || password.length < 6) {
        showAuthFeedback('Informe um e-mail válido e senha de no mínimo 6 caracteres.', 'error');
        return;
      }

      showAuthFeedback('Criando sua conta segura...', 'success');
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
              terms_accepted_at: new Date().toISOString(),
              terms_version: '2026-v2',
              // Registro da prova de consentimento específico para dado sensível
              sensitive_data_consent: true,
              sensitive_data_consent_at: new Date().toISOString()
            }
          }
        });
        if (error) {
          showAuthFeedback('Erro no cadastro: ' + error.message, 'error');
        } else {
          showAuthFeedback('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'success');
        }
      } catch (err) {
        showAuthFeedback(err.message, 'error');
      }
    });

    // Logout
    btnSignOut?.addEventListener('click', async () => {
      await supabase.auth.signOut();
      closeModal(modalAuth);
      showToast('Você saiu da conta.', 'info');
    });

    // Gerenciar / cancelar assinatura (Portal do Cliente Stripe)
    btnManageSubscription?.addEventListener('click', async () => {
      btnManageSubscription.disabled = true;
      const originalLabel = btnManageSubscription.textContent;
      btnManageSubscription.textContent = 'Abrindo portal seguro...';
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Faça login novamente para gerenciar sua assinatura.');

        const data = await safeFetchJson('/api/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ returnUrl: window.location.origin })
        });
        if (!data.url) {
          throw new Error('Não foi possível abrir o portal de assinatura.');
        }
        window.location.href = data.url;
      } catch (err) {
        showToast(err.message, 'error', 9000);
        btnManageSubscription.disabled = false;
        btnManageSubscription.textContent = originalLabel;
      }
    });

    // "Já paguei e não recebi o acesso": reconsulta o Stripe e regrava o plano
    btnSyncPlan?.addEventListener('click', async () => {
      btnSyncPlan.disabled = true;
      const rotuloOriginal = btnSyncPlan.textContent;
      btnSyncPlan.textContent = 'Consultando sua assinatura...';
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Entre na sua conta para consultar a assinatura.');

        const data = await safeFetchJson('/api/sync-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: '{}'
        });

        if (data.atualizado) {
          await loadCloudUserProfile(appState.currentUser.id);
          renderPlanBadge();
          checkDailyLimitUI();
          updateHistoryUI();
          showToast('Assinatura encontrada e acesso Pro liberado. Obrigado pela paciência! 💜', 'success', 9000);
        } else {
          showToast(data.mensagem || 'Nenhuma assinatura ativa foi encontrada para esta conta.', 'info', 10000);
        }
      } catch (err) {
        showToast('Não foi possível consultar sua assinatura: ' + err.message, 'error', 10000);
      } finally {
        btnSyncPlan.disabled = false;
        btnSyncPlan.textContent = rotuloOriginal;
      }
    });

    // Exclusão definitiva da conta e de todos os dados (LGPD, art. 18, VI)
    btnDeleteAccount?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'ATENÇÃO: esta ação é definitiva.\n\n' +
        'Todo o seu diário, seus registros e a sua conta serão apagados permanentemente ' +
        'dos nossos servidores e não poderão ser recuperados.\n\n' +
        'Deseja realmente excluir a sua conta e todos os seus dados?'
      );
      if (!confirmed) return;

      btnDeleteAccount.disabled = true;
      btnDeleteAccount.textContent = 'Excluindo seus dados...';
      try {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) throw new Error(error.message);

        // Limpa qualquer resquício local antes de encerrar a sessão
        try {
          if (appState.currentUser) localStorage.removeItem(`desliguese_entries_${appState.currentUser.id}`);
          localStorage.removeItem('desliguese_last_dump_date');
          localStorage.removeItem('desliguese_user_plan');
        } catch (e) {}

        await supabase.auth.signOut();
        closeModal(modalAuth);
        showToast('Sua conta e todos os seus dados foram excluídos definitivamente. Cuide-se. 💜', 'success', 12000);
      } catch (err) {
        showToast('Não foi possível excluir a conta: ' + err.message, 'error', 10000);
      } finally {
        btnDeleteAccount.disabled = false;
        btnDeleteAccount.textContent = '🗑️ Excluir minha conta e meus dados';
      }
    });
  }

  const TERMS_VERSION = '2026-v2';
  const STORAGE_KEY_CONSENT = 'desliguese_consentimento';

  /**
   * Exige os dois aceites antes de qualquer forma de entrada ou cadastro.
   * Retorna false (e explica o motivo) quando falta algum.
   */
  function validarConsentimentos() {
    if (checkTermsConsent && !checkTermsConsent.checked) {
      showAuthFeedback('Para continuar, é preciso ler e aceitar os Termos de Uso, a Isenção Médica e a Política de Privacidade.', 'error');
      checkTermsConsent.focus();
      checkTermsConsent.closest('.terms-checkbox-label')?.classList.add('consentimento-pendente');
      return false;
    }

    if (checkSensitiveDataConsent && !checkSensitiveDataConsent.checked) {
      showAuthFeedback('Precisamos da sua autorização específica para processar o conteúdo dos seus desabafos, inclusive pela IA do Google Gemini.', 'error');
      checkSensitiveDataConsent.focus();
      checkSensitiveDataConsent.closest('.terms-checkbox-label')?.classList.add('consentimento-pendente');
      return false;
    }

    document.querySelectorAll('.consentimento-pendente')
      .forEach(el => el.classList.remove('consentimento-pendente'));
    return true;
  }

  /** Guarda a prova do aceite antes de sair da página (login via Google). */
  function registrarConsentimentoLocal() {
    try {
      localStorage.setItem(STORAGE_KEY_CONSENT, JSON.stringify({
        termsVersion: TERMS_VERSION,
        aceitoEm: new Date().toISOString()
      }));
    } catch (e) {}
  }

  /**
   * Transfere o aceite para o perfil no banco assim que a sessão existir.
   * Quem entra pelo Google volta de outro domínio, então o registro precisa
   * ser concluído aqui, depois do redirecionamento.
   */
  async function persistirConsentimento(userId) {
    if (!supabase) return;
    try {
      const bruto = localStorage.getItem(STORAGE_KEY_CONSENT);
      if (!bruto) return;
      const consentimento = JSON.parse(bruto);

      await supabase.from('profiles').update({
        terms_version: consentimento.termsVersion || TERMS_VERSION,
        terms_accepted_at: consentimento.aceitoEm,
        sensitive_data_consent_at: consentimento.aceitoEm
      }).eq('id', userId);
    } catch (e) {
      console.warn('Não foi possível registrar o consentimento no perfil:', e.message);
    }
  }

  /**
   * Recupera o access token (JWT) da sessão atual do Supabase.
   * É ele que autentica a usuária nos endpoints serverless (/api/*).
   */
  async function getAccessToken() {
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch (e) {
      return null;
    }
  }

  function handleUserLoggedIn(user) {
    appState.currentUser = user;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuária';
    
    if (userAvatarIcon) userAvatarIcon.textContent = '✨';
    if (userAuthLabel) userAuthLabel.textContent = name.length > 10 ? name.substring(0, 8) + '...' : name;
    if (mobAvatarIcon) mobAvatarIcon.textContent = '✨';
    if (mobAuthLabel) mobAuthLabel.textContent = 'Conta';

    authViewLoggedOut?.classList.add('hidden');
    authViewLoggedIn?.classList.remove('hidden');

    if (loggedUserName) loggedUserName.textContent = `Olá, ${name}!`;
    if (loggedUserEmail) loggedUserEmail.textContent = user.email;

    // O marcador de uso diário do modo visitante não vale para uma conta:
    // limpamos ao entrar para não herdar o limite de quem usou sem login.
    try { localStorage.removeItem('desliguese_last_dump_date'); } catch (e) {}

    renderPlanBadge();
    aplicarModoDeAcesso();
    persistirConsentimento(user.id);
    recuperarRascunhoDaApresentacao();

    // Carrega histórico associado ao usuário logado
    appState.history = loadHistoryFromLocalStorage();
    updateHistoryUI();
    loadCloudUserProfile(user.id);
    syncCloudHistory(user.id);
    refreshDailyUsageFromServer();
  }

  function handleUserLoggedOut() {
    appState.currentUser = null;
    appState.userProfile = null;
    appState.history = [];
    appState.dailyEntriesToday = null;
    // O plano é sempre derivado do servidor: sem sessão não existe Pro.
    try { localStorage.removeItem('desliguese_user_plan'); } catch (e) {}
    if (btnManageSubscription) btnManageSubscription.classList.add('hidden');
    if (btnDeleteAccount) btnDeleteAccount.classList.add('hidden');
    if (userAvatarIcon) userAvatarIcon.textContent = '👤';
    if (userAuthLabel) userAuthLabel.textContent = 'Entrar';
    if (mobAvatarIcon) mobAvatarIcon.textContent = '👤';
    if (mobAuthLabel) mobAuthLabel.textContent = 'Entrar';

    authViewLoggedOut?.classList.remove('hidden');
    authViewLoggedIn?.classList.add('hidden');

    renderPlanBadge();
    aplicarModoDeAcesso();
    updateHistoryUI();
    checkDailyLimitUI();
  }

  async function loadCloudUserProfile(userId) {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (data) {
        appState.userProfile = data;
        renderPlanBadge();
        checkDailyLimitUI();
      }
    } catch (e) {
      console.warn('Erro ao carregar perfil:', e);
    }
  }

  /**
   * Ponto único que reflete "quem é a pessoa e qual é o plano dela" na
   * interface inteira. Marca o <body> com classes de estado, e o CSS esconde
   * de uma vez todas as ofertas de upgrade para quem já é assinante — antes,
   * cada aviso de plano gratuito era escondido (ou não) por conta própria, e
   * sobravam mensagens de limite para quem já tinha pago.
   */
  function renderPlanBadge() {
    const logado = Boolean(appState.currentUser);
    const isPro = isUserPro();
    const status = appState.userProfile?.subscription_status;

    document.body.classList.toggle('esta-logada', logado);
    document.body.classList.toggle('esta-deslogada', !logado);
    document.body.classList.toggle('plano-pro', isPro);
    document.body.classList.toggle('plano-free', !isPro);

    const planoNoMenu = document.getElementById('menuPlanoAtual');
    if (planoNoMenu) {
      planoNoMenu.textContent = !logado
        ? 'Entre para começar'
        : (isPro ? 'Plano Pro ativo' : 'Plano gratuito');
    }

    if (loggedUserPlanBadge) {
      let label = 'Gratuito';
      if (isPro) {
        label = appState.userProfile?.plano === 'premium_anual' ? '⭐ Pro Anual' : '⭐ Pro Mensal';
        if (status === 'canceling') label += ' • cancelamento agendado';
        if (status === 'past_due') label += ' • pagamento pendente';
      }
      loggedUserPlanBadge.textContent = label;
    }

    // A pílula "Premium" vira indicador de status para quem já assina
    // O item do menu não muda de nome (era reescrito para "Premium" e apagava
    // o rótulo "Planos"); só o título de apoio reflete o estado da assinatura.
    if (navBtns.premium) {
      navBtns.premium.title = isPro
        ? 'Sua assinatura Pro está ativa — ver detalhes'
        : 'Conhecer os planos';
    }

    // Rotinas longas deixam de exibir cadeado
    durationBtns.forEach(btn => {
      const minutes = parseInt(btn.getAttribute('data-minutes'), 10);
      if (minutes > 3) btn.classList.toggle('pro-locked', !isPro);
    });

    if (btnManageSubscription) {
      btnManageSubscription.classList.toggle('hidden', !appState.userProfile?.stripe_customer_id);
    }
    if (btnDeleteAccount) {
      btnDeleteAccount.classList.toggle('hidden', !logado);
    }
    // "Já paguei e não recebi" só faz sentido para quem está logada e sem Pro
    if (btnSyncPlan) {
      btnSyncPlan.classList.toggle('hidden', !logado || isPro);
    }

    renderizarPainelDaAssinante();
    if (views.dashboard?.classList.contains('active')) renderizarPainel();
    if (views.settings?.classList.contains('active')) renderizarConfiguracoes();

    // A conversa e recurso pago: se a view estiver aberta, revalida na hora
    if (views.chat && views.chat.classList.contains('active')) prepararChat();
  }

  async function syncCloudHistory(userId) {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!Array.isArray(data)) return;

      const cloudEntries = data.map(row => ({
        id: row.id,
        title: row.triaged_data?.title || 'Diário Noturno',
        date: row.created_at,
        rawText: row.raw_text,
        counselingAdvice: row.triaged_data?.counselingAdvice || '',
        sleepMood: row.sleep_mood,
        bedTime: row.sleep_times?.bedTime || null,
        wakeTime: row.sleep_times?.wakeTime || null,
        gratitude: row.triaged_data?.gratitude || [],
        tomorrow: row.triaged_data?.tomorrow || [],
        wait: row.triaged_data?.wait || [],
        release: row.triaged_data?.release || [],
        rumination: row.triaged_data?.rumination || []
      }));

      // Mescla nuvem + local em vez de sobrescrever: registros feitos offline
      // (ou antes de a sincronização terminar) não podem se perder.
      const merged = mergeHistories(cloudEntries, appState.history);
      appState.history = merged;
      saveLocalHistory(merged);
      updateHistoryUI();
    } catch (e) {
      console.warn('Erro ao sincronizar histórico:', e);
    }
  }

  /**
   * Une duas listas de registros sem duplicar. A identidade é o `id` do banco
   * quando existe; caso contrário, data + texto original.
   */
  function mergeHistories(primary, secondary) {
    const keyOf = (entry) => entry.id || `${entry.date}::${(entry.rawText || '').slice(0, 120)}`;
    const seen = new Set();
    const merged = [];

    [...(primary || []), ...(secondary || [])].forEach(entry => {
      if (!entry) return;
      const key = keyOf(entry);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(entry);
    });

    merged.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return merged.slice(0, 200);
  }

  function showAuthFeedback(msg, type) {
    if (!authFeedbackMsg) return;
    authFeedbackMsg.textContent = msg;
    authFeedbackMsg.className = `auth-feedback ${type}`;
    authFeedbackMsg.classList.remove('hidden');
  }

  // ==========================================
  // CHIPS DE PROMPT
  // ==========================================
  function initPromptChips() {
    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (journalInput.value.trim().length > 0) {
          journalInput.value += ' ' + text;
        } else {
          journalInput.value = text;
        }
        btnProcessDump.disabled = false;
        journalInput.focus();
      });
    });
  }

  // ==========================================
  // VERIFICAÇÃO DE PLANOS & LIMITES (PRO vs GRATUITO)
  // ==========================================
  const FREE_ENTRIES_PER_DAY = 1;

  /**
   * O plano Pro vem EXCLUSIVAMENTE do perfil no banco, que por sua vez só é
   * escrito pelo webhook do Stripe (service role). Nada no navegador concede
   * acesso pago — localStorage e sessão do cliente não são fontes de verdade.
   */
  function isUserPro() {
    const profile = appState.userProfile;
    if (!profile) return false;

    const planoPago = profile.plano === 'premium_mensal' || profile.plano === 'premium_anual';
    if (!planoPago) return false;

    // Assinatura ativa, em teste gratuito ou já cancelada mas ainda dentro do período pago
    const statusValido = ['active', 'trialing', 'canceling', 'past_due'];
    return !profile.subscription_status || statusValido.includes(profile.subscription_status);
  }

  /** Data de hoje no fuso da usuária, em YYYY-MM-DD. */
  function getTodayDateString(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Conta no servidor quantos registros a usuária já fez hoje.
   * Essa é a contagem autoritativa do limite gratuito para quem está logada.
   */
  async function refreshDailyUsageFromServer() {
    if (!supabase || !appState.currentUser) {
      appState.dailyEntriesToday = null;
      checkDailyLimitUI();
      return;
    }

    try {
      // Início do dia local convertido para o instante absoluto correspondente
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', appState.currentUser.id)
        .gte('created_at', startOfDay.toISOString());

      if (!error && typeof count === 'number') {
        appState.dailyEntriesToday = count;
      }
    } catch (e) {
      console.warn('Erro ao consultar uso diário:', e);
    } finally {
      checkDailyLimitUI();
    }
  }

  function hasReachedDailyFreeLimit() {
    if (isUserPro()) return false; // Assinantes Pro possuem registros ilimitados

    const todayStr = getTodayDateString();

    // 1. Usuária logada: só a contagem do servidor e o histórico da conta valem.
    //    O marcador local é de visitante e NÃO pode contaminar uma conta —
    //    era o que fazia o aviso de "1 por dia" aparecer para quem tinha
    //    acabado de entrar sem ter registrado nada naquele dia.
    // Só existe uso autenticado: a contagem do servidor é a referência.
    if (typeof appState.dailyEntriesToday === 'number') {
      return appState.dailyEntriesToday >= FREE_ENTRIES_PER_DAY;
    }

    // 3. Confere o histórico em memória usando SEMPRE o fuso local nos dois lados
    //    (comparar data local com data UTC bloqueava a usuária um dia antes).
    if (Array.isArray(appState.history) && appState.history.length > 0) {
      const todayEntries = appState.history.filter(item => {
        const itemTimestamp = item.timestamp || item.date;
        if (!itemTimestamp) return false;
        return getTodayDateString(itemTimestamp) === todayStr;
      });
      if (todayEntries.length >= FREE_ENTRIES_PER_DAY) return true;
    }

    return false;
  }

  function markDailyDumpCompleted() {
    try {
      localStorage.setItem('desliguese_last_dump_date', getTodayDateString());
    } catch (e) {}
    if (typeof appState.dailyEntriesToday === 'number') {
      appState.dailyEntriesToday += 1;
    }
    checkDailyLimitUI();
  }

  function checkDailyLimitUI() {
    const isLimitReached = hasReachedDailyFreeLimit();
    if (isLimitReached) {
      if (dailyLimitBanner) dailyLimitBanner.classList.remove('hidden');
    } else {
      if (dailyLimitBanner) dailyLimitBanner.classList.add('hidden');
    }

    // Garante que o container de escrita NUNCA fique bloqueado para digitação
    if (dumpInputContainer) {
      dumpInputContainer.style.opacity = '1';
      dumpInputContainer.style.pointerEvents = 'auto';
    }
    if (btnProcessDump && journalInput) {
      btnProcessDump.disabled = journalInput.value.trim().length <= 3;
      btnProcessDump.title = 'Processar pensamentos';
    }

    // Atualiza badges visuais nos botões de duração
    const isPro = isUserPro();
    durationBtns.forEach(btn => {
      const minutes = parseInt(btn.getAttribute('data-minutes'), 10);
      if (minutes > 3) {
        btn.classList.toggle('pro-locked', !isPro);
      }
    });
  }

  // ==========================================
  // ENTRADA POR VOZ EM TEMPO REAL DE ALTA PRECISÃO
  // ==========================================
  function formatSpokenPunctuation(text) {
    if (!text) return '';
    return text
      .replace(/\s+ponto final/gi, '.')
      .replace(/\s+ponto e vírgula/gi, ';')
      .replace(/\s+ponto de interrogação/gi, '?')
      .replace(/\s+ponto de exclamação/gi, '!')
      .replace(/\s+ponto\b/gi, '.')
      .replace(/\s+vírgula\b/gi, ',')
      .replace(/\s+virgula\b/gi, ',')
      .replace(/\s+dois pontos\b/gi, ':')
      .replace(/\s+nova linha\b/gi, '\n')
      .replace(/\s+novo parágrafo\b/gi, '\n\n')
      .replace(/\s+parágrafo\b/gi, '\n\n')
      // Corrige primeira letra após quebra ou pontuação
      .replace(/(^\s*|\.\s+|\?\s+|\!\s+)([a-zà-ú])/g, (match, sep, letter) => sep + letter.toUpperCase());
  }

  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (btnVoiceInput) {
        btnVoiceInput.title = 'Ditado por voz não suportado neste navegador. Recomendamos usar o Google Chrome ou Safari.';
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    appState.recognition = recognition;

    recognition.onstart = () => {
      appState.isRecording = true;
      btnVoiceInput?.classList.add('recording');
      if (voiceBtnLabel) voiceBtnLabel.textContent = '🎙️ Ouvindo... (toque para pausar)';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + ' ';
        } else {
          interimTranscript += transcriptPart;
        }
      }

      if (finalTranscript) {
        appState.voiceBaseText += (appState.voiceBaseText && !appState.voiceBaseText.endsWith(' ') ? ' ' : '') + finalTranscript;
      }

      const combinedText = appState.voiceBaseText + (interimTranscript ? ' ' + interimTranscript : '');
      const formatted = formatSpokenPunctuation(combinedText.trim());

      journalInput.value = formatted;
      journalInput.scrollTop = journalInput.scrollHeight;
      btnProcessDump.disabled = !formatted;
    };

    recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showToast('Permissão de microfone negada. Libere o acesso ao microfone nas configurações do navegador para ditar seus pensamentos.', 'error', 9000);
        stopRecording();
      }
    };

    recognition.onend = () => {
      // Auto-restart se o usuário não tiver clicado para parar deliberadamente
      if (appState.userWantsRecording) {
        try {
          recognition.start();
        } catch (e) {
          stopRecording();
        }
      } else {
        stopRecording();
      }
    };

    btnVoiceInput?.addEventListener('click', () => {
      if (appState.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  function startRecording() {
    if (!appState.recognition) return;
    appState.userWantsRecording = true;
    appState.voiceBaseText = journalInput.value.trim();
    try {
      appState.recognition.start();
    } catch (e) {
      console.warn('Erro ao iniciar reconhecimento:', e);
    }
  }

  function stopRecording() {
    appState.userWantsRecording = false;
    appState.isRecording = false;
    btnVoiceInput?.classList.remove('recording');
    if (voiceBtnLabel) voiceBtnLabel.textContent = 'Falar pensamentos';
    if (appState.recognition) {
      try { appState.recognition.stop(); } catch (e) {}
    }
    // Formata o texto final no encerramento
    if (journalInput) {
      journalInput.value = formatSpokenPunctuation(journalInput.value.trim());
      btnProcessDump.disabled = !journalInput.value.trim();
    }
  }

  // ==========================================
  // PROCESSAMENTO COM IA REAL (GEMINI) + FALLBACK LOCAL
  // ==========================================

  // Detector local de crise (safety net — funciona mesmo sem API)
  // Expressões que indicam risco real. Evitamos termos soltos como "matar",
  // que produziam falso positivo em "matar a saudade", "matar aula" ou
  // "matar o tempo" — e disparavam um alerta de suicídio sem motivo.
  const CRISIS_PATTERNS = [
    /\bme\s+matar\b/,
    /\bmatar\s+(a\s+mim|eu)\b/,
    /\btirar\s+(a\s+)?minha\s+vida\b/,
    /\bsuicid/,
    /\bsuicíd/,
    /\bquero\s+morrer\b/,
    /\bvontade\s+de\s+morrer\b/,
    /\bn[ãa]o\s+quero\s+mais\s+viver\b/,
    /\bn[ãa]o\s+aguento\s+mais\s+viver\b/,
    /\bcansei\s+de\s+viver\b/,
    /\bdesistir\s+da\s+vida\b/,
    /\bacabar\s+com\s+(tudo|a\s+minha\s+vida)\b/,
    /\bsumir\s+do\s+mundo\b/,
    /\bquero\s+desaparecer\b/,
    /\b(seria|ia\s+ser)\s+melhor\s+sem\s+mim\b/,
    /\bmelhor\s+mort[ao]\b/,
    /\bn[ãa]o\s+(tenho|vejo)\s+(motivo|sentido)\s+(pra|para)\s+viver\b/,
    /\bn[ãa]o\s+vejo\s+sa[íi]da\b/,
    /\boverdose\b/,
    /\bme\s+(cortar|cortando|machucar|machucando|ferir)\b/,
    /\bautomutila/,
    /\bautoles[ãa]o\b/,
    /\bme\s+enforcar\b/,
    /\bpular\s+d[aoe]\s+(pr[ée]dio|janela|ponte|viaduto)\b/,
    /\btomar\s+veneno\b/
  ];

  function detectLocalCrisis(text) {
    const lower = (text || '').toLowerCase();
    return CRISIS_PATTERNS.some(re => re.test(lower));
  }

  async function handleProcessDump() {
    const text = journalInput.value.trim();
    if (!text) return;

    // VERIFICAÇÃO ESTRITA DE PLANO & LIMITE DIÁRIO:
    // Usuários no Plano Gratuito (com ou sem login) têm direito a 1 registro por dia.
    // O 2º registro no mesmo dia requer a assinatura do Plano Pro.
    if (hasReachedDailyFreeLimit()) {
      if (modalTrialBlock) {
        const trialTitle = modalTrialBlock.querySelector('.modal-title');
        const trialSub = modalTrialBlock.querySelector('.modal-subtitle');
        if (trialTitle) trialTitle.textContent = '🌙 Limite Diário Atingido (1/1 no Plano Gratuito)';
        if (trialSub) trialSub.textContent = 'Você já completou o seu descarrego mental de hoje! Para desabafar quantas vezes quiser ao longo do dia, ter IA ilimitada e histórico completo, assine o Desligue-se Pro.';
        openModal(modalTrialBlock);
      } else if (modalPremium) {
        openModal(modalPremium);
      }
      return;
    }

    if (appState.isRecording) {
      stopRecording();
    }

    let title = journalTitleInput.value.trim();
    if (!title) {
      title = generateAutoTitle(text);
    }

    appState.currentDumpTitle = title;
    appState.currentDumpText = text;
    showStep('loading');

    // Marca o registro diário concluído
    markDailyDumpCompleted();

    // Detecção de crise local (safety net — roda SEMPRE, antes da API)
    const localCrisis = detectLocalCrisis(text);

    try {
      // Tenta classificação com IA real via Gemini API (serverless proxy)
      const triaged = await classifyWithGemini(text, title);
      // Marca crise se a IA detectou OU se o detector local detectou
      triaged.crisisDetected = triaged.crisisDetected || localCrisis;
      appState.currentTriagedData = triaged;
      renderTriagedResults(triaged);
      showStep('result');
    } catch (err) {
      console.warn('Gemini API indisponível, usando classificador local:', err.message);
      // Fallback: classificador local baseado em heurísticas
      const triaged = analyzeThoughtsWithTCCI(text, title);
      triaged.crisisDetected = localCrisis;
      // Se crise detectada localmente, injeta conselho de emergência
      if (localCrisis) {
        triaged.counselingAdvice = 'Eu ouço você e a sua dor é real. Você não está sozinha neste momento. ' +
          'Por favor, ligue agora para o CVV (Centro de Valorização da Vida) no 188 — funciona 24 horas, é gratuito e sigiloso. ' +
          'Você também pode acessar www.cvv.org.br para conversar por chat. ' +
          'Se estiver em perigo imediato, ligue para o SAMU no 192. ' +
          'A sua vida tem um valor imenso e existem pessoas que querem te ajudar a atravessar esse momento.';
      }
      appState.currentTriagedData = triaged;
      renderTriagedResults(triaged);
      showStep('result');
    }
  }

  /**
   * Classifica pensamentos via Gemini API (serverless proxy seguro)
   * Retorna o objeto triaged com as 5 categorias TCC-I + carta de apoio
   * Lança erro se a API não responder (para acionar fallback local)
   */
  async function classifyWithGemini(text, title) {
    // Numa hospedagem sem funções serverless não existe IA: vamos direto para
    // o classificador local em vez de gastar 28s esperando um 405 do nginx.
    if (isStaticOnlyHost()) {
      throw new Error('Funções /api indisponíveis nesta hospedagem estática.');
    }

    const controller = new AbortController();
    // O servidor tem orçamento de ~22s (ver api/classify.js). O cliente espera
    // um pouco mais para não abortar uma resposta que já está a caminho —
    // abortar cedo demais fazia a IA nunca ser usada, caindo sempre no local.
    const timeout = setTimeout(() => controller.abort(), 28000);

    try {
      const token = await getAccessToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(resolveApiUrl('/api/classify'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, title }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.fallback) throw new Error('API requested fallback');
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Validar e normalizar a resposta da IA
      return {
        title: data.title || title || 'Diário Noturno',
        date: new Date().toISOString(),
        rawText: text,
        crisisDetected: data.crisisDetected === true,
        counselingAdvice: data.counselingAdvice || '',
        // O banco só aceita terrible|medium|great (ou nulo). A IA às vezes
        // devolve texto livre, então normalizamos aqui e descartamos o resto.
        sleepMood: ['terrible', 'medium', 'great'].includes(data.sleepMood) ? data.sleepMood : null,
        gratitude: Array.isArray(data.gratitude) ? data.gratitude : [],
        tomorrow: Array.isArray(data.tomorrow) ? data.tomorrow.map(t => ({ ...t, done: false })) : [],
        wait: Array.isArray(data.wait) ? data.wait : [],
        release: Array.isArray(data.release) ? data.release : [],
        rumination: Array.isArray(data.rumination) ? data.rumination : []
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err; // Propaga para acionar o fallback local
    }
  }

  function generateAutoTitle(text) {
    const lower = text.toLowerCase();

    // 1. Títulos de Conquista / Amor / Alegria / Gratidão
    if (
      lower.includes('namorada incrível') || lower.includes('namorado incrível') ||
      lower.includes('maravilhosa') || lower.includes('feliz') || lower.includes('conquista') ||
      lower.includes('vitória') || lower.includes('festa') || lower.includes('comemorei') ||
      lower.includes('passeio') || lower.includes('pizza') || lower.includes('ótimo') ||
      lower.includes('grata') || lower.includes('gratidão')
    ) {
      return 'Momentos Felizes, Amor & Gratidão';
    }

    // 2. Títulos de Luto / Término / Rompimento (Apenas quando explícito)
    if (
      lower.includes('término') || lower.includes('terminou') || lower.includes('separação') ||
      lower.includes('separou') || lower.includes('meu ex') || lower.includes('minha ex') ||
      lower.includes('desamor') || lower.includes('coração partido')
    ) {
      return 'Cuidando do Coração & Acolhendo o Fim';
    } else if (lower.includes('triste') || lower.includes('choro') || lower.includes('chorar') || lower.includes('vazio') || lower.includes('sozinha')) {
      return 'Acolhimento Noturno & Desabafo Sincero';
    } else if (lower.includes('cabelo') || lower.includes('mudar') || lower.includes('estilo') || lower.includes('roupa') || lower.includes('corpo')) {
      return 'Inspiração, Autocuidado & Reflexão';
    } else if (lower.includes('trabalho') || lower.includes('reunião') || lower.includes('chefe') || lower.includes('empresa')) {
      return 'Fechamento do Trabalho & Prioridades';
    } else if (lower.includes('família') || lower.includes('mãe') || lower.includes('filho') || lower.includes('criança')) {
      return 'Cuidado Familiar & Rotina de Casa';
    } else if (lower.includes('conversa') || lower.includes('discussão') || lower.includes('briga')) {
      return 'Desapegando de Diálogos do Dia';
    } else if (lower.includes('medo') || lower.includes('ansios') || lower.includes('futuro')) {
      return 'Serenidade diante das Incertezas';
    } else {
      const now = new Date();
      const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      return `Fechamento de ${dias[now.getDay()]}`;
    }
  }

  // Gera carta de conselho altamente personalizada, combinando abertura, validação com termos reais, conselho e bênção de sono
  function generateCounselingAdvice(text, fullLower, hasPositive, hasNegative) {
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // CENÁRIO 1: DIA COM COISAS BOAS, AMOR E GRATIDÃO PREDOMINANTES
    if (hasPositive && !hasNegative) {
      const openings = [
        'Que alegria imensa ler o seu relato e sentir a luz que o seu coração está emanando hoje!',
        'Noites como esta são presentes raros: quando o dia termina com amor, sorrisos e sensação de plenitude...',
        'É tão lindo ver você reconhecendo as coisas boas da vida e celebrando esses momentos especiais...'
      ];
      const validations = [
        'Guardar no peito o afeto de quem a gente ama e o orgulho das nossas vitórias é a forma mais pura de nutrir a alma.',
        'A felicidade mora nos detalhes, e você soube saborear a doçura de estar com quem te faz bem.',
        'O seu coração está em paz e você merece cada pedacinho dessa alegria e desse carinho.'
      ];
      const advices = [
        'Leve essa sensação gostosa de gratidão para o seu travesseiro. Deixe que a dopamina e a ocitocina acalmem o seu corpo.',
        'Permita que essas memórias boas formem um escudo de serenidade ao redor do seu sono esta noite.',
        'Sorria ao fechar os olhos, sabendo que a vida tem momentos verdadeiramente mágicos.'
      ];
      const closings = [
        'Durma com o coração quentinho e repleto de amor. Que você tenha sonhos lindos e revigorantes.',
        'Entregue-se ao descanso leve com a certeza de que você é muito amada e abençoada. Boa noite!',
        'Descanse em paz e renove suas energias para viver mais dias tão especiais quanto o de hoje.'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 2: DIA MISTO (DESAFIOS + MOMENTOS BONS / COMPANHIA AMADA)
    if (hasPositive && hasNegative) {
      const openings = [
        'A vida é feita desse mosaico: dias em que temos desafios cansativos, mas também temos a sorte de ter amor e coisas boas para nos sustentar...',
        'Que especial ver que, mesmo com a correria e o cansaço do dia, você encontrou motivos para sorrir e se sentir acolhida...',
        'Reconheço que você enfrentou momentos exigentes hoje, mas é maravilhoso ver como os momentos bons foram a sua âncora...'
      ];
      const validations = [
        'As pendências e cansaços do trabalho ou da rotina vão passar, mas o afeto verdadeiro e as suas vitórias permanecem.',
        'O seu cérebro pode até tentar focar no que deu trabalho, mas a sua história hoje provou que há muito mais luz e carinho ao seu redor.',
        'Ter quem amamos ao lado transforma qualquer dia difícil em uma caminhada mais leve.'
      ];
      const advices = [
        'Solte as cobranças do dia e foque no calor desses momentos felizes antes de dormir.',
        'Coloque o foco do seu coração nas vitórias que você teve hoje e deixe as preocupações para a luz do dia.',
        'Durma sabendo que você venceu os desafios e ainda compartilhou amor.'
      ];
      const closings = [
        'Abrace a paz da noite, sinta a gratidão pelo dia e durma com o peito sereno. Bom descanso!',
        'Que o amor e as boas memórias de hoje embale o seu sono mais profundo. Boa noite!',
        'Descanse o corpo e a mente. Amanhã continuará sendo um dia lindo.'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 3: TÉRMINO REAL / ROMPIMENTO (APENAS QUANDO NEGATIVO EXPLÍCITO)
    const isExplicitBreakup = (
      fullLower.includes('término') || fullLower.includes('terminou') || fullLower.includes('terminar') ||
      fullLower.includes('separação') || fullLower.includes('separou') || fullLower.includes('meu ex') ||
      fullLower.includes('minha ex') || fullLower.includes('desamor') || fullLower.includes('coração partido') ||
      (fullLower.includes('namorad') && (fullLower.includes('acabou') || fullLower.includes('briga') || fullLower.includes('traição') || fullLower.includes('dor')))
    );

    if (isExplicitBreakup) {
      const openings = [
        'Minha querida, sinto daqui o peso que o seu peito está carregando ao escrever sobre esse término...',
        'No silêncio da noite, a dor de um rompimento reverbera com uma força que parece nos engolir...',
        'Sei o quanto dói quando uma história que a gente construiu com carinho chega ao fim...',
        'É tão corajoso da sua parte colocar em palavras essa dor que está aí dentro...'
      ];
      const validations = [
        'Quero que você guarde isso com carinho: o que você está sentindo agora não diminui em nada a mulher maravilhosa que você é. Você amou de verdade, foi honesta e entregou seu coração.',
        'Essa dor no peito é o seu coração processando um luto real. Não tente reprimir suas lágrimas ou fingir que está tudo bem no escuro do quarto. O seu sofrimento é legítimo.',
        'A saudade e o vazio tentam nos convencer de que não vamos dar conta, mas isso é só o impacto do choque inicial. Você é inteira e sua vida tem uma infinidade de capítulos pela frente.'
      ];
      const advices = [
        'Você não precisa ter todas as respostas esta noite e não precisa "superar" nada antes de dormir. Apenas coloque a mão no seu peito, sinta seu coração bater e respire fundo.',
        'Permita-se viver um dia de cada vez, sem se cobrar pressa para cicatrizar. Seu único compromisso agora é ser gentil consigo mesma e se acolher.',
        'Lembre-se de que o fim de um relacionamento não é o fim de quem você é. Você já era incrível antes e continuará sendo depois.'
      ];
      const closings = [
        'Abrace seu travesseiro com ternura, feche os olhos devagar e deixe a noite cuidar do seu descanso. Você é forte e amanhã será um dia mais suave.',
        'Solte o peso das lembranças por esta madrugada. Dê ao seu corpo a trégua que ele merece. Durma em paz, você é acolhida aqui.',
        'Esta tempestade vai passar e você vai florescer de novo. Por hoje, apenas deite-se e entregue-se ao aconchego da cama.'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 4: DÚVIDAS PESSOAIS / CABELO / VISUAL / AUTOESTIMA
    if (
      fullLower.includes('cabelo') || fullLower.includes('cor de cabelo') || fullLower.includes('cor do cabelo') ||
      fullLower.includes('pintar') || fullLower.includes('cortar') || fullLower.includes('roupa') ||
      fullLower.includes('vestido') || fullLower.includes('look') || fullLower.includes('estilo') ||
      fullLower.includes('mudar de visual') || fullLower.includes('autoestima') || fullLower.includes('meu corpo')
    ) {
      let hairMention = 'mudar o visual';
      if (fullLower.includes('loira')) hairMention = 'ficar loira';
      else if (fullLower.includes('ruiva') || fullLower.includes('ruivo')) hairMention = 'ficar ruiva';
      else if (fullLower.includes('morena')) hairMention = 'o tom moreno';
      else if (fullLower.includes('cabelo')) hairMention = 'a mudança no cabelo';

      const openings = [
        `Que delícia ver você pensando em ${hairMention} e em novas formas de cuidar de você!`,
        `Pensar em renovação e em novas fases para a sua imagem é algo tão vibrante e cheio de vida...`,
        `Querer transformar o visual ou experimentar novos estilos é um reflexo lindo da sua busca por renovação...`
      ];
      const validations = [
        'Dúvidas sobre estética e estilo são naturais quando queremos abrir novos ciclos, mas a mente cansada da noite costuma amplificar inseguranças desnecessárias.',
        'Às vezes a gente busca mudar por fora o que já está se transformando por dentro, e isso é um processo lindo de autodescoberta.',
        'Lembre-se de que qualquer escolha visual deve ser uma celebração da sua autenticidade, e não uma cobrança para agradar aos outros.'
      ];
      const advices = [
        'Decisões sobre a sua imagem ficam muito mais leves, divertidas e certeiras amanhã sob a luz natural do dia e com a cabeça descansada.',
        'Guardamos essa ideia e inspiração com carinho no seu cofre digital para você pesquisar referências e se curtir com calma pela manhã.',
        'Olhe para você com amor: você já é linda, autêntica e única exatamente no ponto em que está agora.'
      ];
      const closings = [
        'Solte as indecisões por hoje, relaxe os músculos do rosto e durma com o coração sereno. Você merece esse repouso.',
        'Amanhã você se olha no espelho com novos olhos e muito amor-próprio. Tenha uma noite linda e revigorante.',
        'Desligue as dúvidas e entregue-se ao sono restaurador. Bom descanso!'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 5: TRISTEZA PROFUNDA / CHORO / SOLIDÃO / RUIM
    if (
      fullLower.includes('está ruim') || fullLower.includes('tá ruim') || fullLower.includes('muito mal') ||
      fullLower.includes('triste') || fullLower.includes('chorando') || fullLower.includes('chorei') ||
      fullLower.includes('vazio') || fullLower.includes('sozinha') || fullLower.includes('solidão') ||
      fullLower.includes('angústia') || fullLower.includes('sem forças') || fullLower.includes('esgotada')
    ) {
      const openings = [
        'Meu abraço mais sincero e apertado para você agora que as coisas parecem tão pesadas...',
        'Sei que hoje foi um dia difícil e que o cansaço parece ter tomado conta de tudo...',
        'Ouvir seu desabafo me faz querer te lembrar de uma verdade que a gente esquece quando está triste...'
      ];
      const validations = [
        'Se as lágrimas vierem, não as segure: chorar não é fraqueza, é a maneira do corpo aliviar o excesso de cortisol e lavar a dor.',
        'Você tem carregado tanto peso nos ombros e não precisa sustentar uma postura inabalável o tempo todo. É permitido desabar para se reconstruir.',
        'Sentir-se sozinha ou no escuro faz parte das fases difíceis, mas esse momento de dor não é quem você é; é apenas o que você está atravessando.'
      ];
      const advices = [
        'Não tente resolver a sua vida esta noite. O seu único papel agora é se deitar, respirar devagar e se permitir ser acolhida.',
        'Dê a si mesma o mesmo carinho e paciência que você daria para a sua melhor amiga se ela estivesse chorando.',
        'Lembre-se de que até a noite mais escura sempre dá lugar à manhã. Você é forte e vai passar por isso.'
      ];
      const closings = [
        'Sinta o conforto seguro da sua cama, relaxe o peito e permita que o sono traga alívio para a sua alma. Você é preciosa.',
        'Descanse em paz sabendo que você não está sozinha. Nós guardamos suas dores aqui. Durma bem.',
        'Amanhã o dia começará com novos ares. Entregue-se ao sono com amor.'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 6: TRABALHO / SOBRECARGA / REUNIÃO / CHEFE
    if (
      fullLower.includes('trabalho') || fullLower.includes('reunião') || fullLower.includes('chefe') ||
      fullLower.includes('empresa') || fullLower.includes('relatório') || fullLower.includes('prazo') ||
      fullLower.includes('meta') || fullLower.includes('cliente') || fullLower.includes('sobrecarregada')
    ) {
      const openings = [
        'Você tem se desdobrado em mil para dar conta de tantas responsabilidades e entregas...',
        'Pensar no trabalho e nas reuniões na hora de dormir é o jeito mais comum da mente se sabotar...',
        'Reconheço o quanto você se dedica e como você leva a sério seus compromissos...'
      ];
      const validations = [
        'Mas lembre-se: nenhum trabalho, relatório ou expectativa externa vale o sacrifício da sua saúde mental e do seu sono.',
        'O trabalho nunca acaba, e tentar resolvê-lo mentalmente na cama só rouba a clareza de que você vai precisar amanhã.',
        'Você já deu o seu melhor hoje e não precisa carregar a empresa inteira nas suas costas para provar a sua competência.'
      ];
      const advices = [
        'Tudo o que é prioridade já foi catalogado na sua lista de amanhã. O que ficou para trás pode esperar.',
        'Desconecte o seu cérebro do modo "resolução de problemas". A sua mente funciona muito melhor após 8 horas de repouso.',
        'Orgulhe-se da sua dedicação, mas coloque uma cerca sagrada ao redor da sua noite: agora é hora exclusiva de você.'
      ];
      const closings = [
        'Solte os prazos, relaxe a mandíbula e entregue-se ao descanso merecido. Você foi gigante hoje.',
        'Amanhã você resolverá tudo com maestria e energia renovada. Durma em paz.',
        'Feche os olhos com a certeza do dever cumprido. Tenha uma noite profunda e revigorante.'
      ];
      return `${rand(openings)} ${rand(validations)} ${rand(advices)} ${rand(closings)}`;
    }

    // CENÁRIO 7: PADRÃO DINÂMICO ACOLHEDOR
    const generalOpenings = [
      'Você concluiu mais uma jornada com bravura, sensibilidade e dedicação.',
      'Chegamos ao fim de mais um dia e você merece reconhecer todo o esforço que colocou nas suas horas.',
      'Parabéns por tirar esse momento para desabafar e descarregar sua mente antes de dormir.'
    ];
    const generalValidations = [
      'Tudo o que passou pela sua cabeça foi ouvido, organizado e guardado com segurança aqui.',
      'Você não precisa carregar lembretes, dúvidas ou tensões enquanto descansa.',
      'O seu corpo e a sua mente trabalharam muito por você hoje e merecem esse alívio.'
    ];
    const generalAdvices = [
      'Agradeça a si mesma por ter chegado até aqui e dê permissão ao seu corpo para desligar.',
      'Amanhã o sol nasce de novo e você recomeça no seu próprio ritmo, com a mente descansada.',
      'Sua mente está limpa e protegida. Entregue-se ao sono com leveza.'
    ];
    const generalClosings = [
      'Durma profundamente, renove suas energias e tenha sonhos tranquilos. Você foi suficiente hoje.',
      'Que a sua noite seja um refúgio de paz, silêncio e restauração. Bom descanso!',
      'Feche os olhos devagar, sinta o aconchego da cama e durma com serenidade.'
    ];
    return `${rand(generalOpenings)} ${rand(generalValidations)} ${rand(generalAdvices)} ${rand(generalClosings)}`;
  }

  function analyzeThoughtsWithTCCI(text, title) {
    const fragments = text
      .split(/(?:[.,;!\n\?]+|\be\s+também\b|\be\s+não\b|\be\s+preciso\b|\be\s+tenho\b)/gi)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    const gratitude = [];
    const tomorrow = [];
    const wait = [];
    const release = [];
    const rumination = [];

    const fullLower = text.toLowerCase();

    // Detecção refinada de polaridade emocional
    const isExplicitBreakup = (
      fullLower.includes('término') || fullLower.includes('terminou') || fullLower.includes('terminar') ||
      fullLower.includes('separação') || fullLower.includes('separou') || fullLower.includes('meu ex') ||
      fullLower.includes('minha ex') || fullLower.includes('desamor') || fullLower.includes('coração partido') ||
      (fullLower.includes('namorad') && (fullLower.includes('acabou') || fullLower.includes('briga feia') || fullLower.includes('traição') || fullLower.includes('dor de término')))
    );

    fragments.forEach(frag => {
      const fLower = frag.toLowerCase();

      // 1. COISAS BOAS / GRATIDÃO / AFETO / CONQUISTAS (Psicologia Positiva)
      const isPositiveGratitude = (
        fLower.includes('incrível') || fLower.includes('maravilhos') || fLower.includes('linda') ||
        fLower.includes('lindo') || fLower.includes('feliz') || fLower.includes('conquista') ||
        fLower.includes('vitória') || fLower.includes('festa') || fLower.includes('comemorei') ||
        fLower.includes('passeio') || fLower.includes('pizza') || fLower.includes('ótimo') ||
        fLower.includes('grata') || fLower.includes('gratidão') || fLower.includes('alegria') ||
        fLower.includes('orgulho') || fLower.includes('divertido') || fLower.includes('amei') ||
        fLower.includes('adorei') || fLower.includes('deu certo') || fLower.includes('sucesso') ||
        fLower.includes('carinho') || (fLower.includes('namorad') && (fLower.includes('incrível') || fLower.includes('maravilhosa') || fLower.includes('linda') || fLower.includes('amo') || fLower.includes('carinho') || fLower.includes('doce') || fLower.includes('especial')))
      );

      if (isPositiveGratitude && !isExplicitBreakup) {
        gratitude.push({
          raw: frag,
          note: 'Que momento lindo! Celebrar essa vitória e guardar esse afeto antes de dormir estimula a ocitocina e ancora sua noite na paz.'
        });
      }
      // 2. TAREFAS PRÁTICAS COM COMPROMISSOS (EX: LEVAR NAMORADA AO CABELEREIRO)
      else if (
        fLower.includes('amanhã') || fLower.includes('ligar') || fLower.includes('pagar') ||
        fLower.includes('comprar') || fLower.includes('enviar') || fLower.includes('reunião') ||
        fLower.includes('médic') || fLower.includes('escola') || fLower.includes('cedo') ||
        fLower.includes('prioridade') || fLower.includes('relatório') ||
        fLower.startsWith('levar ') || fLower.startsWith('buscar ') || fLower.startsWith('tenho que ') ||
        fLower.startsWith('preciso ') || fLower.includes('fazer o cabelo as') || fLower.includes('fazer o cabelo às')
      ) {
        tomorrow.push({ raw: frag, action: formatActionItem(frag), done: false });
      }
      // 3. TÉRMINO OU LUTO AMOROSO REAL (APENAS QUANDO EXPLÍCITO)
      else if (isExplicitBreakup && (
        fLower.includes('término') || fLower.includes('terminou') || fLower.includes('separação') ||
        fLower.includes('ex ') || fLower.includes('desamor') || fLower.includes('coração partido') ||
        fLower.includes('ruim') || fLower.includes('dor') || fLower.includes('saudade') || fLower.includes('chorei')
      )) {
        rumination.push({
          raw: frag,
          reframe: 'Términos doem de verdade e a noite é o momento em que a saudade mais pesa. Seu coração está em luto e essa dor é legítima. Você não precisa "superar" nada hoje à noite. Abrace seu travesseiro com carinho e se dê colo.'
        });
      }
      // 4. TRISTEZA PROFUNDA, CHORO OU SOLIDÃO
      else if (
        fLower.includes('está ruim') || fLower.includes('tá ruim') || fLower.includes('muito mal') ||
        fLower.includes('triste') || fLower.includes('chorando') || fLower.includes('chorei') ||
        fLower.includes('vazio') || fLower.includes('sozinha') || fLower.includes('solidão') ||
        fLower.includes('angústia') || fLower.includes('sem forças') || fLower.includes('esgotada')
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Permita-se sentir e soltar as lágrimas se o corpo pedir. O choro é a forma natural do cérebro descarregar a dor e baixar o cortisol. Você não precisa ser forte agora. Deite-se e receba nosso abraço.'
        });
      }
      // 5. AUTOCUIDADO, ESTILO, BELEZA (COR DE CABELO, ROUPAS, MUDANÇAS)
      else if (
        fLower.includes('cabelo') || fLower.includes('cor de cabelo') || fLower.includes('cor do cabelo') ||
        fLower.includes('loira') || fLower.includes('morena') || fLower.includes('ruiva') ||
        fLower.includes('pintar') || fLower.includes('cortar') || fLower.includes('roupa') ||
        fLower.includes('vestido') || fLower.includes('look') || fLower.includes('estilo') ||
        fLower.includes('visual') || fLower.includes('corpo') || fLower.includes('autoestima')
      ) {
        wait.push({
          raw: frag,
          note: 'Querer se renovar e cuidar do visual é uma forma linda de carinho consigo mesma! Guardamos a ideia no cofre para você decidir com calma na luz do dia.'
        });
      }
      // 6. AUTOCOBRANÇA E DIÁLOGOS PASSADOS
      else if (
        fLower.includes('deveria') || fLower.includes('devia') || fLower.includes('conversa') ||
        fLower.includes('discussão') || fLower.includes('briga') || fLower.includes('remoendo') ||
        fLower.includes('arrepend') || fLower.includes('culpa') || fLower.includes('falhei') ||
        fLower.includes('burra')
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Esse diálogo já passou e você fez o melhor que podia com a consciência que tinha. Acolha seu esforço com gentileza e perdoe a si mesma esta noite.'
        });
      }
      // 7. ANSIEDADE, MEDO E INCERTEZAS DO FUTURO
      else if (
        fLower.includes('medo') || fLower.includes('futuro') || fLower.includes('dar certo') ||
        fLower.includes('e se') || fLower.includes('preocupad') || fLower.includes('ansios') ||
        fLower.includes('pânico')
      ) {
        release.push({
          raw: frag,
          reframe: 'Preocupar-se à noite não resolve o futuro; só rouba a sua energia para vivê-lo amanhã. Solte o controle do que está longe e entregue-se ao descanso.'
        });
      }
      // 8. PADRÃO: REFLEXÕES & IDEIAS GUARDADAS COM CARINHO
      else {
        wait.push({
          raw: frag,
          note: 'Guardado com carinho no seu cofre seguro. Fica protegido aqui para sua mente repousar em paz e clareza.'
        });
      }
    });

    const hasPositive = gratitude.length > 0;
    const hasNegative = rumination.length > 0 || release.length > 0;
    const counselingAdvice = generateCounselingAdvice(text, fullLower, hasPositive, hasNegative);
    const crisisDetected = fullLower.includes('matar') || fullLower.includes('suicídio') || fullLower.includes('acabar com a vida') || fullLower.includes('não aguento mais');

    if (gratitude.length === 0 && tomorrow.length === 0 && wait.length === 0 && release.length === 0 && rumination.length === 0) {
      gratitude.push({
        raw: text,
        note: 'Seu momento e reflexões foram acolhidos com respeito e carinho. Durma em paz!'
      });
    }

    return {
      title: title || 'Diário Noturno',
      date: new Date().toISOString(),
      rawText: text,
      counselingAdvice,
      crisisDetected,
      gratitude,
      tomorrow,
      wait,
      release,
      rumination
    };
  }

  function formatActionItem(str) {
    let clean = str.replace(/^(preciso|tenho que|não posso esquecer de|lembrar de|amanhã|levar|buscar)\s+/i, (match) => match.trim() + ' ');
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    return clean;
  }

  function renderCrisisAlert(detected) {
    const alertEl = document.getElementById('crisisAlert');
    if (alertEl) {
      if (detected) {
        alertEl.classList.remove('hidden');
      } else {
        alertEl.classList.add('hidden');
      }
    }
  }

  function renderTriagedResults(data) {
    if (resultEntryTitle) {
      resultEntryTitle.textContent = `“${data.title}”`;
    }

    // Alerta de crise: precisa ser avaliado ANTES da carta, porque em situação
    // de risco a carta jamais pode ser truncada nem exibir oferta de upgrade.
    renderCrisisAlert(data.crisisDetected === true);

    // Renderiza a Carta de Consolo e Conselhos
    if (counselingText) {
      const fullAdvice = data.counselingAdvice || 'Você concluiu o dia. Seus pensamentos estão guardados e seguros. Pode descansar em paz.';
      // REGRA DE SEGURANÇA: em crise, a mensagem de acolhimento (que contém os
      // contatos do CVV e do SAMU) é exibida na íntegra para todo mundo.
      // Nunca cobrar por uma mensagem de socorro.
      if (isUserPro() || data.crisisDetected === true) {
        counselingText.innerHTML = escapeHTML(fullAdvice);
      } else {
        // No Plano Free: Exibe o primeiro trecho e um teaser borrado com chamada de upgrade Pro
        const snippet = fullAdvice.length > 120 ? fullAdvice.substring(0, 120) + '...' : fullAdvice;
        counselingText.innerHTML = `
          <span>${escapeHTML(snippet)}</span>
          <div class="counseling-pro-teaser-wrapper">
            <div class="counseling-pro-blurred-text">
              Compreendemos profundamente como essa sobrecarga impacta o seu sono. O seu corpo precisa de validação e alívio do cortisol para restaurar suas energias para amanhã.
            </div>
            <div class="counseling-pro-overlay">
              <span>🔒 Carta Noturna de Acolhimento & TCC-I Profundo</span>
              <button type="button" class="btn-unlock-pro-small btn-unlock-counseling">
                Desbloquear Conselho Completo (Pro)
              </button>
            </div>
          </div>
        `;
        counselingText.querySelector('.btn-unlock-counseling')?.addEventListener('click', () => {
          openModal(modalPremium);
        });
      }
    }

    // Atualiza o Selo de Fechamento Cognitivo (Efeito Zeigarnik & TCC-I)
    const closureSealTitle = document.getElementById('closureSealTitle');
    const closureSealDesc = document.getElementById('closureSealDesc');
    if (closureSealTitle && closureSealDesc) {
      const totalCount = (data.gratitude?.length || 0) + (data.tomorrow?.length || 0) + (data.wait?.length || 0) + (data.release?.length || 0) + (data.rumination?.length || 0);
      const goodCount = (data.gratitude?.length || 0);
      if (goodCount > 0) {
        closureSealTitle.textContent = `✨ ${goodCount} momentos bons e ${totalCount - goodCount} pendências acolhidos.`;
        closureSealDesc.textContent = 'Suas vitórias foram celebradas e suas tarefas organizadas. O cérebro recebe a autorização biológica para desligar a vigília e permitir o sono profundo.';
      } else {
        closureSealTitle.textContent = `✨ ${totalCount} reflexões acolhidas e guardadas no diário.`;
        closureSealDesc.textContent = 'Suas tarefas e sentimentos estão seguros no papel. O cérebro recebe agora a autorização biológica para desligar a vigília e iniciar o descanso.';
      }
    }

    // 0. Coisas Boas & Gratidão
    if (data.gratitude && data.gratitude.length > 0) {
      catGratitudeContainer.classList.remove('hidden');
      listGratitude.innerHTML = '';
      data.gratitude.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `
          <button type="button" class="cat-item-tag interactive" data-tag-type="gratitude" style="background: rgba(59, 130, 246, 0.25); color: var(--acento);" title="Toque para entender por que está aqui">
            Coisas Boas 🌟
          </button>
          <span><strong>${escapeHTML(item.raw)}</strong> <br><small style="color: var(--sage-calm); display: inline-block; margin-top: 0.25rem;">✨ ${escapeHTML(item.note)}</small></span>
        `;
        listGratitude.appendChild(li);
      });
    } else {
      catGratitudeContainer.classList.add('hidden');
    }

    // 1. Amanhã
    listTomorrow.innerHTML = '';
    if (data.tomorrow.length > 0) {
      data.tomorrow.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `
          <button type="button" class="cat-item-tag interactive" data-tag-type="tomorrow" title="Toque para entender por que está aqui">
            Amanhã ℹ️
          </button>
          <span><strong>${escapeHTML(item.action)}</strong></span>
        `;
        listTomorrow.appendChild(li);
      });
    } else {
      listTomorrow.innerHTML = '<li class="cat-item"><span>Nenhuma urgência prática para a manhã. Seu dia começará mais suave!</span></li>';
    }

    // 2. No Cofre
    listWait.innerHTML = '';
    if (data.wait.length > 0) {
      data.wait.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `
          <button type="button" class="cat-item-tag interactive" data-tag-type="wait" title="Toque para entender por que está aqui">
            No Cofre ℹ️
          </button>
          <span>${escapeHTML(item.raw)} <br><small style="color: var(--sage-calm);">✨ ${escapeHTML(item.note)}</small></span>
        `;
        listWait.appendChild(li);
      });
    } else {
      listWait.innerHTML = '<li class="cat-item"><span>Sem pendências ou ideias secundárias acumuladas.</span></li>';
    }

    // 3. Soltar
    listRelease.innerHTML = '';
    if (data.release.length > 0) {
      data.release.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `
          <button type="button" class="cat-item-tag interactive" data-tag-type="release" title="Toque para entender por que está aqui">
            Soltar ℹ️
          </button>
          <span>${escapeHTML(item.raw)} <br><small style="color: var(--sage-calm);">🕊️ ${escapeHTML(item.reframe)}</small></span>
        `;
        listRelease.appendChild(li);
      });
    } else {
      listRelease.innerHTML = '<li class="cat-item"><span>Sua mente está livre de grandes incertezas hoje.</span></li>';
    }

    // 4. Acolhimento do Coração / Ruminação
    if (data.rumination.length > 0) {
      catRuminationContainer.classList.remove('hidden');
      listRumination.innerHTML = '';
      data.rumination.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `
          <button type="button" class="cat-item-tag interactive" data-tag-type="rumination" style="background: rgba(181, 131, 141, 0.25); color: var(--lilac-twilight);" title="Toque para entender por que está aqui">
            Acolhimento & Consolo ℹ️
          </button>
          <span><strong>${escapeHTML(item.raw)}</strong> <br><small style="color: var(--lilac-twilight); line-height: 1.45; display: inline-block; margin-top: 0.35rem;">💜 ${escapeHTML(item.reframe)}</small></span>
        `;
        listRumination.appendChild(li);
      });
    } else {
      catRuminationContainer.classList.add('hidden');
    }

    // Listener para tags clicáveis na tela de triagem
    document.querySelectorAll('.cat-item-tag.interactive').forEach(tagBtn => {
      tagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagType = tagBtn.getAttribute('data-tag-type');
        openTagDetailModal(tagType);
      });
    });
  }

  // ==========================================
  // ROTINA DE DESACELERAÇÃO
  // ==========================================
  function initRoutineDuration() {
    durationBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const minutes = parseInt(btn.getAttribute('data-minutes'), 10);
        if (minutes > 3 && !isUserPro()) {
          // Bloqueio rigoroso: abre o modal de upgrade e trava seleção
          openModal(modalPremium);
          return;
        }
        durationBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appState.selectedRoutineMinutes = minutes;
        routineTimeBadge.textContent = `${appState.selectedRoutineMinutes} min`;
      });
    });
  }

  function startRelaxationRoutine() {
    // Trava de segurança inabalável
    if (appState.selectedRoutineMinutes > 3 && !isUserPro()) {
      appState.selectedRoutineMinutes = 3;
      durationBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-minutes') === '3'));
      if (routineTimeBadge) routineTimeBadge.textContent = '3 min';
      openModal(modalPremium);
      return;
    }

    showStep('routine');
    cancelBreathingCycle(); // Cancela ciclos anteriores antes de iniciar
    appState.routineSecondsRemaining = appState.selectedRoutineMinutes * 60;
    updateTimerDisplay();
    runBreathingCycle();

    if (appState.routineInterval) clearInterval(appState.routineInterval);
    const totalSecs = appState.routineSecondsRemaining;

    appState.routineInterval = setInterval(() => {
      appState.routineSecondsRemaining--;
      updateTimerDisplay();

      const elapsed = totalSecs - appState.routineSecondsRemaining;
      timerProgress.style.width = `${(elapsed / totalSecs) * 100}%`;
      updateSomaticGuidance(elapsed, totalSecs);

      if (appState.routineSecondsRemaining <= 0) {
        clearInterval(appState.routineInterval);
        finishNightToGoodnight();
      }
    }, 1000);
  }

  // Cancela todos os timeouts e intervalos de respiração pendentes
  function cancelBreathingCycle() {
    appState.breathingTimeouts.forEach(id => clearTimeout(id));
    appState.breathingTimeouts = [];
    appState.countdownIntervals.forEach(id => clearInterval(id));
    appState.countdownIntervals = [];
  }

  function runBreathingCycle() {
    if (steps.routine.classList.contains('hidden')) return;

    setBreathingState('inhale', 'Inspire...', 4);
    const t1 = setTimeout(() => {
      if (steps.routine.classList.contains('hidden')) return;
      setBreathingState('hold', 'Segure...', 7);
      const t2 = setTimeout(() => {
        if (steps.routine.classList.contains('hidden')) return;
        setBreathingState('exhale', 'Solte devagar...', 8);
        const t3 = setTimeout(() => {
          if (!steps.routine.classList.contains('hidden')) runBreathingCycle();
        }, 8000);
        appState.breathingTimeouts.push(t3);
      }, 7000);
      appState.breathingTimeouts.push(t2);
    }, 4000);
    appState.breathingTimeouts.push(t1);
  }

  function setBreathingState(phase, label, seconds) {
    breathCircle.className = `breath-circle-core ${phase}`;
    breathGuideText.textContent = label;
    breathSeconds.textContent = seconds;

    let countdown = seconds;
    const countInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) breathSeconds.textContent = countdown;
      else clearInterval(countInterval);
    }, 1000);
    appState.countdownIntervals.push(countInterval);
  }

  function updateSomaticGuidance(elapsed, total) {
    const ratio = elapsed / total;
    if (ratio < 0.3) {
      somaticStepTitle.textContent = 'Solte a mandíbula e relaxe os ombros';
      somaticStepDesc.textContent = 'Deixe a língua repousar suavemente no céu da boca. Sinta o peso do seu corpo sendo sustentado pela cama.';
      routinePhaseTag.textContent = 'Fase 1: Descompressão Facial';
    } else if (ratio < 0.7) {
      somaticStepTitle.textContent = 'Alivie a tensão das costas e do peito';
      somaticStepDesc.textContent = 'A cada expiração, imagine que você afunda mais no colchão. Nada exige sua atenção agora.';
      routinePhaseTag.textContent = 'Fase 2: Relaxamento Somático';
    } else {
      somaticStepTitle.textContent = 'Permissão para adormecer';
      somaticStepDesc.textContent = 'Sua mente está acolhida e guardada. O dia foi concluído com sucesso. Entregue-se ao repouso.';
      routinePhaseTag.textContent = 'Fase 3: Transição para o Sono';
    }
  }

  function updateTimerDisplay() {
    const mins = Math.floor(appState.routineSecondsRemaining / 60);
    const secs = appState.routineSecondsRemaining % 60;
    timerRemaining.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async function finishNightToGoodnight() {
    if (appState.routineInterval) clearInterval(appState.routineInterval);
    cancelBreathingCycle();
    stopAudioSoundscape();

    if (appState.currentTriagedData) {
      const savedEntry = saveNightEntry(appState.currentTriagedData);

      if (supabase && appState.currentUser) {
        try {
          // .select().single() devolve a linha criada: precisamos do id para
          // conseguir gravar a nota do sono no check-in matinal seguinte.
          const { data, error } = await supabase.from('journal_entries').insert({
            user_id: appState.currentUser.id,
            raw_text: appState.currentTriagedData.rawText,
            triaged_data: {
              title: appState.currentTriagedData.title,
              counselingAdvice: appState.currentTriagedData.counselingAdvice,
              gratitude: appState.currentTriagedData.gratitude,
              tomorrow: appState.currentTriagedData.tomorrow,
              wait: appState.currentTriagedData.wait,
              release: appState.currentTriagedData.release,
              rumination: appState.currentTriagedData.rumination
            },
            routine_duration_minutes: appState.selectedRoutineMinutes
          }).select('id, created_at').single();

          if (error) throw error;

          if (data?.id && savedEntry) {
            savedEntry.id = data.id;
            if (data.created_at) savedEntry.date = data.created_at;
            saveLocalHistory(appState.history);
          }
          refreshDailyUsageFromServer();
        } catch (e) {
          console.warn('Erro ao salvar no Supabase:', e);
          showToast('Seu registro foi salvo neste dispositivo, mas não conseguimos sincronizar com a nuvem agora.', 'info', 8000);
        }
      }
    }

    showStep('goodNight');
  }

  // ==========================================
  // WEB AUDIO API
  // ==========================================
  function toggleAudioSoundscape() {
    if (appState.soundActive) stopAudioSoundscape();
    else startAudioSoundscape();
  }

  function startAudioSoundscape() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      appState.audioCtx = new AudioCtx();

      const bufferSize = appState.audioCtx.sampleRate * 2;
      const buffer = appState.audioCtx.createBuffer(1, bufferSize, appState.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
        b6 = white * 0.115926;
      }

      appState.noiseNode = appState.audioCtx.createBufferSource();
      appState.noiseNode.buffer = buffer;
      appState.noiseNode.loop = true;

      const filter = appState.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, appState.audioCtx.currentTime);

      const osc1 = appState.audioCtx.createOscillator();
      const osc2 = appState.audioCtx.createOscillator();
      const gainOsc = appState.audioCtx.createGain();
      gainOsc.gain.setValueAtTime(0.02, appState.audioCtx.currentTime);

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(108, appState.audioCtx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(110.5, appState.audioCtx.currentTime);

      osc1.connect(gainOsc);
      osc2.connect(gainOsc);

      appState.noiseNode.connect(filter);
      filter.connect(appState.audioCtx.destination);
      gainOsc.connect(appState.audioCtx.destination);

      appState.noiseNode.start();
      osc1.start();
      osc2.start();

      appState.soundActive = true;
      btnToggleSound.classList.add('playing');
      soundIcon.textContent = '🔊';
    } catch (err) {
      console.warn('Web Audio error:', err);
    }
  }

  function stopAudioSoundscape() {
    if (appState.audioCtx) {
      try { appState.audioCtx.close(); } catch (e) {}
      appState.audioCtx = null;
    }
    appState.soundActive = false;
    btnToggleSound.classList.remove('playing');
    soundIcon.textContent = '🔇';
  }

  // ==========================================
  // CHECK-IN MATINAL DO SONO
  // ==========================================
  function initMorningCheckin() {
    moodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        moodBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const mood = btn.getAttribute('data-mood');
        saveMorningRating(mood);
      });
    });
  }

  function renderMorningView() {
    const latest = appState.history[0];
    if (!latest || !latest.tomorrow || latest.tomorrow.length === 0) {
      morningTasksList.innerHTML = '<li class="empty-state">Nenhum registro encontrado da noite anterior. Faça um encerramento hoje à noite!</li>';
      morningFeedbackMessage.classList.add('hidden');
      return;
    }

    morningTasksList.innerHTML = '';
    latest.tomorrow.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = `morning-task-item ${item.done ? 'done' : ''}`;
      li.innerHTML = `
        <input type="checkbox" id="taskChk_${index}" ${item.done ? 'checked' : ''}>
        <span>${escapeHTML(item.action)}</span>
      `;
      const chk = li.querySelector('input');
      chk.addEventListener('change', () => {
        item.done = chk.checked;
        li.classList.toggle('done', chk.checked);
        saveLocalHistory(appState.history);
      });
      morningTasksList.appendChild(li);
    });

    if (latest.sleepMood) {
      moodBtns.forEach(b => {
        b.classList.toggle('selected', b.getAttribute('data-mood') === latest.sleepMood);
      });
      showSleepInsight(latest.sleepMood);
    }
  }

  async function saveMorningRating(mood) {
    if (appState.history.length > 0) {
      appState.history[0].sleepMood = mood;
      saveLocalHistory(appState.history);
      showSleepInsight(mood);

      if (supabase && appState.currentUser && appState.history[0].id) {
        try {
          await supabase
            .from('journal_entries')
            .update({ sleep_mood: mood })
            .eq('id', appState.history[0].id);
        } catch (e) {
          console.warn('Erro ao atualizar nota no Supabase:', e);
        }
      }
    }
  }

  function showSleepInsight(mood) {
    morningFeedbackMessage.classList.remove('hidden');
    if (mood === 'great') {
      insightText.innerHTML = '<strong>Descanso Excelente!</strong> Descarregar a mente permitiu que o córtex pré-frontal relaxasse e facilitou o sono profundo.';
    } else if (mood === 'medium') {
      insightText.innerHTML = '<strong>Descanso Regular:</strong> Você organizou o dia, mas o corpo reteve alguma tensão. Recomendamos testar a rotina de 5 minutos hoje à noite.';
    } else {
      insightText.innerHTML = '<strong>Noite Desafiadora:</strong> Seu dia foi exigente. Hoje à noite, dedique 5 a 10 minutos para a respiração 4-7-8 e o acolhimento de sentimentos.';
    }
  }

  // ==========================================
  // PERSISTÊNCIA LOCAL (HISTÓRICO & BALANÇO DE VIDA)
  // ==========================================
  function loadHistoryFromLocalStorage() {
    if (!appState.currentUser) return [];
    try {
      const userKey = `desliguese_entries_${appState.currentUser.id}`;
      const raw = localStorage.getItem(userKey);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function saveLocalHistory(hist) {
    if (!appState.currentUser) return; // Não persiste histórico para usuário deslogado
    try {
      const userKey = `desliguese_entries_${appState.currentUser.id}`;
      localStorage.setItem(userKey, JSON.stringify(hist));
    } catch (e) {}
    updateHistoryUI();
  }

  function saveNightEntry(entry) {
    if (!appState.currentUser) return null;
    appState.history.unshift(entry);
    if (appState.history.length > 50) appState.history.pop();
    saveLocalHistory(appState.history);
    return entry;
  }

  function updateHistoryUI() {
    // 1. Se o usuário NÃO estiver logado: Bloqueio do Diário com incentivo ao login
    if (!appState.currentUser) {
      statTotalNights.textContent = '0';
      statAvgMood.textContent = '—';
      statTasksCleared.textContent = '0';

      if (countGoodThings) countGoodThings.textContent = '0';
      if (countChallengingThings) countChallengingThings.textContent = '0';
      if (balanceRatioBadge) balanceRatioBadge.textContent = 'Privado';
      if (balanceBarGood) balanceBarGood.style.width = '50%';
      if (balanceBarBad) balanceBarBad.style.width = '50%';

      if (balanceInsightText) {
        balanceInsightText.innerHTML = '<strong>Seu diário seguro:</strong> Faça login para que suas reflexões fiquem salvas na sua conta, protegidas por conexão criptografada e visíveis apenas para você.';
      }

      historyListContainer.innerHTML = `
        <div class="empty-state auth-locked-history" style="padding: 2.5rem 1.5rem; text-align: center;">
          <div class="badge-tag" style="background: rgba(59, 130, 246, 0.25); color: var(--acento); margin-bottom: 0.75rem;">🔒 Diário Protegido</div>
          <h3 style="margin: 0 0 0.5rem; color: var(--text-main); font-size: 1.25rem;">Acesse sua Conta para Salvar o Histórico</h3>
          <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 440px; margin: 0 auto 1.5rem; line-height: 1.5;">
            No modo visitante, seus desabafos são temporários para proteger sua privacidade. Crie sua conta gratuita ou assine o Pro para manter seu diário seguro na nuvem.
          </p>
          <button type="button" class="btn-primary btn-history-auth-prompt" style="width: auto; padding: 0.65rem 1.6rem;">
            👤 Entrar ou Criar Conta
          </button>
        </div>
      `;

      historyListContainer.querySelector('.btn-history-auth-prompt')?.addEventListener('click', () => {
        openModal(modalAuth);
      });
      return;
    }

    const list = appState.history;
    statTotalNights.textContent = list.length;

    let tasksCount = 0;
    let moodScoreSum = 0;
    let moodsRated = 0;
    let goodThingsTotal = 0;
    let challengingThingsTotal = 0;

    list.forEach(item => {
      if (item.tomorrow) tasksCount += item.tomorrow.length;
      if (item.gratitude) goodThingsTotal += item.gratitude.length;
      if (item.release) challengingThingsTotal += item.release.length;
      if (item.rumination) challengingThingsTotal += item.rumination.length;

      if (item.sleepMood) {
        moodsRated++;
        if (item.sleepMood === 'great') {
          moodScoreSum += 3;
          goodThingsTotal += 1;
        } else if (item.sleepMood === 'medium') {
          moodScoreSum += 2;
        } else if (item.sleepMood === 'terrible') {
          moodScoreSum += 1;
          challengingThingsTotal += 1;
        }
      }
    });

    // Atualiza Balanço de Vida a Longo Prazo (Desfazendo o Viés de Negatividade)
    if (countGoodThings) countGoodThings.textContent = goodThingsTotal;
    if (countChallengingThings) countChallengingThings.textContent = challengingThingsTotal;

    const totalBalanceEvents = goodThingsTotal + challengingThingsTotal;
    let goodPercentage = 75; // Baseline saudável
    if (totalBalanceEvents > 0) {
      goodPercentage = Math.round((goodThingsTotal / totalBalanceEvents) * 100);
    }

    if (balanceRatioBadge) balanceRatioBadge.textContent = `${goodPercentage}% Coisas Boas`;
    if (balanceBarGood) balanceBarGood.style.width = `${goodPercentage}%`;
    if (balanceBarBad) balanceBarBad.style.width = `${100 - goodPercentage}%`;

    if (balanceInsightText) {
      if (goodPercentage >= 60) {
        balanceInsightText.innerHTML = `<strong>A vida a longo prazo:</strong> O seu diário comprova que <strong>${goodPercentage}% das suas vivências registradas são coisas boas, afetos e vitórias</strong>! O cérebro tende a focar na dor, mas a sua história é repleta de luz.`;
      } else {
        balanceInsightText.innerHTML = `<strong>Força na travessia:</strong> Você enfrentou dias desafiadores, mas cada noite descarregada alivia o cortisol e abre espaço para novos momentos felizes.`;
      }
    }

    statTasksCleared.textContent = tasksCount;
    if (moodsRated > 0) {
      const avg = moodScoreSum / moodsRated;
      statAvgMood.textContent = avg >= 2.5 ? '😴 Muito Bom' : avg >= 1.8 ? '😐 Regular' : '😫 Difícil';
    } else {
      statAvgMood.textContent = '—';
    }

    historyListContainer.innerHTML = '';
    if (list.length === 0) {
      historyListContainer.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma noite registrada ainda.</p>
          <small>Faça seu primeiro desabafo noturno para começar o seu diário!</small>
        </div>
      `;
      return;
    }

    const isPro = isUserPro();
    const visibleEntries = isPro ? list : list.slice(0, 3);

    visibleEntries.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const d = new Date(entry.date || entry.timestamp);
      const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const moodEmoji = entry.sleepMood === 'great' ? '😴' : entry.sleepMood === 'medium' ? '😐' : entry.sleepMood === 'terrible' ? '😫' : '🌙';
      const title = entry.title || 'Diário Noturno';

      const countGratitude = entry.gratitude ? entry.gratitude.length : 0;
      const countTomorrow = entry.tomorrow ? entry.tomorrow.length : 0;
      const countWait = entry.wait ? entry.wait.length : 0;
      const countRelease = entry.release ? entry.release.length : 0;
      const countRumination = entry.rumination ? entry.rumination.length : 0;

      card.innerHTML = `
        <div class="history-card-header">
          <span class="history-card-title">📖 ${escapeHTML(title)}</span>
          <span class="history-card-mood" title="Humor do sono">${moodEmoji} <small style="font-size:0.75rem; color:var(--text-muted);">${formattedDate}</small></span>
        </div>
        <p class="history-card-text">"${escapeHTML(entry.rawText)}"</p>
        ${entry.counselingAdvice ? `<div style="background: rgba(59, 130, 246, 0.08); border-left: 2px solid var(--acento); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.78rem; color: var(--text-main); font-style: italic; margin-bottom: 0.65rem;">💌 "${escapeHTML(entry.counselingAdvice.substring(0, 130))}..."</div>` : ''}
        
        <div class="history-tags">
          ${countGratitude > 0 ? `
            <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="gratitude" style="background: rgba(59, 130, 246, 0.25); color: var(--acento);" title="Toque para ver as coisas boas">
              ${countGratitude} coisas boas 🌟
            </button>
          ` : ''}
          <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="tomorrow" style="background: rgba(59, 130, 246, 0.2); color: var(--acento);" title="Toque para ver o que foi guardado">
            ${countTomorrow} amanhã 🔍
          </button>
          <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="wait" style="background: rgba(149, 167, 136, 0.2); color: var(--sage-calm);" title="Toque para ver o que foi guardado">
            ${countWait} no cofre 🔍
          </button>
          <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="release" style="background: rgba(181, 131, 141, 0.2); color: var(--lilac-twilight);" title="Toque para ver o que foi guardado">
            ${countRelease} solturas 🔍
          </button>
          ${countRumination > 0 ? `
            <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="rumination" style="background: rgba(181, 131, 141, 0.28); color: var(--lilac-twilight);" title="Toque para ver o que foi guardado">
              ${countRumination} acolhimento 🔍
            </button>
          ` : ''}
        </div>

        <div class="history-card-footer">
          <button type="button" class="btn-view-entry-full" data-entry-idx="${index}">
            <span>🔍 Abrir Detalhes da Noite</span>
          </button>
        </div>
      `;
      historyListContainer.appendChild(card);
    });

    // Se for usuário gratuito e houver mais entradas ou para incentivar upgrade
    if (!isPro) {
      const upsellCard = document.createElement('div');
      upsellCard.className = 'history-card pro-upsell-history-card';
      upsellCard.style.cssText = 'border: 1px dashed var(--acento); background: rgba(59, 130, 246, 0.06); text-align: center; padding: 1.5rem;';
      upsellCard.innerHTML = `
        <div class="badge-tag" style="background: rgba(59, 130, 246, 0.25); color: var(--acento); margin-bottom: 0.5rem;">⭐ Desligue-se Pro</div>
        <h4 style="margin: 0.35rem 0; color: var(--text-main); font-size: 1.05rem;">Histórico Completo na Nuvem & Padrões Emocionais</h4>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">
          No plano gratuito, você visualiza os 3 registros mais recentes. Assine o Pro para acessar todo o seu histórico ilimitado, sincronização e gráficos avançados de autocuidado.
        </p>
        <button type="button" class="btn-primary btn-history-upgrade" style="width: auto; padding: 0.6rem 1.4rem;">
          Ver Planos Premium (a partir de R$ 12/mês)
        </button>
      `;
      upsellCard.querySelector('.btn-history-upgrade')?.addEventListener('click', () => {
        openModal(modalPremium);
      });
      historyListContainer.appendChild(upsellCard);
    }

    // Re-bind listeners para tags no histórico abrindo os itens reais
    document.querySelectorAll('.history-tags .cat-item-tag.interactive').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entryIdx = parseInt(btn.getAttribute('data-entry-idx'), 10);
        const tagType = btn.getAttribute('data-tag-type');
        openHistoryEntryDetailModal(entryIdx, tagType);
      });
    });

    // Re-bind listeners para botão de abrir detalhes completos da noite
    document.querySelectorAll('.btn-view-entry-full').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entryIdx = parseInt(btn.getAttribute('data-entry-idx'), 10);
        openHistoryEntryDetailModal(entryIdx, 'all');
      });
    });
  }

  // ==========================================
  // MODAIS (PREMIUM, AUTH, TAGS, DETALHES DO DIÁRIO & TECLA ESC)
  // ==========================================
  function initModals() {
    // Garante que ao iniciar todos os modais estejam 100% fechados
    closeAllModals();

    // Premium Modal
    const openPremium = () => openModal(modalPremium);
    navBtns.premium?.addEventListener('click', openPremium);
    btnCloseModal?.addEventListener('click', () => closeModal(modalPremium));
    modalPremium?.addEventListener('click', (e) => {
      if (e.target === modalPremium) closeModal(modalPremium);
    });

    // Auth (Desktop & Mobile)
    const openAuthModal = (e) => {
      if (e) e.preventDefault();
      openModal(modalAuth);
    };
    navBtns.auth?.addEventListener('click', openAuthModal);
    mobNavBtns.auth?.addEventListener('click', openAuthModal);
    document.getElementById('btnOpenAuth')?.addEventListener('click', openAuthModal);
    document.getElementById('btnMobAuth')?.addEventListener('click', openAuthModal);

    btnCloseAuthModal?.addEventListener('click', () => closeModal(modalAuth));
    modalAuth?.addEventListener('click', (e) => {
      if (e.target === modalAuth) closeModal(modalAuth);
    });

    // Tag Info Modal (TCC-I)
    btnCloseTagModal?.addEventListener('click', () => closeModal(modalTagDetail));
    btnDismissTagModal?.addEventListener('click', () => closeModal(modalTagDetail));
    modalTagDetail?.addEventListener('click', (e) => {
      if (e.target === modalTagDetail) closeModal(modalTagDetail);
    });

    // History Entry Detail Modal
    btnCloseHistoryDetailModal?.addEventListener('click', () => closeModal(modalHistoryDetail));
    btnDismissHistoryDetail?.addEventListener('click', () => closeModal(modalHistoryDetail));
    modalHistoryDetail?.addEventListener('click', (e) => {
      if (e.target === modalHistoryDetail) closeModal(modalHistoryDetail);
    });

    // Termos de Uso, Consentimento & Isenção Médica Modal
    linkOpenTermsAuth?.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(modalTerms);
    });
    linkOpenTermsFooter?.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(modalTerms);
    });
    btnCloseTermsModal?.addEventListener('click', () => closeModal(modalTerms));
    btnDismissTermsModal?.addEventListener('click', () => {
      closeModal(modalTerms);
      if (checkTermsConsent) checkTermsConsent.checked = true;
    });
    modalTerms?.addEventListener('click', (e) => {
      if (e.target === modalTerms) closeModal(modalTerms);
    });

    // Modal de Bloqueio de Trial (Degustação Expirada)
    btnCloseTrialBlock?.addEventListener('click', () => closeModal(modalTrialBlock));
    btnTrialOpenLogin?.addEventListener('click', () => {
      closeModal(modalTrialBlock);
      openModal(modalAuth);
    });
    btnTrialOpenPremium?.addEventListener('click', () => {
      closeModal(modalTrialBlock);
      openModal(modalPremium);
    });
    modalTrialBlock?.addEventListener('click', (e) => {
      if (e.target === modalTrialBlock) closeModal(modalTrialBlock);
    });

    // Ações dos Planos de Assinatura Premium via Stripe Checkout
    btnSubscribeMonthly?.addEventListener('click', () => {
      handleInitiateCheckout('monthly', btnSubscribeMonthly);
    });
    btnSubscribeAnnual?.addEventListener('click', () => {
      handleInitiateCheckout('annual', btnSubscribeAnnual);
    });

    // Modal de Pagamento In-App com Stripe Elements
    btnCloseElementsModal?.addEventListener('click', () => closeModal(modalStripeElements));
    modalStripeElements?.addEventListener('click', (e) => {
      if (e.target === modalStripeElements) closeModal(modalStripeElements);
    });

    // Tecla Escape fecha o modal aberto (usando closeModal para também
    // restaurar o atributo hidden e devolver o foco a quem abriu)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeAllModals();
      }
    });
  }

  // ==========================================
  // INTEGRAÇÃO STRIPE PAYMENT ELEMENTS (EMBEDDED IN-APP CHECKOUT)
  // ==========================================
  const STRIPE_PUBLISHABLE_KEY = CONFIG.stripePublishableKey;
  let stripeObj = null;
  let stripeElementsInstance = null;
  let currentElementsPlan = 'monthly';

  // ==========================================
  // HELPER DE REQUISIÇÃO SEGURA (JSON / ERROS GRACIOSOS)
  // ==========================================

  /**
   * Resolve o endereço de um endpoint /api.
   *
   * Duas armadilhas que isso evita:
   *  1. Caminho absoluto em subpasta: publicado em /desligue-se/app/, o
   *     fetch('/api/checkout') ia parar na RAIZ do domínio, fora do projeto.
   *  2. Host sem funções serverless (GitHub Pages e afins), onde qualquer POST
   *     em /api devolve um "405 Not Allowed" em HTML, do nginx.
   */
  function resolveApiUrl(path) {
    const base = (CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
    if (base) {
      return base + (path.startsWith('/') ? path : `/${path}`);
    }
    return new URL(path, window.location.origin).href;
  }

  /** Hospedagens estáticas conhecidas, que nunca executam /api. */
  function isStaticOnlyHost() {
    if (CONFIG.apiBaseUrl) return false; // A API foi apontada para outro lugar
    const host = window.location.hostname;
    return host.endsWith('.github.io') ||
           host.endsWith('.netlify.app') ||
           host.endsWith('.pages.dev') ||
           window.location.protocol === 'file:';
  }

  /**
   * Avisa de saída, e não só quando a pessoa tenta pagar, que esta cópia do
   * site não tem servidor. Sem isso, a triagem cai calada no classificador
   * local e o checkout só quebra lá na frente.
   */
  function warnIfStaticOnlyHost() {
    if (!isStaticOnlyHost()) return;

    console.warn(
      `[Desligue-se] Esta página está em ${window.location.origin}, que serve apenas arquivos estáticos. ` +
      'As funções /api (IA de triagem, assinatura e pagamento) não existem aqui. ' +
      'Use a versão publicada na Vercel ou configure apiBaseUrl em config.js.'
    );

    showToast(
      'Esta é uma cópia estática do Desligue-se: a triagem por IA e a assinatura não funcionam aqui. ' +
      'Use o endereço oficial do aplicativo para ter a experiência completa.',
      'error',
      0
    );
  }

  async function safeFetchJson(url, options = {}) {
    const absoluteUrl = resolveApiUrl(url);
    let res;

    try {
      res = await fetch(absoluteUrl, options);
    } catch (networkErr) {
      const err = new Error(`Sem conexão com o servidor (${networkErr.message}).`);
      err.status = 0;
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    let data = null;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
    } else {
      // Resposta em HTML/texto significa que quem respondeu NÃO foi a nossa
      // função serverless: página de erro de proxy, host sem as rotas /api,
      // portal de rede etc. Registramos tudo o que é preciso para identificar.
      const text = await res.text();
      console.error(
        `[Desligue-se] Resposta não-JSON de ${absoluteUrl}\n` +
        `status: ${res.status} ${res.statusText}\n` +
        `content-type: ${contentType || '(vazio)'}\n` +
        `url final (após redirecionamentos): ${res.url}\n` +
        `início do corpo: ${text.substring(0, 300)}`
      );

      const err = new Error(
        res.status === 404
          ? `O endereço ${absoluteUrl} não está servindo as funções da API. Confirme se você está acessando o site publicado na Vercel (e não um servidor local ou outro domínio).`
          : `O servidor respondeu ${res.status} em formato inesperado. Detalhes completos no console (F12).`
      );
      err.status = res.status;
      err.nonJson = true;
      throw err;
    }

    if (!res.ok) {
      const errorMsg = data?.error || (res.status === 401
        ? 'Sua sessão expirou. Faça login novamente para continuar.'
        : `Serviço temporariamente indisponível (${res.status}). Tente novamente em instantes.`);
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    if (!data) {
      throw new Error('Não foi possível obter resposta da operadora. Tente novamente em instantes.');
    }

    return data;
  }

  async function handleInitiateCheckout(planType, buttonElement) {
    if (isStaticOnlyHost()) {
      closeModal(modalPremium);
      showToast(
        'Esta cópia do site não tem servidor de pagamentos. Abra o aplicativo pelo endereço oficial para assinar — nenhuma cobrança pode ser feita a partir daqui.',
        'error',
        12000
      );
      return;
    }

    const token = await getAccessToken();
    const originalText = buttonElement ? buttonElement.textContent : '';
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = '🔒 Conectando ao Checkout Seguro...';
    }

    try {
      // 1. Tenta abrir o formulário embutido via Stripe Embedded Checkout
      await openStripeElementsCheckout(planType, token);
    } catch (elementsErr) {
      console.warn('Tentando fallback para Checkout Session hospedado:', elementsErr.message);
      // Fallback para o Stripe Checkout hospedado
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const data = await safeFetchJson('/api/checkout', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            planType,
            userId: appState.currentUser?.id || 'guest',
            email: appState.currentUser?.email || null
          })
        });

        if (!data.url) {
          throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
        }

        window.location.href = data.url;
      } catch (fallbackErr) {
        closeModal(modalStripeElements);

        // 401 não é problema da operadora: é sessão ausente ou expirada.
        // Mandar a pessoa para a tela de login resolve; falar em "operadora
        // de pagamentos" só confunde.
        if (fallbackErr.status === 401) {
          openModal(modalAuth);
          showAuthFeedback(
            fallbackErr.message ||
            'Para assinar, entre na sua conta. Assim a assinatura fica vinculada a você e continua valendo em qualquer aparelho.',
            'error'
          );
          return;
        }

        // 503 = configuração do servidor. Mandar a pessoa fazer login de novo
        // seria inútil e frustrante: o problema não está com ela.
        if (fallbackErr.status === 503) {
          showToast(
            'A assinatura está temporariamente indisponível por uma configuração do servidor. Já estamos vendo isso — tente novamente em alguns minutos.',
            'error',
            12000
          );
          console.error('[Desligue-se] Configuração do servidor incompleta:', fallbackErr.message);
          return;
        }

        showToast('Não foi possível conectar com o checkout: ' + fallbackErr.message, 'error', 12000);
      }
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
      }
    }
  }

  async function openStripeElementsCheckout(planType, token) {
    currentElementsPlan = planType;

    // Fecha o modal de pricing e abre o modal do formulário embutido
    closeModal(modalPremium);
    openModal(modalStripeElements);

    if (elementsModalPlanTitle) {
      elementsModalPlanTitle.textContent = planType === 'annual' ? 'Desligue-se Pro (Anual - 12x R$ 12)' : 'Desligue-se Pro (Mensal)';
    }
    if (elementsModalPlanPrice) {
      elementsModalPlanPrice.textContent = planType === 'annual' ? 'Total: 12x R$ 12,00 (R$ 144,00 / ano)' : 'Total: R$ 19,90 / mês';
    }

    if (paymentElementContainer) {
      paymentElementContainer.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando formulário seguro da Stripe...</div>';
    }
    if (paymentMessage) paymentMessage.classList.add('hidden');

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Cria a assinatura no backend e obtém o clientSecret
    const data = await safeFetchJson('/api/create-subscription', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        planType,
        userId: appState.currentUser?.id || 'guest',
        email: appState.currentUser?.email || null
      })
    });

    if (!data.clientSecret) {
      throw new Error(data.error || 'Falha ao inicializar o formulário seguro de pagamento.');
    }

    // Inicializa o Stripe.js
    if (!window.Stripe) {
      throw new Error('Script da Stripe.js não carregado.');
    }
    if (!STRIPE_PUBLISHABLE_KEY) {
      throw new Error('Chave publicável do Stripe não configurada em config.js.');
    }

    stripeObj = window.Stripe(STRIPE_PUBLISHABLE_KEY);

    // Configuração dos Elements com tema noturno personalizado
    stripeElementsInstance = stripeObj.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#3B82F6',
          colorBackground: '#111A2B',
          colorText: '#E8EDF5',
          colorDanger: '#FF8080',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          borderRadius: '8px'
        }
      }
    });

    if (paymentElementContainer) paymentElementContainer.innerHTML = '';

    // Se o Stripe suportar initEmbeddedCheckout, monta o checkout embutido oficial
    if (typeof stripeObj.initEmbeddedCheckout === 'function') {
      if (btnSubmitPayment) btnSubmitPayment.classList.add('hidden');
      
      const embeddedCheckout = await stripeObj.initEmbeddedCheckout({
        clientSecret: data.clientSecret
      });
      embeddedCheckout.mount('#payment-element');
    } else {
      // Fallback para Payment Element tradicional
      if (btnSubmitPayment) btnSubmitPayment.classList.remove('hidden');
      stripeElementsInstance = stripeObj.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#3B82F6',
            colorBackground: '#111A2B',
            colorText: '#E8EDF5',
            colorDanger: '#FF8080',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            borderRadius: '8px'
          }
        }
      });

      const paymentElement = stripeElementsInstance.create('payment');
      paymentElement.mount('#payment-element');

      if (paymentForm) {
        paymentForm.onsubmit = async (e) => {
          e.preventDefault();

          if (btnSubmitPayment) {
            btnSubmitPayment.disabled = true;
            if (btnSubmitPaymentText) btnSubmitPaymentText.textContent = '⏳ Processando Pagamento Seguro...';
          }

          const { error } = await stripeObj.confirmPayment({
            elements: stripeElementsInstance,
            confirmParams: {
              return_url: `${window.location.origin}/?status=success&plan=${currentElementsPlan}`
            }
          });

          if (error) {
            if (paymentMessage) {
              paymentMessage.textContent = error.message;
              paymentMessage.className = 'payment-feedback error';
              paymentMessage.classList.remove('hidden');
            }
            if (btnSubmitPayment) {
              btnSubmitPayment.disabled = false;
              if (btnSubmitPaymentText) btnSubmitPaymentText.textContent = '🔒 Confirmar Assinatura';
            }
          }
        };
      }
    }
  }

  // Verifica o status de retorno do Stripe na URL (?status=success & session_id=...)
  async function initStripeReturnStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const sessionId = urlParams.get('session_id');

    if (status === 'success' && sessionId) {
      try {
        const token = await getAccessToken();
        const verifyData = await safeFetchJson(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (verifyData.paid) {
          showToast('🎉 Pagamento confirmado! Estamos liberando o seu acesso Pro...', 'success', 8000);
          // O plano é gravado no perfil pelo webhook do Stripe (servidor).
          // Aqui apenas aguardamos essa confirmação chegar ao banco.
          await waitForProActivation();
        } else {
          showToast('Ainda não recebemos a confirmação do seu pagamento. Assim que a operadora confirmar, seu acesso Pro é liberado automaticamente.', 'info', 10000);
        }
      } catch (err) {
        console.warn('Erro ao verificar sessão do Stripe:', err);
      } finally {
        // Limpa a URL para manter limpo o histórico do navegador
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (status === 'cancelled') {
      showToast('O processo de pagamento foi cancelado. Nenhuma cobrança foi efetuada.', 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  /**
   * Após o pagamento, o webhook do Stripe grava o plano no perfil.
   * Isso costuma levar 1-3 segundos, então recarregamos o perfil algumas vezes
   * antes de desistir — sem nunca conceder o Pro pelo lado do cliente.
   */
  async function waitForProActivation(attempts = 8, delayMs = 1500) {
    if (!supabase || !appState.currentUser) return false;

    for (let i = 0; i < attempts; i++) {
      await loadCloudUserProfile(appState.currentUser.id);
      if (isUserPro()) {
        renderPlanBadge();
        checkDailyLimitUI();
        updateHistoryUI();
        showToast('Bem-vinda ao Desligue-se Pro! Seu acesso ilimitado já está ativo. 💜', 'success', 9000);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Última tentativa: reconciliar direto com o Stripe. Se a assinatura
    // existe lá, o acesso é liberado agora, sem depender do webhook.
    try {
      const token = await getAccessToken();
      if (token) {
        const data = await safeFetchJson('/api/sync-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: '{}'
        });
        if (data.atualizado) {
          await loadCloudUserProfile(appState.currentUser.id);
          renderPlanBadge();
          checkDailyLimitUI();
          updateHistoryUI();
          showToast('Bem-vinda ao Desligue-se Pro! Seu acesso ilimitado já está ativo. 💜', 'success', 9000);
          return true;
        }
      }
    } catch (e) {
      console.warn('Reconciliação com o Stripe falhou:', e.message);
    }

    showToast(
      'Seu pagamento foi recebido, mas a liberação ainda está sendo processada. ' +
      'Se em alguns minutos o Pro não aparecer, use "Já paguei e não recebi o acesso" em Minha Conta.',
      'info',
      14000
    );
    return false;
  }

  // ==========================================
  // PWA & INSTALAÇÃO DO APLICATIVO NO CELULAR / DESKTOP
  // ==========================================
  function initPWA() {
    // 1. Registro do Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            // Versão nova disponível: ativa na hora em vez de esperar a pessoa
            // fechar todas as abas. Sem isto, cada publicação exigia um
            // Ctrl+Shift+R manual para sair da versão antiga guardada.
            reg.addEventListener('updatefound', () => {
              const novaVersao = reg.installing;
              if (!novaVersao) return;
              novaVersao.addEventListener('statechange', () => {
                if (novaVersao.state === 'installed' && navigator.serviceWorker.controller) {
                  novaVersao.postMessage('ativar-agora');
                }
              });
            });
          })
          .catch((err) => {
            console.warn('Falha ao registrar Service Worker:', err);
          });

        // Quando o novo assume o controle, recarrega uma única vez para que a
        // página passe a rodar o código recém-publicado.
        let jaRecarregou = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (jaRecarregou) return;
          jaRecarregou = true;
          window.location.reload();
        });
      });
    }

    // 2. Detecção de modo Standalone (já instalado)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      if (btnInstallApp) btnInstallApp.classList.add('hidden');
      return;
    }

    let deferredInstallPrompt = null;

    // 3. Captura do evento de instalação do navegador (Chrome, Edge, Android)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (btnInstallApp) {
        btnInstallApp.classList.remove('hidden');
      }
    });

    // 4. Clique no botão de instalar
    if (btnInstallApp) {
      // Se for iOS Safari, mostra botão com dica de instalação
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS && !isStandalone) {
        btnInstallApp.classList.remove('hidden');
      }

      btnInstallApp.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          if (outcome === 'accepted') {
            btnInstallApp.classList.add('hidden');
          }
        } else if (isIOS) {
          showToast('📲 Para instalar no iPhone/iPad:\n1. Toque no botão Compartilhar do Safari.\n2. Escolha "Adicionar à Tela de Início".\n3. Pronto — o Desligue-se abre como um aplicativo.', 'info', 14000);
        } else {
          showToast('📲 Para instalar: abra as opções do navegador (⋮) e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".', 'info', 12000);
        }
      });
    }

    // 5. Quando o app for instalado com sucesso
    window.addEventListener('appinstalled', () => {
      if (btnInstallApp) btnInstallApp.classList.add('hidden');
      deferredInstallPrompt = null;
    });
  }

  // ==========================================================================
  // NOVO MODELO DE SITE — HOME, HISTÓRIAS, SONS E MEU RITMO
  // ==========================================================================

  /**
   * Catálogo de paisagens sonoras. Tudo é SINTETIZADO no navegador com a Web
   * Audio API: nenhum arquivo é baixado, não há licenciamento envolvido e o
   * som nunca se repete igual — o que é justamente o que evita que o cérebro
   * se acostume e volte a prestar atenção.
   */
  const CATALOGO_SONS = [
    {
      id: 'chuva',
      titulo: 'Chuva na floresta',
      subtitulo: 'Som da natureza',
      icone: '🌧️',
      construir: (ctx, saida) => {
        const ruido = criarRuidoRosa(ctx);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'bandpass';
        filtro.frequency.value = 1100;
        filtro.Q.value = 0.55;

        // Variação lenta de intensidade: a chuva aperta e afrouxa
        const lfo = ctx.createOscillator();
        const lfoGanho = ctx.createGain();
        lfo.frequency.value = 0.06;
        lfoGanho.gain.value = 340;
        lfo.connect(lfoGanho).connect(filtro.frequency);
        lfo.start();

        ruido.connect(filtro).connect(saida);
        return [ruido, lfo];
      }
    },
    {
      id: 'oceano',
      titulo: 'Oceano à noite',
      subtitulo: 'Som da natureza',
      icone: '🌊',
      construir: (ctx, saida) => {
        const ruido = criarRuidoRosa(ctx);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 500;

        // Ondas: ciclo de ~11s, próximo do ritmo real da arrebentação
        const onda = ctx.createOscillator();
        const ondaGanho = ctx.createGain();
        const volume = ctx.createGain();
        volume.gain.value = 0.55;
        onda.frequency.value = 0.09;
        ondaGanho.gain.value = 0.4;
        onda.connect(ondaGanho).connect(volume.gain);
        onda.start();

        ruido.connect(filtro).connect(volume).connect(saida);
        return [ruido, onda];
      }
    },
    {
      id: 'vento',
      titulo: 'Vento entre as árvores',
      subtitulo: 'Som da natureza',
      icone: '🍃',
      construir: (ctx, saida) => {
        const ruido = criarRuidoRosa(ctx);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 380;
        filtro.Q.value = 3;

        const rajada = ctx.createOscillator();
        const rajadaGanho = ctx.createGain();
        rajada.frequency.value = 0.045;
        rajadaGanho.gain.value = 220;
        rajada.connect(rajadaGanho).connect(filtro.frequency);
        rajada.start();

        ruido.connect(filtro).connect(saida);
        return [ruido, rajada];
      }
    },
    {
      id: 'frequencia432',
      titulo: 'Frequência 432 Hz',
      subtitulo: 'Música relaxante',
      icone: '🎵',
      construir: (ctx, saida) => {
        const volume = ctx.createGain();
        volume.gain.value = 0.09;

        const fundamental = ctx.createOscillator();
        fundamental.type = 'sine';
        fundamental.frequency.value = 432;

        const oitava = ctx.createOscillator();
        oitava.type = 'sine';
        oitava.frequency.value = 216;

        const ganhoOitava = ctx.createGain();
        ganhoOitava.gain.value = 0.5;

        fundamental.connect(volume);
        oitava.connect(ganhoOitava).connect(volume);
        volume.connect(saida);

        fundamental.start();
        oitava.start();
        return [fundamental, oitava];
      }
    },
    {
      id: 'delta',
      titulo: 'Batida binaural delta',
      subtitulo: 'Ondas cerebrais do sono profundo',
      icone: '🧠',
      construir: (ctx, saida) => {
        const volume = ctx.createGain();
        volume.gain.value = 0.08;

        // Diferença de 2,5 Hz entre os ouvidos = faixa delta.
        // Precisa de fone de ouvido para o efeito existir.
        const esquerda = ctx.createOscillator();
        const direita = ctx.createOscillator();
        esquerda.frequency.value = 110;
        direita.frequency.value = 112.5;

        const panEsq = ctx.createStereoPanner();
        const panDir = ctx.createStereoPanner();
        panEsq.pan.value = -1;
        panDir.pan.value = 1;

        esquerda.connect(panEsq).connect(volume);
        direita.connect(panDir).connect(volume);
        volume.connect(saida);

        esquerda.start();
        direita.start();
        return [esquerda, direita];
      }
    },
    {
      id: 'lareira',
      titulo: 'Lareira acesa',
      subtitulo: 'Som ambiente',
      icone: '🔥',
      construir: (ctx, saida) => {
        const ruido = criarRuidoRosa(ctx);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 720;

        // Estalos irregulares do fogo
        const crepitar = ctx.createOscillator();
        const crepitarGanho = ctx.createGain();
        crepitar.type = 'sawtooth';
        crepitar.frequency.value = 0.7;
        crepitarGanho.gain.value = 260;
        crepitar.connect(crepitarGanho).connect(filtro.frequency);
        crepitar.start();

        ruido.connect(filtro).connect(saida);
        return [ruido, crepitar];
      }
    }
  ];

  /**
   * Miniaturas dos cards, desenhadas em SVG dentro do próprio aplicativo.
   *
   * Foto de banco de imagens exigiria licença, download e peso — e o áudio
   * aqui já é sintetizado justamente para não depender de arquivo externo.
   * A arte acompanha a paleta e escala sem borrar em qualquer tela.
   */
  const ARTE_SOM = {
    chuva: `
      <defs><linearGradient id="ceuChuva" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1B2C48"/><stop offset="100%" stop-color="#0B1220"/>
      </linearGradient></defs>
      <rect width="160" height="104" fill="url(#ceuChuva)"/>
      <g fill="#0F1A2E"><ellipse cx="34" cy="90" rx="46" ry="26"/><ellipse cx="106" cy="96" rx="52" ry="28"/></g>
      <g stroke="#7FB0F5" stroke-width="1.4" stroke-linecap="round" opacity="0.75">
        <line x1="22" y1="14" x2="16" y2="34"/><line x1="46" y1="8" x2="40" y2="30"/>
        <line x1="70" y1="18" x2="64" y2="38"/><line x1="96" y1="6" x2="90" y2="28"/>
        <line x1="120" y1="16" x2="114" y2="36"/><line x1="142" y1="10" x2="136" y2="32"/>
        <line x1="34" y1="46" x2="28" y2="64"/><line x1="84" y1="48" x2="78" y2="66"/>
        <line x1="128" y1="50" x2="122" y2="68"/>
      </g>`,
    oceano: `
      <defs><linearGradient id="ceuMar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#101B33"/><stop offset="100%" stop-color="#16304F"/>
      </linearGradient></defs>
      <rect width="160" height="104" fill="url(#ceuMar)"/>
      <circle cx="120" cy="26" r="13" fill="#E8EDF5" opacity="0.9"/>
      <circle cx="115" cy="22" r="13" fill="#101B33"/>
      <g fill="none" stroke="#6FA8E8" stroke-linecap="round">
        <path d="M0 62 Q20 54 40 62 T80 62 T120 62 T160 62" stroke-width="2" opacity="0.8"/>
        <path d="M0 76 Q22 68 44 76 T88 76 T132 76 T176 76" stroke-width="2.2" opacity="0.6"/>
        <path d="M0 90 Q24 82 48 90 T96 90 T144 90" stroke-width="2.4" opacity="0.45"/>
      </g>`,
    vento: `
      <rect width="160" height="104" fill="#0E1A2B"/>
      <g fill="#152743">
        <path d="M0 104 L0 70 Q30 56 58 72 L58 104 Z"/>
        <path d="M96 104 L96 62 Q126 46 160 66 L160 104 Z"/>
      </g>
      <g fill="none" stroke="#8FC3A0" stroke-width="2" stroke-linecap="round" opacity="0.85">
        <path d="M18 34 Q46 24 70 34 T118 30"/>
        <path d="M30 50 Q56 42 78 50 T126 46"/>
        <path d="M12 66 Q34 60 52 66"/>
      </g>
      <g fill="#8FC3A0" opacity="0.7">
        <ellipse cx="128" cy="28" rx="5" ry="2.6" transform="rotate(-24 128 28)"/>
        <ellipse cx="140" cy="46" rx="4" ry="2" transform="rotate(18 140 46)"/>
      </g>`,
    frequencia432: `
      <rect width="160" height="104" fill="#0C1526"/>
      <g fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round">
        <path d="M0 52 Q10 22 20 52 T40 52 T60 52 T80 52 T100 52 T120 52 T140 52 T160 52" opacity="0.9"/>
        <path d="M0 52 Q16 76 32 52 T64 52 T96 52 T128 52 T160 52" opacity="0.45"/>
      </g>
      <g fill="#93C5FD" opacity="0.85">
        <circle cx="40" cy="52" r="3"/><circle cx="80" cy="52" r="3.6"/><circle cx="120" cy="52" r="3"/>
      </g>`,
    delta: `
      <rect width="160" height="104" fill="#0B1424"/>
      <g fill="none" stroke="#3B82F6" stroke-width="1.2" opacity="0.45">
        <circle cx="80" cy="52" r="30"/><circle cx="80" cy="52" r="42"/>
      </g>
      <path d="M0 58 Q20 20 40 58 Q60 92 80 58 Q100 24 120 58 Q140 90 160 58"
            fill="none" stroke="#7C9CF0" stroke-width="2" stroke-linecap="round" opacity="0.95"/>
      <circle cx="80" cy="52" r="6" fill="#93C5FD"/>`,
    lareira: `
      <rect width="160" height="104" fill="#0D1421"/>
      <ellipse cx="80" cy="92" rx="54" ry="14" fill="#16223A"/>
      <g stroke="#5B7BB8" stroke-width="4" stroke-linecap="round">
        <line x1="52" y1="92" x2="92" y2="80"/><line x1="68" y1="80" x2="108" y2="92"/>
      </g>
      <path d="M80 34 Q94 52 86 66 Q80 74 74 66 Q66 52 80 34 Z" fill="#60A5FA" opacity="0.92"/>
      <path d="M80 48 Q88 58 83 68 Q80 73 77 68 Q72 58 80 48 Z" fill="#BFDBFE" opacity="0.85"/>`
  };

  const ARTE_HISTORIA = {
    'casa-na-colina': `
      <rect width="160" height="104" fill="#0C1728"/>
      <circle cx="128" cy="24" r="11" fill="#E8EDF5" opacity="0.85"/>
      <circle cx="123" cy="20" r="11" fill="#0C1728"/>
      <path d="M0 104 Q46 58 92 78 Q126 92 160 76 L160 104 Z" fill="#142440"/>
      <g transform="translate(58 52)">
        <path d="M0 14 L14 2 L28 14 Z" fill="#1D3357"/>
        <rect x="4" y="14" width="20" height="16" fill="#16273F"/>
        <rect x="10" y="19" width="8" height="8" fill="#93C5FD" opacity="0.95"/>
      </g>`,
    'trem-noturno': `
      <rect width="160" height="104" fill="#0B1523"/>
      <g stroke="#1E3355" stroke-width="2"><line x1="0" y1="86" x2="160" y2="86"/><line x1="0" y1="94" x2="160" y2="94"/></g>
      <g fill="#16273F">
        <rect x="18" y="52" width="44" height="30" rx="4"/><rect x="70" y="52" width="34" height="30" rx="4"/>
        <rect x="112" y="52" width="34" height="30" rx="4"/>
      </g>
      <g fill="#93C5FD" opacity="0.9">
        <rect x="26" y="60" width="10" height="9" rx="1"/><rect x="44" y="60" width="10" height="9" rx="1"/>
        <rect x="78" y="60" width="10" height="9" rx="1"/><rect x="120" y="60" width="10" height="9" rx="1"/>
      </g>
      <g fill="#E8EDF5" opacity="0.5">
        <circle cx="30" cy="18" r="1.5"/><circle cx="76" cy="12" r="1.5"/><circle cx="132" cy="22" r="1.5"/>
      </g>`,
    'biblioteca-da-chuva': `
      <rect width="160" height="104" fill="#0C1626"/>
      <g fill="#16273F">
        <rect x="10" y="24" width="58" height="70" rx="3"/><rect x="92" y="24" width="58" height="70" rx="3"/>
      </g>
      <g fill="#2A4370">
        <rect x="16" y="32" width="8" height="22"/><rect x="27" y="30" width="7" height="24"/>
        <rect x="37" y="34" width="9" height="20"/><rect x="49" y="31" width="7" height="23"/>
        <rect x="98" y="33" width="8" height="21"/><rect x="109" y="30" width="7" height="24"/>
        <rect x="119" y="35" width="9" height="19"/><rect x="131" y="32" width="7" height="22"/>
      </g>
      <rect x="70" y="20" width="20" height="60" rx="2" fill="#101E36"/>
      <g stroke="#7FB0F5" stroke-width="1.2" stroke-linecap="round" opacity="0.8">
        <line x1="76" y1="26" x2="74" y2="44"/><line x1="84" y1="30" x2="82" y2="50"/>
        <line x1="79" y1="52" x2="77" y2="70"/>
      </g>`
  };

  /** Monta a miniatura com a arte correspondente e, quando cabe, o botão de tocar. */
  let contadorDeMiniaturas = 0;

  function montarMiniatura(chave, mapa, mostrarPlay) {
    let desenho = mapa[chave] || '';

    // A mesma arte pode aparecer em duas grades ao mesmo tempo (vitrine da home
    // e biblioteca). Os ids de gradiente dentro do SVG seriam repetidos no
    // documento, e o navegador passa a resolver todos para o primeiro.
    if (desenho.includes('id="ceu')) {
      const sufixo = `-${++contadorDeMiniaturas}`;
      desenho = desenho
        .replace(/id="(ceu[A-Za-z]+)"/g, `id="$1${sufixo}"`)
        .replace(/url\(#(ceu[A-Za-z]+)\)/g, `url(#$1${sufixo})`);
    }

    const svg = desenho
      ? `<svg class="thumb-arte" viewBox="0 0 160 104" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${desenho}</svg>`
      : '';
    const play = mostrarPlay ? '<span class="media-play">&#9654;</span>' : '';
    return `<div class="media-thumb">${svg}${play}</div>`;
  }

  /** Ruído rosa em laço — base de quase todas as paisagens acima. */
  function criarRuidoRosa(ctx) {
    const tamanho = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, tamanho, ctx.sampleRate);
    const dados = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < tamanho; i++) {
      const branco = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + branco * 0.0555179;
      b1 = 0.99332 * b1 + branco * 0.0750759;
      b2 = 0.96900 * b2 + branco * 0.1538520;
      b3 = 0.86650 * b3 + branco * 0.3104856;
      b4 = 0.55000 * b4 + branco * 0.5329522;
      b5 = -0.7616 * b5 - branco * 0.0168980;
      dados[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + branco * 0.5362) * 0.09;
      b6 = branco * 0.115926;
    }

    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.loop = true;
    fonte.start();
    return fonte;
  }

  const somAtual = {
    ctx: null,
    nos: [],
    ganho: null,
    id: null,
    timer: null
  };

  function pararSom() {
    if (somAtual.timer) { clearTimeout(somAtual.timer); somAtual.timer = null; }
    somAtual.nos.forEach(no => { try { no.stop(); } catch (e) {} });
    somAtual.nos = [];
    if (somAtual.ctx) { try { somAtual.ctx.close(); } catch (e) {} }
    somAtual.ctx = null;
    somAtual.ganho = null;
    somAtual.id = null;

    document.querySelectorAll('.media-card.tocando, .sound-card.tocando')
      .forEach(el => el.classList.remove('tocando'));

    const mini = document.getElementById('miniPlayer');
    if (mini) mini.hidden = true;
  }

  function tocarSom(id) {
    const som = CATALOGO_SONS.find(s => s.id === id);
    if (!som) return;

    if (somAtual.id === id) { pararSom(); return; }
    pararSom();

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const mestre = ctx.createGain();

      const controleVolume = document.getElementById('soundVolume');
      const volumeInicial = controleVolume ? Number(controleVolume.value) / 100 : 0.55;

      // Entrada suave: som que começa no volume cheio assusta
      mestre.gain.setValueAtTime(0.0001, ctx.currentTime);
      mestre.gain.exponentialRampToValueAtTime(Math.max(volumeInicial, 0.02), ctx.currentTime + 2.5);
      mestre.connect(ctx.destination);

      somAtual.ctx = ctx;
      somAtual.ganho = mestre;
      somAtual.nos = som.construir(ctx, mestre) || [];
      somAtual.id = id;

      document.querySelectorAll(`[data-som="${id}"]`).forEach(el => el.classList.add('tocando'));

      abrirPlayer({
        tipo: 'som',
        id,
        titulo: som.titulo,
        subtitulo: som.subtitulo,
        arte: ARTE_SOM[id]
      });

      agendarDesligamentoDoSom();
    } catch (err) {
      console.warn('Não foi possível iniciar o som:', err);
      showToast('Não foi possível iniciar o som neste navegador.', 'error');
    }
  }

  /** Pausa mantendo o contexto vivo: recriar o áudio custaria um corte seco. */
  function pausarSom() {
    if (somAtual.ctx && somAtual.ctx.state === 'running') {
      somAtual.ctx.suspend().catch(() => {});
    }
  }

  function retomarSom() {
    if (somAtual.ctx && somAtual.ctx.state === 'suspended') {
      somAtual.ctx.resume().catch(() => {});
    }
  }

  /** Timer de sono: desliga sozinho, com esmaecimento de 20s. */
  function agendarDesligamentoDoSom() {
    if (somAtual.timer) { clearTimeout(somAtual.timer); somAtual.timer = null; }
    const minutos = player.minutosTimer;
    if (!minutos || !somAtual.ctx) return;

    somAtual.timer = setTimeout(() => {
      if (!somAtual.ganho || !somAtual.ctx) return;
      const fim = somAtual.ctx.currentTime + 20;
      try {
        somAtual.ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
      } catch (e) {}
      setTimeout(pararSom, 21000);
    }, minutos * 60 * 1000);
  }

  function renderizarSons() {
    const grade = document.getElementById('soundsGrid');
    if (!grade) return;

    grade.innerHTML = '';
    CATALOGO_SONS.forEach(som => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'media-card sound-card';
      card.setAttribute('data-som', som.id);
      card.innerHTML = `
        ${montarMiniatura(som.id, ARTE_SOM, true)}
        <div class="media-info">
          <strong>${escapeHTML(som.titulo)}</strong>
          <span>${escapeHTML(som.subtitulo)}</span>
        </div>
      `;
      card.addEventListener('click', () => tocarSom(som.id));
      grade.appendChild(card);
    });
  }

  /** Vitrine da home: quatro destaques que levam para as telas completas. */
  function renderizarVitrineHome() {
    const grade = document.getElementById('homeMediaGrid');
    if (!grade) return;

    const destaques = [
      { tipo: 'som', ref: 'chuva' },
      { tipo: 'som', ref: 'oceano' },
      { tipo: 'historia', ref: 'casa-na-colina' },
      { tipo: 'som', ref: 'frequencia432' }
    ];

    grade.innerHTML = '';
    destaques.forEach(item => {
      const dados = item.tipo === 'som'
        ? CATALOGO_SONS.find(s => s.id === item.ref)
        : HISTORIAS.find(h => h.id === item.ref);
      if (!dados) return;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'media-card';
      if (item.tipo === 'som') card.setAttribute('data-som', dados.id);
      card.innerHTML = `
        ${montarMiniatura(dados.id, item.tipo === "som" ? ARTE_SOM : ARTE_HISTORIA, item.tipo === "som")}
        <div class="media-info">
          <strong>${escapeHTML(dados.titulo)}</strong>
          <span>${escapeHTML(dados.subtitulo)}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        if (item.tipo === 'som') {
          tocarSom(dados.id);
        } else {
          switchView('stories');
          abrirHistoria(dados.id);
        }
      });
      grade.appendChild(card);
    });
  }

  // ---------- Histórias para dormir (textos originais) ----------
  const HISTORIAS = [
    {
      id: 'casa-na-colina',
      titulo: 'A casa na colina',
      subtitulo: 'História para dormir',
      icone: '🏡',
      duracao: '6 min de leitura',
      paragrafos: [
        'Existe uma casa no alto de uma colina onde as luzes ficam acesas por mais tempo do que em qualquer outro lugar do vale. Não porque alguém esteja esperando: é só o costume da casa, que gosta de ver o fim do dia com calma.',
        'A colina é coberta de capim alto, do tipo que se deita inteiro quando o vento passa e depois se levanta devagar, sem pressa nenhuma de voltar ao lugar. Daqui de cima dá para ver o rio. Ele é escuro agora, com um risco de lua atravessado no meio.',
        'Na varanda existe uma cadeira de madeira que range um pouco. É um som bom. Range quando você senta, range quando você balança, e depois fica quieta junto com você.',
        'A brisa que sobe do rio chega morna. Ela passa pelo capim, passa pela varanda, mexe na cortina lá dentro e vai embora sem fechar a porta.',
        'Lá longe, uma luz se apaga. Depois outra. O vale vai ficando com menos pontos brilhantes, e os que sobram parecem mais bonitos por causa disso.',
        'A casa não pede nada de você. Não há nada aqui que precise ser resolvido, respondido ou lembrado. As coisas do dia ficaram lá embaixo, e daqui de cima elas parecem realmente pequenas.',
        'O capim se deita de novo. O rio continua indo para onde vai desde sempre. A cadeira range uma última vez.',
        'E a casa na colina, que sempre foi a última a apagar as luzes, apaga as dela também. Boa noite.'
      ]
    },
    {
      id: 'trem-noturno',
      titulo: 'O trem noturno',
      subtitulo: 'História para dormir',
      icone: '🚂',
      duracao: '5 min de leitura',
      paragrafos: [
        'O trem sai às onze e meia e não tem pressa de chegar. Ninguém a bordo tem. É um trem de vagões antigos, com bancos de tecido gasto e uma luz amarela que não incomoda os olhos.',
        'O balanço é constante. Um lado, outro lado, um lado. Depois de alguns minutos o corpo desiste de se segurar e simplesmente aceita o movimento.',
        'Do lado de fora, o campo passa em faixas escuras. De vez em quando uma casa isolada, uma cerca, uma árvore sozinha no meio do nada. Todas ficam para trás sem reclamar.',
        'O condutor passa pelo corredor, cumprimenta com a cabeça e segue. Ele não pede o bilhete. Neste trem ninguém precisa provar que tem direito de estar descansando.',
        'As rodas fazem aquele som repetido nos trilhos, sempre no mesmo intervalo, como se alguém estivesse contando baixinho para você não precisar contar.',
        'A janela está fria de um lado e morna do outro. Você encosta a testa nela e o campo continua passando.',
        'Faltam muitas horas para chegar. Essa é a melhor parte: não há nada a fazer até lá, e ninguém vai te acordar antes da hora.',
        'O trem segue. Você não precisa mais ficar acordada para ele chegar. Boa viagem, e boa noite.'
      ]
    },
    {
      id: 'biblioteca-da-chuva',
      titulo: 'A biblioteca da chuva',
      subtitulo: 'História para dormir',
      icone: '📚',
      duracao: '5 min de leitura',
      paragrafos: [
        'Chove desde a tarde, e a biblioteca ficou vazia mais cedo do que o normal. Sobrou só a bibliotecária, que já foi embora, e a chuva, que ficou.',
        'As estantes vão até o teto. Entre elas o ar é mais parado, mais quente, e cheira àquele cheiro bom de papel que ficou muito tempo guardado sem se estragar.',
        'Nas janelas altas, a água escorre em fios que se encontram e se separam. Nenhum deles chega ao fim do mesmo jeito.',
        'Há uma poltrona funda perto da janela, do tipo que aceita o corpo inteiro sem devolver nada. Sentar nela é praticamente uma decisão de ficar.',
        'Você não precisa ler nada. Todos esses livros já foram escritos, já foram lidos, já cumpriram o que tinham para cumprir. Eles estão aqui só fazendo companhia.',
        'A chuva engrossa um pouco e depois afrouxa. O relógio na parede está três minutos atrasado e ninguém nunca se importou com isso.',
        'Lá fora o mundo continua molhado e apressado. Aqui dentro, não.',
        'A luz da janela vai diminuindo até virar só um cinza suave. A chuva continua. Você pode fechar os olhos — a biblioteca fica de guarda. Boa noite.'
      ]
    }
  ];

  function renderizarHistorias() {
    const grade = document.getElementById('storiesGrid');
    if (!grade) return;

    grade.innerHTML = '';
    HISTORIAS.forEach(historia => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'media-card';
      card.innerHTML = `
        ${montarMiniatura(historia.id, ARTE_HISTORIA, false)}
        <div class="media-info">
          <strong>${escapeHTML(historia.titulo)}</strong>
          <span>${escapeHTML(historia.duracao)}</span>
        </div>
      `;
      card.addEventListener('click', () => abrirHistoria(historia.id));
      grade.appendChild(card);
    });
  }

  function abrirHistoria(id) {
    const historia = HISTORIAS.find(h => h.id === id);
    if (!historia) return;

    const leitor = document.getElementById('storyReader');
    const grade = document.getElementById('storiesGrid');
    if (!leitor || !grade) return;

    document.getElementById('storyTitle').textContent = historia.titulo;
    document.getElementById('storyMeta').textContent = historia.duracao;

    const corpo = document.getElementById('storyBody');
    corpo.innerHTML = '';
    historia.paragrafos.forEach(texto => {
      const p = document.createElement('p');
      p.textContent = texto;
      corpo.appendChild(p);
    });

    leitor.setAttribute('data-historia', id);
    grade.classList.add('hidden');
    leitor.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fecharHistoria() {
    pararNarracao();
    document.getElementById('storyReader')?.classList.add('hidden');
    document.getElementById('storiesGrid')?.classList.remove('hidden');
  }

  // ---------- Narrador ----------
  //
  // A versão anterior mandava a história inteira numa única fala. Isso trazia
  // três problemas: o Chrome corta falas longas depois de ~15s; a pausa entre
  // parágrafos não existia (a voz emendava tudo); e não dava para saber onde a
  // leitura estava. Agora cada parágrafo é uma fala própria, encadeada.
  const narrador = {
    fila: [],
    indice: 0,
    tocando: false,
    pausado: false,
    vigia: null,
    velocidade: 0.8
  };

  const NARRACAO_VELOCIDADE_KEY = 'desliguese_velocidade_narracao';
  const PAUSA_ENTRE_PARAGRAFOS_MS = 900;

  /**
   * Escolhe a melhor voz em português disponível.
   * A lista chega vazia na primeira chamada em vários navegadores — por isso o
   * evento voiceschanged também é observado, em initNarrador.
   */
  function escolherVozPtBr() {
    const vozes = speechSynthesis.getVoices().filter(v => /^pt/i.test(v.lang || ''));
    if (vozes.length === 0) return null;

    // Vozes reconhecidamente mais naturais, em ordem de preferência
    const preferidas = ['luciana', 'francisca', 'maria', 'google português do brasil', 'google portugues do brasil'];
    for (const nome of preferidas) {
      const achou = vozes.find(v => (v.name || '').toLowerCase().includes(nome));
      if (achou) return achou;
    }

    // Prefere pt-BR sobre pt-PT, e voz local sobre remota (menos travadas)
    const brasileiras = vozes.filter(v => /pt[-_]?br/i.test(v.lang));
    const candidatas = brasileiras.length ? brasileiras : vozes;
    return candidatas.find(v => v.localService) || candidatas[0];
  }

  function definirStatusNarracao(texto) {
    const el = document.getElementById('narrationStatus');
    if (!el) return;
    el.textContent = texto || '';
    el.classList.toggle('hidden', !texto);
  }

  function destacarParagrafo(indice) {
    const paragrafos = document.querySelectorAll('#storyBody p');
    paragrafos.forEach((p, i) => p.classList.toggle('lendo-agora', i === indice));

    const alvo = paragrafos[indice];
    if (alvo) {
      const caixa = alvo.getBoundingClientRect();
      const foraDaTela = caixa.top < 90 || caixa.bottom > window.innerHeight - 90;
      if (foraDaTela) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function limparDestaques() {
    document.querySelectorAll('#storyBody p.lendo-agora')
      .forEach(p => p.classList.remove('lendo-agora'));
  }

  function falarProximoParagrafo() {
    if (!narrador.tocando) return;

    if (narrador.indice >= narrador.fila.length) {
      encerrarNarracao(true);
      return;
    }

    const texto = narrador.fila[narrador.indice];
    destacarParagrafo(narrador.indice);
    definirStatusNarracao(`Lendo ${narrador.indice + 1} de ${narrador.fila.length}`);

    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    fala.rate = narrador.velocidade;
    fala.pitch = 0.95;
    fala.volume = 1;

    const voz = escolherVozPtBr();
    if (voz) fala.voice = voz;

    fala.onend = () => {
      if (!narrador.tocando) return;
      narrador.indice++;
      // Silêncio entre parágrafos: é o respiro que a leitura corrida não tinha
      setTimeout(falarProximoParagrafo, PAUSA_ENTRE_PARAGRAFOS_MS);
    };

    fala.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('Falha na narração:', e.error);
      encerrarNarracao(false);
      showToast('A narração foi interrompida pelo navegador.', 'info');
    };

    speechSynthesis.speak(fala);
  }

  function narrarHistoria() {
    if (!('speechSynthesis' in window)) {
      showToast('Este navegador não oferece leitura em voz alta.', 'info');
      return;
    }

    // Retomar de onde parou
    if (narrador.pausado) {
      narrador.pausado = false;
      speechSynthesis.resume();
      alternarBotoesNarracao(true);
      definirStatusNarracao(`Lendo ${narrador.indice + 1} de ${narrador.fila.length}`);
      return;
    }

    const id = document.getElementById('storyReader')?.getAttribute('data-historia');
    const historia = HISTORIAS.find(h => h.id === id);
    if (!historia) return;

    pararNarracao();

    narrador.fila = historia.paragrafos.slice();
    narrador.indice = 0;
    narrador.tocando = true;
    narrador.pausado = false;

    alternarBotoesNarracao(true);
    abrirPlayer({
      tipo: 'historia',
      id: historia.id,
      titulo: historia.titulo,
      subtitulo: 'História narrada',
      arte: ARTE_HISTORIA[historia.id]
    });

    // Contorna o bug conhecido do Chrome, que suspende a fila sozinho
    narrador.vigia = setInterval(() => {
      if (narrador.tocando && !narrador.pausado && !speechSynthesis.speaking) {
        speechSynthesis.resume();
      }
    }, 8000);

    falarProximoParagrafo();
  }

  function pausarNarracao() {
    if (!narrador.tocando || narrador.pausado) return;
    narrador.pausado = true;
    try { speechSynthesis.pause(); } catch (e) {}
    alternarBotoesNarracao(true);
    definirStatusNarracao(`Pausado no parágrafo ${narrador.indice + 1}. Toque em "Continuar" para retomar.`);
  }

  function encerrarNarracao(chegouAoFim) {
    narrador.tocando = false;
    narrador.pausado = false;
    if (narrador.vigia) { clearInterval(narrador.vigia); narrador.vigia = null; }
    limparDestaques();
    alternarBotoesNarracao(false);
    definirStatusNarracao(chegouAoFim ? 'Leitura concluída. Boa noite. 🌙' : '');
    if (chegouAoFim) setTimeout(() => definirStatusNarracao(''), 8000);
  }

  function pararNarracao() {
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch (e) {}
    }
    narrador.indice = 0;
    encerrarNarracao(false);
  }

  function alternarBotoesNarracao(narrando) {
    const btnNarrar = document.getElementById('btnNarrateStory');
    const btnPausar = document.getElementById('btnPauseNarration');
    const btnParar = document.getElementById('btnStopNarration');

    if (btnNarrar) {
      // Quando pausado, o botão principal vira "Continuar"
      btnNarrar.classList.toggle('hidden', narrando && !narrador.pausado);
      btnNarrar.textContent = narrador.pausado ? '▶ Continuar' : '🔊 Narrar história';
    }
    btnPausar?.classList.toggle('hidden', !narrando || narrador.pausado);
    btnParar?.classList.toggle('hidden', !narrando);
  }

  function initNarrador() {
    // A lista de vozes costuma chegar depois do carregamento da página
    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener?.('voiceschanged', () => {
        const voz = escolherVozPtBr();
        // voz escolhida silenciosamente; o rótulo aparece na interface
      });
    }

    const controle = document.getElementById('narrationRate');
    const rotulo = document.getElementById('narrationRateLabel');

    try {
      const salva = parseFloat(localStorage.getItem(NARRACAO_VELOCIDADE_KEY));
      if (salva >= 0.6 && salva <= 1.1) narrador.velocidade = salva;
    } catch (e) {}

    if (controle) {
      controle.value = String(Math.round(narrador.velocidade * 100));
      if (rotulo) rotulo.textContent = narrador.velocidade.toFixed(2).replace('.', ',') + '×';

      controle.addEventListener('input', () => {
        narrador.velocidade = Number(controle.value) / 100;
        if (rotulo) rotulo.textContent = narrador.velocidade.toFixed(2).replace('.', ',') + '×';
        try { localStorage.setItem(NARRACAO_VELOCIDADE_KEY, String(narrador.velocidade)); } catch (e) {}

        // Velocidade só vale para a próxima fala: reinicia o parágrafo atual
        if (narrador.tocando && !narrador.pausado) {
          speechSynthesis.cancel();
          falarProximoParagrafo();
        }
      });
    }

    document.getElementById('btnPauseNarration')?.addEventListener('click', pausarNarracao);

    // Sair da aba ou fechar a história não pode deixar voz tocando sozinha
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && narrador.tocando && !narrador.pausado) pausarNarracao();
    });
  }

  // ---------- Meu Ritmo ----------
  const PONTUACAO_HUMOR = { great: 100, medium: 65, terrible: 30 };

  /** Converte "23:40" em minutos, tratando a madrugada como continuação da noite. */
  function minutosDaNoite(horario) {
    if (!horario || !/^\d{2}:\d{2}$/.test(horario)) return null;
    const [h, m] = horario.split(':').map(Number);
    let minutos = h * 60 + m;
    // Deitar às 00:30 é "mais tarde" que às 23:00, e não 22 horas antes
    if (h < 12) minutos += 24 * 60;
    return minutos;
  }

  function minutosParaHorario(minutos) {
    const total = ((Math.round(minutos) % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `${h}h${m}`;
  }

  function calcularRitmo() {
    const noites = (appState.history || [])
      .filter(e => e.bedTime && e.wakeTime)
      .slice(0, 14);

    const comHumor = (appState.history || []).filter(e => e.sleepMood).slice(0, 14);

    const resultado = {
      noitesComHorario: noites.length,
      noitesComHumor: comHumor.length,
      duracaoMedia: null,
      qualidadeMedia: null,
      janelaDormir: null,
      janelaAcordar: null,
      series: []
    };

    if (comHumor.length > 0) {
      const soma = comHumor.reduce((acc, e) => acc + (PONTUACAO_HUMOR[e.sleepMood] || 0), 0);
      resultado.qualidadeMedia = Math.round(soma / comHumor.length);
    }

    if (noites.length > 0) {
      let somaDuracao = 0;
      const deitar = [];
      const levantar = [];

      noites.forEach(e => {
        const ini = minutosDaNoite(e.bedTime);
        let fim = minutosDaNoite(e.wakeTime);
        if (ini === null || fim === null) return;
        if (fim <= ini) fim += 24 * 60;
        somaDuracao += fim - ini;
        deitar.push(ini);
        levantar.push(fim % (24 * 60));
      });

      if (deitar.length > 0) {
        const media = somaDuracao / deitar.length;
        resultado.duracaoMedia = `${Math.floor(media / 60)}h${String(Math.round(media % 60)).padStart(2, '0')}`;

        const mediaDeitar = deitar.reduce((a, b) => a + b, 0) / deitar.length;
        const mediaLevantar = levantar.reduce((a, b) => a + b, 0) / levantar.length;
        resultado.janelaDormir = `${minutosParaHorario(mediaDeitar - 22)} - ${minutosParaHorario(mediaDeitar + 22)}`;
        resultado.janelaAcordar = `${minutosParaHorario(mediaLevantar - 22)} - ${minutosParaHorario(mediaLevantar + 22)}`;
      }
    }

    resultado.series = (appState.history || []).slice(0, 7).reverse().map(e => ({
      data: e.date,
      qualidade: PONTUACAO_HUMOR[e.sleepMood] || 0,
      humor: e.sleepMood
    }));

    return resultado;
  }

  function renderizarRitmo() {
    const r = calcularRitmo();
    const definir = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };

    const semDados = '—';
    definir('homeAvgSleep', r.duracaoMedia || semDados);
    definir('rhythmAvgSleep', r.duracaoMedia || semDados);
    definir('homeAvgQuality', r.qualidadeMedia !== null ? `${r.qualidadeMedia}%` : semDados);
    definir('rhythmAvgQuality', r.qualidadeMedia !== null ? `${r.qualidadeMedia}%` : semDados);
    definir('homeBedWindow', r.janelaDormir || semDados);
    definir('rhythmBedWindow', r.janelaDormir || semDados);
    definir('homeWakeWindow', r.janelaAcordar || semDados);
    definir('rhythmWakeWindow', r.janelaAcordar || semDados);

    const aviso = document.getElementById('rhythmEmptyNote');
    if (aviso) aviso.classList.toggle('hidden', r.noitesComHorario > 0);

    // Gráfico de barras das últimas noites
    const grafico = document.getElementById('rhythmChart');
    if (grafico) {
      grafico.innerHTML = '';
      if (r.series.length === 0) {
        grafico.innerHTML = '<p class="rhythm-empty-note">Ainda não há noites avaliadas. Use o check-in matinal para começar.</p>';
      } else {
        const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        r.series.forEach(item => {
          const coluna = document.createElement('div');
          coluna.className = 'chart-col';
          const altura = Math.max(item.qualidade, 6);
          const rotulo = item.data ? dias[new Date(item.data).getDay()] : '—';
          coluna.innerHTML = `
            <div class="chart-bar-track">
              <div class="chart-bar" style="height: ${altura}%"></div>
            </div>
            <span class="chart-label">${rotulo}</span>
          `;
          coluna.title = item.humor
            ? `Qualidade: ${item.qualidade}%`
            : 'Noite sem avaliação';
          grafico.appendChild(coluna);
        });
      }
    }

    const insight = document.getElementById('rhythmInsight');
    if (insight) {
      if (r.noitesComHorario >= 3 && r.janelaDormir) {
        insight.innerHTML = `<strong>O que os seus registros mostram:</strong> nas últimas ${r.noitesComHorario} noites você dormiu em média <strong>${r.duracaoMedia}</strong>, deitando por volta de <strong>${r.janelaDormir}</strong>. Manter esse horário nos fins de semana costuma ser o que mais estabiliza o sono.`;
      } else if (r.noitesComHumor > 0) {
        insight.innerHTML = `<strong>Começando a entender o seu ritmo:</strong> você já avaliou ${r.noitesComHumor} noite(s). Preencha também os horários no check-in matinal para descobrirmos a sua melhor janela de sono.`;
      } else {
        insight.textContent = 'Registre suas noites no check-in matinal para o Desligue-se aprender o seu ritmo.';
      }
    }
  }

  /** Guarda os horários informados na entrada mais recente do diário. */
  async function salvarHorariosDeSono() {
    const bed = document.getElementById('inputBedTime')?.value || '';
    const wake = document.getElementById('inputWakeTime')?.value || '';
    const feedback = document.getElementById('sleepTimesFeedback');

    const avisar = (msg, ok) => {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.className = `sleep-times-feedback ${ok ? 'ok' : 'erro'}`;
      feedback.classList.remove('hidden');
    };

    if (!bed || !wake) return avisar('Informe os dois horários para calcular o seu ritmo.', false);
    if (!appState.currentUser) return avisar('Entre na sua conta para guardar os horários das suas noites.', false);
    if (!appState.history.length) return avisar('Faça um registro no diário antes de anotar os horários.', false);

    const entrada = appState.history[0];
    entrada.bedTime = bed;
    entrada.wakeTime = wake;
    saveLocalHistory(appState.history);

    if (supabase && entrada.id) {
      try {
        const dados = { ...(entrada.triagedRaw || {}), bedTime: bed, wakeTime: wake };
        await supabase.from('journal_entries')
          .update({ sleep_times: { bedTime: bed, wakeTime: wake } })
          .eq('id', entrada.id);
        void dados;
      } catch (e) {
        console.warn('Não foi possível sincronizar os horários:', e.message);
      }
    }

    renderizarRitmo();
    avisar('Horários guardados. Seu ritmo já está sendo calculado.', true);
  }

  // ---------- Ligações da nova navegação ----------
  function initNovoSite() {
    // Navegação por data-view (cabeçalho, rodapé, barra inferior e cards)
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => switchView(el.getAttribute('data-view')));
    });

    document.querySelectorAll('.pillar-card[data-goto]').forEach(card => {
      const ir = () => switchView(card.getAttribute('data-goto'));
      card.addEventListener('click', ir);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
      });
    });

    // Chamadas para ação da home
    const irParaDiario = () => switchView('night');
    document.getElementById('btnHeroStart')?.addEventListener('click', irParaDiario);
    document.getElementById('btnGoRhythm')?.addEventListener('click', () => switchView('rhythm'));
    document.getElementById('btnGoSounds')?.addEventListener('click', () => switchView('sounds'));
    document.getElementById('btnFinalCta')?.addEventListener('click', () => {
      if (appState.currentUser) switchView('night');
      else openModal(modalAuth);
    });
    document.getElementById('btnHeroHow')?.addEventListener('click', () => {
      document.getElementById('homeHowSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Escrita rápida direto da home
    document.getElementById('btnQuickWrite')?.addEventListener('click', () => {
      guardarRascunhoDaApresentacao();
      switchView('night');
      // switchView abre o login quando não há sessão; o rascunho fica guardado
      // e é despejado no diário assim que a pessoa entrar.
      if (appState.currentUser) {
        recuperarRascunhoDaApresentacao();
        setTimeout(() => journalInput?.focus(), 350);
      }
    });

    document.querySelectorAll('.mood-face').forEach(face => {
      face.addEventListener('click', () => {
        const jaEscolhido = face.classList.contains('escolhido');
        document.querySelectorAll('.mood-face').forEach(f => f.classList.remove('escolhido'));
        if (!jaEscolhido) face.classList.add('escolhido');
      });
    });

    // Histórias
    document.getElementById('btnBackToStories')?.addEventListener('click', fecharHistoria);
    document.getElementById('btnNarrateStory')?.addEventListener('click', narrarHistoria);
    document.getElementById('btnStopNarration')?.addEventListener('click', pararNarracao);
    document.getElementById('btnStoryToRoutine')?.addEventListener('click', () => {
      pararNarracao();
      switchView('night');
      showStep('routine');
      startRelaxationRoutine();
    });

    // Sons
    document.getElementById('btnStopSound')?.addEventListener('click', pararSom);
    document.getElementById('sleepTimer')?.addEventListener('change', agendarDesligamentoDoSom);
    document.getElementById('soundVolume')?.addEventListener('input', (e) => {
      if (!somAtual.ganho || !somAtual.ctx) return;
      const valor = Math.max(Number(e.target.value) / 100, 0.0001);
      somAtual.ganho.gain.setTargetAtTime(valor, somAtual.ctx.currentTime, 0.2);
    });

    // Horários do check-in matinal
    document.getElementById('btnSaveSleepTimes')?.addEventListener('click', salvarHorariosDeSono);

    // Política de privacidade abre o mesmo documento dos termos
    document.getElementById('linkOpenPrivacyFooter')?.addEventListener('click', () => openModal(modalTerms));
  }

  /**
   * Desenha as telas novas a partir dos catálogos.
   *
   * Fica SEPARADO de initNovoSite de propósito: CATALOGO_SONS e HISTORIAS são
   * `const` declarados mais abaixo, e o laço de inicialização roda antes disso.
   * Ler essas constantes lá dentro cai na zona morta temporal e lança
   * ReferenceError — o mesmo defeito que derrubava o app inteiro na versão
   * auditada. Por isso a chamada acontece no fim do arquivo.
   */
  function renderizarConteudoNovoSite() {
    renderizarSons();
    renderizarHistorias();
    renderizarVitrineHome();
    renderizarRitmo();
  }

  // ==========================================================================
  // IA DO SONO — CONVERSA (EXCLUSIVA DO PLANO PRO)
  // ==========================================================================
  const chatState = { mensagens: [], enviando: false, saudou: false };
  const CHAT_STORAGE = 'desliguese_conversa';

  function elementosDoChat() {
    return {
      bloqueio: document.getElementById('chatLocked'),
      area: document.getElementById('chatArea'),
      lista: document.getElementById('chatMessages'),
      digitando: document.getElementById('chatTyping'),
      form: document.getElementById('chatForm'),
      input: document.getElementById('chatInput'),
      enviar: document.getElementById('btnChatSend'),
      sugestoes: document.getElementById('chatSuggestions')
    };
  }

  /** Alterna entre a tela de bloqueio e a conversa, conforme o plano. */
  function prepararChat() {
    const { bloqueio, area, input } = elementosDoChat();
    const liberado = isUserPro();

    bloqueio?.classList.toggle('hidden', liberado);
    area?.classList.toggle('hidden', !liberado);

    if (!liberado) return;

    if (chatState.mensagens.length === 0) carregarConversaSalva();
    if (chatState.mensagens.length === 0 && !chatState.saudou) {
      chatState.saudou = true;
      adicionarMensagem('model', saudacaoDaNoite());
    }
    setTimeout(() => input?.focus(), 200);
  }

  function saudacaoDaNoite() {
    const hora = new Date().getHours();
    const nome = (appState.currentUser?.user_metadata?.full_name || '').split(' ')[0];
    const tratamento = nome ? `, ${nome}` : '';

    if (hora >= 0 && hora < 5) {
      return `Oi${tratamento}. Madrugada acordada é uma das horas mais solitárias que existem. Estou aqui. O que está te mantendo desperta?`;
    }
    if (hora >= 20) {
      return `Boa noite${tratamento}. Como está a sua cabeça agora, no fim do dia?`;
    }
    return `Oi${tratamento}. Me conta o que está passando pela sua cabeça.`;
  }

  function adicionarMensagem(papel, texto, opcoes = {}) {
    const { lista } = elementosDoChat();
    if (!lista) return;

    const balao = document.createElement('div');
    balao.className = `chat-msg chat-msg-${papel === 'user' ? 'usuaria' : 'ia'}`;
    balao.textContent = texto;
    lista.appendChild(balao);
    lista.scrollTop = lista.scrollHeight;

    if (opcoes.salvar !== false) {
      chatState.mensagens.push({ role: papel, text: texto });
      salvarConversa();
    }
  }

  function salvarConversa() {
    if (!appState.currentUser) return;
    try {
      localStorage.setItem(
        `${CHAT_STORAGE}_${appState.currentUser.id}`,
        JSON.stringify(chatState.mensagens.slice(-40))
      );
    } catch (e) {}
  }

  function carregarConversaSalva() {
    if (!appState.currentUser) return;
    try {
      const bruto = localStorage.getItem(`${CHAT_STORAGE}_${appState.currentUser.id}`);
      if (!bruto) return;
      const salvas = JSON.parse(bruto);
      if (!Array.isArray(salvas) || salvas.length === 0) return;

      chatState.mensagens = salvas;
      const { lista } = elementosDoChat();
      if (lista) lista.innerHTML = '';
      salvas.forEach(m => adicionarMensagem(m.role, m.text, { salvar: false }));
    } catch (e) {}
  }

  async function enviarMensagemDoChat(texto) {
    const limpo = (texto || '').trim();
    if (!limpo || chatState.enviando) return;

    const { input, digitando, enviar, sugestoes } = elementosDoChat();
    chatState.enviando = true;
    if (enviar) enviar.disabled = true;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    sugestoes?.classList.add('hidden');

    adicionarMensagem('user', limpo);
    digitando?.classList.remove('hidden');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Entre na sua conta para conversar.');

      const dados = await safeFetchJson('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        // A saudação inicial da IA não entra: a conversa enviada precisa
        // começar por uma fala da usuária (exigência da API do Gemini).
        body: JSON.stringify({ messages: chatState.mensagens.slice(-24) })
      });

      digitando?.classList.add('hidden');
      adicionarMensagem('model', dados.reply || 'Estou aqui com você.');
      if (dados.crisisDetected) mostrarCriseNoChat();
    } catch (err) {
      digitando?.classList.add('hidden');

      // 402 = a assinatura caiu ou expirou no meio da conversa
      if (err.status === 402) {
        prepararChat();
        showToast(err.message, 'info', 10000);
      } else {
        // A mensagem que falhou fica FORA do histórico: mantê-la fazia a
        // próxima tentativa reenviar dois turnos seguidos da usuária.
        const ultima = chatState.mensagens[chatState.mensagens.length - 1];
        if (ultima && ultima.role === 'user') {
          chatState.mensagens.pop();
          salvarConversa();
        }

        console.error('[Desligue-se] Falha na conversa:', err.status || 'sem status', err.message, err.data || '');

        // Mostrar o motivo real em vez de "falhou": a mensagem genérica
        // escondia 401 de sessão vencida, 402 de plano e 502 do modelo, e
        // deixava quem usa (e quem depura) sem nenhuma pista.
        const motivo = {
          401: 'Sua sessão expirou. Entre novamente e a conversa continua de onde parou.',
          429: 'Muitas mensagens em pouco tempo. Espere um minuto e tente de novo.',
          502: 'A IA não respondeu a tempo agora. Tente de novo em instantes.',
          503: 'Serviço temporariamente indisponível. Tente de novo em instantes.'
        }[err.status];

        adicionarMensagem(
          'model',
          motivo || err.message || 'Não consegui responder agora. Tente de novo em instantes.',
          { salvar: false }
        );

        if (err.status === 401) {
          openModal(modalAuth);
        }
      }
    } finally {
      chatState.enviando = false;
      if (enviar) enviar.disabled = false;
      input?.focus();
    }
  }

  /** Contatos de emergência fixados dentro da própria conversa. */
  function mostrarCriseNoChat() {
    const { lista } = elementosDoChat();
    if (!lista || lista.querySelector('.chat-crise')) return;

    const bloco = document.createElement('div');
    bloco.className = 'chat-crise';
    bloco.setAttribute('role', 'alert');
    bloco.innerHTML = `
      <strong>Você não está sozinha. Fale com alguém agora:</strong>
      <a href="tel:188">📞 CVV — 188 (24h, gratuito e sigiloso)</a>
      <a href="https://www.cvv.org.br/chat" target="_blank" rel="noopener">💬 Chat do CVV</a>
      <a href="tel:192">🚑 SAMU — 192</a>
    `;
    lista.appendChild(bloco);
    lista.scrollTop = lista.scrollHeight;
  }

  function initChat() {
    const { form, input, sugestoes } = elementosDoChat();

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      enviarMensagemDoChat(input?.value);
    });

    // Enter envia; Shift+Enter quebra linha
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensagemDoChat(input.value);
      }
    });

    // O campo cresce junto com o texto, até um teto
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });

    sugestoes?.querySelectorAll('.chip-btn').forEach(chip => {
      chip.addEventListener('click', () => enviarMensagemDoChat(chip.getAttribute('data-msg')));
    });

    document.getElementById('btnChatUpgrade')?.addEventListener('click', () => openModal(modalPremium));
    document.getElementById('btnChatToJournal')?.addEventListener('click', () => switchView('night'));
  }


  const RASCUNHO_KEY = 'desliguese_rascunho_apresentacao';

  /** Guarda o que a pessoa escreveu na home antes de ser levada ao login. */
  function guardarRascunhoDaApresentacao() {
    const campo = document.getElementById('quickJournalInput');
    const texto = (campo?.value || '').trim();
    if (!texto) return;
    try { sessionStorage.setItem(RASCUNHO_KEY, texto); } catch (e) {}
  }

  /** Despeja esse rascunho no diário depois do login, e limpa o guardado. */
  function recuperarRascunhoDaApresentacao() {
    let texto = '';
    try { texto = sessionStorage.getItem(RASCUNHO_KEY) || ''; } catch (e) {}
    if (!texto || !journalInput) return;

    journalInput.value = texto;
    journalInput.dispatchEvent(new Event('input', { bubbles: true }));

    const campo = document.getElementById('quickJournalInput');
    if (campo) campo.value = '';
    try { sessionStorage.removeItem(RASCUNHO_KEY); } catch (e) {}
  }

  // ==========================================================================
  // MÓDULO: PAINEL
  // Responde "o que está acontecendo agora?" — indicadores, pendência do dia,
  // tendência e atalhos. Sem texto explicativo: quem está aqui já entrou.
  // ==========================================================================

  /** Quantos dias seguidos, contando de hoje (ou de ontem) para trás. */
  function calcularSequencia() {
    const datas = new Set(
      (appState.history || [])
        .map(e => getTodayDateString(e.date || e.timestamp))
        .filter(Boolean)
    );
    if (datas.size === 0) return 0;

    const hoje = getTodayDateString();
    const ontem = getTodayDateString(new Date(Date.now() - 86400000));

    // A sequência continua se houve registro hoje OU ontem; senão, foi quebrada.
    let cursor = datas.has(hoje) ? new Date() : (datas.has(ontem) ? new Date(Date.now() - 86400000) : null);
    if (!cursor) return 0;

    let total = 0;
    while (datas.has(getTodayDateString(cursor))) {
      total++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
    return total;
  }

  function renderizarPainel() {
    if (!appState.currentUser) return;

    const definir = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };

    const nome = (appState.currentUser.user_metadata?.full_name || '').split(' ')[0];
    const hora = new Date().getHours();
    const cumprimento = hora < 5 ? 'Boa madrugada' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    definir('painelSaudacao', nome ? `${cumprimento}, ${nome}` : cumprimento);
    definir('painelData', new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long'
    }));

    const historico = appState.history || [];
    const ritmo = calcularRitmo();
    const sequencia = calcularSequencia();

    definir('kpiNoites', historico.length);
    definir('kpiNoitesNota', historico.length === 0 ? 'nenhum registro ainda' : 'desde o início');
    definir('kpiSequencia', sequencia);
    definir('kpiQualidade', ritmo.qualidadeMedia !== null ? `${ritmo.qualidadeMedia}%` : '—');
    definir('kpiSono', ritmo.duracaoMedia || '—');
    definir('kpiSonoNota', ritmo.duracaoMedia ? `${ritmo.noitesComHorario} noites com horário` : 'informe seus horários');

    // Pendência do dia: uma frase, uma ação. Só aparece quando existe.
    const alerta = document.getElementById('painelAlerta');
    if (alerta) {
      const registrouHoje = historico.some(e => getTodayDateString(e.date || e.timestamp) === getTodayDateString());
      const ultima = historico[0];
      const faltaCheckin = ultima && !ultima.sleepMood;

      let conteudo = null;
      if (!registrouHoje) {
        conteudo = {
          texto: 'Você ainda não registrou a noite de hoje.',
          botao: 'Escrever agora',
          destino: 'night',
          classe: 'alerta-faixa'
        };
      } else if (faltaCheckin) {
        conteudo = {
          texto: 'Falta avaliar como foi a última noite.',
          botao: 'Fazer check-in',
          destino: 'morning',
          classe: 'alerta-faixa atencao'
        };
      }

      alerta.classList.toggle('hidden', !conteudo);
      if (conteudo) {
        alerta.className = conteudo.classe;
        alerta.innerHTML = `<span>${escapeHTML(conteudo.texto)}</span>`;
        const acao = document.createElement('button');
        acao.type = 'button';
        acao.className = 'btn-modulo primario';
        acao.textContent = conteudo.botao;
        acao.addEventListener('click', () => switchView(conteudo.destino));
        alerta.appendChild(acao);
      }
    }

    desenharGraficoDeQualidade('painelGrafico', ritmo.series);
    renderizarUltimosRegistros();
  }

  /** Gráfico de barras simples — mesma leitura no painel e no Meu Ritmo. */
  function desenharGraficoDeQualidade(idDoElemento, series) {
    const grafico = document.getElementById(idDoElemento);
    if (!grafico) return;

    grafico.innerHTML = '';
    if (!series || series.length === 0) {
      grafico.innerHTML = '<div class="vazio"><span class="vazio-icone" aria-hidden="true">📊</span>' +
        '<strong>Sem noites avaliadas</strong><p>O gráfico aparece depois do primeiro check-in matinal.</p></div>';
      return;
    }

    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    series.forEach(item => {
      const coluna = document.createElement('div');
      coluna.className = 'chart-col';
      const altura = Math.max(item.qualidade, 6);
      const rotulo = item.data ? dias[new Date(item.data).getDay()] : '—';
      coluna.innerHTML = `
        <div class="chart-bar-track"><div class="chart-bar" style="height: ${altura}%"></div></div>
        <span class="chart-label">${rotulo}</span>
      `;
      coluna.title = item.humor ? `Qualidade: ${item.qualidade}%` : 'Noite sem avaliação';
      grafico.appendChild(coluna);
    });
  }

  const SELO_DO_HUMOR = {
    great: { classe: 'bom', texto: 'Descansada' },
    medium: { classe: 'medio', texto: 'Regular' },
    terrible: { classe: 'ruim', texto: 'Difícil' }
  };

  function montarLinhaDeRegistro(entrada, indiceReal) {
    const data = new Date(entrada.date || entrada.timestamp);
    const dataCurta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const selo = SELO_DO_HUMOR[entrada.sleepMood] || { classe: 'neutro', texto: 'Sem avaliação' };
    const tarefas = (entrada.tomorrow || []).length;
    const titulo = entrada.title || 'Registro noturno';

    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.innerHTML = `
      <td data-rotulo="Data"><strong>${escapeHTML(dataCurta)}</strong> <span style="color:var(--text-dim)">${hora}</span></td>
      <td data-rotulo="Registro" class="celula-texto">${escapeHTML(titulo)}</td>
      <td data-rotulo="Sono"><span class="selo ${selo.classe}">${selo.texto}</span></td>
      <td data-rotulo="Tarefas" class="col-num">${tarefas}</td>
    `;
    const abrir = () => openHistoryEntryDetailModal(indiceReal, 'all');
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
    return tr;
  }

  function montarTabelaDeRegistros(entradas, indices) {
    const tabela = document.createElement('table');
    tabela.className = 'tabela tabela-adaptavel';
    tabela.innerHTML = `
      <thead>
        <tr>
          <th>Data</th><th>Registro</th><th>Sono</th><th class="col-num">Tarefas</th>
        </tr>
      </thead>
    `;
    const corpo = document.createElement('tbody');
    entradas.forEach((entrada, i) => corpo.appendChild(montarLinhaDeRegistro(entrada, indices[i])));
    tabela.appendChild(corpo);
    return tabela;
  }

  function renderizarUltimosRegistros() {
    const destino = document.getElementById('painelUltimos');
    if (!destino) return;

    const historico = appState.history || [];
    destino.innerHTML = '';

    if (historico.length === 0) {
      destino.innerHTML = `
        <div class="vazio">
          <span class="vazio-icone" aria-hidden="true">🌙</span>
          <strong>Nenhum registro ainda</strong>
          <p>Escreva o que está na sua cabeça e a IA organiza o resto.</p>
        </div>`;
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'btn-modulo primario';
      botao.textContent = 'Fazer o primeiro registro';
      botao.addEventListener('click', () => switchView('night'));
      destino.querySelector('.vazio').appendChild(botao);
      return;
    }

    const recentes = historico.slice(0, 5);
    destino.appendChild(montarTabelaDeRegistros(recentes, recentes.map((_, i) => i)));
  }

  // ==========================================================================
  // MÓDULO: CONFIGURAÇÕES
  // ==========================================================================
  function renderizarConfiguracoes() {
    if (!appState.currentUser) return;

    const definir = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };

    const usuario = appState.currentUser;
    definir('configNome', usuario.user_metadata?.full_name || usuario.email?.split('@')[0] || 'Minha conta');
    definir('configEmail', usuario.email || '');

    const isPro = isUserPro();
    const perfil = appState.userProfile || {};
    definir('configPlano', isPro
      ? (perfil.plano === 'premium_anual' ? 'Pro Anual' : 'Pro Mensal')
      : 'Plano gratuito');

    if (isPro) {
      const dias = diasRestantes(perfil.subscription_ends_at);
      const restante = descreverTempoRestante(dias);
      definir('configPlanoDetalhe', restante
        ? (perfil.subscription_status === 'canceling'
            ? `Acesso garantido por mais ${restante}. Não haverá nova cobrança.`
            : `Renova em ${restante}. Cancele quando quiser, sem multa.`)
        : 'Assinatura ativa.');
    } else {
      definir('configPlanoDetalhe', '1 registro por dia e rotina de 3 minutos.');
    }

    document.getElementById('btnConfigPlanos')?.classList.toggle('hidden', isPro);
    document.getElementById('btnConfigAssinatura')?.classList.toggle('hidden', !perfil.stripe_customer_id);
    document.getElementById('btnConfigSincronizar')?.classList.toggle('hidden', isPro);
  }

  function initConfiguracoes() {
    document.getElementById('btnConfigPlanos')?.addEventListener('click', () => openModal(modalPremium));
    document.getElementById('btnConfigTermos')?.addEventListener('click', () => openModal(modalTerms));
    document.getElementById('btnConfigSair')?.addEventListener('click', () => document.getElementById('btnSignOut')?.click());
    document.getElementById('btnConfigAssinatura')?.addEventListener('click', () => document.getElementById('btnManageSubscription')?.click());
    document.getElementById('btnConfigSincronizar')?.addEventListener('click', () => document.getElementById('btnSyncPlan')?.click());
    document.getElementById('btnConfigExcluir')?.addEventListener('click', () => document.getElementById('btnDeleteAccount')?.click());
  }

  // ==========================================================================
  // PLAYER — mini-player persistente + Modo Sono
  //
  // Antes o áudio era controlado por uma barra que só existia na tela de Sons:
  // sair da tela era perder o controle do que estava tocando. Agora existe um
  // player único, que acompanha a pessoa por todas as telas e se expande no
  // Modo Sono — a tela para a qual ela não precisa mais olhar.
  // ==========================================================================
  const player = {
    tipo: null,        // 'som' | 'historia'
    id: null,
    titulo: '',
    subtitulo: '',
    tocando: false,
    minutosTimer: 30,
    fimDoTimer: null,
    relogio: null
  };

  function elementoPorId(id) { return document.getElementById(id); }

  /** Liga o player ao que começou a tocar e mostra o mini-player. */
  function abrirPlayer({ tipo, id, titulo, subtitulo, arte }) {
    Object.assign(player, { tipo, id, titulo, subtitulo, tocando: true });

    const mini = elementoPorId('miniPlayer');
    if (mini) {
      mini.hidden = false;
      elementoPorId('miniTitulo').textContent = titulo;
      elementoPorId('miniStatus').textContent = subtitulo;
      const areaArte = elementoPorId('miniArte');
      if (areaArte) {
        areaArte.innerHTML = arte
          ? `<svg viewBox="0 0 160 104" preserveAspectRatio="xMidYMid slice">${arte}</svg>`
          : '';
      }
    }

    elementoPorId('sonoTipo').textContent = subtitulo;
    elementoPorId('sonoTitulo').textContent = titulo;
    atualizarBotoesDoPlayer();
    iniciarRelogioDoTimer();
  }

  function fecharPlayer() {
    player.tocando = false;
    player.id = null;
    player.fimDoTimer = null;
    if (player.relogio) { clearInterval(player.relogio); player.relogio = null; }

    const mini = elementoPorId('miniPlayer');
    if (mini) mini.hidden = true;
    fecharModoSono();
  }

  function atualizarBotoesDoPlayer() {
    const simbolo = player.tocando ? '❚❚' : '▶';
    const rotulo = player.tocando ? 'Pausar' : 'Tocar';

    const mini = elementoPorId('btnMiniPlayPause');
    if (mini) { mini.firstElementChild.textContent = simbolo; mini.setAttribute('aria-label', rotulo); }

    const grande = elementoPorId('iconeSonoPlay');
    if (grande) grande.textContent = simbolo;
    elementoPorId('btnSonoPlayPause')?.setAttribute('aria-label', rotulo);

    elementoPorId('modoSono')?.classList.toggle('pausado', !player.tocando);
    const status = elementoPorId('miniStatus');
    if (status) status.textContent = player.tocando ? player.subtitulo : 'pausado';
  }

  function alternarPlayPause() {
    if (!player.id) return;

    if (player.tipo === 'som') {
      if (player.tocando) {
        pausarSom();
      } else {
        retomarSom();
      }
    } else if (player.tipo === 'historia') {
      player.tocando ? pausarNarracao() : narrarHistoria();
    }

    player.tocando = !player.tocando;
    atualizarBotoesDoPlayer();
  }

  // ---------- Modo Sono ----------
  function abrirModoSono() {
    const tela = elementoPorId('modoSono');
    if (!tela || !player.id) return;

    tela.hidden = false;
    void tela.offsetWidth;      // reflow síncrono: rAF não roda em aba oculta
    tela.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    elementoPorId('btnSonoPlayPause')?.focus();
  }

  function fecharModoSono() {
    const tela = elementoPorId('modoSono');
    if (!tela) return;
    tela.classList.remove('aberto');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (!tela.classList.contains('aberto')) tela.hidden = true;
    }, 560);
  }

  function modoSonoAberto() {
    return elementoPorId('modoSono')?.classList.contains('aberto');
  }

  // ---------- Timer de sono ----------
  function definirTimer(minutos) {
    player.minutosTimer = minutos;
    document.querySelectorAll('.timer-opcao').forEach(b => {
      b.classList.toggle('ativa', Number(b.getAttribute('data-minutos')) === minutos);
    });
    iniciarRelogioDoTimer();
    agendarDesligamentoDoSom();
  }

  function iniciarRelogioDoTimer() {
    if (player.relogio) { clearInterval(player.relogio); player.relogio = null; }

    const rotulo = elementoPorId('sonoRestante');
    if (!player.minutosTimer) {
      player.fimDoTimer = null;
      if (rotulo) rotulo.textContent = 'Sem limite de tempo';
      return;
    }

    player.fimDoTimer = Date.now() + player.minutosTimer * 60 * 1000;

    const pintar = () => {
      if (!rotulo || !player.fimDoTimer) return;
      const restante = Math.max(0, player.fimDoTimer - Date.now());
      const min = Math.floor(restante / 60000);
      const seg = Math.floor((restante % 60000) / 1000);
      rotulo.textContent = min > 0
        ? `Desliga em ${min} min`
        : `Desliga em ${seg}s`;
      if (restante <= 0) { clearInterval(player.relogio); player.relogio = null; }
    };

    pintar();
    player.relogio = setInterval(pintar, 1000);
  }

  function initPlayer() {
    elementoPorId('btnAbrirModoSono')?.addEventListener('click', abrirModoSono);
    elementoPorId('btnSairModoSono')?.addEventListener('click', fecharModoSono);
    elementoPorId('btnMiniPlayPause')?.addEventListener('click', alternarPlayPause);
    elementoPorId('btnSonoPlayPause')?.addEventListener('click', alternarPlayPause);
    elementoPorId('btnMiniParar')?.addEventListener('click', () => {
      if (player.tipo === 'som') pararSom();
      else pararNarracao();
      fecharPlayer();
    });

    document.querySelectorAll('.timer-opcao').forEach(b => {
      b.addEventListener('click', () => definirTimer(Number(b.getAttribute('data-minutos'))));
    });

    elementoPorId('sonoVolume')?.addEventListener('input', (e) => {
      const valor = Math.max(Number(e.target.value) / 100, 0.0001);
      if (somAtual.ganho && somAtual.ctx) {
        somAtual.ganho.gain.setTargetAtTime(valor, somAtual.ctx.currentTime, 0.25);
      }
    });

    // Esc sai do Modo Sono antes de qualquer outra coisa
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && modoSonoAberto()) {
        e.stopPropagation();
        fecharModoSono();
      }
    }, true);
  }

  // ==========================================================================
  // MINHAS NOITES — ritmo, check-in e histórico em abas
  //
  // Eram três destinos separados no menu para responder a uma pergunta só:
  // "como tenho dormido?". Os painéis originais são movidos para dentro desta
  // tela em tempo de execução — nada de recortar HTML, que já custou caro.
  // ==========================================================================
  const ABAS_DAS_NOITES = ['rhythm', 'morning', 'history'];
  let abaAtual = 'rhythm';

  function montarMinhasNoites() {
    const destino = document.getElementById('abasConteudo');
    if (!destino) return;

    ABAS_DAS_NOITES.forEach(chave => {
      const secao = views[chave];
      if (!secao || secao.dataset.movida === 'sim') return;

      // Deixa de ser uma tela para virar painel de aba
      secao.classList.remove('app-view', 'active');
      secao.classList.add('painel-aba');
      secao.dataset.movida = 'sim';
      secao.hidden = chave !== abaAtual;
      destino.appendChild(secao);
    });

    document.querySelectorAll('#viewNights .aba').forEach(botao => {
      botao.addEventListener('click', () => abrirAbaDasNoites(botao.getAttribute('data-aba')));
    });
  }

  function abrirAbaDasNoites(chave) {
    if (!ABAS_DAS_NOITES.includes(chave)) chave = 'rhythm';
    abaAtual = chave;

    ABAS_DAS_NOITES.forEach(k => {
      if (views[k]) views[k].hidden = k !== chave;
    });

    document.querySelectorAll('#viewNights .aba').forEach(b => {
      const ativa = b.getAttribute('data-aba') === chave;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', String(ativa));
    });

    // Cada painel se redesenha ao aparecer
    if (chave === 'rhythm') renderizarRitmo();
    if (chave === 'morning') renderMorningView();
    if (chave === 'history') updateHistoryUI();
  }

  // ==========================================================================
  // TELA RESPIRAR
  // ==========================================================================
  function initRespirar() {
    document.querySelectorAll('#viewBreathe .duracao').forEach(botao => {
      botao.addEventListener('click', () => {
        const minutos = Number(botao.getAttribute('data-minutos'));
        if (minutos > 3 && !isUserPro()) {
          openModal(modalPremium);
          return;
        }
        document.querySelectorAll('#viewBreathe .duracao').forEach(b => b.classList.remove('ativa'));
        botao.classList.add('ativa');
        appState.selectedRoutineMinutes = minutos;
      });
    });

    elementoPorId('btnIniciarRespiracao')?.addEventListener('click', () => {
      // Reaproveita o motor de respiração que já existia dentro do diário
      switchView('night');
      showStep('routine');
      startRelaxationRoutine();
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // INICIALIZAÇÃO — ACONTECE NO FIM DO ARQUIVO, DE PROPÓSITO
  //
  // Rodar os módulos aqui garante que todo `const` do arquivo (catálogos de
  // sons e histórias, estado do chat, estado do narrador) já esteja
  // inicializado. Quando esse laço ficava no meio do arquivo, qualquer módulo
  // que tocasse numa dessas constantes caía na zona morta temporal e lançava
  // "Cannot access X before initialization" — o mesmo defeito que derrubou o
  // app inteiro na auditoria, e que reapareceu duas vezes depois disso.
  // Funções são içadas; constantes não. Por isso a ordem importa.
  // ==========================================================================
  const modulesToInit = [
    { name: 'Navigation', fn: initNavigation },
    { name: 'MenuLateral', fn: initMenuLateral },
    { name: 'Player', fn: initPlayer },
    { name: 'Respirar', fn: initRespirar },
    { name: 'MinhasNoites', fn: montarMinhasNoites },
    { name: 'PainelAssinante', fn: initPainelDaAssinante },
    { name: 'Configuracoes', fn: initConfiguracoes },
    { name: 'VoiceInput', fn: initVoiceInput },
    { name: 'PromptChips', fn: initPromptChips },
    { name: 'RoutineDuration', fn: initRoutineDuration },
    { name: 'MorningCheckin', fn: initMorningCheckin },
    { name: 'Modals', fn: initModals },
    { name: 'CategoryWhyToggles', fn: initCategoryWhyToggles },
    { name: 'SupabaseAuth', fn: initSupabaseAuth },
    { name: 'CopyAdvice', fn: initCopyAdviceButton },
    { name: 'HistoryDetailTabs', fn: initHistoryDetailTabs },
    { name: 'PWA', fn: initPWA },
    { name: 'StripeReturnStatus', fn: initStripeReturnStatus },
    { name: 'NovoSite', fn: initNovoSite },
    { name: 'Chat', fn: initChat },
    { name: 'Narrador', fn: initNarrador },
    { name: 'StaticHostCheck', fn: warnIfStaticOnlyHost },
    { name: 'HistoryUI', fn: updateHistoryUI },
    { name: 'DailyLimitUI', fn: checkDailyLimitUI }
  ];

  modulesToInit.forEach(m => {
    try {
      // Módulos assíncronos rejeitam a promise em vez de lançar: capturamos os dois casos
      // para que a falha de um módulo nunca derrube a inicialização dos demais.
      const result = m.fn();
      if (result && typeof result.catch === 'function') {
        result.catch(err => console.warn(`[Desligue-se Init] Erro assíncrono em ${m.name}:`, err));
      }
    } catch (err) {
      console.warn(`[Desligue-se Init] Erro em ${m.name}:`, err);
    }
  });

  try {
    aplicarModoDeAcesso();
    renderizarConteudoNovoSite();
  } catch (err) {
    console.warn('[Desligue-se Init] Erro ao desenhar as telas novas:', err);
  }
});
