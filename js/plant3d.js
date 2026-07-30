// Procedural tomato-plant digital twin — real-time three.js geometry driven by
// the simulator state. Morphology, chlorosis, necrosis, lesions, chewing damage,
// wilt, defoliation, fruit ripening / cracking / blossom-end rot are all
// parameters of this model, not baked art.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MAX_NODES = 22, TRUSS_EVERY = 3, FRUIT_SLOTS = 3, FLOWER_SLOTS = 4;
const GOLDEN = 2.3999632;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const RIPE_STOPS = [
  [0.00, 0x3f7a2e], [0.22, 0x6d9a3a], [0.40, 0xb9bd4c],
  [0.55, 0xe0952c], [0.70, 0xdc5f28], [0.85, 0xcf2a18], [1.00, 0xb81410]
];
function rampColor(t) {
  const x = clamp01(t);
  for (let i = 0; i < RIPE_STOPS.length - 1; i++) {
    const [a, ca] = RIPE_STOPS[i], [b, cb] = RIPE_STOPS[i + 1];
    if (x <= b) return new THREE.Color(ca).lerp(new THREE.Color(cb), (x - a) / (b - a));
  }
  return new THREE.Color(RIPE_STOPS[RIPE_STOPS.length - 1][1]);
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ── leaflet material: stress symptoms live in the shader ─────────────────── */
function leafMaterial(tex, ghost) {
  if (ghost) return new THREE.MeshBasicMaterial({ color: 0x9184d9, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide, map: tex, alphaTest: 0.5 });
  const m = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.0,
    color: new THREE.Color(0x9fbf86)
  });
  m.userData.u = {
    uNecro: { value: 0 }, uChloro: { value: 0 }, uLesion: { value: 0 },
    uChew: { value: 0 }, uSeed: { value: Math.random() * 10 }
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = 'varying vec2 vPUv;\n' + s.vertexShader.replace(
      '#include <begin_vertex>', 'vPUv = uv;\n#include <begin_vertex>');
    s.fragmentShader = 'varying vec2 vPUv;\nuniform float uNecro;uniform float uChloro;uniform float uLesion;uniform float uChew;uniform float uSeed;\n' +
      'float h21(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}\n' +
      s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float ed = clamp((length((vPUv - 0.5) * 2.0) - 0.35) / 0.62, 0.0, 1.0);
        if (uChew > 0.001) {
          vec2 cg = floor(vPUv * 11.0);
          if (ed > 0.42 && h21(cg + uSeed * 3.7) < uChew * 0.5) discard;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.63, 0.57, 0.16), clamp(uChloro, 0.0, 1.0) * (0.30 + 0.70 * ed));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.16, 0.07), clamp(uNecro, 0.0, 1.0) * pow(ed, 1.25));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.21, 0.10), clamp(uNecro - 0.55, 0.0, 1.0) * 1.4);
        if (uLesion > 0.001) {
          vec2 g = vPUv * 6.0; vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
          float hs = h21(cell + uSeed);
          if (hs < uLesion * 0.75) {
            float d = length(f + (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.5);
            float core = 1.0 - smoothstep(0.10, 0.20, d);
            float halo = (1.0 - smoothstep(0.20, 0.30, d)) * 0.55;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.11, 0.05), core);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.42, 0.13), halo * 0.7);
          }
        }`);
  };
  return m;
}

function fruitMaterial(ghost) {
  if (ghost) return new THREE.MeshBasicMaterial({ color: 0x9184d9, transparent: true, opacity: 0.08, depthWrite: false });
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x4f8c3c), roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.22, sheen: 0.3 });
  m.userData.u = { uCrack: { value: 0 }, uRot: { value: 0 }, uSeed: { value: Math.random() * 10 } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = 'varying vec2 vPUv;\n' + s.vertexShader.replace(
      '#include <begin_vertex>', 'vPUv = uv;\n#include <begin_vertex>');
    s.fragmentShader = 'varying vec2 vPUv;\nuniform float uCrack;uniform float uRot;uniform float uSeed;\n' +
      s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float rib = 0.5 + 0.5 * cos(vPUv.x * 50.2831);
        diffuseColor.rgb *= 0.94 + 0.06 * rib;
        if (uRot > 0.001) {
          float b = 1.0 - smoothstep(0.02, 0.26, vPUv.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.10, 0.07), b * uRot);
        }
        if (uCrack > 0.001) {
          float band = smoothstep(0.55, 0.95, vPUv.y);
          float lines = smoothstep(0.86, 1.0, sin(vPUv.x * 44.0 + uSeed * 6.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.15, 0.10), band * lines * uCrack);
        }`);
  };
  return m;
}

/* ── one plant: node chain so wilt, sway and growth all inherit ───────────── */
function buildPlant(tex, ghost, seed) {
  const rand = rng(seed);
  const stemMat = ghost
    ? new THREE.MeshBasicMaterial({ color: 0x9184d9, transparent: true, opacity: 0.085, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x87a05c, roughness: 0.8 });
  const pedMat = ghost ? stemMat : new THREE.MeshStandardMaterial({ color: 0x7c9450, roughness: 0.85 });
  const petalMat = ghost ? stemMat : new THREE.MeshStandardMaterial({ color: 0xefc93f, roughness: 0.6, emissive: 0x2a2205 });

  const internodeGeo = new THREE.CylinderGeometry(0.72, 1, 1, 10, 1, false);
  internodeGeo.translate(0, 0.5, 0);
  const leafletGeo = (() => {
    const g = new THREE.PlaneGeometry(1, 0.59, 10, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, -0.09 * (y * y * 3.0) - 0.05 * (x + 0.5) * (x + 0.5));  // cupped + tip dip
    }
    g.computeVertexNormals();
    g.rotateZ(Math.PI);                                    // petiole end to -X, tip to +X
    g.translate(0.5, 0, 0);
    return g;
  })();
  const fruitGeo = (() => {
    const g = new THREE.SphereGeometry(1, 36, 26);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const th = Math.atan2(v.z, v.x);
      v.multiplyScalar(1 + 0.022 * Math.cos(th * 8));
      v.y *= 0.87;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  })();
  const calyxGeo = new THREE.ConeGeometry(0.13, 0.55, 5);
  calyxGeo.translate(0, 0.27, 0);
  const petalGeo = new THREE.SphereGeometry(0.5, 10, 8);
  petalGeo.scale(1, 0.28, 0.55);

  const group = new THREE.Group();
  function buildChain(count, offset, withTruss, rootObj) {
  const nodes = [];
  let parent = rootObj;
  for (let i = offset; i < offset + count; i++) {
    const nodeG = new THREE.Group();
    parent.add(nodeG);
    const stem = new THREE.Mesh(internodeGeo, stemMat);
    stem.castShadow = !ghost; stem.receiveShadow = !ghost;
    stem.name = 'internode_' + i;
    nodeG.add(stem);
    const top = new THREE.Group();
    nodeG.add(top);

    // compound leaf: rachis + leaflet pairs
    const leafG = new THREE.Group();
    leafG.rotation.y = i * GOLDEN;
    top.add(leafG);
    const pitch = new THREE.Group();
    leafG.add(pitch);
    const rachis = new THREE.Mesh(internodeGeo, pedMat);
    rachis.rotation.z = -Math.PI / 2;
    rachis.castShadow = !ghost;
    pitch.add(rachis);
    const leaflets = [];
    const nPairs = 1;
    for (let k = 0; k < nPairs; k++) {
      for (const side of [-1, 1]) {
        const mat = leafMaterial(tex, ghost);
        const mesh = new THREE.Mesh(leafletGeo, mat);
        mesh.castShadow = !ghost; mesh.receiveShadow = !ghost;
        mesh.name = 'leaflet_' + i + '_' + k + '_' + (side > 0 ? 'r' : 'l');
        const holder = new THREE.Group();
        holder.add(mesh);
        holder.userData = { k, side, pair: k / nPairs, jitter: rand() };
        pitch.add(holder);
        leaflets.push(holder);
      }
    }
    const tipMat = leafMaterial(tex, ghost);
    const tip = new THREE.Mesh(leafletGeo, tipMat);
    tip.castShadow = !ghost;
    const tipHolder = new THREE.Group(); tipHolder.add(tip);
    tipHolder.userData = { k: nPairs, side: 0, pair: 1, jitter: rand() };
    pitch.add(tipHolder); leaflets.push(tipHolder);

    // truss every few nodes
    let truss = null;
    if (withTruss && i >= 4 && (i - 4) % TRUSS_EVERY === 0) {
      const tg = new THREE.Group();
      tg.rotation.y = i * GOLDEN + 1.1;
      top.add(tg);
      const stalk = new THREE.Mesh(internodeGeo, pedMat);
      stalk.rotation.z = -Math.PI / 2.9;
      stalk.castShadow = !ghost;
      tg.add(stalk);
      const fruits = [], flowers = [];
      for (let f = 0; f < FRUIT_SLOTS; f++) {
        const holder = new THREE.Group();
        const mat = fruitMaterial(ghost);
        const mesh = new THREE.Mesh(fruitGeo, mat);
        mesh.castShadow = !ghost; mesh.receiveShadow = !ghost;
        mesh.name = 'fruit_' + i + '_' + f;
        holder.add(mesh);
        const cal = new THREE.Mesh(calyxGeo, pedMat);
        cal.rotation.x = Math.PI;
        cal.position.y = 0.92;
        holder.add(cal);
        holder.userData = { jitter: rand(), mat, mesh };
        tg.add(holder);
        fruits.push(holder);
      }
      for (let f = 0; f < FLOWER_SLOTS; f++) {
        const holder = new THREE.Group();
        for (let p = 0; p < 6; p++) {
          const pet = new THREE.Mesh(petalGeo, petalMat);
          pet.rotation.y = (p / 6) * Math.PI * 2;
          pet.position.set(Math.cos((p / 6) * Math.PI * 2) * 0.42, -0.05, Math.sin((p / 6) * Math.PI * 2) * 0.42);
          pet.rotation.z = 0.5;
          holder.add(pet);
        }
        holder.userData = { jitter: rand() };
        tg.add(holder);
        flowers.push(holder);
      }
      truss = { group: tg, stalk, fruits, flowers };
    }
    nodes.push({ idx: i, group: nodeG, stem, top, leafG, pitch, rachis, leaflets, truss, jitter: rand(), shedAt: 0.15 + rand() * 0.7, chloroAt: 0.2 + rand() * 0.7 });
    parent = top;
  }
  return nodes;
  }

  const nodes = buildChain(MAX_NODES, 0, true, group);
  const branches = [];
  [[3, 0.7], [5, 2.5], [8, 4.3], [11, 5.7]].forEach(([at, yaw], bi) => {
    const holder = new THREE.Group();
    holder.rotation.y = yaw;
    holder.rotation.z = 0.78 + bi * 0.04;
    nodes[at].top.add(holder);
    branches.push({ at, nodes: buildChain(6, 40 + bi * 10, false, holder), holder });
  });
  return { group, nodes, branches, mats: { stemMat, pedMat, petalMat }, leafletGeo, tex };
}

export async function createPlant(canvas, opts = {}) {
  const tex = await new Promise((res, rej) => {
    new THREE.TextureLoader().load(opts.leafTexture || 'assets/leaf-branch.png', t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t);
    }, undefined, rej);
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0xffffff, 1);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
  camera.position.set(0, 0.7, 1.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.6; controls.maxDistance = 4.2;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = false; controls.autoRotateSpeed = 0.45;
  let autoFrame = true;
  controls.addEventListener('start', () => { autoFrame = false; });

  // studio void lighting
  const key = new THREE.SpotLight(0xfff3e2, 42, 0, 0.62, 0.75, 1.4);
  key.position.set(1.5, 2.5, 1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 7; key.shadow.bias = -0.0012;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9184d9, 2.6);
  rim.position.set(-1.7, 1.4, -1.9);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fa4c8, 0.5);
  fill.position.set(-1.2, 0.5, 1.8);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x3d4560, 0x0e0f16, 0.5));

  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* pot + soil */
  const potGroup = new THREE.Group();
  scene.add(potGroup);
  const profile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    profile.push(new THREE.Vector2(0.105 + 0.062 * t, t * 0.24));
  }
  profile.push(new THREE.Vector2(0.172, 0.248), new THREE.Vector2(0.166, 0.248), new THREE.Vector2(0.158, 0.215));
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 64),
    new THREE.MeshStandardMaterial({ color: 0x55382b, roughness: 0.98, side: THREE.DoubleSide })
  );
  pot.name = 'pot'; pot.castShadow = true; pot.receiveShadow = true;
  potGroup.add(pot);
  const soilGeo = new THREE.SphereGeometry(0.163, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const sp = soilGeo.attributes.position, srand = rng(99);
  for (let i = 0; i < sp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(sp, i);
    v.multiplyScalar(1 + (srand() - 0.5) * 0.05);
    sp.setXYZ(i, v.x, v.y * 0.34, v.z);
  }
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, new THREE.MeshStandardMaterial({ color: 0x33261b, roughness: 1 }));
  soil.position.y = 0.205; soil.receiveShadow = true; soil.name = 'soil';
  potGroup.add(soil);
  const peb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.006, 0), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), 90);
  const mtx = new THREE.Matrix4(), prand = rng(7);
  for (let i = 0; i < 90; i++) {
    const a = prand() * 6.283, d = Math.sqrt(prand()) * 0.15;
    mtx.makeTranslation(Math.cos(a) * d, 0.222 + prand() * 0.006, Math.sin(a) * d);
    peb.setMatrixAt(i, mtx);
  }
  peb.castShadow = true; peb.receiveShadow = true;
  potGroup.add(peb);

  const SOIL_Y = 0.225;
  const live = buildPlant(tex, false, 20260729);
  live.group.position.y = SOIL_Y;
  scene.add(live.group);
  const ghost = buildPlant(tex, true, 20260729);
  ghost.group.position.set(0, SOIL_Y, -0.02);
  ghost.group.visible = opts.ghost !== false;
  scene.add(ghost.group);

  // shed leaflets on the soil
  const litter = new THREE.Group();
  litter.position.y = SOIL_Y + 0.004;
  scene.add(litter);
  const lrand = rng(31);
  for (let i = 0; i < 9; i++) {
    const mat = leafMaterial(tex, false);
    mat.userData.u.uNecro.value = 0.95;
    mat.userData.u.uChloro.value = 0.8;
    const m = new THREE.Mesh(live.leafletGeo, mat);
    const a = lrand() * 6.283, d = 0.05 + lrand() * 0.12;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    m.rotation.set(-Math.PI / 2, 0, lrand() * 6.283);
    m.scale.setScalar(0.055 + lrand() * 0.03);
    m.receiveShadow = true;
    m.visible = false;
    litter.add(m);
  }

  const target = { hM: 0.05, nodes: 1, health: 1, bio: 0, fruits: 0, flowers: 0, dia: 4, pest: 0, dis: 0, dead: false, das: 0, ghostH: 0.05, ghostNodes: 1, ghostFruits: 0 };
  const cur = { hM: 0.05, nodes: 1, health: 1, bio: 0, fruits: 0, flowers: 0, dia: 4, pest: 0, dis: 0, ghostH: 0.05, ghostFruits: 0 };

  function applyAxis(list, o, st, isGhost, time) {
    const { nActive, internode, girth, leafFactor } = o;
    const wilt = isGhost ? 0 : (1 - st.health);
    const droopBase = 0.02 + wilt * 0.075 + (st.dead ? 0.03 : 0);
    const nInt = Math.ceil(nActive);
    for (let n = 0; n < list.length; n++) {
      const nd = list[n];
      const on = n < nInt;
      nd.group.visible = on;
      if (!on) continue;
      // the newest internode extends continuously so growth never pops
      const frac = n === nInt - 1 ? Math.max(0.04, clamp01(nActive - (nInt - 1))) : 1;
      const up = n / Math.max(1, nInt - 1);
      const seg = internode * frac;
      nd.stem.scale.set(girth * (1 - 0.5 * up), seg, girth * (1 - 0.5 * up));
      nd.top.position.y = seg;
      const sway = isGhost ? 0 : Math.sin(time * 0.9 + nd.idx * 0.55) * 0.007 * (0.4 + 0.6 * st.health);
      nd.group.rotation.z = droopBase * (0.4 + up) + sway;
      nd.group.rotation.x = Math.sin(nd.idx * 1.7) * 0.012 + (isGhost ? 0 : Math.cos(time * 0.7 + nd.idx * 0.4) * 0.005);

      const leafLen = Math.min(0.32, (0.08 + 0.25 * clamp01(st.bio)) * (1 - 0.3 * up)) * leafFactor * (0.25 + 0.75 * frac);
      const shed = !isGhost && (st.dead ? nd.shedAt < 0.55 : (1 - st.health) > nd.shedAt + 0.25);
      nd.pitch.visible = !shed;
      nd.pitch.rotation.z = -0.14 + wilt * -1.05 - (st.dead ? 0.35 : 0);
      nd.rachis.visible = false;
      nd.leaflets.forEach(h => {
        const u = h.userData;
        const main = u.side === 0;
        h.position.set((main ? 0.02 : 0.05) * leafLen, 0, 0);
        h.scale.setScalar(leafLen * (main ? 1 : 0.74));
        const curl = wilt * 0.85 + (st.pest > 0.5 ? (st.pest - 0.5) * 1.0 : 0);
        h.rotation.set(
          (main ? 0 : u.side * (0.28 + curl * 0.55)),
          (main ? 0 : u.side * 0.6),
          -0.06 - wilt * 0.45 + u.jitter * 0.1
        );
        if (!isGhost) {
          const uu = h.children[0].material.userData.u;
          const chl = clamp01(((1 - st.health) - (nd.chloroAt - 0.2)) * 2.0);
          uu.uChloro.value = st.dead ? 1 : chl;
          uu.uNecro.value = st.dead ? 1 : clamp01(((1 - st.health) - nd.chloroAt) * 2.2);
          uu.uLesion.value = st.dead ? 0.5 : clamp01((st.dis - 0.25) * 1.35);
          uu.uChew.value = clamp01((st.pest - 0.3) * 1.15);
          h.children[0].material.color.setHex(st.dead ? 0x8a7a52 : 0x9fbf86);
        }
      });

      if (nd.truss) {
        const tIdx = Math.floor((nd.idx - 4) / TRUSS_EVERY);
        const rad = Math.max(0.004, st.dia / 2000);
        nd.truss.stalk.scale.set(girth * 0.5, Math.max(0.03, rad * 2.6 + 0.02), girth * 0.5);
        nd.truss.fruits.forEach((h, fi) => {
          const idx = tIdx * FRUIT_SLOTS + fi;
          const grow = clamp01(st.fruits - idx);
          h.visible = grow > 0.02;
          if (!h.visible) return;
          const ease = grow * grow * (3 - 2 * grow);
          const r = rad * (0.86 + h.userData.jitter * 0.28) * (0.25 + 0.75 * ease);
          h.scale.setScalar(r * (st.dead ? 0.9 : 1));
          const arm = rad * 2.2 + 0.014;
          h.position.set(Math.cos(fi * 2.1 + tIdx) * arm, -0.018 - fi * (rad * 1.6), Math.sin(fi * 2.1 + tIdx) * arm);
          if (isGhost) return;
          const ripe = clamp01((st.das - (66 + (idx % 6) * 3.4)) / 30) * (st.dead ? 0.55 : 1);
          const c = rampColor(ripe);
          if (st.dead) c.lerp(new THREE.Color(0x5c4130), 0.6);
          else c.lerp(new THREE.Color(0x8a7a52), (1 - st.health) * 0.45);
          h.userData.mat.color.copy(c);
          const uu = h.userData.mat.userData.u;
          uu.uCrack.value = clamp01((1 - st.health) * 1.2 - 0.15) * (ripe > 0.3 ? 1 : 0.35);
          uu.uRot.value = clamp01((st.dis - 0.45) * 1.6) + (st.dead ? 0.5 : 0);
          h.userData.mat.roughness = st.dead ? 0.75 : lerp(0.24, 0.55, 1 - st.health);
        });
        nd.truss.flowers.forEach((h, fi) => {
          const idx = tIdx * FLOWER_SLOTS + fi;
          const grow = clamp01(st.flowers - idx);
          h.visible = grow > 0.02;
          if (!h.visible) return;
          h.scale.setScalar((0.017 + 0.004 * h.userData.jitter) * (0.3 + 0.7 * grow));
          h.position.set(Math.cos(fi * 1.7 + tIdx * 2) * 0.032, -0.012 - fi * 0.013, Math.sin(fi * 1.7 + tIdx * 2) * 0.032);
          h.rotation.z = 0.5 + Math.sin(time + fi) * 0.05;
        });
      }
    }
  }

  function applyPlant(P, st, isGhost, time) {
    const nActive = Math.max(1, st.nodes);
    const internode = st.hM / nActive;
    const girth = 0.0048 + 0.0062 * clamp01(st.bio);
    applyAxis(P.nodes, { nActive, internode, girth, leafFactor: 1 }, st, isGhost, time);
    P.branches.forEach((br, bi) => {
      const live = Math.max(0, Math.min(br.nodes.length, nActive - br.at - 2));
      br.holder.visible = live > 0;
      if (!live) return;
      br.holder.rotation.z = 0.72 + bi * 0.05 + (isGhost ? 0 : (1 - st.health) * 0.5);
      applyAxis(br.nodes, { nActive: live, internode: internode * 0.85, girth: girth * 0.62, leafFactor: 0.78 }, st, isGhost, time);
    });
  }

  let running = true, t0 = performance.now();
  function frame() {
    if (!running) return;
    const now = performance.now();
    const time = (now - t0) / 1000;
    const k = 0.11;
    cur.hM = lerp(cur.hM, target.hM, k);
    cur.nodes = lerp(cur.nodes, target.nodes, k);
    cur.health = lerp(cur.health, target.health, k);
    cur.bio = lerp(cur.bio, target.bio, k);
    cur.fruits = lerp(cur.fruits, target.fruits, k * 1.6);
    cur.flowers = lerp(cur.flowers, target.flowers, k * 1.6);
    cur.dia = lerp(cur.dia, target.dia, k);
    cur.pest = lerp(cur.pest, target.pest, k);
    cur.dis = lerp(cur.dis, target.dis, k);
    cur.ghostH = lerp(cur.ghostH, target.ghostH, k);
    cur.ghostFruits = lerp(cur.ghostFruits, target.ghostFruits, k * 1.6);

    applyPlant(live, {
      hM: cur.hM, nodes: cur.nodes, health: cur.health, bio: cur.bio,
      fruits: cur.fruits, flowers: cur.flowers,
      dia: cur.dia, pest: cur.pest, dis: cur.dis, dead: target.dead, das: target.das
    }, false, time);
    if (ghost.group.visible) {
      applyPlant(ghost, {
        hM: cur.ghostH, nodes: target.ghostNodes, health: 1, bio: target.ghostBio || 0,
        fruits: cur.ghostFruits, flowers: target.ghostFlowers || 0,
        dia: target.ghostDia || 4, pest: 0, dis: 0, dead: false, das: target.das
      }, true, time);
    }
    const shed = target.dead ? 9 : Math.round(clamp01((1 - target.health - 0.3) * 2.4) * 9);
    litter.children.forEach((m, i) => { m.visible = i < shed; });

    // framing
    const top = Math.max(0.12, cur.hM) + SOIL_Y;
    controls.target.lerp(new THREE.Vector3(0, Math.max(0.2, top * 0.5), 0), 0.06);
    if (autoFrame) {
      const want = Math.min(3.2, Math.max(1.05, cur.hM * 1.75 + 0.82));
      const dir = camera.position.clone().sub(controls.target);
      const r = dir.length() || 1;
      dir.multiplyScalar(lerp(r, want, 0.05) / r);
      camera.position.copy(controls.target).add(dir);
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  requestAnimationFrame(frame);

  return {
    update(s) {
      target.hM = Math.max(0.03, s.heightCm / 100);
      target.nodes = Math.max(1, Math.min(MAX_NODES, s.heightCm / 4.4));
      target.health = clamp01(s.health01);
      target.bio = clamp01(s.biomass01);
      target.fruits = s.fruits; target.flowers = s.flowers;
      target.dia = Math.max(3, s.diaMM);
      target.pest = clamp01(s.pest01); target.dis = clamp01(s.dis01);
      target.dead = !!s.dead; target.das = s.das;
      if (s.baseline) {
        target.ghostH = Math.max(0.03, s.baseline.heightCm / 100);
        target.ghostNodes = Math.max(1, Math.min(MAX_NODES, s.baseline.heightCm / 4.4));
        target.ghostFruits = s.baseline.fruits;
        target.ghostFlowers = Math.round(s.baseline.flowers);
        target.ghostDia = Math.max(3, s.baseline.diaMM);
        target.ghostBio = clamp01(s.baseline.biomass01);
      }
    },
    setGhost(on) { ghost.group.visible = !!on; },
    resetView() {
      camera.position.set(0, 0.7, 1.5);
      controls.autoRotate = false;
      autoFrame = true;
    },
    dispose() { running = false; ro.disconnect(); controls.dispose(); renderer.dispose(); }
  };
}
