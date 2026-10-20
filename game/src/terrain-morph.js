import * as THREE from 'three';

// Heights stay immutable on the CPU; the vertex shader interpolates each frame.
export function createTerrainMorph(mesh, startHeights) {
    mesh.geometry.setAttribute('terrainStartHeight', new THREE.BufferAttribute(startHeights, 1));
    const source = mesh.material;
    const material = source.clone();
    material.userData = { ...source.userData };
    const blend = { value: 0 };
    material.onBeforeCompile = function(shader, renderer) {
        source.onBeforeCompile.call(this, shader, renderer);
        shader.uniforms.terrainMorphBlend = blend;
        shader.vertexShader = 'attribute float terrainStartHeight;\nuniform float terrainMorphBlend;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            transformed.y = mix(terrainStartHeight, position.y, terrainMorphBlend);
        `);
    };
    const key = source.customProgramCacheKey();
    material.customProgramCacheKey = () => key + '-gpu-terrain-morph';
    mesh.material = material;
    return value => { blend.value = value; };
}
