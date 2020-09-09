const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

const imagePaths = {
	junkbot: "images/junkbot.png",
	coloredBlocks: "images/colored-blocks.png",
	font: "images/font.png",
};

const loadImages = async (imagePaths)=> {
	return Object.fromEntries(await Promise.all(Object.entries(imagePaths).map(([id, path])=> {
		const image = new Image();
		return new Promise((resolve, reject)=> {
			image.onload = ()=> {
				resolve([id, image]);	
			};
			image.onerror = ()=> {
				reject(new Error(`Image failed to load ('${path}')`));
			};
			image.src = path;
		});
	})));
};

let images;

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

const drawBrick = (ctx, widthInStuds, x, y, colorName, isHovered)=> {
	const w = widthInStuds * 15 + 15;
	const h = 35;
	ctx.globalAlpha = isHovered ? 0.8 : 1;
	ctx.drawImage(images.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * 35 + 9, w, h, x, y - 15, w, h);
	// if (isHovered) {
	// 	ctx.save();
	// 	ctx.globalCompositeOperation = "multiply";
	// 	ctx.drawImage(images.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex.white * 35 + 9, w, h, x, y - 15, w, h);
	// 	ctx.restore();
	// }
};

const bricks = [];
for (let row = 5; row >= 0; row--) {
	for (let column = 0; column < 150; /* MUST increment below */) {
		if (Math.sin(column*13234) < row * 0.2 + 0.1) {
			const widthInStuds = brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))];
			bricks.push({
				x: column * 15,
				y: (row - 6) * 18,
				widthInStuds,
				// colorName: brickColorNames[~~(brickColorNames.length * Math.random())], // gaudy
				// colorName: "green", // grassy
				colorName: "gray",
				// colorName: "white",
				fixed: true,
			});
			column += widthInStuds;
		} else {
			column += ~~(Math.random()*5+1);
		}
	}
}
bricks.push(
	{x: 15*4, y: 18*-12, colorName: "red", widthInStuds: 1},
	{x: 15*4, y: 18*-13, colorName: "yellow", widthInStuds: 4},
	{x: 15*4, y: 18*-14, colorName: "green", widthInStuds: 2},
);
let drop_from_row = 15;
setInterval(()=> {
	drop_from_row += 1;
	const brick = {
		// x: 15 * ~~(Math.random() * 9),
		x: 15 * ~~(Math.sin(Date.now()/400) * 9),
		y: 18 * -drop_from_row,
		// widthInStuds: brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))],
		widthInStuds: 2,
		colorName: brickColorNames[~~((brickColorNames.length - 1) * Math.random())],
	};
	bricks.push(brick);
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
let drag_offset = {x: 0, y: 0};
let dragging = null;

const updateMouse = (event)=> {
	mouse.x = event.offsetX;
	mouse.y = event.offsetY;
	mouse.worldX = (mouse.x - canvas.width/2) / viewport.scale + viewport.centerX;
	mouse.worldY = (mouse.y - canvas.height/2) / viewport.scale + viewport.centerY;
};
const brickUnderMouse = ()=> {
	for (const brick of bricks) {
		if (
			!brick.fixed &&
			brick.x < mouse.worldX &&
			brick.x + brick.widthInStuds * 15 > mouse.worldX &&
			brick.y < mouse.worldY &&
			brick.y + 18 > mouse.worldY
		) {
			return brick;
		}
	}
};

canvas.addEventListener("mousemove", updateMouse);
canvas.addEventListener("mousedown", (event)=> {
	updateMouse(event);
	const brick = brickUnderMouse();
	if (brick) {
		dragging = brick;
		drag_offset = {x: brick.x - mouse.worldX, y: brick.y - mouse.worldY};
	}
});
addEventListener("mouseup", ()=> {
	dragging = null;
});
canvas.addEventListener("mouseleave", ()=> {
	mouse.x = undefined;
	mouse.y = undefined;
});
addEventListener("blur", ()=> {
	mouse.x = undefined;
	mouse.y = undefined;
});

const simulateGravity = ()=> {
	for (const brick of bricks) {
		if (!brick.fixed && brick !== dragging) {
			let settled = false;
			for (const other_brick of bricks) {
				if (
					brick.x + brick.widthInStuds * 15 > other_brick.x &&
					brick.x < other_brick.x + other_brick.widthInStuds * 15 &&
					// brick.y + 18 >= other_brick.y &&
					// brick.y < other_brick.y + 18
					brick.y + 18 === other_brick.y
				) {
					settled = true;
				}
			}
			if (!settled) {
				brick.y += 1;
			}
		}
	}
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
	const pan_from_margin_speed = 10;
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

	bricks.sort((a, b)=> (b.y - a.y) + (a.x - b.x) /15*18);
	// bricks.sort((a, b)=> (b.y - a.y) || (a.x - b.x));
	// bricks.sort((a, b)=> a.x - b.x);
	// bricks.sort((a, b)=> b.y - a.y);
	// bricks.sort((a, b)=> (b.y - a.y) || (a.x + a.widthInStuds*15 - b.x));
	// bricks.sort((a, b)=>
	// 	(a.x + a.widthInStuds*15 < b.x) ? -1 : 
	// 	(b.x + b.widthInStuds*15 < a.x) ? +1 :
	// 	b.y - a.y
	// );
	// bricks.sort((a, b)=> {
	// 	if (a.x + a.widthInStuds*15 >= b.x) {
	// 		return -1;
	// 	} else if (b.x + b.widthInStuds*15 >= a.x) {
	// 		return +1;
	// 	} else {
	// 		return b.y - a.y;
	// 	}
	// });

	simulateGravity();
	const hovered = dragging || brickUnderMouse();

	if (dragging) {
		// dragging.x = ~~(mouse.worldX + drag_offset.x);
		// dragging.y = ~~(mouse.worldY + drag_offset.y);
		dragging.x = 15 * ~~((mouse.worldX + drag_offset.x)/15);
		// dragging.y = 18 * ~~((mouse.worldY + drag_offset.y)/18);
		dragging.y = ~~(18/3 * ~~((mouse.worldY + drag_offset.y)/18*3));
		canvas.style.cursor = "grabbing";
	} else {
		canvas.style.cursor = hovered ? "grab" : "default";
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

	for (const brick of bricks) {
		drawBrick(ctx, brick.widthInStuds, brick.x, brick.y, brick.colorName, brick === hovered);
		// drawBrick(ctx, brick.widthInStuds, brick.x, brick.y*2-500 + ~~(Math.sin(Date.now()/1000 + brick.x)*5), brick.colorName);
	}

	ctx.restore();

	// ctx.drawImage(images.font, 0, 90);
	// drawText(ctx, fontChars, 0, 100, "sand");
	const debugInfo = `BRICKS: ${bricks.length}
VIEWPORT: ${viewport.centerX}, ${viewport.centerY}
AT SCALE: ${viewport.scale}X`;
	drawText(ctx, debugInfo, 0, 50, "white");
	if (hovered) {
		drawText(ctx, `HOVERED: ${JSON.stringify(hovered, null, "\t")}`, mouse.x + 50, mouse.y - 30, "white");
	}
};

const main = async ()=> {
	images = await loadImages(imagePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(images.font, color);
	}
	animate();
};

main();
