window.TeamCenterConvocazioni = (() => {
  const $ = selector => document.querySelector(selector);

  const ROLE_ORDER = [
    'Allenatore',
    'Viceallenatore',
    'Preparatore atletico',
    'Preparatore portieri',
    'Dirigente',
    'Direttore'
  ];

  const state = {
    master: {},
    logo: '',
    teams: [],
    players: [],
    staff: [],
    history: [],
    selectedPlayers: new Set(),
    selectedStaff: new Set(),
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

  function fullName(item) {
    return `${item.Cognome || ''} ${item.Nome || ''}`.trim();
  }

  function isActive(item) {
    return String(item.Attivo || 'SI').trim().toUpperCase() !== 'NO';
  }

  function teamName(team) {
    return team.NomeSquadra || team.Squadra || team.Nome || team.IDSquadra || 'Squadra';
  }

  function homeAddress() {
    return [
      state.master.Campo || 'Campo di casa',
      state.master.Indirizzo || ''
    ].filter(Boolean).join(' · ');
  }

  function meetingTime(kickoff) {
    if (!kickoff) return '';
    const [hours, minutes] = kickoff.split(':').map(Number);
    let total = hours * 60 + minutes - 105;
    while (total < 0) total += 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  async function open() {
    setToday();
    bindOnce();
    await loadBaseData();
    await loadPlayers();
    renderHistory();
  }

  function bindOnce() {
    if (state.initialized) return;
    state.initialized = true;

    $('#callupTeamSelect')?.addEventListener('change', async () => {
      state.selectedPlayers.clear();
      await loadPlayers();
    });

    $('#callupKickoffInput')?.addEventListener('input', updateMeeting);
    $('#callupVenueSelect')?.addEventListener('change', renderVenue);
    $('#callupPlayerSearch')?.addEventListener('input', renderPlayers);

    $('#callupPlayersList')?.addEventListener('change', event => {
      const checkbox = event.target.closest('[data-player-id]');
      if (!checkbox) return;
      if (checkbox.checked) state.selectedPlayers.add(checkbox.dataset.playerId);
      else state.selectedPlayers.delete(checkbox.dataset.playerId);
      updateCounts();
    });

    $('#callupStaffList')?.addEventListener('change', event => {
      const checkbox = event.target.closest('[data-staff-id]');
      if (!checkbox) return;
      if (checkbox.checked) state.selectedStaff.add(checkbox.dataset.staffId);
      else state.selectedStaff.delete(checkbox.dataset.staffId);
      updateCounts();
    });

    $('#callupSelectAllPlayers')?.addEventListener('click', () => {
      state.players.forEach(player => state.selectedPlayers.add(String(player.IDGiocatore || '')));
      renderPlayers();
      updateCounts();
    });

    $('#callupClearPlayers')?.addEventListener('click', () => {
      state.selectedPlayers.clear();
      renderPlayers();
      updateCounts();
    });

    $('#callupPreviewBtn')?.addEventListener('click', () => {
      if (!validate()) return;
      renderPreview();
      $('#callupPreviewCard')?.classList.remove('hidden');
      $('#callupPreviewCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#callupSaveBtn')?.addEventListener('click', saveCallup);
    $('#callupResetBtn')?.addEventListener('click', resetForm);
    $('#callupImageBtn')?.addEventListener('click', () => exportImage(false));
    $('#callupShareBtn')?.addEventListener('click', () => exportImage(true));
    $('#callupPdfBtn')?.addEventListener('click', exportPdf);
  }

  function setToday() {
    const input = $('#callupDateInput');
    if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
  }

  async function loadBaseData() {
    setMessage('');

    try {
      const [master, logo, teams, staff, history] = await Promise.all([
        window.TeamCenterAPI.getMaster(),
        window.TeamCenterAPI.getLogo().catch(() => null),
        window.TeamCenterAPI.getSquadre(),
        window.TeamCenterAPI.getStaff(),
        window.TeamCenterAPI.getConvocazioni().catch(() => [])
      ]);

      state.master = master || {};
      state.logo = logo?.dataUrl || '';
      state.teams = Array.isArray(teams) ? teams : [];
      state.staff = (Array.isArray(staff) ? staff : []).filter(isActive);
      state.history = Array.isArray(history) ? history : [];

      renderTeams();
      renderStaff();
      renderVenue();
    } catch (error) {
      setMessage(error.message || 'Impossibile caricare i dati.', true);
    }
  }

  function renderTeams() {
    const select = $('#callupTeamSelect');
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
    const loading = $('#callupPlayersLoading');
    const list = $('#callupPlayersList');

    if (loading) {
      loading.classList.remove('hidden');
      loading.textContent = 'Caricamento giocatori…';
    }
    if (list) list.innerHTML = '';

    try {
      const teamId = $('#callupTeamSelect')?.value || '';
      const players = await window.TeamCenterAPI.getGiocatori(teamId);
      state.players = (Array.isArray(players) ? players : [])
        .filter(isActive)
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'it', { sensitivity: 'base' }));

      loading?.classList.add('hidden');
      renderPlayers();
      updateCounts();
    } catch (error) {
      state.players = [];
      if (loading) {
        loading.classList.remove('hidden');
        loading.textContent = error.message || 'Impossibile caricare i giocatori.';
      }
      updateCounts();
    }
  }

  function renderPlayers() {
    const list = $('#callupPlayersList');
    if (!list) return;

    const query = String($('#callupPlayerSearch')?.value || '').trim().toLowerCase();
    const players = state.players.filter(player =>
      !query || fullName(player).toLowerCase().includes(query)
    );

    if (!players.length) {
      list.innerHTML = '<div class="callup-empty">Nessun giocatore disponibile.</div>';
      return;
    }

    list.innerHTML = players.map(player => {
      const id = String(player.IDGiocatore || '');
      return `<label class="callup-check-card">
        <input type="checkbox" data-player-id="${escapeHtml(id)}" ${state.selectedPlayers.has(id) ? 'checked' : ''}>
        <span class="callup-check-mark">✓</span>
        <span class="callup-check-copy">
          <strong>${escapeHtml(fullName(player))}</strong>
          <small>Anno ${escapeHtml(player.Anno || '—')}</small>
        </span>
      </label>`;
    }).join('');
  }

  function renderStaff() {
    const loading = $('#callupStaffLoading');
    const box = $('#callupStaffList');

    loading?.classList.add('hidden');
    if (!box) return;

    if (!state.staff.length) {
      box.innerHTML = '<div class="callup-empty">Nessun componente attivo.</div>';
      return;
    }

    box.innerHTML = ROLE_ORDER.map(role => {
      const items = state.staff
        .filter(item => String(item.Ruolo || '') === role)
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'it', { sensitivity: 'base' }));

      if (!items.length) return '';

      return `<div class="callup-staff-group">
        <h3>${escapeHtml(role)}</h3>
        <div class="callup-check-list">
          ${items.map(item => {
            const id = String(item.IDStaff || '');
            return `<label class="callup-check-card">
              <input type="checkbox" data-staff-id="${escapeHtml(id)}" ${state.selectedStaff.has(id) ? 'checked' : ''}>
              <span class="callup-check-mark">✓</span>
              <span class="callup-check-copy"><strong>${escapeHtml(fullName(item))}</strong></span>
            </label>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    updateCounts();
  }

  function updateCounts() {
    $('#callupPlayersCount').textContent = `${state.selectedPlayers.size} selezionati`;
    $('#callupStaffCount').textContent = `${state.selectedStaff.size} selezionati`;
  }

  function updateMeeting() {
    $('#callupMeetingInput').value = meetingTime($('#callupKickoffInput').value);
  }

  function renderVenue() {
    const away = $('#callupVenueSelect').value === 'TRASFERTA';
    $('#callupAwayAddressField').classList.toggle('hidden', !away);
    $('#callupHomeAddress').classList.toggle('hidden', away);
    $('#callupHomeAddress').textContent = `Campo di casa: ${homeAddress()}`;
  }

  function selectedPlayers() {
    return state.players.filter(player =>
      state.selectedPlayers.has(String(player.IDGiocatore || ''))
    );
  }

  function selectedStaff() {
    return state.staff
      .filter(item => state.selectedStaff.has(String(item.IDStaff || '')))
      .sort((a, b) => {
        const roleDifference = ROLE_ORDER.indexOf(a.Ruolo) - ROLE_ORDER.indexOf(b.Ruolo);
        return roleDifference || fullName(a).localeCompare(fullName(b), 'it');
      });
  }

  function selectedTeam() {
    const id = $('#callupTeamSelect').value;
    return state.teams.find(team => String(team.IDSquadra || '') === id) || {};
  }

  function buildData() {
    updateMeeting();
    const venue = $('#callupVenueSelect').value;

    return {
      idSquadra: $('#callupTeamSelect').value,
      squadra: teamName(selectedTeam()),
      campionato: $('#callupCompetitionInput').value.trim(),
      giornata: $('#callupRoundInput').value.trim(),
      data: $('#callupDateInput').value,
      avversario: $('#callupOpponentInput').value.trim(),
      orarioPartita: $('#callupKickoffInput').value,
      orarioConvocazione: $('#callupMeetingInput').value,
      sede: venue,
      indirizzo: venue === 'CASA' ? homeAddress() : $('#callupAwayAddressInput').value.trim(),
      giocatori: selectedPlayers(),
      staff: selectedStaff()
    };
  }

  function validate() {
    const data = buildData();

    if (!data.idSquadra) return fail('Seleziona la squadra.');
    if (!data.campionato) return fail('Inserisci il campionato.', '#callupCompetitionInput');
    if (!data.giornata) return fail('Inserisci la giornata.', '#callupRoundInput');
    if (!data.data) return fail('Inserisci la data.', '#callupDateInput');
    if (!data.avversario) return fail('Inserisci l’avversario.', '#callupOpponentInput');
    if (!data.orarioPartita) return fail('Inserisci l’orario della partita.', '#callupKickoffInput');
    if (data.sede === 'TRASFERTA' && !data.indirizzo) {
      return fail('Inserisci l’indirizzo della trasferta.', '#callupAwayAddressInput');
    }
    if (!data.giocatori.length) return fail('Seleziona almeno un giocatore.');

    setMessage('');
    return true;
  }

  function fail(message, selector) {
    setMessage(message, true);
    if (selector) $(selector)?.focus();
    return false;
  }

  function setMessage(message, error = false) {
    const box = $('#callupMessage');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('error', error);
  }

  function formatDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(`${value}T12:00:00`));
  }

  function renderPreview() {
    const data = buildData();
    const split = Math.ceil(data.giocatori.length / 2);
    const left = data.giocatori.slice(0, split);
    const right = data.giocatori.slice(split);

    const rows = Array.from({ length: Math.max(left.length, right.length) }, (_, index) => {
      const first = left[index];
      const second = right[index];
      return `<div class="callup-preview-num">${first ? index + 1 : ''}</div>
        <div class="callup-preview-name">${first ? escapeHtml(fullName(first)) : ''}</div>
        <div class="callup-preview-num">${second ? split + index + 1 : ''}</div>
        <div class="callup-preview-name">${second ? escapeHtml(fullName(second)) : ''}</div>`;
    }).join('');

    const staffRows = data.staff.length
      ? data.staff.map(item =>
          `<div class="callup-preview-staff-role">${escapeHtml(item.Ruolo || '')}</div>
           <div class="callup-preview-staff-name">${escapeHtml(fullName(item))}</div>`
        ).join('')
      : '<div class="callup-preview-staff-role">Staff</div><div class="callup-preview-staff-name">—</div>';

    $('#callupPreview').innerHTML = `
      <div class="callup-preview-sheet callup-preview-sheet-white">
        <div class="callup-preview-header-white">
          <div class="callup-preview-header-inner">
            <div class="callup-preview-logo-white">
              ${state.logo ? `<img src="${state.logo}" alt="Logo società">` : ''}
            </div>
            <div class="callup-preview-title-block">
              <strong>${escapeHtml(state.master.NomeSocieta || 'CSV Breda')}</strong>
              <span>CONVOCAZIONE</span>
            </div>
          </div>
          <div class="callup-preview-header-line"></div>
        </div>

        <div class="callup-preview-match callup-preview-match-white">
          <strong>${escapeHtml(data.squadra)}</strong>
          <span>${escapeHtml(data.campionato)} · ${escapeHtml(data.giornata)}</span>
          <h3>${escapeHtml(state.master.NomeSocieta || '')} – ${escapeHtml(data.avversario)}</h3>
        </div>

        <div class="callup-preview-info callup-preview-info-white">
          <div><small>DATA</small><strong>${escapeHtml(formatDate(data.data))}</strong></div>
          <div><small>PARTITA</small><strong>${escapeHtml(data.orarioPartita)}</strong></div>
          <div><small>CONVOCAZIONE</small><strong>${escapeHtml(data.orarioConvocazione)}</strong></div>
        </div>

        <div class="callup-preview-address callup-preview-address-white">
          <strong>${escapeHtml(data.sede)}</strong>
          <span>${escapeHtml(data.indirizzo)}</span>
        </div>

        <div class="callup-preview-title">GIOCATORI CONVOCATI</div>
        <div class="callup-preview-table-head">
          <span>N.</span><span>GIOCATORE</span><span>N.</span><span>GIOCATORE</span>
        </div>
        <div class="callup-preview-players callup-preview-players-white">${rows}</div>

        <div class="callup-preview-title">STAFF</div>
        <div class="callup-preview-staff-head"><span>RUOLO</span><span>NOME</span></div>
        <div class="callup-preview-staff callup-preview-staff-white">${staffRows}</div>
      </div>`;
  }

  async function saveCallup() {
    if (!validate()) return;

    const button = $('#callupSaveBtn');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvataggio…';

    try {
      const data = buildData();
      const saved = await window.TeamCenterAPI.saveConvocazione({
        idSquadra: data.idSquadra,
        squadra: data.squadra,
        campionato: data.campionato,
        giornata: data.giornata,
        data: data.data,
        avversario: data.avversario,
        orarioPartita: data.orarioPartita,
        orarioConvocazione: data.orarioConvocazione,
        sede: data.sede,
        indirizzo: data.indirizzo,
        giocatori: JSON.stringify(data.giocatori.map(player => ({
          id: player.IDGiocatore,
          cognome: player.Cognome,
          nome: player.Nome,
          anno: player.Anno
        }))),
        staff: JSON.stringify(data.staff.map(item => ({
          id: item.IDStaff,
          cognome: item.Cognome,
          nome: item.Nome,
          ruolo: item.Ruolo
        })))
      });

      state.history.push(saved);
      renderHistory();
      renderPreview();
      $('#callupPreviewCard').classList.remove('hidden');
      setMessage('Convocazione salvata su Google Sheets.');
    } catch (error) {
      setMessage(error.message || 'Salvataggio non riuscito.', true);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function renderHistory() {
    const box = $('#callupHistory');
    if (!box) return;

    const items = [...state.history].slice(-10).reverse();

    if (!items.length) {
      box.innerHTML = '<div class="callup-empty">Nessuna convocazione salvata.</div>';
      return;
    }

    box.innerHTML = items.map(item => `
      <article class="callup-history-card">
        <div>
          <strong>${escapeHtml(item.Squadra || item.IDSquadra || 'Squadra')} – ${escapeHtml(item.Avversario || '')}</strong>
          <span>${escapeHtml(formatDate(item.Data))} · ${escapeHtml(item.OrarioPartita || '')}</span>
        </div>
        <small>${escapeHtml(item.Giornata || '')}</small>
      </article>
    `).join('');
  }

  function resetForm() {
    if (!confirm('Svuotare la convocazione corrente?')) return;

    $('#callupCompetitionInput').value = '';
    $('#callupRoundInput').value = '';
    $('#callupOpponentInput').value = '';
    $('#callupKickoffInput').value = '';
    $('#callupMeetingInput').value = '';
    $('#callupVenueSelect').value = 'CASA';
    $('#callupAwayAddressInput').value = '';
    $('#callupPlayerSearch').value = '';
    setToday();

    state.selectedPlayers.clear();
    state.selectedStaff.clear();

    renderVenue();
    renderPlayers();
    renderStaff();
    updateCounts();
    $('#callupPreviewCard').classList.add('hidden');
    setMessage('');
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  async function buildCanvas() {
    if (!validate()) throw new Error('validation');

    const data = buildData();
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;

    const ctx = canvas.getContext('2d');
    const primary = state.master.ColorePrimario || '#741f35';
    const ink = '#202124';
    const muted = '#666970';
    const line = '#d9dce1';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const logoBox = 150;
    const textWidth = 470;
    const headerGap = 28;
    const headerWidth = logoBox + headerGap + textWidth;
    const headerX = (canvas.width - headerWidth) / 2;
    const headerY = 54;

    if (state.logo) {
      try {
        const logo = await loadImage(state.logo);
        const scale = Math.min(logoBox / logo.width, logoBox / logo.height);
        const logoW = logo.width * scale;
        const logoH = logo.height * scale;
        ctx.drawImage(
          logo,
          headerX + (logoBox - logoW) / 2,
          headerY + (logoBox - logoH) / 2,
          logoW,
          logoH
        );
      } catch (error) {}
    }

    ctx.fillStyle = primary;
    ctx.textAlign = 'left';
    ctx.font = '900 54px Arial';
    ctx.fillText(
      String(state.master.NomeSocieta || 'CSV BREDA').toUpperCase(),
      headerX + logoBox + headerGap,
      headerY + 66
    );
    ctx.font = '900 34px Arial';
    ctx.fillText('CONVOCAZIONE', headerX + logoBox + headerGap, headerY + 116);

    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(70, 235);
    ctx.lineTo(1170, 235);
    ctx.stroke();

    let y = 305;

    ctx.fillStyle = ink;
    ctx.font = '900 36px Arial';
    ctx.fillText(data.squadra, 70, y);

    y += 48;
    ctx.fillStyle = muted;
    ctx.font = '700 25px Arial';
    ctx.fillText(`${data.campionato} · ${data.giornata}`, 70, y);

    y += 68;
    ctx.fillStyle = primary;
    ctx.font = '900 42px Arial';
    ctx.fillText(`${state.master.NomeSocieta || ''} - ${data.avversario}`, 70, y);

    y += 82;
    const info = [
      ['DATA', formatDate(data.data)],
      ['PARTITA', data.orarioPartita],
      ['CONVOCAZIONE', data.orarioConvocazione]
    ];

    info.forEach((item, index) => {
      const x = 70 + index * 375;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x, y, 340, 108, 16);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = muted;
      ctx.font = '800 18px Arial';
      ctx.fillText(item[0], x + 22, y + 33);

      ctx.fillStyle = ink;
      ctx.font = '900 31px Arial';
      ctx.fillText(item[1], x + 22, y + 77);
    });

    y += 145;

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 70, y, 1100, 82, 16);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = primary;
    ctx.font = '900 22px Arial';
    ctx.fillText(data.sede, 92, y + 31);

    ctx.fillStyle = ink;
    ctx.font = '700 23px Arial';
    ctx.fillText(data.indirizzo, 92, y + 62);

    y += 130;

    ctx.fillStyle = primary;
    ctx.font = '900 27px Arial';
    ctx.fillText('GIOCATORI CONVOCATI', 70, y);

    y += 38;
    ctx.font = '900 18px Arial';
    ctx.fillText('N.', 88, y);
    ctx.fillText('GIOCATORE', 135, y);
    ctx.fillText('N.', 645, y);
    ctx.fillText('GIOCATORE', 692, y);

    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, y + 14);
    ctx.lineTo(1170, y + 14);
    ctx.stroke();

    y += 32;

    const split = Math.ceil(data.giocatori.length / 2);
    const left = data.giocatori.slice(0, split);
    const right = data.giocatori.slice(split);
    const rows = Math.max(left.length, right.length);
    const rowHeight = 52;

    for (let index = 0; index < rows; index += 1) {
      const rowY = y + index * rowHeight;
      const first = left[index];
      const second = right[index];

      ctx.fillStyle = primary;
      ctx.font = '900 21px Arial';
      if (first) ctx.fillText(String(index + 1), 88, rowY + 32);
      if (second) ctx.fillText(String(split + index + 1), 645, rowY + 32);

      ctx.fillStyle = ink;
      ctx.font = '800 21px Arial';
      if (first) ctx.fillText(fullName(first), 135, rowY + 32);
      if (second) ctx.fillText(fullName(second), 692, rowY + 32);

      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(70, rowY + rowHeight - 2);
      ctx.lineTo(1170, rowY + rowHeight - 2);
      ctx.stroke();
    }

    y += rows * rowHeight + 68;

    ctx.fillStyle = primary;
    ctx.font = '900 27px Arial';
    ctx.fillText('STAFF', 70, y);

    y += 38;
    ctx.font = '900 18px Arial';
    ctx.fillText('RUOLO', 88, y);
    ctx.fillText('NOME', 400, y);

    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, y + 14);
    ctx.lineTo(1170, y + 14);
    ctx.stroke();

    y += 32;

    const staff = data.staff.length
      ? data.staff
      : [{ Ruolo: 'Staff', Cognome: '—', Nome: '' }];

    staff.forEach((item, index) => {
      const rowY = y + index * 50;

      ctx.fillStyle = primary;
      ctx.font = '900 20px Arial';
      ctx.fillText(item.Ruolo || '', 88, rowY + 31);

      ctx.fillStyle = ink;
      ctx.font = '800 21px Arial';
      ctx.fillText(fullName(item), 400, rowY + 31);

      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(70, rowY + 48);
      ctx.lineTo(1170, rowY + 48);
      ctx.stroke();
    });

    return canvas;
  }

  function canvasToBlob(canvas, type = 'image/png', quality = 0.94) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  function fileBase() {
    const slug = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    const data = buildData();
    return `convocazione-${slug(data.squadra)}-${slug(data.avversario)}-${data.data}`;
  }

  async function downloadBlob(blob, filename, share = false) {
    const file = new File([blob], filename, { type: blob.type });

    if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Convocazione' });
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function exportImage(share) {
    try {
      const canvas = await buildCanvas();
      const blob = await canvasToBlob(canvas);
      await downloadBlob(blob, `${fileBase()}.png`, share);
    } catch (error) {
      if (error.name !== 'AbortError' && error.message !== 'validation') {
        setMessage('Impossibile creare o condividere la foto.', true);
      }
    }
  }

  function dataUrlBytes(dataUrl) {
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
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
    imageObject.set(imageHeader, 0);
    imageObject.set(jpegBytes, imageHeader.length);
    imageObject.set(imageFooter, imageHeader.length + jpegBytes.length);
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

    for (let index = 1; index < offsets.length; index += 1) {
      xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(encoder.encode(xref));

    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function exportPdf() {
    try {
      const canvas = await buildCanvas();
      const jpeg = canvas.toDataURL('image/jpeg', 0.93);
      const pdf = createPdf(dataUrlBytes(jpeg), canvas.width, canvas.height);
      await downloadBlob(pdf, `${fileBase()}.pdf`);
    } catch (error) {
      if (error.message !== 'validation') {
        setMessage('Impossibile creare il PDF.', true);
      }
    }
  }

  return Object.freeze({ open });
})();
