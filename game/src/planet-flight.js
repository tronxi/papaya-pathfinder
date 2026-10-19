import * as THREE from 'three';
import { createPlanetGlobeGeometry } from './planet-geometry.js';
import { addPlanetSurfaceDetail } from './planet-material.js';
import { createSurfaceTransition } from './surface-transition.js';

// The distant globe is a visual LOD of the same spherical height function.
// The actual rover, camera, controls and streamed collision world stay active.
export function createPlanetFlight({ scene, planet, sky, camera, orbitCamera, homeland, mobile = false, hasContactTerrain = () => false }) {
    const radius = planet.radius;
    const surfaceFocus = { value: new THREE.Vector3() }, contactRadius = { value: 0 };
    const fadeHomeland = createSurfaceTransition(homeland);
    const streamedSurface = scene.getObjectByName('streamed-planet');
    const fadeStreamed = streamedSurface ? createSurfaceTransition(streamedSurface) : () => {};
    let detailCoverage = 1;
    const geometry = createPlanetGlobeGeometry(planet, mobile, 1);
    const normal = new THREE.Vector3(), point = new THREE.Vector3();
    const material = new THREE.MeshStandardMaterial({ roughness: 1,
        transparent: true, opacity: 0, fog: false, depthWrite: true });
    // Sample color per fragment in planetary coordinates: vertex colors alone
    // alias kilometre-wide triangles into large, featureless patches.
    const surfaceDetail = (surface, patch = false) =>
        addPlanetSurfaceDetail(surface, {patch, surfaceFocus, contactRadius});
    surfaceDetail(material);
    const patchMaterial = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true,
        fog: false, depthWrite: false });
    // Enable UV varying for the soft perimeter without allocating a texture.
    patchMaterial.defines = { USE_UV: '' };
    surfaceDetail(patchMaterial, true);
    const patch = new THREE.Mesh(new THREE.BufferGeometry(), patchMaterial);
    patch.name = 'flight-intermediate-surface'; patch.matrixAutoUpdate = false;
    scene.add(patch);
    const previousPatch = new THREE.Mesh(patch.geometry, patchMaterial.clone());
    previousPatch.material.onBeforeCompile = patchMaterial.onBeforeCompile;
    previousPatch.material.customProgramCacheKey = patchMaterial.customProgramCacheKey;
    previousPatch.name = 'flight-intermediate-previous'; previousPatch.matrixAutoUpdate = false;
    previousPatch.visible = false; scene.add(previousPatch);
    let patchBlend = 1;
    const patchCenter = new THREE.Vector3(Infinity, 0, 0);
    let patchExtent = 0;
    const east = new THREE.Vector3(), north = new THREE.Vector3(), sample = new THREE.Vector3();
    function updatePatch(clearance, delta) {
        patch.visible = clearance > 15 && clearance < 22000;
        if (!patch.visible) { previousPatch.visible = false; return; }
        const extent = Math.min(24000, Math.max(2200, clearance * 6));
        if (patchBlend >= 1 && (patchCenter.distanceTo(point) > extent * 0.15 || Math.abs(extent - patchExtent) > extent * 0.2)) {
            patchCenter.copy(point); patchExtent = extent;
            east.set(0, 0, 1);
            if (Math.abs(normal.z) > 0.9) east.set(1, 0, 0);
            east.cross(normal).normalize(); north.crossVectors(normal, east);
            const cap = new THREE.PlaneGeometry(2 * extent, 2 * extent, mobile ? 64 : 128, mobile ? 64 : 128);
            const vertices = cap.attributes.position;
            for (let i = 0; i < vertices.count; i++) {
                sample.copy(normal).multiplyScalar(radius)
                    .addScaledVector(east, vertices.getX(i)).addScaledVector(north, vertices.getY(i)).normalize();
                sample.multiplyScalar(radius + planet.elevation(sample,extent*2/(mobile?64:128)<6) - 0.3);
                vertices.setXYZ(i, sample.x, sample.y, sample.z);
            }
            cap.computeVertexNormals();
            const hadSurface = !!patch.geometry.attributes.position;
            if (previousPatch.geometry !== patch.geometry) previousPatch.geometry.dispose();
            previousPatch.geometry = patch.geometry;
            patch.geometry = cap;
            patchBlend = hadSurface ? 0 : 1;
        }
        patchBlend = Math.min(1, patchBlend + delta / 0.45);
        const opacity = THREE.MathUtils.smoothstep(clearance, 15, 100) *
            (1 - THREE.MathUtils.smoothstep(clearance, 12000, 22000));
        // Keep the old surface underneath while its replacement appears.
        // This prevents a hole in coverage halfway through the blend.
        patchMaterial.opacity = opacity * THREE.MathUtils.smoothstep(patchBlend, 0, 1);
        previousPatch.material.opacity = opacity;
        previousPatch.visible = patchBlend < 1;
        previousPatch.renderOrder = 1; patch.renderOrder = 2;
        planet.globalToLocalMatrix(patch.matrix); patch.matrixWorldNeedsUpdate = true;
        previousPatch.matrix.copy(patch.matrix); previousPatch.matrixWorldNeedsUpdate = true;
    }
    const globe = new THREE.Mesh(geometry, material);
    globe.name = 'flight-planet-globe'; globe.matrixAutoUpdate = false;
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
        get altitude() { return altitude; },
        update(rover, delta = 1 / 60) {
            planet.toGlobal(rover.position, point);
            altitude = point.length() - radius;
            normal.copy(point).normalize();
            surfaceFocus.value.copy(point);
            contactRadius.value = hasContactTerrain() ? 90 : 0;
            const clearance = Math.max(0, altitude - planet.elevation(normal));
            const atmosphereTarget = THREE.MathUtils.smoothstep(Math.log1p(clearance), Math.log1p(1200), Math.log1p(24000));
            spaceBlend += (atmosphereTarget - spaceBlend) * (1 - Math.exp(-3 * delta));
            const detailTarget = 1 - THREE.MathUtils.smoothstep(clearance, 600, 2200);
            // Altitude already changes continuously. Finish fading before the
            // streamer sleeps, even during the fastest ascent.
            detailCoverage = detailTarget;
            const homeCoverage = detailCoverage * (1 - THREE.MathUtils.smoothstep(planet.homeDistance(rover.position), 800, 2000));
            fadeHomeland(homeCoverage); fadeStreamed(detailCoverage);
            homeland.visible = planet.homeFrame && homeCoverage > 0;
            material.opacity = THREE.MathUtils.smoothstep(clearance, 5, 100);
            updatePatch(clearance, delta);
            globe.visible = material.opacity > 0.001;
            if (globe.visible) { planet.globalToLocalMatrix(globe.matrix); globe.matrixWorldNeedsUpdate = true; }
            stars.material.opacity = spaceBlend; stars.visible = spaceBlend > 0.001;
            stars.position.copy(camera.position);
            scene.background.copy(background).lerp(space, spaceBlend);
            if (zenith) zenith.copy(skyZenith).lerp(space, spaceBlend);
            if (horizon) horizon.copy(skyHorizon).lerp(space, spaceBlend);
            const fogTarget = THREE.MathUtils.lerp(baseFog, Math.min(baseFog, 0.12 / Math.max(1, clearance)),
                THREE.MathUtils.smoothstep(Math.log1p(clearance), Math.log1p(25), Math.log1p(800)));
            // Keep overhead terrain readable while airborne. The old delayed
            // ground fog could completely bleach a streamed tile even though
            // the distant globe underneath does not receive scene fog.
            const flightFogLimit = Math.min(baseFog, 0.08 / Math.max(1, clearance));
            const desiredFog = Math.min(fogTarget, flightFogLimit);
            scene.fog.density = Math.min(flightFogLimit,
                scene.fog.density + (desiredFog - scene.fog.density) * (1 - Math.exp(-5 * delta)));
            const far = THREE.MathUtils.lerp(2000, radius * 7 + clearance * 2,
                THREE.MathUtils.smoothstep(clearance, 0, 100));
            for (const viewCamera of [camera, orbitCamera]) if (viewCamera.far !== far) {
                viewCamera.far = far; viewCamera.updateProjectionMatrix();
            }
        }
    };
}
