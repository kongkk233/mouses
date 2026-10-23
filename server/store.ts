import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { AppState, Command } from '../shared/types.js';
import { applyCommand, DomainError, emptyState, reconcile } from './domain.js';

export const collections = ['mice','cages','breedings','litters','occurrences','events','reminders','careTasks'] as const;
export class Store {
  db: DatabaseSync;
  onSave?: (state: AppState) => void;
  constructor(public path = resolve(process.env.DATA_DIR || 'data', 'mouse-nook.sqlite')) {
    if (path !== ':memory:') { mkdirSync(dirname(path), { recursive:true, mode:0o700 }); }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, settings TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, payload TEXT NOT NULL, refs TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS delivery_nodes (node_key TEXT PRIMARY KEY, delivery_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(status, next_at);
      CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, owner TEXT NOT NULL, until_at TEXT NOT NULL);`);
    for (const table of collections) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));`);
    for (const table of ['mice','cages','litters']) this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_code ON ${table}(lower(json_extract(payload,'$.code')));`);
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_open_occurrence ON occurrences(json_extract(payload,'$.cageId')) WHERE json_extract(payload,'$.status') IN ('pending','paused');
      CREATE UNIQUE INDEX IF NOT EXISTS occurrence_source ON occurrences(json_extract(payload,'$.sourceId')) WHERE json_extract(payload,'$.sourceId') IS NOT NULL;
      CREATE INDEX IF NOT EXISTS occurrence_due ON occurrences(json_extract(payload,'$.status'),json_extract(payload,'$.scheduledOn'));
      CREATE INDEX IF NOT EXISTS reminder_due ON reminders(json_extract(payload,'$.status'),json_extract(payload,'$.dueOn'));
      PRAGMA user_version=1;`);
    if (!this.db.prepare('SELECT id FROM meta WHERE id=1').get()) { const s = emptyState(); this.db.prepare('INSERT INTO meta (id,revision,settings,demo) VALUES (1,0,?,0)').run(JSON.stringify(s.settings)); }
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  read(): AppState {
    const meta=this.db.prepare('SELECT * FROM meta WHERE id=1').get() as any;
    const s={...emptyState(), revision:meta.revision, settings:JSON.parse(meta.settings), demo:!!meta.demo};
    for(const table of collections) (s[table] as any[])=this.db.prepare(`SELECT payload FROM ${table}`).all().map((r:any)=>JSON.parse(r.payload));
    // Stable order makes reconciliation and payload comparison deterministic.
    return s;
  }
  save(s: AppState) {
    for(const table of collections) {
      const existing = new Map(this.db.prepare(`SELECT id,payload FROM ${table}`).all().map((r:any)=>[r.id,r.payload]));
      const upsert=this.db.prepare(`INSERT INTO ${table}(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`);
      const remove=this.db.prepare(`DELETE FROM ${table} WHERE id=?`);
      // Close old active occurrences before inserting their successor (partial unique index).
      const ordered = table === 'occurrences' ? [...s[table]].sort((a:any,b:any)=>Number(['pending','paused'].includes(a.status))-Number(['pending','paused'].includes(b.status))) : s[table];
      for(const row of ordered) { const payload=JSON.stringify(row); if(existing.get(row.id)!==payload) upsert.run(row.id,payload); existing.delete(row.id); }
      for(const id of existing.keys()) remove.run(id as string);
    }
    this.db.prepare('UPDATE meta SET revision=?,settings=?,demo=? WHERE id=1').run(s.revision,JSON.stringify(s.settings),s.demo?1:0);
    this.onSave?.(s);
  }
  transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); this.db.exec('COMMIT'); return result; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  snapshot(now = new Date()):AppState {
    return this.transaction(()=>{
      const s=this.read(), before=JSON.stringify(s); reconcile(s,now);
      if(JSON.stringify(s)!==before) { s.revision++; this.save(s); }
      return s;
    });
  }
  execute(command:Command): { result: Record<string,unknown>; state: AppState; replayed: boolean } {
    return this.transaction(()=>{
      const hash=createHash('sha256').update(JSON.stringify({type:command.type,payload:command.payload})).digest('hex');
      const old=this.db.prepare('SELECT hash,result FROM operations WHERE id=?').get(command.opId) as any;
      if(old) { if(old.hash!==hash) throw new DomainError('同一操作标识不能用于不同内容','opId',409); return { result:JSON.parse(old.result),state:this.read(),replayed:true }; }
      const s=this.read();
      if(command.expectedRevision!==s.revision) throw new DomainError('资料已在其他窗口更新。请载入最新资料后重试，当前输入已保留。','revision',409);
      reconcile(s); const result=applyCommand(s,command.type,command.payload); reconcile(s); s.revision++; this.save(s);
      this.db.prepare('INSERT INTO operations(id,hash,result,created_at) VALUES (?,?,?,?)').run(command.opId,hash,JSON.stringify(result),new Date().toISOString());
      return {result,state:s,replayed:false};
    });
  }
  close() { this.db.close(); }
}
