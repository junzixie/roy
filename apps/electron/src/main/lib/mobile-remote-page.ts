export const MOBILE_REMOTE_HTML = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Roy</title><style>*{box-sizing:border-box}.sugs{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}.sug{border:1px solid #dcdcdc;background:#fff;color:#333;border-radius:999px;padding:6px 12px;font-size:14px}body{margin:0;background:#fff;color:#171717;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}button,input,textarea{font:inherit}header{position:sticky;top:0;z-index:2;padding:calc(14px + env(safe-area-inset-top)) 18px 8px;background:#fff}h1{margin:0 0 14px;font-size:34px}main{padding:0 14px 8px}body.has-dock main{padding-bottom:96px}body:not(.has-dock) main{padding-bottom:calc(84px + env(safe-area-inset-bottom))}#dock{position:fixed;left:0;right:0;bottom:0;padding:0 10px calc(8px + env(safe-area-inset-bottom));background:#fff;z-index:3}#dock:empty{display:none}.search,.field{width:100%;border:0;border-radius:14px;background:#f3f4f6;padding:13px 14px}.section{margin:18px 4px 8px;color:#8b8b8b;font-size:14px}.item,.card{display:flex;gap:12px;align-items:center;width:100%;border:0;background:#fff;text-align:left;padding:11px 4px}.icon{width:42px;height:42px;border-radius:12px;background:#eef5ff;color:#2f6fed;display:grid;place-items:center;flex:none}.running{background:#eef6ff;border-radius:16px;padding:13px}.dot{width:8px;height:8px;border-radius:50%;background:#2f6fed}.meta,.muted{color:#8d8d8d;font-size:13px}.pin{margin-left:auto;color:#b0b0b0}.fab{position:fixed;right:18px;bottom:86px;width:58px;height:58px;border:0;border-radius:50%;background:#2f6fed;color:#fff;font-size:28px;box-shadow:0 8px 22px #2f6fed44}nav{position:fixed;left:0;right:0;bottom:0;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #eee;background:#fff;padding:7px 0 calc(12px + env(safe-area-inset-bottom))}nav button{border:0;background:transparent;color:#8d8d8d}nav button.on{color:#2f6fed}.msg{max-width:92%;margin:14px 0;white-space:pre-wrap;overflow-wrap:anywhere}.msg.user{margin-left:auto;width:fit-content;max-width:82%;background:#2f6fed;color:#fff;padding:10px 14px;border-radius:18px 18px 4px 18px;font-size:16px;line-height:1.5;box-shadow:0 2px 8px #2f6fed33}.msg.bot{color:#1f2328;font-size:16px;line-height:1.7;padding:0 2px}.who{display:block;margin:0 0 4px;color:#2f6fed;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.5px}.answer{color:#1f2328}.answer p{margin:0 0 8px}.answer p:last-child{margin-bottom:0}.answer ul,.answer ol{margin:6px 0 8px;padding-left:20px}.answer li{margin:2px 0}.answer h1,.answer h2,.answer h3,.answer h4{margin:12px 0 6px;font-size:1.05em;font-weight:600;line-height:1.35}.answer h1{font-size:1.2em}.answer h2{font-size:1.12em}.answer code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.answer pre{margin:8px 0;padding:10px 12px;background:#f6f8fa;border:1px solid #e5e8eb;border-radius:10px;overflow-x:auto;-webkit-overflow-scrolling:touch}.answer pre code{background:none;padding:0;font-size:12.5px;line-height:1.55;white-space:pre}.answer blockquote{margin:8px 0;padding:2px 0 2px 10px;border-left:3px solid #d8dde3;color:#5c6370}.answer table{border-collapse:collapse;margin:8px 0;font-size:13.5px;display:block;overflow-x:auto}.answer th,.answer td{border:1px solid #e0e3e7;padding:5px 9px;text-align:left}.answer th{background:#f6f8fa;font-weight:600}.answer a{color:#2f6fed;text-decoration:none;border-bottom:1px solid #2f6fed55}.answer hr{border:0;border-top:1px solid #e5e8eb;margin:12px 0}.answer img{max-width:100%;border-radius:8px}.thinking{display:block;margin:4px 0 10px;padding:6px 10px 6px 11px;border-left:3px solid #b9bfe6;border-radius:0 10px 10px 0;background:#f6f7fb;color:#6b7080;font-size:13.5px;line-height:1.6;font-style:italic;font-family:Georgia,"Songti SC","STSong","Noto Serif SC",serif}.thinking summary{cursor:pointer;color:#6d74c9;font:600 12.5px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-style:normal;list-style:none;-webkit-user-select:none;user-select:none}.thinking summary::-webkit-details-marker{display:none}.thinking summary:before{content:"▸ ";}.thinking[open] summary:before{content:"▾ ";}.thinking .tbody{margin-top:4px;max-height:45vh;overflow:auto}.tool{display:inline-block;margin:4px 6px 4px 0;padding:2px 9px;border-radius:999px;background:#eef1f5;color:#4d5562;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}.composer{display:flex;gap:8px;padding:10px 10px calc(10px + env(safe-area-inset-bottom));background:#fff;border:1px solid #ececec;border-radius:14px;box-shadow:0 -2px 12px #0000000a}.composer textarea{flex:1;min-height:42px;max-height:120px}.primary,.secondary{border:0;border-radius:12px;padding:10px 13px}.primary{background:#2f6fed;color:#fff}.secondary{background:#f3f4f6}.jump{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);border:0;border-radius:999px;background:#fff;box-shadow:0 4px 16px #0002;padding:8px 13px;color:#2f6fed}.error{color:#b42318}</style><body><header id="head"></header><main id="app"></main><div id="dock"></div><script>
const app=document.querySelector('#app'),head=document.querySelector('#head'),dock=document.querySelector('#dock');let token=localStorage.getItem('roy-mobile-token'),tab='chats',current=null,data={},version=-1,before=null,source,stick=true,searchTimer,renderTimer=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago=t=>{const m=Math.max(1,Math.round((Date.now()-t)/60000));return m<60?m+' 分钟前':m<1440?Math.round(m/60)+' 小时前':new Date(t).toLocaleDateString()};
function rid(){const a=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}
function toast(m){let t=document.querySelector('#toast');if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86%;background:rgba(30,30,30,.92);color:#fff;padding:10px 14px;border-radius:12px;font-size:14px;z-index:99;text-align:center';document.body.appendChild(t)}t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',3500)}
const act=(path,body)=>api(path,'POST',body).catch(e=>{toast(e.message||'操作失败');throw e});
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:{'Content-Type':'application/json',...token?{Authorization:'Bearer '+token}:{}},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'请求失败');return j}
function shell(title,body){unmountDock();head.innerHTML='<h1>'+title+'</h1>';app.innerHTML=body+'<nav><button data-tab="chats"'+(tab==='chats'?' class="on"':'')+'>对话</button><button data-tab="computer"'+(tab==='computer'?' class="on"':'')+'>电脑</button><button data-tab="me"'+(tab==='me'?' class="on"':'')+'>我的</button></nav>';app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{const t=b.dataset.tab;if(t!=='chats'&&tab==='chats'&&!current)history.pushState({tab:t},'');tab=t;current=null;refresh()})}
function deviceKey(){let k=localStorage.getItem('roy-mobile-device');if(!k||!/^[A-Za-z0-9_-]{16,64}$/.test(k)){const a=new Uint8Array(18);crypto.getRandomValues(a);k=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('roy-mobile-device',k)}return k}
function deviceName(){const ua=navigator.userAgent;if(/iPad/.test(ua))return 'iPad';if(/iPhone/.test(ua))return 'iPhone';const ai=ua.indexOf('Android');if(ai>=0){const rest=ua.slice(ai);const semi=rest.indexOf(';');if(semi>=0){const model=rest.slice(semi+1).split(';')[0].split(')')[0].split(' Build/')[0].trim();if(model&&model!=='K'&&model!=='wv')return '安卓手机 · '+model.slice(0,30)}}return /Android/.test(ua)?'安卓手机':'我的手机'}
function pair(){shell('连接 Roy','<section class="card"><p>打开电脑 Roy 的设置 → 通用 → 手机遥控，用手机扫二维码就会自动连上。</p><input class="field" id="code" placeholder="或粘贴配对码"><p><button class="primary" id="pair">连接</button></p><p id="err" class="error"></p></section>');const params=new URLSearchParams(location.search);const doPair=async()=>{try{const j=await api('/api/pair','POST',{code:document.querySelector('#code').value.trim(),name:deviceName(),deviceKey:deviceKey()});token=j.token;localStorage.setItem('roy-mobile-token',token);history.replaceState(null,'','/');connect();refresh()}catch(e){document.querySelector('#err').textContent=e.message}};if(params.get('code')){document.querySelector('#code').value=params.get('code');doPair()}document.querySelector('#pair').onclick=doPair}
function chats(){const rows=data.sessions||[],running=rows.filter(x=>x.active);shell('Roy','<input class="search" id="q" placeholder="搜索聊过的内容">'+(running.length?'<div class="section">进行中的任务</div>'+running.map(x=>'<button class="running item" data-id="'+esc(x.id)+'"><span class="dot"></span><span><strong>'+esc(x.title)+'</strong><br><span class="meta">这台电脑 · 运行中</span></span></button>').join(''):'')+'<div class="section">对话 · 1 台电脑在线</div>'+rows.map(x=>'<button class="item" data-id="'+esc(x.id)+'"><span class="icon">▣</span><span><strong>'+esc(x.title)+'</strong><br><span class="meta">'+(x.active?'任务进行中 · ':'')+ago(x.updatedAt)+'</span></span>'+(x.pinned?'<span class="pin">📌</span>':'')+'</button>').join('')+'<button class="fab" id="new">✎</button>');document.querySelector('#new').onclick=async()=>{try{const j=await act('/api/sessions',{});openChat(j.session.id)}catch(_){}};document.querySelector('#q').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(e.target.value),350)};app.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openChat(b.dataset.id))}
async function search(q){if(!q.trim())return refresh();const j=await api('/api/search?q='+encodeURIComponent(q));app.querySelectorAll('.item,.running,.section').forEach(x=>x.remove());app.insertAdjacentHTML('beforeend',j.results.map(x=>'<button class="item" data-id="'+esc(x.sessionId)+'"><span class="icon">▣</span><span><strong>'+esc(x.title)+'</strong><br><span class="meta">'+esc(x.snippet)+'</span></span></button>').join('')||'<p class="muted">没有找到</p>');app.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openChat(b.dataset.id))}
function computer(){shell('我的电脑','<p class="muted">选择这台在线电脑，Roy 会在电脑上完成任务；需要确认的操作会推送到手机。</p><section class="item card"><span class="icon">▣</span><span style="flex:1"><strong>'+esc(data.bootstrap?.computer||'这台电脑')+'</strong><br><span class="meta">在线 · 可遥控</span></span><button class="primary" id="use">让它做事</button></section>');document.querySelector('#use').onclick=()=>{tab='chats';refresh()}}
function me(){shell('我的','<section class="card"><strong>已连接这台电脑</strong><p class="muted">'+esc(data.bootstrap?.computer||'')+'</p><button class="secondary" id="logout">解除配对</button></section>');document.querySelector('#logout').onclick=async()=>{await api('/api/logout','POST',{});localStorage.removeItem('roy-mobile-token');token=null;location.reload()}}
function cutSug(t){t=String(t||'');const i=t.lastIndexOf('<!--');if(i<0)return t;const rest=t.slice(i);return ('<!--suggest:'.startsWith(rest.slice(0,12))||rest.startsWith('<!--suggest:'))?t.slice(0,i).trimEnd():t}
// 轻量 Markdown 渲染：先转义防 XSS，再处理代码块/表格/标题/列表/加粗/链接。
// 不引入第三方库，避免手机端加载额外体积。
function md(src){
  let t=esc(cutSug(String(src||'')));
  const blocks=[];
  // 先抽出围栏代码块，避免内部内容被后续规则破坏
  const FENCE=String.fromCharCode(96,96,96);t=t.replace(new RegExp(FENCE+'([a-z0-9+#-]*)\\n([\\s\\S]*?)'+FENCE,'gi'),(m,lang,code)=>{blocks.push('<pre><code>'+code.replace(/\\n$/,'')+'</code></pre>');return String.fromCharCode(1)+'CB'+(blocks.length-1)+String.fromCharCode(1)});
  // 行内代码
  t=t.replace(new RegExp(String.fromCharCode(96)+'([^'+String.fromCharCode(96)+'\\n]+)'+String.fromCharCode(96),'g'),'<code>$1</code>');
  // 标题
  t=t.replace(/^######\\s+(.+)$/gm,'<h4>$1</h4>').replace(/^#####\\s+(.+)$/gm,'<h4>$1</h4>').replace(/^####\\s+(.+)$/gm,'<h4>$1</h4>').replace(/^###\\s+(.+)$/gm,'<h3>$1</h3>').replace(/^##\\s+(.+)$/gm,'<h2>$1</h2>').replace(/^#\\s+(.+)$/gm,'<h1>$1</h1>');
  // 分隔线
  t=t.replace(/^---+$/gm,'<hr>');
  // 引用
  t=t.replace(/^&gt;\\s?(.+)$/gm,'<blockquote>$1</blockquote>');
  // 加粗 / 斜体 / 删除线
  t=t.replace(/\\*\\*([^*\\n]+)\\*\\*/g,'<strong>$1</strong>').replace(/(^|[^*])\\*([^*\\n]+)\\*/g,'$1<em>$2</em>').replace(/~~([^~\\n]+)~~/g,'<del>$1</del>');
  // 链接
  t=t.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 表格：连续以 | 开头的行
  t=t.replace(/(^\\|.+\\|\\n\\|[-:\\s|]+\\|\\n(?:\\|.+\\|\\n?)*)/gm,(table)=>{
    const rows=table.trim().split('\\n').filter(r=>r.trim());
    if(rows.length<2)return table;
    const cells=(r)=>r.replace(/^\\||\\|$/g,'').split('|').map(c=>c.trim());
    const head=cells(rows[0]);
    const body=rows.slice(2).map(cells);
    return '<table><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  });
  // 列表
  t=t.replace(/(?:^[-*+]\\s+.+$\\n?)+/gm,(m)=>'<ul>'+m.trim().split('\\n').map(l=>'<li>'+l.replace(/^[-*+]\\s+/,'')+'</li>').join('')+'</ul>');
  t=t.replace(/(?:^\\d+\\.\\s+.+$\\n?)+/gm,(m)=>'<ol>'+m.trim().split('\\n').map(l=>'<li>'+l.replace(/^\\d+\\.\\s+/,'')+'</li>').join('')+'</ol>');
  // 段落：非标签行包 <p>
  t=t.split(/\\n{2,}/).map(chunk=>{
    const s=chunk.trim();
    if(!s)return '';
    if(/^<(h[1-4]|ul|ol|pre|table|blockquote|hr)/.test(s)||/^\\u0001CB\\d+\\u0001/.test(s))return s;
    return '<p>'+s.replace(/\\n/g,'<br>')+'</p>';
  }).join('');
  // 回填代码块
  t=t.replace(/\\u0001CB(\\d+)\\u0001/g,(m,i)=>blocks[Number(i)]||'');
  return t;
}
function sugOf(m){const t=(m.blocks||[]).filter(b=>b.type!=='thinking'&&b.type!=='tool').map(b=>b.text||'').join('');const i=t.lastIndexOf('<!--suggest:');if(i<0)return [];const j=t.indexOf('-->',i);if(j<0)return [];return t.slice(i+12,j).split('|').map(x=>x.trim()).filter(x=>x&&x.length<=30).slice(0,3)}
const thinkOpen={};
function blocks(m,live){const list=m.blocks||[];if(m.role==='user')return list.map(b=>esc(b.text)).join('');return '<span class="who">Roy</span>'+list.map((b,i)=>{if(b.type==='thinking'){const k=esc((m.id||'')+':'+i),running=live&&i===list.length-1,open=k in thinkOpen?thinkOpen[k]:running,t=String(b.text||'').trim();return '<details class="thinking" data-k="'+k+'"'+(open?' open':'')+'><summary>'+(running?'正在思考…':'思考过程')+(t?' · '+t.length+' 字':'')+'</summary>'+(t?'<div class="tbody">'+esc(t)+'</div>':'')+'</details>'}if(b.type==='tool')return '<span class="tool">⚙ '+esc(b.name||String(b.text||'').replace('调用工具：',''))+'</span>';return '<div class="answer" data-i="'+i+'">'+md(b.text)+'</div>'}).join('')}
function nearBottom(){const b=document.scrollingElement||document.documentElement;return b.scrollHeight-b.scrollTop-innerHeight<140}
function applyScroll(){const b=document.scrollingElement||document.documentElement;requestAnimationFrame(function(){if(stick)b.scrollTop=b.scrollHeight})}
function scheduleRefresh(delay){if(renderTimer)clearTimeout(renderTimer);renderTimer=setTimeout(function(){renderTimer=null;refresh()},delay||260)}
function mountDock(){document.body.classList.add('has-dock');const nv=document.querySelector('nav');if(nv)nv.style.display='none';if(dock.querySelector('form'))return;dock.innerHTML='<form class="composer"><textarea class="field" id="text" placeholder="还可以继续补充..."></textarea><button class="secondary" id="stop" type="button">■</button><button class="primary" type="submit">发送</button></form>';const ta=dock.querySelector('#text');const fit=function(){ta.style.height='auto';ta.style.height=Math.min(120,Math.max(42,ta.scrollHeight))+'px'};ta.addEventListener('input',fit);fit();dock.querySelector('form').onsubmit=async function(e){e.preventDefault();const text=ta.value.trim();if(!text)return;const btn=dock.querySelector('form [type=submit]');if(btn)btn.disabled=true;try{await act('/api/sessions/'+current+'/send',{text:text,requestId:rid()});ta.value='';fit();stick=true;refresh()}catch(_){}finally{if(btn)btn.disabled=false}};dock.querySelector('#stop').onclick=function(){act('/api/sessions/'+current+'/stop',{}).catch(function(){})}}
function unmountDock(){document.body.classList.remove('has-dock');const nv=document.querySelector('nav');if(nv)nv.style.display='';dock.innerHTML=''}
function article(m,live){return '<article class="msg '+(m.role==='user'?'user':'bot')+'"'+(live?' data-row="'+esc(m.id||'')+'"':'')+'>'+blocks(m,live)+'</article>'}
function onText(items){
  const c=data.conversation;if(!current||!c)return;
  let missing=false;
  for(const it of items){
    if(it.s!==current)continue;
    const row=(c.live||[]).find(m=>m.id===it.r);
    if(!row){missing=true;continue}
    const b=row.blocks[it.i]||(row.blocks[it.i]={type:'text',text:''});
    b.text=(b.text||'')+it.d;
    const el=document.querySelector('article[data-row="'+CSS.escape(it.r)+'"] .answer[data-i="'+it.i+'"]');
    if(el)el.innerHTML=md(b.text);else missing=true;
  }
  if(missing)scheduleRefresh(60);else applyScroll();
}
function liveSection(c,rows){
  const live=c.live||[];
  const last=rows[rows.length-1];
  let sug='';
  if(last&&last.role!=='user'&&!live.length){const items=sugOf(last);if(items.length)sug='<div class="sugs">'+items.map(x=>'<button class="sug" data-sug="'+esc(x)+'">'+esc(x)+'</button>').join('')+'</div>'}
  const perms=(c.permissions||[]).map(p=>'<section class="card"><strong>等待确认</strong><p>'+esc(p.description)+'</p><button class="primary" data-allow="'+esc(p.requestId)+'">允许</button> <button class="secondary" data-deny="'+esc(p.requestId)+'">拒绝</button></section>').join('');
  const qs=(c.questions||[]).map(q=>'<section class="card">'+q.questions.map(x=>'<p>'+esc(x.question)+'</p><input class="field" data-key="'+esc(x.question)+'">').join('')+'<button class="primary" data-answer="'+esc(q.requestId)+'">提交</button></section>').join('');
  const jump=stick?'':'<button class="jump" id="jump">回到底部 ↓</button>';
  return live.map(m=>article(m,true)).join('')+sug+perms+qs+jump;
}
function conversation(){
  const c=data.conversation;if(!c)return;
  mountDock();
  const msgs=c.messages||[],live=c.live||[],rows=[...msgs,...live];
  head.innerHTML='<div class="row" style="display:flex;gap:8px;align-items:center"><button class="secondary" id="back">‹</button><h1 style="font-size:22px">'+esc(c.session.title)+'</h1></div>';
  const sig=[msgs.length,msgs.length?msgs[msgs.length-1].id:'',c.before==null?0:1,c.error||'',c.session.title].join('|');
  const list=document.querySelector('#list');
  if(list&&list.dataset.sig===sig){
    const lw=document.querySelector('#livewrap');
    if(lw)lw.innerHTML=liveSection(c,rows);
    applyScroll();
    return;
  }
  app.innerHTML=(c.before!=null?'<button class="secondary" id="earlier">查看更早</button>':'')+(c.error?'<p class="error">'+esc(c.error)+'</p>':'')+'<div id="list" data-sig="'+esc(sig)+'">'+msgs.map(m=>article(m,false)).join('')+'<div id="livewrap">'+liveSection(c,rows)+'</div></div>';
  applyScroll();
}
function onAppClick(e){
  const t=e.target;if(!t||!t.closest)return;
  const sum=t.closest('details.thinking>summary');
  if(sum){const d=sum.parentElement;thinkOpen[d.dataset.k]=!d.open;return}
  if(t.closest('#back')){if(history.state&&history.state.chat)history.back();else{current=null;refresh()}return}
  if(t.closest('#earlier')){const c=data.conversation;if(c&&c.before!=null){before=c.before;version=-1;refresh()}return}
  if(t.closest('#jump')){stick=true;applyScroll();return}
  const sug=t.closest('[data-sug]');
  if(sug){act('/api/sessions/'+current+'/send',{text:sug.dataset.sug,requestId:rid()}).then(function(){stick=true;refresh()}).catch(function(){});return}
  const allow=t.closest('[data-allow]'),deny=t.closest('[data-deny]');
  if(allow||deny){const b=allow||deny;act('/api/sessions/'+current+'/respond',{kind:'permission',requestId:b.dataset.allow||b.dataset.deny,behavior:allow?'allow':'deny'}).catch(function(){});return}
  const ans=t.closest('[data-answer]');
  if(ans){const answers={};ans.parentElement.querySelectorAll('[data-key]').forEach(function(i){answers[i.dataset.key]=i.value});act('/api/sessions/'+current+'/respond',{kind:'question',requestId:ans.dataset.answer,answers:answers}).catch(function(){});return}
}
window.addEventListener('popstate',()=>{if(current){current=null;refresh()}else if(tab!=='chats'){tab='chats';refresh()}});async function openChat(id){if(!(history.state&&history.state.chat===id))history.pushState({chat:id},'');current=id;tab='chats';before=null;version=-1;stick=true;await refresh()}
async function refresh(){
  if(!token)return pair();
  try{
    if(!data.bootstrap)data.bootstrap=await api('/api/bootstrap');
    if(current){
      const next=await api('/api/sessions/'+encodeURIComponent(current)+(before==null?'':'?before='+before));
      if(next.version!==version||before!=null){version=next.version;data.conversation=next;conversation()}
    }else if(tab==='computer')computer();
    else if(tab==='me')me();
    else{data.sessions=(await api('/api/sessions')).sessions;chats()}
  }catch(e){
    if(/配对|扫码/.test(e.message)){localStorage.removeItem('roy-mobile-token');token=null;pair()}
    else head.insertAdjacentHTML('beforeend','<p class="error">'+esc(e.message)+'</p>')
  }
}
function connect(){
  source?.close();if(!token)return;
  source=new EventSource('/api/events?token='+encodeURIComponent(token));
  source.onmessage=function(){if(document.visibilityState==='visible')scheduleRefresh(120)};
  source.addEventListener('text',function(e){if(document.visibilityState!=='visible')return;try{onText(JSON.parse(e.data))}catch(_){scheduleRefresh(120)}});
  source.onopen=function(){const r=head.querySelector('.reconnect');if(r)r.remove()};
  source.onerror=function(){if(!head.querySelector('.reconnect'))head.insertAdjacentHTML('beforeend','<span class="error reconnect">正在重连</span>')}
}
document.addEventListener('scroll',function(){stick=nearBottom()},{passive:true});
document.addEventListener('click',onAppClick);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});if(new URLSearchParams(location.search).get('code'))pair();else if(token){connect();refresh()}else pair();
</script>`
