import { buildPiMcpTools, disposePiMcpConnections } from '../../apps/electron/src/main/lib/adapters/pi-mcp-tools.ts'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dir, '../..').replaceAll('\\', '/')
const market = root + '/apps/electron/resources/market'
const scratch = resolve('_tmp/roy-mcp-sandbox'); mkdirSync(scratch, { recursive: true })
const catalog = JSON.parse(readFileSync(market + '/mcp.json', 'utf8'))
const electron = root + '/apps/electron/node_modules/electron/dist/electron.exe'
const configs: Record<string, any> = {}
for (const item of catalog) {
 const map = (s: string) => s.replaceAll('${ROY_MCP}', market+'/mcp').replaceAll('${WORKSPACE}', scratch).replaceAll('${ROY_DATA}',scratch)
 configs[item.id] = { ...item.server, command: electron, args: item.server.args.map(map), env: { ...Object.fromEntries(Object.entries(item.server.env ?? {}).map(([k,v])=>[k,map(String(v))])), ELECTRON_RUN_AS_NODE:'1' }, required: true, startup_timeout_sec: 10 }
}
const run = (tool:any, params:unknown) => tool.execute('verification',params,new AbortController().signal)
try {
 const tools = await buildPiMcpTools(configs)
 console.log('DISCOVERED', tools.map(t=>t.name))
 const find = (suffix:string) => { const t=tools.find(t=>t.name.endsWith(suffix)); assert.ok(t,suffix); return t }
 const status = await run(find('mcp_connection_status'),{})
 const statuses = JSON.parse(status.content[0].text).servers
 assert.equal(statuses.length,3);assert.ok(statuses.every((s:any)=>s.status==='ready'))
 console.log('STATUS',JSON.stringify(statuses))
 const dirs = await run(find('__list_allowed_directories'),{})
 assert.ok(JSON.stringify(dirs).includes('roy-mcp-sandbox'));console.log('FILESYSTEM_CALL_OK')
 const thought = await run(find('__sequentialthinking'),{thought:'验证 MCP 调用桥接，不保存用户信息。',thoughtNumber:1,totalThoughts:1,nextThoughtNeeded:false})
 assert.ok(!(thought.details as any)?.isError);console.log('THINKING_CALL_OK')
 const memory = await run(find('__read_graph'),{})
 assert.ok(!(memory.details as any)?.isError);console.log('MEMORY_READ_OK sandbox only; production remains disabled')
 const failed = await buildPiMcpTools({ unavailable: {type:'stdio',command:electron,args:['-e','process.exit(2)'],required:true,startup_timeout_sec:2} })
 const diagnostic = await run(failed.find(t=>t.name==='mcp_connection_status'),{})
 assert.equal(JSON.parse(diagnostic.content[0].text).servers[0].status,'unavailable')
 console.log('FAILED_DISCOVERY_VISIBLE_OK')
} finally { await disposePiMcpConnections() }
