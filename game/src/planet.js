import * as THREE from 'three';
import { planetSurface, planetSurfaceColor } from './planet-regions.js';
import { createTerrainUnderlayMask } from './terrain-underlay.js';
import { createSurfaceTransition } from './surface-transition.js';

const UP = new THREE.Vector3(0, 1, 0);
const smooth = THREE.MathUtils.smoothstep;

// Double-precision planetary coordinates, with a small tangent-space physics
// world. Reframing changes coordinates, never the rover's planetary position.
export function createMarsPlanet({ radius = 50000, homeHeight }) {
    const origin = new THREE.Vector3(0, radius, 0);
    const orientation = new THREE.Quaternion();
    const inverse = new THREE.Quaternion();
    const point = new THREE.Vector3();
    const direction = new THREE.Vector3();
    let homeFrame = true;
    function toGlobal(local, result = new THREE.Vector3()) {
        return result.copy(local).applyQuaternion(orientation).add(origin);
    }
    function toLocal(global, result = new THREE.Vector3()) {
        return result.copy(global).sub(origin).applyQuaternion(inverse);
    }
    function elevation(normal, groundDetail = true) {
        const x = normal.x * radius, y = normal.y * radius, z = normal.z * radius;
        const emptyHeight = planetSurface(normal, radius, groundDetail).height;
        const homeDistance = normal.y > 0 ? Math.max(Math.abs(x), Math.abs(z)) : Infinity;
        if (homeDistance >= 320) return emptyHeight;
        return THREE.MathUtils.lerp(homeHeight(x, z), emptyHeight, smooth(homeDistance, 200, 320));
    }
    function heightAt(x, z, canonical = false) {
        let height = 0;
        for (let i = 0; i < 4; i++) {
            const localY = Math.sqrt(Math.max(1, (radius + height) ** 2 - x * x - z * z)) - radius;
            point.set(x, localY, z);
            if (canonical) { direction.copy(point); direction.y += radius; direction.normalize(); }
            else toGlobal(point, direction).normalize();
            height = elevation(direction);
        }
        return Math.sqrt(Math.max(1, (radius + height) ** 2 - x * x - z * z)) - radius;
    }
    function homeDistance(local) {
        toGlobal(local, point).normalize();
        return radius * Math.atan2(Math.hypot(point.x, point.z), point.y);
    }
    function reframe(local, forceHome = false) {
        const oldMatrix = new THREE.Matrix4().compose(origin, orientation, new THREE.Vector3(1, 1, 1));
        if (forceHome) {
            origin.set(0, radius, 0); orientation.identity(); homeFrame = true;
        } else {
            toGlobal(local, point).normalize();
            direction.copy(UP).applyQuaternion(orientation);
            const transport = new THREE.Quaternion().setFromUnitVectors(direction, point);
            orientation.premultiply(transport).normalize();
            origin.copy(point).multiplyScalar(radius);
            homeFrame = false;
        }
        inverse.copy(orientation).invert();
        const newMatrix = new THREE.Matrix4().compose(origin, orientation, new THREE.Vector3(1, 1, 1));
        return newMatrix.invert().multiply(oldMatrix);
    }
    return {
        radius, surface: normal => planetSurface(normal, radius),
        surfaceColor: (normal, target) => planetSurfaceColor(normal, radius, target), heightAt, heightAtHome: (x, z) => heightAt(x, z, true), elevation, toGlobal, toLocal, homeDistance, reframe,
        get homeFrame() { return homeFrame; },
        shouldReframe(local, frameDistance = 250) {
            const distance = homeDistance(local);
            if (!homeFrame && distance < 2000) return 'home';
            if (homeFrame) return distance > 2200 ? 'local' : null;
            return Math.hypot(local.x, local.z) > frameDistance ? 'local' : null;
        },
        globalToLocalMatrix(result = new THREE.Matrix4()) {
            return result.compose(origin, orientation, new THREE.Vector3(1, 1, 1)).invert();
        },
        surfaceMatrix(result = new THREE.Matrix4()) {
            result.compose(origin, orientation, new THREE.Vector3(1, 1, 1));
            result.elements[13] -= radius;
            return result;
        },
        directionToGlobal(local, result = new THREE.Vector3()) { return result.copy(local).applyQuaternion(orientation); },
        directionToLocal(global, result = new THREE.Vector3()) { return result.copy(global).applyQuaternion(inverse); },
        upAt(local, result) { return result.set(local.x, local.y + radius, local.z).normalize(); },
        homePosition(local, result = new THREE.Vector3()) {
            toGlobal(local, result);
            const altitude = result.length() - radius;
            result.normalize().multiplyScalar(radius);
            result.y = altitude;
            return result;
        },
        coordinates(local) {
            toGlobal(local, point).normalize();
            return { latitude: THREE.MathUtils.radToDeg(Math.asin(point.y)),
                longitude: THREE.MathUtils.radToDeg(Math.atan2(point.x, point.z)), altitude: toGlobal(local, direction).length() - radius };
        }
    };
}

// Bounded, disposable terrain tiles. Nearby tiles have collision and finer
// sampling; distant tiles are visual only. Nothing allocates a whole globe.
export function createPlanetStreamer({ planet, scene, world, physics, groundBody, material, mobile = false }) {
    const tileSize = 50, range = mobile ? 8 : 12;
    const tiles = new Map();
    const underlay = createTerrainUnderlayMask();
    let groundReady = false;
    let background = null;
    const group = new THREE.Group(); group.name = 'streamed-planet'; scene.add(group);
    const base = new THREE.Color(0xb97851), light = new THREE.Color(0xc89a73);
    const global = new THREE.Vector3();
    let lastTransitionTime = performance.now();
    const retiring = [];
    let pending = [], lastKey = '', backgroundKey = '', suspended = false;
    function makeBackground(position) {
        const centerX = Math.floor(position.x / 2000) * 2000, centerZ = Math.floor(position.z / 2000) * 2000;
        // A single coarse patch beneath the detailed tiles hides their distant
        // boundary and incremental loading through the atmospheric haze.
        const geometry = new THREE.PlaneGeometry(6000, 6000, 48, 48);
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.attributes.position, uv = geometry.attributes.uv;
        const colors = new Float32Array(positions.count * 3);
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i) + centerX, z = positions.getZ(i) + centerZ;
            const y = planet.heightAt(x, z) - 10;
            positions.setXYZ(i, x, y, z);
            planet.toGlobal(global.set(x, y, z), global);
            uv.setXY(i, global.x / 400, global.z / 400);
            const color = planet.surfaceColor(global.clone().normalize(), base.clone());
            colors.set([color.r, color.g, color.b], i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        background = new THREE.Mesh(geometry, material);
        background.name = 'distant-planet-surface';
        underlay.apply(background);
        group.add(background);
    }
    function remove(tile) {
        if (tile.collider) world.removeCollider(tile.collider, false);
        group.remove(tile.mesh); tile.mesh.geometry.dispose();
        for (const material of new Set([...(tile.fadeMaterials ?? []), tile.mesh.material,
            ...tile.mesh.children.map(child => child.material)])) material?.dispose();
    }
    function makeTile(tx, tz, lod, collision = lod < 2) {
        const segments = lod === 0 ? (mobile ? 48 : 64) : lod === 1 ? 32 : lod === 2 ? 16 : 8;
        const geometry = new THREE.PlaneGeometry(tileSize, tileSize, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        const colors = new Float32Array(positions.count * 3);
        for (let i = 0; i < positions.count; i++) {
            const x = tx * tileSize + positions.getX(i) + tileSize / 2;
            const z = tz * tileSize + positions.getZ(i) + tileSize / 2;
            const y = planet.heightAt(x, z);
            positions.setXYZ(i, x, y, z);
            planet.toGlobal(global.set(x, y, z), global);
            uv.setXY(i, global.x / 400, global.z / 400);
            const tint = 0.5 + 0.5 * Math.sin(global.x / 80 + global.z / 130 + global.y / 150);
            const color = planet.surfaceColor(global.clone().normalize(), base.clone());
            color.multiplyScalar(0.95 + tint * 0.1);
            colors.set([color.r, color.g, color.b], i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        // Lower skirts close the small gaps between different mesh resolutions.
        const edge = [];
        for (let i = 0; i <= segments; i++) edge.push(i);
        for (let i = 1; i <= segments; i++) edge.push(i * (segments + 1) + segments);
        for (let i = segments - 1; i >= 0; i--) edge.push(segments * (segments + 1) + i);
        for (let i = segments - 1; i > 0; i--) edge.push(i * (segments + 1));
        const skirtPositions = [], skirtColors = [], skirtUVs = [];
        for (let i = 0; i < edge.length; i++) {
            const a = edge[i], b = edge[(i + 1) % edge.length];
            for (const [index, down] of [[a, 0], [a, 1], [b, 0], [b, 0], [a, 1], [b, 1]]) {
                skirtPositions.push(positions.getX(index), positions.getY(index) - down * 1.5, positions.getZ(index));
                skirtColors.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]);
                skirtUVs.push(uv.getX(index), uv.getY(index));
            }
        }
        const skirt = new THREE.BufferGeometry();
        skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
        skirt.setAttribute('color', new THREE.Float32BufferAttribute(skirtColors, 3));
        skirt.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUVs, 2));
        skirt.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
        const skirtMesh = new THREE.Mesh(skirt, material); mesh.add(skirtMesh);
        let collider = null;
        if (collision) collider = world.createCollider(physics.ColliderDesc.trimesh(
            new Float32Array(positions.array), new Uint32Array(geometry.index.array)).setFriction(2), groundBody);
        group.add(mesh);
        const fade = createSurfaceTransition(mesh, 'tileCoverage');
        fade(0);
        return { mesh, collider, lod, skirt, fade, progress: 0,
            fadeMaterials: [...new Set([mesh.material, skirtMesh.material])] };
    }
    function destroy(tile) { tile.skirt.dispose(); remove(tile); }
    function reset() {
        for (const tile of tiles.values()) destroy(tile);
        tiles.clear();groundReady=false;
        for (const tile of retiring) destroy(tile);
        retiring.length = 0; pending = []; lastKey = '';
        lastTransitionTime = performance.now();
        if (background) { group.remove(background); background.geometry.dispose(); background.material.dispose(); background = null; }
    }
    function prepare(position, fastFlight, velocity) {
        const cx = Math.floor(position.x / tileSize), cz = Math.floor(position.z / tileSize);
        const leadX = THREE.MathUtils.clamp((velocity?.x ?? 0) * .65, -range*tileSize*.6, range*tileSize*.6);
        const leadZ = THREE.MathUtils.clamp((velocity?.z ?? 0) * .65, -range*tileSize*.6, range*tileSize*.6);
        const px = Math.floor((position.x+leadX)/tileSize), pz = Math.floor((position.z+leadZ)/tileSize);
        const centerX = Math.round((cx+px)/2), centerZ = Math.round((cz+pz)/2);
        const key = `${cx}:${cz}:${px}:${pz}:${planet.homeFrame}:${fastFlight}`;
        if (key === lastKey) return;
        lastKey = key;
        const wanted = new Map(); pending = [];
        const activeRange = range;
        for (let dz = -activeRange; dz <= activeRange; dz++) for (let dx = -activeRange; dx <= activeRange; dx++) {
            const x = centerX + dx, z = centerZ + dz;
            if (planet.homeFrame && x >= -4 && x < 4 && z >= -4 && z < 4) continue;
            const distance = Math.max(Math.abs(x-cx), Math.abs(z-cz));
            const aheadDistance = Math.max(Math.abs(x-px), Math.abs(z-pz));
            const detailDistance = Math.min(distance, aheadDistance + 1);
            const lod = !fastFlight && detailDistance <= (mobile ? 1 : 2) ? 0
                : detailDistance <= (mobile ? 3 : 4) ? 1 : detailDistance <= 8 ? 2 : 3;
            const collision = !fastFlight && distance <= 2;
            const priority = distance <= 2 ? distance - 100 : Math.min(distance, aheadDistance + .5);
            const id = `${x}:${z}`; wanted.set(id, true);
            if (tiles.get(id)?.lod !== lod || !!tiles.get(id)?.collider !== collision)
                pending.push({ id, x, z, lod, distance, priority, collision });
        }
        for (const [id, tile] of tiles) if (!wanted.has(id)) {
            // Retain visuals briefly after collision is no longer needed.
            if (tile.collider) { world.removeCollider(tile.collider, false); tile.collider = null; }
            underlay.apply(tile.mesh);
            retiring.push(tile); tiles.delete(id);
        }
        while (retiring.length > (mobile ? 220 : 700)) destroy(retiring.shift());
        pending.sort((a, b) => a.priority - b.priority);
    }
    function buildNext() {
        const task = pending.shift(); if (!task) return;
        const previous = tiles.get(task.id);
        const tile = makeTile(task.x, task.z, task.lod, task.collision);
        tile.tx=task.x;tile.tz=task.z;
        // Required nearby geometry is ready at full coverage. Reframing keeps
        // its previous surface underneath, rather than fading a hole at our feet.
        if(task.distance<=2) {tile.progress=1;tile.fade(1);}
        if (previous && (!task.collision || task.distance > 2)) {
            // Start the new visual mesh on the old triangulated surface, then
            // morph toward its finer height samples. Collision stays exact.
            const old = previous.mesh.geometry;
            const oldPositions = old.attributes.position;
            const segments = old.parameters.widthSegments;
            const positions = tile.mesh.geometry.attributes.position;
            const target = new Float32Array(positions.array);
            for (let i = 0; i < positions.count; i++) {
                const gx = THREE.MathUtils.clamp((positions.getX(i) / tileSize - task.x) * segments, 0, segments);
                const gz = THREE.MathUtils.clamp((positions.getZ(i) / tileSize - task.z) * segments, 0, segments);
                const x = Math.min(segments - 1, Math.floor(gx)), z = Math.min(segments - 1, Math.floor(gz));
                const u = gx - x, v = gz - z, a = z * (segments + 1) + x;
                const h00 = oldPositions.getY(a), h10 = oldPositions.getY(a + 1);
                const h01 = oldPositions.getY(a + segments + 1), h11 = oldPositions.getY(a + segments + 2);
                const height = u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00)
                    : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
                positions.setY(i, height);
            }
            tile.morphStart = new Float32Array(positions.array); tile.morphTarget = target;
            tile.morphProgress = 0; tile.progress = previous.progress;
            tile.fade(tile.progress);
            tile.mesh.geometry.computeVertexNormals();
            destroy(previous);
        }
        if (previous && task.collision && task.distance <= 2) destroy(previous);
        tiles.set(task.id, tile);
    }
    return {
        reset,
        bindDetails: underlay.bindDetails,
        reframe(matrix) {
            // Keep the old visible surface during a floating-origin change.
            // Only collision is replaced immediately; visuals leave gradually.
            for (const tile of retiring) tile.mesh.applyMatrix4(matrix);
            for (const tile of tiles.values()) {
                if(tile.collider) {world.removeCollider(tile.collider,false);tile.collider=null;}
                tile.progress=tile.visibleCoverage??tile.progress;
                underlay.apply(tile.mesh);
                tile.mesh.applyMatrix4(matrix);tile.retireDuration=2;retiring.push(tile);
            }
            tiles.clear();pending=[];lastKey='';groundReady=false;
            if(background) {group.remove(background);background.geometry.dispose();background.material.dispose();background=null;}
            while(retiring.length>(mobile?220:700))destroy(retiring.shift());
        },
        suspend() { if (!suspended) { reset(); suspended = true; } },
        resume() { suspended = false; },
        update(position, immediate = false, fastFlight = false, velocity = null) {
            if (suspended) return;
            const cx=Math.floor(position.x/tileSize),cz=Math.floor(position.z/tileSize);
            function hasContactSurface() {
                for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++) {
                    const x=cx+dx,z=cz+dz;
                    if(planet.homeFrame&&x>=-4&&x<4&&z>=-4&&z<4)continue;
                    const tile=tiles.get(`${x}:${z}`);
                    if(!tile?.collider || tile.morphTarget)return false;
                }
                return true;
            }
            const now = performance.now();
            const dt = Math.min(0.1, Math.max(0, (now - lastTransitionTime) / 1000));
            lastTransitionTime = now;
            for (const tile of tiles.values()) {
                tile.progress = Math.min(1, tile.progress + dt / 0.35);
                const distance=Math.max(Math.abs((tile.tx+.5)*tileSize-position.x),Math.abs((tile.tz+.5)*tileSize-position.z));
                const edgeCoverage=1-THREE.MathUtils.smoothstep(distance,(range-4)*tileSize,(range-1)*tileSize);
                tile.visibleCoverage=THREE.MathUtils.smoothstep(tile.progress,0,1)*edgeCoverage;
                tile.fade(tile.visibleCoverage);tile.mesh.visible=tile.visibleCoverage>.001;
                if (tile.morphTarget) {
                    tile.morphProgress = Math.min(1, tile.morphProgress + dt / 0.6);
                    const blend = THREE.MathUtils.smoothstep(tile.morphProgress, 0, 1);
                    const vertices = tile.mesh.geometry.attributes.position;
                    for (let i = 0; i < vertices.count; i++) vertices.setY(i,
                        THREE.MathUtils.lerp(tile.morphStart[i * 3 + 1], tile.morphTarget[i * 3 + 1], blend));
                    vertices.needsUpdate = true;
                    tile.mesh.geometry.computeVertexNormals();
                    if (tile.morphProgress === 1) { tile.morphStart = null; tile.morphTarget = null; }
                }
            }
            for (let i = retiring.length - 1; i >= 0; i--) {
                const tile = retiring[i]; tile.progress = Math.max(0, tile.progress - dt / (tile.retireDuration ?? .9));
                tile.fade(THREE.MathUtils.smoothstep(tile.progress, 0, 1));
                if (tile.progress === 0) { destroy(tile); retiring.splice(i, 1); }
            }
            const key = `${Math.floor(position.x / 2000)}:${Math.floor(position.z / 2000)}`;
            if (!background || key !== backgroundKey) {
                if (background) { group.remove(background); background.geometry.dispose(); background.material.dispose(); }
                makeBackground(position); backgroundKey = key;
            }
            prepare(position, fastFlight, velocity);
            // Following a coordinate change, contacts must exist before physics.
            while (pending[0]?.distance <= (immediate ? 2 : 1)) buildNext();
            const deadline = performance.now() + (mobile ? 3 : 5);
            let count = 0;
            while (pending.length && count < (mobile ? 3 : 6) && performance.now() < deadline) { buildNext(); count++; }
            groundReady=hasContactSurface();underlay.update(position,groundReady,tiles,planet.homeFrame);
        },
        get groundReady() { return groundReady; },
        ownsCollider(handle) { return [...tiles.values()].some(tile => tile.collider?.handle === handle); },
        get count() { return tiles.size; },
        get collisionCount() { return [...tiles.values()].filter(tile => tile.collider).length; }
    };
}
