extends Node2D
## The player: a photo head riding upright inside a clear rolling sphere, with squash and
## stretch. Drawn with linear filtering at the full viewport resolution so the photo stays sharp.

const TILE := 32.0

var main: Node
var head: Texture2D
var trail: Array = []


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if main == null or main.sim == null:
		return
	var p: Dictionary = main.sim.p
	if p.dead or (main.phase == "intro" and main.phase_t < main.INTRO_HOLD + 8):
		return # hidden behind the title card
	var m: Dictionary = main.morph
	var cam: Vector2 = main.world.cam.round()
	var R := Sim.R * 1.12
	var rad := deg_to_rad(p.ang)
	var lift := R - Sim.R # the sphere is a little bigger than the hitbox: lift it so it rests on the surface

	for i in trail.size(): # speed afterimages
		var q: Dictionary = trail[i]
		if q.fast and i % 3 == 0 and i <= 5:
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			draw_circle(Vector2(q.x, q.y - lift) - cam, R, Color(0.75, 0.9, 1.0, 0.05 + i * 0.02))

	var sv: float = m.v
	var along := 1.0 + sv
	var across := 1.0 / sqrt(maxf(0.5, along))
	var centre := Vector2(p.x - sin(rad) * lift, p.y - cos(rad) * lift) - cam
	if p.grounded and sv < 0.0: # keep the squashed side on the ground
		centre += Vector2(sin(rad), cos(rad)) * R * -sv * 0.9
	var axis: float = m.axis
	var squash := Transform2D(axis, Vector2.ZERO) * Transform2D(0.0, Vector2(along, across), 0.0, Vector2.ZERO) * Transform2D(-axis, Vector2.ZERO)
	var base := Transform2D(0.0, centre) * squash

	draw_set_transform_matrix(base)
	draw_circle(Vector2.ZERO, R, Color(0.6, 0.82, 1.0, 0.2))                 # glass
	draw_circle(Vector2(-R * 0.3, -R * 0.35), R * 0.5, Color(1, 1, 1, 0.12)) # soft highlight

	# head: upright to the surface, facing the way you move, leaning into the run
	var hr := R * 0.8
	var bob := sin(p.spin * 2.0) * minf(1.0, absf(p.gsp) / TILE) * 0.8 + float(m.lag) * R
	var head_xf := Transform2D(-rad if p.grounded else 0.0, Vector2.ZERO)
	head_xf = head_xf * Transform2D(Vector2(float(p.face), 0.0), Vector2(-float(m.lean), 1.0), Vector2.ZERO) # flip + shear: chin stays, crown leans
	var fl := absf(float(m.lag))
	head_xf = head_xf * Transform2D(0.0, Vector2(1.0 + fl * 0.25 - sv * 0.15, 1.0 - fl * 0.25 + sv * 0.15), 0.0, Vector2.ZERO)
	draw_set_transform_matrix(base * head_xf)
	if head != null:
		draw_texture_rect(head, Rect2(-hr, -hr + bob, hr * 2.0, hr * 2.0), false)

	# shell details turn with the roll
	var spin := Transform2D(float(p.spin), Vector2.ZERO)
	for tilt in [0.0, PI / 2.0]:
		draw_set_transform_matrix(base * spin * Transform2D(tilt, Vector2.ZERO) * Transform2D(0.0, Vector2(0.97, 0.3), 0.0, Vector2.ZERO))
		draw_arc(Vector2.ZERO, R, 0.0, TAU, 40, Color(1, 1, 1, 0.34), 1.5, true)
	draw_set_transform_matrix(base * spin)
	for i in 8:
		var a := i * PI / 4.0 + 0.39
		draw_circle(Vector2(cos(a), sin(a)) * R * 0.84, 1.0, Color(1, 1, 1, 0.7))
	draw_set_transform_matrix(base)
	draw_arc(Vector2.ZERO, R - 0.4, 0.0, TAU, 64, Color(0.12, 0.24, 0.55, 0.55), 1.6, true)
	draw_arc(Vector2.ZERO, R - 1.3, 0.0, TAU, 64, Color(1, 1, 1, 0.8), 0.9, true)
	draw_arc(Vector2.ZERO, R * 0.8, -2.7, -1.85, 12, Color(1, 1, 1, 0.9), 2.4, true) # glint
