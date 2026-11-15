// Dustline Yard: an original desert-town yard with two bomb sites, a mid lane and
// a long sightline. One build pass creates the meshes, the AABB colliders the
// simulation uses, the waypoint graph the bots walk, and the spawn points.
import * as THREE from 'three';
import { PALETTE, CONFIG } from './state.js';
import { makeTextures } from './textures.js';

export function createWorld(scene) {
  const tex = makeTextures();
  const colliders = [];
  const hitMeshes = [];

  const sandMat = new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.6, metalness: 0.5 });
  const tealMat = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.7, emissive: PALETTE.teal, emissiveIntensity: 0.25 });
  const amberMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, roughness: 0.7, emissive: PALETTE.amber, emissiveIntensity: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 1 });

  // Warm dusk: low sun from the west, soft sky fill, warm fog.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 38, 110);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
  sun.position.set(-30, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xffe0b0, 0x6b4f30, 0.55);
  scene.add(sky);

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.mapW + 30, CONFIG.mapD + 30), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  hitMeshes.push(ground);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function addBox(cx, cz, w, d, h, mat, collide = true) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    hitMeshes.push(m);
    if (collide) colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top: h });
    return m;
  }

  const W = CONFIG.mapW / 2;
  const D = CONFIG.mapD / 2;
  const H = CONFIG.wallH;
  // Perimeter walls.
  addBox(0, -D - 0.5, CONFIG.mapW + 2, 1, H, wallMat);
  addBox(0, D + 0.5, CONFIG.mapW + 2, 1, H, wallMat);
  addBox(-W - 0.5, 0, 1, CONFIG.mapD + 2, H, wallMat);
  addBox(W + 0.5, 0, 1, CONFIG.mapD + 2, H, wallMat);
  // Corner watchtowers (visual landmarks, solid).
  addBox(-W + 2, -D + 2, 3, 3, 6, metalMat);
  addBox(W - 2, -D + 2, 3, 3, 6, metalMat);

  // --- Site A (north-east, teal) and Site B (north-west, amber) ---
  function siteMarker(cx, cz, mat) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 6), mat);
    plate.position.set(cx, 0.06, cz);
    plate.receiveShadow = true;
    scene.add(plate);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), metalMat);
    pole.position.set(cx - 3.6, 1.7, cz - 2.6);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc46b, emissiveIntensity: 1.6 }));
    lamp.position.set(cx - 3.6, 3.5, cz - 2.6);
    scene.add(lamp);
  }
  siteMarker(24, -15, tealMat);
  siteMarker(-24, -15, amberMat);

  // --- Interior: mid wall with a gap, long-lane cover, site cover ---
  addBox(-8, -6, 8, 1, 2.6, wallMat);      // mid wall west of gap
  addBox(8, -6, 8, 1, 2.6, wallMat);       // mid wall east of gap
  addBox(0, 2, 1, 10, 2.6, wallMat);       // mid spine, forces a corner turn
  addBox(-14, 8, 6, 1, 2.2, wallMat);      // south-west lane wall
  addBox(14, 8, 6, 1, 2.2, wallMat);       // south-east lane wall
  addBox(-24, -2, 1, 8, 2.4, wallMat);     // B approach wall
  addBox(24, -2, 1, 8, 2.4, wallMat);      // A approach wall

  // Crates: low cover (1.2) you can shoot over while crouched behind, tall stacks (2.4).
  const crates = [
    [-18, -12, 2, 2, 1.2], [-18, -9.5, 2, 2, 2.4], [18, -12, 2, 2, 1.2],
    [18, -9.5, 2, 2, 2.4], [26, -18, 2, 2, 1.2], [-26, -18, 2, 2, 1.2],
    [0, -13, 3, 1.5, 1.2], [-6, 13, 2, 2, 1.2], [6, 13, 2, 2, 1.2],
    [-10, -14, 2, 2, 2.4], [10, -14, 2, 2, 2.4], [0, 18, 2, 2, 1.2],
    [-28, 4, 2, 2, 2.4], [28, 4, 2, 2, 2.4], [-4, -18, 2, 2, 1.2],
    [4, -18, 2, 2, 1.2], [14, 2, 2, 2, 1.2], [-14, 2, 2, 2, 1.2],
  ];
  for (const [x, z, w, d, h] of crates) addBox(x, z, w, d, h, crateMat);

  // A rusted fuel tank and a water tower: tall silhouettes for the skyline.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 20), metalMat);
  tank.position.set(-29, 1.5, 14);
  tank.castShadow = true;
  tank.receiveShadow = true;
  scene.add(tank);
  hitMeshes.push(tank);
  colliders.push({ minX: -31.2, maxX: -26.8, minZ: 11.8, maxZ: 16.2, top: 3 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), darkMat);
  tower.position.set(29, 5.2, 14);
  tower.castShadow = true;
  scene.add(tower);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.4, 0.25), metalMat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    leg.position.set(29 + Math.cos(a) * 1.2, 2.2, 14 + Math.sin(a) * 1.2);
    scene.add(leg);
  }
  colliders.push({ minX: 27.4, maxX: 30.6, minZ: 12.4, maxZ: 15.6, top: 6.4 });

  // Waypoint graph: nodes bots walk between. Edges are implicit — a bot picks a
  // random node within 26 m it can reach in a straight line (no wall between).
  const waypoints = [
    { x: 0, z: 18 }, { x: -12, z: 14 }, { x: 12, z: 14 },
    { x: -20, z: 8 }, { x: 20, z: 8 }, { x: -6, z: 4 }, { x: 6, z: 4 },
    { x: 0, z: -2 }, { x: -14, z: -6 }, { x: 14, z: -6 },
    { x: -24, z: -12 }, { x: 24, z: -12 }, { x: -24, z: -18 }, { x: 24, z: -18 },
    { x: 0, z: -16 }, { x: -10, z: -18 }, { x: 10, z: -18 },
    { x: -28, z: 16 }, { x: 28, z: 16 }, { x: 0, z: 10 },
  ];

  return {
    colliders,
    hitMeshes,
    waypoints,
    sites: {
      A: { x: 24, z: -15, team: 'jackals' },
      B: { x: -24, z: -15, team: 'jackals' },
    },
    spawns: {
      vipers: [{ x: -6, z: 19 }, { x: 0, z: 20 }, { x: 6, z: 19 }, { x: -2, z: 17 }],
      jackals: [{ x: -6, z: -19 }, { x: 0, z: -20 }, { x: 6, z: -19 }, { x: 2, z: -17 }],
    },
  };
}
