// CRT pass 4, TUBE: geometry and glass. Barrel curvature, convergence error, beam scanlines
// whose width follows brightness, interlace, RGB subpixel mask (aperture grille, slot mask or
// dot triads), halation, corner dimming, purity error, flicker, glare and degauss.
// Curvature never shows a border: the warp is normalised so the picture's corners land exactly
// on the output corners, and the bulge beyond that is overscan cropped at the edges.
shader_type canvas_item;

uniform sampler2D u_tex : filter_linear, repeat_disable;
uniform sampler2D u_bloom : filter_linear, repeat_disable;
uniform vec2 u_out = vec2(1280.0, 720.0); // output size in pixels
uniform float u_frame = 0.0;
uniform float u_curve = 0.6;
uniform float u_scan = 0.7;
uniform float u_glow = 0.6;
uniform float u_mask_amt = 0.85;
uniform float u_mask_type = 0.0;          // 0 aperture grille, 1 slot mask, 2 dot triads
uniform float u_mask_scale = 1.0;
uniform float u_interlace = 1.0;
uniform float u_flicker = 1.0;
uniform float u_degauss = 0.0;

const float LINES = 225.0;

vec2 warp(vec2 uv) {
	vec2 c = uv * 2.0 - 1.0;
	vec2 asp = vec2(1.0, u_out.y / u_out.x);
	c += sin(c.yx * 7.0 + u_frame * 0.8) * 0.02 * u_degauss; // degauss wobble
	float k = u_curve * 0.22;
	c *= (1.0 + k * dot(c * asp, c * asp)) / (1.0 + k * dot(asp, asp));
	return c * 0.5 + 0.5;
}
vec3 to_linear(vec3 c) {
	return pow(max(c, vec3(0.0)), vec3(2.4));
}
vec3 phosphor_mask(vec2 px) {
	px = floor(px / u_mask_scale);
	vec3 m;
	if (u_mask_type < 0.5) {            // aperture grille: unbroken vertical RGB stripes
		float t = mod(px.x, 3.0);
		m = vec3(float(t < 1.0), float(t >= 1.0 && t < 2.0), float(t >= 2.0));
	} else if (u_mask_type < 1.5) {     // slot mask: stripes broken into staggered slots
		float t = mod(px.x, 3.0);
		float col = floor(px.x / 3.0);
		m = vec3(float(t < 1.0), float(t >= 1.0 && t < 2.0), float(t >= 2.0));
		m *= step(0.5, mod(px.y + 2.0 * mod(col, 2.0), 4.0));
	} else {                            // shadow mask: triads of dots, alternate rows offset
		float row = floor(px.y / 2.0);
		float t = mod(px.x + 3.0 * mod(row, 2.0), 6.0);
		m = vec3(float(t < 2.0), float(t >= 2.0 && t < 4.0), float(t >= 4.0));
		m *= 0.35 + 0.65 * step(0.5, mod(px.y, 2.0));
	}
	return m;
}

void fragment() {
	vec2 uv = warp(UV);
	vec2 c = UV * 2.0 - 1.0;
	float r2 = dot(c, c);
	// convergence error: the three guns drift apart toward the edges
	vec2 spread = c * (0.0012 + 0.0022 * r2) + vec2(0.0006, 0.0);
	vec3 col = to_linear(vec3(texture(u_tex, uv + spread).r, texture(u_tex, uv).g, texture(u_tex, uv - spread).b));
	vec3 halo = to_linear(texture(u_bloom, uv).rgb);

	// scanlines: a gaussian beam per line, fatter where the picture is brighter; odd fields sit half a line lower
	float ly = uv.y * LINES + 0.5 * u_interlace * mod(u_frame, 2.0);
	float d = fract(ly) - 0.5;
	float lum = dot(col, vec3(0.3, 0.6, 0.1));
	float w = mix(0.22, 0.48, sqrt(clamp(lum, 0.0, 1.0)));
	float beam = exp(-d * d / (2.0 * w * w));
	col *= mix(1.0, beam * 1.35, u_scan);

	col *= mix(vec3(1.0), phosphor_mask(FRAGCOORD.xy) * 2.05 + 0.10, u_mask_amt); // phosphor mask
	col += halo * 0.24 * u_glow;                                                   // halation
	col *= 1.0 - 0.28 * pow(r2 * 0.5, 1.6);                                        // dimmer toward the corners, never black
	col *= 1.0 + vec3(0.05, -0.02, -0.03) * smoothstep(0.5, 1.6, 1.6 - length(c - vec2(0.9, 0.7))); // purity blotch
	col *= 1.0 + u_flicker * 0.018 * (mod(u_frame, 2.0) - 0.5);                    // field flicker
	col += vec3(0.010, 0.010, 0.014);                                              // the tube is never truly black
	float glare = smoothstep(0.9, 0.0, length((UV - vec2(0.22, 0.14)) * vec2(1.0, 1.8)));
	col += 0.035 * glare * glare;                                                  // room light on the glass
	// degauss: rainbow swirl while the coil rings down
	float sw = sin(c.x * 9.0 + c.y * 6.0 + u_frame * 0.7) * u_degauss;
	col = mix(col, col.gbr, clamp(sw, 0.0, 1.0) * 0.8);
	col = mix(col, col.brg, clamp(-sw, 0.0, 1.0) * 0.8);

	COLOR = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
