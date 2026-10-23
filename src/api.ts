export class ApiError extends Error { constructor(message:string,public field='',public status=500){super(message);} }
export async function api<T>(path:string,body?:unknown):Promise<T>{
 let response:Response;
 try{response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new ApiError('连接中断，输入已保留，请检查网络后重试');}
 const data=await response.json().catch(()=>({error:'服务暂时不可用，请重试'}));
 if(!response.ok)throw new ApiError(data.error||'操作未完成',data.field||'',response.status);
 return data;
}
