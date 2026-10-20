import * as THREE from 'three';
import { planetSurface, planetSurfaceColor } from './planet-regions.js';
import { createTerrainUnderlayMask } from './terrain-underlay.js';
import { createSurfaceTransition } from './surface-transition.js';
import { terrainEdgeNormals, applyTerrainEdgeNormals } from './terrain-normals.js';
import { createTerrainMorph } from './terrain-morph.js';
import { createTerrainWorker } from './terrain-worker-client.js';
import { terrainViewProfile } from './flight-detail.js';

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
    const tileSize = 50;
    const { range, fineRange, mediumRange } = terrainViewProfile(mobile);
    const tiles = new Map();
    let terrainWorker = createTerrainWorker(), workerBusy = false, generation = 0;
    const readySamples = new Map();
    const underlay = createTerrainUnderlayMask();
    let groundReady = false;
    const group = new THREE.Group(); group.name = 'streamed-planet'; scene.add(group);
    const base = new THREE.Color(0xb97851);
    const global = new THREE.Vector3();
    let lastTransitionTime = performance.now();
    const retiring = [];
    let building = null;
    let pending = [], lastKey = '', suspended = false;
    function remove(tile) {
        if (tile.collider) world.removeCollider(tile.collider, false);
        group.remove(tile.mesh); tile.mesh.geometry.dispose();
        for (const material of new Set([...(tile.fadeMaterials ?? []), tile.mesh.material,
            ...tile.mesh.children.map(child => child.material)])) material?.dispose();
    }
    function* makeTile(tx, tz, lod, collision = lod < 2, samples = null) {
        const segments = lod === 0 ? (mobile ? 48 : 64) : lod === 1 ? 32 : lod === 2 ? 16 : 8;
        const geometry = new THREE.PlaneGeometry(tileSize, tileSize, segments, segments);
        let completed = false;
        try {
            geometry.rotateX(-Math.PI / 2);
            const positions = geometry.attributes.position;
            const uv = geometry.attributes.uv;
            const colors = new Float32Array(positions.count * 3);
            for (let i = 0; i < positions.count; i++) {
                const x = tx * tileSize + positions.getX(i) + tileSize / 2;
                const z = tz * tileSize + positions.getZ(i) + tileSize / 2;
                const y = samples ? samples.height[i] : planet.heightAt(x, z);
                positions.setXYZ(i, x, y, z);
                if (samples) {
                    uv.setXY(i, samples.uv[i * 2], samples.uv[i * 2 + 1]);
                    colors.set(samples.color.subarray(i * 3, i * 3 + 3), i * 3);
                } else {
                    planet.toGlobal(global.set(x, y, z), global);
                    uv.setXY(i, global.x / 400, global.z / 400);
                    const tint = 0.5 + 0.5 * Math.sin(global.x / 80 + global.z / 130 + global.y / 150);
                    const color = planet.surfaceColor(global.clone().normalize(), base.clone());
                    color.multiplyScalar(0.95 + tint * 0.1);
                    colors.set([color.r, color.g, color.b], i * 3);
                }
                if ((i + 1) % (segments + 1) === 0) yield;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.computeVertexNormals();
            const edgeNormals = samples?.edgeNormals ?? terrainEdgeNormals(tx, tz, segments, (x, z) => planet.heightAt(x, z));
            applyTerrainEdgeNormals(geometry, edgeNormals);
            yield;
            // The continuous planetary surface fills LOD gaps underneath.
            // Vertical skirts would show as dark walls through fading tiles.
            const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
            let collider = null;
            if (collision) collider = world.createCollider(physics.ColliderDesc.trimesh(
                new Float32Array(positions.array), new Uint32Array(geometry.index.array)).setFriction(2), groundBody);
            group.add(mesh);
            const fade = createSurfaceTransition(mesh, 'tileCoverage');
            fade(0);
            completed = true;
            return { mesh, collider, lod, fade, progress: 0,
                fadeMaterials: [mesh.material] };
        } finally { if (!completed) geometry.dispose(); }
    }
    function destroy(tile) { remove(tile); }
    function cancelBuild() { building?.generator?.return(); building = null; }
    function reset() {
        generation++; readySamples.clear();
        cancelBuild();
        for (const tile of tiles.values()) destroy(tile);
        tiles.clear();groundReady=false;
        underlay.update(new THREE.Vector3(), false, tiles, false);
        for (const tile of retiring) destroy(tile);
        retiring.length = 0; pending = []; lastKey = '';
        lastTransitionTime = performance.now();
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
                : detailDistance <= fineRange ? 1 : detailDistance <= mediumRange ? 2 : 3;
            const collision = !fastFlight && distance <= 2;
            const priority = distance <= 2 ? distance - 100 : Math.min(distance, aheadDistance + .5);
            const id = `${x}:${z}`; wanted.set(id, true);
            const existing = tiles.get(id);
            if (existing && !collision && existing.collider) {
                world.removeCollider(existing.collider, false); existing.collider = null;
            }
            if (existing && collision && !existing.collider) {
                const geometry = existing.mesh.geometry;
                existing.collider = world.createCollider(physics.ColliderDesc.trimesh(
                    new Float32Array(geometry.attributes.position.array),
                    new Uint32Array(geometry.index.array)).setFriction(2), groundBody);
            }
            // Retain finer meshes: crossing a LOD/contact boundary must not
            // throw away completed work and regenerate the same parcel.
            if (!existing || existing.lod > lod)
                pending.push({ id, x, z, lod, distance, priority, collision });
        }
        for (const [id, tile] of tiles) if (!wanted.has(id)) {
            // Retain visuals briefly after collision is no longer needed.
            if (tile.collider) { world.removeCollider(tile.collider, false); tile.collider = null; }
            underlay.apply(tile.mesh);
            retiring.push(tile); tiles.delete(id);
        }
        while (retiring.length > (mobile ? 220 : 700)) destroy(retiring.shift());
        if (building) {
            const index = pending.findIndex(task => task.id === building.task.id &&
                task.lod === building.task.lod);
            if (index < 0) cancelBuild();
            else { building.task = pending[index]; pending.splice(index, 1); }
        }
        const validSamples = new Set(pending.map(sampleKey));
        for (const key of readySamples.keys()) if (!validSamples.has(key)) readySamples.delete(key);
        pending.sort((a, b) => a.priority - b.priority);
    }
    const sampleKey = task => `${task.id}:${task.lod}`;
    function prefetch() {
        if (!terrainWorker || workerBusy) return;
        const batch = [];
        let vertices = 0;
        for (const task of pending) {
            if (readySamples.has(sampleKey(task))) continue;
            const segments = task.lod === 0 ? (mobile ? 48 : 64) : task.lod === 1 ? 32 : task.lod === 2 ? 16 : 8;
            batch.push({ ...task, segments }); vertices += (segments + 1) ** 2;
            if (batch.length >= 24 || vertices >= 16000) break;
        }
        if (!batch.length) return;
        workerBusy = true;
        const version = generation;
        terrainWorker.build({ type: 'tiles', radius: planet.radius,
            frame: planet.globalToLocalMatrix().invert().toArray(), tiles: batch
        }).then(results => {
            if (version !== generation) return;
            for (let i = 0; i < batch.length; i++) readySamples.set(sampleKey(batch[i]), results[i]);
        }).catch(() => { terrainWorker = null; })
            .finally(() => { workerBusy = false; });
    }
    function buildNext(deadline = Infinity) {
        if (!building) {
            const task = pending.shift(); if (!task) return;
            const key = sampleKey(task);
            const samples = readySamples.get(key);
            if (terrainWorker && !samples && deadline !== Infinity) { pending.unshift(task); return false; }
            readySamples.delete(key);
            building = { task, generator: makeTile(task.x, task.z, task.lod, task.collision, samples) };
        }
        const { task, generator } = building;
        let result;
        do {
            result = generator.next();
            if (!result.done && performance.now() >= deadline) return false;
        } while (!result.done);
        building = null;
        const previous = tiles.get(task.id);
        const tile = result.value;
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
            const startHeights = new Float32Array(positions.count);
            for (let i = 0; i < positions.count; i++) {
                const gx = THREE.MathUtils.clamp((positions.getX(i) / tileSize - task.x) * segments, 0, segments);
                const gz = THREE.MathUtils.clamp((positions.getZ(i) / tileSize - task.z) * segments, 0, segments);
                const x = Math.min(segments - 1, Math.floor(gx)), z = Math.min(segments - 1, Math.floor(gz));
                const u = gx - x, v = gz - z, a = z * (segments + 1) + x;
                const h00 = oldPositions.getY(a), h10 = oldPositions.getY(a + 1);
                const h01 = oldPositions.getY(a + segments + 1), h11 = oldPositions.getY(a + segments + 2);
                const height = u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00)
                    : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
                startHeights[i] = height;
            }
            tile.morph = createTerrainMorph(tile.mesh, startHeights);
            tile.morphProgress = 0; tile.progress = previous.progress;
            tile.fade(tile.progress);
            destroy(previous);
        }
        if (previous && task.collision && task.distance <= 2) destroy(previous);
        tiles.set(task.id, tile);
        return true;
    }
    return {
        reset,
        async preload(position) {
            do {
                this.update(position);
                if (this.loading) await new Promise(resolve => requestAnimationFrame(resolve));
            } while (this.loading);
            for (const tile of tiles.values()) tile.progress = 1;
            this.update(position);
        },
        bindDetails: underlay.bindDetails,
        reframe(matrix) {
            generation++; readySamples.clear();
            cancelBuild();
            // Keep the old visible surface during a floating-origin change.
            // Only collision is replaced immediately; visuals leave gradually.
            for (const tile of retiring) tile.mesh.applyMatrix4(matrix);
            for (const tile of tiles.values()) {
                if(tile.collider) {world.removeCollider(tile.collider,false);tile.collider=null;}
                tile.progress=tile.visibleCoverage??tile.progress;
                underlay.apply(tile.mesh);
                tile.mesh.applyMatrix4(matrix);tile.retireDuration=8;retiring.push(tile);
            }
            tiles.clear();pending=[];lastKey='';groundReady=false;
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
                    if(!tile?.collider)return false;
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
                if (tile.morph) {
                    tile.morphProgress = Math.min(1, tile.morphProgress + dt / 0.6);
                    const blend = THREE.MathUtils.smoothstep(tile.morphProgress, 0, 1);
                    tile.morph(blend);
                    if (tile.morphProgress === 1) tile.morph = null;
                }
            }
            for (let i = retiring.length - 1; i >= 0; i--) {
                const tile = retiring[i]; tile.progress = Math.max(0, tile.progress - dt / (tile.retireDuration ?? .9));
                tile.fade(THREE.MathUtils.smoothstep(tile.progress, 0, 1));
                if (tile.progress === 0) { destroy(tile); retiring.splice(i, 1); }
            }
            prepare(position, fastFlight, velocity);
            prefetch();
            // Following a coordinate change, contacts must exist before physics.
            if (immediate) {
                if (building) buildNext();
                while (pending[0]?.distance <= 2) buildNext();
            }
            const deadline = performance.now() + (mobile ? 3 : 5);
            let count = 0;
            while ((building || pending.length) && count < (mobile ? 3 : 6) && performance.now() < deadline) { if (!buildNext(deadline)) break; count++; }
            groundReady=hasContactSurface();underlay.update(position,groundReady,tiles,planet.homeFrame);
        },
        get loading() { return pending.length > 0 || !!building; },
        get groundReady() { return groundReady; },
        ownsCollider(handle) { return [...tiles.values()].some(tile => tile.collider?.handle === handle); },
        get count() { return tiles.size; },
        get collisionCount() { return [...tiles.values()].filter(tile => tile.collider).length; }
    };
}
