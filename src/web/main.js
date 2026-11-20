// Browser demo: renders the tileset, runs the sim at 60fps, and exposes the generator.
import { buildTileset, atlasImage, toRGBA } from '../tileset/tileset.js';
import { THEMES, SLOTS, skyBands } from '../tileset/palette.js';
import { buildBackground, layoutBackground, HORIZON_ABOVE_GROUND } from '../tileset/background.js';
import { EXAMPLES } from '../level/examples.js';
import { generateLevel } from '../level/generator.js';
import { renderLevel, objectTile } from '../level/render.js';
import { Sim, PHYS } from '../engine/sim.js';
import { Bot } from '../engine/bot.js';
import { TILE as T } from '../core/units.js';
import { buildProps } from '../tileset/props.js';
import { CRT } from './crt.js';
import { HEAD } from './head.js';

const $ = (id) => document.getElementById(id);
const ts = buildTileset();
const atlasIdx = atlasImage(ts);
const VW = 25 * T, VH = Math.round((25 * T * 9) / 16), COLS = 25, ROWS = Math.ceil(VH / T);

function canvasFrom(w, h, rgba) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return c;
}
const atlases = {};
const atlasFor = (theme) => (atlases[theme] ||= canvasFrom(atlasIdx.w, atlasIdx.h, toRGBA(atlasIdx, theme)));
const propImgs = buildProps(), propCanvas = {};
const propFor = (theme, name, f = 0) => (propCanvas[`${theme}/${name}/${f}`] ||= canvasFrom(propImgs[name].w, propImgs[name].h, toRGBA(propImgs[name].frames[f], theme)));
const bgs = {};
function bgFor(theme) {
  if (!bgs[theme]) { const bg = buildBackground(theme); bgs[theme] = { bg, canvas: new Map(bg.layers.map((l) => [l, canvasFrom(l.w, l.h, toRGBA(l.img, theme))])) }; }
  return bgs[theme];
}
function drawBackground(level, cx, cy, frame) {
  const { bg, canvas } = bgFor(level.theme);
  // The backdrop is pinned to the screen: over the whole height of the level the horizon only
  // slides a fifth of the view, so tall levels keep their scenery wherever you climb or fall.
  const horizon = VH * (0.62 - 0.2 * (cy / Math.max(1, level.height * T - VH)));
  layoutBackground(bg, { camX: cx, horizon, frame, viewH: VH }, (l, sy, rows, dy, off) => {
    if (sy < 0) { // below the last strip: the foreground colour sinking into darkness in bands
      g.fillStyle = THEMES[level.theme].colors.bgNearD; g.fillRect(0, dy, VW, rows);
      for (let k = 1; k <= 5; k++) { g.fillStyle = `rgba(10,4,30,${0.16 * k})`; g.fillRect(0, dy + k * 26, VW, 27); }
      g.fillStyle = THEMES[level.theme].colors.ink; g.fillRect(0, dy + 156, VW, Math.max(0, rows - 156));
      return;
    }
    const c = canvas.get(l);
    if (l.once) { g.drawImage(c, 0, sy, l.w, rows, -off, dy, l.w, rows); return; }
    for (let x = -(((off % l.w) + l.w) % l.w); x < VW; x += l.w) g.drawImage(c, 0, sy, l.w, rows, x, dy, l.w, rows);
  });
}
// collision overlay sheet: solid pixels tinted (path A blue, path B pink, hazards red)
const overlay = (() => {
  const rgba = new Uint8ClampedArray(atlasIdx.w * atlasIdx.h * 4);
  for (let id = 1; id < ts.tiles.length; id++) {
    const t = ts.tiles[id]; if (!t.mask) continue;
    const col = t.path === 'A' ? [60, 160, 255] : t.path === 'B' ? [255, 90, 200] : t.kind === 'hazard' ? [255, 60, 60] : t.kind === 'oneway' ? [255, 220, 60] : [255, 255, 255];
    const ox = ((id - 1) % ts.columns) * T, oy = Math.floor((id - 1) / ts.columns) * T;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((t.mask[y] >>> x) & 1) rgba.set([...col, 150], ((oy + y) * atlasIdx.w + ox + x) * 4);
  }
  return canvasFrom(atlasIdx.w, atlasIdx.h, rgba);
})();

const state = { level: null, sim: null, bot: new Bot(), useBot: true, showCol: false, sheetTheme: 'meadow', cam: { x: 0, y: 0 }, wait: 0, idle: 0, keys: {}, phase: 'intro', phaseT: 0, score: 0, time: 0, tally: null };
const game = $('game'), g = game.getContext('2d');
// The canvas is K times the logical view: pixel art is scaled up crisply, while the player's
// photo and sphere are drawn smooth at the full resolution.
const K = 3;
game.width = VW * K; game.height = VH * K;
const headImg = new Image(); headImg.src = HEAD;

function load(level) {
  state.level = level; state.sim = new Sim(ts, level); state.bot = new Bot(); state.wait = 0; parts.length = 0; trail.length = 0;
  startAct();
  const p = state.sim.p;
  state.cam.x = p.x - VW / 2; state.cam.y = p.y - VH * 0.6;
  $('hudName').textContent = `${level.name} Zone, Act ${level.act || 1}`;
  const im = renderLevel(ts, level, level.theme, level.height > 40 ? 4 : 2), mini = $('mini');
  mini.width = im.w; mini.height = im.h;
  mini.getContext('2d').putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0);
}

// ---- squash and stretch ------------------------------------------------------------
// One springy value drives the morph: positive stretches the player along an axis, negative
// squashes it. Airborne speed sets the target, and landings, jumps and boosts kick it.
const morph = { v: 0, vel: 0, axis: 0, lean: 0, float: 0, wasJumping: false, wasGrounded: true };
function updateMorph(sim) {
  const p = sim.p, sp = Math.hypot(p.xsp, p.ysp) / T;
  for (const e of sim.events) { if (e.type === 'land') morph.vel -= 0.16; else if (e.type === 'boost') morph.vel += 0.12; else if (e.type === 'bop') morph.vel -= 0.1; }
  if (p.jumping && !morph.wasJumping) morph.vel += 0.11;                        // jump: spring upward
  if (!p.grounded && morph.wasGrounded && !p.jumping) morph.vel += 0.04;        // rolled off an edge
  morph.wasJumping = p.jumping; morph.wasGrounded = p.grounded;
  const target = p.grounded ? Math.min(0.07, (Math.abs(p.gsp) / T) * 0.12) : Math.min(0.2, sp * 0.3);
  morph.vel += (target - morph.v) * 0.22; morph.vel *= 0.7; morph.v = Math.max(-0.32, Math.min(0.3, morph.v + morph.vel));
  // stretch along the direction of travel in the air; along the surface when rolling; squash into the surface on impact
  const rad = (p.ang * Math.PI) / 180, want = p.grounded ? (morph.v < 0 ? -rad - Math.PI / 2 : -rad) : Math.atan2(p.ysp, p.xsp);
  let d = want - morph.axis; d = Math.atan2(Math.sin(2 * d), Math.cos(2 * d)) / 2; // an axis has no direction: turn the short way
  morph.axis += d * (p.grounded ? 0.5 : 0.3);
  const speed = (p.grounded ? p.gsp : p.xsp) / T;
  morph.lean += (Math.max(-0.2, Math.min(0.2, speed * 0.55)) - morph.lean) * 0.2;          // head leans into the run
  morph.float += ((p.grounded ? 0 : Math.max(-0.18, Math.min(0.18, -p.ysp / T * 0.5))) - morph.float) * 0.25; // and lags behind when falling or rising
}

// ---- particles: small visual effects driven by sim events ------------------------
const parts = [], trail = [];
function burst(x, y, n, color, speed, opt = {}) {
  for (let i = 0; i < n; i++) { const a = opt.up ? -Math.PI * (0.15 + 0.7 * Math.random()) : Math.random() * 2 * Math.PI, v = speed * (0.4 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opt.g ?? 0, life: opt.life ?? 24, max: opt.life ?? 24, size: opt.size ?? T / 8, color }); }
}
function effects(sim, level) {
  updateMorph(sim);
  const c = THEMES[level.theme].colors, u = T / 16;
  for (const e of sim.events) {
    state.score += { gem: 10, bop: 100, bonus: 50, brick: 10 }[e.type] || 0;
    if (e.type === 'gem') burst(e.x, e.y, 6, c.gemL, 2.2 * u, { life: 18 });
    else if (e.type === 'brick') burst(e.x, e.y, 8, c.brick, 4 * u, { up: true, g: 0.35 * u, life: 40, size: T / 5 });
    else if (e.type === 'bonus') parts.push({ x: e.x, y: e.y - T, vx: 0, vy: -3 * u, g: 0.2 * u, life: 26, max: 26, gem: true });
    else if (e.type === 'land') burst(e.x, e.y, 5, c.white, 1.6 * u, { up: true, life: 14, size: T / 6 });
    else if (e.type === 'bop') burst(e.x, e.y, 10, c.foeL, 3 * u, { life: 22, size: T / 6 });
    else if (e.type === 'boost') burst(e.x, e.y, 10, c.yellow, 4 * u, { life: 16 });
    else if (e.type === 'check') burst(e.x, e.y, 14, c.yellow, 3 * u, { up: true, g: 0.1 * u, life: 34 });
  }
  sim.events.length = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.x += q.vx; q.y += q.vy; q.vy += q.g; if (--q.life <= 0) parts.splice(i, 1); }
  const p = sim.p;
  trail.push({ x: p.x, y: p.y, fast: !p.dead && Math.abs(p.grounded ? p.gsp : p.xsp) > 0.5 * T });
  if (trail.length > 8) trail.shift();
}

// The player: a head riding upright inside a clear rolling sphere (the sphere turns, the head does not).
function drawPlayer(p, cx, cy) {
  const R = PHYS.r * 1.12, rad = (p.ang * Math.PI) / 180, lift = R - PHYS.r; // sphere is a little bigger than the hitbox: lift it so it rests on the surface
  const ball = (x, y, alpha) => { g.globalAlpha = alpha; g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.fillStyle = 'rgba(190,230,255,0.5)'; g.fill(); g.globalAlpha = 1; };
  trail.forEach((q, i) => { if (q.fast && i % 3 === 0 && i <= 5) ball(q.x - cx, q.y - cy - lift, 0.1 + i * 0.04); }); // speed afterimages
  g.save();
  g.translate(Math.round((p.x - cx - Math.sin(rad) * lift) * K) / K, Math.round((p.y - cy - Math.cos(rad) * lift) * K) / K);
  // squash/stretch about the morph axis, keeping volume, and keep the squashed side on the ground
  const sv = morph.v, along = 1 + sv, across = 1 / Math.sqrt(Math.max(0.5, along));
  if (p.grounded && sv < 0) g.translate(Math.sin(rad) * R * -sv * 0.9, Math.cos(rad) * R * -sv * 0.9);
  g.rotate(morph.axis); g.scale(along, across); g.rotate(-morph.axis);
  const glass = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.05, 0, 0, R);
  glass.addColorStop(0, 'rgba(255,255,255,0.42)'); glass.addColorStop(0.45, 'rgba(190,230,255,0.10)'); glass.addColorStop(1, 'rgba(110,180,255,0.32)');
  g.beginPath(); g.arc(0, 0, R, 0, 2 * Math.PI); g.fillStyle = glass; g.fill();
  g.save(); // head: upright to the surface, facing the way you move, with a little bob at speed
  if (p.grounded) g.rotate(-rad);
  if (p.face < 0) g.scale(-1, 1);
  const hr = R * 0.8, bob = Math.sin(p.spin * 2) * Math.min(1, Math.abs(p.gsp) / T) * 0.8 + morph.float * R;
  g.transform(1, 0, -morph.lean * p.face, 1, 0, 0);                              // shear: chin stays, crown leans
  g.scale(1 + Math.abs(morph.float) * 0.25 - sv * 0.15, 1 - Math.abs(morph.float) * 0.25 + sv * 0.15); // the head morphs a little on its own
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (headImg.complete && headImg.naturalWidth) g.drawImage(headImg, -hr, -hr + bob, hr * 2, hr * 2);
  g.imageSmoothingEnabled = false;
  g.restore();
  g.save(); // shell details turn with the roll
  g.rotate(p.spin);
  g.strokeStyle = 'rgba(255,255,255,0.34)'; g.lineWidth = 1;
  for (const tilt of [0, Math.PI / 2]) { g.beginPath(); g.ellipse(0, 0, R * 0.97, R * 0.3, tilt, 0, 2 * Math.PI); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + 0.39; g.beginPath(); g.arc(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84, 1, 0, 2 * Math.PI); g.fill(); }
  g.restore();
  g.beginPath(); g.arc(0, 0, R - 0.4, 0, 2 * Math.PI); g.strokeStyle = 'rgba(30,60,140,0.55)'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(0, 0, R - 1.3, 0, 2 * Math.PI); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.9; g.stroke();
  g.beginPath(); g.arc(0, 0, R * 0.8, -2.7, -1.85); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.4; g.lineCap = 'round'; g.stroke(); // glint
  g.restore();
}
let animTick = 0; // advances animated tiles (conveyors, acid)
function drawTile(sheet, id, x, y) { if (id && ts.tiles[id].frames) id += animTick % ts.tiles[id].frames; if (id) g.drawImage(sheet, ((id - 1) % ts.columns) * T, Math.floor((id - 1) / ts.columns) * T, T, T, x, y, T, T); }

function draw() {
  const { level, sim, cam } = state, p = sim.p, sheet = atlasFor(level.theme);
  animTick = Math.floor((sim.frame + state.idle) / 5);
  g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false;
  cam.x += (Math.max(0, Math.min(level.width * T - VW, p.x - VW * 0.42)) - cam.x) * 0.2;
  cam.y += (Math.max(0, Math.min(level.height * T - VH, p.y - VH * 0.58)) - cam.y) * 0.22;
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const bands = skyBands(level.theme), bh = Math.ceil(VH / bands.length); // banded sky, no smooth gradient
  bands.forEach((c, i) => { g.fillStyle = `rgb(${c})`; g.fillRect(0, i * bh, VW, bh); });
  drawBackground(level, cx, cy, sim.frame + state.idle);
  for (const q of level.props || []) { // big set pieces behind the terrain; sky ones bob gently
    const pr = propImgs[q.name];
    if (q.x + pr.w < cx || q.x > cx + VW) continue;
    g.drawImage(propFor(level.theme, q.name, pr.frames.length > 1 ? Math.floor((sim.frame + state.idle) / 5 + q.x) % pr.frames.length : 0), q.x - cx, q.y - cy + (pr.sky ? Math.round(Math.sin((sim.frame + state.idle) / 45 + q.x) * T * 0.2) : 0));
  }
  const x0 = Math.floor(cx / T), y0 = Math.floor(cy / T);
  for (let ty = y0; ty <= y0 + ROWS; ty++) for (let tx = x0; tx <= x0 + COLS; tx++) {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue;
    const i = ty * level.width + tx, X = tx * T - cx, Y = ty * T - cy;
    drawTile(sheet, level.decor[i], X, Y);
    const id = sim.terrain[i];
    if (!id) continue;
    drawTile(sheet, id, X, Y); // the player is always drawn over the loop, so the way in and out stays visible
  }
  for (const o of sim.objs) {
    if (!o.alive) continue;
    let name = objectTile(o);
    if (o.type === 'walker') name = `walker_${(sim.frame >> 3) & 1}`;
    else if (o.type === 'flyer') name = `flyer_${(sim.frame >> 2) & 1}`;
    else if (o.type === 'checkpoint') name = o.on ? 'check_on' : 'check_off';
    if (o.type === 'vent' && o.on) for (let k = 1; k <= 3; k++) drawTile(sheet, ts.names[`steam_${(k + (sim.frame >> 2)) % 3}`], o.x - cx, o.y - cy - k * T + ((sim.frame * 3) % T) - T / 2);
    if (o.type === 'crusher') { // rod down from the ceiling, head at the end
      const ext = Math.round(o.ext || 0);
      for (let y = -T; y < ext; y += T) drawTile(sheet, ts.names.crusher_rod, o.x - cx + T / 2, o.y - cy + Math.min(y, ext - T));
      drawTile(sheet, ts.names.crusher_head_0_0, o.x - cx, o.y - cy + ext - T); drawTile(sheet, ts.names.crusher_head_1_0, o.x - cx + T, o.y - cy + ext - T);
    }
    if (name) drawTile(sheet, ts.names[name], Math.round(o.x) - cx, o.y - cy + (o.type === 'gem' ? Math.round((T / 16) * Math.sin(sim.frame / 12 + o.x / T)) : 0));
  }
  if (!p.dead) drawPlayer(p, cx, cy);
  for (const q of parts) {
    g.globalAlpha = Math.min(1, (q.life / q.max) * 1.6);
    if (q.gem) drawTile(sheet, ts.names.gem, Math.round(q.x) - cx - T / 2, Math.round(q.y) - cy - T / 2);
    else { g.fillStyle = q.color; g.fillRect(Math.round(q.x - q.size / 2) - cx, Math.round(q.y - q.size / 2) - cy, q.size, q.size); }
  }
  g.globalAlpha = 1;
  if (state.showCol) for (let ty = y0; ty <= y0 + ROWS; ty++) for (let tx = x0; tx <= x0 + COLS; tx++) {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue;
    drawTile(overlay, sim.terrain[ty * level.width + tx], tx * T - cx, ty * T - cy);
  }
  if (p.dead) { g.fillStyle = 'rgba(27,22,48,.55)'; g.fillRect(0, VH / 2 - T, VW, 2 * T); label('TRY AGAIN', VW / 2, VH / 2 + 12, 34, '#fff', 'center'); }
  if (state.phase === 'intro') drawTitleCard(state.phaseT, state.level);
  if (state.phase === 'tally') drawTally(state.phaseT, state.level);
  $('hudScore').textContent = state.score;
  $('hudTime').textContent = `${Math.floor(state.time / 3600)}:${String(Math.floor(state.time / 60) % 60).padStart(2, '0')}`;
  $('hudGems').textContent = p.gems;
  $('hudSpeed').textContent = (Math.abs(p.grounded ? p.gsp : Math.hypot(p.xsp, p.ysp)) * (16 / T)).toFixed(1);
  $('hudAngle').textContent = Math.round(p.ang);
  $('hudPath').textContent = p.path;
  $('hudState').textContent = state.useBot ? 'bot playing' : 'you are playing';
  $('miniMark').style.left = `${(p.x / (level.width * T)) * 100}%`; $('miniMark').style.top = `${(p.y / (level.height * T)) * 100}%`;
}

// ---- act flow: title card -> play -> score tally -----------------------------------
const INTRO = { in: 26, hold: 112, out: 142 }; // frames: bands and text slide in, hold, slide away
function startAct() { Object.assign(state, { phase: 'intro', phaseT: 0, score: 0, time: 0, tally: null }); }
// bonus for finishing quickly, by seconds taken
const timeBonus = (frames) => { const s = frames / 60; for (const [limit, pts] of [[30, 50000], [45, 10000], [60, 5000], [90, 4000], [120, 3000], [180, 2000], [240, 1000], [300, 500]]) if (s < limit) return pts; return 0; };
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return 1 - (1 - t) ** 3; };
function label(text, x, y, size, color, align = 'left') { // heavy italic caps with a hard drop shadow
  g.font = `italic 700 ${size}px "Pixelify Sans", "Trebuchet MS", sans-serif`; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.fillStyle = '#140a2e'; g.fillText(text, x + size * 0.07, y + size * 0.07);
  g.fillStyle = color; g.fillText(text, x, y);
}
function saw(x0, y0, x1, y1, tooth, nx, ny) { // band edge cut into teeth, pointing along (nx, ny)
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / tooth);
  for (let i = 0; i < n; i++) { const ax = x0 + ((x1 - x0) * i) / n, ay = y0 + ((y1 - y0) * i) / n, bx = x0 + ((x1 - x0) * (i + 1)) / n, by = y0 + ((y1 - y0) * (i + 1)) / n; g.beginPath(); g.moveTo(ax, ay); g.lineTo((ax + bx) / 2 + nx * tooth * 0.6, (ay + by) / 2 + ny * tooth * 0.6); g.lineTo(bx, by); g.fill(); }
}
// Title card: a blue field drops in, a red band slides down the left, a yellow band slides in
// along the bottom, and the zone name, "ZONE" and the act number fly in; then it all leaves.
function drawTitleCard(t, level) {
  const a = ease(t / INTRO.in), o = ease((t - INTRO.hold) / (INTRO.out - INTRO.hold)), k = a * (1 - o); // k: 0 off-screen, 1 in place
  g.fillStyle = '#1c2cd0'; g.fillRect(0, -VH * o, VW, VH * (t < INTRO.hold ? a : 1));
  const bx = -230 * (1 - k); g.fillStyle = '#e4203a'; g.fillRect(bx, 0, 200, VH); saw(bx + 200, 0, bx + 200, VH, 30, 1, 0);
  const yx = VW * (1 - k); g.fillStyle = '#ffd21e'; g.fillRect(yx, 330, VW, 120); saw(yx, 330, yx + VW, 330, 30, 0, -1);
  label('SUPER MB', bx + 22, 44, 22, '#fff');
  const tx = VW - 30 + 700 * (1 - ease((t - 6) / INTRO.in) * (1 - o));
  label(level.name.toUpperCase(), tx, 196, 60, '#fff', 'right');
  label('ZONE', VW - 30 + 700 * (1 - ease((t - 14) / INTRO.in) * (1 - o)), 258, 46, '#fff', 'right');
  const ay = 392 + 200 * (1 - ease((t - 20) / INTRO.in) * (1 - o));
  g.fillStyle = '#140a2e'; g.beginPath(); g.arc(404, ay + 4, 50, 0, 2 * Math.PI); g.fill();
  g.fillStyle = '#e4203a'; g.beginPath(); g.arc(400, ay, 50, 0, 2 * Math.PI); g.fill();
  label('ACT', 400, ay - 14, 20, '#ffd21e', 'center'); label(String(level.act || 1), 400, ay + 34, 50, '#fff', 'center');
}
// Score tally: heading and rows slide in, then the bonuses drain into the total.
function drawTally(t, level) {
  const y = state.tally, row = (i) => ease((t - 30 - i * 10) / 22);
  const hx = (1 - ease(t / 24)) * VW;
  g.fillStyle = `rgba(20,10,46,${0.5 * ease(t / 24)})`; g.fillRect(0, 70, VW, 300); // dim the scene behind the figures
  label('YOU', VW / 2 - 150 - hx, 118, 40, '#ffd21e', 'center'); label('GOT THROUGH', VW / 2 + 60 + hx, 118, 40, '#fff', 'center');
  label(`${level.name.toUpperCase()} ZONE  ACT ${level.act || 1}`, VW / 2 - hx, 164, 30, '#fff', 'center');
  [['TIME BONUS', y.time], ['GEM BONUS', y.gems], ['TOTAL', y.total]].forEach(([name, v], i) => {
    const yy = 240 + i * 50 + (i === 2 ? 16 : 0), dx = (1 - row(i)) * VW;
    label(name, 210 - dx, yy, 30, '#ffd21e'); label(String(v), 600 + dx, yy, 30, '#fff', 'right');
  });
}
function tick() {
  const { sim, keys } = state, p = sim.p;
  if (state.phase === 'intro') { state.idle++; if (++state.phaseT >= INTRO.out) state.phase = 'play'; return; }
  if (p.won) { // tally: wait, count the bonuses into the total, hold, then start the act again
    state.idle++;
    if (state.phase !== 'tally') { state.phase = 'tally'; state.phaseT = 0; state.tally = { time: timeBonus(state.time), gems: p.gems * 100, total: state.score, done: 0 }; }
    const y = state.tally;
    if (++state.phaseT > 110) {
      const take = (key) => { const n = Math.min(y[key], 100); y[key] -= n; y.total += n; state.score = y.total; return n; };
      if (!take('time') && !take('gems') && !y.done) y.done = state.phaseT;
      if (y.done && state.phaseT > y.done + 170) { sim.reset(false); state.bot = new Bot(); trail.length = 0; startAct(); }
    }
    effects(sim, state.level);
    return;
  }
  if (p.dead) { state.idle++; if (++state.wait > 60) { sim.reset(true); state.bot = new Bot(); state.wait = 0; trail.length = 0; } effects(sim, state.level); return; }
  state.time++;
  sim.step(state.useBot ? state.bot.input(sim) : { left: keys.left, right: keys.right, jump: keys.jump });
  effects(sim, state.level);
}
let last = performance.now(), acc = 0;
function frame(now) {
  acc = Math.min(100, acc + now - last); last = now;
  while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; }
  draw();
  if (crt && state.crtOn) crt.render(crtSettings());
  requestAnimationFrame(frame);
}

// ---- CRT filter -------------------------------------------------------------------
let crt = null;
try { crt = new CRT($('crt'), game, [VW, VH]); } catch (err) { console.warn('CRT filter off:', err.message); }
state.crtOn = !!crt;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const crtSettings = () => ({ curve: +$('crtCurve').value, rf: +$('crtRf').value, composite: +$('crtComp').value, scan: +$('crtScan').value, glow: +$('crtGlow').value, persist: 0.2 + 0.6 * +$('crtGlow').value, mask: 0.85, maskType: +$('crtMask').value, calm });
function setCrt(on) {
  state.crtOn = on && !!crt;
  $('crt').hidden = !state.crtOn; game.hidden = state.crtOn;
  $('crtBtn').setAttribute('aria-pressed', state.crtOn); $('crtBtn').textContent = crt ? (state.crtOn ? 'CRT filter on' : 'CRT filter off') : 'CRT needs WebGL';
}
setCrt(true);
$('crtBtn').onclick = () => setCrt(!state.crtOn);
$('degauss').onclick = () => { if (crt) crt.degauss = 1.6; };
for (const id of ['crtCurve', 'crtRf', 'crtComp', 'crtScan', 'crtGlow']) $(id).addEventListener('input', () => { $(`${id}Out`).textContent = $(id).value; });

// ---- input ----------------------------------------------------------------------
function setBot(on) { state.useBot = on; state.bot = new Bot(); $('botBtn').setAttribute('aria-pressed', on); $('botBtn').textContent = on ? 'Bot is playing' : 'Let the bot play'; }
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyZ: 'jump', KeyW: 'jump' };
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.target.tagName === 'BUTTON' && e.code === 'Space') return;
  const k = KEYS[e.code];
  if (k) { state.keys[k] = true; if (state.useBot) setBot(false); e.preventDefault(); }
  else if (e.code === 'KeyR') state.sim.reset();
});
addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) state.keys[k] = false; });
for (const [id, k] of [['padL', 'left'], ['padR', 'right'], ['padJ', 'jump']]) {
  const b = $(id);
  const set = (v) => (e) => { e.preventDefault(); state.keys[k] = v; if (v && state.useBot) setBot(false); };
  b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false));
  b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
$('botBtn').onclick = () => setBot(!state.useBot);
$('colBtn').onclick = () => { state.showCol = !state.showCol; $('colBtn').setAttribute('aria-pressed', state.showCol); drawSheet(); };
$('restart').onclick = () => { state.sim.reset(); state.bot = new Bot(); startAct(); };
EXAMPLES.forEach((e, i) => { $(`lv${i}`).onclick = () => { load(e.build(ts)); showPieces(null); (state.crtOn ? $('crt') : game).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });

// ---- generator ------------------------------------------------------------------
const TALL_PIECES = new Set(['basement', 'tier2', 'tier3', 'tier4', 'springTower', 'wallLaunch', 'bigStairs', 'plunge', 'cascade', 'slalom', 'tallLoop']);
const FLOW_PIECES = new Set(['rollers', 'hill', 'loop', 'kicker', 'quarterPipe', 'sDrop', 'dropIn', 'speedway', 'doubleLoop', 'halfPipe', 'wave', 'loopKicker', 'rampJump', 'skyway']);
function showPieces(level) {
  const chips = $('chips'); chips.textContent = '';
  if (!level) { $('genNote').textContent = 'Hand-made level loaded. Generate to see the piece list for a seed.'; return; }
  for (const p of [...level.meta.pieces].sort((a, b) => a.x - b.x)) { const s = document.createElement('span'); s.className = `chip ${TALL_PIECES.has(p.piece) ? 'tall' : FLOW_PIECES.has(p.piece) ? 'flow' : 'block'}`; s.textContent = p.piece; s.title = `starts at tile ${p.x}`; chips.append(s); }
  const m = level.meta;
  $('genNote').textContent = `${level.name} Zone, ${m.style} layout: ${level.width} by ${level.height} tiles, ${m.pieces.length} pieces, ${THEMES[level.theme].label} theme. ` + (m.validated ? `Bot reached the goal by the high route and the low route${m.attempt ? ` (attempt ${m.attempt + 1})` : ''}.` : 'Bot could not finish this one.');
}
function generate() {
  const level = generateLevel(ts, { seed: Math.max(1, +$('seed').value || 1), flow: +$('flow').value, difficulty: +$('diff').value, length: +$('len').value, vertical: +$('vert').value, theme: $('theme').value || null, style: $('style').value || null });
  load(level); showPieces(level);
}
$('gen').onclick = () => { generate(); (state.crtOn ? $('crt') : game).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
$('rand').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 99999); generate(); };
for (const [id, out] of [['flow', 'flowOut'], ['diff', 'diffOut'], ['len', 'lenOut'], ['vert', 'vertOut']]) $(id).oninput = () => { $(out).textContent = $(id).value; };

// ---- tile sheet -----------------------------------------------------------------
const sheet = $('sheet'), SCALE = 1;
function drawSheet() {
  sheet.width = atlasIdx.w * SCALE; sheet.height = atlasIdx.h * SCALE;
  sheet.style.width = `${sheet.width}px`;
  const c = sheet.getContext('2d'); c.imageSmoothingEnabled = false;
  c.fillStyle = THEMES[state.sheetTheme].sky[1]; c.fillRect(0, 0, sheet.width, sheet.height);
  c.drawImage(atlasFor(state.sheetTheme), 0, 0, sheet.width, sheet.height);
  if (state.showCol) c.drawImage(overlay, 0, 0, sheet.width, sheet.height);
}
for (const t of Object.keys(THEMES)) $(`th-${t}`).onclick = () => { state.sheetTheme = t; for (const u of Object.keys(THEMES)) $(`th-${u}`).setAttribute('aria-pressed', u === t); drawSheet(); };
sheet.addEventListener('pointermove', (e) => {
  const r = sheet.getBoundingClientRect();
  const id = Math.floor((e.clientY - r.top) / (T * SCALE)) * ts.columns + Math.floor((e.clientX - r.left) / (T * SCALE)) + 1;
  const t = ts.tiles[id];
  if (!t) return;
  const names = Object.keys(ts.names).filter((n) => ts.names[n] === id);
  $('tileInfo').textContent = `#${id} ${names[0]}${names.length > 1 ? ` (+${names.length - 1} more uses)` : ''} · ${t.kind}${t.block ? ` · ${t.block}` : ''}${t.path ? ` · path ${t.path} only` : ''}${t.ang ? ` · angles floor/wall/ceiling/wall: ${t.ang.map((a) => (a == null ? '–' : a)).join(' / ')}` : ''}`;
});

load(EXAMPLES[0].build(ts));
showPieces(null);
setTimeout(generate, 60); // then swap in a tall generated level once the page has painted
drawSheet();
requestAnimationFrame(frame);
