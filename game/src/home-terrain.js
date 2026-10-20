import * as THREE from 'three';
import { localGroundRelief } from './local-surface.js';
import { shapeMarsTerrain } from './mars-world.js';

export function hash(x, z) {
    const value = Math.sin(
        x * 127.1 + z * 311.7
    ) * 43758.5453;

    return value - Math.floor(value);
}

export function smoothNoise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);

    const fx = x - ix;
    const fz = z - iz;

    const u = fx * fx * fx *
        (fx * (fx * 6 - 15) + 10);

    const v = fz * fz * fz *
        (fz * (fz * 6 - 15) + 10);

    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);

    return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(a, b, u),
        THREE.MathUtils.lerp(c, d, u),
        v
    ) * 2 - 1;
}

export function fbm(x, z, octaves = 5) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let totalAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
        value += smoothNoise(
            x * frequency,
            z * frequency
        ) * amplitude;

        totalAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return value / totalAmplitude;
}

// -----------------------------------------------------------------------------
// LONG MOUNTAIN RANGES
// -----------------------------------------------------------------------------

function mountainRidge(
    x, z,
    ax, az,
    bx, bz,
    width,
    height,
    seed
) {
    const vx = bx - ax;
    const vz = bz - az;

    const length2 = vx * vx + vz * vz;
    const length = Math.sqrt(length2);

    const t = THREE.MathUtils.clamp(
        (
            (x - ax) * vx +
            (z - az) * vz
        ) / length2,
        0,
        1
    );

    const spineX = ax + vx * t;
    const spineZ = az + vz * t;

    const nx = -vz / length;
    const nz = vx / length;

    const bend =
        Math.sin(t * Math.PI * 2 + seed) * 7 +
        Math.sin(t * Math.PI * 5 + seed * 2.3) * 3;

    const lateral =
        (x - spineX) * nx +
        (z - spineZ) * nz -
        bend;

    const crossSection = Math.exp(
        -Math.pow(
            Math.abs(lateral) / width,
            2.4
        )
    );

    const tipDistance = Math.min(t, 1 - t);

    const endFade = THREE.MathUtils.smoothstep(
        tipDistance,
        0,
        0.14
    );

    const irregularity =
        0.93 +
        0.07 * Math.sin(t * Math.PI * 3 + seed) +
        0.035 * fbm(
            x * 0.024 + seed,
            z * 0.024,
            3
        );

    return height *
        crossSection *
        endFade *
        irregularity;
}

// -----------------------------------------------------------------------------
// CRATERS
// -----------------------------------------------------------------------------

const CRATERS = [
    [-36, -27, 8.5, 2],
    [44, 17, 12, 2.8],
    [12, 51, 7.5, 1.7],
    [-62, 45, 15, 3.2],
    [67, -47, 10, 2.5],
    [-83, -64, 11, 2.4],
    [79, 77, 18, 4.2],
    [-49, 91, 12, 3],
    [99, -86, 15, 3.4],
    [-112, 29, 19, 4.4],
    [17, -100, 13, 3.2],
    [-135, -94, 16, 3.3],
    [120, 43, 11, 2.2],
    [-24, -119, 8, 2],
    [142, -25, 20, 4.8],
    [-97, 128, 14, 3],
    [52, 140, 18, 3.5],
    [-158, 69, 17, 3.7],
    [156, 123, 12, 2.5]
];

function craterHeight(x, z) {
    let height = 0;

    for (const [cx, cz, radius, depth] of CRATERS) {
        const distance =
            Math.hypot(x - cx, z - cz) / radius;

        if (distance > 1.8) continue;

        const bowl = -depth * Math.exp(
            -Math.pow(distance / 0.65, 4)
        );

        const rim = depth * 0.32 * Math.exp(
            -Math.pow((distance - 1) / 0.18, 2)
        );

        height += bowl + rim;
    }

    return height;
}

// -----------------------------------------------------------------------------
// TERRAIN HEIGHT
// -----------------------------------------------------------------------------

export function getHomeTerrainHeight(x, z) {
    const warpX = fbm(
        x * 0.035 + 13,
        z * 0.035 - 7,
        4
    ) * 6;

    const warpZ = fbm(
        x * 0.035 - 19,
        z * 0.035 + 11,
        4
    ) * 6;

    const wx = x + warpX;
    const wz = z + warpZ;

    const hills = fbm(
        wx * 0.045,
        wz * 0.045,
        5
    ) * 4;

    const uneven = fbm(
        wx * 0.18,
        wz * 0.18,
        4
    ) * 1.2;

    const bumps = fbm(
        x * 0.9,
        z * 0.9,
        3
    ) * 0.25;

    const rockNoise = fbm(
        x * 0.5,
        z * 0.5,
        4
    );

    const rocks = Math.pow(
        Math.abs(rockNoise),
        3
    ) * 0.35;

    const mountains =
        mountainRidge(
            wx, wz,
            -145, -110,
            130, -115,
            27,
            36,
            1.3
        ) +
        mountainRidge(
            wx, wz,
            -135, 120,
            125, 135,
            31,
            36 * 0.92,
            2.8
        ) +
        mountainRidge(
            wx, wz,
            -155, -90,
            -155, 105,
            25,
            36 * 0.83,
            4.1
        ) +
        mountainRidge(
            wx, wz,
            148, -108,
            151, 103,
            28,
            36 * 0.88,
            5.6
        );

    const mountainTexture =
        mountains * 0.035 *
        fbm(
            wx * 0.08 + 21,
            wz * 0.08 - 13,
            4
        );

    const spawnFade = THREE.MathUtils.smoothstep(
        Math.hypot(x, z),
        3,
        12
    );

    const baseHeight = (
        localGroundRelief(x, 50000, z, hills, uneven, bumps + rocks) +
        mountains +
        mountainTexture +
        craterHeight(x, z)
    ) * spawnFade;
    return shapeMarsTerrain(x, z, baseHeight);
}

