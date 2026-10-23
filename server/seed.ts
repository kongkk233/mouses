import { Store } from './store.js';
import { applyCommand, reconcile } from './domain.js';
import { addDays } from '../shared/dates.js';
import { appearanceFor } from '../shared/appearance.js';
const store=new Store();
try {
store.transaction(()=>{
 const s=store.read(); if(s.mice.length||s.cages.length)throw new Error('数据库已有资料，示例导入已停止。请使用新的 DATA_DIR。');
 const t=s.today, past=(n:number)=>addDays(t,-n), future=(n:number)=>addDays(t,n);
 const run=(type:string,payload:Record<string,any>)=>applyCommand(s,type,payload);
 const cage=(code:string,nickname:string,purpose='normal',capacity=5)=>run('cage.create',{code,nickname,purpose,capacity}).id as string;
 const a1=cage('A001','云朵小屋'),a2=cage('A002','橡果公寓'),b1=cage('B001','奶芙的育儿室','nursery',8),b2=cage('B002','杏仁小筑','breeding'),c1=cage('C001','新芽宿舍'),c2=cage('C002','等一位新住客');
 let n=0;
 const mouse=(code:string,nickname:string,cageId:string,age:number,sex='female',genotype='WT',coat=0)=>{
  const seed=10000+ ++n*739;const appearance=appearanceFor(seed);appearance.coat=(['ivory','cream','silver','cocoa'] as const)[coat];
  return run('mouse.create',{code,nickname,cageId,dob:past(age),sex,genotype,avatarSeed:seed,appearance,weaningStatus:'weaned',personality:['好奇','安静','爱睡','社交','贪吃'][n%5]}).id as string;
 };
 const grandma=mouse('M000','棉花',c2,300,'female','Het',0);
 const m1=mouse('M001','奶糖',a1,65,'female','Het',0),m2=mouse('M002','年糕',a1,70,'male','WT',1); mouse('M003','芝麻',a1,99,'female','KO',2);
 const dad=mouse('M004','团子',a2,245,'male','WT',3);mouse('M005','栗子',a2,158,'male','Het',1);
 const mum=mouse('M006','奶芙',b1,145,'female','Het',1);run('mouse.update',{id:mum,motherId:grandma,fatherId:dad,reason:'导入已确认家系'});
 const almond=mouse('M007','杏仁',b2,122,'female','WT',0);mouse('M008','麦麦',b2,72,'female','Het',1);
 for(let i=0;i<4;i++)mouse(`M0${9+i<10?'0':''}${9+i}`,['小米','布丁','乌龙','糯糯'][i],c1,28,'female',i%2?'Het':'WT',i);
 run('litter.create',{code:'L001',bornOn:past(8),bornAlive:3,birthTotal:3,cageId:b1,motherId:mum,fatherId:dad,fatherStatus:'confirmed',nursing:true,weanDueOn:future(13),appearanceChoice:0,appearanceConfirmed:true,avatarSeed:3921});
 const babies=s.mice.filter(m=>m.birthLitterId);babies.forEach((m,i)=>m.nickname=['小雪球','小云朵','小泡芙'][i]);
 run('mouse.archive',{mouseIds:[grandma],date:past(20),status:'transferred',reason:'已转至合作实验室，保留家系'});
 const breeding=run('breeding.create',{motherId:almond,candidateFatherIds:[dad],date:past(15),reviewOn:future(1)}).id;
 run('breeding.update',{id:breeding,action:'observe',date:past(14),evidence:'已登记见栓观察；妊娠结果另行确认'});
 run('breeding.update',{id:breeding,action:'confirm',date:past(7),evidence:'实验人员人工确认记录',baselineDate:past(14),baselineValue:0.5,convention:'见栓日记 E0.5（实验室约定）',dueFrom:future(2),dueTo:future(4)});
 const waiting=run('breeding.create',{motherId:m1,candidateFatherIds:[m2],date:past(5),reviewOn:future(1)}).id;
 run('breeding.update',{id:waiting,action:'observe',date:past(4),evidence:'见栓观察，待人工复核'});
 for(const [id,ago] of [[a1,6],[a2,7],[b1,5],[b2,8],[c1,4]] as const){run('cleaning.complete',{cageIds:[id],date:past(ago)});run('plan.set',{cageIds:[id],intervalDays:7,reminderTime:'09:00',aheadDays:1,overdue:true,apply:'current'});}
 run('care.plan',{cageIds:[a1],kind:'water',date:t});run('care.plan',{cageIds:[a2],kind:'food',date:t});run('care.plan',{cageIds:[b1],kind:'observation',date:t});
 run('care.record',{cageIds:[c1],kind:'water',date:t,notes:'已完成当日换水'});
 run('care.record',{cageIds:[b1],mouseId:mum,kind:'weight',date:past(1),value:28.4,observer:'小窝管理员'});
 reconcile(s);
 for(const r of s.reminders)if(r.kind.startsWith('age') && r.subjectId!==m2 && !(r.subjectId===mum && r.kind==='age140') && r.dueOn<=t){r.status='handled';r.handledAt=t;}
 s.demo=true;s.revision++;store.save(s);
 console.log(`已创建示例：${s.cages.length} 个小窝，${s.mice.filter(m=>m.status==='active').length} 只在笼小鼠。示例日期 ${t}。`);
});
} finally {store.close();}
