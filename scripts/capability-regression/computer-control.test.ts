import { mock, test, expect } from 'bun:test'
import { resolve } from 'node:path'
const lib = resolve(import.meta.dir, '../../apps/electron/src/main/lib').replaceAll('\\', '/') + '/'
let settings:any = {computerUseEnabled:true,computerUseNoPrompt:false}
mock.module('electron',()=>({app:{isPackaged:false,getPath:()=>process.cwd()+'/_tmp/roy-computer-sandbox',getVersion:()=>'0.0.0'},BrowserWindow:{getAllWindows:()=>[]},desktopCapturer:{getSources:async()=>{throw new Error('simulated capture failure')}},dialog:{showMessageBox:async()=>({response:2})},globalShortcut:{},Notification:{isSupported:()=>false},screen:{getPrimaryDisplay:()=>({size:{width:1920,height:1080},scaleFactor:1})},shell:{}}))
mock.module(lib+'settings-service.ts',()=>({getSettings:()=>settings}))
// 保留真实导出，只换 getConfigDir：bun 的 mock.module 跨文件生效，只给一个导出会让同批其它测试找不到 getProxySettingsPath 等
const realConfigPaths = await import(lib+'config-paths.ts')
mock.module(lib+'config-paths.ts',()=>({...realConfigPaths,getConfigDir:()=>process.cwd()+'/_tmp/roy-computer-sandbox'}))
mock.module(lib+'channel-manager.ts',()=>({getChannelById:()=>undefined}))
mock.module(lib+'vision-relay-service.ts',()=>({inspectImageWithVisionRelay:()=>{},isVisionRelayConfigured:()=>false}))
const realModelRegistry = await import(lib+'adapters/pi-model-registry.ts')
mock.module(lib+'adapters/pi-model-registry.ts',()=>({...realModelRegistry,resolvePiImageInputCapability:()=> 'unsupported'}))
mock.module(lib+'agent-headless-runner-registry.ts',()=>({stopRegisteredAgent:()=>{}}))
// 电脑控制属于 Pro：这里按已开通测试工具本身的行为
mock.module(lib+'roy-account.ts',()=>({hasProFeature:()=>true,FREE_AUTOMATION_LIMIT:3}))
mock.module(lib+'main-window-store.ts',()=>({getMainWindow:()=>null}))
const { buildScreenAndComputerTools } = await import(lib+'computer-control.ts')
const sdk:any={defineTool:(x:any)=>x}
const ctx:any={sessionId:'test',channelId:'test',triggeredBy:'user'}
const run = (tool:any,p:any={})=>tool.execute('test',p,new AbortController().signal)
test('front-end desktop tools are registered when enabled',()=>{
 settings={computerUseEnabled:true}
 const names=buildScreenAndComputerTools(sdk,ctx).map((t:any)=>t.name)
 for(const n of ['computer_windows','computer_screenshot','computer_click','computer_type','screen_capture','open_file']) expect(names).toContain(n)
})
test('automation and delegation have no desktop tools',()=>{
 for(const triggeredBy of ['automation','delegation'])expect(buildScreenAndComputerTools(sdk,{...ctx,triggeredBy})).toHaveLength(0)
})
test('disabled computer control does not advertise mouse tools',()=>{
 settings={computerUseEnabled:false,screenCaptureEnabled:false}
 expect(buildScreenAndComputerTools(sdk,ctx).map((t:any)=>t.name)).toEqual(['open_file'])
})
test('settings switched off after registration are still enforced',async()=>{
 settings={computerUseEnabled:true}
 const tool=buildScreenAndComputerTools(sdk,ctx).find((t:any)=>t.name==='computer_click')
 settings={computerUseEnabled:false}
 await expect(run(tool,{x:1,y:1})).rejects.toThrow('关掉了电脑控制')
})
test('user denial is a failed tool call, not success text',async()=>{
 settings={computerUseEnabled:true,computerUseNoPrompt:false}
 const tool=buildScreenAndComputerTools(sdk,ctx).find((t:any)=>t.name==='computer_click')
 await expect(run(tool,{x:1,y:1})).rejects.toThrow('用户没有允许')
})
test('capture errors propagate without success claims',async()=>{
 settings={computerUseEnabled:true}
 const tool=buildScreenAndComputerTools(sdk,ctx).find((t:any)=>t.name==='computer_screenshot')
 await expect(run(tool)).rejects.toThrow('simulated capture failure')
})
