/**
 * DESLIGUE-SE — Motor Cognitivo de Triagem Noturna & Ritual de Sono (TCC-I)
 * Integração com Supabase (Auth Google/Email, Banco de Dados PostgreSQL & RLS)
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
      console.log('✅ Supabase conectado com sucesso:', SUPABASE_URL);
    }
  } catch (err) {
    console.warn('Supabase não pôde ser inicializado localmente:', err);
  }

  // ==========================================
  // ESTADO DA APLICAÇÃO & PERSISTÊNCIA
  // ==========================================
  const STORAGE_KEY_ENTRIES = 'desliguese_entries_v1';

  let appState = {
    currentUser: null,
    userProfile: null,
    currentDumpText: '',
    currentTriagedData: null,
    selectedRoutineMinutes: 3,
    routineInterval: null,
    routineSecondsRemaining: 180,
    breathingPhase: 'inhale', // 'inhale', 'hold', 'exhale'
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

  const navBtns = {
    night: document.getElementById('btnTabNight'),
    morning: document.getElementById('btnTabMorning'),
    history: document.getElementById('btnTabHistory'),
    premium: document.getElementById('btnOpenPremium'),
    auth: document.getElementById('btnOpenAuth'),
    logo: document.getElementById('btnLogoHome')
  };

  const userAvatarIcon = document.getElementById('userAvatarIcon');
  const userAuthLabel = document.getElementById('userAuthLabel');

  const journalInput = document.getElementById('journalInput');
  const btnProcessDump = document.getElementById('btnProcessDump');
  const btnVoiceInput = document.getElementById('btnVoiceInput');
  const voiceBtnLabel = document.getElementById('voiceBtnLabel');

  const listTomorrow = document.getElementById('listTomorrow');
  const listWait = document.getElementById('listWait');
  const listRelease = document.getElementById('listRelease');
  const listRumination = document.getElementById('listRumination');
  const catRuminationContainer = document.getElementById('catRuminationContainer');

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

  // Stats
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

  // ==========================================
  // AUTENTICAÇÃO COM SUPABASE
  // ==========================================
  async function initSupabaseAuth() {
    if (!supabase) return;

    try {
      // 1. Checa sessão ativa
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        handleUserLoggedIn(session.user);
      } else {
        handleUserLoggedOut();
      }

      // 2. Ouve mudanças de estado de autenticação
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

    // Botão Google Login
    btnGoogleLogin.addEventListener('click', async () => {
      showAuthFeedback('Redirecionando para login seguro do Google...', 'success');
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.href
          }
        });
        if (error) showAuthFeedback(error.message, 'error');
      } catch (err) {
        showAuthFeedback('Erro ao conectar com Google: ' + err.message, 'error');
      }
    });

    // Login com E-mail e Senha
    formEmailAuth.addEventListener('submit', async (e) => {
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

    // Criar Nova Conta
    btnSubmitSignup.addEventListener('click', async () => {
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
    btnSignOut.addEventListener('click', async () => {
      await supabase.auth.signOut();
      modalAuth.classList.add('hidden');
      showAuthFeedback('Você saiu da conta.', 'success');
    });
  }

  function handleUserLoggedIn(user) {
    appState.currentUser = user;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuária';
    
    userAvatarIcon.textContent = '✨';
    userAuthLabel.textContent = name.length > 12 ? name.substring(0, 10) + '...' : name;

    authViewLoggedOut.classList.add('hidden');
    authViewLoggedIn.classList.remove('hidden');

    loggedUserName.textContent = `Olá, ${name}!`;
    loggedUserEmail.textContent = user.email;

    // Carrega perfil e histórico do banco na nuvem
    loadCloudUserProfile(user.id);
    syncCloudHistory(user.id);
  }

  function handleUserLoggedOut() {
    appState.currentUser = null;
    appState.userProfile = null;
    userAvatarIcon.textContent = '👤';
    userAuthLabel.textContent = 'Entrar';

    authViewLoggedOut.classList.remove('hidden');
    authViewLoggedIn.classList.add('hidden');
  }

  async function loadCloudUserProfile(userId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        appState.userProfile = data;
        const plano = data.plano === 'premium_mensal' || data.plano === 'premium_anual' ? '⭐ Premium' : 'Gratuito';
        loggedUserPlanBadge.textContent = plano;
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
      console.warn('Erro ao sincronizar histórico da nuvem:', e);
    }
  }

  function showAuthFeedback(msg, type) {
    authFeedbackMsg.textContent = msg;
    authFeedbackMsg.className = `auth-feedback ${type}`;
    authFeedbackMsg.classList.remove('hidden');
  }

  // ==========================================
  // NAVEGAÇÃO ENTRE ABAS
  // ==========================================
  function initNavigation() {
    navBtns.night.addEventListener('click', () => switchView('night'));
    navBtns.morning.addEventListener('click', () => switchView('morning'));
    navBtns.history.addEventListener('click', () => switchView('history'));
    navBtns.logo.addEventListener('click', () => switchView('night'));
  }

  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      views[k].classList.toggle('active', k === viewName);
    });

    navBtns.night.classList.toggle('active', viewName === 'night');
    navBtns.morning.classList.toggle('active', viewName === 'morning');
    navBtns.history.classList.toggle('active', viewName === 'history');

    if (viewName === 'morning') {
      renderMorningView();
    } else if (viewName === 'history') {
      updateHistoryUI();
    }
  }

  function showStep(stepName) {
    Object.keys(steps).forEach(k => {
      steps[k].classList.toggle('hidden', k !== stepName);
    });
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
  // ENTRADA POR VOZ (WEB SPEECH API)
  // ==========================================
  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btnVoiceInput.title = 'Ditado por voz não suportado neste navegador. Digite abaixo.';
      return;
    }

    appState.recognition = new SpeechRecognition();
    appState.recognition.lang = 'pt-BR';
    appState.recognition.continuous = true;
    appState.recognition.interimResults = true;

    appState.recognition.onstart = () => {
      appState.isRecording = true;
      btnVoiceInput.classList.add('recording');
      voiceBtnLabel.textContent = 'Ouvindo... (toque para parar)';
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

    btnVoiceInput.addEventListener('click', () => {
      if (appState.isRecording) {
        appState.recognition.stop();
      } else {
        try { appState.recognition.start(); } catch (e) {}
      }
    });
  }

  function stopRecording() {
    appState.isRecording = false;
    btnVoiceInput.classList.remove('recording');
    voiceBtnLabel.textContent = 'Falar pensamentos';
  }

  // ==========================================
  // MOTOR DE TRIAGEM COGNITIVA TCC-I
  // ==========================================
  function handleProcessDump() {
    const text = journalInput.value.trim();
    if (!text) return;

    if (appState.isRecording && appState.recognition) {
      appState.recognition.stop();
    }

    appState.currentDumpText = text;
    showStep('loading');

    setTimeout(() => {
      const triaged = analyzeThoughtsWithTCCI(text);
      appState.currentTriagedData = triaged;
      renderTriagedResults(triaged);
      showStep('result');
    }, 1300);
  }

  function analyzeThoughtsWithTCCI(text) {
    const fragments = text
      .split(/(?:[.,;!\n\?]+|\be\s+também\b|\be\s+não\b|\be\s+preciso\b|\be\s+tenho\b)/gi)
      .map(s => s.trim())
      .filter(s => s.length > 4);

    const tomorrow = [];
    const wait = [];
    const release = [];
    const rumination = [];

    fragments.forEach(frag => {
      const fLower = frag.toLowerCase();

      if (
        fLower.includes('amanhã') ||
        fLower.includes('ligar') ||
        fLower.includes('pagar') ||
        fLower.includes('comprar') ||
        fLower.includes('enviar') ||
        fLower.includes('reunião') ||
        fLower.includes('médic') ||
        fLower.includes('escola') ||
        fLower.includes('cedo') ||
        fLower.includes('prioridade')
      ) {
        tomorrow.push({ raw: frag, action: formatActionItem(frag), done: false });
      } else if (
        fLower.includes('deveria') ||
        fLower.includes('devia') ||
        fLower.includes('conversa') ||
        fLower.includes('discussão') ||
        fLower.includes('briga') ||
        fLower.includes('remoendo') ||
        fLower.includes('arrepend') ||
        fLower.includes('culpa')
      ) {
        rumination.push({
          raw: frag,
          reframe: 'Esse diálogo já passou e você não pode editá-lo no escuro da cama. Acolha com carinho e deixe ir.'
        });
      } else if (
        fLower.includes('medo') ||
        fLower.includes('futuro') ||
        fLower.includes('dar certo') ||
        fLower.includes('e se') ||
        fLower.includes('preocupad') ||
        fLower.includes('ansios')
      ) {
        release.push({
          raw: frag,
          reframe: 'Preocupar-se à noite não resolve o futuro; só rouba a sua energia para enfrentá-lo amanhã. Pode soltar.'
        });
      } else {
        wait.push({ raw: frag, note: 'Guardado com segurança no cofre. Sem urgência imediata.' });
      }
    });

    if (tomorrow.length === 0 && wait.length === 0 && release.length === 0 && rumination.length === 0) {
      tomorrow.push({ raw: text, action: 'Rever anotações com clareza amanhã pela manhã (Guardado)', done: false });
    }

    return {
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
    listTomorrow.innerHTML = '';
    if (data.tomorrow.length > 0) {
      data.tomorrow.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `<span class="cat-item-tag">Amanhã</span><span><strong>${escapeHTML(item.action)}</strong></span>`;
        listTomorrow.appendChild(li);
      });
    } else {
      listTomorrow.innerHTML = '<li class="cat-item"><span>Nenhuma urgência identificada para a manhã. Ótimo!</span></li>';
    }

    listWait.innerHTML = '';
    if (data.wait.length > 0) {
      data.wait.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `<span class="cat-item-tag">No Cofre</span><span>${escapeHTML(item.raw)} — <em>(Não precisa da sua atenção esta noite)</em></span>`;
        listWait.appendChild(li);
      });
    } else {
      listWait.innerHTML = '<li class="cat-item"><span>Sem pendências secundárias acumuladas.</span></li>';
    }

    listRelease.innerHTML = '';
    if (data.release.length > 0) {
      data.release.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `<span class="cat-item-tag">Soltar</span><span>${escapeHTML(item.raw)} <br><small style="color: var(--sage-calm);">${item.reframe}</small></span>`;
        listRelease.appendChild(li);
      });
    } else {
      listRelease.innerHTML = '<li class="cat-item"><span>Sua mente está livre de grandes incertezas hoje.</span></li>';
    }

    if (data.rumination.length > 0) {
      catRuminationContainer.classList.remove('hidden');
      listRumination.innerHTML = '';
      data.rumination.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cat-item';
        li.innerHTML = `<span class="cat-item-tag" style="background: rgba(181, 131, 141, 0.2); color: var(--lilac-twilight);">Acolhimento</span><span>${escapeHTML(item.raw)} <br><small style="color: var(--lilac-twilight);">${item.reframe}</small></span>`;
        listRumination.appendChild(li);
      });
    } else {
      catRuminationContainer.classList.add('hidden');
    }
  }

  // ==========================================
  // ROTINA DE DESACELERAÇÃO & SOMATOSENSORIAL
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
      somaticStepDesc.textContent = 'Sua mente está organizada e guardada. O dia foi concluído com sucesso. Entregue-se ao repouso.';
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
      
      // Salva no banco Supabase se estiver logada
      if (supabase && appState.currentUser) {
        try {
          await supabase.from('journal_entries').insert({
            user_id: appState.currentUser.id,
            raw_text: appState.currentTriagedData.rawText,
            triaged_data: {
              tomorrow: appState.currentTriagedData.tomorrow,
              wait: appState.currentTriagedData.wait,
              release: appState.currentTriagedData.release,
              rumination: appState.currentTriagedData.rumination
            },
            routine_duration_minutes: appState.selectedRoutineMinutes
          });
          console.log('✅ Diário sincronizado no Supabase com sucesso!');
        } catch (e) {
          console.warn('Erro ao salvar no Supabase:', e);
        }
      }
    }

    showStep('goodNight');
  }

  // ==========================================
  // WEB AUDIO API — CHUVA & FREQUÊNCIA DELTA
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

      // Atualiza no Supabase se houver ID
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
      insightText.innerHTML = '<strong>Descanso Excelente!</strong> Descarregar a mente permitiu que o córtex pré-frontal relaxasse e facilitou o sono de ondas lentas.';
    } else if (mood === 'medium') {
      insightText.innerHTML = '<strong>Descanso Regular:</strong> Você organizou o dia, mas o corpo reteve alguma tensão. Recomendamos testar a rotina de 5 minutos hoje à noite.';
    } else {
      insightText.innerHTML = '<strong>Noite Desafiadora:</strong> Seu dia foi exigente. Hoje à noite, dedique 5 a 10 minutos para a respiração 4-7-8 e a soltura de pensamentos.';
    }
  }

  // ==========================================
  // PERSISTÊNCIA LOCAL
  // ==========================================
  function loadHistoryFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
      return raw ? JSON.parse(raw) : getMockInitialHistory();
    } catch (e) {
      return getMockInitialHistory();
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
    if (appState.history.length > 30) appState.history.pop();
    saveLocalHistory(appState.history);
  }

  function getMockInitialHistory() {
    return [
      {
        date: new Date(Date.now() - 86400000).toISOString(),
        rawText: 'Preciso enviar o relatório trimestral, pagar a taxa da escola e fiquei chateada com o feedback da reunião.',
        sleepMood: 'great',
        tomorrow: [
          { action: 'Enviar relatório trimestral às 09h', done: true },
          { action: 'Pagar taxa da escola', done: true }
        ],
        wait: [{ raw: 'Pesquisar curso novo de atualização', note: 'No cofre' }],
        release: [{ raw: 'Feedback da reunião', reframe: 'O dia já terminou. Amanhã é uma nova oportunidade.' }],
        rumination: []
      }
    ];
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
      historyListContainer.innerHTML = '<div class="empty-state">Nenhuma noite registrada ainda.</div>';
      return;
    }

    list.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const d = new Date(entry.date);
      const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const moodEmoji = entry.sleepMood === 'great' ? '😴' : entry.sleepMood === 'medium' ? '😐' : entry.sleepMood === 'terrible' ? '😫' : '🌙';

      card.innerHTML = `
        <div class="history-card-header">
          <span>${formattedDate}</span>
          <span class="history-card-mood" title="Humor do sono">${moodEmoji}</span>
        </div>
        <p class="history-card-text">"${escapeHTML(entry.rawText)}"</p>
        <div class="history-tags">
          <span class="cat-item-tag" style="background: rgba(212, 163, 115, 0.2); color: var(--accent-amber);">${entry.tomorrow ? entry.tomorrow.length : 0} ações amanhã</span>
          <span class="cat-item-tag" style="background: rgba(149, 167, 136, 0.2); color: var(--sage-calm);">${entry.wait ? entry.wait.length : 0} no cofre</span>
          <span class="cat-item-tag" style="background: rgba(181, 131, 141, 0.2); color: var(--lilac-twilight);">${entry.release ? entry.release.length : 0} solturas</span>
        </div>
      `;
      historyListContainer.appendChild(card);
    });
  }

  // ==========================================
  // MODAIS (PREMIUM & AUTH)
  // ==========================================
  function initModals() {
    navBtns.premium.addEventListener('click', () => modalPremium.classList.remove('hidden'));
    btnCloseModal.addEventListener('click', () => modalPremium.classList.add('hidden'));
    modalPremium.addEventListener('click', (e) => {
      if (e.target === modalPremium) modalPremium.classList.add('hidden');
    });

    navBtns.auth.addEventListener('click', () => modalAuth.classList.remove('hidden'));
    btnCloseAuthModal.addEventListener('click', () => modalAuth.classList.add('hidden'));
    modalAuth.addEventListener('click', (e) => {
      if (e.target === modalAuth) modalAuth.classList.add('hidden');
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
