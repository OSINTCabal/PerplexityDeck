const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const C=require('../updater/upd-core');
test('rejects incomplete versions',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'manus-test-'));
 try {fs.mkdirSync(path.join(root,'app-99.0'));fs.writeFileSync(path.join(root,'app-99.0/.complete'),'');assert.deepEqual(C.installedVersions(root),[]);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failed activation restores original directory',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'manus-test-'));
 const original=fs.renameSync;
 try {fs.mkdirSync(path.join(root,'app-2.1.0'));fs.writeFileSync(path.join(root,'app-2.1.0/original'),'saved');fs.mkdirSync(path.join(root,'new'));fs.renameSync=(a,b)=>{if(a===path.join(root,'new'))throw Error('failure');return original(a,b);};assert.throws(()=>C.commit(root,path.join(root,'new'),'2.1.0'));assert.equal(fs.readFileSync(path.join(root,'app-2.1.0/original'),'utf8'),'saved');}finally{fs.renameSync=original;fs.rmSync(root,{recursive:true,force:true});}
});
test('update lock excludes competitors and can be reacquired',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'manus-test-'));
 try {const release=await C.lock(root);try{await assert.rejects(C.lock(root));}finally{await release();}await(await C.lock(root))();}finally{fs.rmSync(root,{recursive:true,force:true});}
});
