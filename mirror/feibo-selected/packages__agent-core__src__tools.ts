// ../../packages/agent-core/src/tools.ts
var INPUT_AUTOMATION = /SendKeys|SendInput|SendWait|keybd_event|mouse_event|SetCursorPos|PostMessage|SendMessage|AppActivate|pyautogui|pynput|pydirectinput|keyboard\.(press|write|send)|mouse\.(click|move)|AutoHotkey|\.ahk\b|AutoIt|xdotool|cliclick|robotjs|nut-tree/i;
function gameInputBlocked(tool, args2) {
  if (!["run_command", "write_file", "edit_file"].includes(tool)) {
    return false;
  }
  const text2 = [args2.command, args2.content, args2.new_text, args2.new_string, args2.path].filter((v) => typeof v === "string").join("\n");
  return INPUT_AUTOMATION.test(text2) && GAME_WINDOWS.test(text2);
}
function madeButNotFetched(made2, e) {
  const why = e instanceof Error ? e.message : String(e);
  return `\u56FE\u7247\u5DF2\u7ECF\u751F\u6210\u5E76\u5DF2\u8BA1\u8D39${made2.credits ? `\uFF08${made2.credits} \u79EF\u5206\uFF09` : ""}\uFF0C\u4FDD\u5B58\u5728\u7528\u6237\u7684 FeiBo \u4E91\u76D8\u300CAI \u751F\u6210\u300D\u91CC\uFF08\u300C${made2.name}\u300D\uFF09\uFF0C\u53EA\u662F\u53D6\u56DE\u5230\u5DE5\u4F5C\u76EE\u5F55\u5931\u8D25\uFF1A${why}\u3002\u4E0D\u8981\u91CD\u65B0\u751F\u6210\uFF08\u4F1A\u518D\u6B21\u6263\u8D39\uFF09\uFF0C\u4E5F\u4E0D\u8981\u6539\u7528\u522B\u7684\u65B9\u5F0F\u753B\uFF1B\u76F4\u63A5\u544A\u8BC9\u7528\u6237\u56FE\u7247\u5DF2\u7ECF\u751F\u6210\u3001\u5728\u4E91\u76D8\u91CC\u53EF\u4EE5\u67E5\u770B\u548C\u4E0B\u8F7D\u3002`;
}
var READ_DOCUMENT_MAX = 100 * 1024 * 1024;
var DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|xlsm|csv|pptx?|rtf|odt|ods|odp|wps|et|dps|heic|heif|jpe?g|png|webp|gif|bmp|tiff?|zip|rar|7z|mp3|m4a|wav|amr|aac|ogg|flac|mp4|mov|m4v|webm|mkv|avi|wmv|flv|3gp)$/i;
var VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv|3gp)$/i;
var READ_VIDEO_MAX = 200 * 1024 * 1024;
function needsApproval(mode, risk) {
  if (mode === "all") {
    return false;
  }
  if (mode === "always") {
    return risk !== "read";
  }
  return risk === "danger";
}
function asksNow(mode, risk, done) {
  return needsApproval(mode, risk) && !done.allowed && !(risk === "network" && done.online);
}
var LOOK_ONLY = /^(tasklist|systeminfo|ipconfig|hostname|whoami|ver|nvidia-smi|uname|uptime|free|df|ps|top\s+-b\b|get-process|get-service|get-computerinfo|get-ciminstance|get-wmiobject|get-psdrive|get-volume|get-netadapter|get-netipaddress|get-date|get-host|get-uptime|\$psversiontable)(\s|$)/i;
var NOT_LOOK = /[;&<>`\r\n]|\|\||\$\(|\b(iex|invoke-expression|start-process|stop-|remove-|set-|new-|kill)/i;
var SHAPERS = /^(select-object|select|sort-object|sort|where-object|where|\?|format-table|ft|format-list|fl|measure-object|measure|out-string|convertto-json)$/i;
var MATCHERS = /^(select-string|sls|findstr|grep|find)$/i;
var COUNTERS = /^(head|more|wc)$/i;
var PATHLIKE = /[/\\~*?]|(^|[^a-z])[a-z]:/i;
var READS_FILES = /^-(path|literalpath|recurse|r|include|exclude|filepath|file|f|d|inputobject|encoding)$|^--/i;
var MATCH_SWITCHES = /^-(i|v|c|w|e|n|o|pattern|simplematch|casesensitive|notmatch|allmatches)$/i;
function lookFilter(segment) {
  const [name = "", ...args2] = segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const bare = (a) => a.replace(/^["']|["']$/g, "");
  if (COUNTERS.test(name)) {
    return args2.every((a) => /^-?\d+$|^-(n|l|c|w)$/i.test(a));
  }
  if (args2.some((a) => PATHLIKE.test(bare(a)) || a.startsWith("-") && READS_FILES.test(a))) {
    return false;
  }
  if (SHAPERS.test(name)) {
    return args2.every((a, i) => a !== "{" || /^\$/.test(args2[i + 1] ?? ""));
  }
  if (MATCHERS.test(name)) {
    const switches = args2.filter((a) => a.startsWith("-"));
    return switches.every((a) => MATCH_SWITCHES.test(a)) && args2.length - switches.length <= 1;
  }
  return false;
}
function headOnlyLooks(verb, args2) {
  if (verb === "ipconfig") {
    return args2.every((a) => /^\/(all|displaydns|\?)$/i.test(a));
  }
  if (verb === "hostname") {
    return args2.every((a) => /^(-[fiIsdaAy]|--(fqdn|short|domain|all-fqdns|all-ip-addresses|ip-address))$/.test(a));
  }
  if (verb === "nvidia-smi") {
    return args2.every((a) => /^(-L|-q|--list-gpus|--query|--query-[a-z-]+=\S+|--format=\S+|-i|\d+)$/.test(a));
  }
  return !args2.some((a) => remoteSwitch(verb, a));
}
var WIN_REMOTE = /^(tasklist|systeminfo|whoami|ver)(\.exe)?$/;
function remoteSwitch(verb, arg) {
  const a = arg.toLowerCase().replace(/^["']|["']$/g, "").replace(/^[‒-―]/, "-");
  if (WIN_REMOTE.test(verb)) {
    return /^[/-](s|u|p|node)(:|$)/.test(a);
  }
  if (!/^(get-|ps$)/.test(verb)) {
    return false;
  }
  const m = /^-([a-z]+)(?![a-z0-9_-])/.exec(a);
  if (!m) {
    return false;
  }
  const name = m[1];
  return name === "cn" || ["computername", "servername", "session", "cimsession"].some((p) => p.startsWith(name));
}
var VERSION_OF = {
  node: /^(-v|--version)$/,
  python: /^(-V|--version)$/,
  python3: /^(-V|--version)$/,
  py: /^(-V|--version)$/,
  pip: /^(-V|--version)$/,
  pip3: /^(-V|--version)$/,
  git: /^(--version|version)$/,
  java: /^(-version|--version)$/,
  javac: /^(-version|--version)$/,
  deno: /^(-V|--version)$/,
  gcc: /^--version$/,
  "g++": /^--version$/,
  clang: /^--version$/,
  cmake: /^--version$/,
  ffmpeg: /^-version$/,
  ffprobe: /^-version$/,
  docker: /^(-v|--version)$/,
  perl: /^(-v|--version)$/,
  php: /^(-v|--version)$/,
  ruby: /^--version$/,
  code: /^(-v|--version)$/
};
function versionOnly(raw) {
  const words2 = String(raw ?? "").trim().split(/\s+/);
  if (words2.length !== 2) {
    return false;
  }
  const prog = words2[0].toLowerCase().replace(/\.exe$/, "");
  return Object.hasOwn(VERSION_OF, prog) && VERSION_OF[prog].test(words2[1]);
}
function commandRisk(command) {
  const c = String(command ?? "").trim();
  if (!c || c.length > 300 || /[\r\n]/.test(c) || networkPathsIn(c).length) {
    return "danger";
  }
  if (/[%!]/.test(c)) {
    return "danger";
  }
  const p = parseCommand(c, "", WIN_SHELL);
  if (!p.ok || !p.steps.length || p.steps.some((s) => s.sub || s.discards || NOT_LOOK.test(s.raw))) {
    return "danger";
  }
  const [head, ...pipes] = p.steps;
  if (pipes.some((s) => s.sep !== "|") || !(LOOK_ONLY.test(head.raw) || versionOnly(head.raw)) || !headOnlyLooks(head.verb, head.raw.split(/\s+/).slice(1))) {
    return "danger";
  }
  return pipes.every((s) => lookFilter(s.raw)) ? "read" : "danger";
}
var WIN_SHELL = globalThis.process?.platform === "win32";
function commandKind(command) {
  const c = String(command ?? "");
  if (commandRisk(c) === "read") {
    return "look";
  }
  const k = commandKindOf(parseCommand(c, "", WIN_SHELL));
  return k === "create" || k === "move" ? "write" : k === "cd" || k === "look" || k === "network" ? "other" : k;
}
var NO_ALWAYS_KINDS = /* @__PURE__ */ new Set(["other", "run-code"]);
var keepable = (key4) => !/^run_command:(other|run-code)$/.test(key4);
function commandTarget(command) {
  const c = String(command ?? "");
  const m = /-(?:literal)?path\s+["']?([^"'\s;|]+)/i.exec(c) ?? />>?\s*["']?([^"'\s;|]+)/.exec(c) ?? /(?:\/im|-name|-processname)\s+["']?([^"'\s;|]+)/i.exec(c) ?? /(?:^|[\s;&|("'])(?:new-item|ni|set-content|add-content|out-file|remove-item|rm|ri|del|erase|rmdir|rd|mkdir|md|touch)\s+(?:-\w+\s+)*["']?([^"'\s;|-][^"'\s;|]*)/i.exec(c);
  return m?.[1];
}
function folderGrantable(folder) {
  const p = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!p || /^[a-z]:$/i.test(p) || p === "" || p === "/") {
    return false;
  }
  if (/^([a-z]:)?\/(users|home)(\/[^/]+)?$/i.test(p) || /^\/root$/.test(p) || /^\/users?$/i.test(p)) {
    return false;
  }
  if (/^[a-z]:\/(windows|program files( \(x86\))?|programdata|\$recycle\.bin|system volume information)(\/|$)/i.test(p)) {
    return false;
  }
  if (/^\/(etc|usr|bin|sbin|lib|lib64|opt|var|boot|dev|proc|sys|system|library|private|applications)(\/|$)/i.test(p)) {
    return false;
  }
  return !/\/(\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.docker|\.config|appdata|library|\.feibo)(\/|$)/i.test(p);
}
function allowKey(tool, args2) {
  return tool === "run_command" ? `run_command:${commandKind(String(args2.command ?? ""))}` : tool;
}
var SUBMITS = /(登录|登入|注册|提交|付款|支付|购买|下单|结算|确认订单|发送|发布|删除|注销|转账|sign\s?in|log\s?in|sign\s?up|submit|pay|buy|purchase|checkout|place\s+order|send|post|publish|delete|remove|transfer)/i;
var PASSWORD = /(密码|password|passcode|口令)/i;
function pageActRisk(kind, label, args2 = {}) {
  const l = label ?? "";
  if (kind === "type" && PASSWORD.test(l)) {
    return "danger";
  }
  const submits = kind === "click" || kind === "type" && !!args2.submit || kind === "press" && /^enter$/i.test(String(args2.key ?? ""));
  return submits && SUBMITS.test(l) ? "danger" : "write";
}
function rememberRefs(refs, text2) {
  if (!refs) {
    return;
  }
  for (const line of text2.split("\n")) {
    const m = /^\s*\[(\d+)\]\s*(.+)$/.exec(line);
    if (m) {
      refs.set(Number(m[1]), m[2].trim());
    }
  }
}
function openAiToolsOf(tools) {
  return tools.map((t2) => ({ type: "function", function: { name: t2.name, description: t2.description, parameters: t2.parameters } }));
}
