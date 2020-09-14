const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

let debugInfoForFrame = "";
let debugInfoForJunkbot = "";
const debug = (text)=> {
	debugInfoForFrame += text + "\n";
};
const debugJunkbot = (text)=> {
	debugInfoForJunkbot += text + "\n";
};

const resourcePaths = {
	actors: "images/actors-atlas.png",
	actorsAtlas: "images/actors-atlas.json",
	coloredBlocks: "images/colored-blocks.png",
	font: "images/font.png",
};

const loadImage = (imagePath)=> {
	const image = new Image();
	return new Promise((resolve, reject)=> {
		image.onload = ()=> {
			resolve(image);	
		};
		image.onerror = ()=> {
			reject(new Error(`Image failed to load ('${imagePath}')`));
		};
		image.src = imagePath;
	});
};

const loadJSON = async (path)=> {
	const response = await fetch(path);
	if (response.ok) { // if HTTP-status is 200-299
		// get the response body (the method explained below)
		return await response.json();
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadAtlasJSON = async (path)=> {
	return Object.fromEntries((await loadJSON(path)).map(
		({Name, Bounds})=> [Name, {bounds: Bounds.split(", ").map((numberString)=> Number(numberString))}]
	));
};

const loadLevelFromText = (levelData)=> {
	const sections = {};
	let section_name = "";
	for (const line of levelData.split(/\r?\n/g)) {
		if (line.match(/^\s*(#.*)?$/)) {
			continue;
		}
		const match = line.match(/^\[(.*)\]$/);
		if (match) {
			section_name = match[1];
		} else {
			sections[section_name] = sections[section_name] || [];
			sections[section_name].push(line.split("="));
		}
	}
	return sections;
};

const loadTextFile = async (path)=> {
	const response = await fetch(path);
	if (response.ok) { // if HTTP-status is 200-299
		// get the response body (the method explained below)
		return await response.text();
	} else {
		throw new Error(`got HTTP ${response.status} fetching '${path}'`);
	}
};

const loadLevelFromTextFile = async (path)=> {
	return loadLevelFromText(await loadTextFile(path));
};

const loadResources = async (resourcePathsByID)=> {
	return Object.fromEntries(await Promise.all(Object.entries(resourcePathsByID).map(([id, path])=> {
		if (path.match(/atlas\.json$/)) {
			return loadAtlasJSON(path).then((atlas)=> [id, atlas]);
		} else if (path.match(/\.json$/)) {
			return loadJSON(path).then((json)=> [id, json]);
		} else if (path.match(/levels\/.*\.txt$/)) {
			return loadLevelFromTextFile(path).then((level)=> [id, level]);
		} else {
			return loadImage(path).then((image)=> [id, image]);;
		}
	})));
};

let resources;

const fontChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890?!(),':"-+.^@#$%*~\`&_=;|\\/<>[]{}`;
const fontCharW = "55555555355555555555555555355555555551221113331355353525531155332233".split("").map((s)=> Number(s));
const fontCharX = [];
for (let x = 0, i = 0; i < fontChars.length; i++) {
	fontCharX.push(x);
	x += fontCharW[i] + 1;
}
const fontCharHeight = 5;

const colorizeWhiteAlphaImage = (image, color)=> {
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

const drawText = (ctx, text, startX, startY, colorName)=> {
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

const makeBrick = ({x, y, widthInStuds, colorName, fixed=false})=> {
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

const makeJunkbot = ({x, y, facing=1, armored=false})=> {
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

const drawBrick = (ctx, brick, isHovered)=> {
	const {x, y, widthInStuds, colorName} = brick;
	const w = widthInStuds * 15 + 15; // sprite width
	const h = 35; // sprite row height
	ctx.globalAlpha = brick.grabbed ? 0.8 : 1;
	ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * h + 9, w, h, x, y - 15, w, h);
	// if (isHovered) {
	// 	ctx.save();
	// 	ctx.globalCompositeOperation = "multiply";
	// 	ctx.drawImage(resources.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex.white * h + 9, w, h, x, y - 15, w, h);
	// 	ctx.restore();
	// }
	ctx.globalAlpha = 1;
};

const drawJunkbot = (ctx, junkbot, isHovered)=> {
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
	for (let column = 0; column < 150; ) { // MUST increment below
		if (Math.sin(column*13234) < row * 0.2 + 0.1) {
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
			column += ~~(Math.random()*5+1);
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
	makeBrick({x: 15*5, y: 18*-12, colorName: "red", widthInStuds: 1}),
	makeBrick({x: 15*4, y: 18*-13, colorName: "yellow", widthInStuds: 4}),
	makeBrick({x: 15*4, y: 18*-14, colorName: "green", widthInStuds: 2}),
);
entities.push(
	makeBrick({x: 15*20, y: 18*-16, colorName: "gray", fixed: true, widthInStuds: 6}),
	makeBrick({x: 15*26, y: 18*-16, colorName: "gray", fixed: true, widthInStuds: 6}),
	makeBrick({x: 15*24, y: 18*-20, colorName: "gray", fixed: true, widthInStuds: 6}),
);
const junkbot = makeJunkbot({x: 15*9, y: 18*-8, facing: 1});
entities.push(junkbot);

let drop_from_row = 25;
setInterval(()=> {
	drop_from_row += 1;
	const brick = makeBrick({
		// x: 15 * ~~(Math.random() * 9),
		x: 15 * ~~(Math.sin(Date.now()/400) * 9),
		y: 18 * -drop_from_row,
		widthInStuds: brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))],
		// widthInStuds: 2,
		colorName: brickColorNames[~~((brickColorNames.length - 1) * Math.random())],
	});
	entities.push(brick);
}, 200);

const viewport = {centerX: 0, centerY: 0, scale: 2};

let keys = {};
addEventListener("keydown", (event)=> {
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
addEventListener("keyup", (event)=> {
	delete keys[event.code];
	if (event.key.match(/^Arrow/)) {
		delete keys[event.key];
	}
});

let mouse = {x: undefined, y: undefined};
let dragging = [];

const updateMouseWorldPosition = (event)=> {
	mouse.worldX = (mouse.x - canvas.width/2) / viewport.scale + viewport.centerX;
	mouse.worldY = (mouse.y - canvas.height/2) / viewport.scale + viewport.centerY;
};
const updateMouse = (event)=> {
	mouse.x = event.offsetX;
	mouse.y = event.offsetY;
	updateMouseWorldPosition();
};
const brickUnderMouse = ()=> {
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
const possibleGrabs = ()=> {
	const brick = brickUnderMouse();
	if (!brick) {
		return [];
	}
	if (brick.type !== "brick") {
		return [[brick]];
	}
	const grabs = [];
	const findAttached = (brick, direction, attached)=> {
		for (const entity of entities) {
			if (
				entity !== brick &&
				entity.type === "brick" &&
				!entity.fixed &&
				rectanglesIntersect(
					brick.x,
					brick.y + direction,
					brick.width,
					brick.height,
					entity.x,
					entity.y,
					entity.width,
					entity.height,
				)
			) {
				attached.push(entity);
				findAttached(entity, direction, attached);
			}
		}
	};
	
	const grabA = [brick];
	const grabB = [brick];
	findAttached(brick, +1, grabA);
	findAttached(brick, -1, grabB);
	if (grabA.length > 1) {
		grabs.push(grabA);
	}
	if (grabB.length > 1) {
		grabs.push(grabB);
	}
	if (grabs.length === 0) {
		grabs.push([brick]);
	}

	return grabs;
};

canvas.addEventListener("mousemove", updateMouse);
canvas.addEventListener("mousedown", (event)=> {
	updateMouse(event);
	const grabs = possibleGrabs();
	if (grabs.length > 0) {
		dragging = [...grabs[0]];
		for (const brick of dragging) {
			brick.grabbed = true;
			brick.grabOffset = {x: brick.x - mouse.worldX, y: brick.y - mouse.worldY};
		}
	}
});
addEventListener("mouseup", ()=> {
	if (dragging.length) {
		dragging.forEach((entity)=> {
			entity.grabbed = false;
			entity.grabOffset = null;
		});
		dragging = [];
	}
});
canvas.addEventListener("mouseleave", ()=> {
	mouse.x = undefined;
	mouse.y = undefined;
});
addEventListener("blur", ()=> {
	mouse.x = undefined;
	mouse.y = undefined;
});

// This is needed for simulation (gravity) and rendering.
// Well, strictly only Y sorting is needed for gravity I suppose?
const sortEntities = (entities)=> {
	// entities.sort((a, b)=> (b.y - a.y) || (a.x - b.x));
	// entities.sort((a, b)=> (b.y - a.y) + (a.x - b.x));
	entities.sort((a, b)=> {
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
function shuffle(a) {
   for (let i = a.length - 1; i > 0; i--) {
	   const j = Math.floor(Math.random() * (i + 1));
	   [a[i], a[j]] = [a[j], a[i]];
   }
   return a;
}

const simulateGravity = ()=> {
	for (const entity of entities) {
		if (!entity.fixed && !entity.grabbed) {
			let settled = false;
			for (const other_entity of entities) {
				if (
					!other_entity.grabbed &&
					entity.x + entity.width > other_entity.x &&
					entity.x < other_entity.x + other_entity.width &&
					// entity.y + entity.height >= other_entity.y &&
					// entity.y < other_entity.y + other_entity.height
					entity.y + entity.height === other_entity.y
				) {
					settled = true;
					break;
				}
			}
			if (!settled) {
				entity.y += 1;
				// entity.y += 6;
			}
		}
	}
};

const rectanglesIntersect = (a_x, a_y, a_w, a_h, b_x, b_y, b_w, b_h)=>
	a_x + a_w > b_x &&
	a_x < b_x + b_w &&
	a_y + a_h > b_y &&
	a_y < b_y + b_h;

const junkbotCollisionTest = (junkbot_x, junkbot_y, irregular=false)=> {
	for (const other_entity of entities) {
		if (
			!other_entity.grabbed &&
			other_entity.type !== "junkbot" && (
				rectanglesIntersect(
					junkbot_x + (junkbot.facing === 1 ? 0 : 15),
					junkbot_y,
					junkbot.width / 2,
					junkbot.height,
					other_entity.x,
					other_entity.y,
					other_entity.width,
					other_entity.height,
				) ||
				rectanglesIntersect(
					junkbot_x,
					junkbot_y + 18 * irregular,
					junkbot.width,
					junkbot.height - 18 * irregular,
					other_entity.x,
					other_entity.y,
					other_entity.width,
					other_entity.height,
				)
			)
		) {
			return true;
		}
	}
	return false;
};

const simulateJunkbot = ()=> {
	// const posInFront = {x: junkbot.x + junkbot.facing, y: junkbot.y};
	junkbot.timer += 1;
	if (junkbot.timer % 3 > 0) {
		return;
	}
	if (junkbot.animationFrame % 5 === 3) {
		debugInfoForJunkbot = "";
		const posInFront = {x: junkbot.x + junkbot.facing * 15, y: junkbot.y};
		if (junkbotCollisionTest(junkbot.x, junkbot.y)) {
			debugJunkbot("STUCK IN WALL - GO UP");
			junkbot.y -= 18;
		} else if (junkbotCollisionTest(posInFront.x, posInFront.y, true)) {
			// can we step up?
			posInFront.y -= 18;
			if (!junkbotCollisionTest(posInFront.x, posInFront.y)) {
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
			if (junkbotCollisionTest(posInFront.x, posInFront.y + 1, true) && !junkbotCollisionTest(posInFront.x, posInFront.y)) {
				// what about that triangle tho
				if (junkbotCollisionTest(posInFront.x, posInFront.y + 1)) {
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
				if (junkbotCollisionTest(posInFront.x, posInFront.y + 1, true) && !junkbotCollisionTest(posInFront.x, posInFront.y, true)) {
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

const animate = ()=> {
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
	const pan_margin_size = innerWidth * 0.07;
	const pan_from_margin_speed = 10 * document.hasFocus();
	if (mouse.y < pan_margin_size) {
		viewport.centerY -= pan_from_margin_speed;
	}
	if (mouse.y > canvas.height - pan_margin_size) {
		viewport.centerY += pan_from_margin_speed;
	}
	if (mouse.x < pan_margin_size) {
		viewport.centerX -= pan_from_margin_speed;
	}
	if (mouse.x > canvas.width - pan_margin_size) {
		viewport.centerX += pan_from_margin_speed;
	}
	viewport.centerY = Math.min(-canvas.height / 2 / viewport.scale, viewport.centerY);
	updateMouseWorldPosition();

	sortEntities(entities);
	simulateGravity();
	simulateJunkbot();

	const hovered = dragging.length ? [] : possibleGrabs();

	if (dragging.length) {
		for (const brick of dragging) {
			// brick.x = ~~(mouse.worldX + brick.grabOffset.x);
			// brick.y = ~~(mouse.worldY + brick.grabOffset.y);
			brick.x = 15 * ~~((mouse.worldX + brick.grabOffset.x)/15);
			// brick.y = 18 * ~~((mouse.worldY + brick.grabOffset.y)/18);
			brick.y = ~~(18/3 * ~~((mouse.worldY + brick.grabOffset.y)/18*3));
		}
		canvas.style.cursor = "grabbing";
	} else {
		canvas.style.cursor = hovered.length ? "grab" : "default";
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
	ctx.translate(canvas.width/2, canvas.height/2);
	ctx.scale(viewport.scale, viewport.scale);
	ctx.translate(-viewport.centerX, -viewport.centerY);
	ctx.imageSmoothingEnabled = false;

	shuffle(entities);
	sortEntities(entities);

	for (const entity of entities) {
		if (entity.type === "junkbot") {
			drawJunkbot(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity);
		} else {
			drawBrick(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity);
		}
	}

	for (const grab of hovered) {
		sortEntities(grab);
		ctx.save();
		ctx.translate(Math.sin(Date.now()/10) * 1, Math.cos(Date.now()/10) * 1);
		for (const entity of grab) {
			if (entity.type === "junkbot") {
				// drawJunkbot(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity, true);
			} else {
				drawBrick(ctx, entity, dragging.length ? dragging.indexOf(entity) > -1 : brickUnderMouse() === entity, true);
			}
		}
		ctx.restore();
		break;
	}

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

const main = async ()=> {
	resources = await loadResources(resourcePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(resources.font, color);
	}
	animate();
};

main();
