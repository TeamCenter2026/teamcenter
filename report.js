(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function showScreen(name) {
    $$('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `${name}Screen`));
    $('#bottomNav')?.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function adminToken() {
    return sessionStorage.getItem('teamcenterAdminToken') || '';
  }

  function setMessage(message, error = false) {
    const element = $('#trainingReportMessage');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(error));
  }

  function teamId(team) {
    return String(team?.IDSquadra || team?.idSquadra || '').trim();
  }

  function teamName(team) {
    return String(team?.NomeSquadra || team?.Squadra || team?.Nome || teamId(team) || 'Squadra').trim();
  }

  async function verifyAdmin() {
    const token = adminToken();
    if (!token) throw new Error('Sessione amministratore mancante. Accedi nuovamente.');
    await window.TeamCenterAPI.verificaSessioneAdmin(token);
    return token;
  }

  async function openAdminMenu() {
    try {
      await verifyAdmin();
      showScreen('adminMenu');
    } catch (error) {
      sessionStorage.removeItem('teamcenterAdminToken');
      showScreen('adminLogin');
    }
  }

  async function openTrainingReport() {
    try {
      await verifyAdmin();
      showScreen('trainingReport');
      setMessage('');
      const summary = $('#trainingReportSummary');
      summary?.classList.add('hidden');
      await loadTeams();
      setDefaultDates();
    } catch (error) {
      sessionStorage.removeItem('teamcenterAdminToken');
      showScreen('adminLogin');
    }
  }

  async function loadTeams() {
    const select = $('#trainingReportTeamSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Caricamento squadre…</option>';
    const teams = await window.TeamCenterAPI.getSquadre();
    const list = Array.isArray(teams) ? teams : [];
    select.innerHTML = '<option value="">Seleziona squadra</option>' + list.map(team =>
      `<option value="${escapeHtml(teamId(team))}">${escapeHtml(teamName(team))}</option>`
    ).join('');
    const current = window.TeamCenterTeam?.id || '';
    if (current && list.some(team => teamId(team) === current)) select.value = current;
  }

  function setDefaultDates() {
    const to = $('#trainingReportToInput');
    const from = $('#trainingReportFromInput');
    const today = new Date();
    if (to && !to.value) to.value = today.toISOString().slice(0, 10);
    if (from && !from.value) {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      from.value = start.toISOString().slice(0, 10);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function downloadBase64File(result) {
    const binary = atob(result.base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: result.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.nomeFile || 'Report_Allenamenti.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function renderSummary(summary) {
    const box = $('#trainingReportSummary');
    if (!box || !summary) return;
    box.innerHTML = `
      <div class="training-report-summary-title">Report generato</div>
      <div class="training-report-kpis">
        <div><span>Allenamenti</span><strong>${escapeHtml(summary.allenamenti)}</strong></div>
        <div><span>Media presenze</span><strong>${escapeHtml(summary.mediaPresenze)}</strong></div>
        <div><span>Giocatore più presente</span><strong>${escapeHtml(summary.giocatorePiuPresente || '—')}</strong></div>
        <div><span>Presenza migliore</span><strong>${escapeHtml(summary.percentualeMigliore || '—')}</strong></div>
      </div>`;
    box.classList.remove('hidden');
  }

  async function generate() {
    const button = $('#generateTrainingReportBtn');
    const idSquadra = $('#trainingReportTeamSelect')?.value || '';
    const dal = $('#trainingReportFromInput')?.value || '';
    const al = $('#trainingReportToInput')?.value || '';

    if (!idSquadra) return setMessage('Seleziona una squadra.', true);
    if (!dal || !al) return setMessage('Indica la data iniziale e finale.', true);
    if (dal > al) return setMessage('La data iniziale non può essere successiva a quella finale.', true);

    const oldText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Generazione Excel in corso…';
    }
    setMessage('Elaborazione degli allenamenti e creazione del file Excel…');

    try {
      const token = await verifyAdmin();
      const result = await window.TeamCenterAPI.generateTrainingReport({ idSquadra, dal, al }, token);
      if (!result?.base64) throw new Error('Il file Excel non è stato ricevuto.');
      downloadBase64File(result);
      renderSummary(result.riepilogo);
      setMessage(`File creato: ${result.nomeFile}`);
    } catch (error) {
      setMessage(error.message || 'Impossibile generare il report.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || '📥 Genera Excel';
      }
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-admin-target]')?.dataset.adminTarget;
    if (target === 'menu') openAdminMenu();
    if (target === 'training-report') openTrainingReport();
    if (target === 'profile') showScreen('profile');
  });

  $('#generateTrainingReportBtn')?.addEventListener('click', generate);

  window.TeamCenterReport = Object.freeze({ openAdminMenu, openTrainingReport });
})();
