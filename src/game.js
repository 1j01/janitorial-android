const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

window.AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

let debugInfoForFrame = "";
let debugInfoForJunkbot = "";
// const debug = (text) => {
// 	debugInfoForFrame += `${text}\n`;
// };
const debugJunkbot = (text) => {
	debugInfoForJunkbot += `${text}\n`;
};

const rectanglesIntersect = (ax, ay, aw, ah, bx, by, bw, bh) => (
	ax + aw > bx &&
	ax < bx + bw &&
	ay + ah > by &&
	ay < by + bh
);

const resourcePaths = {
	actors: "images/actors-atlas.png",
	actorsAtlas: "images/actors-atlas.json",
	coloredBlocks: "images/colored-blocks.png",
	font: "images/font.png",
	turn: "audio/sound-effects/turn1.ogg",
	blockPickUp: "audio/sound-effects/blockpickup.ogg",
	blockDrop: "audio/sound-effects/blockdrop.ogg",
	blockClick: "audio/sound-effects/blockclick.ogg",
	fall: "audio/sound-effects/fall.ogg",
	headBonk: "audio/sound-effects/headbonk1.ogg",
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
			return loadJSON(path).then((json) => [id, json]);
		} else if (path.match(/levels\/.*\.txt$/)) {
			return loadLevelFromTextFile(path).then((level) => [id, level]);
		} else if (path.match(/\.(ogg|mp3|wav)$/)) {
			return loadSound(path).then((audioBuffer) => [id, audioBuffer]);
		} else {
			return loadImage(path).then((image) => [id, image]);
		}
	})));
};

const playSound = (audioBuffer) => {
	var source = context.createBufferSource();
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
	const frame = resources.actorsAtlas[`minifig_walk_${junkbot.facing === 1 ? "r" : "l"}_${1 + ~~(junkbot.animationFrame % 10)}`];
	const [left, top, width, height] = frame.bounds;
	if (junkbot.facing === 1) {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x - width + 41, junkbot.y + junkbot.height - 1 - height, width, height);
	} else {
		ctx.drawImage(resources.actors, left, top, width, height, junkbot.x, junkbot.y + junkbot.height - 1 - height, width, height);
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

let entities = [];
const undos = [];
const redos = [];
const clipboard = {};

const serialize = () => {
	return JSON.stringify({ entities, version: 0.1 });
};

const deserialize = (json) => {
	const state = JSON.parse(json);
	entities = state.entities;
};

const undoable = (fn) => {
	undos.push(serialize());
	redos.length = 0;
	if (fn) {
		fn();
		// save();
	}
};

const undo = () => {
	// if (editing) {
	undoOrRedo(undos, redos);
	// } else {
	// 	toggleEditing();
	// 	undo();
	// }
	// TODO: undo view too
};

const redo = () => {
	// if (editing) {
	undoOrRedo(redos, undos);
	// }
};

const undoOrRedo = (undos, redos) => {
	if (undos.length === 0) {
		return;
	}
	redos.push(serialize());
	deserialize(undos.pop());
	// for (const entity of entities) {
	// 	entity.grabbed = false;
	// }
	// save();
};

const selectAll = () => {
	entities.forEach((entity) => {
		entity.selected = true;
	});
};

const deleteSelected = () => {
	undoable(() => {
		entities = entities.filter((entity) => !entity.selected)
	});
};
const cutSelected = () => {
	copySelected();
	deleteSelected();
};
const copySelected = () => {
	clipboard.entitiesJSON = JSON.stringify(entities.filter((entity) => entity.selected));
};
const paste = () => {
	undoable(() => {
		for (const entity of entities) {
			entity.selected = false;
			entity.grabbed = false;
		}
		dragging = [];

		const newEntities = JSON.parse(clipboard.entitiesJSON);
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
			collectiveCenter.x += entityCenter.x
			collectiveCenter.y += entityCenter.y
		}
		collectiveCenter.x /= centers.length;
		collectiveCenter.y /= centers.length;

		const offsetX = - 15 * ~~(collectiveCenter.x / 15);
		const offsetY = - 18 * ~~(collectiveCenter.y / 18);

		for (const entity of newEntities) {
			entity.grabOffset = {
				x: entity.x + offsetX,
				y: entity.y + offsetY,
			};
		}
	});
};

const initTestLevel = () => {
	for (let row = 5; row >= 0; row--) {
		for (let column = 0; column < 150;) { // MUST increment below
			if (Math.sin(column * 13234) < row * 0.2 + 0.1) {
				const widthInStuds = brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))];
				entities.push(makeBrick({
					x: column * 15,
					y: (row - 6) * 18,
					widthInStuds,
					colorName: "gray",
					fixed: true,
				}));
				column += widthInStuds;
			} else {
				column += ~~(Math.random() * 5 + 1);
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
			x: 15 * ~~(Math.sin(Date.now() / 400) * 9),
			y: 18 * -dropFromRow,
			widthInStuds: brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))],
			colorName: brickColorNames[~~((brickColorNames.length - 1) * Math.random())],
		});
		entities.push(brick);
		if (dropFromRow > 100) {
			clearInterval(iid);
		}
	}, 200);
};

const viewport = { centerX: 0, centerY: 0, scale: 2 };

let keys = {};
addEventListener("keydown", (event) => {
	if (event.target.tagName.match(/input|textarea|select|button/i)) {
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
	switch (event.keyCode) {
		// case 32: // Space
		// case 80: // P
		// 	toggleEditing();
		// 	break;
		case 46: // Delete
			deleteSelected();
			break;
		case 90: // Z
			if (event.ctrlKey) {
				if (event.shiftKey) {
					redo();
				} else {
					undo();
				}
			}
			break;
		case 89: // Y
			if (event.ctrlKey) { redo(); }
			break;
		case 88: // X
			if (event.ctrlKey) { cutSelected(); }
			break;
		case 67: // C
			if (event.ctrlKey) { copySelected(); }
			break;
		case 86: // V
			if (event.ctrlKey) { paste(); }
			break;
		case 65: // A
			if (event.ctrlKey) { selectAll(); }
			break;
	}
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

const mouse = { x: undefined, y: undefined };
let dragging = [];
let selectionBox;
// let selectionBox = { x1: undefined, y1: undefined, x2: undefined, y2: undefined };

const updateMouseWorldPosition = () => {
	mouse.worldX = (mouse.x - canvas.width / 2) / viewport.scale + viewport.centerX;
	mouse.worldY = (mouse.y - canvas.height / 2) / viewport.scale + viewport.centerY;
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
		for (const otherEntity of entities) {
			if (
				ignoreEntities.indexOf(otherEntity) === -1 &&
				connectedToFixed.indexOf(otherEntity) === -1
			) {
				// TODO: handle non-bricks? but allow them as end results?
				if (connects(entity, otherEntity)) {
					connectedToFixed.push(otherEntity);
					addAnyAttached(otherEntity);
				}
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
		for (const otherEntity of entities) {
			if (
				!otherEntity.grabbed &&
				// otherEntity.type === "brick" && // TODO? but don't break behavior of bricks falling on junkbot...
				ignoreEntities.indexOf(otherEntity) === -1 &&
				visited.indexOf(otherEntity) === -1 &&
				connects(fromEntity, otherEntity, fromEntity === startEntity ? direction : 0)
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
		for (const entity of entities) {
			if (
				entity !== brick &&
				connects(brick, entity, entity.type === "brick" ? direction : -1)
			) {
				if (entity.fixed || entity.type !== "brick") {
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
				for (const entity of entities) {
					if (attached.indexOf(entity) === -1) {
						if (connects(brick, entity)) {
							if (!entity.fixed && entity.type === "brick") {
								if (!connectsToFixed(entity, { ignoreEntities: attached })) {
									for (const junk of entities) {
										if (junk.type !== "brick") {
											if (connects(entity, junk, -1)) {
												return false;
											}
										}
									}
									attached.push(entity);
								}
							}
						}
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
	if (brick.selected) {
		grabs.push(grabs.selection = entities.filter((entity) => entity.selected));
		return grabs;
	}
	if (keys.ControlLeft || keys.ControlRight) {
		grabs.push(grabs.upward = [brick]);
		return grabs;
	}
	if (brick.type !== "brick") {
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
	dragging = [...grab];
	for (const brick of dragging) {
		brick.grabbed = true;
		brick.grabOffset = {
			// x: brick.x - (15 * ~~(mouse.worldX/15)),
			// y: brick.y - (18 * ~~(mouse.worldY/18)),
			// so you can place blocks that were grabbed when they weren't on the grid:
			x: (15 * ~~(brick.x / 15)) - (15 * ~~(mouse.worldX / 15)),
			y: (18 * ~~(brick.y / 18)) - (18 * ~~(mouse.worldY / 18)),
		};
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
		if (grabs.length === 1) {
			startGrab(grabs[0]);
			playSound(resources.blockClick);
		} else if (grabs.length) {
			pendingGrabs = grabs;
			playSound(resources.blockClick);
		} else if (event.ctrlKey) {
			selectionBox = { x1: mouse.worldX, y1: mouse.worldY, x2: mouse.worldX, y2: mouse.worldY };
			playSound(resources.blockClick);
		}
		if (!grabs.selection) {
			for (const entity of entities) {
				entity.selected = false;
			}
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
	if (keys.ControlLeft || keys.ControlRight) {
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
		if (connectsToCeiling ^ connectsToFloor) {
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
		}
	} else if (selectionBox) {
		entitiesWithinSelection().forEach((entity) => {
			entity.selected = true;
		});
		selectionBox = null;
	}
});

const sortEntitiesForRendering = (entities) => {
	// entities.sort((a, b)=> (b.y - a.y) || (a.x - b.x));
	// entities.sort((a, b)=> (b.y - a.y) + (a.x - b.x));
	entities.sort((a, b) => {
		if (a.y + a.height <= b.y) {
			return +1;
		}
		if (b.y + b.height <= a.y) {
			return -1;
		}
		if (b.x + b.width <= a.x) {
			return +1;
		}
		if (a.x + a.width <= b.x) {
			return -1;
		}
		// return a.x - a.y - b.x + b.y;
		return 0;
	});
};

/**
* Shuffles array in place.
* @param {Array} a items An array containing the items.
*/
const shuffle = (a) => {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
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

const animate = () => {
	requestAnimationFrame(animate);

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
	const panMarginSize = Math.min(innerWidth, innerHeight) * 0.07;
	const panFromMarginSpeed = 10 * document.hasFocus();
	if (mouse.y < panMarginSize) {
		viewport.centerY -= panFromMarginSpeed;
	}
	if (mouse.y > canvas.height - panMarginSize) {
		viewport.centerY += panFromMarginSpeed;
	}
	if (mouse.x < panMarginSize) {
		viewport.centerX -= panFromMarginSpeed;
	}
	if (mouse.x > canvas.width - panMarginSize) {
		viewport.centerX += panFromMarginSpeed;
	}
	viewport.centerY = Math.min(-canvas.height / 2 / viewport.scale, viewport.centerY);
	updateMouseWorldPosition();

	// sort for gravity
	entities.sort((a, b) => b.y - a.y);

	simulateGravity();

	for (const entity of entities) {
		if (entity.type === "junkbot") {
			simulateJunkbot(entity);
		}
	}

	const hovered = dragging.length ? [] : possibleGrabs();

	if (dragging.length) {
		for (const brick of dragging) {
			brick.x = 15 * ~~((mouse.worldX) / 15) + brick.grabOffset.x;
			brick.y = 18 * ~~((mouse.worldY) / 18) + brick.grabOffset.y;
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
		return entity.selected;
		// if (dragging.length) {
		// 	return dragging.indexOf(entity) > -1;
		// }
		// return hovered.length && hovered[~~(Date.now() / 500 % hovered.length)].indexOf(entity) > -1;
	};

	const placeable = canRelease();

	for (const entity of entities) {
		ctx.globalAlpha = entity.grabbed ? placeable ? 0.8 : 0.3 : 1;
		if (entity.type === "junkbot") {
			drawJunkbot(ctx, entity, shouldHilight(entity));
		} else {
			drawBrick(ctx, entity, shouldHilight(entity));
		}
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
		ctx.save()
		ctx.beginPath()
		if (viewport.scale === 1) {
			ctx.translate(0.5, 0.5)
		}
		ctx.rect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1)
		ctx.fillStyle = "rgba(0, 155, 255, 0.1)"
		ctx.strokeStyle = "rgba(0, 155, 255, 0.8)"
		ctx.lineWidth = 1 / viewport.scale
		ctx.fill()
		ctx.stroke()
		ctx.restore()
	}

	ctx.restore(); // world viewport

	// ctx.drawImage(images.font, 0, 90);
	// drawText(ctx, fontChars, 0, 100, "sand");
// 	const debugInfo = `ENTITIES: ${entities.length}
// VIEWPORT: ${viewport.centerX}, ${viewport.centerY}
// AT SCALE: ${viewport.scale}X

// ${debugInfoForJunkbot}

// ${debugInfoForFrame}`;
// 	drawText(ctx, debugInfo, 0, 50, "white");
// 	if (dragging.length) {
// 		drawText(ctx, `DRAGGING: ${JSON.stringify(dragging, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
// 	} else if (hovered.length) {
// 		drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
// 	}
// 	debugInfoForFrame = "";
};

const main = async () => {
	initTestLevel();
	resources = await loadResources(resourcePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	animate();
};

main();
