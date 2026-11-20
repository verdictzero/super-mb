extends Node2D
## On-screen controls for touch screens: left / right on the left thumb, jump on the right
## thumb, and small buttons along the top for restart, CRT, bot and next level. Handles several
## fingers at once, and a finger may slide between left and right without lifting.

var main: Node
var held := {}            # finger index -> name of the hold button under it
var shown := false


func _ready() -> void:
	shown = DisplayServer.is_touchscreen_available() or OS.get_cmdline_user_args().has("--touch")
	get_viewport().size_changed.connect(queue_redraw)


## name -> [centre, radius, label, is_hold]
func buttons() -> Dictionary:
	var s := get_viewport().get_visible_rect().size
	var u := s.y / 720.0
	return {
		"left": [Vector2(140 * u, s.y - 140 * u), 92.0 * u, "<", true],
		"right": [Vector2(350 * u, s.y - 140 * u), 92.0 * u, ">", true],
		"jump": [Vector2(s.x - 170 * u, s.y - 160 * u), 120.0 * u, "JUMP", true],
		"next": [Vector2(s.x - 70 * u, 64 * u), 46.0 * u, "NEXT", false],
		"bot": [Vector2(s.x - 180 * u, 64 * u), 46.0 * u, "BOT", false],
		"crt": [Vector2(s.x - 290 * u, 64 * u), 46.0 * u, "CRT", false],
		"restart": [Vector2(s.x - 400 * u, 64 * u), 46.0 * u, "RETRY", false],
	}


func is_held(button: String) -> bool:
	return held.values().has(button)


func _button_at(pos: Vector2) -> String:
	var all := buttons()
	for key in all:
		if pos.distance_to(all[key][0]) <= all[key][1] * 1.15: # a little forgiving
			return key
	return ""


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if not shown: # first touch on a device that did not report a touch screen
			shown = true
		if event.pressed:
			var key := _button_at(event.position)
			if key == "":
				return
			if buttons()[key][3]:
				held[event.index] = key
			else:
				main.touch_tap(key)
		else:
			held.erase(event.index)
		queue_redraw()
	elif event is InputEventScreenDrag and held.has(event.index):
		var key := _button_at(event.position)
		if (key == "left" or key == "right") and held[event.index] != "jump" and held[event.index] != key:
			held[event.index] = key
			queue_redraw()


func _draw() -> void:
	if not shown:
		return
	var font := ThemeDB.fallback_font
	var all := buttons()
	for key in all:
		var c: Vector2 = all[key][0]
		var r: float = all[key][1]
		var down := is_held(key)
		draw_circle(c, r, Color(1, 1, 1, 0.34 if down else 0.14))
		draw_arc(c, r, 0.0, TAU, 48, Color(1, 1, 1, 0.75 if down else 0.45), maxf(2.0, r * 0.05), true)
		if key == "left" or key == "right": # arrow
			var d := -1.0 if key == "left" else 1.0
			draw_colored_polygon(PackedVector2Array([c + Vector2(d * r * 0.42, 0), c + Vector2(-d * r * 0.26, -r * 0.4), c + Vector2(-d * r * 0.26, r * 0.4)]), Color(1, 1, 1, 0.85))
		else:
			var size := int(r * (0.36 if all[key][3] else 0.42))
			var w := font.get_string_size(all[key][2], HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
			draw_string(font, c + Vector2(-w / 2.0, size * 0.36), all[key][2], HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(1, 1, 1, 0.9))
