'use strict'

import Vue from 'vue'
import Vuex from 'vuex'
import { getField, updateField } from 'vuex-map-fields'

import Boards from './Boards.js'
import Template from './Template.js'

Vue.use(Vuex);

export default new Vuex.Store({
	strict: true,
	state: {
		board: Boards.getBoard(Template.getDefaultTemplate().board),	// Selected board properties
		machine: 'custom',												// Selected template name
		preset: Template.getDefaultTemplate(),							// Preset of the loaded machine (machine defaults)
		customTemplate: Template.getDefaultTemplate(),					// Properties of the custom config template (if machine is not 'custom')
		template: Template.getDefaultTemplate()							// Properties of the template being edited
	},
	getters: {
		getField,

		canAddExtruder(state) { return state.template.drives.length < state.board.maxDrives; },
		canRemoveExtruder(state) { return state.template.drives.length > 3; },

		canAddNozzle(state) {
			const maxNozzles = state.board.maxHeaters -
				(state.template.bed.present ? 1 : 0) -
				(state.template.chamber.present ? 1 : 0) -
				((state.template.probe.type === 'bltouch' && state.template.probe.pwm_channel < state.board.maxHeaters) ? 1 : 0);
			return state.template.num_nozzles < maxNozzles;
		},
		canRemoveNozzle(state) { return state.template.num_nozzles > 0; },

		canRemoveTool(state) { return state.template.tools.length > 0; },

		canAddFan(state) { return state.template.fans.length < state.board.maxFans; },
		canRemoveFan(state) { return state.template.fans.length > 0; }
	},
	mutations: {
		updateField,

		setTemplate(state, { name, data }) {
			if (state.machine === 'custom') {
				// Save custom template properties.
				// No need to perform validation here, it's already been checked at this point
				state.customTemplate = Template.copy(state.template);
			}

			if (name !== 'custom') {
				// Bring the selected template up-to-date
				Template.update(data);
			} else {
				// Restore the previous custom template
				data = state.customTemplate;
			}

			// Assign the new template
			state.board = Boards.getBoard(data.board);
			const seriesResistor = (data.heaters.length > 1 && data.heaters[1]) ? data.heaters[1].series
										: (data.heaters.length > 0 && data.heaters[0]) ? data.heaters[0].series
											: null;
			if (seriesResistor) {
				state.board.seriesResistor = seriesResistor;
			}
			state.machine = name;
			state.preset = Template.copy(data);
			state.template = data;
		},

		setBoard(state, board) {
			const newBoard = Boards.getBoard(board);

			// Update microstepping if applicable
			if ((state.board.microstepping != newBoard.microstepping)  ||
				(state.board.microsteppingInterpolation != newBoard.microsteppingInterpolation)) {
				state.template.drives.forEach(function(drive) {
					if (newBoard.microstepping) {
						drive.microstepping_interpolation = (drive.microstepping == 16) ||
							(drive.microstepping_interpolation && newBoard.microsteppingInterpolation);
					} else {
						drive.microstepping = 16;
						drive.microstepping_interpolation = false;
					}
				});
			}

			// Update series resistors
			state.preset.heaters.forEach(function(heater) {
				if (heater !== null) {
					heater.series = newBoard.seriesResistor;
				}
			});
			state.template.heaters.forEach(function(heater) {
				if (heater !== null && heater.series === state.board.seriesResistor) {
					heater.series = newBoard.seriesResistor;
				}
			});

			// Update board
			state.board = newBoard;
			state.template.board = board;
		},
		setBoardSeriesResistor(state, value) {
			state.board.seriesResistor = value;
			state.preset.heaters.forEach(function(heater) {
				heater.series = value;
			});
			state.template.heaters.forEach(function(heater) {
				if ((heater.series === 1000 && value === 4700) ||
					(heater.series === 4700 && value === 1000)) {
					heater.series = value;
				}
			});
		},
		setFirmware(state, firmware) {
			if (firmware < 2) {
				state.template.display.spi_frequency = 2000000;
			}
			if (firmware < 2.01) {
				state.template.fans.forEach((fan) => fan.name = '');
			}
			state.template.firmware = firmware;
		},
		setGeometry(state, geometry) {
			state.template.geometry.type = geometry;

			// Update defaults depending on the selected motion system
			if (geometry === 'delta') {
				state.template.drives.forEach(function(drive, index) {
					if (drive.steps_per_mm === (index < 2) ? 80 : ((index === 2) ? 4000 : 420)) { drive.steps_per_mm = (index < 3) ? 80 : 663; };
					if (drive.instant_dv === (index < 2) ? 15 : ((index === 2) ? 0.2 : 2)) { drive.instant_dv = 20; };
					if (drive.max_speed === (index < 2) ? 100 : ((index === 2) ? 3 : 20)) { drive.max_speed = (index < 3) ? 300 : 20; };
					if (drive.acceleration === (index < 2) ? 500 : ((index === 2) ? 20 : 250)) { drive.acceleration = 1000; };
					if (drive.current == 800) { drive.current = (index < 3) ? 1000 : 800; };
				});

				if (state.template.drives[2].endstop_type == 3) { state.template.drives[2].endstop_type = 1; }
				state.preset.drives[2].endstop_type = 1;

				state.preset.drives.forEach(function(drive, index) {
					drive.steps_per_mm = (index < 3) ? 80 : 663;
					drive.instant_dv = 20;
					drive.max_speed = (index < 3) ? 300 : 20;
					drive.acceleration = 1000;
					drive.current = (index < 3) ? 1000 : 800;
				});

				if (state.template.probe.points.length !== state.peripheral_points + state.halfway_points + 1) {
					Template.updateProbePoints(state.template);
				}
			} else {
				state.template.drives.forEach(function(drive, index) {
					if (drive.steps_per_mm === (index < 3) ? 80 : 663) { drive.steps_per_mm = (index < 2) ? 80 : ((index === 2) ? 4000 : 420); };
					if (drive.instant_dv === 20) { drive.instant_dv = (index < 2) ? 15 : ((index === 2) ? 0.2 : 2); }
					if (drive.max_speed === (index < 3) ? 300 : 20) { drive.max_speed = (index < 2) ? 100 : ((index === 2) ? 3 : 20); }
					if (drive.acceleration === 1000) { drive.acceleration = (index < 2) ? 500 : ((index === 2) ? 20 : 250); }
					if (drive.current === (index < 3) ? 1000 : 800) { drive.current = 800; }
				});

				if (state.template.drives[2].endstop_type == 1) { state.template.drives[2].endstop_type = 3; }
				state.preset.drives[2].endstop_type = 3;

				state.preset.drives.forEach(function(drive, index) {
					drive.steps_per_mm = (index < 2) ? 80 : ((index === 2) ? 4000 : 420);
					drive.instant_dv = (index < 2) ? 15 : ((index === 2) ? 0.2 : 2);
					drive.max_speed = (index < 2) ? 100 : ((index === 2) ? 3 : 20);
					drive.acceleration = (index < 2) ? 500 : ((index === 2) ? 20 : 250);
					drive.current = 800;
				});
			}
		},
		setAxisMinimum(state, { axis, value }) {
			if (axis === 0 && state.template.mesh.x_min == state.template.geometry.mins[0] + state.template.compensation_x_offset) {
				state.template.mesh.x_min = value + state.template.compensation_x_offset;
			} else if (axis === 1 && state.template.mesh.y_min == state.template.geometry.mins[1] + state.template.compensation_y_offset) {
				state.template.mesh.y_min = value + state.template.compensation_y_offset;
			}
			state.template.geometry.mins[axis] = value;
		},
		setAxisMaximum(state, { axis, value }) {
			state.template.geometry.maxes[axis] = value;
		},
		setPrintRadius(state, radius) {
			if (state.template.probe_radius == state.template.geometry.print_radius) {
				state.template.probe_radius = radius;
			}
			state.template.geometry.print_radius = radius;
		},

		addExtruder(state) {
			const drive = Object.assign({}, (state.template.drives.length > 3)
				? state.template.drives[state.template.drives.length - 1]
					: state.preset.drives[state.preset.drives.length - 1]);
			drive.driver = state.template.drives.length;
			if (!state.board.microstepping) {
				drive.microstepping = 16;
				drive.microstepping_interpolation = false;
			}
			state.template.drives.push(drive);
		},
		removeExtruder(state) {
			state.template.drives.pop();
		},
		updateDrive(state, { drive, forwards, microstepping, interpolated, stepsPerMm, instantDv, maxSpeed, acceleration, current, driver, et, el }) {
			if (forwards !== undefined) { state.template.drives[drive].direction = forwards ? 1 : 0; }
			if (microstepping !== undefined) { state.template.drives[drive].microstepping = microstepping; }
			if (interpolated !== undefined) { state.template.drives[drive].microstepping_interpolation = interpolated; }
			if (stepsPerMm !== undefined) { state.template.drives[drive].steps_per_mm = stepsPerMm; }
			if (instantDv !== undefined) { state.template.drives[drive].instant_dv = instantDv; }
			if (maxSpeed !== undefined) { state.template.drives[drive].max_speed = maxSpeed; }
			if (acceleration !== undefined) { state.template.drives[drive].acceleration = acceleration; }
			if (current !== undefined) { state.template.drives[drive].current = current; }
			if (driver !== undefined) { state.template.drives[drive].driver = driver; }
			if (et !== undefined) { state.template.drives[drive].endstop_type = et; }
			if (el !== undefined) { state.template.drives[drive].endstop_location = el; }
		},

		setProbeType(state, type) {
			// Set default probe speed when switching to/from effector
			if (type == 'effector') {
				state.template.probe.speed = 20;
			} else if (state.template.probe.type === 'effector') {
				state.template.probe.speed = state.preset.probe.speed;
			}

			// Cannot use Z probe as endstop type if there is none
			if (type === 'noprobe') {
				state.template.drives.forEach(function(drive) {
					if (drive.endstop_type === 2) {
						drive.endstop_type = 0;
					}
				});
			}

			state.template.probe.type = type;
		},

		addNozzle(state) {
			state.template.num_nozzles++;
			Template.fixNozzles(state.template, state.preset);

			const heaterAdded = (state.template.num_nozzles === 1 && state.template.bed_is_nozzle) ? 0 : state.template.heaters.length - 1;
			state.template.fans.forEach(function(fan) {
				if (fan.thermostatic) {
					fan.heaters.push(heaterAdded);
				}
			});
		},
		removeNozzle(state) {
			const heaterToDelete = (state.template.num_nozzles === 1 && state.template.bed_is_nozzle) ? 0 : state.template.heaters.length - 1;

			state.template.num_nozzles--;
			Template.fixNozzles(state.template, state.preset);

			state.template.fans.forEach(function(fan) {
				if (fan.thermostatic) {
					fan.heaters = fan.heaters.filter((heater) => heater !== heaterToDelete);
				}
			});
		},
		updateBed(state, { present, heater, isNozzle }) {
			if (present !== undefined) { state.template.bed.present = present; }
			if (heater !== undefined) { state.template.bed.heater = heater; }
			if (isNozzle !== undefined) {
				state.template.bed_is_nozzle = isNozzle;
				if (isNozzle) {
					if (state.template.bed.heater === 0) {
						state.template.bed.heater = (state.template.chamber.present && state.template.chamber.heater === 1) ? 2 : 1;
					}
					if (state.template.chamber.heater === 0) {
						state.template.chamber.heater = (state.template.bed.present && state.template.bed.heater === 1) ? 2 : 1;
					}
				}
			}
			Template.fixNozzles(state.template, state.preset);
		},
		updateChamber(state, { present, heater }) {
			if (present !== undefined) { state.template.chamber.present = present; }
			if (heater !== undefined) { state.template.chamber.heater = heater; }
			Template.fixNozzles(state.template, state.preset);
		},
		updateHeater(state, { heater, tempLimit, pwmLimit, thermistor, beta, c, channel }) {
			if (tempLimit !== undefined) { state.template.heaters[heater].temp_limit = tempLimit; }
			if (pwmLimit !== undefined) { state.template.heaters[heater].scale_factor = pwmLimit; }
			if (thermistor !== undefined) { state.template.heaters[heater].thermistor = thermistor; }
			if (beta !== undefined) { state.template.heaters[heater].beta = beta; }
			if (c !== undefined) { state.template.heaters[heater].c = c; }
			if (channel !== undefined) { state.template.heaters[heater].channel = channel; }
			Template.fixNozzles(state.template, state.preset);
		},

		addFan(state) {
			const fan = Object.assign({}, state.preset.fans[Math.min(state.template.fans.length, state.preset.fans.length - 1)]);
			if (fan.thermostatic) {
				fan.heaters = [];
				state.template.heaters.forEach(function(heater, index) {
					if ((!state.template.bed.present || state.template.bed.heater !== index) &&
						(!state.template.chamber.present || state.template.chamber.heater !== index)) {
						fan.heaters.push(index);
					}
				});
			}
			state.template.fans.push(fan);
		},
		removeFan(state) {
			state.template.fans.pop();
		},

		addTool(state) {
			const tool = Object.assign({}, state.preset.tools[0]);
			tool.number = state.template.tools.length;
			if (state.template.bed_is_nozzle && tool.number === 0) {
				tool.heaters = [0];
			} else {
				tool.heaters = [];

				let count = 0;
				for (let i = 0; i < state.template.heaters.length; i++) {
					if ((!state.template.bed.present || state.template.bed.heater !== i) &&
						(!state.template.chamber.present || state.template.chamber.heater !== i)) {
						if (tool.number === count) {
							tool.heaters.push(i);
							break;
						}
						count++;
					}
				}
			}
			if (tool.number + 3 < state.template.drives.length) {
				tool.extruders = [tool.number];
			} else {
				tool.extruders = [];
			}
			state.template.tools.push(tool);
		},
		removeTool(state) {
			state.template.tools.pop();
		},
		setToolExtruders(state, { index, extruders }) {
			const tool = state.template.tools[index];
			tool.extruders = extruders;

			// Recalculate mix ratios
			if (Math.max(tool.mix_ratio.length, 1) !== Math.max(tool.extruders.length, 1)) {
				tool.mix_ratio = [];
				if (tool.extruders.length > 1) {
					let remaining = 1;
					for (let i = 1; i < tool.extruders.length; i++) {
						const ratio = parseFloat((1 / tool.extruders.length).toFixed(2));
						remaining -= ratio;
						tool.mix_ratio.push(ratio);
					}
					tool.mix_ratio.push(parseFloat(remaining.toFixed(2)));
				}
			}

			// Make sure only valid extruders and heaters are assigned
			const filteredExtruders = tool.extruders.filter((drive) => drive + 3 < state.template.drives.length);
			if (filteredExtruders.length != tool.extruders.length) {
				tool.extruders = filteredExtruders;
			}

			const filteredHeaters = tool.heaters.filter(heater => (heater == 0 && state.template.bed_is_nozzle) ||
				(heater > 0 && ((!state.template.bed.present || state.template.bed.heater !== heater) &&
					(!state.template.chamber.present || state.template.chamber.heater !== heater) &&
					(heater < state.template.heaters.length && state.template.heaters[heater] !== null))));
			if (filteredHeaters.length !== tool.heaters.length) {
				tool.heaters = filteredHeaters;
			}
		},

		updateProbePoints(state) {
			Template.updateProbePoints(state.template);
		},
		setOrthogonalDeviation(state, { axis, value }) {
			state.template.orthogonal.deviations[axis] = value;
		},

		setDisplayMenu(state, { name, value }) {
			for (let i = 0; i < state.template.display.menus.length; i++) {
				const item = state.template.display.menus[i];
				if (item.name === name) {
					item.value = value;
					return;
				}
			}

			state.template.display.menus.push({ name, value });
		},
		removeDisplayMenu(state, name) {
			for (let i = 0; i < state.template.display.menus.length; i++) {
				if (state.template.display.menus[i].name === name) {
					state.template.display.menus.splice(i, 1);
					return;
				}
			}
		},
		setDisplayImage(state, { name, value }) {
			for (let i = 0; i < state.template.display.images.length; i++) {
				const item = state.template.display.images[i];
				if (item.name === name) {
					item.value = value;
					return;
				}
			}

			state.template.display.images.push({ name, value });
		},
		removeDisplayImage(state, name) {
			for (let i = 0; i < state.template.display.images.length; i++) {
				if (state.template.display.images[i].name === name) {
					state.template.display.images.splice(i, 1);
					return;
				}
			}
		}
	}
});
