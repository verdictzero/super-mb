precision highp float;
varying vec2 v_uv;
const float PI = 3.14159265359;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

uniform sampler2D u_tex;
uniform vec2 u_step; // one texel along the blur axis, times the spread
void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb * 0.2270;
  c += (texture2D(u_tex, v_uv + u_step * 1.385).rgb + texture2D(u_tex, v_uv - u_step * 1.385).rgb) * 0.3162;
  c += (texture2D(u_tex, v_uv + u_step * 3.231).rgb + texture2D(u_tex, v_uv - u_step * 3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}
