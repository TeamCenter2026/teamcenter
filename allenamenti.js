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
    setToday();
    bindOnce();
    await loadBaseData();
    await loadPlayers();
    renderHistory();
  }

  function setToday() {
    const input = $('#trainingDateInput');
    if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
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

    $('#trainingHistory')?.addEventListener('click', event => {
      const button = event.target.closest('[data-training-pdf-index]');
      if (!button) return;
      const index = Number(button.dataset.trainingPdfIndex);
      const items = filteredHistory();
      const item = items[index];
      if (item) exportTrainingPdf(item, button);
    });
  }

  async function loadBaseData() {
    setMessage('');
    try {
      const [teams, history] = await Promise.all([
        window.TeamCenterAPI.getSquadre(),
        window.TeamCenterAPI.getAllenamenti().catch(() => [])
      ]);

      const allTeams = Array.isArray(teams) ? teams : [];
      window.TeamCenterTeam?.setTeams(allTeams);
      const currentTeam = window.TeamCenterTeam?.current();
      state.teams = currentTeam ? [currentTeam] : allTeams;
      state.history = window.TeamCenterTeam?.filter(history) || [];
      renderTeams();
    } catch (error) {
      setMessage(error.message || 'Impossibile caricare i dati.', true);
    }
  }

  function renderTeams() {
    const select = $('#trainingTeamSelect');
    if (!select) return;

    const current = window.TeamCenterTeam?.id || select.value;
    select.innerHTML = state.teams.map(team =>
      `<option value="${escapeHtml(team.IDSquadra || '')}">${escapeHtml(teamName(team))}</option>`
    ).join('');

    if (current && state.teams.some(team => String(team.IDSquadra || '') === current)) select.value = current;
    select.disabled = state.teams.length <= 1;
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
      seduta: $('#trainingDateInput')?.value || '',
      presenze
    };
  }

  function validate() {
    const payload = buildPayload();

    if (!payload.idSquadra) {
      setMessage('Seleziona la squadra.', true);
      return false;
    }

    if (!payload.seduta) {
      setMessage('Inserisci la data dell’allenamento.', true);
      $('#trainingDateInput')?.focus();
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

  function filteredHistory() {
    return (window.TeamCenterTeam?.filter(state.history) || [...state.history]).slice(-10).reverse();
  }

  function renderHistory() {
    const box = $('#trainingHistory');
    if (!box) return;

    const items = filteredHistory();

    if (!items.length) {
      box.innerHTML = '<div class="training-empty">Nessun allenamento salvato.</div>';
      return;
    }

    box.innerHTML = items.map((item, index) => {
      const counts = countSavedStatuses(item.Presenze);
      const trainingDate = item.DataAllenamento || item.Seduta || '';
      return `<article class="training-history-card">
        <div class="training-history-copy">
          <strong>${escapeHtml(item.Squadra || item.IDSquadra || 'Squadra')} · ${escapeHtml(formatTrainingDate(trainingDate))}</strong>
          <span>${counts.presenti} presenti · ${counts.assenti} assenti · ${counts.giustificati} giustificati · ${counts.infortunati} infortunati</span>
          <small>${escapeHtml(formatTimestamp(item.UltimoAggiornamento))}</small>
        </div>
        <button class="btn btn-secondary training-history-pdf" type="button" data-training-pdf-index="${index}">📄 Ricrea PDF</button>
      </article>`;
    }).join('');
  }

  function parsePresenze(raw) {
    try {
      return Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch (error) {
      return [];
    }
  }

  function formatTrainingDate(value) {
    if (!value) return '';
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(`${text}T12:00:00`));
  }

  function safeFilePart(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file';
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  function dataUrlBytes(dataUrl) {
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function createPdf(jpegBytes, imageWidth, imageHeight) {
    const encoder = new TextEncoder();
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const scale = Math.min((pageWidth - 20) / imageWidth, (pageHeight - 20) / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;
    const objects = [];
    const addText = text => objects.push(encoder.encode(text));
    addText('<< /Type /Catalog /Pages 2 0 R >>');
    addText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    addText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`);
    const content = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`;
    addText(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const imageHeader = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    const imageFooter = encoder.encode('\nendstream');
    const imageObject = new Uint8Array(imageHeader.length + jpegBytes.length + imageFooter.length);
    imageObject.set(imageHeader, 0); imageObject.set(jpegBytes, imageHeader.length); imageObject.set(imageFooter, imageHeader.length + jpegBytes.length);
    objects.push(imageObject);
    const chunks = [encoder.encode('%PDF-1.4\n')];
    const offsets = [0];
    let offset = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(offset);
      const prefix = encoder.encode(`${index + 1} 0 obj\n`);
      const suffix = encoder.encode('\nendobj\n');
      chunks.push(prefix, object, suffix);
      offset += prefix.length + object.length + suffix.length;
    });
    const xrefOffset = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function buildTrainingCanvas(item) {
    const presenze = parsePresenze(item.Presenze);
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    const primary = '#741f35';
    const ink = '#202124';
    const muted = '#666970';
    const line = '#d9dce1';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = primary;
    ctx.textAlign = 'center';
    ctx.font = '900 54px Arial';
    ctx.fillText('CSV BREDA', 620, 95);
    ctx.font = '900 34px Arial';
    ctx.fillText('REPORT ALLENAMENTO', 620, 145);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(70, 190); ctx.lineTo(1170, 190); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.font = '900 38px Arial';
    ctx.fillText(item.Squadra || item.IDSquadra || 'Squadra', 70, 255);
    ctx.fillStyle = primary;
    ctx.font = '900 30px Arial';
    ctx.fillText(`Data allenamento: ${formatTrainingDate(item.DataAllenamento || item.Seduta || '')}`, 70, 305);
    const counts = countSavedStatuses(item.Presenze);
    const summary = [
      ['PRESENTI', counts.presenti], ['ASSENTI', counts.assenti],
      ['GIUSTIFICATI', counts.giustificati], ['INFORTUNATI', counts.infortunati]
    ];
    summary.forEach((entry, index) => {
      const x = 70 + (index % 2) * 555;
      const y = 355 + Math.floor(index / 2) * 95;
      ctx.fillStyle = '#fff'; roundRect(ctx, x, y, 520, 74, 14); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = muted; ctx.font = '700 20px Arial'; ctx.fillText(entry[0], x + 20, y + 29);
      ctx.fillStyle = ink; ctx.font = '900 28px Arial'; ctx.fillText(String(entry[1]), x + 430, y + 46);
    });
    let y = 580;
    ctx.fillStyle = primary; ctx.font = '900 27px Arial'; ctx.fillText('GIOCATORE', 88, y);
    ctx.fillText('STATO', 875, y);
    y += 28;
    ctx.strokeStyle = primary; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(1170, y); ctx.stroke();
    y += 42;
    ctx.font = '700 23px Arial';
    presenze.forEach((player, index) => {
      if (y > 1660) return;
      ctx.fillStyle = ink;
      ctx.fillText(`${index + 1}. ${(player.cognome || '')} ${(player.nome || '')}`.trim(), 88, y);
      ctx.fillStyle = primary;
      ctx.font = '900 22px Arial';
      ctx.fillText(player.stato || '—', 875, y);
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(70, y + 18); ctx.lineTo(1170, y + 18); ctx.stroke();
      ctx.font = '700 23px Arial';
      y += 48;
    });
    return canvas;
  }

  async function exportTrainingPdf(item, button) {
    const oldText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Creazione…'; }
    try {
      const canvas = buildTrainingCanvas(item);
      const jpeg = canvas.toDataURL('image/jpeg', 0.93);
      const pdf = createPdf(dataUrlBytes(jpeg), canvas.width, canvas.height);
      const date = item.DataAllenamento || item.Seduta || 'allenamento';
      downloadBlob(pdf, `CSV-Breda_${safeFilePart(item.Squadra || item.IDSquadra)}_${safeFilePart(date)}.pdf`);
      setMessage('PDF allenamento ricreato.');
    } catch (error) {
      setMessage('Impossibile ricreare il PDF dell’allenamento.', true);
    } finally {
      if (button) { button.disabled = false; button.textContent = oldText; }
    }
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
