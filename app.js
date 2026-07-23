(() => {
  const STORAGE_KEY = 'team-center-v6-profile-callups-fixed';
  const LEGACY_STORAGE_KEYS = ['csv-breda-match-center-v5-convocazioni-onepage','csv-breda-match-center-v4-home-convocazioni'];
  const playerNumbers = Array.from({length:20}, (_,i)=>String(i+1));
  const emptyState = () => ({
    version:1,
    screen:'home',
    logoDataUrl:'',
    profile:{clubName:'CSV Breda',primaryColor:'#741f35',backgroundColor:'#f6f7f9'},
    training:{teamId:'PRIMA',date:'',presentIds:[]},
    callup:{competition:'',round:'',date:'',opponent:'',kickoff:'',meeting:'',meetingDayOffset:0,venue:'home',address:'',coach:'',manager1:'',manager2:'',sportingDirector:'',players:Array.from({length:20},(_,i)=>({number:i+1,name:'',selected:false}))},
    match:{team:'Prima Squadra',competition:'',season:'2026/2027',round:'',opponent:'',venue:'home',date:'',kickoff:''},
    score:{home:0,away:0},
    bredaSide:'home',
    actionTeam:'breda',
    period:0,
    timer:{running:false,startedAt:null,elapsedMs:0,half:1,firstHalfMs:0,secondHalfMs:0},
    events:[],
    finished:false
  });
  let state = loadState();
  let squadreApi = [];
  let masterApi = null;
  let rosaApi = [];
  let rosterTeamId = '';
  let staffApi = [];
  let tickHandle = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function loadState(){
    try{
      let raw=localStorage.getItem(STORAGE_KEY);
      if(!raw){
        for(const key of LEGACY_STORAGE_KEYS){
          raw=localStorage.getItem(key);
          if(raw)break;
        }
      }
      const saved=raw?JSON.parse(raw):null;
      if(!saved)return emptyState();
      const base=emptyState();
      const savedPlayers=Array.isArray(saved.callup?.players)?saved.callup.players:[];
      const players=base.callup.players.map((p,i)=>({...p,...(savedPlayers[i]||{})}));
      return {...base,...saved,profile:{...base.profile,...saved.profile},training:{...base.training,...saved.training,presentIds:Array.isArray(saved.training?.presentIds)?saved.training.presentIds:[]},callup:{...base.callup,...saved.callup,players},match:{...base.match,...saved.match},timer:{...base.timer,...saved.timer}};
    }catch(e){ return emptyState(); }
  }
  function saveState(){ try{localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}catch(e){} }
  function shadeHex(hex,percent){
    const clean=String(hex||'#741f35').replace('#','');
    const n=parseInt(clean,16),amt=Math.round(2.55*percent);
    const r=Math.max(0,Math.min(255,(n>>16)+amt)),g=Math.max(0,Math.min(255,((n>>8)&255)+amt)),b=Math.max(0,Math.min(255,(n&255)+amt));
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function clubName(){return state.profile?.clubName?.trim()||'CSV Breda'}
  function applyProfile(){
    const primary=state.profile?.primaryColor||'#741f35',bg=state.profile?.backgroundColor||'#f6f7f9';
    document.documentElement.style.setProperty('--granata',primary);
    document.documentElement.style.setProperty('--granata-dark',shadeHex(primary,-28));
    document.documentElement.style.setProperty('--granata-soft',shadeHex(primary,83));
    document.documentElement.style.setProperty('--bg',bg);
    const title=$('#appTitle');if(title)title.textContent=`${clubName().toUpperCase()} | TEAM CENTER`;
    const homeLogo=$('#homeClubLogo');
    if(homeLogo){
      homeLogo.innerHTML=state.logoDataUrl
        ? `<img src="${state.logoDataUrl}" alt="Logo ufficiale ${escapeHtml(clubName())}">`
        : '<span class="home-logo-placeholder">CSV</span>';
    }
    document.title=`${clubName()} Team Center`;
    const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.setAttribute('content',primary);
  }
  function fillProfile(){
    const master=masterApi||state.master||{};
    const values={
      name:master.NomeSocieta||state.profile.clubName||'CSV Breda',
      season:master.Stagione||state.match.season||'',
      field:master.Campo||'',
      address:master.Indirizzo||'',
      primary:master.ColorePrimario||state.profile.primaryColor||'#741f35',
      secondary:master.ColoreSecondario||state.profile.backgroundColor||'#f6f7f9',
      updatedAt:master.UltimoAggiornamento||master.ultimoAggiornamento||''
    };
    const name=$('#profileNamePreview');if(name)name.textContent=values.name;
    const logo=$('#profileLogoPreview');if(logo)logo.innerHTML=state.logoDataUrl?`<img src="${state.logoDataUrl}" alt="Logo ufficiale ${escapeHtml(values.name)}">`:'<div class="logo-placeholder">LOGO</div>';
    const clubInput=$('#profileClubNameInput');if(clubInput)clubInput.value=values.name;
    const seasonInput=$('#profileSeasonInput');if(seasonInput)seasonInput.value=values.season;
    const fieldInput=$('#profileFieldInput');if(fieldInput)fieldInput.value=values.field;
    const addressInput=$('#profileAddressInput');if(addressInput)addressInput.value=values.address;
    const primaryInput=$('#profilePrimaryColorInput');if(primaryInput)primaryInput.value=values.primary;
    const secondaryInput=$('#profileSecondaryColorInput');if(secondaryInput)secondaryInput.value=values.secondary;
    const primaryValue=$('#profilePrimaryColorValue');if(primaryValue)primaryValue.value=values.primary.toUpperCase();
    const secondaryValue=$('#profileSecondaryColorValue');if(secondaryValue)secondaryValue.value=values.secondary.toUpperCase();
    const primaryName=$('#profilePrimaryColorName');if(primaryName)primaryName.textContent=colorDisplayName(values.primary,'Colore primario');
    const secondaryName=$('#profileSecondaryColorName');if(secondaryName)secondaryName.textContent=colorDisplayName(values.secondary,'Colore secondario');
    const lastUpdate=$('#profileLastUpdate');if(lastUpdate)lastUpdate.textContent=formatProfileUpdate(values.updatedAt);
    const status=$('#profileCloudStatus');if(status)status.textContent=masterApi?'Google Sheets sincronizzato':'Configurazione locale: API non raggiungibile';
  }

  function colorDisplayName(hex,fallback){
    const value=String(hex||'').trim().toUpperCase();
    if(value==='#751D2D'||value==='#741F35')return 'Granata Breda';
    if(value==='#FFFFFF'||value==='#F6F7F9')return 'Bianco';
    return fallback;
  }
  function formatProfileUpdate(value){
    if(!value)return 'Non disponibile';
    const raw=String(value).trim();
    const parsed=new Date(raw);
    if(!Number.isNaN(parsed.getTime())){
      return new Intl.DateTimeFormat('it-IT',{dateStyle:'long',timeStyle:'short'}).format(parsed);
    }
    return raw;
  }
  function showProfileSaveConfirmation(message){
    const el=$('#profileSaveConfirmation');if(!el)return;
    el.textContent=message;el.classList.add('show');
    clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),2200);
  }


  function getAdminToken(){
    return sessionStorage.getItem('teamcenterAdminToken')||'';
  }

  function clearAdminToken(){
    sessionStorage.removeItem('teamcenterAdminToken');
  }

  async function apriProfiloAmministratore(){
    const token=getAdminToken();
    if(token){
      try{
        await window.TeamCenterAPI.verificaSessioneAdmin(token);
        fillProfile();
        showScreen('profile');
        return;
      }catch(error){
        clearAdminToken();
      }
    }
    const input=$('#adminPasswordInput');
    const message=$('#adminLoginMessage');
    if(input)input.value='';
    if(message)message.textContent='';
    showScreen('adminLogin');
    setTimeout(()=>input?.focus(),50);
  }

  async function loginAmministratore(event){
    event?.preventDefault();
    const input=$('#adminPasswordInput');
    const button=$('#adminLoginBtn');
    const message=$('#adminLoginMessage');
    const password=input?.value||'';
    if(!password){
      if(message)message.textContent='Inserisci la password.';
      input?.focus();
      return;
    }
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent='Accesso in corso…';}
    if(message)message.textContent='';
    try{
      const sessione=await window.TeamCenterAPI.loginAdmin(password);
      if(!sessione?.token)throw new Error('Token di sessione non ricevuto.');
      sessionStorage.setItem('teamcenterAdminToken',sessione.token);
      if(input)input.value='';
      fillProfile();
      showScreen('profile');
      toast('Accesso amministratore effettuato');
    }catch(error){
      clearAdminToken();
      if(message)message.textContent=error.message||'Password non corretta.';
    }finally{
      if(button){button.disabled=false;button.textContent=oldText||'Accedi';}
    }
  }

  async function logoutAmministratore(){
    const token=getAdminToken();
    clearAdminToken();
    try{
      if(token)await window.TeamCenterAPI.logoutAdmin(token);
    }catch(error){
      console.warn('Logout API non completato:',error);
    }
    showScreen('home');
    toast('Sessione amministratore chiusa');
  }

  async function salvaProfiloSocieta(event){
    event?.preventDefault();
    const button=$('#saveProfileBtn');
    if(!window.TeamCenterAPI?.saveMaster){toast('Funzione di salvataggio non disponibile');return;}
    const data={
      nomeSocieta:$('#profileClubNameInput')?.value.trim()||'',
      stagione:$('#profileSeasonInput')?.value.trim()||'',
      campo:$('#profileFieldInput')?.value.trim()||'',
      indirizzo:$('#profileAddressInput')?.value.trim()||'',
      colorePrimario:$('#profilePrimaryColorInput')?.value||'#741f35',
      coloreSecondario:$('#profileSecondaryColorInput')?.value||'#f6f7f9'
    };
    if(!data.nomeSocieta){toast('Inserisci il nome della società');$('#profileClubNameInput')?.focus();return;}
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent='Salvataggio in corso…';}
    const confirmation=$('#profileSaveConfirmation');if(confirmation)confirmation.classList.remove('show');
    const status=$('#profileCloudStatus');if(status)status.textContent='Sincronizzazione in corso…';
    try{
      const token=sessionStorage.getItem('teamcenterAdminToken')||'';
      if(!token){
        showScreen('adminLogin');
        throw new Error('Sessione amministratore scaduta. Accedi di nuovo.');
      }
      const saved=await window.TeamCenterAPI.saveMaster(data,token);
      masterApi=saved||{...data};
      state.master={...masterApi};
      state.profile.clubName=masterApi.NomeSocieta||data.nomeSocieta;
      state.profile.primaryColor=masterApi.ColorePrimario||data.colorePrimario;
      state.profile.backgroundColor=masterApi.ColoreSecondario||data.coloreSecondario;
      state.match.season=masterApi.Stagione||data.stagione;
      saveState();applyProfile();fillProfile();
      showProfileSaveConfirmation('✅ Profilo società aggiornato');
      toast('Profilo società aggiornato');
    }catch(error){
      console.error('Errore salvataggio profilo:',error);
      if(status)status.textContent='❌ Errore nel salvataggio';
      showProfileSaveConfirmation('❌ Salvataggio non riuscito');
      toast(error.message||'Impossibile salvare il profilo');
    }finally{
      if(button){button.disabled=false;button.textContent=oldText||'💾 Salva profilo società';}
    }
  }
  function toast(message){
    const el=$('#toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1500);
  }
  function createId(){ return (globalThis.crypto && typeof globalThis.crypto.randomUUID==='function') ? globalThis.crypto.randomUUID() : `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function escapeHtml(value=''){
    return String(value).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function formatClock(ms, includeBase=true){
    let safeMs=Math.max(0,Math.floor(ms));
    if(includeBase && state.timer.half===2) safeMs += 45*60*1000;
    const totalSec=Math.floor(safeMs/1000);
    const min=Math.floor(totalSec/60);
    const sec=totalSec%60;
    const cent=Math.floor((safeMs%1000)/10);
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}:${String(cent).padStart(2,'0')}`;
  }
  function currentHalfElapsed(){
    return state.timer.elapsedMs + (state.timer.running && state.timer.startedAt ? Date.now()-state.timer.startedAt : 0);
  }
  function eventMatchMinute(){
    const ms=currentHalfElapsed();
    const base=state.timer.half===2 ? 45*60*1000 : 0;
    const total=base+ms;
    const minute=Math.floor(total/60000);
    const second=Math.floor((total%60000)/1000);
    const threshold=state.timer.half===1 ? 45 : 90;
    if(minute>=threshold){
      const extraSec=Math.floor((ms-45*60*1000)/1000);
      return `${threshold}+${Math.floor(extraSec/60)}:${String(extraSec%60).padStart(2,'0')}`;
    }
    return `${minute}:${String(second).padStart(2,'0')}`;
  }
  function teamNames(){
    const opponent=state.match.opponent || 'Avversario';
    return state.bredaSide==='home' ? {home:clubName(),away:opponent} : {home:opponent,away:clubName()};
  }
  function bredaScore(){ return state.score[state.bredaSide]; }
  function opponentScore(){ return state.score[state.bredaSide==='home'?'away':'home']; }

  function renderLogo(){
    applyProfile();
    const html=state.logoDataUrl ? `<img src="${state.logoDataUrl}" alt="Logo ufficiale">` : `<div class="logo-placeholder">CARICA<br>LOGO<br>UFFICIALE</div>`;
    const headerLogo=$('#headerLogoBox');if(headerLogo)headerLogo.innerHTML=html;
    $('#setupLogoPreview').innerHTML=state.logoDataUrl ? `<img src="${state.logoDataUrl}" alt="Anteprima logo">` : `<div class="logo-placeholder">LOGO<br>CSV BREDA</div>`;
    const callupLogo=$('#callupLogoPreview');
    if(callupLogo)callupLogo.innerHTML=state.logoDataUrl ? `<img src="${state.logoDataUrl}" alt="Anteprima logo">` : `<div class="logo-placeholder">LOGO</div>`;
    const profileLogo=$('#profileLogoPreview');if(profileLogo)profileLogo.innerHTML=state.logoDataUrl?`<img src="${state.logoDataUrl}" alt="Logo">`:'<div class="logo-placeholder">LOGO</div>';
  }
  function aggiornaSelectSquadre(){
    const select=$('#teamSelect');
    if(!select||!Array.isArray(squadreApi)||!squadreApi.length)return;
    const valoreCorrente=state.match.team;
    select.innerHTML=squadreApi.map(squadra=>
      `<option value="${escapeHtml(squadra.NomeSquadra)}" data-id-squadra="${escapeHtml(squadra.IDSquadra)}">${escapeHtml(squadra.NomeSquadra)}</option>`
    ).join('');
    const esiste=squadreApi.some(s=>s.NomeSquadra===valoreCorrente);
    state.match.team=esiste?valoreCorrente:squadreApi[0].NomeSquadra;
    select.value=state.match.team;
    const trainingSelect=$('#trainingTeamSelect');
    if(trainingSelect){
      trainingSelect.innerHTML=squadreApi.map(squadra=>`<option value="${escapeHtml(squadra.IDSquadra)}">${escapeHtml(squadra.NomeSquadra)}</option>`).join('');
      const valid=squadreApi.some(s=>s.IDSquadra===state.training.teamId);
      state.training.teamId=valid?state.training.teamId:squadreApi[0].IDSquadra;
      trainingSelect.value=state.training.teamId;
    }
  }

  async function sincronizzaConfigurazioneApi(){
    if(!window.TeamCenterAPI)throw new Error('Configurazione API assente');

    let master;
    let squadre;
    let logo;

    if(window.TeamCenterBootstrap?.ready){
      const prefetched=await window.TeamCenterBootstrap.ready;
      master=prefetched?.master;
      squadre=prefetched?.teams;
      logo=prefetched?.logo;
    }

    if(!master){
      master=await window.TeamCenterAPI.getMaster();
    }

    if(!Array.isArray(squadre)||!squadre.length){
      squadre=await window.TeamCenterAPI.getSquadre();
    }

    if(!logo){
      logo=await window.TeamCenterAPI.getLogo().catch(error=>{
        console.warn('Logo non disponibile:',error);
        return null;
      });
    }

    masterApi=master||{};
    squadreApi=Array.isArray(squadre)?squadre:[];

    if(logo?.dataUrl){
      state.logoDataUrl=logo.dataUrl;
    }

    state.profile.clubName=masterApi.NomeSocieta||state.profile.clubName||'CSV Breda';
    state.profile.primaryColor=masterApi.ColorePrimario||state.profile.primaryColor||'#741f35';
    state.profile.backgroundColor=masterApi.ColoreSecondario||state.profile.backgroundColor||'#f6f7f9';
    state.match.season=masterApi.Stagione||state.match.season;
    state.master={...masterApi};

    aggiornaSelectSquadre();
    applyProfile();
    renderLogo();
    saveState();

    return {master:masterApi,squadre:squadreApi,logo};
  }

  async function loadTrainingPlayers(){
    const container=$('#trainingPlayers');
    if(!container)return;
    const teamId=$('#trainingTeamSelect')?.value||state.training.teamId;
    state.training.teamId=teamId;
    container.innerHTML='<div class="empty">Caricamento rosa…</div>';
    try{
      const players=await window.TeamCenterAPI.getGiocatori(teamId);
      const active=(Array.isArray(players)?players:[]).filter(p=>String(p.Attivo||'SI').toUpperCase()!=='NO');
      state.trainingPlayers=active;
      renderTrainingPlayers();
    }catch(error){
      console.error(error);
      state.trainingPlayers=[];
      container.innerHTML='<div class="empty">Impossibile caricare la rosa.</div>';
    }
  }
  function renderTrainingPlayers(){
    const container=$('#trainingPlayers');if(!container)return;
    const players=Array.isArray(state.trainingPlayers)?state.trainingPlayers:[];
    if(!players.length){container.innerHTML='<div class="empty">Nessun giocatore presente nella rosa.</div>';updateTrainingCount();return;}
    const present=new Set(state.training.presentIds||[]);
    container.innerHTML=players.map(p=>{
      const id=String(p.IDGiocatore||'');
      const selected=present.has(id);
      return `<button class="training-player ${selected?'present':''}" type="button" data-training-player="${escapeHtml(id)}"><span>${escapeHtml([p.Cognome,p.Nome].filter(Boolean).join(' '))}</span><span class="presence-mark">${selected?'✓':''}</span></button>`;
    }).join('');
    updateTrainingCount();
  }
  function updateTrainingCount(){
    const count=$('#trainingCount');if(count)count.textContent=`${(state.training.presentIds||[]).length} presenti`;
  }
  function fillTraining(){
    const today=new Date().toISOString().slice(0,10);
    if(!state.training.date)state.training.date=today;
    const date=$('#trainingDateInput');if(date)date.value=state.training.date;
    const select=$('#trainingTeamSelect');if(select&&state.training.teamId)select.value=state.training.teamId;
    loadTrainingPlayers();
  }


  function normalizzaStatoGiocatore(value){
    return String(value||'SI').trim().toUpperCase()==='NO'?'NO':'SI';
  }

  function nomeSquadraDaId(idSquadra){
    const squadra=squadreApi.find(item=>String(item.IDSquadra||'').trim()===String(idSquadra||'').trim());
    return squadra?.NomeSquadra||squadra?.Squadra||squadra?.Nome||idSquadra||'Squadra';
  }

  function popolaSelettoreRosa(){
    const select=$('#rosterTeamSelect');
    if(!select)return;
    const attive=(squadreApi||[]).filter(s=>String(s.Attiva||'SI').trim().toUpperCase()!=='NO');
    select.innerHTML=attive.map(s=>{
      const id=String(s.IDSquadra||'').trim();
      return `<option value="${escapeHtml(id)}">${escapeHtml(nomeSquadraDaId(id))}</option>`;
    }).join('');
    if(!rosterTeamId||!attive.some(s=>String(s.IDSquadra||'').trim()===rosterTeamId)){
      rosterTeamId=String(attive[0]?.IDSquadra||'').trim();
    }
    select.value=rosterTeamId;
  }

  async function apriRosa(){
    popolaSelettoreRosa();
    showScreen('roster');
    await caricaRosa();
  }

  async function caricaRosa(){
    const loading=$('#rosterLoading');
    const empty=$('#rosterEmpty');
    const list=$('#rosterList');
    if(loading){loading.classList.remove('hidden');loading.textContent='Caricamento rosa…';}
    if(empty)empty.classList.add('hidden');
    if(list)list.innerHTML='';
    try{
      rosterTeamId=$('#rosterTeamSelect')?.value||rosterTeamId||'';
      rosaApi=await window.TeamCenterAPI.getGiocatori(rosterTeamId);
      if(!Array.isArray(rosaApi))rosaApi=[];
      renderRosa();
    }catch(error){
      console.error('Errore caricamento rosa:',error);
      rosaApi=[];
      if(loading)loading.textContent=error.message||'Impossibile caricare la rosa.';
      aggiornaConteggioRosa([]);
    }
  }

  function giocatoriFiltrati(){
    const query=String($('#rosterSearchInput')?.value||'').trim().toLowerCase();
    const ordinati=[...rosaApi].sort((a,b)=>{
      const ac=`${a.Cognome||''} ${a.Nome||''}`.trim();
      const bc=`${b.Cognome||''} ${b.Nome||''}`.trim();
      return ac.localeCompare(bc,'it',{sensitivity:'base'});
    });
    if(!query)return ordinati;
    return ordinati.filter(g=>`${g.Cognome||''} ${g.Nome||''}`.toLowerCase().includes(query));
  }

  function aggiornaConteggioRosa(giocatori){
    const totale=Array.isArray(giocatori)?giocatori.length:0;
    const attivi=(giocatori||[]).filter(g=>normalizzaStatoGiocatore(g.Attivo)==='SI').length;
    const count=$('#rosterCount');
    const active=$('#rosterActiveCount');
    if(count)count.textContent=`${totale} ${totale===1?'giocatore':'giocatori'}`;
    if(active)active.textContent=`${attivi} attivi`;
  }

  function renderRosa(){
    const loading=$('#rosterLoading');
    const empty=$('#rosterEmpty');
    const list=$('#rosterList');
    if(loading)loading.classList.add('hidden');
    const giocatori=giocatoriFiltrati();
    aggiornaConteggioRosa(rosaApi);
    if(!list)return;
    if(!giocatori.length){
      list.innerHTML='';
      if(empty){
        empty.textContent=rosaApi.length?'Nessun giocatore trovato.':'Nessun giocatore presente.';
        empty.classList.remove('hidden');
      }
      return;
    }
    if(empty)empty.classList.add('hidden');
    list.innerHTML=giocatori.map(g=>{
      const id=String(g.IDGiocatore||'').trim();
      const attivo=normalizzaStatoGiocatore(g.Attivo)==='SI';
      const anno=String(g.Anno||'').trim()||'—';
      return `<article class="player-card ${attivo?'':'inactive'}">
        <div class="player-card-main">
          <strong>${escapeHtml(`${g.Cognome||''} ${g.Nome||''}`.trim())}</strong>
          <span>Anno ${escapeHtml(anno)}</span>
        </div>
        <div class="player-card-side">
          <span class="player-status ${attivo?'active':'inactive'}">${attivo?'Attivo':'Non attivo'}</span>
          <button class="player-edit-btn" type="button" data-edit-player="${escapeHtml(id)}">Modifica</button>
        </div>
      </article>`;
    }).join('');
  }

  function apriModuloGiocatore(giocatore=null){
    const panel=$('#playerFormPanel');
    const form=$('#playerForm');
    form?.reset();
    const editing=Boolean(giocatore);
    $('#playerIdInput').value=giocatore?.IDGiocatore||'';
    $('#playerLastNameInput').value=giocatore?.Cognome||'';
    $('#playerFirstNameInput').value=giocatore?.Nome||'';
    $('#playerYearInput').value=giocatore?.Anno||'';
    $('#playerActiveSelect').value=normalizzaStatoGiocatore(giocatore?.Attivo);
    $('#playerFormEyebrow').textContent=editing?'Modifica giocatore':'Nuovo giocatore';
    $('#playerFormTitle').textContent=editing?'Aggiorna giocatore':'Aggiungi giocatore';
    $('#savePlayerBtn').textContent=editing?'Salva modifiche':'Salva giocatore';
    $('#playerFormMessage').textContent='';
    panel?.classList.remove('hidden');
    setTimeout(()=>$('#playerLastNameInput')?.focus(),50);
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function chiudiModuloGiocatore(){
    $('#playerFormPanel')?.classList.add('hidden');
    $('#playerFormMessage').textContent='';
  }

  async function salvaGiocatoreDaForm(event){
    event?.preventDefault();
    const button=$('#savePlayerBtn');
    const message=$('#playerFormMessage');
    const data={
      idGiocatore:$('#playerIdInput')?.value.trim()||'',
      idSquadra:$('#rosterTeamSelect')?.value||rosterTeamId,
      cognome:$('#playerLastNameInput')?.value.trim()||'',
      nome:$('#playerFirstNameInput')?.value.trim()||'',
      anno:$('#playerYearInput')?.value.trim()||'',
      attivo:$('#playerActiveSelect')?.value||'SI'
    };
    if(!data.cognome||!data.nome||!data.anno){
      if(message)message.textContent='Compila cognome, nome e anno.';
      return;
    }
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent='Salvataggio…';}
    if(message)message.textContent='';
    try{
      await window.TeamCenterAPI.saveGiocatore(data);
      chiudiModuloGiocatore();
      await caricaRosa();
      toast(data.idGiocatore?'Giocatore aggiornato':'Giocatore aggiunto');
    }catch(error){
      if(message)message.textContent=error.message||'Salvataggio non riuscito.';
    }finally{
      if(button){button.disabled=false;button.textContent=oldText||'Salva giocatore';}
    }
  }


  const STAFF_ROLES = [
    'Allenatore',
    'Viceallenatore',
    'Preparatore atletico',
    'Preparatore portieri',
    'Dirigente',
    'Direttore'
  ];

  function normalizzaStatoStaff(value){
    return String(value||'SI').trim().toUpperCase()==='NO'?'NO':'SI';
  }

  async function apriStaff(){
    showScreen('staff');
    await caricaStaff();
  }

  async function caricaStaff(){
    const loading=$('#staffLoading');
    const empty=$('#staffEmpty');
    const list=$('#staffList');

    if(loading){
      loading.classList.remove('hidden');
      loading.textContent='Caricamento staff…';
    }
    if(empty)empty.classList.add('hidden');
    if(list)list.innerHTML='';

    try{
      staffApi=await window.TeamCenterAPI.getStaff();
      if(!Array.isArray(staffApi))staffApi=[];
      renderStaff();
    }catch(error){
      console.error('Errore caricamento staff:',error);
      staffApi=[];
      if(loading)loading.textContent=error.message||'Impossibile caricare lo staff.';
      aggiornaConteggioStaff([]);
    }
  }

  function staffFiltrato(){
    const query=String($('#staffSearchInput')?.value||'').trim().toLowerCase();
    const role=String($('#staffRoleFilter')?.value||'').trim();

    return [...staffApi]
      .filter(item=>!role||String(item.Ruolo||'').trim()===role)
      .filter(item=>{
        if(!query)return true;
        return `${item.Cognome||''} ${item.Nome||''}`.toLowerCase().includes(query);
      })
      .sort((a,b)=>{
        const ruoloA=STAFF_ROLES.indexOf(String(a.Ruolo||''));
        const ruoloB=STAFF_ROLES.indexOf(String(b.Ruolo||''));
        if(ruoloA!==ruoloB)return ruoloA-ruoloB;
        const ac=`${a.Cognome||''} ${a.Nome||''}`.trim();
        const bc=`${b.Cognome||''} ${b.Nome||''}`.trim();
        return ac.localeCompare(bc,'it',{sensitivity:'base'});
      });
  }

  function aggiornaConteggioStaff(elementi){
    const totale=Array.isArray(elementi)?elementi.length:0;
    const attivi=(elementi||[]).filter(item=>normalizzaStatoStaff(item.Attivo)==='SI').length;
    if($('#staffCount'))$('#staffCount').textContent=`${totale} ${totale===1?'componente':'componenti'}`;
    if($('#staffActiveCount'))$('#staffActiveCount').textContent=`${attivi} attivi`;
  }

  function renderStaff(){
    const loading=$('#staffLoading');
    const empty=$('#staffEmpty');
    const list=$('#staffList');
    if(loading)loading.classList.add('hidden');

    const elementi=staffFiltrato();
    aggiornaConteggioStaff(staffApi);

    if(!list)return;

    if(!elementi.length){
      list.innerHTML='';
      if(empty){
        empty.textContent=staffApi.length?'Nessun componente trovato.':'Nessun componente presente.';
        empty.classList.remove('hidden');
      }
      return;
    }

    if(empty)empty.classList.add('hidden');

    list.innerHTML=elementi.map(item=>{
      const id=String(item.IDStaff||'').trim();
      const attivo=normalizzaStatoStaff(item.Attivo)==='SI';
      return `<article class="staff-member-card ${attivo?'':'inactive'}">
        <div class="staff-member-main">
          <strong>${escapeHtml(`${item.Cognome||''} ${item.Nome||''}`.trim())}</strong>
          <span>${escapeHtml(item.Ruolo||'—')}</span>
        </div>
        <div class="staff-member-side">
          <span class="player-status ${attivo?'active':'inactive'}">${attivo?'Attivo':'Non attivo'}</span>
          <button class="player-edit-btn" type="button" data-edit-staff="${escapeHtml(id)}">Modifica</button>
        </div>
      </article>`;
    }).join('');
  }

  function apriModuloStaff(item=null){
    const panel=$('#staffFormPanel');
    $('#staffForm')?.reset();

    const editing=Boolean(item);
    $('#staffIdInput').value=item?.IDStaff||'';
    $('#staffLastNameInput').value=item?.Cognome||'';
    $('#staffFirstNameInput').value=item?.Nome||'';
    $('#staffRoleInput').value=item?.Ruolo||'';
    $('#staffActiveSelect').value=normalizzaStatoStaff(item?.Attivo);

    $('#staffFormEyebrow').textContent=editing?'Modifica componente':'Nuovo componente';
    $('#staffFormTitle').textContent=editing?'Aggiorna componente':'Aggiungi componente';
    $('#saveStaffBtn').textContent=editing?'Salva modifiche':'Salva componente';
    $('#staffFormMessage').textContent='';

    panel?.classList.remove('hidden');
    setTimeout(()=>$('#staffLastNameInput')?.focus(),50);
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function chiudiModuloStaff(){
    $('#staffFormPanel')?.classList.add('hidden');
    if($('#staffFormMessage'))$('#staffFormMessage').textContent='';
  }

  async function salvaStaffDaForm(event){
    event?.preventDefault();

    const button=$('#saveStaffBtn');
    const message=$('#staffFormMessage');

    const data={
      idStaff:$('#staffIdInput')?.value.trim()||'',
      cognome:$('#staffLastNameInput')?.value.trim()||'',
      nome:$('#staffFirstNameInput')?.value.trim()||'',
      ruolo:$('#staffRoleInput')?.value||'',
      attivo:$('#staffActiveSelect')?.value||'SI'
    };

    if(!data.cognome||!data.nome||!data.ruolo){
      if(message)message.textContent='Compila cognome, nome e ruolo.';
      return;
    }

    const oldText=button?.textContent;
    if(button){
      button.disabled=true;
      button.textContent='Salvataggio…';
    }
    if(message)message.textContent='';

    try{
      await window.TeamCenterAPI.saveStaff(data);
      chiudiModuloStaff();
      await caricaStaff();
      toast(data.idStaff?'Componente aggiornato':'Componente aggiunto');
    }catch(error){
      if(message)message.textContent=error.message||'Salvataggio non riuscito.';
    }finally{
      if(button){
        button.disabled=false;
        button.textContent=oldText||'Salva componente';
      }
    }
  }

  function fillSetup(){
    $('#teamSelect').value=state.match.team;
    $('#competitionInput').value=state.match.competition;
    $('#seasonInput').value=state.match.season;
    $('#roundInput').value=state.match.round;
    $('#opponentInput').value=state.match.opponent;
    $('#venueSelect').value=state.match.venue;
    $('#matchDateInput').value=state.match.date;
    $('#kickoffInput').value=state.match.kickoff;
    renderLogo();
  }
  function readSetup(){
    state.match={
      team:$('#teamSelect').value,
      competition:$('#competitionInput').value.trim(),
      season:$('#seasonInput').value.trim(),
      round:$('#roundInput').value.trim(),
      opponent:$('#opponentInput').value.trim(),
      venue:$('#venueSelect').value,
      date:$('#matchDateInput').value,
      kickoff:$('#kickoffInput').value
    };
    state.bredaSide=state.match.venue==='home'?'home':'away';
  }
  function showScreen(name){
    state.screen=name;
    $$('.screen').forEach(s=>s.classList.toggle('active',s.id===`${name}Screen`));
    $('#bottomNav').classList.toggle('hidden',name!=='live');
    saveState();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderScore(){
    const n=teamNames(); $('#homeName').textContent=n.home; $('#awayName').textContent=n.away;
    $('#homeScore').textContent=state.score.home; $('#awayScore').textContent=state.score.away;
    $('#liveMeta').textContent=[state.match.competition,state.match.round,state.match.team].filter(Boolean).join(' · ') || state.match.team;
  }
  function renderTimer(){
    const elapsed=currentHalfElapsed();
    let label='PARTITA NON INIZIATA',hint='Avvia il primo tempo quando l’arbitro fischia.',actions='';
    if(state.period===0){ actions=`<button class="btn btn-primary" data-timer="start-first">▶ Avvia 1° tempo</button>`; }
    if(state.period===1){
      label='1° TEMPO'; hint='Il timer continua oltre il 45° e mostra automaticamente il recupero.';
      actions=state.timer.running
        ? `<button class="btn btn-secondary" data-timer="pause">Ⅱ Pausa tecnica</button><button class="btn btn-dark" data-timer="end-first">■ Fine 1° tempo</button>`
        : `<button class="btn btn-primary" data-timer="resume">▶ Riprendi</button><button class="btn btn-dark" data-timer="end-first">■ Fine 1° tempo</button>`;
    }
    if(state.period===2){ label='INTERVALLO'; hint='Controlla risultato ed eventi, poi avvia il secondo tempo.'; actions=`<button class="btn btn-primary" data-timer="start-second">▶ Avvia 2° tempo</button>`; }
    if(state.period===3){
      label='2° TEMPO'; hint='Dopo il 90° viene mostrato automaticamente il recupero.';
      actions=state.timer.running
        ? `<button class="btn btn-secondary" data-timer="pause">Ⅱ Pausa tecnica</button><button class="btn btn-dark" data-timer="end-match">■ Fine partita</button>`
        : `<button class="btn btn-primary" data-timer="resume">▶ Riprendi</button><button class="btn btn-dark" data-timer="end-match">■ Fine partita</button>`;
    }
    if(state.period===4){ label='PARTITA TERMINATA'; hint='Genera il report finale della gara.'; actions=`<button class="btn btn-primary" data-timer="report">📄 Apri report finale</button>`; }
    $('#periodLabel').textContent=label;
    $('#timerHint').textContent=hint;
    $('#timerActions').innerHTML=actions;
    const displayMs = state.period===2 ? state.timer.firstHalfMs : elapsed;
    $('#timerDisplay').textContent = state.period===2 ? formatFixed(state.timer.firstHalfMs,0) : formatClock(displayMs,true);
    const extra=elapsed-45*60*1000;
    const activeHalf=state.period===1||state.period===3;
    $('#stoppageDisplay').textContent=activeHalf && extra>=0 ? `RECUPERO +${formatFixed(extra,0)}` : '';
  }
  function formatFixed(ms, baseMinutes=0){
    const safeMs=Math.max(0,Math.floor(ms))+baseMinutes*60*1000;
    const totalSec=Math.floor(safeMs/1000);
    const min=Math.floor(totalSec/60);
    const sec=totalSec%60;
    const cent=Math.floor((safeMs%1000)/10);
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}:${String(cent).padStart(2,'0')}`;
  }
  function pauseTimer(){
    if(!state.timer.running)return;
    state.timer.elapsedMs += Date.now()-state.timer.startedAt;
    state.timer.running=false; state.timer.startedAt=null; saveState(); renderTimer();
  }
  function startTimer(half){
    state.timer.half=half; state.timer.elapsedMs=0; state.timer.startedAt=Date.now(); state.timer.running=true;
    state.period=half===1?1:3; saveState(); renderAll();
  }
  function resumeTimer(){ state.timer.startedAt=Date.now();state.timer.running=true;saveState();renderTimer(); }
  function timerCommand(cmd){
    if(cmd==='start-first') startTimer(1);
    if(cmd==='start-second') startTimer(2);
    if(cmd==='pause') pauseTimer();
    if(cmd==='resume') resumeTimer();
    if(cmd==='end-first'){
      pauseTimer(); state.timer.firstHalfMs=state.timer.elapsedMs; state.period=2;
      addSystemEvent('Fine primo tempo',`Durata ${formatFixed(state.timer.firstHalfMs)}`); saveState(); renderAll();
    }
    if(cmd==='end-match'){
      pauseTimer(); state.timer.secondHalfMs=state.timer.elapsedMs; state.period=4; state.finished=true;
      addSystemEvent('Fine partita',`Durata 2° tempo ${formatFixed(state.timer.secondHalfMs)}`); saveState(); renderAll(); renderReport(); showScreen('report');
    }
    if(cmd==='report'){ renderReport(); showScreen('report'); }
  }
  function addSystemEvent(type,note){ state.events.unshift({id:createId(),type,team:'system',time:eventMatchMinute(),player:'',assist:'',note,createdAt:Date.now()}); }

  function currentTeamSide(){
    if(state.actionTeam==='breda') return state.bredaSide;
    return state.bredaSide==='home'?'away':'home';
  }
  function playerNumberOptions(includeNone=false){
    return `${includeNone?'<option value="">Nessuno / non indicato</option>':'<option value="">Seleziona il numero</option>'}${playerNumbers.map(number=>`<option value="${number}">N. ${number}</option>`).join('')}`;
  }
  function openEventDialog(type){
    $('#eventTypeInput').value=type; $('#modalTitle').textContent=`Registra ${type}`; $('#eventNoteInput').value='';
    const isBreda=state.actionTeam==='breda';
    const isGoal=type==='Goal'; const needsPlayer=['Ammonizione','Espulsione'].includes(type);
    $('#scorerField').classList.toggle('hidden',!isGoal||!isBreda);
    $('#assistField').classList.toggle('hidden',!isGoal||!isBreda);
    $('#playerField').classList.toggle('hidden',!needsPlayer);
    $('#playerFieldLabel').textContent=type==='Ammonizione'?'Numero del giocatore ammonito':type==='Espulsione'?'Numero del giocatore espulso':'Numero del giocatore';
    $('#scorerSelect').innerHTML=playerNumberOptions(false);
    $('#assistSelect').innerHTML=playerNumberOptions(true);
    $('#playerSelect').innerHTML=playerNumberOptions(false);
    $('#eventDialog').showModal();
  }
  function recordQuick(type){
    if(state.period===0||state.period===2||state.period===4){ toast('Avvia un tempo di gioco prima di registrare'); return; }
    if(['Goal','Ammonizione','Espulsione'].includes(type)){ openEventDialog(type); return; }
    state.events.unshift({id:createId(),type,team:state.actionTeam,time:eventMatchMinute(),player:'',assist:'',note:'',createdAt:Date.now()});
    saveState();renderAll();toast(`${type} registrata`);
  }
  function parsePlayer(value){ return {number:String(value||'')}; }
  function saveModalEvent(){
    const type=$('#eventTypeInput').value; const isBreda=state.actionTeam==='breda';
    let player={number:''},assist={number:''};
    if(type==='Goal'&&isBreda){
      player=parsePlayer($('#scorerSelect').value);
      assist=parsePlayer($('#assistSelect').value);
      if(!player.number){ toast('Seleziona il numero del marcatore'); return false; }
    }
    if(['Ammonizione','Espulsione'].includes(type)){
      player=parsePlayer($('#playerSelect').value);
      if(!player.number){ toast('Seleziona il numero di maglia'); return false; }
    }
    const side=currentTeamSide();
    if(type==='Goal') state.score[side]++;
    state.events.unshift({id:createId(),type,team:state.actionTeam,time:eventMatchMinute(),player,assist,note:$('#eventNoteInput').value.trim(),createdAt:Date.now()});
    saveState();renderAll();toast(`${type} registrato`);
    return true;
  }
  function deleteEvent(id){
    const ev=state.events.find(e=>e.id===id);
    if(!ev)return;
    if(ev.type==='Goal'){
      const side=ev.team==='breda'?state.bredaSide:(state.bredaSide==='home'?'away':'home');
      state.score[side]=Math.max(0,state.score[side]-1);
    }
    state.events=state.events.filter(e=>e.id!==id);saveState();renderAll();toast('Evento eliminato');
  }
  function eventLabel(ev){
    if(ev.team==='system') return {title:ev.type,sub:ev.note};
    const side=ev.team==='breda'?'CSV Breda':'Avversario';
    let detail=side;
    if(ev.player&&ev.player.number) detail+=` · N. ${ev.player.number}`;
    if(ev.assist&&ev.assist.number) detail+=` · Assist N. ${ev.assist.number}`;
    if(ev.note) detail+=` · ${ev.note}`;
    return {title:ev.type,sub:detail};
  }
  function renderTimeline(){
    const el=$('#timeline');
    if(!state.events.length){el.innerHTML='<div class="empty">Nessun evento registrato.</div>';return;}
    el.innerHTML=state.events.map(ev=>{const l=eventLabel(ev);return `<div class="event"><div class="event-time">${escapeHtml(ev.time)}</div><div class="event-main"><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.sub)}</small></div>${ev.team==='system'?'<span></span>':`<button class="icon-btn" data-delete-event="${ev.id}" aria-label="Elimina evento">×</button>`}</div>`}).join('');
  }
  function count(type,team='breda'){return state.events.filter(e=>e.type===type&&e.team===team).length}
  function renderStats(){
    $('#countCorner').textContent=count("Calcio d’angolo");
    $('#countFreeKick').textContent=count('Punizione');
    $('#countRecovery').textContent=count('Palla rubata');
    $('#countLoss').textContent=count('Palla persa');
    const stats=[['Goal',bredaScore()],['Assist',state.events.filter(e=>e.type==='Goal'&&e.team==='breda'&&e.assist&&e.assist.number).length],['Angoli',count("Calcio d’angolo")],['Punizioni',count('Punizione')],['Palle rubate',count('Palla rubata')],['Palle perse',count('Palla persa')],['Gialli',count('Ammonizione')],['Rossi',count('Espulsione')]];
    $('#liveStats').innerHTML=stats.map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  }
  function renderActionTeam(){
    $('#actionTeamBreda').classList.toggle('active',state.actionTeam==='breda');
    $('#actionTeamOpponent').classList.toggle('active',state.actionTeam==='opponent');
  }

  function calculateMeetingTime(kickoff){
    if(!kickoff)return {time:'',dayOffset:0};
    const [h,m]=kickoff.split(':').map(Number); if(!Number.isFinite(h)||!Number.isFinite(m))return {time:'',dayOffset:0};
    let total=h*60+m-105,dayOffset=0;
    while(total<0){total+=1440;dayOffset--}
    while(total>=1440){total-=1440;dayOffset++}
    return {time:`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`,dayOffset};
  }
  function formatCallupDate(value){
    if(!value)return 'Data da definire';
    const d=new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d);
  }
  function meetingLabel(){
    const suffix=state.callup.meetingDayOffset<0?' · giorno precedente':state.callup.meetingDayOffset>0?' · giorno successivo':'';
    return `${state.callup.meeting||'--:--'}${suffix}`;
  }
  function renderCallupPlayers(){
    const grid=$('#callupPlayerGrid'); if(!grid)return;
    grid.innerHTML=state.callup.players.map(p=>`<div class="callup-player ${p.selected?'selected':''}" data-callup-row="${p.number}"><button type="button" class="player-number-btn" data-toggle-callup-player="${p.number}" aria-label="Seleziona numero ${p.number}">${p.number}</button><input type="text" data-callup-player-name="${p.number}" value="${escapeHtml(p.name)}" placeholder="Nome e cognome" autocomplete="off" /></div>`).join('');
    const selected=state.callup.players.filter(p=>p.name.trim()).length;
    $('#callupSelectedCount').textContent=`${selected} / 20`;
  }
  function fillCallupForm(){
    $('#callupCompetition').value=state.callup.competition;
    $('#callupRound').value=state.callup.round;
    $('#callupDate').value=state.callup.date;
    $('#callupOpponent').value=state.callup.opponent;
    $('#callupKickoff').value=state.callup.kickoff;
    $('#callupMeeting').value=state.callup.meeting;
    $('#callupMeetingHelp').textContent=`Automatico: 1 ora e 45 minuti prima${state.callup.meetingDayOffset<0?' (giorno precedente)':''}.`;
    $$('input[name="callupVenue"]').forEach(r=>r.checked=r.value===state.callup.venue);
    $('#callupAddress').value=state.callup.address;
    $('#callupCoach').value=state.callup.coach||'';
    $('#callupManager1').value=state.callup.manager1||'';
    $('#callupManager2').value=state.callup.manager2||'';
    $('#callupSportingDirector').value=state.callup.sportingDirector||'';
    $('#callupAddressField').classList.toggle('hidden',state.callup.venue!=='away');
    renderCallupPlayers(); renderLogo();
  }
  function syncCallupForm(){
    state.callup.competition=$('#callupCompetition').value.trim();
    state.callup.round=$('#callupRound').value.trim();
    state.callup.date=$('#callupDate').value;
    state.callup.opponent=$('#callupOpponent').value.trim();
    state.callup.kickoff=$('#callupKickoff').value;
    const calc=calculateMeetingTime(state.callup.kickoff);
    state.callup.meeting=calc.time; state.callup.meetingDayOffset=calc.dayOffset;
    state.callup.venue=$('input[name="callupVenue"]:checked')?.value||'home';
    state.callup.address=$('#callupAddress').value.trim();
    state.callup.coach=$('#callupCoach').value.trim();
    state.callup.manager1=$('#callupManager1').value.trim();
    state.callup.manager2=$('#callupManager2').value.trim();
    state.callup.sportingDirector=$('#callupSportingDirector').value.trim();
    $('#callupMeeting').value=state.callup.meeting;
    $('#callupMeetingHelp').textContent=`Automatico: 1 ora e 45 minuti prima${state.callup.meetingDayOffset<0?' (giorno precedente)':''}.`;
    $('#callupAddressField').classList.toggle('hidden',state.callup.venue!=='away');
    saveState();
  }
  function selectedCallupPlayers(){return state.callup.players.filter(p=>p.name.trim()).sort((a,b)=>a.number-b.number)}
  function validateCallup(){
    syncCallupForm();
    const required=[['#callupCompetition','Inserisci il campionato'],['#callupRound','Inserisci la giornata'],['#callupDate','Inserisci la data'],['#callupOpponent','Inserisci l’avversario'],['#callupKickoff','Inserisci l’orario della partita']];
    for(const [selector,message] of required){if(!$(selector).value.trim()){toast(message);$(selector).focus();return false}}
    if(state.callup.venue==='away'&&!state.callup.address){toast('Inserisci l’indirizzo della trasferta');$('#callupAddress').focus();return false}
    const incomplete=state.callup.players.find(p=>p.selected&&!p.name.trim());
    if(incomplete){toast(`Inserisci nome e cognome per il numero ${incomplete.number}`);$(`[data-callup-player-name="${incomplete.number}"]`)?.focus();return false}
    if(!selectedCallupPlayers().length){toast('Seleziona almeno un convocato');return false}
    return true;
  }
  function renderCallupHtmlPreview(){
    const logo=state.logoDataUrl?`<img src="${state.logoDataUrl}" alt="Logo CSV Breda">`:'<div class="logo-placeholder">LOGO</div>';
    const venueLabel=state.callup.venue==='home'?'Campo di casa':state.callup.address;
    const dateLabel=formatCallupDate(state.callup.date);
    const leftPlayers=Array.from({length:11},(_,i)=>state.callup.players[i]||{number:i+1,name:''});
    const rightPlayers=Array.from({length:9},(_,i)=>state.callup.players[i+11]||{number:i+12,name:''});
    const rows=[];
    for(let i=0;i<11;i++){
      const left=leftPlayers[i]||{number:i+1,name:''};
      const right=rightPlayers[i]||{number:'',name:''};
      rows.push(`<div class="num">${left.number}</div><div class="name">${escapeHtml(left.name||'')}</div><div class="num">${right.number||''}</div><div class="name">${escapeHtml(right.name||'')}</div>`);
    }
    $('#callupHtmlPreview').innerHTML=`<div class="callup-sheet"><div class="callup-sheet-top"><div class="callup-sheet-logo">${logo}</div><div class="callup-sheet-title">${escapeHtml(clubName().toUpperCase())}</div></div><div class="callup-box two-cols"><div class="cell callup-label">Convocazione squadra:</div><div class="cell callup-value callup-big">${escapeHtml(state.callup.competition||'')}</div></div><div class="callup-box three-cols"><div class="cell callup-label">Gara</div><div class="cell callup-value">${escapeHtml(clubName().toUpperCase())} - ${escapeHtml(state.callup.opponent||'')}</div><div class="cell callup-value">Del : ${escapeHtml(dateLabel)}</div><div class="cell" style="grid-column:1 / span 2;text-align:center;color:var(--granata);font-weight:950;font-style:italic">${escapeHtml(state.callup.round||'CAMPIONATO')}</div><div class="cell callup-value">Ore ${escapeHtml(state.callup.kickoff||'')}</div></div><div class="callup-box two-cols"><div class="cell callup-label" style="grid-column:1 / -1">I sotto elencati giocatori sono convocati presso il campo:</div><div class="cell callup-value" style="text-align:center;font-style:italic">${escapeHtml(venueLabel||'')}</div><div class="cell callup-value" style="text-align:center">alle ore ${escapeHtml(meetingLabel())}</div></div><div class="callup-table">${rows.join('')}</div><div class="callup-staff"><div class="callup-staff-row"><div class="staff-label">Allenatore</div><div class="staff-value">${escapeHtml(state.callup.coach||'')}</div></div><div class="callup-staff-row"><div class="staff-label">Dirigente</div><div class="staff-value">${escapeHtml(state.callup.manager1||'')}</div></div><div class="callup-staff-row"><div class="staff-label">Dirigente</div><div class="staff-value">${escapeHtml(state.callup.manager2||'')}</div></div><div class="callup-staff-row"><div class="staff-label">Direttore sportivo</div><div class="staff-value">${escapeHtml(state.callup.sportingDirector||'')}</div></div></div></div>`;
    $('#callupOutputCard').classList.remove('hidden');
  }
  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src})}
  function roundRectPath(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  function wrapCanvasText(ctx,text,maxWidth){
    const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line='';
    for(const word of words){const test=line?`${line} ${word}`:word;if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=word}else line=test}
    if(line)lines.push(line);return lines.length?lines:[''];
  }
  function fitText(ctx,text,maxWidth,maxSize,minSize=18,weight=800){let size=maxSize;do{ctx.font=`${weight} ${size}px Arial, sans-serif`;if(ctx.measureText(text).width<=maxWidth)return size;size-=1}while(size>=minSize);return minSize}
  async function buildCallupCanvas(){
    if(!validateCallup())throw new Error('validation');
    const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');
    const granata=state.profile.primaryColor||'#741f35',accent=shadeHex(granata,18),line='#8f6a7a',bg='#f1f1f1',white='#ffffff',ink='#18181b',blue='#4357c6';
    const W=canvas.width,H=canvas.height,M=54;
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=line;ctx.lineWidth=2;
    const logoBox={x:M,y:62,w:170,h:170};
    if(state.logoDataUrl){
      try{const logo=await loadImage(state.logoDataUrl);const scale=Math.min(logoBox.w/logo.naturalWidth,logoBox.h/logo.naturalHeight);const w=logo.naturalWidth*scale,h=logo.naturalHeight*scale;ctx.drawImage(logo,logoBox.x+(logoBox.w-w)/2,logoBox.y+(logoBox.h-h)/2,w,h)}catch(e){}
    } else {
      ctx.strokeRect(logoBox.x,logoBox.y,logoBox.w,logoBox.h);ctx.font='700 20px Arial, sans-serif';ctx.fillStyle=granata;ctx.textAlign='center';ctx.fillText('LOGO',logoBox.x+logoBox.w/2,logoBox.y+logoBox.h/2);ctx.textAlign='left';
    }
    ctx.fillStyle=accent;ctx.font='900 72px Arial, sans-serif';ctx.textAlign='center';ctx.fillText(clubName().toUpperCase(),W/2+120,170);ctx.textAlign='left';

    function drawCell(x,y,w,h,text,opts={}){
      ctx.strokeStyle=opts.lineColor||blue;ctx.lineWidth=1.6;ctx.strokeRect(x,y,w,h);
      const align=opts.align||'left',valign=opts.valign||'middle';
      const fontSize=opts.fontSize||28, weight=opts.weight||700, style=opts.style?opts.style+' ':'';
      ctx.fillStyle=opts.color||ink;ctx.font=`${style}${weight} ${fontSize}px Arial, sans-serif`;
      ctx.textAlign=align;
      const tx=align==='center'?x+w/2:align==='right'?x+w-12:x+12;
      const lines=Array.isArray(text)?text:wrapCanvasText(ctx,String(text||''),w-24);
      const lineH=fontSize+5,totalH=lines.length*lineH;let ty=valign==='top'?y+fontSize+8:y+(h-totalH)/2+fontSize;
      lines.forEach(line=>{ctx.fillText(line,tx,ty);ty+=lineH});
      ctx.textAlign='left';
    }

    let y=300;
    drawCell(M,y,W-M*2,58,'');
    drawCell(M,y,360,58,'Convocazione squadra:',{fontSize:28,weight:900});
    drawCell(M+360,y,W-M*2-360,58,state.callup.competition||'',{fontSize:34,weight:950});
    y+=84;

    const x1=M,w1=150,x2=x1+w1,w2=680,x3=x2+w2,w3=W-M-x3;
    drawCell(x1,y,w1,58,'Gara',{fontSize:28,weight:900});
    drawCell(x2,y,w2,58,`${clubName().toUpperCase()} - ${state.callup.opponent||''}`,{fontSize:28,weight:900,align:'center'});
    drawCell(x3,y,w3,58,`Del : ${formatCallupDate(state.callup.date)}`,{fontSize:26,weight:900});
    y+=58;
    drawCell(x1,y,w1+w2,58,state.callup.round||'CAMPIONATO',{fontSize:26,weight:900,align:'center',style:'italic',color:blue});
    drawCell(x3,y,w3,58,`Ore ${state.callup.kickoff||''}`,{fontSize:26,weight:900});
    y+=110;

    drawCell(M,y,W-M*2,58,'I sotto elencati giocatori sono convocati presso il campo:',{fontSize:26,weight:900});
    y+=58;
    const venueLabel=state.callup.venue==='home'?'CAMPO DI CASA':(state.callup.address||'');
    drawCell(M,y,W-M*2-300,62,venueLabel,{fontSize:26,weight:900,align:'center',style:'italic'});
    drawCell(W-M-300,y,300,62,`alle ore ${meetingLabel()}`,{fontSize:25,weight:900,align:'center'});
    y+=118;

    const tableX=M, tableY=y, numW=54, nameW=534, numW2=54, nameW2=W-M-tableX-numW-nameW-numW2;
    const rowH=46;
    for(let i=0;i<11;i++){
      const left=state.callup.players[i]||{number:i+1,name:''};
      const rightIndex=i+11; const right=state.callup.players[rightIndex]||{number:'',name:''};
      const rowY=tableY+i*rowH;
      drawCell(tableX,rowY,numW,rowH,String(left.number),{fontSize:20,weight:900,align:'center'});
      drawCell(tableX+numW,rowY,nameW,rowH,left.name||'',{fontSize:18,weight:800,style:'italic'});
      drawCell(tableX+numW+nameW,rowY,numW2,rowH,right.number?String(right.number):'',{fontSize:20,weight:900,align:'center'});
      drawCell(tableX+numW+nameW+numW2,rowY,nameW2,rowH,right.name||'',{fontSize:18,weight:800,style:'italic'});
    }
    y=tableY+11*rowH+70;
    const staffRows=[['Allenatore',state.callup.coach||''],['Dirigente',state.callup.manager1||''],['Dirigente',state.callup.manager2||''],['Direttore sportivo',state.callup.sportingDirector||'']];
    staffRows.forEach((row,idx)=>{drawCell(M,y,W-M*2,54,'');drawCell(M,y,300,54,`${row[0]} :`,{fontSize:24,weight:900});drawCell(M+300,y,W-M*2-300,54,row[1],{fontSize:24,weight:800,style:'italic'});y+=54;});
    return canvas;
  }
  function canvasBlob(canvas,type='image/png',quality=.94){return new Promise(resolve=>canvas.toBlob(resolve,type,quality))}
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  function callupFileBase(){const opp=pdfAscii(state.callup.opponent||'avversario').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return `convocazione-${pdfAscii(clubName()).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${opp||'partita'}-${state.callup.date||new Date().toISOString().slice(0,10)}`}
  function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1}
  async function saveOrShareFile(blob,filename,title){
    const file=new File([blob],filename,{type:blob.type});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title});return 'shared'}catch(e){if(e.name==='AbortError')return 'cancelled'}
    }
    const url=URL.createObjectURL(blob);
    if(isIOS()){
      const win=window.open(url,'_blank');
      if(!win){location.href=url}else toast('File aperto: usa Condividi per salvarlo');
      setTimeout(()=>URL.revokeObjectURL(url),120000);
      return 'opened';
    }
    const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'downloaded';
  }
  async function downloadCallupImage(){
    try{const canvas=await buildCallupCanvas(),blob=await canvasBlob(canvas,'image/png');if(!blob)throw new Error('blob');const result=await saveOrShareFile(blob,`${callupFileBase()}.png`,`Convocazione ${clubName()}`);if(result!=='cancelled')toast('Foto pronta da salvare')}
    catch(e){if(e.message!=='validation'){console.error(e);toast('Errore nella creazione della foto')}}
  }
  async function shareCallupImage(){return downloadCallupImage()}
  async function downloadCallupPdf(){
    try{
      const canvas=await buildCallupCanvas();
      const jpeg=canvas.toDataURL('image/jpeg',.92);
      const imageInfo={bytes:dataUrlToBytes(jpeg),width:canvas.width,height:canvas.height};
      const pageW=595.28,pageH=841.89,margin=10,maxW=pageW-margin*2,maxH=pageH-margin*2,scale=Math.min(maxW/imageInfo.width,maxH/imageInfo.height),w=imageInfo.width*scale,h=imageInfo.height*scale,x=(pageW-w)/2,y=(pageH-h)/2;
      const bytes=createPdfBytes([[`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`]],imageInfo);
      const blob=new Blob([bytes],{type:'application/pdf'});
      const result=await saveOrShareFile(blob,`${callupFileBase()}.pdf`,`Convocazione ${clubName()}`);if(result!=='cancelled')toast('PDF pronto da salvare');
    }catch(e){if(e.message!=='validation'){console.error(e);toast('Errore nella creazione del PDF')}}
  }

  function renderAll(){ renderLogo();renderScore();renderTimer();renderTimeline();renderStats();renderActionTeam(); }

  function reportDate(){
    if(!state.match.date)return '';
    const d=new Date(`${state.match.date}T12:00:00`);
    return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'long',year:'numeric'}).format(d);
  }
  function statComparisonRows(){
    const types=["Calcio d’angolo",'Punizione','Palla rubata','Palla persa','Ammonizione','Espulsione'];
    return types.map(type=>`<tr><td>${escapeHtml(type)}</td><td>${count(type,'breda')}</td><td>${count(type,'opponent')}</td></tr>`).join('');
  }
  function renderReport(){
    const logo=state.logoDataUrl?`<img class="report-logo" src="${state.logoDataUrl}" alt="Logo CSV Breda">`:'';
    const n=teamNames(); const chronological=[...state.events].reverse();
    const rows=chronological.length?chronological.map(ev=>{const l=eventLabel(ev);return `<tr><td>${escapeHtml(ev.time)}</td><td>${escapeHtml(l.title)}</td><td>${escapeHtml(l.sub)}</td></tr>`}).join(''):'<tr><td colspan="3">Nessun evento registrato.</td></tr>';
    $('#reportContent').innerHTML=`
      <div class="report-head">${logo}<div class="eyebrow">CSV Breda · Match Report</div><h2>${escapeHtml(state.match.competition||'Partita')}</h2><div class="report-score">${escapeHtml(n.home)} ${state.score.home} – ${state.score.away} ${escapeHtml(n.away)}</div><div>${escapeHtml([state.match.team,state.match.round,state.match.season].filter(Boolean).join(' · '))}</div><div>${escapeHtml([reportDate(),state.match.kickoff,state.match.venue==='home'?'Breda Arena':'Trasferta'].filter(Boolean).join(' · '))}</div></div>
      <h3>Tempi di gioco</h3>
      <table class="report-table"><tbody><tr><th>Primo tempo</th><td>${formatFixed(state.timer.firstHalfMs||0)}</td><th>Recupero</th><td>${state.timer.firstHalfMs>45*60*1000?'+'+formatFixed(state.timer.firstHalfMs-45*60*1000):'00:00'}</td></tr><tr><th>Secondo tempo</th><td>${formatFixed(state.timer.secondHalfMs||0)}</td><th>Recupero</th><td>${state.timer.secondHalfMs>45*60*1000?'+'+formatFixed(state.timer.secondHalfMs-45*60*1000):'00:00'}</td></tr></tbody></table>
      <h3 style="margin-top:24px">Statistiche</h3>
      <table class="report-table"><thead><tr><th>Voce</th><th>CSV Breda</th><th>Avversario</th></tr></thead><tbody><tr><td>Goal</td><td>${bredaScore()}</td><td>${opponentScore()}</td></tr><tr><td>Assist</td><td>${state.events.filter(e=>e.type==='Goal'&&e.team==='breda'&&e.assist&&e.assist.number).length}</td><td>—</td></tr>${statComparisonRows()}</tbody></table>
      <h3 style="margin-top:24px">Cronologia completa</h3>
      <table class="report-table"><thead><tr><th>Minuto</th><th>Evento</th><th>Dettaglio</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:24px;font-size:.72rem;color:var(--muted)">Report generato con TeamCenter 1.0.</p>`;
  }


  function pdfAscii(value=''){
    return String(value)
      .replace(/[’‘]/g,"'")
      .replace(/[–—]/g,'-')
      .replace(/…/g,'...')
      .replace(/°/g,'o')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^\x20-\x7E]/g,'');
  }
  function pdfEscape(value=''){
    return pdfAscii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }
  function asciiBytes(value=''){
    const text=String(value); const bytes=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i)&255;
    return bytes;
  }
  function concatBytes(chunks){
    const total=chunks.reduce((sum,c)=>sum+c.length,0); const out=new Uint8Array(total); let offset=0;
    chunks.forEach(c=>{out.set(c,offset);offset+=c.length}); return out;
  }
  function createPdfBytes(pages,imageInfo){
    const objects=[null];
    const addObject=(parts=null)=>{objects.push(parts);return objects.length-1};
    const setObject=(id,parts)=>{objects[id]=parts};
    const asParts=value=>Array.isArray(value)?value:[asciiBytes(value)];
    const catalogId=addObject();
    const pagesId=addObject();
    const fontRegularId=addObject(asParts('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    const fontBoldId=addObject(asParts('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    let imageId=null;
    if(imageInfo){
      imageId=addObject([
        asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${imageInfo.width} /Height ${imageInfo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageInfo.bytes.length} >>\nstream\n`),
        imageInfo.bytes,
        asciiBytes('\nendstream')
      ]);
    }
    const pageIds=[];
    pages.forEach(commands=>{
      const content=asciiBytes(commands.join('\n'));
      const contentId=addObject([asciiBytes(`<< /Length ${content.length} >>\nstream\n`),content,asciiBytes('\nendstream')]);
      const xObject=imageId?` /XObject << /Im1 ${imageId} 0 R >>`:'';
      const pageId=addObject(asParts(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`));
      pageIds.push(pageId);
    });
    setObject(pagesId,asParts(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`));
    setObject(catalogId,asParts(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`));

    const chunks=[asciiBytes('%PDF-1.4\n%BREDA\n')];
    const offsets=[0]; let offset=chunks[0].length;
    for(let i=1;i<objects.length;i++){
      offsets[i]=offset;
      const start=asciiBytes(`${i} 0 obj\n`); const end=asciiBytes('\nendobj\n'); const parts=objects[i]||[];
      chunks.push(start,...parts,end);
      offset+=start.length+parts.reduce((n,p)=>n+p.length,0)+end.length;
    }
    const xrefOffset=offset;
    let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    const trailer=`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(asciiBytes(xref+trailer));
    return concatBytes(chunks);
  }
  function dataUrlToBytes(dataUrl){
    const base64=String(dataUrl).split(',')[1]||''; const binary=atob(base64); const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i); return bytes;
  }
  function prepareLogoForPdf(){
    if(!state.logoDataUrl)return Promise.resolve(null);
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const maxSide=420; const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
          const width=Math.max(1,Math.round(img.naturalWidth*scale)); const height=Math.max(1,Math.round(img.naturalHeight*scale));
          const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
          const ctx=canvas.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,width,height); ctx.drawImage(img,0,0,width,height);
          const jpeg=canvas.toDataURL('image/jpeg',0.9);
          resolve({bytes:dataUrlToBytes(jpeg),width,height});
        }catch(e){resolve(null)}
      };
      img.onerror=()=>resolve(null); img.src=state.logoDataUrl;
    });
  }
  function buildPdfPages(imageInfo){
    const PAGE_W=595.28, PAGE_H=841.89, MARGIN=42, BOTTOM=48;
    const GRANATA=[0.455,0.122,0.208], GRANATA_SOFT=[0.956,0.914,0.925], INK=[0.09,0.09,0.11], MUTED=[0.42,0.45,0.50], WHITE=[1,1,1], LINE=[0.88,0.89,0.91];
    const pages=[]; let commands=[]; let y=0;
    const color=c=>`${c[0]} ${c[1]} ${c[2]}`;
    const estimate=(text,size)=>pdfAscii(text).length*size*0.52;
    const wrap=(value,maxWidth,size)=>{
      const words=pdfAscii(value).split(/\s+/).filter(Boolean); if(!words.length)return [''];
      const lines=[]; let line='';
      words.forEach(word=>{
        const candidate=line?`${line} ${word}`:word;
        if(line&&estimate(candidate,size)>maxWidth){lines.push(line);line=word}else line=candidate;
      });
      if(line)lines.push(line); return lines;
    };
    const text=(value,x,yy,size=10,bold=false,fill=INK,align='left',boxWidth=0)=>{
      let tx=x; const clean=pdfAscii(value);
      if(align==='center'&&boxWidth)tx=x+Math.max(0,(boxWidth-estimate(clean,size))/2);
      if(align==='right'&&boxWidth)tx=x+Math.max(0,boxWidth-estimate(clean,size));
      commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color(fill)} rg 1 0 0 1 ${tx.toFixed(2)} ${yy.toFixed(2)} Tm (${pdfEscape(clean)}) Tj ET`);
    };
    const fillRect=(x,top,w,h,fill)=>commands.push(`${color(fill)} rg ${x.toFixed(2)} ${(top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    const strokeRect=(x,top,w,h,stroke=LINE)=>commands.push(`${color(stroke)} RG 0.7 w ${x.toFixed(2)} ${(top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const hLine=(x1,x2,yy,stroke=LINE)=>commands.push(`${color(stroke)} RG 0.7 w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`);
    const newPage=(continuation=false)=>{
      commands=[]; pages.push(commands);
      fillRect(0,PAGE_H,PAGE_W,88,GRANATA);
      if(imageInfo){
        const maxW=54,maxH=54,scale=Math.min(maxW/imageInfo.width,maxH/imageInfo.height),iw=imageInfo.width*scale,ih=imageInfo.height*scale;
        const ix=42+(maxW-iw)/2, iy=PAGE_H-72+(maxH-ih)/2;
        commands.push(`q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im1 Do Q`);
      }
      text(continuation?'CSV BREDA MATCH REPORT - CONTINUA':'CSV BREDA MATCH REPORT',112,PAGE_H-37,18,true,WHITE);
      text([state.match.team,state.match.competition,state.match.season].filter(Boolean).join(' · '),112,PAGE_H-57,9,false,WHITE);
      y=PAGE_H-112;
    };
    const ensureSpace=height=>{if(y-height<BOTTOM)newPage(true)};
    const sectionTitle=value=>{ensureSpace(30);text(value,MARGIN,y,14,true,GRANATA);y-=22;};
    const paragraph=(value,size=9.5,fill=INK,align='left')=>{
      const lines=wrap(value,PAGE_W-MARGIN*2,size); ensureSpace(lines.length*13+6);
      lines.forEach(line=>{text(line,MARGIN,y,size,false,fill,align,PAGE_W-MARGIN*2);y-=13}); y-=4;
    };
    const drawTable=(headers,rows,widths)=>{
      const tableW=widths.reduce((a,b)=>a+b,0); const x0=MARGIN; const headerH=24;
      const drawHeader=()=>{
        ensureSpace(headerH+24); fillRect(x0,y,tableW,headerH,GRANATA_SOFT); strokeRect(x0,y,tableW,headerH);
        let x=x0;
        headers.forEach((h,i)=>{text(h,x+5,y-16,8,true,GRANATA);x+=widths[i]}); y-=headerH;
      };
      drawHeader();
      rows.forEach(row=>{
        const cellLines=row.map((cell,i)=>wrap(cell,widths[i]-10,8.2));
        const rowH=Math.max(22,Math.max(...cellLines.map(lines=>lines.length))*10+8);
        if(y-rowH<BOTTOM){newPage(true);drawHeader()}
        strokeRect(x0,y,tableW,rowH);
        let x=x0;
        row.forEach((cell,i)=>{
          if(i>0)commands.push(`${color(LINE)} RG 0.7 w ${x.toFixed(2)} ${y.toFixed(2)} m ${x.toFixed(2)} ${(y-rowH).toFixed(2)} l S`);
          cellLines[i].forEach((line,index)=>text(line,x+5,y-13-index*10,8.2,i===0&&headers[0]==='Voce',INK));
          x+=widths[i];
        });
        y-=rowH;
      });
      y-=12;
    };

    newPage(false);
    const names=teamNames();
    text(state.match.competition||'Partita',MARGIN,y,16,true,INK); y-=21;
    paragraph([state.match.round,reportDate(),state.match.kickoff,state.match.venue==='home'?'Breda Arena':'Trasferta'].filter(Boolean).join(' · '),9,MUTED);
    ensureSpace(72); fillRect(MARGIN,y,PAGE_W-MARGIN*2,64,GRANATA_SOFT); strokeRect(MARGIN,y,PAGE_W-MARGIN*2,64,GRANATA);
    text(`${names.home} ${state.score.home} - ${state.score.away} ${names.away}`,MARGIN,y-29,17,true,GRANATA,'center',PAGE_W-MARGIN*2);
    text('RISULTATO FINALE',MARGIN,y-49,8,true,MUTED,'center',PAGE_W-MARGIN*2); y-=82;

    sectionTitle('Tempi di gioco');
    drawTable(['Voce','Durata','Recupero'],[
      ['Primo tempo',formatFixed(state.timer.firstHalfMs||0),state.timer.firstHalfMs>45*60*1000?'+'+formatFixed(state.timer.firstHalfMs-45*60*1000):'00:00'],
      ['Secondo tempo',formatFixed(state.timer.secondHalfMs||0),state.timer.secondHalfMs>45*60*1000?'+'+formatFixed(state.timer.secondHalfMs-45*60*1000):'00:00']
    ],[235,138,138]);

    sectionTitle('Statistiche');
    const statRows=[
      ['Goal',String(bredaScore()),String(opponentScore())],
      ['Assist',String(state.events.filter(e=>e.type==='Goal'&&e.team==='breda'&&e.assist&&e.assist.number).length),'-'],
      ["Calci d'angolo",String(count("Calcio d’angolo",'breda')),String(count("Calcio d’angolo",'opponent'))],
      ['Punizioni',String(count('Punizione','breda')),String(count('Punizione','opponent'))],
      ['Palle rubate',String(count('Palla rubata','breda')),String(count('Palla rubata','opponent'))],
      ['Palle perse',String(count('Palla persa','breda')),String(count('Palla persa','opponent'))],
      ['Ammonizioni',String(count('Ammonizione','breda')),String(count('Ammonizione','opponent'))],
      ['Espulsioni',String(count('Espulsione','breda')),String(count('Espulsione','opponent'))]
    ];
    drawTable(['Voce','CSV Breda','Avversario'],statRows,[255,128,128]);

    sectionTitle('Cronologia completa');
    const chronological=[...state.events].reverse();
    const eventRows=chronological.length?chronological.map(ev=>{const label=eventLabel(ev);return [ev.time,label.title,label.sub]}):[['-','Nessun evento','Nessun evento registrato']];
    drawTable(['Minuto','Evento','Dettaglio'],eventRows,[72,135,304]);

    pages.forEach((page,index)=>{
      page.push(`${color(LINE)} RG 0.6 w ${MARGIN} 35 m ${PAGE_W-MARGIN} 35 l S`);
      page.push(`BT /F1 7 Tf ${color(MUTED)} rg 1 0 0 1 ${MARGIN} 22 Tm (${pdfEscape('TeamCenter 1.0')}) Tj ET`);
      page.push(`BT /F1 7 Tf ${color(MUTED)} rg 1 0 0 1 ${PAGE_W-MARGIN-45} 22 Tm (${pdfEscape(`Pag. ${index+1}/${pages.length}`)}) Tj ET`);
    });
    return pages;
  }
  function pdfFileName(){
    const opponent=pdfAscii(state.match.opponent||'avversario').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const date=state.match.date||new Date().toISOString().slice(0,10);
    return `csv-breda-${opponent||'match'}-${date}.pdf`;
  }
  async function generateAndDownloadPdf(){
    const button=$('#downloadPdfBtn'); const oldText=button.textContent;
    const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const iosPreview=isIOS?window.open('about:blank','_blank'):null;
    button.disabled=true; button.textContent='Generazione PDF…';
    try{
      const imageInfo=await prepareLogoForPdf();
      const pages=buildPdfPages(imageInfo); const bytes=createPdfBytes(pages,imageInfo);
      const blob=new Blob([bytes],{type:'application/pdf'}); const filename=pdfFileName();
      const url=URL.createObjectURL(blob);
      if(iosPreview&&!iosPreview.closed){
        iosPreview.location.href=url;
        setTimeout(()=>URL.revokeObjectURL(url),120000);
        toast('PDF aperto: usa Condividi o Salva');
        return;
      }
      const link=document.createElement('a');
      link.href=url; link.download=filename; link.rel='noopener'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000); toast('PDF generato');
    }catch(error){
      if(iosPreview&&!iosPreview.closed)iosPreview.close();
      console.error(error); toast('Errore nella generazione PDF: usa Stampa report');
    }finally{button.disabled=false;button.textContent=oldText}
  }

  function handleLogoUpload(e){
    const file=e.target.files[0]; if(!file)return;
    if(file.size>2.5*1024*1024){toast('Usa un logo più leggero di 2,5 MB');return;}
    const reader=new FileReader(); reader.onload=()=>{state.logoDataUrl=reader.result;saveState();renderLogo();toast('Logo ufficiale salvato')};reader.readAsDataURL(file);
  }
  ['#logoInput','#headerLogoInput','#callupLogoInput','#profileLogoInput'].forEach(selector=>$(selector)?.addEventListener('change',handleLogoUpload));

  $('#profileForm')?.addEventListener('submit',salvaProfiloSocieta);
  $('#adminLoginForm')?.addEventListener('submit',loginAmministratore);
  $('#adminLogoutBtn')?.addEventListener('click',logoutAmministratore);
  $('#rosterTeamSelect')?.addEventListener('change',async event=>{rosterTeamId=event.target.value;chiudiModuloGiocatore();await caricaRosa();});
  $('#rosterSearchInput')?.addEventListener('input',renderRosa);
  $('#openPlayerFormBtn')?.addEventListener('click',()=>apriModuloGiocatore());
  $('#closePlayerFormBtn')?.addEventListener('click',chiudiModuloGiocatore);
  $('#playerForm')?.addEventListener('submit',salvaGiocatoreDaForm);
  $('#staffSearchInput')?.addEventListener('input',renderStaff);
  $('#staffRoleFilter')?.addEventListener('change',renderStaff);
  $('#openStaffFormBtn')?.addEventListener('click',()=>apriModuloStaff());
  $('#closeStaffFormBtn')?.addEventListener('click',chiudiModuloStaff);
  $('#staffForm')?.addEventListener('submit',salvaStaffDaForm);
  $('#staffList')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-edit-staff]');
    if(!button)return;
    const item=staffApi.find(s=>String(s.IDStaff||'')===button.dataset.editStaff);
    if(item)apriModuloStaff(item);
  });

  $('#rosterList')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-edit-player]');
    if(!button)return;
    const player=rosaApi.find(g=>String(g.IDGiocatore||'')===button.dataset.editPlayer);
    if(player)apriModuloGiocatore(player);
  });
  $('#profilePrimaryColorInput')?.addEventListener('input',e=>{const value=e.target.value.toUpperCase();const out=$('#profilePrimaryColorValue');if(out)out.value=value;const name=$('#profilePrimaryColorName');if(name)name.textContent=colorDisplayName(value,'Colore primario')});
  $('#profileSecondaryColorInput')?.addEventListener('input',e=>{const value=e.target.value.toUpperCase();const out=$('#profileSecondaryColorValue');if(out)out.value=value;const name=$('#profileSecondaryColorName');if(name)name.textContent=colorDisplayName(value,'Colore secondario')});

  document.addEventListener('click',e=>{
    const module=e.target.closest('[data-open-module]')?.dataset.openModule;
    if(module==='profile'){apriProfiloAmministratore()}
    if(module==='roster'){apriRosa()}
    if(module==='staff'){apriStaff()}
    if(module==='training'){showScreen('training');window.TeamCenterAllenamenti?.open()}
    if(module==='match'){window.TeamCenterMatch?.open()}
    if(module==='callups'){showScreen('callups');window.TeamCenterConvocazioni?.open()}
    if(e.target.closest('[data-go-home]'))showScreen('home');
    const num=e.target.closest('[data-toggle-callup-player]')?.dataset.toggleCallupPlayer;
    if(num){const p=state.callup.players.find(x=>x.number===Number(num));if(p){p.selected=!p.selected;saveState();renderCallupPlayers()}}
  });
  $('#callupsScreen')?.addEventListener('input',e=>{
    const num=e.target.dataset.callupPlayerName;
    if(num){const p=state.callup.players.find(x=>x.number===Number(num));if(p){p.name=e.target.value;p.selected=Boolean(e.target.value.trim());saveState();e.target.closest('.callup-player')?.classList.toggle('selected',p.selected);$('#callupSelectedCount').textContent=`${state.callup.players.filter(x=>x.name.trim()).length} / 20`}return}
    syncCallupForm();
  });
  $('#callupsScreen')?.addEventListener('change',e=>{if(e.target.name==='callupVenue'||['callupKickoff','callupDate'].includes(e.target.id))syncCallupForm()});
  $('#createCallupPreviewBtn')?.addEventListener('click',()=>{if(validateCallup()){renderCallupHtmlPreview();$('#callupOutputCard').scrollIntoView({behavior:'smooth',block:'start'})}});
  $('#resetCallupBtn')?.addEventListener('click',()=>{if(confirm('Svuotare tutti i dati della convocazione?')){const date=new Date().toISOString().slice(0,10);state.callup=emptyState().callup;state.callup.date=date;saveState();fillCallupForm();$('#callupOutputCard').classList.add('hidden');toast('Convocazione svuotata')}});
  $('#downloadCallupImageBtn')?.addEventListener('click',downloadCallupImage);
  $('#shareCallupImageBtn')?.addEventListener('click',shareCallupImage);
  $('#downloadCallupPdfBtn')?.addEventListener('click',downloadCallupPdf);


  $('#trainingTeamSelect')?.addEventListener('change',e=>{state.training.teamId=e.target.value;state.training.presentIds=[];saveState();loadTrainingPlayers()});
  $('#trainingDateInput')?.addEventListener('change',e=>{state.training.date=e.target.value;saveState()});
  $('#trainingPlayers')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-training-player]');if(!button)return;
    const id=button.dataset.trainingPlayer;
    const present=new Set(state.training.presentIds||[]);
    present.has(id)?present.delete(id):present.add(id);
    state.training.presentIds=[...present];saveState();renderTrainingPlayers();
  });
  $('#trainingSelectAllBtn')?.addEventListener('click',()=>{
    const players=Array.isArray(state.trainingPlayers)?state.trainingPlayers:[];
    const allIds=players.map(p=>String(p.IDGiocatore||'')).filter(Boolean);
    state.training.presentIds=(state.training.presentIds||[]).length===allIds.length?[]:allIds;
    saveState();renderTrainingPlayers();
  });
  $('#saveTrainingDraftBtn')?.addEventListener('click',()=>{saveState();toast('Bozza allenamento salvata sul dispositivo')});

  $('#createMatchBtn')?.addEventListener('click',()=>{
    readSetup();
    if(!state.match.opponent){toast('Inserisci la squadra avversaria');$('#opponentInput').focus();return;}
    state.screen='live';saveState();renderAll();showScreen('live');
  });
  document.addEventListener('click',e=>{
    const cmd=e.target.closest('[data-timer]')?.dataset.timer;if(cmd)timerCommand(cmd);
    const action=e.target.closest('[data-action]')?.dataset.action;if(action)recordQuick(action);
    const del=e.target.closest('[data-delete-event]')?.dataset.deleteEvent;if(del)deleteEvent(del);
    const scoreBtn=e.target.closest('[data-score-team]');if(scoreBtn){const t=scoreBtn.dataset.scoreTeam,d=Number(scoreBtn.dataset.scoreDelta);state.score[t]=Math.max(0,state.score[t]+d);saveState();renderScore();renderStats();}
  });
  $('#actionTeamBreda')?.addEventListener('click',()=>{state.actionTeam='breda';saveState();renderActionTeam()});
  $('#actionTeamOpponent')?.addEventListener('click',()=>{state.actionTeam='opponent';saveState();renderActionTeam()});
  $('#eventForm')?.addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();if(saveModalEvent())$('#eventDialog').close();});
  $('#bottomNav')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#bottomNav button').forEach(x=>x.classList.toggle('active',x===b));document.getElementById(b.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});});
  $('#downloadPdfBtn')?.addEventListener('click',generateAndDownloadPdf);
  $('#printReportBtn')?.addEventListener('click',()=>window.print());
  $('#backToMatchBtn')?.addEventListener('click',()=>{renderAll();showScreen('live')});
  $('#newMatchBtn')?.addEventListener('click',()=>{if(confirm('Creare una nuova partita? I dati della gara corrente verranno cancellati.')){const logo=state.logoDataUrl;state=emptyState();state.logoDataUrl=logo;saveState();fillSetup();showScreen('setup')}});

  async function bootstrap(){
    const today=new Date().toISOString().slice(0,10);
    if(!state.match.date)state.match.date=today;
    if(!state.callup.date)state.callup.date=today;
    if(!state.training.date)state.training.date=today;
    try{
      await sincronizzaConfigurazioneApi();
      console.info('TeamCenter collegato alle API', {master:masterApi,squadre:squadreApi});
    }catch(error){
      console.error('Sincronizzazione API non riuscita:',error);
      toast('API non raggiungibile: uso dati salvati');
    }
    applyProfile();
    renderLogo();
    fillSetup();fillCallupForm();renderAll();
    if(state.screen==='report'){
      renderReport();showScreen('report');
    }else if(state.screen==='live'){
      showScreen('live');
    }else if(state.screen==='setup'){
      showScreen('setup');
    }else if(state.screen==='profile'){
      fillProfile();showScreen('profile');
    }else if(state.screen==='roster'){
      await apriRosa();
    }else if(state.screen==='staff'){
      await apriStaff();
    }else if(state.screen==='training'){
      showScreen('training');
      await window.TeamCenterAllenamenti?.open();
    }else if(state.screen==='callups'){
      showScreen('callups');
      await window.TeamCenterConvocazioni?.open();
    }else{
      showScreen('home');
    }
    tickHandle=setInterval(()=>{if(state.timer.running){renderTimer()}},20);
    if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
  }
  bootstrap();
})();
