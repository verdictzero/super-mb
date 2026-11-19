// CRT pass 2, PHOSPHOR: per-channel afterglow. The viewport this runs in is never cleared, so
// the screen texture still holds last frame's result: out = max(current, previous * decay).
shader_type canvas_item;

uniform sampler2D u_cur : filter_linear, repeat_disable;
uniform sampler2D u_prev : hint_screen_texture, filter_linear, repeat_disable;
uniform float u_persist = 0.56; // 0..1

void fragment() {
	vec3 cur = texture(u_cur, UV).rgb;
	vec3 prev = texture(u_prev, SCREEN_UV).rgb;
	vec3 decay = vec3(0.78, 0.62, 0.52) * u_persist; // red phosphor lingers longest
	COLOR = vec4(max(cur, prev * decay), 1.0);
}
