import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.querySelector('#scene');
const infoEl = document.querySelector('#node-info');

const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const isMobile = window.matchMedia(MOBILE_QUERY).matches;
const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
const motionScale = prefersReducedMotion ? 0.4 : 1;

const COLORS = {
  void: new THREE.Color(0x02030a),
  violet: new THREE.Color(0x8f61ff),
  indigo: new THREE.Color(0x5346ff),
  cyan: new THREE.Color(0x6fd5ff),
  magenta: new THREE.Color(0xef7fff),
  ember: new THREE.Color(0xc89bff),
  haze: new THREE.Color(0x141334),
};

const DUST_VERTEX_SHADER = `
uniform float uTime;
uniform float uScale;
attribute float aSize;
attribute float aPhase;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vSpark;

void main() {
  vColor = color;
  vAlpha = aAlpha;

  float time = uTime * 0.22;
  vec3 pos = position;
  float radial = length(pos.xz);
  float drift = sin(time + aPhase + radial * 0.09) * 0.35;
  float rise = cos(time * 1.4 + aPhase + pos.y * 0.18) * 0.48;

  pos.x += cos(aPhase + time + radial * 0.03) * drift;
  pos.y += rise;
  pos.z += sin(aPhase * 1.2 - time + radial * 0.04) * drift;

  vSpark = 0.5 + 0.5 * sin(uTime * 1.8 + aPhase * 4.5);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale * (320.0 / -mvPosition.z);
}
`;

const DUST_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vAlpha;
varying float vSpark;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = dot(uv, uv);

  if (dist > 1.0) {
    discard;
  }

  float glow = exp(-dist * 4.8);
  float core = pow(max(0.0, 1.0 - dist * 1.3), 6.0);
  vec3 color = vColor * (0.25 + glow * 0.55 + core * (0.35 + vSpark * 0.5));
  float alpha = min(1.0, glow * 0.26 + core * 0.42) * vAlpha;

  gl_FragColor = vec4(color, alpha);
}
`;

const CORE_VERTEX_SHADER = `
uniform float uTime;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vWave;

void main() {
  float pulse = sin(position.y * 3.2 + uTime * 1.4) * 0.18;
  float curl = sin((position.x + position.z) * 2.8 - uTime * 1.1) * 0.12;
  float ripple = sin(position.x * 4.4 + uTime * 0.9) * 0.07;
  vec3 transformed = position + normal * (pulse + curl + ripple);

  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vWave = pulse + curl + ripple;

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const CORE_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vWave;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDir), 0.0), 2.8);
  float flow = 0.5 + 0.5 * sin(vWorldPosition.y * 1.8 + uTime * 1.25 + vWave * 4.0);
  float vein = 0.5 + 0.5 * sin((vWorldPosition.x + vWorldPosition.z) * 2.4 - uTime * 1.05);

  vec3 color = mix(uColorA, uColorB, flow);
  color = mix(color, uColorC, vein * 0.42);
  color += fresnel * vec3(1.0, 0.92, 1.28);

  gl_FragColor = vec4(color, 0.98);
}
`;

const NEBULA_VERTEX_SHADER = `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const NEBULA_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec3 vWorldPosition;

float layeredField(vec3 p, float time) {
  float a = sin(p.x * 0.034 + time * 0.08);
  float b = sin(p.y * 0.042 - time * 0.07);
  float c = sin((p.x + p.z) * 0.022 + time * 0.05);
  float d = sin(length(p.xz) * 0.056 - time * 0.09);
  return (a + b + c + d) * 0.25;
}

void main() {
  vec3 dir = normalize(vWorldPosition);
  float time = uTime * 0.18;
  float field = layeredField(vWorldPosition, time);
  float band = 0.5 + 0.5 * sin(atan(dir.z, dir.x) * 4.0 + dir.y * 6.0 + time * 1.8);
  float veil = smoothstep(-0.45, 0.85, field + band * 0.4);
  float flare = smoothstep(0.12, 1.0, 0.5 + 0.5 * sin(length(vWorldPosition.xz) * 0.03 - time * 2.0));

  vec3 color = mix(uColorA, uColorB, veil);
  color = mix(color, uColorC, flare * 0.48);
  color += vec3(0.05, 0.03, 0.12) * pow(max(field + 0.25, 0.0), 2.0);

  gl_FragColor = vec4(color, 1.0);
}
`;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03030b, isMobile ? 0.017 : 0.013);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 2.2, isMobile ? 22 : 18);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.setClearColor(COLORS.void, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.enablePan = false;
controls.enableZoom = false;
controls.minDistance = 7;
controls.maxDistance = 34;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI - 0.35;
controls.autoRotate = !prefersReducedMotion;
controls.autoRotateSpeed = isMobile ? 0.24 : 0.32;
controls.target.set(0, 0.6, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.55 : 0.775,
  isMobile ? 0.34 : 0.42,
  0.08,
);
composer.addPass(bloomPass);

const universe = new THREE.Group();
scene.add(universe);

const ambient = new THREE.AmbientLight(0x6170d9, 0.4);
const hemi = new THREE.HemisphereLight(0x8ba7ff, 0x0b061a, 0.9);
const key = new THREE.PointLight(0xc57dff, 1.9, 120, 1.7);
const rim = new THREE.PointLight(0x58d6ff, 1.5, 120, 1.8);
const underside = new THREE.PointLight(0x6e46ff, 0.9, 100, 1.7);
key.position.set(10, 8, 7);
rim.position.set(-12, -5, -10);
underside.position.set(0, -10, 0);
scene.add(ambient, hemi, key, rim, underside);

const pointerTarget = new THREE.Vector2();
const pointerLag = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const nodeMeshes = [];
const nodeRecords = [];
const travelPulses = [];
const orbitRibbons = [];
const shellGroups = [];

const nodeGeometry = new THREE.SphereGeometry(isMobile ? 0.13 : 0.15, isMobile ? 10 : 14, isMobile ? 10 : 14);
const nodeHaloGeometry = new THREE.SphereGeometry(isMobile ? 0.28 : 0.32, isMobile ? 10 : 14, isMobile ? 10 : 14);
const pulseGeometry = new THREE.SphereGeometry(isMobile ? 0.06 : 0.075, 10, 10);
const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.72, 0.9, 56),
  new THREE.MeshBasicMaterial({
    color: 0xeab8ff,
    transparent: true,
    opacity: 0.43,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
selectionRing.visible = false;
selectionRing.renderOrder = 6;
universe.add(selectionRing);

const coreUniforms = {
  uTime: { value: 0 },
  uColorA: { value: COLORS.violet.clone() },
  uColorB: { value: COLORS.cyan.clone() },
  uColorC: { value: COLORS.magenta.clone() },
};

const nebulaUniforms = {
  uTime: { value: 0 },
  uColorA: { value: new THREE.Color(0x04050e) },
  uColorB: { value: new THREE.Color(0x101632) },
  uColorC: { value: new THREE.Color(0x24134c) },
};

function createDustField({ count, innerRadius, outerRadius, sizeRange, opacityRange, palette, scale }) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const idx = i * 3;
    const radius = THREE.MathUtils.randFloat(innerRadius, outerRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));

    positions[idx] = radius * Math.sin(phi) * Math.cos(theta);
    positions[idx + 1] = radius * Math.cos(phi) * THREE.MathUtils.randFloat(0.52, 0.92);
    positions[idx + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const color = palette[(Math.random() * palette.length) | 0];
    colors[idx] = color.r;
    colors[idx + 1] = color.g;
    colors[idx + 2] = color.b;

    sizes[i] = THREE.MathUtils.randFloat(sizeRange[0], sizeRange[1]);
    phases[i] = Math.random() * Math.PI * 2;
    alphas[i] = THREE.MathUtils.randFloat(opacityRange[0], opacityRange[1]);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: scale },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  return { points, uniforms };
}

function createNebulaShell() {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(140, 48, 48),
    new THREE.ShaderMaterial({
      uniforms: nebulaUniforms,
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );

  return shell;
}

function createCore() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.5, isMobile ? 3 : 4),
    new THREE.ShaderMaterial({
      uniforms: coreUniforms,
      vertexShader: CORE_VERTEX_SHADER,
      fragmentShader: CORE_FRAGMENT_SHADER,
      transparent: true,
    }),
  );

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(3.3, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0x8d62ff,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.9, 1),
    new THREE.MeshBasicMaterial({
      color: 0x71d3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const outerHaloA = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5.2, 1),
    new THREE.MeshBasicMaterial({
      color: 0xc67bff,
      wireframe: true,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const outerHaloB = new THREE.Mesh(
    new THREE.IcosahedronGeometry(6.8, 1),
    new THREE.MeshBasicMaterial({
      color: 0x64d2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  group.add(glow, shell, wire, outerHaloA, outerHaloB);
  group.userData = { shell, glow, wire, outerHaloA, outerHaloB };
  return group;
}

function brainWarp(base, config, seed) {
  const warped = base.clone();
  const hemisphere = Math.tanh(warped.x * 1.4) * config.hemisphereShift;
  const groove = Math.exp(-Math.pow(warped.x * 2.1, 2)) * config.cleftDepth;
  const ripple = Math.sin(seed * 1.7 + warped.y * 5.2) * config.verticalRipple;

  warped.x = warped.x * config.xScale + hemisphere;
  warped.y = warped.y * config.yScale + ripple - groove * (0.4 + Math.abs(warped.y));
  warped.z = warped.z * config.zScale;
  return warped;
}

function generateShellPoints(config) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < config.count; i += 1) {
    const t = config.count === 1 ? 0.5 : i / (config.count - 1);
    const y = 1 - t * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i + config.seed;
    const base = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);

    const radialPulse = 1 + Math.sin(theta * 2.8 + config.seed) * 0.08 + Math.cos(theta * 1.6 - y * 4.0) * 0.06;
    base.multiplyScalar(config.shellRadius * radialPulse);

    const normalized = base.clone().normalize();
    const warped = brainWarp(base.multiplyScalar(1 / config.shellRadius), config, theta).multiplyScalar(config.shellRadius);
    warped.addScaledVector(normalized, Math.sin(theta * 4.3 + y * 6.0 + config.seed) * config.jitter);
    points.push(warped);
  }

  return points;
}

function createNodeRecord(position, config, index) {
  const group = new THREE.Group();
  group.position.copy(position);

  const halo = new THREE.Mesh(
    nodeHaloGeometry,
    new THREE.MeshBasicMaterial({
      color: config.haloColor,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const core = new THREE.Mesh(
    nodeGeometry,
    new THREE.MeshBasicMaterial({ color: config.nodeColor }),
  );

  const baseScale = THREE.MathUtils.randFloat(0.72, 1.34);
  core.scale.setScalar(baseScale);
  halo.scale.setScalar(baseScale * 1.95);
  group.add(halo, core);

  const meta = {
    id: nodeRecords.length + 1,
    shell: config.name,
    cluster: config.cluster,
    degree: 0,
    shellIndex: index,
  };

  core.userData.baseScale = baseScale;
  core.userData.nodeGroup = group;
  core.userData.meta = meta;

  nodeMeshes.push(core);
  universe.add(group);

  const record = {
    group,
    core,
    halo,
    position,
    meta,
    phase: Math.random() * Math.PI * 2,
  };

  nodeRecords.push(record);
  return record;
}

function createCurveBetween(start, end, lift, sway) {
  const midpoint = start.clone().lerp(end, 0.5);
  const outward = midpoint.clone().normalize();
  const tangent = end.clone().sub(start).normalize();
  let binormal = new THREE.Vector3().crossVectors(outward, tangent);

  if (binormal.lengthSq() < 0.0001) {
    binormal = new THREE.Vector3(0, 1, 0);
  }

  binormal.normalize();
  const distance = start.distanceTo(end);
  const controlA = start.clone().lerp(end, 0.28)
    .addScaledVector(outward, lift + distance * 0.12)
    .addScaledVector(binormal, sway);
  const controlB = start.clone().lerp(end, 0.72)
    .addScaledVector(outward, lift * 0.84 + distance * 0.1)
    .addScaledVector(binormal, -sway * 0.72);

  return new THREE.CatmullRomCurve3([start, controlA, controlB, end], false, 'catmullrom', 0.12);
}

function createFilament(curve, config, materials) {
  const group = new THREE.Group();
  const tubularSegments = isMobile ? config.segmentsMobile : config.segmentsDesktop;
  const filamentRadius = config.filamentRadius ?? config.radius;
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, tubularSegments, filamentRadius, 5, false),
    materials.outer,
  );
  const trace = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(tubularSegments * 2)),
    materials.inner,
  );

  group.add(tube, trace);
  return group;
}

function maybeAddPulse(curve, material, probability) {
  if (Math.random() > probability) {
    return;
  }

  const pulse = new THREE.Mesh(pulseGeometry, material);
  pulse.renderOrder = 5;
  universe.add(pulse);
  travelPulses.push({
    mesh: pulse,
    curve,
    speed: THREE.MathUtils.randFloat(0.032, 0.068) * motionScale,
    offset: Math.random(),
    scale: THREE.MathUtils.randFloat(0.9, 1.7),
  });
}

function buildShellNetwork(config) {
  const shellGroup = new THREE.Group();
  const points = generateShellPoints(config);
  const records = points.map((point, index) => createNodeRecord(point, config, index));
  const edgeSet = new Set();

  const materials = {
    outer: new THREE.MeshBasicMaterial({
      color: config.edgeColor,
      transparent: true,
      opacity: config.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    inner: new THREE.LineBasicMaterial({
      color: config.innerColor,
      transparent: true,
      opacity: config.innerOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    pulse: new THREE.MeshBasicMaterial({
      color: config.innerColor,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };

  for (let i = 0; i < records.length; i += 1) {
    const candidates = [];

    for (let j = 0; j < records.length; j += 1) {
      if (i === j) {
        continue;
      }

      const distanceSquared = records[i].position.distanceToSquared(records[j].position);
      if (distanceSquared <= config.maxDistance * config.maxDistance) {
        candidates.push({ index: j, distanceSquared });
      }
    }

    candidates.sort((left, right) => left.distanceSquared - right.distanceSquared);

    for (let k = 0; k < Math.min(config.nearest, candidates.length); k += 1) {
      const j = candidates[k].index;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;

      if (edgeSet.has(key)) {
        continue;
      }

      edgeSet.add(key);
      records[i].meta.degree += 1;
      records[j].meta.degree += 1;

      const curve = createCurveBetween(
        records[i].position,
        records[j].position,
        config.archLift,
        THREE.MathUtils.randFloatSpread(config.sway),
      );

      shellGroup.add(createFilament(curve, config, materials));
      maybeAddPulse(curve, materials.pulse, config.pulseChance);
    }
  }

  shellGroups.push(shellGroup);
  universe.add(shellGroup);
  return { records, config };
}

function connectShells(innerShell, outerShell, options) {
  const group = new THREE.Group();
  const materials = {
    outer: new THREE.MeshBasicMaterial({
      color: options.edgeColor,
      transparent: true,
      opacity: options.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    inner: new THREE.LineBasicMaterial({
      color: options.innerColor,
      transparent: true,
      opacity: options.innerOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    pulse: new THREE.MeshBasicMaterial({
      color: options.innerColor,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };

  for (let i = 0; i < outerShell.records.length; i += options.step) {
    const from = outerShell.records[i];
    let best = null;
    let bestDistance = Infinity;

    for (let j = 0; j < innerShell.records.length; j += 1) {
      const to = innerShell.records[j];
      const distanceSquared = from.position.distanceToSquared(to.position);

      if (distanceSquared < bestDistance) {
        bestDistance = distanceSquared;
        best = to;
      }
    }

    if (!best) {
      continue;
    }

    from.meta.degree += 1;
    best.meta.degree += 1;

    const curve = createCurveBetween(from.position, best.position, options.archLift, THREE.MathUtils.randFloatSpread(options.sway));
    group.add(createFilament(curve, options, materials));
    maybeAddPulse(curve, materials.pulse, options.pulseChance);
  }

  shellGroups.push(group);
  universe.add(group);
}

function createOrbitRibbon(config) {
  const points = [];
  const count = isMobile ? 64 : 96;

  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const angle = t * Math.PI * 2;
    const radiusPulse = 1 + Math.sin(angle * config.turns + config.phase) * 0.08;
    const point = new THREE.Vector3(
      Math.cos(angle + config.phase) * config.radiusX * radiusPulse,
      Math.sin(angle * 2.0 + config.phase * 1.7) * config.height,
      Math.sin(angle - config.phase * 0.35) * config.radiusZ * radiusPulse,
    );
    points.push(point);
  }

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.1);
  const ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(curve, isMobile ? 88 : 136, config.radius, 6, true),
    new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  ribbon.rotation.set(config.rotationX, config.rotationY, config.rotationZ);
  ribbon.userData = { spin: config.spin };
  orbitRibbons.push(ribbon);
  universe.add(ribbon);
}

const nebulaShell = createNebulaShell();
scene.add(nebulaShell);

const coreGroup = createCore();
universe.add(coreGroup);

const innerDust = createDustField({
  count: isMobile ? 1800 : 3200,
  innerRadius: 5.8,
  outerRadius: 36,
  sizeRange: isMobile ? [2.4, 6.6] : [2.8, 8.8],
  opacityRange: [0.16, 0.45],
  palette: [COLORS.violet, COLORS.cyan, COLORS.magenta, COLORS.ember],
  scale: isMobile ? 0.64 : 0.88,
});
scene.add(innerDust.points);

const deepDust = createDustField({
  count: isMobile ? 1300 : 2400,
  innerRadius: 36,
  outerRadius: 128,
  sizeRange: isMobile ? [1.7, 4.1] : [2, 5.2],
  opacityRange: [0.09, 0.25],
  palette: [COLORS.violet, COLORS.indigo, COLORS.cyan],
  scale: isMobile ? 0.42 : 0.56,
});
scene.add(deepDust.points);

const shellConfigs = [
  {
    name: 'Mnemonic Seed',
    cluster: 'inner pulse',
    shellRadius: 2.9,
    count: isMobile ? 14 : 22,
    nearest: 2,
    maxDistance: 4.8,
    archLift: 0.5,
    sway: 0.45,
    filamentRadius: isMobile ? 0.028 : 0.032,
    edgeColor: 0x9468ff,
    innerColor: 0xe6c8ff,
    opacity: 0.23,
    innerOpacity: 0.62,
    pulseChance: 0.26,
    segmentsMobile: 16,
    segmentsDesktop: 22,
    nodeColor: 0xc892ff,
    haloColor: 0xb16eff,
    xScale: 1.1,
    yScale: 0.8,
    zScale: 1.0,
    hemisphereShift: 0.18,
    cleftDepth: 0.08,
    verticalRipple: 0.05,
    jitter: 0.18,
    seed: 0.6,
  },
  {
    name: 'Dream Cortex',
    cluster: 'braided memory',
    shellRadius: 4.7,
    count: isMobile ? 20 : 30,
    nearest: 3,
    maxDistance: 6.5,
    archLift: 0.9,
    sway: 0.75,
    filamentRadius: isMobile ? 0.032 : 0.038,
    edgeColor: 0x6fd3ff,
    innerColor: 0xdaf8ff,
    opacity: 0.21,
    innerOpacity: 0.54,
    pulseChance: 0.22,
    segmentsMobile: 18,
    segmentsDesktop: 26,
    nodeColor: 0x80d7ff,
    haloColor: 0x60d2ff,
    xScale: 1.22,
    yScale: 0.82,
    zScale: 1.06,
    hemisphereShift: 0.25,
    cleftDepth: 0.11,
    verticalRipple: 0.08,
    jitter: 0.24,
    seed: 1.8,
  },
  {
    name: 'Signal Bloom',
    cluster: 'astral lattice',
    shellRadius: 6.8,
    count: isMobile ? 28 : 42,
    nearest: 3,
    maxDistance: 8.2,
    archLift: 1.2,
    sway: 1.05,
    filamentRadius: isMobile ? 0.038 : 0.046,
    edgeColor: 0xe378ff,
    innerColor: 0xffd4fb,
    opacity: 0.19,
    innerOpacity: 0.48,
    pulseChance: 0.16,
    segmentsMobile: 20,
    segmentsDesktop: 28,
    nodeColor: 0xf191ff,
    haloColor: 0xd76cff,
    xScale: 1.28,
    yScale: 0.84,
    zScale: 1.1,
    hemisphereShift: 0.31,
    cleftDepth: 0.12,
    verticalRipple: 0.1,
    jitter: 0.36,
    seed: 2.7,
  },
  {
    name: 'Cosmic Fringe',
    cluster: 'outer myth',
    shellRadius: 9.3,
    count: isMobile ? 34 : 52,
    nearest: 2,
    maxDistance: 9.6,
    archLift: 1.5,
    sway: 1.25,
    filamentRadius: isMobile ? 0.042 : 0.052,
    edgeColor: 0x5a50ff,
    innerColor: 0x9bcdff,
    opacity: 0.15,
    innerOpacity: 0.42,
    pulseChance: 0.12,
    segmentsMobile: 18,
    segmentsDesktop: 24,
    nodeColor: 0xa296ff,
    haloColor: 0x7467ff,
    xScale: 1.32,
    yScale: 0.86,
    zScale: 1.13,
    hemisphereShift: 0.34,
    cleftDepth: 0.13,
    verticalRipple: 0.12,
    jitter: 0.46,
    seed: 3.6,
  },
];

const shells = shellConfigs.map((config) => buildShellNetwork(config));

connectShells(shells[0], shells[1], {
  step: isMobile ? 2 : 2,
  archLift: 0.55,
  sway: 0.55,
  radius: isMobile ? 0.024 : 0.028,
  edgeColor: 0xb478ff,
  innerColor: 0xf0d7ff,
  opacity: 0.2,
  innerOpacity: 0.48,
  pulseChance: 0.24,
  segmentsMobile: 16,
  segmentsDesktop: 22,
});

connectShells(shells[1], shells[2], {
  step: isMobile ? 3 : 3,
  archLift: 0.84,
  sway: 0.8,
  radius: isMobile ? 0.026 : 0.032,
  edgeColor: 0x79ceff,
  innerColor: 0xd6f3ff,
  opacity: 0.16,
  innerOpacity: 0.4,
  pulseChance: 0.17,
  segmentsMobile: 18,
  segmentsDesktop: 24,
});

connectShells(shells[2], shells[3], {
  step: isMobile ? 4 : 4,
  archLift: 1.2,
  sway: 1.05,
  radius: isMobile ? 0.028 : 0.034,
  edgeColor: 0xcf74ff,
  innerColor: 0xffcdf7,
  opacity: 0.13,
  innerOpacity: 0.34,
  pulseChance: 0.14,
  segmentsMobile: 18,
  segmentsDesktop: 24,
});

createOrbitRibbon({
  radiusX: 12.5,
  radiusZ: 10.8,
  height: 2.1,
  turns: 3,
  phase: 0.4,
  radius: isMobile ? 0.042 : 0.056,
  color: 0x7c68ff,
  opacity: 0.18,
  rotationX: 0.6,
  rotationY: 0.1,
  rotationZ: -0.25,
  spin: 0.0021,
});

createOrbitRibbon({
  radiusX: 14.2,
  radiusZ: 11.6,
  height: 2.8,
  turns: 4,
  phase: 2.2,
  radius: isMobile ? 0.034 : 0.046,
  color: 0x62d7ff,
  opacity: 0.15,
  rotationX: -0.45,
  rotationY: 0.8,
  rotationZ: 0.2,
  spin: -0.0016,
});

createOrbitRibbon({
  radiusX: 16.6,
  radiusZ: 14.4,
  height: 3.6,
  turns: 5,
  phase: 4.1,
  radius: isMobile ? 0.028 : 0.04,
  color: 0xec83ff,
  opacity: 0.12,
  rotationX: 0.2,
  rotationY: -0.35,
  rotationZ: 0.85,
  spin: 0.0012,
});

function showNodeInfo(record) {
  selectionRing.visible = true;
  selectionRing.position.copy(record.group.position);

  infoEl.innerHTML = `
    <div class="node-kicker">${record.meta.shell}</div>
    <strong>Neuron ${record.meta.id}</strong>
    <span>${record.meta.cluster} · ${record.meta.degree} live synapse links</span>
    <p>Knowledge paragraph slot is armed here. This node can open one of your future text fragments inside the brain universe.</p>
  `;
  infoEl.classList.remove('hidden');
}

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / rect.width;
  const localY = (event.clientY - rect.top) / rect.height;

  pointer.x = localX * 2 - 1;
  pointer.y = -(localY * 2 - 1);
  pointerTarget.set(pointer.x, pointer.y);
}

function onPointerMove(event) {
  updatePointerFromEvent(event);
}

function onPointerDown(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(nodeMeshes, false);

  if (intersections.length > 0) {
    const record = nodeRecords.find((entry) => entry.core === intersections[0].object);
    if (record) {
      showNodeInfo(record);
      return;
    }
  }

  selectionRing.visible = false;
  infoEl.classList.add('hidden');
}

renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
renderer.domElement.addEventListener('pointerleave', () => pointerTarget.set(0, 0));

const scrollState = {
  progress: 0,
};

function updateScrollProgress() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollState.progress = window.scrollY / maxScroll;
}

window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
}

window.addEventListener('resize', resize);

const clock = new THREE.Clock();

function tick() {
  const elapsed = clock.getElapsedTime();
  const targetTime = elapsed * motionScale;
  const scrollProgress = scrollState.progress;
  const desiredDistance = THREE.MathUtils.lerp(isMobile ? 24 : 19, isMobile ? 9.5 : 7.8, scrollProgress);
  const desiredTargetY = THREE.MathUtils.lerp(0.7, -0.2, scrollProgress);

  pointerLag.lerp(pointerTarget, 0.045);

  coreUniforms.uTime.value = targetTime;
  nebulaUniforms.uTime.value = targetTime;
  innerDust.uniforms.uTime.value = targetTime;
  deepDust.uniforms.uTime.value = targetTime;

  universe.rotation.x = Math.sin(targetTime * 0.18) * 0.05 + pointerLag.y * 0.14;
  universe.rotation.z = Math.cos(targetTime * 0.13) * 0.03 - pointerLag.x * 0.08;

  innerDust.points.rotation.y = targetTime * 0.045;
  innerDust.points.rotation.z = Math.sin(targetTime * 0.12) * 0.08;
  deepDust.points.rotation.y = -targetTime * 0.016;
  nebulaShell.rotation.y = targetTime * 0.006;

  const { shell, glow, wire, outerHaloA, outerHaloB } = coreGroup.userData;
  shell.rotation.y = targetTime * 0.22;
  shell.rotation.x = Math.sin(targetTime * 0.33) * 0.2;
  glow.scale.setScalar(1 + Math.sin(targetTime * 1.1) * 0.06);
  wire.rotation.y = -targetTime * 0.16;
  wire.rotation.z = targetTime * 0.12;
  outerHaloA.rotation.x = targetTime * 0.08;
  outerHaloA.rotation.y = -targetTime * 0.06;
  outerHaloB.rotation.x = -targetTime * 0.05;
  outerHaloB.rotation.z = targetTime * 0.04;

  for (let i = 0; i < shellGroups.length; i += 1) {
    const group = shellGroups[i];
    const direction = i % 2 === 0 ? 1 : -1;
    group.rotation.y += direction * 0.0008 * motionScale;
    group.rotation.z = Math.sin(targetTime * (0.18 + i * 0.02)) * 0.035;
  }

  for (let i = 0; i < orbitRibbons.length; i += 1) {
    const ribbon = orbitRibbons[i];
    ribbon.rotation.y += ribbon.userData.spin * motionScale;
    ribbon.rotation.x += ribbon.userData.spin * 0.4 * motionScale;
  }

  for (let i = 0; i < nodeRecords.length; i += 1) {
    const record = nodeRecords[i];
    const pulse = 1 + Math.sin(targetTime * 2.6 + record.phase + record.meta.degree * 0.14) * 0.2;
    const haloPulse = 1 + Math.sin(targetTime * 1.8 + record.phase) * 0.14;
    record.core.scale.setScalar(record.core.userData.baseScale * pulse);
    record.halo.scale.setScalar(record.core.userData.baseScale * 1.95 * haloPulse);
  }

  for (let i = 0; i < travelPulses.length; i += 1) {
    const pulse = travelPulses[i];
    const t = (targetTime * pulse.speed + pulse.offset) % 1;
    pulse.mesh.position.copy(pulse.curve.getPointAt(t));
    pulse.mesh.scale.setScalar((0.8 + Math.sin(targetTime * 4.5 + i) * 0.18) * pulse.scale);
  }

  if (selectionRing.visible) {
    selectionRing.lookAt(camera.position);
    selectionRing.rotation.z += 0.02;
    const ringScale = 1 + Math.sin(targetTime * 3.2) * 0.12;
    selectionRing.scale.setScalar(ringScale);
  }

  controls.target.x = pointerLag.x * 0.55;
  controls.target.y = desiredTargetY + pointerLag.y * 0.24;
  controls.update();

  const cameraOffset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(desiredDistance);
  camera.position.copy(controls.target).add(cameraOffset);

  composer.render();
  requestAnimationFrame(tick);
}

tick();
