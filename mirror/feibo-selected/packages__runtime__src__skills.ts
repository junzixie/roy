// ../../packages/runtime/src/skills.ts
var SAFE_SLUG = /^[a-z0-9-]{1,64}$/;
var SAFE_VERSION = /^[0-9a-f]{12}$/;
var SAFE_SHA = /^[0-9a-f]{64}$/;
function skillsOf(items, log) {
  const out = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (it.type !== "skill" || it.enabled === false) {
      continue;
    }
    const m = it.manifest ?? {};
    const s = m.skill ?? {};
    const name = String(s.name || it.slug || "").toLowerCase();
    const p = m.package;
    if (!SAFE_SLUG.test(String(it.slug ?? "")) || p && (!SAFE_VERSION.test(String(p.version)) || !SAFE_SHA.test(String(p.sha256)))) {
      log?.(`\u6280\u80FD ${String(it.slug)} \u7684\u540D\u5B57\u6216\u7248\u672C\u683C\u5F0F\u4E0D\u5BF9\uFF0C\u6CA1\u6709\u4F7F\u7528`);
      continue;
    }
    if (!name || out.has(name)) {
      continue;
    }
    out.set(name, {
      itemId: it.id,
      slug: it.slug,
      name,
      displayName: String(s.displayName || it.name || name),
      description: String(s.description || it.description || ""),
      permissions: Array.isArray(s.permissions) ? s.permissions : ["run_command", "write_files"],
      python: Array.isArray(s.python) ? s.python.map(String) : [],
      ...p ? { pack: { version: String(p.version), sha256: String(p.sha256), size: Number(p.size) || 0 } } : {},
      instructions: String(m.instructions ?? "").trim() || String(it.description ?? ""),
      official: !(p && p.source === "user")
    });
  }
  return [...out.values()];
}
var SKILL_LIBS_ID = (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(SKILL_LIBS_LOCK)).digest("hex").slice(0, 12);
var skillLibsDir = (root) => import_node_path3.default.join(root, SKILL_LIBS_ID);
function platformKey() {
  const a = import_node_os2.default.arch();
  return process.platform === "win32" && a === "x64" ? "win_amd64" : process.platform === "darwin" ? a === "arm64" ? "macosx_arm64" : "macosx_x86_64" : process.platform === "linux" && a === "x64" ? "manylinux_x86_64" : null;
}
function packagesFor(wanted) {
  const libs = SKILL_LIBS_LOCK.libs;
  return [...new Set(wanted.flatMap((w) => Object.hasOwn(libs, w) ? libs[w] : []))];
}
function pipCommand(dir2, reqFile, env) {
  const e = { ...env ?? process.env };
  for (const k of Object.keys(e)) {
    if (k.toUpperCase() === "PYTHONPATH" || k.toUpperCase() === "PYTHONHOME") {
      delete e[k];
    }
  }
  const index = e.PIP_INDEX_URL || SKILL_LIBS_LOCK.index;
  return {
    args: [
      "-I",
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-input",
      "--no-cache-dir",
      "--no-deps",
      "--require-hashes",
      "--only-binary=:all:",
      "--upgrade",
      "--target",
      dir2,
      "-i",
      index,
      "-r",
      reqFile
    ],
    env: e
  };
}
function pipFailure(out) {
  if (/DO NOT MATCH THE HASHES|hash mismatch|Expected sha256/i.test(out)) {
    return "\u955C\u50CF\u4E0A\u7684\u7EC4\u4EF6\u6587\u4EF6\u548C\u9501\u5B9A\u7684\u4E0D\u4E00\u81F4\uFF08\u53EF\u80FD\u662F\u955C\u50CF\u51FA\u4E86\u95EE\u9898\uFF09\uFF0C\u6CA1\u6709\u5B89\u88C5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
  }
  if (/No space left|Errno 28|ENOSPC|磁盘/i.test(out)) {
    return "\u78C1\u76D8\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u88C5\u4E0D\u4E0B\u6280\u80FD\u7EC4\u4EF6\uFF0C\u8BF7\u6E05\u7406\u78C1\u76D8\u540E\u91CD\u8BD5";
  }
  if (/IncompleteRead|HTTP|Connection|resolve|timed out|Network|ProxyError|SSLError|ReadTimeout|ENOTFOUND|ECONNRESET|Max retries/i.test(out)) {
    return "\u4E0B\u8F7D\u6280\u80FD\u7EC4\u4EF6\u65F6\u7F51\u7EDC\u51FA\u9519\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
  }
  return "\u6280\u80FD\u7EC4\u4EF6\u6CA1\u6709\u88C5\u597D\uFF08\u8BE6\u7EC6\u539F\u56E0\u5DF2\u5199\u8FDB\u65E5\u5FD7\uFF09\uFF0C\u53EF\u4EE5\u7A0D\u540E\u91CD\u8BD5";
}
var runPython = (args2, env, signal) => new Promise((resolve) => {
  const p = (0, import_node_child_process2.spawn)("python", args2, { env, windowsHide: true, signal });
  let out = "";
  p.stdout.on("data", (d) => {
    out += d;
  });
  p.stderr.on("data", (d) => {
    out += d;
  });
  p.on("error", (e) => resolve({ code: -1, out: e.message }));
  p.on("close", (code) => resolve({ code, out }));
});
var sha2562 = (b) => (0, import_node_crypto.createHash)("sha256").update(b).digest("hex");
var PART_STALE_MS = 60 * 60 * 1e3;
var SkillStore = class {
  constructor(o) {
    this.o = o;
  }
  o;
  get root() {
    return this.o.root;
  }
  /** Whether a path is this store's own, under its root (what it may write and remove). */
  mine(p) {
    const r = import_node_path3.default.resolve(this.o.root);
    const a = import_node_path3.default.resolve(p);
    return a.startsWith(r + import_node_path3.default.sep);
  }
  /** Where a skill's package is (or goes); null without one, or with a slug / version that isn't a safe name. */
  dirOf(s) {
    if (!s.pack || !SAFE_SLUG.test(s.slug) || !SAFE_VERSION.test(s.pack.version)) {
      return null;
    }
    const dir2 = import_node_path3.default.join(this.o.root, s.slug, s.pack.version);
    return this.mine(dir2) ? dir2 : null;
  }
  /** Removes a folder of this store's — never one outside it. */
  async remove(p) {
    if (!this.mine(p)) {
      throw new Error(`\u4E0D\u5728\u6280\u80FD\u76EE\u5F55\u91CC\uFF0C\u4E0D\u4F1A\u5220\u9664\uFF1A${p}`);
    }
    await (0, import_promises2.rm)(p, { recursive: true, force: true });
  }
  /** Whether a skill is here already, its files as they came (without reading them all: .ok there). */
  isHere(s) {
    const dir2 = this.dirOf(s);
    return !s.pack || !!dir2 && (0, import_node_fs2.existsSync)(import_node_path3.default.join(dir2, ".ok"));
  }
  /** Every file of a folder (relative, forward slashes) but .ok. */
  async filesIn(dir2) {
    const out = [];
    const walk4 = async (d, rel) => {
      for (const e of await (0, import_promises2.readdir)(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          await walk4(import_node_path3.default.join(d, e.name), `${rel}${e.name}/`);
        } else if (rel || e.name !== ".ok") {
          out.push(`${rel}${e.name}`);
        }
      }
    };
    await walk4(dir2, "");
    return out;
  }
  /** Whether the folder holds exactly what was unpacked (each file, its sha256; nothing added). */
  async intact(dir2, s) {
    try {
      const ok = JSON.parse(await (0, import_promises2.readFile)(import_node_path3.default.join(dir2, ".ok"), "utf8"));
      if (ok.sha256 !== s.pack?.sha256) {
        return false;
      }
      const files = await this.filesIn(dir2);
      if (files.length !== Object.keys(ok.files).length) {
        return false;
      }
      for (const f of files) {
        if (ok.files[f] !== sha2562(await (0, import_promises2.readFile)(import_node_path3.default.join(dir2, ...f.split("/"))))) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
  /**
   * The skill's folder — its package fetched, checked and unpacked first if not here, or if its files aren't what was
   * unpacked (changed since: fetched again); null for one without a package. Two tasks at once: the one that finishes first
   * is kept, the other's copy dropped.
   */
  async ensure(s) {
    const dir2 = this.dirOf(s);
    if (!dir2 || !s.pack) {
      return null;
    }
    if ((0, import_node_fs2.existsSync)(import_node_path3.default.join(dir2, ".ok"))) {
      if (await this.intact(dir2, s)) {
        return dir2;
      }
      this.o.log?.(`\u6280\u80FD ${s.name} \u7684\u6587\u4EF6\u548C\u4E0B\u8F7D\u65F6\u4E0D\u4E00\u81F4\uFF0C\u91CD\u65B0\u4E0B\u8F7D`);
      await this.remove(dir2);
    }
    await this.sweep(s.slug).catch(() => void 0);
    const zip = await this.o.download(s.itemId);
    if (sha2562(zip) !== s.pack.sha256) {
      throw new Error(`\u6280\u80FD\u5305\u6821\u9A8C\u5931\u8D25\uFF08${s.displayName}\uFF09\uFF1A\u5185\u5BB9\u548C\u8BB0\u5F55\u7684\u4E0D\u4E00\u81F4\uFF0C\u6CA1\u6709\u4F7F\u7528`);
    }
    const files = readZip(zip);
    const tmp = `${dir2}.part-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeZip(files, tmp);
    const record = { sha256: s.pack.sha256, files: Object.fromEntries(files.map((f) => [f.path, sha2562(f.data)])) };
    await (0, import_promises2.writeFile)(import_node_path3.default.join(tmp, ".ok"), JSON.stringify(record));
    if ((0, import_node_fs2.existsSync)(import_node_path3.default.join(dir2, ".ok"))) {
      await this.remove(tmp);
      return dir2;
    }
    try {
      if ((0, import_node_fs2.existsSync)(dir2)) {
        await this.remove(dir2);
      }
      await (0, import_promises2.rename)(tmp, dir2);
    } catch (e) {
      await this.remove(tmp).catch(() => void 0);
      if ((0, import_node_fs2.existsSync)(import_node_path3.default.join(dir2, ".ok"))) {
        return dir2;
      }
      throw e;
    }
    this.o.log?.(`\u6280\u80FD ${s.name} ${s.pack.version} \u5DF2\u51C6\u5907\u597D\uFF08${files.length} \u4E2A\u6587\u4EF6\uFF09`);
    await this.prune(s.slug, s.pack.version).catch(() => void 0);
    return dir2;
  }
  /** A skill's leftovers: unpacking that didn't finish over an hour ago. */
  async sweep(slug) {
    const base = import_node_path3.default.join(this.o.root, slug);
    for (const v of await (0, import_promises2.readdir)(base).catch(() => [])) {
      if (v.includes(".part-") && Date.now() - (await (0, import_promises2.stat)(import_node_path3.default.join(base, v))).mtimeMs > PART_STALE_MS) {
        await this.remove(import_node_path3.default.join(base, v));
      }
    }
  }
  /** A skill's versions beyond the 2 latest (by when they came) removed — this store's own folders only. */
  async prune(slug, keep) {
    const base = import_node_path3.default.join(this.o.root, slug);
    const all = await Promise.all((await (0, import_promises2.readdir)(base)).filter((v) => SAFE_VERSION.test(v)).map(async (v) => ({ v, at: (await (0, import_promises2.stat)(import_node_path3.default.join(base, v))).mtimeMs })));
    const old = all.filter((x) => x.v !== keep).sort((a, b) => b.at - a.at).slice(1);
    for (const x of old) {
      await this.remove(import_node_path3.default.join(base, x.v));
    }
  }
  /** Where a path really is (links and junctions followed, short names made long); not there yet: its folder's, plus its name. */
  real(p) {
    if (isNetworkPath(p)) {
      return p;
    }
    try {
      return import_node_fs2.realpathSync.native(p);
    } catch {
      const up = import_node_path3.default.dirname(p);
      return up === p ? p : import_node_path3.default.join(this.real(up), import_node_path3.default.basename(p));
    }
  }
  fold(p) {
    return process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p;
  }
  /** Whether a path is in the skills' folder (where it really is) — read freely, never changed. */
  owns(abs) {
    const r = this.fold(this.real(this.o.root));
    const p = this.fold(this.real(import_node_path3.default.resolve(abs)));
    return p === r || p.startsWith(r) && (p[r.length] === import_node_path3.default.sep || p[r.length] === "/");
  }
  /**
   * T-146 review: whether a command would change the skills' folder — run in it; a redirection into it; deleting there; or a
   * command that writes whose target (or last argument) is there. Its paths read as the shell would: %APPDATA%, $env:APPDATA,
   * $HOME and ~ expanded, relative ones against where it runs, short names and links followed (owns). What can't be told
   * from the words (python -c …) is caught when the skill is next loaded (its files are checked: changed, fetched again).
   */
  /**
   * T-146 review: the skills a command names a file of (python <skills>/…/check.py …) — checked again (ensure) before it
   * runs, so a skill changed after it was loaded in this task is put back first.
   */
  skillsNamedBy(command, cwd, skills, env) {
    const paths = this.pathsIn(command, cwd, env).map((p) => this.fold(this.real(p)));
    return skills.filter((s) => {
      const dir2 = this.dirOf(s);
      if (!dir2) {
        return false;
      }
      const d = this.fold(this.real(dir2));
      return paths.some((p) => p === d || p.startsWith(d) && (p[d.length] === import_node_path3.default.sep || p[d.length] === "/"));
    });
  }
  /**
   * B#888 第一批评审 ①④: why a command can't run (null: it can) — in every mode, 全部允许 too, before anything is asked:
   * - a path in the skills' folder that is no listed skill's current folder (a skill stopped, deleted or replaced since —
   *   its old folder named again from the conversation's history);
   * - a file of the user's own skill that isn't a .py (a .txt or a .docx run as a program: the review counts .py only).
   *   Reading one is read_file's (the folder is read freely).
   */
  refusal(command, cwd, skills, env) {
    const own = this.ownSkillRefusal(command, skills, env);
    if (own) {
      return own;
    }
    const r = this.fold(this.real(this.o.root));
    const inside4 = (p, d) => p === d || p.startsWith(d) && (p[d.length] === import_node_path3.default.sep || p[d.length] === "/");
    const dirs = skills.map((s) => ({ s, d: this.dirOf(s) })).filter((x) => !!x.d).map((x) => ({ ...x, d: this.fold(this.real(x.d)) }));
    const named = this.pathsIn(command, cwd, env);
    const bases = named.filter((p) => inside4(this.fold(this.real(p)), r) && this.isDir(p));
    const relative = bases.length ? this.wordsIn(command, env).filter((t2) => t2 && !import_node_path3.default.isAbsolute(t2) && !/^[-/][A-Za-z]/.test(t2)).flatMap((t2) => bases.map((b) => import_node_path3.default.resolve(b, t2))).filter((p) => (0, import_node_fs2.existsSync)(p)) : [];
    for (const raw of [...named, ...relative]) {
      const p = this.fold(this.real(raw));
      if (p === r || !inside4(p, r)) {
        continue;
      }
      const owner = dirs.find((x) => inside4(p, x.d));
      if (!owner) {
        return `${raw} \u4E0D\u5C5E\u4E8E\u73B0\u5728\u53EF\u7528\u7684\u6280\u80FD\uFF08\u6280\u80FD\u53EF\u80FD\u5DF2\u505C\u7528\u3001\u5220\u9664\u6216\u6362\u4E86\u65B0\u7248\u672C\uFF09\uFF0C\u6CA1\u6709\u8FD0\u884C\u8FD9\u6761\u547D\u4EE4\u3002\u8BF7\u6539\u7528\u6280\u80FD\u5217\u8868\u91CC\u7684\u6280\u80FD\u3002`;
      }
      if (!owner.s.official && p !== owner.d && import_node_path3.default.extname(p).toLowerCase() !== ".py" && !this.isDir(raw)) {
        return `\u7528\u6237\u81EA\u5DF1\u7684\u6280\u80FD\u300C${owner.s.displayName}\u300D\u91CC\u53EA\u6709 .py \u6587\u4EF6\u53EF\u4EE5\u8FD0\u884C\uFF0C${raw} \u4E0D\u662F\uFF0C\u6CA1\u6709\u8FD0\u884C\u8FD9\u6761\u547D\u4EE4\u3002\u8981\u770B\u5B83\u7684\u5185\u5BB9\u8BF7\u7528 read_file\u3002`;
      }
    }
    return null;
  }
  /**
   * B#888 第三批复审 ①: a command that names the user's own skills' folders in any way — however it is written (quoted or
   * inside python -c / bash -c, \\ or /, %VAR% / $env:X / $HOME / ${HOME} / ~, \\?\\, any case where the disk doesn't
   * tell case apart) — is refused, but for the one form that runs a script of theirs: python <a listed user skill's .py, by
   * its full path> [arguments that name nothing there, no second command]. Whatever else (exec(open(…)), copying a file out
   * to run it, a file that isn't .py) can't be told apart from the words, so it isn't run; reading is read_file's.
   */
  ownSkillRefusal(command, skills, env) {
    const roots2 = [...new Set([this.o.root, this.real(this.o.root)].map((x) => this.flat(x)))];
    const marks = [...roots2.map((x) => `${x}/u-`), this.flat(`/${import_node_path3.default.basename(this.o.root)}/u-`)];
    const names = (c) => {
      const h = this.flat(this.expand(c, env));
      return marks.some((m2) => h.includes(m2));
    };
    if (!names(command)) {
      return null;
    }
    const m = /^\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s+(?:"([^"]+)"|'([^']+)'|(\S+))(.*)$/s.exec(String(command ?? ""));
    const program = m ? import_node_path3.default.basename(m[1] ?? m[2] ?? m[3]).toLowerCase() : "";
    const script = m ? this.expand(m[4] ?? m[5] ?? m[6], env) : "";
    const rest = m ? m[7] : "";
    const ok = /^(python3?|py)(\.exe)?$/.test(program) && import_node_path3.default.isAbsolute(script) && import_node_path3.default.extname(script).toLowerCase() === ".py" && !/[;&|<>`\r\n]|\$\(/.test(rest) && !names(rest) && !this.isDir(script) && (0, import_node_fs2.existsSync)(script) && skills.some((s) => {
      const d = !s.official ? this.dirOf(s) : null;
      const f = this.fold(this.real(script));
      const dd = d ? this.fold(this.real(d)) : "";
      return !!d && f.startsWith(dd) && (f[dd.length] === import_node_path3.default.sep || f[dd.length] === "/");
    });
    return ok ? null : "\u8FD9\u6761\u547D\u4EE4\u6D89\u53CA\u7528\u6237\u81EA\u5DF1\u7684\u6280\u80FD\u7684\u6587\u4EF6\u5939\uFF0C\u6CA1\u6709\u8FD0\u884C\u3002\u7528\u6237\u6280\u80FD\u7684\u811A\u672C\u53EA\u80FD\u8FD9\u6837\u8FD0\u884C\uFF1Apython <\u6280\u80FD\u91CC .py \u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84> [\u53C2\u6570]\uFF08\u540C\u4E00\u6761\u547D\u4EE4\u91CC\u4E0D\u80FD\u518D\u6709\u522B\u7684\u547D\u4EE4\uFF09\uFF1B\u8981\u770B\u6280\u80FD\u91CC\u7684\u5176\u4ED6\u6587\u4EF6\u8BF7\u7528 read_file\u3002";
  }
  /** A command's variables as the shell would read them: %VAR%, $env:VAR, ${VAR}, $VAR, ~ at a word's start. */
  expand(command, env) {
    const e = env ?? process.env;
    const get = (k) => Object.entries(e).find(([n]) => n.toUpperCase() === k.toUpperCase())?.[1] ?? "";
    const home = () => get("USERPROFILE") || get("HOME") || import_node_os2.default.homedir();
    return String(command ?? "").replace(/%([A-Za-z_]\w*)%/g, (_, k) => get(k)).replace(/\$env:([A-Za-z_]\w*)/gi, (_, k) => get(k)).replace(/\$\{([A-Za-z_]\w*)\}/g, (_, k) => get(k)).replace(/\$([A-Za-z_]\w*)/g, (_, k) => get(k)).replace(/(^|[\s"'=(,;])~(?=$|[\\/])/g, (_, b) => b + home());
  }
  /** A text as one plain line to look in: no quotes or escapes (" ' ` ^), / for \\, one / at a time, no \\?\\ or ./, folded. */
  flat(t2) {
    return this.fold(t2.replace(/["'`^]/g, "").replace(/\\/g, "/").replace(/\/\?\//g, "/").replace(/\/(\.\/)+/g, "/").replace(/\/{2,}/g, "/"));
  }
  isDir(p) {
    try {
      return (0, import_node_fs2.statSync)(p).isDirectory();
    } catch {
      return false;
    }
  }
  /**
   * B#888 第一批评审 ④: the user's own skills' folders that aren't in the list any more (stopped, deleted) and their versions
   * but the current one — removed when the list is read. A task still on an older list that removes a newer version: that
   * one is fetched again when it is next loaded or run (ensure: no .ok).
   */
  async forget(skills) {
    const current2 = new Map(skills.filter((s) => !s.official && s.pack).map((s) => [s.slug, s.pack.version]));
    for (const slug of await (0, import_promises2.readdir)(this.o.root).catch(() => [])) {
      if (!slug.startsWith("u-") || !SAFE_SLUG.test(slug)) {
        continue;
      }
      const base = import_node_path3.default.join(this.o.root, slug);
      const keep = current2.get(slug);
      try {
        if (!keep) {
          await this.remove(base);
          this.o.log?.(`\u7528\u6237\u6280\u80FD ${slug} \u5DF2\u4E0D\u5728\u5217\u8868\u91CC\uFF0C\u5220\u9664\u4E86\u672C\u673A\u7684\u526F\u672C`);
          continue;
        }
        for (const v of await (0, import_promises2.readdir)(base)) {
          if (v !== keep && !v.includes(".part-")) {
            await this.remove(import_node_path3.default.join(base, v));
          }
        }
      } catch (e) {
        this.o.log?.(`\u6E05\u7406\u7528\u6237\u6280\u80FD ${slug} \u7684\u65E7\u6587\u4EF6\u5931\u8D25\uFF1A${e.message}`);
      }
    }
  }
  /** Every path-looking word of a command, as the shell would read it (variables and ~ expanded), absolute. */
  pathsIn(command, cwd, env) {
    return this.wordsIn(command, env).filter((t2) => /[\\/]/.test(t2)).map((t2) => import_node_path3.default.resolve(cwd, t2));
  }
  /** Every word of a command, as the shell would read it (quotes off, variables and ~ expanded). */
  wordsIn(command, env) {
    const e = env ?? process.env;
    const get = (k) => Object.entries(e).find(([n]) => n.toUpperCase() === k.toUpperCase())?.[1] ?? "";
    return (String(command ?? "").match(/"[^"]+"|'[^']+'|[^\s|;&<>]+/g) ?? []).map((t2) => t2.replace(/^["']|["']$/g, "").replace(/%([A-Za-z_][\w]*)%/g, (_, k) => get(k)).replace(/\$env:([A-Za-z_]\w*)/gi, (_, k) => get(k)).replace(/^~(?=$|[\\/])/, () => get("USERPROFILE") || get("HOME") || import_node_os2.default.homedir()));
  }
  touchedBy(command, cwd, env) {
    const e = env ?? process.env;
    const get = (k) => Object.entries(e).find(([n]) => n.toUpperCase() === k.toUpperCase())?.[1] ?? "";
    const expand = (t2) => t2.replace(/^["']|["']$/g, "").replace(/%([A-Za-z_][\w]*)%/g, (_, k) => get(k)).replace(/\$env:([A-Za-z_]\w*)/gi, (_, k) => get(k)).replace(/\$\{?([A-Za-z_]\w*)\}?/g, (_, k) => get(k)).replace(/^~(?=$|[\\/])/, () => get("USERPROFILE") || get("HOME") || import_node_os2.default.homedir());
    const at = (t2) => {
      const p = expand(t2);
      return !!p && this.owns(import_node_path3.default.resolve(cwd, p));
    };
    const c = String(command ?? "");
    if (this.owns(cwd)) {
      return true;
    }
    if ([...c.matchAll(/>>?\s*("[^"]+"|'[^']+'|[^\s|;&]+)/g)].some((m) => at(m[1]))) {
      return true;
    }
    const kind = commandKind(c);
    const tokens3 = (c.match(/"[^"]+"|'[^']+'|[^\s|;&<>]+/g) ?? []).slice(1).filter((t2) => !/^[-/][A-Za-z]/.test(t2) || /[\\/]/.test(t2.slice(1)));
    if (kind === "delete") {
      return tokens3.some(at);
    }
    if (kind !== "write") {
      return false;
    }
    const target = commandTarget(c);
    return !!target && at(target) || tokens3.length > 0 && at(tokens3[tokens3.length - 1]);
  }
  /** Whether a skill's Python packages are installed already (the step says 「正在准备…所需组件」 when not). */
  libsReady(wanted) {
    const names = packagesFor(wanted);
    if (!names.length || !this.o.libsRoot) {
      return true;
    }
    try {
      const done = JSON.parse((0, import_node_fs2.readFileSync)(import_node_path3.default.join(skillLibsDir(this.o.libsRoot), ".feibo-installed.json"), "utf8"));
      return names.every((n) => done.includes(n));
    } catch {
      return false;
    }
  }
  /**
   * The Python packages a skill asks for, installed if not yet (pinned wheels, their hashes checked by pip). Returns why it
   * couldn't ('' when ready). env: the task's (FeiBo's own Python on PATH).
   */
  async ensureLibs(wanted, env, signal) {
    const names = packagesFor(wanted);
    if (!names.length || !this.o.libsRoot) {
      return "";
    }
    const plat = platformKey();
    if (!plat) {
      return "\u8FD9\u53F0\u7535\u8111\u7684\u7CFB\u7EDF\u4E0D\u5728\u6280\u80FD\u7EC4\u4EF6\u7684\u652F\u6301\u8303\u56F4\u5185";
    }
    const dir2 = skillLibsDir(this.o.libsRoot);
    const doneFile = import_node_path3.default.join(dir2, ".feibo-installed.json");
    const done = await (0, import_promises2.readFile)(doneFile, "utf8").then((t2) => JSON.parse(t2), () => []);
    const todo = names.filter((n) => !done.includes(n));
    if (!todo.length) {
      return "";
    }
    await (0, import_promises2.mkdir)(dir2, { recursive: true });
    const pkgs = SKILL_LIBS_LOCK.packages;
    const req = todo.map((n) => `${n}==${pkgs[n].version} ${pkgs[n].wheels[plat].map((w) => `--hash=sha256:${w.sha256}`).join(" ")}`).join("\n") + "\n";
    const reqFile = import_node_path3.default.join(dir2, `.req-${process.pid}-${Date.now()}.txt`);
    await (0, import_promises2.writeFile)(reqFile, req);
    const run2 = pipCommand(dir2, reqFile, env);
    const res = await (this.o.pip ?? runPython)(run2.args, run2.env, signal).catch((e) => ({ code: -1, out: e.message }));
    await (0, import_promises2.rm)(reqFile, { force: true });
    if (res.code !== 0) {
      this.o.log?.(`\u6280\u80FD\u7EC4\u4EF6\u5B89\u88C5\u5931\u8D25\uFF1A${res.out.slice(-800)}`);
      return pipFailure(res.out);
    }
    await (0, import_promises2.writeFile)(doneFile, JSON.stringify([...done, ...todo]));
    return "";
  }
};
