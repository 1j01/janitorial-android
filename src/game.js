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

const fontChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890?!(),':"-+.^@#$%`;
const fontCharW = "5555555535555555555555555535555555555122111333135535".split("").map((s)=> Number(s));
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

const drawBrick = (ctx, widthInStuds, x, y, colorName)=> {
	const w = widthInStuds * 15 + 15;
	const h = 35;
	ctx.drawImage(images.coloredBlocks, brickWidthsInStudsToX[widthInStuds], brickColorToYIndex[colorName] * 35 + 9, w, h, x, y, w, h);
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
		x: 15 * ~~(Math.random() * 9),
		y: 18 * -drop_from_row,
		widthInStuds: brickWidthsInStuds[1 + ~~(Math.random() * (brickWidthsInStuds.length - 1))],
		colorName: brickColorNames[~~((brickColorNames.length - 1) * Math.random())],
	};
	bricks.push(brick);
}, 1000);

const viewport = {centerX: 0, centerY: 0, scale: 2};

let keys = {};
addEventListener("keydown", (event)=> {
	keys[event.code] = true;
	if (event.code === "Equal") {
		viewport.scale = Math.min(10, viewport.scale + 1);
	}
	if (event.code === "Minus") {
		viewport.scale = Math.max(1, viewport.scale - 1);
	}
});
addEventListener("keyup", (event)=> {
	delete keys[event.code];
});

const simulateGravity = ()=> {
	// TODO: order bricks/objects based on position, for rendering AND for gravity
	for (const brick of bricks) {
		if (!brick.fixed) {
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
	viewport.centerY = Math.min(-canvas.height / 2 / viewport.scale, viewport.centerY);

	simulateGravity();

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
		drawBrick(ctx, brick.widthInStuds, brick.x, brick.y, brick.colorName);
		drawBrick(ctx, brick.widthInStuds, brick.x, brick.y*2-500 + ~~(Math.sin(Date.now()/1000 + brick.x)*5), brick.colorName);
	}

	ctx.restore();

	// ctx.drawImage(images.font, 0, 90);
	// drawText(ctx, fontChars, 0, 100, "sand");
	const debugInfo = `BRICKS: ${bricks.length}
VIEWPORT: ${viewport.centerX}, ${viewport.centerY}
AT SCALE: ${viewport.scale}X`;
	drawText(ctx, debugInfo, 0, 50, "white");
};

const main = async ()=> {
	images = await loadImages(imagePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(images.font, color);
	}
	animate();
};

main();
