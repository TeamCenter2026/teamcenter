window.TeamCenterAPI = (() => {
  const BASE_URL = 'https://script.google.com/macros/s/AKfycbzGQTwDcbPkm5J_QVqrJjVMyGa2wr-1_redtcJifQvKM7kNWItgF0lMq_JQbji5MkCC/exec';

  async function parseResponse(response) {
    const raw = await response.text();
    let payload;

    try {
      payload = JSON.parse(raw);
    } catch (error) {
      const isHtml = /^\s*</.test(raw);
      if (isHtml) {
        throw new Error(
          'La Web App Apps Script ha restituito una pagina HTML. ' +
          'Verifica di aver pubblicato la nuova distribuzione 2.0.1 con accesso consentito a chiunque disponga del link.'
        );
      }
      throw new Error('Risposta API non valida: ' + raw.slice(0, 180));
    }

    if (!payload || payload.successo !== true) {
      throw new Error(payload?.errore || 'Risposta API non valida');
    }

    return payload.dati;
  }

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

    return parseResponse(response);
  }

  async function requestPost(action, params = {}) {
    const body = new URLSearchParams();
    body.set('action', action);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        body.set(key, String(value));
      }
    });

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: body.toString(),
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`API non raggiungibile (${response.status})`);
    }

    return parseResponse(response);
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
    saveMatch: data => requestPost('salvaMatch', data)
  });
})();
