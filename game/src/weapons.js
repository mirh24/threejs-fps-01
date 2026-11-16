// The arsenal. Two weapons are issued free; the rest are bought in
// the buy menu. Damage is flat with a listed headshot value; spread
// grows while moving and firing, and shrinks when still or aiming, so
// stopping to aim pays. View models are simple box-built guns that
// hang off the camera, with a muzzle flash light.
import * as THREE from 'three';
import { clamp } from './util.js';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9', kind: 'pistol', price: 0, damage: 26, headDamage: 78,
    mag: 12, reserve: 48, fireInterval: 0.16, reloadTime: 1.3, auto: false,
    baseSpread: 0.011, moveSpread: 0.02, airSpread: 0.03, range: 60, kick: 0.011,
  },
  ar77: {
    id: 'ar77', name: 'AR-77', kind: 'rifle', price: 0, damage: 34, headDamage: 100,
    mag: 30, reserve: 120, fireInterval: 0.115, reloadTime: 2.1, auto: true,
    baseSpread: 0.009, moveSpread: 0.026, airSpread: 0.035, range: 90, kick: 0.016,
  },
  vulcan: {
    id: 'vulcan', name: 'VULCAN-9', kind: 'smg', price: 1500, damage: 22, headDamage: 66,
    mag: 30, reserve: 120, fireInterval: 0.075, reloadTime: 1.8, auto: true,
    baseSpread: 0.014, moveSpread: 0.03, airSpread: 0.04, range: 55, kick: 0.012,
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT', kind: 'sniper', price: 4750, damage: 90, headDamage: 180,
    mag: 5, reserve: 20, fireInterval: 1.25, reloadTime: 3.0, auto: false,
    baseSpread: 0.002, moveSpread: 0.05, airSpread: 0.06, range: 140, kick: 0.06,
  },
};

export const BUY_MENU = [
  { id: 'vulcan', key: '1', label: 'VULCAN-9 SMG', price: 1500, note: 'Very fast, close range' },
  { id: 'longshot', key: '2', label: 'LONGSHOT sniper', price: 4750, note: 'One shot, right-click zoom' },
  { id: 'he', key: '3', label: 'HE grenade', price: 300, note: 'Up to 110 area damage' },
  { id: 'kevlar', key: '4', label: 'Kevlar armor', price: 650, note: 'Halves damage taken' },
  { id: 'ar77', key: '5', label: 'AR-77 rifle', price: 0, note: 'Issue rifle, free refill' },
];

export const GRENADE = { price: 300, maxDamage: 110, radius: 7, fuse: 1.6 };
export const KEVLAR_PRICE = 650;
export const ARMOR_REDUCTION = 0.5;

// One weapon slot: the definition plus live ammo state.
export function makeSlot(weaponId) {
  const def = WEAPONS[weaponId];
  return { def, mag: def.mag, reserve: def.reserve };
}

// Spread in radians for a shot, from movement, aim and firing heat.
export function spreadFor(def, { moving, airborne, aiming, heat }) {
  let spread = def.baseSpread;
  if (moving) spread += def.moveSpread;
  if (airborne) spread += def.airSpread;
  if (aiming) spread *= 0.45;
  spread += heat * 0.012;
  return clamp(spread, 0.001, 0.09);
}

// Damage falls off gently past half the weapon's range.
export function damageAtRange(def, distance, headshot) {
  const base = headshot ? def.headDamage : def.damage;
  const falloff = distance > def.range * 0.5 ? clamp(1 - (distance - def.range * 0.5) / def.range, 0.55, 1) : 1;
  return Math.round(base * falloff);
}

function gunMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.65 });
}

// A low-poly view model: barrel, body, grip and sight, sized per kind.
export function makeViewModel(weaponId) {
  const group = new THREE.Group();
  const dark = gunMaterial(0x2a2c30);
  const mid = gunMaterial(0x4a4d55);
  const accent = gunMaterial(weaponId === 'longshot' ? 0x6a4a2a : PALETTE.rustMid);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  group.add(body);
  const barrelLength = weaponId === 'longshot' ? 0.55 : weaponId === 'p9' ? 0.18 : 0.34;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, barrelLength, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.25 - barrelLength / 2 + 0.1);
  group.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), accent);
  grip.position.set(0, -0.14, 0.16);
  grip.rotation.x = 0.35;
  group.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), mid);
  sight.position.set(0, 0.09, -0.05);
  group.add(sight);
  if (weaponId === 'longshot') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, -0.08);
    group.add(scope);
  } else if (weaponId === 'vulcan') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.07), dark);
    mag.position.set(0, -0.16, -0.08);
    group.add(mag);
  }
  group.position.set(0.28, -0.26, -0.55);
  return group;
}

// A short-lived muzzle flash: a point light plus a bright quad that
// fades over a few frames. Reused, never recreated per shot.
export class MuzzleFlash {
  constructor(scene) {
    this.light = new THREE.PointLight(PALETTE.muzzle, 0, 9, 2);
    this.light.position.set(0.28, -0.2, -1.1);
    scene.add(this.light);
    this.life = 0;
  }

  fire() {
    this.light.intensity = 14;
    this.life = 0.06;
  }

  update(dt) {
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) this.light.intensity = 0;
    }
  }
}
