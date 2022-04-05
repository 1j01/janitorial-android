import * as THREE from './three.module.js';

import { GUI } from './dat.gui.module.js';

import { OrbitControls } from './OrbitControls.js';
import { LDrawLoader } from './LDrawLoader.js';

import CustomShaderMaterial from "./three-custom-shader-material-3.2.12-modified-vanilla.js";

var spector = new SPECTOR.Spector();
spector.displayUI();

var container, progressBarDiv;

var camera, scene, renderer, controls, gui, guiData;

var model, textureCube, gridHelper;

var matMap;

// var ldrawPath = 'models/ldraw/officialLibrary/';
var ldrawPath = 'three-stuff/';

var modelFileList = {
	'Car': 'models/car.ldr_Packed.mpd',
	'Basic Bricks': 'models/basic-bricks.ldr_Packed.mpd',
	'Bots': 'models/bots.ldr_Packed.mpd',
	'Misc': 'models/misc.ldr_Packed.mpd',
	'Much Stuff': 'models/much-stuff.ldr_Packed.mpd',
	// 'Lunar Vehicle': 'models/1621-1-LunarMPVVehicle.mpd_Packed.mpd',
	// 'Radar Truck': 'models/889-1-RadarTruck.mpd_Packed.mpd',
	// 'Trailer': 'models/4838-1-MiniVehicles.mpd_Packed.mpd',
	// 'Bulldozer': 'models/4915-1-MiniConstruction.mpd_Packed.mpd',
	// 'Helicopter': 'models/4918-1-MiniFlyers.mpd_Packed.mpd',
	// 'Plane': 'models/5935-1-IslandHopper.mpd_Packed.mpd',
	// 'Lighthouse': 'models/30023-1-Lighthouse.ldr_Packed.mpd',
	// 'X-Wing mini': 'models/30051-1-X-wingFighter-Mini.mpd_Packed.mpd',
	// 'AT-ST mini': 'models/30054-1-AT-ST-Mini.mpd_Packed.mpd',
	// 'AT-AT mini': 'models/4489-1-AT-AT-Mini.mpd_Packed.mpd',
	// 'Shuttle': 'models/4494-1-Imperial Shuttle-Mini.mpd_Packed.mpd',
	// 'TIE Interceptor': 'models/6965-1-TIEIntercep_4h4MXk5.mpd_Packed.mpd',
	// 'Star fighter': 'models/6966-1-JediStarfighter-Mini.mpd_Packed.mpd',
	// 'X-Wing': 'models/7140-1-X-wingFighter.mpd_Packed.mpd',
	// 'AT-ST': 'models/10174-1-ImperialAT-ST-UCS.mpd_Packed.mpd'
};

const renderSize = [2000, 1000];
const aspect = renderSize[0] / renderSize[1];
const brickWidthLDU = 20; // Ldraw Units
const brickWidthPixels = 15; // target scale for matching Junkbot's pixel art
const frustumSize = renderSize[1] * brickWidthLDU / brickWidthPixels;

init();
animate();

let tweening = false;
function tween(object, to, from) {
	if (tweening) return;
	tweening = true;
	if (!from) {
		from = {};
		for (const key of Object.keys(to)) {
			from[key] = object[key];
		}
	}
	const startTime = performance.now();
	function animate() {
		let timeFraction = (performance.now() - startTime) / 1000;
		if (timeFraction < 1) {
			requestAnimationFrame(animate);
		} else {
			tweening = false;
			timeFraction = 1;
		}
		for (const [key, to_value] of Object.entries(to)) {
			const from_value = from[key];
			const value = from_value + (to_value - from_value) * timeFraction;
			object[key] = value;
		}
	}
	animate();
}

function init() {

	container = document.createElement('div');
	document.body.appendChild(container);

	// camera = new THREE.PerspectiveCamera( 45, aspect, 1, 10000 );
	camera = new THREE.OrthographicCamera(frustumSize * aspect / - 2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / - 2, -10000, 100000);
	// camera.position.set( 150, 200, 250 );
	camera.position.set(0, 0, 250);
	camera.lookAt(new THREE.Vector3(0, 0, 0));
	camera.position.set(1210, -250, 250);
	camera.updateProjectionMatrix();

	// scene

	scene = new THREE.Scene();
	// scene.background = new THREE.Color( 0xdeebed );

	var ambientLight = new THREE.AmbientLight(0xdedede, 0.8);
	scene.add(ambientLight);

	var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(- 1000, 3200, 1500);
	scene.add(directionalLight);

	const divisions = 100;
	const size = 15 * divisions;
	gridHelper = new THREE.GridHelper(size, divisions);
	scene.add(gridHelper);

	//

	renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
	// renderer.setPixelRatio(window.devicePixelRatio); // I'm generating pixel art, and I want to be able to zoom in to inspect it
	renderer.setSize(...renderSize);
	container.appendChild(renderer.domElement);

	// controls = new OrbitControls( camera, renderer.domElement );

	//

	guiData = {
		modelFileName: modelFileList['Basic Bricks'],
		envMapActivated: false,
		customShaderActivated: true,
		separateObjects: false,
		displayLines: false,
		conditionalLines: false,
		smoothNormals: false,
		constructionStep: 0,
		noConstructionSteps: "No steps.",
		grid: false,
		obliqueProjection: false,
		pixelScanner: false,
		exportImages: exportImages,
	};

	setupProjection();

	window.addEventListener('resize', setupProjection, false);

	window.addEventListener('keydown', (event) => {
		if (event.code === "KeyI") {
			tween(model.rotation, { x: model.rotation.x - Math.PI / 2 });
		}
		if (event.code === "KeyK") {
			tween(model.rotation, { x: model.rotation.x + Math.PI / 2 });
		}
		if (event.code === "KeyJ") {
			tween(model.rotation, { y: model.rotation.y - Math.PI / 2 });
		}
		if (event.code === "KeyL") {
			tween(model.rotation, { y: model.rotation.y + Math.PI / 2 });
		}
		const moveSpeed = event.shiftKey ? 10 : event.ctrlKey ? 0.01 : 1;
		if (event.key === "ArrowUp") {
			model.position.y += moveSpeed;
		}
		if (event.key === "ArrowDown") {
			model.position.y -= moveSpeed;
		}
		if (event.key === "ArrowRight") {
			model.position.x += moveSpeed;
		}
		if (event.key === "ArrowLeft") {
			model.position.x -= moveSpeed;
		}
		if (event.key === "PageUp") {
			model.position.z += moveSpeed;
		}
		if (event.key === "PageDown") {
			model.position.z -= moveSpeed;
		}
		if (event.key === "Insert") {
			model.scale.x += 0.01 * moveSpeed;
			model.scale.y += 0.01 * moveSpeed;
			model.scale.z += 0.01 * moveSpeed;
			console.log("scale", model.scale);
		}
		if (event.key === "Delete") {
			model.scale.x -= 0.01 * moveSpeed;
			model.scale.y -= 0.01 * moveSpeed;
			model.scale.z -= 0.01 * moveSpeed;
			console.log("scale", model.scale);
		}
	});

	progressBarDiv = document.createElement('div');
	progressBarDiv.innerText = "Loading...";
	progressBarDiv.style.fontSize = "3em";
	progressBarDiv.style.color = "#888";
	progressBarDiv.style.display = "block";
	progressBarDiv.style.position = "absolute";
	progressBarDiv.style.top = "50%";
	progressBarDiv.style.width = "100%";
	progressBarDiv.style.textAlign = "center";


	// load materials and then the model

	reloadObject(true);

}

window.addEventListener("scroll", () => {
	scrollTo(0, 0);
});

function updateObjectsVisibility() {

	model.traverse(c => {

		if (c.isLineSegments) {

			if (c.isConditionalLine) {

				c.visible = guiData.conditionalLines;

			} else {

				c.visible = guiData.displayLines;

			}

		}
		else if (c.isGroup) {

			// Hide objects with construction step > gui setting
			c.visible = c.userData.constructionStep <= guiData.constructionStep;

		}

	});

	gridHelper.visible = guiData.grid;

}

function reloadObject(resetCamera) {

	if (model) {

		scene.remove(model);

	}

	model = null;

	updateProgressBar(0);
	showProgressBar();

	var lDrawLoader = new LDrawLoader();
	lDrawLoader.separateObjects = guiData.separateObjects;
	lDrawLoader.smoothNormals = guiData.smoothNormals;
	lDrawLoader
		.setPath(ldrawPath)
		.load(guiData.modelFileName, function (group2) {

			if (model) {

				scene.remove(model);

			}

			model = group2;

			// Convert from LDraw coordinates: rotate 180 degrees around OX
			model.rotation.x = Math.PI;

			scene.add(model);

			// Adjust materials

			if (guiData.customShaderActivated) {

				matMap = new Map();

				for (const material of lDrawLoader.materials) {
					matMap.set(material, new CustomShaderMaterial(
						THREE.MeshPhysicalMaterial, // base material, could get from material.type
						null, // fragment shader
						document.getElementById('vertexShader').textContent,
						{
							// uniforms
							uTime: {
								value: 0,
							},
						},
						{
							// options
							flatShading: true,
							color: material.color,
							opacity: material.opacity,
							transparent: material.transparent,
							side: material.side,
							envMap: material.envMap,
							name: material.name,
						}
					));
				}

				console.log(lDrawLoader.materials, matMap);

				model.traverse(c => {
					console.log("material", c.material);

					if (c.isMesh) {

						if (c.material instanceof Array) {
							c.material = c.material.map(m => matMap.get(m));
						} else {
							c.material = matMap.get(c.material) ?? c.material;
						}

					}

				});

			} else {

				var materials = lDrawLoader.materials;

				if (guiData.envMapActivated) {

					if (!textureCube) {

						// Envmap texture
						var r = "textures/cube/Bridge2/";
						var urls = [r + "posx.jpg", r + "negx.jpg",
						r + "posy.jpg", r + "negy.jpg",
						r + "posz.jpg", r + "negz.jpg"];
						textureCube = new THREE.CubeTextureLoader().load(urls);
						textureCube.mapping = THREE.CubeReflectionMapping;

					}

					for (var i = 0, n = materials.length; i < n; i++) {

						var material = materials[i];

						if (material.userData.canHaveEnvMap) {

							material.envMap = textureCube;

						}

					}

				}

			}

			guiData.constructionStep = model.userData.numConstructionSteps - 1;

			updateObjectsVisibility();

			// Adjust camera and light

			var bbox = new THREE.Box3().setFromObject(model);
			var size = bbox.getSize(new THREE.Vector3());
			var radius = Math.max(size.x, Math.max(size.y, size.z)) * 0.5;

			if (resetCamera) {

				// controls.target0.copy( bbox.getCenter( new THREE.Vector3() ) );
				// controls.position0.set( - 2.3, 2, 2 ).multiplyScalar( radius ).add( controls.target0 );
				// controls.reset();

			}

			createGUI();

			hideProgressBar();

		}, onProgress, onError);

}

function setupProjection() {

	camera.aspect = renderSize[0] / renderSize[1];
	camera.left = - frustumSize * camera.aspect / 2;
	camera.right = frustumSize * camera.aspect / 2;
	camera.top = frustumSize / 2;
	camera.bottom = - frustumSize / 2;
	// camera.left = 0;
	// camera.right = frustumSize * camera.aspect;
	// camera.top = frustumSize;
	// camera.bottom = 0;

	camera.updateProjectionMatrix();

	if (guiData.obliqueProjection) {
		// code based on https://stackoverflow.com/a/26060068/2624876
		// Create shear matrix for oblique projection
		var alpha = Math.PI / 4;

		var Syx = 0,
			Szx = - 0.5 * Math.cos(alpha),
			Sxy = 0,
			Szy = - 0.5 * Math.sin(alpha),
			Sxz = 0,
			Syz = 0;

		var matrix = new THREE.Matrix4();

		matrix.set(1, Syx, Szx, 0,
			Sxy, 1, Szy, 0,
			Sxz, Syz, 1, 0,
			0, 0, 0, 1);

		// var matrix = new THREE.Matrix4();
		// 1. result of the above code
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0.3535533905932738, -0.35355339059327373, 1, 0, 0, 0, 0, 1]);
		// 2. try using the same number since they're similar
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0.3535533905932738, -0.3535533905932738, 1, 0, 0, 0, 0, 1]);
		// 3. try reducing precision
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0.35, -0.35, 1, 0, 0, 0, 0, 1]);
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0.32, -0.32, 1, 0, 0, 0, 0, 1]);
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0.25, -0.25, 1, 0, 0, 0, 0, 1]);
		// 4. head-on view
		// matrix.fromArray([1, 0, 0, 0, 0, 1, 0, 0, -0., -0., 1, 0, 0, 0, 0, 1]);

		camera.projectionMatrix.multiply(matrix);
		camera.projectionMatrixInverse.getInverse(camera.projectionMatrix);
	}

	renderer.setSize(...renderSize);
}

function createGUI() {

	if (gui) {

		gui.destroy();
	}

	gui = new GUI();

	gui.add(guiData, 'modelFileName', modelFileList).name('Model').onFinishChange(function () {

		reloadObject(true);

	});

	gui.add(guiData, 'separateObjects').name('Separate Objects').onChange(function (value) {

		reloadObject(false);

	});

	if (guiData.separateObjects) {

		if (model.userData.numConstructionSteps > 1) {

			gui.add(guiData, 'constructionStep', 0, model.userData.numConstructionSteps - 1).step(1).name('Construction step').onChange(updateObjectsVisibility);

		}
		else {

			gui.add(guiData, 'noConstructionSteps').name('Construction step').onChange(updateObjectsVisibility);

		}
	}

	gui.add(guiData, 'envMapActivated').name('Env. map').onChange(function changeEnvMap(value) {

		reloadObject(false);

	});

	gui.add(guiData, 'customShaderActivated').name('Custom shader').onChange(function changeShader(value) {

		reloadObject(false);

	});

	gui.add(guiData, 'smoothNormals').name('Smooth Normals').onChange(function changeNormals(value) {

		reloadObject(false);

	});

	gui.add(guiData, 'displayLines').name('Display Lines').onChange(updateObjectsVisibility);
	gui.add(guiData, 'conditionalLines').name('Conditional Lines').onChange(updateObjectsVisibility);

	gui.add(guiData, 'grid').name('Grid').onChange(updateObjectsVisibility);

	gui.add(guiData, 'obliqueProjection').name('Oblique Projection').onChange(function changeProjection(value) {
		setupProjection();
	});

	gui.add(guiData, 'pixelScanner').name('Pixel Scanner (measurement tool)').onChange(function changePixelScanner(value) {
		// scanningCanvas.hidden = !value;
		// remove from DOM instead of hiding it so it doesn't show up in the Spector canvas dropdown
		// Spector is a WebGL debugging tool, available as a browser extension or library.
		if (value) {
			document.body.appendChild(scanningCanvas);
		} else {
			scanningCanvas.remove();
		}
	});

	gui.add(guiData, 'exportImages').name('Export Image(s)');

}

//

function animate() {

	requestAnimationFrame(animate);
	render();

}

function render() {

	if (matMap) {
		for (const mat of matMap.values()) {
			mat.uniforms.uTime.value = performance.now() / 1000;
		}
	}

	renderer.render(scene, camera);

}

function onProgress(xhr) {

	if (xhr.lengthComputable) {

		updateProgressBar(xhr.loaded / xhr.total);

		console.log(Math.round(xhr.loaded / xhr.total * 100, 2) + '% downloaded');

	}

}

function onError() {

	var message = "Error loading model";
	progressBarDiv.innerText = message;
	console.log(message);

}

function showProgressBar() {

	document.body.appendChild(progressBarDiv);

}

function hideProgressBar() {

	document.body.removeChild(progressBarDiv);

}

function updateProgressBar(fraction) {

	progressBarDiv.innerText = 'Loading... ' + Math.round(fraction * 100, 2) + '%';

}

function exportImages() {

	renderer.domElement.toBlob((blob) => {
		const blobURL = URL.createObjectURL(blob);
		// someEl.innerHTML = `<a href="${blobURL}" download="${guiData.modelFileName}.png">Download Image</a>`;
		const a = document.createElement("a");
		a.href = blobURL;
		a.download = `${guiData.modelFileName}.png`;
		document.body.appendChild(a);
		console.log("In case download is blocked by browser, save this manually:", blobURL);
		a.click();
		setTimeout(function () {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(blobURL);
		}, 0);
	});

}

var scanningCanvas = document.createElement('canvas');
// document.body.appendChild(scanningCanvas); // appended conditionally
scanningCanvas.style.position = 'absolute';
scanningCanvas.style.top = '0px';
scanningCanvas.style.left = '0px';

function scanPixels() {
	if (tweening || !guiData.pixelScanner) {
		return;
	}
	scanningCanvas.width = renderSize[0];
	scanningCanvas.height = renderSize[1];
	var context = scanningCanvas.getContext('2d');
	context.drawImage(renderer.domElement, 0, 0);
	var imageData = context.getImageData(0, 0, renderSize[0], renderSize[1]);
	var data = imageData.data;
	var buckets = [];
	for (var x = 0; x < imageData.width; x++) {
		buckets[x] = 0;
		for (var y = 0; y < imageData.height; y++) {
			var index = (y * imageData.width + x) * 4;
			var alpha = data[index + 3];
			buckets[x] += alpha;
		}
		buckets[x] /= imageData.height;
	}
	var transitions = [];
	for (var x = 0; x < imageData.width - 1; x++) {
		if (Math.abs(buckets[x] - buckets[x + 1]) > 1) {
			transitions.push(x);
		}
	}
	var distances = [];
	for (var i = 0; i < transitions.length - 1; i++) {
		distances.push(transitions[i + 1] - transitions[i]);
	}
	var averageDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
	console.log({ transitions, distances, averageDistance });

	for (const transitionX of transitions) {
		for (var y = 0; y < imageData.height; y++) {
			var index = (y * imageData.width + transitionX) * 4;
			data[index + 3] = 255;
			data[index + 2] = 255;
			data[index + 1] = 255;
			data[index + 0] = 255;
		}
	}
	context.putImageData(imageData, 0, 0);

	for (var i = 0; i < distances.length; i++) {
		var x = transitions[i];
		var distance = distances[i];
		var y = scanningCanvas.height / 2 + (x * 50) % 500;
		context.fillStyle = 'red';
		context.font = "20px Arial";
		context.fillText(distance, x, y);
	}
}

setInterval(scanPixels, 1000);
