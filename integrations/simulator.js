// Test connector. It generates synthetic scores; use only with a separate test database.
import { setTimeout as delay } from 'node:timers/promises';
const base=(process.env.MHERO_SERVER||'http://localhost:3000').replace(/\/$/,'');
const key=process.env.MHERO_GAME_KEY;
if(!key||!process.argv.includes('--confirm-test')){
  console.error('Test only: set MHERO_SERVER and MHERO_GAME_KEY, then run node integrations/simulator.js --confirm-test. This writes synthetic scores.');process.exit(1);
}
async function api(path,body){const r=await fetch(base+'/api/game'+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});const data=await r.json();if(!r.ok){const e=new Error(data.error);e.status=r.status;throw e;}return data;}
let active=null,pendingResult=null;
console.log('TEST GAME connected to '+base+'. Waiting for tablet Start game.');
while(true){
  try{
    const {match}=await api('/poll',{});
    if(pendingResult){
      try{await api('/matches/'+pendingResult.id+'/results',pendingResult.body);console.log('Test scores saved.');pendingResult=null;active=null;}catch(e){if(e.status===409){console.log('Match ended by staff; test scores discarded.');pendingResult=null;active=null;}else throw e;}
    }else if(!match){active=null;}
    else if(!active||active.id!==match.id){
      active={...match,finishAt:Date.now()+8000};
      await api('/matches/'+match.id+'/start',{});
      console.log('START: '+match.players.map(p=>'Player '+p.slot+': '+p.name).join(' / '));
    }else if(Date.now()>=active.finishAt){
      pendingResult={id:active.id,body:{results:active.players.map((p,i)=>({participantId:p.id,score:1200+i*150}))}};
    }
  }catch(e){console.error('Connection:',e.message);}
  await delay(1000);
}
