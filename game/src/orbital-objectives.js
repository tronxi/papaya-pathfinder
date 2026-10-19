import * as THREE from 'three';

// One GPU batch holds every objective at its real, fixed surface position.
// Reuse the orbital camera after either terrain render or the surface crossfade.
export function createOrbitalObjectives({ renderer, catalog, mobile }) {
    const scene = new THREE.Scene();
    const point = new THREE.Vector3();
    const material = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: { selected: { value: -1 }, pixelRatio: { value: 1 } },
        vertexShader: `
            attribute float objectiveIndex;
            attribute float registered;
            attribute float objectiveType;
            uniform float selected;
            uniform float pixelRatio;
            varying float chosen;
            varying float visited;
            varying float kind;
            void main() {
                chosen = 1.0 - step(0.1, abs(objectiveIndex - selected));
                visited = registered;
                kind = objectiveType;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                // Hide the far hemisphere, independently of terrain blending.
                if (dot(position, cameraPosition - position) < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                gl_PointSize = mix(7.0, 19.0, chosen) * pixelRatio;
            }`,
        fragmentShader: `
            varying float chosen;
            varying float visited;
            varying float kind;
            float symbol(vec2 p) {
                if (kind < 0.5) return length(p);
                if (kind < 1.5) return (abs(p.x) + abs(p.y)) * 0.7071;
                if (kind < 2.5) return max(abs(p.x), abs(p.y));
                if (kind < 3.5) return max(abs(p.x) * 0.866 + p.y * 0.5, -p.y);
                return min(max(abs(p.x), abs(p.y) * 2.8), max(abs(p.y), abs(p.x) * 2.8));
            }
            void main() {
                vec2 p = gl_PointCoord - 0.5;
                float distance = symbol(p);
                vec3 color = mix(vec3(1.0, 0.82, 0.56), vec3(0.61, 0.90, 0.77), visited);
                float alpha;
                if (chosen > 0.5) {
                    float core = 1.0 - smoothstep(0.30, 0.42, symbol(p * (19.0 / 7.0)));
                    distance = length(p);
                    float ring = smoothstep(0.30, 0.35, distance) * (1.0 - smoothstep(0.42, 0.47, distance));
                    alpha = max(core, ring);
                    color = mix(color, vec3(1.0, 0.96, 0.84), ring);
                } else {
                    alpha = 1.0 - smoothstep(0.38, 0.5, distance);
                    color = mix(vec3(0.06, 0.10, 0.15), color, 1.0 - smoothstep(0.24, 0.38, distance));
                }
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(color, alpha);
                #include <colorspace_fragment>
            }`
    });
    let geometry = null, selectedGeometry = null, registeredAttribute = null;
    let active = false, press = null, lastCamera = null, data = null, revision = -1;
    function refresh() {
        data = catalog.orbitalData();
        if (!geometry) {
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
            geometry.setAttribute('objectiveIndex', new THREE.BufferAttribute(Float32Array.from(data.visited, (_, index) => index), 1));
            registeredAttribute = new THREE.BufferAttribute(data.visited, 1).setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('registered', registeredAttribute);
            geometry.setAttribute('objectiveType', new THREE.BufferAttribute(data.types, 1));
            const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points);
            // Draw the selected marker last so overlapping points cannot cover it.
            selectedGeometry = new THREE.BufferGeometry();
            for (const [name, attribute] of Object.entries(geometry.attributes)) selectedGeometry.setAttribute(name, attribute);
            const chosen = new THREE.Points(selectedGeometry, material);
            chosen.frustumCulled = false; chosen.renderOrder = 1; scene.add(chosen);
        }
        if (revision !== data.revision) { registeredAttribute.needsUpdate = true; revision = data.revision; }
        material.uniforms.selected.value = data.selected;
        selectedGeometry.setDrawRange(Math.max(0, data.selected), data.selected >= 0 ? 1 : 0);
    }
    renderer.domElement.addEventListener('pointerdown', event => {
        if (!event.isPrimary) { press = null; return; }
        if (active && event.button === 0) press = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    renderer.domElement.addEventListener('pointercancel', () => { press = null; });
    renderer.domElement.addEventListener('pointerup', event => {
        const start = press; press = null;
        if (!active || !lastCamera || !data || !start || start.id !== event.pointerId ||
            Math.hypot(start.x - event.clientX, start.y - event.clientY) > 5) return;
        const rect = renderer.domElement.getBoundingClientRect();
        let nearest = -1, distance = mobile ? 18 : 11;
        for (let index = 0; index < data.visited.length; index++) {
            point.fromArray(data.positions, index * 3);
            if (point.dot(lastCamera.position) < point.lengthSq()) continue;
            point.project(lastCamera);
            if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
            const x = rect.left + (point.x + 1) * rect.width * 0.5;
            const y = rect.top + (1 - point.y) * rect.height * 0.5;
            const gap = Math.hypot(x - event.clientX, y - event.clientY);
            if (gap < distance) { distance = gap; nearest = index; }
        }
        if (nearest >= 0) catalog.select(catalog.resolve(nearest).id);
    });
    return {
        show() { refresh(); active = true; press = null; },
        hide() { active = false; press = null; lastCamera = null; },
        render(camera) {
            if (!active) return;
            refresh(); lastCamera = camera;
            material.uniforms.pixelRatio.value = renderer.getPixelRatio();
            const autoClear = renderer.autoClear;
            try {
                renderer.autoClear = false;
                renderer.render(scene, camera);
            } finally { renderer.autoClear = autoClear; }
        }
    };
}
