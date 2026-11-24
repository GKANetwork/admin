import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installAuthGateway,eventPermission} from '../authGateway';

test('cookie sessions and CSRF protection at the admin boundary',async()=>{
 process.env.NODE_ENV='production';
 const routes=new Map<string,Function>();
 const app={use:(route:unknown,fn:Function)=>{if(typeof route==='string')routes.set(route,fn);},get:()=>{}};
 await installAuthGateway(app as never);
 const handler=routes.get('/api/v1/auth')!;
 const request=(origin='http://localhost:3000')=>({method:'POST',path:'/internal/otp/verify',body:{appId:'event-admin'},query:{},headers:{},originalUrl:'/api/v1/auth/internal/otp/verify',protocol:'http',get:(key:string)=>key==='origin'?origin:key==='host'?'localhost:3000':undefined});
 function response(){return {statusCode:200,payload:{} as any,options:{} as any,cleared:[] as string[],clearCookie(name:string){this.cleared.push(name);return this;},setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.payload=value;return this;},cookie(_name:string,_token:string,options:unknown){this.options=options;return this;},end(){return this;}};}
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({accessToken:'server-only-token',expiresIn:3600,user:{appId:'event-admin',name:'Asha'}}),{headers:{'Content-Type':'application/json'}});};
 try{
  const denied=response();await handler(request('https://another.example'),denied);assert.equal(denied.statusCode,403);assert.equal(calls,0);
  const accepted=response();await handler(request(),accepted);assert.equal(accepted.statusCode,200);assert.equal(accepted.options.httpOnly,true);assert.equal(accepted.options.sameSite,'lax');assert.equal(accepted.options.secure,true);assert.equal(accepted.payload.accessToken,undefined);assert.equal(accepted.payload.user.name,'Asha');
  const fresh=request() as any;fresh.headers.cookie='gha_app_auth_console=earlier-account; gha_app_event_admin=old-token';
  const replaced=response();await handler(fresh,replaced);
  assert.deepEqual(replaced.cleared,['gha_app_auth_console']);
  const logout=request() as any;logout.path='/internal/logout';logout.originalUrl='/api/v1/auth/internal/logout';
  logout.headers.cookie='gha_app_auth_console=earlier-account; gha_app_event_admin=current-token';
  const signedOut=response();await handler(logout,signedOut);
  assert.equal(signedOut.statusCode,204);assert.ok(signedOut.cleared.includes('gha_app_auth_console'));assert.ok(signedOut.cleared.includes('gha_app_event_admin'));

 }finally{globalThis.fetch=original;}
});
test('function mapping exposes only published mobile reads',()=>{
 assert.equal(eventPermission('GET','/landing-sections/published'),null);
 assert.equal(eventPermission('GET','/landing-sections/admin'),'events.read');
 assert.equal(eventPermission('PATCH','/landing-sections/1/publish'),'events.publish');
 assert.equal(eventPermission('DELETE','/landing-sections/1'),'events.delete');
 assert.equal(eventPermission('POST','/unknown'),'__deny__');
});
