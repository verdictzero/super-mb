// Browser demo: renders the tileset, runs the sim at 60fps, and exposes the generator.
import { buildTileset, atlasImage, toRGBA } from '../tileset/tileset.js';
import { THEMES } from '../tileset/palette.js';
import { EXAMPLES } from '../level/examples.js';
import { generateLevel } from '../level/generator.js';
import { renderLevel, objectTile } from '../level/render.js';
import { Sim } from '../engine/sim.js';
import { Bot } from '../engine/bot.js';

const $ = (id) => document.getElementById(id);
const ts = buildTileset();
const atlasIdx = atlasImage(ts);
const VW = 400, VH = 225;

function canvasFrom(w, h, rgba) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return c;
}
const atlases = {};
const atlasFor = (theme) => (atlases[theme] ||= canvasFrom(atlasIdx.w, atlasIdx.h, toRGBA(atlasIdx, theme)));
// collision overlay sheet: solid pixels tinted (path A blue, path B pink, hazards red)
const overlay = (() => {
  const rgba = new Uint8ClampedArray(atlasIdx.w * atlasIdx.h * 4);
  for (let id = 1; id < ts.tiles.length; id++) {
    const t = ts.tiles[id]; if (!t.mask) continue;
    const col = t.path === 'A' ? [60, 160, 255] : t.path === 'B' ? [255, 90, 200] : t.kind === 'hazard' ? [255, 60, 60] : t.kind === 'oneway' ? [255, 220, 60] : [255, 255, 255];
    const ox = ((id - 1) % ts.columns) * 16, oy = Math.floor((id - 1) / ts.columns) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((t.mask[y] >> x) & 1) rgba.set([...col, 150], ((oy + y) * atlasIdx.w + ox + x) * 4);
  }
  return canvasFrom(atlasIdx.w, atlasIdx.h, rgba);
})();

const state = { level: null, sim: null, bot: new Bot(), useBot: true, showCol: false, sheetTheme: 'meadow', cam: { x: 0, y: 0 }, wait: 0, keys: {} };
const game = $('game'), g = game.getContext('2d');
g.imageSmoothingEnabled = false;

function load(level) {
  state.level = level; state.sim = new Sim(ts, level); state.bot = new Bot(); state.wait = 0;
  const p = state.sim.p;
  state.cam.x = p.x - VW / 2; state.cam.y = p.y - VH * 0.6;
  $('hudName').textContent = level.name;
  const im = renderLevel(ts, level), mini = $('mini');
  mini.width = im.w; mini.height = im.h;
  mini.getContext('2d').putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0);
}

function drawTile(sheet, id, x, y) { if (id) g.drawImage(sheet, ((id - 1) % ts.columns) * 16, Math.floor((id - 1) / ts.columns) * 16, 16, 16, x, y, 16, 16); }

function draw() {
  const { level, sim, cam } = state, p = sim.p, sheet = atlasFor(level.theme);
  cam.x += (Math.max(0, Math.min(level.width * 16 - VW, p.x - VW * 0.42)) - cam.x) * 0.2;
  cam.y += (Math.max(0, Math.min(level.height * 16 - VH, p.y - VH * 0.58)) - cam.y) * 0.12;
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const sky = g.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, THEMES[level.theme].sky[0]); sky.addColorStop(1, THEMES[level.theme].sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, VW, VH);
  const x0 = cx >> 4, y0 = cy >> 4, front = [];
  for (let ty = y0; ty <= y0 + 15; ty++) for (let tx = x0; tx <= x0 + 25; tx++) {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue;
    const i = ty * level.width + tx, X = tx * 16 - cx, Y = ty * 16 - cy;
    drawTile(sheet, level.decor[i], X, Y);
    const id = sim.terrain[i];
    if (!id) continue;
    // loop quarters the player is not on are drawn over them, so they pass behind
    if (ts.tiles[id].path && ts.tiles[id].path !== p.path && ts.tiles[id].path === 'A') front.push([id, X, Y]);
    else drawTile(sheet, id, X, Y);
  }
  for (const o of sim.objs) {
    if (!o.alive) continue;
    let name = objectTile(o);
    if (o.type === 'walker') name = `walker_${(sim.frame >> 3) & 1}`;
    if (name) drawTile(sheet, ts.names[name], Math.round(o.x) - cx, o.y - cy + (o.type === 'gem' ? Math.round(Math.sin((sim.frame + o.x) / 12)) : 0));
  }
  if (!p.dead) {
    const rolling = !p.grounded || Math.abs(p.gsp) > 4.5;
    const id = ts.names[rolling ? 'hero_roll' : 'hero'];
    g.save();
    g.translate(Math.round(p.x) - cx, Math.round(p.y) - cy);
    if (rolling) g.rotate(p.spin); else { g.rotate((-p.ang * Math.PI) / 180); if (p.face < 0) g.scale(-1, 1); }
    g.drawImage(sheet, ((id - 1) % ts.columns) * 16, Math.floor((id - 1) / ts.columns) * 16, 16, 16, -8, -8, 16, 16);
    g.restore();
  }
  for (const [id, X, Y] of front) drawTile(sheet, id, X, Y);
  if (state.showCol) for (let ty = y0; ty <= y0 + 15; ty++) for (let tx = x0; tx <= x0 + 25; tx++) {
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue;
    drawTile(overlay, sim.terrain[ty * level.width + tx], tx * 16 - cx, ty * 16 - cy);
  }
  if (p.won || p.dead) {
    g.fillStyle = 'rgba(27,22,48,.55)'; g.fillRect(0, 96, VW, 32);
    g.fillStyle = '#fff'; g.font = '700 16px "Pixelify Sans", sans-serif'; g.textAlign = 'center';
    g.fillText(p.won ? 'Goal!' : 'Try again', VW / 2, 118);
  }
  $('hudGems').textContent = p.gems;
  $('hudSpeed').textContent = Math.abs(p.grounded ? p.gsp : Math.hypot(p.xsp, p.ysp)).toFixed(1);
  $('hudAngle').textContent = Math.round(p.ang);
  $('hudPath').textContent = p.path;
  $('hudState').textContent = state.useBot ? 'bot playing' : 'you are playing';
  $('miniMark').style.left = `${(p.x / (level.width * 16)) * 100}%`;
}

function tick() {
  const { sim, keys } = state;
  if (sim.p.dead || sim.p.won) { if (++state.wait > (sim.p.won ? 150 : 60)) { sim.reset(); state.bot = new Bot(); state.wait = 0; } return; }
  sim.step(state.useBot ? state.bot.input(sim) : { left: keys.left, right: keys.right, jump: keys.jump });
}
let last = performance.now(), acc = 0;
function frame(now) {
  acc = Math.min(100, acc + now - last); last = now;
  while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; }
  draw();
  requestAnimationFrame(frame);
}

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
$('restart').onclick = () => { state.sim.reset(); state.bot = new Bot(); };
EXAMPLES.forEach((e, i) => { $(`lv${i}`).onclick = () => { load(e.build(ts)); showPieces(null); game.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });

// ---- generator ------------------------------------------------------------------
const FLOW_PIECES = new Set(['rollers', 'hill', 'loop', 'kicker', 'quarterPipe', 'sDrop', 'dropIn', 'speedway']);
function showPieces(level) {
  const chips = $('chips'); chips.textContent = '';
  if (!level) { $('genNote').textContent = 'Hand-made level loaded. Generate to see the piece list for a seed.'; return; }
  for (const p of level.meta.pieces) { const s = document.createElement('span'); s.className = `chip ${FLOW_PIECES.has(p.piece) ? 'flow' : 'block'}`; s.textContent = p.piece; s.title = `starts at tile ${p.x}`; chips.append(s); }
  const m = level.meta;
  $('genNote').textContent = `${level.width} tiles, ${m.pieces.length} pieces, ${THEMES[level.theme].label} theme. ` + (m.validated ? `Bot reached the goal in ${(m.botFrames / 60).toFixed(1)}s${m.attempt ? ` (attempt ${m.attempt + 1})` : ''}.` : 'Bot could not finish this one.');
}
function generate() {
  const level = generateLevel(ts, { seed: Math.max(1, +$('seed').value || 1), flow: +$('flow').value, difficulty: +$('diff').value, length: +$('len').value, theme: $('theme').value || null });
  load(level); showPieces(level);
}
$('gen').onclick = () => { generate(); game.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
$('rand').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 99999); generate(); };
for (const [id, out] of [['flow', 'flowOut'], ['diff', 'diffOut'], ['len', 'lenOut']]) $(id).oninput = () => { $(out).textContent = $(id).value; };

// ---- tile sheet -----------------------------------------------------------------
const sheet = $('sheet'), SCALE = 2;
function drawSheet() {
  sheet.width = atlasIdx.w * SCALE; sheet.height = atlasIdx.h * SCALE;
  sheet.style.width = `${sheet.width}px`;
  const c = sheet.getContext('2d'); c.imageSmoothingEnabled = false;
  c.fillStyle = THEMES[state.sheetTheme].sky[0]; c.fillRect(0, 0, sheet.width, sheet.height);
  c.drawImage(atlasFor(state.sheetTheme), 0, 0, sheet.width, sheet.height);
  if (state.showCol) c.drawImage(overlay, 0, 0, sheet.width, sheet.height);
}
for (const t of Object.keys(THEMES)) $(`th-${t}`).onclick = () => { state.sheetTheme = t; for (const u of Object.keys(THEMES)) $(`th-${u}`).setAttribute('aria-pressed', u === t); drawSheet(); };
sheet.addEventListener('pointermove', (e) => {
  const r = sheet.getBoundingClientRect();
  const id = Math.floor((e.clientY - r.top) / (16 * SCALE)) * ts.columns + Math.floor((e.clientX - r.left) / (16 * SCALE)) + 1;
  const t = ts.tiles[id];
  if (!t) return;
  const names = Object.keys(ts.names).filter((n) => ts.names[n] === id);
  $('tileInfo').textContent = `#${id} ${names[0]}${names.length > 1 ? ` (+${names.length - 1} more uses)` : ''} · ${t.kind}${t.block ? ` · ${t.block}` : ''}${t.path ? ` · path ${t.path} only` : ''}${t.ang ? ` · angles floor/wall/ceiling/wall: ${t.ang.map((a) => (a == null ? '–' : a)).join(' / ')}` : ''}`;
});

load(EXAMPLES[0].build(ts));
showPieces(null);
drawSheet();
requestAnimationFrame(frame);
