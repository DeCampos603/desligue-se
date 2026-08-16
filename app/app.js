/**
 * DESLIGUE-SE — Motor Cognitivo de Triagem Noturna & Ritual de Sono (TCC-I)
 * Integração com Supabase (Auth Google/Email, Banco de Dados PostgreSQL & RLS)
 * Inteligência Empática de Acolhimento, Consolo & Terapia do Sono
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // CONFIGURAÇÃO DO SUPABASE (DATABASE & AUTH)
  // ==========================================
  const SUPABASE_URL = 'https://vycflbcaphehlcjkqcjw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5Y2ZsYmNhcGhlaGxjamtxY2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4Mjk4NDMsImV4cCI6MjEwMjQwNTg0M30.E1Trkta-chncOdWc9FU5v4tYPHZAvoq_dYCRrPsjvvo';

  let supabase = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase conectado:', SUPABASE_URL);
    }
  } catch (err) {
    console.warn('Supabase não inicializado localmente:', err);
  }

  // ==========================================
  // ESTADO DA APLICAÇÃO & PERSISTÊNCIA
  // ==========================================
  const STORAGE_KEY_ENTRIES = 'desliguese_entries_v1';

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
    soundActive: false,
    audioCtx: null,
    noiseNode: null,
    isRecording: false,
    recognition: null,
    history: loadHistoryFromLocalStorage()
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
    premium: document.getElementById('btnMobPremium')
  };

  const userAvatarIcon = document.getElementById('userAvatarIcon');
  const userAuthLabel = document.getElementById('userAuthLabel');

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

  // Categorias & Listas
  const resultEntryTitle = document.getElementById('resultEntryTitle');
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

  // Auth Elements
  const authViewLoggedOut = document.getElementById('authViewLoggedOut');
  const authViewLoggedIn = document.getElementById('authViewLoggedIn');
  const btnGoogleLogin = document.getElementById('btnGoogleLogin');
  const formEmailAuth = document.getElementById('formEmailAuth');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const btnSubmitSignup = document.getElementById('btnSubmitSignup');
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
  // INICIALIZAÇÃO
  // ==========================================
  initNavigation();
  initVoiceInput();
  initPromptChips();
  initRoutineDuration();
  initMorningCheckin();
  initModals();
  initCategoryWhyToggles();
  initSupabaseAuth();
  updateHistoryUI();

  journalInput.addEventListener('input', () => {
    const hasText = journalInput.value.trim().length > 3;
    btnProcessDump.disabled = !hasText;
  });

  btnProcessDump.addEventListener('click', handleProcessDump);
  btnStartRoutine.addEventListener('click', startRelaxationRoutine);
  btnFinishRoutine.addEventListener('click', finishNightToGoodnight);
  btnToggleSound.addEventListener('click', toggleAudioSoundscape);
  btnNewMorningCheckin.addEventListener('click', () => switchView('morning'));

  // Botões de Retorno
  if (btnBackToDump) btnBackToDump.addEventListener('click', () => showStep('dump'));
  if (btnBackToResult) {
    btnBackToResult.addEventListener('click', () => {
      if (appState.routineInterval) clearInterval(appState.routineInterval);
      stopAudioSoundscape();
      showStep('result');
    });
  }
  if (btnRestartNight) {
    btnRestartNight.addEventListener('click', () => {
      journalTitleInput.value = '';
      journalInput.value = '';
      btnProcessDump.disabled = true;
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
    // Desktop
    navBtns.night?.addEventListener('click', () => switchView('night'));
    navBtns.morning?.addEventListener('click', () => switchView('morning'));
    navBtns.history?.addEventListener('click', () => switchView('history'));
    navBtns.logo?.addEventListener('click', () => switchView('night'));

    // Mobile Bottom Nav
    mobNavBtns.night?.addEventListener('click', () => switchView('night'));
    mobNavBtns.morning?.addEventListener('click', () => switchView('morning'));
    mobNavBtns.history?.addEventListener('click', () => switchView('history'));
    mobNavBtns.premium?.addEventListener('click', () => modalPremium.classList.remove('hidden'));
  }

  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      views[k].classList.toggle('active', k === viewName);
    });

    // Atualiza Desktop
    navBtns.night?.classList.toggle('active', viewName === 'night');
    navBtns.morning?.classList.toggle('active', viewName === 'morning');
    navBtns.history?.classList.toggle('active', viewName === 'history');

    // Atualiza Mobile
    mobNavBtns.night?.classList.toggle('active', viewName === 'night');
    mobNavBtns.morning?.classList.toggle('active', viewName === 'morning');
    mobNavBtns.history?.classList.toggle('active', viewName === 'history');

    if (viewName === 'morning') {
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
    tomorrow: {
      title: 'Atenção Amanhã (Ação Imediata)',
      badge: 'Prioridade Executável • TCC-I',
      meaning: 'Tarefas e compromissos reais de alta relevância. A IA organizou o primeiro micro-passo para você iniciar o dia com leveza.',
      neuro: 'Descarrega a memória de trabalho do córtex pré-frontal. Quando a tarefa já está registrada e estruturada, o cérebro desliga a hipervigilância noturna.'
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
      { triggerId: 'headerTomorrow', boxId: 'whyBoxTomorrow' },
      { triggerId: 'headerWait', boxId: 'whyBoxWait' },
      { triggerId: 'headerRelease', boxId: 'whyBoxRelease' },
      { triggerId: 'headerRumination', boxId: 'whyBoxRumination' }
    ];

    toggles.forEach(({ triggerId, boxId }) => {
      const trigger = document.getElementById(triggerId);
      const box = document.getElementById(boxId);
      if (trigger && box) {
        trigger.addEventListener('click', (e) => {
          if (e.target.closest('.cat-list') || e.target.closest('input') || e.target.closest('button')) return;
          box.classList.toggle('hidden');
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
    modalTagDetail.classList.remove('hidden');
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

    // Login com E-mail
    formEmailAuth?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = authEmail.value.trim();
      const password = authPassword.value;

      showAuthFeedback('Entrando...', 'success');
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          showAuthFeedback('Erro ao entrar: ' + error.message, 'error');
        } else {
          showAuthFeedback('Login realizado com sucesso!', 'success');
          setTimeout(() => modalAuth.classList.add('hidden'), 800);
        }
      } catch (err) {
        showAuthFeedback(err.message, 'error');
      }
    });

    // Cadastro
    btnSubmitSignup?.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value;

      if (!email || password.length < 6) {
        showAuthFeedback('Informe um e-mail válido e senha de no mínimo 6 caracteres.', 'error');
        return;
      }

      showAuthFeedback('Criando sua conta...', 'success');
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: email.split('@')[0] }
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
      modalAuth.classList.add('hidden');
      showAuthFeedback('Você saiu da conta.', 'success');
    });
  }

  function handleUserLoggedIn(user) {
    appState.currentUser = user;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuária';
    
    if (userAvatarIcon) userAvatarIcon.textContent = '✨';
    if (userAuthLabel) userAuthLabel.textContent = name.length > 10 ? name.substring(0, 8) + '...' : name;

    authViewLoggedOut?.classList.add('hidden');
    authViewLoggedIn?.classList.remove('hidden');

    if (loggedUserName) loggedUserName.textContent = `Olá, ${name}!`;
    if (loggedUserEmail) loggedUserEmail.textContent = user.email;

    loadCloudUserProfile(user.id);
    syncCloudHistory(user.id);
  }

  function handleUserLoggedOut() {
    appState.currentUser = null;
    appState.userProfile = null;
    if (userAvatarIcon) userAvatarIcon.textContent = '👤';
    if (userAuthLabel) userAuthLabel.textContent = 'Entrar';

    authViewLoggedOut?.classList.remove('hidden');
    authViewLoggedIn?.classList.add('hidden');
  }

  async function loadCloudUserProfile(userId) {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        appState.userProfile = data;
        const plano = data.plano === 'premium_mensal' || data.plano === 'premium_anual' ? '⭐ Premium' : 'Gratuito';
        if (loggedUserPlanBadge) loggedUserPlanBadge.textContent = plano;
      }
    } catch (e) {
      console.warn('Erro ao carregar perfil:', e);
    }
  }

  async function syncCloudHistory(userId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        appState.history = data.map(row => ({
          id: row.id,
          title: row.triaged_data?.title || 'Diário Noturno',
          date: row.created_at,
          rawText: row.raw_text,
          sleepMood: row.sleep_mood,
          tomorrow: row.triaged_data?.tomorrow || [],
          wait: row.triaged_data?.wait || [],
          release: row.triaged_data?.release || [],
          rumination: row.triaged_data?.rumination || []
        }));
        saveLocalHistory(appState.history);
        updateHistoryUI();
      }
    } catch (e) {
      console.warn('Erro ao sincronizar histórico:', e);
    }
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
  // ENTRADA POR VOZ
  // ==========================================
  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (btnVoiceInput) btnVoiceInput.title = 'Ditado por voz não suportado neste navegador.';
      return;
    }

    appState.recognition = new SpeechRecognition();
    appState.recognition.lang = 'pt-BR';
    appState.recognition.continuous = true;
    appState.recognition.interimResults = true;

    appState.recognition.onstart = () => {
      appState.isRecording = true;
      btnVoiceInput?.classList.add('recording');
      if (voiceBtnLabel) voiceBtnLabel.textContent = 'Ouvindo... (toque para parar)';
    };

    appState.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        journalInput.value += (journalInput.value ? ' ' : '') + finalTranscript;
        btnProcessDump.disabled = false;
      }
    };

    appState.recognition.onerror = () => stopRecording();
    appState.recognition.onend = () => stopRecording();

    btnVoiceInput?.addEventListener('click', () => {
      if (appState.isRecording) {
        appState.recognition.stop();
      } else {
        try { appState.recognition.start(); } catch (e) {}
      }
    });
  }

  function stopRecording() {
    appState.isRecording = false;
    btnVoiceInput?.classList.remove('recording');
    if (voiceBtnLabel) voiceBtnLabel.textContent = 'Falar pensamentos';
  }

  // ==========================================
  // MOTOR DE TRIAGEM COGNITIVA & EMPATIA HUMANA
  // ==========================================
  function handleProcessDump() {
    const text = journalInput.value.trim();
    if (!text) return;

    if (appState.isRecording && appState.recognition) {
      appState.recognition.stop();
    }

    let title = journalTitleInput.value.trim();
    if (!title) {
      title = generateAutoTitle(text);
    }

    appState.currentDumpTitle = title;
    appState.currentDumpText = text;
    showStep('loading');

    setTimeout(() => {
      const triaged = analyzeThoughtsWithTCCI(text, title);
      appState.currentTriagedData = triaged;
      renderTriagedResults(triaged);
      showStep('result');
    }, 1300);
  }

  function generateAutoTitle(text) {
    const lower = text.toLowerCase();
    if (lower.includes('término') || lower.includes('terminou') || lower.includes('separação') || lower.includes('ex') || lower.includes('namorado') || lower.includes('marido') || lower.includes('coração')) {
      return 'Cuidando do Coração & Acolhendo o Fim';
    } else if (lower.includes('triste') || lower.includes('choro') || lower.includes('chorar') || lower.includes('ruim') || lower.includes('vazio') || lower.includes('sozinha')) {
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

  function analyzeThoughtsWithTCCI(text, title) {
    const fragments = text
      .split(/(?:[.,;!\n\?]+|\be\s+também\b|\be\s+não\b|\be\s+preciso\b|\be\s+tenho\b)/gi)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    const tomorrow = [];
    const wait = [];
    const release = [];
    const rumination = [];

    const fullLower = text.toLowerCase();

    // 1. ANÁLISE GLOBAL DE IMPACTO EMOCIONAL (GRIEF / BREAKUP / DEEP SADNESS)
    const isBreakup = fullLower.includes('término') || fullLower.includes('terminou') || fullLower.includes('terminar') || fullLower.includes('separação') || fullLower.includes('separou') || fullLower.includes('namorado') || fullLower.includes('namorada') || fullLower.includes('marido') || fullLower.includes('ex ') || fullLower.includes('meu ex') || fullLower.includes('minha ex') || fullLower.includes('desamor') || fullLower.includes('coração partido');
    const isDeepSadness = fullLower.includes('está ruim') || fullLower.includes('tá ruim') || fullLower.includes('muito mal') || fullLower.includes('triste') || fullLower.includes('chorando') || fullLower.includes('chorei') || fullLower.includes('vazio') || fullLower.includes('sozinha') || fullLower.includes('solidão') || fullLower.includes('sem rumo') || fullLower.includes('não aguento mais') || fullLower.includes('dor no peito');

    fragments.forEach(frag => {
      const fLower = frag.toLowerCase();

      // A) CASO: TÉRMINO OU LUTO AMOROSO
      if (
        fLower.includes('término') ||
        fLower.includes('terminou') ||
        fLower.includes('terminar') ||
        fLower.includes('separação') ||
        fLower.includes('separou') ||
        fLower.includes('namorado') ||
        fLower.includes('namorada') ||
        fLower.includes('marido') ||
        fLower.includes('ex ') ||
        fLower.includes('meu ex') ||
        fLower.includes('minha ex') ||
        fLower.includes('desamor') ||
        fLower.includes('coração partido') ||
        (isBreakup && (fLower.includes('ruim') || fLower.includes('dor') || fLower.includes('saudade') || fLower.includes('chorei') || fLower.includes('triste')))
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Términos doem de verdade e a noite é o momento em que a saudade e o silêncio mais pesam. Seu coração está em luto e essa dor é legítima. Você não precisa "superar" nada hoje à noite. Abrace seu travesseiro com carinho, respire fundo e se dê colo. Você é preciosa e vai reencontrar sua paz.'
        });
      }
      // B) CASO: TRISTEZA PROFUNDA, CHORO OU SOLIDÃO
      else if (
        fLower.includes('está ruim') ||
        fLower.includes('tá ruim') ||
        fLower.includes('muito mal') ||
        fLower.includes('triste') ||
        fLower.includes('chorando') ||
        fLower.includes('chorei') ||
        fLower.includes('vazio') ||
        fLower.includes('sozinha') ||
        fLower.includes('solidão') ||
        fLower.includes('angústia') ||
        fLower.includes('desanimada') ||
        fLower.includes('sem forças') ||
        fLower.includes('esgotada')
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Permita-se sentir e soltar as lágrimas se o corpo pedir. O choro é a forma natural do cérebro descarregar a dor e baixar o cortisol. Você não precisa ser forte agora. Deite-se, sinta o aconchego da cama e lembre-se: você é acolhida aqui.'
        });
      }
      // C) CASO: AUTOCUIDADO, ESTILO, BELEZA (COR DE CABELO, ROUPAS, MUDANÇAS)
      else if (
        fLower.includes('cabelo') ||
        fLower.includes('cor de cabelo') ||
        fLower.includes('cor do cabelo') ||
        fLower.includes('loira') ||
        fLower.includes('morena') ||
        fLower.includes('ruiva') ||
        fLower.includes('pintar') ||
        fLower.includes('cortar') ||
        fLower.includes('roupa') ||
        fLower.includes('vestido') ||
        fLower.includes('look') ||
        fLower.includes('estilo') ||
        fLower.includes('visual') ||
        fLower.includes('corpo') ||
        fLower.includes('autoestima')
      ) {
        wait.push({
          raw: frag,
          note: 'Querer se renovar e mudar o visual (como o cabelo ou estilo) é uma forma linda de autocuidado! Mas decisões sobre você mesma ficam muito mais leves e certeiras com a mente descansada amanhã diante do espelho.'
        });
      }
      // D) CASO: TAREFAS PRÁTICAS E URGÊNCIAS REAIS
      else if (
        fLower.includes('amanhã') ||
        fLower.includes('ligar') ||
        fLower.includes('pagar') ||
        fLower.includes('comprar') ||
        fLower.includes('enviar') ||
        fLower.includes('reunião') ||
        fLower.includes('médic') ||
        fLower.includes('escola') ||
        fLower.includes('cedo') ||
        fLower.includes('prioridade') ||
        fLower.includes('trabalho') ||
        fLower.includes('relatório')
      ) {
        tomorrow.push({ raw: frag, action: formatActionItem(frag), done: false });
      }
      // E) CASO: AUTOCOBRANÇA E DIÁLOGOS PASSADOS
      else if (
        fLower.includes('deveria') ||
        fLower.includes('devia') ||
        fLower.includes('conversa') ||
        fLower.includes('discussão') ||
        fLower.includes('briga') ||
        fLower.includes('remoendo') ||
        fLower.includes('arrepend') ||
        fLower.includes('culpa') ||
        fLower.includes('falhei') ||
        fLower.includes('burra')
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Esse diálogo ou situação já passou e você não pode editá-lo no escuro da cama. Você fez o melhor que podia com a energia que tinha. Acolha seu esforço com gentileza e perdoe a si mesma esta noite.'
        });
      }
      // F) CASO: ANSIEDADE, MEDO E INCERTEZAS DO FUTURO
      else if (
        fLower.includes('medo') ||
        fLower.includes('futuro') ||
        fLower.includes('dar certo') ||
        fLower.includes('e se') ||
        fLower.includes('preocupad') ||
        fLower.includes('ansios') ||
        fLower.includes('pânico')
      ) {
        release.push({
          raw: frag,
          reframe: 'Preocupar-se à noite não resolve o futuro; só rouba a sua energia para vivê-lo amanhã. Solte o controle do que está longe e entregue-se ao descanso.'
        });
      }
      // G) PADRÃO: REFLEXÕES & IDEIAS GUARDADAS COM CARINHO
      else {
        wait.push({
          raw: frag,
          note: 'Guardado com carinho no seu cofre seguro. Fica protegido aqui para sua mente repousar em paz e clareza.'
        });
      }
    });

    if (tomorrow.length === 0 && wait.length === 0 && release.length === 0 && rumination.length === 0) {
      rumination.push({
        raw: text,
        reframe: 'Seu desabafo foi ouvido com respeito e carinho. Nada foi esquecido; descanse sua mente e acolha seu coração.'
      });
    }

    return {
      title: title || 'Diário Noturno',
      date: new Date().toISOString(),
      rawText: text,
      tomorrow,
      wait,
      release,
      rumination
    };
  }

  function formatActionItem(str) {
    let clean = str.replace(/^(preciso|tenho que|não posso esquecer de|lembrar de|amanhã)\s+/i, '');
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    return clean;
  }

  function renderTriagedResults(data) {
    if (resultEntryTitle) {
      resultEntryTitle.textContent = `“${data.title}”`;
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

    // Listener para tags clicáveis
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
        durationBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appState.selectedRoutineMinutes = parseInt(btn.getAttribute('data-minutes'), 10);
        routineTimeBadge.textContent = `${appState.selectedRoutineMinutes} min`;
      });
    });
  }

  function startRelaxationRoutine() {
    showStep('routine');
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

  function runBreathingCycle() {
    if (steps.routine.classList.contains('hidden')) return;

    setBreathingState('inhale', 'Inspire...', 4);
    setTimeout(() => {
      if (steps.routine.classList.contains('hidden')) return;
      setBreathingState('hold', 'Segure...', 7);
      setTimeout(() => {
        if (steps.routine.classList.contains('hidden')) return;
        setBreathingState('exhale', 'Solte devagar...', 8);
        setTimeout(() => {
          if (!steps.routine.classList.contains('hidden')) runBreathingCycle();
        }, 8000);
      }, 7000);
    }, 4000);
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
    stopAudioSoundscape();

    if (appState.currentTriagedData) {
      saveNightEntry(appState.currentTriagedData);
      
      if (supabase && appState.currentUser) {
        try {
          await supabase.from('journal_entries').insert({
            user_id: appState.currentUser.id,
            raw_text: appState.currentTriagedData.rawText,
            triaged_data: {
              title: appState.currentTriagedData.title,
              tomorrow: appState.currentTriagedData.tomorrow,
              wait: appState.currentTriagedData.wait,
              release: appState.currentTriagedData.release,
              rumination: appState.currentTriagedData.rumination
            },
            routine_duration_minutes: appState.selectedRoutineMinutes
          });
          console.log('✅ Diário sincronizado no Supabase!');
        } catch (e) {
          console.warn('Erro ao salvar no Supabase:', e);
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
  // PERSISTÊNCIA LOCAL (HISTÓRICO LIMPO)
  // ==========================================
  function loadHistoryFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const cleaned = parsed.filter(item => !item.rawText?.includes('relatório trimestral'));
      return cleaned;
    } catch (e) {
      return [];
    }
  }

  function saveLocalHistory(hist) {
    try {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(hist));
    } catch (e) {}
    updateHistoryUI();
  }

  function saveNightEntry(entry) {
    appState.history.unshift(entry);
    if (appState.history.length > 50) appState.history.pop();
    saveLocalHistory(appState.history);
  }

  function updateHistoryUI() {
    const list = appState.history;
    statTotalNights.textContent = list.length;

    let tasksCount = 0;
    let moodScoreSum = 0;
    let moodsRated = 0;

    list.forEach(item => {
      if (item.tomorrow) tasksCount += item.tomorrow.length;
      if (item.sleepMood) {
        moodsRated++;
        if (item.sleepMood === 'great') moodScoreSum += 3;
        else if (item.sleepMood === 'medium') moodScoreSum += 2;
        else if (item.sleepMood === 'terrible') moodScoreSum += 1;
      }
    });

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

    list.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const d = new Date(entry.date);
      const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const moodEmoji = entry.sleepMood === 'great' ? '😴' : entry.sleepMood === 'medium' ? '😐' : entry.sleepMood === 'terrible' ? '😫' : '🌙';
      const title = entry.title || 'Diário Noturno';

      card.innerHTML = `
        <div class="history-card-header">
          <span class="history-card-title">📖 ${escapeHTML(title)}</span>
          <span class="history-card-mood" title="Humor do sono">${moodEmoji} <small style="font-size:0.75rem; color:var(--text-muted);">${formattedDate}</small></span>
        </div>
        <p class="history-card-text">"${escapeHTML(entry.rawText)}"</p>
        <div class="history-tags">
          <button type="button" class="cat-item-tag interactive" data-tag-type="tomorrow" style="background: rgba(212, 163, 115, 0.2); color: var(--accent-amber);">
            ${entry.tomorrow ? entry.tomorrow.length : 0} ações amanhã ℹ️
          </button>
          <button type="button" class="cat-item-tag interactive" data-tag-type="wait" style="background: rgba(149, 167, 136, 0.2); color: var(--sage-calm);">
            ${entry.wait ? entry.wait.length : 0} no cofre ℹ️
          </button>
          <button type="button" class="cat-item-tag interactive" data-tag-type="release" style="background: rgba(181, 131, 141, 0.2); color: var(--lilac-twilight);">
            ${entry.release ? entry.release.length : 0} solturas ℹ️
          </button>
        </div>
      `;
      historyListContainer.appendChild(card);
    });

    // Re-bind listeners para tags no histórico
    document.querySelectorAll('.history-tags .cat-item-tag.interactive').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagType = btn.getAttribute('data-tag-type');
        openTagDetailModal(tagType);
      });
    });
  }

  // ==========================================
  // MODAIS (PREMIUM, AUTH, TAGS & TECLA ESC)
  // ==========================================
  function initModals() {
    // Premium
    navBtns.premium?.addEventListener('click', () => modalPremium.classList.remove('hidden'));
    btnCloseModal?.addEventListener('click', () => modalPremium.classList.add('hidden'));
    btnDismissPremium?.addEventListener('click', () => modalPremium.classList.add('hidden'));
    modalPremium?.addEventListener('click', (e) => {
      if (e.target === modalPremium) modalPremium.classList.add('hidden');
    });

    // Auth
    navBtns.auth?.addEventListener('click', () => modalAuth.classList.remove('hidden'));
    btnCloseAuthModal?.addEventListener('click', () => modalAuth.classList.add('hidden'));
    modalAuth?.addEventListener('click', (e) => {
      if (e.target === modalAuth) modalAuth.classList.add('hidden');
    });

    // Tag Info Modal
    btnCloseTagModal?.addEventListener('click', () => modalTagDetail.classList.add('hidden'));
    btnDismissTagModal?.addEventListener('click', () => modalTagDetail.classList.add('hidden'));
    modalTagDetail?.addEventListener('click', (e) => {
      if (e.target === modalTagDetail) modalTagDetail.classList.add('hidden');
    });

    // Tecla Escape para todos os modais
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        modalPremium?.classList.add('hidden');
        modalAuth?.classList.add('hidden');
        modalTagDetail?.classList.add('hidden');
      }
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
