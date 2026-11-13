// Isolated UI check: uses installed React/Cordis, synthetic images and no host boot.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { transform } from 'esbuild'
import { chromium } from 'playwright'
const app = process.env.TOKENSCOWORK_APP_DIR || '/Applications/TokensCowork.app/Contents/Resources/app'
const web = path.join(app, 'node_modules/@deepseek-ai/dsh-web-frontend/dist')
const html = await readFile(path.join(web, 'index.html'), 'utf8')
const entry = /src="([^"]*assets\/index-[^"]+\.js)"/.exec(html)?.[1]
assert.ok(entry)
const index = await readFile(path.join(web, entry), 'utf8')
const vendor = /from"\.\/(vendor-[^"]+\.js)"/.exec(index)?.[1]
const boundary = /const [A-Za-z_$][\w$]*=globalThis\.dshDesktopBoot/.exec(index)
const factory = /function ([A-Za-z_$][\w$]*)\(\)\{return\{react:/.exec(index)
assert.ok(vendor && boundary && factory, 'Unknown host bootstrap; refusing to start host')
const runtime = index.slice(0, boundary.index) + `window.__testModules=${factory[1]}();`
const plugin = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII='
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#20232b;color:#eee;font:14px system-ui"><div id="root"></div><script>window.__definitions={};window.__ModuleLoader__={load(def){window.__definitions[def.id]=def}};</script><script type="module">
await import('/runtime.js');await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/plugin.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});
const m=window.__testModules,React=m.react,entries=[],definitions=[],reads=[];window.__reads=reads;window.__answers=[];window.__cancels=0;
const ctx=new m['@deepseek-ai/cordis'].Context();
const sessions={list:{subscribe:()=>()=>{},getSnapshot:()=>({byId:{}})},binding(id){reads.push(id);return{session:{async readAttachment(){return{ok:true,value:{attachment:{mediaType:'image/png'},data:Uint8Array.from(atob('${png}'),x=>x.charCodeAt(0))}}}}}}};
const dictionaries=new Map();const locale={register(ns,dicts){dictionaries.set(ns,dicts);return()=>dictionaries.delete(ns)},bind(ns){return(key,params)=>{const template=dictionaries.get(ns)?.[window.__language||'zh']?.[key]??key;return params?template.replace(/\\{(\\w+)\\}/g,(match,name)=>name in params?String(params[name]):match):template}}};
ctx.provide('sessions',sessions);ctx.provide('locale',locale);ctx.provide('uiConversation',{events:{register(definition){definitions.push(definition);return()=>{}}}});ctx.provide('slots',{inject(_name,f){f()},register(options,component){entries.push({options,component})}});
const plugin=window.__definitions['@tokensapi/dsh-media-gen'].factory(name=>m[name]);await ctx.plugin(plugin);
const root=m['react-dom/client'].createRoot(document.getElementById('root'));
const translate=(entry,language)=>{window.__language=language;return locale.bind(entry.options.locale)};
window.__questions=(language='zh')=>{const pending={key:crypto.randomUUID(),questions:[{id:'tokensapi_media__q0__d0__model',header:'模型',question:'选择模型',options:[{label:'minimax_h3（推荐）'},{label:'ltx_2_5'}]},{id:'tokensapi_media__q1__d2__n',header:'数量',question:'生成几张？',options:[{label:'1 张'},{label:'2 张'},{label:'4 张'}]},{id:'tokensapi_media__q2__d0__final_confirm',header:'最终确认',question:'按以下完整配置创建任务吗？',options:[{label:'确认生成'},{label:'取消'}]}],async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');const matched=e.options.select({pendingInteraction:pending});root.render(React.createElement(e.component,{matched,t:translate(e,language)}));};
window.__prompt=(language='zh')=>{const pending={key:crypto.randomUUID(),questions:[{id:'tokensapi_media__q0__d-1__prompt',header:'原始 Prompt',question:'请描述你想生成的图片'}],async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');const matched=e.options.select({pendingInteraction:pending});root.render(React.createElement(e.component,{matched,t:translate(e,language)}));};
window.__image=(language='zh')=>{const e=entries.find(e=>e.options.key==='tokensapi-media-image-result');root.render(React.createElement(e.component,{t:translate(e,language),sessionId:'own-session',node:{data:{toolName:'media_generate_image',block:{kind:'result',content:[{type:'image',attachment:{attachmentId:'image-a',mediaType:'image/png'}}]}}}}));};
window.__video=(language='zh')=>{const e=entries.find(e=>e.options.key==='tokensapi-media-video-result');root.render(React.createElement(e.component,{t:translate(e,language),sessionId:'own-session',node:{data:{toolName:'media_generate_video',block:{kind:'result',content:[{type:'text',text:'URL: https://s3.tokensapi.ai/video.mp4'}]}}}}));};
window.__dispose=()=>ctx.fiber.dispose();window.__ready=true;
</script></body></html>`
await transform(pageHtml.split('<script type="module">')[1].split('</script>')[0], { loader: 'js' })
const routes = new Map([['/', ['text/html', pageHtml]], ['/runtime.js', ['text/javascript', runtime]], ['/plugin.js', ['text/javascript', plugin]], ['/'+vendor, ['text/javascript', await readFile(path.join(web, 'assets', vendor))]]])
const server=createServer((req,res)=>{const value=routes.get(req.url);res.writeHead(value?200:404,{'content-type':value?.[0]||'text/plain'});res.end(value?.[1]||'')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try {
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Isolated media page:',e.message)});page.on('console',m=>{if(m.type()==='error')console.error('Isolated console:',m.text())})
 await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`)?route.continue():route.abort())
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__ready)
 await page.evaluate(()=>window.__questions())
 await page.getByRole('button',{name:/minimax_h3（推荐）/}).waitFor({timeout:3000})
 await page.getByRole('button',{name:'下一步',exact:true}).click()
 await page.getByRole('button',{name:/4 张/}).waitFor({timeout:3000})
 assert.equal(await page.getByRole('button',{name:/4 张/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'下一步',exact:true}).click()
 await page.getByRole('button',{name:'确定',exact:true}).click()
 await page.waitForFunction(()=>window.__answers.length===1)
 assert.deepEqual(await page.evaluate(()=>window.__answers[0].answers.map(a=>a.selected)),[['minimax_h3（推荐）'],['4 张'],['确认生成']])
 await page.evaluate(()=>window.__questions('en'))
 await page.getByRole('button',{name:/minimax_h3 \(Recommended\)/}).waitFor({timeout:3000})
 await page.getByRole('button',{name:'Next',exact:true}).click()
 await page.getByRole('button',{name:/4 images/}).waitFor({timeout:3000})
 assert.equal(await page.getByRole('button',{name:/4 images/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'Next',exact:true}).click()
 await page.getByRole('button',{name:'Confirm',exact:true}).click()
 await page.waitForFunction(()=>window.__answers.length===2)
 assert.deepEqual(await page.evaluate(()=>window.__answers[1].answers.map(a=>a.selected)),[['minimax_h3（推荐）'],['4 张'],['确认生成']])
 await page.evaluate(()=>window.__prompt('en'))
 await page.getByRole('heading',{name:'Describe the image you want to generate'}).waitFor({timeout:3000})
 await page.getByPlaceholder('Other (enter a value)').fill('A sunrise over the sea')
 await page.getByRole('button',{name:'Confirm',exact:true}).click()
 await page.waitForFunction(()=>window.__answers.length===3)
 assert.deepEqual(await page.evaluate(()=>window.__answers[2].answers),[{id:'tokensapi_media__q0__d-1__prompt',selected:[],custom:'A sunrise over the sea'}])
 await page.evaluate(()=>window.__questions('en'));await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>window.__cancels===1)
 await page.evaluate(()=>window.__image('en'));await page.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1)
 assert.deepEqual(await page.evaluate(()=>window.__reads),['own-session'])
 assert.equal(await page.getByRole('link',{name:'Download image'}).count(),1)
 await page.evaluate(()=>window.__video('en'));await page.locator('video').waitFor()
 const videoLink=page.getByRole('link',{name:/Open source video/}).first();await videoLink.waitFor()
 assert.equal(await videoLink.getAttribute('href'),'https://s3.tokensapi.ai/video.mp4')
 assert.deepEqual(errors,[])
 await page.evaluate(()=>window.__dispose())
 console.log('Media browser passed: reactive bilingual display, unchanged wire answers, default selection, cancellation, scoped image attachments, localized downloads and promoted video playback; no model or profile IO.')
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
