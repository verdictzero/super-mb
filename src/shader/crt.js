// CRT television post-process, as four GLSL ES 1.00 passes (WebGL1 compatible).
//
//   1 SIGNAL   game frame -> composite video signal -> decoded picture. The picture is really
//              encoded as luma + a chroma subcarrier and decoded again, so colour bleed, dot
//              crawl and cross-colour fringes at sharp edges come out of the maths. RF faults
//              are added to the signal before decoding: snow, impulse sparkles, herringbone
//              beat pattern, a ghost echo, line jitter and a rolling hum bar.
//   2 PHOSPHOR per-channel afterglow: max(current, previous * decay). Ping-pong buffer.
//   3 BLUR     separable gaussian of the phosphor image at half size (run H then V) for
//              halation / bloom.
//   4 TUBE     geometry and glass: barrel curvature, convergence error, beam scanlines whose
//              width follows brightness, interlace, RGB subpixel mask (aperture grille, slot
//              mask or dot triads), halation, vignette, glare, flicker, purity error, degauss.
//
// Curvature never shows a border: the warp is normalised so the picture's corners land exactly
// on the output corners, and the bulge beyond that is overscan cropped at the edges.
export const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const COMMON = `
precision highp float;
varying vec2 v_uv;
const float PI = 3.14159265359;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

export const SIGNAL_FRAG = COMMON + `
uniform sampler2D u_src;
uniform vec2 u_res;        // source size in pixels
uniform float u_frame;
uniform float u_rf;        // 0..1 RF interference strength
uniform float u_composite; // 0..1 composite colour artifacts
const float LINES = 240.0;
const float SUBCARRIER = 0.2275; // chroma cycles per source pixel

vec3 rgb2yiq(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 yiq2rgb(vec3 c) { return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }

float carrier(float x, float line) { // subcarrier phase: flips every line and every frame (dot crawl)
  return 2.0 * PI * (x * u_res.x * SUBCARRIER + 0.5 * line + 0.5 * u_frame);
}
// composite signal at a point, including what the aerial picked up
float signal(vec2 uv, float line) {
  vec3 yiq = rgb2yiq(texture2D(u_src, uv).rgb);
  float ph = carrier(uv.x, line);
  float s = yiq.x + yiq.y * cos(ph) + yiq.z * sin(ph);
  float px = floor(uv.x * u_res.x);
  s += (hash(vec2(px, line) + u_frame * 0.37) - 0.5) * 0.22 * u_rf;                                        // snow
  s += 0.035 * u_rf * sin(2.0 * PI * (uv.x * u_res.x * 0.317 + line * 0.21 + u_frame * 0.13));             // herringbone beat
  float streak = hash(vec2(floor(px / 6.0), line) + u_frame * 1.7);
  s += step(1.0 - 0.0035 * u_rf, streak) * 0.9;                                                            // impulse sparkles
  return s;
}

void main() {
  float line = floor(v_uv.y * LINES);
  vec2 uv = v_uv;
  // time-base errors: per-line jitter plus a slow horizontal weave
  uv.x += ((hash(vec2(line, u_frame)) - 0.5) * 1.6 + sin(v_uv.y * 9.0 + u_frame * 0.05) * 0.5) * u_rf / u_res.x;
  float dx = 1.0 / u_res.x;

  // decode: demodulate chroma over two subcarrier periods, notch it out of the centre sample for luma
  float i = 0.0, q = 0.0, s0 = 0.0, sl = 0.0, sr = 0.0;
  for (int k = -4; k < 5; k++) {
    vec2 p = uv + vec2(float(k) * dx, 0.0);
    float s = signal(p, line), ph = carrier(p.x, line);
    float w = k == -4 || k == 4 ? 0.5 : 1.0;
    i += s * cos(ph) * w; q += s * sin(ph) * w;
    if (k == 0) s0 = s;
    if (k == -2) sl = s;
    if (k == 2) sr = s;
  }
  i /= 4.0; q /= 4.0;
  float ph0 = carrier(uv.x, line);
  float y = s0 - (i * cos(ph0) + q * sin(ph0));
  y += 0.18 * (2.0 * s0 - sl - sr) * u_composite; // video peaking: ringing halos beside hard edges
  vec3 decoded = yiq2rgb(vec3(y, i, q));

  vec3 clean = texture2D(u_src, uv).rgb;
  vec3 col = mix(clean, decoded, u_composite);
  // multipath ghost: a faint delayed copy to the right
  col += 0.10 * u_rf * (texture2D(u_src, uv - vec2(0.028, 0.0)).rgb - 0.3);
  // mains hum bar rolling slowly up the picture
  col *= 1.0 + 0.05 * u_rf * sin(2.0 * PI * (v_uv.y * 1.3 + u_frame / 260.0));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const PHOSPHOR_FRAG = COMMON + `
uniform sampler2D u_cur, u_prev;
uniform float u_persist; // 0..1
void main() {
  vec3 cur = texture2D(u_cur, v_uv).rgb, prev = texture2D(u_prev, v_uv).rgb;
  vec3 decay = vec3(0.78, 0.62, 0.52) * u_persist; // red phosphor lingers longest
  gl_FragColor = vec4(max(cur, prev * decay), 1.0);
}`;

export const BLUR_FRAG = COMMON + `
uniform sampler2D u_tex;
uniform vec2 u_step; // one texel along the blur axis, times the spread
void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb * 0.2270;
  c += (texture2D(u_tex, v_uv + u_step * 1.385).rgb + texture2D(u_tex, v_uv - u_step * 1.385).rgb) * 0.3162;
  c += (texture2D(u_tex, v_uv + u_step * 3.231).rgb + texture2D(u_tex, v_uv - u_step * 3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

export const TUBE_FRAG = COMMON + `
uniform sampler2D u_tex, u_bloom;
uniform vec2 u_out;        // output size in device pixels
uniform float u_frame, u_curve, u_scan, u_glow, u_maskAmt, u_maskType, u_maskScale, u_interlace, u_flicker, u_degauss;
const float LINES = 225.0;

// Barrel distortion that never leaves the picture: corners map to corners exactly, so the
// curve "starts" outside the visible area and the excess is overscan.
vec2 warp(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0, asp = vec2(1.0, u_out.y / u_out.x);
  c += sin(c.yx * 7.0 + u_frame * 0.8) * 0.02 * u_degauss;            // degauss wobble
  float k = u_curve * 0.22;
  c *= (1.0 + k * dot(c * asp, c * asp)) / (1.0 + k * dot(asp, asp));
  return c * 0.5 + 0.5;
}
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.4)); }

vec3 mask(vec2 px) {
  px = floor(px / u_maskScale);
  vec3 m;
  if (u_maskType < 0.5) {            // aperture grille: unbroken vertical RGB stripes
    float t = mod(px.x, 3.0);
    m = vec3(float(t < 1.0), float(t >= 1.0 && t < 2.0), float(t >= 2.0));
  } else if (u_maskType < 1.5) {     // slot mask: stripes broken into staggered slots
    float t = mod(px.x, 3.0), col = floor(px.x / 3.0);
    m = vec3(float(t < 1.0), float(t >= 1.0 && t < 2.0), float(t >= 2.0));
    m *= step(0.5, mod(px.y + 2.0 * mod(col, 2.0), 4.0));
  } else {                           // shadow mask: triads of dots, alternate rows offset
    float row = floor(px.y / 2.0), t = mod(px.x + 1.5 * mod(row, 2.0) * 2.0, 6.0);
    m = vec3(float(t < 2.0), float(t >= 2.0 && t < 4.0), float(t >= 4.0));
    m *= 0.35 + 0.65 * step(0.5, mod(px.y, 2.0));
  }
  return m;
}

void main() {
  vec2 uv = warp(v_uv), c = v_uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  // convergence error: the three guns drift apart toward the edges
  vec2 spread = c * (0.0012 + 0.0022 * r2) + vec2(0.0006, 0.0);
  vec3 col = toLinear(vec3(texture2D(u_tex, uv + spread).r, texture2D(u_tex, uv).g, texture2D(u_tex, uv - spread).b));
  vec3 halo = toLinear(texture2D(u_bloom, uv).rgb);

  // scanlines: a gaussian beam per line, fatter where the picture is brighter; odd fields sit half a line lower
  float ly = uv.y * LINES + 0.5 * u_interlace * mod(u_frame, 2.0);
  float d = fract(ly) - 0.5, lum = dot(col, vec3(0.3, 0.6, 0.1));
  float w = mix(0.22, 0.48, sqrt(clamp(lum, 0.0, 1.0)));
  float beam = exp(-d * d / (2.0 * w * w));
  col *= mix(1.0, beam * 1.35, u_scan);

  // phosphor mask
  col *= mix(vec3(1.0), mask(gl_FragCoord.xy) * 2.05 + 0.10, u_maskAmt);

  col += halo * 0.24 * u_glow;                                        // halation: light scattering in the glass
  col *= 1.0 - 0.28 * pow(r2 * 0.5, 1.6);                             // dimmer toward the corners, never black
  col *= 1.0 + vec3(0.05, -0.02, -0.03) * smoothstep(0.5, 1.6, length(c - vec2(0.9, -0.7)) * -1.0 + 1.6); // purity blotch
  col *= 1.0 + u_flicker * 0.018 * (mod(u_frame, 2.0) - 0.5);         // field flicker
  col += vec3(0.010, 0.010, 0.014);                                   // the tube is never truly black
  float glare = smoothstep(0.9, 0.0, length((v_uv - vec2(0.22, 0.86)) * vec2(1.0, 1.8)));
  col += 0.035 * glare * glare;                                       // room light on the glass
  // degauss: rainbow swirl while the coil rings down
  float sw = sin(c.x * 9.0 + c.y * 6.0 + u_frame * 0.7) * u_degauss;
  col = mix(col, col.gbr, clamp(sw, 0.0, 1.0) * 0.8); col = mix(col, col.brg, clamp(-sw, 0.0, 1.0) * 0.8);

  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
