class_name Sim
extends RefCounted
## Deterministic 60fps simulation: momentum physics on pixel-mask terrain.
## A direct port of src/engine/sim.js. The player is a ball that follows surfaces through
## 360 degrees using per-tile angles, which is what makes quarter pipes and loops work.

const TILE := 32
const S := 2.0                      # scale relative to the 16px design grid
const SH := 5                       # log2(TILE)
const MK := 31                      # TILE - 1
const ACC := 0.07 * S
const DEC := 0.5 * S
const FRC := 0.06 * S
const TOP := 6.0 * S
const MAX_SPEED := 14.0 * S
const JUMP := 5.6 * S
const JUMP_CUT := 2.5 * S
const GRAV := 0.21875 * S
const AIR := 0.09375 * S
const SLOPE := 0.125 * S
const SLOPE_FLOOR := 0.0875 * S     # gentler pull on floor-ish angles so 45 degree ramps are walkable
const SLIP := 2.5 * S               # below this speed you fall off walls and ceilings
const BOOST := 10.0 * S
const SPRING := 9.0 * S
const R := 14.0 * S                 # body radius
const SENS := 10.0 * S              # sensor spread
const VENT_CYCLE := 140
const VENT_ON := 50
const DIRS := [Vector2i(0, 1), Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0)] # floor, right wall, ceiling, left wall

var tiles: Array = []               # tile metadata by id (index 0 is null)
var names: Dictionary = {}
var level: Dictionary = {}
var w := 0
var h := 0
var terrain := PackedInt32Array()
var loops: Array = []
var objs: Array = []
var goal_x := 0.0
var p: Dictionary = {}
var frame := 0
var frozen := false
var events: Array = []
var kill_y := PackedFloat32Array()
var check = null                    # last checkpoint position, or null
var _belt := 0.0


static func mode_of(ang: float) -> int:
	return int(floor(fposmod(ang + 45.0, 360.0) / 90.0))


## 0..1 extension of a press over its cycle: wait, slam, hold, retract
static func crusher_ext(f: int) -> float:
	var t := posmod(f, 160)
	if t < 70:
		return 0.0
	if t < 78:
		return (t - 70) / 8.0
	if t < 104:
		return 1.0
	return 1.0 - (t - 104) / 56.0


func setup(tileset: Dictionary, lvl: Dictionary) -> void:
	tiles = tileset["tiles"]
	names = tileset["names"]
	level = lvl
	w = int(lvl["width"])
	h = int(lvl["height"])
	# Falling is fatal once you are below everything that could catch you: per column, a few tiles
	# under the lowest solid tile in that column or the six either side.
	var low := PackedInt32Array()
	low.resize(w)
	var src: PackedInt32Array = lvl["terrain"]
	for x in w:
		low[x] = -1
		for y in range(h - 1, -1, -1):
			var id := src[y * w + x]
			if id != 0 and tiles[id].get("mask") != null:
				low[x] = y
				break
	kill_y.resize(w)
	for x in w:
		var m := -1
		for k in range(-6, 7):
			m = maxi(m, low[clampi(x + k, 0, w - 1)])
		kill_y[x] = (h if m < 0 else mini(h, m + 5)) * TILE + 24.0 * S
	reset(false)


func reset(from_checkpoint: bool) -> void:
	var keep = check if from_checkpoint else null
	var lit: Array = []
	if from_checkpoint:
		for o in objs:
			if o.get("on", false) and o["type"] == "checkpoint":
				lit.append(o["x"])
	terrain = (level["terrain"] as PackedInt32Array).duplicate()
	loops = []
	objs = []
	goal_x = (w - 2) * TILE
	for o in level["objects"]:
		if o["type"] == "loop":
			loops.append(o)
			continue
		var c: Dictionary = o.duplicate()
		c["alive"] = true
		c["vx"] = -0.4 * S
		c["y0"] = float(o["y"])
		c["x"] = float(o["x"])
		c["y"] = float(o["y"])
		c["on"] = lit.has(o["x"])
		c["ext"] = 0.0
		objs.append(c)
		if o["type"] == "goal":
			goal_x = float(o["x"])
	check = keep
	var start: Dictionary = keep if keep != null else level["spawn"]
	p = {
		"x": float(start["x"]), "y": float(start["y"]), "xsp": 0.0, "ysp": 0.0, "gsp": 0.0, "ang": 0.0,
		"grounded": false, "path": "A", "lock": 0, "jumping": false, "jump_held": false, "dead": false,
		"won": false, "gems": 0, "spin": 0.0, "face": 1, "hit_wall": false, "why": "",
	}
	frame = 0
	frozen = false
	events = []


## cheap copy for look-ahead rollouts; never mutates the terrain
func fork() -> Sim:
	var s := Sim.new()
	s.tiles = tiles
	s.names = names
	s.level = level
	s.w = w
	s.h = h
	s.terrain = terrain
	s.loops = loops
	s.goal_x = goal_x
	s.kill_y = kill_y
	s.frame = frame
	s.check = check
	s.p = p.duplicate()
	s.objs = []
	for o in objs:
		s.objs.append(o.duplicate())
	s.frozen = true
	return s


func tile_at(px: int, py: int):
	var tx := px >> SH
	var ty := py >> SH
	if px < 0 or py < 0 or tx >= w or ty >= h:
		return null
	var id := terrain[ty * w + tx]
	return tiles[id] if id != 0 else null


func solid(px: int, py: int, path: String, oneway: bool = false) -> bool:
	if px < 0 or px >= w * TILE:
		return true # level side walls
	var t = tile_at(px, py)
	if t == null:
		return false
	var mask = t.get("mask")
	if mask == null:
		return false
	if t["kind"] == "oneway" and not oneway:
		return false
	var tp = t.get("path")
	if tp != null and tp != path:
		return false
	return ((int(mask[py & MK]) >> (px & MK)) & 1) == 1


## Cast from (ox, oy) along (dx, dy). Returns {i, t, x, y}: i is the index of the first solid
## pixel (0 = origin; negative when the origin is already inside solid), or null.
func cast(ox: float, oy: float, dx: int, dy: int, path: String, oneway: bool = false, limit: int = 48):
	var x := int(floor(ox))
	var y := int(floor(oy))
	if oneway and solid(x, y, path, true) and not solid(x, y, path, false):
		oneway = false # inside a plank: ignore it
	if not solid(x, y, path, oneway):
		for i in range(1, limit + 1):
			if solid(x + dx * i, y + dy * i, path, oneway):
				return {"i": i, "t": tile_at(x + dx * i, y + dy * i), "x": x + dx * i, "y": y + dy * i}
		return null
	for j in range(1, TILE + 1):
		if not solid(x - dx * j, y - dy * j, path, oneway):
			return {"i": 1 - j, "t": tile_at(x - dx * (j - 1), y - dy * (j - 1)), "x": x - dx * (j - 1), "y": y - dy * (j - 1)}
	return {"i": -TILE, "t": tile_at(x, y), "x": x, "y": y}


## nearest surface under the two "foot" sensors for the given mode
func _feet(mode: int, oneway: bool):
	var d: Vector2i = DIRS[mode]
	var best = null
	for s in [-SENS, SENS]:
		var c = cast(p.x + d.y * s, p.y - d.x * s, d.x, d.y, p.path, oneway, int(R + 14.0 * S))
		if c != null and c.i - R >= -14.0 * S and (best == null or c.i < best.i):
			best = c
	return best


func _angle_from(hit: Dictionary, mode: int) -> float:
	var t = hit.t
	if t != null:
		var ang = t.get("ang")
		if ang != null and ang[mode] != null:
			return float(ang[mode])
	return mode * 90.0


func step(left: bool, right: bool, jump: bool) -> void:
	if p.dead or p.won:
		return
	frame += 1
	if events.size() > 64:
		events.clear()
	p.hit_wall = false
	if p.lock > 0:
		p.lock -= 1
	var dir := 0
	if p.lock == 0:
		dir = (1 if right else 0) - (1 if left else 0)
	if dir != 0:
		p.face = dir
	var pressed: bool = jump and not p.jump_held
	p.jump_held = jump
	if p.grounded:
		_ground(dir, pressed)
	else:
		_air(dir, jump)
	if p.dead:
		return
	p.spin += (p.gsp if p.grounded else p.xsp) / R
	_paths()
	_objects(jump)
	if p.y > kill_y[clampi(int(p.x) >> SH, 0, w - 1)]:
		_die("fell")
	if p.x >= goal_x and not p.dead:
		p.won = true


func _ground(dir: int, jump_pressed: bool) -> void:
	var mode := mode_of(p.ang)
	var s := sin(deg_to_rad(p.ang))
	if mode != 0 or absf(p.gsp) > 0.05 * S or absf(s) > 0.3 or dir != 0:
		p.gsp -= (SLOPE_FLOOR if mode == 0 else SLOPE) * s
	if dir != 0:
		if p.gsp * dir < 0:
			p.gsp += DEC * dir
			if p.gsp * dir > 0:
				p.gsp = 0.5 * S * dir
		elif mode == 0 and absf(p.gsp) < TOP: # no pushing on walls: loops need real speed
			p.gsp = dir * minf(TOP, absf(p.gsp) + ACC)
	elif p.lock == 0:
		p.gsp -= signf(p.gsp) * minf(absf(p.gsp), FRC)
	p.gsp = clampf(p.gsp, -MAX_SPEED, MAX_SPEED)

	if jump_pressed: # jump along the surface normal
		var a := deg_to_rad(p.ang)
		p.xsp = p.gsp * cos(a) - JUMP * sin(a)
		p.ysp = -p.gsp * sin(a) - JUMP * cos(a)
		p.grounded = false
		p.jumping = true
		p.ang = 0.0
		return
	var n := maxi(1, int(ceil(absf(p.gsp) / (3.0 * S))))
	_belt = 0.0
	for k in n:
		var a := deg_to_rad(p.ang)
		p.x += (p.gsp * cos(a)) / n
		p.y -= (p.gsp * sin(a)) / n
		mode = mode_of(p.ang)
		if mode == 0 and p.gsp != 0.0: # walls only matter while upright
			var sx := int(signf(p.gsp))
			var c = cast(p.x, p.y, sx, 0, p.path, false, int(R) + 1)
			if c != null and c.i < R:
				if c.t != null and c.t["kind"] == "hazard":
					_die("spikes")
					return
				p.x += sx * (c.i - R)
				p.gsp = 0.0
				p.hit_wall = true
		var hit = _feet(mode, mode == 0)
		if hit == null or hit.i - R > 14.0 * S:
			_leave()
			return
		var d: Vector2i = DIRS[mode]
		var adj: float = hit.i - R
		p.x += d.x * adj
		p.y += d.y * adj
		p.ang = _angle_from(hit, mode)
		if hit.t != null and hit.t["kind"] == "hazard":
			_die("spikes")
			return
		_belt = float(hit.t.get("belt", 0)) if hit.t != null and hit.t.get("belt") != null else 0.0
	if _belt != 0.0:
		p.x += _belt * 1.5 * S # conveyor carries you along
	if mode_of(p.ang) != 0 and absf(p.gsp) < SLIP:
		_leave()
		p.lock = 30


func _leave() -> void:
	var a := deg_to_rad(p.ang)
	p.xsp = p.gsp * cos(a)
	p.ysp = -p.gsp * sin(a)
	p.grounded = false
	p.jumping = false
	p.ang = 0.0


func _land(hit: Dictionary, mode: int) -> void:
	p.ang = _angle_from(hit, mode)
	var a := deg_to_rad(p.ang)
	if absf(sin(a)) < 0.4 and mode == 0:
		p.gsp = p.xsp
	else:
		p.gsp = p.xsp * cos(a) - p.ysp * sin(a)
	if p.ysp > 3.0 * S:
		events.append({"type": "land", "x": p.x, "y": p.y + R})
	p.grounded = true
	p.jumping = false


func _air(dir: int, jump_held: bool) -> void:
	p.ysp = minf(16.0 * S, p.ysp + GRAV)
	if p.jumping and not jump_held and p.ysp < -JUMP_CUT:
		p.ysp = -JUMP_CUT
	if dir != 0 and p.xsp * dir < TOP:
		p.xsp += AIR * dir
	var n := maxi(1, int(ceil(maxf(absf(p.xsp), absf(p.ysp)) / (3.0 * S))))
	for k in n:
		p.x += p.xsp / n
		p.y += p.ysp / n
		for sx in [-1, 1]:
			var c = cast(p.x, p.y, sx, 0, p.path, false, int(R) + 1)
			if c != null and c.i < R and c.i > -R:
				p.x += sx * (c.i - R)
				if p.xsp * sx > 0:
					p.xsp = 0.0
					p.hit_wall = true
		if p.ysp >= 0:
			var hit = _feet(0, true)
			if hit != null and hit.i - R <= 0:
				var plank: bool = hit.t != null and hit.t["kind"] == "oneway"
				if plank and hit.i - R < -(p.ysp / n) - 2.0 * S:
					continue # came from below/inside: fall through
				if hit.t != null and hit.t["kind"] == "hazard":
					_die("spikes")
					return
				p.y += hit.i - R
				_land(hit, 0)
				return
		else:
			var hit = _feet(2, false)
			if hit != null and hit.i - R < 0:
				p.y -= hit.i - R
				var a := _angle_from(hit, 2)
				if hit.t != null and hit.t.get("block") != null:
					_bump(hit)
					p.ysp = 0.0
				elif (a > 90 and a <= 135) or (a >= 225 and a < 270):
					_land(hit, 2) # re-attach to curved ceiling
					return
				else:
					p.ysp = 0.0


func _bump(hit: Dictionary) -> void:
	if frozen:
		return
	var i: int = (int(hit.y) >> SH) * w + (int(hit.x) >> SH)
	var b = hit.t["block"]
	if b == "bonus":
		terrain[i] = int(names["used"])
		p.gems += 1
		events.append({"type": "bonus", "x": hit.x, "y": hit.y})
	elif b == "brick":
		terrain[i] = 0
		events.append({"type": "brick", "x": hit.x, "y": hit.y})


## Loop path switching. Each loop's lower-left quarter is only solid on path B and its
## lower-right quarter only on path A. Left of a loop you are on A (so you can run in through
## the ring and up the right side); crossing the top flips you to B so the left side catches
## you and the right side lets you out. Mirrored when coming from the right.
func _paths() -> void:
	for L in loops:
		if p.x < L.x - 24.0 * S or p.x > L.x + L.w + 24.0 * S or p.y < L.y - 8.0 * S or p.y > L.y + L.h + TILE:
			continue
		if p.x < L.x + 8.0 * S:
			p.path = "A"
		elif p.x > L.x + L.w - 8.0 * S:
			p.path = "B"
		elif p.y < L.cy:
			p.path = "B" if p.x < L.cx else "A"


func _objects(jump: bool) -> void:
	var H := TILE / 2.0
	for o in objs:
		if not o.alive or absf(o.x - p.x) > 400.0 * S:
			continue
		var type: String = o.type
		if type == "flyer":
			o.y = o.y0 + roundf(sin((frame + o.x) / 22.0) * 0.9 * TILE)
		elif type == "vent": # steam vent: a spring that only fires part of the time
			o.on = posmod(frame + int(o.get("phase", 0)), VENT_CYCLE) < VENT_ON
			if o.on and absf(p.x - (o.x + H)) < R + 6.0 * S and p.y > o.y - 3 * TILE and p.y < o.y + TILE:
				p.ysp = -9.5 * S
				p.xsp = (p.gsp if p.grounded else p.xsp) * 0.2
				p.grounded = false
				p.jumping = false
				p.ang = 0.0
			continue
		elif type == "crusher": # press: stops short of the floor, so it only gets you if you jump
			o.ext = crusher_ext(frame + int(o.get("phase", 0))) * float(o.reach)
			if p.x + R > o.x and p.x - R < o.x + 2 * TILE and p.y - R < o.y + o.ext and p.y + R > o.y:
				_die("crushed")
			continue
		elif type == "checkpoint":
			if not o.on and absf(p.x - (o.x + H)) < R + 6.0 * S and absf(p.y - o.y) < 2 * TILE:
				o.on = true
				check = {"x": o.x + H, "y": o.y + TILE - R - 1}
				events.append({"type": "check", "x": o.x + H, "y": o.y})
			continue
		elif type == "walker":
			var f := -1 if o.vx < 0 else 1
			if solid(int(floor(o.x + H + f * 9.0 * S)), int(o.y + H), "A") or not solid(int(floor(o.x + H + f * H)), int(o.y) + TILE + 1, "A", true):
				o.vx = -o.vx
			else:
				o.x += o.vx
		var dx: float = p.x - (o.x + H)
		var dy: float = p.y - (o.y + H)
		if type == "goal" or absf(dx) > R + 6.0 * S or absf(dy) > R + 6.0 * S:
			continue
		if type == "gem":
			o.alive = false
			p.gems += 1
			events.append({"type": "gem", "x": o.x + H, "y": o.y + H})
		elif type == "spring" and dy < 2.0 * S: # springs send you up, not along
			var power = o.get("power")
			p.ysp = -(float(power) * S if power != null else SPRING)
			p.xsp = (p.gsp if p.grounded else p.xsp) * 0.2
			events.append({"type": "boost", "x": p.x, "y": p.y})
			p.grounded = false
			p.jumping = false
			p.ang = 0.0
			p.y -= 2.0 * S
		elif type == "booster" and p.grounded:
			var bd := float(o.get("dir", 1))
			if p.gsp * bd < BOOST:
				p.gsp = bd * BOOST
				events.append({"type": "boost", "x": p.x, "y": p.y})
		elif type == "walker" or type == "flyer":
			if not p.grounded and p.ysp > 0 and dy < -R * 0.5:
				o.alive = false
				events.append({"type": "bop", "x": o.x + H, "y": o.y + H})
				p.ysp = -JUMP if jump else -3.5 * S
			elif absf(dx) < R + 4.0 * S and absf(dy) < R + 4.0 * S:
				_die("enemy")


func _die(why: String) -> void:
	p.dead = true
	p.why = why
