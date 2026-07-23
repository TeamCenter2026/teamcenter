window.TeamCenterAPI = (() => {
  const BASE_URL = 'https://script.google.com/macros/s/AKfycbzGQTwDcbPkm5J_QVqrJjVMyGa2wr-1_redtcJifQvKM7kNWItgF0lMq_JQbji5MkCC/exec';

  async function request(action, params = {}) {
    const url = new URL(BASE_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`API non raggiungibile (${response.status})`);
    }

    const payload = await response.json();
    if (!payload || payload.successo !== true) {
      throw new Error(payload?.errore || 'Risposta API non valida');
    }

    return payload.dati;
  }

  return Object.freeze({
    baseUrl: BASE_URL,
    ping: () => request('ping'),
    getMaster: () => request('master'),
    loginAdmin: password => request('loginAdmin', { password }),
    verificaSessioneAdmin: token => request('verificaSessioneAdmin', { token }),
    logoutAdmin: token => request('logoutAdmin', { token }),
    saveMaster: (data, token) => request('salvaMaster', { ...data, token }),
    getLogo: () => request('logo'),
    getSquadre: () => request('squadre'),
    getGiocatori: idSquadra => request('giocatori', { idSquadra }),
    saveGiocatore: data => request('salvaGiocatore', data),
    getStaff: () => request('staff'),
    saveStaff: data => request('salvaStaff', data),
    getAllenamenti: () => request('allenamenti'),
    saveAllenamento: data => request('salvaAllenamento', data),
    getConvocazioni: () => request('convocazioni'),
    saveConvocazione: data => request('salvaConvocazione', data),
    getMatch: () => request('match'),
    saveMatch: data => request('salvaMatch', data)
  });
})();
