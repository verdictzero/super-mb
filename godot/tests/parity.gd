extends SceneTree
## Headless check that the GDScript simulation matches the JavaScript one: the bot plays each
## level and prints the frame it reached the goal on, the gems collected and the final position.
## Run: godot --headless --path godot -s res://tests/parity.gd  (compare with `node scripts/parity.js`)

func _init() -> void:
	var tileset: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/tileset.json"))
	var index: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/levels/index.json"))
	var only := OS.get_cmdline_user_args()
	for info in index:
		if not only.is_empty() and not only.has(info["id"]):
			continue
		var raw: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/levels/%s.json" % info["id"]))
		for key in ["terrain", "decor"]:
			var packed := PackedInt32Array()
			packed.resize(raw[key].size())
			for i in raw[key].size():
				packed[i] = int(raw[key][i])
			raw[key] = packed
		var sim := Sim.new()
		sim.setup(tileset, raw)
		var bot := Bot.new()
		var t0 := Time.get_ticks_msec()
		var limit := int(raw["width"]) * 40 + 1200
		while sim.frame < limit and not sim.p.dead and not sim.p.won:
			var k := bot.input(sim)
			sim.step(k[0], k[1], k[2])
		print("%s frames=%d won=%s dead=%s gems=%d x=%.2f y=%.2f ms=%d" % [info["id"], sim.frame, sim.p.won, sim.p.dead, sim.p.gems, sim.p.x, sim.p.y, Time.get_ticks_msec() - t0])
	quit()
