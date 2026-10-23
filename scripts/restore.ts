import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname, basename } from 'node:path';
import { existsSync, readdirSync, readFileSync, mkdirSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
const input=process.argv[2];
if(!input||input.startsWith('--'))throw new Error('用法：npm run restore -- /绝对路径/备份.sqlite --confirm-replace');
const sourcePath=resolve(input),dataDir=resolve(process.env.DATA_DIR||'data'),target=resolve(dataDir,'mouse-nook.sqlite');
if(sourcePath===target)throw new Error('备份与目标不能是同一个文件');
if(existsSync(target)&&!process.argv.includes('--confirm-replace'))throw new Error('目标已有数据库。停服后明确添加 --confirm-replace；现有数据库会先备份。');
mkdirSync(dataDir,{recursive:true,mode:0o700});
for(const file of readdirSync(dataDir).filter(f=>/^runtime-\d+\.lock$/.test(f))){const pid=Number(file.match(/\d+/)![0]);let running=false;try{process.kill(pid,0);running=true;}catch{}if(running)throw new Error(`服务进程 ${pid} 仍在运行，请先停服。`);}
const source=new DatabaseSync(sourcePath,{readOnly:true});
const temporary=target+'.restoring';
try {
 const check=source.prepare('PRAGMA quick_check').get() as any;if(Object.values(check)[0]!=='ok')throw new Error('备份未通过 SQLite 完整性检查');
 const version=source.prepare('PRAGMA user_version').get() as any;if(Object.values(version)[0]!==1)throw new Error('备份的架构版本不兼容');
 for(const table of ['meta','mice','cages','litters','reminders','operations','subscriptions','deliveries'])source.prepare(`SELECT count(*) FROM ${table}`).get();
 if(existsSync(target)){
  const existing=new DatabaseSync(target);try{const before=target+`.before-restore-${Date.now()}.sqlite`;await backup(existing,before);chmodSync(before,0o600);console.log(`已保留恢复前备份：${before}`);}finally{existing.close();}
 }
 if(existsSync(temporary))unlinkSync(temporary);await backup(source,temporary);chmodSync(temporary,0o600);
 for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))unlinkSync(target+suffix);
 renameSync(temporary,target);console.log(`恢复完成：${target}。启动服务后复核 ID、家系与已处理提醒。`);
}finally{source.close();}
