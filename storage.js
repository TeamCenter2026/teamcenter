window.TeamCenterStorage = Object.freeze({
  get(key, fallback=null){ try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; }catch{return fallback;} },
  set(key, value){ try{ localStorage.setItem(key,JSON.stringify(value)); return true; }catch{return false;} },
  remove(key){ try{ localStorage.removeItem(key); return true; }catch{return false;} },
  exportJson(filename, value){ const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
});
