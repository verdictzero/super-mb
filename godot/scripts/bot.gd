class_name Bot
extends RefCounted
## Playtest bot (port of src/engine/bot.js). It holds right and uses look-ahead rollouts of the
## real simulation to decide when to jump and for how long. Used here for auto-play.

const HOLDS := [2, 8, 16, 40]
const DELAYS := [0, 4, 10, 18]

var hold := 0
var air := 1


## Hold right, press jump at frame `delay` for `hold_frames` frames, stop at the first landing.
static func try_jump(sim: Sim, delay: int, hold_frames: int, max_frames: int = 150) -> Dictionary:
	var f := sim.fork()
	var jumped := false
	var landed := false
	for i in max_frames:
		var jump := hold_frames > 0 and i >= delay and i < delay + hold_frames
		if jump and f.p.grounded:
			jumped = true
		f.step(false, true, jump)
		if f.p.dead or f.p.won:
			break
		if jumped and i > delay and f.p.grounded:
			landed = true
			break
	return {"f": f, "dead": f.p.dead, "won": f.p.won, "landed": landed, "x": INF if f.p.won else f.p.x}


## Can play continue from this state? Looks up to `depth` further jumps ahead.
static func viable(sim: Sim, depth: int) -> bool:
	var c := try_jump(sim, 0, 0, 70 if depth > 0 else 12)
	if not c.dead:
		return true
	if depth == 0:
		return false
	for delay in DELAYS:
		for h in HOLDS:
			var r := try_jump(sim, delay, h)
			if r.won or (r.landed and viable(r.f, depth - 1)):
				return true
	return false


## while airborne: does holding direction d lead to a landing we can continue from?
static func air_landing(sim: Sim, d: int, hold_frames: int) -> bool:
	var f := sim.fork()
	var left := hold_frames
	for i in 200:
		if f.p.grounded:
			break
		f.step(d < 0, d > 0, left > 0)
		left -= 1
		if f.p.dead:
			return false
		if f.p.won:
			return true
	return f.p.grounded and viable(f, 1)


## best jump starting `delay` frames from now whose landing can be continued from, or null
static func best(sim: Sim, delay: int):
	var b = null
	for h in HOLDS:
		var r := try_jump(sim, delay, h)
		if (r.won or (r.landed and viable(r.f, 1))) and (b == null or r.x > b.x):
			b = {"x": r.x, "hold": h}
	return b


## Returns [left, right, jump] for this frame.
func input(sim: Sim) -> Array:
	var p: Dictionary = sim.p
	if not p.grounded: # steer: keep right unless that landing is fatal, then try drifting or pulling back
		if sim.frame % 4 == 0:
			air = 1
			for d in [1, 0, -1]:
				if air_landing(sim, d, hold):
					air = d
					break
		var jump := hold > 0
		hold -= 1
		return [air < 0, air > 0, jump]
	hold = 0
	air = 1
	if p.jump_held or Sim.mode_of(p.ang) != 0:
		return [false, true, false] # release before the next press
	for L in sim.loops: # inside a loop: just run
		if p.x > L.x and p.x < L.x + L.w and p.y > L.y and p.y < L.y + L.h + 32.0:
			return [false, true, false]
	var base := try_jump(sim, 0, 0, 90)
	if base.won or (not base.dead and base.x - p.x >= 16.0):
		return [false, true, false]
	if base.dead and best(sim, 3) != null:
		return [false, true, false] # a later jump still works: wait for the edge
	var now = best(sim, 0)
	if now != null and (base.dead or now.x > base.x + 16.0):
		hold = now.hold - 1
		return [false, true, true]
	return [false, true, false]
