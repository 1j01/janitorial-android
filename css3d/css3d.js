// Purely for debugging purposes... and viewing the scene in a decent way
const sceneEl = document.querySelector('.scene')

const {
	dat: { GUI },
} = window

const CONTROLLER = new GUI()
const CONFIG = {
	'rotate-x': -31,
	'rotate-y': -119,
	'left-leg-rotate-x': 0,
	'left-leg-rotate-y': 0,
	'right-leg-rotate-x': 0,
	'right-leg-rotate-y': 0,
	'leg-width': 9.5,
	'leg-skew': 3,
	'eye-x': 0,
	'smile': 0,
	'lid-open': false,
	wireframe: false,
	rotate: true,
}
const UPDATE = () => {
	Object.entries(CONFIG).forEach(([key, value]) => {
		document.documentElement.style.setProperty(`--${key}`, typeof value === "boolean" ? +value : value)
	})
	document.documentElement.style.setProperty(`--leg-skew`, CONFIG["leg-skew"] + "deg") // Stylus doesn't support calc in skew()
}
CONTROLLER.add(CONFIG, 'wireframe')
	.name('Show wireframe')
	.onChange(UPDATE)
const PLANE_FOLDER = CONTROLLER.addFolder('Camera')
PLANE_FOLDER.add(CONFIG, 'rotate-x', -360, 360, 1)
	.name('Rotate X (deg)')
	.onChange(UPDATE)
PLANE_FOLDER.add(CONFIG, 'rotate-y', -360, 360, 1)
	.name('Rotate Y (deg)')
	.onChange(UPDATE)
const LEGS_FOLDER = CONTROLLER.addFolder('Legs')
LEGS_FOLDER.add(CONFIG, 'leg-width', 0, 15, 0.01)
	.name('Leg Width')
	.onChange(UPDATE)
LEGS_FOLDER.add(CONFIG, 'leg-skew', 0, 15, 0.01)
	.name('Power Stance')
	.onChange(UPDATE)
// LEGS_FOLDER.add(CONFIG, 'left-leg-rotate-x', -90, 90, 1)
//	.name('Left Leg Rotate X (deg)')
//	.onChange(UPDATE)
LEGS_FOLDER.add(CONFIG, 'left-leg-rotate-y', -90, 68, 1)
	.name('Left Leg Rotate (deg)')
	.onChange(UPDATE)
// LEGS_FOLDER.add(CONFIG, 'right-leg-rotate-x', -90, 90, 1)
//	.name('Left Leg Rotate X (deg)')
//	.onChange(UPDATE)
LEGS_FOLDER.add(CONFIG, 'right-leg-rotate-y', -90, 68, 1)
	.name('Left Leg Rotate (deg)')
	.onChange(UPDATE)
// CONTROLLER.add(CONFIG, 'rotate')
//	.name('Rotate face')
//	.onChange(UPDATE)
CONTROLLER.add(CONFIG, 'smile', 0, 1, 0.01)
	.name('Smile')
	.onChange(UPDATE)
CONTROLLER.add(CONFIG, 'eye-x', 0, 1, 0.01)
	.name('Shifty Eyes')
	.onChange(UPDATE)
CONTROLLER.add(CONFIG, 'lid-open')
	.name('Lid Open')
	.onChange(UPDATE)
UPDATE()

let mouseLastX, mouseLastY
sceneEl.addEventListener("mousedown", (event) => {
	addEventListener("mousemove", onMouseMove, false)
	mouseLastX = event.clientX
	mouseLastY = event.clientY
	event.preventDefault()
});
addEventListener("mouseup", () => {
	removeEventListener("mousemove", onMouseMove, false);
});
function onMouseMove(e) {
	let deltaX = e.clientX - mouseLastX
	let deltaY = e.clientY - mouseLastY
	CONFIG['rotate-x'] -= deltaY / 3
	CONFIG['rotate-y'] += deltaX / 3
	mouseLastX = e.clientX
	mouseLastY = e.clientY
	UPDATE()
}
sceneEl.addEventListener("contextmenu", (event) => {
	event.preventDefault()
});

let zoom = 1;
sceneEl.addEventListener("wheel", (event) => {
	zoom += (event.deltaY < 0) ? 0.1 : -0.1;
	document.documentElement.style.setProperty(`--zoom`, zoom)
});
function animate() {
	requestAnimationFrame(animate);
	let t = performance.now();
	CONFIG['left-leg-rotate.y'] = Math.sin(t / 500)
	CONFIG['right-leg-rotate.y'] = -Math.sin(t / 500)
	UPDATE()
}
//animate()

