window.TeamCenterAllenamenti = (() => {
  const $ = selector => document.querySelector(selector);

  const STATUS_OPTIONS = [
    { value: '', label: 'Seleziona stato' },
    { value: 'Presente', label: 'Presente' },
    { value: 'Assente', label: 'Assente' },
    { value: 'Giustificato', label: 'Giustificato' },
    { value: 'Infortunato', label: 'Infortunato' }
  ];

  const state = {
    teams: [],
    players: [],
    history: [],
    statuses: new Map(),
    initialized: false
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fullName(player) {
    return `${player.Cognome || ''} ${player.Nome || ''}`.trim();
  }

  function teamName(team) {
    return team.NomeSquadra || team.Squadra || team.Nome || team.IDSquadra || 'Squadra';
  }

  function isActive(player) {
    return String(player.Attivo || 'SI').trim().toUpperCase() !== 'NO';
  }

  async function open() {
    bindOnce();
    await loadBaseData();
    await loadPlayers();
    renderHistory();
  }

  function bindOnce() {
    if (state.initialized) return;
    state.initialized = true;

    $('#trainingTeamSelect')?.addEventListener('change', async () => {
      state.statuses.clear();
      await loadPlayers();
    });

    $('#trainingPlayerSearch')?.addEventListener('input', renderPlayers);

    $('#trainingPlayersList')?.addEventListener('change', event => {
      const select = event.target.closest('[data-training-player]');
      if (!select) return;
      state.statuses.set(select.dataset.trainingPlayer, select.value);
      updateSummary();
    });

    $('#trainingSetAllPresent')?.addEventListener('click', () => {
      state.players.forEach(player => {
        state.statuses.set(String(player.IDGiocatore || ''), 'Presente');
      });
      renderPlayers();
      updateSummary();
    });

    $('#trainingClearAll')?.addEventListener('click', () => {
      state.statuses.clear();
      renderPlayers();
      updateSummary();
    });

    $('#saveTrainingBtn')?.addEventListener('click', saveTraining);
  }

  async function loadBaseData() {
    setMessage('');
    try {
      const [teams, history] = await Promise.all([
        window.TeamCenterAPI.getSquadre(),
        window.TeamCenterAPI.getAllenamenti().catch(() => [])
      ]);

      state.teams = Array.isArray(teams) ? teams : [];
      state.history = Array.isArray(history) ? history : [];
      renderTeams();
    } catch (error) {
      setMessage(error.message || 'Impossibile caricare i dati.', true);
    }
  }

  function renderTeams() {
    const select = $('#trainingTeamSelect');
    if (!select) return;

    const current = select.value;
    select.innerHTML = state.teams.map(team =>
      `<option value="${escapeHtml(team.IDSquadra || '')}">${escapeHtml(teamName(team))}</option>`
    ).join('');

    if (current && state.teams.some(team => String(team.IDSquadra || '') === current)) {
      select.value = current;
    }
  }

  async function loadPlayers() {
    const loading = $('#trainingLoading');
    const empty = $('#trainingEmpty');
    const list = $('#trainingPlayersList');

    if (loading) {
      loading.classList.remove('hidden');
      loading.textContent = 'Caricamento giocatori…';
    }

    empty?.classList.add('hidden');
    if (list) list.innerHTML = '';

    try {
      const teamId = $('#trainingTeamSelect')?.value || '';
      const players = await window.TeamCenterAPI.getGiocatori(teamId);
      state.players = (Array.isArray(players) ? players : [])
        .filter(isActive)
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'it', { sensitivity: 'base' }));

      if (loading) loading.classList.add('hidden');
      renderPlayers();
      updateSummary();
    } catch (error) {
      state.players = [];
      if (loading) {
        loading.classList.remove('hidden');
        loading.textContent = error.message || 'Impossibile caricare i giocatori.';
      }
      updateSummary();
    }
  }

  function renderPlayers() {
    const list = $('#trainingPlayersList');
    const empty = $('#trainingEmpty');
    if (!list) return;

    const query = String($('#trainingPlayerSearch')?.value || '').trim().toLowerCase();
    const players = state.players.filter(player => !query || fullName(player).toLowerCase().includes(query));

    if (!players.length) {
      list.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }

    empty?.classList.add('hidden');

    list.innerHTML = players.map(player => {
      const id = String(player.IDGiocatore || '');
      const current = state.statuses.get(id) || '';

      return `<article class="training-player-row">
        <div class="training-player-copy">
          <strong>${escapeHtml(fullName(player))}</strong>
          <span>Anno ${escapeHtml(player.Anno || '—')}</span>
        </div>
        <select class="training-status-select ${statusClass(current)}" data-training-player="${escapeHtml(id)}">
          ${STATUS_OPTIONS.map(option =>
            `<option value="${escapeHtml(option.value)}" ${option.value === current ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
          ).join('')}
        </select>
      </article>`;
    }).join('');
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'presente') return 'is-present';
    if (value === 'assente') return 'is-absent';
    if (value === 'giustificato') return 'is-justified';
    if (value === 'infortunato') return 'is-injured';
    return 'is-unset';
  }

  function updateSummary() {
    const counts = {
      Presente: 0,
      Assente: 0,
      Giustificato: 0,
      Infortunato: 0,
      unset: 0
    };

    state.players.forEach(player => {
      const status = state.statuses.get(String(player.IDGiocatore || '')) || '';
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      else counts.unset += 1;
    });

    $('#trainingPlayersCount').textContent = `${state.players.length} ${state.players.length === 1 ? 'giocatore' : 'giocatori'}`;
    $('#trainingPresentCount').textContent = counts.Presente;
    $('#trainingAbsentCount').textContent = counts.Assente;
    $('#trainingJustifiedCount').textContent = counts.Giustificato;
    $('#trainingInjuredCount').textContent = counts.Infortunato;
    $('#trainingUnsetCount').textContent = counts.unset;
  }

  function selectedTeam() {
    const id = $('#trainingTeamSelect')?.value || '';
    return state.teams.find(team => String(team.IDSquadra || '') === id) || {};
  }

  function buildPayload() {
    const team = selectedTeam();

    const presenze = state.players.map(player => ({
      id: player.IDGiocatore || '',
      cognome: player.Cognome || '',
      nome: player.Nome || '',
      anno: player.Anno || '',
      stato: state.statuses.get(String(player.IDGiocatore || '')) || ''
    }));

    return {
      idSquadra: $('#trainingTeamSelect')?.value || '',
      squadra: teamName(team),
      seduta: $('#trainingSessionSelect')?.value || 'Allenamento 1',
      presenze
    };
  }

  function validate() {
    const payload = buildPayload();

    if (!payload.idSquadra) {
      setMessage('Seleziona la squadra.', true);
      return false;
    }

    if (!payload.presenze.length) {
      setMessage('Nessun giocatore disponibile per questa squadra.', true);
      return false;
    }

    const missing = payload.presenze.filter(item => !item.stato);
    if (missing.length) {
      setMessage(`Assegna uno stato a tutti i giocatori. Mancano ${missing.length} selezioni.`, true);
      return false;
    }

    setMessage('');
    return true;
  }

  async function saveTraining() {
    if (!validate()) return;

    const button = $('#saveTrainingBtn');
    const oldText = button.textContent;

    button.disabled = true;
    button.textContent = 'Salvataggio…';

    try {
      const payload = buildPayload();
      const saved = await window.TeamCenterAPI.saveAllenamento({
        idSquadra: payload.idSquadra,
        squadra: payload.squadra,
        seduta: payload.seduta,
        presenze: JSON.stringify(payload.presenze)
      });

      state.history.push(saved);
      renderHistory();
      setMessage('Allenamento salvato su Google Sheets.');
    } catch (error) {
      setMessage(error.message || 'Salvataggio non riuscito.', true);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function renderHistory() {
    const box = $('#trainingHistory');
    if (!box) return;

    const items = [...state.history].slice(-10).reverse();

    if (!items.length) {
      box.innerHTML = '<div class="training-empty">Nessun allenamento salvato.</div>';
      return;
    }

    box.innerHTML = items.map(item => {
      const counts = countSavedStatuses(item.Presenze);
      return `<article class="training-history-card">
        <div>
          <strong>${escapeHtml(item.Squadra || item.IDSquadra || 'Squadra')} · ${escapeHtml(item.Seduta || '')}</strong>
          <span>${counts.presenti} presenti · ${counts.assenti} assenti · ${counts.giustificati} giustificati · ${counts.infortunati} infortunati</span>
        </div>
        <small>${escapeHtml(formatTimestamp(item.UltimoAggiornamento))}</small>
      </article>`;
    }).join('');
  }

  function countSavedStatuses(raw) {
    let items = [];
    try {
      items = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch (error) {
      items = [];
    }

    return {
      presenti: items.filter(item => item.stato === 'Presente').length,
      assenti: items.filter(item => item.stato === 'Assente').length,
      giustificati: items.filter(item => item.stato === 'Giustificato').length,
      infortunati: items.filter(item => item.stato === 'Infortunato').length
    };
  }

  function formatTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function setMessage(message, error = false) {
    const box = $('#trainingMessage');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('error', error);
  }

  return Object.freeze({ open });
})();
