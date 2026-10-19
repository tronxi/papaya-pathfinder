import * as THREE from 'three';
import { PLANET_REGIONS } from './planet-regions.js';

const regionPalette = PLANET_REGIONS.map(region => {
    const color = new THREE.Color(region.color);
    return `vec3(${color.r}, ${color.g}, ${color.b})`;
});
export function addPlanetSurfaceDetail(surface, {patch = false,
surfaceFocus = {value:new THREE.Vector3()}, contactRadius = {value:0}} = {}) {
    surface.onBeforeCompile = shader => {
        shader.uniforms.flightSurfaceFocus = surfaceFocus;
        shader.uniforms.flightContactRadius = contactRadius;
        shader.vertexShader = 'varying vec3 flightSurface;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nflightSurface = position;');
        shader.fragmentShader = `varying vec3 flightSurface;
            uniform vec3 flightSurfaceFocus;
            uniform float flightContactRadius;
            float flightNoise(vec3 p) {
                vec3 cell = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(fract(sin(dot(cell, vec3(127.1,311.7,74.7))) * 43758.5453),
                    fract(sin(dot(cell + vec3(1,0,0), vec3(127.1,311.7,74.7))) * 43758.5453), f.x),
                    mix(fract(sin(dot(cell + vec3(0,1,0), vec3(127.1,311.7,74.7))) * 43758.5453),
                    fract(sin(dot(cell + vec3(1,1,0), vec3(127.1,311.7,74.7))) * 43758.5453), f.x), f.y),
                    mix(mix(fract(sin(dot(cell + vec3(0,0,1), vec3(127.1,311.7,74.7))) * 43758.5453),
                    fract(sin(dot(cell + vec3(1,0,1), vec3(127.1,311.7,74.7))) * 43758.5453), f.x),
                    mix(fract(sin(dot(cell + vec3(0,1,1), vec3(127.1,311.7,74.7))) * 43758.5453),
                    fract(sin(dot(cell + vec3(1,1,1), vec3(127.1,311.7,74.7))) * 43758.5453), f.x), f.y), f.z);
            }
            ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            vec3 p = flightSurface;
            // Coarse triangles must not cover the rover's true contact mesh.
            if (flightContactRadius > 0.0 && distance(p, flightSurfaceFocus) < flightContactRadius) discard;
            float tint = 0.25 + flightNoise(p / 180.0) * 0.5;
            float regionField = clamp(2.5 + 1.2 * sin(p.x / 2400.0 + sin(p.y / 3100.0)) +
                0.95 * sin(p.z / 1950.0 - p.y / 2700.0) + 0.75 * sin((p.x + p.y + p.z) / 4100.0), 0.0, 5.0);
            vec3 sandColor = ${regionPalette[0]};
            ${regionPalette.slice(1).map((color, i) => `sandColor = mix(sandColor, ${color}, smoothstep(${i.toFixed(1)}, ${(i + 1).toFixed(1)}, regionField));`).join('\n')}
            sandColor *= 0.95 + tint * 0.1;
            float broad = flightNoise(p / 1600.0);
            float medium = flightNoise(p / 210.0);
            // Attenuate fine grain as its footprint becomes subpixel.
            float fineWeight = 1.0 - smoothstep(2.0, 16.0, length(fwidth(p)));
            float grain = (flightNoise(p / 8.0) - 0.5) * fineWeight;
            float sedimentWeight = 1.0 - smoothstep(24.0, 100.0, length(fwidth(p)));
            float sediment = (flightNoise(p / 48.0) - 0.5) * sedimentWeight;
            diffuseColor.rgb *= sandColor * (0.80 + broad * 0.25 + medium * 0.16 + sediment * 0.14 + grain * 0.12);
            ${patch ? 'diffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, max(abs(vUv.x * 2.0 - 1.0), abs(vUv.y * 2.0 - 1.0)));' : ''}
        `);
    };
    surface.customProgramCacheKey = () => `flight-surface-${patch}`;
}
