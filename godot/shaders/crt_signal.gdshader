// CRT pass 1, SIGNAL: game frame -> composite video signal -> decoded picture.
// The picture is really encoded as luma + a chroma subcarrier and decoded again, so colour
// bleed, dot crawl and cross-colour fringes come out of the maths. RF faults are added to the
// signal before decoding: snow, impulse sparkles, herringbone beat, a ghost echo, line jitter
// and a rolling hum bar. Port of src/shader/crt.js.
shader_type canvas_item;

uniform sampler2D u_src : filter_linear, repeat_disable;
uniform vec2 u_res = vec2(800.0, 450.0); // picture size in art pixels
uniform float u_frame = 0.0;
uniform float u_rf = 0.35;               // 0..1 RF interference strength
uniform float u_composite = 0.8;         // 0..1 composite colour artifacts

const float LINES = 240.0;
const float SUBCARRIER = 0.2275;         // chroma cycles per art pixel

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
vec3 rgb2yiq(vec3 c) {
	return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 yiq2rgb(vec3 c) {
	return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
}
float carrier(float x, float line) { // subcarrier phase: flips every line and every frame (dot crawl)
	return 2.0 * PI * (x * u_res.x * SUBCARRIER + 0.5 * line + 0.5 * u_frame);
}
float composite_signal(vec2 uv, float line) { // the signal at a point, including what the aerial picked up
	vec3 yiq = rgb2yiq(texture(u_src, uv).rgb);
	float ph = carrier(uv.x, line);
	float s = yiq.x + yiq.y * cos(ph) + yiq.z * sin(ph);
	float px = floor(uv.x * u_res.x);
	s += (hash(vec2(px, line) + u_frame * 0.37) - 0.5) * 0.22 * u_rf;                              // snow
	s += 0.035 * u_rf * sin(2.0 * PI * (uv.x * u_res.x * 0.317 + line * 0.21 + u_frame * 0.13));   // herringbone beat
	float streak = hash(vec2(floor(px / 6.0), line) + u_frame * 1.7);
	s += step(1.0 - 0.0035 * u_rf, streak) * 0.9;                                                  // impulse sparkles
	return s;
}

void fragment() {
	float line = floor(UV.y * LINES);
	vec2 uv = UV;
	// time-base errors: per-line jitter plus a slow horizontal weave
	uv.x += ((hash(vec2(line, u_frame)) - 0.5) * 1.6 + sin(UV.y * 9.0 + u_frame * 0.05) * 0.5) * u_rf / u_res.x;
	float dx = 1.0 / u_res.x;

	// decode: demodulate chroma over two subcarrier periods, notch it out of the centre sample for luma
	float i = 0.0;
	float q = 0.0;
	float s0 = 0.0;
	float sl = 0.0;
	float sr = 0.0;
	for (int k = -4; k < 5; k++) {
		vec2 p = uv + vec2(float(k) * dx, 0.0);
		float s = composite_signal(p, line);
		float ph = carrier(p.x, line);
		float w = (k == -4 || k == 4) ? 0.5 : 1.0;
		i += s * cos(ph) * w;
		q += s * sin(ph) * w;
		if (k == 0) { s0 = s; }
		if (k == -2) { sl = s; }
		if (k == 2) { sr = s; }
	}
	i /= 4.0;
	q /= 4.0;
	float ph0 = carrier(uv.x, line);
	float y = s0 - (i * cos(ph0) + q * sin(ph0));
	y += 0.18 * (2.0 * s0 - sl - sr) * u_composite; // video peaking: ringing halos beside hard edges
	vec3 decoded = yiq2rgb(vec3(y, i, q));

	vec3 clean = texture(u_src, uv).rgb;
	vec3 col = mix(clean, decoded, u_composite);
	col += 0.10 * u_rf * (texture(u_src, uv - vec2(0.028, 0.0)).rgb - 0.3);           // multipath ghost
	col *= 1.0 + 0.05 * u_rf * sin(2.0 * PI * (UV.y * 1.3 + u_frame / 260.0));        // mains hum bar
	COLOR = vec4(clamp(col, 0.0, 1.0), 1.0);
}
