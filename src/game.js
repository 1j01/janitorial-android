const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

document.body.append(canvas);

const imagePaths = {
	junkbot: "images/junkbot.png",
	coloredBlocks: "images/colored-blocks.png",
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
const animate = ()=> {
	requestAnimationFrame(animate);
	canvas.width = innerWidth;
	canvas.height = innerHeight;
	ctx.drawImage(images.junkbot, 0, 0);
};

const main = async ()=> {
	images = await loadImages(imagePaths);
	animate();
};

main();
