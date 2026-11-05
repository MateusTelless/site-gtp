type Bindings={DB:D1Database;BUCKET:R2Bucket};
const tables=['content','versions','contacts','media'] as const;
const prefix='private-backups/';
function fail(message:string):never{throw Object.assign(new Error(message),{status:400})}
const hash=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const key=(id:string)=>{if(!/^[\dTZ-]+_[a-f0-9-]+$/.test(id))fail('Cópia inválida.');return prefix+'manifests/'+id+'.json'};
export async function makeBackup({DB,BUCKET}:Bindings,reason:string){
 const id=new Date().toISOString().replace(/[.:]/g,'-')+'_'+crypto.randomUUID();
 // D1 batch reads share a transaction, so rows describe a consistent point in time.
 const results=await DB.batch(tables.map(t=>DB.prepare('SELECT * FROM '+t)));
 const data:any=Object.fromEntries(tables.map((t,i)=>[t,results[i].results]));
 const files=[];
 for(const row of data.media){if(!/^[\w-]+\.(png|jpg|webp|pdf)$/.test(row.id))fail('Arquivo cadastrado inválido.');const source=await BUCKET.get(row.id);if(!source)fail('Backup incompleto: arquivo ausente '+row.name);const bytes=await source.arrayBuffer(),digest=await hash(bytes);const fileKey=prefix+'files/'+digest;if(!await BUCKET.head(fileKey))await BUCKET.put(fileKey,bytes,{httpMetadata:{contentType:row.mime}});files.push({id:row.id,key:fileKey,sha256:digest,size:bytes.byteLength,mime:row.mime})}
 const manifest={format:'getepe-backup-v2',id,createdAt:new Date().toISOString(),reason,data,files,note:'Conteúdo, histórico, contatos e arquivos enviados. Contas, senhas, sessões, configuração e código da hospedagem não são incluídos. Código preservado nas versões publicadas.'};
 const serialized=JSON.stringify(manifest);if(serialized.length>16000000)fail('Backup excede o limite desta versão. Exporte pela hospedagem.');
 await BUCKET.put(key(id),serialized,{httpMetadata:{contentType:'application/json'}});return {id,createdAt:manifest.createdAt,reason,files:files.length};
}
export async function listBackups({BUCKET}:Bindings){let cursor:string|undefined;const items=[];do{const page=await BUCKET.list({prefix:prefix+'manifests/',cursor});for(const o of page.objects)items.push({id:o.key.slice((prefix+'manifests/').length,-5),createdAt:o.uploaded.toISOString(),size:o.size});cursor=page.truncated?page.cursor:undefined}while(cursor);return items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)}
async function readBackup({BUCKET}:Bindings,id:string){const obj=await BUCKET.get(key(id));if(!obj)fail('Cópia não encontrada.');const m=await obj!.json<any>();if(m.format!=='getepe-backup-v2'||m.id!==id)fail('Cópia inválida.');return m}
export async function verifyBackup(bindings:Bindings,id:string){const m=await readBackup(bindings,id);for(const f of m.files){const obj=await bindings.BUCKET.get(f.key);if(!obj||await hash(await obj.arrayBuffer())!==f.sha256)fail('Falha de integridade no arquivo '+f.id)}return {ok:true,files:m.files.length,contacts:m.data.contacts.length,createdAt:m.createdAt}}
export async function recoverBackup(bindings:Bindings,id:string,revision:number,author:string,validate:(data:any)=>any){
 const m=await readBackup(bindings,id);await verifyBackup(bindings,id);
 const saved=m.data.content.find((r:any)=>r.id==='published')||m.data.content.find((r:any)=>r.id==='draft');if(!saved)fail('Esta cópia não contém conteúdo recuperável.');const data=validate(JSON.parse(saved.body));
 const current=await bindings.DB.prepare('SELECT revision FROM content WHERE id=?').bind('draft').first<any>();if(current?.revision!==revision)throw Object.assign(new Error('O rascunho mudou. Atualize o painel.'),{status:409});

 // Uploaded IDs are immutable. Never overwrite an existing asset or resurrect deleted contacts/accounts.
 for(const f of m.files)if(!await bindings.BUCKET.head(f.id)){const obj=await bindings.BUCKET.get(f.key);await bindings.BUCKET.put(f.id,obj!.body,{httpMetadata:{contentType:f.mime}})}
 await makeBackup(bindings,'Antes de recuperar conteúdo');
 const statements=m.data.media.map((r:any)=>bindings.DB.prepare('INSERT OR IGNORE INTO media(id,name,mime,size,created_at) VALUES(?,?,?,?,?)').bind(r.id,r.name,r.mime,r.size,r.created_at));
 statements.push(bindings.DB.prepare('UPDATE content SET body=?,revision=revision+1,updated_at=?,author=? WHERE id=? AND revision=?').bind(JSON.stringify(data),new Date().toISOString(),author,'draft',revision));
 const results=await bindings.DB.batch(statements);if(!results[results.length-1].meta.changes)throw Object.assign(new Error('O rascunho mudou. Atualize o painel.'),{status:409});return {ok:true};
}
export async function exportBackup(bindings:Bindings,id:string){const m=await readBackup(bindings,id);const encoder=new TextEncoder();const stream=new ReadableStream({async start(controller){try{controller.enqueue(encoder.encode(JSON.stringify({type:'manifest',manifest:m})+'\n'));for(const f of m.files){const obj=await bindings.BUCKET.get(f.key);if(!obj)throw Error('Arquivo ausente');const bytes=await obj.arrayBuffer();if(await hash(bytes)!==f.sha256)throw Error('Arquivo corrompido');controller.enqueue(encoder.encode(JSON.stringify({type:'file',id:f.id,base64:Buffer.from(bytes).toString('base64')})+'\n'))}controller.close()}catch(e){controller.error(e)}}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="getepe-backup-'+id+'.ndjson"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}

