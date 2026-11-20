extends Node2D
## Super MB in Godot 4: loads the baked tileset, backdrops, set pieces and levels from
## res://assets, runs the ported simulation at 60 ticks a second, and shows the result either
## directly or through the four-pass CRT shader.
##
## Keys: arrows / A D to run, Space / Up / Z to jump, R restart, N / P next / previous level,
## B bot auto-play, C CRT on/off, G degauss, M phosphor mask type.

const VIEW := Vector2(800, 450)   # logical view in art pixels
const K := 2                      # the game viewport renders at K times that, so the photo stays sharp
const TILE := 32.0

var tiles: Array = []
var names: Dictionary = {}
var themes: Dictionary = {}
var backgrounds: Dictionary = {}
var props: Dictionary = {}
var level_index: Array = []
var level_no := 0
var level: Dictionary = {}
var theme: Dictionary = {}
var bg: Dictionary = {}
var tiles_tex: Texture2D
var bg_tex: Texture2D
var props_tex: Texture2D

var sim: Sim
var bot := Bot.new()
var use_bot := false
var clock := 0
var anim_tick := 0
var wait := 0
# act flow: title card -> play -> score tally
const INTRO_IN := 26
const INTRO_HOLD := 112
const INTRO_OUT := 142
var phase := "intro"
var phase_t := 0
var score := 0
var play_time := 0
var tally := {}
var parts: Array = []
var morph := {"v": 0.0, "vel": 0.0, "axis": 0.0, "lean": 0.0, "lag": 0.0, "was_jumping": false, "was_grounded": true}

var world: Node2D
var player_view: Node2D
var game_vp: SubViewport
var hud: Label
var plain_view: TextureRect
var crt_view: ColorRect
var crt_on := true
var crt_frame := 0.0
var degauss := 0.0
var mask_type := 0
var mat_signal: ShaderMaterial
var mat_phosphor: ShaderMaterial
var mat_tube: ShaderMaterial


static func read_json(path: String):
	return JSON.parse_string(FileAccess.get_file_as_string(path))


func _ready() -> void:
	var tileset: Dictionary = read_json("res://assets/tileset.json")
	tiles = tileset["tiles"]
	names = tileset["names"]
	themes = read_json("res://assets/themes.json")
	backgrounds = read_json("res://assets/backgrounds.json")
	props = read_json("res://assets/props.json")
	level_index = read_json("res://assets/levels/index.json")
	_build_nodes()
	load_level(0)


func _build_nodes() -> void:
	# the game itself, rendered off-screen
	game_vp = SubViewport.new()
	game_vp.size = Vector2i(VIEW * K)
	game_vp.disable_3d = true
	game_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(game_vp)
	var root := Node2D.new()
	root.scale = Vector2(K, K)
	game_vp.add_child(root)
	world = Node2D.new()
	world.set_script(load("res://scripts/world.gd"))
	world.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	world.main = self
	world.view = VIEW
	root.add_child(world)
	player_view = Node2D.new()
	player_view.set_script(load("res://scripts/player_view.gd"))
	player_view.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	player_view.main = self
	player_view.head = load("res://assets/hero-head.png")
	root.add_child(player_view)

	# CRT passes: signal -> phosphor (feeds back on itself) -> blur H -> blur V -> tube on screen
	var art := Vector2i(VIEW)
	var sig := _pass(art, "res://shaders/crt_signal.gdshader", false)
	mat_signal = sig[1]
	mat_signal.set_shader_parameter("u_src", game_vp.get_texture())
	mat_signal.set_shader_parameter("u_res", VIEW)
	var pho := _pass(art, "res://shaders/crt_phosphor.gdshader", true)
	mat_phosphor = pho[1]
	mat_phosphor.set_shader_parameter("u_cur", sig[0].get_texture())
	var bh := _pass(art / 2, "res://shaders/crt_blur.gdshader", false)
	bh[1].set_shader_parameter("u_tex", pho[0].get_texture())
	bh[1].set_shader_parameter("u_step", Vector2(2.2 / (art.x / 2.0), 0.0))
	var bv := _pass(art / 2, "res://shaders/crt_blur.gdshader", false)
	bv[1].set_shader_parameter("u_tex", bh[0].get_texture())
	bv[1].set_shader_parameter("u_step", Vector2(0.0, 2.2 / (art.y / 2.0)))

	var layer := CanvasLayer.new()
	add_child(layer)
	plain_view = TextureRect.new()
	plain_view.texture = game_vp.get_texture()
	plain_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	plain_view.stretch_mode = TextureRect.STRETCH_SCALE
	plain_view.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	plain_view.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(plain_view)
	crt_view = ColorRect.new()
	crt_view.set_anchors_preset(Control.PRESET_FULL_RECT)
	mat_tube = ShaderMaterial.new()
	mat_tube.shader = load("res://shaders/crt_tube.gdshader")
	mat_tube.set_shader_parameter("u_tex", pho[0].get_texture())
	mat_tube.set_shader_parameter("u_bloom", bv[0].get_texture())
	crt_view.material = mat_tube
	layer.add_child(crt_view)
	hud = Label.new()
	hud.position = Vector2(12, 8)
	hud.add_theme_font_size_override("font_size", 16)
	hud.add_theme_color_override("font_outline_color", Color.BLACK)
	hud.add_theme_constant_override("outline_size", 6)
	layer.add_child(hud)
	_set_crt(true)


## one off-screen shader pass: a viewport holding a full-size rect with the shader on it
func _pass(size: Vector2i, shader_path: String, feedback: bool) -> Array:
	var vp := SubViewport.new()
	vp.size = size
	vp.disable_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	if feedback: # keep last frame's picture so the shader can read it back as the screen texture
		vp.render_target_clear_mode = SubViewport.CLEAR_MODE_NEVER
	add_child(vp)
	var rect := ColorRect.new()
	rect.size = Vector2(size)
	var mat := ShaderMaterial.new()
	mat.shader = load(shader_path)
	rect.material = mat
	vp.add_child(rect)
	return [vp, mat]


func _set_crt(on: bool) -> void:
	crt_on = on
	crt_view.visible = on
	plain_view.visible = not on


func load_level(n: int) -> void:
	level_no = posmod(n, level_index.size())
	var info: Dictionary = level_index[level_no]
	var raw: Dictionary = read_json("res://assets/levels/%s.json" % info["id"])
	for key in ["terrain", "decor"]: # JSON numbers arrive as floats
		var src: Array = raw[key]
		var packed := PackedInt32Array()
		packed.resize(src.size())
		for i in src.size():
			packed[i] = int(src[i])
		raw[key] = packed
	level = raw
	var theme_name: String = raw["theme"]
	theme = themes[theme_name]
	bg = backgrounds[theme_name]
	tiles_tex = load("res://assets/tileset-%s.png" % theme_name)
	bg_tex = load("res://assets/bg-%s.png" % theme_name)
	props_tex = load("res://assets/props-%s.png" % theme_name)
	sim = Sim.new()
	sim.setup({"tiles": tiles, "names": names}, level)
	bot = Bot.new()
	parts.clear()
	player_view.trail.clear()
	wait = 0
	_start_act()
	world.cam = Vector2(sim.p.x - VIEW.x * 0.42, sim.p.y - VIEW.y * 0.58)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	match event.physical_keycode:
		KEY_R:
			sim.reset(false)
			bot = Bot.new()
			_start_act()
		KEY_N:
			load_level(level_no + 1)
		KEY_P:
			load_level(level_no - 1)
		KEY_B:
			use_bot = not use_bot
			bot = Bot.new()
		KEY_C:
			_set_crt(not crt_on)
		KEY_G:
			degauss = 1.6
		KEY_M:
			mask_type = (mask_type + 1) % 3


func _physics_process(_delta: float) -> void:
	if sim == null:
		return
	clock += 1
	anim_tick = clock / 5
	var p: Dictionary = sim.p
	if phase == "intro": # the title card holds the player still
		phase_t += 1
		if phase_t >= INTRO_OUT:
			phase = "play"
		return
	if p.won: # tally: wait, drain the bonuses into the total, hold, then go to the next level
		if phase != "tally":
			phase = "tally"
			phase_t = 0
			tally = {"time": _time_bonus(play_time), "gems": int(p.gems) * 100, "total": score, "done": 0}
		phase_t += 1
		if phase_t > 110:
			var moved := _take("time")
			if moved == 0:
				moved = _take("gems")
			if moved == 0 and tally.done == 0:
				tally.done = phase_t
			if tally.done > 0 and phase_t > tally.done + 170:
				load_level(level_no + 1)
				return
	elif p.dead:
		wait += 1
		if wait > 60:
			sim.reset(true)
			bot = Bot.new()
			wait = 0
			player_view.trail.clear()
	elif use_bot:
		play_time += 1
		var keys := bot.input(sim)
		sim.step(keys[0], keys[1], keys[2])
	else:
		play_time += 1
		var left := Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A)
		var right := Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D)
		var jump := Input.is_physical_key_pressed(KEY_SPACE) or Input.is_physical_key_pressed(KEY_UP) or Input.is_physical_key_pressed(KEY_Z) or Input.is_physical_key_pressed(KEY_W)
		sim.step(left, right, jump)
	_effects()


func _process(_delta: float) -> void:
	if sim == null:
		return
	_debug_shot()
	var p: Dictionary = sim.p
	hud.text = "%s Zone, Act %d    score %d    time %d:%02d    gems %d    speed %.1f    path %s    %s\n[N/P] level  [B] bot  [C] CRT  [M] mask  [G] degauss  [R] restart" % [
		level.get("name", ""), int(level.get("act", 1)), score, play_time / 3600, (play_time / 60) % 60, p.gems, absf(p.gsp if p.grounded else Vector2(p.xsp, p.ysp).length()) / 2.0, p.path,
		"bot playing" if use_bot else ""]
	if crt_on:
		crt_frame += 1.0
		degauss *= 0.965
		mat_signal.set_shader_parameter("u_frame", crt_frame)
		mat_tube.set_shader_parameter("u_frame", crt_frame)
		mat_tube.set_shader_parameter("u_out", get_viewport().get_visible_rect().size)
		mat_tube.set_shader_parameter("u_degauss", minf(1.0, degauss))
		mat_tube.set_shader_parameter("u_mask_type", float(mask_type))


func _start_act() -> void:
	phase = "intro"
	phase_t = 0
	score = 0
	play_time = 0
	tally = {}


## bonus for finishing quickly, by seconds taken
func _time_bonus(frames: int) -> int:
	var s := frames / 60.0
	for row in [[30, 50000], [45, 10000], [60, 5000], [90, 4000], [120, 3000], [180, 2000], [240, 1000], [300, 500]]:
		if s < row[0]:
			return row[1]
	return 0


func _take(key: String) -> int:
	var n: int = mini(int(tally[key]), 100)
	tally[key] -= n
	tally.total += n
	score = tally.total
	return n


# ---- visual effects driven by sim events: particles and squash-and-stretch -------------------

func _burst(x: float, y: float, n: int, color: Color, speed: float, life: int = 24, size: float = 4.0, up: bool = false, grav: float = 0.0) -> void:
	for i in n:
		var a := -PI * (0.15 + 0.7 * randf()) if up else randf() * TAU
		var v := speed * (0.4 + randf() * 0.6)
		parts.append({"x": x, "y": y, "vx": cos(a) * v, "vy": sin(a) * v, "g": grav, "life": float(life), "max_life": float(life), "size": size, "color": color})


func _effects() -> void:
	var p: Dictionary = sim.p
	var col: Dictionary = theme["colors"]
	# squash and stretch: one springy value; positive stretches along an axis, negative squashes
	for e in sim.events:
		score += int({"gem": 10, "bop": 100, "bonus": 50, "brick": 10}.get(e.type, 0))
		match e.type:
			"land":
				morph.vel -= 0.16
				_burst(e.x, e.y, 5, Color.html(col["white"]), 3.2, 14, 5.0, true)
			"boost":
				morph.vel += 0.12
				_burst(e.x, e.y, 10, Color.html(col["yellow"]), 8.0, 16)
			"bop":
				morph.vel -= 0.1
				_burst(e.x, e.y, 10, Color.html(col["foeL"]), 6.0, 22, 5.0)
			"gem":
				_burst(e.x, e.y, 6, Color.html(col["gemL"]), 4.4, 18)
			"brick":
				_burst(e.x, e.y, 8, Color.html(col["brick"]), 8.0, 40, 6.0, true, 0.7)
			"bonus":
				parts.append({"x": e.x, "y": e.y - TILE, "vx": 0.0, "vy": -6.0, "g": 0.4, "life": 26.0, "max_life": 26.0, "gem": true, "size": 0.0, "color": Color.WHITE})
			"check":
				_burst(e.x, e.y, 14, Color.html(col["yellow"]), 6.0, 34, 4.0, true, 0.2)
	sim.events.clear()
	if p.jumping and not morph.was_jumping:
		morph.vel += 0.11
	if not p.grounded and morph.was_grounded and not p.jumping:
		morph.vel += 0.04
	morph.was_jumping = p.jumping
	morph.was_grounded = p.grounded
	var sp := Vector2(p.xsp, p.ysp).length() / TILE
	var target := minf(0.07, absf(p.gsp) / TILE * 0.12) if p.grounded else minf(0.2, sp * 0.3)
	morph.vel += (target - morph.v) * 0.22
	morph.vel *= 0.7
	morph.v = clampf(morph.v + morph.vel, -0.32, 0.3)
	var rad := deg_to_rad(p.ang)
	var want := atan2(p.ysp, p.xsp)
	if p.grounded:
		want = (-rad - PI / 2.0) if morph.v < 0.0 else -rad
	var d: float = want - morph.axis
	d = atan2(sin(2.0 * d), cos(2.0 * d)) / 2.0 # an axis has no direction: turn the short way
	morph.axis += d * (0.5 if p.grounded else 0.3)
	var speed: float = (p.gsp if p.grounded else p.xsp) / TILE
	morph.lean += (clampf(speed * 0.55, -0.2, 0.2) * signf(p.face) * signf(p.face) - morph.lean) * 0.2
	var lag := 0.0 if p.grounded else clampf(-p.ysp / TILE * 0.5, -0.18, 0.18)
	morph.lag += (lag - morph.lag) * 0.25

	for i in range(parts.size() - 1, -1, -1):
		var q: Dictionary = parts[i]
		q.x += q.vx
		q.y += q.vy
		q.vy += q.g
		q.life -= 1.0
		if q.life <= 0.0:
			parts.remove_at(i)
	var trail: Array = player_view.trail
	trail.append({"x": p.x, "y": p.y, "fast": not p.dead and absf(p.gsp if p.grounded else p.xsp) > 0.5 * TILE})
	if trail.size() > 8:
		trail.pop_front()


# ---- debugging: `godot --path godot -- --shot=out.png [--frames=240] [--level=3] [--bot] [--nocrt]`
# plays for a while, saves what is on screen and quits. Used to check rendering from the command line.
var _shot_args := {}
var _shot_ready := false

func _debug_shot() -> void:
	if not _shot_ready:
		_shot_ready = true
		for a in OS.get_cmdline_user_args():
			var kv: PackedStringArray = a.trim_prefix("--").split("=")
			_shot_args[kv[0]] = kv[1] if kv.size() > 1 else "1"
		if _shot_args.has("level"):
			load_level(int(_shot_args["level"]))
		if _shot_args.has("bot"):
			use_bot = true
		if _shot_args.has("nocrt"):
			_set_crt(false)
	if _shot_args.has("shot") and clock >= int(_shot_args.get("frames", "240")):
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(_shot_args["shot"])
		get_tree().quit()
