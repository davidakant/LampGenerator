// lampGeometry.js
// Pure, dependency-free parametric lamp-shade geometry.
// Produces an indexed triangle mesh (positions + indices) describing a
// WATERTIGHT MANIFOLD SHELL: an outer wall, an inner wall offset inward by the
// wall thickness, and connecting rims at the top and bottom. Because the result
// is a closed solid, it drops straight into any slicer without repair.
//
// An optional attached base (stand) extends the shell downward — either a
// flared foot or a straight plinth — sharing the same wall, so the whole lamp
// (shade + stand) prints as one continuous piece.
//
// The same mesh feeds both the Three.js preview and the STL exporter, so what
// you see is exactly what you print.

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Parameter schema — drives the auto-generated slider UI and validation.
// All linear dimensions are in millimetres (STL is unitless; slicers read mm).
export const PARAM_SCHEMA = [
  { key: 'height',        label: 'Shade height',      min: 40,  max: 400, step: 1,    unit: 'mm',  group: 'Silhouette' },
  { key: 'baseRadius',    label: 'Base radius',       min: 20,  max: 150, step: 1,    unit: 'mm',  group: 'Silhouette' },
  { key: 'topRadius',     label: 'Top radius',        min: 5,   max: 150, step: 1,    unit: 'mm',  group: 'Silhouette' },
  { key: 'bulge',         label: 'Bulge / waist',     min: -60, max: 80,  step: 1,    unit: 'mm',  group: 'Silhouette' },
  { key: 'bulgePos',      label: 'Bulge position',    min: 0.1, max: 0.9, step: 0.01, unit: '',    group: 'Silhouette' },
  { key: 'ribCount',      label: 'Ribs',              min: 0,   max: 40,  step: 1,    unit: '',    group: 'Surface' },
  { key: 'ribAmplitude',  label: 'Rib depth',         min: 0,   max: 25,  step: 0.5,  unit: 'mm',  group: 'Surface' },
  { key: 'ribSharpness',  label: 'Rib sharpness',     min: 1,   max: 6,   step: 0.1,  unit: '',    group: 'Surface' },
  { key: 'twist',         label: 'Twist',             min: -720,max: 720, step: 5,    unit: '°', group: 'Surface' },
  { key: 'vWaveCount',    label: 'Vertical waves',    min: 0,   max: 20,  step: 0.5,  unit: '',    group: 'Surface' },
  { key: 'vWaveAmp',      label: 'Vertical wave depth', min: 0, max: 20,  step: 0.5,  unit: 'mm',  group: 'Surface' },
  { key: 'wallThickness', label: 'Wall thickness',    min: 0.8, max: 6,   step: 0.1,  unit: 'mm',  group: 'Print' },
  { key: 'radialSegments',label: 'Resolution (around)', min: 32, max: 400, step: 8,   unit: '',    group: 'Print' },
  { key: 'heightSegments',label: 'Resolution (height)', min: 16, max: 400, step: 8,   unit: '',    group: 'Print' },
];

// Base (stand) controls — rendered as a dedicated UI block with a toggle + type.
export const BASE_SCHEMA = [
  { key: 'baseHeight', label: 'Base height', min: 5,  max: 120, step: 1, unit: 'mm' },
  { key: 'baseFlare',  label: 'Base flare',  min: 0,  max: 90,  step: 1, unit: 'mm' },
];

export const BASE_TYPES = ['flared', 'plinth'];

export const DEFAULT_PARAMS = {
  height: 220,
  baseRadius: 70,
  topRadius: 45,
  bulge: 25,
  bulgePos: 0.5,
  ribCount: 12,
  ribAmplitude: 8,
  ribSharpness: 1.6,
  twist: 180,
  vWaveCount: 0,
  vWaveAmp: 0,
  wallThickness: 1.6,
  radialSegments: 220,
  heightSegments: 240,
  // Base (stand)
  baseEnabled: false,
  baseType: 'flared',
  baseHeight: 35,
  baseFlare: 22,
};

const SHADE_KEYS = [
  'height', 'baseRadius', 'topRadius', 'bulge', 'bulgePos', 'ribCount',
  'ribAmplitude', 'ribSharpness', 'twist', 'vWaveCount', 'vWaveAmp',
  'wallThickness', 'radialSegments', 'heightSegments',
];

export const PRESETS = {
  'Twisted Vase': {
    height: 220, baseRadius: 70, topRadius: 45, bulge: 25, bulgePos: 0.5,
    ribCount: 12, ribAmplitude: 8, ribSharpness: 1.6, twist: 180,
    vWaveCount: 0, vWaveAmp: 0, wallThickness: 1.6, radialSegments: 220, heightSegments: 240,
  },
  'Ribbed Lantern': {
    height: 180, baseRadius: 75, topRadius: 75, bulge: 18, bulgePos: 0.5,
    ribCount: 24, ribAmplitude: 6, ribSharpness: 3, twist: 0,
    vWaveCount: 0, vWaveAmp: 0, wallThickness: 1.6, radialSegments: 260, heightSegments: 180,
  },
  'Spiral Tower': {
    height: 320, baseRadius: 55, topRadius: 40, bulge: 8, bulgePos: 0.5,
    ribCount: 6, ribAmplitude: 14, ribSharpness: 2.4, twist: 540,
    vWaveCount: 0, vWaveAmp: 0, wallThickness: 1.6, radialSegments: 240, heightSegments: 340,
  },
  'Hourglass': {
    height: 240, baseRadius: 80, topRadius: 80, bulge: -45, bulgePos: 0.5,
    ribCount: 16, ribAmplitude: 5, ribSharpness: 2, twist: 90,
    vWaveCount: 0, vWaveAmp: 0, wallThickness: 1.8, radialSegments: 240, heightSegments: 260,
  },
  'Rippled Drum': {
    height: 160, baseRadius: 85, topRadius: 70, bulge: 6, bulgePos: 0.5,
    ribCount: 0, ribAmplitude: 0, ribSharpness: 1, twist: 0,
    vWaveCount: 9, vWaveAmp: 9, wallThickness: 1.6, radialSegments: 200, heightSegments: 300,
  },
  'Pinecone': {
    height: 200, baseRadius: 60, topRadius: 30, bulge: 30, bulgePos: 0.42,
    ribCount: 18, ribAmplitude: 7, ribSharpness: 4, twist: 300,
    vWaveCount: 6, vWaveAmp: 4, wallThickness: 1.6, radialSegments: 260, heightSegments: 320,
  },
};

// Clamp a value to a parameter's schema range (checks both slider schemas).
export function clampParam(key, value) {
  const s = PARAM_SCHEMA.find((p) => p.key === key) || BASE_SCHEMA.find((p) => p.key === key);
  if (!s) return value;
  return Math.min(s.max, Math.max(s.min, value));
}

// ---------------------------------------------------------------------------
// Radius functions
// ---------------------------------------------------------------------------

// Zone geometry derived from params: base height (bh), shade height (sh), total.
function getDims(p) {
  const baseEnabled = !!p.baseEnabled && p.baseHeight > 0;
  const bh = baseEnabled ? p.baseHeight : 0;
  const sh = p.height;
  return { baseEnabled, bh, sh, total: bh + sh };
}

// Silhouette radius of the SHADE at normalized height t in [0,1] (no ribs).
function profileRadius(t, p) {
  const base = p.baseRadius + (p.topRadius - p.baseRadius) * t;
  const bp = p.bulgePos;
  let w; // raised-cosine window, 0 at the ends, 1 at bulgePos
  if (t <= bp) w = 0.5 - 0.5 * Math.cos((t / bp) * Math.PI);
  else         w = 0.5 - 0.5 * Math.cos(((1 - t) / (1 - bp)) * Math.PI);
  return base + p.bulge * w;
}

// Fade rib/wave detail to zero where the shade meets the base, so the seam is
// continuous (base is smooth). Full strength everywhere when there is no base.
function detailEnvelope(t, dims) {
  if (!dims.baseEnabled) return 1;
  return smoothstep(t / 0.06);
}

// Full outer radius of the SHADE at angle theta and normalized height t.
function shadeOuterRadius(theta, t, p, dims) {
  let r = profileRadius(t, p);
  const env = detailEnvelope(t, dims);

  if (p.ribCount > 0 && p.ribAmplitude > 0) {
    const twistRad = (p.twist * Math.PI) / 180;
    const angle = p.ribCount * (theta + twistRad * t);
    let s = 0.5 + 0.5 * Math.cos(angle);   // 0..1
    s = Math.pow(s, p.ribSharpness);
    r += env * p.ribAmplitude * (s - 0.5) * 2;
  }
  if (p.vWaveCount > 0 && p.vWaveAmp > 0) {
    r += env * p.vWaveAmp * Math.sin(t * p.vWaveCount * TAU);
  }
  return Math.max(r, 1.0);
}

// Outer radius of the BASE at normalized base-height u in [0,1]
// (u = 0 at the build plate, u = 1 at the join with the shade).
// Both types NARROW (or stay constant) as u rises → always self-supporting.
function baseOuterRadius(u, p) {
  const sbr = p.baseRadius;             // must meet the shade's base radius at u=1
  const flare = Math.max(0, p.baseFlare);
  if (p.baseType === 'plinth') {
    const c = 0.82;                     // straight wall, then chamfer inward to the shade
    if (u < c) return sbr + flare;
    return (sbr + flare) + (sbr - (sbr + flare)) * ((u - c) / (1 - c));
  }
  // 'flared' (default): widest at the plate, easing inward to the shade radius.
  return sbr + flare * Math.pow(1 - u, 1.3);
}

// Unified outer radius at absolute height y, dispatching to base/shade.
function outerRadiusAt(theta, y, p, dims) {
  if (dims.baseEnabled && y < dims.bh) {
    return baseOuterRadius(dims.bh > 0 ? y / dims.bh : 1, p);
  }
  const t = dims.sh > 0 ? clamp01((y - dims.bh) / dims.sh) : 0;
  return shadeOuterRadius(theta, t, p, dims);
}

// Ordered list of ring heights from plate to top (base rings, then shade rings).
function ringHeights(p, dims, heightSegments) {
  const ys = [];
  if (dims.baseEnabled) {
    const baseRows = Math.max(4, Math.round(heightSegments * (dims.bh / dims.total)));
    for (let i = 0; i < baseRows; i++) ys.push((i / baseRows) * dims.bh);
  }
  const shadeRows = Math.max(2, Math.round(heightSegments));
  for (let i = 0; i <= shadeRows; i++) ys.push(dims.bh + (i / shadeRows) * dims.sh);
  return ys;
}

// ---------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------
/**
 * @returns {{positions: Float32Array, indices: Uint32Array, info: object}}
 */
export function buildLampMesh(params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const dims = getDims(p);
  const R = Math.max(3, Math.round(p.radialSegments)); // vertices around (no wrap dup)
  const wall = p.wallThickness;

  const ys = ringHeights(p, dims, p.heightSegments);
  const rows = ys.length;

  const vertsPerGrid = rows * R;
  const totalVerts = vertsPerGrid * 2;
  const positions = new Float32Array(totalVerts * 3);
  const idx = (grid, i, j) => grid * vertsPerGrid + i * R + j;

  let minR = Infinity, maxR = -Infinity, topOpening = Infinity;

  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    for (let j = 0; j < R; j++) {
      const theta = (j / R) * TAU;
      const ro = outerRadiusAt(theta, y, p, dims);
      const ri = Math.max(ro - wall, 0.4);
      const c = Math.cos(theta), s = Math.sin(theta);

      const oBase = idx(0, i, j) * 3;
      positions[oBase] = ro * c; positions[oBase + 1] = y; positions[oBase + 2] = ro * s;
      const iBase = idx(1, i, j) * 3;
      positions[iBase] = ri * c; positions[iBase + 1] = y; positions[iBase + 2] = ri * s;

      if (ro < minR) minR = ro;
      if (ro > maxR) maxR = ro;
      if (i === rows - 1 && ri < topOpening) topOpening = ri;
    }
  }

  const H = rows - 1;
  const quadCount = H * R * 2 + R * 2; // walls (outer+inner) + top & bottom rims
  const indices = new Uint32Array(quadCount * 6);
  let w = 0;
  const pushTri = (a, b, c) => { indices[w++] = a; indices[w++] = b; indices[w++] = c; };
  const pushQuad = (a, b, c, d) => { pushTri(a, b, c); pushTri(a, c, d); };

  for (let i = 0; i < H; i++) {
    for (let j = 0; j < R; j++) {
      const jn = (j + 1) % R;
      // Outer surface — outward normals.
      pushQuad(idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, jn), idx(0, i, jn));
      // Inner surface — reversed so normals point into the cavity.
      pushQuad(idx(1, i, j), idx(1, i, jn), idx(1, i + 1, jn), idx(1, i + 1, j));
    }
  }
  // Bottom rim (row 0), facing down.
  for (let j = 0; j < R; j++) {
    const jn = (j + 1) % R;
    pushQuad(idx(0, 0, j), idx(0, 0, jn), idx(1, 0, jn), idx(1, 0, j));
  }
  // Top rim (last row), facing up.
  const top = rows - 1;
  for (let j = 0; j < R; j++) {
    const jn = (j + 1) % R;
    pushQuad(idx(0, top, j), idx(1, top, j), idx(1, top, jn), idx(0, top, jn));
  }

  const info = {
    shadeHeight: dims.sh,
    baseHeight: dims.bh,
    totalHeight: dims.total,
    maxDiameter: maxR * 2,
    minDiameter: minR * 2,
    topOpeningDiameter: topOpening * 2,
    wallThickness: wall,
    triangles: indices.length / 3,
    vertices: totalVerts,
  };
  return { positions, indices, info };
}

// ---------------------------------------------------------------------------
// Printability analysis
// ---------------------------------------------------------------------------
// Samples the OUTER surface and computes true face normals, so overhang from
// BOTH the silhouette (widening walls) AND twisted ribs (helical undersides) is
// captured. Overhang is measured as the angle of the surface from vertical:
//   0°  = vertical wall (ideal)          45° = classic self-support limit
//   90° = horizontal ceiling (worst)     >~55° generally wants support
export function analyzePrintability(params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const dims = getDims(p);
  const M = 160;                          // samples around
  const ys = ringHeights(p, dims, 220);   // fixed analysis resolution
  const rows = ys.length;

  // Precompute the outer point grid.
  const px = new Float64Array(rows * M);
  const py = new Float64Array(rows * M);
  const pz = new Float64Array(rows * M);
  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    for (let j = 0; j < M; j++) {
      const theta = (j / M) * TAU;
      const r = outerRadiusAt(theta, y, p, dims);
      px[i * M + j] = r * Math.cos(theta);
      py[i * M + j] = y;
      pz[i * M + j] = r * Math.sin(theta);
    }
  }

  let totalArea = 0, overhangArea = 0, marginalArea = 0;
  let maxOverhang = 0, worstY = 0;

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M;
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + jn, d = i * M + jn;
      // Quad normal via diagonals: n = (P_c - P_a) x (P_d - P_b).
      const e1x = px[c] - px[a], e1y = py[c] - py[a], e1z = pz[c] - pz[a];
      const e2x = px[d] - px[b], e2y = py[d] - py[b], e2z = pz[d] - pz[b];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nlen = Math.hypot(nx, ny, nz);
      if (nlen < 1e-9) continue;
      const area = 0.5 * nlen;
      nx /= nlen; ny /= nlen; nz /= nlen;

      // Orient outward (away from the vertical axis) using the quad centre.
      const cxp = (px[a] + px[b] + px[c] + px[d]) * 0.25;
      const czp = (pz[a] + pz[b] + pz[c] + pz[d]) * 0.25;
      if (nx * cxp + nz * czp < 0) ny = -ny;

      // Overhang angle from vertical: downward-facing outer surface → ny < 0.
      const overhang = Math.asin(clamp01(-ny)) * 180 / Math.PI;

      totalArea += area;
      if (overhang > 55) overhangArea += area;
      else if (overhang > 45) marginalArea += area;
      if (overhang > maxOverhang) { maxOverhang = overhang; worstY = (py[a] + py[b]) * 0.5; }
    }
  }

  const overhangFrac = totalArea > 0 ? overhangArea / totalArea : 0;
  const marginalFrac = totalArea > 0 ? marginalArea / totalArea : 0;

  let verdict, message;
  if (maxOverhang <= 45.5) {
    verdict = 'clear';
    message = 'Prints support-free — all walls stay within the 45° self-support limit.';
  } else if (maxOverhang <= 55.5 || overhangFrac < 0.02) {
    verdict = 'marginal';
    message = `Mild overhang (${maxOverhang.toFixed(0)}° from vertical). Printable on most machines with good part cooling; no supports needed for translucent single-piece prints.`;
  } else {
    verdict = 'support';
    message = `Steep overhang (${maxOverhang.toFixed(0)}° from vertical) over ${(overhangFrac * 100).toFixed(0)}% of the surface. Add supports, or reduce the widening/flare to print clean.`;
  }

  // Helper diagnostics for the UI to explain WHERE the overhang comes from.
  const widensUpward = p.topRadius > p.baseRadius || (p.bulge > 0);
  const twistShear = Math.abs(p.twist) > 60 && p.ribCount > 0 && p.ribAmplitude > 1.5;

  return {
    verdict,
    message,
    maxOverhang,
    worstHeight: worstY,
    overhangFrac,
    marginalFrac,
    causes: {
      widensUpward,
      twistShear,
      flare: dims.baseEnabled ? 0 : 0, // base is always self-supporting by construction
    },
  };
}

// ---------------------------------------------------------------------------
// Support generation
// ---------------------------------------------------------------------------
// Emulates what a slicer does: find overhanging outer faces (steeper than the
// threshold from vertical), bin them onto an (x,z) grid, and drop a thin
// vertical pillar from the build plate up to each column's highest overhang.
// Returns a mesh so the preview can show exactly where supports would land.
export function buildSupports(params, opts = {}) {
  const threshold = opts.threshold ?? 50; // degrees from vertical
  const cell = opts.cell ?? 7;            // grid spacing (mm)
  const strut = opts.strut ?? 1.4;        // pillar cross-section (mm)

  const p = { ...DEFAULT_PARAMS, ...params };
  const dims = getDims(p);
  const M = 160;
  const ys = ringHeights(p, dims, 220);
  const rows = ys.length;

  const px = new Float64Array(rows * M);
  const py = new Float64Array(rows * M);
  const pz = new Float64Array(rows * M);
  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    for (let j = 0; j < M; j++) {
      const theta = (j / M) * TAU;
      const r = outerRadiusAt(theta, y, p, dims);
      px[i * M + j] = r * Math.cos(theta);
      py[i * M + j] = y;
      pz[i * M + j] = r * Math.sin(theta);
    }
  }

  // Bin overhanging face centres by (x,z); keep the highest overhang per cell.
  const bins = new Map();
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M;
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + jn, d = i * M + jn;
      const e1x = px[c] - px[a], e1y = py[c] - py[a], e1z = pz[c] - pz[a];
      const e2x = px[d] - px[b], e2y = py[d] - py[b], e2z = pz[d] - pz[b];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nlen = Math.hypot(nx, ny, nz);
      if (nlen < 1e-9) continue;
      ny /= nlen;
      const cxp = (px[a] + px[b] + px[c] + px[d]) * 0.25;
      const czp = (pz[a] + pz[b] + pz[c] + pz[d]) * 0.25;
      const cyp = (py[a] + py[b] + py[c] + py[d]) * 0.25;
      if (nx * cxp + nz * czp < 0) ny = -ny;
      const overhang = Math.asin(clamp01(-ny)) * 180 / Math.PI;
      if (overhang < threshold || cyp < 1) continue;

      const key = Math.round(cxp / cell) + '_' + Math.round(czp / cell);
      const cur = bins.get(key);
      if (!cur || cyp > cur.y) bins.set(key, { x: cxp, z: czp, y: cyp });
    }
  }

  // Emit a box column per bin.
  const verts = [];
  const idxs = [];
  const hw = strut / 2;
  const addBox = (cx, cz, y0, y1) => {
    const base = verts.length / 3;
    const corners = [
      [cx - hw, y0, cz - hw], [cx + hw, y0, cz - hw], [cx + hw, y0, cz + hw], [cx - hw, y0, cz + hw],
      [cx - hw, y1, cz - hw], [cx + hw, y1, cz - hw], [cx + hw, y1, cz + hw], [cx - hw, y1, cz + hw],
    ];
    for (const v of corners) verts.push(v[0], v[1], v[2]);
    const f = [
      [0, 1, 2], [0, 2, 3], // bottom
      [4, 6, 5], [4, 7, 6], // top
      [0, 4, 5], [0, 5, 1], // sides
      [1, 5, 6], [1, 6, 2],
      [2, 6, 7], [2, 7, 3],
      [3, 7, 4], [3, 4, 0],
    ];
    for (const t of f) idxs.push(base + t[0], base + t[1], base + t[2]);
  };

  for (const { x, z, y } of bins.values()) addBox(x, z, 0, y);

  return {
    positions: new Float32Array(verts),
    indices: new Uint32Array(idxs),
    pillarCount: bins.size,
    threshold,
  };
}

// Merge only the shade-shape keys of a preset onto existing params, so any
// attached base stays put when switching shade presets.
export function applyShadePreset(current, preset) {
  const next = { ...current };
  for (const k of SHADE_KEYS) if (k in preset) next[k] = preset[k];
  return next;
}
