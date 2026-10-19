import * as THREE from 'three';

// Coarse and retired surfaces fill the distance, never the contact area. Their
// interpolated triangles can bridge valleys even when vertices are inset.
export function createTerrainUnderlayMask() {
    const focus = { value: new THREE.Vector3() };
    const radius = { value: 0 };
    const materials = new WeakMap();
    const gridSize = 64, tileSize = 50;
    const pixels = new Uint8Array(gridSize * gridSize);
    const nextPixels = new Uint8Array(pixels.length);
    const coverage = new THREE.DataTexture(pixels, gridSize, gridSize, THREE.RedFormat);
    coverage.minFilter = coverage.magFilter = THREE.NearestFilter;
    coverage.generateMipmaps = false; coverage.needsUpdate = true;
    const origin = { value: new THREE.Vector2() };
    let initialized = false;
    function apply(root) {
        root.traverse(mesh => {
            if (!mesh.isMesh) return;
            const source = mesh.material;
            if (source.userData.underlayMask === focus) return;
            let material = materials.get(source);
            if (!material) {
                material = source.clone();
                material.userData = { ...source.userData, underlayMask: focus };
                material.onBeforeCompile = function(shader, renderer) {
                    source.onBeforeCompile.call(this, shader, renderer);
                    shader.uniforms.underlayFocus = focus;
                    shader.uniforms.underlayRadius = radius;
                    shader.uniforms.underlayCoverage = { value: coverage };
                    shader.uniforms.underlayOrigin = origin;
                    shader.vertexShader = 'varying vec3 underlayPosition;\n' + shader.vertexShader;
                    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
                        #include <worldpos_vertex>
                        underlayPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    `);
                    shader.fragmentShader = 'varying vec3 underlayPosition;\nuniform vec3 underlayFocus;\nuniform float underlayRadius;\nuniform sampler2D underlayCoverage;\nuniform vec2 underlayOrigin;\n' + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                        #include <alphatest_fragment>
                        if (underlayRadius > 0.0 && distance(underlayPosition.xz, underlayFocus.xz) < underlayRadius) discard;
                        vec2 underlayUv = (underlayPosition.xz - underlayOrigin) / ${gridSize * tileSize}.0;
                        if (all(greaterThanEqual(underlayUv, vec2(0.0))) && all(lessThan(underlayUv, vec2(1.0))) &&
                            texture2D(underlayCoverage, underlayUv).r > 0.5) discard;
                    `);
                };
                const key = source.customProgramCacheKey();
                material.customProgramCacheKey = () => key + '-distant-underlay-coverage';
                materials.set(source, material);
            }
            mesh.material = material;
        });
    }
    return {
        apply,
        bindDetails(material) {
            // Scenery uses the inverse of the backing-surface mask: reveal it
            // only where detailed terrain has finished loading and morphing.
            const compile = material.onBeforeCompile;
            const key = material.customProgramCacheKey();
            material.onBeforeCompile = function(shader, renderer) {
                compile.call(this, shader, renderer);
                shader.uniforms.detailTerrainCoverage = { value: coverage };
                shader.uniforms.detailTerrainOrigin = origin;
                shader.vertexShader = 'varying vec3 detailTerrainPosition;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
                    #include <worldpos_vertex>
                    vec4 detailPoint = vec4(transformed, 1.0);
                    #ifdef USE_INSTANCING
                        detailPoint = instanceMatrix * detailPoint;
                    #endif
                    detailTerrainPosition = (modelMatrix * detailPoint).xyz;
                `);
                shader.fragmentShader = 'varying vec3 detailTerrainPosition;\nuniform sampler2D detailTerrainCoverage;\nuniform vec2 detailTerrainOrigin;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                    #include <alphatest_fragment>
                    vec2 detailTerrainUv = (detailTerrainPosition.xz - detailTerrainOrigin) / ${gridSize * tileSize}.0;
                    if (any(lessThan(detailTerrainUv, vec2(0.0))) || any(greaterThanEqual(detailTerrainUv, vec2(1.0)))) discard;
                    if (texture2D(detailTerrainCoverage, detailTerrainUv).r < 0.5) discard;
                `);
            };
            material.customProgramCacheKey = () => key + '-details-after-terrain-v1';
            material.needsUpdate = true;
        },
        update(position, enabled, tiles, homeFrame) {
            focus.value.copy(position); radius.value = enabled ? 90 : 0;
            const tx = Math.floor(position.x / tileSize) - gridSize / 2;
            const tz = Math.floor(position.z / tileSize) - gridSize / 2;
            let changed = !initialized || origin.value.x !== tx * tileSize || origin.value.y !== tz * tileSize;
            origin.value.set(tx * tileSize, tz * tileSize); initialized = true;
            nextPixels.fill(0);
            function cover(worldX, worldZ) {
                const x = worldX - tx, z = worldZ - tz;
                if (x >= 0 && x < gridSize && z >= 0 && z < gridSize) nextPixels[z * gridSize + x] = 255;
            }
            if (homeFrame) for (let z = -4; z < 4; z++) for (let x = -4; x < 4; x++) cover(x, z);
            // Only remove the backing mesh once the replacement is opaque.
            for (const tile of tiles.values()) {
                if (tile.progress >= 1 && tile.visibleCoverage >= 0.999 && !tile.morphTarget) cover(tile.tx, tile.tz);
            }
            if (!changed) for (let i = 0; i < pixels.length; i++) {
                if (pixels[i] !== nextPixels[i]) { changed = true; break; }
            }
            if (changed) pixels.set(nextPixels);
            if (changed) coverage.needsUpdate = true;
        }
    };
}
