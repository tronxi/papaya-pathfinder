// Fade opaque terrain with screen-door coverage, retaining its depth and shadow
// behavior. Clones isolate shared rover materials and preserve shader hooks.
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
                material.userData = { ...source.userData, surfaceTransitions: {
                    ...source.userData.surfaceTransitions, [uniformName]: coverage
                } };
                material.onBeforeCompile = function(shader, renderer) {
                    source.onBeforeCompile.call(this, shader, renderer);
                    shader.uniforms[uniformName] = coverage;
                    shader.fragmentShader = `uniform float ${uniformName};\n` + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                        #include <alphatest_fragment>
                        float ${uniformName}Door = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
                        if (${uniformName} <= ${uniformName}Door) discard;
                    `);
                };
                const sourceKey = source.customProgramCacheKey();
                material.customProgramCacheKey = () => sourceKey + '-surface-transition-' + uniformName;
                materials.set(source, material); materials.set(material, material);
                return material;
            }
            object.material = Array.isArray(object.material)
                ? object.material.map(fadeMaterial) : fadeMaterial(object.material);
        });
    };
}
