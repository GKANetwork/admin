import type {Express,Request,Response,NextFunction} from 'express';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const cookieName=(appId:string)=>'gha_app_'+appId.replaceAll('-','_');
const validApp=(value:unknown):value is string=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,49}$/.test(value);
function cookies(req:Request):Record<string,string>{
 const result:Record<string,string>={};
 for(const item of (req.headers.cookie||'').split(';')){const index=item.indexOf('=');if(index>0){try{result[item.slice(0,index).trim()]=decodeURIComponent(item.slice(index+1));}catch{/* Ignore malformed cookies. */}}}
 return result;
}
function token(req:Request,appId:string){return cookies(req)[cookieName(appId)] || '';}
function csrf(req:Request,res:Response){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return true;
 // Explicit bearer API requests do not use ambient browser credentials.
 if(req.headers.authorization?.startsWith('Bearer ')&&!req.headers.cookie)return true;
 const expected=process.env.AUTH_PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
 if(req.get('origin')!==expected){res.status(403).json({message:'Request origin is not allowed'});return false;}
 return true;
}
export function eventPermission(method:string,route:string):string|null{
 if(method==='OPTIONS')return null;
 if(method==='GET'&&(route==='/landing-sections/published'||route==='/blobs'))return null;
 const item=/^\/landing-sections\/[^/]+$/.test(route);
 if(method==='GET'&&item)return 'events.read';
 if(method==='POST'&&route==='/landing-sections')return 'events.create';
 if(method==='PUT'&&item)return 'events.update';
 if(method==='DELETE'&&item)return 'events.delete';
 if(method==='PATCH'&&/^\/landing-sections\/[^/]+\/publish$/.test(route))return 'events.publish';
 if(method==='GET'&&route==='/config')return 'events.read';
 if(route==='/s3/list'||route==='/s3/upload')return 'events.storage';
 if(route==='/config'||route.startsWith('/config/')||route==='/logs'||route==='/java-sources'||route.startsWith('/export/'))return 'events.config';
 return '__deny__';
}
/** Browser-facing session proxy. Tokens stay in HttpOnly cookies and never enter URLs or web storage. */
export async function installAuthGateway(app:Express){
 const AUTH_URL=process.env.GHA_AUTH_SERVICE_URL || 'http://127.0.0.1:8084';
 const SERVICE_KEY=process.env.GHA_INTERNAL_SERVICE_KEY || '';

 app.use('/api/v1/auth',async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');
  if(!csrf(req,res))return;
  const route=req.path;
  if(!route.startsWith('/internal/')&&!route.startsWith('/admin/')){res.status(404).json({message:'Route not found'});return;}
  const appId=route.startsWith('/admin/')?'auth-console':(req.body?.appId || req.query.appId || 'event-admin');
  if(!validApp(appId)){res.status(400).json({message:'Invalid application'});return;}
  let bearer=token(req,appId);
  if(route==='/internal/switch'){
   const all=cookies(req);
   bearer=all[cookieName('auth-console')] || all[cookieName('event-admin')] || Object.entries(all).find(([name])=>name.startsWith('gha_app_'))?.[1] || '';
  }
  try{
   const headers:Record<string,string>={'Content-Type':'application/json'};
   if(bearer)headers.Authorization='Bearer '+bearer;
   const upstream=await fetch(AUTH_URL+req.originalUrl,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body||{}),signal:AbortSignal.timeout(10000)});
   const data=upstream.status===204?{}:await upstream.json().catch(()=>({message:'Authentication request failed'}));
   if(route==='/internal/logout'){
    // Sign out the browser's employee workspace, including any earlier app/account cookies.
    for(const name of Object.keys(cookies(req)))if(name.startsWith('gha_app_'))res.clearCookie(name,{path:'/'});
    res.clearCookie(cookieName(appId),{path:'/'});
    if(upstream.ok||upstream.status===401||upstream.status===403){res.status(204).end();return;}
   }
   if(upstream.ok&&data.accessToken&&validApp(data.user?.appId)){
    // Fresh OTP login starts a new employee context; app switching retains the same identity.
    if(route==='/internal/otp/verify')for(const name of Object.keys(cookies(req))){
     if(name.startsWith('gha_app_')&&name!==cookieName(data.user.appId))res.clearCookie(name,{path:'/'});
    }
    res.cookie(cookieName(data.user.appId),data.accessToken,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:Number(data.expiresIn)*1000});
    delete data.accessToken;
   }
   if(upstream.status===204)res.status(204).end();else res.status(upstream.status).json(data);
  }catch{res.status(503).json({message:'Authentication service is unavailable. Please try again.'});}
 });
 app.use('/api/v1/events',async(req:Request,res:Response,next:NextFunction)=>{
  const permission=eventPermission(req.method,req.path);
  if(!permission){next();return;}
  if(!csrf(req,res))return;
  const bearer=token(req,'event-admin') || req.headers.authorization?.replace(/^Bearer /,'') || '';
  if(!bearer){res.status(401).json({message:'Employee sign-in required'});return;}
  if(!SERVICE_KEY){res.status(503).json({message:'Authorization service credential is not configured'});return;}
  try{
   const response=await fetch(AUTH_URL+'/internal/auth/authorize',{method:'POST',headers:{'Content-Type':'application/json','X-GHA-Internal-Key':SERVICE_KEY},body:JSON.stringify({token:bearer,appId:'event-admin',permission}),signal:AbortSignal.timeout(5000)});
   const decision=await response.json().catch(()=>({}));
   if(!response.ok||!decision.allowed){res.status(response.status===401||response.status===403?response.status:503).json({message:decision.message||'Access denied'});return;}
   (req as Request&{employeePermissions?:string[]}).employeePermissions=decision.permissions;
   req.headers.authorization='Bearer '+bearer;next();
  }catch{res.status(503).json({message:'Authorization service unavailable'});}
 });
 const authRoot=path.resolve(ROOT,'../auth');
 // Serve the independently built Auth app. Avoid sharing two Vite module graphs on one origin.
 app.use('/auth',express.static(path.join(authRoot,'dist')));
 app.get(['/auth','/auth/*'],(_req,res)=>res.sendFile(path.join(authRoot,'dist/index.html'),error=>{
  if(error&&!res.headersSent)res.status(503).send('Build the Auth UI first: npm --prefix ../auth run build');
 }));
}
