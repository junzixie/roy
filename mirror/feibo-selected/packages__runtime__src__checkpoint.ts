// ../../packages/runtime/src/checkpoint.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs4 = require("node:fs");
var import_node_path5 = __toESM(require("node:path"), 1);
var MAX_FILE = 50 * 1024 * 1024;
var MAX_TOTAL = 500 * 1024 * 1024;
var MAX_PATHS = 2e4;
var KEEP_DAYS = 7;
function pathKey2(p, platform2 = process.platform) {
  const abs = import_node_path5.default.resolve(p);
  return platform2 === "win32" ? abs.toLowerCase() : abs;
}
var NO_BIN = "\u8FD9\u53F0\u7535\u8111\u6CA1\u6709\u53EF\u7528\u7684\u56DE\u6536\u7AD9\uFF0C\u6CA1\u6709\u5220\u9664";
var TRASH_FAILED = "\u6CA1\u80FD\u79FB\u5230\u56DE\u6536\u7AD9";
var MANIFEST = "manifest.json";
var CANT_KEEP_MOVED = "\u79FB\u52A8\u6765\u7684\u5185\u5BB9\u6CA1\u6709\u5907\u4EFD\uFF08\u6E90\u6587\u4EF6\u592A\u5927\u6216\u65E0\u6CD5\u5907\u4EFD\uFF09\uFF0C\u8FD9\u91CC\u7684\u6539\u52A8\u65E0\u6CD5\u64A4\u9500";
var THROUGH_LINK = "\u8FD9\u4E2A\u8DEF\u5F84\u7ECF\u8FC7\u94FE\u63A5\uFF08junction / \u7B26\u53F7\u94FE\u63A5\uFF09\uFF0C\u6539\u52A8\u7684\u662F\u94FE\u63A5\u6307\u5411\u7684\u5730\u65B9\uFF0C\u65E0\u6CD5\u64A4\u9500";
var NOT_THE_TASKS = "\u4E0D\u662F\u4EFB\u52A1\u7684\u6587\u4EF6\u5DE5\u5177\u521B\u5EFA\u7684\uFF08\u53EF\u80FD\u662F\u547D\u4EE4\u6216\u5176\u4ED6\u7A0B\u5E8F\u653E\u8FDB\u6765\u7684\uFF09\uFF0C\u5DF2\u4FDD\u7559";
var REPLACED = "\u548C\u4EFB\u52A1\u7684\u6587\u4EF6\u5DE5\u5177\u6700\u540E\u5199\u5165\u7684\u5185\u5BB9\u4E0D\u4E00\u6837\uFF08\u53EF\u80FD\u88AB\u547D\u4EE4\u6216\u5176\u4ED6\u7A0B\u5E8F\u6362\u6389\u4E86\uFF09\uFF0C\u5DF2\u4FDD\u7559";
var reasonOf = (e) => {
  const code = e?.code;
  return code === "ENOSPC" ? "\u78C1\u76D8\u7A7A\u95F4\u4E0D\u8DB3" : code === "EACCES" || code === "EPERM" ? "\u6CA1\u6709\u6743\u9650\u8BFB\u53D6" : code === "EBUSY" ? "\u6587\u4EF6\u6B63\u88AB\u5360\u7528" : e?.message ?? String(e);
};
var inside2 = (p, dir2) => {
  const k = pathKey2(p);
  const d = pathKey2(dir2);
  return k === d || k.startsWith(d + import_node_path5.default.sep);
};
var depth = (p) => import_node_path5.default.resolve(p).split(/[\\/]+/).filter(Boolean).length;
function rebase(p, from, to) {
  const rel = import_node_path5.default.relative(from, p);
  if (rel === "") {
    return to;
  }
  return rel.startsWith("..") || import_node_path5.default.isAbsolute(rel) ? null : import_node_path5.default.join(to, rel);
}
function notThere(e) {
  return ["ENOENT", "ENOTDIR"].includes(e?.code ?? "");
}
async function missingPath(p) {
  try {
    await import_node_fs4.promises.lstat(p);
    return false;
  } catch (e) {
    return notThere(e);
  }
}
async function safeTarget(p, base) {
  const abs = import_node_path5.default.resolve(p);
  const stop = base && inside2(abs, base) ? import_node_path5.default.resolve(base) : null;
  let nearest = null;
  for (let d = import_node_path5.default.dirname(abs); d !== import_node_path5.default.dirname(d); d = import_node_path5.default.dirname(d)) {
    if (stop && pathKey2(d) === pathKey2(stop)) {
      break;
    }
    const st = await import_node_fs4.promises.lstat(d).catch(() => null);
    if (st?.isSymbolicLink()) {
      return false;
    }
    nearest ??= st ? d : null;
  }
  const anchor = nearest ?? stop;
  if (anchor) {
    const real = await import_node_fs4.promises.realpath(anchor).catch(() => null);
    if (!real) {
      return false;
    }
    const expected = stop ? import_node_path5.default.join(await import_node_fs4.promises.realpath(stop).catch(() => null) ?? stop, import_node_path5.default.relative(stop, anchor)) : anchor;
    if (pathKey2(real) !== pathKey2(expected)) {
      return false;
    }
  }
  return true;
}
var ThroughLink = class extends Error {
};
var write = {
  async guard(p, base) {
    if (!await safeTarget(p, base)) {
      throw new ThroughLink(p);
    }
  },
  /** Removes the path itself, never recursively: a link as a link (never what it points to), a folder only when empty. */
  async remove(p, now, base) {
    await write.guard(p, base);
    if (now.kind === "link") {
      try {
        await import_node_fs4.promises.unlink(p);
      } catch (e) {
        if (["EPERM", "EISDIR"].includes(e.code ?? "")) {
          await import_node_fs4.promises.rmdir(p);
        } else {
          throw e;
        }
      }
    } else if (now.kind === "dir") {
      await import_node_fs4.promises.rmdir(p);
    } else {
      await import_node_fs4.promises.unlink(p);
    }
  },
  async mkdir(p, base) {
    await write.guard(p, base);
    await import_node_fs4.promises.mkdir(p, { recursive: true });
  },
  /**
   * Writes a file back: copied next to it under a new name first, then renamed over it — a new entry, so nothing that
   * shares the old one (a hard link a command made to a file elsewhere) is written into.
   */
  async copy(from, p, base) {
    await write.mkdir(import_node_path5.default.dirname(p), base);
    const tmp = import_node_path5.default.join(import_node_path5.default.dirname(p), `.${import_node_path5.default.basename(p)}.feibo-undo-${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`);
    await write.guard(tmp, base);
    await import_node_fs4.promises.copyFile(from, tmp, import_node_fs4.constants.COPYFILE_EXCL);
    try {
      await write.rename(tmp, p, base);
    } catch (e) {
      await import_node_fs4.promises.unlink(tmp).catch(() => void 0);
      throw e;
    }
  },
  async link(target, p, dir2, base) {
    await write.mkdir(import_node_path5.default.dirname(p), base);
    await write.guard(p, base);
    await import_node_fs4.promises.symlink(target, p, dir2 ? process.platform === "win32" ? "junction" : "dir" : "file");
  },
  async rename(from, to, base) {
    await write.guard(from, base);
    await write.guard(to, base);
    await import_node_fs4.promises.rename(from, to);
  }
};
async function hashOf(file) {
  return (0, import_node_crypto2.createHash)("sha1").update(await import_node_fs4.promises.readFile(file)).digest("hex");
}
async function nameOf(p) {
  if (process.platform !== "win32") {
    return void 0;
  }
  const want = import_node_path5.default.basename(p).toLowerCase();
  return (await import_node_fs4.promises.readdir(import_node_path5.default.dirname(p)).catch(() => [])).find((n) => n.toLowerCase() === want);
}
async function stateOf2(p) {
  let st;
  try {
    st = await import_node_fs4.promises.lstat(p);
  } catch (e) {
    return notThere(e) ? { kind: "none" } : null;
  }
  const name = await nameOf(p);
  if (st.isSymbolicLink()) {
    const target = await import_node_fs4.promises.readlink(p).catch(() => "");
    const dir2 = !!(await import_node_fs4.promises.stat(p).catch(() => null))?.isDirectory();
    return { kind: "link", target, dir: dir2, name };
  }
  if (st.isDirectory()) {
    return { kind: "dir", name };
  }
  return { kind: "file", size: st.size, mtimeMs: st.mtimeMs, hash: st.size <= MAX_FILE ? await hashOf(p).catch(() => void 0) : void 0, name };
}
function sameState(a, b, withName = false) {
  if (!a || !b || a.kind !== b.kind) {
    return false;
  }
  if (withName && a.name && b.name && a.name !== b.name) {
    return false;
  }
  if (a.kind === "link" && b.kind === "link") {
    return a.target === b.target;
  }
  if (a.kind !== "file" || b.kind !== "file") {
    return true;
  }
  if (a.hash && b.hash) {
    return a.hash === b.hash;
  }
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}
async function walk2(dir2, max) {
  const out = [];
  const go = async (d) => {
    let names;
    try {
      names = await import_node_fs4.promises.readdir(d);
    } catch (e) {
      if (d === dir2 && ["ENOENT", "ENOTDIR"].includes(e.code ?? "")) {
        return;
      }
      throw e;
    }
    for (const name of names) {
      const p = import_node_path5.default.join(d, name);
      out.push(p);
      if (out.length > max) {
        throw new Error("too-many");
      }
      const st = await import_node_fs4.promises.lstat(p).catch(() => null);
      if (st?.isDirectory() && !st.isSymbolicLink()) {
        await go(p);
      }
    }
  };
  if ((await import_node_fs4.promises.lstat(dir2).catch(() => null))?.isSymbolicLink()) {
    return out;
  }
  await go(dir2);
  return out;
}
var Checkpoint = class {
  dir;
  m;
  total = 0;
  n = 0;
  kept = /* @__PURE__ */ new Map();
  limits;
  /**
   * limits: MAX_FILE / MAX_TOTAL / MAX_PATHS unless given (tests). base: the task's workspace — inside it only the folders
   * below it are checked for links (a workspace that itself sits behind a link stays undoable). Plain fields, not
   * parameter properties: tests strip types only.
   */
  constructor(root, taskId, limits = { file: MAX_FILE, total: MAX_TOTAL, paths: MAX_PATHS }, base) {
    this.dir = checkpointDir(root, taskId);
    this.limits = limits;
    this.m = { taskId, createdAt: (/* @__PURE__ */ new Date()).toISOString(), base: base ? import_node_path5.default.resolve(base) : null, recs: [], skipped: [], blocked: [], commands: false };
  }
  /**
   * Called before a tool changes these paths: each one not kept yet is kept as it is now (a folder with all under it),
   * and so are the folders above it that aren't there (the tool creates them). Never throws — what could not be kept is
   * returned, with why (too big, the checkpoint full, no room, unreadable, through a link); its change can't be undone,
   * which the task says.
   */
  async before(paths) {
    const lost = [];
    for (const p of paths.map((x) => import_node_path5.default.resolve(x))) {
      await this.touch(p, lost);
    }
    return this.saved(paths, lost);
  }
  /**
   * Called before a move: both ends kept, and every path the move is about to make on the target side (what is under the
   * source, at its new place) noted as made by the task where lstat finds nothing now. When anything of the source
   * couldn't be kept, the target (and what is under it) is never deleted by undo: what was moved there exists nowhere else.
   */
  async beforeMove(from, to) {
    const src = import_node_path5.default.resolve(from);
    const dst = import_node_path5.default.resolve(to);
    const lost = [];
    const before = this.m.skipped.length;
    await this.touch(src, lost);
    const srcLost = this.m.skipped.slice(before).some((s) => inside2(s.path, src)) || this.m.skipped.some((s) => inside2(src, s.path)) || this.isBlocked(src);
    if (srcLost && !this.kept.has(pathKey2(dst))) {
      this.m.blocked.push(dst);
      this.m.skipped.push({ path: dst, reason: CANT_KEEP_MOVED });
      lost.push({ path: dst, reason: CANT_KEEP_MOVED });
      return this.saved([from, to], lost);
    }
    await this.touch(dst, lost);
    if (!this.isBlocked(dst) && !(await import_node_fs4.promises.lstat(src).catch(() => null))?.isSymbolicLink()) {
      let subs = [];
      try {
        subs = await walk2(src, this.limits.paths);
      } catch {
      }
      for (const s of subs) {
        const t2 = rebase(s, src, dst);
        if (t2 && !this.kept.has(pathKey2(t2)) && await missingPath(t2)) {
          this.add({ path: t2, orig: { kind: "none" } });
        }
      }
    }
    return this.saved([from, to], lost);
  }
  /**
   * Called after a tool changed these paths: what is there now is what the file tools wrote — for each path, the folders
   * above it it made, and what is under it (a moved folder). Undo deletes a path the tools made only while it is still
   * that (a command may have put something else there since). Never throws.
   */
  async after(paths) {
    for (const p of paths.map((x) => import_node_path5.default.resolve(x))) {
      const keys = /* @__PURE__ */ new Set([pathKey2(p)]);
      for (let d = import_node_path5.default.dirname(p); d !== import_node_path5.default.dirname(d); d = import_node_path5.default.dirname(d)) {
        const up = this.kept.get(pathKey2(d));
        if (!up || up.orig.kind !== "none") {
          break;
        }
        keys.add(pathKey2(d));
      }
      try {
        for (const s of await walk2(p, this.limits.paths)) {
          keys.add(pathKey2(s));
        }
      } catch {
      }
      for (const k of keys) {
        const r = this.kept.get(k);
        if (r && !this.isBlocked(r.path) && await safeTarget(r.path, this.m.base)) {
          r.wrote = await stateOf2(r.path) ?? void 0;
        }
      }
    }
    await this.save();
  }
  /** The task ran a command (its changes are not tracked). */
  /**
   * T-145: what a path was when the task started, when the file tools kept it — 'none' means the task made it; undefined:
   * not kept (no file tool touched it).
   */
  origKind(p) {
    const k = pathKey2(p);
    return this.m.recs.find((r) => pathKey2(r.path) === k)?.orig.kind;
  }
  ranCommand() {
    this.m.commands = true;
  }
  /**
   * T-189 (问题单 #121 第 5 条): files and folders a command made (the before / after listing of T-173) — kept as 「nothing
   * was there」, so 撤销这次的文件改动 takes them away too (to the recycle bin), as it does what the file tools made. One
   * already kept, or under a kept one, stays as it is.
   */
  async madeByCommand(paths) {
    for (const p of paths.map((x) => import_node_path5.default.resolve(x)).sort((a, b) => depth(a) - depth(b))) {
      if (this.kept.has(pathKey2(p)) || this.isBlocked(p) || !await safeTarget(p, this.m.base)) {
        continue;
      }
      let covered = false;
      for (let d = import_node_path5.default.dirname(p); d !== import_node_path5.default.dirname(d); d = import_node_path5.default.dirname(d)) {
        const up = this.kept.get(pathKey2(d));
        if (up && up.orig.kind !== "none") {
          covered = true;
        }
        if (up) {
          break;
        }
      }
      const now = await stateOf2(p);
      if (covered || !now) {
        continue;
      }
      this.add({ path: p, orig: { kind: "none" }, wrote: now, trash: true });
    }
  }
  get empty() {
    return !this.m.recs.length;
  }
  /**
   * The task ended: how each kept path was left is noted (to tell later changes) — a path the guard refuses (reached
   * through a link now) is noted as can't-undo instead. Returns what undo would do, for the task card, and what can't be
   * undone. Nothing kept: the folder is removed (null when there is nothing to say).
   */
  async finish() {
    if (this.empty) {
      (0, import_node_fs4.rmSync)(this.dir, { recursive: true, force: true });
      return this.m.skipped.length || this.m.commands ? { items: [], skipped: this.m.skipped, commands: this.m.commands } : null;
    }
    for (const r of this.m.recs) {
      if (this.isBlocked(r.path)) {
        continue;
      }
      if (!await safeTarget(r.path, this.m.base)) {
        this.m.blocked.push(r.path);
        this.m.skipped.push({ path: r.path, reason: THROUGH_LINK });
        continue;
      }
      r.end = await stateOf2(r.path) ?? void 0;
    }
    this.m.endedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (!await this.save()) {
      return { items: [], skipped: [...this.m.skipped, { path: this.dir, reason: "\u68C0\u67E5\u70B9\u65E0\u6CD5\u5199\u5165\uFF08\u78C1\u76D8\u7A7A\u95F4\u4E0D\u8DB3\u6216\u6CA1\u6709\u6743\u9650\uFF09" }], commands: this.m.commands };
    }
    return { items: await plan(this.dir), skipped: this.m.skipped, commands: this.m.commands };
  }
  isBlocked(p) {
    return this.m.blocked.some((b) => inside2(p, b));
  }
  add(r) {
    this.kept.set(pathKey2(r.path), r);
    this.m.recs.push(r);
  }
  async saved(paths, lost) {
    if (!await this.save()) {
      for (const p of paths.map((x) => import_node_path5.default.resolve(x))) {
        if (!lost.some((l) => l.path === p)) {
          lost.push({ path: p, reason: "\u68C0\u67E5\u70B9\u65E0\u6CD5\u5199\u5165\uFF08\u78C1\u76D8\u7A7A\u95F4\u4E0D\u8DB3\u6216\u6CA1\u6709\u6743\u9650\uFF09" });
        }
      }
    }
    return lost;
  }
  /**
   * One path a tool is about to change: refused when the guard does (reached through a link: what changes is wherever
   * the link points — never kept nor touched; only the link itself is); else the missing folders above it first (made
   * with it, each confirmed missing by lstat), then the path itself.
   */
  async touch(p, lost) {
    if (this.isBlocked(p)) {
      return;
    }
    if (!await safeTarget(p, this.m.base)) {
      this.m.blocked.push(p);
      this.m.skipped.push({ path: p, reason: THROUGH_LINK });
      lost.push({ path: p, reason: THROUGH_LINK });
      return;
    }
    const missing = [];
    for (let d = import_node_path5.default.dirname(p); d !== import_node_path5.default.dirname(d) && !this.kept.has(pathKey2(d)) && await missingPath(d); d = import_node_path5.default.dirname(d)) {
      missing.unshift(d);
    }
    for (const d of missing) {
      this.add({ path: d, orig: { kind: "none" } });
    }
    await this.keep(p, lost);
  }
  /**
   * Keeps one path as it was when the task started, unless kept already: as it is now (a folder: with everything under
   * it; a link: only where it points). Below a folder kept as not there or as a file then, nothing of its own could
   * have been there: a path that isn't there (lstat: ENOENT) is kept as not there; one that is (a move noted it already,
   * or something else put it there) is left alone.
   */
  async keep(p, lost) {
    if (this.kept.has(pathKey2(p))) {
      return;
    }
    for (let d = import_node_path5.default.dirname(p); d !== import_node_path5.default.dirname(d); d = import_node_path5.default.dirname(d)) {
      const up = this.kept.get(pathKey2(d));
      if (up) {
        if (up.orig.kind !== "dir") {
          if (await missingPath(p)) {
            this.add({ path: p, orig: { kind: "none" } });
          }
          return;
        }
        break;
      }
    }
    const skip = (reason) => {
      this.m.skipped.push({ path: p, reason });
      lost.push({ path: p, reason });
    };
    let st;
    try {
      st = await import_node_fs4.promises.lstat(p);
    } catch (e) {
      if (notThere(e)) {
        this.add({ path: p, orig: { kind: "none" } });
      } else {
        skip(`\u65E0\u6CD5\u5907\u4EFD\uFF1A${reasonOf(e)}`);
      }
      return;
    }
    const orig = await stateOf2(p);
    if (!orig) {
      return skip("\u65E0\u6CD5\u5907\u4EFD\uFF1A\u8BFB\u4E0D\u5230\u8FD9\u4E2A\u8DEF\u5F84");
    }
    if (orig.kind === "link") {
      this.add({ path: p, orig });
      return;
    }
    if (orig.kind === "dir") {
      let subs;
      try {
        subs = await walk2(p, this.limits.paths);
      } catch (e) {
        skip(e.message === "too-many" ? `\u6587\u4EF6\u5939\u91CC\u7684\u6587\u4EF6\u592A\u591A\uFF08\u8D85\u8FC7 ${this.limits.paths} \u4E2A\uFF09` : `\u65E0\u6CD5\u5907\u4EFD\uFF1A${reasonOf(e)}`);
        return;
      }
      this.add({ path: p, orig });
      for (const sub of subs) {
        await this.keep(sub, lost);
      }
      return;
    }
    const { file: maxFile, total: maxTotal } = this.limits;
    if (st.size > maxFile) {
      return skip(`\u6587\u4EF6\u592A\u5927\uFF08\u8D85\u8FC7 ${Math.round(maxFile / 1024 / 1024)}MB\uFF09`);
    }
    if (this.total + st.size > maxTotal) {
      return skip(`\u672C\u6B21\u4EFB\u52A1\u7684\u68C0\u67E5\u70B9\u5DF2\u6EE1\uFF08${Math.round(maxTotal / 1024 / 1024)}MB\uFF09`);
    }
    const backup = import_node_path5.default.join("files", String(++this.n));
    let hash;
    try {
      await import_node_fs4.promises.mkdir(import_node_path5.default.join(this.dir, "files"), { recursive: true });
      await import_node_fs4.promises.copyFile(p, import_node_path5.default.join(this.dir, backup));
      hash = await hashOf(import_node_path5.default.join(this.dir, backup));
    } catch (e) {
      return skip(`\u5907\u4EFD\u5931\u8D25\uFF1A${reasonOf(e)}`);
    }
    this.total += st.size;
    this.add({ path: p, orig: orig.kind === "file" ? { ...orig, hash } : orig, backup });
  }
  async save() {
    try {
      await import_node_fs4.promises.mkdir(this.dir, { recursive: true });
      await import_node_fs4.promises.writeFile(import_node_path5.default.join(this.dir, MANIFEST), JSON.stringify(this.m));
      return true;
    } catch {
      return false;
    }
  }
};
async function read(dir2) {
  try {
    const m = JSON.parse(await import_node_fs4.promises.readFile(import_node_path5.default.join(dir2, MANIFEST), "utf8"));
    m.blocked ??= [];
    m.base ??= null;
    return m;
  } catch {
    return null;
  }
}
var checkpointDir = (root, taskId) => import_node_path5.default.join(root, taskId.replace(/[^\w-]/g, ""));
async function assess(m) {
  const out = [];
  for (const r of m.recs) {
    if (m.blocked.some((b) => inside2(r.path, b))) {
      continue;
    }
    if (!await safeTarget(r.path, m.base)) {
      out.push({ r, now: null, needs: false, changed: false, unsafe: true });
      continue;
    }
    const now = await stateOf2(r.path);
    out.push({ r, now, needs: !sameState(now, r.orig, true), changed: !!r.end && !sameState(now, r.end), unsafe: false });
  }
  return out;
}
async function plan(dir2) {
  const m = await read(dir2);
  if (!m) {
    return [];
  }
  return (await assess(m)).filter((a) => a.needs && !(a.r.orig.kind === "none" && a.now?.kind === "dir")).map((a) => ({ path: a.r.path, action: a.r.orig.kind === "none" ? "delete" : "restore", changed: a.changed }));
}
async function putBack(dir2, r, now, base) {
  const respell = async () => {
    const name = await nameOf(r.path);
    if (r.orig.name && name && name !== r.orig.name) {
      const tmp = `${r.path}.feibo-undo-${(0, import_node_crypto2.randomBytes)(8).toString("hex")}`;
      await write.rename(import_node_path5.default.join(import_node_path5.default.dirname(r.path), name), tmp, base);
      await write.rename(tmp, import_node_path5.default.join(import_node_path5.default.dirname(r.path), r.orig.name), base);
    }
  };
  if (now && now.kind === r.orig.kind && sameState(now, r.orig)) {
    await respell();
  } else if (r.orig.kind === "dir") {
    await write.mkdir(r.path, base);
  } else if (r.orig.kind === "link") {
    await write.link(r.orig.target, r.path, r.orig.dir, base);
  } else if (r.orig.kind === "file") {
    await write.copy(import_node_path5.default.join(dir2, r.backup), r.path, base);
    await respell();
  }
}
async function undo(dir2, force = [], trash, permanent = trash === void 0) {
  const m = await read(dir2);
  const done = { restored: [], deleted: [], trashed: [], folders: [], skipped: [], left: [], failed: [] };
  if (!m) {
    return done;
  }
  const base = m.base;
  const forced = new Set(force.map((f) => pathKey2(f)));
  const assessed = await assess(m);
  assessed.filter((a) => a.unsafe).forEach((a) => done.left.push({ path: a.r.path, reason: THROUGH_LINK }));
  const all = assessed.filter((a) => a.needs);
  const leave = all.filter((a) => a.changed && !forced.has(pathKey2(a.r.path)));
  const left = (p) => leave.some((a) => inside2(p, a.r.path));
  leave.forEach((a) => done.skipped.push(a.r.path));
  const todo = all.filter((a) => !leave.includes(a) && !left(a.r.path));
  const held = /* @__PURE__ */ new Set();
  const kept = new Set(m.recs.map((r) => pathKey2(r.path)));
  const trouble = (r, e) => {
    if (e instanceof ThroughLink) {
      done.left.push({ path: r.path, reason: THROUGH_LINK });
    } else {
      done.failed.push({ path: r.path, error: e?.message ?? String(e) });
    }
    held.add(pathKey2(r.path));
  };
  const caseOnly = (a) => !!a.now && a.now.kind === a.r.orig.kind && sameState(a.now, a.r.orig);
  const wrong = todo.filter((x) => x.now && x.now.kind !== "none" && !caseOnly(x) && (x.now.kind !== x.r.orig.kind || x.now.kind === "link"));
  for (const a of wrong.sort((x, y) => depth(y.r.path) - depth(x.r.path))) {
    try {
      if (a.now.kind === "dir") {
        const rest = await import_node_fs4.promises.readdir(a.r.path);
        if (rest.length) {
          rest.map((n) => import_node_path5.default.join(a.r.path, n)).filter((p) => !kept.has(pathKey2(p))).forEach((p) => done.left.push({ path: p, reason: NOT_THE_TASKS }));
          held.add(pathKey2(a.r.path));
          continue;
        }
      }
      if (a.now.kind !== "dir" && !(a.r.wrote && sameState(a.now, a.r.wrote))) {
        done.left.push({ path: a.r.path, reason: REPLACED });
        held.add(pathKey2(a.r.path));
        continue;
      }
      const file = a.now.kind === "file";
      if (!trash && file && !permanent) {
        throw new Error(NO_BIN);
      }
      if (trash && (file || a.r.trash)) {
        if (await safeTarget(a.r.path, base)) {
          try {
            await trash(a.r.path);
            done.trashed.push(a.r.path);
          } catch (e) {
            if (!permanent) {
              throw new Error(`${TRASH_FAILED}\uFF08${e?.message ?? e}\uFF09\uFF0C\u6CA1\u6709\u5220\u9664`);
            }
            await write.remove(a.r.path, a.now, base);
          }
        } else {
          await write.remove(a.r.path, a.now, base);
        }
      } else {
        await write.remove(a.r.path, a.now, base);
      }
      if (a.r.orig.kind === "none") {
        done.deleted.push(a.r.path);
        if (!file) {
          done.folders.push(a.r.path);
        }
      }
    } catch (e) {
      trouble(a.r, e);
    }
  }
  const heldUp = (p) => [...held].some((h) => {
    const k = pathKey2(p);
    return k === h || k.startsWith(h + import_node_path5.default.sep);
  });
  const back = todo.filter((x) => x.r.orig.kind !== "none" && !heldUp(x.r.path));
  for (const a of [...back.filter((x) => x.r.orig.kind !== "file").sort((x, y) => depth(x.r.path) - depth(y.r.path)), ...back.filter((x) => x.r.orig.kind === "file")]) {
    try {
      await putBack(dir2, a.r, await stateOf2(a.r.path) ?? a.now, base);
      done.restored.push(a.r.path);
    } catch (e) {
      trouble(a.r, e);
    }
  }
  const unsafeBefore = new Set(assessed.filter((a) => a.unsafe).map((a) => pathKey2(a.r.path)));
  const still = new Set((await assess(m)).filter((a) => a.needs || a.unsafe && unsafeBefore.has(pathKey2(a.r.path))).map((a) => pathKey2(a.r.path)));
  if (!still.size) {
    (0, import_node_fs4.rmSync)(dir2, { recursive: true, force: true });
  } else {
    m.recs = m.recs.filter((r) => still.has(pathKey2(r.path)));
    await import_node_fs4.promises.writeFile(import_node_path5.default.join(dir2, MANIFEST), JSON.stringify(m)).catch(() => void 0);
  }
  return done;
}
function cleanup(root, now = Date.now()) {
  let n = 0;
  for (const name of (0, import_node_fs4.existsSync)(root) ? (0, import_node_fs4.readdirSync)(root) : []) {
    const p = import_node_path5.default.join(root, name);
    let at = (0, import_node_fs4.statSync)(p, { throwIfNoEntry: false })?.mtimeMs ?? now;
    try {
      const m = JSON.parse((0, import_node_fs4.readFileSync)(import_node_path5.default.join(p, MANIFEST), "utf8"));
      at = Date.parse(m.endedAt ?? m.createdAt) || at;
    } catch {
    }
    if (at < now - KEEP_DAYS * 24 * 3600 * 1e3) {
      (0, import_node_fs4.rmSync)(p, { recursive: true, force: true });
      n++;
    }
  }
  return n;
}
