import * as THREE from 'three';
import { createTerrainWorker } from './terrain-worker-client.js';
import { createPlanetGlobeGeometry } from './planet-geometry.js';
import { addPlanetSurfaceDetail } from './planet-material.js';
import { createSurfaceTransition } from './surface-transition.js';
import { flightPatchExtent, flightPatchCoordinate } from './flight-detail.js';

// The distant globe is a visual LOD of the same spherical height function.
// The actual rover, camera, controls and streamed collision world stay active.
export function createPlanetFlight({ scene, planet, sky, camera, orbitCamera, homeland, mobile = false, hasContactTerrain = () => false }) {
    const radius = planet.radius;
    const surfaceFocus = { value: new THREE.Vector3() }, contactRadius = { value: 0 };
    const fadeHomeland = createSurfaceTransition(homeland);
    const streamedSurface = scene.getObjectByName('streamed-planet');
    const fadeStreamed = streamedSurface ? createSurfaceTransition(streamedSurface) : () => {};

    const geometry = createPlanetGlobeGeometry(planet, mobile, 1);
    const normal = new THREE.Vector3(), point = new THREE.Vector3();
    const material = new THREE.MeshStandardMaterial({ roughness: 1,
        transparent: true, opacity: 0, fog: true, depthWrite: true });
    // Sample color per fragment in planetary coordinates: vertex colors alone
    // alias kilometre-wide triangles into large, featureless patches.
    const surfaceDetail = (surface, patch = false) => {
        addPlanetSurfaceDetail(surface, {patch, surfaceFocus, contactRadius, radius});
        return surface;
    };
    surfaceDetail(material);
    const patchMaterial = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true,
        fog: true, depthWrite: true });
    surfaceDetail(patchMaterial, true);
    const patch = new THREE.Mesh(new THREE.BufferGeometry(), patchMaterial);
    patch.name = 'flight-intermediate-surface'; patch.matrixAutoUpdate = false;
    scene.add(patch);
    const previousPatch = new THREE.Mesh(patch.geometry, patchMaterial.clone());
    previousPatch.material.userData.marsFrame = patchMaterial.userData.marsFrame;
    previousPatch.material.onBeforeCompile = patchMaterial.onBeforeCompile;
    previousPatch.material.customProgramCacheKey = patchMaterial.customProgramCacheKey;
    previousPatch.name = 'flight-intermediate-previous'; previousPatch.matrixAutoUpdate = false;
    previousPatch.visible = false; scene.add(previousPatch);
    let patchBlend = 1;
    const patchCenter = new THREE.Vector3(Infinity, 0, 0);
    let patchExtent = 0;
    let patchBuild = null;
    let patchWorker = createTerrainWorker();
    const east = new THREE.Vector3(), north = new THREE.Vector3(), sample = new THREE.Vector3();
    function updatePatch(clearance, delta) {
        patch.visible = true;
        const extent = flightPatchExtent(clearance, radius);
        if (!patchBuild && patchBlend >= 1 && (patchCenter.distanceTo(point) > extent * 0.15 || Math.abs(extent - patchExtent) > extent * 0.2)) {
            const center = point.clone();
            east.set(0, 0, 1);
            if (Math.abs(normal.z) > 0.9) east.set(1, 0, 0);
            east.cross(normal).normalize(); north.crossVectors(normal, east);
            const segments = mobile ? 256 : 512;
            patchBuild = { cap: null, center, extent, segments, normal: normal.clone(), east: east.clone(), north: north.clone(), index: 0, waiting: !!patchWorker };
            if (patchWorker) {
                const job = patchBuild;
                job.completion = patchWorker.build({ type: 'patch', radius, extent, segments,
                    normal: normal.toArray(), east: east.toArray(), north: north.toArray()
                }).then(data => { job.data = data; })
                    .catch(() => { patchWorker = null; })
                    .finally(() => { job.waiting = false; });
            }
        }
        if (patchBuild && !patchBuild.waiting) {
            const job = patchBuild;
            if (!job.cap && job.data) {
                job.cap = new THREE.BufferGeometry();
                for (const name of ['position', 'normal', 'uv'])
                    job.cap.setAttribute(name, new THREE.BufferAttribute(job.data[name], name === 'uv' ? 2 : 3));
                job.cap.setIndex(new THREE.BufferAttribute(job.data.index, 1));
                job.index = job.cap.attributes.position.count;
            }
            if (!job.cap) job.cap = new THREE.PlaneGeometry(2 * job.extent, 2 * job.extent, job.segments, job.segments);
            const { cap } = job;
            const vertices = cap.attributes.position;
            const deadline = performance.now() + (mobile ? 1 : 2);
            for (; job.index < vertices.count; job.index++) {
                const i = job.index;
                if (i % 64 === 0 && performance.now() >= deadline) break;
                sample.copy(job.normal).multiplyScalar(radius)
                    .addScaledVector(job.east, flightPatchCoordinate(vertices.getX(i), job.extent))
                    .addScaledVector(job.north, flightPatchCoordinate(vertices.getY(i), job.extent)).normalize();
                sample.multiplyScalar(radius + planet.elevation(sample,true) - 0.3);
                cap.attributes.uv.setXY(i,
                    flightPatchCoordinate(vertices.getX(i), job.extent) / (2 * job.extent) + 0.5,
                    flightPatchCoordinate(vertices.getY(i), job.extent) / (2 * job.extent) + 0.5);
                vertices.setXYZ(i, sample.x, sample.y, sample.z);
            }
            if (job.index === vertices.count) {
                if (!job.data) cap.computeVertexNormals();
                patchCenter.copy(job.center); patchExtent = job.extent;
                const hadSurface = !!patch.geometry.attributes.position;
                if (previousPatch.geometry !== patch.geometry) previousPatch.geometry.dispose();
                previousPatch.geometry = patch.geometry;
                patch.geometry = cap;
                patchBlend = hadSurface ? 0 : 1;
                patchBuild = null;
            }
        }
        patchBlend = Math.min(1, patchBlend + delta / 0.45);
        const opacity = 1;
        // Keep the old surface underneath while its replacement appears.
        // This prevents a hole in coverage halfway through the blend.
        patchMaterial.opacity = opacity * THREE.MathUtils.smoothstep(patchBlend, 0, 1);
        previousPatch.material.opacity = opacity;
        previousPatch.visible = patchBlend < 1;
        // Render layers keep depth within each surface and clear it between
        // surfaces, so distant triangles cannot draw through nearer hills.
        previousPatch.renderOrder = -21; patch.renderOrder = -20;
        planet.globalToLocalMatrix(patch.matrix); patch.matrixWorldNeedsUpdate = true;
        previousPatch.matrix.copy(patch.matrix); previousPatch.matrixWorldNeedsUpdate = true;
    }
    const globe = new THREE.Mesh(geometry, material);
    globe.name = 'flight-planet-globe'; globe.matrixAutoUpdate = false; globe.renderOrder = -30;
    scene.add(globe);
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(600 * 3);
    let seed = 73419;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 600; i++) {
        const y = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
        starPositions.set([Math.cos(a) * r * radius * 5, y * radius * 5, Math.sin(a) * r * radius * 5], i * 3);
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xcbd5e5,
        size: radius * 0.004, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    stars.name = 'flight-starfield'; scene.add(stars);
    const background = scene.background.clone(), space = new THREE.Color(0x070b12);
    const zenith = sky.material?.uniforms?.zenith?.value;
    const horizon = sky.material?.uniforms?.horizon?.value;
    const skyZenith = zenith?.clone(), skyHorizon = horizon?.clone();
    const baseFog = scene.fog.density;
    let altitude = 0, spaceBlend = 0;
    return {
        terrainLayers: { sky, globe, previousPatch, patch, stars },
        async preload(position) {
            planet.toGlobal(position, point); normal.copy(point).normalize();
            updatePatch(Math.max(0, point.length() - radius - planet.elevation(normal)), 0);
            while (patchBuild) {
                if (patchBuild.completion) await patchBuild.completion;
                else await new Promise(resolve => requestAnimationFrame(resolve));
                updatePatch(Math.max(0, point.length() - radius - planet.elevation(normal)), 0);
            }
        },
        get altitude() { return altitude; },
        update(rover, delta = 1 / 60) {
            planet.toGlobal(rover.position, point);
            altitude = point.length() - radius;
            normal.copy(point).normalize();
            surfaceFocus.value.copy(point);
            for (const surface of [material, patchMaterial, previousPatch.material]) {
                planet.surfaceMatrix(surface.userData.marsFrame);
            }
            contactRadius.value = hasContactTerrain() ? 90 : 0;
            const clearance = Math.max(0, altitude - planet.elevation(normal));
            const atmosphereTarget = THREE.MathUtils.smoothstep(Math.log1p(clearance), Math.log1p(1200), Math.log1p(24000));
            spaceBlend += (atmosphereTarget - spaceBlend) * (1 - Math.exp(-3 * delta));
            const homeCoverage = 1 - THREE.MathUtils.smoothstep(planet.homeDistance(rover.position), 800, 2000);
            fadeHomeland(homeCoverage); fadeStreamed(1);
            homeland.visible = planet.homeFrame && homeCoverage > 0;
            material.opacity = 1;
            updatePatch(clearance, delta);
            globe.visible = material.opacity > 0.001;
            if (globe.visible) { planet.globalToLocalMatrix(globe.matrix); globe.matrixWorldNeedsUpdate = true; }
            stars.material.opacity = spaceBlend; stars.visible = spaceBlend > 0.001;
            stars.position.copy(camera.position);
            scene.background.copy(background).lerp(space, spaceBlend);
            if (zenith) zenith.copy(skyZenith).lerp(space, spaceBlend);
            if (horizon) horizon.copy(skyHorizon).lerp(space, spaceBlend);
            // Use the same gentle atmosphere for contact meshes and distant
            // layers. Inverse-clearance limits caused abrupt whitening near land.
            scene.fog.density = baseFog * Math.exp(-clearance / 12000);
            const far = THREE.MathUtils.lerp(2000, radius * 7 + clearance * 2,
                THREE.MathUtils.smoothstep(clearance, 0, 100));
            for (const viewCamera of [camera, orbitCamera]) if (viewCamera.far !== far) {
                viewCamera.far = far; viewCamera.updateProjectionMatrix();
            }
        }
    };
}
