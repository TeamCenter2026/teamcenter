(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function showScreen(name) {
    $$('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `${name}Screen`));
    $('#bottomNav')?.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function adminToken() { return sessionStorage.getItem('teamcenterAdminToken') || ''; }

  function setMessage(message, error = false) {
    const element = $('#trainingReportMessage');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(error));
  }

  function teamId(team) { return String(team?.IDSquadra || team?.idSquadra || '').trim(); }
  function teamName(team) { return String(team?.NomeSquadra || team?.Squadra || team?.Nome || teamId(team) || 'Squadra').trim(); }

  async function verifyAdmin() {
    const token = adminToken();
    if (!token) throw new Error('Sessione amministratore mancante. Accedi nuovamente.');
    await window.TeamCenterAPI.verificaSessioneAdmin(token);
    return token;
  }

  async function openAdminMenu() {
    try { await verifyAdmin(); showScreen('adminMenu'); }
    catch (_) { sessionStorage.removeItem('teamcenterAdminToken'); showScreen('adminLogin'); }
  }

  async function openTrainingReport() {
    try {
      await verifyAdmin();
      showScreen('trainingReport');
      setMessage('');
      $('#trainingReportSummary')?.classList.add('hidden');
      await loadTeams();
      setDefaultDates();
    } catch (_) {
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

  function requireXlsx() {
    if (!window.XLSX?.utils?.book_new) {
      throw new Error('Motore Excel non caricato. Aggiorna la pagina e riprova.');
    }
    return window.XLSX;
  }

  function addSheet(workbook, name, rows, widths = []) {
    const XLSX = requireXlsx();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    if (widths.length) worksheet['!cols'] = widths.map(width => ({ wch: width }));
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
    return worksheet;
  }

  function createWorkbook(result) {
    const XLSX = requireXlsx();
    const workbook = XLSX.utils.book_new();
    const r = result.riepilogo || {};

    addSheet(workbook, 'Riepilogo', [
      ['TEAMCENTER · REPORT ALLENAMENTI'],
      [],
      ['Società', r.societa || ''],
      ['Stagione', r.stagione || ''],
      ['Squadra', r.squadra || ''],
      ['Periodo', `${r.dalItaliano || r.dal || ''} - ${r.alItaliano || r.al || ''}`],
      [],
      ['Indicatore', 'Valore'],
      ['Allenamenti svolti', Number(r.allenamenti || 0)],
      ['Media presenze', Number(r.mediaPresenzeNumero || 0)],
      ['Giocatore più presente', r.giocatorePiuPresente || '—'],
      ['Migliore percentuale presenza', Number(r.percentualeMiglioreNumero || 0)]
    ], [34, 28]);
    const wsR = workbook.Sheets['Riepilogo'];
    if (wsR?.B12) wsR.B12.z = '0.00%';

    const dettaglio = [['Data', 'ID Allenamento', 'ID Giocatore', 'Cognome', 'Nome', 'Anno', 'Stato']];
    (result.dettaglio || []).forEach(item => dettaglio.push([
      item.DataItaliana || item.Data || '', item.IDAllenamento || '', item.IDGiocatore || '',
      item.Cognome || '', item.Nome || '', item.Anno || '', item.Stato || ''
    ]));
    addSheet(workbook, 'Dettaglio presenze', dettaglio, [13, 18, 18, 22, 22, 10, 16]);

    const statistiche = [['ID Giocatore', 'Cognome', 'Nome', 'Anno', 'Sedute registrate', 'Presenze', 'Assenze', 'Giustificate', 'Infortuni', '% presenza']];
    (result.statistiche || []).forEach(item => statistiche.push([
      item.IDGiocatore || '', item.Cognome || '', item.Nome || '', item.Anno || '',
      Number(item.SeduteRegistrate || 0), Number(item.Presenze || 0), Number(item.Assenze || 0),
      Number(item.Giustificate || 0), Number(item.Infortuni || 0), Number(item.PercentualePresenza || 0)
    ]));
    const wsS = addSheet(workbook, 'Statistiche giocatori', statistiche, [18, 22, 22, 10, 18, 12, 12, 14, 12, 14]);
    for (let row = 2; row <= statistiche.length; row += 1) {
      if (wsS[`J${row}`]) wsS[`J${row}`].z = '0.00%';
    }

    const cronologia = [['Data', 'ID Allenamento', 'Presenti', 'Assenti', 'Giustificati', 'Infortunati', 'Totale giocatori']];
    (result.cronologia || []).forEach(item => cronologia.push([
      item.DataItaliana || item.Data || '', item.IDAllenamento || '', Number(item.Presenti || 0),
      Number(item.Assenti || 0), Number(item.Giustificati || 0), Number(item.Infortunati || 0), Number(item.TotaleGiocatori || 0)
    ]));
    addSheet(workbook, 'Cronologia', cronologia, [13, 18, 12, 12, 14, 14, 16]);

    return workbook;
  }

  function downloadWorkbook(result) {
    const XLSX = requireXlsx();
    const workbook = createWorkbook(result);
    XLSX.writeFile(workbook, result.nomeFile || 'Report_Allenamenti.xlsx', { compression: true });
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
    if (button) { button.disabled = true; button.textContent = 'Generazione Excel in corso…'; }
    setMessage('Elaborazione degli allenamenti e creazione del file Excel…');

    try {
      const token = await verifyAdmin();
      const result = await window.TeamCenterAPI.generateTrainingReport({ idSquadra, dal, al }, token);
      if (!result?.riepilogo || !Array.isArray(result?.statistiche)) throw new Error('Dati del report non validi.');
      downloadWorkbook(result);
      renderSummary(result.riepilogo);
      setMessage(`File creato: ${result.nomeFile}`);
    } catch (error) {
      setMessage(error.message || 'Impossibile generare il report.', true);
    } finally {
      if (button) { button.disabled = false; button.textContent = oldText || '📥 Genera Excel'; }
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
