const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

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
	if (response.ok) { // if HTTP-status is 200-299
		// get the response body (the method explained below)
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
	if (response.ok) { // if HTTP-status is 200-299
		// get the response body (the method explained below)
		return await response.text();
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadLevelFromTextFile = async (path) => {
	return loadLevelFromText(await loadTextFile(path));
};

const loadResources = async (resourcePathsByID) => {
	return Object.fromEntries(await Promise.all(Object.entries(resourcePathsByID).map(([id, path]) => {
		if (path.match(/atlas\.json$/)) {
			return loadAtlasJSON(path).then((atlas) => [id, atlas]);
		} else if (path.match(/\.json$/)) {
			return loadJSON(path).then((json) => [id, json]);
		} else if (path.match(/levels\/.*\.txt$/)) {
			return loadLevelFromTextFile(path).then((level) => [id, level]);
		} else {
			return loadImage(path).then((image) => [id, image]);
		}
	})));
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
	};
};

const drawBrick = (ctx, brick, isHovered) => {
	const { x, y, widthInStuds, colorName } = brick;
	const w = widthInStuds * 15 + 15; // sprite width
	const h = 35; // sprite row height
	ctx.globalAlpha = brick.grabbed ? 0.8 : 1;
	ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * h + 9, w, h, x, y - 15, w, h);
	if (isHovered) {
		ctx.globalAlpha = 0.5;
		ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], (brickColorToYIndex.gray + 1) * h + 9, w, h, x, y - 15, w, h);
	}
	ctx.globalAlpha = 1;
};

const drawJunkbot = (ctx, junkbot) => {
	ctx.globalAlpha = junkbot.grabbed ? 0.8 : 1;
	const frame = resources.actorsAtlas[`minifig_walk_${junkbot.facing === 1 ? "r" : "l"}_${1 + ~~(junkbot.animationFrame % 10)}`];
	const bounds = frame.bounds;
	if (junkbot.facing === 1) {
		ctx.drawImage(resources.actors, bounds[0], bounds[1], bounds[2], bounds[3], junkbot.x - bounds[2] + 41, junkbot.y + junkbot.height - 1 - bounds[3], bounds[2], bounds[3]);
	} else {
		ctx.drawImage(resources.actors, bounds[0], bounds[1], bounds[2], bounds[3], junkbot.x, junkbot.y + junkbot.height - 1 - bounds[3], bounds[2], bounds[3]);
	}
	ctx.globalAlpha = 1;
};

const entities = [];
for (let row = 5; row >= 0; row--) {
	for (let column = 0; column < 150;) { // MUST increment below
		if (Math.sin(column * 13234) < row * 0.2 + 0.1) {
			const widthInStuds = brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))];
			entities.push(makeBrick({
				x: column * 15,
				y: (row - 6) * 18,
				widthInStuds,
				// colorName: brickColorNames[~~(brickColorNames.length * Math.random())], // gaudy
				// colorName: "green", // grassy
				colorName: "gray",
				// colorName: "white",
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
		// x: 15 * ~~(Math.random() * 9),
		x: 15 * ~~(Math.sin(Date.now() / 400) * 9),
		y: 18 * -dropFromRow,
		widthInStuds: brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))],
		// widthInStuds: 2,
		colorName: brickColorNames[~~((brickColorNames.length - 1) * Math.random())],
	});
	entities.push(brick);
	if (dropFromRow > 100) {
		clearInterval(iid);
	}
}, 200);

const viewport = { centerX: 0, centerY: 0, scale: 2 };

const keys = {};
addEventListener("keydown", (event) => {
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
});
addEventListener("keyup", (event) => {
	delete keys[event.code];
	if (event.key.match(/^Arrow/)) {
		delete keys[event.key];
	}
});

const mouse = { x: undefined, y: undefined };
let dragging = [];

const updateMouseWorldPosition = () => {
	mouse.worldX = (mouse.x - canvas.width / 2) / viewport.scale + viewport.centerX;
	mouse.worldY = (mouse.y - canvas.height / 2) / viewport.scale + viewport.centerY;
};
const updateMouse = (event) => {
	mouse.x = event.offsetX;
	mouse.y = event.offsetY;
	updateMouseWorldPosition();
};
const brickUnderMouse = () => {
	for (const entity of entities) {
		if (
			!entity.fixed &&
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

const connectsToSomething = (entity, direction) => {
	if (direction === 0) {
		return connectsToSomething(entity, +1) || connectsToSomething(entity, -1);
	}
	for (const otherEntity of entities) {
		if (
			otherEntity !== entity &&
			!otherEntity.grabbed &&
			otherEntity.type === "brick" &&
			connects(entity, otherEntity, direction)
		) {
			return true;
		}
	}
	return false;
};

const possibleGrabs = () => {
	const findAttached = (brick, direction, attached) => {
		for (const entity of entities) {
			if (
				entity !== brick &&
				connects(brick, entity, entity.type === "junkbot" ? -1 : direction)
			) {
				if (entity.fixed || entity.type === "junkbot") {
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
		return true;
	};

	const brick = brickUnderMouse();
	if (!brick) {
		return [];
	}
	const grabs = [];
	if (brick.type !== "brick") {
		grabs.push(grabs.upward = [brick]);
		return grabs;
	}

	const grabDownward = [brick];
	const grabUpward = [brick];
	const canGrabDownward = findAttached(brick, +1, grabDownward);
	const canGrabUpward = findAttached(brick, -1, grabUpward);
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
		} else {
			pendingGrabs = grabs;
		}
	}
});
addEventListener("mouseup", () => {
	if (dragging.length) {
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
		}) && dragging.some((entity) => {
			for (const otherEntity of entities) {
				if (
					!otherEntity.grabbed &&
					otherEntity.type === "brick" &&
					connects(entity, otherEntity) &&
					(otherEntity.fixed || connectsToSomething(otherEntity))
				) {
					return true;
				}
			}
			return false;
		})) {
			dragging.forEach((entity) => {
				entity.grabbed = false;
				entity.grabOffset = null;
			});
			dragging = [];
		}
	}
});
canvas.addEventListener("mouseleave", () => {
	mouse.x = undefined;
	mouse.y = undefined;
});
addEventListener("blur", () => {
	mouse.x = undefined;
	mouse.y = undefined;
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
			if (connectsToSomething(entity, entity.type === "brick" ? 0 : 1)) {
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
			otherEntity.type !== "junkbot" && (
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
			return true;
		}
	}
	return false;
};

const simulateJunkbot = (junkbot) => {
	// const posInFront = {x: junkbot.x + junkbot.facing, y: junkbot.y};
	junkbot.timer += 1;
	if (junkbot.timer % 3 > 0) {
		return;
	}
	if (junkbot.animationFrame % 5 === 3) {
		debugInfoForJunkbot = "";
		const posInFront = { x: junkbot.x + junkbot.facing * 15, y: junkbot.y };
		if (junkbotCollisionTest(junkbot.x, junkbot.y, junkbot)) {
			debugJunkbot("STUCK IN WALL - GO UP");
			junkbot.y -= 18;
		} else if (junkbotCollisionTest(posInFront.x, posInFront.y, junkbot, true)) {
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
	const panMarginSize = innerWidth * 0.07;
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
	} else {
		canvas.style.cursor = "default";
	}

	if (canvas.width !== innerWidth) {
		canvas.width = innerWidth;
	}
	if (canvas.height !== innerHeight) {
		canvas.height = innerHeight;
	}
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.save();
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.scale(viewport.scale, viewport.scale);
	ctx.translate(-viewport.centerX, -viewport.centerY);
	ctx.imageSmoothingEnabled = false;

	shuffle(entities);
	sortEntitiesForRendering(entities);

	const shouldHilight = (entity) => {
		if (dragging.length) {
			return dragging.indexOf(entity) > -1;
		}
		// return hovered[0] && hovered[0].indexOf(entity) > -1;
		// return hovered.some((grab)=> grab.indexOf(entity) > -1);
		return hovered[0] && hovered[~~(Date.now() / 500 % hovered.length)].indexOf(entity) > -1;
	};

	for (const entity of entities) {
		if (entity.type === "junkbot") {
			drawJunkbot(ctx, entity);
		} else {
			drawBrick(ctx, entity, shouldHilight(entity));
		}
	}

	// for (const grab of hovered) {
	// 	sortEntitiesForRendering(grab);
	// 	ctx.save();
	// 	// ctx.translate(Math.sin(Date.now()/10) * 1, Math.cos(Date.now()/10) * 1);
	// 	for (const entity of grab) {
	// 		if (entity.type === "junkbot") {
	// 			// drawJunkbot(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity, true);
	// 		} else {
	// 			drawBrick(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity, true);
	// 		}
	// 	}
	// 	ctx.restore();
	// 	break;
	// }

	ctx.restore();

	// ctx.drawImage(images.font, 0, 90);
	// drawText(ctx, fontChars, 0, 100, "sand");
	const debugInfo = `ENTITIES: ${entities.length}
VIEWPORT: ${viewport.centerX}, ${viewport.centerY}
AT SCALE: ${viewport.scale}X

${debugInfoForJunkbot}

${debugInfoForFrame}`;
	drawText(ctx, debugInfo, 0, 50, "white");
	if (dragging.length) {
		drawText(ctx, `DRAGGING: ${JSON.stringify(dragging, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
	} else if (hovered.length) {
		drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
	}
	debugInfoForFrame = "";
};

const main = async () => {
	resources = await loadResources(resourcePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	animate();
};

main();
