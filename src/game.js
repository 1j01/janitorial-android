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

const fontChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890?!(),':\"";
const fontCharW = "55555555355555555555555555355555555551221113".split("").map((s)=> Number(s));
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
const brickWidthsInStuds = [1, 2, 3, 4, 6, 8];
const brickWidthsInStudsToX = {};
for (let x = 0, i = 0; i < brickWidthsInStuds.length; i++) {
	brickWidthsInStudsToX[brickWidthsInStuds[i]] = x;
	const w = brickWidthsInStuds[i] * 15 + 20;
	x += w;
}

const drawBrick = (ctx, widthInStuds, x, y, colorName)=> {
	const w = widthInStuds * 15 + 20;
	const h = 35;
	ctx.drawImage(images.coloredBlocks, brickWidthsInStudsToX[widthInStuds] + 10, brickColorToYIndex[colorName] * 35 + 9, w, h, x, y, w, h);
}

const bricks = [
	{x: 50, y: 250, colorName: "red", widthInStuds: 1},
	{x: 150, y: 269, colorName: "yellow", widthInStuds: 4},
	{x: 150, y: 250, colorName: "green", widthInStuds: 2},
];
for (let row = 5; row >= 0; row--) {
	for (let column = 0; column < 50; /* MUST increment below */) {
		if (Math.sin(column*13234) < row * 0.2 + 0.2) {
			const widthInStuds = brickWidthsInStuds[~~(Math.random() * brickWidthsInStuds.length)];
			bricks.push({
				x: column * 15,
				y: (row + 20) * 18,
				widthInStuds,
				colorName: "gray",
			});
			column += widthInStuds;
		} else {
			column += ~~(Math.random()*5+1);
		}
	}
}

const animate = ()=> {
	requestAnimationFrame(animate);
	if (canvas.width !== innerWidth) {
		canvas.width = innerWidth;
	}
	if (canvas.height !== innerHeight) {
		canvas.height = innerHeight;
	}
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	for (const brick of bricks) {
		// drawBrick(ctx, brick.widthInStuds, brick.x, brick.y, brick.colorName);
		drawBrick(ctx, brick.widthInStuds, brick.x, brick.y*2-500 + ~~(Math.sin(Date.now()/1000 + brick.x)*5), brick.colorName);
	}

	ctx.drawImage(images.font, 0, 90);
	drawText(ctx, "Hello world!\nThis is only a text", 0, 50, "orange");
	drawText(ctx, fontChars, 0, 100, "sand");
};

const main = async ()=> {
	images = await loadImages(imagePaths);
	for (const [colorName, color] of Object.entries(fontColors)) {
		fontCanvases[colorName] = colorizeWhiteAlphaImage(images.font, color);
	}
	animate();
};

main();
