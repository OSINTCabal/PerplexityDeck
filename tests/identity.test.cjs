const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('branding preserves the vendor agent and profile location',()=>{
 let name,profile;
 const app={userAgentFallback:'Perplexity/26.11.0',setName:n=>{name=n;},setPath:(k,v)=>{if(k==='userData')profile=v;},commandLine:{getSwitchValue:()=>'',appendSwitch:()=>{}},on:()=>{},whenReady:()=>({then:()=>{}}),setAsDefaultProtocolClient:()=>{},requestSingleInstanceLock:()=>true,prependListener:()=>{}};
 const electron={app,globalShortcut:{register:()=>true}};
 const env={require:n=>n==='electron'?electron:n==='fs'?{mkdirSync:()=>{}}:require(n),process:{env:{XDG_CONFIG_HOME:'/isolated'},versions:{chrome:'140.0.0.0'},argv:[]},URL,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../updater/linux-shim.cjs'),'utf8'),env);
 app.setName('Perplexity');assert.equal(name,'Perplexity');assert.equal(app.userAgentFallback,'Perplexity/26.11.0');assert.equal(profile,'/isolated/perplexity-desktop');
});
