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
const drawText = (ctx, text, startX, startY)=> {
	let x = startX;
	let y = startY;
	text = text.toUpperCase();
	for (const char of text) {
		if (char === " ") {
			x += 6;
		} else {
			const index = fontChars.indexOf(char);
			const w = fontCharW[index];
			ctx.drawImage(images.font, fontCharX[index], 0, w, fontCharHeight, x, y, w, fontCharHeight);
			x += w + 1;
		}
	}
};


const animate = ()=> {
	requestAnimationFrame(animate);
	canvas.width = innerWidth;
	canvas.height = innerHeight;
	ctx.drawImage(images.font, 0, 90);
	drawText(ctx, "Hello world!", 0, 50);
	drawText(ctx, fontChars, 0, 100);
};

const main = async ()=> {
	images = await loadImages(imagePaths);
	animate();
};

main();
