precision highp float;
varying vec2 v_uv;
const float PI = 3.14159265359;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

uniform sampler2D u_cur, u_prev;
uniform float u_persist; // 0..1
void main() {
  vec3 cur = texture2D(u_cur, v_uv).rgb, prev = texture2D(u_prev, v_uv).rgb;
  vec3 decay = vec3(0.78, 0.62, 0.52) * u_persist; // red phosphor lingers longest
  gl_FragColor = vec4(max(cur, prev * decay), 1.0);
}
