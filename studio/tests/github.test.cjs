const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '..');
function setup() {
  const storage = new Map(), requests = [], refs = { 'hinskenny-site': 'base1' };
  const site = JSON.parse(fs.readFileSync(path.join(root, 'content/site.json')));
  const credits = JSON.parse(fs.readFileSync(path.join(root, 'content/credits.json')));
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'content/assets.json')));
  const files = new Set([...site.people.map(x=>x.photo), ...site.timeline.map(x=>x.photo), ...site.photos.map(x=>x.src), ...credits.map(x=>x.file)].filter(Boolean));
  const state = { refs, prs: [], requests, failPR: false, treeCount: 0, closed: false, tree: null, loseRefResponse: false };
  const context = vm.createContext({ window: {}, TextDecoder, Uint8Array, atob, crypto: webcrypto, localStorage: {
    setItem: (k,v)=>storage.set(k,v), getItem: k=>storage.get(k),
  }, fetch: async (url, options) => {
    const p = new URL(url).pathname.replace('/repos/15611257356/hinskenny','');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({p, method:options.method, body});
    let result;
    if (!p) result = { name: 'hinskenny' };
    else if (p.startsWith('/git/ref/heads/')) result = {object:{sha:refs[decodeURIComponent(p.slice('/git/ref/heads/'.length))]}};
    else if (p.startsWith('/contents/')) {
      const value = p.endsWith('site.json') ? site : p.endsWith('credits.json') ? credits : assets;
      result = {encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')};
    }
    else if (p.startsWith('/git/commits/') && options.method==='GET') result = {tree:{sha:'original-tree'}};
    else if (p.startsWith('/git/trees/') && options.method==='GET') result = {tree:[...files].map(path=>({path,type:'blob',size:20}))};
    else if (p==='/git/trees') { state.tree=body; result={sha:'tree'+ ++state.treeCount}; }
    else if (p==='/git/blobs') result={sha:'image-blob'};
    else if (p==='/git/commits') result={sha:'commit'+state.treeCount};
    else if (p==='/git/refs') { refs[body.ref.replace('refs/heads/','')]=body.sha; result={}; if(state.loseRefResponse) {state.loseRefResponse=false; throw Error('lost response');} }
    else if (p.startsWith('/git/refs/heads/')) { assert.equal(body.force,false); refs[decodeURIComponent(p.slice('/git/refs/heads/'.length))]=body.sha; result={}; }
    else if (p==='/pulls' && options.method==='GET') result=state.prs;
    else if (p==='/pulls' && options.method==='POST') {
      if(state.failPR) {state.failPR=false; return {ok:false,status:403};}
      result={number:1,state:'open'}; state.prs.push(result);
    } else if (p==='/pulls/1') result={state:state.closed?'closed':'open'};
    else throw Error('Unexpected request: '+p);
    return {ok:true,json:async()=>result};
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'schemas.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'github.js'),'utf8'),context);
  const api=context.window.STUDIO_GITHUB;
  return {api, store:new api.GitHubStore(), state, storage};
}
async function connected() { const x=setup(); await x.store.connect('test-secret-never-persist'); x.data=await x.store.load(); return x; }
test('JSON validation and atomic PR submission preserve the base tree and never write the deployment branch',async()=>{
  const {store,state,data,storage}=await connected();
  assert.equal(store.validate(data.site,data.credits,data.catalog).issues.filter(i=>i.level==='error').length,0);
  data.site.timeline[0].title='测试内容';
  const pr=await store.submit(data.site,data.credits,data.catalog);
  assert.equal(pr.number,1);
  assert.match(store.branch,/^studio\/content-update-\d{8}-[a-f0-9]{8}$/);
  assert.equal(state.refs['hinskenny-site'],'base1');
  assert.equal(state.tree.base_tree,'original-tree');
  assert.equal(state.tree.tree.length,5);
  assert.ok(state.tree.tree.some(file=>file.path==='studio/content/assets.json'));
  assert.equal([...storage.values()].join().includes('test-secret-never-persist'),false);
  data.site.timeline[0].title='继续编辑';
  await store.submit(data.site,data.credits,data.catalog);
  assert.equal(state.requests.filter(x=>x.p==='/pulls'&&x.method==='POST').length,1);
  assert.equal(state.requests.filter(x=>x.method==='PATCH').length,1);
});
test('base and review branch conflicts stop before any writes',async()=>{
  const {store,state,data}=await connected();
  state.refs['hinskenny-site']='new-base';
  await assert.rejects(()=>store.submit(data.site,data.credits,data.catalog),/部署分支已更新/);
  assert.equal(state.requests.filter(x=>x.method==='POST').length,0);
});
test('partial submission can retry PR creation on the same branch',async()=>{
  const {store,state,data}=await connected(); state.failPR=true;
  await assert.rejects(()=>store.submit(data.site,data.credits,data.catalog),/权限/);
  const branch=store.branch;
  assert.ok(store.draft().head);
  await store.submit(data.site,data.credits,data.catalog);
  assert.equal(store.branch,branch);
  assert.equal(state.requests.filter(x=>x.p==='/git/refs').length,1);
});
test('lost branch response recovers and closed PR rejects updates',async()=>{
  const {store,state,data}=await connected(); state.loseRefResponse=true;
  await store.submit(data.site,data.credits,data.catalog);
  state.closed=true;
  await assert.rejects(()=>store.submit(data.site,data.credits,data.catalog),/已关闭或合并/);
});
test('draft restore retains version context but never credentials',async()=>{
  const {store,data,api}=await connected(); store.saveDraft(data.site,data.credits,data.catalog);
  const other=new api.GitHubStore(); const restored=other.restore(store.draft());
  assert.equal(other.connected,false); assert.equal(other.baseSha,'base1');
  assert.deepEqual(restored.catalog,data.catalog);
});
test('validation rejects missing files, unsafe links, duplicate IDs and unpublished credit references',async()=>{
  const {store,data}=await connected();
  data.site.people[0].photo='images/missing.jpg';
  data.site.timeline[0].source={url:'javascript:alert(1)',label:'bad'};
  data.site.timeline[1].id=data.site.timeline[0].id;
  data.credits[0]._status='draft'; data.site.photos[0].creditId=data.credits[0].id;
  const messages=store.validate(data.site,data.credits,data.catalog).issues.map(x=>x.message).join('|');
  assert.match(messages,/找不到有效图片/); assert.match(messages,/HTTP/); assert.match(messages,/重复/); assert.match(messages,/版权记录/);
});
test('gallery photos can publish before optional accessibility and copyright details are added',async()=>{
  const {store,data}=await connected();
  const photo=data.site.photos[0];
  photo._status='published'; photo.alt=''; photo.creditId='';
  const issues=store.validate(data.site,data.credits,data.catalog).issues.filter(issue=>issue.location===`相册 · ${photo.caption}`);
  assert.equal(issues.some(issue=>/必填|版权记录|替代文本/.test(issue.message)),false,JSON.stringify(issues));
});
test('published payload excludes drafts and internal status metadata',async()=>{
  const {api,data}=await connected(); data.site.timeline[0]._status='draft';
  const result=api.publicData(data.site,data.credits);
  assert.equal(result.site.timeline.length,data.site.timeline.length-1);
  assert.equal(JSON.stringify(result).includes('_status'),false);
});
test('registered image-host links validate, persist, and reject insecure or duplicate URLs',async()=>{
  const {store,state,data}=await connected();
  const asset={id:'asset-test-image',name:'测试图片',url:'https://img.example.com/test.jpg',provider:'123pan',alt:'测试',note:'',status:'active'};
  data.catalog.push(asset); data.site.people[0].photo=asset.url;
  const clean=store.validate(data.site,data.credits,data.catalog).issues.filter(x=>x.location==='人物 · 张敬轩');
  assert.equal(clean.some(x=>/未登记/.test(x.message)),false,JSON.stringify(clean));
  data.catalog.push({...asset,id:'asset-test-image-2'});
  let messages=store.validate(data.site,data.credits,data.catalog).issues.map(x=>x.message).join('|');
  assert.match(messages,/重复登记/);
  data.catalog.pop(); data.catalog[0].url='http://img.example.com/test.jpg';
  messages=store.validate(data.site,data.credits,data.catalog).issues.map(x=>x.message).join('|');
  assert.match(messages,/HTTPS/);
  data.catalog[0]={...asset,url:'https://img.example.com/test.jpg'};
  await store.submit(data.site,data.credits,data.catalog);
  const saved=state.tree.tree.find(file=>file.path==='studio/content/assets.json');
  assert.match(saved.content,/asset-test-image/);
  assert.equal(state.requests.filter(request=>request.p==='/git/blobs').length,0);
});
test('images and JSON share one commit and branch edits cannot overwrite others',async()=>{
  const {store,state,data}=await connected();
  const image='images/studio-1234abcd.png';
  store.uploads[image]={dataUrl:'data:image/png;base64,aGVsbG8=',size:5};
  data.site.people[0].photo=image;
  await store.submit(data.site,data.credits,data.catalog);
  assert.equal(state.tree.tree.length,6);
  assert.equal(state.tree.tree.find(f=>f.path===image).sha,'image-blob');
  state.refs[store.branch]='another-edit';
  const previousWrites=state.requests.filter(x=>x.method==='POST').length;
  await assert.rejects(()=>store.submit(data.site,data.credits,data.catalog),/待审核分支已被更新/);
  assert.equal(state.requests.filter(x=>x.method==='POST').length,previousWrites);
});
test('disconnected requests fail without network access',async()=>{
  const {store,state,data}=await connected(); store.disconnect();
  const count=state.requests.length;
  await assert.rejects(()=>store.submit(data.site,data.credits,data.catalog),/连接 GitHub/);
  assert.equal(state.requests.length,count);
});
