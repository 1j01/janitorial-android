const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

window.AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

let debugInfoForFrame = "";
let debugInfoForJunkbot = "";
const debug = (text) => {
	debugInfoForFrame += `${text}\n`;
};
const debugJunkbot = (text) => {
	debugInfoForJunkbot += `${text}\n`;
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

const resourcePaths = {
	actors: "images/actors-atlas.png",
	actorsAtlas: "images/actors-atlas.json",
	coloredBlocks: "images/colored-blocks.png",
	font: "images/font.png",
	turn: "audio/sound-effects/turn1.ogg",
	blockPickUp: "audio/sound-effects/blockpickup.ogg",
	// blockPickUpFromAir: "audio/sound-effects/custom/pick-up-from-air.wav",
	blockDrop: "audio/sound-effects/blockdrop.ogg",
	blockClick: "audio/sound-effects/blockclick.ogg",
	fall: "audio/sound-effects/fall.ogg",
	headBonk: "audio/sound-effects/headbonk1.ogg",
	selectStart: "audio/sound-effects/custom/pick-up-from-air.wav",
	// selectEnd: "audio/sound-effects/custom/select-end.wav",
	// selectStart: "audio/sound-effects/custom/select2.wav",
	// selectEnd: "audio/sound-effects/custom/heavy-click.wav",
	// selectEnd: "audio/sound-effects/custom/heavy-click-2.wav",
	// selectStart: "audio/sound-effects/custom/select2.wav",
	// selectEnd: "audio/sound-effects/custom/select-end.wav",
	selectEnd: "audio/sound-effects/custom/select2.wav",
	// selectStart: "audio/sound-effects/custom/heavy-click-2.wav",
	delete: "audio/sound-effects/lego-creator/trash-I0514.wav",
	copyPaste: "audio/sound-effects/lego-creator/copy-I0510.wav",
	undo: "audio/sound-effects/lego-creator/undo-I0512.wav",
	redo: "audio/sound-effects/lego-creator/redo-I0513.wav",
	insert: "audio/sound-effects/lego-creator/insert-I0506.wav",
	world: "levels/junkbot-world.json",
};

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
	return Object.fromEntries((await loadJSON(path)).map(
		({ Name, Bounds }) => [Name, { bounds: Bounds.split(", ").map((numberString) => Number(numberString)) }]
	));
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
		return await context.decodeAudioData(await response.arrayBuffer());
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadResources = async (resourcePathsByID) => {
	return Object.fromEntries(await Promise.all(Object.entries(resourcePathsByID).map(([id, path]) => {
		if (path.match(/atlas\.json$/)) {
			return loadAtlasJSON(path).then((atlas) => [id, atlas]);
		} else if (path.match(/\.json$/)) {
			// return loadJSON(path).then((data) => [id, data]);
			return loadTextFile(path).then((json) => [id, json]);
		} else if (path.match(/levels\/.*\.txt$/)) {
			return loadLevelFromTextFile(path).then((level) => [id, level]);
		} else if (path.match(/\.(ogg|mp3|wav)$/)) {
			return loadSound(path).then((audioBuffer) => [id, audioBuffer]);
		} else {
			return loadImage(path).then((image) => [id, image]);
		}
	})));
};

let showDebug = false;
let muted = false;
let paused = false;
let editing = false;
let sidebar;
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
		// muted = localStorage.muteSoundEffects === "true";
		localStorage.editing = editing;
		// eslint-disable-next-line no-empty
	} catch (error) { }
};

const playSound = (audioBuffer) => {
	if (muted) {
		return;
	}
	const source = context.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(context.destination);
	source.start(0);
};

let resources;

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

const brickColorToYIndex = {
	white: 0,
	red: 1,
	green: 2,
	blue: 3,
	yellow: 4,
	gray: 5,
};
const brickColorNames = Object.keys(brickColorToYIndex);
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
		grabbed: false,
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
		grabbed: false,
		headLoaded: false,
	};
};

const drawBrick = (ctx, brick, hilight) => {
	const { x, y, widthInStuds, colorName } = brick;
	const w = widthInStuds * 15 + 15; // sprite width
	const h = 35; // sprite row height
	ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * h + 9, w, h, x, y - 15, w, h);
	if (hilight) {
		ctx.save();
		ctx.globalAlpha = 0.5;
		ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], (brickColorToYIndex.gray + 1) * h + 9, w, h, x, y - 15, w, h);
		ctx.restore();
	}
};

const drawJunkbot = (ctx, junkbot, hilight) => {
	const frameIndex = Math.floor(junkbot.animationFrame % 10);
	const frame = resources.actorsAtlas[`minifig_walk_${junkbot.facing === 1 ? "r" : "l"}_${1 + frameIndex}`];
	const [left, top, width, height] = frame.bounds;
	const fwd = (frameIndex === 3) * (junkbot.facing === 1 ? 3 : -3);
	if (junkbot.facing === 1) {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x - width + 41 + fwd, junkbot.y + junkbot.height - 1 - height, width, height);
	} else {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x + fwd, junkbot.y + junkbot.height - 1 - height, width, height);
	}
	if (hilight) {
		ctx.save();
		ctx.globalAlpha = 0.5;
		const w = 2 * 15 + 15; // sprite width
		const h = 35; // sprite row height
		for (let iy = 0; iy < junkbot.height; iy += 18) {
			ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[2], (brickColorToYIndex.gray + 1) * h + 9, w, h, junkbot.x, junkbot.y - 15 + iy, w, h);
		}
		ctx.restore();
	}
};

const drawEntity = (ctx, entity, hilight) => {
	switch (entity.type) {
		case "brick":
			drawBrick(ctx, entity, hilight);
			break;
		case "junkbot":
			drawJunkbot(ctx, entity, hilight);
			break;
		default:
			if (window.console) {
				// eslint-disable-next-line no-console
				console.warn(`Unknown entity type '${entity.type}'`);
			}
			break;
	}
};

let entities = [];
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
		entity.grabbed = false;
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
	// for (const entity of entities) {
	// 	entity.grabbed = false;
	// }
	save();
	return true;
};
const undo = () => {
	if (!editing) {
		toggleEditing();
		return;
	}
	const didSomething = undoOrRedo(undos, redos);
	if (didSomething) {
		playSound(resources.undo);
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
		playSound(resources.redo);
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
		playSound(resources.delete);
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
		playSound(resources.copyPaste);
	}
};
const cutSelected = () => {
	copySelected();
	deleteSelected();
};
const pasteEntities = (newEntities) => {
	undoable();
	for (const entity of entities) {
		entity.selected = false;
		entity.grabbed = false;
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
	playSound(resources.copyPaste);
};

const initTestLevel = () => {
	for (let row = 5; row >= 0; row--) {
		for (let column = 0; column < 150;) { // MUST increment below
			if (Math.sin(column * 13234) < row * 0.2 + 0.1) {
				const widthInStuds = brickWidthsInStuds[1 + Math.floor(Math.random() * (brickWidthsInStuds.length - 1))];
				entities.push(makeBrick({
					x: column * 15,
					y: (row - 6) * 18,
					widthInStuds,
					colorName: "gray",
					fixed: true,
				}));
				column += widthInStuds;
			} else {
				column += Math.floor(Math.random() * 5 + 1);
			}
		}
	}
	for (let staircase = 5; staircase >= 0; staircase--) {
		for (let stair = 0; stair < 10; stair++) {
			entities.push(makeBrick({
				x: staircase * 15 * 7 + stair * 15 * (staircase > 3 ? 1 : -1),
				y: (-stair - 8) * 18,
				widthInStuds: 2,
				colorName: "gray",
				fixed: true,
			}));
		}
	}
	entities.push(
		makeBrick({ x: 15 * 5, y: 18 * -12, colorName: "red", widthInStuds: 1 }),
		makeBrick({ x: 15 * 4, y: 18 * -13, colorName: "yellow", widthInStuds: 4 }),
		makeBrick({ x: 15 * 4, y: 18 * -14, colorName: "green", widthInStuds: 2 }),
	);
	entities.push(
		makeBrick({ x: 15 * 20, y: 18 * -16, colorName: "gray", fixed: true, widthInStuds: 6 }),
		makeBrick({ x: 15 * 26, y: 18 * -16, colorName: "gray", fixed: true, widthInStuds: 6 }),
		makeBrick({ x: 15 * 24, y: 18 * -20, colorName: "gray", fixed: true, widthInStuds: 6 }),
	);
	entities.push(makeJunkbot({ x: 15 * 9, y: 18 * -8, facing: 1 }));
	entities.push(makeJunkbot({ x: 15 * 9, y: 18 * -20, facing: 1 }));

	let dropFromRow = 25;
	const iid = setInterval(() => {
		dropFromRow += 1;
		const brick = makeBrick({
			x: 15 * Math.floor(Math.sin(Date.now() / 400) * 9),
			y: 18 * -dropFromRow,
			widthInStuds: brickWidthsInStuds[1 + Math.floor(Math.random() * (brickWidthsInStuds.length - 1))],
			colorName: brickColorNames[Math.floor((brickColorNames.length - 1) * Math.random())],
		});
		entities.push(brick);
		if (dropFromRow > 100) {
			clearInterval(iid);
		}
	}, 200);
};

const viewport = { centerX: 0, centerY: 0, scale: 2 };
const worldToCanvas = (worldX, worldY) => ({
	x: (worldX - viewport.centerX) * viewport.scale + canvas.width / 2,
	y: (worldY - viewport.centerY) * viewport.scale + canvas.height / 2,
});
const canvasToWorld = (canvasX, canvasY) => ({
	x: (canvasX - canvas.width / 2) / viewport.scale + viewport.centerX,
	y: (canvasY - canvas.height / 2) / viewport.scale + viewport.centerY,
});

let keys = {};
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
	for (const entity of entities) {
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

const connects = (a, b, direction = 0) => {
	if (direction === 0) {
		return connects(a, b, +1) || connects(a, b, -1);
	}
	return (
		(direction === 1 ? b.y === a.y + a.height : b.y + b.height === a.y) &&
		a.x + a.width > b.x &&
		a.x < b.x + b.width
	);
};

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
						/* eslint-disable max-depth */
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
						/* eslint-enable max-depth */
					}
				}
			}
		}
		return true;
	};

	const brick = brickUnderMouse() || brickUnderMouse(true);
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
	playSound(resources.blockPickUp);
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
	updateMouse(event);
	mouse.atDragStart = {
		x: mouse.x,
		y: mouse.y,
		worldX: mouse.worldX,
		worldY: mouse.worldY,
	};
	if (dragging.length === 0) {
		const grabs = possibleGrabs();
		if (!grabs.selection) {
			for (const entity of entities) {
				entity.selected = false;
			}
		}
		if (grabs.length === 1) {
			startGrab(grabs[0]);
			playSound(resources.blockClick);
		} else if (grabs.length) {
			pendingGrabs = grabs;
			playSound(resources.blockClick);
		} else if (editing) {
			selectionBox = { x1: mouse.worldX, y1: mouse.worldY, x2: mouse.worldX, y2: mouse.worldY };
			playSound(resources.selectStart);
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

	if (dragging.every((entity) => {
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
				return false;
			}
		}
		return true;
	})) {
		if (dragging.every((entity) => entity.fixed)) {
			return true;
		}
		let connectsToCeiling = false;
		let connectsToFloor = false;
		dragging.forEach((entity) => {
			for (const otherEntity of entities) {
				if (
					!otherEntity.grabbed &&
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
		});
		if (connectsToCeiling !== connectsToFloor) {
			return true;
		}
	}
	return false;
};
addEventListener("mouseup", () => {
	if (dragging.length) {
		if (canRelease()) {
			dragging.forEach((entity) => {
				entity.grabbed = false;
				entity.grabOffset = null;
			});
			dragging = [];
			playSound(resources.blockDrop);
			save();
		}
	} else if (selectionBox) {
		const toSelect = entitiesWithinSelection();
		toSelect.forEach((entity) => {
			entity.selected = true;
		});
		selectionBox = null;
		if (toSelect.length) {
			playSound(resources.selectEnd);
		}
	}
});

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

const simulateGravity = () => {
	for (const entity of entities) {
		if (!entity.fixed && !entity.grabbed) {
			let settled = false;
			if (connectsToFixed(entity, { direction: entity.type === "brick" ? 0 : 1 })) {
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

const simulateJunkbot = (junkbot) => {
	if (junkbot.grabbed) {
		return;
	}
	junkbot.timer += 1;
	const aboveHead = junkbotCollisionTest(junkbot.x, junkbot.y - 1, junkbot);
	const headLoaded = aboveHead && !aboveHead.fixed && !connectsToFixed(aboveHead, { ignoreEntities: [junkbot] });
	if (junkbot.headLoaded && !headLoaded) {
		junkbot.headLoaded = false;
	} else if (headLoaded && !junkbot.headLoaded && !junkbot.grabbed) {
		junkbot.headLoaded = true;
		playSound(resources.headBonk);
	}
	if (junkbot.timer % 3 > 0) {
		return;
	}
	const inside = junkbotCollisionTest(junkbot.x, junkbot.y, junkbot);
	if (inside) {
		debugJunkbot("STUCK IN WALL - GO UP");
		junkbot.y = inside.y - junkbot.height;
		entityMoved(junkbot);
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
				playSound(resources.turn);
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
					playSound(resources.turn);
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
					playSound(resources.turn);
				}
			}
		}
	}
	junkbot.animationFrame += 1;
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
		viewport.centerY = Math.min(-canvas.height / 2 / viewport.scale, viewport.centerY);
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
		simulateGravity();

		for (const entity of entities) {
			if (entity.type === "junkbot") {
				simulateJunkbot(entity);
			}
		}
	}

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

	// for debug: shows where the sorting can in SOME CASES fail
	// shuffle(entities);
	sortEntitiesForRendering(entities);

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

	// const connectedToFixed = allConnectedToFixed({ ignoreEntities: [brickUnderMouse() || {}] });
	// sortEntitiesForRendering(connectedToFixed);
	// ctx.save(); // shake
	// ctx.translate(Math.sin(Date.now() / 10), Math.cos(Date.now() / 10));
	// for (const entity of connectedToFixed) {
	// 	if (entity.type === "brick") {
	// 		drawBrick(ctx, entity);
	// 	}
	// }
	// ctx.restore(); // shake

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
		if (dragging.length) {
			drawText(ctx, `DRAGGING: ${JSON.stringify(dragging, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		} else if (hovered.length) {
			drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
		}
		debugInfoForFrame = "";
	}
};

/**
 * Water simulation created by Mengtian on 2016/2/18.
 *
 * https://github.com/zsefvlol/grid-based-water-simulation
 */

const gridWater = {

	// grid data, 0 air, 1 wall, 2 water
	grid: [],

	reset () {
		this.grid = [
			[1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[1, 2, 2, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
			[1, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		];
		gridWater.findConnectedBlock();
		gridWater.render();
	},

	connectivity: [],

	showConnectivity: false,
	toggleConnectivity () {
		this.showConnectivity = !this.showConnectivity;
		this.render();
	},

	render() {
		if (this.bricks) {
			this.bricks.forEach((brick) => {
				remove(entities, brick);
			});
		}
		this.bricks = [];
		this.grid.forEach((row, rowIndex) => {
			row.forEach((cell, columnIndex) => {
				// let innerText = "";
				// if (typeof this.connectivity[rowIndex] !== "undefined" &&
				// 	this.connectivity[rowIndex][columnIndex] > -1 && this.showConnectivity) {
				// 	innerText = this.connectivity[rowIndex][columnIndex];
				// }
				if (cell === 1) {
					this.bricks.push(makeBrick({
						x: columnIndex * 15,
						y: rowIndex * 18,
						widthInStuds: 1,
						colorName: "gray",
						fixed: true,
					}));
				} else if (cell === 2) {
					this.bricks.push(makeBrick({
						x: columnIndex * 15,
						y: rowIndex * 18,
						widthInStuds: 1,
						colorName: "blue",
						fixed: true,
					}));
				}
			});
		});
		entities = entities.concat(this.bricks);
	},

	// next step
	next () {
		const g = this.grid;
		const c = this.connectivity;
		const h = this.grid.length;
		const w = this.grid[0].length;
		let moved = false;

		// find all blocks
		const connectBlockIndex = [];
		c.forEach((row) => {
			row.forEach((col) => {
				if (col !== -1 && connectBlockIndex.indexOf(col) < 0) {
					connectBlockIndex.push(col);
				}
			});
		});

		// for each block
		/* eslint-disable max-depth, no-continue, brace-style */
		for (let i = 0; i < connectBlockIndex.length; i++) {
			const blockIndex = connectBlockIndex[i];

			// console.log("calculating block index:", blockIndex);
			let topWaterGridsHeight = -1;
			const gridsToMoveTo = { "grid": [], "pressure": 0 };
			for (let m = 0; m < h; m++) {
				for (let n = 0; n < w; n++) {
					if (c[m][n] === blockIndex) {
						// top water grids height
						if (topWaterGridsHeight === -1) {
							topWaterGridsHeight = m;
						}
						// if can drop down
						if (m + 1 < h && g[m + 1][n] === 0) {
							if (gridsToMoveTo.pressure === Number.MAX_VALUE) {
								// avoid duplicate
								if (!gridsToMoveTo.grid.filter((e) => {
									return e[0] === m + 1 && e[1] === n;
								})) {
									gridsToMoveTo.grid.push([m + 1, n]);
								}
							} else {
								gridsToMoveTo.grid = [[m + 1, n]];
								gridsToMoveTo.pressure = Number.MAX_VALUE;
							}
						}
						// if can drop left
						else if (n - 1 > 0 && g[m][n - 1] === 0 && m - topWaterGridsHeight > 0) {
							if (gridsToMoveTo.pressure > m - topWaterGridsHeight) {
								continue;
							} else if (gridsToMoveTo.pressure === m - topWaterGridsHeight) {
								// avoid duplicate
								if (!gridsToMoveTo.grid.filter((e) => {
									return e[0] === m && e[1] === n - 1;
								})) {
									gridsToMoveTo.grid.push([m, n - 1]);
								}
							} else {
								gridsToMoveTo.grid = [[m, n - 1]];
								gridsToMoveTo.pressure = m - topWaterGridsHeight;
							}
						}
						// if can drop right
						else if (n + 1 < w && g[m][n + 1] === 0 && m - topWaterGridsHeight > 0) {
							if (gridsToMoveTo.pressure > m - topWaterGridsHeight) {
								continue;
							} else if (gridsToMoveTo.pressure === m - topWaterGridsHeight) {
								// avoid duplicate
								if (!gridsToMoveTo.grid.filter((e) => {
									return e[0] === m && e[1] === n + 1;
								})) {
									gridsToMoveTo.grid.push([m, n + 1]);
								}
							} else {
								gridsToMoveTo.grid = [[m, n + 1]];
								gridsToMoveTo.pressure = m - topWaterGridsHeight;
							}
						}
						// if can press up, notice move up will lose 1 pressure
						else if (m - 1 > 0 && g[m - 1][n] === 0 && m - topWaterGridsHeight - 1 > 0) {
							if (gridsToMoveTo.pressure > m - topWaterGridsHeight - 1) {
								continue;
							} else if (gridsToMoveTo.pressure === m - topWaterGridsHeight - 1) {
								// avoid duplicate
								if (!gridsToMoveTo.grid.filter((e) => {
									return e[0] === m - 1 && e[1] === n;
								})) {
									gridsToMoveTo.grid.push([m - 1, n]);
								}
							} else {
								gridsToMoveTo.pressure = m - topWaterGridsHeight - 1;
								gridsToMoveTo.grid = [[m - 1, n]];
							}
						}

					}
				}
			}
			// console.log("grids to move to", gridsToMoveTo);

			// find the top water grid, and remove it
			const findWaterGridToRemove = (cm, cn) => {
				for (let m = 0; m < h; m++) {
					// always remove farthest water grid
					// 212<-remove this
					// 222
					// 211
					// remove this->212
					//              222
					//              112
					let leftFirst = -1;
					let rightFirst = -1;
					for (let n = 0; n < w; n++) {
						if (c[m][n] === blockIndex) {
							if (leftFirst === -1) {
								leftFirst = n;
							}
							if (rightFirst < n) {
								rightFirst = n;
							}
						}
					}
					if (leftFirst !== -1) {
						const nToRemove = cn < (rightFirst + leftFirst) / 2 ? rightFirst : leftFirst;
						return [m, nToRemove];
					}
				}
			};

			let gridToRemove;
			// eslint-disable-next-line no-loop-func
			gridsToMoveTo.grid.forEach((grid) => {
				// console.log(`add water to ${grid[0]},${grid[1]}`);
				gridToRemove = findWaterGridToRemove(grid[0], grid[1]);
				// if grid to remove and grid to add are of same height, do not move
				if (gridToRemove[0] === grid[0]) {
					return;
				}
				g[grid[0]][grid[1]] = 2;
				g[gridToRemove[0]][gridToRemove[1]] = 0;
				c[gridToRemove[0]][gridToRemove[1]] = -1;
				// console.log("remove water ", gridToRemove);
				moved = true;
			});
		}

		this.findConnectedBlock();
		this.render();
		if (!moved && this.timer) {
			clearInterval(this.timer);
			this.timer = "";
		}
	},

	// find connected blocks
	findConnectedBlock () {
		const m = this.grid.length;
		const n = this.grid[0].length;
		this.connectivity = this.buildArray(m, n, -1);
		let blockIndex = 0;

		// update block number, internal use, see usage below
		const update = (connectivity, oldNum, newNum) => {
			return connectivity.map((row) => {
				return row.map((col) => {
					return col === oldNum ? newNum : col;
				});
			});
		};

		// for each grid...
		for (let i = 0; i < this.grid.length; i++) {
			for (let j = 0; j < this.grid[i].length; j++) {
				// if not water grid, continue
				if (this.grid[i][j] < 2) {
					continue;
				}
				// if so
				// test if top grid is water grid.
				if (i > 0 && this.grid[i - 1][j] === 2) {
					// if so, mark this grid same as top
					this.connectivity[i][j] = this.connectivity[i - 1][j];
				}
				// test if left grid is water grid.
				if (j > 0 && this.grid[i][j - 1] === 2) {
					// if so
					// if this grid is not marked
					if (this.connectivity[i][j] === -1) {
						this.connectivity[i][j] = this.connectivity[i][j - 1];
					}
					// if this grid is already markd, and not same as left grid
					else if (this.connectivity[i][j] !== this.connectivity[i][j - 1]) {
						// update all the mark to connect to two part
						this.connectivity = update(this.connectivity, this.connectivity[i][j], this.connectivity[i][j - 1]);
					}
				}
				// if not connected to others, mark as a new block
				if (this.connectivity[i][j] === -1) {
					this.connectivity[i][j] = blockIndex;
					blockIndex += 1;
				}
			}
		}
	},

	// build array
	buildArray (m, n, v) {
		const array = [];
		const arrayRow = [];
		for (let i = 0; i < n; i++) {
			arrayRow.push(v);
		}
		for (let i = 0; i < m; i++) {
			array.push(arrayRow.slice(0));
		}
		return array;
	},

	timer: "",
	play () {
		if (!this.timer) {
			this.timer = setInterval(() => {
				gridWater.next();
			}, 80);
		}
	}

};
/* eslint-enable max-depth, no-continue, brace-style */

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
	entitiesScrollContainer.style.height = "calc(100% - 50px)";
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
				entity.selected = false;
				entity.grabbed = false;
			}
			const entity = getEntityCopy();
			pasteEntities([entity]);
			sidebar.style.cursor = "url(\"images/cursors/cursor-insert.png\") 0 0, default";
			if (hilitButton) {
				hilitButton.style.borderColor = "transparent";
			}
			button.style.borderColor = "yellow";
			hilitButton = button;
			playSound(resources.insert);
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

	const saveButton = document.createElement("button");
	saveButton.textContent = "Save World";
	saveButton.onclick = saveToFile;
	saveButton.style.margin = "10px";
	sidebar.append(saveButton);

	document.body.append(sidebar);
};

const main = async () => {
	try {
		showDebug = localStorage.showDebug === "true";
		muted = localStorage.muteSoundEffects === "true";
		editing = localStorage.editing === "true";
		paused = localStorage.paused === "true";
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

	gridWater.reset();
	gridWater.play();

	initUI();
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	animate();
};

main();
