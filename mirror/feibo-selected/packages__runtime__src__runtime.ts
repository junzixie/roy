// ../../packages/runtime/src/runtime.ts
var TOTAL_MAX = 8;
var DEFAULT_CONCURRENCY = 2;
function planLimit(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, TOTAL_MAX) : null;
}
function isLive(t2) {
  return !!t2 && ["queued", "running", "waiting", "paused"].includes(t2.status);
}
function hasRoom(awaiting, limit) {
  return awaiting.filter((w) => !w).length < limit && awaiting.length < TOTAL_MAX;
}
var AgentRuntime = class {
  constructor(opts) {
    this.opts = opts;
    this.log = opts.log ?? ((m) => console.log(`[feibo-agent] ${m}`));
    relaxFetchTimeouts();
    this.api = createApi({ baseUrl: opts.baseUrl, prefix: "/api/app/v1", store: opts.store, device: opts.device, onAuthLost: opts.onAuthLost });
    this.rt = new RealtimeClient(() => opts.baseUrl.replace(/^http/, "ws").replace(/\/+$/, "") + "/ws", () => opts.store.get()?.accessToken, void 0, () => this.api.refresh(), (m) => this.log(m));
    this.rt.useTickets(() => this.api.ws.ticket().then((r) => r.ticket));
    this.rt.appVersion = opts.device?.appVersion;
    this.rt.pingExtra = () => this.running.size ? { tasks: [...this.running.keys()] } : null;
    if (opts.screen) {
      this.watcher = new ScreenWatcher(this.api, opts.screen, () => this.deviceId, this.log);
    }
  }
  opts;
  api;
  rt;
  running = /* @__PURE__ */ new Map();
  waiting = [];
  seen = /* @__PURE__ */ new Set();
  started = false;
  offs = [];
  log;
  /** 盯消息 自动任务 run by this computer (#67). */
  watcher = null;
  /** Which run wrote which file: a run's 本次生成 never shows a file another run (e.g. a stopped one) wrote (#88). */
  claims = new FileClaims();
  /** T-215 第 3 批: the signed-in account's own folder for this computer's records of it (write logs) — none: no write log. */
  accountDir = null;
  /**
   * T-215 (问题单 #137 C-12): the account signed in now — its own default workspace (a folder of its own, design 第 5 节) and
   * its own folder for records; another account's runs never claimed files of this one. Before start(), at each sign-in.
   */
  /** The default workspace now (the signed-in account's own, T-215). */
  get workspace() {
    return this.opts.workspace;
  }
  setAccount(a) {
    if (a) {
      this.opts.workspace = a.workspace;
    }
    if ((a?.dir ?? null) !== this.accountDir) {
      this.claims = new FileClaims();
      this.reads = a?.dir ? new ReadList(readsDir(a.dir), this.log) : null;
      void this.reads?.prune();
    }
    this.accountDir = a?.dir ?? null;
  }
  /** T-221 第 2 批: the lists of files read, of this account (null: no account set). */
  reads = null;
  /** A conversation deleted (in this app): its list of files read goes too. */
  async forgetReads(conversationId) {
    await this.reads?.forget(conversationId);
  }
  get deviceId() {
    return this.opts.store.get()?.deviceId;
  }
  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.offs = [
      this.rt.onState((s) => {
        if (s === "open") {
          this.resume();
          this.running.forEach((r) => {
            r.supplied = true;
          });
          void this.watcher?.reload();
        }
        this.emit();
      }),
      this.rt.on("task.dispatch", (t2) => {
        if (t2.deviceId === this.deviceId) {
          this.accept(t2);
        }
      }),
      this.rt.on("task.control", (d) => this.control(d.taskId, d.action)),
      // Stopped on the server (停止 settles it there at once, #88): a run still going here ends too, even when its
      // task.control was missed (the socket was reconnecting at that moment).
      this.rt.on("task.updated", (u) => {
        if (u.status === "stopped") {
          this.running.get(u.id)?.abort.abort();
        }
      }),
      // intent done (「已经打开了」「好了」, #83): the step running now ends at once, the run wraps up after it.
      this.rt.on("task.supplement", (d) => {
        const r = this.running.get(d.taskId);
        if (r) {
          r.supplied = true;
          if (d.intent === "done") {
            r.done = true;
            r.toolAbort?.abort();
          }
        }
      }),
      this.rt.on("approval.pending", (d) => this.opts.onApproval?.({ kind: "pending", ...d })),
      this.rt.on("approval.reminder", (d) => this.opts.onApproval?.({ kind: "reminder", ...d })),
      this.rt.on("approval.result", (d) => {
        this.running.get(d.taskId)?.approvals.get(d.approvalId)?.({ allow: d.allow, scope: d.scope, grant: d.grant });
      }),
      // 〔撤销这次的文件改动〕 (T-013), from this app, the web or the phone: check first (what changed since), then undo.
      this.rt.on("task.undo", (d) => {
        this.undoInTurn(d.taskId, d.phase, d.force ?? [], !!d.permanent);
      }),
      // 盯消息 started, changed or stopped (here, on the web or the phone): followed at once.
      this.rt.on("automation.changed", () => {
        void this.watcher?.reload();
      }),
      // T#258a: the plan changed (bought, recharged, set by an admin, run out): how many may run at once asked again.
      this.rt.on("user.updated", () => {
        void this.refreshLimit();
      }),
      this.rt.on("session.revoked", () => {
        this.log("\u672C\u8BBE\u5907\u5DF2\u5728\u5176\u4ED6\u8BBE\u5907\u4E0A\u88AB\u79FB\u9664\uFF0C\u505C\u6B62\u8FD0\u884C");
        this.stop();
        this.opts.store.set(null);
        this.opts.onAuthLost?.();
      })
    ];
    this.rt.connect();
    this.log(`\u5DF2\u542F\u52A8\uFF0C\u8BBE\u5907 ${this.deviceId}\uFF0C\u5DE5\u4F5C\u76EE\u5F55 ${this.opts.workspace}`);
    if (this.opts.checkpointRoot) {
      try {
        const n = cleanup(this.opts.checkpointRoot);
        if (n) {
          this.log(`\u5DF2\u6E05\u7406 ${n} \u4E2A\u8D85\u8FC7 7 \u5929\u7684\u68C0\u67E5\u70B9`);
        }
        cleanupMoves(this.movesRoot);
      } catch {
      }
    }
  }
  stop() {
    this.started = false;
    this.offs.forEach((f) => f());
    this.offs = [];
    this.rt.close();
    this.watcher?.stopAll();
    for (const r of this.running.values()) {
      r.abort.abort();
    }
    this.emit();
  }
  /** Call after the access token changed (e.g. the UI refreshed it) so the socket uses it. */
  reconnect() {
    if (this.started) {
      this.rt.close();
      this.rt.connect();
    }
  }
  status() {
    const list2 = [...this.running.values()];
    return {
      connected: this.rt.state === "open",
      // T-215 第 5 批: waiting for the user's confirmation is said apart (the tray counts it).
      running: list2.map((r) => ({ id: r.task.id, prompt: r.task.prompt, status: r.held ? "paused" : r.approvals.size ? "waiting" : "running" })),
      queued: this.waiting.length,
      awaiting: list2.filter((r) => r.approvals.size > 0).length
    };
  }
  emit() {
    this.opts.onStatus?.(this.status());
  }
  /** After (re)connecting: pick up tasks that were dispatched while this computer was offline. */
  async resume() {
    const ranBefore = new Set(this.running.keys());
    const waitedBefore = new Set(this.waiting.map((w) => w.id));
    try {
      const mine = await this.api.devices.myTasks();
      const live = new Map(mine.map((t2) => [t2.id, t2]));
      for (const [id, r] of this.running) {
        if (ranBefore.has(id) && !live.has(id) || waitedBefore.has(id) && !isLive(live.get(id))) {
          r.abort.abort();
        }
      }
      const ended = this.waiting.filter((w) => waitedBefore.has(w.id) && !isLive(live.get(w.id)));
      if (ended.length) {
        this.waiting = this.waiting.filter((w) => !ended.includes(w));
        ended.forEach((w) => this.told.delete(w.id));
        this.log(`\u5DF2\u53BB\u6389 ${ended.length} \u4E2A\u79BB\u7EBF\u671F\u95F4\u88AB\u505C\u6B62\u7684\u6392\u961F\u4EFB\u52A1`);
        this.emit();
      }
      this.told.clear();
      this.tellPlaces();
      for (const t2 of mine) {
        if (this.running.has(t2.id) || this.waiting.some((w) => w.id === t2.id)) {
          continue;
        }
        if (t2.status === "queued") {
          this.accept(t2);
        } else if (!this.seen.has(t2.id)) {
          this.seen.add(t2.id);
          const up = new EventUploader(this.api, t2.id, this.log);
          await up.post("message", { content: "\u7535\u8111\u7AEF\u5E94\u7528\u5DF2\u91CD\u542F\uFF0C\u8FD9\u4E2A\u4EFB\u52A1\u5728\u6267\u884C\u4E2D\u88AB\u4E2D\u65AD\u3002\u4F60\u53EF\u4EE5\u91CD\u65B0\u53D1\u9001\u4EFB\u52A1\uFF0CFeiBo \u4F1A\u4ECE\u5934\u5F00\u59CB\u3002" });
          await up.post("status", { status: "failed", error: "\u7535\u8111\u7AEF\u5E94\u7528\u91CD\u542F\uFF0C\u4EFB\u52A1\u4E2D\u65AD" });
        }
      }
    } catch (e) {
      this.log(`\u540C\u6B65\u5F85\u6267\u884C\u4EFB\u52A1\u5931\u8D25\uFF1A${e.message}`);
    }
    await this.refreshLimit();
  }
  /**
   * A task this computer's own window just created for this computer: started at once, instead of after the server's
   * dispatch comes back over the socket (the dispatch then finds it running and is ignored).
   */
  offer(t2) {
    if (t2.deviceId && t2.deviceId === this.deviceId && ["queued", "running"].includes(t2.status)) {
      this.accept(t2);
    }
  }
  /** Room for one more: fewer working than the limit, and fewer than TOTAL_MAX in all (those waiting to be confirmed too). */
  canStart() {
    return hasRoom([...this.running.values()].map((r) => r.approvals.size > 0), this.opts.concurrency ?? this.limit);
  }
  /**
   * B#880: how many run at once — the server's for this account (by plan: /agent/config concurrency), DEFAULT_CONCURRENCY
   * until it says (or when it can't be asked); asked again at each (re)connection and when the plan changes (user.updated,
   * T#258a), so a plan bought counts from then.
   */
  limit = DEFAULT_CONCURRENCY;
  async refreshLimit() {
    try {
      const c = await this.api.request("/agent/config");
      const n = planLimit(c?.concurrency);
      if (n !== null) {
        this.limit = n;
        this.drain();
      }
    } catch {
    }
  }
  /** Starts what waits while there is room — and tells the ones still waiting where they are now (B#880). */
  drain() {
    let moved = false;
    while (this.started && this.waiting.length && this.canStart()) {
      const next = this.waiting.shift();
      this.told.delete(next.id);
      this.execute(next);
      moved = true;
    }
    if (moved) {
      this.tellPlaces();
    }
  }
  /** B#880: what each waiting task was last told (how many before it), so only a change is sent. */
  told = /* @__PURE__ */ new Map();
  /** B#880: each task waiting for a place told how many are before it, when that changed. */
  tellPlaces() {
    this.waiting.forEach((t2, ahead) => {
      if (this.told.get(t2.id) !== ahead) {
        void this.tellQueued(t2);
      }
    });
  }
  /**
   * T-215 第 5 批（第 135 份 C-01）: a task that waits for its turn says why on its card when it is runs waiting for the
   * user's confirmation that hold the places (「排队中：有 N 个任务在等你确认」〔前往处理〕) — never just 「正在思考」.
   */
  async tellQueued(t2) {
    const awaiting = [...this.running.values()].filter((r) => r.approvals.size > 0);
    const ahead = this.waiting.findIndex((w) => w.id === t2.id);
    if (ahead < 0) {
      return;
    }
    this.told.set(t2.id, ahead);
    const up = new EventUploader(this.api, t2.id, this.log);
    try {
      if (!awaiting.length) {
        await up.post("queue", { reason: "full", ahead, running: this.running.size });
        await up.flush();
        return;
      }
      const first = awaiting[0].task;
      await up.post("queue", { reason: "awaiting-approval", awaiting: awaiting.length, taskId: first.id, conversationId: first.conversationId, prompt: first.prompt.slice(0, 60) });
      await up.flush();
    } catch (e) {
      this.told.delete(t2.id);
      this.log(`\u544A\u8BC9\u6392\u961F\u539F\u56E0\u5931\u8D25\uFF1A${e.message}`);
    } finally {
      up.close();
    }
  }
  accept(t2) {
    if (this.seen.has(t2.id)) {
      return;
    }
    this.seen.add(t2.id);
    if (!this.canStart()) {
      this.waiting.push(t2);
      this.emit();
      void this.tellQueued(t2);
      return;
    }
    this.execute(t2);
  }
  control(taskId, action) {
    const r = this.running.get(taskId);
    if (!r) {
      const i = this.waiting.findIndex((w) => w.id === taskId);
      if (i >= 0 && action === "stop") {
        this.waiting.splice(i, 1);
        this.told.delete(taskId);
        this.emit();
        this.tellPlaces();
      }
      return;
    }
    this.log(`\u4EFB\u52A1 ${taskId.slice(0, 8)}\uFF1A${action}`);
    if (action === "stop") {
      r.abort.abort();
    } else if (action === "resume") {
      r.held = false;
      r.resume?.();
      r.resume = null;
    }
    this.emit();
  }
  /**
   * 〔撤销这次的文件改动〕 (T-013). check: what undo would do now, each file marked when changed again since the task
   * (event undo.check, for the card to ask about those); apply: undone (force: changed files the user chose to undo too;
   * event undo.done). The checkpoint is removed after undoing. A task still running is not undone.
   */
  /** The undos of one task, one at a time (a check and an apply, or a second click, never at once on its files). */
  undoing = /* @__PURE__ */ new Map();
  /** T-173: where the tasks' lists of moves are kept — beside the checkpoints (desktop: userData/moves). */
  get movesRoot() {
    return this.opts.checkpointRoot ? import_node_path14.default.join(import_node_path14.default.dirname(this.opts.checkpointRoot), "moves") : void 0;
  }
  undoInTurn(taskId, phase, force, permanent = false) {
    const next = (this.undoing.get(taskId) ?? Promise.resolve()).then(() => this.undo(taskId, phase, force, permanent)).catch(() => void 0);
    this.undoing.set(taskId, next);
    void next.then(() => {
      if (this.undoing.get(taskId) === next) {
        this.undoing.delete(taskId);
      }
    });
  }
  /** T#259: tasks whose undo couldn't move a file to the bin here — asked again, it says there is none (delete for good?). */
  binFailed = /* @__PURE__ */ new Set();
  /** T#259: the recycle bin here (asked each time: a Linux one may come or go), null when none. */
  /** fresh: undoing for real — the bin's settings asked again (T#260 评审), not as the check found them. */
  async bin(taskId, paths, fresh = false) {
    if (!this.opts.trash || this.binFailed.has(taskId)) {
      return null;
    }
    return this.opts.trashBin ? this.opts.trashBin(paths, fresh).catch(() => null) : "recycle";
  }
  async undo(taskId, phase, force, permanent = false) {
    if (this.running.has(taskId) || !this.opts.checkpointRoot) {
      return;
    }
    const dir2 = checkpointDir(this.opts.checkpointRoot, taskId);
    const up = new EventUploader(this.api, taskId, this.log);
    try {
      if (phase === "check") {
        const items = await plan(dir2);
        const bin = await this.bin(taskId, items.filter((i) => i.action === "delete").map((i) => i.path));
        await up.post("undo.check", items.length ? { items, bin } : { items, bin, error: "\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u6539\u52A8\uFF08\u68C0\u67E5\u70B9\u5DF2\u8FC7\u671F\u3001\u5DF2\u64A4\u9500\u6216\u5DF2\u6E05\u7406\uFF09" });
      } else if (phase === "moves") {
        const r = await undoMoves(this.movesRoot, taskId);
        this.log(`\u4EFB\u52A1 ${taskId.slice(0, 8)} \u5DF2\u64A4\u9500\u79FB\u52A8\uFF1A\u632A\u56DE ${r.back.length}\uFF0C\u5220\u9664\u7A7A\u6587\u4EF6\u5939 ${r.removed.length}\uFF0C\u6CA1\u64A4\u9500 ${r.skipped.length}`);
        await up.post("moves.undone", { ...r });
      } else if (phase === "apply") {
        const bin = await this.bin(taskId, (await plan(dir2)).filter((i) => i.action === "delete").map((i) => i.path), true);
        const r = await undo(dir2, force, bin ? this.opts.trash : null, permanent);
        if (r.failed.some((f) => f.error.startsWith(TRASH_FAILED))) {
          this.binFailed.add(taskId);
        }
        this.log(`\u4EFB\u52A1 ${taskId.slice(0, 8)} \u5DF2\u64A4\u9500\u6587\u4EF6\u6539\u52A8\uFF1A\u6062\u590D ${r.restored.length}\uFF0C\u5220\u9664 ${r.deleted.length}\uFF0C\u8DF3\u8FC7 ${r.skipped.length}\uFF0C\u5931\u8D25 ${r.failed.length}`);
        await up.post("undo.done", { ...r, bin });
      }
    } catch (e) {
      const missing = e.code === "ENOENT";
      await up.post(phase === "check" ? "undo.check" : phase === "moves" ? "moves.undone" : "undo.done", phase === "moves" ? { back: [], removed: [], skipped: [], kept: [], error: missing ? "\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u79FB\u52A8\uFF08\u5DF2\u64A4\u9500\uFF0C\u6216\u8D85\u8FC7 7 \u5929\u5DF2\u6E05\u7406\uFF09" : e.message } : { items: [], error: e.message }).catch(() => void 0);
    } finally {
      await up.flush();
      up.close();
    }
  }
  /** B#938: each conversation's project (and its folder) as last read in this run of the app. */
  places = /* @__PURE__ */ new Map();
  /** T-215: the project's folder, or the default workspace; a project folder that isn't here is said (taskRoot). */
  async workspaceFor(t2) {
    try {
      const conv = await this.api.conversations.get(t2.conversationId);
      if (!conv.projectId) {
        this.places.set(t2.conversationId, { projectId: null, dir: null });
        return { root: this.opts.workspace };
      }
      const projects = await this.api.projects.list();
      this.places.set(t2.conversationId, { projectId: conv.projectId, dir: projects.find((p) => p.id === conv.projectId)?.localDir?.trim() || null });
      return taskRoot(conv.projectId, projects, this.opts.workspace, import_node_fs12.existsSync);
    } catch (e) {
      const known = knownPlace(this.places.get(t2.conversationId), this.opts.workspace, import_node_fs12.existsSync);
      this.log(`\u8BFB\u53D6\u9879\u76EE\u76EE\u5F55\u5931\u8D25\uFF1A${e.message}${known ? `\uFF0C\u6309\u4E4B\u524D\u8BFB\u5230\u7684\u5DE5\u4F5C\u76EE\u5F55 ${known.root} \u7EE7\u7EED` : ""}`);
      return known ?? { root: this.opts.workspace, unknown: placeError(e) };
    }
  }
  async execute(t2) {
    const abort = new AbortController();
    const r = { task: t2, abort, held: false, resume: null, approvals: /* @__PURE__ */ new Map(), supplied: false, toolAbort: null };
    this.running.set(t2.id, r);
    this.emit();
    const up = new EventUploader(this.api, t2.id, this.log);
    r.up = up;
    const stopped = () => new Error("stopped");
    const ctl = {
      signal: abort.signal,
      halt: () => abort.abort(),
      supplied: () => {
        const v = r.supplied;
        r.supplied = false;
        return v;
      },
      toolSignal: () => {
        r.toolAbort = new AbortController();
        if (r.done) {
          r.toolAbort.abort();
        }
        return r.toolAbort.signal;
      },
      gate: async () => {
        if (abort.signal.aborted) {
          throw stopped();
        }
      },
      hold: async (info) => {
        if (abort.signal.aborted) {
          throw stopped();
        }
        r.held = true;
        this.emit();
        await up.post("status", { status: "paused", ...info }).catch(() => void 0);
        await new Promise((resolve, reject) => {
          r.resume = resolve;
          abort.signal.addEventListener("abort", () => reject(stopped()), { once: true });
        });
        r.resume = null;
        this.emit();
        await up.post("status", { status: "running" }).catch(() => void 0);
      },
      waitApproval: (approvalId, seq) => new Promise((resolve, reject) => {
        let done = false;
        const finish = (d) => {
          if (done) {
            return;
          }
          done = true;
          clearInterval(poll);
          r.approvals.delete(approvalId);
          this.emit();
          resolve(d);
        };
        r.approvals.set(approvalId, finish);
        this.emit();
        this.drain();
        const poll = setInterval(async () => {
          try {
            const evs = await this.api.tasks.events(t2.id, seq);
            const res = evs.find((e) => e.type === "approval.result" && e.payload?.approvalId === approvalId);
            if (res) {
              finish({ allow: !!res.payload.allow, scope: String(res.payload.scope ?? "once"), grant: res.payload.grant });
            }
          } catch {
          }
        }, 5e3);
        abort.signal.addEventListener("abort", () => {
          clearInterval(poll);
          r.approvals.delete(approvalId);
          if (!done) {
            done = true;
            reject(stopped());
          }
        }, { once: true });
      })
    };
    const place = await this.workspaceFor(t2);
    const root = place.root;
    this.log(`\u5F00\u59CB\u4EFB\u52A1 ${t2.id.slice(0, 8)}\u300C${t2.prompt.slice(0, 40)}\u300D\u5DE5\u4F5C\u76EE\u5F55 ${root}`);
    const checkpoint = this.opts.checkpointRoot ? new Checkpoint(this.opts.checkpointRoot, t2.id, void 0, root) : void 0;
    const moves = this.movesRoot ? new MoveRecorder(this.movesRoot, t2.id, root, import_node_path14.default.join(import_node_path14.default.dirname(this.opts.checkpointRoot), "sources")) : void 0;
    try {
      if (place.missing) {
        throw new Error(projectDirMissing(place.missing));
      }
      if (place.unknown) {
        throw new Error(place.unknown);
      }
      const toolEnv2 = await this.opts.toolEnv?.().catch((e) => {
        this.log(`\u51C6\u5907\u5185\u7F6E\u8FD0\u884C\u73AF\u5883\u5931\u8D25\uFF1A${e.message}`);
        return null;
      });
      const made2 = this.opts.madeFiles;
      const recordMade = made2 ? (task, files, snap) => {
        const s = snap;
        return made2.record({
          conversationId: task.conversationId,
          taskId: task.id,
          startedAt: s?.at ?? Date.now(),
          roots: s?.roots ?? [root],
          dirsBefore: s?.dirs,
          existedBefore: s ? new Set([...s.files.keys()].map((f) => import_node_path14.default.resolve(f).toLowerCase())) : void 0,
          complete: s?.complete,
          origKind: (p) => checkpoint?.origKind(p)
        }, files);
      } : void 0;
      const spilled = this.opts.spillRoot ? { ...nodePlatform, spill: spillAt(this.opts.spillRoot) } : nodePlatform;
      const { skillsRoot, skillLibsRoot } = this.opts;
      const base = skillsRoot ? { ...spilled, loadExtensions: (task, deps) => loadExtensions(task, { ...deps, skillsRoot, skillLibsRoot }) } : spilled;
      const run2 = runTask(t2, { platform: recordMade ? { ...base, recordMade } : base, api: this.api, baseUrl: this.opts.baseUrl, up, ctl, root, log: this.log, toolEnv: toolEnv2, browser: this.opts.browser?.forTask?.({ conversationId: t2.conversationId, taskId: t2.id }) ?? this.opts.browser, screen: this.opts.screen, computer: this.opts.computer, boundary: place.project ? new ProjectBoundary(root) : void 0, pdf: this.opts.pdf, video: this.opts.video, workspace: this.opts.workspace, openPath: this.opts.openPath, grantedRead: this.opts.grantedRead, claims: this.claims, checkpoint, moves, trash: this.opts.trash, writeLog: this.accountDir ? new WriteLog(writeLogFile(this.accountDir, t2.id), this.log) : void 0, reads: this.reads ?? void 0 });
      run2.catch(() => void 0);
      await Promise.race([run2, new Promise((_, reject) => {
        if (abort.signal.aborted) {
          reject(stopped());
        }
        abort.signal.addEventListener("abort", () => reject(stopped()), { once: true });
      })]);
      this.log(`\u4EFB\u52A1 ${t2.id.slice(0, 8)} \u5B8C\u6210`);
    } catch (e) {
      if (abort.signal.aborted) {
        this.log(`\u4EFB\u52A1 ${t2.id.slice(0, 8)} \u5DF2\u505C\u6B62`);
        await up.post("status", { status: "stopped" }).catch(() => void 0);
      } else {
        const net5 = classify(e);
        const reason = net5?.reason ?? e.message;
        this.log(`\u4EFB\u52A1 ${t2.id.slice(0, 8)} \u5931\u8D25\uFF1A${reason}${net5 ? `\uFF08${net5.raw}\uFF09` : ""}`);
        await up.post("message", { content: `\u4EFB\u52A1\u6267\u884C\u5931\u8D25\uFF1A${reason}` }).catch(() => void 0);
        const known = e;
        const code = net5?.code ?? (typeof known.code === "number" && known.code > 0 ? `E${known.code}` : typeof known.status === "number" && known.status > 0 ? `HTTP_${known.status}` : null);
        await up.post("status", {
          status: "failed",
          error: reason,
          step: e.step,
          detail: net5?.raw ?? e.message,
          ...code ? { errorCode: code } : {},
          ...net5 ? { retried: known.netRetries ?? 0 } : {}
        }).catch(() => void 0);
      }
      await up.flush();
    } finally {
      try {
        this.opts.browser?.taskEnded?.(t2.id);
      } catch (e) {
        this.log(`\u5173\u95ED\u4EFB\u52A1\u6253\u5F00\u7684\u7F51\u9875\u5931\u8D25\uFF1A${e.message}`);
      }
      if (checkpoint) {
        try {
          const end = await checkpoint.finish();
          if (end) {
            await up.post("checkpoint", end);
            await up.flush();
          }
        } catch (e) {
          this.log(`\u8BB0\u5F55\u68C0\u67E5\u70B9\u5931\u8D25\uFF1A${e.message}`);
        }
      }
      if (moves) {
        try {
          const list2 = await moves.finish();
          if (list2) {
            await up.post("moves", { ...list2 });
            await up.flush();
          }
        } catch (e) {
          this.log(`\u8BB0\u5F55\u79FB\u52A8\u6E05\u5355\u5931\u8D25\uFF1A${e.message}`);
        }
      }
      up.close();
      this.running.delete(t2.id);
      this.emit();
      this.drain();
    }
  }
};
