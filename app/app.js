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
      console.log('✅ Supabase conectado:', SUPABASE_URL);
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
    night: document.getElementById('viewNight'),
    morning: document.getElementById('viewMorning'),
    history: document.getElementById('viewHistory')
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
    morning: document.getElementById('btnMobMorning'),
    history: document.getElementById('btnMobHistory'),
    premium: document.getElementById('btnMobPremium'),
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
  const btnDismissPremium = document.getElementById('btnDismissPremium');

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

  const modulesToInit = [
    { name: 'Navigation', fn: initNavigation },
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
  function initNavigation() {
    navBtns.night?.addEventListener('click', () => switchView('night'));
    navBtns.morning?.addEventListener('click', () => switchView('morning'));
    navBtns.history?.addEventListener('click', () => switchView('history'));
    navBtns.logo?.addEventListener('click', () => switchView('night'));

    mobNavBtns.night?.addEventListener('click', () => switchView('night'));
    mobNavBtns.morning?.addEventListener('click', () => switchView('morning'));
    mobNavBtns.history?.addEventListener('click', () => switchView('history'));
    mobNavBtns.premium?.addEventListener('click', () => openModal(modalPremium));
    mobNavBtns.auth?.addEventListener('click', () => openModal(modalAuth));
  }

  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      views[k].classList.toggle('active', k === viewName);
    });

    navBtns.night?.classList.toggle('active', viewName === 'night');
    navBtns.morning?.classList.toggle('active', viewName === 'morning');
    navBtns.history?.classList.toggle('active', viewName === 'history');

    mobNavBtns.night?.classList.toggle('active', viewName === 'night');
    mobNavBtns.morning?.classList.toggle('active', viewName === 'morning');
    mobNavBtns.history?.classList.toggle('active', viewName === 'history');

    if (viewName === 'night') {
      checkDailyLimitUI();
    } else if (viewName === 'morning') {
      renderMorningView();
    } else if (viewName === 'history') {
      updateHistoryUI();
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
          tagStyle: 'background: rgba(212, 163, 115, 0.25); color: var(--accent-amber);',
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
          tagStyle: 'background: rgba(212, 163, 115, 0.2); color: var(--accent-amber);',
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

      // Validação obrigatória dos Termos de Uso & Isenção Médica
      if (checkTermsConsent && !checkTermsConsent.checked) {
        showAuthFeedback('Você precisa aceitar os Termos de Uso, Isenção Médica e LGPD para criar uma conta.', 'error');
        checkTermsConsent.focus();
        return;
      }

      // Consentimento específico para dado sensível (LGPD, art. 11, I).
      // Precisa ser separado e destacado — não pode vir embutido nos Termos.
      if (checkSensitiveDataConsent && !checkSensitiveDataConsent.checked) {
        showAuthFeedback('Para criar a conta, precisamos da sua autorização específica para processar o conteúdo dos seus desabafos, inclusive pela IA do Google Gemini.', 'error');
        checkSensitiveDataConsent.focus();
        return;
      }

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

        const res = await fetch('/api/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ returnUrl: window.location.origin })
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error || 'Não foi possível abrir o portal de assinatura.');
        }
        window.location.href = data.url;
      } catch (err) {
        showToast(err.message, 'error', 9000);
        btnManageSubscription.disabled = false;
        btnManageSubscription.textContent = originalLabel;
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

  function renderPlanBadge() {
    const isPro = isUserPro();
    if (loggedUserPlanBadge) {
      const status = appState.userProfile?.subscription_status;
      let label = 'Gratuito';
      if (isPro) {
        label = appState.userProfile?.plano === 'premium_anual' ? '⭐ Premium Anual' : '⭐ Premium Mensal';
        if (status === 'canceling') label += ' (cancelamento agendado)';
      }
      loggedUserPlanBadge.textContent = label;
    }
    // O portal de assinatura só faz sentido para quem já tem um cadastro no Stripe
    if (btnManageSubscription) {
      btnManageSubscription.classList.toggle('hidden', !appState.userProfile?.stripe_customer_id);
    }
    if (btnDeleteAccount) {
      btnDeleteAccount.classList.toggle('hidden', !appState.currentUser);
    }
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

    // 1. Usuária logada: contagem vinda do servidor é a que vale
    if (appState.currentUser && typeof appState.dailyEntriesToday === 'number') {
      return appState.dailyEntriesToday >= FREE_ENTRIES_PER_DAY;
    }

    const todayStr = getTodayDateString();

    // 2. Fallback local (visitante ou servidor indisponível)
    try {
      if (localStorage.getItem('desliguese_last_dump_date') === todayStr) return true;
    } catch (e) {}

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
    const controller = new AbortController();
    // O servidor tem orçamento de ~22s (ver api/classify.js). O cliente espera
    // um pouco mais para não abortar uma resposta que já está a caminho —
    // abortar cedo demais fazia a IA nunca ser usada, caindo sempre no local.
    const timeout = setTimeout(() => controller.abort(), 28000);

    try {
      const token = await getAccessToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/classify', {
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
          <button type="button" class="cat-item-tag interactive" data-tag-type="gratitude" style="background: rgba(212, 163, 115, 0.25); color: var(--accent-amber);" title="Toque para entender por que está aqui">
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
          <div class="badge-tag" style="background: rgba(212,163,115,0.25); color: var(--accent-amber); margin-bottom: 0.75rem;">🔒 Diário Protegido</div>
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
        ${entry.counselingAdvice ? `<div style="background: rgba(212,163,115,0.08); border-left: 2px solid var(--accent-amber); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.78rem; color: var(--text-main); font-style: italic; margin-bottom: 0.65rem;">💌 "${escapeHTML(entry.counselingAdvice.substring(0, 130))}..."</div>` : ''}
        
        <div class="history-tags">
          ${countGratitude > 0 ? `
            <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="gratitude" style="background: rgba(212, 163, 115, 0.25); color: var(--accent-amber);" title="Toque para ver as coisas boas">
              ${countGratitude} coisas boas 🌟
            </button>
          ` : ''}
          <button type="button" class="cat-item-tag interactive" data-entry-idx="${index}" data-tag-type="tomorrow" style="background: rgba(212, 163, 115, 0.2); color: var(--accent-amber);" title="Toque para ver o que foi guardado">
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
      upsellCard.style.cssText = 'border: 1px dashed var(--accent-amber); background: rgba(212, 163, 115, 0.06); text-align: center; padding: 1.5rem;';
      upsellCard.innerHTML = `
        <div class="badge-tag" style="background: rgba(212,163,115,0.25); color: var(--accent-amber); margin-bottom: 0.5rem;">⭐ Desligue-se Pro</div>
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
    mobNavBtns.premium?.addEventListener('click', openPremium);
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
  async function safeFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    let data = null;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
    } else {
      const text = await res.text();
      console.warn(`[safeFetchJson] Resposta não-JSON de ${url}:`, text.substring(0, 150));
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
    // A assinatura precisa estar vinculada a uma conta: é o webhook do Stripe
    // que grava o plano no perfil da usuária. Sem login não há onde gravar,
    // e a pessoa perderia o acesso pago ao trocar de dispositivo.
    const token = await getAccessToken();
    if (!token) {
      closeModal(modalPremium);
      openModal(modalAuth);
      showAuthFeedback('Crie sua conta ou entre para assinar — assim sua assinatura fica vinculada a você e funciona em qualquer aparelho.', 'error');
      return;
    }

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
        const data = await safeFetchJson('/api/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ planType })
        });

        if (!data.url) {
          throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
        }

        window.location.href = data.url;
      } catch (fallbackErr) {
        closeModal(modalStripeElements);
        showToast('Não foi possível conectar com o checkout: ' + fallbackErr.message, 'error', 10000);
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

    // Cria a assinatura no backend e obtém o clientSecret
    const data = await safeFetchJson('/api/create-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ planType })
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
          colorPrimary: '#D4A373',
          colorBackground: '#131922',
          colorText: '#E6EDF3',
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
            colorPrimary: '#D4A373',
            colorBackground: '#131922',
            colorText: '#E6EDF3',
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
        const verifyRes = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const verifyData = await verifyRes.json();

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

    showToast('Seu pagamento foi recebido, mas a liberação ainda está sendo processada. Atualize a página em alguns instantes.', 'info', 12000);
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
            console.log('✅ Service Worker do Desligue-se registrado:', reg.scope);
          })
          .catch((err) => {
            console.warn('Falha ao registrar Service Worker:', err);
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
          console.log('Escolha de instalação PWA:', outcome);
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
      console.log('🎉 Desligue-se instalado com sucesso como PWA!');
      if (btnInstallApp) btnInstallApp.classList.add('hidden');
      deferredInstallPrompt = null;
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
});
