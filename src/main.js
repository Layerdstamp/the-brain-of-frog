// Using global THREE.js loaded via script tags
// window.THREE, window.OrbitControls, window.THREE.EffectComposer, etc. are available globally

if (typeof THREE === 'undefined') {
  document.body.innerHTML = '<h1>Error: Three.js failed to load</h1>';
  throw new Error('THREE.js is not defined');
}

console.log('THREE.js loaded successfully. Version:', THREE.version);

const canvas = document.querySelector('#scene');
const infoEl = document.querySelector('#node-info');

const NOTE_FILES = [
  './inside_the_mind_of_frog_chunked_notes.txt',
  './inside_the_mind_of_frog_second_relationship_layer.txt',
];

const noteState = {
  entries: [],
  byId: new Map(),
  currentNodeId: null,
  currentEntryIndex: -1,
  loadError: null,
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function gcd(a, b) {
  let left = a;
  let right = b;
  while (right !== 0) {
    const temp = left % right;
    left = right;
    right = temp;
  }
  return left;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugToTitle(path) {
  const fileName = path.split('/').pop().replace('.txt', '');
  return fileName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function splitBoxedSections(text, sourceLabel) {
  const normalized = text.replace(/\r/g, '').trim();
  const matches = [
    ...normalized.matchAll(/=+\n([^\n=][^\n]*)\n=+\n([\s\S]*?)(?=\n=+\n[^\n=][^\n]*\n=+\n|$)/g),
  ];

  return matches
    .map((match, index) => {
      const title = match[1].trim();
      const body = match[2].trim();
      if (!title || !body) {
        return null;
      }

      return {
        id: `${sourceLabel}-boxed-${index + 1}`,
        title,
        body,
        source: sourceLabel,
      };
    })
    .filter(Boolean);
}

function splitNodeSections(text, sourceLabel) {
  const normalized = text.replace(/\r/g, '').trim();
  const matches = [...normalized.matchAll(/(?:^|\n)Node:\s*(.+)\n([\s\S]*?)(?=\nNode:\s*|$)/g)];

  return matches
    .map((match, index) => {
      const title = match[1].trim();
      const body = match[2].trim();
      if (!title || !body) {
        return null;
      }

      return {
        id: `${sourceLabel}-node-${index + 1}`,
        title,
        body,
        source: sourceLabel,
      };
    })
    .filter(Boolean);
}

function splitParagraphSections(text, sourceLabel) {
  const normalized = text.replace(/\r/g, '');
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections = [];

  for (let i = 0; i < blocks.length - 1; i += 1) {
    const title = blocks[i];
    const body = blocks[i + 1];

    if (!title || !body) {
      continue;
    }

    if (title.includes('=') || title.length > 88 || title.split('\n').length > 1) {
      continue;
    }

    if (!/[A-Za-z]/.test(title) || body.length < 60) {
      continue;
    }

    sections.push({
      id: `${sourceLabel}-paragraph-${sections.length + 1}`,
      title,
      body,
      source: sourceLabel,
    });
  }

  return sections;
}

async function loadNoteEntries() {
  const loaded = await Promise.all(
    NOTE_FILES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
      }

      const text = await response.text();
      const sourceLabel = slugToTitle(path);
      return {
        boxed: splitBoxedSections(text, sourceLabel),
        nodes: splitNodeSections(text, sourceLabel),
        paragraphs: splitParagraphSections(text, sourceLabel),
      };
    }),
  );

  const entries = [];
  const seen = new Set();

  for (const source of loaded) {
    for (const entry of [...source.boxed, ...source.nodes, ...source.paragraphs]) {
      const key = `${entry.title}:::${entry.body.slice(0, 180)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push(entry);
    }
  }

  if (entries.length === 0) {
    entries.push({
      id: 'fallback-1',
      title: 'Inside The Mind Of Frog',
      source: 'Local Notes',
      body: 'Your text files are loaded, but no structured sections were detected. Keep using ====== separators and headings to map content into node cards.',
    });
  }

  noteState.entries = entries;
}

function assignEntriesToNodes() {
  noteState.byId.clear();

  if (noteState.entries.length === 0 || nodeRecords.length === 0) {
    return;
  }

  const applyNodeVisualState = (record) => {
    if (!record.meta.hasContent) {
      record.core.userData.baseScaleMultiplier = 0.76;
      record.core.material.color.copy(record.core.userData.baseColor).multiplyScalar(0.52);
      record.halo.material.opacity = 0.075;
      record.beacon.visible = false;
      return;
    }

    if (record.meta.read) {
      record.core.userData.baseScaleMultiplier = 0.95;
      record.core.material.color.copy(record.core.userData.contentColor).multiplyScalar(0.68);
      record.halo.material.opacity = 0.11;
      record.beacon.visible = false;
      return;
    }

    record.core.userData.baseScaleMultiplier = 1.18;
    record.core.material.color.copy(record.core.userData.contentColor);
    record.halo.material.opacity = 0.25;
    record.beacon.visible = true;
  };

  noteState.applyNodeVisualState = applyNodeVisualState;

  for (let i = 0; i < nodeRecords.length; i += 1) {
    const record = nodeRecords[i];
    record.meta.hasContent = false;
    record.meta.read = false;
    applyNodeVisualState(record);
  }

  const prioritized = [...nodeRecords].sort((left, right) => {
    const leftScore = hashString(`${left.meta.shell}|${left.meta.id}`) + left.meta.degree * 113;
    const rightScore = hashString(`${right.meta.shell}|${right.meta.id}`) + right.meta.degree * 113;
    return rightScore - leftScore;
  });

  const totalEntries = noteState.entries.length;
  const activeCount = Math.min(totalEntries, prioritized.length);
  let stride = 17;
  while (gcd(stride, totalEntries) !== 1) {
    stride += 2;
  }

  for (let i = 0; i < activeCount; i += 1) {
    const record = prioritized[i];
    const base = hashString(`${record.meta.shell}|${record.meta.id}|${record.meta.shellIndex}`);
    const entryIndex = (base + i * stride) % totalEntries;

    noteState.byId.set(record.meta.id, {
      ...noteState.entries[entryIndex],
      entryIndex,
    });

    record.meta.hasContent = true;
    applyNodeVisualState(record);
  }
}

const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const isMobile = window.matchMedia(MOBILE_QUERY).matches;
const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
const motionScale = prefersReducedMotion ? 0.4 : 1;
const UNIVERSE_SCALE = isMobile ? 1.46 : 2.1;
const LINK_OPACITY_SCALE = isMobile ? 0.72 : 0.62;
const EDGE_DENSITY = isMobile ? 0.52 : 0.46;

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

  float time = uTime * 0.14;
  vec3 pos = position;
  float radial = length(pos.xz);

  float swirl = time + aPhase + radial * 0.06;
  float drift  = sin(swirl) * 0.52 + sin(swirl * 2.3 + 1.1) * 0.18;
  float rise   = cos(time * 1.1 + aPhase + pos.y * 0.12) * 0.62
                + sin(time * 0.7 + aPhase * 1.4) * 0.22;

  pos.x += cos(aPhase * 0.9 + time * 0.8 + radial * 0.022) * drift;
  pos.y += rise;
  pos.z += sin(aPhase * 1.1 - time * 0.9 + radial * 0.028) * drift;

  vSpark = 0.5 + 0.5 * sin(uTime * 1.4 + aPhase * 5.8);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale * (340.0 / -mvPosition.z);
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

  float glow = exp(-dist * 3.6);
  float core = pow(max(0.0, 1.0 - sqrt(dist)), 3.4);
  vec3 color = vColor * (0.18 + glow * 0.62 + core * (0.4 + vSpark * 0.55));
  float alpha = min(1.0, glow * 0.22 + core * 0.48) * vAlpha;

  gl_FragColor = vec4(color, alpha);
}
`;

/* ─── Wisp particle trail shader ─────────────────────────────────────── */
const WISP_VERTEX_SHADER = `
uniform float uTime;
uniform float uScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
attribute float aSize;
attribute float aPhase;
attribute float aAlpha;
attribute float aCurveT;
attribute vec3 aScatter;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float tw = aCurveT;
  float sparkle = 0.52 + 0.48 * sin(uTime * 1.8 + aPhase * 11.0);

  vec3 pos = position + aScatter * (0.72 + 0.28 * sin(uTime * 0.68 + aPhase * 5.2));
  pos.x += sin(uTime * 0.44 + aPhase * 7.3) * 0.14;
  pos.y += cos(uTime * 0.38 + aPhase * 6.1) * 0.11;
  pos.z += sin(uTime * 0.52 + aPhase * 8.4 + 1.3) * 0.13;

  vColor = mix(uColorA, uColorB, tw) * (0.8 + 0.5 * sparkle);
  vAlpha = aAlpha * sparkle;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale * (300.0 / -mvPosition.z);
}
`;

const WISP_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float core = pow(max(0.0, 1.0 - sqrt(d)), 2.6);
  float halo = exp(-d * 2.8);
  float bright = core * 0.78 + halo * 0.34;
  gl_FragColor = vec4(vColor * (1.0 + core * 0.7), bright * vAlpha);
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.15 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.setClearColor(COLORS.void, 1);
renderer.domElement.style.touchAction = isMobile ? 'manipulation' : 'pan-y';

const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.enablePan = false;
controls.enableZoom = true;
controls.zoomSpeed = isMobile ? 0.38 : 0.6;
controls.minDistance = 6;
controls.maxDistance = 82;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI - 0.35;
controls.autoRotate = !prefersReducedMotion;
controls.autoRotateSpeed = isMobile ? 0.2 : 0.32;
controls.rotateSpeed = isMobile ? 0.45 : 1;
controls.target.set(0, 0.6, 0);

const composer = new window.THREE.EffectComposer(renderer);
composer.addPass(new window.THREE.RenderPass(scene, camera));

const bloomPass = new window.THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  isMobile ? 0.42 : 0.775,
  isMobile ? 0.26 : 0.42,
  0.08,
);
composer.addPass(bloomPass);

/* Shared time uniform referenced by every wisp trail material */
const wispSharedUniforms = { uTime: { value: 0 } };
const allWispPoints = [];

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
const nodeRecordById = new Map();
const nodeRecordByMesh = new Map();
const travelPulses = [];
const orbitRibbons = [];
const shellGroups = [];

const nodeGeometry = new THREE.SphereGeometry(isMobile ? 0.13 : 0.15, isMobile ? 10 : 14, isMobile ? 10 : 14);
const nodeHaloGeometry = new THREE.SphereGeometry(isMobile ? 0.28 : 0.32, isMobile ? 10 : 14, isMobile ? 10 : 14);
const nodeBeaconGeometry = new THREE.TorusGeometry(isMobile ? 0.26 : 0.3, isMobile ? 0.022 : 0.026, 8, 34);
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

  const beacon = new THREE.Mesh(
    nodeBeaconGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xd4f5ff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  beacon.visible = false;
  beacon.rotation.x = Math.PI * 0.5;

  const baseScale = THREE.MathUtils.randFloat(0.72, 1.34);
  core.scale.setScalar(baseScale);
  halo.scale.setScalar(baseScale * 1.95);
  group.add(beacon, halo, core);

  const meta = {
    id: nodeRecords.length + 1,
    shell: config.name,
    cluster: config.cluster,
    degree: 0,
    shellIndex: index,
    hasContent: false,
    read: false,
  };

  core.userData.baseScale = baseScale;
  core.userData.baseScaleMultiplier = 1;
  core.userData.baseColor = new THREE.Color(config.nodeColor);
  core.userData.contentColor = new THREE.Color(config.nodeColor).lerp(new THREE.Color(0xf2fbff), 0.34);
  core.userData.nodeGroup = group;
  core.userData.meta = meta;

  nodeMeshes.push(core);
  nodeRecordByMesh.set(core, null);
  universe.add(group);

  const record = {
    group,
    core,
    halo,
    beacon,
    position,
    meta,
    phase: Math.random() * Math.PI * 2,
  };

  nodeRecords.push(record);
  nodeRecordById.set(meta.id, record);
  nodeRecordByMesh.set(core, record);
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
  const wiggle = Math.sin(distance * 0.35 + sway * 0.6);
  const controlA = start.clone().lerp(end, 0.24)
    .addScaledVector(outward, lift + distance * 0.22)
    .addScaledVector(binormal, sway * (1.2 + wiggle * 0.28));
  const controlB = start.clone().lerp(end, 0.5)
    .addScaledVector(outward, lift * 1.18 + distance * 0.18)
    .addScaledVector(binormal, -sway * 0.52);
  const controlC = start.clone().lerp(end, 0.76)
    .addScaledVector(outward, lift * 0.88 + distance * 0.15)
    .addScaledVector(binormal, sway * 0.85);

  return new THREE.CatmullRomCurve3([start, controlA, controlB, controlC, end], false, 'centripetal', 0.7);
}

function createWispTrail(curve, colorA, colorB, scatter) {
  const COUNT = isMobile ? 22 : 42;
  const positions  = new Float32Array(COUNT * 3);
  const scatters   = new Float32Array(COUNT * 3);
  const sizes      = new Float32Array(COUNT);
  const phases     = new Float32Array(COUNT);
  const alphas     = new Float32Array(COUNT);
  const curveTVals = new Float32Array(COUNT);

  const up = new THREE.Vector3(0, 1, 0);
  const tangentScratch = new THREE.Vector3();
  const perpA = new THREE.Vector3();
  const perpB = new THREE.Vector3();

  for (let i = 0; i < COUNT; i += 1) {
    const t = i / (COUNT - 1);
    const pt = curve.getPoint(t);
    curve.getTangent(t, tangentScratch);
    tangentScratch.normalize();

    perpA.crossVectors(tangentScratch, up).normalize();
    if (perpA.lengthSq() < 0.001) {
      perpA.set(1, 0, 0);
    }
    perpB.crossVectors(tangentScratch, perpA).normalize();

    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * scatter;

    positions[i * 3]     = pt.x;
    positions[i * 3 + 1] = pt.y;
    positions[i * 3 + 2] = pt.z;

    scatters[i * 3]     = perpA.x * Math.cos(angle) * r + perpB.x * Math.sin(angle) * r;
    scatters[i * 3 + 1] = perpA.y * Math.cos(angle) * r + perpB.y * Math.sin(angle) * r;
    scatters[i * 3 + 2] = perpA.z * Math.cos(angle) * r + perpB.z * Math.sin(angle) * r;

    sizes[i]      = THREE.MathUtils.randFloat(1.1, isMobile ? 2.8 : 3.8);
    phases[i]     = Math.random();
    alphas[i]     = THREE.MathUtils.randFloat(0.28, 0.78);
    curveTVals[i] = t;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',  new THREE.BufferAttribute(positions,  3));
  geometry.setAttribute('aScatter',  new THREE.BufferAttribute(scatters,   3));
  geometry.setAttribute('aSize',     new THREE.BufferAttribute(sizes,      1));
  geometry.setAttribute('aPhase',    new THREE.BufferAttribute(phases,     1));
  geometry.setAttribute('aAlpha',    new THREE.BufferAttribute(alphas,     1));
  geometry.setAttribute('aCurveT',   new THREE.BufferAttribute(curveTVals, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:   wispSharedUniforms.uTime,
      uScale:  { value: isMobile ? 0.72 : 1.0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader:   WISP_VERTEX_SHADER,
    fragmentShader: WISP_FRAGMENT_SHADER,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  allWispPoints.push(points);
  return points;
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

  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: config.innerColor,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < records.length; i += 1) {
    const candidates = [];

    for (let j = 0; j < records.length; j += 1) {
      if (i === j) { continue; }
      const distanceSquared = records[i].position.distanceToSquared(records[j].position);
      if (distanceSquared <= config.maxDistance * config.maxDistance) {
        candidates.push({ index: j, distanceSquared });
      }
    }

    candidates.sort((left, right) => left.distanceSquared - right.distanceSquared);
    const neighborLimit = Math.min(Math.max(1, config.nearest - 1), candidates.length);

    for (let k = 0; k < neighborLimit; k += 1) {
      const j = candidates[k].index;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (edgeSet.has(key)) { continue; }

      const edgeSeed = ((i + 1) * 73856093) ^ ((j + 1) * 19349663);
      const edgeChance = ((edgeSeed >>> 0) % 1000) / 1000;
      if (edgeChance > EDGE_DENSITY) { continue; }

      edgeSet.add(key);
      records[i].meta.degree += 1;
      records[j].meta.degree += 1;

      const curve = createCurveBetween(
        records[i].position,
        records[j].position,
        config.archLift,
        THREE.MathUtils.randFloatSpread(config.sway),
      );

      const wispScatter = (config.filamentRadius ?? 0.032) * 18;
      shellGroup.add(createWispTrail(curve, config.edgeColor, config.innerColor, wispScatter));
      maybeAddPulse(curve, pulseMaterial, config.pulseChance);
    }
  }

  shellGroups.push(shellGroup);
  universe.add(shellGroup);
  return { records, config };
}

function connectShells(innerShell, outerShell, options) {
  const group = new THREE.Group();

  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: options.innerColor,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < outerShell.records.length; i += options.step) {
    const bridgeChance = (((i + 1) * 2654435761) >>> 0) % 1000 / 1000;
    if (bridgeChance > EDGE_DENSITY + 0.12) { continue; }

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

    if (!best) { continue; }

    from.meta.degree += 1;
    best.meta.degree += 1;

    const curve = createCurveBetween(from.position, best.position, options.archLift, THREE.MathUtils.randFloatSpread(options.sway));
    const wispScatter = (options.radius ?? 0.028) * 22;
    group.add(createWispTrail(curve, options.edgeColor, options.innerColor, wispScatter));
    maybeAddPulse(curve, pulseMaterial, options.pulseChance);
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

function getEntryForRecord(record, requestedEntryIndex = null) {
  if (noteState.entries.length === 0) {
    return {
      title: `Neuron ${record.meta.id}`,
      body: 'No notes are loaded yet for this node.',
      source: 'Local',
      entryIndex: -1,
    };
  }

  if (requestedEntryIndex !== null && requestedEntryIndex >= 0 && requestedEntryIndex < noteState.entries.length) {
    const requestedEntry = {
      ...noteState.entries[requestedEntryIndex],
      entryIndex: requestedEntryIndex,
    };
    noteState.byId.set(record.meta.id, requestedEntry);
    return requestedEntry;
  }

  const mapped = noteState.byId.get(record.meta.id);
  if (mapped) {
    return mapped;
  }

  const index = (record.meta.id - 1) % noteState.entries.length;
  const entry = {
    ...noteState.entries[index],
    entryIndex: index,
  };
  noteState.byId.set(record.meta.id, entry);
  return entry;
}

function hideNodeInfo() {
  noteState.currentNodeId = null;
  noteState.currentEntryIndex = -1;
  selectionRing.visible = false;
  infoEl.classList.add('hidden');
}

function renderCardBody(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return '<p class="node-paragraph">No content available for this thought node yet.</p>';
  }

  const visibleParagraphs = paragraphs.slice(0, 4);
  const body = visibleParagraphs
    .map((paragraph) => `<p class="node-paragraph">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');

  if (paragraphs.length <= visibleParagraphs.length) {
    return body;
  }

  return `${body}<p class="node-paragraph node-truncated">This node has more text. Use Next to keep exploring the universe archive.</p>`;
}

function renderNodeInfo(record, entry) {
  const hasNavigation = noteState.entries.length > 1;
  const indexDisplay = entry.entryIndex >= 0 ? `${entry.entryIndex + 1}/${noteState.entries.length}` : 'local';

  infoEl.innerHTML = `
    <div class="node-panel-head">
      <div>
        <div class="node-kicker">${escapeHtml(record.meta.shell)} · ${escapeHtml(entry.source)}</div>
        <strong>${escapeHtml(entry.title)}</strong>
        <span>Neuron ${record.meta.id} · ${escapeHtml(record.meta.cluster)} · ${record.meta.degree} live synapse links</span>
      </div>
      <button type="button" class="node-close" data-action="close" aria-label="Close thought card">Close</button>
    </div>
    <div class="node-panel-tools">
      <button type="button" class="node-jump" data-action="prev" ${hasNavigation ? '' : 'disabled'} aria-label="Open previous thought">Previous</button>
      <span class="node-index">${indexDisplay}</span>
      <button type="button" class="node-jump" data-action="next" ${hasNavigation ? '' : 'disabled'} aria-label="Open next thought">Next</button>
    </div>
    <div class="node-copy">${renderCardBody(entry.body)}</div>
  `;

  if (hasNavigation) {
    infoEl.innerHTML += '<p class="node-swipe-hint" aria-hidden="true">← swipe to explore →</p>';
  }
}

function pickContentRecord(intersections) {
  for (let i = 0; i < intersections.length; i += 1) {
    const record = nodeRecordByMesh.get(intersections[i].object);
    if (record && record.meta.hasContent) {
      return record;
    }
  }

  return null;
}

const nebulaShell = createNebulaShell();
scene.add(nebulaShell);

const coreGroup = createCore();
universe.add(coreGroup);

const innerDust = createDustField({
  count: isMobile ? 980 : 3200,
  innerRadius: 5.8,
  outerRadius: 36,
  sizeRange: isMobile ? [2.4, 6.6] : [2.8, 8.8],
  opacityRange: [0.16, 0.45],
  palette: [COLORS.violet, COLORS.cyan, COLORS.magenta, COLORS.ember],
  scale: isMobile ? 0.64 : 0.88,
});
scene.add(innerDust.points);

const deepDust = createDustField({
  count: isMobile ? 760 : 2400,
  innerRadius: 36,
  outerRadius: 128,
  sizeRange: isMobile ? [1.7, 4.1] : [2, 5.2],
  opacityRange: [0.09, 0.25],
  palette: [COLORS.violet, COLORS.indigo, COLORS.cyan],
  scale: isMobile ? 0.42 : 0.56,
});
scene.add(deepDust.points);

/* ─── Galaxy-arm nebula band ──────────────────────────────────────────── */
function createGalaxyArm(count, armAngle, colorHex) {
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const phases    = new Float32Array(count);
  const alphas    = new Float32Array(count);
  const clr = new THREE.Color(colorHex);

  for (let i = 0; i < count; i += 1) {
    const t      = i / count;
    const radius = THREE.MathUtils.lerp(16, 90, Math.pow(t, 0.6));
    const spread = THREE.MathUtils.lerp(2.2, 14, t);
    const theta  = armAngle + t * Math.PI * 3.4 + THREE.MathUtils.randFloatSpread(0.32);
    const phi    = Math.PI * 0.5 + THREE.MathUtils.randFloatSpread(spread * 0.08);

    positions[i * 3]     = radius * Math.sin(phi) * Math.cos(theta) + THREE.MathUtils.randFloatSpread(spread);
    positions[i * 3 + 1] = radius * Math.cos(phi) * THREE.MathUtils.randFloat(0.1, 0.42) + THREE.MathUtils.randFloatSpread(spread * 0.6);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) + THREE.MathUtils.randFloatSpread(spread);

    const fade = Math.pow(1 - t, 0.7);
    colors[i * 3]     = clr.r;
    colors[i * 3 + 1] = clr.g;
    colors[i * 3 + 2] = clr.b;

    sizes[i]  = THREE.MathUtils.randFloat(1.4, isMobile ? 4.8 : 7.2);
    phases[i] = Math.random() * Math.PI * 2;
    alphas[i] = THREE.MathUtils.randFloat(0.06, 0.22) * fade;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));

  const uniforms = { uTime: { value: 0 }, uScale: { value: isMobile ? 0.5 : 0.72 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { points: new THREE.Points(geo, mat), uniforms };
}

const armCount = isMobile ? 480 : 1100;
const galaxyArm1 = createGalaxyArm(armCount, 0.0,        0x6a3aff);
const galaxyArm2 = createGalaxyArm(armCount, Math.PI,    0x3a9fff);
const galaxyArm3 = createGalaxyArm(armCount, Math.PI * 0.65, 0xb03aff);
scene.add(galaxyArm1.points, galaxyArm2.points, galaxyArm3.points);

const shellConfigs = [
  {
    name: 'Mnemonic Seed',
    cluster: 'inner pulse',
    shellRadius: 2.9,
    count: isMobile ? 10 : 15,
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
    count: isMobile ? 14 : 22,
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
    count: isMobile ? 18 : 28,
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
    count: isMobile ? 22 : 34,
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

const shells = shellConfigs.map((config) => {
  const scaledConfig = {
    ...config,
    maxDistance: config.maxDistance * UNIVERSE_SCALE,
  };
  return buildShellNetwork(scaledConfig);
});

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
  radiusX: 12.5 * UNIVERSE_SCALE,
  radiusZ: 10.8 * UNIVERSE_SCALE,
  height: 2.1 * UNIVERSE_SCALE,
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
  radiusX: 14.2 * UNIVERSE_SCALE,
  radiusZ: 11.6 * UNIVERSE_SCALE,
  height: 2.8 * UNIVERSE_SCALE,
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
  radiusX: 16.6 * UNIVERSE_SCALE,
  radiusZ: 14.4 * UNIVERSE_SCALE,
  height: 3.6 * UNIVERSE_SCALE,
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
  const entry = getEntryForRecord(record);
  noteState.currentNodeId = record.meta.id;
  noteState.currentEntryIndex = entry.entryIndex;

  if (!record.meta.read) {
    record.meta.read = true;
    if (typeof noteState.applyNodeVisualState === 'function') {
      noteState.applyNodeVisualState(record);
    }
  }

  selectionRing.visible = true;
  selectionRing.position.copy(record.group.position);

  renderNodeInfo(record, entry);

  infoEl.classList.remove('hidden');
}

function stepCurrentEntry(delta) {
  if (noteState.currentNodeId === null || noteState.entries.length === 0) {
    return;
  }

  const record = nodeRecordById.get(noteState.currentNodeId);
  if (!record) {
    return;
  }

  const currentIndex = noteState.currentEntryIndex >= 0 ? noteState.currentEntryIndex : 0;
  const nextIndex = (currentIndex + delta + noteState.entries.length) % noteState.entries.length;
  const nextEntry = getEntryForRecord(record, nextIndex);

  noteState.currentEntryIndex = nextEntry.entryIndex;
  renderNodeInfo(record, nextEntry);
  infoEl.classList.remove('hidden');
}

/* ─── Unified pointer / touch interaction ─────────────────────────── */
const interactionState = { downX: 0, downY: 0, moved: false, pointerId: null };

function readClientXY(event) {
  if (event.changedTouches && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  return { x: event.clientX, y: event.clientY };
}

function setPointerFromXY(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x  =  ((x - rect.left) / rect.width)  * 2 - 1;
  pointer.y  = -((y - rect.top)  / rect.height)  * 2 + 1;
  pointerTarget.set(pointer.x, pointer.y);
}

function onCanvasPointerMove(event) {
  const { x, y } = readClientXY(event);
  setPointerFromXY(x, y);
  if (interactionState.pointerId !== null) {
    const dx = x - interactionState.downX;
    const dy = y - interactionState.downY;
    if (dx * dx + dy * dy > 36) interactionState.moved = true;
  }
  if (!isMobile) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(nodeMeshes, false);
    renderer.domElement.style.cursor = pickContentRecord(hits) ? 'pointer' : 'grab';
  }
}

function onCanvasPointerDown(event) {
  const { x, y } = readClientXY(event);
  interactionState.downX     = x;
  interactionState.downY     = y;
  interactionState.moved     = false;
  interactionState.pointerId = event.pointerId ?? 0;
  setPointerFromXY(x, y);
}

function onCanvasPointerUp(event) {
  if (interactionState.moved) { interactionState.pointerId = null; return; }
  interactionState.pointerId = null;
  const { x, y } = readClientXY(event);
  setPointerFromXY(x, y);
  raycaster.setFromCamera(pointer, camera);
  const record = pickContentRecord(raycaster.intersectObjects(nodeMeshes, false));
  if (record) { showNodeInfo(record); } else { hideNodeInfo(); }
}

renderer.domElement.addEventListener('pointermove',   onCanvasPointerMove,  { passive: true });
renderer.domElement.addEventListener('pointerdown',   onCanvasPointerDown,  { passive: true });
renderer.domElement.addEventListener('pointerup',     onCanvasPointerUp,    { passive: true });
renderer.domElement.addEventListener('pointercancel', () => { interactionState.pointerId = null; }, { passive: true });
renderer.domElement.addEventListener('pointerleave',  () => {
  pointerTarget.set(0, 0);
  if (!isMobile) renderer.domElement.style.cursor = 'grab';
});
if (!isMobile) renderer.domElement.style.cursor = 'grab';

/* Card panel: swipe left/right + button taps ─────────────────────── */
const panelSwipe = { startX: 0, startY: 0, active: false };
infoEl.addEventListener('touchstart', (event) => {
  event.stopPropagation();
  if (event.touches.length === 1) {
    panelSwipe.startX = event.touches[0].clientX;
    panelSwipe.startY = event.touches[0].clientY;
    panelSwipe.active = true;
  }
}, { passive: true });
infoEl.addEventListener('touchend', (event) => {
  event.stopPropagation();
  if (!panelSwipe.active) return;
  panelSwipe.active = false;
  const dx = event.changedTouches[0].clientX - panelSwipe.startX;
  const dy = event.changedTouches[0].clientY - panelSwipe.startY;
  if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    stepCurrentEntry(dx < 0 ? 1 : -1);
  }
}, { passive: true });
infoEl.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
infoEl.addEventListener('click', (event) => {
  const actionEl = event.target instanceof HTMLElement && event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.getAttribute('data-action');
  if (action === 'close') { hideNodeInfo();      return; }
  if (action === 'prev')  { stepCurrentEntry(-1); return; }
  if (action === 'next')  { stepCurrentEntry(1);  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape')     { hideNodeInfo();       return; }
  if (noteState.currentNodeId !== null && event.key === 'ArrowLeft')  { stepCurrentEntry(-1); return; }
  if (noteState.currentNodeId !== null && event.key === 'ArrowRight') { stepCurrentEntry(1);  }
});

const scrollState = {
  progress: 0,
};

function updateScrollProgress() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollState.progress = window.scrollY / maxScroll;
}

window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

async function initializeNotes() {
  try {
    await loadNoteEntries();
    assignEntriesToNodes();
  } catch (error) {
    noteState.loadError = error instanceof Error ? error.message : 'Unknown error';
    noteState.entries = [
      {
        id: 'load-error',
        title: 'Thought Archive Unavailable',
        source: 'Local Notes',
        body: `The note files could not be loaded: ${noteState.loadError}`,
        entryIndex: 0,
      },
    ];
    assignEntriesToNodes();
  }
}

initializeNotes();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.15 : 2));
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
  const desiredDistance = THREE.MathUtils.lerp(isMobile ? 44 : 52, isMobile ? 11.5 : 9.4, scrollProgress);
  const desiredTargetY = THREE.MathUtils.lerp(1.4, -0.7, scrollProgress);

  pointerLag.lerp(pointerTarget, isMobile ? 0.028 : 0.045);

  coreUniforms.uTime.value = targetTime;
  nebulaUniforms.uTime.value = targetTime;
  innerDust.uniforms.uTime.value = targetTime;
  deepDust.uniforms.uTime.value = targetTime;
  wispSharedUniforms.uTime.value = targetTime;
  galaxyArm1.uniforms.uTime.value = targetTime;
  galaxyArm2.uniforms.uTime.value = targetTime;
  galaxyArm3.uniforms.uTime.value = targetTime;

  const pLag = isMobile ? 0.05 : 0.14;
  universe.rotation.x = Math.sin(targetTime * 0.18) * 0.05 + pointerLag.y * pLag;
  universe.rotation.z = Math.cos(targetTime * 0.13) * 0.03 - pointerLag.x * (pLag * 0.57);

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
    const multiplier = record.core.userData.baseScaleMultiplier ?? 1;
    record.core.scale.setScalar(record.core.userData.baseScale * multiplier * pulse);
    record.halo.scale.setScalar(record.core.userData.baseScale * 1.95 * haloPulse);
    if (record.beacon.visible) {
      record.beacon.rotation.z += 0.018;
      const beaconScale = 0.86 + Math.sin(targetTime * 2.1 + record.phase) * 0.14;
      record.beacon.scale.setScalar(beaconScale);
    }
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
