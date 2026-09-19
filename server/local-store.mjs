import {mkdir,readFile,writeFile,readdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function localStore(root){
 const file=key=>path.join(root,encodeURIComponent(key)+'.json');
 return {
 async get(key){try{return JSON.parse(await readFile(file(key),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}},
 async set(key,value,options){await mkdir(root,{recursive:true});if(options?.onlyIfNew){try{await writeFile(file(key),JSON.stringify(value),{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}return}const tmp=file(key)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value));await rename(tmp,file(key));},
 async list(prefix){await mkdir(root,{recursive:true});const files=(await readdir(root)).filter(f=>f.endsWith('.json')&&decodeURIComponent(f.slice(0,-5)).startsWith(prefix));return Promise.all(files.map(f=>readFile(path.join(root,f),'utf8').then(JSON.parse)));},
 async clear(prefix){await mkdir(root,{recursive:true});const files=(await readdir(root)).filter(f=>f.endsWith('.json')&&decodeURIComponent(f.slice(0,-5)).startsWith(prefix));await Promise.all(files.map(f=>unlink(path.join(root,f))));}
 };
}
