extends Node2D
## Draws the level: banded sky, parallax strips, set pieces, tiles, objects and particles.
## Everything is custom-drawn each frame from the simulation state (no TileMap), so animated
## tiles, presses and parallax all come from one place.

const TILE := 32
const COLUMNS := 32

var main: Node               # the Main node: holds sim, level, textures and tables
var view := Vector2(800, 450)
var cam := Vector2.ZERO


func _process(_delta: float) -> void:
	queue_redraw()


func _tile(tex: Texture2D, id: int, pos: Vector2) -> void:
	if id == 0:
		return
	var frames = main.tiles[id].get("frames")
	if frames != null:
		id += main.anim_tick % int(frames)
	draw_texture_rect_region(tex, Rect2(pos, Vector2(TILE, TILE)), Rect2(((id - 1) % COLUMNS) * TILE, ((id - 1) / COLUMNS) * TILE, TILE, TILE))


func _named(tex: Texture2D, tile_name: String, pos: Vector2) -> void:
	_tile(tex, int(main.names.get(tile_name, 0)), pos)


func _draw() -> void:
	if main == null or main.sim == null:
		return
	var sim: Sim = main.sim
	var level: Dictionary = main.level
	var theme: Dictionary = main.theme
	var p: Dictionary = sim.p
	var lw := int(level["width"])
	var lh := int(level["height"])
	cam.x += (clampf(p.x - view.x * 0.42, 0.0, maxf(0.0, lw * TILE - view.x)) - cam.x) * 0.2
	cam.y += (clampf(p.y - view.y * 0.58, 0.0, maxf(0.0, lh * TILE - view.y)) - cam.y) * 0.22
	var cx := roundf(cam.x)
	var cy := roundf(cam.y)
	var t: int = main.clock

	# sky: discrete colour bands
	var bands: Array = theme["sky"]
	var bh := ceilf(view.y / bands.size())
	for i in bands.size():
		draw_rect(Rect2(0, i * bh, view.x, bh), Color8(int(bands[i][0]), int(bands[i][1]), int(bands[i][2])))

	# parallax: the backdrop is pinned to the screen; over the whole level the horizon slides a fifth of the view
	var horizon := view.y * (0.62 - 0.2 * (cy / maxf(1.0, lh * TILE - view.y)))
	var bg: Dictionary = main.bg
	var bg_tex: Texture2D = main.bg_tex
	for l in bg["layers"]:
		var top := roundf(0.0 if l.get("pinTop", false) else horizon + float(l["y"]))
		var lw_px := float(l["w"])
		var lh_px := float(l["h"])
		var drift := float(l.get("drift", 0.0))
		if l.get("lineScroll", false): # each row scrolls a little faster than the one above
			var f0 := float(l["factor"])
			var f1 := float(l["factor2"])
			var r := 0.0
			while r < lh_px:
				_strip(bg_tex, l, r, 2.0, top + r, floorf(cx * (f0 + (f1 - f0) * r / lh_px)), lw_px)
				r += 2.0
		else:
			_strip(bg_tex, l, 0.0, lh_px, top, floorf(cx * float(l["factor"]) + t * drift), lw_px)
		if l.get("fillBelow") != null: # below the last strip: sink into darkness in bands
			var y0 := top + lh_px
			draw_rect(Rect2(0, y0, view.x, maxf(0.0, view.y - y0)), Color.html(theme["colors"]["bgNearD"]))
			for k in range(1, 6):
				draw_rect(Rect2(0, y0 + k * 26, view.x, 27), Color(0.04, 0.016, 0.12, 0.16 * k))
			draw_rect(Rect2(0, y0 + 156, view.x, maxf(0.0, view.y - y0 - 156)), Color.html(theme["colors"]["ink"]))

	# big set pieces, behind the terrain
	var props: Dictionary = main.props["props"]
	for q in level["props"]:
		var pr: Dictionary = props[q["name"]]
		var qx := float(q["x"])
		var pw := float(pr["w"])
		if qx + pw < cx or qx > cx + view.x:
			continue
		var frames := int(pr.get("frames", 1))
		var f := (int(t / 5.0 + qx) % frames) if frames > 1 else 0
		var bob := roundf(sin(t / 45.0 + qx) * TILE * 0.2) if pr.get("sky", false) else 0.0
		draw_texture_rect_region(main.props_tex, Rect2(qx - cx, float(q["y"]) - cy + bob, pw, float(pr["h"])), Rect2(float(pr["x"]) + f * float(pr.get("frameStep", 0)), float(pr["y"]), pw, float(pr["h"])))

	# tiles
	var tex: Texture2D = main.tiles_tex
	var decor: PackedInt32Array = level["decor"]
	var x0 := int(floor(cx / TILE))
	var y0t := int(floor(cy / TILE))
	for ty in range(maxi(0, y0t), mini(lh, y0t + int(view.y / TILE) + 2)):
		for tx in range(maxi(0, x0), mini(lw, x0 + int(view.x / TILE) + 2)):
			var i := ty * lw + tx
			var pos := Vector2(tx * TILE - cx, ty * TILE - cy)
			_tile(tex, decor[i], pos)
			_tile(tex, sim.terrain[i], pos)

	# objects
	for o in sim.objs:
		if not o.alive:
			continue
		var pos := Vector2(roundf(o.x) - cx, roundf(o.y) - cy)
		if pos.x < -4 * TILE or pos.x > view.x + 4 * TILE:
			continue
		match o.type:
			"gem":
				_named(tex, "gem", pos + Vector2(0, roundf(2.0 * sin(sim.frame / 12.0 + o.x / TILE))))
			"spring":
				_named(tex, "spring_hi" if float(o.get("power", 0)) > 10.0 else "spring", pos)
			"booster":
				_named(tex, "booster_l" if float(o.get("dir", 1)) < 0 else "booster_r", pos)
			"walker":
				_named(tex, "walker_%d" % ((sim.frame >> 3) & 1), pos)
			"flyer":
				_named(tex, "flyer_%d" % ((sim.frame >> 2) & 1), pos)
			"checkpoint":
				_named(tex, "check_on" if o.on else "check_off", pos)
			"vent":
				_named(tex, "vent", pos)
				if o.on:
					for k in range(1, 4):
						_named(tex, "steam_%d" % ((k + (sim.frame >> 2)) % 3), pos + Vector2(0, -k * TILE + ((sim.frame * 3) % TILE) - TILE / 2.0))
			"crusher": # rod down from the ceiling, head at the end
				var ext := roundf(o.ext)
				var y := -float(TILE)
				while y < ext:
					_named(tex, "crusher_rod", pos + Vector2(TILE / 2.0, minf(y, ext - TILE)))
					y += TILE
				_named(tex, "crusher_head_0_0", pos + Vector2(0, ext - TILE))
				_named(tex, "crusher_head_1_0", pos + Vector2(TILE, ext - TILE))

	# particles
	for q in main.parts:
		var a := minf(1.0, (q.life / q.max_life) * 1.6)
		if q.get("gem", false):
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			_named(tex, "gem", Vector2(roundf(q.x) - cx - TILE / 2.0, roundf(q.y) - cy - TILE / 2.0))
		else:
			var c: Color = q.color
			c.a = a
			draw_rect(Rect2(roundf(q.x - q.size / 2.0) - cx, roundf(q.y - q.size / 2.0) - cy, q.size, q.size), c)


	if p.dead:
		draw_rect(Rect2(0, view.y / 2.0 - TILE, view.x, 2 * TILE), Color(0.1, 0.09, 0.19, 0.55))
		_label("TRY AGAIN", view.x / 2.0, view.y / 2.0 + 12, 34, Color.WHITE, 1)
	if main.phase == "intro":
		_title_card(main.phase_t, level)
	elif main.phase == "tally":
		_tally(main.phase_t, level)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _ease(t: float) -> float:
	t = clampf(t, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)


## heavy slanted caps with a hard drop shadow; align 0 left, 1 centre, 2 right
func _label(text: String, x: float, y: float, size: int, color: Color, align: int = 0) -> void:
	var font := ThemeDB.fallback_font
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var off := Vector2(-w * 0.5 * align, 0)
	for pass_no in 2:
		var d := size * 0.07 if pass_no == 0 else 0.0
		draw_set_transform_matrix(Transform2D(Vector2(1, 0), Vector2(-0.22, 1), Vector2(x + d, y + d)))
		draw_string(font, off, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(0.08, 0.04, 0.18) if pass_no == 0 else color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## band edge cut into teeth pointing along n
func _saw(a: Vector2, b: Vector2, tooth: float, n: Vector2, color: Color) -> void:
	var count := int(round(a.distance_to(b) / tooth))
	for i in count:
		var p0 := a.lerp(b, float(i) / count)
		var p1 := a.lerp(b, float(i + 1) / count)
		draw_colored_polygon(PackedVector2Array([p0, (p0 + p1) / 2.0 + n * tooth * 0.6, p1]), color)


## Title card: a blue field drops in, a red band slides down the left, a yellow band slides in
## along the bottom, and the zone name, "ZONE" and the act number fly in; then it all leaves.
func _title_card(t: int, lvl: Dictionary) -> void:
	var a := _ease(t / float(main.INTRO_IN))
	var o := _ease((t - main.INTRO_HOLD) / float(main.INTRO_OUT - main.INTRO_HOLD))
	var k := a * (1.0 - o)
	var red := Color.html("#e4203a")
	var yellow := Color.html("#ffd21e")
	draw_rect(Rect2(0, -view.y * o, view.x, view.y * (a if t < main.INTRO_HOLD else 1.0)), Color.html("#1c2cd0"))
	var bx := -230.0 * (1.0 - k)
	draw_rect(Rect2(bx, 0, 200, view.y), red)
	_saw(Vector2(bx + 200, 0), Vector2(bx + 200, view.y), 30, Vector2(1, 0), red)
	var yx := view.x * (1.0 - k)
	draw_rect(Rect2(yx, 330, view.x, 120), yellow)
	_saw(Vector2(yx, 330), Vector2(yx + view.x, 330), 30, Vector2(0, -1), yellow)
	_label("SUPER MB", bx + 22, 96, 22, Color.WHITE)
	var zone := String(lvl.get("name", "")).to_upper()
	_label(zone, view.x - 30 + 700.0 * (1.0 - _ease((t - 6) / float(main.INTRO_IN)) * (1.0 - o)), 196, 60, Color.WHITE, 2)
	_label("ZONE", view.x - 30 + 700.0 * (1.0 - _ease((t - 14) / float(main.INTRO_IN)) * (1.0 - o)), 258, 46, Color.WHITE, 2)
	var ay := 392.0 + 200.0 * (1.0 - _ease((t - 20) / float(main.INTRO_IN)) * (1.0 - o))
	draw_circle(Vector2(view.x / 2.0 + 4, ay + 4), 50, Color(0.08, 0.04, 0.18))
	draw_circle(Vector2(view.x / 2.0, ay), 50, red)
	_label("ACT", view.x / 2.0, ay - 14, 20, yellow, 1)
	_label(str(int(lvl.get("act", 1))), view.x / 2.0, ay + 34, 50, Color.WHITE, 1)


## Score tally: heading and rows slide in, then the bonuses drain into the total.
func _tally(t: int, lvl: Dictionary) -> void:
	var y: Dictionary = main.tally
	var yellow := Color.html("#ffd21e")
	var hx := (1.0 - _ease(t / 24.0)) * view.x
	draw_rect(Rect2(0, 70, view.x, 300), Color(0.08, 0.04, 0.18, 0.5 * _ease(t / 24.0)))
	_label("YOU", view.x / 2.0 - 150 - hx, 118, 40, yellow, 1)
	_label("GOT THROUGH", view.x / 2.0 + 60 + hx, 118, 40, Color.WHITE, 1)
	_label("%s ZONE  ACT %d" % [String(lvl.get("name", "")).to_upper(), int(lvl.get("act", 1))], view.x / 2.0 - hx, 164, 30, Color.WHITE, 1)
	var rows := [["TIME BONUS", y.time], ["GEM BONUS", y.gems], ["TOTAL", y.total]]
	for i in rows.size():
		var yy := 240.0 + i * 50 + (16 if i == 2 else 0)
		var dx := (1.0 - _ease((t - 30 - i * 10) / 22.0)) * view.x
		_label(rows[i][0], view.x / 2.0 - 190 - dx, yy, 30, yellow)
		_label(str(int(rows[i][1])), view.x / 2.0 + 200 + dx, yy, 30, Color.WHITE, 2)


## one horizontal strip of a parallax layer, tiled across the view
func _strip(tex: Texture2D, l: Dictionary, src_y: float, rows: float, dest_y: float, off: float, lw_px: float) -> void:
	if dest_y >= view.y or dest_y + rows <= 0.0:
		return
	var src := Rect2(0, float(l["srcY"]) + src_y, lw_px, rows)
	if l.get("once", false):
		draw_texture_rect_region(tex, Rect2(-off, dest_y, lw_px, rows), src)
		return
	var x := -fposmod(off, lw_px)
	while x < view.x:
		draw_texture_rect_region(tex, Rect2(x, dest_y, lw_px, rows), src)
		x += lw_px
