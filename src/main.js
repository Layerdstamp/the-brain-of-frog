import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.querySelector('#scene');
const infoEl = document.querySelector('#node-info');

const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse)';
const isMobile = window.matchMedia(MOBILE_QUERY).matches;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04050f, isMobile ? 0.028 : 0.018);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 1.8, isMobile ? 18 : 15);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x02020a, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.minDistance = 9;
controls.maxDistance = 32;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;
controls.target.set(0, 0.3, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.9 : 1.35,
  isMobile ? 0.28 : 0.32,
  0.74,
);
composer.addPass(bloomPass);

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.AmbientLight(0x5f5fcf, 0.45);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x7a9cff, 0x0c0623, 0.9);
scene.add(hemi);

const key = new THREE.PointLight(0xb679ff, 1.6, 90, 1.7);
key.position.set(9, 7, 4);
scene.add(key);

const rim = new THREE.PointLight(0x57cdff, 1.3, 80, 1.9);
rim.position.set(-8, -4, -7);
scene.add(rim);

const nodes = [];
const nodeMeta = new Map();
const nodeGeometry = new THREE.SphereGeometry(isMobile ? 0.19 : 0.17, isMobile ? 10 : 14, isMobile ? 10 : 14);
const nodeMaterialA = new THREE.MeshBasicMaterial({ color: 0x8f5bff });
const nodeMaterialB = new THREE.MeshBasicMaterial({ color: 0x67d2ff });

function addStrandLayer({
  radius,
  wobble,
  strandCount,
  pointsPerStrand,
  tint,
  spinSpeed,
  nodeEvery,
}) {
  const layer = new THREE.Group();
  layer.userData.spinSpeed = spinSpeed;

  for (let i = 0; i < strandCount; i += 1) {
    const pts = [];
    const seed = i * 0.73;

    for (let p = 0; p < pointsPerStrand; p += 1) {
      const t = p / (pointsPerStrand - 1);
      const phi = t * Math.PI * 2.0 + seed;
      const theta = t * Math.PI * 6.0 + seed * 1.8;
      const shell = radius + Math.sin(theta * 0.75) * wobble;

      const x = shell * Math.cos(phi) * Math.sin(theta);
      const y = shell * Math.cos(theta * 0.7) * 0.42;
      const z = shell * Math.sin(phi) * Math.sin(theta);
      pts.push(new THREE.Vector3(x, y, z));

      if (p % nodeEvery === 0) {
        const node = new THREE.Mesh(nodeGeometry, (p + i) % 2 === 0 ? nodeMaterialA : nodeMaterialB);
        node.position.set(x, y, z);
        node.scale.setScalar(0.75 + Math.random() * 0.7);
        node.userData.baseScale = node.scale.x;
        nodes.push(node);
        nodeMeta.set(node.uuid, {
          layer: Math.round(radius * 10) / 10,
          strand: i + 1,
          id: nodes.length,
        });
        layer.add(node);
      }
    }

    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
    const curvePoints = curve.getPoints(pointsPerStrand * 3);
    const geo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const mat = new THREE.LineBasicMaterial({
      color: tint,
      transparent: true,
      opacity: isMobile ? 0.26 : 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const line = new THREE.Line(geo, mat);
    layer.add(line);
  }

  return layer;
}

const layerConfig = [
  { radius: 2.7, wobble: 0.7, strandCount: isMobile ? 16 : 24, pointsPerStrand: 26, tint: 0x8e64ff, spinSpeed: 0.0042, nodeEvery: 4 },
  { radius: 4.3, wobble: 1.0, strandCount: isMobile ? 20 : 30, pointsPerStrand: 30, tint: 0x6cc9ff, spinSpeed: -0.0032, nodeEvery: 5 },
  { radius: 6.2, wobble: 1.3, strandCount: isMobile ? 24 : 36, pointsPerStrand: 32, tint: 0xd279ff, spinSpeed: 0.0024, nodeEvery: 5 },
];

const strandLayers = layerConfig.map((cfg) => addStrandLayer(cfg));
strandLayers.forEach((layer) => root.add(layer));

const particleCount = isMobile ? 2800 : 5400;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);
const palette = [
  new THREE.Color(0x7246ff),
  new THREE.Color(0x6ed4ff),
  new THREE.Color(0xce7fff),
  new THREE.Color(0x2f2968),
];

for (let i = 0; i < particleCount; i += 1) {
  const idx = i * 3;
  const r = THREE.MathUtils.randFloat(12, 70);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));

  positions[idx] = r * Math.sin(phi) * Math.cos(theta);
  positions[idx + 1] = r * Math.cos(phi) * 0.78;
  positions[idx + 2] = r * Math.sin(phi) * Math.sin(theta);

  const c = palette[(Math.random() * palette.length) | 0];
  colors[idx] = c.r;
  colors[idx + 1] = c.g;
  colors[idx + 2] = c.b;
}

particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const particleMat = new THREE.PointsMaterial({
  size: isMobile ? 0.09 : 0.07,
  vertexColors: true,
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});

const stars = new THREE.Points(particleGeo, particleMat);
scene.add(stars);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function showNodeInfo(intersection) {
  const data = nodeMeta.get(intersection.object.uuid);
  if (!data) {
    return;
  }

  infoEl.textContent = `Node ${data.id} | Layer radius ${data.layer} | Strand ${data.strand}. Knowledge paragraph slot is ready for this neuron.`;
  infoEl.classList.remove('hidden');
}

function onPointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(nodes, false);
  if (intersections.length > 0) {
    showNodeInfo(intersections[0]);
  } else {
    infoEl.classList.add('hidden');
  }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.6 : 2));
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

window.addEventListener('resize', resize);

const clock = new THREE.Clock();

function tick() {
  const elapsed = clock.getElapsedTime();

  stars.rotation.y += 0.00055;
  stars.rotation.x = Math.sin(elapsed * 0.08) * 0.04;

  for (let i = 0; i < strandLayers.length; i += 1) {
    const layer = strandLayers[i];
    layer.rotation.y += layer.userData.spinSpeed;
    layer.rotation.z = Math.sin(elapsed * (0.22 + i * 0.06)) * 0.08;
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const pulse = 1 + Math.sin(elapsed * 2.8 + i * 0.22) * 0.18;
    const s = node.userData.baseScale * pulse;
    node.scale.setScalar(s);
  }

  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}

tick();
