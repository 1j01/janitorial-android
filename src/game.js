const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

canvas.tabIndex = 0;
canvas.style.touchAction = "none";
canvas.setAttribute("touch-action", "none"); // for PEP.js

document.body.append(canvas);

window.AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const viewport = { centerX: 0, centerY: 0, scale: 1 };
let keys = {};
let pointerEventCache = [];
let prevPointerDist = -1;
const enableMarginPanning = false;

let entities = [];
let wind = [];
let currentLevel = {
	entities,
	title: "Custom World",
};
let moves = 0;

const snapX = 15;
const snapY = 18; // or 6 for thin brick heights

const targetFPS = 18;
// let targetFPS = 15;
// addEventListener("mousemove", (event) => {
// 	targetFPS = event.clientX / window.innerWidth * 15;
// });

let lastSimulateTime = 0;
// The higher this value, the less the fps display will reflect temporary variations
// A value of 1 will only keep the last value
const fpsSmoothing = 20;
let smoothedFrameTime = 0;

let showDebug = false;
let muted = false;
let paused = false;
let editing = false;
let testing = false;
let hideInfoBox = false;
let editorUI;
let testsUI;
let levelSelect;
let infoBox;
let toggleInfoButton;
// eslint-disable-next-line no-empty-function, no-unused-vars
let updateEditorUIForLevelChange = (level) => { };

let frameStartTime = 0;
const debugs = {};
const debugWorldSpaceRects = [];
const debug = (subject, ...texts) => {
	debugs[subject] = debugs[subject] || {};
	debugs[subject].time = frameStartTime;
	debugs[subject].text = texts.join(" ");
};
const debugWorldSpaceRect = (x, y, width, height) => {
	if (showDebug) {
		debugWorldSpaceRects.push({ x, y, width, height });
	}
};
// compare junkbot's animations with a video of the original game
// const testVideo = document.createElement("video");
// testVideo.src = "junkbot-test-video.mp4";
// testVideo.loop = true;
// testVideo.muted = true;
// testVideo.currentTime = 2;
// try {
// 	testVideo.currentTime = parseFloat(localStorage.comparisonVideoTime);
// } catch (e) { }
// let aJunkbot;

let messageBox;
let messageBoxContainer;
const showMessageBox = (message) => {
	if (messageBox) {
		messageBoxContainer.remove();
	}
	messageBoxContainer = document.createElement("div");
	messageBoxContainer.className = "dialog-container";
	messageBox = document.createElement("div");
	messageBox.className = "dialog";
	const messageContentEl = document.createElement("div");
	messageContentEl.className = "message-content";
	if (typeof message === "string") {
		messageContentEl.textContent = message;
	} else {
		messageContentEl.append(message);
	}
	messageBox.append(messageContentEl);
	const closeButton = document.createElement("button");
	closeButton.onclick = () => {
		messageBoxContainer.remove();
	};
	closeButton.textContent = "Close";
	closeButton.style.marginTop = "20px";
	messageBox.append(document.createElement("br"));
	messageBox.append(closeButton);
	messageBoxContainer.append(messageBox);
	document.body.append(messageBoxContainer);
	closeButton.focus();
};

const parseLocationHash = (hash = location.hash) => {
	const keyValuePairs = hash.replace(/^#/, "")
		.split("&")
		.map((str) => str.split("="));
	return Object.fromEntries(keyValuePairs);
};

const floor = (x, multiple) => Math.floor(x / multiple) * multiple;

const rectanglesIntersect = (ax, ay, aw, ah, bx, by, bw, bh) => (
	ax + aw > bx &&
	ax < bx + bw &&
	ay + ah > by &&
	ay < by + bh
);

const rectangleLevelBoundsCollisionTest = (x, y, width, height) => {
	const { bounds } = currentLevel;
	if (!bounds) {
		return;
	}
	if (x < bounds.x) {
		return { type: "levelBounds", x: bounds.x - 15, y: bounds.y, width: 15, height: bounds.height };
	}
	if (y < bounds.y) {
		return { type: "levelBounds", x: bounds.x, y: bounds.y - 18, width: bounds.width, height: 18 };
	}
	if (x + width > bounds.x + bounds.width) {
		return { type: "levelBounds", x: bounds.x + bounds.width, y: bounds.y, width: 15, height: bounds.height };
	}
	if (y + height > bounds.y + bounds.height) {
		return { type: "levelBounds", x: bounds.x, y: bounds.y + bounds.height, width: bounds.width, height: 18 };
	}
};
const rectangleCollisionTest = (x, y, width, height, filter) => {
	const boundsHit = rectangleLevelBoundsCollisionTest(x, y, width, height);
	if (boundsHit && filter(boundsHit)) {
		return boundsHit;
	}
	for (const otherEntity of entities) {
		if (
			!otherEntity.grabbed &&
			filter(otherEntity) &&
			rectanglesIntersect(
				x,
				y,
				width,
				height,
				otherEntity.x,
				otherEntity.y,
				otherEntity.width,
				otherEntity.height,
			)
		) {
			return otherEntity;
		}
	}
	return null;
};
const rectangleCollisionAll = (x, y, width, height, filter) => {
	const boundsHit = rectangleLevelBoundsCollisionTest(x, y, width, height);
	return ((boundsHit && filter(boundsHit)) ? [boundsHit] : []).concat(entities.filter((otherEntity) => (
		!otherEntity.grabbed &&
		filter(otherEntity) &&
		rectanglesIntersect(
			x,
			y,
			width,
			height,
			otherEntity.x,
			otherEntity.y,
			otherEntity.width,
			otherEntity.height,
		)
	)));
};
const entityCollisionTest = (entityX, entityY, entity, filter) => (
	// Note: make sure not to use entity.x/y!
	rectangleCollisionTest(
		entityX,
		entityY,
		entity.width,
		entity.height,
		(otherEntity) => otherEntity !== entity && filter(otherEntity)
	)
);
const entityCollisionAll = (entityX, entityY, entity, filter) => (
	// Note: make sure not to use entity.x/y!
	rectangleCollisionAll(
		entityX,
		entityY,
		entity.width,
		entity.height,
		(otherEntity) => otherEntity !== entity && filter(otherEntity)
	)
);
const raycast = ({ startX, startY, width, height, directionX, directionY, maxSteps, entityFilter }) => {
	let steps = 0;
	let x = startX;
	let y = startY;
	while (steps < maxSteps) {
		x += 15 * directionX;
		y += 18 * directionY;
		debugWorldSpaceRect(x, y, width, height);
		const hit = rectangleCollisionTest(x, y, width, height, entityFilter);
		if (hit) {
			return { steps, hit };
		}
		steps += 1;
	}
	return { steps, hit: null };
};

const entitiesWithinSelection = (selectionBox) => {
	const minX = Math.min(selectionBox.x1, selectionBox.x2);
	const maxX = Math.max(selectionBox.x1, selectionBox.x2);
	const minY = Math.min(selectionBox.y1, selectionBox.y2);
	const maxY = Math.max(selectionBox.y1, selectionBox.y2);
	return rectangleCollisionAll(
		minX,
		minY,
		maxX - minX,
		maxY - minY,
		() => true
	);
};

const remove = (array, value) => {
	if (!array) {
		if (window.console) {
			// eslint-disable-next-line no-console
			console.warn(array, value);
		}
	}
	const index = array.indexOf(value);
	if (value !== -1) {
		array.splice(index, 1);
	}
};

const brickColorNames = [
	"white",
	"red",
	"green",
	"blue",
	"yellow",
	"gray",
];
const brickWidthsInStuds = [1, 2, 3, 4, 6, 8];

const makeBrick = ({ x, y, widthInStuds, colorName, fixed = false }) => {
	return {
		type: "brick",
		x,
		y,
		widthInStuds,
		width: widthInStuds * 15,
		height: 18,
		colorName,
		fixed,
	};
};
const makeJunkbot = ({ x, y, facing = 1, armored = false }) => {
	return {
		type: "junkbot",
		x,
		y,
		width: 2 * 15,
		height: 4 * 18,
		facing,
		armored,
		losingShield: false,
		losingShieldTime: 0,
		animationFrame: 0,
		headLoaded: false,
	};
};
const makeGearbot = ({ x, y, facing = 1 }) => {
	return {
		type: "gearbot",
		x,
		y,
		width: 2 * 15,
		height: 2 * 18,
		facing,
		animationFrame: 0,
	};
};
const makeClimbbot = ({ x, y, facing = 1, facingY = 0 }) => {
	return {
		type: "climbbot",
		x,
		y,
		width: 2 * 15,
		height: 2 * 18,
		facing,
		facingY,
		animationFrame: 0,
		energy: 0,
	};
};
const makeFlybot = ({ x, y, facing = 1 }) => {
	return {
		type: "flybot",
		x,
		y,
		width: 2 * 15,
		height: 2 * 18,
		facing,
		animationFrame: 0,
	};
};
const makeEyebot = ({ x, y, facing = 1, facingY = 0 }) => {
	return {
		type: "eyebot",
		x,
		y,
		width: 2 * 15,
		height: 2 * 18,
		facing,
		facingY,
		animationFrame: 0,
	};
};
const makeBin = ({ x, y, facing = 1, scaredy = false }) => {
	return {
		type: "bin",
		x,
		y,
		width: 2 * 15,
		height: 3 * 18,
		facing,
		scaredy,
	};
};
const makeCrate = ({ x, y }) => {
	return {
		type: "crate",
		x,
		y,
		width: 3 * 15,
		height: 2 * 18,
	};
};
const makeFire = ({ x, y, on, switchID }) => {
	return {
		type: "fire",
		x,
		y,
		width: 4 * 15,
		height: 1 * 18,
		on,
		switchID,
		animationFrame: 0,
		fixed: true,
	};
};
const makeFan = ({ x, y, on, switchID }) => {
	return {
		type: "fan",
		x,
		y,
		width: 4 * 15,
		height: 1 * 18,
		on,
		switchID,
		animationFrame: 0,
		fixed: true,
	};
};
const makeLaser = ({ x, y, on, switchID, facing }) => {
	return {
		type: "laser",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		on,
		switchID,
		animationFrame: 0,
		facing,
		fixed: true,
	};
};
const makeSwitch = ({ x, y, on, switchID }) => {
	return {
		type: "switch",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		on,
		switchID,
		fixed: true,
	};
};
const makeTeleport = ({ x, y, teleportID }) => {
	return {
		type: "teleport",
		x,
		y,
		width: 4 * 15,
		height: 1 * 18,
		teleportID,
		fixed: true,
	};
};
const makeJump = ({ x, y, fixed }) => {
	return {
		type: "jump",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		animationFrame: 0,
		fixed,
	};
};
const makeShield = ({ x, y, used = false, fixed = true }) => {
	return {
		type: "shield",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		fixed,
		used,
	};
};
const makePipe = ({ x, y }) => {
	return {
		type: "pipe",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		timer: -1,
		fixed: true,
	};
};
const makeDrop = ({ x, y }) => {
	return {
		type: "drop",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		splashing: false,
		animationFrame: 0,
	};
};

const tests = [
	{
		levelType: "junkbot",
		name: "Tippy Toast",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Tight Squeeze Stairs",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Shallow Steps",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Don't Skate The Crate",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Twixt Crates",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Armor Farmer",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Armor Harmer",
		expect: "to lose",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Once You Win, You Won",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "json",
		name: "get bin and electrocuted",
		expect: "to lose",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "All-Off Offal",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Jump Stair Case",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Jump Around (bricks in place)",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Jump Around (bricks out of place)",
		expect: "to draw",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Perpetual Motion Machine (Test)",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Portable Boost (Test)",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Don't Step Up Onto Gearbot",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Don't Walk Over Gearbot",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Don't Step Down Onto Gearbot",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Step Down Onto Falling Crate",
		expect: "to win", // maybe??
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Death From Below",
		expect: "to lose",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Flying Death",
		expect: "to lose",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Crate Fall Onto Offset Blocks",
		expect: "to win",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Climbbot Fall Onto Offset Blocks",
		expect: "to lose",
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Hunter-Killer Climbbot (Fall Onto Offset Blocks)",
		expect: "to lose", // test will probably need updating when implementing this new logic
		timeSteps: 1000,
	},
	{
		levelType: "junkbot",
		name: "Ally",
		expect: "to win",
		timeSteps: 1000,
	},
];

let resources;
const resourcePaths = {
	sprites: "images/spritesheets/sprites.png",
	spritesAtlas: "images/spritesheets/sprites.json",
	backgrounds: "images/spritesheets/backgrounds.png",
	backgroundsAtlas: "images/spritesheets/backgrounds.json",
	// menus: "images/spritesheets/menus.png",
	// menusAtlas: "images/spritesheets/menus.json",
	spritesUndercover: "images/spritesheets/Undercover Exclusive/sprites.png",
	spritesUndercoverAtlas: "images/spritesheets/Undercover Exclusive/sprites.json",
	backgroundsUndercover: "images/spritesheets/Undercover Exclusive/backgrounds.png",
	backgroundsUndercoverAtlas: "images/spritesheets/Undercover Exclusive/backgrounds.json",
	// menusUndercover: "images/spritesheets/Undercover Exclusive/menus.png",
	// menusUndercoverAtlas: "images/spritesheets/Undercover Exclusive/menus.json",
	junkbotAnimations: "junkbot-animations.json",
	font: "images/font.png",
	turn: "audio/sound-effects/turn1.ogg",
	blockPickUp: "audio/sound-effects/blockpickup.ogg",
	// blockPickUpFromAir: "audio/sound-effects/custom/pick-up-from-air.wav",
	blockDrop: "audio/sound-effects/blockdrop.ogg",
	blockClick: "audio/sound-effects/blockclick.ogg",
	fall: "audio/sound-effects/fall.ogg",
	headBonk: "audio/sound-effects/headbonk1.ogg",
	collectBin: "audio/sound-effects/eat1.ogg",
	collectBin2: "audio/sound-effects/garbage1.ogg",
	switchClick: "audio/sound-effects/switch_click.ogg",
	switchOn: "audio/sound-effects/switch_on.ogg",
	switchOff: "audio/sound-effects/switch_off.ogg",
	deathByFire: "audio/sound-effects/fire.ogg",
	deathByWater: "audio/sound-effects/electricity1.ogg",
	deathByBot: "audio/sound-effects/robottouch4.ogg",
	getShield: "audio/sound-effects/shieldon2.ogg",
	getPowerup: "audio/sound-effects/h_powerup1.ogg",
	losePowerup: "audio/sound-effects/h_powerdown3.ogg",
	ohYeah: "audio/sound-effects/voice_ohyeah.ogg",
	jump: "audio/sound-effects/jump3.ogg",
	fan: "audio/sound-effects/fan.ogg",
	drip0: "audio/sound-effects/drip1.ogg",
	drip1: "audio/sound-effects/drip2.ogg",
	drip2: "audio/sound-effects/drip3.ogg",
	selectStart: "audio/sound-effects/custom/pick-up-from-air.wav",
	selectEnd: "audio/sound-effects/custom/select2.wav",
	delete: "audio/sound-effects/lego-creator/trash-I0514.wav",
	copyPaste: "audio/sound-effects/lego-creator/copy-I0510.wav",
	undo: "audio/sound-effects/lego-creator/undo-I0512.wav",
	redo: "audio/sound-effects/lego-creator/redo-I0513.wav",
	insert: "audio/sound-effects/lego-creator/insert-I0506.wav",
	rustle0: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML1.WAV",
	rustle1: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML2.WAV",
	rustle2: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML3.WAV",
	rustle3: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML4.WAV",
	rustle4: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML5.WAV",
	rustle5: "audio/sound-effects/lego-star-wars-force-awakens/LEGO_DEBRISSML6.WAV",
	defaultLevel: "levels/custom/New Employee Training (1j01).txt",
	levelNames: "levels/_LEVEL_LISTING.txt",
	levelNamesUndercover: "levels/Undercover Exclusive/_LEVEL_LISTING.txt",
};
const numRustles = 6;
const numDrips = 3;
let collectBinTime = -1;

const loadImage = (imagePath) => {
	const image = new Image();
	return new Promise((resolve, reject) => {
		image.onload = () => {
			resolve(image);
		};
		image.onerror = () => {
			reject(new Error(`Image failed to load ('${imagePath}')`));
		};
		image.src = imagePath;
	});
};

const loadJSON = async (path) => {
	const response = await fetch(path);
	if (response.ok) {
		return await response.json();
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadAtlasJSON = async (path) => {
	const { frames, animations } = await loadJSON(path);
	const result = {};
	for (const [name, framesIndices] of Object.entries(animations)) {
		result[name.replace(/\.png/i, "")] = { bounds: frames[framesIndices[0]] };
	}
	return result;
};

// const animations = new Set();

// All entity name animation name pairs in the original Junkbot games' levels, normalized to lowercase
// brick_01:
// brick_01:0
// brick_02:
// brick_02:0
// brick_03:
// brick_03:0
// brick_04:
// brick_04:0
// brick_06:0
// brick_08:
// brick_08:0
// brick_slickjump:dormant
// brick_slickshield:on
// flag:
// flag:0
// flag:none
// haz_climber:walk_r
// haz_dumbfloat:l
// haz_float:inactive
// haz_slickcrate:norm
// haz_slickfan:none
// haz_slickfan:off
// haz_slickfan:on
// haz_slickfire:off
// haz_slickfire:on
// haz_slickjump:dormant
// haz_slicklaser_l:off
// haz_slicklaser_l:on
// haz_slicklaser_r:off
// haz_slicklaser_r:on
// haz_slickpipe:dry
// haz_slickshield:on
// haz_slickswitch:off
// haz_slickswitch:on
// haz_slickteleport:on
// haz_walker:walk_l
// minifig:walk_l
// minifig:walk_r
// scaredy:rest

const loadLevelFromText = (levelData, game) => {
	const sections = {};
	let sectionName = "";
	for (const line of levelData.split(/\r?\n/g)) {
		if (!line.match(/^\s*(#.*)?$/)) {
			const match = line.match(/^\[(.*)\]$/);
			if (match) {
				sectionName = match[1];
			} else {
				sections[sectionName] = sections[sectionName] || [];
				sections[sectionName].push(line.split("="));
			}
		}
	}

	const level = {
		title: "",
		hint: "",
		par: Infinity,
		backdropName: null,
		decals: [],
		backgroundDecals: [],
		entities: [],
		game,
		bounds: null,
	};

	if (sections.info) {
		sections.info.forEach(([key, value]) => {
			if (key.match(/^(title|hint)$/i)) {
				level[key] = value;
			} else if (key.match(/^par$/i)) {
				level.par = Number(value);
			}
		});
	}
	let spacing = [15, 18];
	if (sections.playfield) {
		sections.playfield.forEach(([key, value]) => {
			if (key.match(/^spacing$/i)) {
				spacing = value.split(",").map(Number);
			}
		});
		sections.playfield.forEach(([key, value]) => {
			if (key.match(/^size$/i)) {
				const size = value.split(",").map(Number);
				level.bounds = {
					x: 0,
					y: 0,
					width: size[0] * spacing[0],
					height: size[1] * spacing[1],
				};
			}
		});
	}
	if (sections.background) {
		const parseDecals = (value) => {
			if (value.indexOf(",") === -1) {
				return [];
			}
			return value.split(",").map((str) => {
				const [x, y, name] = str.split(";");
				return { x: Number(x), y: Number(y), name };
			});
		};
		sections.background.forEach(([key, value]) => {
			if (key.match(/^bgdecals$/i)) {
				level.backgroundDecals = level.backgroundDecals.concat(parseDecals(value));
			} else if (key.match(/^decals$/i)) {
				level.decals = level.decals.concat(parseDecals(value));
			} else if (key.match(/^backdrop$/i)) {
				level.backdropName = value;
			}
		});
	}

	let types = [];
	let colors = [];
	const { entities } = level;
	sections.partslist.forEach(([key, value]) => {
		if (key === "types") {
			types = types.concat(value.toLowerCase().split(","));
		} else if (key === "colors") {
			colors = colors.concat(value.toLowerCase().split(","));
		} else if (key === "parts") {
			value.split(",").forEach((entityDef) => {
				const e = entityDef.split(";");
				// [0] - x coordinate
				// [1] - y coordinate
				// [2] - type index (in the types array)
				// [3] - color index (in the colors array)
				// [4] - starting animation name (0 for objects that don't animate)
				// [5] - starting animation frame ? (this seems to always be 1 for any animated object)
				// [6] - object relation ID, either a teleporter or a switch; two teleporters can reference each other with the same ID
				const x = (e[0] - 1) * spacing[0];
				const y = (e[1] - 1) * spacing[1];
				const typeName = types[e[2] - 1].toLowerCase();
				const colorName = colors[e[3] - 1].toLowerCase();
				const animationName = e[4].toLowerCase();
				const facing = animationName.match(/_L/i) ? -1 : 1;
				let facingY = 0;
				if (animationName.match(/_U/i)) {
					facingY = -1;
				} else if (animationName.match(/_D/i)) {
					facingY = 1;
				}
				const brickMatch = typeName.match(/brick_(\d+)/i);
				// animations.add(`${typeName}:${animationName}`);
				// if (typeName === "haz_slickcrate" && animationName !== "norm") {
				// 	console.log(level.title, entityDef);
				// }
				if (brickMatch) {
					entities.push(makeBrick({
						x, y, colorName, fixed: colorName === "gray", widthInStuds: parseInt(brickMatch[1], 10)
					}));
				} else if (typeName === "minifig") {
					entities.push(makeJunkbot({ x, y: y - 18 * 3, facing }));
				} else if (typeName === "haz_walker") {
					entities.push(makeGearbot({ x, y: y - 18 * 1, facing }));
				} else if (typeName === "haz_climber") {
					entities.push(makeClimbbot({ x, y: y - 18 * 1, facing, facingY }));
				} else if (typeName === "haz_dumbfloat") {
					entities.push(makeFlybot({ x, y: y - 18 * 1, facing }));
				} else if (typeName === "haz_float") {
					entities.push(makeEyebot({ x, y: y - 18 * 1, facing }));
				} else if (typeName === "flag") {
					entities.push(makeBin({ x, y: y - 18 * 2, facing }));
				} else if (typeName === "haz_slickcrate") {
					entities.push(makeCrate({ x, y: y - 18 }));
				} else if (typeName === "haz_slickfire") {
					entities.push(makeFire({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slickfan") {
					entities.push(makeFan({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slicklaser_l") {
					entities.push(makeLaser({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6], facing: -1 }));
				} else if (typeName === "haz_slicklaser_r") {
					entities.push(makeLaser({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6], facing: 1 }));
				} else if (typeName === "haz_slickswitch") {
					entities.push(makeSwitch({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slickteleport") {
					entities.push(makeTeleport({ x, y, teleportID: e[6] }));
				} else if (typeName === "haz_slickjump") {
					entities.push(makeJump({ x, y, fixed: true }));
				} else if (typeName === "brick_slickjump") {
					entities.push(makeJump({ x, y, fixed: false }));
				} else if (typeName === "haz_slickshield") {
					entities.push(makeShield({ x, y, used: animationName === "off", fixed: true }));
				} else if (typeName === "brick_slickshield") {
					entities.push(makeShield({ x, y, used: animationName === "off", fixed: false }));
				} else if (typeName === "haz_slickpipe") {
					entities.push(makePipe({ x, y }));
				} else if (typeName === "haz_droplet") { // made up / unofficial
					entities.push(makeDrop({ x, y }));
				} else {
					entities.push({ type: typeName, x, y, colorName, widthInStuds: 2, width: 2 * 15, height: 18, fixed: true });
				}
			});
		}
	});

	return level;
};

const loadTextFile = async (path) => {
	const response = await fetch(path);
	if (response.ok) {
		return await response.text();
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadLevelFromTextFile = async (path) => {
	return loadLevelFromText(await loadTextFile(path), path.match(/Undercover/i) ? "Junkbot Undercover" : "Junkbot");
};

const loadSound = async (path) => {
	const response = await fetch(path);
	if (response.ok) {
		return await audioCtx.decodeAudioData(await response.arrayBuffer());
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadResources = async (resourcePathsByID) => {
	return Object.fromEntries(await Promise.all(Object.entries(resourcePathsByID).map(([id, path]) => {
		if (path.match(/spritesheets\/.*\.json$/i)) {
			return loadAtlasJSON(path).then((atlas) => [id, atlas]);
		} else if (path.match(/\.json$/i)) {
			return loadJSON(path).then((data) => [id, data]);
			// return loadTextFile(path).then((json) => [id, json]);
		} else if (path.match(/level.listing\.txt$/i)) {
			return loadTextFile(path).then((text) => [id, text.trim().split(/\r?\n/g)]);
		} else if (path.match(/levels\/.*\.txt$/i)) {
			return loadLevelFromTextFile(path).then((level) => [id, level]);
		} else if (path.match(/\.(ogg|mp3|wav)$/i)) {
			return loadSound(path).then((audioBuffer) => [id, audioBuffer]);
		} else if (path.match(/\.(png|jpe?g|gif)$/i)) {
			return loadImage(path).then((image) => [id, image]);
		}
		throw new Error(`How should I load this? '${path}'`);
	})));
};

const serializeToJSON = (level) => {
	return JSON.stringify({ version: 0.3, format: "janitorial-android", level }, (name, value) => {
		if (name === "grabbed" || name === "grabOffset") {
			return undefined;
		}
		return value;
	}, "\t");
};

let editorLevelState = serializeToJSON(currentLevel);

const updateInfoBoxHidden = () => {
	infoBox.hidden = hideInfoBox;
	toggleInfoButton.setAttribute("aria-expanded", hideInfoBox ? "false" : "true");
};
const toggleInfoBox = () => {
	hideInfoBox = !hideInfoBox;
	updateInfoBoxHidden();
	try {
		localStorage.hideInfoBox = hideInfoBox;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};

const playSound = (soundName, playbackRate = 1, cutOffEndFraction = 0) => {
	const audioBuffer = resources[soundName];
	if (!audioBuffer) {
		throw new Error(`No AudioBuffer loaded for sound '${soundName}'`);
	}
	if (muted) {
		return;
	}
	const gain = audioCtx.createGain();
	const source = audioCtx.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(gain);
	gain.connect(audioCtx.destination);
	source.playbackRate.value = playbackRate;
	if (cutOffEndFraction) {
		gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + audioBuffer.duration * (1 - cutOffEndFraction));
	}
	source.start(0);
};

const fontChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890?!(),':"-+.^@#$%*~\`&_=;|\\/<>[]{}`;
const fontCharW = "555555553555555555555555553555555555512211133313553535_255311_55332233"
	.replace(/_/g, "")
	.split("")
	.map((digit) => Number(digit));
const fontCharX = [];
for (let x = 0, i = 0; i < fontChars.length; i++) {
	fontCharX.push(x);
	x += fontCharW[i] + 1;
}
const fontCharHeight = 5;

const colorizeWhiteAlphaImage = (image, color) => {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	canvas.width = image.width;
	canvas.height = image.height;
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(image, 0, 0);
	ctx.globalCompositeOperation = "source-atop";
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	return canvas;
};
const fontColors = {
	blue: "#00009c",
	sand: "#d09810",
	orange: "#c07500",
	gray: "#606060",
	black: "#000000",
	white: "#ffffff",
};
const fontCanvases = {};

const drawText = (ctx, text, startX, startY, colorName) => {
	const fontImage = fontCanvases[colorName];
	let x = startX;
	let y = startY;
	text = text.toUpperCase();
	for (const char of text) {
		if (char === " ") {
			x += 6;
		} else if (char === "\t") {
			x += 6 * 4;
		} else if (char === "\n") {
			x = startX;
			y += fontCharHeight + 4;
			if (y > canvas.height) {
				return; // optimization for lazily-implemented debug text
			}
		} else {
			const index = fontChars.indexOf(char);
			// TODO: fallback glyph?
			if (index > -1) {
				const w = fontCharW[index];
				ctx.drawImage(fontImage, fontCharX[index], 0, w, fontCharHeight, x, y, w, fontCharHeight);
				x += w + 1;
			}
		}
	}
};

const drawDecal = (ctx, x, y, name, game) => {
	let atlas = resources[game === "Junkbot Undercover" ? "backgroundsUndercoverAtlas" : "backgroundsAtlas"];
	let frame = atlas[name];
	if (!frame) {
		atlas = resources.backgroundsAtlas;
		frame = atlas[name];
	}
	const image = resources[atlas === resources.backgroundsUndercoverAtlas ? "backgroundsUndercover" : "backgrounds"];
	if (!frame) {
		if (showDebug) {
			drawText(ctx, `decal ${name} missing`, x, y, "sand");
		}
		return;
	}
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(image, left, top, width, height, x, y, width, height);
};

const drawBrick = (ctx, brick) => {
	const frame = resources.spritesAtlas[`brick_${(brick.colorName || "gray") === "gray" ? "immobile" : brick.colorName}_${brick.widthInStuds || 2}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, brick.x, brick.y + brick.height - height - 1, width, height);
};

const drawBin = (ctx, bin) => {
	const frame = resources.spritesAtlas.bin;
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, bin.x + 4, bin.y + bin.height - height - 5, width, height);
};

const drawCrate = (ctx, bin) => {
	const frame = resources.spritesUndercoverAtlas.HAZ_SLICKCRATE;
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.spritesUndercover, left, top, width, height, bin.x, bin.y + bin.height - height - 1, width, height);
};

const drawFire = (ctx, entity) => {
	const frameIndex = entity.on ? Math.floor(entity.animationFrame % 8 < 4 ? entity.animationFrame % 4 : 4 - (entity.animationFrame % 4)) : 0;
	const frame = resources.spritesAtlas[`haz_slickFire_${entity.on ? "on" : "off"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x + 1, entity.y + entity.height - height - 4, width, height);
};

const drawFan = (ctx, entity) => {
	const frameIndex = entity.on ? Math.floor(entity.animationFrame % 4) : 0;
	const frame = resources.spritesAtlas[`haz_slickFan_${entity.on ? "on" : "off"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x + 1, entity.y + entity.height - height - 4, width, height);
};

const drawWind = (ctx, fan, extents) => {
	if (!fan.on) {
		return;
	}
	for (let i = 0, x = fan.x + 15; x < fan.x + fan.width - 15; i += 1, x += 15) {
		let extent = 0;
		for (let y = fan.y - 18; y > -200; y -= 18) {
			if (extent >= extents[i]) {
				break;
			}
			extent += 1;
			const frameIndex = Math.floor(fan.animationFrame % 7);
			const frame = resources.spritesAtlas[`fanAir_1_${1 + frameIndex}`];
			const [left, top, width, height] = frame.bounds;
			ctx.drawImage(resources.sprites, left, top, width, height, x + 4, y - frameIndex * 2 + 8, width, height);
		}
	}
};

const drawJump = (ctx, entity) => {
	let animName = "dormant";
	let animLength = 1;
	if (entity.active) {
		animName = "active";
		animLength = 5;
	}
	const frameIndex = Math.floor(entity.animationFrame % animLength);
	const frame = resources.spritesAtlas[`${entity.fixed ? "haz" : "brick"}_slickJump_${animName}_${frameIndex + 1}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawShield = (ctx, entity) => {
	const atlas = resources[entity.fixed ? "spritesAtlas" : "spritesUndercoverAtlas"];
	const image = resources[entity.fixed ? "sprites" : "spritesUndercover"];
	const frame = atlas[`${entity.fixed ? "HAZ" : "BRICK"}_SLICKSHIELD_${entity.used ? "OFF" : "ON"}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(image, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawLaser = (ctx, entity) => {
	const frame = resources.spritesUndercoverAtlas[`haz_slickLaser_${entity.facing === 1 ? "R" : "L"}_ON_1`];
	const [left, top, width, height] = frame.bounds;
	const alignRight = entity.facing === 1;
	if (alignRight) {
		ctx.drawImage(resources.spritesUndercover, left, top, width, height, entity.x + entity.width - width + 11, entity.y + entity.height - 1 - height, width, height);
	} else {
		ctx.drawImage(resources.spritesUndercover, left, top, width, height, entity.x, entity.y + entity.height - 1 - height, width, height);
	}
};

const drawTeleport = (ctx, entity) => {
	// const frameIndex = Math.floor(entity.animationFrame % 2 : 0);
	const frame = resources.spritesUndercoverAtlas[`haz_slickTeleport_${entity.on ? "on" : "off"}_1`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.spritesUndercover, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawSwitch = (ctx, entity) => {
	const frame = resources.spritesAtlas[`haz_slickSwitch_${entity.on ? "on" : "off"}_1`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawPipe = (ctx, entity) => {
	const wet = entity.timer <= 6 && entity.timer > -1; // < 7 would cause error if timer is non-integer
	const frameIndex = Math.floor(wet ? 6 - entity.timer : 0);
	// if (wet) {
	// 	console.log("entity.timer", entity.timer, "frameIndex", frameIndex);
	// }
	const frame = resources.spritesAtlas[`haz_slickPipe_${wet ? "wet" : "dry"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x + 11, entity.y - 12, width, height);
	if (showDebug) {
		drawText(ctx, String(entity.timer), entity.x, entity.y + entity.height + 5, "white");
	}
};

const drawDrop = (ctx, entity) => {
	const frameIndex = Math.floor(entity.splashing ? entity.animationFrame : 0);
	const frame = resources.spritesAtlas[`drip_${entity.splashing ? "splashing" : "falling"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	// ctx.drawImage(resources.sprites, left, top, width, height, entity.x + 15, entity.y, width, height);
	// @TODO: proper frame offsets (this is an approximation)
	const offsetX = (-3 - entity.animationFrame) * entity.splashing;
	const offsetY = (-15) * entity.splashing;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x + 15 + offsetX, entity.y + offsetY, width, height);
};

const drawGearbot = (ctx, entity) => {
	const frameIndex = Math.floor(entity.animationFrame % 2);
	const frame = resources.spritesAtlas[`gearbot_walk_${entity.facing === 1 ? "r" : "l"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};
const drawClimbbot = (ctx, entity) => {
	const frameIndex = Math.floor(entity.animationFrame % 6);
	let direction = entity.facing === 1 ? "r" : "l";
	if (entity.facingY === -1) {
		direction = "u";
	} else if (entity.facingY === 1) {
		direction = "d";
	}
	const frame = resources.spritesAtlas[`climbbot_walk_${direction}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y - 6, width, height);
};
const drawFlybot = (ctx, entity) => {
	const frameIndex = Math.floor(entity.animationFrame % 2);
	const frame = resources.spritesAtlas[`flybot_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};
const drawEyebot = (ctx, entity) => {
	const frameIndex = Math.floor(entity.animationFrame % 2);
	const frame = resources.spritesAtlas[`eyebot_${(entity.activeTimer > 0) ? "active_" : ""}${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.sprites, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawJunkbot = (ctx, junkbot) => {
	let animName;
	let animLength = 10; // should be always set later
	if (junkbot.dead) {
		animName = "dead";
	} else if (junkbot.dyingFromWater) {
		animName = "water_die";
	} else if (junkbot.dying) {
		animName = "die";
	} else if (junkbot.collectingBin) {
		animName = "eat_start";
		animLength = 17;
	} else if (junkbot.gettingShield) {
		animName = `shield_on_${junkbot.facing === 1 ? "r" : "l"}`;
		animLength = 11;
	} else {
		animName = `walk_${junkbot.facing === 1 ? "r" : "l"}`;
	}
	if (junkbot.armored && (!junkbot.losingShield || (junkbot.animationFrame % 4 < 2))) {
		if (animName === "eat_start") {
			animName = "shield_eat";
		} else if (!animName.includes("shield")) {
			animName = `shield_${animName}`;
		}
	}
	const animation = resources.junkbotAnimations[animName];
	let frameName;
	let offset = { x: 0, y: 0 };
	if (animation) {
		animLength = animation.length;
		const t = Math.floor(junkbot.animationFrame % animLength);
		const keyFrame = animation[t];
		offset = keyFrame.offset;
		frameName = keyFrame.sprite;
		if (junkbot.isPreviewEntity && offset.x >= 5) {
			offset = { x: 5, y: offset.y };
		}
	} else {
		const t = Math.floor(junkbot.animationFrame % animLength);
		frameName = animName === "dead" ? "minifig_dead" : `minifig_${animName}_${1 + t}`;
	}
	const frame = resources.spritesAtlas[frameName];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(
		resources.sprites,
		left,
		top,
		width,
		height,
		junkbot.x - offset.x,
		junkbot.y + junkbot.height - 1 - height - offset.y,
		width,
		height
	);
	// if (showDebug) {
	// 	drawText(ctx, frameName, junkbot.x, junkbot.y + 20, "white");
	// }
};

const selectionHilightCanvases = {};
const renderSelectionHilight = (width, height, depth = 10, studsOnTop = false) => {
	const key = `${width}x${height}x${depth} studsOnTop=${studsOnTop}`;
	if (selectionHilightCanvases[key]) {
		return selectionHilightCanvases[key];
	}
	const canvas = document.createElement("canvas");
	canvas.width = width + depth + 1;
	canvas.height = height + depth + 1;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "aqua";

	ctx.translate(depth, 0);
	for (let z = 0; z <= 10; z++) {
		if (z === 0 || z === 10) {
			for (const x of [0, 0 + width]) {
				ctx.fillRect(x, 0, 1, height + 1);
			}
			for (const y of [0, 0 + height]) {
				ctx.fillRect(0, y, width + 1, 1);
			}
		} else {
			for (const x of [0, 0 + width]) {
				for (const y of [0, 0 + height]) {
					ctx.fillRect(x, y, 1, 1);
				}
			}
			ctx.clearRect(1, 0, width - 1, 1);
			ctx.clearRect(width, 1, 1, height - 1);
		}
		ctx.translate(-1, 1);
	}
	ctx.clearRect(2, 0, width - 1, height - 1);
	if (studsOnTop) {
		for (let z = 0; z < width; z += 6) {
			for (let x = 0; x < width; x += 15) {
				ctx.clearRect(x + 6 + z, -7 - z, 11, 5);
			}
		}
	}

	selectionHilightCanvases[key] = canvas;
	return canvas;
};
const drawSelectionHilight = (ctx, x, y, width, height, depth = 10, studsOnTop = false) => {
	const image = renderSelectionHilight(width, height, depth, studsOnTop);
	ctx.save();
	ctx.translate(0, -2 - depth);
	ctx.drawImage(image, x, y);
	ctx.restore();
};

const drawEntity = (ctx, entity, hilight) => {
	switch (entity.type) {
		case "brick":
			drawBrick(ctx, entity);
			break;
		case "junkbot":
			// aJunkbot = entity;
			drawJunkbot(ctx, entity);
			break;
		case "gearbot":
			drawGearbot(ctx, entity);
			break;
		case "climbbot":
			drawClimbbot(ctx, entity);
			break;
		case "flybot":
			drawFlybot(ctx, entity);
			break;
		case "eyebot":
			drawEyebot(ctx, entity);
			break;
		case "bin":
			drawBin(ctx, entity);
			break;
		case "crate":
			drawCrate(ctx, entity);
			break;
		case "fire":
			drawFire(ctx, entity);
			break;
		case "fan":
			drawFan(ctx, entity);
			break;
		case "laser":
			drawLaser(ctx, entity);
			break;
		case "teleport":
			drawTeleport(ctx, entity);
			break;
		case "jump":
			drawJump(ctx, entity);
			break;
		case "pipe":
			drawPipe(ctx, entity);
			break;
		case "drop":
			drawDrop(ctx, entity);
			break;
		case "shield":
			drawShield(ctx, entity);
			break;
		case "switch":
			drawSwitch(ctx, entity);
			break;
		default:
			drawBrick(ctx, entity);
			drawText(ctx, entity.type, entity.x, entity.y, "white");
			break;
	}
	if (hilight) {
		ctx.save();
		ctx.globalAlpha = 0.5;
		drawSelectionHilight(ctx, entity.x, entity.y, entity.width, entity.height, 10, entity.type === "brick");
		ctx.restore();
	}
};

// acceleration structures
let entitiesByTopY = {}; // y to array of entities with that y as their top
let entitiesByBottomY = {}; // y to array of entities with that y as their bottom
let lastKeys = new Map(); // ancillary structure for updating the by-y structures - entity to {topY, bottomY}

const entityMoved = (entity) => {
	const yKeys = lastKeys.get(entity) || {};
	entitiesByTopY[entity.y] = entitiesByTopY[entity.y] || [];
	entitiesByBottomY[entity.y + entity.height] = entitiesByBottomY[entity.y + entity.height] || [];
	if (yKeys.topY) {
		remove(entitiesByTopY[yKeys.topY], entity);
	}
	if (yKeys.bottomY) {
		remove(entitiesByBottomY[yKeys.bottomY], entity);
	}
	yKeys.topY = entity.y;
	yKeys.bottomY = entity.y + entity.height;
	entitiesByTopY[yKeys.topY].push(entity);
	entitiesByBottomY[yKeys.bottomY].push(entity);
	lastKeys.set(entity, yKeys);
};

let winLoseState = "";
const winOrLose = () => {
	// Cases:
	// ("while collecting" and "dying" refer to playing the animations)
	// - Alive while collecting last bin: "" (winING, probably)
	// - Dying while collecting last bin: "" (losING)
	// - Dead while collecting last bin: "lose" (shouldn't happen maybe though, if collectingBin is reset)
	// - Alive after collecting last bin: "win"
	// - Dying after collecting last bin: (should already be "win" and paused)
	// - Dead after collecting last bin: "lose"
	// - Dead, bins left to collect: "lose"
	// - Dying, bins left to collect: "" (losING)
	// - Alive, bins left to collect: "" (normal state)
	if (entities.some((entity) => entity.type === "junkbot" && !entity.dead)) {
		if (
			entities.some((entity) => entity.type === "junkbot" && !entity.dead && !entity.dying) &&
			!entities.some((entity) => entity.type === "bin") &&
			entities.every((entity) => !entity.collectingBin)
		) {
			return "win";
		} else {
			return "";
		}
	} else {
		return "lose";
	}
};

const undos = [];
const redos = [];
const clipboard = {};

const mouse = { x: undefined, y: undefined };
let dragging = [];
let selectionBox;

const serializeLevel = (level) => {
	// let text = [];
	// const addSection = (name, keyValuePairs) => {
	// 	text += `[${name}]\n`;
	// 	for (const [key, value] of keyValuePairs) {
	// 		text += `${key}=${value}`;
	// 	}
	// 	text += "\n";
	// };
	// addSection("info", [
	// 	["", ""]
	// ]);
	const types = [];
	const unknownTypeMappings = [];
	const parts = [];
	for (const entity of level.entities) {
		let type;
		if (entity.type === "brick") {
			type = `brick_${String(entity.widthInStuds).padStart(2, "0")}`;
		} else if (entity.type === "jump") {
			type = `${entity.fixed ? "haz" : "brick"}_slickjump`;
		} else if (entity.type === "shield") {
			type = `${entity.fixed ? "haz" : "brick"}_slickshield`;
		} else if (entity.type === "laser") {
			type = `haz_slicklaser_${entity.facing === 1 ? "r" : "l"}`;
		} else {
			type = {
				junkbot: "minifig",
				gearbot: "haz_walker",
				climbbot: "haz_climber",
				flybot: "haz_dumbfloat",
				eyebot: "haz_float",
				bin: "flag",
				crate: "haz_slickcrate",
				fire: "haz_slickfire",
				fan: "haz_slickfan",
				switch: "haz_slickswitch",
				teleport: "haz_slickteleport",
				pipe: "haz_slickpipe",
				drop: "haz_droplet", // made up / unofficial
			}[entity.type];
		}
		if (type) {
			if (types.indexOf(type) === -1) {
				types.push(type);
			}
			// [0] - x coordinate
			// [1] - y coordinate
			// [2] - type index (in the types array)
			// [3] - color index (in the colors array)
			// [4] - starting animation name (0 for objects that don't animate)
			// [5] - starting animation frame ? (this seems to always be 1 for any animated object)
			// [6] - object relation ID, either a teleporter or a switch; two teleporters can reference each other with the same ID
			const gridX = entity.x / 15 + 1;
			const gridY = (entity.y + entity.height) / 18;
			const typeIndex = types.indexOf(type);
			const colorIndex = brickColorNames.indexOf(entity.colorName || "red");
			let animationName;
			if ("on" in entity) {
				animationName = entity.on ? "on" : "off";
			} else if (entity.type === "eyebot") {
				animationName = "inactive";
			} else if (entity.type === "flybot") {
				if (entity.facingY === -1) {
					animationName = "U";
				} else if (entity.facingY === 1) {
					animationName = "D";
				} else if (entity.facing === -1) {
					animationName = "L";
				} else {
					animationName = "R";
				}
			} else if (("facing" in entity) && (entity.type !== "bin" || entity.scaredy)) {
				animationName = entity.facing > 0 ? "walk_r" : "walk_l";
			} else if (entity.type === "jump") {
				animationName = "dormant";
			} else if (entity.type === "pipe") {
				animationName = "dry";
			} else if (entity.type === "crate") {
				animationName = "norm";
			} else {
				animationName = "";
			}
			parts.push(`${gridX};${gridY};${typeIndex + 1};${colorIndex + 1};${animationName};${entity.animationFrame || 1};${entity.switchID || entity.teleportID || ""}`);
		} else {
			unknownTypeMappings.push(entity.type);
		}
	}
	if (unknownTypeMappings.length) {
		showMessageBox(`Unknown type mappings for entity types:\n\n${unknownTypeMappings.join("\n")}`);
	}
	const stringifyDecals = (decals = []) => decals.map(({ x, y, name }) => `${x};${y};${name}`).join(",");
	return `[info]
title=${level.title || "Saved World"}
par=${isFinite(level.par) ? level.par : 10000}
hint=${level.hint || ""}

[playfield]
${level.bounds ? `size=${level.bounds.width / 15},${level.bounds.height / 18}` : ""}
spacing=15,18
scale=1

[background]
backdrop=${level.backdropName || "bkg1"}
decals=${stringifyDecals(level.decals)}
bgdecals=${stringifyDecals(level.backgroundDecals)}

[partslist]
types=${types.join(",")}
colors=${brickColorNames.join(",")}
parts=${parts.join(",")}

`;
};
const deserializeJSON = (json) => {
	const state = JSON.parse(json);
	if ("version" in state && state.version < 0.3) {
		state.level = { entities: state.entities };
	}
	currentLevel = state.level;
	entities = currentLevel.entities;
	entitiesByTopY = {};
	entitiesByBottomY = {};
	lastKeys = new Map();
	dragging.length = 0;
	wind.length = 0;
	moves = 0;
	entities.forEach((entity) => {
		delete entity.grabbed;
		delete entity.grabOffset;
	});
	winLoseState = winOrLose();
	updateEditorUIForLevelChange(currentLevel);
};
const initLevel = (level) => {
	currentLevel = level;
	editorLevelState = serializeToJSON(level);
	entities = level.entities;
	entitiesByTopY = {};
	entitiesByBottomY = {};
	lastKeys = new Map();
	undos.length = 0;
	redos.length = 0;
	dragging = [];
	wind = [];
	moves = 0;
	viewport.centerX = 35 / 2 * 15;
	viewport.centerY = 24 / 2 * 15;
	winLoseState = winOrLose(); // in case there's no bins, don't say OH YEAH
	updateEditorUIForLevelChange(currentLevel);
};
let disableLoadFromHash = false;
const loadLevelFromLevelSelect = async () => {
	const option = levelSelect.options[levelSelect.selectedIndex];
	const optgroup = option.parentNode.matches("optgroup") ? option.parentNode : null;
	if (levelSelect.value !== "Custom World") {
		const test = optgroup.value === "Test Cases" && tests.find((test) => test.name === levelSelect.value);
		const fileName = `${levelSelect.value.replace(/[:?]/g, "")}.${(test && test.levelType === "json") ? "json" : "txt"}`;
		const game = optgroup ? optgroup.value : "Custom";
		const folder = {
			"Junkbot Undercover": "levels/Undercover Exclusive",
			"Junkbot": "levels",
			"Test Cases": "levels/test-cases",
		}[game];
		// console.log("loading:", option.value, { option, optgroup, game });
		try {
			if (test.levelType === "json") {
				deserializeJSON(await loadTextFile(`${folder}/${fileName}`));
			} else {
				initLevel(await loadLevelFromTextFile(`${folder}/${fileName}`, { game }));
			}
			editorLevelState = serializeToJSON(currentLevel);
		} catch (error) {
			showMessageBox(`Failed to load level:\n\n${error}`);
		}
		if (decodeURIComponent(parseLocationHash().level || "") !== `${game};${levelSelect.value}`) {
			await new Promise((resolve, reject) => {
				// eslint bug?
				// eslint-disable-next-line prefer-const
				let tid;
				const handleHashChange = () => {
					// console.log("hashchange", location.hash);
					window.removeEventListener("hashchange", handleHashChange);
					clearTimeout(tid);
					// make sure other handlers of hashchange run first
					setTimeout(() => {
						disableLoadFromHash = false;
						resolve();
					});
				};
				window.addEventListener("hashchange", handleHashChange);
				tid = setTimeout(() => {
					window.removeEventListener("hashchange", handleHashChange);
					reject(new Error("timed out waiting for hashchange event"));
				}, 1000);
				// console.log("navigate for:", option.value, { option, optgroup, game });
				// console.log(`gonna set #level=${game};${encodeURIComponent(levelSelect.value)}`);
				disableLoadFromHash = true;
				location.hash = `level=${game};${encodeURIComponent(levelSelect.value)}`;
			});
		}
	}
};
const save = () => {
	if (editing) {
		editorLevelState = serializeToJSON(currentLevel);
		if (!currentLevel.title) {
			currentLevel.title = "Custom Level";
		}
		try {
			if (decodeURIComponent(parseLocationHash().level || "") !== `local;${currentLevel.title}`) {
				const originalTitle = currentLevel.title.replace(/\s\(\d+\)$/, "");
				for (let n = 1; n < 100 && localStorage[`level:${currentLevel.title}`]; n++) {
					currentLevel.title = `${originalTitle} (${n})`;
				}
				editorLevelState = serializeToJSON(currentLevel); // for title update
				localStorage[`level:${currentLevel.title}`] = editorLevelState;
				location.hash = `level=local;${encodeURIComponent(currentLevel.title)}`;
				updateEditorUIForLevelChange(currentLevel); // for title update
			} else {
				localStorage[`level:${currentLevel.title}`] = editorLevelState;
			}
		} catch (error) {
			showMessageBox(`Couldn't save level.\nAllow local storage (sometimes called 'cookies') to enable autosave.\n\n${error}`);
		}
	}
};

const toggleShowDebug = () => {
	showDebug = !showDebug;
	try {
		localStorage.showDebug = showDebug;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};
const toggleMute = () => {
	muted = !muted;
	try {
		localStorage.muteSoundEffects = muted;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};
const togglePause = () => {
	paused = !paused;
	// if (editing && !paused) {
	// if (editing !== paused) {
	// 	toggleEditing();
	// }
	try {
		localStorage.paused = paused;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};
const toggleEditing = () => {
	editing = !editing;
	editorUI.hidden = !editing;
	if (editing) {
		deserializeJSON(editorLevelState);
	}
	if (editing !== paused) {
		togglePause();
	}
	try {
		localStorage.editing = editing;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};

const undoable = (fn) => {
	if (!editing) {
		return; // TODO: allow undos during gameplay again, but handle it well
	}
	editorLevelState = serializeToJSON(currentLevel);
	undos.push(editorLevelState);
	redos.length = 0;
	if (fn) {
		fn();
		save();
	}
};
const undoOrRedo = (undos, redos) => {
	const originalTitle = currentLevel.title;
	if (undos.length === 0) {
		return false;
	}
	redos.push(serializeToJSON(currentLevel));
	editorLevelState = undos.pop();
	deserializeJSON(editorLevelState);
	currentLevel.title = originalTitle; // this is to avoid creating many autosave slots - don't allow undoing title change
	updateEditorUIForLevelChange(currentLevel); // for title update
	save();
	return true;
};
let recentUndoSound = 0;
let recentRedoSound = 0;
const undo = () => {
	if (!editing) {
		toggleEditing();
		return;
	}
	const didSomething = undoOrRedo(undos, redos);
	if (didSomething) {
		playSound("undo", 1 / (1 + recentUndoSound / 2), Math.min(0.2, recentUndoSound / 5));
		recentUndoSound += 1;
		setTimeout(() => {
			recentUndoSound -= 1;
		}, 400);
	}
	// eslint-disable-next-line
	// TODO: undo view too
};
const redo = () => {
	if (!editing) {
		toggleEditing();
		return;
	}
	const didSomething = undoOrRedo(redos, undos);
	if (didSomething) {
		playSound("redo", (1 + recentRedoSound / 10));
		recentRedoSound += 1;
		setTimeout(() => {
			recentRedoSound -= 1;
		}, 400);
	}
};

const saveToFile = () => {
	// this is sort of a weird way for this to work!
	undoable(() => {
		deserializeJSON(editorLevelState);
	});
	const file = new Blob([serializeLevel(currentLevel)], { type: "text/plain" });
	const a = document.createElement("a");
	const url = URL.createObjectURL(file);
	a.href = url;
	a.download = `${currentLevel.title}.txt`;
	document.body.appendChild(a);
	a.click();
	setTimeout(() => {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}, 0);
};

const openFromFile = (file) => {
	if (!editing) {
		toggleEditing();
	}
	const reader = new FileReader();
	reader.onload = (readerEvent) => {
		const content = readerEvent.target.result;
		try {
			if (content.match(/^\s*{/)) {
				deserializeJSON(content);
			} else {
				initLevel(loadLevelFromText(content));
			}
			currentLevel.title = currentLevel.title || file.name.replace(/\.(json|txt)$/, "");
			save();
		} catch (error) {
			showMessageBox(`Failed to load from file:\n\n${error}`);
		}
	};
	reader.onerror = () => {
		showMessageBox(`Failed to read file:\n\n${reader.error}`);
	};
	reader.readAsText(file, "UTF-8");
};

const openFromFileDialog = () => {
	const input = document.createElement("input");
	input.type = "file";
	input.onchange = (event) => {
		const file = event.target.files[0];
		openFromFile(file);
	};
	input.click();
};

const selectAll = () => {
	if (!editing) {
		toggleEditing();
	}
	entities.forEach((entity) => {
		entity.selected = true;
	});
};
const flipSelected = () => {
	if (!editing) {
		return;
	}
	// TODO: flip selection overall? not just facing directions?
	if (entities.some((entity) => entity.selected && "facing" in entity)) {
		undoable(() => {
			for (const entity of entities) {
				if (entity.selected && "facing" in entity) {
					entity.facing = -entity.facing;
				}
			}
		});
		playSound("turn");
	}
};
const deleteSelected = () => {
	if (!editing) {
		return;
	}
	if (entities.some((entity) => entity.selected)) {
		undoable(() => {
			entities = entities.filter((entity) => !entity.selected);
			currentLevel.entities = entities;
		});
		playSound("delete");
	}
};
const copySelected = () => {
	if (!editing) {
		return;
	}
	if (entities.some((entity) => entity.selected)) {
		clipboard.entitiesJSON = JSON.stringify(entities.filter((entity) => entity.selected));
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(clipboard.entitiesJSON);
		}
		playSound("copyPaste");
	}
};
const cutSelected = () => {
	copySelected();
	deleteSelected();
};
const pasteEntities = (newEntities) => {
	undoable();
	for (const entity of entities) {
		delete entity.selected;
		delete entity.grabbed;
		delete entity.grabOffset;
	}
	dragging = [];

	for (const entity of newEntities) {
		entity.selected = true;
		entity.grabbed = true;
		entities.push(entity);
		dragging.push(entity);
	}

	const centers = newEntities.map((entity) => ({
		x: entity.x + entity.width / 2,
		y: entity.y + entity.height / 2,
	}));
	const collectiveCenter = { x: 0, y: 0 };
	for (const entityCenter of centers) {
		collectiveCenter.x += entityCenter.x;
		collectiveCenter.y += entityCenter.y;
	}
	collectiveCenter.x /= centers.length;
	collectiveCenter.y /= centers.length;

	const offsetX = -floor(collectiveCenter.x, 15);
	const offsetY = -floor(collectiveCenter.y, 18);

	for (const entity of newEntities) {
		entity.grabOffset = {
			x: entity.x + offsetX,
			y: entity.y + offsetY,
		};
	}
};
const pasteFromClipboard = async () => {
	if (!editing) {
		return;
	}
	let { entitiesJSON } = clipboard;
	if (navigator.clipboard && navigator.clipboard.readText) {
		const text = await navigator.clipboard.readText();
		if (text && text.trim()[0] === "{") {
			entitiesJSON = text;
		}
	}
	const newEntities = JSON.parse(entitiesJSON);
	pasteEntities(newEntities);
	playSound("copyPaste");
};

const sortEntitiesForRendering = (entities) => {
	entities.sort((a, b) => b.y - a.y);

	let n = entities.length;
	do {
		let newN = 0;
		for (let i = 1; i < n; i++) {
			const a = entities[i - 1];
			const b = entities[i];
			if (
				a.y + a.height < b.y ||
				b.x + b.width <= a.x
			) {
				entities[i - 1] = b;
				entities[i] = a;
				newN = i;
			}
		}
		n = newN;
	} while (n > 1);
	// from https://en.wikipedia.org/wiki/Bubble_sort
	// procedure bubbleSort(A : list of sortable items)
	// 	n := length(A)
	// 	repeat
	// 		new_n := 0
	// 		for i := 1 to n - 1 inclusive do
	// 			if A[i - 1] > A[i] then
	// 				swap(A[i - 1], A[i])
	// 				new_n := i
	// 			end if
	// 		end for
	// 		n := new_n
	// 	until n ≤ 1
	// end procedure
};

// const initTestLevel = () => {
// 	for (let row = 5; row >= 0; row--) {
// 		for (let column = 0; column < 150;) { // MUST increment below
// 			if (Math.sin(column * 13234) < row * 0.2 + 0.1) {
// 				const widthInStuds = brickWidthsInStuds[1 + Math.floor(Math.random() * (brickWidthsInStuds.length - 1))];
// 				entities.push(makeBrick({
// 					x: column * 15,
// 					y: (row - 6) * 18,
// 					widthInStuds,
// 					colorName: "gray",
// 					fixed: true,
// 				}));
// 				column += widthInStuds;
// 			} else {
// 				column += Math.floor(Math.random() * 5 + 1);
// 			}
// 		}
// 	}
// 	for (let staircase = 5; staircase >= 0; staircase--) {
// 		for (let stair = 0; stair < 10; stair++) {
// 			entities.push(makeBrick({
// 				x: staircase * 15 * 7 + stair * 15 * (staircase > 3 ? 1 : -1),
// 				y: (-stair - 8) * 18,
// 				widthInStuds: 2,
// 				colorName: "gray",
// 				fixed: true,
// 			}));
// 		}
// 	}
// 	entities.push(
// 		makeBrick({ x: 15 * 5, y: 18 * -12, colorName: "red", widthInStuds: 1 }),
// 		makeBrick({ x: 15 * 4, y: 18 * -13, colorName: "yellow", widthInStuds: 4 }),
// 		makeBrick({ x: 15 * 4, y: 18 * -14, colorName: "green", widthInStuds: 2 }),
// 	);
// 	entities.push(
// 		makeBrick({ x: 15 * 20, y: 18 * -16, colorName: "gray", fixed: true, widthInStuds: 6 }),
// 		makeBrick({ x: 15 * 26, y: 18 * -16, colorName: "gray", fixed: true, widthInStuds: 6 }),
// 		makeBrick({ x: 15 * 24, y: 18 * -20, colorName: "gray", fixed: true, widthInStuds: 6 }),
// 	);
// 	entities.push(makeJunkbot({ x: 15 * 9, y: 18 * -8, facing: 1 }));
// 	entities.push(makeJunkbot({ x: 15 * 9, y: 18 * -20, facing: 1 }));

// 	let dropFromRow = 25;
// 	const iid = setInterval(() => {
// 		dropFromRow += 1;
// 		const brick = makeBrick({
// 			x: 15 * Math.floor(Math.sin(Date.now() / 400) * 9),
// 			y: 18 * -dropFromRow,
// 			widthInStuds: brickWidthsInStuds[1 + Math.floor(Math.random() * (brickWidthsInStuds.length - 1))],
// 			colorName: brickColorNames[Math.floor((brickColorNames.length - 1) * Math.random())],
// 		});
// 		entities.push(brick);
// 		if (dropFromRow > 100) {
// 			clearInterval(iid);
// 		}
// 	}, 200);
// };

const worldToCanvas = (worldX, worldY) => ({
	x: (worldX - viewport.centerX) * viewport.scale + Math.floor(canvas.width / 2),
	y: (worldY - viewport.centerY) * viewport.scale + Math.floor(canvas.height / 2),
});
const canvasToWorld = (canvasX, canvasY) => ({
	x: (canvasX - Math.floor(canvas.width / 2)) / viewport.scale + viewport.centerX,
	y: (canvasY - Math.floor(canvas.height / 2)) / viewport.scale + viewport.centerY,
});

const zoomTo = (newScale, focalPointOnCanvas = { x: canvas.width / 2, y: canvas.height / 2 }) => {
	if (pointerEventCache.length === 2) {
		const [a, b] = pointerEventCache;
		focalPointOnCanvas.x = (a.pageX + b.pageX) / 2 * window.devicePixelRatio;
		focalPointOnCanvas.y = (a.pageY + b.pageY) / 2 * window.devicePixelRatio;
	}
	// const oldScale = viewport.scale;
	const focalPointInWorld = canvasToWorld(focalPointOnCanvas.x, focalPointOnCanvas.y);
	viewport.scale = newScale;
	const mouseInWorldAfterZoomButBeforePan = canvasToWorld(focalPointOnCanvas.x, focalPointOnCanvas.y);
	// viewport.scale = oldScale;

	viewport.centerX += focalPointInWorld.x - mouseInWorldAfterZoomButBeforePan.x;
	viewport.centerY += focalPointInWorld.y - mouseInWorldAfterZoomButBeforePan.y;
	viewport.scale = newScale;
};
const scales = [1 / 15, 1 / 10, 1 / 5, 1 / 3, 1 / 2, 3 / 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const getScaleIndex = () => {
	for (let index = 0; index < scales.length; index++) {
		if (scales[index] >= viewport.scale) {
			return index;
		}
	}
	return scales.length - 1;
};
const zoomIn = (focalPointOnCanvas) => {
	zoomTo(scales[Math.min(getScaleIndex() + 1, scales.length - 1)], focalPointOnCanvas);
};
const zoomOut = (focalPointOnCanvas) => {
	zoomTo(scales[Math.max(getScaleIndex() - 1, 0)], focalPointOnCanvas);
};

addEventListener("keydown", (event) => {
	if (event.defaultPrevented) {
		return; // Do nothing if the event was already processed
	}
	if (event.target.tagName.match(/input|textarea|select/i)) {
		return;
	}
	if (event.target.tagName.match(/button/i) && (event.key === " " || event.key === "Enter")) {
		return;
	}
	keys[event.code] = true;
	if (event.key.match(/^Arrow/)) {
		keys[event.key] = true;
	}
	if (event.code === "Equal" || event.code === "NumpadAdd") {
		zoomIn();
	}
	if (event.code === "Minus" || event.code === "NumpadSubtract") {
		zoomOut();
	}
	switch (event.key.toUpperCase()) {
		case " ": // Spacebar
		case "P":
			if (!event.repeat) {
				// togglePause();
			}
			break;
		case "E":
			if (!event.repeat) {
				toggleEditing();
			}
			break;
		case "M":
			if (!event.repeat) {
				toggleMute();
			}
			break;
		case "`":
			if (!event.repeat) {
				toggleShowDebug();
			}
			break;
		// case ",":
		// 	testVideo.currentTime -= 0.02;
		// 	localStorage.comparisonVideoTime = testVideo.currentTime;
		// 	break;
		// case ".":
		// 	testVideo.currentTime += 0.02;
		// 	localStorage.comparisonVideoTime = testVideo.currentTime;
		// 	break;
		// case ";":
		// 	aJunkbot.animationFrame -= 1;
		// 	if (aJunkbot.animationFrame < 0) {
		// 		aJunkbot.animationFrame = 0;
		// 	}
		// 	break;
		// case "'":
		// 	aJunkbot.animationFrame += 1;
		// 	break;
		case "F":
			if (!event.repeat) {
				flipSelected();
			}
			break;
		case "DELETE":
			if (!event.repeat) {
				deleteSelected();
			}
			break;
		case "Z":
			if (event.ctrlKey) {
				if (event.shiftKey) {
					redo();
				} else {
					undo();
				}
			} else {
				return;
			}
			break;
		case "Y":
			if (event.ctrlKey) {
				redo();
			} else {
				return;
			}
			break;
		case "X":
			if (event.ctrlKey && window.getSelection().toString() === "") {
				cutSelected();
			} else {
				return;
			}
			break;
		case "C":
			if (event.ctrlKey && !event.repeat && window.getSelection().toString() === "") {
				copySelected();
			} else {
				return;
			}
			break;
		case "V":
			if (event.ctrlKey) {
				pasteFromClipboard();
			} else {
				return;
			}
			break;
		case "A":
			if (event.ctrlKey) {
				selectAll();
			} else {
				return;
			}
			break;
		case "S":
			if (event.ctrlKey) {
				saveToFile();
			} else {
				return;
			}
			break;
		case "O":
			if (event.ctrlKey) {
				openFromFileDialog();
			} else {
				return;
			}
			break;
		default:
			// Don't prevent default action if event not handled
			return;
	}
	event.preventDefault();
});
addEventListener("keyup", (event) => {
	delete keys[event.code];
	if (event.key.match(/^Arrow/)) {
		delete keys[event.key];
	}
});

addEventListener("blur", () => {
	// prevent stuck keys
	keys = {};
	// prevent margin panning until pointermove
	mouse.x = undefined;
	mouse.y = undefined;
	mouse.worldX = undefined;
	mouse.worldY = undefined;
});
const releasePointer = (event) => {
	pointerEventCache = pointerEventCache.filter((oldEvent) => oldEvent.pointerId !== event.pointerId);

	if (pointerEventCache.length < 2) {
		prevPointerDist = -1;
	}
};
canvas.addEventListener("pointerout", (event) => {
	// prevent margin panning until pointermove
	mouse.x = undefined;
	mouse.y = undefined;
	// mouse.worldX = undefined;
	// mouse.worldY = undefined;
	releasePointer(event);
});
canvas.addEventListener("pointerup", (event) => {
	releasePointer(event);
});

const updateMouseWorldPosition = () => {
	if (mouse.x !== undefined && mouse.y !== undefined) {
		const worldPos = canvasToWorld(mouse.x, mouse.y);
		mouse.worldX = worldPos.x;
		mouse.worldY = worldPos.y;
	}
	if (selectionBox) {
		selectionBox.x2 = mouse.worldX;
		selectionBox.y2 = mouse.worldY;
	}
};
const updateMouse = (event) => {
	mouse.x = event.pageX * window.devicePixelRatio;
	mouse.y = event.pageY * window.devicePixelRatio;
	updateMouseWorldPosition();
};
const brickUnderMouse = (includeFixed) => {
	for (let i = entities.length - 1; i >= 0; i -= 1) {
		const entity = entities[i];
		if (
			(includeFixed || !entity.fixed) &&
			entity.x < mouse.worldX &&
			entity.x + entity.width > mouse.worldX &&
			entity.y < mouse.worldY &&
			entity.y + entity.height > mouse.worldY
		) {
			return entity;
		}
	}
};

const connects = (a, b, direction = 0) => (
	(
		(direction >= 0 && b.y === a.y + a.height) ||
		(direction <= 0 && b.y + b.height === a.y)
	) &&
	a.x + a.width > b.x &&
	a.x < b.x + b.width
);

const allConnectedToFixed = ({ ignoreEntities = [] } = {}) => {
	const connectedToFixed = [];
	const addAnyAttached = (entity) => {
		const entitiesToCheck = [].concat(
			entitiesByTopY[entity.y + entity.height] || [],
			entitiesByBottomY[entity.y] || [],
		);
		for (const otherEntity of entitiesToCheck) {
			if (
				entity.x + entity.width > otherEntity.x &&
				entity.x < otherEntity.x + otherEntity.width &&
				ignoreEntities.indexOf(otherEntity) === -1 &&
				connectedToFixed.indexOf(otherEntity) === -1
			) {
				connectedToFixed.push(otherEntity);
				addAnyAttached(otherEntity);
			}
		}
	};
	for (const entity of entities) {
		if (
			ignoreEntities.indexOf(entity) === -1 &&
			connectedToFixed.indexOf(entity) === -1
		) {
			if (entity.fixed) {
				connectedToFixed.push(entity);
				addAnyAttached(entity);
			}
		}
	}
	return connectedToFixed;
};

const connectsToFixed = (startEntity, { direction = 0, ignoreEntities = [] } = {}) => {
	const visited = [];
	const search = (fromEntity) => {
		if (currentLevel.bounds) {
			if (fromEntity.y + fromEntity.height >= currentLevel.bounds.y + currentLevel.bounds.height) {
				// for case of non-fixed brick at bottom of level
				// which shouldn't happen in the game, but can happen in the editor
				return true;
			}
		}
		const entitiesToCheck = [].concat(
			(fromEntity !== startEntity || direction !== -1) && entitiesByTopY[fromEntity.y + fromEntity.height] || [],
			(fromEntity !== startEntity || direction !== +1) && entitiesByBottomY[fromEntity.y] || [],
		);
		for (const otherEntity of entitiesToCheck) {
			if (
				!otherEntity.grabbed &&
				ignoreEntities.indexOf(otherEntity) === -1 &&
				visited.indexOf(otherEntity) === -1 &&
				fromEntity.x + fromEntity.width > otherEntity.x &&
				fromEntity.x < otherEntity.x + otherEntity.width
			) {
				visited.push(otherEntity);
				if (otherEntity.fixed) {
					return true;
				}
				if (search(otherEntity)) {
					return true;
				}
			}
		}
		return false;
	};
	return search(startEntity);
};

const possibleGrabs = () => {
	const findAttached = (brick, direction, attached, topLevel) => {
		const entitiesToCheck1 = [].concat(
			entitiesByTopY[brick.y + brick.height] || [],
			entitiesByBottomY[brick.y] || [],
		);
		for (const entity of entitiesToCheck1) {
			if (
				entity !== brick &&
				// for things that aren't bricks, check above, in case someone's standing on these blocks
				connects(brick, entity, entity.type === "brick" ? direction : -1) &&
				// prevent heavy recursion when e.g. there's a pyramid of blocks
				attached.indexOf(entity) === -1
			) {
				if (entity.fixed || entity.type !== "brick") {
					// can't drag in this direction (e.g. the block might be sandwiched) or
					// junkbot or an enemy might be standing on these blocks
					return false;
				} else {
					attached.push(entity);
					const okay = findAttached(entity, direction, attached);
					if (!okay) {
						return false;
					}
				}
			}
		}
		if (topLevel) {
			for (const brick of attached) {
				const entitiesToCheck2 = [].concat(
					entitiesByTopY[brick.y + brick.height] || [],
					entitiesByBottomY[brick.y] || [],
				);
				for (const entity of entitiesToCheck2) {
					if (
						!entity.fixed &&
						(entity.type === "brick" || entity.type === "jump" || entity.type === "shield") &&
						brick.x + brick.width > entity.x &&
						brick.x < entity.x + entity.width &&
						attached.indexOf(entity) === -1 &&
						!connectsToFixed(entity, { ignoreEntities: attached })
					) {
						const entitiesToCheck3 = entitiesByBottomY[entity.y] || [];
						for (const junk of entitiesToCheck3) {
							if (junk.type !== "brick") {
								if (
									entity.x + entity.width > junk.x &&
									entity.x < junk.x + junk.width
								) {
									return false;
								}
							}
						}
						attached.push(entity);
					}
				}
			}
		}
		return true;
	};

	const brick = brickUnderMouse(editing);
	if (!brick) {
		return [];
	}
	const grabs = [];
	if (editing && (keys.ControlLeft || keys.ControlRight)) {
		grabs.push([brick]);
		return grabs;
	}
	if (editing && brick.selected) {
		grabs.push(grabs.selection = entities.filter((entity) => entity.selected));
		return grabs;
	}
	if (brick.fixed || (brick.type !== "brick" && brick.type !== "jump" && brick.type !== "shield")) {
		if (editing) {
			grabs.push([brick]);
			return grabs;
		}
		return [];
	}

	const grabDownward = [brick];
	const grabUpward = [brick];
	const canGrabDownward = findAttached(brick, +1, grabDownward, true);
	const canGrabUpward = findAttached(brick, -1, grabUpward, true);
	if (editing && canGrabDownward === canGrabUpward) {
		grabs.push([brick]);
		return grabs;
	}
	if (canGrabDownward) {
		grabs.push(grabDownward);
		grabs.downward = grabDownward;
	}
	if (canGrabUpward) {
		grabs.push(grabUpward);
		grabs.upward = grabUpward;
	}
	return grabs;
};

let pendingGrabs = [];
const startGrab = (grab) => {
	undoable();
	dragging = [...grab];
	for (const brick of dragging) {
		brick.grabbed = true;
		brick.grabOffset = {
			// x: brick.x - floor(mouse.worldX, snapX),
			// y: brick.y - floor(mouse.worldY, snapY),
			// so you can place blocks that were grabbed when they weren't on the grid:
			// (note: this does lose relative sub-grid positions of bricks)
			x: floor(brick.x, snapX) - floor(mouse.worldX, snapX),
			y: floor(brick.y, snapY) - floor(mouse.worldY, snapY),
		};
		if (editing) {
			brick.selected = true;
		}
	}
	playSound("blockPickUp");
	if (!editing) {
		moves += 1;
	}
};

canvas.addEventListener("wheel", (event) => {
	updateMouse(event);
	event.preventDefault();
	// Normalize to deltaX in case shift modifier is used on Mac
	const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
	if (delta < 0) {
		zoomIn({ x: mouse.x, y: mouse.y });
	} else {
		zoomOut({ x: mouse.x, y: mouse.y });
	}
});

canvas.addEventListener("pointermove", (event) => {
	updateMouse(event);
	if (pendingGrabs.length) {
		const threshold = 10;
		if (
			mouse.y < mouse.atDragStart.y - threshold
		) {
			startGrab(pendingGrabs.upward);
			pendingGrabs = [];
		}
		if (
			mouse.y > mouse.atDragStart.y + threshold
		) {
			startGrab(pendingGrabs.downward);
			pendingGrabs = [];
		}
	}
	// Find this pointer in the cache and update its record with the latest event
	for (let i = 0; i < pointerEventCache.length; i++) {
		if (event.pointerId === pointerEventCache[i].pointerId) {
			pointerEventCache[i] = event;
			break;
		}
	}
	// If two pointers are down, check for pinch gestures
	if (pointerEventCache.length === 2) {
		const [a, b] = pointerEventCache;
		const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

		if (prevPointerDist > 0) {
			if (dist > prevPointerDist + 50) {
				zoomIn();
				prevPointerDist = dist;
			}
			if (dist < prevPointerDist - 50) {
				zoomOut();
				prevPointerDist = dist;
			}
		} else {
			prevPointerDist = dist;
		}
	}
});
canvas.addEventListener("pointerdown", (event) => {
	if (!muted) {
		audioCtx.resume();
	}
	pointerEventCache.push(event);
	canvas.focus(); // for keyboard shortcuts, after interacting with dropdown
	window.getSelection().removeAllRanges(); // for keyboard shortcuts for copy and paste after selecting text
	updateMouse(event);
	mouse.atDragStart = {
		x: mouse.x,
		y: mouse.y,
		worldX: mouse.worldX,
		worldY: mouse.worldY,
	};
	if (dragging.length === 0) {
		sortEntitiesForRendering(entities);
		const grabs = possibleGrabs();
		if (!grabs.selection) {
			for (const entity of entities) {
				delete entity.selected;
			}
		}
		if (grabs.length === 1) {
			startGrab(grabs[0]);
			playSound("blockClick");
		} else if (grabs.length) {
			pendingGrabs = grabs;
			playSound("blockClick");
		} else if (editing) {
			selectionBox = { x1: mouse.worldX, y1: mouse.worldY, x2: mouse.worldX, y2: mouse.worldY };
			playSound("selectStart");
		}
	}
});

const canRelease = () => {
	if (dragging.length === 0) {
		return false; // optimization mainly - don't do allConnectedToFixed()
	}
	if (editing) {
		return true;
	}

	const connectedToFixed = allConnectedToFixed();

	const someCollision = dragging.some((entity) => (
		entityCollisionTest(entity.x, entity.y, entity, () => true)
	));
	if (someCollision) {
		return false;
	}

	if (dragging.every((entity) => entity.fixed)) {
		return true;
	}
	let connectsToCeiling = false;
	let connectsToFloor = false;
	for (const entity of dragging) {
		for (const otherEntity of entities) {
			if (
				!otherEntity.grabbed
			) {
				if (
					(
						otherEntity.type === "fire" ||
						otherEntity.type === "fan"
					) &&
					connects(entity, otherEntity)
				) {
					return false;
				}
				if (
					otherEntity.type === "brick" &&
					connectedToFixed.indexOf(otherEntity) !== -1
				) {
					if (connects(entity, otherEntity, -1)) {
						connectsToCeiling = true;
					}
					if (connects(entity, otherEntity, +1)) {
						connectsToFloor = true;
					}
				}
			}
		}
	}
	return connectsToCeiling !== connectsToFloor;
};
addEventListener("pointerup", () => {
	if (dragging.length) {
		if (canRelease()) {
			dragging.forEach((entity) => {
				delete entity.grabbed;
				delete entity.grabOffset;
			});
			dragging = [];
			playSound("blockDrop");
			save();
		}
	} else if (selectionBox) {
		const toSelect = entitiesWithinSelection(selectionBox);
		toSelect.forEach((entity) => {
			entity.selected = true;
		});
		selectionBox = null;
		if (toSelect.length) {
			playSound("selectEnd");
		}
	}
});

// #@: simulateCrate, simulateBlock, simulateBrick, falling behavior
const simulateGravity = () => {
	for (const entity of entities) {
		if (!entity.fixed && !entity.grabbed && !entity.floating && entity.type !== "drop" && entity.type !== "junkbot" && entity.type !== "climbbot" && entity.type !== "flybot" && entity.type !== "eyebot") {
			// if not settled
			if (
				!rectangleLevelBoundsCollisionTest(entity.x, entity.y + 1, entity.width, entity.height) &&
				!connectsToFixed(entity, { direction: (entity.type === "junkbot" || entity.type === "gearbot" || entity.type === "crate" || entity.type === "bin") ? 1 : 0 })
			) {
				const notDrop = (entity) => entity.type !== "drop";

				// just for dinosaur test case level,
				// where there are some blocks meant to stick inside the ceiling
				if (entityCollisionTest(entity.x, entity.y, entity, notDrop)) {
					debug("GRAVITY COLLISION", `${entity.type} stuck in ground at ${entity.x}, ${entity.y}`);
					return;
				}

				// first try a step of 18 (1 grid cell) downwards,
				// then reign it in if there's a collision
				const cellDownY = entity.y + 18;
				// find highest up collision (if any)
				const ground = entityCollisionAll(entity.x, cellDownY + 1, entity, notDrop)
					.sort((a, b) => a.y - b.y)[0];
				debug("GRAVITY COLLISION", `ground: ${JSON.stringify(ground, null, "\t")}`);
				if (ground) {
					entity.y = ground.y - entity.height;
					entityMoved(entity);
				} else {
					entity.y = cellDownY;
					entityMoved(entity);
				}
			}
		}
	}
};

const hurtJunkbot = (junkbot, cause) => {
	if (junkbot.dying || junkbot.dead || junkbot.grabbed) {
		return;
	}
	// Play sound even if shielded,
	// but not if losing shield because then it would repeat and sound ugly.
	// This has to be before junkbot.losingShield is set, so it can play the first time.
	if (!junkbot.losingShield) {
		// @TODO: rename sound effects, as they're not just for death
		if (cause === "fire") {
			playSound("deathByFire");
		} else if (cause === "water") {
			playSound("deathByWater");
		} else {
			playSound("deathByBot");
		}
	}
	if (junkbot.armored) {
		if (!junkbot.losingShield) {
			junkbot.losingShield = true;
			// don't reset junkbot.losingShieldTime to 0
			// it wouldn't make sense for multiple hits to extend the shield
			// (it should be reset elsewhere)
		}
	} else {
		junkbot.animationFrame = 0;
		junkbot.collectingBin = false;
		junkbot.dying = true;
		if (cause === "water") {
			junkbot.dyingFromWater = true;
		}
	}
};

// i.e. space generally free
const notBinOrDrop = (entity) => (
	entity.type !== "bin" &&
	entity.type !== "drop"
);
// i.e. ground to walk on
const notBinOrDropOrEnemyBot = (entity) => (
	notBinOrDrop(entity) &&
	entity.type !== "gearbot" &&
	entity.type !== "climbbot" &&
	entity.type !== "flybot" &&
	entity.type !== "eyebot"
);

const walk = (junkbot) => {
	const posInFront = { x: junkbot.x + junkbot.facing * 15, y: junkbot.y };
	const stepOrWall = entityCollisionTest(posInFront.x, posInFront.y, junkbot, notBinOrDropOrEnemyBot);
	if (stepOrWall) {
		// can we step up?
		const posStepUp = { x: posInFront.x, y: stepOrWall.y - junkbot.height };
		if (
			posStepUp.y - junkbot.y >= -18 &&
			posStepUp.y - junkbot.y < 0 &&
			!entityCollisionTest(posStepUp.x, posStepUp.y, junkbot, notBinOrDrop)
		) {
			debug("JUNKBOT", "STEP UP");
			junkbot.x = posStepUp.x;
			junkbot.y = posStepUp.y;
			entityMoved(junkbot);
			return;
		}
	}
	// is there solid ground ahead to walk on?
	const ground = entityCollisionTest(posInFront.x, posInFront.y + 1, junkbot, notBinOrDropOrEnemyBot);
	if (
		ground &&
		!entityCollisionTest(posInFront.x, posInFront.y, junkbot, notBinOrDrop)
	) {
		debug("JUNKBOT", "WALK");
		junkbot.x = posInFront.x;
		junkbot.y = posInFront.y;
		entityMoved(junkbot);
		return;
	}
	let step = entityCollisionAll(posInFront.x, posInFront.y + 18 + 1, junkbot, notBinOrDropOrEnemyBot)
		.sort((a, b) => a.y - b.y)[0];
	if (step) {
		// can we step down?
		// debug("JUNKBOT", `step: ${JSON.stringify(step, null, "\t")}`);
		const posStepDown = { x: posInFront.x, y: step.y - junkbot.height };
		step = entityCollisionAll(posStepDown.x, posStepDown.y + 1, junkbot, notBinOrDropOrEnemyBot)
			.sort((a, b) => a.y - b.y)[0];
		// debug("JUNKBOT", `step: ${JSON.stringify(step, null, "\t")}`);
		if (
			posStepDown.y - junkbot.y <= 18 &&
			posStepDown.y - junkbot.y > 0 &&
			step &&
			!entityCollisionTest(posStepDown.x, posStepDown.y, junkbot, notBinOrDrop)
		) {
			debug("JUNKBOT", "STEP DOWN");
			junkbot.x = posStepDown.x;
			junkbot.y = posStepDown.y;
			entityMoved(junkbot);
			return;
		}
	}
	debug("JUNKBOT", "CLIFF/WALL/BOT - TURN AROUND");
	junkbot.facing *= -1;
	playSound("turn");
};

const simulateJunkbot = (junkbot) => {
	const aboveHead = entityCollisionTest(junkbot.x, junkbot.y - 1, junkbot, notBinOrDrop);
	const headLoaded = aboveHead && (
		junkbot.floating || (
			!aboveHead.fixed &&
			!connectsToFixed(aboveHead, { ignoreEntities: [junkbot] }) &&
			aboveHead.type !== "levelBounds" &&
			aboveHead.type !== "flybot" &&
			aboveHead.type !== "eyebot"
		)
	);
	if (junkbot.headLoaded && !headLoaded) {
		junkbot.headLoaded = false;
	} else if (headLoaded && !junkbot.headLoaded && !junkbot.grabbed) {
		junkbot.headLoaded = true;
		playSound("headBonk");
	}
	if (junkbot.losingShield) {
		junkbot.losingShieldTime += 1;
		if (junkbot.losingShieldTime > 30) { // @TODO: figure out how long it takes to lose shield
			junkbot.armored = false;
			junkbot.losingShield = false;
			junkbot.losingShieldTime = 0; // important for next damage event
			playSound("losePowerup");
		}
	}
	junkbot.animationFrame += 1;
	if (junkbot.collectingBin) {
		if (junkbot.animationFrame >= 17) {
			junkbot.collectingBin = false;
			junkbot.animationFrame = 0;
		} else {
			return;
		}
	}
	if (junkbot.dying) {
		if (junkbot.animationFrame >= 10) {
			junkbot.animationFrame = 0;
			junkbot.dead = true;
		}
		return;
	}
	if (junkbot.gettingShield) {
		if (junkbot.animationFrame >= 11) {
			junkbot.gettingShield = false;
			junkbot.armored = true;
		} else {
			return;
		}
	}
	const inside = entityCollisionTest(junkbot.x, junkbot.y, junkbot, notBinOrDrop);
	if (inside) {
		debug("JUNKBOT", "STUCK IN WALL");
		// debug("JUNKBOT", "STUCK IN WALL - GO UP");
		// junkbot.y = inside.y - junkbot.height;
		// entityMoved(junkbot);
		return;
	}
	if (junkbot.floating) {
		const abovePos = { x: junkbot.x, y: junkbot.y - 18 };
		const aboveHead = entityCollisionTest(abovePos.x, abovePos.y, junkbot, notBinOrDrop);
		if (aboveHead) {
			debug("JUNKBOT", "FLOATING - CAN'T GO UP");
		} else {
			debug("JUNKBOT", "FLOATING - GO UP");
			junkbot.x = abovePos.x;
			junkbot.y = abovePos.y;
			entityMoved(junkbot);
		}
		return;
	}
	if (junkbot.velocityX === undefined) {
		junkbot.velocityX = 0;
	}
	if (junkbot.velocityY === undefined) {
		junkbot.velocityY = 0;
	}
	junkbot.velocityX = Math.min(20, Math.max(-20, junkbot.velocityX));
	junkbot.velocityY = Math.min(20, Math.max(-20, junkbot.velocityY));
	const inAir = !entityCollisionTest(junkbot.x, junkbot.y + 1, junkbot, notBinOrDrop);
	const unaligned = junkbot.x % 15 !== 0;
	const jumpStarting = junkbot.velocityY < 0;
	if (inAir || jumpStarting || unaligned) {
		if (inAir) {
			debug("JUNKBOT", "IN AIR - DO BALLISTIC MOTION (AND SNAPPING ON COLLISION WITH GROUND)");
		} else if (jumpStarting) {
			debug("JUNKBOT", "JUMP - DO BALLISTIC MOTION (AND SNAPPING ON COLLISION WITH GROUND)");
		} else if (unaligned) {
			debug("JUNKBOT", "UNALIGNED - DO (BALLISTIC MOTION AND) SNAPPING TO GROUND");
		}

		debug("JUNKBOT", "velocity x:", junkbot.velocityX);
		debug("JUNKBOT", "velocity y:", junkbot.velocityY);
		let toGoX = junkbot.velocityX;
		let toGoY = junkbot.velocityY;
		const dirX = Math.sign(toGoX);
		const dirY = Math.sign(toGoY);
		while (Math.abs(toGoY) >= 1) {
			toGoY -= dirY;
			const newPos = { x: junkbot.x, y: junkbot.y + dirY };
			if (entityCollisionTest(newPos.x, newPos.y, junkbot, notBinOrDrop)) {
				debug("JUNKBOT", `collision in y direction (with ${toGoX} to go)`);
				junkbot.velocityY = 0;
				if (dirX === 1) {
					toGoX = 15 - junkbot.x + floor(junkbot.x, 15);
				} else {
					toGoX = floor(junkbot.x, 15) - junkbot.x;
				}
				break;
			} else {
				debug("JUNKBOT", "move y");
				junkbot.x = newPos.x;
				junkbot.y = newPos.y;
				if (
					entityCollisionTest(newPos.x + dirX, newPos.y + 1, junkbot, notBinOrDrop) &&
					!entityCollisionTest(newPos.x, newPos.y + 1, junkbot, notBinOrDrop) &&
					!entityCollisionTest(newPos.x + dirX, newPos.y, junkbot, notBinOrDrop)
				) {
					junkbot.velocityX = 0;
					junkbot.velocityY = 0;
					toGoX = 15 * dirX;
					break;
				}
			}
		}
		while (Math.abs(toGoX) >= 1) {
			toGoX -= dirX;
			const newPos = { x: junkbot.x + dirX, y: junkbot.y };
			if (entityCollisionTest(newPos.x, newPos.y, junkbot, notBinOrDrop)) {
				debug("JUNKBOT", `collision in x direction (with ${toGoY} to go)`);
				junkbot.velocityX = dirX;
				break;
			} else {
				debug("JUNKBOT", "move x");
				junkbot.x = newPos.x;
				junkbot.y = newPos.y;
			}
		}
		junkbot.velocityY += 3;
		entityMoved(junkbot);
		return;
	}
	if (junkbot.animationFrame % 5 === 4) {
		const posInFront = { x: junkbot.x + junkbot.facing * 15, y: junkbot.y };
		const cratesInFront = rectangleCollisionAll(posInFront.x, posInFront.y, junkbot.width, junkbot.height + 1, (otherEntity) => (
			otherEntity.type === "crate" && (
				otherEntity.x + otherEntity.width <= junkbot.x ||
				junkbot.x + junkbot.width <= otherEntity.x
			)
		));
		if (cratesInFront.every((crate) => !entityCollisionTest(crate.x + junkbot.facing * 15, crate.y, crate, (otherEntity) => otherEntity.type !== "drop"))) {
			for (const crate of cratesInFront) {
				crate.x += junkbot.facing * 15;
			}
		}
		walk(junkbot);
		const groundLevelEntities = entitiesByTopY[junkbot.y + junkbot.height] || [];
		for (const groundLevelEntity of groundLevelEntities) {
			if (groundLevelEntity.x <= junkbot.x && groundLevelEntity.x + groundLevelEntity.width >= junkbot.x + junkbot.width) {
				if (groundLevelEntity.type === "switch") {
					groundLevelEntity.on = !groundLevelEntity.on;
					for (const entity of entities) {
						if (entity.type === "fire" || entity.type === "fan") {
							if (entity.switchID === groundLevelEntity.switchID) {
								entity.on = !entity.on;
							}
						}
					}
					playSound("switchClick");
					playSound(groundLevelEntity.on ? "switchOn" : "switchOff");
				} else if (groundLevelEntity.type === "fire" && groundLevelEntity.on) {
					hurtJunkbot(junkbot, "fire");
				} else if (groundLevelEntity.type === "shield" && !groundLevelEntity.used && (junkbot.losingShield || !junkbot.armored)) {
					junkbot.animationFrame = 0;
					junkbot.gettingShield = true;
					junkbot.losingShield = false;
					junkbot.losingShieldTime = 0; // important for next damage event
					groundLevelEntity.used = true;
					playSound("getShield");
					playSound("getPowerup");
				} else if (groundLevelEntity.type === "jump") {
					junkbot.animationFrame = 0;
					junkbot.velocityY = -20;
					junkbot.velocityX = junkbot.facing * 10;
					playSound("jump");
					groundLevelEntity.active = true;
					groundLevelEntity.animationFrame = 0;
				}
			}
		}
	}

	const bin = entityCollisionTest(junkbot.x + junkbot.facing * 15, junkbot.y, junkbot, (otherEntity) => (
		otherEntity.type === "bin"
	));
	if (bin) {
		junkbot.animationFrame = 0;
		junkbot.collectingBin = true;
		remove(entities, bin);
		playSound("collectBin");
		playSound("collectBin2");
		collectBinTime = Date.now();
	}
};

const simulateGearbot = (gearbot) => {
	gearbot.animationFrame += 1;
	if (gearbot.animationFrame > 2) {
		gearbot.animationFrame = 0;
		const aheadPos = { x: gearbot.x + gearbot.facing * 15, y: gearbot.y };
		const ahead = entityCollisionTest(aheadPos.x, aheadPos.y, gearbot, (otherEntity) => otherEntity.type !== "drop");
		const groundAhead = rectangleCollisionTest(gearbot.x + ((gearbot.facing === -1) ? -15 : gearbot.width), gearbot.y + 1, 15, gearbot.height, (otherEntity) => otherEntity.type !== "drop");
		if (ahead) {
			if (ahead.type === "junkbot" && !ahead.dying && !ahead.dead) {
				hurtJunkbot(ahead, "bot");
			}
			gearbot.facing *= -1;
		} else if (groundAhead) {
			gearbot.x = aheadPos.x;
			gearbot.y = aheadPos.y;
			entityMoved(gearbot);
		} else {
			gearbot.facing *= -1;
		}
	}
};

const simulateFlybot = (flybot) => {
	flybot.animationFrame += 1;
	if (flybot.animationFrame > 2) {
		flybot.animationFrame = 0;
		const aheadPos = { x: flybot.x + flybot.facing * 15, y: flybot.y };
		const ahead = entityCollisionTest(aheadPos.x, aheadPos.y, flybot, (otherEntity) => otherEntity.type !== "drop");
		if (ahead) {
			if (ahead.type === "junkbot") {
				hurtJunkbot(ahead, "bot");
			}
			flybot.facing *= -1;
		} else {
			flybot.x = aheadPos.x;
			flybot.y = aheadPos.y;
			entityMoved(flybot);
		}
	}
};

const simulateEyebot = (eyebot) => {
	for (const [directionX, directionY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		const offsets = directionY !== 0 ? [[0, 0], [15, 0]] : [[0, 0], [0, 18]];
		for (const [offsetX, offsetY] of offsets) {
			const { hit } = raycast({
				startX: eyebot.x + offsetX,
				startY: eyebot.y + offsetY,
				width: 15,
				height: 18,
				directionX, directionY,
				maxSteps: 50,
				entityFilter: (entity) => entity.type !== "drop" && entity !== eyebot,
			});
			if (hit && hit.type === "junkbot") {
				eyebot.facing = directionX;
				eyebot.facingY = directionY;
				eyebot.activeTimer = 110;
			}
		}
	}

	eyebot.activeTimer -= 1;
	eyebot.animationFrame += 1;
	if (eyebot.animationFrame % ((eyebot.activeTimer > 0) ? 1 : 2) === 0) {
		const aheadPos = { x: eyebot.x + eyebot.facing * 15, y: eyebot.y + (eyebot.facingY || 0) * 18 };
		const ahead = entityCollisionTest(aheadPos.x, aheadPos.y, eyebot, (otherEntity) => otherEntity.type !== "drop");
		if (ahead) {
			if (ahead.type === "junkbot") {
				hurtJunkbot(ahead, "bot");
			}
			eyebot.facing *= -1;
			eyebot.facingY *= -1;
		} else {
			eyebot.x = aheadPos.x;
			eyebot.y = aheadPos.y;
			entityMoved(eyebot);
		}
	}
	if (eyebot.animationFrame > 2) {
		eyebot.animationFrame = 0;
	}
};

const simulateClimbbot = (climbbot) => {
	climbbot.animationFrame += 1;
	if (climbbot.animationFrame > 6) {
		climbbot.animationFrame = 0;
		const asidePos = { x: climbbot.x + climbbot.facing * 15, y: climbbot.y };
		const groundAsidePos = { x: climbbot.x + climbbot.facing * 15, y: climbbot.y + 1 };
		const behindHorizontallyPos = { x: climbbot.x + climbbot.facing * -15, y: climbbot.y };
		const aheadPos = climbbot.facingY === 0 ? asidePos : { x: climbbot.x, y: climbbot.y + climbbot.facingY * 18 };
		const belowPos = { x: climbbot.x, y: climbbot.y + 18 };
		const aside = entityCollisionTest(asidePos.x, asidePos.y, climbbot, (otherEntity) => otherEntity.type !== "drop");
		const groundAside = entityCollisionTest(groundAsidePos.x, groundAsidePos.y, climbbot, (otherEntity) => otherEntity.type !== "drop" && otherEntity.type !== "bin");
		const ahead = entityCollisionTest(aheadPos.x, aheadPos.y, climbbot, (otherEntity) => otherEntity.type !== "drop");
		const behindHorizontally = entityCollisionTest(behindHorizontallyPos.x, behindHorizontallyPos.y, climbbot, (otherEntity) => otherEntity.type !== "drop");
		const below = entityCollisionTest(belowPos.x, belowPos.y, climbbot, (otherEntity) => otherEntity.type !== "drop");

		if (ahead && ahead.type === "junkbot") {
			hurtJunkbot(ahead, "bot");
		}
		if (climbbot.facingY === -1) {
			if (!aside && groundAside) {
				climbbot.facingY = 0;
				climbbot.x = asidePos.x;
				climbbot.y = asidePos.y;
			} else if (climbbot.energy > 0 && !ahead) {
				climbbot.energy -= 1;
				climbbot.x = aheadPos.x;
				climbbot.y = aheadPos.y;
				entityMoved(climbbot);
			} else {
				climbbot.facingY = 1;
			}
		} else if (climbbot.facingY === 1) {
			if (below) {
				if (aside && behindHorizontally) {
					climbbot.facingY = -1;
					climbbot.energy = 3;
				} else {
					climbbot.facingY = 0;
					if (aside) {
						if (!behindHorizontally) {
							climbbot.facing *= -1;
							climbbot.x = behindHorizontallyPos.x;
							climbbot.y = behindHorizontallyPos.y;
							entityMoved(climbbot);
						}
					} else {
						climbbot.x = asidePos.x;
						climbbot.y = asidePos.y;
						entityMoved(climbbot);
					}
				}
			} else {
				climbbot.x = belowPos.x;
				climbbot.y = belowPos.y;
				entityMoved(climbbot);
			}
		} else {
			if (below) {
				if (aside) {
					climbbot.facingY = -1;
					climbbot.energy = 3;
				} else {
					climbbot.x = asidePos.x;
					climbbot.y = asidePos.y;
					entityMoved(climbbot);
				}
			} else {
				if (aside) {
					climbbot.facingY = 1;
				// } else if (groundAside) {
				// 	climbbot.x = asidePos.x;
				// 	climbbot.y = asidePos.y;
				// 	entityMoved(climbbot);
				} else {
					climbbot.facingY = 1;
					climbbot.x = belowPos.x;
					climbbot.y = belowPos.y;
					entityMoved(climbbot);
				}
			}
		}
	}
	// may not be necessary, but it "feels right" to reset this
	if (climbbot.facingY !== -1) {
		climbbot.energy = 0;
	}
};

const simulateDrop = (drop) => {
	if (drop.splashing) {
		drop.animationFrame += 1;
		if (drop.animationFrame > 4) {
			remove(entities, drop);
		}
	} else {
		for (let i = 0; i < 18; i++) {
			const underneath = entitiesByTopY[drop.y + drop.height] || [];
			drop.y += 1;
			entityMoved(drop);
			for (const ground of underneath) {
				if (
					!ground.grabbed &&
					drop.x + drop.width > ground.x &&
					drop.x < ground.x + ground.width &&
					// ground.type !== "pipe" && // actually it should hit pipes, ref: https://youtu.be/Z_PmQhrk5Zw?t=4418
					ground.type !== "drop"
				) {
					if (ground.type === "junkbot") {
						hurtJunkbot(ground, "water");
					}
					// ground.colorName = "blue";
					drop.splashing = true;
					drop.animationFrame = 0;

					playSound(`drip${Math.floor(Math.random() * numDrips)}`);
					break;
				}
			}
		}
	}
};

const maxDripPeriod = 50;
const minDripPeriod = 20;
const simulatePipe = (pipe) => {
	pipe.timer -= 1;
	// @TODO: how do pipe drips work in the original game?
	// - after X time, C% chance every frame? (maybe with a max of Y time?)
	// - timer set to random value between X and Y?
	// - only initial randomization, consistent interval after that, just offset from other pipes
	if (pipe.timer === 0) {
		entities.push(makeDrop({
			x: pipe.x,
			y: pipe.y,
		}));
	}
	if (pipe.timer <= 0) { // includes initial -1 for initial randomization
		pipe.timer = Math.floor(Math.random() * (maxDripPeriod - minDripPeriod)) + minDripPeriod;
	}
};

const simulateJump = (jump) => {
	jump.animationFrame += 1;
	if (jump.animationFrame >= 5) {
		jump.animationFrame = 0;
		jump.active = false;
	}
};

const updateAccelerationStructures = () => {
	// add new entities to acceleration structures
	for (const entity of entities) {
		if (!lastKeys.has(entity)) {
			entityMoved(entity);
		}
	}
	// clean up acceleration structures
	lastKeys.forEach((yKeys, entity) => {
		if (entities.indexOf(entity) === -1) {
			if (yKeys.topY) {
				remove(entitiesByTopY[yKeys.topY], entity);
			}
			if (yKeys.bottomY) {
				remove(entitiesByBottomY[yKeys.bottomY], entity);
			}
			lastKeys.delete(entity);
		}
	});
	const cleanByYObj = (entitiesByY) => {
		Object.keys(entitiesByY).forEach((y) => {
			if (entitiesByY[y].length === 0) {
				delete entitiesByY[y];
			}
		});
	};
	cleanByYObj(entitiesByTopY);
	cleanByYObj(entitiesByBottomY);
};

const simulate = (entities) => {
	updateAccelerationStructures();

	// sort for gravity
	entities.sort((a, b) => b.y - a.y);

	simulateGravity();

	for (const entity of entities) {
		if (!entity.grabbed) {
			if (entity.type === "junkbot") {
				simulateJunkbot(entity);
			} else if (entity.type === "gearbot") {
				simulateGearbot(entity);
			} else if (entity.type === "climbbot") {
				simulateClimbbot(entity);
			} else if (entity.type === "flybot") {
				simulateFlybot(entity);
			} else if (entity.type === "eyebot") {
				simulateEyebot(entity);
			} else if (entity.type === "jump") {
				simulateJump(entity);
			} else if (entity.type === "pipe") {
				simulatePipe(entity);
			} else if (entity.type === "drop") {
				simulateDrop(entity);
			} else if ("animationFrame" in entity) {
				entity.animationFrame += 1;
			}
		}
	}

	for (const entity of entities) {
		if ("floating" in entity) {
			entity.wasFloating = entity.floating;
			delete entity.floating;
		}
	}
	wind.length = 0;
	for (const entity of entities) {
		if (entity.type === "fan" && entity.on) {
			const fan = entity;
			const extents = [];
			for (let x = fan.x + 15; x < fan.x + fan.width - 15; x += 15) {
				let extent = 0;
				for (let y = fan.y - 18; y > -200; y -= 18) {
					let collision = false;
					for (const otherEntity of entities) {
						if (!otherEntity.grabbed && rectanglesIntersect(
							x,
							y,
							15,
							18,
							otherEntity.x,
							otherEntity.y,
							otherEntity.width,
							otherEntity.height,
						)) {
							if (otherEntity.type === "junkbot") {
								if (!otherEntity.wasFloating) {
									playSound("fan");
								}
								otherEntity.floating = true;
							} else if (otherEntity.type !== "drop") {
								collision = true;
								break;
							}
						}
					}
					if (collision) {
						break;
					}
					extent += 1;
				}
				extents.push(extent);
			}
			wind.push({ fan, extents });
		}
	}
	for (const entity of entities) {
		delete entity.wasFloating;
	}
};

const detectProblems = () => {
	// active validity checking of the world

	const maxEntityHeight = 100;
	const reportedCollisions = new Map();
	const isNum = (value) => typeof value === "number" && isFinite(value);
	const problems = [];
	for (const entity of entities) {
		/* eslint-disable no-continue */
		if (!isNum(entity.x) || !isNum(entity.y)) {
			problems.push({ message: `Invalid position (x/y) for entity ${JSON.stringify(entity, null, "\t")}\n` });
			continue;
		}
		if (entity.x % 15 !== 0) {
			problems.push({ message: `x position not aligned to grid for entity ${JSON.stringify(entity, null, "\t")}\n` });
			continue;
		}
		if (!isNum(entity.width) || !isNum(entity.height)) {
			problems.push({ message: `Invalid size (width/height) for entity ${JSON.stringify(entity, null, "\t")}\n` });
			continue;
		}
		if (entity.type === "brick" && !isNum(entity.widthInStuds)) {
			problems.push({ message: `Invalid widthInStuds for entity ${JSON.stringify(entity, null, "\t")}\n` });
			continue;
		}
		if (entity.type === "brick" && entity.width !== 15 * entity.widthInStuds) {
			problems.push({ message: `width doesn't match widthInStuds * 15 for entity ${JSON.stringify(entity, null, "\t")}\n` });
			continue;
		}
		// eslint-disable-next-line indent
		/* eslint-enable no-continue */
		for (const topY of Object.keys(entitiesByTopY).map(Number)) {
			if (
				topY < entity.y + entity.height &&
				topY + maxEntityHeight > entity.y
			) {
				for (const otherEntity of entitiesByTopY[topY]) {
					if (
						otherEntity !== entity &&
						(reportedCollisions.get(entity) || []).indexOf(otherEntity) === -1 &&
						(reportedCollisions.get(otherEntity) || []).indexOf(entity) === -1
					) {
						if (
							rectanglesIntersect(
								entity.x,
								entity.y,
								entity.width,
								entity.height,
								otherEntity.x,
								otherEntity.y,
								otherEntity.width,
								otherEntity.height,
							)
						) {
							const worldX = (entity.x + otherEntity.x + (entity.width + otherEntity.width) / 2) / 2;
							const worldY = (entity.y + otherEntity.y + (entity.height + otherEntity.height) / 2) / 2;
							problems.push({ message: `${entity.type} to ${otherEntity.type} collision`, worldX, worldY });
							if (reportedCollisions.has(entity)) {
								reportedCollisions.get(entity).push(otherEntity);
							} else {
								reportedCollisions.set(entity, [otherEntity]);
							}
							if (reportedCollisions.has(otherEntity)) {
								reportedCollisions.get(otherEntity).push(entity);
							} else {
								reportedCollisions.set(otherEntity, [entity]);
							}
						}
					}
				}
			}
		}
	}
	return problems;
};

let rafid;
window.addEventListener("error", () => {
	// so my computer doesn't freeze up from the console logging messages about repeated errors
	cancelAnimationFrame(rafid);
});

const animate = () => {
	rafid = requestAnimationFrame(animate);

	frameStartTime = Date.now();

	if (!keys.ControlLeft && !keys.ControlRight && !keys.AltLeft && !keys.AltRight) {
		if (keys.KeyW || keys.ArrowUp) {
			viewport.centerY -= 20;
		}
		if (keys.KeyS || keys.ArrowDown) {
			viewport.centerY += 20;
		}
		if (keys.KeyA || keys.ArrowLeft) {
			viewport.centerX -= 20;
		}
		if (keys.KeyD || keys.ArrowRight) {
			viewport.centerX += 20;
		}
	}
	if (pointerEventCache.length < 2 && enableMarginPanning) {
		const panMarginSize = Math.min(innerWidth, innerHeight) * 0.07;
		const panFromMarginSpeed = 10 * document.hasFocus();
		if (mouse.y < panMarginSize) {
			viewport.centerY -= panFromMarginSpeed;
		}
		if (mouse.y > canvas.height - panMarginSize) {
			viewport.centerY += panFromMarginSpeed;
		}
		if (mouse.x < panMarginSize + (editorUI.hidden ? 0 : editorUI.offsetWidth * window.devicePixelRatio)) {
			viewport.centerX -= panFromMarginSpeed;
		}
		if (mouse.x > canvas.width - panMarginSize - (testsUI.hidden ? 0 : testsUI.offsetWidth * window.devicePixelRatio)) {
			viewport.centerX += panFromMarginSpeed;
		}
	}
	if (currentLevel.bounds) {
		viewport.centerY = Math.min((currentLevel.bounds.y + currentLevel.bounds.height - 36) + canvas.height / 2 / viewport.scale, viewport.centerY);
		viewport.centerY = Math.max((currentLevel.bounds.y + 36) - canvas.height / 2 / viewport.scale, viewport.centerY);
		viewport.centerX = Math.min((currentLevel.bounds.x + currentLevel.bounds.width - 30) + canvas.width / 2 / viewport.scale, viewport.centerX);
		viewport.centerX = Math.max((currentLevel.bounds.x + 30) - canvas.width / 2 / viewport.scale, viewport.centerX);
	}
	updateMouseWorldPosition();

	if (!paused) {
		const now = performance.now();
		const timeSinceLastSimulate = now - lastSimulateTime;
		debug("TIME SINCE LAST SIMULATE", timeSinceLastSimulate);
		if (timeSinceLastSimulate >= 1000 / targetFPS) {
			debug("REMAINDER MILLISECONDS", timeSinceLastSimulate - 1000 / targetFPS);
			simulate(entities);
			smoothedFrameTime += (timeSinceLastSimulate - smoothedFrameTime) / fpsSmoothing;
			lastSimulateTime = now;
		}
		const smoothedFPS = 1000 / smoothedFrameTime;
		debug("SIMULATION FPS", smoothedFPS.toFixed(0));
		debug("TARGET FPS", targetFPS);
	} else {
		updateAccelerationStructures(); // also within simulate()
	}

	if (winOrLose() !== winLoseState) {
		winLoseState = winOrLose();
		if (winLoseState === "lose" && !paused) {
			paused = true;
		}
		if (winLoseState === "win" && !paused) {
			paused = true;
			if (!testing) {
				const timeSinceCollectBin = Date.now() - collectBinTime;
				const levelAtWin = currentLevel;
				setTimeout(() => {
					if (currentLevel !== levelAtWin) {
						return; // especially for while running tests and clicking on a test to go to
					}
					playSound("ohYeah");
					try {
						if (currentLevel.title) {
							const key = `fewest moves for ${currentLevel.title.toLowerCase()}`;
							const formerFewest = Number(localStorage[key]);
							let fewest = moves;
							if (isFinite(formerFewest)) {
								fewest = Math.min(fewest, formerFewest);
							}
							localStorage[key] = fewest;
						}
					} catch (error) {
						showMessageBox("Couldn't save level progress.\nAllow local storage (sometimes called 'cookies') to save progress.");
					}
					setTimeout(async () => {
						if (currentLevel !== levelAtWin) {
							return; // especially for while running tests and clicking on a test to go to
						}
						if (location.hash.match(/level=(Junkbot|Junkbot.*Undercover|Test.*Cases);/)) {
							if (levelSelect.selectedIndex === 0) {
								levelSelect.selectedIndex += 1;
							}
							levelSelect.selectedIndex += 1;
							await loadLevelFromLevelSelect();
							paused = false;
						}
					}, 500);
				}, Math.max(resources.collectBin.duration, resources.collectBin2.duration) * 1000 - timeSinceCollectBin);
			}
		}
	}

	sortEntitiesForRendering(entities);

	const hovered = dragging.length ? [] : possibleGrabs();

	if (dragging.length) {
		if (isFinite(mouse.worldX) && isFinite(mouse.worldY)) {
			for (const brick of dragging) {
				brick.x = floor(mouse.worldX, snapX) + brick.grabOffset.x;
				brick.y = floor(mouse.worldY, snapY) + brick.grabOffset.y;
				entityMoved(brick);
			}
		}
		canvas.style.cursor = `url("images/cursors/cursor-grabbing.png") 8 8, grabbing`;
	} else if (hovered.length >= 2) {
		canvas.style.cursor = `url("images/cursors/cursor-grab-either.png") 8 8, grab`;
	} else if (hovered.upward) {
		canvas.style.cursor = `url("images/cursors/cursor-grab-upward.png") 8 8, grab`;
	} else if (hovered.downward) {
		canvas.style.cursor = `url("images/cursors/cursor-grab-downward.png") 8 8, grab`;
	} else if (hovered.length) {
		canvas.style.cursor = `url("images/cursors/cursor-grab.png") 8 8, grab`;
	} else {
		canvas.style.cursor = "default";
	}

	// Note: while zooming, innerWidth * window.devicePixelRatio often stays the same, while both factors change
	if (
		canvas.width !== innerWidth * window.devicePixelRatio ||
		canvas.height !== innerHeight * window.devicePixelRatio ||
		canvas.style.width !== `${innerWidth}px` ||
		canvas.style.height !== `${innerHeight}px`
	) {
		canvas.width = innerWidth * window.devicePixelRatio;
		canvas.height = innerHeight * window.devicePixelRatio;
		canvas.style.width = `${innerWidth}px`;
		canvas.style.height = `${innerHeight}px`;
	}
	ctx.fillStyle = "#bbb";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.save(); // world viewport
	ctx.translate(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
	ctx.scale(viewport.scale, viewport.scale);
	ctx.translate(-Math.floor(viewport.centerX), -Math.floor(viewport.centerY));
	ctx.imageSmoothingEnabled = false;

	drawDecal(ctx, -6, -25, currentLevel.backdropName || "bkg1", currentLevel.game);
	if (currentLevel.backgroundDecals) {
		for (const { x, y, name } of currentLevel.backgroundDecals) {
			drawDecal(ctx, x - 3, y - 20, name, currentLevel.game);
		}
	}
	if (currentLevel.decals) {
		for (const { x, y, name } of currentLevel.decals) {
			drawDecal(ctx, x - 15 * 2, y - 64, name, currentLevel.game);
		}
	}

	const shouldHilight = (entity) => {
		return editing && entity.selected;
		// if (dragging.length) {
		// 	return dragging.indexOf(entity) > -1;
		// }
		// return hovered.length && hovered[Math.floor(Date.now() / 500 % hovered.length)].indexOf(entity) > -1;
	};

	const placeable = canRelease();

	// ctx.save();
	// ctx.translate(-6.5, -15);
	// ctx.scale(0.206, 0.206);
	// ctx.drawImage(testVideo, 0, 0);
	// ctx.restore();

	for (const entity of entities) {
		if (entity.grabbed) {
			ctx.globalAlpha = placeable ? 0.8 : 0.3;
		}
		drawEntity(ctx, entity, shouldHilight(entity));
		ctx.globalAlpha = 1;
	}
	for (const { fan, extents } of wind) {
		drawWind(ctx, fan, extents);
	}

	if (selectionBox) {
		ctx.save();
		ctx.beginPath();
		if (viewport.scale === 1) {
			ctx.translate(0.5, 0.5);
		}
		ctx.rect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1);
		ctx.fillStyle = "rgba(0, 155, 255, 0.1)";
		ctx.strokeStyle = "rgba(0, 155, 255, 0.8)";
		ctx.lineWidth = 1 / viewport.scale;
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	ctx.strokeStyle = "black";
	ctx.lineWidth = 1;
	const { bounds } = currentLevel;
	if (bounds) {
		ctx.strokeRect(bounds.x - 0.5, bounds.y - 0.5, bounds.width + 1, bounds.height + 1);
	}

	if (showDebug) {
		ctx.strokeStyle = "#f0f";
		ctx.lineWidth = 1;
		for (const { x, y, width, height } of debugWorldSpaceRects) {
			ctx.strokeRect(x - 0.5, y - 0.5, width, height);
		}
	}
	debugWorldSpaceRects.length = 0;

	ctx.restore(); // world viewport

	if (showDebug) {

		debug("FONT CHARACTERS", fontChars);
		debug("TOTAL ENTITIES", entities.length);
		debug("VIEWPORT POSITION", `${viewport.centerX}, ${viewport.centerY}`);
		debug("VIEWPORT SCALE", `${viewport.scale}X`);

		const problems = detectProblems();
		debug("TOTAL PROBLEMS", problems.length);
		for (const key of Object.keys(debugs)) {
			if (key.match(/^PROBLEM/i)) {
				delete debugs[key];
			}
		}
		for (const { worldX, worldY, message } of problems) {
			if (worldX !== undefined) {
				let { x, y } = worldToCanvas(worldX, worldY);
				x = Math.floor(x);
				y = Math.floor(y);
				y -= 5;
				if (x < 0) {
					x = 0;
				}
				if (y < 0) {
					y = 0;
				}
				if (x > canvas.width - 150) {
					x = canvas.width - 150;
				}
				if (y > canvas.height - 10) {
					y = canvas.height - 10;
				}
				drawText(ctx, message, x, y, "white");
			} else {
				debug(`PROBLEM - ${message}`);
			}
		}

		let debugText = `Toggle debug with grave accent \` / tilde ~ key.
Lines marked with [?] may be outdated for this frame.

`;
		for (const [subject, { text, time }] of Object.entries(debugs)) {
			debugText += `[${time === frameStartTime ? " " : "?"}] ${subject}${text ? `: ${text}` : ""}\n`;
		}
		const x = 1 + editorUI.offsetWidth;
		drawText(ctx, debugText, x, 1, "white");
		const hoveredBrick = brickUnderMouse(true);
		if (dragging.length) {
			drawText(ctx, `DRAGGING: ${JSON.stringify(dragging, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
			// } else if (hovered.length) {
			// 	drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		} else if (hoveredBrick) {
			drawText(ctx, `HOVERED: ${JSON.stringify(hoveredBrick, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		}
	}
};

const wrapContents = (target, wrapper) => {
	[...target.childNodes].forEach((child) => wrapper.appendChild(child));
	target.appendChild(wrapper);
	return wrapper;
};

const initUI = () => {

	testsUI = document.getElementById("tests-ui");
	editorUI = document.getElementById("editor-ui");
	levelSelect = document.getElementById("level-select");
	const entitiesPalette = document.getElementById("entities-palette");
	const entitiesScrollContainer = document.getElementById("entities-scroll-container");
	const levelBoundsCheckbox = document.getElementById("level-bounds-checkbox");
	const levelTitleInput = document.getElementById("level-title");
	const levelHintInput = document.getElementById("level-hint");
	const levelParInput = document.getElementById("level-par");
	const saveButton = document.getElementById("save-world");
	const openButton = document.getElementById("open-world");

	editorUI.hidden = !editing;

	let hilitButton;
	const makeInsertEntityButton = (protoEntity) => {
		const getEntityCopy = () => JSON.parse(JSON.stringify(protoEntity));
		const button = document.createElement("button");
		const buttonCanvas = document.createElement("canvas");
		const buttonCtx = buttonCanvas.getContext("2d");
		button.style.margin = "0";
		button.style.borderWidth = "3px";
		button.style.borderStyle = "solid";
		button.style.borderColor = "transparent";
		button.style.backgroundColor = "black";
		button.style.cursor = "inherit";
		button.addEventListener("click", () => {
			for (const entity of entities) {
				delete entity.selected;
				delete entity.grabbed;
				delete entity.grabOffset;
			}
			const entity = getEntityCopy();
			pasteEntities([entity]);
			editorUI.style.cursor = "url(\"images/cursors/cursor-insert.png\") 0 0, default";
			if (hilitButton) {
				hilitButton.style.borderColor = "transparent";
			}
			button.style.borderColor = "yellow";
			hilitButton = button;
			playSound("insert");
			canvas.focus(); // for keyboard shortcuts
		});
		editorUI.addEventListener("mouseleave", () => {
			editorUI.style.cursor = "";
		});
		let previewEntity = getEntityCopy();
		previewEntity.isPreviewEntity = true;
		buttonCanvas.width = previewEntity.width + 15 * 1;
		buttonCanvas.height = previewEntity.height + 18 * 2;
		const drawPreview = () => {
			buttonCtx.clearRect(0, 0, buttonCanvas.width, buttonCanvas.height);
			buttonCtx.save();
			buttonCtx.translate(0, 28);
			const prevShowDebug = showDebug;
			showDebug = false;
			drawEntity(buttonCtx, previewEntity);
			if (previewEntity.type === "fan") {
				drawWind(buttonCtx, previewEntity, [3, 3]);
			}
			showDebug = prevShowDebug;
			buttonCtx.restore();
		};
		drawPreview();
		let previewAnimIntervalID;
		button.addEventListener("mouseenter", () => {
			previewEntity.active = true; // for jumps
			previewAnimIntervalID = setInterval(() => {
				const prev = {
					x: previewEntity.x,
					y: previewEntity.y,
					muted,
					showDebug,
					currentLevel,
					entities,
					wind,
					entitiesByTopY,
					entitiesByBottomY,
					lastKeys,
				};
				muted = true;
				showDebug = false;
				entities = [];
				currentLevel = { entities };
				wind = [];
				entitiesByTopY = {};
				entitiesByBottomY = {};
				lastKeys = new Map();
				simulate([previewEntity]);
				({
					muted,
					showDebug,
					currentLevel,
					entities,
					wind,
					entitiesByTopY,
					entitiesByBottomY,
					lastKeys,
				} = prev);
				previewEntity.x = prev.x;
				previewEntity.y = prev.y;
				drawPreview();
			}, 1000 / 15);
		});
		button.addEventListener("mouseleave", () => {
			clearInterval(previewAnimIntervalID);
			previewEntity = getEntityCopy();
			drawPreview();
		});
		button.append(buttonCanvas);
		entitiesPalette.append(button);
		return button;
	};

	brickColorNames.forEach((colorName) => {
		brickWidthsInStuds.forEach((widthInStuds) => {
			makeInsertEntityButton(makeBrick({
				colorName,
				widthInStuds,
				fixed: colorName === "gray",
				x: 0,
				y: 0,
			}));
		});
	});

	makeInsertEntityButton(makeJunkbot({
		x: 0,
		y: 0,
		facing: 1,
	}));

	makeInsertEntityButton(makeBin({
		x: 0,
		y: 0,
	}));

	makeInsertEntityButton(makeCrate({
		x: 0,
		y: 0,
	}));

	makeInsertEntityButton(makeFire({
		x: 0,
		y: 0,
		on: false,
		switchID: "switch1",
	}));
	makeInsertEntityButton(makeFire({
		x: 0,
		y: 0,
		on: true,
		switchID: "switch1",
	}));

	makeInsertEntityButton(makeFan({
		x: 0,
		y: 0,
		on: false,
		switchID: "switch1",
	}));
	makeInsertEntityButton(makeFan({
		x: 0,
		y: 0,
		on: true,
		switchID: "switch1",
	}));

	makeInsertEntityButton(makeLaser({
		x: 0,
		y: 0,
		on: true,
		switchID: "switch1",
		facing: 1,
	}));
	makeInsertEntityButton(makeLaser({
		x: 0,
		y: 0,
		on: true,
		switchID: "switch1",
		facing: -1,
	}));

	makeInsertEntityButton(makeTeleport({
		x: 0,
		y: 0,
		teleportID: "tele1",
	}));

	makeInsertEntityButton(makeJump({
		x: 0,
		y: 0,
		fixed: false,
	}));
	makeInsertEntityButton(makeJump({
		x: 0,
		y: 0,
		fixed: true,
	}));

	makeInsertEntityButton(makeSwitch({
		x: 0,
		y: 0,
		on: false,
		switchID: "switch1",
	}));
	makeInsertEntityButton(makeSwitch({
		x: 0,
		y: 0,
		on: true,
		switchID: "switch1",
	}));

	makeInsertEntityButton(makeShield({
		x: 0,
		y: 0,
		fixed: false,
	}));
	makeInsertEntityButton(makeShield({
		x: 0,
		y: 0,
		fixed: true,
	}));

	makeInsertEntityButton(makePipe({
		x: 0,
		y: 0,
	}));
	makeInsertEntityButton(makeDrop({
		x: 0,
		y: 0,
	}));

	makeInsertEntityButton(makeGearbot({
		x: 0,
		y: 0,
		facing: 1,
	}));
	makeInsertEntityButton(makeClimbbot({
		x: 0,
		y: 0,
		facing: 1,
	}));
	makeInsertEntityButton(makeFlybot({
		x: 0,
		y: 0,
		facing: 1,
	}));
	makeInsertEntityButton(makeEyebot({
		x: 0,
		y: 0,
	}));

	let lastScrollSoundTime = Date.now(); // not 0 because a random scroll event happens on page load; don't want page load to make a sound
	entitiesScrollContainer.addEventListener("scroll", () => {
		if (Date.now() > lastScrollSoundTime + 200) {
			playSound(`rustle${Math.floor(Math.random() * numRustles)}`);
			lastScrollSoundTime = Date.now();
		}
	});

	saveButton.onclick = saveToFile;

	openButton.onclick = openFromFileDialog;

	const option = document.createElement("option");
	option.textContent = "Custom World";
	option.defaultSelected = true;
	levelSelect.append(option);
	for (const game of ["Junkbot", "Junkbot Undercover", "Test Cases"]) {
		const optgroup = document.createElement("optgroup");
		optgroup.label = game;
		optgroup.value = game;
		levelSelect.append(optgroup);
		for (const levelName of game === "Test Cases" ? tests.map((test) => test.name) : resources[game === "Junkbot Undercover" ? "levelNamesUndercover" : "levelNames"]) {
			const option = document.createElement("option");
			option.textContent = levelName;
			optgroup.append(option);
		}
	}
	levelSelect.onchange = loadLevelFromLevelSelect;

	// It's important that these do undoable() or save() because that makes it save the editorLevelState
	// so if you go into play mode and back into editing mode, it doesn't reset these fields.
	levelBoundsCheckbox.onchange = () => {
		undoable(() => {
			if (levelBoundsCheckbox.checked) {
				currentLevel.bounds = {
					x: 0,
					y: 0,
					width: 35 * 15,
					height: 22 * 18,
				};
			} else {
				currentLevel.bounds = null;
			}
		});
	};
	levelTitleInput.onchange = () => {
		// not undoable to avoid churning thru autosave slots
		// undoable(() => {
		currentLevel.title = levelTitleInput.value;
		// });
		// editorLevelState = serializeToJSON(currentLevel);
		save();
	};
	levelHintInput.onchange = () => {
		undoable(() => {
			currentLevel.hint = levelHintInput.value;
		});
	};
	levelParInput.onchange = () => {
		undoable(() => {
			currentLevel.par = levelParInput.valueAsNumber;
		});
	};

	updateEditorUIForLevelChange = (level) => {
		levelBoundsCheckbox.checked = level.bounds;
		levelTitleInput.value = level.title ?? "";
		levelHintInput.value = level.hint ?? "";
		levelParInput.value = level.par ?? "";
		document.title = level.title ? `${level.title} - Junkbot` : "Junkbot";
	};
	updateEditorUIForLevelChange(currentLevel);

	infoBox = document.getElementById("info");
	const controlsTableRows = document.querySelectorAll("#info table tr");
	for (const tr of controlsTableRows) {
		const [controlCell, actionCell] = tr.cells;
		const kbd = controlCell.querySelector("kbd");
		const match = kbd.textContent.match(/(Ctrl\+)?(.+)/);
		if (match) {
			const ctrlKey = match[1] !== "";
			let key = match[2];
			if (key === "+") {
				key = "NumpadAdd";
			} else if (key === "-") {
				key = "NumpadSubtract";
			}
			const button = document.createElement("button");
			button.addEventListener("click", () => {
				canvas.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, ctrlKey, bubbles: true }));
			});
			wrapContents(actionCell, button);
		}
	}

	toggleInfoButton = document.getElementById("toggle-info");
	toggleInfoButton.addEventListener("click", toggleInfoBox);

	updateInfoBoxHidden();

	canvas.addEventListener("dragover", (event) => event.preventDefault());
	canvas.addEventListener("dragenter", (event) => event.preventDefault());
	canvas.addEventListener("drop", (event) => {
		event.preventDefault();
		openFromFile(event.dataTransfer.files[0]);
	});
};

const stopTests = () => {
	testing = false;
	testsUI.hidden = true;
};

const runTests = async () => {
	testing = true;

	const realTime = location.hash.match(/realtime/);
	const wasMuted = muted;
	if (!realTime && !muted) {
		muted = true;
	}
	if (realTime && paused) {
		togglePause();
	}
	if (editing) {
		toggleEditing();
	}

	const testsUL = document.getElementById("tests");
	const testsInfo = document.getElementById("tests-info");
	const testSpeedInput = document.getElementById("test-speed");
	// const startButton = document.getElementById("start-tests");

	testsUI.hidden = false;

	const render = () => {
		const passedTests = tests.filter((test) => test.state === "passed");
		const failedTests = tests.filter((test) => test.state === "failed");
		// const remainingTests = tests.filter((test) => test.state !== "failed" && test.state !== "passed");

		testsInfo.innerHTML = `
			<p>Passed: ${passedTests.length} / ${tests.length}</p>
			<p>Failed: ${failedTests.length} / ${tests.length}</p>
		`;
		testsUL.innerHTML = "";
		for (const test of tests) {
			const li = document.createElement("li");
			const emoji = {
				"passed": "✅",
				"failed": "❌",
				"failed-to-load": "⚠️", // ⚠️🗺️❌🌐📶
				"pending": "🌙", // 🛏️😴💤🧍🔜
				"running": "🏃", // 🦿🤖🚧🔛
			}[test.state];
			li.innerHTML = `
			<h3>
				<span class="icon">${emoji}</span>
				<a href="#level=Test Cases;${encodeURIComponent(test.name)}">${test.name}</a>
			</h3>
			<div>${test.message || ""}</div>`; // || test.state
			testsUL.append(li);
		}
	};
	for (const test of tests) {
		test.state = "pending";
		test.message = "";
	}
	render();

	/* eslint-disable no-await-in-loop */
	for (const test of tests) {
		if (!testing) {
			break;
		}
		try {
			if (test.levelType === "json") {
				deserializeJSON(await loadTextFile(`levels/test-cases/${test.name}.json`));
			} else {
				initLevel(await loadLevelFromTextFile(`levels/test-cases/${test.name}.txt`));
			}
		} catch (error) {
			test.state = "failed-to-load";
			test.message = `Failed to load test level: ${error}`;
			render();
			// eslint-disable-next-line no-continue
			continue;
		}
		editorLevelState = serializeToJSON(currentLevel);

		test.state = "running";
		render();

		paused = false;

		let won = false;
		let lost = false;
		// eslint-disable-next-line no-loop-func
		const checkTestEnd = () => {
			if (winOrLose() === "win") {
				won = true;
			}
			if (winOrLose() === "lose") {
				lost = true;
			}
			return won || lost || paused;
		};
		for (let timeStep = 0; timeStep < test.timeSteps; timeStep++) {
			// eslint-disable-next-line no-await-in-loop, no-loop-func
			await new Promise((resolve) => {
				requestAnimationFrame(resolve); // accounts for one time step, with `++` above and `- 1` below (assuming animation loop is running)
				for (let i = 0; i < testSpeedInput.valueAsNumber - 1; i++) {
					simulate(entities);
					timeStep += 1;
					if (checkTestEnd()) {
						break;
					}
				}
			});
			checkTestEnd();
			if (paused) {
				if (editing) {
					// eslint-disable-next-line require-atomic-updates
					stopTests();
					muted = wasMuted;
					location.hash = `level=Test Cases;${test.name}`;
					return;
				}
				paused = false;
				break;
			}
		}
		if (won && lost) {
			test.state = "failed";
			test.message = "Both won and lost (at different times) - this should never happen!";
		} else if (test.expect === "to win") {
			if (won) {
				test.state = "passed";
			} else {
				test.state = "failed";
				test.message = `Expected to win (in ${test.timeSteps} time steps)`;
				if (lost) {
					test.message += ", but lost instead";
				} else {
					test.message += ", but neither won nor lost";
				}
			}
		} else if (test.expect === "to lose") {
			if (lost) {
				test.state = "passed";
			} else {
				test.state = "failed";
				test.message = `Expected to lose (in ${test.timeSteps} time steps)`;
				if (won) {
					test.message += ", but won instead";
				} else {
					test.message += ", but neither won nor lost";
				}
			}
		} else if (test.expect === "to draw") {
			if (!lost && !won) {
				test.state = "passed";
			} else {
				test.state = "failed";
				test.message = `Expected to draw - neither win nor lose (in ${test.timeSteps} time steps)`;
				if (won) {
					test.message += ", but won instead";
				} else if (lost) {
					test.message += ", but lost instead";
				}
			}
		} else {
			test.state = "failed";
			test.message = `Unknown test type "${test.expect}"`;
		}
		render();
	}
	/* eslint-enable no-await-in-loop */

	muted = wasMuted;
	setTimeout(() => {
		testing = false;
	});
};

const loadFromHash = async () => {
	if (disableLoadFromHash) {
		return;
	}
	const hashOptions = parseLocationHash();
	// console.log("From URL hash:", hashOptions);
	if (hashOptions.level) {
		const [game, levelName] = hashOptions.level.split(";").map(decodeURIComponent);
		if (game === "local") {
			try {
				if (!localStorage[`level:${levelName}`]) {
					throw new Error("Level does not exist.");
				}
				deserializeJSON(localStorage[`level:${levelName}`]);
				dragging = entities.filter((entity) => entity.grabbed);
				editorLevelState = serializeToJSON(currentLevel);
			} catch (error) {
				showMessageBox(`Failed to load local level for editing ("${levelName}")\n\n${error}`);
			}
		} else {
			levelSelect.value = levelName;
			if (levelSelect.selectedIndex === -1) {
				showMessageBox(`Unknown level "${levelName}"`);
			} else {
				try {
					await loadLevelFromLevelSelect();
				} catch (error) {
					showMessageBox(`Failed to load level "${levelName}"\n\n${error}`);
				}
			}
		}
	} else {
		try {
			deserializeJSON(localStorage.JWorld);
			dragging = entities.filter((entity) => entity.grabbed);
		} catch (error) {
			// initTestLevel();
			initLevel(resources.defaultLevel);
		}
		editorLevelState = serializeToJSON(currentLevel);
	}
	if (location.hash.match(/run-tests/)) {
		runTests();
	} else {
		stopTests();
	}
};

window.addEventListener("hashchange", loadFromHash);

// eslint-disable-next-line no-unused-vars
const loadEachLevel = async (asyncFn, originalOnly) => {
	for (const option of levelSelect.options) {
		if (option.value !== "Custom World" && (!originalOnly || option.parentNode.label.match(/^Junkbot( Undercover)?$/))) {
			levelSelect.value = option.value;
			// eslint-disable-next-line no-await-in-loop
			await loadLevelFromLevelSelect();
			// eslint-disable-next-line no-await-in-loop
			await asyncFn();
		}
	}
};
// eslint-disable-next-line no-unused-vars
const gatherStatistics = async (originalOnly) => {
	const occurrencesPerEntityType = {};
	const levelsPerEntityType = {};
	await loadEachLevel(() => {
		const recordedTypesInThisLevel = [];
		for (const entity of entities) {
			if (recordedTypesInThisLevel.indexOf(entity.type) === -1) {
				recordedTypesInThisLevel.push(entity.type);
				levelsPerEntityType[entity.type] = (levelsPerEntityType[entity.type] || 0) + 1;
			}
			occurrencesPerEntityType[entity.type] = (occurrencesPerEntityType[entity.type] || 0) + 1;
		}
		return Promise.resolve();
	}, originalOnly);
	return { levelsPerEntityType, occurrencesPerEntityType };
};

const main = async () => {
	try {
		showDebug = localStorage.showDebug === "true";
		muted = localStorage.muteSoundEffects === "true";
		editing = localStorage.editing === "true";
		paused = localStorage.paused === "true";
		hideInfoBox = localStorage.hideInfoBox === "true";
		// eslint-disable-next-line no-empty
	} catch (error) { }
	resources = await loadResources(resourcePaths);
	// eslint-disable-next-line camelcase
	resources.spritesAtlas.eyebot_active_1 = resources.spritesAtlas.eyebot_active_1fix;

	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	initUI();
	animate();

	await loadFromHash();
};

main();
