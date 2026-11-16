// The player: first-person movement with acceleration, crouching
// and AABB collision, plus health and armor. The camera sits at eye
// height; the body is a capsule the bots and bullets test against.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { ARMOR_REDUCTION } from './weapons.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;
export const BODY_RADIUS = 0.42;
export const WALK_SPEED = 5.2;
export const CROUCH_SPEED = 2.6;
export const AIM_SPEED = 3.4;

export class Player {
  constructor(world, spawn, team) {
    this.world = world;
    this.team = team;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.vel = new THREE.Vector3();
    this.yaw = team === 'vanguard' ? 0 : Math.PI;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.crouching = false;
    this.eyeHeight = EYE_STAND;
    this.moving = false;
    this.airborne = false;
    this.onGround = true;
    // Weapon slots: index 0 is the current weapon.
    this.slots = [];
    this.currentSlot = 0;
    this.heat = 0;
    this.lastShotAt = -10;
    this.reloadUntil = -1;
    this.aiming = false;
  }

  get eyeY() {
    return this.eyeHeight;
  }

  get currentWeapon() {
    return this.slots[this.currentSlot] ?? null;
  }

  // One fixed simulation step. `move` is {x, z} in camera space,
  // already normalised; `dt` is the fixed step.
  step(move, dt, wantCrouch) {
    if (!this.alive) return;
    this.crouching = wantCrouch;
    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight = lerp(this.eyeHeight, targetEye, Math.min(1, dt * 12));
    const speed = wantCrouch ? CROUCH_SPEED : this.aiming ? AIM_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw).
    const wishX = -sin * move.z + cos * move.x;
    const wishZ = -cos * move.z - sin * move.x;
    const rate = Math.min(1, (this.onGround ? 14 : 4) * dt);
    this.vel.x = lerp(this.vel.x, wishX * speed, rate);
    this.vel.z = lerp(this.vel.z, wishZ * speed, rate);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collideCircle(this.pos, BODY_RADIUS);
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    this.moving = speedNow > 0.6;
    this.heat = Math.max(0, this.heat - dt * 2.2);
  }

  look(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.5, 1.5);
  }

  // Damage after armor: kevlar halves what gets through.
  takeDamage(amount) {
    if (!this.alive) return 0;
    const taken = this.armor > 0 ? amount * ARMOR_REDUCTION : amount;
    if (this.armor > 0) this.armor = Math.max(0, this.armor - amount * 0.5);
    this.health -= taken;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    return taken;
  }

  healFull() {
    this.health = 100;
    this.alive = true;
    this.vel.set(0, 0, 0);
    this.heat = 0;
    this.reloadUntil = -1;
  }

  respawn(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.yaw = this.team === 'vanguard' ? 0 : Math.PI;
    this.pitch = 0;
    this.healFull();
  }

  eyePosition(out) {
    out.set(this.pos.x, this.eyeY, this.pos.z);
    return out;
  }

  forward(out) {
    out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    return out;
  }
}
