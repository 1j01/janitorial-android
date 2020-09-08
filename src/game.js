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
const brickWidthInStudsToX = {1: 10, 2: 50, 3: 80, 4: 180, 5: 200, 6: 330};

const drawBrick = (ctx, widthInStuds, x, y, colorName)=> {
	const w = widthInStuds * 30;
	const h = 35;
	ctx.drawImage(images.coloredBlocks, brickWidthInStudsToX[widthInStuds], brickColorToYIndex[colorName] * 35 + 9, w, h, x, y, w, h);
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

	drawBrick(ctx, 1, 50, 250, "red");

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
