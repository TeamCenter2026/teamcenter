window.TeamCenterBootstrap = (() => {
  const FALLBACK = {
    NomeSocieta: 'CSV Breda',
    ColorePrimario: '#741f35',
    ColoreSecondario: '#f6f7f9'
  };

  const snapshot = {
    master: null,
    logo: null,
    teams: [],
    ready: false,
    error: null
  };

  function shadeHex(hex, percent) {
    const clean = String(hex || FALLBACK.ColorePrimario).replace('#', '');
    const number = parseInt(clean, 16);
    const amount = Math.round(2.55 * percent);
    const red = Math.max(0, Math.min(255, (number >> 16) + amount));
    const green = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
    const blue = Math.max(0, Math.min(255, (number & 255) + amount));
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function apply(master = FALLBACK, logo = null) {
    const data = { ...FALLBACK, ...(master || {}) };
    const primary = data.ColorePrimario || FALLBACK.ColorePrimario;
    const background = data.ColoreSecondario || FALLBACK.ColoreSecondario;
    const clubName = data.NomeSocieta || FALLBACK.NomeSocieta;

    document.documentElement.style.setProperty('--granata', primary);
    document.documentElement.style.setProperty('--granata-dark', shadeHex(primary, -28));
    document.documentElement.style.setProperty('--granata-soft', shadeHex(primary, 83));
    document.documentElement.style.setProperty('--bg', background);

    const title = document.getElementById('appTitle');
    if (title) title.textContent = clubName.toUpperCase();

    const logoBox = document.getElementById('homeClubLogo');
    if (logoBox) {
      if (logo?.dataUrl) {
        const image = document.createElement('img');
        image.src = logo.dataUrl;
        image.alt = `Logo ufficiale ${clubName}`;
        logoBox.replaceChildren(image);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'home-logo-placeholder';
        fallback.textContent = 'CSV';
        logoBox.replaceChildren(fallback);
      }
    }

    document.title = `${clubName} TeamCenter`;
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', primary);
  }

  async function start() {
    apply();

    if (!window.TeamCenterAPI) {
      snapshot.error = new Error('TeamCenterAPI non disponibile');
      snapshot.ready = true;
      return snapshot;
    }

    try {
      const [master, logo, teams] = await Promise.all([
        window.TeamCenterAPI.getMaster(),
        window.TeamCenterAPI.getLogo().catch(() => null),
        window.TeamCenterAPI.getSquadre().catch(() => [])
      ]);

      snapshot.master = master || {};
      snapshot.logo = logo || null;
      snapshot.teams = Array.isArray(teams) ? teams : [];
      apply(snapshot.master, snapshot.logo);
    } catch (error) {
      snapshot.error = error;
      console.error('Bootstrap TeamCenter non riuscito:', error);
    } finally {
      snapshot.ready = true;
    }

    return snapshot;
  }

  const ready = start();

  return Object.freeze({
    ready,
    snapshot,
    apply
  });
})();
