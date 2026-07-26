window.TeamCenterTeam = (() => {
  const KEY = 'teamcenter-session-team';
  let teams = [];
  let currentId = '';
  sessionStorage.removeItem(KEY);

  const idOf = item => String(item?.IDSquadra || item?.idSquadra || '').trim();
  const nameOf = item => String(item?.NomeSquadra || item?.Squadra || item?.squadra || item?.Nome || idOf(item) || 'Squadra').trim();

  function setTeams(items) {
    teams = (Array.isArray(items) ? items : []).filter(item => String(item?.Attiva || 'SI').trim().toUpperCase() !== 'NO');
    if (currentId && !teams.some(item => idOf(item) === currentId)) {
      currentId = '';
      sessionStorage.removeItem(KEY);
    }
    return teams;
  }

  function select(id) {
    const value = String(id || '').trim();
    if (!value || !teams.some(item => idOf(item) === value)) return false;
    currentId = value;
    sessionStorage.setItem(KEY, value);
    window.dispatchEvent(new CustomEvent('teamcenter:teamchange', { detail: current() }));
    return true;
  }

  function current() {
    return teams.find(item => idOf(item) === currentId) || null;
  }

  function matches(record) {
    if (!currentId) return false;
    return idOf(record) === currentId;
  }

  function filter(items) {
    return (Array.isArray(items) ? items : []).filter(matches);
  }

  return Object.freeze({ setTeams, select, current, matches, filter, get id(){ return currentId; }, get name(){ return nameOf(current()); }, idOf, nameOf });
})();
