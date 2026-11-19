// CRT pass 3, BLUR: one axis of a separable gaussian (run once horizontally, once vertically)
// at half size, for halation.
shader_type canvas_item;

uniform sampler2D u_tex : filter_linear, repeat_disable;
uniform vec2 u_step = vec2(0.005, 0.0); // one texel along the blur axis, times the spread

void fragment() {
	vec3 c = texture(u_tex, UV).rgb * 0.2270;
	c += (texture(u_tex, UV + u_step * 1.385).rgb + texture(u_tex, UV - u_step * 1.385).rgb) * 0.3162;
	c += (texture(u_tex, UV + u_step * 3.231).rgb + texture(u_tex, UV - u_step * 3.231).rgb) * 0.0703;
	COLOR = vec4(c, 1.0);
}
