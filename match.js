window.TeamCenterMatch = (() => {
  const STORAGE_KEY = 'teamcenter-match-2.0-stable';

  const state = {
    convocazioni: [],
    matchArchive: [],
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
    $('#match20AfterSaveActions')?.classList.add('hidden');
    saveMessage('');
    renderSaveAvailability();
    if (!state.selected) {
      message('Seleziona prima una convocazione.', 'error');
      return;
    }

    $('#match20SetupCard').classList.add('hidden');
    $('#match20ReportArchiveCard')?.classList.add('hidden');
    $('#match20LiveArea').classList.remove('hidden');
    renderAll();
    persist();
  }

  function renderSaveAvailability() {
    const button = $('#match20SaveBtn');
    if (!button) return;

    const canSave = state.finished === true && state.period === 4;
    button.disabled = !canSave;
    button.title = canSave
      ? 'Salva il Match terminato'
      : 'Il Match può essere salvato solo dopo Fine partita';
  }

  function renderAll() {
    renderHeader();
    renderScore();
    renderTimer();
    renderActionTeam();
    renderEvents();
    renderSaveAvailability();
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
    const displayElapsed = state.period === 3
      ? (45 * 60 * 1000) + elapsed
      : elapsed;
    $('#match20Clock').textContent = clock(displayElapsed);

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



  function valueFrom(record, ...keys) {
    for (const key of keys) {
      if (record && record[key] !== undefined && record[key] !== null && String(record[key]) !== '') {
        return record[key];
      }
    }
    return '';
  }

  function normalizeArchiveMatch(record) {
    return {
      IDMatch: valueFrom(record, 'IDMatch', 'idMatch'),
      IDConvocazione: valueFrom(record, 'IDConvocazione', 'idConvocazione'),
      IDSquadra: valueFrom(record, 'IDSquadra', 'idSquadra'),
      Squadra: valueFrom(record, 'Squadra', 'squadra'),
      Campionato: valueFrom(record, 'Campionato', 'campionato'),
      Giornata: valueFrom(record, 'Giornata', 'giornata'),
      Data: valueFrom(record, 'Data', 'data'),
      Avversario: valueFrom(record, 'Avversario', 'avversario'),
      Sede: valueFrom(record, 'Sede', 'sede'),
      RisultatoCasa: Number(valueFrom(record, 'RisultatoCasa', 'risultatoCasa')) || 0,
      RisultatoTrasferta: Number(valueFrom(record, 'RisultatoTrasferta', 'risultatoTrasferta')) || 0,
      Stato: valueFrom(record, 'Stato', 'stato'),
      TempoPartita: valueFrom(record, 'TempoPartita', 'tempoPartita'),
      Eventi: valueFrom(record, 'Eventi', 'eventi'),
      Giocatori: valueFrom(record, 'Giocatori', 'giocatori'),
      Staff: valueFrom(record, 'Staff', 'staff')
    };
  }

  function renderReportArchive() {
    const container = $('#match20ReportArchive');
    if (!container) return;

    if (!state.matchArchive.length) {
      container.innerHTML = '<div class="callup-empty">Nessun Match salvato.</div>';
      return;
    }

    container.innerHTML = state.matchArchive.map((raw, index) => {
      const item = normalizeArchiveMatch(raw);
      const club = getClubName();
      const home = String(item.Sede || '').toUpperCase() === 'CASA';
      const homeName = home ? club : item.Avversario;
      const awayName = home ? item.Avversario : club;

      return `
        <article class="match20-report-item">
          <div class="match20-report-info">
            <strong>${escapeHtml(formatDate(item.Data))} · ${escapeHtml(item.Squadra || 'Squadra')}</strong>
            <span>${escapeHtml(item.Campionato)} · ${escapeHtml(item.Giornata)}</span>
            <b>${escapeHtml(homeName)} ${item.RisultatoCasa} - ${item.RisultatoTrasferta} ${escapeHtml(awayName)}</b>
          </div>
          <button class="btn btn-secondary" type="button" data-match20-report-index="${index}">
            📄 Apri PDF
          </button>
        </article>
      `;
    }).join('');
  }

  async function loadReportArchive() {
    const container = $('#match20ReportArchive');
    if (container) container.innerHTML = '<div class="callup-empty">Caricamento report salvati…</div>';

    try {
      const items = await window.TeamCenterAPI.getMatch();
      state.matchArchive = Array.isArray(items) ? items : [];
      state.matchArchive.sort((a, b) => {
        const dateA = String(valueFrom(a, 'Data', 'data') || '');
        const dateB = String(valueFrom(b, 'Data', 'data') || '');
        return dateB.localeCompare(dateA);
      });
      renderReportArchive();
    } catch (error) {
      console.error(error);
      if (container) {
        container.innerHTML = `<div class="callup-empty">Errore archivio: ${escapeHtml(error.message)}</div>`;
      }
    }
  }

  function openArchivedReport(index) {
    const raw = state.matchArchive[Number(index)];
    if (!raw) return;

    const item = normalizeArchiveMatch(raw);
    const backup = {
      selected: state.selected,
      score: { ...state.score },
      events: [...state.events],
      players: [...state.players],
      staff: [...state.staff],
      finished: state.finished,
      period: state.period,
      timer: { ...state.timer }
    };

    state.selected = {
      IDConvocazione: item.IDConvocazione,
      IDSquadra: item.IDSquadra,
      Squadra: item.Squadra,
      Campionato: item.Campionato,
      Giornata: item.Giornata,
      Data: item.Data,
      Avversario: item.Avversario,
      Sede: item.Sede
    };
    state.score = {
      home: item.RisultatoCasa,
      away: item.RisultatoTrasferta
    };
    state.events = parseJson(item.Eventi);
    state.players = parseJson(item.Giocatori);
    state.staff = parseJson(item.Staff);
    state.finished = true;
    state.period = 4;

    createPdfReport();

    window.setTimeout(() => {
      state.selected = backup.selected;
      state.score = backup.score;
      state.events = backup.events;
      state.players = backup.players;
      state.staff = backup.staff;
      state.finished = backup.finished;
      state.period = backup.period;
      state.timer = backup.timer;
    }, 500);
  }

  function goHome() {
    pauseTimer();

    const dialog = $('#match20EventDialog');
    if (dialog?.open) dialog.close();

    $('#match20LiveArea')?.classList.add('hidden');
    $('#match20SetupCard')?.classList.remove('hidden');
    $('#match20ReportArchiveCard')?.classList.remove('hidden');

    showScreen('homeScreen');
  }

  function getBrandTitle() {
    return (document.querySelector('#appTitle')?.textContent || 'CSV BREDA | TEAM CENTER').trim();
  }

  function getClubName() {
    const title = getBrandTitle();
    return (title.split('|')[0] || 'CSV BREDA').trim();
  }

  function countEvents(type, team = null) {
    return state.events.filter(event =>
      event.type === type &&
      event.team !== 'system' &&
      (team === null || event.team === team)
    ).length;
  }

  function playerStatsRows() {
    const map = new Map();

    state.events.forEach(event => {
      if (event.team !== 'breda' || !event.playerName) return;

      if (!map.has(event.playerName)) {
        map.set(event.playerName, {
          name: event.playerName,
          gol: 0,
          assist: 0,
          ammonizioni: 0,
          espulsioni: 0
        });
      }

      const row = map.get(event.playerName);
      if (event.type === 'Gol') row.gol += 1;
      if (event.type === 'Assist') row.assist += 1;
      if (event.type === 'Ammonizione') row.ammonizioni += 1;
      if (event.type === 'Espulsione') row.espulsioni += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function printableReportHtml() {
    if (!state.selected) throw new Error('Nessun Match selezionato.');

    const club = getClubName();
    const brandTitle = getBrandTitle();
    const opponent = state.selected.Avversario || 'Avversario';
    const homeName = bredaIsHome() ? club : opponent;
    const awayName = bredaIsHome() ? opponent : club;
    const playerRows = playerStatsRows();
    const logoSrc = document.querySelector('#homeClubLogo img')?.src || '';

    const teamStats = [
      ['Gol', countEvents('Gol', 'breda'), countEvents('Gol', 'opponent')],
      ['Assist', countEvents('Assist', 'breda'), countEvents('Assist', 'opponent')],
      ['Ammonizioni', countEvents('Ammonizione', 'breda'), countEvents('Ammonizione', 'opponent')],
      ['Espulsioni', countEvents('Espulsione', 'breda'), countEvents('Espulsione', 'opponent')],
      ['Corner', countEvents('Corner', 'breda'), countEvents('Corner', 'opponent')],
      ['Punizioni', countEvents('Punizione', 'breda'), countEvents('Punizione', 'opponent')],
      ['Palle recuperate', countEvents('Palla recuperata', 'breda'), countEvents('Palla recuperata', 'opponent')],
      ['Palle perse', countEvents('Palla persa', 'breda'), countEvents('Palla persa', 'opponent')]
    ];

    const chronology = [...state.events]
      .filter(event => event.team !== 'system')
      .reverse()
      .map(event => `
        <tr>
          <td>${escapeHtml(event.time)}</td>
          <td>${escapeHtml(event.type)}</td>
          <td>${escapeHtml(event.playerName || '')}</td>
          <td>${escapeHtml(event.team === 'breda' ? club : opponent)}</td>
        </tr>
      `).join('');

    return `
      <div class="report">
        <header>
          ${logoSrc ? `<img src="${logoSrc}" alt="Logo ${escapeHtml(club)}">` : ''}
          <div>
            <h1>${escapeHtml(brandTitle)}</h1>
            <h2>REPORT STATISTICHE PARTITA</h2>
          </div>
        </header>

        <div class="line"></div>

        <section class="meta">
          <strong>${escapeHtml(state.selected.Squadra)}</strong>
          <span>${escapeHtml(state.selected.Campionato)} · ${escapeHtml(state.selected.Giornata)}</span>
          <span>${escapeHtml(formatDate(state.selected.Data))} · ${escapeHtml(state.selected.Sede)}</span>
        </section>

        <section class="scorebox">
          <div>${escapeHtml(homeName)}</div>
          <strong>${state.score.home} - ${state.score.away}</strong>
          <div>${escapeHtml(awayName)}</div>
        </section>

        <h3>STATISTICHE DI SQUADRA</h3>
        <table>
          <thead>
            <tr><th>Voce</th><th>${escapeHtml(club)}</th><th>${escapeHtml(opponent)}</th></tr>
          </thead>
          <tbody>
            ${teamStats.map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}
          </tbody>
        </table>

        <h3>STATISTICHE GIOCATORI</h3>
        <table>
          <thead>
            <tr><th>Giocatore</th><th>Gol</th><th>Assist</th><th>Gialli</th><th>Rossi</th></tr>
          </thead>
          <tbody>
            ${playerRows.length
              ? playerRows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.gol}</td><td>${row.assist}</td><td>${row.ammonizioni}</td><td>${row.espulsioni}</td></tr>`).join('')
              : '<tr><td colspan="5">Nessun evento individuale registrato.</td></tr>'}
          </tbody>
        </table>

        <h3>CRONOLOGIA EVENTI</h3>
        <table>
          <thead>
            <tr><th>Minuto</th><th>Evento</th><th>Giocatore</th><th>Squadra</th></tr>
          </thead>
          <tbody>
            ${chronology || '<tr><td colspan="4">Nessun evento registrato.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function createPdfReport() {
    try {
      const reportWindow = window.open('', '_blank');
      if (!reportWindow) {
        throw new Error('Il browser ha bloccato la finestra del PDF.');
      }

      const primary = getComputedStyle(document.documentElement)
        .getPropertyValue('--granata')
        .trim() || '#741f35';

      reportWindow.document.open();
      reportWindow.document.write(`
        <!doctype html>
        <html lang="it">
        <head>
          <meta charset="utf-8">
          <title>Report Match ${escapeHtml(state.selected?.Squadra || '')}</title>
          <style>
            *{box-sizing:border-box}
            body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
            .report{width:190mm;margin:0 auto;padding:12mm}
            header{display:flex;align-items:center;justify-content:center;gap:16px;text-align:left}
            header img{width:25mm;height:25mm;object-fit:contain}
            h1{margin:0;color:${primary};font-size:22px}
            h2{margin:4px 0 0;color:${primary};font-size:16px}
            .line{height:2px;background:${primary};margin:10px 0 14px}
            .meta{display:grid;gap:4px;text-align:center;margin-bottom:16px}
            .meta strong{color:${primary};font-size:18px}
            .meta span{color:#555}
            .scorebox{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;border:1px solid #d9d9d9;border-radius:12px;padding:14px;text-align:center;margin-bottom:18px}
            .scorebox strong{font-size:30px;color:${primary}}
            h3{margin:18px 0 8px;color:${primary};font-size:15px}
            table{width:100%;border-collapse:collapse;font-size:11px}
            th,td{border:1px solid #d9d9d9;padding:7px;text-align:left}
            th{background:#f3f3f3;color:${primary}}
            td:nth-child(n+2),th:nth-child(n+2){text-align:center}
            @page{size:A4;margin:8mm}
            @media print{
              .report{width:auto;margin:0;padding:0}
            }
          </style>
        </head>
        <body>
          ${printableReportHtml()}
          <script>
            window.addEventListener('load', function(){
              setTimeout(function(){ window.print(); }, 250);
            });
          <\/script>
        </body>
        </html>
      `);
      reportWindow.document.close();
    } catch (error) {
      saveMessage(`Errore PDF: ${error.message}`, 'error');
    }
  }

  async function saveMatch() {
    if (!state.selected) return;

    if (!state.finished || state.period !== 4) {
      saveMessage('Il Match può essere salvato solo dopo aver premuto Fine partita.', 'error');
      renderSaveAvailability();
      return;
    }

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
      $('#match20AfterSaveActions')?.classList.remove('hidden');
      await loadReportArchive();
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

    $('#matchBackHomeBtn')?.addEventListener('click', goHome);
    $('#match20HomeBtn')?.addEventListener('click', goHome);
    $('#match20PdfBtn')?.addEventListener('click', createPdfReport);
    $('#match20RefreshArchiveBtn')?.addEventListener('click', loadReportArchive);

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

      const reportButton = event.target.closest('[data-match20-report-index]');
      if (reportButton) openArchivedReport(reportButton.dataset.match20ReportIndex);
    });
  }

  async function open() {
    showScreen('matchCenterScreen');
    $('#match20SetupCard').classList.remove('hidden');
    $('#match20LiveArea').classList.add('hidden');
    await Promise.all([loadCallups(), loadReportArchive()]);
  }

  bind();

  return Object.freeze({
    open,
    clock,
    isStoppage: ms => ms >= 45 * 60 * 1000
  });
})();
