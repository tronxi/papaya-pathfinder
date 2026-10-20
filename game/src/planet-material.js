import * as THREE from 'three';
import { PLANET_REGIONS } from './planet-regions.js';
import { addMarsSurfaceDetail } from './visuals.js';

const regionPalette = PLANET_REGIONS.map(region => {
    const color = new THREE.Color(region.color);
    return `vec3(${color.r}, ${color.g}, ${color.b})`;
});
export function addPlanetSurfaceDetail(surface, {patch = false,
    surfaceFocus = {value: new THREE.Vector3()}, contactRadius = {value: 0}, radius = 50000} = {}) {
    // Use exactly the same metre-scale mineral/dust detail as the contact terrain.
    addMarsSurfaceDetail(surface);
    surface.userData.marsFrame.makeTranslation(0, -radius, 0);
    const compileDetail = surface.onBeforeCompile;
    surface.onBeforeCompile = function(shader, renderer) {
        compileDetail.call(this, shader, renderer);
        shader.uniforms.flightSurfaceFocus = surfaceFocus;
        shader.uniforms.flightPlanetRadius = { value: radius };
        shader.uniforms.flightContactRadius = contactRadius;
        const patchVarying = patch ? 'varying vec2 flightPatchUv;\n' : '';
        shader.vertexShader = 'varying vec3 flightSurface;\n' + patchVarying + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            `#include <begin_vertex>\nflightSurface = position;${patch ? '\nflightPatchUv = uv;' : ''}`);
        shader.fragmentShader = `${patchVarying}varying vec3 flightSurface;
            uniform vec3 flightSurfaceFocus;
            uniform float flightPlanetRadius;
            uniform float flightContactRadius;
        ` + shader.fragmentShader;
        // The shared detail hook retains this include, so both hooks compose.
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            vec3 p = flightSurface;
            if (flightContactRadius > 0.0 && distance(p, flightSurfaceFocus) < flightContactRadius) discard;
            vec3 regionPoint = normalize(p) * flightPlanetRadius;
            float regionField = clamp(2.5 + 1.2 * sin(regionPoint.x / 2400.0 + sin(regionPoint.y / 3100.0)) +
                0.95 * sin(regionPoint.z / 1950.0 - regionPoint.y / 2700.0) +
                0.75 * sin((regionPoint.x + regionPoint.y + regionPoint.z) / 4100.0), 0.0, 5.0);
            vec3 sandColor = ${regionPalette[0]};
            ${regionPalette.slice(1).map((color, i) => `sandColor = mix(sandColor, ${color}, smoothstep(${i.toFixed(1)}, ${(i + 1).toFixed(1)}, regionField));`).join('\n')}
            float tint = 0.5 + 0.5 * sin(p.x / 80.0 + p.z / 130.0 + p.y / 150.0);
            diffuseColor.rgb *= sandColor * (0.95 + tint * 0.1);
            ${patch ? 'diffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, max(abs(flightPatchUv.x * 2.0 - 1.0), abs(flightPatchUv.y * 2.0 - 1.0)));' : ''}
        `);
    };
    surface.customProgramCacheKey = () => `flight-shared-ground-detail-v4-${patch}`;
}
