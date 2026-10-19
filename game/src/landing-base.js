import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function isLandingBaseArea(x, z) {
    return Math.hypot(x, z) < 6 || Math.hypot(x - 11, z - 9) < 10 || Math.hypot(x + 7, z - 7) < 3;
}

export function createLandingBase({ scene, world, physics, getHeight }) {
    const root = new THREE.Group(); root.name = 'papaya-landing-base'; scene.add(root);
    const hull = new THREE.MeshStandardMaterial({ color: 0xd9e0df, roughness: 0.55, metalness: 0.45 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x28343e, roughness: 0.65, metalness: 0.7 });
    const foil = new THREE.MeshStandardMaterial({ color: 0xb9944d, roughness: 0.48, metalness: 0.75 });
    const solar = new THREE.MeshStandardMaterial({ color: 0x152d52, roughness: 0.32, metalness: 0.65 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x214351, emissive: 0x245a67,
        emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.5 });
    const light = new THREE.MeshBasicMaterial({ color: 0x9ce9d4, side: THREE.DoubleSide });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffba5a });
    const dishMaterial = new THREE.MeshStandardMaterial({ color: 0xc5ced3, side: THREE.DoubleSide,
        roughness: 0.42, metalness: 0.65 });
    function piece(parent, geometry, material, x, y, z, rotation = null, collidable = false) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        if (rotation) mesh.rotation.set(...rotation);
        mesh.userData.baseCollider = collidable;
        parent.add(mesh); return mesh;
    }
    function beam(parent, from, to, radius = 0.055, material = frame, collidable = false) {
        const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
        const axis = end.clone().sub(start);
        const mesh = piece(parent, new THREE.CylinderGeometry(radius, radius, axis.length(), 6),
            material, ...(start.clone().add(end).multiplyScalar(0.5).toArray()), null, collidable);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
        return mesh;
    }

    // Ground-following paint and low perimeter beacons leave the landing pad open.
    const ring = new THREE.RingGeometry(4.5, 4.8, 64); ring.rotateX(-Math.PI / 2);
    const vertices = ring.attributes.position;
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, getHeight(vertices.getX(i), vertices.getZ(i)) + 0.035);
    ring.computeVertexNormals(); piece(root, ring, light, 0, 0, 0);
    const cross = new THREE.BoxGeometry(2.4, 0.025, 0.25);
    piece(root, cross, light, 0, getHeight(0, 0) + 0.035, 0);
    piece(root, cross, light, 0, getHeight(0, 0) + 0.035, 0, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, x = Math.cos(angle) * 5.15, z = Math.sin(angle) * 5.15;
        const y = getHeight(x, z);
        piece(root, new THREE.CylinderGeometry(0.18, 0.25, 0.14, 8), frame, x, y + 0.07, z);
        piece(root, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), light, x, y + 0.17, z);
    }

    // Elevated pressure vessels, reinforced docking collars and an external truss.
    const habitat = new THREE.Group(); habitat.position.set(10, getHeight(10, 7), 7); root.add(habitat);
    piece(habitat, new THREE.CapsuleGeometry(1.55, 3.6, 6, 16), hull, 0, 2.65, 0, [Math.PI / 2, 0, 0], true);
    const collar = new THREE.TorusGeometry(1.58, 0.085, 6, 24);
    for (const z of [-1.65, 0, 1.65]) piece(habitat, collar, frame, 0, 2.65, z);
    for (const z of [-1.45, 1.45]) piece(habitat, new THREE.TorusGeometry(1.56, 0.035, 5, 24), foil, 0, 2.65, z);
    piece(habitat, new THREE.BoxGeometry(2.2, 0.35, 3.2), foil, 0, 4.17, 0, null, true);
    for (const z of [-1, 0, 1]) piece(habitat, new THREE.BoxGeometry(2.25, 0.06, 0.08), frame, 0, 4.38, z);
    // Side laboratory and the short airlock facing the landing circle.
    piece(habitat, new THREE.CapsuleGeometry(1, 2.5, 6, 12), hull, 3.1, 2.5, 0.7, [0, 0, Math.PI / 2], true);
    piece(habitat, new THREE.TorusGeometry(1.03, 0.08, 6, 20), foil, 4.1, 2.5, 0.7, [0, Math.PI / 2, 0]);
    piece(habitat, new THREE.CylinderGeometry(0.78, 0.78, 1.7, 12), hull, -1.9, 2.2, 0, [0, 0, Math.PI / 2], true);
    piece(habitat, new THREE.CylinderGeometry(0.68, 0.68, 0.12, 12), frame, -2.8, 2.2, 0, [0, 0, Math.PI / 2]);
    piece(habitat, new THREE.TorusGeometry(0.72, 0.065, 6, 20), light, -2.87, 2.2, 0, [0, Math.PI / 2, 0]);
    for (const z of [-0.26, 0.26]) piece(habitat, new THREE.BoxGeometry(0.07, 0.34, 0.055), foil, -2.9, 2.2, z);
    // Recessed circular instrument ports, with no domestic windows or roof.
    for (const z of [-1.15, 1.15]) {
        piece(habitat, new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), glass, -1.52, 2.9, z, [0, 0, Math.PI / 2]);
        piece(habitat, new THREE.TorusGeometry(0.27, 0.04, 5, 16), frame, -1.57, 2.9, z, [0, Math.PI / 2, 0]);
    }
    for (const x of [-1.45, 1.45]) for (const z of [-1.7, 1.7]) {
        const floor = getHeight(x + 10, z + 7) - habitat.position.y;
        beam(habitat, [x, 1.7, z], [x * 1.25, floor + 0.15, z], 0.11, frame, true);
        piece(habitat, new THREE.CylinderGeometry(0.3, 0.42, 0.16, 6), foil, x * 1.25, floor + 0.08, z);
    }
    beam(habitat, [-1.8, 0.5, -1.7], [1.45, 1.25, 1.7]);
    beam(habitat, [1.8, 0.5, -1.7], [-1.45, 1.25, 1.7]);
    piece(habitat, new THREE.BoxGeometry(1.7, 0.12, 1.8), frame, -2, 1.25, 0, null, true);
    // Two visible cryogenic tanks and a radiator with repeated cooling fins.
    for (const z of [-0.6, 0.6]) {
        piece(habitat, new THREE.CapsuleGeometry(0.32, 1.2, 4, 10), foil, 1.55, 1.3, z, null, true);
        piece(habitat, new THREE.TorusGeometry(0.34, 0.045, 5, 12), frame, 1.55, 1.3, z, [Math.PI / 2, 0, 0]);
    }
    piece(habitat, new THREE.BoxGeometry(0.16, 2.4, 2), frame, 5.1, 3.5, 0.7, null, true);
    const fin = new THREE.BoxGeometry(0.3, 0.045, 1.85);
    for (let i = 0; i < 12; i++) piece(habitat, fin, hull, 5.15, 2.45 + i * 0.19, 0.7);
    piece(habitat, new THREE.CylinderGeometry(0.035, 0.055, 1.4, 6), frame, 0.7, 4.95, 0.5);
    piece(habitat, new THREE.SphereGeometry(0.11, 8, 6), amber, 0.7, 5.7, 0.5);

    const panelShape = new THREE.BoxGeometry(2.6, 0.1, 2);
    const cellLine = new THREE.BoxGeometry(0.018, 0.018, 1.92);
    for (const x of [7.5, 11, 14.5]) {
        const array = new THREE.Group(); array.position.set(x, getHeight(x, 13), 13); root.add(array);
        piece(array, new THREE.CylinderGeometry(0.09, 0.15, 1.3, 8), frame, 0, 0.65, 0, null, true);
        const wing = new THREE.Group(); wing.position.y = 1.4; wing.rotation.x = -0.3; array.add(wing);
        piece(wing, panelShape, solar, 0, 0, 0, null, true);
        for (let i = -3; i <= 3; i++) piece(wing, cellLine, hull, i * 0.35, 0.06, 0);
        beam(array, [-1, 1.1, 0], [0, 0.35, 0]); beam(array, [1, 1.1, 0], [0, 0.35, 0]);
    }

    const mast = new THREE.Group(); mast.position.set(-7, getHeight(-7, 7), 7); root.add(mast);
    for (const x of [-0.6, 0.6]) {
        beam(mast, [x, 0.2, -0.45], [0, 4.4, 0], 0.07, frame, true);
        beam(mast, [x, 0.2, 0.45], [0, 4.4, 0], 0.07, frame, true);
    }
    for (let i = 0; i < 4; i++) beam(mast, [-0.5 + i * 0.1, i + 0.4, -0.3], [0.4 - i * 0.08, i + 1.3, 0.3]);
    const dish = new THREE.Group(); dish.position.y = 4.5; dish.rotation.set(0.25, 0, -0.55); mast.add(dish);
    const profile = Array.from({ length: 13 }, (_, i) => new THREE.Vector2(i / 8, 0.24 * (i / 8) ** 2));
    piece(dish, new THREE.LatheGeometry(profile, 24), dishMaterial, 0, 0, 0, null, true);
    piece(dish, new THREE.TorusGeometry(1.5, 0.055, 6, 24), frame, 0, 0.54, 0, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        beam(dish, [Math.cos(a) * 1.4, 0.5, Math.sin(a) * 1.4], [0, 1.25, 0], 0.025);
    }
    piece(dish, new THREE.CylinderGeometry(0.1, 0.16, 0.3, 8), foil, 0, 1.25, 0);

    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#122b31e8'; ctx.fillRect(0, 0, 768, 160);
    ctx.fillStyle = '#9ce9d4'; ctx.fillRect(0, 0, 8, 160); ctx.fillRect(760, 0, 8, 160);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eef3e6'; ctx.font = 'bold 64px system-ui'; ctx.fillText('BASE PAPAYA', 384, 80);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
    label.position.set(10, habitat.position.y + 6.4, 7); label.scale.set(6.6, 1.375, 1); root.add(label);

    // Static parts share one draw per material. Colliders retain the actual
    // transformed equipment shapes, while trim and lights stay decorative.
    root.updateMatrixWorld(true);
    const batches = new Map(), originals = new Set(), meshes = [];
    root.traverse(mesh => {
        if (!mesh.isMesh) return;
        meshes.push(mesh); originals.add(mesh.geometry);
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        if (!batches.has(mesh.material)) batches.set(mesh.material, []);
        batches.get(mesh.material).push(geometry);
        if (mesh.userData.baseCollider) {
            const desc = physics.ColliderDesc.convexHull(new Float32Array(geometry.attributes.position.array));
            if (desc) world.createCollider(desc.setFriction(1.5).setRestitution(0));
        }
    });
    for (const mesh of meshes) mesh.removeFromParent();
    for (const [material, geometries] of batches) {
        const merged = mergeGeometries(geometries);
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = !material.isMeshBasicMaterial;
        mesh.receiveShadow = !material.isMeshBasicMaterial; root.add(mesh);
        for (const geometry of geometries) geometry.dispose();
    }
    for (const geometry of originals) geometry.dispose();
    return root;
}
