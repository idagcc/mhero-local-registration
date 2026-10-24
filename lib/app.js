import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const now = () => new Date().toISOString();
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const safeText = (value, label, min, max) => {
  if (typeof value !== 'string') fail(400, `${label} is required.`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min || clean.length > max || /[\x00-\x1f\x7f]/.test(clean)) fail(400, `${label} must be ${min}–${max} characters.`);
  return clean;
};
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, digest] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
}
const countries = getCountries().map(code => ({ code, name: new Intl.DisplayNames(['en'], { type: 'region' }).of(code), dial: '+' + getCountryCallingCode(code) })).sort((a,b) => a.name.localeCompare(b.name));
function phone(value, country = 'AE') {
  if (!countries.some(c => c.code === country) || typeof value !== 'string' || value.length > 40 || !/^[+\d\s().-]+$/.test(value)) fail(400, 'Enter a valid phone number and country.');
  const parsed = parsePhoneNumberFromString(value, country);
  if (!parsed?.isValid() || parsed.ext) fail(400, 'Please check your phone number and country code.');
  return parsed.number;
}
function personFields(body) {
  const name = safeText(body.name, 'Name', 2, 80);
  const email = safeText(body.email, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  return { name, email, phone: phone(body.phone, body.country), country: body.country || 'AE' };
}
const csvCell = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""') + '"';
export function createApp({ dataDir = resolve(ROOT, 'data'), localSetup = true } = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const db = new DatabaseSync(resolve(dataDir, 'mhero.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), venue_name TEXT NOT NULL, mode TEXT NOT NULL, country TEXT NOT NULL);
    INSERT OR IGNORE INTO settings VALUES (1,'MHERO Experience','three','AE');
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, station_id TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT OR IGNORE INTO games VALUES ('drive','Drive to Dominate'),('road','Own the Road'),('power','Unleash the Power');
    CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), name TEXT NOT NULL, players INTEGER NOT NULL, enabled INTEGER NOT NULL, last_seen INTEGER, game_key_hash TEXT, pairing_hash TEXT, pairing_expiry INTEGER);
    INSERT OR IGNORE INTO stations (id,game_id,name,players,enabled) VALUES ('drive','drive','Drive to Dominate',1,1),('road','road','Own the Road',1,1),('power','power','Unleash the Power',1,1),('duo','drive','Drive to Dominate · Two players',2,0);
    CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, country TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id), game_id TEXT NOT NULL REFERENCES games(id), status TEXT NOT NULL CHECK(status IN ('pending','running','completed','cancelled','failed')), request_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, error TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_match ON matches(station_id) WHERE status IN ('pending','running');
    CREATE TABLE IF NOT EXISTS match_players (match_id TEXT NOT NULL REFERENCES matches(id), participant_id TEXT NOT NULL REFERENCES participants(id), slot INTEGER NOT NULL, display_name TEXT NOT NULL, score REAL, PRIMARY KEY(match_id,participant_id), UNIQUE(match_id,slot));
    CREATE INDEX IF NOT EXISTS match_created ON matches(created_at);
    CREATE INDEX IF NOT EXISTS participant_history ON match_players(participant_id);
  `);
  chmodSync(resolve(dataDir, 'mhero.sqlite'), 0o600);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const settings = () => get('SELECT venue_name AS venueName, mode, country FROM settings WHERE id=1');
  const initialized = () => !!get('SELECT id FROM admins WHERE id=1');
  const stationView = s => ({ id:s.id, gameId:s.game_id, name:s.name, players:s.players, enabled:!!s.enabled, online:!!s.last_seen && Date.now()-s.last_seen < 12000, lastSeen:s.last_seen, gameConfigured:!!s.game_key_hash });
  const matchView = id => {
    const m = get('SELECT * FROM matches WHERE id=?', id);
    if (!m) fail(404, 'Match not found.');
    return { id:m.id, stationId:m.station_id, gameId:m.game_id, status:m.status, createdAt:m.created_at, startedAt:m.started_at, finishedAt:m.finished_at, error:m.error,
      players:all('SELECT participant_id AS id, slot, display_name AS name, score FROM match_players WHERE match_id=? ORDER BY slot', id) };
  };
  const cookieOptions = { httpOnly:true, sameSite:'strict', secure:false, path:'/' };
  const sessionCookie = (role) => role === 'admin' ? 'mhero_admin' : 'mhero_station';
  const newSession = (res, role, stationId = null) => {
    const value = secret(); const age = role === 'admin' ? 12*3600000 : 90*86400000;
    run('DELETE FROM auth_sessions WHERE expires_at < ?', Date.now());
    run('INSERT INTO auth_sessions VALUES (?,?,?,?)', hash(value),role,stationId,Date.now()+age);
    res.cookie(sessionCookie(role),value,{...cookieOptions,maxAge:age});
  };
  const readSession = (req, role) => {
    const item = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(sessionCookie(role)+'='));
    if (!item) return null;
    const s = get('SELECT * FROM auth_sessions WHERE token_hash=? AND role=? AND expires_at>?', hash(item.slice(item.indexOf('=')+1)),role,Date.now());
    return s || null;
  };
  const admin = (req,res,next) => { if (!readSession(req,'admin')) return res.status(401).json({error:'Please sign in to the admin panel.'}); next(); };
  const kiosk = (req,res,next) => {
    const session = readSession(req,'kiosk');
    const station = session && get('SELECT * FROM stations WHERE id=? AND enabled=1', session.station_id);
    if (!station) return res.status(401).json({error:'This tablet needs to be paired by an administrator.',code:'PAIR_REQUIRED'});
    req.station = station; req.kiosk = session; next();
  };
  const game = (req,res,next) => {
    const token = req.headers.authorization?.replace(/^Bearer /,'');
    const station = token && get('SELECT * FROM stations WHERE game_key_hash=? AND enabled=1', hash(token));
    if (!station) return res.status(401).json({error:'Invalid game key or disabled station.'});
    req.station = station; next();
  };
  const attempts = new Map();
  const limit = (name,max,windowMs) => (req,res,next) => {
    const key = name+':'+req.socket.remoteAddress;
    const t = Date.now(); let entry=attempts.get(key);
    if (!entry || entry.reset<t) { entry={count:0,reset:t+windowMs}; attempts.set(key,entry); }
    if (attempts.size>10000) for (const [k,v] of attempts) if(v.reset<t) attempts.delete(k);
    if (++entry.count>max) return res.status(429).json({error:'Too many attempts. Please wait a minute and try again.'});
    next();
  };
  const app = express(); app.disable('x-powered-by');
  app.use((req,res,next) => {
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
    if(req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({error:'Cross-site requests are not permitted.'}); } catch { return res.status(403).json({error:'Invalid origin.'}); }
    }
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !req.is('application/json')) return res.status(415).json({error:'Use application/json.'});
    next();
  });
  app.use(express.json({limit:'32kb'}));
  app.get('/api/config',(req,res) => res.json({initialized:initialized(),...settings(),countries,games:all('SELECT * FROM games'),stations:all('SELECT * FROM stations WHERE enabled=1 ORDER BY rowid').map(stationView)}));
  app.get('/api/health',(req,res) => res.json({ok:true,version:'1.0.0'}));
  app.post('/api/setup',limit('setup',10,60000),(req,res) => {
    if (initialized()) fail(409,'This venue has already been set up.');
    if (localSetup && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) fail(403,'Open localhost on the host Mac to set up this venue.');
    const username = safeText(req.body.username,'Username',3,64);
    const password = req.body.password;
    if (typeof password !== 'string' || password.length<10 || password.length>128) fail(400,'Use a password of 10–128 characters.');
    const venueName = safeText(req.body.venueName,'Venue name',2,80);
    if (!['three','duo'].includes(req.body.mode)) fail(400,'Choose a venue mode.');
    tx(() => {
      run('INSERT INTO admins VALUES (1,?,?)',username,passwordHash(password));
      run('UPDATE settings SET venue_name=?, mode=? WHERE id=1',venueName,req.body.mode);
      run("UPDATE stations SET enabled=CASE WHEN ?='duo' THEN players=2 ELSE players=1 END",req.body.mode);
    });
    newSession(res,'admin'); res.status(201).json({ok:true});
  });
  app.post('/api/admin/login',limit('login',15,60000),(req,res) => {
    const user = get('SELECT * FROM admins WHERE id=1');
    const password = typeof req.body.password === 'string' && req.body.password.length <=128 ? req.body.password : '';
    if (!user || !verifyPassword(password,user.password_hash) || req.body.username !== user.username) fail(401,'Username or password is incorrect.');
    newSession(res,'admin'); res.json({ok:true});
  });
  app.post('/api/admin/logout',admin,(req,res) => { const s=readSession(req,'admin'); run('DELETE FROM auth_sessions WHERE token_hash=?',s.token_hash);res.clearCookie('mhero_admin',cookieOptions);res.json({ok:true}); });
  app.get('/api/admin/overview',admin,(req,res) => res.json({settings:settings(),username:get('SELECT username FROM admins WHERE id=1').username,
    totals:{participants:get('SELECT COUNT(*) n FROM participants').n,plays:get("SELECT COUNT(*) n FROM matches WHERE status='completed'").n,active:get("SELECT COUNT(*) n FROM matches WHERE status IN ('pending','running')").n},
    stations:all('SELECT * FROM stations WHERE enabled=1 ORDER BY rowid').map(s => ({...stationView(s),activeMatch:(()=>{const m=get("SELECT id FROM matches WHERE station_id=? AND status IN ('pending','running')",s.id);return m?matchView(m.id):null;})()})),
    recent:all('SELECT id FROM matches ORDER BY created_at DESC LIMIT 30').map(m=>matchView(m.id))
  }));
  app.put('/api/admin/settings',admin,(req,res) => {
    const venueName=safeText(req.body.venueName,'Venue name',2,80), mode=req.body.mode, country=req.body.country;
    if(!['three','duo'].includes(mode) || !countries.some(c=>c.code===country)) fail(400,'Choose a valid venue mode and default country.');
    if(mode!==settings().mode && get("SELECT id FROM matches WHERE status IN ('pending','running')")) fail(409,'Finish or cancel active matches before changing venue mode.');
    tx(()=>{run('UPDATE settings SET venue_name=?,mode=?,country=? WHERE id=1',venueName,mode,country);run("UPDATE stations SET enabled=CASE WHEN ?='duo' THEN players=2 ELSE players=1 END",mode);});
    res.json({ok:true});
  });
  app.put('/api/admin/password',admin,(req,res)=>{
    const old=get('SELECT password_hash FROM admins WHERE id=1').password_hash;
    if(typeof req.body.current!=='string'||req.body.current.length>128||!verifyPassword(req.body.current,old)) fail(400,'Current password is incorrect.');
    if(typeof req.body.password!=='string'||req.body.password.length<10||req.body.password.length>128) fail(400,'Use a password of 10–128 characters.');
    tx(()=>{run('UPDATE admins SET password_hash=? WHERE id=1',passwordHash(req.body.password));run("DELETE FROM auth_sessions WHERE role='admin'");});
    newSession(res,'admin');res.json({ok:true});
  });
  app.get('/api/admin/participants',admin,(req,res)=>{
    const q=String(req.query.q||'').slice(0,100), page=Math.max(1,Math.min(100000,parseInt(req.query.page)||1));
    const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    const where="WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'";
    res.json({page,total:get('SELECT COUNT(*) n FROM participants '+where,term,term,term).n,
      participants:all('SELECT * FROM participants '+where+' ORDER BY created_at DESC LIMIT 30 OFFSET ?',term,term,term,(page-1)*30)});
  });
  app.put('/api/admin/participants/:id',admin,(req,res)=>{
    if(!get('SELECT id FROM participants WHERE id=?',req.params.id)) fail(404,'Participant not found.');
    const p=personFields(req.body);
    if(get('SELECT id FROM participants WHERE phone=? AND id<>?',p.phone,req.params.id)) fail(409,'That phone number is already registered.');
    run('UPDATE participants SET name=?,email=?,phone=?,country=?,updated_at=? WHERE id=?',p.name,p.email,p.phone,p.country,now(),req.params.id);
    res.json({ok:true});
  });
  app.post('/api/admin/stations/:id/pairing',admin,(req,res)=>{
    if(!get('SELECT id FROM stations WHERE id=? AND enabled=1',req.params.id)) fail(404,'Station not found.');
    const code=randomBytes(4).toString('hex').toUpperCase();
    run('UPDATE stations SET pairing_hash=?,pairing_expiry=? WHERE id=?',hash(code),Date.now()+600000,req.params.id);
    res.json({code,expiresIn:600});
  });
  app.post('/api/admin/stations/:id/game-key',admin,(req,res)=>{
    if(!get('SELECT id FROM stations WHERE id=? AND enabled=1',req.params.id)) fail(404,'Station not found.');
    if(get("SELECT id FROM matches WHERE station_id=? AND status IN ('pending','running')",req.params.id)) fail(409,'Finish or cancel this station’s match before changing its key.');
    const key=secret();run('UPDATE stations SET game_key_hash=?,last_seen=NULL WHERE id=?',hash(key),req.params.id);
    res.json({key,stationId:req.params.id});
  });
  app.post('/api/admin/stations/:id/unpair',admin,(req,res)=>{run("DELETE FROM auth_sessions WHERE role='kiosk' AND station_id=?",req.params.id);run('UPDATE stations SET pairing_hash=NULL,pairing_expiry=NULL WHERE id=?',req.params.id);res.json({ok:true});});
  app.post('/api/admin/matches/:id/cancel',admin,(req,res)=>{
    const m=matchView(req.params.id);
    if(!['pending','running'].includes(m.status)) fail(409,'This match is already finished.');
    run("UPDATE matches SET status='cancelled',finished_at=? WHERE id=?",now(),m.id);res.json({ok:true});
  });
  app.get('/api/admin/export',admin,(req,res)=>{
    const plays=req.query.type==='plays';
    const rows=plays?all(`SELECT m.id AS match_id,g.name AS game,m.station_id,m.status,m.created_at,m.finished_at,p.name,p.email,p.phone,mp.slot,mp.score FROM matches m JOIN games g ON g.id=m.game_id JOIN match_players mp ON mp.match_id=m.id JOIN participants p ON p.id=mp.participant_id ORDER BY m.created_at DESC`):all('SELECT name,email,phone,country,created_at FROM participants ORDER BY created_at DESC');
    const headers=plays?['match_id','game','station_id','status','created_at','finished_at','name','email','phone','slot','score']:['name','email','phone','country','created_at'];
    res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="mhero-${plays?'plays':'registrations'}.csv"`});
    res.send('\ufeff'+[headers.map(csvCell).join(','),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(','))].join('\r\n'));
  });
  app.get('/api/admin/backup',admin,(req,res)=>{
    const filename=resolve(dataDir,'backup-'+randomUUID()+'.sqlite');
    db.prepare('VACUUM INTO ?').run(filename);chmodSync(filename,0o600);
    res.download(filename,'mhero-backup-'+now().slice(0,10)+'.sqlite',()=>{if(existsSync(filename))unlinkSync(filename);});
  });
  app.post('/api/kiosk/pair',limit('pair',20,60000),(req,res)=>{
    if(!initialized()) fail(409,'Set up the venue on the host Mac first.');
    const code=String(req.body.code||'').replace(/\s/g,'').toUpperCase();
    const s=get('SELECT * FROM stations WHERE id=? AND enabled=1 AND pairing_hash=? AND pairing_expiry>?',String(req.body.stationId),hash(code),Date.now());
    if(!s) fail(400,'Pairing code is incorrect or expired. Ask the administrator for a new code.');
    run('UPDATE stations SET pairing_hash=NULL,pairing_expiry=NULL WHERE id=?',s.id);newSession(res,'kiosk',s.id);res.json({ok:true});
  });
  app.get('/api/kiosk/status',kiosk,(req,res)=>{
    const m=get("SELECT id FROM matches WHERE station_id=? AND status IN ('pending','running')",req.station.id);
    res.json({station:stationView(req.station),match:m?matchView(m.id):null});
  });
  app.post('/api/kiosk/lookup',kiosk,limit('lookup',120,60000),(req,res)=>{
    const p=get('SELECT id,name FROM participants WHERE phone=?',phone(req.body.phone,req.body.country));
    if(!p) return res.status(404).json({error:'No registration found. Register below to join.',code:'NOT_REGISTERED'});
    res.json({participant:p});
  });
  app.post('/api/kiosk/register',kiosk,limit('register',60,60000),(req,res)=>{
    const p=personFields(req.body);
    if(get('SELECT id FROM participants WHERE phone=?',p.phone)) fail(409,'This phone number is registered. Use “Already registered” to sign in.');
    const id=randomUUID(), date=now();
    run('INSERT INTO participants VALUES (?,?,?,?,?,?,?)',id,p.name,p.email,p.phone,p.country,date,date);
    res.status(201).json({participant:{id,name:p.name}});
  });
  app.post('/api/kiosk/start',kiosk,(req,res)=>{
    const {participantIds,requestId}=req.body;
    if(typeof requestId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) fail(400,'A unique start request is required.');
    const requestKey=req.kiosk.token_hash+':'+requestId;
    const existing=get('SELECT id FROM matches WHERE request_key=?',requestKey);
    if(existing) return res.json({match:matchView(existing.id)});
    if(!stationView(req.station).online) fail(409,'The game is not connected yet. Please ask a team member for help.');
    if(!Array.isArray(participantIds)||participantIds.length!==req.station.players||new Set(participantIds).size!==participantIds.length||participantIds.some(id=>typeof id!=='string')) fail(400,`Select ${req.station.players} different player${req.station.players>1?'s':''}.`);
    const players=participantIds.map(id=>get('SELECT id,name FROM participants WHERE id=?',id));
    if(players.some(p=>!p)) fail(400,'Please sign in each player again.');
    if(get("SELECT id FROM matches WHERE station_id=? AND status IN ('pending','running')",req.station.id)) fail(409,'A match is already in progress at this station.');
    const id=randomUUID();tx(()=>{
      run("INSERT INTO matches (id,station_id,game_id,status,request_key,created_at) VALUES (?,?,?,'pending',?,?)",id,req.station.id,req.station.game_id,requestKey,now());
      players.forEach((p,i)=>run('INSERT INTO match_players (match_id,participant_id,slot,display_name) VALUES (?,?,?,?)',id,p.id,i+1,p.name));
    });res.status(201).json({match:matchView(id)});
  });
  app.get('/api/kiosk/matches/:id',kiosk,(req,res)=>{const m=matchView(req.params.id);if(m.stationId!==req.station.id)fail(403,'This match belongs to another station.');res.json({match:m});});
  app.post('/api/game/poll',game,(req,res)=>{
    run('UPDATE stations SET last_seen=? WHERE id=?',Date.now(),req.station.id);
    const m=get("SELECT id FROM matches WHERE station_id=? AND status IN ('pending','running') ORDER BY created_at LIMIT 1",req.station.id);
    res.json({stationId:req.station.id,match:m?matchView(m.id):null,pollAfterMs:1000});
  });
  const ownedMatch = req => {const m=matchView(req.params.id);if(m.stationId!==req.station.id)fail(403,'This match belongs to another station.');return m;};
  app.get('/api/game/matches/:id',game,(req,res)=>res.json({match:ownedMatch(req)}));
  app.post('/api/game/matches/:id/start',game,(req,res)=>{
    const m=ownedMatch(req);if(!['pending','running'].includes(m.status))fail(409,'This match cannot be started.');
    if(m.status==='pending')run("UPDATE matches SET status='running',started_at=? WHERE id=?",now(),m.id);
    res.json({match:matchView(m.id)});
  });
  app.post('/api/game/matches/:id/results',game,(req,res)=>{
    const m=ownedMatch(req), results=req.body.results;
    if(!Array.isArray(results)||results.length!==m.players.length||new Set(results.map(r=>r?.participantId)).size!==results.length||results.some(r=>!r||!m.players.some(p=>p.id===r.participantId)||typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>1e12)) fail(400,'Submit one finite score from 0 to 1,000,000,000,000 for each participant.');
    if(m.status==='completed'){
      if(results.some(r=>m.players.find(p=>p.id===r.participantId).score!==r.score))fail(409,'Results are already saved and cannot be changed by a retry.');
      return res.json({match:m});
    }
    if(m.status!=='running')fail(409,'Acknowledge the match start before submitting results.');
    tx(()=>{for(const r of results)run('UPDATE match_players SET score=? WHERE match_id=? AND participant_id=?',r.score,m.id,r.participantId);run("UPDATE matches SET status='completed',finished_at=? WHERE id=?",now(),m.id);});
    res.json({match:matchView(m.id)});
  });
  app.post('/api/game/matches/:id/fail',game,(req,res)=>{
    const m=ownedMatch(req);if(!['pending','running'].includes(m.status))fail(409,'This match is already finished.');
    const message=safeText(req.body.message||'Game could not finish.','Message',1,200);
    run("UPDATE matches SET status='failed',finished_at=?,error=? WHERE id=?",now(),message,m.id);res.json({ok:true});
  });
  app.get('/api/leaderboard/:gameId',(req,res)=>{
    if(!get('SELECT id FROM games WHERE id=?',req.params.gameId)) fail(404,'Game not found.');
    const today=req.query.period==='today';
    const dubaiDay=new Date(Date.now()+4*3600000).toISOString().slice(0,10);
    const since=today?new Date(dubaiDay+'T00:00:00+04:00').toISOString():'0000';
    const rows=all(`WITH scored AS (SELECT p.id,p.name,mp.score,m.finished_at,ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY mp.score DESC,m.finished_at ASC) AS rn FROM match_players mp JOIN matches m ON m.id=mp.match_id JOIN participants p ON p.id=mp.participant_id WHERE m.game_id=? AND m.status='completed' AND m.finished_at>=?) SELECT name,score,finished_at AS achievedAt FROM scored WHERE rn=1 ORDER BY score DESC,achievedAt ASC,id ASC LIMIT 50`,req.params.gameId,since);
    let rank=0,last=null;res.json({gameId:req.params.gameId,period:today?'today':'all',entries:rows.map((r,i)=>{if(r.score!==last)rank=i+1;last=r.score;return {...r,rank};})});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use(express.static(resolve(ROOT,'public'),{index:false,maxAge:0}));
  app.get(['/','/station/:id','/leaderboard','/leaderboard/:id'],(req,res)=>res.sendFile(resolve(ROOT,'public/index.html')));
  app.get('/admin',(req,res)=>res.sendFile(resolve(ROOT,'public/admin.html')));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const status=error.status||500;
    if(status===500)console.error('Request failed:',error.message);
    res.status(status).json({error:status===500?'Something went wrong. Please try again.':error.message});
  });
  return {app,db,close:()=>db.close()};
}
