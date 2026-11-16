// Bot AI. Attackers path along the waypoint graph to their site,
// plant when they carry the bomb and hold after it is planted.
// Defenders hold a site angle, rotate toward gunshots they hear,
// rotate to a planted bomb and defuse it. Vision is a real raycast,
// so walls block sight; reaction time scales with distance and skill;
// shooting is hitscan in three-round bursts whose spread grows with
// range and target speed.
import * as THREE from 'three';
import { clamp, dist2DSq, angleLerp } from './util.js';
import { TEAM_COLOR } from './palette.js';
import { findPath, nearestWaypoint, SITES } from './world.js';
import { makeSlot, damageAtRange, spreadFor } from './weapons.js';

const BOT_SPEED = 4.3;
const EYE = 1.55;
const BODY_R = 0.42;
const NAMES = {
  vanguard: ['ROOK', 'FABLE', 'SABLE'],
  ember: ['CINDER', 'ASH', 'FLINT', 'SMOLDER'],
};

export class Bot {
  constructor(world, scene, team, index, spawn, rng) {
    this.world = world;
    this.team = team;
    this.isBot = true;
    this.rng = rng;
    this.name = NAMES[team][index % NAMES[team].length];
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.yaw = team === 'vanguard' ? 0 : Math.PI;
    this.vel = new THREE.Vector3();
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.skill = 0.35 + rng() * 0.45;
    this.slot = makeSlot(team === 'vanguard' ? 'ar77' : 'ar77');
    this.assignedSite = team === 'ember' ? (index % 2 === 0 ? 'A' : 'B') : null;
    this.targetSite = null;
    this.path = [];
    this.pathIndex = 0;
    this.holdUntil = 0;
    this.holdPos = null;
    this.visibleEnemy = null;
    this.acquireAt = 0;
    this.lastScan = -1;
    this.burstLeft = 0;
    this.nextShotAt = 0;
    this.burstPauseUntil = 0;
    this.heardAt = -10;
    this.heardPos = null;
    this.carryingBomb = false;
    this.planting = false;
    this.heat = 0;
    this.moving = false;
    this.group = this.buildMesh(scene);
    this.raycaster = new THREE.Raycaster();
  }

  buildMesh(scene) {
    const group = new THREE.Group();
    const color = TEAM_COLOR[this.team];
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9, metalness: 0.05 });
    const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), cloth);
    body.position.y = 1.05;
    body.userData = { fighter: this, part: 'body' };
    group.add(body);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), trim);
    vest.position.y = 1.15;
    group.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.8 }));
    head.position.y = 1.68;
    head.userData = { fighter: this, part: 'head' };
    group.add(head);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), trim);
    helmet.position.y = 1.86;
    group.add(helmet);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.24), cloth);
    legL.position.set(-0.14, 0.33, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    group.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }));
    gun.position.set(0.25, 1.25, -0.3);
    group.add(gun);
    this.bodyMesh = body;
    this.headMesh = head;
    group.position.copy(this.pos);
    scene.add(group);
    return group;
  }

  get hitMeshes() {
    return [this.bodyMesh, this.headMesh];
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
    const taken = this.armor > 0 ? amount * 0.5 : amount;
    if (this.armor > 0) this.armor = Math.max(0, this.armor - amount * 0.5);
    this.health -= taken;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.group.visible = false;
    }
    return taken;
  }

  healFull() {
    this.health = 100;
    this.alive = true;
    this.group.visible = true;
  }

  respawn(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = this.team === 'vanguard' ? 0 : Math.PI;
    this.path = [];
    this.pathIndex = 0;
    this.visibleEnemy = null;
    this.burstLeft = 0;
    this.carryingBomb = false;
    this.healFull();
  }

  setPathTo(siteId, graph) {
    const from = nearestWaypoint(graph, this.pos.x, this.pos.z);
    const target = siteId === 'A' ? 'asite' : 'bsite';
    this.path = findPath(graph, from, target);
    this.pathIndex = 0;
    this.targetSite = siteId;
  }

  // Pick a hold spot near the assigned site and face the likely entry.
  pickHold(rng) {
    const site = SITES[this.assignedSite];
    const angle = rng() * Math.PI * 2;
    const radius = 4 + rng() * 3;
    this.holdPos = {
      x: site.center.x + Math.cos(angle) * radius,
      z: site.center.z + Math.sin(angle) * radius,
    };
    this.holdUntil = 0;
  }

  // One fixed step. `ctx` carries the world, the fighters, the bomb,
  // the match, the shot log, the clock and the damage callback.
  update(dt, now, ctx) {
    if (!this.alive) return;
    this.heat = Math.max(0, this.heat - dt * 2);
    this.scan(dt, now, ctx);
    this.decide(dt, now, ctx);
    this.move(dt, now, ctx);
    this.shoot(dt, now, ctx);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  // Vision: a raycast from the bot's eyes to each living enemy's
  // chest. Walls in `world.blockers` stop the ray.
  scan(dt, now, ctx) {
    if (now - this.lastScan < 0.15) return;
    this.lastScan = now;
    const eye = new THREE.Vector3(this.pos.x, EYE, this.pos.z);
    let best = null;
    let bestDist = Infinity;
    for (const other of ctx.fighters) {
      if (other === this || !other.alive || other.team === this.team) continue;
      const ox = other.pos.x;
      const oz = other.pos.z;
      const d2 = dist2DSq(this.pos.x, this.pos.z, ox, oz);
      if (d2 > 55 * 55) continue;
      const target = new THREE.Vector3(ox, other.eyeY ? other.eyeY * 0.8 : 1.2, oz);
      const dir = target.clone().sub(eye);
      const dist = dir.length();
      dir.normalize();
      // Outside the field of view and not yet seen: skip.
      const facing = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      if (facing.dot(dir) < -0.1 && this.visibleEnemy !== other) continue;
      this.raycaster.set(eye, dir);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects(ctx.world.blockers, false);
      if (hits.length > 0) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = other;
      }
    }
    if (best && this.visibleEnemy !== best) {
      // Reaction time: slower at range, faster with skill.
      const reaction = 0.55 - this.skill * 0.3 + Math.sqrt(bestDist) * 0.006;
      this.acquireAt = now + reaction;
      this.visibleEnemy = best;
    } else if (!best) {
      this.visibleEnemy = null;
    }
  }

  decide(dt, now, ctx) {
    const bomb = ctx.bomb;
    if (this.team === 'vanguard') {
      if (bomb.state === 'planted') {
        // Hold near the planted bomb and guard it.
        if (!this.holdPos || dist2DSq(this.pos.x, this.pos.z, bomb.pos.x, bomb.pos.z) > 100) {
          this.holdPos = { x: bomb.pos.x + 4, z: bomb.pos.z + 3 };
          this.path = [];
        }
        return;
      }
      if (this.carryingBomb) {
        if (!this.targetSite) {
          this.targetSite = ctx.rng() < 0.5 ? 'A' : 'B';
          this.setPathTo(this.targetSite, ctx.world.graph);
        }
        const site = SITES[this.targetSite];
        if (ctx.world.insideSite(this.targetSite, this.pos.x, this.pos.z)) {
          // On site with the bomb: plant it.
          this.planting = true;
          this.path = [];
          if (bomb.plantStep(this, this.targetSite, true, dt)) {
            ctx.onPlant(this, this.targetSite);
          }
          return;
        }
        this.planting = false;
        if (this.path.length === 0) this.setPathTo(this.targetSite, ctx.world.graph);
        return;
      }
      if (bomb.state === 'dropped') {
        // Nearest attacker fetches the dropped bomb.
        const others = ctx.fighters.filter((f) => f.team === 'vanguard' && f.alive && f !== this && f.carryingBomb !== true);
        const myDist = dist2DSq(this.pos.x, this.pos.z, bomb.pos.x, bomb.pos.z);
        const nearer = others.some((f) => f.isBot && dist2DSq(f.pos.x, f.pos.z, bomb.pos.x, bomb.pos.z) < myDist);
        if (!nearer) {
          this.moveTarget = { x: bomb.pos.x, z: bomb.pos.z };
          this.path = [];
          if (myDist < 1.4 * 1.4) {
            bomb.assign(this);
            this.carryingBomb = true;
            ctx.onPickup(this);
          }
          return;
        }
      }
      if (this.path.length === 0 && !this.targetSite) {
        this.targetSite = ctx.rng() < 0.5 ? 'A' : 'B';
        this.setPathTo(this.targetSite, ctx.world.graph);
      }
      return;
    }
    // Defenders.
    if (bomb.state === 'planted') {
      const d2 = dist2DSq(this.pos.x, this.pos.z, bomb.pos.x, bomb.pos.z);
      if (d2 < 2.2 * 2.2) {
        if (bomb.defuseStep(this, true, dt)) ctx.onDefuse(this);
        this.path = [];
        return;
      }
      this.moveTarget = { x: bomb.pos.x, z: bomb.pos.z };
      this.path = [];
      return;
    }
    // Rotate toward a heard gunshot.
    if (this.heardAt > 0 && now - this.heardAt < 6 && this.heardPos) {
      const d2 = dist2DSq(this.pos.x, this.pos.z, this.heardPos.x, this.heardPos.z);
      if (d2 > 4) {
        this.moveTarget = this.heardPos;
        this.path = [];
        return;
      }
      this.heardAt = -10;
    }
    if (!this.holdPos) this.pickHold(ctx.rng);
    if (this.holdPos) {
      const d2 = dist2DSq(this.pos.x, this.pos.z, this.holdPos.x, this.holdPos.z);
      if (d2 > 1) {
        this.moveTarget = this.holdPos;
        this.path = [];
        return;
      }
      // Holding: face the site's likely entry.
      const site = SITES[this.assignedSite];
      const want = Math.atan2(-(site.center.x - this.pos.x), -(site.center.z - this.pos.z));
      this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 2));
    }
  }

  move(dt, now, ctx) {
    let dest = null;
    if (this.visibleEnemy && now >= this.acquireAt) {
      // Stop and face the enemy to shoot.
      const dx = this.visibleEnemy.pos.x - this.pos.x;
      const dz = this.visibleEnemy.pos.z - this.pos.z;
      this.yaw = angleLerp(this.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 10));
      this.vel.x = 0;
      this.vel.z = 0;
      this.moving = false;
      return;
    }
    if (this.planting) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.moving = false;
      return;
    }
    if (this.path.length > 0) {
      const node = ctx.world.graph.nodes.get(this.path[this.pathIndex]);
      if (node) {
        dest = { x: node.x, z: node.z };
        if (dist2DSq(this.pos.x, this.pos.z, node.x, node.z) < 1.2) {
          this.pathIndex += 1;
          if (this.pathIndex >= this.path.length) this.path = [];
        }
      }
    } else if (this.moveTarget) {
      dest = this.moveTarget;
      if (dist2DSq(this.pos.x, this.pos.z, dest.x, dest.z) < 1) this.moveTarget = null;
    }
    if (!dest) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.moving = false;
      return;
    }
    const dx = dest.x - this.pos.x;
    const dz = dest.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const wantYaw = Math.atan2(-dx / len, -dz / len);
    this.yaw = angleLerp(this.yaw, wantYaw, Math.min(1, dt * 6));
    const tx = (dx / len) * BOT_SPEED;
    const tz = (dz / len) * BOT_SPEED;
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, tx, Math.min(1, dt * 8));
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, tz, Math.min(1, dt * 8));
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collideCircle(this.pos, BODY_R);
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
  }

  shoot(dt, now, ctx) {
    if (!this.visibleEnemy || now < this.acquireAt || !this.visibleEnemy.alive) {
      this.burstLeft = 0;
      return;
    }
    if (now < this.burstPauseUntil) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = 3;
      this.burstPauseUntil = now + 0.85 + ctx.rng() * 0.6;
    }
    if (now < this.nextShotAt) return;
    this.nextShotAt = now + 0.12;
    this.burstLeft -= 1;
    const def = this.slot.def;
    const enemy = this.visibleEnemy;
    const dist = Math.sqrt(dist2DSq(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z));
    const targetSpeed = Math.hypot(enemy.vel.x, enemy.vel.z);
    const spread = spreadFor(def, { moving: this.moving, airborne: false, aiming: false, heat: this.heat });
    const hitChance = clamp(0.62 - dist * 0.007 - targetSpeed * 0.03 + this.skill * 0.22 - spread * 4, 0.06, 0.9);
    this.heat = Math.min(1, this.heat + 0.15);
    const muzzle = new THREE.Vector3(this.pos.x, 1.4, this.pos.z);
    if (ctx.rng() < hitChance) {
      const headshot = ctx.rng() < 0.12;
      const damage = damageAtRange(def, dist, headshot);
      ctx.damageFighter(enemy, damage, this, headshot);
      ctx.tracer(muzzle, new THREE.Vector3(enemy.pos.x, 1.3, enemy.pos.z));
    } else {
      // Miss: the tracer strays past the target.
      const miss = new THREE.Vector3(
        enemy.pos.x + (ctx.rng() - 0.5) * 2,
        1.2 + ctx.rng() * 0.8,
        enemy.pos.z + (ctx.rng() - 0.5) * 2,
      );
      ctx.tracer(muzzle, miss);
    }
    ctx.onBotShot(this);
  }

  // A gunshot this bot heard: defenders rotate toward it.
  hearShot(x, z, team, now) {
    if (this.team === 'ember' && team === 'vanguard') {
      this.heardAt = now;
      this.heardPos = { x, z };
    }
  }
}
