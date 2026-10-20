import * as THREE from 'three';
import { mobileGraphics } from './performance.js';

export function addSky(scene) {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16),
        new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false,
            uniforms: {
                zenith: { value: new THREE.Color(0xcba184) },
                horizon: { value: scene.fog.color.clone() },
                sunDirection: { value: new THREE.Vector3(-45, 30, -35).normalize() },
                sunlight: { value: new THREE.Color(0xffefd6) },
                solarHaze: { value: new THREE.Color(0xb7bbc5) }
            },
            vertexShader: `varying vec3 direction;
                void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform vec3 zenith; uniform vec3 horizon;
                uniform vec3 sunDirection; uniform vec3 sunlight; uniform vec3 solarHaze;
                varying vec3 direction;
                void main() {
                    vec3 ray = normalize(direction);
                    float elevation = max(ray.y, 0.0);
                    float t = pow(elevation, 0.38);
                    vec3 sky = mix(horizon, zenith, t);
                    // Dust softens the horizon; the small solar disc stays pale.
                    float alignment = max(dot(ray, sunDirection), 0.0);
                    float aureole = pow(alignment, 160.0);
                    float innerGlow = pow(alignment, 1800.0);
                    sky = mix(sky, solarHaze, aureole * 0.18);
                    sky += sunlight * innerGlow * 0.12;
                    float disc = smoothstep(cos(0.0038), cos(0.0029), alignment);
                    sky = mix(sky, sunlight * 5.0, disc);
                    gl_FragColor = vec4(sky, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`
        }));
    sky.renderOrder = -1;
    scene.add(sky);
    return sky;
}

// World-space detail avoids stretching a single color across whole terrain cells.
export function addMarsSurfaceDetail(material, rocky = false, rockTextures = null) {
    material.userData.marsFrame = new THREE.Matrix4();
    material.onBeforeCompile = shader => {
        shader.uniforms.marsFrame = { value: material.userData.marsFrame };
        shader.vertexShader = 'uniform mat4 marsFrame;\nvarying vec3 marsPosition;\nvarying vec3 marsSmoothNormal;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
            #include <defaultnormal_vertex>
            marsSmoothNormal = mat3(marsFrame) * inverseTransformDirection(transformedNormal, viewMatrix);
        `);
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
            #include <worldpos_vertex>
            vec4 marsVertex = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
                marsVertex = instanceMatrix * marsVertex;
            #endif
            marsPosition = (marsFrame * modelMatrix * marsVertex).xyz;
        `);
        shader.fragmentShader = `varying vec3 marsPosition;
            varying vec3 marsSmoothNormal;
            float marsHash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float marsNoise(vec2 p) {
                vec2 cell = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(marsHash(cell), marsHash(cell + vec2(1.0, 0.0)), f.x),
                    mix(marsHash(cell + vec2(0.0, 1.0)), marsHash(cell + 1.0), f.x), f.y);
            }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            float marsFootprint = max(length(dFdx(marsPosition)), length(dFdy(marsPosition)));
            float mottling = marsNoise(marsPosition.xz * ${rocky ? '8.0' : '1.8'});
            float grains = marsNoise(marsPosition.xz * 95.0);
            float strata = sin(marsPosition.y * ${rocky ? '32.0' : '5.5'} +
                marsNoise(marsPosition.xz * 0.7) * 3.0);
            // Average only subpixel frequencies, avoiding crawling pixels in flight.
            mottling = mix(mottling, 0.5, smoothstep(0.15, 1.0, marsFootprint));
            grains = mix(grains, 0.5, smoothstep(0.003, 0.025, marsFootprint));
            strata *= 1.0 - smoothstep(0.1, 1.0, marsFootprint);
            float detail = 0.94 + mottling * 0.10 + grains * 0.035 + strata * ${rocky ? '0.035' : '0.018'};
            diffuseColor.rgb *= detail;
            ${rocky ? '' : `
                float dustBasin = marsNoise(marsPosition.xz * 0.055);
                float mineralBed = marsNoise(marsPosition.xz * 0.14 + vec2(19.0, 7.0));
                dustBasin = mix(dustBasin, 0.5, smoothstep(5.0, 35.0, marsFootprint));
                mineralBed = mix(mineralBed, 0.5, smoothstep(2.0, 15.0, marsFootprint));
                vec3 paleDust = vec3(1.06, 1.14, 1.22);
                vec3 basaltDust = vec3(0.84, 0.88, 0.96);
                diffuseColor.rgb *= mix(vec3(1.0), paleDust, smoothstep(0.43, 0.78, dustBasin) * 0.65);
                diffuseColor.rgb *= mix(vec3(1.0), basaltDust, smoothstep(0.58, 0.85, mineralBed) * 0.4);
                vec3 marsUp = normalize(marsPosition + vec3(0.0, 50000.0, 0.0));
                float marsSlope = 1.0 - abs(dot(normalize(marsSmoothNormal), marsUp));
                float marsExposedRock = smoothstep(0.045, 0.3, marsSlope);
                float marsBedding = sin(marsPosition.y * 0.9 + mineralBed * 2.0);
                marsBedding *= 1.0 - smoothstep(0.5, 3.0, fwidth(marsPosition.y));
                vec3 marsSediment = mix(vec3(1.035, 1.02, 0.98), vec3(0.77, 0.79, 0.81), marsExposedRock);
                diffuseColor.rgb *= marsSediment * (1.0 + marsBedding * marsExposedRock * 0.065);
                vec3 localPoint = marsUp * 50000.0;
                float localField = 0.5 + 0.5 * sin(localPoint.x * .041 + sin(localPoint.z * .027 + localPoint.y * .019) * 1.7) *
                    cos(localPoint.z * .034 - localPoint.y * .021 + sin(localPoint.x * .017) * .8);
                float duneErosion = 1.0 + sin(localPoint.x * .11 + localPoint.z * .06) * .07 + sin(localPoint.z * .13 - localPoint.x * .04) * .05;
                float desertSand = (1.0 - smoothstep(.55, 1.0, length((localPoint.xz - vec2(73.0, -37.0)) / vec2(70.0, 55.0)) * duneErosion)) * smoothstep(49990.0, 49999.0, localPoint.y);
                float localSand = max(1.0 - smoothstep(.18, .36, localField), desertSand);
                float localGravel = smoothstep(.2, .38, localField) * (1.0 - smoothstep(.52, .66, localField));
                float localSlab = smoothstep(.5, .66, localField) * (1.0 - smoothstep(.78, .9, localField));
                float localClay = smoothstep(.76, .92, localField);
                localGravel *= 1.0 - desertSand;
                localSlab *= 1.0 - desertSand;
                localClay *= 1.0 - desertSand;
                marsExposedRock *= 1.0 - desertSand;
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.12, 1.02), desertSand);
                float localDetail = 1.0 - smoothstep(.12, .8, marsFootprint);
                float sandRipples = sin(dot(marsPosition.xz, vec2(6.2, 2.5)) + mineralBed * 3.5);
                float gravelGrain = marsNoise(marsPosition.xz * 10.5 + vec2(37.0, 11.0));
                float pebbles = smoothstep(.65, .83, gravelGrain) * localGravel * localDetail;
                vec2 clayPosition = marsPosition.xz * 1.1;
                vec2 clayCell = floor(clayPosition);
                vec2 clayFraction = fract(clayPosition);
                float clayNearest = 8.0;
                float claySecond = 8.0;
                for (int cy = -1; cy <= 1; cy++) {
                    for (int cx = -1; cx <= 1; cx++) {
                        vec2 neighbor = vec2(float(cx), float(cy));
                        vec2 seed = clayCell + neighbor;
                        vec2 jitter = fract(sin(vec2(dot(seed, vec2(127.1, 311.7)), dot(seed, vec2(269.5, 183.3)))) * 43758.5453);
                        vec2 delta = neighbor + .15 + jitter * .7 - clayFraction;
                        float distanceToCell = dot(delta, delta);
                        claySecond = min(claySecond, max(clayNearest, distanceToCell));
                        clayNearest = min(clayNearest, distanceToCell);
                    }
                }
                float clayEdge = (claySecond - clayNearest) * .5;
                float crackWidth = max(.008, length(fwidth(marsPosition.xz)) * 1.1);
                float cracks = (1.0 - smoothstep(.012, .012 + crackWidth, clayEdge)) * localClay * localDetail;
                vec3 localTint = vec3(1.0) + localSand * vec3(.09,.08,.04) +
                    localGravel * vec3(-.08,-.07,-.045) + localSlab * vec3(-.19,-.15,-.09) + localClay * vec3(-.04,.015,.06);
                diffuseColor.rgb *= localTint * (1.0 - pebbles * .28 - cracks * .22 + sandRipples * localSand * localDetail * .025);
                marsExposedRock = max(marsExposedRock, localSlab * .85);
                float marsFineRelief = (mottling - 0.5) * mix(0.008, 0.025, marsExposedRock);
                marsFineRelief += sandRipples * localSand * .007 + (gravelGrain - .5) * localGravel * .018 - cracks * .006;
                marsFineRelief *= 1.0 - smoothstep(0.15, 1.5, marsFootprint);
            `}
        `);
        if (!rocky) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
                #include <roughnessmap_fragment>
                roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.84, marsExposedRock), 0.78, 1.0);
            `);
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
                #include <normal_fragment_maps>
                vec3 groundDx = dFdx(-vViewPosition), groundDy = dFdy(-vViewPosition);
                vec3 groundR1 = cross(groundDy, normal), groundR2 = cross(normal, groundDx);
                float groundDet = dot(groundDx, groundR1);
                vec3 groundGradient = sign(groundDet) * (dFdx(marsFineRelief) * groundR1 + dFdy(marsFineRelief) * groundR2);
                if (abs(groundDet) > 1e-10) normal = normalize(abs(groundDet) * normal - groundGradient);
            `);
        }
        if (rocky && rockTextures) {
            shader.uniforms.marsRockColor = { value: rockTextures.color };
            shader.uniforms.marsRockSurface = { value: rockTextures.surface };
            shader.fragmentShader = `uniform sampler2D marsRockColor;
                uniform sampler2D marsRockSurface;
                vec4 marsTriplanar(sampler2D map, vec3 p, vec3 weights) {
                    ${mobileGraphics ? 'return texture2D(map, p.xz + p.y * vec2(0.31, 0.23));' : `return texture2D(map, p.yz) * weights.x +
                        texture2D(map, p.xz) * weights.y + texture2D(map, p.xy) * weights.z;`}
                }
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
                #include <color_fragment>
                vec3 marsWeights = pow(abs(normalize(cross(dFdx(marsPosition), dFdy(marsPosition)))), vec3(4.0));
                marsWeights /= max(dot(marsWeights, vec3(1.0)), 0.0001);
                vec3 rockCoordinates = marsPosition * 2.5;
                vec3 rockAlbedo = marsTriplanar(marsRockColor, rockCoordinates, marsWeights).rgb;
                vec4 rockSurface = marsTriplanar(marsRockSurface, rockCoordinates, marsWeights);
                vec3 rockUp = normalize(marsPosition + vec3(0.0, 50000.0, 0.0));
                float rockDust = smoothstep(0.25, 0.85, dot(normalize(marsSmoothNormal), rockUp));
                rockDust *= 0.25 + rockSurface.b * 0.35;
                rockAlbedo = mix(rockAlbedo, rockAlbedo * vec3(1.12, 1.05, 0.94), rockDust);
                diffuseColor.rgb *= rockAlbedo * (0.90 + rockSurface.b * 0.12);
            `);
            shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
                #include <roughnessmap_fragment>
                roughnessFactor = clamp(rockSurface.g + rockDust * 0.08, 0.78, 1.0);
            `);
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
                #include <normal_fragment_maps>
                // Derivative bump in view space: pores respond to light on every face.
                vec3 rockDx = dFdx(-vViewPosition), rockDy = dFdy(-vViewPosition);
                vec3 rockR1 = cross(rockDy, normal), rockR2 = cross(normal, rockDx);
                float rockDet = dot(rockDx, rockR1);
                vec3 rockGradient = sign(rockDet) *
                    (dFdx(rockSurface.r) * rockR1 + dFdy(rockSurface.r) * rockR2);
                if (abs(rockDet) > 1e-10) normal = normalize(abs(rockDet) * normal - ${mobileGraphics ? '0.008' : '0.012'} * rockGradient);
            `);
        }
    };
    material.customProgramCacheKey = () => `mars-surface-desert-dunes-v4-${rocky}-${Boolean(rockTextures)}`;
    return material;
}

function createTileNoise() {
    const hash = (x, y) => {
        let value = Math.imul(x + 173, 374761393) ^ Math.imul(y + 61, 668265263);
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (u, v, period) => {
        const x = u * period, y = v * period;
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = hash(ix % period, iy % period);
        const b = hash((ix + 1) % period, iy % period);
        const c = hash(ix % period, (iy + 1) % period);
        const d = hash((ix + 1) % period, (iy + 1) % period);
        return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
    return { hash, noise };
}

export function createMarsRockTextures(renderer) {
    const size = 512;
    const { hash, noise } = createTileNoise();
    const layers = Array.from({ length: 2 }, () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        return { canvas, ctx, image: ctx.createImageData(size, size) };
    });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const mineral = noise(u, v, 8);
        const granular = noise(u, v, 32);
        const fine = noise(u, v, 128);
        const grain = hash(x, y);
        const pores = Math.pow(Math.max(0, (0.4 - fine) / 0.4), 2);
        const vein = Math.pow(Math.max(0, 1 - Math.abs(mineral - 0.48) * 35), 3);
        const shade = 228 + (mineral - 0.5) * 36 + (granular - 0.5) * 28 - pores * 48 + vein * 14;
        const height = 128 + (granular - 0.5) * 52 + (fine - 0.5) * 32 - pores * 95 + (grain - 0.5) * 9;
        const index = (y * size + x) * 4;
        const color = layers[0].image.data;
        color[index] = shade + 2; color[index + 1] = shade; color[index + 2] = shade - 3; color[index + 3] = 255;
        // Pack relief, roughness and mineral dust into a single linear texture.
        const surface = layers[1].image.data;
        surface[index] = height;
        surface[index + 1] = 205 + granular * 38;
        surface[index + 2] = mineral * 255;
        surface[index + 3] = 255;
    }
    const textures = layers.map(({ canvas, ctx, image }) => {
        ctx.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        // Custom shader samples these maps directly in linear space.
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return texture;
    });
    return { color: textures[0], surface: textures[1] };
}

export function createMarsGroundTextures(renderer, terrainSize) {
    const size = 512;
    const layers = Array.from({ length: 3 }, () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        return { canvas, context, image: context.createImageData(size, size) };
    });
    const { hash, noise } = createTileNoise();
    const write = (layer, index, r, g = r, b = r) => {
        const data = layers[layer].image.data;
        data[index] = r; data[index + 1] = g; data[index + 2] = b; data[index + 3] = 255;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const patches = noise(u, v, 8);
        const grit = noise(u, v, 64);
        const grain = hash(x, y);
        const phase = v * Math.PI * 2 * 32 + Math.sin(u * Math.PI * 4) * 2 +
            Math.sin((u * 3 + v) * Math.PI * 2) * 0.5;
        const ripples = Math.pow(0.5 + 0.5 * Math.sin(phase), 3);
        const fleck = grain > 0.994 ? 28 : 0;
        // Keep the albedo bright: vertex colors supply the red mineral palette.
        const albedo = 230 + patches * 16 + grit * 8 + (grain - 0.5) * 9 - fleck;
        const height = 98 + ripples * 28 + grit * 24 + (grain - 0.5) * 14;
        const roughness = 224 + patches * 15 + grit * 12;
        const index = (y * size + x) * 4;
        write(0, index, albedo, albedo * 0.985, albedo * 0.96);
        write(1, index, height);
        write(2, index, roughness);
    }
    const textures = layers.map(({ canvas, context, image }, index) => {
        context.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        if (index === 0) texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(terrainSize / 4, terrainSize / 4);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return texture;
    });
    return { map: textures[0], bumpMap: textures[1], roughnessMap: textures[2] };
}

export function createRoverMaterials() {
    return {
        tire: new THREE.MeshStandardMaterial({ color: 0x292725, roughness: 0.97, metalness: 0.03 }),
        body: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.42, metalness: 0.35 }),
        suspension: new THREE.MeshStandardMaterial({ color: 0x858e95, roughness: 0.48, metalness: 0.75 }),
        mount: new THREE.MeshStandardMaterial({ color: 0x343c44, roughness: 0.52, metalness: 0.65 })
    };
}

export function createWheelEffects(scene, camera, renderer, groundHeight) {
    const count = mobileGraphics ? 100 : 320;
    const positions = new Float32Array(count * 3);
    const opacity = new Float32Array(count);
    const sizes = new Float32Array(count);
    const particles = Array.from({ length: count }, () => ({ age: 10, life: 1, vx: 0, vy: 0, vz: 0 }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(opacity, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { scale: { value: 1 }, dustColor: { value: new THREE.Color(0xc89c72) },
            fogColor: { value: scene.fog.color }, fogDensity: { value: scene.fog.density } },
        vertexShader: `attribute float alpha; attribute float size; uniform float scale;
            varying float fade; varying float distanceToCamera;
            void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
            fade = alpha; distanceToCamera = length(p.xyz);
            gl_PointSize = min(100.0, size * scale / max(0.1, -p.z));
            gl_Position = projectionMatrix * p; }`,
        fragmentShader: `uniform vec3 dustColor; uniform vec3 fogColor; uniform float fogDensity;
            varying float fade; varying float distanceToCamera;
            void main() { float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = (1.0 - smoothstep(0.15, 1.0, r)) * fade;
            if (a < 0.005) discard;
            float fog = 1.0 - exp(-pow(fogDensity * distanceToCamera, 2.0));
            gl_FragColor = vec4(mix(dustColor, fogColor, fog), a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            }`
    });
    const dust = new THREE.Points(geometry, material);
    dust.frustumCulled = false;
    scene.add(dust);

    // A ribbon follows the contact path instead of overlapping rectangular decals.
    // Each 12 cm section carries one transverse grouser impression.
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const bed = ctx.createLinearGradient(0, 0, 128, 0);
    bed.addColorStop(0, 'rgba(157, 113, 80, 0)');
    bed.addColorStop(0.1, 'rgba(205, 157, 111, 0.35)');
    bed.addColorStop(0.22, 'rgba(139, 96, 66, 0.25)');
    bed.addColorStop(0.78, 'rgba(139, 96, 66, 0.25)');
    bed.addColorStop(0.9, 'rgba(205, 157, 111, 0.35)');
    bed.addColorStop(1, 'rgba(157, 113, 80, 0)');
    ctx.fillStyle = bed;
    ctx.fillRect(0, 0, 128, 128);
    // Broad, slightly irregular transverse bars, like a metal rover wheel.
    ctx.fillStyle = 'rgba(110, 75, 51, 0.48)';
    ctx.beginPath();
    ctx.moveTo(16, 53); ctx.lineTo(61, 56); ctx.lineTo(111, 52);
    ctx.lineTo(112, 66); ctx.lineTo(62, 69); ctx.lineTo(16, 65);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(224, 177, 124, 0.38)';
    ctx.fillRect(17, 67, 94, 4);
    // Fine grains break up the impression without creating a hard outer rectangle.
    for (let i = 0; i < 450; i++) {
        const x = 14 + Math.random() * 100;
        ctx.fillStyle = i % 2 ? 'rgba(229, 181, 132, 0.07)' : 'rgba(104, 73, 51, 0.06)';
        ctx.fillRect(x, Math.random() * 128, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const trackCount = mobileGraphics ? 1200 : 4000;
    const trackStep = mobileGraphics ? 0.2 : 0.12;
    const columns = 5;
    const verticesPerSection = columns * 2;
    const trackPositions = new Float32Array(trackCount * verticesPerSection * 3);
    const trackUVs = new Float32Array(trackCount * verticesPerSection * 2);
    const trackIndices = new Uint32Array(trackCount * (columns - 1) * 6);
    for (let section = 0; section < trackCount; section++) {
        const base = section * verticesPerSection;
        for (let row = 0; row < 2; row++) for (let col = 0; col < columns; col++) {
            const uv = (base + row * columns + col) * 2;
            trackUVs[uv] = col / (columns - 1);
            trackUVs[uv + 1] = row;
        }
        for (let col = 0; col < columns - 1; col++) {
            const offset = (section * (columns - 1) + col) * 6;
            const v = base + col;
            trackIndices.set([v, v + columns, v + 1, v + 1, v + columns, v + columns + 1], offset);
        }
    }
    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute('position', new THREE.BufferAttribute(trackPositions, 3).setUsage(THREE.DynamicDrawUsage));
    trackGeometry.setAttribute('uv', new THREE.BufferAttribute(trackUVs, 2));
    trackGeometry.setIndex(new THREE.BufferAttribute(trackIndices, 1));
    trackGeometry.setDrawRange(0, 0);
    const tracks = new THREE.Mesh(trackGeometry,
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.48,
            side: THREE.DoubleSide, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    tracks.frustumCulled = false;
    tracks.renderOrder = 1;
    scene.add(tracks);
    let trackIndex = 0;
    let visibleSections = 0;
    let dustIndex = 0;
    const wheelPosition = new THREE.Vector3();
    const end = new THREE.Vector3();
    const travel = new THREE.Vector3();

    function writeSection(start, finish, oldRight, newRight, width) {
        const section = new Float32Array(verticesPerSection * 3);
        for (let row = 0; row < 2; row++) {
            const center = row ? finish : start;
            const direction = row ? newRight : oldRight;
            for (let col = 0; col < columns; col++) {
                const across = col / (columns - 1) - 0.5;
                const x = center.x + direction.x * width * across;
                const z = center.z + direction.z * width * across;
                const height = groundHeight(x, z);
                if (height === null || Math.abs(height - center.y) > 0.18) return;
                const index = (row * columns + col) * 3;
                section[index] = x;
                section[index + 1] = height + 0.006;
                section[index + 2] = z;
            }
        }
        trackPositions.set(section, trackIndex * verticesPerSection * 3);
        trackIndex = (trackIndex + 1) % trackCount;
        visibleSections = Math.min(trackCount, visibleSections + 1);
        trackGeometry.setDrawRange(0, visibleSections * (columns - 1) * 6);
        trackGeometry.attributes.position.needsUpdate = true;
    }
    let wheelHistory = new WeakMap();

    return {
        reset() {
            wheelHistory = new WeakMap(); trackIndex = 0; visibleSections = 0;
            trackGeometry.setDrawRange(0, 0);
            for (let i = 0; i < count; i++) { particles[i].age = 10; opacity[i] = 0; }
            geometry.attributes.alpha.needsUpdate = true;
        },
        update(delta, wheels, speed, slip, yaw) {
            material.uniforms.scale.value = renderer.domElement.height * camera.projectionMatrix.elements[5] * 0.5;
            for (let i = 0; i < count; i++) {
                const p = particles[i];
                p.age += delta;
                if (p.age >= p.life) { opacity[i] = 0; continue; }
                positions[i * 3] += p.vx * delta;
                positions[i * 3 + 1] += p.vy * delta;
                positions[i * 3 + 2] += p.vz * delta;
                const progress = p.age / p.life;
                opacity[i] = Math.sin(progress * Math.PI) * 0.2;
                sizes[i] += delta * 0.3;
                p.vx *= Math.exp(-delta * 1.5); p.vz *= Math.exp(-delta * 1.5);
            }
            if (delta > 0) for (const wheel of wheels) {
                wheel.steeringPivot.getWorldPosition(wheelPosition);
                const height = groundHeight(wheelPosition.x, wheelPosition.z);
                let history = wheelHistory.get(wheel);
                if (!history) {
                    history = { last: new THREE.Vector3(wheelPosition.x, height ?? wheelPosition.y, wheelPosition.z),
                        right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), emission: 0 };
                    wheelHistory.set(wheel, history);
                }
                const touching = height !== null && Math.abs(wheelPosition.y - wheel.radius - height) < 0.14;
                if (!touching || Math.abs(speed) < 0.15) {
                    history.last.set(wheelPosition.x, height ?? wheelPosition.y, wheelPosition.z);
                    history.emission = 0; continue;
                }
                const angle = yaw + wheel.steeringPivot.rotation.y;
                const dx = Math.cos(angle), dz = -Math.sin(angle);
                const fx = -Math.sin(angle), fz = -Math.cos(angle);
                travel.set(wheelPosition.x - history.last.x, 0, wheelPosition.z - history.last.z);
                let distance = travel.length();
                // Ignore resets/teleports, and emit by distance so low FPS cannot leave gaps.
                if (distance > 3) {
                    history.last.set(wheelPosition.x, height, wheelPosition.z);
                    distance = 0;
                }
                if (distance >= trackStep) {
                    travel.normalize();
                    const newRight = new THREE.Vector3(dx, 0, dz);
                    while (distance >= trackStep) {
                        end.copy(history.last).addScaledVector(travel, trackStep);
                        const endHeight = groundHeight(end.x, end.z);
                        if (endHeight === null) break;
                        end.y = endHeight;
                        writeSection(history.last, end, history.right, newRight, wheel.halfWidth * 2.1);
                        history.last.copy(end);
                        history.right.copy(newRight);
                        distance -= trackStep;
                    }
                }
                history.emission += delta * (Math.min(16, Math.abs(speed) * 3) + slip * 18);
                while (history.emission >= 1) {
                    history.emission--;
                    const i = dustIndex; dustIndex = (dustIndex + 1) % count;
                    const p = particles[i]; p.age = 0; p.life = 0.7 + Math.random() * 0.7;
                    positions[i * 3] = wheelPosition.x + (Math.random() - 0.5) * wheel.radius;
                    positions[i * 3 + 1] = height + 0.08;
                    positions[i * 3 + 2] = wheelPosition.z + (Math.random() - 0.5) * wheel.radius;
                    p.vx = -fx * speed * 0.12 + (Math.random() - 0.5) * 0.3;
                    p.vy = 0.15 + Math.random() * 0.25;
                    p.vz = -fz * speed * 0.12 + (Math.random() - 0.5) * 0.3;
                    sizes[i] = 0.12 + Math.random() * 0.18;
                }
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.alpha.needsUpdate = true;
            geometry.attributes.size.needsUpdate = true;
        }
    };
}

// A brief, tapered exhaust pulse for the six wheel-mounted thrusters.
// Shared geometry/material keep this cheap on mobile; no textures or lights.
export function createWheelThrusterEffects(scene) {
    const geometry = new THREE.CylinderGeometry(0.025, 0.13, 1, 10, 1, true);
    geometry.translate(0, -0.5, 0);
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, toneMapped: false,
        uniforms: { strength: { value: 0 }, time: { value: 0 } },
        vertexShader: `varying vec2 jetUv;
            void main() {
                jetUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `uniform float strength;
            uniform float time;
            varying vec2 jetUv;
            void main() {
                float along = jetUv.y;
                float tip = smoothstep(0.0, 0.35, along);
                float pulse = 0.85 + 0.15 * sin(along * 32.0 - time * 55.0);
                vec3 color = mix(vec3(0.15, 0.55, 1.0), vec3(0.85, 0.97, 1.0), along * along);
                gl_FragColor = vec4(color, tip * (0.2 + along * 0.55) * pulse * strength);
            }`
    });
    const jets = Array.from({ length: 6 }, () => {
        const mesh = new THREE.Mesh(geometry, material.clone());
        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        return mesh;
    });
    const axis = new THREE.Vector3(0, 1, 0);
    const offset = new THREE.Vector3();
    const thrust = new THREE.Vector3();
    const desiredRotation = new THREE.Quaternion();
    const wheelThrust = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    let remaining = 0, time = 0, turn = 0, continuousLift = 0;
    const duration = 0.45;
    return {
        reset() {
            remaining = 0; continuousLift = 0; turn = 0;
            for (const jet of jets) jet.visible = false;
        },
        burst() { remaining = duration; },
        update(delta, wheels, orientation, airThrust, airTurn = 0, origin, liftPower = 0) {
            time += delta;
            remaining = Math.max(0, remaining - delta);
            continuousLift += (liftPower - continuousLift) * (1 - Math.exp(-14 * delta));
            const envelope = Math.max(continuousLift,
                Math.sin(Math.min(1, remaining / duration * 2) * Math.PI / 2));
            offset.copy(axis).applyQuaternion(orientation);
            thrust.copy(offset).multiplyScalar(envelope);
            if (airThrust) thrust.add(airThrust);
            turn += (airTurn - turn) * (1 - Math.exp(-10 * delta));
            jets.forEach((jet, index) => {
                const wheel = wheels[index];
                if (!wheel) { jet.visible = false; return; }
                wheel.steeringPivot.getWorldPosition(jet.position);
                wheelThrust.copy(thrust);
                if (origin) {
                    tangent.copy(jet.position).sub(origin);
                    tangent.y = 0;
                    // Opposing tangential forces create yaw torque: the jets
                    // on opposite wheels swivel in opposite directions.
                    tangent.crossVectors(axis, tangent).normalize();
                    wheelThrust.addScaledVector(tangent, turn * 0.85);
                }
                const strength = Math.min(1, wheelThrust.length());
                const active = strength > 0.025;
                const wasActive = jet.visible;
                jet.visible = active;
                if (!active) return;
                desiredRotation.setFromUnitVectors(axis, wheelThrust.normalize());
                if (!wasActive) jet.quaternion.copy(desiredRotation);
                else jet.quaternion.slerp(desiredRotation, 1 - Math.exp(-14 * delta));
                jet.material.uniforms.strength.value = strength;
                jet.material.uniforms.time.value = time;
                // The nozzle stays under the hub while its exhaust swivels
                // opposite the combined lift and directional thrust.
                jet.position.addScaledVector(offset, -wheel.radius * 0.45);
                jet.scale.setScalar(1);
                jet.scale.y = (0.45 + strength * 0.5) * (1 + 0.05 * Math.sin(time * 45 + index * 2));
            });
        }
    };
}
