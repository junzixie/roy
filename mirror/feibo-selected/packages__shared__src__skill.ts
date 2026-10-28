// ../../packages/shared/src/skill.ts
var SKILL_PYTHON = ["docx", "openpyxl", "pptx", "pypdf", "reportlab"];
var SKILL_NAME_MAX = 64;
var SKILL_DESCRIPTION_MAX = 1024;
var PERMISSIONS = ["write_files", "run_command", "network"];
var SKILL_DEFAULT_PERMISSIONS = ["run_command", "write_files"];
function skillName(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, SKILL_NAME_MAX);
}
function scalar(v) {
  const s = v.trim();
  return /^(["']).*\1$/s.test(s) ? s.slice(1, -1).replace(/\\"/g, '"') : s;
}
function list(inline2, lines) {
  const s = inline2.trim();
  if (s.startsWith("[")) {
    return s.replace(/^\[|\]$/g, "").split(",").map((x) => scalar(x)).filter(Boolean);
  }
  return lines.map((l) => /^\s*-\s*(.+)$/.exec(l)?.[1]).filter((x) => !!x).map(scalar);
}
function parseSkill(text2, fallbackName = "") {
  const src = String(text2 ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) {
    return null;
  }
  const fields = /* @__PURE__ */ new Map();
  let current2 = null;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const top = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      current2 = { value: top[2], under: [] };
      fields.set(top[1].toLowerCase().replace(/-/g, "_"), current2);
    } else if (current2) {
      current2.under.push(line);
    }
  }
  const get = (k) => fields.get(k);
  const name = skillName(scalar(get("name")?.value ?? "")) || skillName(fallbackName);
  if (!name) {
    return null;
  }
  const d = get("description");
  const description = (d && /^[>|][+-]?$/.test(d.value.trim()) ? d.under.map((l) => l.trim()).join(" ") : scalar(d?.value ?? "")).replace(/\s+/g, " ").trim().slice(0, SKILL_DESCRIPTION_MAX);
  const p = get("permissions");
  const permissions = p ? [...new Set(list(p.value, p.under).map((x) => x.toLowerCase()).filter((x) => PERMISSIONS.includes(x)))] : SKILL_DEFAULT_PERMISSIONS;
  const r = get("requires");
  let python = [];
  if (r) {
    const at = r.under.findIndex((l) => /^\s+python\s*:/.test(l));
    if (at >= 0) {
      const inline2 = r.under[at].replace(/^\s+python\s*:/, "");
      const below = r.under.slice(at + 1);
      const end = below.findIndex((l) => !/^\s+-/.test(l));
      python = [...new Set(list(inline2, end < 0 ? below : below.slice(0, end)).map((x) => x.toLowerCase()).filter((x) => SKILL_PYTHON.includes(x)))];
    }
  }
  const displayName = scalar(get("display_name")?.value ?? "").slice(0, 40) || name;
  return { name, description, displayName, permissions, python, body: src.slice(m[0].length).trim() };
}
