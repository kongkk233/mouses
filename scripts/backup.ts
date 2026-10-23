import { backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';
import { Store } from '../server/store.js';
const destination=resolve(process.argv[2]||`data/backups/mouse-nook-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
mkdirSync(dirname(destination),{recursive:true,mode:0o700});
const store=new Store();
try {await backup(store.db,destination);chmodSync(destination,0o600);console.log(`备份完成：${destination}`);}finally{store.close();}
