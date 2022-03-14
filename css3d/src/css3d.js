// This script is purely for debugging purposes... and viewing the scene in a decent way.
// The rendering works entirely through CSS.

const sceneEl = document.querySelector(".scene");

const {
	dat: { GUI },
} = window;

const CONTROLLER = new GUI();
const CONFIG = {
	"rotate-x": -31,
	"rotate-y": -119,
	"left-leg-rotate-x": 0,
	"left-leg-rotate-y": 0,
	"right-leg-rotate-x": 0,
	"right-leg-rotate-y": 0,
	"leg-width": 9.5,
	"leg-skew": 3,
	"eye-x": 0,
	"smile": 0,
	"lid-open": false,
	wireframe: false,
	rotate: true,
};
const updateGUI = () => {
	Object.entries(CONFIG).forEach(([key, value]) => {
		document.documentElement.style.setProperty(`--${key}`, typeof value === "boolean" ? Number(value) : value);
	});
	document.documentElement.style.setProperty(`--leg-skew`, `${CONFIG["leg-skew"]}deg`); // Stylus doesn't support calc in skew()
};
CONTROLLER.add(CONFIG, "wireframe")
	.name("Show wireframe")
	.onChange(updateGUI);
const PLANE_FOLDER = CONTROLLER.addFolder("Camera");
PLANE_FOLDER.add(CONFIG, "rotate-x", -360, 360, 1)
	.name("Rotate X (deg)")
	.onChange(updateGUI);
PLANE_FOLDER.add(CONFIG, "rotate-y", -360, 360, 1)
	.name("Rotate Y (deg)")
	.onChange(updateGUI);
const LEGS_FOLDER = CONTROLLER.addFolder("Legs");
LEGS_FOLDER.add(CONFIG, "leg-width", 0, 15, 0.01)
	.name("Leg Width")
	.onChange(updateGUI);
LEGS_FOLDER.add(CONFIG, "leg-skew", 0, 15, 0.01)
	.name("Power Stance")
	.onChange(updateGUI);
// LEGS_FOLDER.add(CONFIG, 'left-leg-rotate-x', -90, 90, 1)
//	.name('Left Leg Rotate X (deg)')
//	.onChange(updateGUI);
LEGS_FOLDER.add(CONFIG, "left-leg-rotate-y", -90, 68, 1)
	.name("Left Leg Rotate (deg)")
	.onChange(updateGUI);
// LEGS_FOLDER.add(CONFIG, 'right-leg-rotate-x', -90, 90, 1)
//	.name('Left Leg Rotate X (deg)')
//	.onChange(updateGUI);
LEGS_FOLDER.add(CONFIG, "right-leg-rotate-y", -90, 68, 1)
	.name("Left Leg Rotate (deg)")
	.onChange(updateGUI);
// CONTROLLER.add(CONFIG, 'rotate')
//	.name('Rotate face')
//	.onChange(updateGUI);
CONTROLLER.add(CONFIG, "smile", 0, 1, 0.01)
	.name("Smile")
	.onChange(updateGUI);
CONTROLLER.add(CONFIG, "eye-x", 0, 1, 0.01)
	.name("Shifty Eyes")
	.onChange(updateGUI);
CONTROLLER.add(CONFIG, "lid-open")
	.name("Lid Open")
	.onChange(updateGUI);
updateGUI();

let mouseLastX, mouseLastY;
const onMouseMove = (e) => {
	const deltaX = e.clientX - mouseLastX;
	const deltaY = e.clientY - mouseLastY;
	CONFIG["rotate-x"] -= deltaY / 3;
	CONFIG["rotate-y"] += deltaX / 3;
	mouseLastX = e.clientX;
	mouseLastY = e.clientY;
	updateGUI();
};
sceneEl.addEventListener("mousedown", (event) => {
	addEventListener("mousemove", onMouseMove, false);
	mouseLastX = event.clientX;
	mouseLastY = event.clientY;
	event.preventDefault();
});
addEventListener("mouseup", () => {
	removeEventListener("mousemove", onMouseMove, false);
});
sceneEl.addEventListener("contextmenu", (event) => {
	event.preventDefault();
});

let zoom = 1;
sceneEl.addEventListener("wheel", (event) => {
	zoom += (event.deltaY < 0) ? 0.1 : -0.1;
	document.documentElement.style.setProperty(`--zoom`, zoom);
});

/*
const animate = () => {
	requestAnimationFrame(animate);
	const t = performance.now();
	CONFIG["left-leg-rotate.y"] = Math.sin(t / 500);
	CONFIG["right-leg-rotate.y"] = -Math.sin(t / 500);
	updateGUI();
};
animate();
*/
