// The bomb: carried by one attacker, dropped where its carrier
// dies, picked up by walking over it, planted by holding the plant
// key on a site for 3.2 seconds, and defused by a defender holding
// the key for 5 seconds. A planted bomb explodes after 35 seconds.
// One object owns all of that state so the round logic never has
// to guess where the bomb is.
import * as THREE from 'three';
import { SITES } from './world.js';
import { clamp } from './util.js';

export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export class Bomb {
  constructor(scene) {
    this.scene = scene;
    this.state = 'carried'; // carried | dropped | planted | exploded | defused
    this.carrier = null; // the fighter carrying it (player or bot)
    this.site = null;
    this.pos = new THREE.Vector3(0, 0.4, 24);
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.plantingBy = null;
    this.defusingBy = null;
    this.timer = BOMB_TIMER;
    this.beepAt = 0;
    this.mesh = this.buildMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.24, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 }),
    );
    group.add(body);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
    );
    light.position.set(0.14, 0.14, 0);
    group.add(light);
    this.blinker = light;
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.8 }),
    );
    antenna.position.set(-0.16, 0.24, 0);
    group.add(antenna);
    return group;
  }

  // Hand the bomb to a fighter at match start or after a pickup.
  assign(carrier) {
    this.carrier = carrier;
    this.state = 'carried';
    this.mesh.visible = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
  }

  dropAt(x, z) {
    this.carrier = null;
    this.state = 'dropped';
    this.pos.set(x, 0.35, z);
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
    this.plantingBy = null;
  }

  // True while `fighter` stands on a site and holds the plant key.
  plantStep(fighter, siteId, holding, dt) {
    if (this.state !== 'carried' || this.carrier !== fighter) return false;
    if (!holding || siteId === null) {
      this.plantProgress = 0;
      this.plantingBy = null;
      return false;
    }
    this.plantingBy = fighter;
    this.plantProgress = clamp(this.plantProgress + dt / PLANT_TIME, 0, 1);
    if (this.plantProgress >= 1) {
      this.state = 'planted';
      this.site = siteId;
      this.timer = BOMB_TIMER;
      this.pos.set(SITES[siteId].center.x, 0.35, SITES[siteId].center.z);
      this.mesh.position.copy(this.pos);
      this.mesh.visible = true;
      this.plantProgress = 0;
      this.plantingBy = null;
      return true;
    }
    return false;
  }

  defuseStep(fighter, holding, dt) {
    if (this.state !== 'planted') return false;
    if (!holding) {
      this.defuseProgress = 0;
      this.defusingBy = null;
      return false;
    }
    this.defusingBy = fighter;
    this.defuseProgress = clamp(this.defuseProgress + dt / DEFUSE_TIME, 0, 1);
    if (this.defuseProgress >= 1) {
      this.state = 'defused';
      this.mesh.visible = false;
      this.defuseProgress = 0;
      this.defusingBy = null;
      return true;
    }
    return false;
  }

  update(dt, now) {
    if (this.state === 'planted') {
      this.timer -= dt;
      // Beeps quicken as the timer runs down.
      const interval = this.timer > 20 ? 1 : this.timer > 10 ? 0.5 : 0.25;
      if (now - this.beepAt >= interval) {
        this.beepAt = now;
        this.blinker.material.color.setHex(0xff3a2a);
      } else if (now - this.beepAt > 0.09) {
        this.blinker.material.color.setHex(0x551111);
      }
      if (this.timer <= 0) {
        this.state = 'exploded';
        this.mesh.visible = false;
        return 'exploded';
      }
    }
    return null;
  }

  reset() {
    this.state = 'carried';
    this.carrier = null;
    this.site = null;
    this.timer = BOMB_TIMER;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.plantingBy = null;
    this.defusingBy = null;
    this.mesh.visible = false;
  }
}
