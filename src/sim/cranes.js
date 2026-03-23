import * as THREE from "three";
import { GRID_ROWS, WAREHOUSE_LEVELS, CELL } from "../scene/constants.js";

export function createCranes(scene, warehouses) {
  function makeCrane(sideX, colorHex) {
    const g = new THREE.Group();

    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, WAREHOUSE_LEVELS * 0.6 + 0.8, 0.18),
      new THREE.MeshStandardMaterial({ color: colorHex })
    );

    const carriage = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.20, 0.52),
      new THREE.MeshStandardMaterial({ color: 0xd7deef })
    );

    const fork = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.06, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xb8c3da })
    );

    const mastX = sideX + (sideX < 0 ? 0.55 : -0.55);
    const forkX = mastX + (sideX < 0 ? 0.55 : -0.55);

    g.add(mast, carriage, fork);

    return {
      group: g,
      sideX,
      row: 0,
      level: 0,
      holding: null,
      mast,
      carriage,
      fork,
      mastX,
      forkX,
    };
  }

  return {
    left: makeCrane(warehouses.leftRackX, 0xff6b6b),
    right: makeCrane(warehouses.rightRackX, 0x6bb6ff),
  };
}

export function craneWorldZ(row, gridH) {
  return (row + 0.5) * CELL - gridH / 2;
}

export function craneWorldY(level) {
  return 0.35 + level * 0.6;
}

export function updateCranePose(crane, gridH) {
  const z = craneWorldZ(crane.row, gridH);
  const y = craneWorldY(crane.level);
  const mastHeight = WAREHOUSE_LEVELS * 0.6 + 0.8;

  crane.mast.position.set(crane.mastX, mastHeight / 2, z);
  crane.carriage.position.set(crane.mastX, y, z);
  crane.fork.position.set(crane.forkX, y, z);

  if (crane.holding) {
    crane.holding.mesh.position.set(crane.fork.position.x, y + 0.14, z);
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function moveCrane(crane, dRow, dLevel) {
  crane.row = clamp(crane.row + dRow, 0, GRID_ROWS - 1);
  crane.level = clamp(crane.level + dLevel, 0, WAREHOUSE_LEVELS - 1);
}

export function slotAt(rack, row, level) {
  return rack.slots.find((s) => s.r === row && s.level === level);
}

export function findNearestSlot(rack, crane) {
  const fx = crane.fork.position.x;
  const fy = crane.fork.position.y;
  const fz = crane.fork.position.z;

  let best = null;
  let bestScore = Infinity;

  for (const s of rack.slots) {
    const dx = Math.abs(s.mesh.position.x - fx);
    const dy = Math.abs(s.mesh.position.y - fy);
    const dz = Math.abs(s.mesh.position.z - fz);

    if (dx > 1.0 || dy > 0.35 || dz > 0.35) continue;

    const score = dx * 0.4 + dy * 1.2 + dz;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function rackForCrane(warehouses, crane) {
  return crane.sideX < 0 ? warehouses.leftRack : warehouses.rightRack;
}

export function cranePickOrPlace(warehouses, crane) {
  const rack = rackForCrane(warehouses, crane);

  let slot = slotAt(rack, crane.row, crane.level);
  if (!slot || (!slot.occupiedBy && !crane.holding)) {
    const nearest = findNearestSlot(rack, crane);
    if (nearest) slot = nearest;
  }
  if (!slot) return;

  if (!crane.holding && slot.occupiedBy) {
    crane.holding = slot.occupiedBy;
    slot.occupiedBy = null;
    crane.holding.state = "in_crane";
  } else if (crane.holding && !slot.occupiedBy) {
    slot.occupiedBy = crane.holding;
    crane.holding = null;

    slot.occupiedBy.mesh.position.set(
      slot.mesh.position.x,
      slot.mesh.position.y + 0.18,
      slot.mesh.position.z
    );
    slot.occupiedBy.state = "on_shelf";
  }
}
