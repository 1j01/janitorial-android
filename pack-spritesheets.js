/* global require */
/* eslint-disable no-console */
const fs = require("fs");
const packer = require("gamefroot-texture-packer");

let waiting = 0;
for (const name of ["backgrounds", "menus", "sprites"]) {
	for (const undercover of ["", "Undercover Exclusive/"]) {
		waiting += 1;
		// eslint-disable-next-line no-loop-func
		packer(`images/${name}/${undercover}*.png`, { format: "easel.js", name, path: `images/spritesheets/${undercover}` }, (err) => {
			if (err) {
				throw err;
			}
			console.log(`${name} spritesheet successfully generated`);

			fs.readFile(`images/spritesheets/${undercover}${name}-1.json`, "utf8", (err, json) => {
				if (err) {
					throw err;
				}
				json = json.replace(/\s*\/\/.*/g, ""); // remove line comments
				json = json.replace(/:\[/g, ": ["); // add whitespace
				json = json.replace(/\t\t\t\t?/g, "\t\t"); // fix indentation
				json = json.replace(/"images": \["[^"]*"\]/g, `"images": ["${name}.png"]`); // update filename reference
				fs.writeFile(`images/spritesheets/${undercover}${name}.json`, json, (err) => {
					if (err) {
						throw err;
					}
					fs.unlink(`images/spritesheets/${undercover}${name}-1.json`, (err) => {
						if (err) {
							throw err;
						}
						fs.rename(`images/spritesheets/${undercover}${name}-1.png`, `images/spritesheets/${undercover}${name}.png`, (err) => {
							if (err) {
								throw err;
							}
							waiting -= 1;
							if (waiting === 0) {
								console.log("All done!");
							}
						});
					});
				});
			});
		});
	}
}
