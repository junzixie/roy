/**
 * 内置程序化动态壁纸
 *
 * 几 KB 的片元着色器，代替几 MB 的视频：随安装包内置、不联网、不占磁盘。
 * 着色器都是 Roy 自己写的，不含第三方组件代码。
 *
 * 每个预设只需要实现 `vec3 scene(vec2 uv, float t)`：uv 已按短边归一化（中心为 0），
 * t 是秒。亮色主题由公共尾部统一提亮成浅色版本，预设本身只管深色效果。
 */

export interface ProceduralWallpaper {
  id: string
  name: string
  description: string
  /** 配套侧栏底色（HSL 三元组），深色 / 浅色主题各一套，和壁纸连成一体 */
  sidebar: { dark: string; light: string }
  /** 设置页缩略图（CSS 背景），不用起 WebGL */
  thumb: string
  /** 片元着色器主体，必须定义 scene(uv, t) */
  scene: string
}

const COMMON = /* glsl */ `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_light;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
`

const MAIN = /* glsl */ `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec3 col = clamp(scene(uv, u_time), 0.0, 1.0);
  // 亮色主题：压成浅色粉彩，保持同样的流动感
  vec3 light = mix(vec3(0.965, 0.962, 0.975), col, 0.32) + col * 0.08;
  col = mix(col, light, u_light);
  // 轻微颗粒，避免大面积渐变出现色带
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

export const PROCEDURAL_WALLPAPERS: ProceduralWallpaper[] = [
  {
    id: 'aurora-silk',
    name: '极光丝带',
    description: '几条半透明光带缓慢起伏，蓝绿到紫',
    sidebar: { dark: '205 45% 10%', light: '190 32% 93%' },
    thumb: 'radial-gradient(120% 80% at 20% 30%, #1d6f8a 0%, transparent 55%), radial-gradient(90% 70% at 80% 60%, #5b3aa8 0%, transparent 60%), linear-gradient(160deg, #070b18, #0b1426)',
    scene: /* glsl */ `
vec3 scene(vec2 uv, float t) {
  vec3 col = mix(vec3(0.02, 0.03, 0.07), vec3(0.03, 0.06, 0.12), uv.y + 0.5);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float speed = 0.05 + fi * 0.015;
    float y = 0.18 * sin(uv.x * (1.2 + fi * 0.35) + t * speed * 6.0 + fi * 1.7)
            + 0.08 * (fbm(vec2(uv.x * 1.5 + t * speed, fi * 3.1)) - 0.5) * 2.0
            + (fi - 1.5) * 0.14;
    float d = abs(uv.y - y);
    float band = exp(-d * d * (90.0 + fi * 30.0));
    float glow = exp(-d * 7.0) * 0.18;
    vec3 tint = mix(vec3(0.10, 0.75, 0.70), vec3(0.50, 0.30, 0.95), fi / 3.0);
    col += tint * (band * 0.55 + glow);
  }
  col *= 1.0 - 0.35 * length(uv * vec2(0.8, 1.0));
  return col;
}`,
  },
  {
    id: 'nebula-drift',
    name: '星云漂流',
    description: '层层扭曲的云气慢慢流动，紫粉暖调',
    sidebar: { dark: '285 32% 11%', light: '300 28% 94%' },
    thumb: 'radial-gradient(70% 60% at 35% 40%, #a8467a 0%, transparent 60%), radial-gradient(60% 60% at 70% 65%, #c9733a 0%, transparent 55%), linear-gradient(140deg, #0d0716, #1a0b22)',
    scene: /* glsl */ `
vec3 scene(vec2 uv, float t) {
  vec2 p = uv * 1.6;
  vec2 q = vec2(fbm(p + t * 0.03), fbm(p + vec2(5.2, 1.3) - t * 0.025));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.02), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 3.0 * r);
  vec3 col = mix(vec3(0.05, 0.02, 0.09), vec3(0.45, 0.12, 0.38), clamp(f * f * 2.2, 0.0, 1.0));
  col = mix(col, vec3(0.85, 0.42, 0.20), clamp(length(q) * 0.55 - 0.15, 0.0, 1.0) * 0.6);
  col = mix(col, vec3(0.30, 0.25, 0.75), clamp(r.x * 0.9 - 0.3, 0.0, 1.0) * 0.5);
  col *= 0.35 + 0.85 * f;
  // 稀疏星点，极慢闪烁
  vec2 g = floor(uv * 90.0);
  float s = step(0.996, hash(g)) * (0.5 + 0.5 * sin(t * 0.8 + hash(g + 3.0) * 6.28));
  col += s * 0.5;
  return col;
}`,
  },
  {
    id: 'horizon-glow',
    name: '晨昏地平线',
    description: '远处地平线的光晕和缓缓推进的透视网格',
    sidebar: { dark: '320 28% 10%', light: '18 45% 94%' },
    thumb: 'linear-gradient(180deg, #0a0c1c 0%, #1b1640 45%, #e0794a 52%, #2a1630 56%, #07060f 100%)',
    scene: /* glsl */ `
vec3 scene(vec2 uv, float t) {
  float h = -0.05;
  vec3 sky = mix(vec3(0.10, 0.08, 0.25), vec3(0.02, 0.03, 0.08), clamp((uv.y - h) * 1.8, 0.0, 1.0));
  float sun = exp(-pow(length((uv - vec2(0.0, h)) * vec2(0.55, 2.4)), 2.0) * 6.0);
  sky += vec3(0.95, 0.45, 0.25) * sun * 0.9;
  sky += vec3(0.9, 0.5, 0.6) * exp(-abs(uv.y - h) * 22.0) * 0.35;
  if (uv.y > h) return sky + (fbm(vec2(uv.x * 2.0 + t * 0.01, uv.y * 6.0)) - 0.5) * 0.03;
  // 地面：透视网格向观察者缓慢推进
  float depth = 0.12 / (h - uv.y + 0.001);
  vec2 g = vec2(uv.x * depth * 1.2, depth + t * 0.35);
  vec2 cell = abs(fract(g) - 0.5);
  float line = smoothstep(0.47, 0.5, max(cell.x, cell.y));
  float fade = exp(-depth * 0.18);
  vec3 ground = vec3(0.03, 0.02, 0.06) + vec3(0.65, 0.30, 0.55) * line * fade * 0.55;
  ground += vec3(0.95, 0.45, 0.25) * exp(-(h - uv.y) * 9.0) * 0.25;
  return ground;
}`,
  },
]

export function getProceduralWallpaper(id: string | undefined): ProceduralWallpaper | undefined {
  return PROCEDURAL_WALLPAPERS.find((item) => item.id === id)
}

export function buildProceduralShader(item: ProceduralWallpaper): string {
  return `${COMMON}\n${item.scene}\n${MAIN}`
}
