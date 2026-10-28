// @ts-nocheck — faithful port of jarvis-ball.js; keep shaders/math identical
/**
 * AIWorkstation jarvis-ball WebGL 粒子球（原样移植为 ES module）。
 * 来源：D:\\ai-projects\\aixiangmu\\ai-workstation\\app\\renderer\\jarvis-ball.js
 * Fibonacci + 团簇筛点 + 顶点着色呼吸/涡流/音量扩散；约 15000 点。
 */

	const VS = `
	precision highp float;
	attribute vec3 aPos;
	attribute float aSeed;
	attribute float aSize;
	attribute float aBright;

	uniform float uTime;
	uniform float uLevel;      // 0..1 音量
	uniform float uState;      // 0 idle 1 listening 2 thinking 3 speaking
	uniform float uDpr;
	uniform vec2  uRes;        // 画布像素尺寸
	uniform float uRadius;
	uniform vec2  uTilt;       // 鼠标视差
	uniform float uSpin;       // 自转角
	uniform float uShape;      // 0 球体 1 星环 2 能量核心

	varying float vBright;
	varying float vDepth;
	varying float vSeed;
	varying float vCore;

	mat3 rotY(float a){ float c=cos(a),s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
	mat3 rotX(float a){ float c=cos(a),s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
	mat3 rotZ(float a){ float c=cos(a),s=sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }

	void main(){
		float t = uTime;
		vec3 p = aPos;

		// 呼吸：整体半径轻微起伏，各点相位不同，避免整球一起缩放
		float breath = 1.0 + 0.022 * sin(t * 0.9 + aSeed * 6.2831);

		// 涡流：沿球面切向缓慢流动（用点自身相位偏移角度，形成团块漂移）
		float swirl = 0.06 * sin(t * 0.55 + aSeed * 12.0);
		float spin = uSpin + swirl;
		// 球体和核心绕 Y 轴转；星环在屏幕平面里转，始终是一个完整的环
		p = (uShape > 0.5 && uShape < 1.5) ? rotZ(spin) * p : rotY(spin) * p;

		// 聆听：音量越大，粒子沿法线外扩越明显，并带一层呼吸脉冲
		float listen = uLevel * (0.16 + 0.06 * sin(t * 7.0 + aSeed * 20.0));
		// 思考：高频细颤，形成"运算中"的碎光
		float think = step(1.5, uState) * step(uState, 2.5) * 0.05 * sin(t * 14.0 + aSeed * 30.0);
		// 说话：向外扩散的环形波
		float speak = step(2.5, uState) * 0.10 * sin(t * 5.0 - length(aPos) * 9.0 + aSeed * 3.0);

		float r = uRadius * breath * (1.0 + listen + think + speak);
		vec3 pos = p * r;

		pos = rotX(uTilt.y * 0.35) * rotY(uTilt.x * 0.5) * pos;

		// 标准透视：相机在 z = +3.4 处看原点，45° 视场
		float zdist = 3.4;
		float f = 2.4142;                  // 1 / tan(22.5°)
		float aspect = uRes.x / max(uRes.y, 1.0);
		float zview = zdist - pos.z;       // 相机前方为正
		float persp = f / zview;

		gl_Position = vec4(persp * pos.x / aspect, persp * pos.y, 0.0, 1.0);
		// 点径随视口高度缩放，保证大屏小屏观感一致
		gl_PointSize = aSize * persp * (uRes.y / 380.0) * (1.0 + uLevel * 0.3);

		vDepth = 3.4 / max(zview, 0.001);  // 1 = 球心，>1 = 靠近相机
		vCore = exp(-dot(pos.xy, pos.xy) * 1.9);   // 投影中心的光核
		vSeed = aSeed;
		vBright = aBright;
	}
	`;

	const FS = `
	precision highp float;
	uniform float uTime;
	uniform float uLevel;
	uniform float uState;
	uniform float uLight;     // 1 = 浅色主题（普通混合，避免加性光在白底上看不见）
	uniform vec3  uColorA;   // 深青绿
	uniform vec3  uColorB;   // 亮青
	uniform vec3  uColorC;   // 冷白高光

	varying float vBright;
	varying float vDepth;
	varying float vSeed;
	varying float vCore;

	void main(){
		vec2 d = gl_PointCoord - 0.5;
		float dist = length(d) * 2.0;
		if (dist > 1.0) discard;
		float core = pow(1.0 - dist, 1.5);

		// 颜色：按亮度在深青绿 → 亮青 → 冷白之间插值
		vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.75, vBright));
		col = mix(col, uColorC, smoothstep(0.72, 1.0, vBright) * 0.85);

		// 深度衰减：球体背面更暗
		float depthFade = clamp(vDepth * 1.05, 0.45, 1.15);

		// 闪烁：每个点自己的呼吸
		float twinkle = 0.72 + 0.28 * sin(uTime * 2.1 + vSeed * 40.0);

		float alpha = core * twinkle * depthFade * 0.95;
		alpha *= 0.62 + vBright * 0.85 + vCore * 1.35;
		alpha *= mix(1.0, 1.15, uLight);
		gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
	}
	`;

	const STATE = { idle: 0, listening: 1, thinking: 2, speaking: 3 };

	function compile(gl, type, src) {
		const sh = gl.createShader(type);
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
			console.error("[jarvis-ball] shader error:", gl.getShaderInfoLog(sh));
			return null;
		}
		return sh;
	}

	// 球面均匀分布（Fibonacci）
	function fibonacciPoint(i, n) {
		const y = 1 - (i / (n - 1)) * 2;
		const r = Math.sqrt(Math.max(0, 1 - y * y));
		const theta = i * 2.399963229728653;
		return [Math.cos(theta) * r, y, Math.sin(theta) * r];
	}

	function normalize(v) {
		const l = Math.hypot(v[0], v[1], v[2]) || 1;
		return [v[0] / l, v[1] / l, v[2] / l];
	}

	// 生成点云：Fibonacci 底 + 若干团簇密度加权，得到星云团块感
	function buildPoints(count, clusterCount, shape = "orb") {
		if (shape === "ring") {
			const out = [];
			for (let i = 0; i < count; i++) {
				const a = i * 2.399963229728653;
				const rad = 0.8 + (Math.random() - 0.5) * 0.12;
				const z = (Math.random() - 0.5) * 0.05;
				const seed = Math.random();
				const bright = Math.random() < 0.06 ? 0.88 + Math.random() * 0.12 : 0.2 + Math.random() * 0.55;
				const size = bright > 0.85 ? 3.0 + Math.random() * 2.4 : 1.5 + Math.random() * 1.8;
				out.push([Math.cos(a) * rad, Math.sin(a) * rad, z, seed, size, bright]);
			}
			return out;
		}
		if (shape === "core") {
			const out = [];
			for (let i = 0; i < count; i++) {
				const u = Math.random() * 2 - 1;
				const phi = Math.random() * Math.PI * 2;
				const s = Math.sqrt(Math.max(0, 1 - u * u));
				const dir = [s * Math.cos(phi), u, s * Math.sin(phi)];
				const halo = Math.random() < 0.05;
				const rad = halo ? 0.82 + Math.random() * 0.16 : 0.14 + 0.58 * Math.pow(Math.random(), 1.7);
				const seed = Math.random();
				const bright = Math.random() < 0.18 ? 0.9 + Math.random() * 0.1 : 0.35 + Math.random() * 0.5;
				const size = bright > 0.85 ? 3.0 + Math.random() * 2.2 : 1.4 + Math.random() * 1.7;
				out.push([dir[0] * rad, dir[1] * rad, dir[2] * rad, seed, size, bright]);
			}
			return out;
		}
		const clusters = [];
		for (let i = 0; i < clusterCount; i++) {
			const a = Math.random() * Math.PI * 2;
			const z = Math.random() * 2 - 1;
			const r = Math.sqrt(Math.max(0, 1 - z * z));
			clusters.push([Math.cos(a) * r, z, Math.sin(a) * r]);
		}
		const cs = 0.9 + Math.random() * 0.8; // 团簇紧实度
		const out = [];
		for (let i = 0; i < count; i++) {
			const base = fibonacciPoint(i, count);
			let nearest = 9;
			for (const c of clusters) {
				const dot = base[0] * c[0] + base[1] * c[1] + base[2] * c[2];
				const d = 1 - dot; // 0 表示重合
				if (d < nearest) nearest = d;
			}
			const accept = Math.exp(-nearest * 13.0 / cs) * 0.72 + 0.26;
			if (Math.random() > accept) continue;

			// 法向轻微抖动，让球壳有厚度
			const jitter = 1 + (Math.random() - 0.5) * 0.14;
			const seed = Math.random();
			const bright = Math.random() < 0.05 ? 0.9 + Math.random() * 0.1 : 0.22 + Math.random() * 0.5;
			const size = bright > 0.85 ? 3.2 + Math.random() * 2.8 : 1.7 + Math.random() * 2.0;
			out.push([base[0] * jitter, base[1] * jitter, base[2] * jitter, seed, size, bright]);
		}
		return out;
	}

	function createJarvisBallImpl(canvas, opts = {}) {
		const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
		if (!gl) {
			console.warn("[jarvis-ball] WebGL 不可用");
			return { setState() {}, setLevel() {}, destroy() {}, unsupported: true };
		}

		const vs = compile(gl, gl.VERTEX_SHADER, VS);
		const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error("[jarvis-ball] link error:", gl.getProgramInfoLog(prog));
			return { setState() {}, setLevel() {}, destroy() {}, unsupported: true };
		}
		gl.useProgram(prog);

		const count = opts.count || 15000;
		const clusters = opts.clusters || 11;
		let pts = buildPoints(count, clusters, opts.shape || "orb");
		let data = new Float32Array(pts.length * 6);
		pts.forEach((p, i) => data.set(p, i * 6));

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

		function upload(next) {
			pts = next;
			data = new Float32Array(pts.length * 6);
			pts.forEach((p, i) => data.set(p, i * 6));
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		}

		const stride = 6 * 4;
		const attrs = [
			["aPos", 3, 0],
			["aSeed", 1, 3 * 4],
			["aSize", 1, 4 * 4],
			["aBright", 1, 5 * 4],
		];
		for (const [name, size, offset] of attrs) {
			const loc = gl.getAttribLocation(prog, name);
			if (loc < 0) continue;
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
		}

		const U = {};
		for (const n of ["uTime", "uLevel", "uState", "uDpr", "uRes", "uRadius", "uTilt", "uSpin", "uShape", "uColorA", "uColorB", "uColorC", "uLight"]) {
			U[n] = gl.getUniformLocation(prog, n);
		}

		let hue = opts.hue ?? 219;
		let light = opts.theme === "light";
		function applyColors() {
			gl.uniform3fv(U.uColorA, hslToRgb(hue / 360, light ? 0.9 : 1.0, light ? 0.36 : 0.4));
			gl.uniform3fv(U.uColorB, hslToRgb(hue / 360, light ? 0.92 : 1.0, light ? 0.48 : 0.56));
			gl.uniform3fv(U.uColorC, hslToRgb(((hue + 16) % 360) / 360, light ? 0.62 : 0.55, light ? 0.62 : 0.86));
			gl.uniform1f(U.uLight, light ? 1 : 0);
			gl.blendFunc(gl.SRC_ALPHA, light ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
		}
		applyColors();
		gl.uniform1f(U.uRadius, opts.radius ?? 1.0);

		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		applyColors(); // 同时设置混合模式：深色加性辉光，浅色普通混合
		gl.clearColor(0, 0, 0, 0);

		const SHAPE = { orb: 0, ring: 1, core: 2 };
		const state = { name: "idle", shape: opts.shape || "orb", level: 0, targetLevel: 0, tiltX: 0, tiltY: 0, targetTiltX: 0, targetTiltY: 0, dragging: false, dragged: false, spin: 0, dpr: 1, raf: 0, last: 0 };
		gl.uniform1f(U.uShape, SHAPE[state.shape] ?? 0);
		const t0 = performance.now();

		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
			const w = canvas.clientWidth || canvas.width;
			const h = canvas.clientHeight || canvas.height;
			if (!w || !h) return;
			const nw = Math.round(w * dpr);
			const nh = Math.round(h * dpr);
			if (canvas.width !== nw || canvas.height !== nh) {
				canvas.width = nw;
				canvas.height = nh;
			}
			state.dpr = dpr;
			gl.viewport(0, 0, nw, nh);
			gl.uniform1f(U.uDpr, dpr);
			gl.uniform2f(U.uRes, nw, nh);
		}

		let visible = true;
		if (typeof IntersectionObserver === "function") {
			new IntersectionObserver((es) => (visible = es[0].isIntersecting), { threshold: 0 }).observe(canvas);
		}

		function frame(now) {
			state.raf = requestAnimationFrame(frame);
			if (!visible) return;
			resize();
			const t = (now - t0) / 1000;
			const dt = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0.016);
			state.last = now;

			// 自转：待机慢转，思考/说话时快一点；鼠标靠近时叠加一点跟手视差
			const st = STATE[state.name] ?? 0;
			const spinSpeed = 0.12 + st * 0.05 + state.level * 0.18;
			state.spin += dt * spinSpeed;

			// 视差阻尼：鼠标远了自动回正，不会一直甩着走
			state.tiltX += (state.targetTiltX - state.tiltX) * Math.min(1, dt * 6);
			state.tiltY += (state.targetTiltY - state.tiltY) * Math.min(1, dt * 6);

			// 音量平滑（上升快、回落慢，像真实电平表）
			const k = state.targetLevel > state.level ? 0.35 : 0.06;
			state.level += (state.targetLevel - state.level) * k;

			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform1f(U.uTime, t);
			gl.uniform1f(U.uLevel, state.level);
			gl.uniform1f(U.uState, STATE[state.name] ?? 0);
			gl.uniform2f(U.uTilt, state.tiltX, state.tiltY);
			gl.uniform1f(U.uSpin, state.spin);
			gl.uniform1f(U.uShape, SHAPE[state.shape] ?? 0);
			gl.drawArrays(gl.POINTS, 0, pts.length);
		}
		state.raf = requestAnimationFrame(frame);

		// 只有鼠标靠近球体时才跟手：距离越远影响越小，离开后回到自转
		function onMove(e) {
			if (state.dragging || state.dragged) return;
			const r = canvas.getBoundingClientRect();
			if (!r.width || !r.height) return;
			const half = Math.min(r.width, r.height) / 2;
			const dx = e.clientX - (r.left + r.width / 2);
			const dy = e.clientY - (r.top + r.height / 2);
			const d = Math.hypot(dx, dy) / half;
			const near = Math.max(0, Math.min(1, (1.25 - d) / 0.7));
			const infl = near * near * (3 - 2 * near);
			state.targetTiltX = (dx / half) * 0.85 * infl;
			state.targetTiltY = -(dy / half) * 0.85 * infl;
		}
		function resetTilt() {
			state.dragged = false;
			state.targetTiltX = 0;
			state.targetTiltY = 0;
		}
		function orbit(dx, dy) {
			state.dragging = true;
			state.dragged = true;
			state.targetTiltX += dx * 0.006;
			state.targetTiltY -= dy * 0.006;
			state.targetTiltY = Math.max(-2.6, Math.min(2.6, state.targetTiltY));
		}
		// 视差只挂在 canvas 上：小画布时若用 window，鼠标在芯片/输入框仍强扭球，自转会「打架」
		canvas.addEventListener("pointermove", onMove, { passive: true });
		canvas.addEventListener("pointerleave", resetTilt);
		window.addEventListener("blur", resetTilt);

		return {
			setState(name) {
				if (STATE[name] === undefined) return;
				state.name = name;
			},
			setDragging(on) {
				state.dragging = !!on;
			},
			orbit,
			resetTilt,
			setShape(name) {
				if (SHAPE[name] === undefined || name === state.shape) return;
				state.shape = name;
				upload(buildPoints(count, clusters, name));
			},
			setHue(h, theme) {
				if (Number.isFinite(h)) hue = h;
				if (theme === "light" || theme === "dark") light = theme === "light";
				applyColors();
			},
			setLevel(v) {
				state.targetLevel = Math.max(0, Math.min(1, v));
			},
			get state() {
				return state.name;
			},
			destroy() {
				cancelAnimationFrame(state.raf);
				canvas.removeEventListener("pointermove", onMove);
				canvas.removeEventListener("pointerleave", resetTilt);
				window.removeEventListener("blur", resetTilt);
				gl.deleteBuffer(buf);
				gl.deleteProgram(prog);
			},
		};
	}

	function hslToRgb(h, s, l) {
		const f = (n) => {
			const k = (n + h * 12) % 12;
			const a = s * Math.min(l, 1 - l);
			return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
		};
		return [f(0), f(8), f(4)];
	}


export type JarvisBallStateName = 'idle' | 'listening' | 'thinking' | 'speaking'
export type JarvisBallShape = 'orb' | 'ring' | 'core'

export type JarvisBallOptions = {
  hue?: number
  theme?: 'light' | 'dark'
  count?: number
  clusters?: number
  shape?: JarvisBallShape
  radius?: number
  maxDpr?: number
}

export type JarvisBallHandle = {
  setState(name: JarvisBallStateName): void
  setDragging(on: boolean): void
  orbit(dx: number, dy: number): void
  resetTilt(): void
  setShape(name: JarvisBallShape): void
  setHue(h: number, theme?: 'light' | 'dark'): void
  setLevel(v: number): void
  readonly state: string
  destroy(): void
  unsupported?: boolean
}

export function createJarvisBall(canvas: HTMLCanvasElement, opts: JarvisBallOptions = {}): JarvisBallHandle {
  return createJarvisBallImpl(canvas, opts) as JarvisBallHandle
}

// Rename inner factory
