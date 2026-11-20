// Isolated UI check: uses installed React/Cordis, synthetic images and no host boot.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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
const nativeQuestionSource = (await readFile(path.join(app, 'node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js'), 'utf8'))
  .replace('exports.apply = apply;', 'window.__NativePendingQuestion = PendingQuestion; exports.apply = apply;')
const slotCoreSource = await readFile(path.join(app, 'node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js'), 'utf8')
const hostQuestionSets = {}
const host = await import('../dist/index.js')
for (const intent of ['image_gen', 'image_edit', 'video_gen']) {
  const tools = new Map(), batches = []
  host.apply({
    effect(fn) { return fn() }, get() {}, webServer: { register() { return () => {} } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => {} } },
    systemPrompt: { section() {} }, credentials: { async resolve() {} }, logger: { warn() {} },
    userQuestions: { async ask({ questions }) {
      batches.push(questions)
      return { answers: questions.map((q) => ({ id: q.id, selected: q.id.endsWith('__enhance') ? ['保持原始 Prompt'] : q.initialSelected ?? [] })) }
    } },
  }, host.Config({}))
  const execution = { signal: new AbortController().signal, agent: { session: { id: `browser-${intent}`, deriveMessages: () => [{ id: 'request-1', role: 'user', source: { kind: 'user' }, content: [] }] } } }
  const result = await tools.get('media_wizard').execute({ intent, known: { prompt: 'A scene\nwith two lines', ...(intent === 'image_edit' ? { image: 'https://example.com/input.png' } : {}) } }, execution)
  assert.equal(result.confirmed, true)
  // Current Host schema removes initialSelected; default metadata must survive.
  hostQuestionSets[intent] = batches.flat().map(({ initialSelected, ...question }) => question)
}
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII='
const testVideo = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=0.4', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'])
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#20232b;color:#eee;font:14px system-ui"><div id="root"></div><script>window.__definitions={};window.__ModuleLoader__={load(def){window.__definitions[def.id]=def}};</script><script type="module">
await import('/runtime.js');for(const src of ['/plugin.js','/native-questions.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s)});
const m=window.__testModules,React=m.react,entries=[],definitions=[],reads=[];window.__reads=reads;window.__answers=[];window.__cancels=0;
const {SlotCore}=await import('/slots.js');const slotCore=new SlotCore();slotCore.register({name:'root',children:{'conversation.composer':{kind:'chain',scope:'session'},'conversation.chat.node':{kind:'keyed',scope:'session'},'tool.call.toolview':{kind:'keyed',scope:'session'}}},()=>null);
const ctx=new m['@deepseek-ai/cordis'].Context();
const sessions={list:{subscribe:()=>()=>{},getSnapshot:()=>({byId:{}})},binding(id){reads.push(id);return{session:{async readAttachment(){return{ok:true,value:{attachment:{mediaType:'image/png'},data:Uint8Array.from(atob(window.__imageData||'${png}'),x=>x.charCodeAt(0))}}}}}}};
const dictionaries=new Map();const locale={register(ns,dicts){dictionaries.set(ns,dicts);return()=>dictionaries.delete(ns)},bind(ns){return(key,params)=>{const template=dictionaries.get(ns)?.[window.__language||'zh']?.[key]??key;return params?template.replace(/\\{(\\w+)\\}/g,(match,name)=>name in params?String(params[name]):match):template}}};
const slots={inject(_name,f){f()},register(options,component){entries.push({options,component});return slotCore.register(options,component)}};
const uiConversation={events:{register(definition){definitions.push(definition);return()=>{}}}};
ctx.provide('sessions',sessions);ctx.provide('locale',locale);ctx.provide('uiConversation',uiConversation);ctx.provide('slots',slots);
const plugin=window.__definitions['@tokensapi/dsh-media-gen'].factory(name=>m[name]);await ctx.plugin(plugin);
const native=window.__definitions['@deepseek-ai/dsh-client-ui-user-questions'].factory(name=>m[name]);
const nativeCleanups=[];native.apply({locale,sessions,slots,uiConversation,effect(fn){const cleanup=fn();if(typeof cleanup==='function')nativeCleanups.push(cleanup)},uiSession:{registerPendingInteraction(){return()=>{}}},reflect:{provide(){return()=>{}}},remote:{$on(){return()=>{}}}});
const root=m['react-dom/client'].createRoot(document.getElementById('root'));
const translate=(entry,language)=>{window.__language=language;return locale.bind(entry.options.locale)};
const hostQuestionSets=${JSON.stringify(hostQuestionSets)};window.__hidden=0;
window.__hostChoices=(intent,language='zh',questions=hostQuestionSets[intent])=>{window.__nativePending?.close();const pending=new window.__NativePendingQuestion('own-session',questions,crypto.randomUUID());pending.attachSeat({hide(){window.__hidden++}});pending.attachWaterfall({deadline:Date.now()+60000,resolve(value){window.__answers.push(value);pending.close()},reject(){window.__cancels++;pending.close()},delegate(){}});window.__nativePending=pending;let winner;for(const e of slotCore.entriesOfSlot('conversation.composer')){const matched=e.select?.({pendingInteraction:pending});if(matched!==null&&matched!==undefined){winner={e,matched};break}}if(winner?.e.locale!=='tokensapi.media-gen')throw new Error('Media composer lost to native fallback for a real PendingQuestion');window.__winner=winner.e.locale;window.__modernShape={cancel:typeof pending.cancel,dismiss:typeof pending.dismiss,dismissal:pending.dismissal};window.__language=language;root.render(React.createElement(winner.e.component,{matched:winner.matched,t:locale.bind(winner.e.locale)}));};
window.__questions=(language='zh')=>{const pending={key:crypto.randomUUID(),questions:[{id:'tokensapi_media__q0__d0__model',header:'模型',question:'选择模型',options:[{label:'minimax_h3_image（推荐）'},{label:'qwen_image'}]},{id:'tokensapi_media__q1__d2__n',header:'数量',question:'生成几张？',options:[{label:'1 张'},{label:'2 张'},{label:'4 张'}]}],async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');const matched=e.options.select({pendingInteraction:pending});root.render(React.createElement(e.component,{matched,t:translate(e,language)}));};
window.__prompt=(language='zh')=>{const pending={key:crypto.randomUUID(),questions:[{id:'tokensapi_media__q0__d-1__prompt',header:'原始 Prompt',question:'请描述你想生成的图片'}],async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');const matched=e.options.select({pendingInteraction:pending});root.render(React.createElement(e.component,{matched,t:translate(e,language)}));};
window.__h3Resolution=(language='en')=>{const pending={key:crypto.randomUUID(),questions:[{id:'tokensapi_media__q0__d1__resolution',header:'分辨率',question:'选择图片分辨率',options:[{label:'1k'},{label:'2k'}],initialSelected:['2k']}],async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');const matched=e.options.select({pendingInteraction:pending});root.render(React.createElement(e.component,{matched,t:translate(e,language)}));};
window.__choices=(questions,language='zh')=>{const pending={key:crypto.randomUUID(),questions,async answer(value){window.__answers.push(value)},async cancel(){window.__cancels++}};const e=entries.find(e=>e.options.name==='conversation.composer');root.render(React.createElement(e.component,{matched:e.options.select({pendingInteraction:pending}),t:translate(e,language)}));};
window.__progress=(toolName,language='zh',status='pending')=>{const kind=toolName==='media_generate_video'?'tokensapi-media-video-result':'tokensapi-media-image-result';const def=definitions.find(d=>d.kind===kind);const start={event:{type:'tool/call',seq:1,time:1,data:{name:toolName,callId:'progress-call',arguments:'{}'}}};let state=def.start({},start);const matches=[start];if(status!=='pending'){const update={event:{type:'tool/result',seq:2,time:2,data:{message:{source:{callId:'progress-call'},isError:status==='failed',content:[{type:'text',text:status==='failed'?'fetch failed':'Task retained-id is still running (30%).'}]}}}};state=def.update({state},update);matches.push(update)}const node=def.buildViewNode({key:kind,id:'progress-call',state,current:new Map(),start,matches});const e=entries.find(e=>e.options.key===kind);root.render(React.createElement(e.component,{node,sessionId:'own-session',t:translate(e,language)}));};
window.__image=(language='zh')=>{const e=entries.find(e=>e.options.key==='tokensapi-media-image-result');root.render(React.createElement(e.component,{t:translate(e,language),sessionId:'own-session',node:{data:{toolName:'media_generate_image',block:{kind:'result',content:[{type:'image',attachment:{attachmentId:'image-a',mediaType:'image/png'}}]}}}}));};
window.__video=(language='zh')=>{const e=entries.find(e=>e.options.key==='tokensapi-media-video-result');root.render(React.createElement(e.component,{t:translate(e,language),sessionId:'own-session',node:{data:{toolName:'media_generate_video',block:{kind:'result',content:[{type:'text',text:'URL: https://s3.tokensapi.ai/video.mp4'}]}}}}));};
window.__dispose=()=>{window.__nativePending?.close();nativeCleanups.forEach(f=>f());ctx.fiber.dispose()};window.__ready=true;
</script></body></html>`
await transform(pageHtml.split('<script type="module">')[1].split('</script>')[0], { loader: 'js' })
const routes = new Map([['/', ['text/html', pageHtml]], ['/runtime.js', ['text/javascript', runtime]], ['/plugin.js', ['text/javascript', plugin]], ['/native-questions.js', ['text/javascript', nativeQuestionSource]], ['/slots.js', ['text/javascript', slotCoreSource]], ['/'+vendor, ['text/javascript', await readFile(path.join(web, 'assets', vendor))]]])
const server=createServer((req,res)=>{
 if(req.url.startsWith('/media-gen/video-stream?')){
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=range?Number(range[1]):0;const end=range&&range[2]?Math.min(Number(range[2]),testVideo.length-1):testVideo.length-1;
   res.writeHead(range?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(range?{'content-range':`bytes ${start}-${end}/${testVideo.length}`}:{})});res.end(req.method==='HEAD'?undefined:testVideo.subarray(start,end+1));return
 }
 const value=routes.get(req.url);res.writeHead(value?200:404,{'content-type':value?.[0]||'text/plain'});res.end(value?.[1]||'')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try {
 const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
 const executablePath=process.env.TOKENSCOWORK_BROWSER_PATH||(existsSync(systemChrome)?systemChrome:undefined)
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})})
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Isolated media page:',e.message)});page.on('console',m=>{if(m.type()==='error')console.error('Isolated console:',m.text())})
 await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`)?route.continue():route.abort())
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__ready)
 assert.ok(await page.evaluate(()=>document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"')), 'MP4 playback checks require an H.264-enabled browser; set TOKENSCOWORK_BROWSER_PATH')
 await page.evaluate(()=>window.__questions())
 await page.getByRole('button',{name:/H3 Image（推荐）/}).click({timeout:3000})
 await page.getByRole('button',{name:/4 张/}).waitFor({timeout:3000})
 assert.equal(await page.getByRole('button',{name:/4 张/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:/2 张/}).click()
 await page.waitForFunction(()=>window.__answers.length===1)
 assert.deepEqual(await page.evaluate(()=>window.__answers[0].answers.map(a=>a.selected)),[['minimax_h3_image（推荐）'],['2 张']])
 await page.evaluate(()=>window.__questions('en'))
 await page.getByRole('button',{name:/H3 Image \(Recommended\)/}).click({timeout:3000})
 await page.getByRole('button',{name:/4 images/}).waitFor({timeout:3000})
 assert.equal(await page.getByRole('button',{name:/4 images/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:/4 images/}).click()
 await page.waitForFunction(()=>window.__answers.length===2)
 assert.deepEqual(await page.evaluate(()=>window.__answers[1].answers.map(a=>a.selected)),[['minimax_h3_image（推荐）'],['4 张']])
 await page.evaluate(()=>window.__prompt('en'))
 await page.getByRole('heading',{name:'Describe the image you want to generate'}).waitFor({timeout:3000})
 await page.getByPlaceholder('Enter or edit your prompt').fill('A sunrise over the sea')
 await page.getByRole('button',{name:'Next',exact:true}).click()
 await page.waitForFunction(()=>window.__answers.length===3)
 assert.deepEqual(await page.evaluate(()=>window.__answers[2].answers),[{id:'tokensapi_media__q0__d-1__prompt',selected:[],custom:'A sunrise over the sea'}])
 await page.evaluate(()=>window.__h3Resolution('en'))
 await page.getByRole('heading',{name:'Choose image resolution',exact:true}).waitFor({timeout:3000})
 assert.equal(await page.getByRole('button',{name:/2k/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'Use the default value and skip this choice',exact:true}).click()
 await page.waitForFunction(()=>window.__answers.length===4)
 assert.deepEqual(await page.evaluate(()=>window.__answers[3].answers),[{id:'tokensapi_media__q0__d1__resolution',selected:['2k']}])
 await page.evaluate(()=>window.__h3Resolution('zh'))
 await page.getByRole('heading',{name:'选择图片分辨率',exact:true}).waitFor({timeout:3000})
 await page.getByRole('region',{name:'选择图片分辨率',exact:true}).focus()
 await page.keyboard.press('Space')
 await page.waitForFunction(()=>window.__answers.length===5)
 assert.deepEqual(await page.evaluate(()=>window.__answers[4].answers),[{id:'tokensapi_media__q0__d1__resolution',selected:['2k']}])
 await page.evaluate(()=>window.__h3Resolution('en'))
 const oneK=page.getByRole('button',{name:/1k/})
 await oneK.waitFor({timeout:3000})
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('1k')&&!button.disabled))
 await oneK.evaluate(button=>{button.click();button.click()})
 await page.waitForFunction(()=>window.__answers.length===6)
 assert.deepEqual(await page.evaluate(()=>window.__answers[5].answers),[{id:'tokensapi_media__q0__d1__resolution',selected:['1k']}])
 await page.evaluate(()=>window.__questions('en'));await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>window.__cancels===1)
 await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;const painter=canvas.getContext('2d');painter.fillStyle='#516c98';painter.fillRect(0,0,1600,1000);painter.fillStyle='#f6e2a4';painter.fillRect(100,100,1400,800);window.__imageData=canvas.toDataURL('image/png').split(',')[1];window.__image('en')})
 await page.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1600)
 assert.deepEqual(await page.evaluate(()=>window.__reads),['own-session'])
 assert.equal(await page.getByRole('link',{name:'Download image'}).count(),1)
 const imageURL=await page.locator('img').getAttribute('src')
 await page.getByRole('button',{name:'Enlarge image 1',exact:true}).click()
 const preview=page.getByRole('dialog',{name:'Image preview',exact:true})
 await preview.waitFor({timeout:3000})
 assert.equal(await preview.locator('img').getAttribute('src'),imageURL)
 await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth===1600)
 const fittedWidth=(await preview.locator('img').boundingBox()).width
 await preview.getByRole('button',{name:'Zoom out',exact:true}).click()
 await page.waitForFunction(width=>document.querySelector('dialog img')?.getBoundingClientRect().width<width,fittedWidth)
 await preview.getByRole('button',{name:'Actual size',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('dialog img')?.getBoundingClientRect().width===1600)
 await preview.getByRole('button',{name:'Zoom in',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('dialog img')?.getBoundingClientRect().width===2000)
 await preview.getByRole('button',{name:'Zoom out',exact:true}).click()
 await preview.getByRole('button',{name:'Fit to window',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('dialog img')?.getBoundingClientRect().width<window.innerWidth)
 await page.keyboard.press('Escape')
 await preview.waitFor({state:'detached'})
 await page.getByRole('button',{name:'Enlarge image 1',exact:true}).click()
 await preview.getByRole('button',{name:'Close',exact:true}).click()
 await preview.waitFor({state:'detached'})
 await page.getByRole('link',{name:'Download image'}).evaluate(link=>link.addEventListener('click',event=>event.preventDefault(),{once:true}))
 await page.getByRole('link',{name:'Download image'}).click()
 assert.equal(await page.getByRole('dialog').count(),0)
 await page.evaluate(()=>window.__video('en'));await page.locator('video').waitFor()
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1)
 assert.match(await page.locator('video source').getAttribute('src'),/^\/media-gen\/video-stream\?url=/)
 const firstPlayer=await page.locator('video').elementHandle()
 await page.locator('video').dispatchEvent('error')
 await page.getByRole('button',{name:'Retry playback',exact:true}).click()
 assert.equal(await firstPlayer.evaluate(el=>el.isConnected),false)
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1)
 const videoLink=page.getByRole('link',{name:/Open source video/}).first();await videoLink.waitFor()
 assert.equal(await videoLink.getAttribute('href'),'https://s3.tokensapi.ai/video.mp4')

 // All video parameter choices advance immediately and retain wire IDs.
 for(const language of ['zh','en']) {
   const before=await page.evaluate(()=>window.__answers.length)
   await page.evaluate(language=>window.__choices([
     {id:'tokensapi_media__q0__d0__model',header:'模型',question:'选择模型',options:[{label:'minimax_h3（推荐）'},{label:'ltx_2_5'}]},
     {id:'tokensapi_media__q1__d0__aspect_ratio',question:'选择画面比例',options:[{label:'16:9'},{label:'9:16'}]},
     {id:'tokensapi_media__q2__d0__duration',question:'选择时长',options:[{label:'5 秒'},{label:'10 秒'}]},
     {id:'tokensapi_media__q3__d0__resolution',question:'选择分辨率',options:[{label:'720p'},{label:'1080p'}]},
   ],language),language)
   const labels=language==='zh'?[/H3（推荐）/,/16:9/,/5 秒/,/720p/]:[/H3 \(Recommended\)/,/16:9/,/5 seconds/,/720p/]
   for(const label of labels){const choice=page.getByRole('button',{name:label});await choice.waitFor({timeout:3000});assert.equal(await choice.getAttribute('aria-pressed'),'true');await choice.click()}
   await page.waitForFunction(count=>window.__answers.length===count+1,before)
   assert.deepEqual(await page.evaluate(()=>window.__answers.at(-1).answers.map(a=>a.selected)),[['minimax_h3（推荐）'],['16:9'],['5 秒'],['720p']])
 }
 for(const language of ['zh','en']) {
   for(const custom of [false,true]){
     const before=await page.evaluate(()=>window.__answers.length)
     await page.evaluate(language=>window.__choices([{id:'tokensapi_media__q0__d0__prompt',header:'原始 Prompt',question:'请描述你想生成的视频',detail:'当前 Prompt\n来源：本次输入\n\nA scene\nwith two lines',options:[{label:'使用当前提示词'}]}],language),language)
     const choice=page.getByRole('button',{name:language==='zh'?/使用当前提示词/:/Use current prompt/});await choice.waitFor({timeout:3000});assert.equal(await choice.getAttribute('aria-pressed'),'true')
     if(custom){await page.getByRole('textbox').fill('A different scene\nsecond line');await page.getByRole('button',{name:language==='zh'?'下一步':'Next',exact:true}).click()}else await choice.click()
     await page.waitForFunction(count=>window.__answers.length===count+1,before)
     const answer=await page.evaluate(()=>window.__answers.at(-1).answers[0]);assert.equal(answer.custom,custom?'A different scene\nsecond line':undefined);assert.deepEqual(answer.selected,custom?[]:['使用当前提示词'])
   }
   const before=await page.evaluate(()=>window.__answers.length)
   await page.evaluate(language=>window.__choices([{id:'tokensapi_media__q0__d0__model',question:'选择模型',options:[{label:'gpt-image-2.6-flare（推荐）'},{label:'gpt-image-2.6-sunburst'}]}],language),language)
   const flare=page.getByRole('button',{name:/Image 2.6 Flare/});await flare.waitFor({timeout:3000});assert.equal(await flare.getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:/Image 2.6 Sunburst/}).click()
   await page.waitForFunction(count=>window.__answers.length===count+1,before)
   assert.deepEqual(await page.evaluate(()=>window.__answers.at(-1).answers[0].selected),['gpt-image-2.6-sunburst'])
 }
 for(const tool of ['media_generate_image','media_edit_image','media_generate_video']) {
   for(const language of ['zh','en']) {
     await page.evaluate(({tool,language})=>window.__progress(tool,language),{tool,language})
     await page.getByText(language==='zh'?'生成中…':'Generating…',{exact:true}).waitFor({timeout:3000})
     await page.evaluate(({tool,language})=>window.__progress(tool,language,'delayed'),{tool,language})
     await page.getByText(language==='zh'?'任务仍在处理中，已保留任务 ID，可继续查询进度。':'The task is still processing. Its task ID is retained so you can continue checking progress.',{exact:true}).waitFor({timeout:3000})
     assert.equal(await page.getByText(language==='zh'?'完成':'done',{exact:true}).count(),0)
     await page.evaluate(({tool,language})=>window.__progress(tool,language,'failed'),{tool,language})
     await page.getByText(language==='zh'?'失败':'failed',{exact:true}).waitFor({timeout:3000})
   }
 }
 // Exercise the real current desktop carrier AND the real registered chain.
 // Before the dismiss() compatibility fix, the native composer wins here.
 for(const intent of ['image_gen','image_edit','video_gen']) {
   for(const language of ['zh','en']) {
     const before=await page.evaluate(()=>window.__answers.length)
     await page.evaluate(({intent,language})=>window.__hostChoices(intent,language),{intent,language})
     assert.deepEqual(await page.evaluate(()=>window.__modernShape),{cancel:'undefined',dismiss:'function',dismissal:'hide'})
     const expected=[]
     for(const q of hostQuestionSets[intent]) {
       await page.waitForFunction(id=>document.querySelector('section[data-media-question]')?.dataset.mediaQuestion===id,q.id)
       const defaultIndex=Number(/__d(-?\d+)__/.exec(q.id)[1])
       assert.ok(defaultIndex>=0,`${intent}: ${q.id} must have a default`)
       const choice=page.locator('button[aria-pressed="true"]')
       assert.equal(await choice.count(),1)
       expected.push([q.options[defaultIndex].label])
       await choice.click()
     }
     await page.waitForFunction(count=>window.__answers.length===count+1,before)
     assert.deepEqual(await page.evaluate(()=>window.__answers.at(-1).answers.map(a=>a.selected)),expected)
     assert.equal(await page.getByRole('button',{name:language==='zh'?'确定':'Confirm',exact:true}).count(),0)
   }
 }
 const modelQuestion=hostQuestionSets.image_gen.find(q=>q.id.endsWith('__model'))
 const beforeFlare=await page.evaluate(()=>window.__answers.length)
 await page.evaluate(q=>window.__hostChoices('image_gen','en',[q]),modelQuestion)
 await page.waitForFunction(id=>document.querySelector('section[data-media-question]')?.dataset.mediaQuestion===id,modelQuestion.id)
 assert.equal(modelQuestion.options.some(option=>/^Image 2(?:（推荐）)?$/.test(option.label)),false)
 for(const label of ['Z-Image Turbo','Qwen Image','H3 Image','Image 2.6 Sunburst','Image 2.6 Flare'])assert.ok(await page.getByRole('button',{name:new RegExp(label.replace('.','\\.'))}).count()>=1)
 assert.equal(await page.getByRole('button',{name:/H3 Image/}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:/Image 2.6 Flare/}).click()
 await page.waitForFunction(count=>window.__answers.length===count+1,beforeFlare)
 assert.deepEqual(await page.evaluate(()=>window.__answers.at(-1).answers[0].selected),['Image 2.6 Flare'])
 for(const intent of ['image_gen','image_edit','video_gen']) {
   for(const q of hostQuestionSets[intent]) {
     const before=await page.evaluate(()=>window.__answers.length)
     await page.evaluate(({intent,q})=>window.__hostChoices(intent,'en',[q]),{intent,q})
     await page.waitForFunction(id=>document.querySelector('section[data-media-question]')?.dataset.mediaQuestion===id,q.id)
     await page.getByRole('button',{name:'Close',exact:true}).click()
     await page.waitForFunction(count=>window.__answers.length===count+1,before)
     const answer=await page.evaluate(()=>window.__answers.at(-1).answers[0])
     assert.deepEqual(answer,{id:q.id,selected:[],custom:'tokensapi_media__cancelled_by_user__'})
   }
 }
 assert.equal(await page.evaluate(()=>window.__hidden),0,'X must cancel instead of dismissing/hiding a modern card')
 assert.deepEqual(errors,[])
 await page.evaluate(()=>window.__dispose())
 console.log('Media browser passed: actual Host questions + actual desktop PendingQuestion + native composer competition through SlotCore; every image/edit/video choice defaults and advances, canonical names, modern X cancellation without hiding; legacy bilingual flow, MP4 playback/retry, status, scoped images, preview/download. No generation or profile writes.')
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
