window.TeamCenterCallup = Object.freeze({
  meetingTime(kickoff, minutesBefore=105){ if(!kickoff)return {time:'',dayOffset:0}; const [h,m]=kickoff.split(':').map(Number); let total=h*60+m-minutesBefore,dayOffset=0; while(total<0){total+=1440;dayOffset--;} while(total>=1440){total-=1440;dayOffset++;} return {time:`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`,dayOffset}; },
  fileName(club,opponent,date,type='convocazione'){ const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,''); return `${slug(club)}_${slug(opponent)}_${date||'data'}_${slug(type)}`; }
});
