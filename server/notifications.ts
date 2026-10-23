import webpush from 'web-push';
import { createHash, randomUUID } from 'node:crypto';
import type { AppState, Reminder } from '../shared/types.js';
import { addDays, inQuietHours, timeIn } from '../shared/dates.js';
import type { Store } from './store.js';

interface Ref { reminderId: string; dueOn: string; revision: number; node: string; date: string; snooze: string; dedupe: string }
export function sourceRevision(s:AppState,r:Reminder):number {
  if(r.kind==='cleaning') return s.occurrences.find(o=>o.id===r.subjectId)?.revision || 0;
  return 1;
}
export function refValid(s:AppState,ref:Ref,now = new Date()):boolean {
  const r=s.reminders.find(r=>r.id===ref.reminderId);
  return ref.date===s.today && !!r && r.status==='pending' && r.dueOn===ref.dueOn && sourceRevision(s,r)===ref.revision && (r.snoozedUntil||'')===ref.snooze && (!r.snoozedUntil || r.snoozedUntil <= now.toISOString());
}
function sourceActive(s:AppState,r:Reminder):boolean {
  if(r.kind.startsWith('age')) return s.mice.some(m=>m.id===r.subjectId && m.status==='active');
  if(r.kind==='cleaning') { const o=s.occurrences.find(o=>o.id===r.subjectId); return o?.status==='pending' && !s.cages.find(c=>c.id===o.cageId)?.plan?.paused; }
  return true;
}
export function notificationRefs(s:AppState,now = new Date()):Ref[] {
  if(!s.settings.pushEnabled || process.env.PUSH_ENABLED==='0') return [];
  const time=timeIn(s.settings.timezone,now);
  if(inQuietHours(time,s.settings.quietStart,s.settings.quietEnd)) return [];
  const refs:Ref[]=[];
  for(const r of s.reminders) {
    if(r.status!=='pending' || !sourceActive(s,r) || r.snoozedUntil && r.snoozedUntil>now.toISOString()) continue;
    let at=s.settings.reminderTime, ahead=0, overdue=false;
    if(r.kind==='cleaning') { const o=s.occurrences.find(o=>o.id===r.subjectId)!; const plan=s.cages.find(c=>c.id===o.cageId)?.plan; if(!plan)continue; at=plan.reminderTime; ahead=plan.aheadDays; overdue=plan.overdue; }
    let dueDate=r.dueOn;
    if(inQuietHours(at,s.settings.quietStart,s.settings.quietEnd)){
      if(s.settings.quietStart>s.settings.quietEnd && at>=s.settings.quietStart) dueDate=addDays(dueDate,1);
      at=s.settings.quietEnd;
    }
    if(time<at) continue;
    const ref:Ref={reminderId:r.id,dueOn:r.dueOn,revision:sourceRevision(s,r),node:'due',date:s.today,snooze:r.snoozedUntil||'',dedupe:''};
    // No past-day replay: recovery sends only the current necessary summary.
    if(r.kind==='care' && !['weight','observation'].includes(s.careTasks.find(t=>t.id===r.subjectId)?.kind||'') && r.dueOn<s.today) continue;
    if(dueDate===s.today) refs.push(ref);
    else if(ahead && addDays(dueDate,-ahead)===s.today) refs.push({...ref,node:'ahead'});
    else if(dueDate<s.today && (r.kind!=='cleaning'||overdue)) refs.push({...ref,node:'overdue'});
  }
  return refs.map(ref=>{const r=s.reminders.find(r=>r.id===ref.reminderId)!;return {...ref,dedupe:`${r.kind==='cleaning'?`${ref.revision}:${ref.node}:${ref.date}`:`once:${ref.dueOn}`}:${ref.snooze||'base'}`};});
}
export function planDeliveries(store:Store,s:AppState,now=new Date()) {
  const pending=store.db.prepare("SELECT id,refs FROM deliveries WHERE status='pending'").all() as {id:string;refs:string}[];
  for(const row of pending){const refs=JSON.parse(row.refs) as Ref[];if(refs.length&&refs.some(ref=>!refValid(s,ref,now))){store.db.prepare("UPDATE deliveries SET status='cancelled',error='计划版本已变化或已处理' WHERE id=?").run(row.id);store.db.prepare('DELETE FROM delivery_nodes WHERE delivery_id=?').run(row.id);}}
  const refs=notificationRefs(s,now); if(!refs.length)return;
  const subs=store.db.prepare('SELECT id FROM subscriptions WHERE active=1').all() as {id:string}[];
  for(const sub of subs) {
    const fresh=refs.filter(ref=>!store.db.prepare('SELECT node_key FROM delivery_nodes WHERE node_key=?').get(`${sub.id}:${ref.reminderId}:${ref.dedupe}`));
    if(!fresh.length) continue;
    const id=randomUUID();
    // Only cage codes / generic reminder counts leave the app. No genotype or breeding notes.
    const cageCodes=fresh.filter(r=>s.reminders.find(x=>x.id===r.reminderId)?.kind==='cleaning').map(ref=>{const reminder=s.reminders.find(r=>r.id===ref.reminderId)!;const o=s.occurrences.find(o=>o.id===reminder.subjectId)!;return s.cages.find(c=>c.id===o.cageId)!.code;});
    const payload={ title:'鼠鼠小窝 · 照护提醒', body:cageCodes.length?`${cageCodes.join('、')} 待记录换笼${fresh.length>cageCodes.length?`，另有 ${fresh.length-cageCodes.length} 项提醒`:''}`:`有 ${fresh.length} 项待处理事项`, tag:`mouse-nook-${s.today}`,url:'/?panel=reminders' };
    store.db.prepare('INSERT INTO deliveries(id,subscription_id,status,next_at,payload,refs,created_at) VALUES (?,?,\'pending\',?,?,?,?)').run(id,sub.id,now.toISOString(),JSON.stringify(payload),JSON.stringify(fresh),now.toISOString());
    for(const ref of fresh) store.db.prepare('INSERT INTO delivery_nodes(node_key,delivery_id) VALUES (?,?)').run(`${sub.id}:${ref.reminderId}:${ref.dedupe}`,id);
  }
}
export class PushService {
  publicKey:string; private busy=false; private stopping=false; private owner=randomUUID();
  constructor(private store:Store,private sender:typeof webpush.sendNotification=webpush.sendNotification.bind(webpush)) {
    let keys=store.db.prepare('SELECT value FROM secrets WHERE id=\'vapid\'').get() as any;
    if(!keys) { const value=JSON.stringify(webpush.generateVAPIDKeys()); store.db.prepare('INSERT INTO secrets(id,value) VALUES (\'vapid\',?)').run(value); keys={value}; }
    const key=JSON.parse(keys.value); this.publicKey=key.publicKey;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com',key.publicKey,key.privateKey);
    store.onSave=s=>planDeliveries(store,s);
  }
  subscribe(payload:any):string {
    if(typeof payload?.endpoint!=='string' || typeof payload.keys?.p256dh!=='string' || typeof payload.keys?.auth!=='string') throw new Error('订阅内容无效');
    if(payload.endpoint.length>4096 || Buffer.from(payload.keys.p256dh,'base64url').length!==65 || Buffer.from(payload.keys.auth,'base64url').length!==16)throw new Error('订阅密钥无效，请重新授权本设备');
    const url=new URL(payload.endpoint);
    const approved=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com'];
    if(url.protocol!=='https:' || url.port && url.port!=='443' || url.username || url.password || !approved.some(h=>url.hostname===h || url.hostname.endsWith('.'+h))) throw new Error('不支持的推送服务地址');
    const id=createHash('sha256').update(payload.endpoint).digest('hex');
    const sanitized={endpoint:payload.endpoint,expirationTime:null,keys:{p256dh:payload.keys.p256dh,auth:payload.keys.auth}};
    this.store.db.prepare('INSERT INTO subscriptions(id,payload,active,created_at) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,active=1').run(id,JSON.stringify(sanitized),new Date().toISOString());return id;
  }
  remove(endpoint:string) { const id=createHash('sha256').update(endpoint).digest('hex'); this.store.db.prepare('UPDATE subscriptions SET active=0 WHERE id=?').run(id); this.store.db.prepare('UPDATE deliveries SET status=\'cancelled\' WHERE subscription_id=? AND status=\'pending\'').run(id); }
  status() {
    return { publicKey:this.publicKey, enabled:process.env.PUSH_ENABLED!=='0', subscriptions:(this.store.db.prepare('SELECT count(*) AS n FROM subscriptions WHERE active=1').get() as any).n,
      recent:this.store.db.prepare('SELECT id,status,attempts,created_at AS createdAt,accepted_at AS acceptedAt,error FROM deliveries ORDER BY created_at DESC LIMIT 10').all() };
  }
  test(endpoint:string) {
    const subId=createHash('sha256').update(endpoint).digest('hex'); const sub=this.store.db.prepare('SELECT id FROM subscriptions WHERE id=? AND active=1').get(subId);
    if(!sub) throw new Error('本设备尚未开启通知');
    const id=randomUUID(), now=new Date().toISOString(); this.store.db.prepare('INSERT INTO deliveries(id,subscription_id,status,next_at,payload,refs,created_at) VALUES (?,?,\'pending\',?,?,\'[]\',?)').run(id,subId,now,JSON.stringify({title:'鼠鼠小窝',body:'这是一条测试通知。请在手机上确认是否实际显示。',tag:'mouse-nook-test',url:'/'}),now); return id;
  }
  async drain(){this.stopping=true;while(this.busy)await new Promise(resolve=>setTimeout(resolve,25));}
  async tick() {
    if(this.busy||this.stopping)return; this.busy=true;
    try {
      const now=new Date(), end=new Date(now.getTime()+90000).toISOString();
      const acquired=this.store.transaction(()=>{
        const lease=this.store.db.prepare('SELECT owner,until_at FROM leases WHERE id=\'push-worker\'').get() as any;
        if(lease && lease.owner!==this.owner && lease.until_at>now.toISOString()) return false;
        this.store.db.prepare('INSERT INTO leases(id,owner,until_at) VALUES (\'push-worker\',?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until_at=excluded.until_at').run(this.owner,end);return true;
      });
      if(!acquired)return;
      const s=this.store.snapshot(now);
      this.store.transaction(()=>planDeliveries(this.store,s,now));
      if(!s.settings.pushEnabled || process.env.PUSH_ENABLED==='0')return;
      const rows=this.store.db.prepare('SELECT * FROM deliveries WHERE status=\'pending\' AND next_at<=? ORDER BY next_at LIMIT 6').all(now.toISOString()) as any[];
      for(const row of rows) {
        const fresh=this.store.read(), refs=JSON.parse(row.refs) as Ref[];
        if(refs.length && inQuietHours(timeIn(fresh.settings.timezone),fresh.settings.quietStart,fresh.settings.quietEnd)) continue;
        if(refs.length && refs.some(ref=>!refValid(fresh,ref))) { this.store.db.prepare('UPDATE deliveries SET status=\'cancelled\',error=\'计划版本已变化或已处理\' WHERE id=?').run(row.id); this.store.db.prepare('DELETE FROM delivery_nodes WHERE delivery_id=?').run(row.id); continue; }
        const sub=this.store.db.prepare('SELECT payload FROM subscriptions WHERE id=? AND active=1').get(row.subscription_id) as any;
        if(!sub){this.store.db.prepare('UPDATE deliveries SET status=\'cancelled\' WHERE id=?').run(row.id);continue;}
        try {
          await this.sender(JSON.parse(sub.payload),row.payload,{TTL:3600,timeout:8000});
          this.store.db.prepare('UPDATE deliveries SET status=\'accepted\',attempts=attempts+1,accepted_at=?,error=NULL WHERE id=?').run(new Date().toISOString(),row.id);
        } catch(error:any) {
          const status=error.statusCode; const attempts=row.attempts+1;
          if(status===404||status===410) this.store.db.prepare('UPDATE subscriptions SET active=0 WHERE id=?').run(row.subscription_id);
          const terminal=status===404||status===410||status===401||status===403||attempts>=8;
          // Web Push uses a stable notification tag to replace duplicate display if a network timeout retries.
          this.store.db.prepare('UPDATE deliveries SET status=?,attempts=?,next_at=?,error=? WHERE id=?').run(terminal?'failed':'pending',attempts,new Date(Date.now()+Math.min(3600000,30000*2**attempts)).toISOString(),`推送服务${status ? ` HTTP ${status}` : '请求超时或网络不可用'}${terminal?'，请检查授权':''}`,row.id);
        }
      }
    } finally { this.store.db.prepare('DELETE FROM leases WHERE id=\'push-worker\' AND owner=?').run(this.owner); this.busy=false; }
  }
}
