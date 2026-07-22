import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  PARAM_SCHEMA,
  BASE_SCHEMA,
  BASE_TYPES,
  DEFAULT_PARAMS,
  PRESETS,
  clampParam,
  buildLampMesh,
  analyzePrintability,
  buildSupports,
  applyShadePreset,
} from './lampGeometry.js';
import { downloadSTL } from './stlExporter.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let params = applyShadePreset({ ...DEFAULT_PARAMS }, PRESETS['Twisted Vase']);
let lastMesh = null;

// ---------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------
const canvasWrap = document.getElementById('viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0e13);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(320, 240, 380);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasWrap.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 110, 0);

// Lighting -----------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(300, 500, 200);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 100;
keyLight.shadow.camera.far = 1600;
keyLight.shadow.camera.left = -400;
keyLight.shadow.camera.right = 400;
keyLight.shadow.camera.top = 400;
keyLight.shadow.camera.bottom = -400;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x5577ff, 0.4);
rimLight.position.set(-300, 200, -300);
scene.add(rimLight);

// The "bulb" — a point light inside the shade that makes it glow.
const bulb = new THREE.PointLight(0xffd9a0, 0, 1200, 1.4);
const bulbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff2d6 })
);
const bulbGroup = new THREE.Group();
bulbGroup.add(bulb);
bulbGroup.add(bulbMesh);
scene.add(bulbGroup);

// Ground -------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(600, 64),
  new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(1200, 48, 0x2a2f3a, 0x1b1f27);
grid.position.y = 0.1;
scene.add(grid);

// Lamp material & mesh -----------------------------------------------------
const lampMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3ede0, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide,
  transparent: true, opacity: 0.92, emissive: 0xffd9a0, emissiveIntensity: 0.0,
});

let lampMesh = new THREE.Mesh(new THREE.BufferGeometry(), lampMaterial);
lampMesh.castShadow = true;
lampMesh.receiveShadow = true;
scene.add(lampMesh);

// Support pillars (preview only) ------------------------------------------
const supportMaterial = new THREE.MeshStandardMaterial({
  color: 0x37c4dc, roughness: 0.6, metalness: 0.0,
  transparent: true, opacity: 0.5, side: THREE.DoubleSide,
});
let supportsMesh = null;
let supportsVisible = false;

function regenerateSupports() {
  const data = buildSupports(params, { threshold: 50 });
  if (supportsMesh) {
    supportsMesh.geometry.dispose();
    scene.remove(supportsMesh);
    supportsMesh = null;
  }
  if (data.pillarCount > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    supportsMesh = new THREE.Mesh(g, supportMaterial);
    supportsMesh.visible = supportsVisible;
    scene.add(supportsMesh);
  }
  const count = document.getElementById('support-count');
  count.textContent = data.pillarCount > 0
    ? `${data.pillarCount} support pillars — under overhangs steeper than ${data.threshold}° from vertical.`
    : 'No supports needed at this shape — nothing to generate.';
  document.getElementById('support-toggle-wrap').hidden = data.pillarCount === 0;
  if (data.pillarCount === 0) supportsVisible = false;
}

let lightOn = true;
function applyLightState() {
  bulb.intensity = lightOn ? 1600 : 0;
  bulbMesh.visible = lightOn;
  lampMaterial.emissiveIntensity = lightOn ? 0.55 : 0.0;
  lampMaterial.opacity = lightOn ? 0.82 : 0.96;
  keyLight.intensity = lightOn ? 0.6 : 1.1;
}

// ---------------------------------------------------------------------------
// Geometry rebuild
// ---------------------------------------------------------------------------
function rebuild() {
  const mesh = buildLampMesh(params);
  lastMesh = mesh;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  lampMesh.geometry.dispose();
  lampMesh.geometry = geo;

  const total = mesh.info.totalHeight;
  controls.target.set(0, total * 0.5, 0);
  bulbGroup.position.set(0, mesh.info.baseHeight + mesh.info.shadeHeight * 0.42, 0);

  updateInfo(mesh.info);
  updatePrintability(analyzePrintability(params));

  // Keep generated supports in sync with the current shape.
  if (supportsVisible) regenerateSupports();
}

const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString();

function updateInfo(info) {
  const baseRow = info.baseHeight > 0
    ? `<div><span>Base + shade</span><b>${fmt(info.baseHeight)} + ${fmt(info.shadeHeight)} mm</b></div>`
    : '';
  document.getElementById('info').innerHTML = `
    <div><span>Total height</span><b>${fmt(info.totalHeight)} mm</b></div>
    ${baseRow}
    <div><span>Max Ø</span><b>${fmt(info.maxDiameter)} mm</b></div>
    <div><span>Top opening Ø</span><b>${fmt(info.topOpeningDiameter)} mm</b></div>
    <div><span>Wall</span><b>${fmt(info.wallThickness)} mm</b></div>
    <div><span>Triangles</span><b>${info.triangles.toLocaleString()}</b></div>
  `;
}

function updatePrintability(a) {
  const el = document.getElementById('print-analysis');
  const dot = { clear: '🟢', marginal: '🟡', support: '🔴' }[a.verdict];
  const heading = { clear: 'No supports needed', marginal: 'Likely support-free', support: 'Supports recommended' }[a.verdict];
  const notes = [];
  if (a.causes.widensUpward) notes.push('walls widen going up');
  if (a.causes.twistShear) notes.push('twisted ribs add helical overhang');
  const noteLine = notes.length ? `<div class="pa-note">Drivers: ${notes.join('; ')}.</div>` : '';
  el.className = `print-analysis ${a.verdict}`;
  el.innerHTML = `
    <div class="pa-head">${dot} <b>${heading}</b></div>
    <div class="pa-metric">Max overhang <b>${a.maxOverhang.toFixed(0)}°</b> from vertical
      · steep area <b>${(a.overhangFrac * 100).toFixed(0)}%</b></div>
    <div class="pa-msg">${a.message}</div>
    ${noteLine}
  `;
}

// ---------------------------------------------------------------------------
// UI: auto-generated slider controls
// ---------------------------------------------------------------------------
const controlsPanel = document.getElementById('controls');
const inputEls = {};

function makeSlider(container, s) {
  const row = document.createElement('div');
  row.className = 'control';
  const label = document.createElement('label');
  label.innerHTML = `<span>${s.label}</span><output></output>`;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = s.min; slider.max = s.max; slider.step = s.step;
  slider.value = params[s.key];
  const out = label.querySelector('output');
  const setOut = (v) => { out.textContent = `${v}${s.unit ? ' ' + s.unit : ''}`; };
  setOut(params[s.key]);
  slider.addEventListener('input', () => {
    const v = clampParam(s.key, parseFloat(slider.value));
    params[s.key] = v; setOut(v); scheduleRebuild();
  });
  inputEls[s.key] = { slider, setOut };
  row.appendChild(label); row.appendChild(slider);
  container.appendChild(row);
}

function buildControls() {
  const groups = {};
  for (const s of PARAM_SCHEMA) (groups[s.group] ||= []).push(s);
  for (const [groupName, schemas] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'group';
    const h = document.createElement('h3');
    h.textContent = groupName;
    section.appendChild(h);
    for (const s of schemas) makeSlider(section, s);
    controlsPanel.appendChild(section);
  }
  buildBaseControls();
}

// Dedicated Base (stand) block: toggle + type buttons + sliders.
// Lives in column 2 (its own container), above the printability tools.
function buildBaseControls() {
  const host = document.getElementById('base-controls');
  const section = document.createElement('div');
  section.className = 'group first';
  section.innerHTML = `
    <h3>Base / Stand</h3>
    <label class="toggle">
      <input type="checkbox" id="base-enabled" />
      <span>Attach a base (prints as one piece)</span>
    </label>
    <div id="base-type" class="segmented"></div>
  `;
  host.appendChild(section);

  const enabled = section.querySelector('#base-enabled');
  enabled.checked = !!params.baseEnabled;
  enabled.addEventListener('change', () => {
    params.baseEnabled = enabled.checked;
    section.classList.toggle('base-off', !enabled.checked);
    rebuild();
  });

  const typeWrap = section.querySelector('#base-type');
  const typeButtons = {};
  for (const type of BASE_TYPES) {
    const b = document.createElement('button');
    b.textContent = type === 'flared' ? 'Flared foot' : 'Plinth';
    b.className = 'seg' + (params.baseType === type ? ' active' : '');
    b.addEventListener('click', () => {
      params.baseType = type;
      for (const t of BASE_TYPES) typeButtons[t].classList.toggle('active', t === type);
      rebuild();
    });
    typeButtons[type] = b;
    typeWrap.appendChild(b);
  }

  for (const s of BASE_SCHEMA) makeSlider(section, s);
  section.classList.toggle('base-off', !params.baseEnabled);
}

function syncControls() {
  for (const s of [...PARAM_SCHEMA, ...BASE_SCHEMA]) {
    const el = inputEls[s.key];
    if (!el) continue;
    el.slider.value = params[s.key];
    el.setOut(params[s.key]);
  }
  const enabled = document.getElementById('base-enabled');
  if (enabled) {
    enabled.checked = !!params.baseEnabled;
    enabled.closest('.group').classList.toggle('base-off', !params.baseEnabled);
  }
  document.querySelectorAll('#base-type .seg').forEach((b, i) => {
    b.classList.toggle('active', BASE_TYPES[i] === params.baseType);
  });
}

let rebuildTimer = null;
function scheduleRebuild() {
  if (rebuildTimer) cancelAnimationFrame(rebuildTimer);
  rebuildTimer = requestAnimationFrame(rebuild);
}

// ---------------------------------------------------------------------------
// Presets & actions
// ---------------------------------------------------------------------------
function buildPresetButtons() {
  const wrap = document.getElementById('presets');
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'preset';
    b.textContent = name;
    b.addEventListener('click', () => {
      // Keep any attached base; swap only the shade shape.
      params = applyShadePreset(params, PRESETS[name]);
      syncControls();
      rebuild();
    });
    wrap.appendChild(b);
  }
}

function randomize() {
  const rnd = (min, max) => min + Math.random() * (max - min);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shade = {
    height: Math.round(rnd(140, 320)),
    baseRadius: Math.round(rnd(45, 95)),
    topRadius: Math.round(rnd(25, 90)),
    bulge: Math.round(rnd(-40, 60)),
    bulgePos: +rnd(0.3, 0.7).toFixed(2),
    ribCount: pick([0, 5, 6, 8, 10, 12, 16, 20, 24]),
    ribAmplitude: +rnd(0, 14).toFixed(1),
    ribSharpness: +rnd(1, 4).toFixed(1),
    twist: Math.round(rnd(-360, 540) / 5) * 5,
    vWaveCount: pick([0, 0, 4, 6, 8, 10]),
    vWaveAmp: +rnd(0, 8).toFixed(1),
    wallThickness: 1.6, radialSegments: 220, heightSegments: 260,
  };
  params = applyShadePreset(params, shade); // keep base as-is
  syncControls();
  rebuild();
}

function exportSTL() {
  if (!lastMesh) return;
  const stamp = `${Math.round(lastMesh.info.totalHeight)}x${Math.round(lastMesh.info.maxDiameter)}`;
  downloadSTL(lastMesh, `lamp_${stamp}mm.stl`);
}

document.getElementById('btn-export').addEventListener('click', exportSTL);
document.getElementById('btn-random').addEventListener('click', randomize);
document.getElementById('btn-reset').addEventListener('click', () => {
  params = { ...DEFAULT_PARAMS };
  syncControls();
  rebuild();
});
document.getElementById('btn-gen-supports').addEventListener('click', () => {
  supportsVisible = true;
  regenerateSupports();
  const cb = document.getElementById('show-supports');
  cb.checked = supportsVisible; // may be forced off if nothing to support
});
document.getElementById('show-supports').addEventListener('change', (e) => {
  supportsVisible = e.target.checked;
  if (supportsVisible && !supportsMesh) regenerateSupports();
  else if (supportsMesh) supportsMesh.visible = supportsVisible;
});

const lightBtn = document.getElementById('btn-light');
lightBtn.addEventListener('click', () => {
  lightOn = !lightOn;
  lightBtn.classList.toggle('on', lightOn);
  lightBtn.textContent = lightOn ? 'Light: On' : 'Light: Off';
  applyLightState();
});

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------
function resize() {
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildControls();
buildPresetButtons();
applyLightState();
lightBtn.classList.add('on');
resize();
rebuild();
animate();
