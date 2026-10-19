import * as THREE from 'three';

// Coarse and retired surfaces fill the distance, never the contact area. Their
// interpolated triangles can bridge valleys even when vertices are inset.
export function createTerrainUnderlayMask() {
    const focus = { value: new THREE.Vector3() };
    const radius = { value: 0 };
    const materials = new WeakMap();
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
                    shader.vertexShader = 'varying vec3 underlayPosition;\n' + shader.vertexShader;
                    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
                        #include <worldpos_vertex>
                        underlayPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    `);
                    shader.fragmentShader = 'varying vec3 underlayPosition;\nuniform vec3 underlayFocus;\nuniform float underlayRadius;\n' + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                        #include <alphatest_fragment>
                        if (underlayRadius > 0.0 && distance(underlayPosition.xz, underlayFocus.xz) < underlayRadius) discard;
                    `);
                };
                const key = source.customProgramCacheKey();
                material.customProgramCacheKey = () => key + '-distant-underlay';
                materials.set(source, material);
            }
            mesh.material = material;
        });
    }
    return { apply, update(position, enabled) { focus.value.copy(position); radius.value = enabled ? 90 : 0; } };
}
