window.TeamCenterProfile = Object.freeze({
  normalize(profile={}){ return {clubName:(profile.clubName||'Società').trim(),primaryColor:profile.primaryColor||'#741f35',backgroundColor:profile.backgroundColor||'#f6f7f9'}; },
  apply(profile={}){ const p=this.normalize(profile); document.documentElement.style.setProperty('--granata',p.primaryColor); document.documentElement.style.setProperty('--bg',p.backgroundColor); return p; }
});
