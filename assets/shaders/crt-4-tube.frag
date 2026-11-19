precision highp float;
varying vec2 v_uv;
const float PI = 3.14159265359;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

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
}
