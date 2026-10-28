// ../../packages/runtime/src/boundary.ts
var import_node_fs9 = require("node:fs");
var import_node_path11 = __toESM(require("node:path"), 1);
var caseless = process.platform === "win32" || process.platform === "darwin";
var LINK_IO = openIo({ lstatSync: import_node_fs9.lstatSync, statSync: import_node_fs9.statSync, readlinkSync: import_node_fs9.readlinkSync, realpathSync: import_node_fs9.realpathSync }, import_node_path11.default);
function realPath(p, real = import_node_fs9.realpathSync.native) {
  let at = import_node_path11.default.resolve(p);
  if (isNetworkPath(p) || isNetworkPath(at)) {
    return at;
  }
  const share = networkLink(at, LINK_IO);
  if (share) {
    return share;
  }
  const rest = [];
  for (; ; ) {
    try {
      const found = real(at);
      return rest.length ? import_node_path11.default.join(found, ...rest.reverse()) : found;
    } catch {
      const up = import_node_path11.default.dirname(at);
      if (up === at) {
        return import_node_path11.default.resolve(p);
      }
      rest.push(import_node_path11.default.basename(at));
      at = up;
    }
  }
}
var ProjectBoundary = class {
  dir;
  /** Allowed for the rest of the task: a place (that folder and below) and what may be done there. */
  places = [];
  /** Allowed for the next call only. */
  once = [];
  /** Allowed for the rest of the task, that path only (its place would be a drive's or a share's root). */
  exact = [];
  constructor(dir2) {
    this.dir = realPath(dir2);
  }
  allowed(u) {
    const same = (a, b) => within(a, b, caseless) && within(b, a, caseless);
    return [...this.once, ...this.exact].some((o) => o.op === u.op && same(o.path, u.path)) || this.places.some((p) => p.op === u.op && within(u.path, p.dir, caseless));
  }
  outside(uses) {
    const out = [];
    for (const u of uses) {
      const real = { op: u.op, path: realPath(u.path) };
      const share = isNetworkPath(u.path) || isNetworkPath(real.path);
      if ((share || !within(real.path, this.dir, caseless)) && !this.allowed(real) && !out.some((o) => o.op === real.op && o.path === real.path)) {
        out.push(real);
      }
    }
    return out;
  }
  allow(uses, scope) {
    for (const u of uses) {
      const real = { op: u.op, path: realPath(u.path) };
      if (scope === "once") {
        this.once.push(real);
        continue;
      }
      const share = isNetworkPath(u.path) || isNetworkPath(real.path);
      const dir2 = !share && (0, import_node_fs9.statSync)(real.path, { throwIfNoEntry: false })?.isDirectory() ? real.path : import_node_path11.default.dirname(real.path);
      if (share || import_node_path11.default.parse(dir2).root === dir2 || import_node_path11.default.parse(dir2).root === `${dir2}${import_node_path11.default.sep}`) {
        this.exact.push(real);
      } else {
        this.places.push({ op: real.op, dir: dir2 });
      }
    }
  }
  consume() {
    this.once = [];
  }
};
