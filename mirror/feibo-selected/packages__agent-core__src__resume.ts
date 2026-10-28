// ../../packages/agent-core/src/resume.ts
var MAX_STEPS = 60;
var ARGS = 240;
function args(a) {
  if (!a || typeof a !== "object") {
    return "";
  }
  const s = JSON.stringify(a);
  return s.length > ARGS ? `${s.slice(0, ARGS)}\u2026` : s;
}
function finishedSteps(events) {
  const started = /* @__PURE__ */ new Map();
  const done = [];
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.type === "tool.start" && p.callId) {
      started.set(p.callId, { tool: String(p.tool ?? ""), args: args(p.args) });
    } else if (e.type === "tool.end" && p.callId && p.ok) {
      const s = started.get(p.callId);
      if (s && s.tool !== "update_plan") {
        done.push({ ...s, summary: String(p.summary ?? "").slice(0, 200) });
      }
    }
  }
  return done;
}
var HALF_DONE = /^(run_command|generate_image|generate_pdf|open_code_video_settings|open_video_generation|create_automation|deliver_file|save_attachment|move_files|move_file|rename_files|delete_file|computer_.*)$/;
function brokenSteps(events) {
  const started = /* @__PURE__ */ new Map();
  const waiting = /* @__PURE__ */ new Set();
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.type === "tool.start" && p.callId) {
      started.set(p.callId, { tool: String(p.tool ?? ""), args: args(p.args) });
    } else if (e.type === "tool.end" && p.callId) {
      started.delete(p.callId);
    } else if (e.type === "approval.request") {
      const last = [...started.keys()].pop();
      if (last) {
        waiting.add(last);
      }
    } else if (e.type === "approval.result" && p.allow) {
      waiting.clear();
    }
  }
  return [...started.entries()].filter(([, s]) => s.tool && s.tool !== "update_plan").map(([id, s]) => ({ ...s, state: waiting.has(id) ? "waiting" : HALF_DONE.test(s.tool) ? "half" : "unfinished" }));
}
function resumeNote(prompt, events) {
  const steps = finishedSteps(events);
  const broken = brokenSteps(events);
  let plan2 = null;
  let why = "";
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.type === "plan" && Array.isArray(p.steps)) {
      plan2 = { steps: p.steps.map(String), states: Array.isArray(p.states) ? p.states.map(String) : [] };
    } else if (e.type === "status" && (p.status === "failed" || p.status === "stopped")) {
      why = String(p.error ?? p.reason ?? (p.status === "stopped" ? "\u7528\u6237\u505C\u6B62\u4E86\u4EFB\u52A1" : ""));
    }
  }
  const lines = ["\u3010\u63A5\u7740\u4E0A\u4E00\u6B21\u6CA1\u505A\u5B8C\u7684\u4EFB\u52A1\u7EE7\u7EED\u3011", `\u539F\u4EFB\u52A1\uFF1A${prompt.slice(0, 4e3)}`];
  lines.push(`\u4E0A\u4E00\u6B21\u6267\u884C\u4E2D\u65AD\u4E86${why ? `\uFF08\u539F\u56E0\uFF1A${why.slice(0, 300)}\uFF09` : ""}\u3002`);
  if (steps.length) {
    const shown = steps.slice(-MAX_STEPS);
    lines.push(`\u4E0B\u9762 ${steps.length} \u4E2A\u6B65\u9AA4\u5DF2\u7ECF\u5B8C\u6210\uFF0C\u7ED3\u679C\u5DF2\u4FDD\u7559\uFF0C\u4E0D\u8981\u91CD\u505A${shown.length < steps.length ? `\uFF08\u53EA\u5217\u51FA\u6700\u540E ${shown.length} \u4E2A\uFF09` : ""}\uFF1A`);
    shown.forEach((s, i) => lines.push(`${steps.length - shown.length + i + 1}. ${s.tool} ${s.args}${s.summary ? ` \u2192 ${s.summary}` : ""}`));
  } else {
    lines.push("\u4E0A\u4E00\u6B21\u8FD8\u6CA1\u6709\u5B8C\u6210\u4EFB\u4F55\u6B65\u9AA4\u3002");
  }
  if (broken.length) {
    lines.push("\u4E2D\u65AD\u65F6\u6B63\u5728\u505A\u3001\u6CA1\u6709\u505A\u5B8C\u7684\u6B65\u9AA4\uFF1A");
    broken.forEach((s) => lines.push(`- ${s.tool} ${s.args}\uFF1A${s.state === "waiting" ? "\u5728\u7B49\u7528\u6237\u786E\u8BA4\u65F6\u505C\u4E86\uFF0C\u6CA1\u6709\u6267\u884C\uFF1B\u9700\u8981\u7684\u8BDD\u91CD\u65B0\u53D1\u8D77\uFF08\u4F1A\u91CD\u65B0\u8BF7\u7528\u6237\u786E\u8BA4\uFF09" : s.state === "half" ? "\u53EF\u80FD\u5DF2\u7ECF\u90E8\u5206\u6267\u884C\u6216\u5DF2\u7ECF\u6263\u8D39\uFF0C\u5148\u68C0\u67E5\u7ED3\u679C\uFF08\u6587\u4EF6\u3001\u56FE\u7247\u3001\u7A0B\u5E8F\u72B6\u6001\uFF09\u518D\u51B3\u5B9A\u8981\u4E0D\u8981\u91CD\u505A" : "\u6CA1\u6709\u505A\u5B8C\uFF0C\u9700\u8981\u7684\u8BDD\u91CD\u505A"}`));
  }
  if (plan2?.steps.length) {
    lines.push("\u4E0A\u4E00\u6B21\u7684\u8BA1\u5212\uFF08\u2713 \u5DF2\u5B8C\u6210\uFF09\uFF1A");
    plan2.steps.forEach((s, i) => lines.push(`${plan2.states[i] === "done" ? "\u2713" : "\u25CB"} ${s}`));
  }
  lines.push("\u8BF7\u4ECE\u4E2D\u65AD\u7684\u5730\u65B9\u63A5\u7740\u505A\uFF0C\u628A\u539F\u4EFB\u52A1\u505A\u5B8C\uFF1A\u5DF2\u7ECF\u5199\u597D\u7684\u6587\u4EF6\u3001\u5DF2\u7ECF\u751F\u6210\u7684\u56FE\u7247\u3001\u5DF2\u7ECF\u67E5\u5230\u7684\u8D44\u6599\u76F4\u63A5\u7528\uFF08\u9700\u8981\u65F6\u5148\u786E\u8BA4\u6587\u4EF6\u8FD8\u5728\uFF09\uFF0C\u4E0D\u8981\u4ECE\u5934\u518D\u6765\u3002\u8FD9\u6B21\u9700\u8981\u786E\u8BA4\u7684\u64CD\u4F5C\u90FD\u4F1A\u91CD\u65B0\u8BF7\u7528\u6237\u786E\u8BA4\u3002");
  return steps.length || broken.length || plan2?.steps.length ? lines.join("\n") : null;
}
async function runToGoOnFrom(id, load, max = 10) {
  const named = await load(id);
  let cur = named;
  let hops = 0;
  while (!resumeNote(cur[0].prompt, cur[1]) && cur[0].resumeOf && hops++ < max) {
    cur = await load(cur[0].resumeOf);
  }
  const from = resumeNote(cur[0].prompt, cur[1]) ? cur : named;
  let first = from[0];
  for (let i = 0; first.resumeOf && i < max; i++) {
    const [t2] = await load(first.resumeOf);
    first = t2;
  }
  return [{ ...from[0], prompt: first.prompt }, from[1]];
}
