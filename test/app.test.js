import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../lib/app.js';

async function venue(t,mode='three') {
  const dir=mkdtempSync(join(tmpdir(),'mhero-test-'));
  const {app,db,close}=createApp({dataDir:dir});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  let stopped=false;
  const stop=async()=>{if(stopped)return;stopped=true;await new Promise(r=>server.close(r));close();};
  t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
  async function request(path,{body,cookie,key,method,origin}={}){
    const r=await fetch(base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
    const type=r.headers.get('content-type')||'';const data=type.includes('json')?await r.json():await r.text();
    return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  }
  const setup=await request('/setup',{body:{username:'eventadmin',password:'Test-password-8342',venueName:'Test venue',mode}});assert.equal(setup.status,201);
  const admin=setup.cookie;
  async function pair(id){const p=await request('/admin/stations/'+id+'/pairing',{body:{},cookie:admin});const r=await request('/kiosk/pair',{body:{stationId:id,code:p.data.code}});assert.equal(r.status,200);return r.cookie;}
  async function game(id){const r=await request('/admin/stations/'+id+'/game-key',{body:{},cookie:admin});assert.equal(r.status,200);const key=r.data.key;await request('/game/poll',{key,body:{}});return key;}
  async function register(cookie,phone,name='Test Player'){const r=await request('/kiosk/register',{cookie,body:{name,email:'player@example.test',country:'AE',phone}});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.participant;}
  async function start(cookie,ids,requestId=randomUUID()){return request('/kiosk/start',{cookie,body:{participantIds:ids,requestId}});}
  async function finish(key,match,scores){assert.equal((await request('/game/matches/'+match.id+'/start',{key,body:{}})).status,200);return request('/game/matches/'+match.id+'/results',{key,body:{results:match.players.map((p,i)=>({participantId:p.id,score:scores[i]}))}});}
  return {request,db,admin,pair,game,register,start,finish,stop,dir,base};
}

test('Shared registration normalizes phone numbers and limits personal data exposure',async t=>{
  const v=await venue(t), drive=await v.pair('drive'), road=await v.pair('road');
  const p=await v.register(drive,'050 123 4567','Alex Test');
  const found=await v.request('/kiosk/lookup',{cookie:road,body:{country:'AE',phone:'+971501234567'}});
  assert.deepEqual(found.data.participant,p);assert.equal(Object.keys(found.data.participant).length,2);
  const duplicate=await v.request('/kiosk/register',{cookie:drive,body:{name:'Another Test',email:'other@example.test',country:'AE',phone:'+971501234567'}});assert.equal(duplicate.status,409);
  assert.equal((await v.request('/kiosk/lookup',{cookie:drive,body:{country:'AE',phone:'123'}})).status,400);
  assert.equal((await v.request('/admin/participants')).status,401);
  assert.equal((await v.request('/kiosk/lookup',{body:{country:'AE',phone:'0501234567'}})).status,401);
  assert.equal((await v.request('/kiosk/register',{cookie:drive,body:{name:'Bad Email',email:'bad',country:'AE',phone:'0501234568'}})).status,400);
});

test('Start is idempotent, station-bound, acknowledged by the game, and scores retry safely',async t=>{
  const v=await venue(t), cookie=await v.pair('drive'), p=await v.register(cookie,'0501234567');
  assert.equal((await v.start(cookie,[p.id])).status,409);
  const key=await v.game('drive'), otherKey=await v.game('road');
  const requestId=randomUUID();const [a,b]=await Promise.all([v.start(cookie,[p.id],requestId),v.start(cookie,[p.id],requestId)]);
  assert.equal(a.data.match.id,b.data.match.id);const m=a.data.match;assert.equal(m.players[0].name,'Test Player');
  assert.equal((await v.start(cookie,[p.id])).status,409);
  assert.equal((await v.request('/game/matches/'+m.id+'/start',{key:otherKey,body:{}})).status,403);
  const payload={results:[{participantId:p.id,score:1200}]};
  assert.equal((await v.request('/game/matches/'+m.id+'/results',{key,body:payload})).status,409);
  assert.equal((await v.request('/game/poll',{key,body:{}})).data.match.id,m.id);
  assert.equal((await v.finish(key,m,[1200])).status,200);
  assert.equal((await v.request('/game/matches/'+m.id+'/results',{key,body:payload})).status,200);
  assert.equal((await v.request('/game/matches/'+m.id+'/results',{key,body:{results:[{participantId:p.id,score:1201}]}})).status,409);
  assert.equal((await v.request('/game/poll',{key,body:{}})).data.match,null);
  assert.equal((await v.request('/admin/overview',{cookie:v.admin})).data.totals.plays,1);
});

test('Repeated play records every attempt and ranks each participant by their highest score',async t=>{
  const v=await venue(t), c=await v.pair('drive'),key=await v.game('drive');
  const p=await v.register(c,'0501234567','First Player'),q=await v.register(c,'0501234568','Second Player');
  for(const [player,score] of [[p,300],[p,700],[p,100],[q,700]]){const r=await v.start(c,[player.id]);assert.equal(r.status,201);await v.finish(key,r.data.match,[score]);}
  const board=await v.request('/leaderboard/drive');assert.equal(board.data.entries.length,2);assert.deepEqual(board.data.entries.map(x=>x.score),[700,700]);assert.deepEqual(board.data.entries.map(x=>x.rank),[1,1]);
  assert.equal(JSON.stringify(board.data).includes('phone'),false);assert.equal(JSON.stringify(board.data).includes('email'),false);
  assert.equal((await v.request('/admin/overview',{cookie:v.admin})).data.totals.plays,4);
  assert.equal((await v.request('/leaderboard/road')).data.entries.length,0);
});

test('Two-player mode requires distinct players and atomically records both scores',async t=>{
  const v=await venue(t,'duo'), c=await v.pair('duo'),key=await v.game('duo');
  const p=await v.register(c,'0501234567','Player One'),q=await v.register(c,'0501234568','Player Two');
  const config=await v.request('/config');assert.deepEqual(config.data.stations.map(s=>s.id),['duo']);
  assert.equal((await v.start(c,[p.id])).status,400);assert.equal((await v.start(c,[p.id,p.id])).status,400);
  const m=(await v.start(c,[p.id,q.id])).data.match;assert.deepEqual(m.players.map(p=>p.slot),[1,2]);
  await v.request('/game/matches/'+m.id+'/start',{key,body:{}});
  const bad=await v.request('/game/matches/'+m.id+'/results',{key,body:{results:[{participantId:p.id,score:400}]}});assert.equal(bad.status,400);
  assert.equal((await v.request('/leaderboard/drive')).data.entries.length,0);
  assert.equal((await v.finish(key,m,[400,600])).status,200);
  const board=await v.request('/leaderboard/drive');assert.deepEqual(board.data.entries.map(x=>x.name),['Player Two','Player One']);
});

test('Cancellation, bad scores, origin restrictions, one-time pairing, and key replacement are enforced',async t=>{
  const v=await venue(t),c=await v.pair('drive'),key=await v.game('drive'),p=await v.register(c,'0501234567');
  const m=(await v.start(c,[p.id])).data.match;
  await v.request('/game/matches/'+m.id+'/start',{key,body:{}});
  for(const score of [-1,'100',1e13,null])assert.equal((await v.request('/game/matches/'+m.id+'/results',{key,body:{results:[{participantId:p.id,score}]}})).status,400);
  assert.equal((await v.request('/admin/stations/drive/game-key',{cookie:v.admin,body:{}})).status,409);
  assert.equal((await v.request('/admin/matches/'+m.id+'/cancel',{cookie:v.admin,body:{},origin:'https://unrelated.example'})).status,403);
  assert.equal((await v.request('/admin/matches/'+m.id+'/cancel',{cookie:v.admin,body:{}})).status,200);
  assert.equal((await v.request('/game/matches/'+m.id+'/results',{key,body:{results:[{participantId:p.id,score:100}]}})).status,409);
  const next=(await v.start(c,[p.id])).data.match;
  assert.equal((await v.request('/game/matches/'+next.id+'/fail',{key,body:{message:'Game closed'}})).status,200);
  await v.game('drive');assert.equal((await v.request('/game/poll',{key,body:{}})).status,401);
  const pairing=await v.request('/admin/stations/drive/pairing',{cookie:v.admin,body:{}});
  assert.equal((await v.request('/kiosk/pair',{body:{stationId:'drive',code:pairing.data.code}})).status,200);
  assert.equal((await v.request('/kiosk/pair',{body:{stationId:'drive',code:pairing.data.code}})).status,400);
});

test('Exports are protected and spreadsheet formulas escaped; backups are actual SQLite',async t=>{
  const v=await venue(t),c=await v.pair('drive');await v.register(c,'0501234567','=1+1');
  assert.equal((await v.request('/admin/export')).status,401);
  const csv=await v.request('/admin/export',{cookie:v.admin});assert.ok(csv.data.includes('"\'=1+1"'));assert.ok(csv.data.includes('"\'+971501234567"'));
  const backup=await v.request('/admin/backup',{cookie:v.admin});assert.equal(backup.status,200);assert.ok(backup.data.startsWith('SQLite format 3'));
  assert.equal((await v.request('/setup',{body:{}})).status,409);
});

test('Settings, participant editing, and unpairing preserve records',async t=>{
  const v=await venue(t),c=await v.pair('drive'),p=await v.register(c,'0501234567');
  const changed=await v.request('/admin/participants/'+p.id,{cookie:v.admin,method:'PUT',body:{name:'Updated Name',email:'new@example.test',country:'AE',phone:'0501234568'}});assert.equal(changed.status,200);
  assert.equal((await v.request('/admin/participants?q=Updated',{cookie:v.admin})).data.total,1);
  assert.equal((await v.request('/admin/settings',{cookie:v.admin,method:'PUT',body:{venueName:'Second setup',mode:'duo',country:'GB'}})).status,200);
  assert.equal((await v.request('/kiosk/status',{cookie:c})).status,401);
  assert.equal((await v.request('/admin/overview',{cookie:v.admin})).data.totals.participants,1);
  const duo=await v.pair('duo');await v.request('/admin/stations/duo/unpair',{cookie:v.admin,body:{}});assert.equal((await v.request('/kiosk/status',{cookie:duo})).status,401);
});

test('Host restart and restored database snapshots preserve completed records',async t=>{
  const v=await venue(t),c=await v.pair('drive'),key=await v.game('drive'),p=await v.register(c,'0501234567');
  const m=(await v.start(c,[p.id])).data.match;await v.finish(key,m,[875]);
  const backup=await fetch(v.base+'/api/admin/backup',{headers:{Cookie:v.admin}});assert.equal(backup.status,200);
  const bytes=Buffer.from(await backup.arrayBuffer());await v.stop();
  const restarted=createApp({dataDir:v.dir});
  assert.equal(restarted.db.prepare('SELECT name FROM participants WHERE id=?').get(p.id).name,'Test Player');
  assert.equal(restarted.db.prepare('SELECT score FROM match_players WHERE match_id=?').get(m.id).score,875);
  assert.equal(restarted.db.prepare('SELECT username FROM admins').get().username,'eventadmin');restarted.close();
  const restoreDir=mkdtempSync(join(tmpdir(),'mhero-restore-test-'));t.after(()=>rmSync(restoreDir,{recursive:true,force:true}));
  writeFileSync(join(restoreDir,'mhero.sqlite'),bytes);
  const restored=createApp({dataDir:restoreDir});
  assert.equal(restored.db.prepare('SELECT status FROM matches WHERE id=?').get(m.id).status,'completed');
  assert.equal(restored.db.prepare('SELECT score FROM match_players WHERE match_id=?').get(m.id).score,875);restored.close();
});

test('Isolated venue databases and stale game connections do not share state',async t=>{
  const a=await venue(t),b=await venue(t,'duo');const c=await a.pair('drive');await a.game('drive');const p=await a.register(c,'0501234567');
  assert.equal((await b.request('/admin/overview',{cookie:b.admin})).data.totals.participants,0);
  a.db.prepare('UPDATE stations SET last_seen=? WHERE id=?').run(Date.now()-13000,'drive');
  assert.equal((await a.request('/kiosk/status',{cookie:c})).data.station.online,false);
  assert.equal((await a.start(c,[p.id])).status,409);
  assert.equal((await b.request('/admin/overview',{cookie:a.admin})).status,401);
});
