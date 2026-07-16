window.TeamCenterImage = Object.freeze({
  canvasBlob(canvas,type='image/png',quality=.94){ return new Promise(resolve=>canvas.toBlob(resolve,type,quality)); },
  download(blob,filename){ const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }
});
