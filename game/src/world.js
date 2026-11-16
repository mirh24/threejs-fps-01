// DUSTLINE's map: a freight yard at dusk. A warehouse holds site A
// on the west side, a fuel depot holds site B on the east, and rusted
// containers stack into three lanes between the two spawns. Every
// solid thing registers an AABB collider for movement and a mesh for
// the raycaster, so walls really do block sight and bullets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { randomIn } from './util.js';

export const YARD = { minX: -40, maxX: 40, minZ: -30, maxZ: 30, wallHeight: 4.5 };

export const SITES = {
  A: { id: 'A', name: 'WAREHOUSE', center: { x: -27, z: 0 }, radius: 7, color: PALETTE.siteA },
  B: { id: 'B', name: 'FUEL DEPOT', center: { x: 30, z: 2 }, radius: 7, color: PALETTE.siteB },
};

export const SPAWNS = {
  vanguard: [
    { x: -6, z: 26 }, { x: -2, z: 27 }, { x: 2, z: 27 }, { x: 6, z: 26 },
  ],
  ember: [
    { x: -6, z: -26 }, { x: -2, z: -27 }, { x: 2, z: -27 }, { x: 6, z: -26 },
  ],
};

// Waypoint graph: lanes the bots path along. Edges are two-way.
const WAYPOINT_DEFS = [
  { id: 'vspawn', x: 0, z: 25 },
  { id: 'south', x: 0, z: 14 },
  { id: 'mid', x: 0, z: 0 },
  { id: 'north', x: 0, z: -14 },
  { id: 'espawn', x: 0, z: -25 },
  { id: 'west1', x: -14, z: 18 },
  { id: 'west2', x: -20, z: 8 },
  { id: 'west3', x: -24, z: -4 },
  { id: 'adoor', x: -20, z: 0 },
  { id: 'asite', x: -27, z: 0 },
  { id: 'east1', x: 14, z: 18 },
  { id: 'east2', x: 20, z: 8 },
  { id: 'east3', x: 24, z: -4 },
  { id: 'bdoor', x: 22, z: 2 },
  { id: 'bsite', x: 30, z: 2 },
  { id: 'crossw', x: -14, z: -8 },
  { id: 'crosse', x: 14, z: -8 },
  { id: 'yardw', x: -30, z: 18 },
  { id: 'yarde', x: 30, z: 18 },
];

const WAYPOINT_EDGES = [
  ['vspawn', 'south'], ['south', 'mid'], ['mid', 'north'], ['north', 'espawn'],
  ['vspawn', 'west1'], ['west1', 'west2'], ['west2', 'adoor'], ['adoor', 'asite'],
  ['west2', 'west3'], ['west3', 'crossw'], ['crossw', 'north'],
  ['vspawn', 'east1'], ['east1', 'east2'], ['east2', 'bdoor'], ['bdoor', 'bsite'],
  ['east2', 'east3'], ['east3', 'crosse'], ['crosse', 'north'],
  ['south', 'west1'], ['south', 'east1'], ['mid', 'west3'], ['mid', 'east3'],
  ['mid', 'crossw'], ['mid', 'crosse'], ['west1', 'yardw'], ['yardw', 'adoor'],
  ['east1', 'yarde'], ['yarde', 'bdoor'],
];

// Breadth-first shortest path over the waypoint graph, as node ids.
export function findPath(graph, fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of graph.edges.get(current) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === toId) {
        const path = [toId];
        let node = toId;
        while (prev.get(node) !== null) {
          node = prev.get(node);
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toId];
}

function buildWaypointGraph() {
  const nodes = new Map(WAYPOINT_DEFS.map((w) => [w.id, w]));
  const edges = new Map(WAYPOINT_DEFS.map((w) => [w.id, []]));
  for (const [a, b] of WAYPOINT_EDGES) {
    edges.get(a).push(b);
    edges.get(b).push(a);
  }
  return { nodes, edges };
}

export function nearestWaypoint(graph, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const node of graph.nodes.values()) {
    const dx = node.x - x;
    const dz = node.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = node.id;
    }
  }
  return best;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    // Movement colliders: flat AABBs on the ground plane.
    this.colliders = [];
    // Meshes the raycaster tests for sight and bullets.
    this.blockers = [];
    this.materials = new Map();
    this.graph = buildWaypointGraph();
    this.siteRings = {};
    this.buildLights();
    this.buildGround();
    this.buildPerimeter();
    this.buildWarehouse();
    this.buildDepot();
    this.buildContainers();
    this.buildProps();
    this.buildSiteMarkers();
  }

  material(color, roughness = 0.85, metalness = 0.15) {
    const key = `${color}|${roughness}|${metalness}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    }
    return this.materials.get(key);
  }

  // Adds a box mesh plus its collider. `collide` false for low props
  // the player can step over visually but not walk through.
  box(x, y, z, w, h, d, color, { collide = true, ry = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) {
      this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      this.blockers.push(mesh);
    }
    return mesh;
  }

  buildLights() {
    const scene = this.scene;
    scene.fog = new THREE.Fog(PALETTE.fog, 55, 130);
    const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
    sun.position.set(-60, 26, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.ground, PALETTE.fillIntensity));
    const ambient = new THREE.AmbientLight(PALETTE.ambient, PALETTE.ambientIntensity);
    scene.add(ambient);
    // Two yard lamps throw warm pools over mid and the depot lane.
    for (const [x, z] of [[-8, 6], [16, -10]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), this.material(PALETTE.pole, 0.6, 0.6));
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const lamp = new THREE.PointLight(0xffc27a, 18, 22, 1.8);
      lamp.position.set(x, 6.8, z);
      scene.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
      bulb.position.set(x, 6.8, z);
      scene.add(bulb);
    }
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 90),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Sand patches break up the yard floor.
    for (let i = 0; i < 9; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(randomIn(this.rng, 3, 7), 20),
        new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1, metalness: 0 }),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(randomIn(this.rng, -36, 36), 0.02, randomIn(this.rng, -26, 26));
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
    // A worn asphalt strip down the middle lane.
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 58),
      new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 1, metalness: 0 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.015, 0);
    strip.receiveShadow = true;
    this.scene.add(strip);
  }

  buildPerimeter() {
    const { minX, maxX, minZ, maxZ, wallHeight } = YARD;
    const h = wallHeight;
    this.box(0, h / 2, minZ - 0.5, maxX - minX + 2, h, 1, PALETTE.rustDark);
    this.box(0, h / 2, maxZ + 0.5, maxX - minX + 2, h, 1, PALETTE.rustDark);
    this.box(minX - 0.5, h / 2, 0, 1, h, maxZ - minZ + 2, PALETTE.rustDark);
    this.box(maxX + 0.5, h / 2, 0, 1, h, maxZ - minZ + 2, PALETTE.rustDark);
  }

  buildWarehouse() {
    // Site A: a corrugated warehouse, open on its east side so attackers
    // push through one wide door and defenders hold the far corners.
    const wall = PALETTE.warehouseWall;
    this.box(-34.5, 3, 0, 1, 6, 24, wall);
    this.box(-27, 3, -11.5, 15, 6, 1, wall);
    this.box(-27, 3, 11.5, 15, 6, 1, wall);
    // East wall in two segments leaves a 6-wide door at the middle.
    this.box(-20.5, 3, -8.5, 1, 6, 7, wall);
    this.box(-20.5, 3, 8.5, 1, 6, 7, wall);
    this.box(-20.5, 5.4, 0, 1, 1.2, 10, wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 25), this.material(PALETTE.warehouseRoof));
    roof.position.set(-27, 6.2, 0);
    roof.castShadow = true;
    this.scene.add(roof);
    this.blockers.push(roof);
    // Crates inside give the defenders cover.
    this.box(-30, 0.7, -7, 2.4, 1.4, 2.4, PALETTE.crate);
    this.box(-30, 0.7, 7, 2.4, 1.4, 2.4, PALETTE.crate);
    this.box(-24, 0.5, -3, 1.8, 1, 1.8, PALETTE.crate);
  }

  buildDepot() {
    // Site B: three fuel tanks ringed by low pipework and a fence gap.
    for (const [x, z, r] of [[30, -6, 3.2], [34, 6, 2.6], [26, 9, 2.2]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 5, 20), this.material(PALETTE.tankWhite, 0.5, 0.4));
      tank.position.set(x, 2.5, z);
      tank.castShadow = true;
      tank.receiveShadow = true;
      this.scene.add(tank);
      this.blockers.push(tank);
      this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r, 0.8, 20), this.material(PALETTE.tankRust, 0.6, 0.4));
      cap.position.set(x, 5.4, z);
      this.scene.add(cap);
    }
    this.box(24, 0.4, 10, 8, 0.8, 0.8, PALETTE.barrel);
    this.box(36, 0.4, -2, 0.8, 0.8, 8, PALETTE.barrel);
  }

  buildContainers() {
    // Container stacks shape the three lanes: a high stack mid, low
    // cover on the flanks, and a corner that breaks the long sightline.
    const specs = [
      [-12, 6, 6, 2.4, 2.6, PALETTE.rustLight, 0],
      [-12, 10, 6, 2.4, 2.6, PALETTE.containerTeal, 0],
      [-12, 8.6, -6, 2.4, 2.6, PALETTE.containerOchre, 0],
      [12, 6, 6, 2.4, 2.6, PALETTE.containerSlate, 0],
      [12, 10, -6, 2.4, 2.6, PALETTE.rustMid, 0],
      [12, -10, 6, 2.4, 2.6, PALETTE.containerTeal, 0],
      [-6, -14, 6, 2.4, 2.6, PALETTE.rustDark, 0],
      [6, -18, 6, 2.4, 2.6, PALETTE.containerOchre, 0],
      [-18, -16, 6, 2.4, 2.6, PALETTE.rustLight, 0],
      [18, 16, 6, 2.4, 2.6, PALETTE.containerSlate, 0],
      [-28, 20, 6, 2.4, 2.6, PALETTE.rustMid, 0],
      [28, -18, 6, 2.4, 2.6, PALETTE.rustDark, 0],
    ];
    for (const [x, z, w, h, d, color, ry] of specs) {
      this.box(x, h / 2, z, w, h, d, color, { ry });
    }
    // One double stack guards mid.
    this.box(0, 1.3, -4, 6, 2.6, 2.4, PALETTE.rustLight);
    this.box(0, 3.9, -4, 6, 2.6, 2.4, PALETTE.containerTeal);
  }

  buildProps() {
    // Barrels and crates scattered as micro-cover.
    const spots = [
      [-8, 18, 'barrel'], [8, 18, 'barrel'], [-16, 2, 'crate'], [16, 2, 'crate'],
      [-4, -8, 'barrel'], [4, -8, 'barrel'], [-24, 14, 'crate'], [24, -14, 'crate'],
    ];
    for (const [x, z, kind] of spots) {
      if (kind === 'barrel') {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), this.material(PALETTE.barrel, 0.7, 0.3));
        mesh.position.set(x, 0.7, z);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.blockers.push(mesh);
        this.colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
      } else {
        this.box(x, 0.6, z, 1.6, 1.2, 1.6, PALETTE.crate);
      }
    }
  }

  buildSiteMarkers() {
    // Glowing floor rings mark the two plant zones.
    for (const site of Object.values(SITES)) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(site.radius - 0.4, site.radius, 40),
        new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.center.x, 0.05, site.center.z);
      this.scene.add(ring);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(site.radius - 0.4, 40),
        new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(site.center.x, 0.04, site.center.z);
      this.scene.add(disc);
      const glow = new THREE.PointLight(site.color, 10, 18, 1.8);
      glow.position.set(site.center.x, 3, site.center.z);
      this.scene.add(glow);
      this.siteRings[site.id] = ring;
    }
  }

  // Circle-vs-AABB collision: push `pos` (x,z) out of any collider it
  // overlaps, then clamp to the yard. Returns true when a push happened.
  collideCircle(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const nearestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nearestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nearestX;
      const dz = pos.z - nearestZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nearestX + (dx / d) * radius;
          pos.z = nearestZ + (dz / d) * radius;
        } else {
          // Dead centre inside a box: push out along the smallest axis.
          const pushLeft = pos.x - c.minX;
          const pushRight = c.maxX - pos.x;
          const pushBack = pos.z - c.minZ;
          const pushFront = c.maxZ - pos.z;
          const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);
          if (smallest === pushLeft) pos.x = c.minX - radius;
          else if (smallest === pushRight) pos.x = c.maxX + radius;
          else if (smallest === pushBack) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
    pos.x = Math.max(YARD.minX + radius, Math.min(YARD.maxX - radius, pos.x));
    pos.z = Math.max(YARD.minZ + radius, Math.min(YARD.maxZ - radius, pos.z));
    return hit;
  }

  insideSite(siteId, x, z) {
    const site = SITES[siteId];
    const dx = x - site.center.x;
    const dz = z - site.center.z;
    return dx * dx + dz * dz <= site.radius * site.radius;
  }
}
