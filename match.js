window.TeamCenterMatch = Object.freeze({
  clock(ms,baseMinutes=0){ const safe=Math.max(0,Math.floor(ms))+baseMinutes*60000,total=Math.floor(safe/1000); return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}:${String(Math.floor((safe%1000)/10)).padStart(2,'0')}`; },
  isStoppage(ms){ return ms>=45*60*1000; }
});
