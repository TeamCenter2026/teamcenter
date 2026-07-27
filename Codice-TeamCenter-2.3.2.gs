const FOGLI_OBBLIGATORI = [
  "MASTER",
  "SQUADRE",
  "GIOCATORI",
  "STAFF",
  "ALLENAMENTI",
  "CONVOCAZIONI",
  "MATCH"
];

function verificaDatabaseTeamCenter() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Impossibile trovare il Google Sheets collegato.");

  const risultato = {
    nomeFile: spreadsheet.getName(),
    fogliPresenti: [],
    fogliMancanti: [],
    master: null,
    squadre: []
  };

  FOGLI_OBBLIGATORI.forEach(nomeFoglio => {
    const foglio = spreadsheet.getSheetByName(nomeFoglio);
    if (foglio) risultato.fogliPresenti.push(nomeFoglio);
    else risultato.fogliMancanti.push(nomeFoglio);
  });

  if (risultato.fogliMancanti.length > 0) {
    throw new Error("Mancano questi fogli: " + risultato.fogliMancanti.join(", "));
  }

  risultato.master = leggiPrimaRigaComeOggetto_("MASTER");
  risultato.squadre = leggiFoglioComeOggetti_("SQUADRE");
  return risultato;
}

function leggiPrimaRigaComeOggetto_(nomeFoglio) {
  const righe = leggiFoglioComeOggetti_(nomeFoglio);
  return righe.length > 0 ? righe[0] : {};
}

function leggiFoglioComeOggetti_(nomeFoglio) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName(nomeFoglio);
  if (!foglio) throw new Error(`Foglio non trovato: ${nomeFoglio}`);

  const valori = foglio.getDataRange().getDisplayValues();
  if (valori.length < 2) return [];

  const intestazioni = valori[0].map(valore => String(valore).trim());

  return valori
    .slice(1)
    .filter(riga => riga.some(cella => String(cella).trim() !== ""))
    .map(riga => {
      const elemento = {};
      intestazioni.forEach((intestazione, indice) => {
        if (intestazione) elemento[intestazione] = riga[indice] ?? "";
      });
      return elemento;
    });
}

function leggiGiocatori(idSquadra = "") {
  const giocatori = leggiFoglioComeOggetti_("GIOCATORI");
  if (!idSquadra) return giocatori;

  const squadra = String(idSquadra).trim().toUpperCase();
  return giocatori.filter(giocatore =>
    String(giocatore.IDSquadra).trim().toUpperCase() === squadra
  );
}

function salvaGiocatoreTeamCenter_(parametri) {
  const idGiocatore = String(parametri.idGiocatore || "").trim();
  const idSquadra = String(parametri.idSquadra || "").trim().toUpperCase();
  const cognome = String(parametri.cognome || "").trim();
  const nome = String(parametri.nome || "").trim();
  const anno = String(parametri.anno || "").trim();
  const attivo = String(parametri.attivo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI";

  if (!idSquadra) throw new Error("Squadra obbligatoria.");
  if (!cognome) throw new Error("Cognome obbligatorio.");
  if (!nome) throw new Error("Nome obbligatorio.");
  if (!anno) throw new Error("Anno obbligatorio.");
  if (!/^\d{4}$/.test(anno)) throw new Error("L'anno deve contenere 4 cifre.");

  verificaSquadraEsistente_(idSquadra);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("GIOCATORI");
  if (!foglio) throw new Error("Foglio GIOCATORI non trovato.");

  const intestazioni = foglio
    .getRange(1, 1, 1, foglio.getLastColumn())
    .getDisplayValues()[0]
    .map(v => String(v).trim());

  ["IDGiocatore", "IDSquadra", "Cognome", "Nome", "Anno", "Attivo"].forEach(campo => {
    if (!intestazioni.includes(campo)) {
      throw new Error(`Nel foglio GIOCATORI manca la colonna: ${campo}`);
    }
  });

  const giocatori = leggiGiocatori(idSquadra);
  const duplicato = giocatori.find(g =>
    String(g.IDGiocatore || "").trim() !== idGiocatore &&
    String(g.Cognome || "").trim().toUpperCase() === cognome.toUpperCase() &&
    String(g.Nome || "").trim().toUpperCase() === nome.toUpperCase()
  );
  if (duplicato) throw new Error(`${cognome} ${nome} è già presente nella squadra.`);

  let idFinale = idGiocatore;
  let numeroRiga = 0;

  if (idGiocatore) {
    const ids = foglio
      .getRange(2, intestazioni.indexOf("IDGiocatore") + 1, Math.max(foglio.getLastRow() - 1, 1), 1)
      .getDisplayValues()
      .flat();

    const indice = ids.findIndex(id => String(id).trim() === idGiocatore);
    if (indice === -1) throw new Error("Giocatore non trovato.");
    numeroRiga = indice + 2;
  } else {
    idFinale = generaIdGiocatore_(idSquadra);
    numeroRiga = foglio.getLastRow() + 1;
  }

  const valoriRiga = intestazioni.map(campo => {
    if (campo === "IDGiocatore") return idFinale;
    if (campo === "IDSquadra") return idSquadra;
    if (campo === "Cognome") return cognome;
    if (campo === "Nome") return nome;
    if (campo === "Anno") return anno;
    if (campo === "Attivo") return attivo;

    if (numeroRiga <= foglio.getLastRow()) {
      return foglio.getRange(numeroRiga, intestazioni.indexOf(campo) + 1).getValue();
    }
    return "";
  });

  foglio.getRange(numeroRiga, 1, 1, intestazioni.length).setValues([valoriRiga]);
  SpreadsheetApp.flush();

  return {
    IDGiocatore: idFinale,
    IDSquadra: idSquadra,
    Cognome: cognome,
    Nome: nome,
    Anno: anno,
    Attivo: attivo
  };
}

function generaIdGiocatore_(idSquadra) {
  const giocatori = leggiGiocatori(idSquadra);
  let numeroMassimo = 0;

  giocatori.forEach(giocatore => {
    const id = String(giocatore.IDGiocatore || "").trim();
    const prefisso = `${idSquadra}-`;
    if (!id.startsWith(prefisso)) return;

    const numero = parseInt(id.substring(prefisso.length), 10);
    if (!isNaN(numero) && numero > numeroMassimo) numeroMassimo = numero;
  });

  return `${idSquadra}-${String(numeroMassimo + 1).padStart(4, "0")}`;
}

function verificaSquadraEsistente_(idSquadra) {
  const squadre = leggiFoglioComeOggetti_("SQUADRE");

  const squadraTrovata = squadre.find(squadra =>
    String(squadra.IDSquadra).trim().toUpperCase() === idSquadra &&
    String(squadra.Attiva || "SI").trim().toUpperCase() !== "NO"
  );

  if (!squadraTrovata) {
    throw new Error(`Squadra non trovata o non attiva: ${idSquadra}`);
  }

  return squadraTrovata;
}


function leggiStaff() {
  return leggiFoglioComeOggetti_("STAFF");
}

function salvaStaffTeamCenter_(parametri) {
  const idStaff = String(parametri.idStaff || "").trim();
  const cognome = String(parametri.cognome || "").trim();
  const nome = String(parametri.nome || "").trim();
  const ruolo = String(parametri.ruolo || "").trim();
  const attivo = String(parametri.attivo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI";

  const ruoliConsentiti = [
    "Allenatore",
    "Viceallenatore",
    "Preparatore atletico",
    "Preparatore portieri",
    "Dirigente",
    "Direttore"
  ];

  if (!cognome) throw new Error("Cognome obbligatorio.");
  if (!nome) throw new Error("Nome obbligatorio.");
  if (!ruolo) throw new Error("Ruolo obbligatorio.");
  if (!ruoliConsentiti.includes(ruolo)) throw new Error("Ruolo non valido.");

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("STAFF");
  if (!foglio) throw new Error("Foglio STAFF non trovato.");

  const intestazioni = foglio
    .getRange(1, 1, 1, foglio.getLastColumn())
    .getDisplayValues()[0]
    .map(v => String(v).trim());

  ["IDStaff", "Cognome", "Nome", "Ruolo", "Attivo"].forEach(campo => {
    if (!intestazioni.includes(campo)) {
      throw new Error(`Nel foglio STAFF manca la colonna: ${campo}`);
    }
  });

  const staff = leggiStaff();

  const duplicato = staff.find(item =>
    String(item.IDStaff || "").trim() !== idStaff &&
    String(item.Cognome || "").trim().toUpperCase() === cognome.toUpperCase() &&
    String(item.Nome || "").trim().toUpperCase() === nome.toUpperCase() &&
    String(item.Ruolo || "").trim() === ruolo
  );

  if (duplicato) {
    throw new Error(`${cognome} ${nome} è già presente con il ruolo ${ruolo}.`);
  }

  let idFinale = idStaff;
  let numeroRiga = 0;

  if (idStaff) {
    const ids = foglio
      .getRange(
        2,
        intestazioni.indexOf("IDStaff") + 1,
        Math.max(foglio.getLastRow() - 1, 1),
        1
      )
      .getDisplayValues()
      .flat();

    const indice = ids.findIndex(id => String(id).trim() === idStaff);
    if (indice === -1) throw new Error("Componente dello staff non trovato.");
    numeroRiga = indice + 2;
  } else {
    idFinale = generaIdStaff_();
    numeroRiga = foglio.getLastRow() + 1;
  }

  const valoriRiga = intestazioni.map(campo => {
    if (campo === "IDStaff") return idFinale;
    if (campo === "Cognome") return cognome;
    if (campo === "Nome") return nome;
    if (campo === "Ruolo") return ruolo;
    if (campo === "Attivo") return attivo;

    if (numeroRiga <= foglio.getLastRow()) {
      return foglio.getRange(numeroRiga, intestazioni.indexOf(campo) + 1).getValue();
    }

    return "";
  });

  foglio
    .getRange(numeroRiga, 1, 1, intestazioni.length)
    .setValues([valoriRiga]);

  SpreadsheetApp.flush();

  return {
    IDStaff: idFinale,
    Cognome: cognome,
    Nome: nome,
    Ruolo: ruolo,
    Attivo: attivo
  };
}

function generaIdStaff_() {
  const staff = leggiStaff();
  let numeroMassimo = 0;

  staff.forEach(item => {
    const id = String(item.IDStaff || "").trim();
    if (!id.startsWith("STAFF-")) return;

    const numero = parseInt(id.substring(6), 10);
    if (!isNaN(numero) && numero > numeroMassimo) numeroMassimo = numero;
  });

  return `STAFF-${String(numeroMassimo + 1).padStart(4, "0")}`;
}


function leggiAllenamenti() {
  return leggiFoglioComeOggetti_("ALLENAMENTI");
}

function validaDataAllenamento_(dataISO) {
  const valore = String(dataISO || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    throw new Error("Data allenamento non valida. Usa il formato AAAA-MM-GG.");
  }

  const parti = valore.split("-").map(Number);
  const anno = parti[0];
  const mese = parti[1];
  const giorno = parti[2];
  const data = new Date(Date.UTC(anno, mese - 1, giorno));

  const dataValida =
    data.getUTCFullYear() === anno &&
    data.getUTCMonth() === mese - 1 &&
    data.getUTCDate() === giorno;

  if (!dataValida) {
    throw new Error("La data dell'allenamento non esiste.");
  }

  return valore;
}

function salvaAllenamentoTeamCenter_(parametri) {
  const idSquadra = String(parametri.idSquadra || "").trim().toUpperCase();
  const squadra = String(parametri.squadra || "").trim();
  const seduta = String(parametri.seduta || "").trim();
  const presenzeRaw = String(parametri.presenze || "[]");

  if (!idSquadra) throw new Error("Squadra obbligatoria.");
  if (!squadra) throw new Error("Nome squadra obbligatorio.");
  validaDataAllenamento_(seduta);

  let presenze;
  try {
    presenze = JSON.parse(presenzeRaw);
  } catch (errore) {
    throw new Error("Dati presenze non validi.");
  }

  if (!Array.isArray(presenze) || presenze.length === 0) {
    throw new Error("Nessun giocatore presente nella registrazione.");
  }

  const statiConsentiti = ["Presente", "Assente", "Giustificato", "Infortunato"];

  presenze.forEach(item => {
    if (!String(item.id || "").trim()) {
      throw new Error("Uno dei giocatori non ha un ID valido.");
    }

    if (!statiConsentiti.includes(String(item.stato || "").trim())) {
      const nominativo = `${item.cognome || ""} ${item.nome || ""}`.trim();
      throw new Error(`Stato non valido per ${nominativo || "un giocatore"}.`);
    }
  });

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("ALLENAMENTI");

  if (!foglio) {
    throw new Error("Foglio ALLENAMENTI non trovato.");
  }

  const intestazioni = foglio
    .getRange(1, 1, 1, foglio.getLastColumn())
    .getDisplayValues()[0]
    .map(valore => String(valore).trim());

  const obbligatorie = [
    "IDAllenamento",
    "IDSquadra",
    "Squadra",
    "Seduta",
    "Presenze",
    "UltimoAggiornamento"
  ];

  obbligatorie.forEach(campo => {
    if (!intestazioni.includes(campo)) {
      throw new Error(`Nel foglio ALLENAMENTI manca la colonna: ${campo}`);
    }
  });

  const idAllenamento = generaIdAllenamento_();
  const ultimoAggiornamento = new Date();

  const valori = intestazioni.map(campo => {
    if (campo === "IDAllenamento") return idAllenamento;
    if (campo === "IDSquadra") return idSquadra;
    if (campo === "Squadra") return squadra;
    if (campo === "Seduta") return seduta;
    if (campo === "Presenze") return presenzeRaw;
    if (campo === "UltimoAggiornamento") return ultimoAggiornamento;
    return "";
  });

  foglio.appendRow(valori);
  SpreadsheetApp.flush();

  return {
    IDAllenamento: idAllenamento,
    IDSquadra: idSquadra,
    Squadra: squadra,
    Seduta: seduta,
    Presenze: presenzeRaw,
    UltimoAggiornamento: ultimoAggiornamento.toISOString()
  };
}

function generaIdAllenamento_() {
  const allenamenti = leggiAllenamenti();
  let massimo = 0;

  allenamenti.forEach(item => {
    const id = String(item.IDAllenamento || "").trim();
    if (!id.startsWith("ALL-")) return;

    const numero = parseInt(id.substring(4), 10);
    if (!isNaN(numero) && numero > massimo) {
      massimo = numero;
    }
  });

  return `ALL-${String(massimo + 1).padStart(4, "0")}`;
}


function leggiConvocazioni() {
  return leggiFoglioComeOggetti_("CONVOCAZIONI");
}

function salvaConvocazioneTeamCenter_(parametri) {
  const dati = {
    IDSquadra: String(parametri.idSquadra || "").trim().toUpperCase(),
    Squadra: String(parametri.squadra || "").trim(),
    Campionato: String(parametri.campionato || "").trim(),
    Giornata: String(parametri.giornata || "").trim(),
    Data: String(parametri.data || "").trim(),
    Avversario: String(parametri.avversario || "").trim(),
    OrarioPartita: String(parametri.orarioPartita || "").trim(),
    OrarioConvocazione: String(parametri.orarioConvocazione || "").trim(),
    Sede: String(parametri.sede || "CASA").trim().toUpperCase(),
    Indirizzo: String(parametri.indirizzo || "").trim(),
    Giocatori: String(parametri.giocatori || "[]"),
    Staff: String(parametri.staff || "[]")
  };

  if (!dati.IDSquadra) throw new Error("Squadra obbligatoria.");
  if (!dati.Campionato) throw new Error("Campionato obbligatorio.");
  if (!dati.Giornata) throw new Error("Giornata obbligatoria.");
  if (!dati.Data) throw new Error("Data obbligatoria.");
  if (!dati.Avversario) throw new Error("Avversario obbligatorio.");
  if (!dati.OrarioPartita) throw new Error("Orario partita obbligatorio.");
  if (!dati.OrarioConvocazione) throw new Error("Orario convocazione obbligatorio.");
  if (!dati.Indirizzo) throw new Error("Indirizzo del campo obbligatorio.");

  let giocatori;
  let staff;

  try {
    giocatori = JSON.parse(dati.Giocatori);
    staff = JSON.parse(dati.Staff);
  } catch (errore) {
    throw new Error("Dati giocatori o staff non validi.");
  }

  if (!Array.isArray(giocatori) || giocatori.length === 0) {
    throw new Error("Seleziona almeno un giocatore.");
  }

  if (!Array.isArray(staff)) {
    throw new Error("Dati staff non validi.");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("CONVOCAZIONI");

  if (!foglio) {
    throw new Error("Foglio CONVOCAZIONI non trovato.");
  }

  const intestazioni = foglio
    .getRange(1, 1, 1, foglio.getLastColumn())
    .getDisplayValues()[0]
    .map(valore => String(valore).trim());

  const obbligatorie = [
    "IDConvocazione",
    "IDSquadra",
    "Squadra",
    "Campionato",
    "Giornata",
    "Data",
    "Avversario",
    "OrarioPartita",
    "OrarioConvocazione",
    "Sede",
    "Indirizzo",
    "Giocatori",
    "Staff",
    "UltimoAggiornamento"
  ];

  obbligatorie.forEach(campo => {
    if (!intestazioni.includes(campo)) {
      throw new Error(`Nel foglio CONVOCAZIONI manca la colonna: ${campo}`);
    }
  });

  const idConvocazione = generaIdConvocazione_();
  const ultimoAggiornamento = new Date();

  const valori = intestazioni.map(campo => {
    if (campo === "IDConvocazione") return idConvocazione;
    if (campo === "UltimoAggiornamento") return ultimoAggiornamento;
    if (Object.prototype.hasOwnProperty.call(dati, campo)) return dati[campo];
    return "";
  });

  foglio.appendRow(valori);
  SpreadsheetApp.flush();

  return {
    IDConvocazione: idConvocazione,
    ...dati,
    UltimoAggiornamento: ultimoAggiornamento.toISOString()
  };
}

function generaIdConvocazione_() {
  const convocazioni = leggiConvocazioni();
  let massimo = 0;

  convocazioni.forEach(item => {
    const id = String(item.IDConvocazione || "").trim();
    if (!id.startsWith("CONV-")) return;

    const numero = parseInt(id.substring(5), 10);
    if (!isNaN(numero) && numero > massimo) massimo = numero;
  });

  return `CONV-${String(massimo + 1).padStart(4, "0")}`;
}



function leggiMatch() {
  return leggiFoglioComeOggetti_("MATCH");
}

function salvaMatchTeamCenter_(parametri) {
  const dati = {
    IDConvocazione: String(parametri.idConvocazione || "").trim(),
    IDSquadra: String(parametri.idSquadra || "").trim().toUpperCase(),
    Squadra: String(parametri.squadra || "").trim(),
    Campionato: String(parametri.campionato || "").trim(),
    Giornata: String(parametri.giornata || "").trim(),
    Data: String(parametri.data || "").trim(),
    Avversario: String(parametri.avversario || "").trim(),
    Sede: String(parametri.sede || "").trim().toUpperCase(),
    RisultatoCasa: String(parametri.risultatoCasa || "0").trim(),
    RisultatoTrasferta: String(parametri.risultatoTrasferta || "0").trim(),
    Stato: String(parametri.stato || "IN CORSO").trim().toUpperCase(),
    TempoPartita: String(parametri.tempoPartita || "{}"),
    Eventi: String(parametri.eventi || "[]"),
    Giocatori: String(parametri.giocatori || "[]"),
    Staff: String(parametri.staff || "[]")
  };

  if (!dati.IDConvocazione) throw new Error("ID convocazione obbligatorio.");
  if (!dati.IDSquadra) throw new Error("Squadra obbligatoria.");
  if (!dati.Squadra) throw new Error("Nome squadra obbligatorio.");
  if (!dati.Campionato) throw new Error("Campionato obbligatorio.");
  if (!dati.Giornata) throw new Error("Giornata obbligatoria.");
  if (!dati.Data) throw new Error("Data obbligatoria.");
  if (!dati.Avversario) throw new Error("Avversario obbligatorio.");

  try {
    const eventi = JSON.parse(dati.Eventi);
    const giocatori = JSON.parse(dati.Giocatori);
    const staff = JSON.parse(dati.Staff);
    JSON.parse(dati.TempoPartita);

    if (!Array.isArray(eventi)) throw new Error();
    if (!Array.isArray(giocatori) || giocatori.length === 0) {
      throw new Error("Nessun giocatore convocato nel match.");
    }
    if (!Array.isArray(staff)) throw new Error();
  } catch (errore) {
    if (errore && errore.message === "Nessun giocatore convocato nel match.") throw errore;
    throw new Error("Dati Match non validi.");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("MATCH");
  if (!foglio) throw new Error("Foglio MATCH non trovato.");

  const intestazioni = foglio
    .getRange(1, 1, 1, foglio.getLastColumn())
    .getDisplayValues()[0]
    .map(valore => String(valore).trim());

  const obbligatorie = [
    "IDMatch",
    "IDConvocazione",
    "IDSquadra",
    "Squadra",
    "Campionato",
    "Giornata",
    "Data",
    "Avversario",
    "Sede",
    "RisultatoCasa",
    "RisultatoTrasferta",
    "Stato",
    "TempoPartita",
    "Eventi",
    "Giocatori",
    "Staff",
    "UltimoAggiornamento"
  ];

  obbligatorie.forEach(campo => {
    if (!intestazioni.includes(campo)) {
      throw new Error(`Nel foglio MATCH manca la colonna: ${campo}`);
    }
  });

  const righe = leggiMatch();
  const esistente = righe.find(item =>
    String(item.IDConvocazione || "").trim() === dati.IDConvocazione
  );

  const idMatch = esistente
    ? String(esistente.IDMatch || "").trim()
    : generaIdMatch_();

  let numeroRiga = foglio.getLastRow() + 1;

  if (esistente) {
    const ids = foglio
      .getRange(2, intestazioni.indexOf("IDMatch") + 1, Math.max(foglio.getLastRow() - 1, 1), 1)
      .getDisplayValues()
      .flat();

    const indice = ids.findIndex(id => String(id).trim() === idMatch);
    if (indice !== -1) numeroRiga = indice + 2;
  }

  const ultimoAggiornamento = new Date();
  const valori = intestazioni.map(campo => {
    if (campo === "IDMatch") return idMatch;
    if (campo === "UltimoAggiornamento") return ultimoAggiornamento;
    if (Object.prototype.hasOwnProperty.call(dati, campo)) return dati[campo];

    if (numeroRiga <= foglio.getLastRow()) {
      return foglio.getRange(numeroRiga, intestazioni.indexOf(campo) + 1).getValue();
    }
    return "";
  });

  foglio.getRange(numeroRiga, 1, 1, intestazioni.length).setValues([valori]);
  SpreadsheetApp.flush();

  return {
    IDMatch: idMatch,
    ...dati,
    UltimoAggiornamento: ultimoAggiornamento.toISOString()
  };
}

function generaIdMatch_() {
  const match = leggiMatch();
  let massimo = 0;

  match.forEach(item => {
    const id = String(item.IDMatch || "").trim();
    if (!id.startsWith("MATCH-")) return;

    const numero = parseInt(id.substring(6), 10);
    if (!isNaN(numero) && numero > massimo) massimo = numero;
  });

  return `MATCH-${String(massimo + 1).padStart(4, "0")}`;
}

function loginAdminTeamCenter_(parametri) {
  const passwordInserita = String(parametri.password || "");
  const passwordCorretta = PropertiesService
    .getScriptProperties()
    .getProperty("ADMIN_PASSWORD");

  if (!passwordCorretta) {
    throw new Error("Password amministratore non configurata nelle Proprietà dello script.");
  }

  if (!passwordInserita || passwordInserita !== passwordCorretta) {
    throw new Error("Password amministratore non corretta.");
  }

  const token = Utilities.getUuid() + Utilities.getUuid();

  CacheService
    .getScriptCache()
    .put("ADMIN_SESSION_" + token, "VALIDA", 3600);

  return { token: token, durataMinuti: 60 };
}

function verificaSessioneAdminTeamCenter_(token) {
  const tokenPulito = String(token || "").trim();
  if (!tokenPulito) throw new Error("Sessione amministratore mancante.");

  const sessione = CacheService
    .getScriptCache()
    .get("ADMIN_SESSION_" + tokenPulito);

  if (sessione !== "VALIDA") {
    throw new Error("Sessione amministratore scaduta. Accedi nuovamente.");
  }

  return { valida: true };
}

function logoutAdminTeamCenter_(token) {
  const tokenPulito = String(token || "").trim();

  if (tokenPulito) {
    CacheService
      .getScriptCache()
      .remove("ADMIN_SESSION_" + tokenPulito);
  }

  return { logout: true };
}

function salvaMasterTeamCenter_(parametri) {
  verificaSessioneAdminTeamCenter_(parametri.token);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const foglio = spreadsheet.getSheetByName("MASTER");
  if (!foglio) throw new Error("Foglio MASTER non trovato.");

  const ultimaColonna = foglio.getLastColumn();
  const intestazioni = foglio
    .getRange(1, 1, 1, ultimaColonna)
    .getDisplayValues()[0]
    .map(valore => String(valore).trim());

  const campiConsentiti = {
    NomeSocieta: leggiParametro_(parametri, ["NomeSocieta", "nomeSocieta"]),
    Stagione: leggiParametro_(parametri, ["Stagione", "stagione"]),
    Campo: leggiParametro_(parametri, ["Campo", "campo"]),
    Indirizzo: leggiParametro_(parametri, ["Indirizzo", "indirizzo"]),
    ColorePrimario: leggiParametro_(parametri, ["ColorePrimario", "colorePrimario"]),
    ColoreSecondario: leggiParametro_(parametri, ["ColoreSecondario", "coloreSecondario"])
  };

  if (campiConsentiti.NomeSocieta === undefined ||
      !String(campiConsentiti.NomeSocieta).trim()) {
    throw new Error("Il nome della società non può essere vuoto.");
  }

  validaColore_(campiConsentiti.ColorePrimario, "ColorePrimario");
  validaColore_(campiConsentiti.ColoreSecondario, "ColoreSecondario");

  const valoriAttuali = foglio
    .getRange(2, 1, 1, ultimaColonna)
    .getValues()[0];

  Object.keys(campiConsentiti).forEach(nomeCampo => {
    const nuovoValore = campiConsentiti[nomeCampo];
    if (nuovoValore === undefined) return;

    const indice = intestazioni.indexOf(nomeCampo);
    if (indice === -1) {
      throw new Error(`Colonna non trovata nel foglio MASTER: ${nomeCampo}`);
    }

    valoriAttuali[indice] = String(nuovoValore).trim();
  });

  const indiceUltimoAggiornamento = intestazioni.indexOf("UltimoAggiornamento");
  if (indiceUltimoAggiornamento !== -1) valoriAttuali[indiceUltimoAggiornamento] = new Date();

  foglio.getRange(2, 1, 1, ultimaColonna).setValues([valoriAttuali]);
  SpreadsheetApp.flush();

  return leggiPrimaRigaComeOggetto_("MASTER");
}

function leggiParametro_(parametri, nomi) {
  for (let indice = 0; indice < nomi.length; indice++) {
    const nome = nomi[indice];
    if (Object.prototype.hasOwnProperty.call(parametri, nome)) return parametri[nome];
  }
  return undefined;
}

function validaColore_(valore, nomeCampo) {
  if (valore === undefined || String(valore).trim() === "") return;

  const colore = String(valore).trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(colore)) {
    throw new Error(`${nomeCampo} deve essere nel formato HEX, ad esempio #751D2D.`);
  }
}

function recuperaLogoTeamCenter_() {
  const master = leggiPrimaRigaComeOggetto_("MASTER");
  const nomeFile = String(master.LogoFile || "").trim();

  if (!nomeFile) throw new Error("LogoFile non indicato nel foglio MASTER.");

  const files = DriveApp.getFilesByName(nomeFile);
  if (!files.hasNext()) throw new Error(`Logo non trovato su Google Drive: ${nomeFile}`);

  const blob = files.next().getBlob();
  const mimeType = blob.getContentType() || "image/png";
  const base64 = Utilities.base64Encode(blob.getBytes());

  return {
    nomeFile: nomeFile,
    mimeType: mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`
  };
}

function generaReportAllenamentiTeamCenter_(parametri) {
  verificaSessioneAdminTeamCenter_(parametri.token);

  const idSquadra = String(parametri.idSquadra || "").trim().toUpperCase();
  const dal = normalizzaDataReport_(parametri.dal);
  const al = normalizzaDataReport_(parametri.al);

  if (!idSquadra) throw new Error("Squadra obbligatoria.");
  if (!dal || !al) throw new Error("Periodo del report non valido.");
  if (dal > al) throw new Error("La data iniziale non può essere successiva alla data finale.");

  const squadra = verificaSquadraEsistente_(idSquadra);
  const nomeSquadra = String(squadra.NomeSquadra || squadra.Squadra || idSquadra).trim();
  const master = leggiPrimaRigaComeOggetto_("MASTER");

  const allenamenti = leggiAllenamenti()
    .map(item => ({ ...item, DataReport: normalizzaDataReport_(item.Seduta || item.DataAllenamento || "") }))
    .filter(item =>
      String(item.IDSquadra || "").trim().toUpperCase() === idSquadra &&
      item.DataReport && item.DataReport >= dal && item.DataReport <= al
    )
    .sort((a, b) => a.DataReport.localeCompare(b.DataReport));

  if (!allenamenti.length) {
    throw new Error("Nessun allenamento trovato per la squadra e il periodo selezionati.");
  }

  const statistiche = new Map();
  const dettaglio = [];
  const cronologia = [];
  let totalePresenti = 0;

  allenamenti.forEach(allenamento => {
    let presenze;
    try {
      presenze = JSON.parse(String(allenamento.Presenze || "[]"));
    } catch (errore) {
      throw new Error(`Presenze non leggibili per l'allenamento ${allenamento.IDAllenamento || allenamento.DataReport}.`);
    }

    if (!Array.isArray(presenze)) presenze = [];
    const conteggi = { Presente: 0, Assente: 0, Giustificato: 0, Infortunato: 0 };

    presenze.forEach(item => {
      const id = String(item.id || item.IDGiocatore || "").trim();
      const cognome = String(item.cognome || item.Cognome || "").trim();
      const nome = String(item.nome || item.Nome || "").trim();
      const anno = String(item.anno || item.Anno || "").trim();
      const stato = String(item.stato || item.Stato || "").trim();
      const chiave = id || `${cognome}|${nome}`.toUpperCase();

      if (!statistiche.has(chiave)) {
        statistiche.set(chiave, {
          IDGiocatore: id, Cognome: cognome, Nome: nome, Anno: anno,
          Presente: 0, Assente: 0, Giustificato: 0, Infortunato: 0,
          SeduteRegistrate: 0
        });
      }

      const voce = statistiche.get(chiave);
      if (Object.prototype.hasOwnProperty.call(voce, stato)) voce[stato] += 1;
      voce.SeduteRegistrate += 1;
      if (Object.prototype.hasOwnProperty.call(conteggi, stato)) conteggi[stato] += 1;

      dettaglio.push({
        Data: allenamento.DataReport,
        DataItaliana: dataItalianaReport_(allenamento.DataReport),
        IDAllenamento: String(allenamento.IDAllenamento || ""),
        IDGiocatore: id,
        Cognome: cognome,
        Nome: nome,
        Anno: anno,
        Stato: stato
      });
    });

    totalePresenti += conteggi.Presente;
    cronologia.push({
      Data: allenamento.DataReport,
      DataItaliana: dataItalianaReport_(allenamento.DataReport),
      IDAllenamento: String(allenamento.IDAllenamento || ""),
      Presenti: conteggi.Presente,
      Assenti: conteggi.Assente,
      Giustificati: conteggi.Giustificato,
      Infortunati: conteggi.Infortunato,
      TotaleGiocatori: presenze.length
    });
  });

  const righeStatistiche = Array.from(statistiche.values())
    .map(voce => ({
      IDGiocatore: voce.IDGiocatore,
      Cognome: voce.Cognome,
      Nome: voce.Nome,
      Anno: voce.Anno,
      SeduteRegistrate: voce.SeduteRegistrate,
      Presenze: voce.Presente,
      Assenze: voce.Assente,
      Giustificate: voce.Giustificato,
      Infortuni: voce.Infortunato,
      PercentualePresenza: voce.SeduteRegistrate ? voce.Presente / voce.SeduteRegistrate : 0
    }))
    .sort((a, b) => b.PercentualePresenza - a.PercentualePresenza || b.Presenze - a.Presenze || a.Cognome.localeCompare(b.Cognome, "it"));

  const migliore = righeStatistiche[0] || null;
  const mediaPresenze = Math.round((totalePresenti / allenamenti.length) * 10) / 10;
  const riepilogo = {
    societa: String(master.NomeSocieta || "CSV Breda"),
    stagione: String(master.Stagione || ""),
    squadra: nomeSquadra,
    idSquadra: idSquadra,
    dal: dal,
    al: al,
    dalItaliano: dataItalianaReport_(dal),
    alItaliano: dataItalianaReport_(al),
    allenamenti: allenamenti.length,
    mediaPresenzeNumero: mediaPresenze,
    mediaPresenze: String(mediaPresenze).replace(".", ","),
    giocatorePiuPresente: migliore ? `${migliore.Cognome} ${migliore.Nome}`.trim() : "",
    percentualeMiglioreNumero: migliore ? migliore.PercentualePresenza : 0,
    percentualeMigliore: migliore ? `${Math.round(migliore.PercentualePresenza * 10000) / 100}%` : ""
  };

  return {
    nomeFile: `Report_Allenamenti_${idSquadra}_${dal}_${al}.xlsx`,
    riepilogo: riepilogo,
    dettaglio: dettaglio,
    statistiche: righeStatistiche,
    cronologia: cronologia
  };
}

function normalizzaDataReport_(valore) {
  const testo = String(valore || "").trim();
  if (!testo) return "";

  let match = testo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  match = testo.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;

  const data = new Date(testo);
  if (Number.isNaN(data.getTime())) return "";
  return Utilities.formatDate(data, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd");
}

function dataItalianaReport_(dataIso) {
  const parti = String(dataIso || "").split("-");
  if (parti.length !== 3) return String(dataIso || "");
  return `${parti[2]}/${parti[1]}/${parti[0]}`;
}

function preparaFoglioRiepilogo_(foglio, dati) {
  foglio.clear();
  foglio.getRange("A1:D1").merge().setValue(`${dati.societa} · REPORT ALLENAMENTI`);
  foglio.getRange("A2:D2").merge().setValue(`${dati.squadra} · ${dataItalianaReport_(dati.dal)} - ${dataItalianaReport_(dati.al)}`);

  const righe = [
    ["Stagione", dati.stagione || "—", "Squadra", dati.squadra],
    ["Allenamenti svolti", dati.allenamenti, "Media presenze", dati.mediaPresenze],
    ["Giocatore più presente", dati.giocatorePiuPresente, "Percentuale migliore", dati.percentualeMigliore]
  ];
  foglio.getRange(4, 1, righe.length, 4).setValues(righe);

  foglio.getRange("A1:D1").setBackground("#741F35").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center");
  foglio.getRange("A2:D2").setBackground("#EADDE2").setFontColor("#741F35").setFontWeight("bold").setHorizontalAlignment("center");
  foglio.getRange("A4:D6").setBorder(true, true, true, true, true, true);
  foglio.getRange("A4:A6").setFontWeight("bold").setBackground("#F3ECEF");
  foglio.getRange("C4:C6").setFontWeight("bold").setBackground("#F3ECEF");
  foglio.setColumnWidths(1, 4, 190);
  foglio.setFrozenRows(2);
}

function scriviTabellaReport_(foglio, intestazioni, righe) {
  foglio.clear();
  foglio.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni]);
  if (righe.length) foglio.getRange(2, 1, righe.length, intestazioni.length).setValues(righe);
  foglio.getRange(1, 1, 1, intestazioni.length)
    .setBackground("#741F35")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  foglio.setFrozenRows(1);
  foglio.getDataRange().setVerticalAlignment("middle");
  foglio.autoResizeColumns(1, intestazioni.length);
  if (righe.length) foglio.getRange(1, 1, righe.length + 1, intestazioni.length).createFilter();
}


function doGet(e) {
  try {
    const parametri = e && e.parameter ? e.parameter : {};
    const action = String(parametri.action || "ping").trim().toLowerCase();
    let dati;

    switch (action) {
      case "ping":
        dati = {
          applicazione: "TeamCenter API",
          societa: "CSV Breda",
          versione: "2.3.1",
          stato: "online"
        };
        break;

      case "master":
        dati = leggiPrimaRigaComeOggetto_("MASTER");
        break;

      case "loginadmin":
        dati = loginAdminTeamCenter_(parametri);
        break;

      case "verificasessioneadmin":
        dati = verificaSessioneAdminTeamCenter_(parametri.token);
        break;

      case "logoutadmin":
        dati = logoutAdminTeamCenter_(parametri.token);
        break;

      case "salvamaster":
        dati = salvaMasterTeamCenter_(parametri);
        break;

      case "logo":
        dati = recuperaLogoTeamCenter_();
        break;

      case "squadre":
        dati = leggiFoglioComeOggetti_("SQUADRE")
          .filter(squadra =>
            String(squadra.Attiva || "SI").trim().toUpperCase() !== "NO"
          );
        break;

      case "giocatori":
        dati = leggiGiocatori(
          String(parametri.idSquadra || "").trim().toUpperCase()
        );
        break;

      case "salvagiocatore":
        dati = salvaGiocatoreTeamCenter_(parametri);
        break;

      case "staff":
        dati = leggiStaff();
        break;

      case "salvastaff":
        dati = salvaStaffTeamCenter_(parametri);
        break;

      case "allenamenti":
        dati = leggiAllenamenti();
        break;

      case "salvaallenamento":
        dati = salvaAllenamentoTeamCenter_(parametri);
        break;

      case "convocazioni":
        dati = leggiConvocazioni();
        break;

      case "salvaconvocazione":
        dati = salvaConvocazioneTeamCenter_(parametri);
        break;

      case "reportallenamenti":
        dati = generaReportAllenamentiTeamCenter_(parametri);
        break;

      case "match":
        dati = leggiMatch();
        break;

      case "salvamatch":
        dati = salvaMatchTeamCenter_(parametri);
        break;

      default:
        return rispostaJson_(false, null, `Azione GET non riconosciuta: ${action}`);
    }

    return rispostaJson_(true, dati, "");
  } catch (errore) {
    return rispostaJson_(false, null, errore.message || String(errore));
  }
}


function doPost(e) {
  try {
    const parametri = e && e.parameter ? e.parameter : {};
    const action = String(parametri.action || "").trim().toLowerCase();
    let dati;

    switch (action) {
      case "salvamatch":
        dati = salvaMatchTeamCenter_(parametri);
        break;

      default:
        return rispostaJson_(false, null, `Azione POST non riconosciuta: ${action}`);
    }

    return rispostaJson_(true, dati, "");
  } catch (errore) {
    return rispostaJson_(false, null, errore.message || String(errore));
  }
}

function rispostaJson_(successo, dati, errore) {
  const risposta = {
    successo: successo,
    dati: dati,
    errore: errore || "",
    timestamp: new Date().toISOString()
  };

  return ContentService
    .createTextOutput(JSON.stringify(risposta))
    .setMimeType(ContentService.MimeType.JSON);
}
