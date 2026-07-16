window.TeamCenterPdf = Object.freeze({
  supported(){ return typeof Blob!=='undefined' && typeof Uint8Array!=='undefined'; },
  note:'Il generatore PDF operativo è integrato in app.js; questo modulo espone l’interfaccia pubblica per le future integrazioni Drive.'
});
