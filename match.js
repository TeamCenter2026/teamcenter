window.TeamCenterMatch = (() => {
  const STORAGE_KEY = 'teamcenter-match-2.0-stable';

  const state = {
    convocazioni: [],
    selected: null,
    players: [],
    staff: [],
    actionTeam: 'breda',
    score: { home: 0, away: 0 },
    period: 0,
    timer: {
      running: false,
      startedAt: null,
      elapsedMs: 0,
      half: 1,
      firstHalfMs: 0,
      secondHalfMs: 0
    },
    events: [],
    finished: false,
    tick: null
  };

  const $ = selector => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseJson(value, fallback = []) {
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(String(value || ''));
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function fullName(player) {
    return `${player.Cognome || player.cognome || ''} ${player.Nome || player.nome || ''}`.trim();
  }

  function formatDate(value) {
    if (!value) return '';
    const parts = String(value).slice(0, 10).split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  }

  function makeId() {
    return `EV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function message(text = '', type = '') {
    const box = $('#match20Message');
    if (!box) return;
    box.textContent = text;
    box.className = `callup-message ${type}`.trim();
  }

  function saveMessage(text = '', type = '') {
    const box = $('#match20SaveMessage');
    if (!box) return;
    box.textContent = text;
    box.className = `callup-message ${type}`.trim();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedId: state.selected?.IDConvocazione || '',
        actionTeam: state.actionTeam,
        score: state.score,
        period: state.period,
        timer: state.timer,
        events: state.events,
        finished: state.finished
      }));
    } catch (error) {}
  }

  function clearPersisted() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
  }

  function resetMatchRuntime() {
    state.actionTeam = 'breda';
    state.score = { home: 0, away: 0 };
    state.period = 0;
    state.timer = {
      running: false,
      startedAt: null,
      elapsedMs: 0,
      half: 1,
      firstHalfMs: 0,
      secondHalfMs: 0
    };
    state.events = [];
    state.finished = false;
    if (state.tick) {
      clearInterval(state.tick);
      state.tick = null;
    }
  }

  async function loadCallups() {
    const select = $('#match20CallupSelect');
    if (select) select.innerHTML = '<option value="">Caricamento convocazioni…</option>';
    message('');

    try {
      const items = await window.TeamCenterAPI.getConvocazioni();
      state.convocazioni = Array.isArray(items) ? items : [];

      state.convocazioni.sort((a, b) => {
        const dateA = `${a.Data || ''} ${a.OrarioPartita || ''}`;
        const dateB = `${b.Data || ''} ${b.OrarioPartita || ''}`;
        return dateB.localeCompare(dateA);
      });

      if (!select) return;

      if (!state.convocazioni.length) {
        select.innerHTML = '<option value="">Nessuna convocazione salvata</option>';
        $('#match20StartBtn').disabled = true;
        return;
      }

      select.innerHTML = '<option value="">Seleziona una convocazione</option>' +
        state.convocazioni.map(item => {
          const label = `${formatDate(item.Data)} · ${item.Squadra} · ${item.Giornata} · ${item.Avversario}`;
          return `<option value="${escapeHtml(item.IDConvocazione)}">${escapeHtml(label)}</option>`;
        }).join('');

      const saved = readSaved();
      if (saved?.selectedId && state.convocazioni.some(item => item.IDConvocazione === saved.selectedId)) {
        select.value = saved.selectedId;
        selectCallup(saved.selectedId, false);
        restoreSaved(saved);
      }
    } catch (error) {
      console.error(error);
      if (select) select.innerHTML = '<option value="">Errore nel caricamento</option>';
      message(`Errore: ${error.message}`, 'error');
    }
  }

  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function restoreSaved(saved) {
    if (!saved || !state.selected) return;
    state.actionTeam = saved.actionTeam === 'opponent' ? 'opponent' : 'breda';
    state.score = {
      home: Math.max(0, Number(saved.score?.home) || 0),
      away: Math.max(0, Number(saved.score?.away) || 0)
    };
    state.period = Number(saved.period) || 0;
    state.timer = {
      ...state.timer,
      ...(saved.timer || {}),
      running: false,
      startedAt: null
    };
    state.events = Array.isArray(saved.events) ? saved.events : [];
    state.finished = Boolean(saved.finished);
    renderAll();
  }

  function selectCallup(id, reset = true) {
    const found = state.convocazioni.find(item => String(item.IDConvocazione) === String(id));
    state.selected = found || null;

    if (!state.selected) {
      state.players = [];
      state.staff = [];
      $('#match20StartBtn').disabled = true;
      $('#match20CallupSummary').innerHTML = 'Seleziona una convocazione salvata.';
      return;
    }

    state.players = parseJson(state.selected.Giocatori);
    state.staff = parseJson(state.selected.Staff);
    $('#match20StartBtn').disabled = false;

    const data = state.selected;
    $('#match20CallupSummary').innerHTML = `
      <strong>${escapeHtml(data.Squadra)}</strong>
      <span>${escapeHtml(data.Campionato)} · ${escapeHtml(data.Giornata)}</span>
      <b>${escapeHtml(data.Sede)} · ${escapeHtml(formatDate(data.Data))} ore ${escapeHtml(data.OrarioPartita)}</b>
      <span>${escapeHtml(data.Avversario)} · ${state.players.length} convocati · ${state.staff.length} staff</span>`;

    if (reset) {
      resetMatchRuntime();
      clearPersisted();
    }
  }

  function startSelectedMatch() {
    if (!state.selected) {
      message('Seleziona prima una convocazione.', 'error');
      return;
    }

    $('#match20SetupCard').classList.add('hidden');
    $('#match20LiveArea').classList.remove('hidden');
    renderAll();
    persist();
  }

  function renderAll() {
    renderHeader();
    renderScore();
    renderTimer();
    renderActionTeam();
    renderEvents();
  }

  function bredaIsHome() {
    return String(state.selected?.Sede || 'CASA').toUpperCase() === 'CASA';
  }

  function renderHeader() {
    if (!state.selected) return;
    const club = document.querySelector('#appTitle')?.textContent || 'CSV BREDA';
    const opponent = state.selected.Avversario || 'AVVERSARIO';
    $('#match20HomeName').textContent = bredaIsHome() ? club : opponent;
    $('#match20AwayName').textContent = bredaIsHome() ? opponent : club;
    $('#match20Meta').textContent =
      `${state.selected.Squadra} · ${state.selected.Campionato} · ${state.selected.Giornata} · ${formatDate(state.selected.Data)}`;
    $('#match20TeamBreda').textContent = club;
    $('#match20TeamOpponent').textContent = opponent;
  }

  function renderScore() {
    $('#match20HomeScore').textContent = state.score.home;
    $('#match20AwayScore').textContent = state.score.away;
  }

  function currentElapsed() {
    let value = Number(state.timer.elapsedMs) || 0;
    if (state.timer.running && state.timer.startedAt) {
      value += Date.now() - Number(state.timer.startedAt);
    }
    return Math.max(0, value);
  }

  function clock(ms) {
    const totalCent = Math.floor(Math.max(0, ms) / 10);
    const cent = totalCent % 100;
    const totalSeconds = Math.floor(totalCent / 100);
    const sec = totalSeconds % 60;
    const min = Math.floor(totalSeconds / 60);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(cent).padStart(2, '0')}`;
  }

  function renderTimer() {
    const elapsed = currentElapsed();
    $('#match20Clock').textContent = clock(elapsed);

    const labels = {
      0: 'PARTITA NON INIZIATA',
      1: 'PRIMO TEMPO',
      2: 'INTERVALLO',
      3: 'SECONDO TEMPO',
      4: 'PARTITA TERMINATA'
    };
    $('#match20Period').textContent = labels[state.period] || labels[0];

    const extra = elapsed - 45 * 60 * 1000;
    $('#match20Recovery').textContent =
      (state.period === 1 || state.period === 3) && extra >= 0
        ? `RECUPERO +${clock(extra)}`
        : '';

    if (state.timer.running && !state.tick) {
      state.tick = setInterval(renderTimer, 40);
    }
    if (!state.timer.running && state.tick) {
      clearInterval(state.tick);
      state.tick = null;
    }
  }

  function pauseTimer() {
    if (!state.timer.running) return;
    state.timer.elapsedMs = currentElapsed();
    state.timer.running = false;
    state.timer.startedAt = null;
    persist();
    renderTimer();
  }

  function startHalf(half) {
    if (!state.selected) return;
    if (half === 2 && state.period !== 2 && state.period !== 3) {
      message('Concludi prima il primo tempo.', 'error');
      return;
    }
    state.timer.half = half;
    state.timer.elapsedMs = 0;
    state.timer.startedAt = Date.now();
    state.timer.running = true;
    state.period = half === 1 ? 1 : 3;
    state.finished = false;
    persist();
    renderAll();
  }

  function resumeTimer() {
    if (![1, 3].includes(state.period) || state.timer.running) return;
    state.timer.startedAt = Date.now();
    state.timer.running = true;
    persist();
    renderTimer();
  }

  function timerCommand(command) {
    if (command === 'start-first') startHalf(1);
    if (command === 'pause') pauseTimer();
    if (command === 'resume') resumeTimer();

    if (command === 'end-first') {
      if (state.period !== 1) return;
      pauseTimer();
      state.timer.firstHalfMs = state.timer.elapsedMs;
      state.period = 2;
      addSystemEvent('Fine primo tempo');
      persist();
      renderAll();
    }

    if (command === 'start-second') startHalf(2);

    if (command === 'end-match') {
      if (state.period !== 3) return;
      pauseTimer();
      state.timer.secondHalfMs = state.timer.elapsedMs;
      state.period = 4;
      state.finished = true;
      addSystemEvent('Fine partita');
      persist();
      renderAll();
    }
  }

  function eventMinute() {
    const elapsed = currentElapsed();
    const totalSeconds = Math.floor(elapsed / 1000);
    const minute = Math.floor(totalSeconds / 60);
    const second = totalSeconds % 60;

    if (state.period === 3) {
      if (minute >= 45) return `90'+${minute - 45}:${String(second).padStart(2, '0')}`;
      return `${45 + minute}:${String(second).padStart(2, '0')}`;
    }

    if (minute >= 45) return `45'+${minute - 45}:${String(second).padStart(2, '0')}`;
    return `${minute}:${String(second).padStart(2, '0')}`;
  }

  function addSystemEvent(type) {
    state.events.unshift({
      id: makeId(),
      type,
      team: 'system',
      playerId: '',
      playerName: '',
      time: eventMinute(),
      period: state.period,
      note: '',
      createdAt: Date.now()
    });
  }

  function canRecord() {
    if (![1, 3].includes(state.period)) {
      message('Avvia un tempo di gioco prima di registrare un evento.', 'error');
      return false;
    }
    return true;
  }

  function openEvent(type) {
    if (!canRecord()) return;

    const playerTypes = ['Gol', 'Assist', 'Ammonizione', 'Espulsione'];
    const needsPlayer = state.actionTeam === 'breda' && playerTypes.includes(type);

    $('#match20EventType').value = type;
    $('#match20DialogTitle').textContent = `Registra ${type}`;
    $('#match20EventNote').value = '';
    $('#match20PlayerField').classList.toggle('hidden', !needsPlayer);

    if (needsPlayer) {
      $('#match20PlayerLabel').textContent =
        type === 'Gol' ? 'Marcatore' :
        type === 'Assist' ? 'Giocatore dell’assist' :
        type === 'Ammonizione' ? 'Giocatore ammonito' :
        'Giocatore espulso';

      $('#match20PlayerSelect').innerHTML =
        '<option value="">Seleziona il giocatore convocato</option>' +
        state.players.map(player => {
          const id = player.IDGiocatore || player.id || fullName(player);
          return `<option value="${escapeHtml(id)}">${escapeHtml(fullName(player))}</option>`;
        }).join('');
    }

    $('#match20EventDialog').showModal();
  }

  function saveEventFromDialog() {
    const type = $('#match20EventType').value;
    const needsPlayer =
      state.actionTeam === 'breda' &&
      ['Gol', 'Assist', 'Ammonizione', 'Espulsione'].includes(type);

    let playerId = '';
    let playerName = '';

    if (needsPlayer) {
      playerId = $('#match20PlayerSelect').value;
      if (!playerId) {
        message('Seleziona un giocatore convocato.', 'error');
        return false;
      }
      const player = state.players.find(item =>
        String(item.IDGiocatore || item.id || fullName(item)) === String(playerId)
      );
      playerName = player ? fullName(player) : '';
    }

    state.events.unshift({
      id: makeId(),
      type,
      team: state.actionTeam,
      playerId,
      playerName,
      time: eventMinute(),
      period: state.period,
      note: $('#match20EventNote').value.trim(),
      createdAt: Date.now()
    });

    if (type === 'Gol') {
      const side = state.actionTeam === 'breda'
        ? (bredaIsHome() ? 'home' : 'away')
        : (bredaIsHome() ? 'away' : 'home');
      state.score[side] += 1;
    }

    persist();
    renderScore();
    renderEvents();
    message('');
    return true;
  }

  function renderActionTeam() {
    $('#match20TeamBreda').classList.toggle('active', state.actionTeam === 'breda');
    $('#match20TeamOpponent').classList.toggle('active', state.actionTeam === 'opponent');
  }

  function iconFor(type) {
    return ({
      Gol: '⚽',
      Assist: '🅰️',
      Ammonizione: '🟨',
      Espulsione: '🟥',
      Corner: '🏳️',
      Punizione: '🎯',
      'Palla recuperata': '🛡️',
      'Palla persa': '❌',
      'Fine primo tempo': '⏸️',
      'Fine partita': '⏹️'
    })[type] || '•';
  }

  function renderEvents() {
    const box = $('#match20Events');
    if (!box) return;

    if (!state.events.length) {
      box.innerHTML = '<div class="callup-empty">Nessun evento registrato.</div>';
      return;
    }

    box.innerHTML = state.events.map(event => {
      const team =
        event.team === 'system' ? '' :
        event.team === 'breda' ? 'CSV Breda' :
        state.selected?.Avversario || 'Avversario';

      return `<article class="match20-event">
        <div class="match20-event-time">${escapeHtml(event.time)}</div>
        <div class="match20-event-icon">${iconFor(event.type)}</div>
        <div class="match20-event-body">
          <strong>${escapeHtml(event.type)}${event.playerName ? ` · ${escapeHtml(event.playerName)}` : ''}</strong>
          <span>${escapeHtml(team)}${event.note ? ` · ${escapeHtml(event.note)}` : ''}</span>
        </div>
        <button type="button" data-match20-delete="${escapeHtml(event.id)}" aria-label="Elimina evento">×</button>
      </article>`;
    }).join('');
  }

  function deleteEvent(id) {
    const event = state.events.find(item => item.id === id);
    if (!event) return;

    if (event.type === 'Gol') {
      const side = event.team === 'breda'
        ? (bredaIsHome() ? 'home' : 'away')
        : (bredaIsHome() ? 'away' : 'home');
      state.score[side] = Math.max(0, state.score[side] - 1);
    }

    state.events = state.events.filter(item => item.id !== id);
    persist();
    renderScore();
    renderEvents();
  }

  function adjustScore(side, delta) {
    state.score[side] = Math.max(0, state.score[side] + Number(delta || 0));
    persist();
    renderScore();
  }

  async function saveMatch() {
    if (!state.selected) return;
    const button = $('#match20SaveBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvataggio…';
    saveMessage('');

    try {
      const payload = {
        idConvocazione: state.selected.IDConvocazione,
        idSquadra: state.selected.IDSquadra,
        squadra: state.selected.Squadra,
        campionato: state.selected.Campionato,
        giornata: state.selected.Giornata,
        data: state.selected.Data,
        avversario: state.selected.Avversario,
        sede: state.selected.Sede,
        risultatoCasa: state.score.home,
        risultatoTrasferta: state.score.away,
        stato: state.finished ? 'TERMINATA' : 'IN CORSO',
        tempoPartita: JSON.stringify({
          periodo: state.period,
          primoTempoMs: state.timer.firstHalfMs,
          secondoTempoMs: state.timer.secondHalfMs,
          correnteMs: currentElapsed()
        }),
        eventi: JSON.stringify(state.events),
        giocatori: JSON.stringify(state.players),
        staff: JSON.stringify(state.staff)
      };

      const saved = await window.TeamCenterAPI.saveMatch(payload);
      saveMessage(`Match salvato: ${saved.IDMatch}`, 'success');
    } catch (error) {
      console.error(error);
      saveMessage(`Errore: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function bind() {
    $('#match20CallupSelect')?.addEventListener('change', event => {
      selectCallup(event.target.value, true);
    });
    $('#match20StartBtn')?.addEventListener('click', startSelectedMatch);
    $('#match20RefreshBtn')?.addEventListener('click', loadCallups);

    $('#match20BackHomeBtn')?.addEventListener('click', () => {
      pauseTimer();
      showScreen('homeScreen');
    });

    $('#match20TeamBreda')?.addEventListener('click', () => {
      state.actionTeam = 'breda';
      persist();
      renderActionTeam();
    });
    $('#match20TeamOpponent')?.addEventListener('click', () => {
      state.actionTeam = 'opponent';
      persist();
      renderActionTeam();
    });

    $('#match20EventForm')?.addEventListener('submit', event => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      if (saveEventFromDialog()) $('#match20EventDialog').close();
    });

    $('#match20SaveBtn')?.addEventListener('click', saveMatch);

    document.addEventListener('click', event => {
      const timerButton = event.target.closest('[data-match20-timer]');
      if (timerButton) timerCommand(timerButton.dataset.match20Timer);

      const actionButton = event.target.closest('[data-match20-action]');
      if (actionButton) openEvent(actionButton.dataset.match20Action);

      const scoreButton = event.target.closest('[data-match20-score]');
      if (scoreButton) adjustScore(scoreButton.dataset.match20Score, scoreButton.dataset.delta);

      const deleteButton = event.target.closest('[data-match20-delete]');
      if (deleteButton) deleteEvent(deleteButton.dataset.match20Delete);
    });
  }

  async function open() {
    showScreen('matchCenterScreen');
    $('#match20SetupCard').classList.remove('hidden');
    $('#match20LiveArea').classList.add('hidden');
    await loadCallups();
  }

  bind();

  return Object.freeze({
    open,
    clock,
    isStoppage: ms => ms >= 45 * 60 * 1000
  });
})();
