// Blend surface coverage continuously, without a visible screen-door pattern.
// Clones isolate shared materials and preserve shader hooks.
export function createSurfaceTransition(root, uniformName = 'surfaceCoverage') {
    const materials = new WeakMap();
    const coverage = { value: 1 };
    let previous = NaN;
    return function update(value) {
        coverage.value = value;
        if (value === 1 && previous === 1) return;
        previous = value;
        root.traverse(object => {
            if (!object.isMesh) return;
            function fadeMaterial(source) {
                if (source.userData.surfaceTransitions?.[uniformName] === coverage) return source;
                if (materials.has(source)) return materials.get(source);
                const material = source.clone();
                material.transparent = true;
                material.userData = { ...source.userData, surfaceTransitions: {
                    ...source.userData.surfaceTransitions, [uniformName]: coverage
                } };
                material.onBeforeCompile = function(shader, renderer) {
                    source.onBeforeCompile.call(this, shader, renderer);
                    shader.uniforms[uniformName] = coverage;
                    shader.fragmentShader = `uniform float ${uniformName};\n` + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                        #include <alphatest_fragment>
                        if (${uniformName} <= 0.0) discard;
                        diffuseColor.a *= ${uniformName};
                    `);
                };
                const sourceKey = source.customProgramCacheKey();
                material.customProgramCacheKey = () => sourceKey + '-smooth-surface-transition-' + uniformName;
                materials.set(source, material); materials.set(material, material);
                return material;
            }
            object.material = Array.isArray(object.material)
                ? object.material.map(fadeMaterial) : fadeMaterial(object.material);
        });
    };
}
