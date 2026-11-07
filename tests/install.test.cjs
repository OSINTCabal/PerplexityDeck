const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const script=path.join(__dirname,'../install.sh');
test('help is available without installing',()=>assert.equal(spawnSync('bash',[script,'--help']).status,0));
test('unknown options are rejected',()=>assert.equal(spawnSync('bash',[script,'--unknown']).status,2));
test('unsafe roots are refused',()=>assert.notEqual(spawnSync('bash',[script],{env:{...process.env,PPLX_ROOT:'/'}}).status,0));
test('old glibc is rejected before application files are created',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'perplexity-compat-'));
 try {
  const bin=path.join(temp,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'getconf'),'#!/bin/sh\necho glibc 2.36\n',{mode:0o755});
  const root=path.join(temp,'app');const r=spawnSync('bash',[script],{env:{...process.env,PPLX_ROOT:root,PATH:bin+path.delimiter+process.env.PATH},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/glibc 2\.39/);assert.equal(fs.existsSync(root),false);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
