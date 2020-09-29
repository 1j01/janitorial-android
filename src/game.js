const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

canvas.tabIndex = 0;

document.body.append(canvas);

window.AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

let debugInfoForFrame = "";
let debugInfoForJunkbot = "";
const debug = (text) => {
	debugInfoForFrame += `${text}\n`;
};
const debugJunkbot = (text) => {
	debugInfoForJunkbot += `${text}\n`;
};

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
	messageBox.textContent = message;
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

const rectanglesIntersect = (ax, ay, aw, ah, bx, by, bw, bh) => (
	ax + aw > bx &&
	ax < bx + bw &&
	ay + ah > by &&
	ay < by + bh
);

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

const brickColorToYIndex = {
	white: 0,
	red: 1,
	green: 2,
	blue: 3,
	yellow: 4,
	gray: 5,
};
// const brickColorNames = Object.keys(brickColorToYIndex);
const brickWidthsInStuds = [1, 2, 3, 4, 6, 8];
const brickWidthsInStudsToX = {};
for (let x = 0, i = 0; i < brickWidthsInStuds.length; i++) {
	brickWidthsInStudsToX[brickWidthsInStuds[i]] = x;
	const w = brickWidthsInStuds[i] * 15 + 15;
	x += w;
}

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
		timer: 0,
		animationFrame: 0,
		headLoaded: false,
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
const makeShield = ({ x, y, used = false }) => {
	return {
		type: "shield",
		x,
		y,
		width: 2 * 15,
		height: 1 * 18,
		fixed: true,
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
		timer: 0,
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
	};
};

let resources;
const resourcePaths = {
	actors: "images/spritesheet.png",
	actorsAtlas: "images/spritesheet.json",
	coloredBlocks: "images/colored-blocks.png",
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
	fire: "audio/sound-effects/fire.ogg",
	waterDeath: "audio/sound-effects/electricity1.ogg",
	getShield: "audio/sound-effects/shieldon2.ogg",
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
	world: "levels/junkbot-world.json",
	levelNames: "levels/%23%23%23LEVEL LISTING.txt",
	// levelNames: "levels/Undercover Exclusive/%23%23%23LEVEL LISTING.txt",
};
const numRustles = 6;
const numDrips = 3;

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

// const loadRozniacAtlasJSON = async (path) => {
// 	return Object.fromEntries((await loadJSON(path)).map(
// 		({ Name, Bounds }) => [Name, { bounds: Bounds.split(", ").map((numberString) => Number(numberString)) }]
// 	));
// };
const loadAtlasJSON = async (path) => {
	const { frames, animations } = await loadJSON(path);
	const result = {};
	for (const [name, framesIndices] of Object.entries(animations)) {
		result[name.replace(/\.png/i, "")] = { bounds: frames[framesIndices[0]] };
	}
	return result;
};

const loadLevelFromText = (levelData) => {
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
	// console.log(sections);
	let types = [];
	let colors = [];
	const entities = [];
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
				const x = e[0] * 15;
				const y = e[1] * 18;
				const typeName = types[e[2] - 1].toLowerCase();
				const colorName = colors[e[3] - 1].toLowerCase();
				const animationName = e[4].toLowerCase();
				const brickMatch = typeName.match(/brick_(\d+)/i);
				if (brickMatch) {
					entities.push(makeBrick({
						x, y, colorName, fixed: colorName === "gray", widthInStuds: parseInt(brickMatch[1], 10)
					}));
				} else if (typeName === "minifig") {
					entities.push(makeJunkbot({ x, y: y - 18 * 3, facing: animationName.match(/_L/i) ? -1 : 1 }));
				} else if (typeName === "flag") {
					entities.push(makeBin({ x, y: y - 18 * 2, facing: animationName.match(/_L/i) ? -1 : 1 }));
				} else if (typeName === "haz_slickfire") {
					entities.push(makeFire({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slickfan") {
					entities.push(makeFan({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slickswitch") {
					entities.push(makeSwitch({ x, y, on: animationName === "on" || animationName === "none", switchID: e[6] }));
				} else if (typeName === "haz_slickjump") {
					entities.push(makeJump({ x, y, fixed: true }));
				} else if (typeName === "brick_slickjump") {
					entities.push(makeJump({ x, y, fixed: false }));
				} else if (typeName === "haz_slickshield") {
					entities.push(makeShield({ x, y, used: animationName === "off" }));
				} else if (typeName === "haz_slickpipe") {
					entities.push(makePipe({ x, y }));
				} else {
					entities.push({ type: typeName, x, y, colorName, widthInStuds: 2, width: 2 * 15, height: 18, fixed: true });
				}
			});
		}
	});
	sections.entities = entities;
	return sections;
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
	return loadLevelFromText(await loadTextFile(path));
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
		// if (path.match(/atlas\.json$/i)) {
		// 	return loadRozniacAtlasJSON(path).then((atlas) => [id, atlas]);
		// } else
		if (path.match(/spritesheet\.json$/i)) {
			return loadAtlasJSON(path).then((atlas) => [id, atlas]);
		} else if (path.match(/\.json$/i)) {
			// return loadJSON(path).then((data) => [id, data]);
			return loadTextFile(path).then((json) => [id, json]);
		} else if (path.match(/levels\/.*(#|%23){3}.*\.txt$/i)) { // ###LEVEL LISTING.txt
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

let showDebug = false;
let muted = false;
let paused = false;
let editing = false;
let hideInfoBox = false;
let sidebar;
let infoBox;
let toggleInfoButton;
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
	try {
		localStorage.paused = paused;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};
const toggleEditing = () => {
	editing = !editing;
	sidebar.hidden = !editing;
	try {
		localStorage.editing = editing;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};
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

const playSound = (soundName, playbackRate = 1, cutOffFromEndRatio = 0) => {
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
	if (cutOffFromEndRatio) {
		gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + audioBuffer.duration * (1 - cutOffFromEndRatio));
	}
	source.start(0);
};

const fontChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890?!(),':"-+.^@#$%*~\`&_=;|\\/<>[]{}`;
const fontCharW = "55555555355555555555555555355555555551221113331355353525531155332233".split("").map((digit) => Number(digit));
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
			if (y > innerHeight) {
				return; // optimization for lazily-implemented debug text
			}
		} else {
			const index = fontChars.indexOf(char);
			const w = fontCharW[index];
			ctx.drawImage(fontImage, fontCharX[index], 0, w, fontCharHeight, x, y, w, fontCharHeight);
			x += w + 1;
		}
	}
};

const drawBrick = (ctx, brick) => {
	const { x, y, widthInStuds, colorName } = brick;
	const w = widthInStuds * 15 + 15; // sprite width
	const h = 35; // sprite row height
	ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * h + 9, w, h, x, y - 15, w, h);
};

const drawBin = (ctx, bin) => {
	const frame = resources.actorsAtlas.bin;
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, bin.x + 4, bin.y + bin.height - height - 5, width, height);
};

const drawFire = (ctx, entity) => {
	const frameIndex = entity.on ? Math.floor(entity.animationFrame % 8 < 4 ? entity.animationFrame % 4 : 4 - (entity.animationFrame % 4)) : 0;
	// console.log(`haz_slickFire_${entity.on ? "on" : "off"}_${1 + frameIndex}`);
	const frame = resources.actorsAtlas[`haz_slickFire_${entity.on ? "on" : "off"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x + 1, entity.y + entity.height - height - 4, width, height);
};

const drawFan = (ctx, entity) => {
	const frameIndex = entity.on ? Math.floor(entity.animationFrame % 4) : 0;
	const frame = resources.actorsAtlas[`haz_slickFan_${entity.on ? "on" : "off"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x + 1, entity.y + entity.height - height - 4, width, height);
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
			const frame = resources.actorsAtlas[`fanAir_1_${1 + frameIndex}`];
			const [left, top, width, height] = frame.bounds;
			ctx.drawImage(resources.actors, left, top, width, height, x + 4, y - frameIndex * 2 + 8, width, height);
		}
	}
};

const drawJump = (ctx, entity) => {
	const frame = resources.actorsAtlas[`${entity.fixed ? "haz" : "brick"}_slickJump_dormant_1`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawShield = (ctx, entity) => {
	const frame = resources.actorsAtlas[`HAZ_SLICKSHIELD_${entity.used ? "OFF" : "ON"}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawSwitch = (ctx, entity) => {
	const frame = resources.actorsAtlas[`haz_slickSwitch_${entity.on ? "on" : "off"}_1`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x, entity.y + entity.height - height - 1, width, height);
};

const drawPipe = (ctx, entity) => {
	const wet = entity.timer > 54;
	const frameIndex = Math.floor(wet ? entity.timer - 54 : 0);
	const frame = resources.actorsAtlas[`haz_slickPipe_${wet ? "wet" : "dry"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x + 11, entity.y - 12, width, height);
	if (showDebug) {
		drawText(ctx, String(entity.timer), entity.x, entity.y + entity.height + 5, "white");
	}
};

const drawDrop = (ctx, entity) => {
	const frameIndex = Math.floor(entity.splashing ? entity.animationFrame : 0);
	const frame = resources.actorsAtlas[`drip_${entity.splashing ? "splashing" : "falling"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	ctx.drawImage(resources.actors, left, top, width, height, entity.x + 15, entity.y, width, height);
};

const drawJunkbot = (ctx, junkbot) => {
	let animName;
	if (junkbot.dead) {
		animName = "dead";
	} else if (junkbot.dyingFromWater) {
		animName = "water_die";
	} else if (junkbot.dying) {
		animName = "die";
	} else if (junkbot.collectingBin) {
		animName = "eat_start";
	} else if (junkbot.gettingShield) {
		animName = `shield_on_${junkbot.facing === 1 ? "r" : "l"}`;
	} else {
		animName = `walk_${junkbot.facing === 1 ? "r" : "l"}`;
	}
	if (junkbot.armored && (!junkbot.losingShield || (junkbot.animationFrame % 4 < 2))) {
		if (animName === "eat_start") {
			animName = "shield_eat";
		} else {
			animName = `shield_${animName}`;
		}
	}
	const frameIndex = Math.floor(junkbot.animationFrame % (junkbot.collectingBin ? 17 : 10));
	const frame = resources.actorsAtlas[animName === "dead" ? "minifig_dead" : `minifig_${animName}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	const fwd = (animName.match(/walk/) && frameIndex === 3) * (junkbot.facing === 1 ? 3 : -3);
	const alignLeft = !(animName.match(/dead|die|eat/) || junkbot.facing === -1);
	if (alignLeft) {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x - width + 41 + fwd, junkbot.y + junkbot.height - 1 - height, width, height);
	} else {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x + fwd, junkbot.y + junkbot.height - 1 - height, width, height);
	}
};

const drawEntity = (ctx, entity, hilight) => {
	switch (entity.type) {
		case "brick":
			drawBrick(ctx, entity);
			break;
		case "junkbot":
			drawJunkbot(ctx, entity);
			break;
		case "bin":
			drawBin(ctx, entity);
			break;
		case "fire":
			drawFire(ctx, entity);
			break;
		case "fan":
			drawFan(ctx, entity);
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
		const widthInStuds = Math.ceil(entity.width / 15);
		const w = widthInStuds * 15 + 15; // sprite width
		const h = 35; // sprite row height
		for (let iy = 0; iy < entity.height; iy += 18) {
			ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], (brickColorToYIndex.gray + 1) * h + 9, w, h, entity.x, entity.y - 15 + iy, w, h);
		}
		ctx.restore();
	}
};

const viewport = { centerX: 0, centerY: 0, scale: 2 };
let keys = {};

let entities = [];
const wind = [];
// acceleration structures
const entitiesByTopY = {}; // y to array of entities with that y as their top
const entitiesByBottomY = {}; // y to array of entities with that y as their bottom
const lastKeys = new Map(); // ancillary structure for updating the by-y structures - entity to {topY, bottomY}

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

const undos = [];
const redos = [];
const clipboard = {};

const mouse = { x: undefined, y: undefined };
let dragging = [];
let selectionBox;

const serialize = () => {
	return JSON.stringify({ version: 0.1, format: "janitorial-android", entities }, (name, value) => {
		if (name === "grabbed" || name === "grabOffset") {
			return undefined;
		}
		return value;
	}, "\t");
};
const deserialize = (json) => {
	const state = JSON.parse(json);
	entities = state.entities;
	dragging.length = 0;
	entities.forEach((entity) => {
		delete entity.grabbed;
		delete entity.grabOffset;
	});
};
const save = () => {
	localStorage.JWorld = serialize();
};

const saveToFile = () => {
	const file = new Blob([localStorage.JWorld], { type: "application/json" });
	const a = document.createElement("a");
	const url = URL.createObjectURL(file);
	a.href = url;
	a.download = "junkbot-world.json";
	document.body.appendChild(a);
	a.click();
	setTimeout(() => {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}, 0);
};

const openFromFile = () => {
	const input = document.createElement("input");
	input.type = "file";
	input.onchange = (event) => {
		const file = event.target.files[0];
		const reader = new FileReader();
		reader.onload = (readerEvent) => {
			const content = readerEvent.target.result;
			try {
				deserialize(content);
			} catch (error) {
				showMessageBox(`Failed to load from file:\n\n${error}`);
			}
		};
		reader.onerror = () => {
			showMessageBox(`Failed to read file:\n\n${reader.error}`);
		};
		reader.readAsText(file, "UTF-8");
	};
	input.click();
};

const undoable = (fn) => {
	undos.push(serialize());
	redos.length = 0;
	if (fn) {
		fn();
		save();
	}
};
const undoOrRedo = (undos, redos) => {
	if (undos.length === 0) {
		return false;
	}
	redos.push(serialize());
	deserialize(undos.pop());
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

const selectAll = () => {
	if (!editing) {
		toggleEditing();
	}
	entities.forEach((entity) => {
		entity.selected = true;
	});
};
const deleteSelected = () => {
	if (!editing) {
		return;
	}
	if (entities.some((entity) => entity.selected)) {
		undoable(() => {
			entities = entities.filter((entity) => !entity.selected);
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

	const offsetX = -15 * Math.floor(collectiveCenter.x / 15);
	const offsetY = -18 * Math.floor(collectiveCenter.y / 18);

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
	// 		newn := 0
	// 		for i := 1 to n - 1 inclusive do
	// 			if A[i - 1] > A[i] then
	// 				swap(A[i - 1], A[i])
	// 				newn := i
	// 			end if
	// 		end for
	// 		n := newn
	// 	until n ≤ 1
	// end procedure
};

const initLevel = (level) => {
	entities = level.entities;
	undos.length = 0;
	redos.length = 0;
	dragging = [];
	viewport.centerX = 35 / 2 * 15;
	viewport.centerY = 24 / 2 * 15;
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
	x: (worldX - viewport.centerX) * viewport.scale + canvas.width / 2,
	y: (worldY - viewport.centerY) * viewport.scale + canvas.height / 2,
});
const canvasToWorld = (canvasX, canvasY) => ({
	x: (canvasX - canvas.width / 2) / viewport.scale + viewport.centerX,
	y: (canvasY - canvas.height / 2) / viewport.scale + viewport.centerY,
});

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
		viewport.scale = Math.min(10, viewport.scale + 1);
	}
	if (event.code === "Minus" || event.code === "NumpadSubtract") {
		viewport.scale = Math.max(1, viewport.scale - 1);
	}
	switch (event.key.toUpperCase()) {
		case " ": // Spacebar
		case "P":
			if (!event.repeat) {
				togglePause();
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
			}
			break;
		case "Y":
			if (event.ctrlKey) {
				redo();
			}
			break;
		case "X":
			if (event.ctrlKey) {
				cutSelected();
			}
			break;
		case "C":
			if (event.ctrlKey && !event.repeat) {
				copySelected();
			}
			break;
		case "V":
			if (event.ctrlKey) {
				pasteFromClipboard();
			}
			break;
		case "A":
			if (event.ctrlKey) {
				selectAll();
			}
			break;
		case "S":
			if (event.ctrlKey) {
				saveToFile();
			}
			break;
		case "O":
			if (event.ctrlKey) {
				openFromFile();
			}
			break;
		default:
			// Prevent preventing default action if event not handled
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
	// prevent margin panning until mousemove
	mouse.x = undefined;
	mouse.y = undefined;
	mouse.worldX = undefined;
	mouse.worldY = undefined;
});
// sort of planning for in case game is embedded (without an iframe)
canvas.addEventListener("mouseleave", () => {
	// prevent margin panning until mousemove
	mouse.x = undefined;
	mouse.y = undefined;
	mouse.worldX = undefined;
	mouse.worldY = undefined;
});

const updateMouseWorldPosition = () => {
	const worldPos = canvasToWorld(mouse.x, mouse.y);
	mouse.worldX = worldPos.x;
	mouse.worldY = worldPos.y;
};
const updateMouse = (event) => {
	mouse.x = event.offsetX;
	mouse.y = event.offsetY;
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
		const entitiesToCheck = [].concat(
			(fromEntity !== startEntity || direction !== -1) && entitiesByTopY[fromEntity.y + fromEntity.height] || [],
			(fromEntity !== startEntity || direction !== +1) && entitiesByBottomY[fromEntity.y] || [],
		);
		for (const otherEntity of entitiesToCheck) {
			if (
				!otherEntity.grabbed &&
				// otherEntity.type === "brick" && // TODO? but don't break behavior of bricks falling on junkbot...
				ignoreEntities.indexOf(otherEntity) === -1 &&
				visited.indexOf(otherEntity) === -1 &&
				// connects(fromEntity, otherEntity, fromEntity === startEntity ? direction : 0)
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
					// can't drag in this direction (e.g. the block might be sandwhiched) or
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
						entity.type === "brick" &&
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
									// connects(entity, junk, -1)
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
	if (brick.type !== "brick" || brick.fixed) {
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
			// x: brick.x - (15 * Math.floor(mouse.worldX/15)),
			// y: brick.y - (18 * Math.floor(mouse.worldY/18)),
			// so you can place blocks that were grabbed when they weren't on the grid:
			x: (15 * Math.floor(brick.x / 15)) - (15 * Math.floor(mouse.worldX / 15)),
			y: (18 * Math.floor(brick.y / 18)) - (18 * Math.floor(mouse.worldY / 18)),
		};
		if (editing) {
			brick.selected = true;
		}
	}
	playSound("blockPickUp");
};

canvas.addEventListener("mousemove", (event) => {
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
	} else if (selectionBox) {
		selectionBox.x2 = mouse.worldX;
		selectionBox.y2 = mouse.worldY;
	}
});
canvas.addEventListener("mousedown", (event) => {
	canvas.focus(); // for keyboard shortcuts like Space, after interacting with dropdown
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

const entitiesWithinSelection = () => {
	const minX = Math.min(selectionBox.x1, selectionBox.x2);
	const maxX = Math.max(selectionBox.x1, selectionBox.x2);
	const minY = Math.min(selectionBox.y1, selectionBox.y2);
	const maxY = Math.max(selectionBox.y1, selectionBox.y2);
	return entities.filter((entity) => (
		rectanglesIntersect(
			entity.x,
			entity.y,
			entity.width,
			entity.height,
			minX,
			minY,
			maxX - minX,
			maxY - minY,
		)
	));
};

const canRelease = () => {
	if (dragging.length === 0) {
		return false; // optimization mainly - don't do allConnectedToFixed()
	}
	if (editing) {
		return true;
	}

	const connectedToFixed = allConnectedToFixed();

	const someCollision = dragging.some((entity) => {
		for (const otherEntity of entities) {
			if (
				!otherEntity.grabbed &&
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
				return true;
			}
		}
		return false;
	});
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
addEventListener("mouseup", () => {
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
		const toSelect = entitiesWithinSelection();
		toSelect.forEach((entity) => {
			entity.selected = true;
		});
		selectionBox = null;
		if (toSelect.length) {
			playSound("selectEnd");
		}
	}
});

const simulateGravity = () => {
	for (const entity of entities) {
		if (!entity.fixed && !entity.grabbed && !entity.floating && entity.type !== "drop") {
			let settled = false;
			if (connectsToFixed(entity, { direction: entity.type === "junkbot" ? 1 : 0 })) {
				settled = true;
			}
			if (!settled) {
				entity.y += 1;
				// entity.y += 6;
				entityMoved(entity);
			}
		}
	}
};

const junkbotCollisionTest = (junkbotX, junkbotY, junkbot, irregular = false) => {
	// Note: make sure not to use junkbot.x/y!
	for (const otherEntity of entities) {
		if (
			!otherEntity.grabbed &&
			otherEntity.type !== "bin" &&
			otherEntity.type !== "gearbot" &&
			otherEntity.type !== "drop" &&
			otherEntity !== junkbot && (
				rectanglesIntersect(
					junkbotX + (junkbot.facing === 1 ? 0 : 15),
					junkbotY,
					junkbot.width / 2,
					junkbot.height,
					otherEntity.x,
					otherEntity.y,
					otherEntity.width,
					otherEntity.height,
				) ||
				rectanglesIntersect(
					junkbotX,
					junkbotY + 18 * irregular,
					junkbot.width,
					junkbot.height - 18 * irregular,
					otherEntity.x,
					otherEntity.y,
					otherEntity.width,
					otherEntity.height,
				)
			)
		) {
			return otherEntity;
		}
	}
	return null;
};
const junkbotBinCollisionTest = (junkbotX, junkbotY, junkbot) => {
	// Note: make sure not to use junkbot.x/y!
	for (const otherEntity of entities) {
		if (
			!otherEntity.grabbed &&
			otherEntity.type === "bin" &&
			otherEntity !== junkbot && (
				rectanglesIntersect(
					junkbotX,
					junkbotY,
					junkbot.width,
					junkbot.height,
					otherEntity.x,
					otherEntity.y,
					otherEntity.width,
					otherEntity.height,
				)
			)
		) {
			return otherEntity;
		}
	}
	return null;
};

const simulateJunkbot = (junkbot) => {
	junkbot.timer += 1;
	const aboveHead = junkbotCollisionTest(junkbot.x, junkbot.y - 1, junkbot);
	const headLoaded = aboveHead && (junkbot.floating || (!aboveHead.fixed && !connectsToFixed(aboveHead, { ignoreEntities: [junkbot] })));
	if (junkbot.headLoaded && !headLoaded) {
		junkbot.headLoaded = false;
	} else if (headLoaded && !junkbot.headLoaded && !junkbot.grabbed) {
		junkbot.headLoaded = true;
		playSound("headBonk");
	}
	if (junkbot.timer % 3 > 0) {
		return;
	}
	junkbot.animationFrame += 1;
	if (junkbot.collectingBin) {
		if (junkbot.animationFrame > 17) {
			junkbot.collectingBin = false;
		} else {
			return;
		}
	}
	if (junkbot.dying) {
		if (junkbot.animationFrame > 11) {
			junkbot.animationFrame = 0;
			junkbot.dead = true;
		}
		return;
	}
	if (junkbot.gettingShield) {
		if (junkbot.animationFrame > 12) {
			junkbot.gettingShield = false;
			junkbot.armored = true;
		} else {
			return;
		}
	}
	const inside = junkbotCollisionTest(junkbot.x, junkbot.y, junkbot);
	if (inside) {
		debugJunkbot("STUCK IN WALL - GO UP");
		junkbot.y = inside.y - junkbot.height;
		entityMoved(junkbot);
		return;
	}
	if (junkbot.floating) {
		const abovePos = { x: junkbot.x, y: junkbot.y - 18 };
		const aboveHead = junkbotCollisionTest(abovePos.x, abovePos.y, junkbot);
		if (aboveHead) {
			debugJunkbot("FLOATING - CAN'T GO UP");
		} else {
			debugJunkbot("FLOATING - GO UP");
			junkbot.x = abovePos.x;
			junkbot.y = abovePos.y;
			entityMoved(junkbot);
		}
		return;
	}
	if (junkbot.animationFrame % 5 === 3) {
		debugInfoForJunkbot = "";
		const posInFront = { x: junkbot.x + junkbot.facing * 15, y: junkbot.y };
		if (junkbotCollisionTest(posInFront.x, posInFront.y, junkbot, true)) {
			// can we step up?
			posInFront.y -= 18;
			if (!junkbotCollisionTest(posInFront.x, posInFront.y, junkbot)) {
				// step up
				debugJunkbot("STEP UP");
				junkbot.x = posInFront.x;
				junkbot.y = posInFront.y;
				entityMoved(junkbot);
			} else {
				// reached wall; turn around
				debugJunkbot("WALL - TURN AROUND");
				junkbot.facing *= -1;
				playSound("turn");
			}
		} else {
			// is there solid ground ahead to walk on?
			if (
				junkbotCollisionTest(posInFront.x, posInFront.y + 1, junkbot, true) &&
				!junkbotCollisionTest(posInFront.x, posInFront.y, junkbot)
			) {
				// what about that triangle tho
				if (junkbotCollisionTest(posInFront.x, posInFront.y + 1, junkbot)) {
					debugJunkbot("WALK");
					junkbot.x = posInFront.x;
					junkbot.y = posInFront.y;
					entityMoved(junkbot);
				} else {
					debugJunkbot("NOPE");
					junkbot.facing *= -1;
					playSound("turn");
				}
			} else {
				// can we step down?
				posInFront.y += 18;
				if (
					junkbotCollisionTest(posInFront.x, posInFront.y + 1, junkbot, true) &&
					!junkbotCollisionTest(posInFront.x, posInFront.y, junkbot, true)
				) {
					// step down
					debugJunkbot("STEP DOWN");
					junkbot.x = posInFront.x;
					junkbot.y = posInFront.y;
					entityMoved(junkbot);
				} else {
					// reached cliff/ledge/edge/precipice or wall would bonk head; turn around
					debugJunkbot("CLIFF/WALL - TURN AROUND");
					junkbot.facing *= -1;
					playSound("turn");
				}
			}
		}
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
					if (junkbot.armored) {
						junkbot.losingShield = true;
					} else {
						junkbot.animationFrame = 0;
						junkbot.dying = true;
						junkbot.collectingBin = false;
						playSound("fire");
					}
				} else if (groundLevelEntity.type === "shield" && !groundLevelEntity.used && !junkbot.armored) {
					junkbot.animationFrame = 0;
					junkbot.gettingShield = true;
					groundLevelEntity.used = true;
					playSound("getShield");
				}
			}
		}
	}

	const bin = junkbotBinCollisionTest(junkbot.x + junkbot.facing * 15, junkbot.y, junkbot);
	if (bin) {
		junkbot.animationFrame = 0;
		junkbot.collectingBin = true;
		remove(entities, bin);
		playSound("collectBin");
		playSound("collectBin2");
	}
};

const simulateDrop = (drop) => {
	if (drop.splashing) {
		drop.animationFrame += 0.25;
		if (drop.animationFrame > 4) {
			remove(entities, drop);
		}
	} else {
		for (let i = 0; i < 6; i++) {
			const underneath = entitiesByTopY[drop.y + drop.height] || [];
			drop.y += 1;
			for (const ground of underneath) {
				if (
					drop.x + drop.width > ground.x &&
					drop.x < ground.x + ground.width &&
					ground.type !== "pipe" &&
					ground.type !== "drop"
				) {
					if (ground.type === "junkbot" && !ground.dying && !ground.dead) {
						if (ground.armored) {
							ground.losingShield = true;
						} else {
							ground.dying = true;
							ground.dyingFromWater = true;
							ground.collectingBin = false;
							ground.animationFrame = 0;
							playSound("waterDeath");
						}
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

const simulatePipe = (pipe) => {
	pipe.timer += 0.25;
	if (pipe.timer > 60) {
		pipe.timer = 0;
		entities.push(makeDrop({
			x: pipe.x,
			y: pipe.y,
		}));
	}
};

const simulate = () => {
	simulateGravity();

	for (const entity of entities) {
		if (!entity.grabbed) {
			if (entity.type === "junkbot") {
				simulateJunkbot(entity);
			} else if (entity.type === "pipe") {
				simulatePipe(entity);
			} else if (entity.type === "drop") {
				simulateDrop(entity);
			} else if ("animationFrame" in entity) {
				entity.animationFrame += 0.25;
			}
		}
	}

	for (const entity of entities) {
		if ("floating" in entity) {
			entity._wasFloating = entity.floating;
			delete entity.floating;
		}
	}
	wind.length = [];
	for (const entity of entities) {
		if (entity.type === "fan") {
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
								if (!otherEntity._wasFloating && !otherEntity.grabbed) {
									playSound("fan");
								}
								otherEntity.floating = true;
							} else if (
								otherEntity.type !== "gearbot" &&
								otherEntity.type !== "drop"
							) {
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
		delete entity._wasFloating;
	}
};

let rafid;
window.addEventListener("error", () => {
	// so my computer doesn't freeze up from the console logging messages about repeated errors
	cancelAnimationFrame(rafid);
});

const animate = () => {
	rafid = requestAnimationFrame(animate);

	if (!keys.ControlLeft && !keys.ControlRight) {
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
	const panMarginSize = Math.min(innerWidth, innerHeight) * 0.07;
	const panFromMarginSpeed = 10 * document.hasFocus();
	if (mouse.y < panMarginSize) {
		viewport.centerY -= panFromMarginSpeed;
	}
	if (mouse.y > canvas.height - panMarginSize) {
		viewport.centerY += panFromMarginSpeed;
	}
	if (mouse.x < panMarginSize + (sidebar.hidden ? 0 : sidebar.offsetWidth)) {
		viewport.centerX -= panFromMarginSpeed;
	}
	if (mouse.x > canvas.width - panMarginSize) {
		viewport.centerX += panFromMarginSpeed;
	}
	if (!editing) {
		viewport.centerY = Math.min(23 * 18 - canvas.height / 2 / viewport.scale, viewport.centerY);
	}
	updateMouseWorldPosition();

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

	// sort for gravity
	entities.sort((a, b) => b.y - a.y);

	if (!paused) {
		simulate();
	}

	sortEntitiesForRendering(entities);

	const hovered = dragging.length ? [] : possibleGrabs();

	if (dragging.length) {
		for (const brick of dragging) {
			brick.x = 15 * Math.floor((mouse.worldX) / 15) + brick.grabOffset.x;
			brick.y = 18 * Math.floor((mouse.worldY) / 18) + brick.grabOffset.y;
			entityMoved(brick);
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

	if (canvas.width !== innerWidth) {
		canvas.width = innerWidth;
	}
	if (canvas.height !== innerHeight) {
		canvas.height = innerHeight;
	}
	ctx.fillStyle = "#bbb";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.save(); // world viewport
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.scale(viewport.scale, viewport.scale);
	ctx.translate(-viewport.centerX, -viewport.centerY);
	ctx.imageSmoothingEnabled = false;

	const shouldHilight = (entity) => {
		return editing && entity.selected;
		// if (dragging.length) {
		// 	return dragging.indexOf(entity) > -1;
		// }
		// return hovered.length && hovered[Math.floor(Date.now() / 500 % hovered.length)].indexOf(entity) > -1;
	};

	const placeable = canRelease();

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

	ctx.restore(); // world viewport

	// active validity checking of the world
	if (showDebug) {
		const maxEntityHeight = 100;
		const reportedCollisions = new Map();
		const isNum = (value) => typeof value === "number" && isFinite(value);
		for (const entity of entities) {
			/* eslint-disable no-continue */
			if (!isNum(entity.x) || !isNum(entity.y)) {
				debug(`Invalid position (x/y) for entity ${JSON.stringify(entity, null, "\t")}\n`);
				continue;
			}
			if (!isNum(entity.width) || !isNum(entity.height)) {
				debug(`Invalid size (width/height) for entity ${JSON.stringify(entity, null, "\t")}\n`);
				continue;
			}
			if (entity.type === "brick" && !isNum(entity.widthInStuds)) {
				debug(`Invalid widthInStuds for entity ${JSON.stringify(entity, null, "\t")}\n`);
				continue;
			}
			if (entity.type === "brick" && entity.width !== 15 * entity.widthInStuds) {
				debug(`width doesn't match widthInStuds * 15 for entity ${JSON.stringify(entity, null, "\t")}\n`);
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
								let { x, y } = worldToCanvas(
									(entity.x + otherEntity.x + (entity.width + otherEntity.width) / 2) / 2,
									(entity.y + otherEntity.y + (entity.height + otherEntity.height) / 2) / 2,
								);
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
								drawText(ctx, `${entity.type} to ${otherEntity.type} collision`, x, y, "white");
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
	}

	if (showDebug) {
		const x = 1 + sidebar.offsetWidth;
		drawText(ctx, fontChars, x, 1, "white");
		const debugInfo = `ENTITIES: ${entities.length}
VIEWPORT: ${viewport.centerX}, ${viewport.centerY}
AT SCALE: ${viewport.scale}X

${debugInfoForJunkbot}

${debugInfoForFrame}`;
		drawText(ctx, debugInfo, x, 50, "white");
		const hoveredBrick = brickUnderMouse(true);
		if (dragging.length) {
			drawText(ctx, `DRAGGING: ${JSON.stringify(dragging, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
			// } else if (hovered.length) {
			// 	drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		} else if (hoveredBrick) {
			drawText(ctx, `HOVERED: ${JSON.stringify(hoveredBrick, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		}
		debugInfoForFrame = "";
	}
};

const wrapContents = (target, wrapper) => {
	[...target.childNodes].forEach((child) => wrapper.appendChild(child));
	target.appendChild(wrapper);
	return wrapper;
};

const initUI = () => {

	sidebar = document.createElement("div");
	sidebar.hidden = !editing;
	sidebar.style.position = "fixed";
	sidebar.style.left = "0px";
	sidebar.style.top = "0px";
	sidebar.style.bottom = "0px";
	sidebar.style.backgroundColor = "#224";

	const entitiesPalette = document.createElement("div");
	entitiesPalette.style.width = "300px";
	// wrapper to make layout consistent regardless of scrollbar
	const entitiesScrollContainer = document.createElement("div");
	entitiesScrollContainer.style.width = "320px"; // assuming scrollbar < 20px
	entitiesScrollContainer.style.height = "calc(100% - 140px)";
	entitiesScrollContainer.style.overflowY = "auto";
	entitiesScrollContainer.style.backgroundColor = "black";

	entitiesScrollContainer.append(entitiesPalette);
	sidebar.append(entitiesScrollContainer);

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
			sidebar.style.cursor = "url(\"images/cursors/cursor-insert.png\") 0 0, default";
			if (hilitButton) {
				hilitButton.style.borderColor = "transparent";
			}
			button.style.borderColor = "yellow";
			hilitButton = button;
			playSound("insert");
			canvas.focus(); // for keyboard shortcuts like Space
		});
		sidebar.addEventListener("mouseleave", () => {
			sidebar.style.cursor = "";
			// button.style.borderColor = "transparent";
		});
		const previewEntity = getEntityCopy();
		buttonCanvas.width = previewEntity.width + 15 * 1;
		buttonCanvas.height = previewEntity.height + 18 * 2;
		buttonCtx.translate(0, 28);
		drawEntity(buttonCtx, previewEntity);
		if (previewEntity.type === "fan") {
			drawWind(buttonCtx, previewEntity, [3, 3]);
		}
		button.append(buttonCanvas);
		entitiesPalette.append(button);
		return button;
	};

	Object.keys(brickColorToYIndex).forEach((colorName) => {
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
	}));

	makeInsertEntityButton(makePipe({
		x: 0,
		y: 0,
	}));
	makeInsertEntityButton(makeDrop({
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

	const saveButton = document.createElement("button");
	saveButton.textContent = "Save World";
	saveButton.onclick = saveToFile;
	saveButton.style.margin = "10px";
	sidebar.append(saveButton);

	const openButton = document.createElement("button");
	openButton.textContent = "Open World";
	openButton.onclick = openFromFile;
	openButton.style.margin = "10px";
	sidebar.append(openButton);

	sidebar.append(document.createElement("br"));

	const levelSelect = document.createElement("select");
	const option = document.createElement("option");
	option.textContent = "Custom World";
	option.defaultSelected = true;
	levelSelect.append(option);
	for (const levelName of resources.levelNames) {
		const option = document.createElement("option");
		option.textContent = levelName;
		levelSelect.append(option);
	}
	levelSelect.onchange = async () => {
		if (levelSelect.value === "Custom World") {
			// openFromFile(), maybe?
		} else {
			const fileName = `${levelSelect.value.replace(/[:?]/g, "")}.txt`;
			const folder = "levels";
			// const folder = "levels/Undercover Exclusive";
			try {
				await loadLevelFromTextFile(`${folder}/${fileName}`).then(initLevel);
			} catch (error) {
				showMessageBox(`Failed to load level:\n\n${error}`);
			}
		}
	};
	levelSelect.style.margin = "10px";
	sidebar.append(levelSelect);

	document.body.append(sidebar);

	infoBox = document.getElementById("info");
	const controlsTableRows = document.querySelectorAll("#info table tr");
	for (const tr of controlsTableRows) {
		const [controlCell, actionCell] = tr.cells;
		const kbd = controlCell.querySelector("kbd");
		const match = kbd.textContent.match(/(Ctrl\+)?(.+)/);
		if (match) {
			const ctrlKey = match[1] !== "";
			const key = match[2];
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
	try {
		deserialize(localStorage.JWorld);
		dragging = entities.filter((entity) => entity.grabbed);
	} catch (error) {
		// initTestLevel();
		deserialize(resources.world);
	}
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	initUI();
	animate();
};

main();
