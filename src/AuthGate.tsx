import React,{createContext,useContext,useEffect,useState} from 'react';
type Principal={id:string;name:string;email:string;superAdmin:boolean;appId:string;permissions:string[];accessibleApps?:string[]};
const Access=createContext<{user:Principal;can:(permission:string)=>boolean}|null>(null);
export function useEventAccess(){const value=useContext(Access);if(!value)throw new Error('Employee session required');return value;}
export function AuthGate({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<Principal|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  async function load(){try{
   const response=await fetch('/api/v1/auth/internal/session?appId=event-admin',{cache:'no-store'});
   if(response.status===401){location.replace('/auth/?app=event-admin');return;}
   if(!response.ok)throw new Error(response.status===403?'Your employee account does not have access to Events Admin.':'Authentication service is unavailable. Please retry shortly.');
   const result=await response.json();if(active){setUser(result);setError('');}
  }catch(e){if(active){setUser(null);setError(e instanceof Error?e.message:'Unable to check session');}}}
  load();const interval=setInterval(load,60000);return()=>{active=false;clearInterval(interval)};
 },[]);
 const signOut=async()=>{await fetch('/api/v1/auth/internal/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:'event-admin'})});location.replace('/auth/?app=event-admin');};
 if(error)return <main className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50 p-8"><h1 className="text-xl font-semibold">Workspace access</h1><p role="alert">{error}</p><button onClick={()=>location.reload()}>Retry</button><button onClick={signOut}>Sign out</button></main>;
 if(!user)return <div className="p-12 text-slate-500">Checking employee session…</div>;
 const can=(permission:string)=>user.superAdmin||user.permissions.includes(permission);
 if(!can('events.read'))return <main className="p-12"><h1>No event viewing permission</h1><p>Ask your administrator to assign an Events role with read access.</p><button onClick={signOut}>Sign out</button></main>;
 return <Access.Provider value={{user,can}}><div className="flex items-center justify-end gap-4 border-b border-slate-200 bg-slate-900 px-6 py-2 text-xs text-white"><span>{user.name}</span>{(user.superAdmin || user.accessibleApps?.includes('auth-console')) && <a className="text-emerald-200" href="/auth/?app=auth-console">Identity & Access</a>}<button onClick={signOut}>Sign out</button></div>{children}</Access.Provider>;
}
