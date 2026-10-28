const fs = require('fs');
const src = fs.readFileSync('D:/feibo/src/packages__agent-core__src__agent.ts', 'utf8');
const i = src.indexOf('function systemPrompt');
let j = src.indexOf('\nfunction ', i + 10);
if (j < 0) j = src.length;
const body = src.slice(i, j);
const re = /"((?:[^"\\]|\\.)*)"/g;
let m, total = 0, count = 0;
while ((m = re.exec(body))) {
  try { total += Buffer.byteLength(JSON.parse('"' + m[1] + '"'), 'utf8'); count++; } catch (e) {}
}
console.log('systemPrompt 字符串条数:', count, ' 展开后字节:', total);

const t = fs.readFileSync('D:/feibo/src/packages__runtime__src__tools.ts', 'utf8');
console.log('tools.ts 字节:', t.length, ' tool 定义数(description 计数):', (t.match(/description:/g) || []).length);

// 统计工具参数 JSON Schema 的总字节：粗略取每个 tool 对象
const defs = t.split(/\n  \{\n    name: /).slice(1);
let schemaBytes = 0;
for (const d of defs) schemaBytes += Buffer.byteLength(d, 'utf8');
console.log('工具定义总字节(粗估):', schemaBytes);
