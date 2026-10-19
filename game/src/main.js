
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMarsPlanet, createPlanetStreamer } from './planet.js';
import { createPlanetView } from './planet-view.js';
import { createPlanetLife } from './planet-life.js';
import { createPlanetFlight } from './planet-flight.js';
import { createGraphics } from './graphics.js';
import { getDrivingPanel } from './ui.js';
import { mobileGraphics } from './performance.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { stepDrive } from './driving.js';
import { createTouchControls } from './touch-controls.js';
import { createAutonomousRover } from './autonomous-rover.js';
import { createBeaconRace, isRaceCorridor } from './beacon-race.js';
import { getMarsRegion, shapeMarsTerrain, isSurveyApproach, createMarsExploration } from './mars-world.js';
import { createRockerBogieSolver, createWheelSupportSampler } from './suspension.js';
import { addSky, addMarsSurfaceDetail, createMarsGroundTextures, createMarsRockTextures, createRoverMaterials, createWheelEffects, createWheelThrusterEffects } from './visuals.js';

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

const CONFIG = {
    MODEL_PATH: '/papaya-pathfinder.fbx',
    MODEL_SIZE: 2,

    MAX_STEERING_ANGLE: THREE.MathUtils.degToRad(45),
    STEERING_SPEED: 5,
    MAX_SPEED: 8,
    RACE_MAX_SPEED: 7,
    DRIVE_THRUST_ACCELERATION: 5,
    HOP_SPEED: 6,
    CONTINUOUS_LIFT_ACCELERATION: 90,
    FLIGHT_ASCENT_SPEED: 2500,
    FLIGHT_DESCENT_SPEED: 1800,
    AIR_THRUST_ACCELERATION: 11,
    AIR_BOOST_ACCELERATION: 60,
    AIR_FORWARD_BOOST_ACCELERATION: 1800,
    AIR_BOOST_ACCELERATION_RAMP: 1200,
    AIR_BOOST_CRUISE_SPEED: 6000,
    AIR_BOOST_LOW_ALTITUDE_SPEED: 40,
    AIR_BOOST_SPEED_RESPONSE: 2,
    AIR_LATERAL_STABILIZATION_ACCELERATION: 70,
    AIR_FAST_TURN_SPEED: 35,
    AIR_BOOST_DRIFT_DAMPING: 0.035,
    AIR_YAW_SPEED: 1.5,
    AIR_YAW_RESPONSE: 4.5,
    AIR_DRIFT_DAMPING: 0.25,
    AIR_BRAKING_RESPONSE: 4,
    MAX_REVERSE_SPEED: 3,
    STEERING_HIGH_SPEED_FACTOR: 0.35,
    YAW_RESPONSE: 4,
    PIVOT_YAW_SPEED: 0.65,
    LATERAL_RESPONSE: 14,
    PHYSICS_STEP: 1 / 60,
    SUSPENSION_ITERATIONS: mobileGraphics ? 4 : 5,
    MAX_FRAME_TIME: 0.1,

    WHEEL_RADIUS_FBX: 54,
    WHEEL_HALF_WIDTH_FBX: 20,
    GROUND_CLEARANCE: 0.008,
    WHEEL_CONTACT_TOLERANCE: 0.045,
    SUSPENSION_ATTACH_DISTANCE: 0.035,
    SUSPENSION_RELEASE_DISTANCE: 0.16,
    SUSPENSION_HEIGHT_SPEED: 2.2,

    GRAVITY: 9.81,
    FALL_GRAVITY: 9.81,

    ROCKER_MAX_ANGLE: THREE.MathUtils.degToRad(35),
    BOGIE_MAX_ANGLE: THREE.MathUtils.degToRad(45),
    SUSPENSION_RESPONSE: 28,
    SUSPENSION_JOINT_SPEED: 3,
    SUSPENSION_CHASSIS_SPEED: 1.8,
    SUSPENSION_DROOP: 0.65,
    SUSPENSION_PITCH_LIMIT: THREE.MathUtils.degToRad(75),
    SUSPENSION_ROLL_LIMIT: THREE.MathUtils.degToRad(55),

    MOTOR_ACCELERATION: 4.5,
    THROTTLE_RESPONSE: 6,
    THROTTLE_RELEASE_RESPONSE: 12,
    BRAKE_RESPONSE: 10,
    COAST_BRAKING_ACCELERATION: 4.5,
    COAST_BRAKE_RESPONSE: 8,
    DESCENT_VERTICAL_SPEED: 1.3,
    DESCENT_SPEED_RESPONSE: 3,
    HILL_HOLD_TIME: 0.7,
    UNDERSTEER_SPEED: 6,
    CENTER_OF_MASS_HEIGHT: 0.45,
    LOW_GEAR_ACCELERATION: 15,
    CLIMB_GRIP: 2.6,
    CLIMB_ASSIST_MAX_ANGLE: THREE.MathUtils.degToRad(65),
    BRAKING_ACCELERATION: 7,
    ROLLING_RESISTANCE: 0.16,
    AIR_RESISTANCE: 0.008,

    SAND_GRIP: 0.75,
    ROCK_GRIP: 1.05,
    STATIC_GRIP_FACTOR: 1.10,

    WHEEL_SPIN_RESPONSE: 6,
    MAX_WHEEL_SPIN_SPEED: 15,

    TERRAIN_SIZE: 400,
    TERRAIN_SEGMENTS: mobileGraphics ? 384 : 512,
    HILL_HEIGHT: 4,
    UNEVEN_HEIGHT: 1.2,
    BUMP_HEIGHT: 0.25,
    ROCK_HEIGHT: 0.35,
    MOUNTAIN_HEIGHT: 36,

    ROCK_COUNT: 1300,
    ROCK_SPAWN_CLEARANCE: 7,
    WHEEL_STEP_RATIO: 1.8,
    ROCK_CLIMB_SPEED: 1.6,
    CRAWL_BRAKING_RESPONSE: 3,

    CAMERA_DISTANCE: 11,
    CAMERA_HEIGHT: 4,
    CAMERA_LOOK_AHEAD: 1,
    CAMERA_TARGET_HEIGHT: 0.35,
    CAMERA_FOLLOW_SPEED: 1.5,
    CAMERA_ROTATION_SPEED: 1.4,
    CAMERA_MOUSE_DELAY: 2.5,
    CAMERA_GROUND_MARGIN: 1.8,

    HUD_ENABLED: true,
    HUD_UPDATE_INTERVAL: 0.1,

    SHOW_PIVOTS: false,
    SHOW_COLLIDERS: false
};

const WHEEL_NAMES = [
    'wheel', 'wheel1', 'wheel2',
    'wheel3', 'wheel4', 'wheel5'
];

const STEERING_CONFIGURATION = [
    {
        wheel: 'wheel',
        mount: 'motor_mount_arm_left',
        position: 'rear'
    },
    {
        wheel: 'wheel2',
        mount: 'motor_mount_pivot_left',
        position: 'front'
    },
    {
        wheel: 'wheel3',
        mount: 'motor_mount_arm_right',
        position: 'rear'
    },
    {
        wheel: 'wheel5',
        mount: 'motor_mount_pivot_right',
        position: 'front'
    }
];

// -----------------------------------------------------------------------------
// PHYSICS
// -----------------------------------------------------------------------------

await RAPIER.init();

const world = new RAPIER.World({
    x: 0,
    y: -CONFIG.GRAVITY,
    z: 0
});

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

const CYLINDER_ROTATION = new THREE.Quaternion()
    .setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -Math.PI / 2
    );

// -----------------------------------------------------------------------------
// SCENE
// -----------------------------------------------------------------------------

const scene = new THREE.Scene();

scene.background = new THREE.Color(0xddb596);
scene.fog = new THREE.FogExp2(0xddb596, 0.007);
const sky = addSky(scene);

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 7, 30);

const renderer = new THREE.WebGLRenderer({
    antialias: mobileGraphics
});

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild(renderer.domElement);
const graphics = createGraphics(renderer, scene, camera);
graphics.resize(window.innerWidth, window.innerHeight);

// -----------------------------------------------------------------------------
// CAMERA
// -----------------------------------------------------------------------------

// Keep terrain clearance out of the orbit/follow state. Feeding the corrected
// render position back into the controls makes them fight the ground constraint.
const cameraOrbit = camera.clone();
const controls = new OrbitControls(
    cameraOrbit,
    renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;

controls.minDistance = 3;
controls.maxDistance = 45;
controls.maxPolarAngle = THREE.MathUtils.degToRad(85);

controls.target.set(0, 1, 0);
controls.update();

let cameraDragging = false;
let cameraManualDelay = 0;
let cameraSpaceBlend = 0;

const cameraFollowPosition = new THREE.Vector3();
const cameraFollowTarget = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const lastRoverPosition = new THREE.Vector3();
const cameraDisplacement = new THREE.Vector3();
let cameraGroundEnvelope = -Infinity;

controls.addEventListener('start', () => {
    cameraDragging = true;
});

controls.addEventListener('end', () => {
    cameraDragging = false;
    cameraManualDelay = CONFIG.CAMERA_MOUSE_DELAY;
});

function getCameraMinimumHeight(position) {
    // Include the area around the lens so slopes cannot clip into the view.
    const radius = 0.4;
    let minimumHeight = -Infinity;

    for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
            const height = getPhysicalGroundHeight(
                position.x + x * radius,
                position.z + z * radius
            );
            if (height !== null) {
                minimumHeight = Math.max(
                    minimumHeight,
                    height + CONFIG.CAMERA_GROUND_MARGIN
                );
            }
        }
    }

    return minimumHeight;
}

function updateCameraControls(delta) {
    controls.update(delta);
    const minimumHeight = getCameraMinimumHeight(cameraOrbit.position);
    if (Number.isFinite(minimumHeight)) {
        // Extra clearance absorbs small surface changes; release it gradually
        // after a rock instead of dropping and lifting again on its edges.
        const clearanceHeight = minimumHeight + 0.4;
        cameraGroundEnvelope = Number.isFinite(cameraGroundEnvelope)
            ? Math.max(clearanceHeight, THREE.MathUtils.lerp(
                cameraGroundEnvelope, clearanceHeight, 1 - Math.exp(-2 * delta)))
            : clearanceHeight;
    } else {
        cameraGroundEnvelope = -Infinity;
    }
    const desiredHeight = Math.max(cameraOrbit.position.y, cameraGroundEnvelope);
    const height = THREE.MathUtils.lerp(camera.position.y, desiredHeight,
        1 - Math.exp(-8 * delta));
    camera.position.copy(cameraOrbit.position);
    camera.position.y = Math.max(height, minimumHeight);
    camera.lookAt(controls.target);
}

function updateFollowCamera(delta) {
    if (!rover) {
        updateCameraControls(delta);
        return;
    }

    cameraDisplacement.subVectors(
        rover.position,
        lastRoverPosition
    );

    // Filter vertical chassis movement so individual wheel contacts do not
    // shake the camera or its look-at point.
    if (groundContact > 0) cameraDisplacement.y *= 1 - Math.exp(-5 * delta);
    else camera.position.add(cameraDisplacement);
    cameraOrbit.position.add(cameraDisplacement);
    controls.target.add(cameraDisplacement);

    lastRoverPosition.add(cameraDisplacement);

    if (cameraDragging) {
        updateCameraControls(delta);
        return;
    }

    if (cameraManualDelay > 0) {
        cameraManualDelay = Math.max(
            0,
            cameraManualDelay - delta
        );

        updateCameraControls(delta);
        return;
    }

    cameraForward.copy(FORWARD)
        .applyAxisAngle(UP, roverYaw);

    const speedRatio = Math.min(1, Math.abs(currentSpeed) / CONFIG.MAX_SPEED);
    const flightAltitude = Math.max(0, planet.coordinates(rover.position).altitude);
    const spaceTarget = THREE.MathUtils.smoothstep(Math.log1p(flightAltitude), Math.log1p(1500), Math.log1p(60000));
    cameraSpaceBlend += (spaceTarget - cameraSpaceBlend) * (1 - Math.exp(-2 * delta));
    const spaceView = cameraSpaceBlend;
    cameraFollowPosition.copy(rover.position)
        .addScaledVector(cameraForward, -THREE.MathUtils.lerp(CONFIG.CAMERA_DISTANCE + speedRatio * 2, 0.5, spaceView));

    cameraFollowPosition.y += THREE.MathUtils.lerp(CONFIG.CAMERA_HEIGHT + speedRatio * 0.6, 40, spaceView);

    cameraFollowTarget.copy(rover.position)
        .addScaledVector(
            cameraForward,
            CONFIG.CAMERA_LOOK_AHEAD * (1 - spaceView)
        );

    cameraFollowTarget.y += CONFIG.CAMERA_TARGET_HEIGHT;

    const positionFactor = 1 - Math.exp(
        -CONFIG.CAMERA_FOLLOW_SPEED * delta
    );

    const rotationFactor = 1 - Math.exp(
        -CONFIG.CAMERA_ROTATION_SPEED * delta
    );

    cameraOrbit.position.lerp(
        cameraFollowPosition,
        positionFactor
    );

    controls.target.lerp(
        cameraFollowTarget,
        rotationFactor
    );

    updateCameraControls(delta);
}

// -----------------------------------------------------------------------------
// LIGHTING
// -----------------------------------------------------------------------------

scene.add(
    new THREE.HemisphereLight(
        0xffe8cd,
        0xa77a5c,
        2.0
    )
);

const sunlight = new THREE.DirectionalLight(
    0xffefd6,
    3.4
);

sunlight.position.set(-45, 30, -35);
sunlight.castShadow = true;
const shadowSize = mobileGraphics ? 1024 : 2048;
sunlight.shadow.mapSize.set(shadowSize, shadowSize);
sunlight.shadow.normalBias = 0.02;
sunlight.shadow.bias = -0.0001;

sunlight.shadow.camera.left = -32;
sunlight.shadow.camera.right = 32;
sunlight.shadow.camera.top = 32;
sunlight.shadow.camera.bottom = -32;
sunlight.shadow.camera.near = 0.1;
sunlight.shadow.camera.far = 150;

scene.add(sunlight, sunlight.target);

// -----------------------------------------------------------------------------
// PROCEDURAL NOISE
// -----------------------------------------------------------------------------

function hash(x, z) {
    const value = Math.sin(
        x * 127.1 + z * 311.7
    ) * 43758.5453;

    return value - Math.floor(value);
}

function smoothNoise(x, z) {
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

function fbm(x, z, octaves = 5) {
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

function getHomeTerrainHeight(x, z) {
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
    ) * CONFIG.HILL_HEIGHT;

    const uneven = fbm(
        wx * 0.18,
        wz * 0.18,
        4
    ) * CONFIG.UNEVEN_HEIGHT;

    const bumps = fbm(
        x * 0.9,
        z * 0.9,
        3
    ) * CONFIG.BUMP_HEIGHT;

    const rockNoise = fbm(
        x * 0.5,
        z * 0.5,
        4
    );

    const rocks = Math.pow(
        Math.abs(rockNoise),
        3
    ) * CONFIG.ROCK_HEIGHT;

    const mountains =
        mountainRidge(
            wx, wz,
            -145, -110,
            130, -115,
            27,
            CONFIG.MOUNTAIN_HEIGHT,
            1.3
        ) +
        mountainRidge(
            wx, wz,
            -135, 120,
            125, 135,
            31,
            CONFIG.MOUNTAIN_HEIGHT * 0.92,
            2.8
        ) +
        mountainRidge(
            wx, wz,
            -155, -90,
            -155, 105,
            25,
            CONFIG.MOUNTAIN_HEIGHT * 0.83,
            4.1
        ) +
        mountainRidge(
            wx, wz,
            148, -108,
            151, 103,
            28,
            CONFIG.MOUNTAIN_HEIGHT * 0.88,
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
        hills +
        uneven +
        bumps +
        rocks +
        mountains +
        mountainTexture +
        craterHeight(x, z)
    ) * spawnFade;
    return shapeMarsTerrain(x, z, baseHeight);
}

// -----------------------------------------------------------------------------
// TERRAIN GEOMETRY
// -----------------------------------------------------------------------------

const planet = createMarsPlanet({ radius: 50000, homeHeight: getHomeTerrainHeight });
const homeland = new THREE.Group(); homeland.name = 'original-landing-region'; scene.add(homeland);
function getTerrainHeight(x, z) { return planet.heightAt(x, z); }


const terrainGeometry = new THREE.PlaneGeometry(
    CONFIG.TERRAIN_SIZE,
    CONFIG.TERRAIN_SIZE,
    CONFIG.TERRAIN_SEGMENTS,
    CONFIG.TERRAIN_SEGMENTS
);

terrainGeometry.rotateX(-Math.PI / 2);

const terrainPositions =
    terrainGeometry.attributes.position;

for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);

    terrainPositions.setY(
        i,
        getTerrainHeight(x, z)
    );
}

terrainPositions.needsUpdate = true;
terrainGeometry.computeVertexNormals();

// -----------------------------------------------------------------------------
// TERRAIN COLORS
// -----------------------------------------------------------------------------

const terrainColors = new Float32Array(
    terrainPositions.count * 3
);

const darkBasalt = new THREE.Color(0x4d4742);
const oxidizedSoil = new THREE.Color(0x994a32);
const dustySand = new THREE.Color(0xb97851);
const lightDust = new THREE.Color(0xd3a77b);
const cliffRock = new THREE.Color(0x795c49);
const duneSand = new THREE.Color(0xc79562);
const lakeSediment = new THREE.Color(0xc9b49a);
const basaltSoil = new THREE.Color(0x645951);

const tmpColor = new THREE.Color();

for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const height = terrainPositions.getY(i);

    const slope = 1 - Math.abs(
        terrainGeometry.attributes.normal.getY(i)
    );

    const dust =
        smoothNoise(x * 0.08, z * 0.08) * 0.5 + 0.5;

    const patches = fbm(
        x * 0.22 + 3,
        z * 0.22 - 7,
        3
    );

    tmpColor.copy(oxidizedSoil)
        .lerp(dustySand, dust * 0.8);

    tmpColor.lerp(
        lightDust,
        THREE.MathUtils.smoothstep(
            height, 4, 22
        ) * 0.55
    );

    tmpColor.lerp(
        darkBasalt,
        THREE.MathUtils.smoothstep(
            -patches, 0.2, 0.7
        ) * 0.4
    );

    tmpColor.lerp(
        cliffRock,
        THREE.MathUtils.smoothstep(
            slope, 0.12, 0.55
        ) * 0.8
    );

    const region = getMarsRegion(x, z);
    tmpColor.lerp(duneSand, region.dunes * 0.75);
    tmpColor.lerp(lakeSediment, region.lake * 0.85);
    tmpColor.lerp(basaltSoil, region.basalt * 0.7);
    const strata = Math.sin(height * 1.5 + Math.sin(x * 0.05) * 0.4) * 0.5 + 0.5;
    tmpColor.lerp(lightDust, (region.canyon + region.mesas) * slope * strata * 0.35);

    tmpColor.multiplyScalar(
        0.93 + 0.14 * hash(
            Math.floor(x * 2),
            Math.floor(z * 2)
        )
    );

    terrainColors[i * 3] = tmpColor.r;
    terrainColors[i * 3 + 1] = tmpColor.g;
    terrainColors[i * 3 + 2] = tmpColor.b;
}

terrainGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(terrainColors, 3)
);

const ground = new THREE.Mesh(
    terrainGeometry,
    addMarsSurfaceDetail(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        ...createMarsGroundTextures(renderer, CONFIG.TERRAIN_SIZE),
        bumpScale: 0.018,
        side: THREE.DoubleSide
    }))
);

ground.receiveShadow = true;
homeland.add(ground);

// -----------------------------------------------------------------------------
// TERRAIN COLLIDER
// -----------------------------------------------------------------------------

const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
);

world.createCollider(
    RAPIER.ColliderDesc.trimesh(
        new Float32Array(
            terrainGeometry.attributes.position.array
        ),
        new Uint32Array(
            terrainGeometry.index.array
        )
    ).setFriction(2),
    groundBody
);

// -----------------------------------------------------------------------------
// PROCEDURAL ROCKS
// -----------------------------------------------------------------------------

// Weathered silhouettes; the visible hull is also used for collision.
const rockShapes = Array.from({ length: 5 }, (_, index) => {
    const base = new THREE.IcosahedronGeometry(1, 1);
    const positions = base.attributes.position;
    const points = [];
    for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i);
        const erosion = 1 + smoothNoise(point.x * 2.7 + index * 13,
            point.z * 2.7 + point.y * 1.8) * 0.18;
        point.multiplyScalar(erosion);
        point.y *= 0.9 + smoothNoise(point.x * 3 + index, point.z * 3) * 0.1;
        points.push(point);
    }
    const hull = new ConvexGeometry(points);
    hull.deleteAttribute('normal');
    const shape = mergeVertices(hull);
    shape.computeVertexNormals();
    hull.dispose();
    base.dispose();
    return shape;
});

const rockColors = [
    new THREE.Color(0x754536),
    new THREE.Color(0x6b5049),
    new THREE.Color(0xaa6748),
    new THREE.Color(0x4e3c39),
    new THREE.Color(0xbd8060)
];

let rockSeed = 817259;

function rockRandom() {
    rockSeed = (
        1664525 * rockSeed + 1013904223
    ) >>> 0;

    return rockSeed / 4294967296;
}

const rockTextures = createMarsRockTextures(renderer);
const rockGroups = rockShapes.map(geometry => {
    const mesh = new THREE.InstancedMesh(
        geometry,
        addMarsSurfaceDetail(new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1,
            metalness: 0,
            flatShading: false
        }), true, rockTextures),
        CONFIG.ROCK_COUNT
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;

    homeland.add(mesh);

    return mesh;
});

const rockObject = new THREE.Object3D();

for (let i = 0; i < CONFIG.ROCK_COUNT; i++) {
    const nearRover = rockRandom() < 0.65;

    const areaSize = nearRover
        ? 230
        : CONFIG.TERRAIN_SIZE - 8;

    const x = (rockRandom() - 0.5) * areaSize;
    const z = (rockRandom() - 0.5) * areaSize;

    if (
        Math.hypot(x, z) <
        CONFIG.ROCK_SPAWN_CLEARANCE || isSurveyApproach(x, z) || isRaceCorridor(x, z)
    ) {
        continue;
    }

    const region = getMarsRegion(x, z);
    const density = 0.75 - region.dunes * 0.65 - region.lake * 0.64 + region.basalt * 0.25;
    if (rockRandom() > density) continue;
    const sizeRoll = rockRandom();

    const radius = sizeRoll > (region.basalt > 0.4 ? 0.83 : 0.94)
        ? 0.65 + rockRandom() * (region.basalt > 0.4 ? 1.8 : 1)
        : 0.06 + Math.pow(
        rockRandom(), 2.1
    ) * 0.62;

    const group = rockGroups[
        Math.floor(rockRandom() * rockGroups.length)
        ];

    const index = group.count++;
    const y = getTerrainHeight(x, z);

    rockObject.position.set(
        x,
        y + radius * 0.30,
        z
    );

    rockObject.rotation.set(
        (rockRandom() - 0.5) * 0.35,
        rockRandom() * Math.PI * 2,
        (rockRandom() - 0.5) * 0.35
    );

    rockObject.scale.set(
        radius * (0.85 + rockRandom() * 0.55),
        radius * (0.50 + rockRandom() * 0.45),
        radius * (0.85 + rockRandom() * 0.55)
    );

    rockObject.updateMatrix();

    group.setMatrixAt(index, rockObject.matrix);

    tmpColor.copy(rockColors[Math.floor(rockRandom() * rockColors.length)]);
    tmpColor.lerp(darkBasalt, region.basalt * 0.8);
    tmpColor.lerp(lightDust, region.mesas * 0.35);
    group.setColorAt(index, tmpColor);

    // Every visible stone has the same scaled, rotated hull in Rapier.
    const vertices = group.geometry.attributes.position;
    const hullVertices = new Float32Array(vertices.count * 3);
    for (let vertex = 0; vertex < vertices.count; vertex++) {
        hullVertices[vertex * 3] = vertices.getX(vertex) * rockObject.scale.x;
        hullVertices[vertex * 3 + 1] = vertices.getY(vertex) * rockObject.scale.y;
        hullVertices[vertex * 3 + 2] = vertices.getZ(vertex) * rockObject.scale.z;
    }
    const collider = RAPIER.ColliderDesc.convexHull(hullVertices);
    if (collider) {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
            .setTranslation(rockObject.position.x, rockObject.position.y, rockObject.position.z)
            .setRotation(rockObject.quaternion));
        world.createCollider(collider.setFriction(1.5).setRestitution(0), body);
    }
}

for (const mesh of rockGroups) {
    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
    }

    mesh.computeBoundingSphere();
}

// -----------------------------------------------------------------------------
// ROVER STATE
// -----------------------------------------------------------------------------

let rover = null;
let autonomousRover = null;
let beaconRace = null;
let planetView = null;

let currentSpeed = 0;
let wheelSurfaceSpeed = 0;
let wheelSlip = 0;

let currentSteering = 0;
let verticalVelocity = 0;

let roverYaw = 0;
let currentPitch = 0;
let currentRoll = 0;

let currentSlope = 0;
let currentGrip = CONFIG.SAND_GRIP;
let wheelbase = 1.4;
const driveState = { speed: 0, lateralSpeed: 0, yawRate: 0, slip: 0 };
let groundContact = 0;
let rockContact = false;
let chassisVisual = null;
let visualPitch = 0;
let visualRoll = 0;
let previousVisualSpeed = 0;
const sunOffset = new THREE.Vector3(-45, 30, -35);
const lateralVector = new THREE.Vector3();
const collisionRotation = new THREE.Quaternion();
let chassisCollision = null;
const wheelSupport = createWheelSupportSampler(world, RAPIER, CONFIG.GROUND_CLEARANCE, getTerrainHeight);

const wheelAssemblies = [];
const suspensionSides = [];
let suspensionSolver = null;
let suspensionTracking = false;
let suspensionLoad = 0;
const keys = new Set();
const touchControls = createTouchControls();
const input = { has: code => {
    if (beaconRace?.movementLocked && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code)) {
        return code === 'Space';
    }
    return keys.has(code) || touchControls.has(code);
} };
function controlAxis(name, positive, negative) {
    if (beaconRace?.movementLocked) return 0;
    const keyboard = Number(keys.has(positive)) - Number(keys.has(negative));
    return keyboard || touchControls.axis?.(name) || 0;
}
let hopHeld = false, hopRequested = false, hopAirborne = false;
let flightHoldAltitude = null;
let poweredFlight = false;
let flightPitch = 0;
let flightRadialSpeed = 0;
let flightVerticalThrust = 0;
const flightPosition = new THREE.Vector3();

const moveVector = new THREE.Vector3();
const hopDirection = new THREE.Vector3();
const gravityDirection = new THREE.Vector3();
const airThrustVisual = new THREE.Vector3();

const wheelWorldPosition = new THREE.Vector3();
const wheelWorldQuaternion = new THREE.Quaternion();

const yawQuaternion = new THREE.Quaternion();
const tiltQuaternion = new THREE.Quaternion();
const tiltEuler = new THREE.Euler(0, 0, 0, 'XYZ');

// -----------------------------------------------------------------------------
// GROUND QUERIES
// -----------------------------------------------------------------------------

function getPhysicalGroundHeight(x, z) {
    const rayStartY = getTerrainHeight(x, z) + 40;

    const ray = new RAPIER.Ray(
        { x, y: rayStartY, z },
        { x: 0, y: -1, z: 0 }
    );

    const hit = world.castRay(
        ray,
        200,
        true,
        RAPIER.QueryFilterFlags.ONLY_FIXED
    );

    if (!hit) return null;

    return rayStartY - hit.timeOfImpact;
}

// -----------------------------------------------------------------------------
// SURFACE GRIP
// -----------------------------------------------------------------------------

const terrainRegionPoint = new THREE.Vector3();
function getTerrainGrip(x, z) {
    if (!planet.homeFrame || Math.max(Math.abs(x), Math.abs(z)) > 200) {
        planet.toGlobal(terrainRegionPoint.set(x, 0, z), terrainRegionPoint).normalize();
        const rockiness = (planet.surface(terrainRegionPoint).region.rocks - 8) / 48;
        return THREE.MathUtils.lerp(CONFIG.SAND_GRIP, CONFIG.ROCK_GRIP, rockiness);
    }
    const surfaceNoise = fbm(
        x * 0.035 + 70,
        z * 0.035 - 40,
        4
    );

    const rockyFactor = THREE.MathUtils.smoothstep(
        surfaceNoise,
        -0.15,
        0.35
    );

    return THREE.MathUtils.lerp(
        CONFIG.SAND_GRIP,
        CONFIG.ROCK_GRIP,
        rockyFactor
    );
}

// -----------------------------------------------------------------------------
// FORWARD SLOPE
// -----------------------------------------------------------------------------

function getForwardSlope() {
    if (!rover) return 0;

    const distance = 1.5;

    const direction = FORWARD.clone()
        .applyQuaternion(yawQuaternion);

    const x = rover.position.x;
    const z = rover.position.z;

    const frontHeight = getTerrainHeight(
        x + direction.x * distance,
        z + direction.z * distance
    );

    const rearHeight = getTerrainHeight(
        x - direction.x * distance,
        z - direction.z * distance
    );

    return Math.atan2(
        frontHeight - rearHeight,
        distance * 2
    );
}

// -----------------------------------------------------------------------------
// MOTOR, GRAVITY AND TRACTION
// -----------------------------------------------------------------------------

function updateDrivePhysics(throttle, delta, pivotTurn = 0, pivotAlignment = 0) {
    if (!rover) return;

    rover.updateMatrixWorld(true);
    let contacts = 0;
    let grip = 0;
    let supportedLoad = 0;
    // Forward deceleration shifts load onto the front axle; acceleration loads the rear.
    const loadShift = THREE.MathUtils.clamp(
        -(driveState.acceleration ?? 0) * CONFIG.CENTER_OF_MASS_HEIGHT /
        (CONFIG.GRAVITY * wheelbase), -0.2, 0.2
    );
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(wheelWorldPosition);
        const support = wheelSupport(wheelWorldPosition.x, wheelWorldPosition.z,
            wheel.radius, roverYaw + wheel.steeringPivot.rotation.y, wheel.halfWidth);
        if (support !== null && Math.abs(wheelWorldPosition.y - support) <= CONFIG.WHEEL_CONTACT_TOLERANCE) {
            contacts++;
            const axlePosition = THREE.MathUtils.clamp(-wheel.wheelCenter.z / wheelbase, -0.5, 0.5);
            const load = 1 + axlePosition * loadShift * 4;
            supportedLoad += load;
            grip += getTerrainGrip(wheelWorldPosition.x, wheelWorldPosition.z) * load;
        }
    }
    // The supported wheels carry the chassis load; two planted wheels must
    // not reduce available traction to a third on uneven ground.
    groundContact = hopAirborne ? 0 : Math.min(1, contacts / 2);
    currentSlope = getForwardSlope();
    currentGrip = supportedLoad > 0 ? grip / supportedLoad : 0;

    stepDrive(driveState, {
        throttle,
        racing: beaconRace?.racing ?? false,
        brake: input.has('Space'),
        steering: currentSteering,
        flightBoost: input.has('KeyG'),
        airPitch: poweredFlight ? currentPitch : 0,
        airClearance: rover.position.y - getTerrainHeight(rover.position.x, rover.position.z),
        airSteering: controlAxis('steering', 'KeyA', 'KeyD'),
        airStrafe: controlAxis('strafe', 'ArrowLeft', 'ArrowRight'),
        pivotTurn,
        pivotAlignment,
        slope: currentSlope,
        roll: currentRoll,
        grip: currentGrip,
        contact: groundContact,
        rockContact,
        suspensionLoad,
        wheelbase
    }, delta, CONFIG);
    if (groundContact <= 0 && !poweredFlight) {
        planet.upAt(rover.position, gravityDirection);
        const gx = -CONFIG.FALL_GRAVITY * gravityDirection.x * delta;
        const gz = -CONFIG.FALL_GRAVITY * gravityDirection.z * delta;
        driveState.speed += -Math.sin(roverYaw) * gx - Math.cos(roverYaw) * gz;
        driveState.lateralSpeed += Math.cos(roverYaw) * gx - Math.sin(roverYaw) * gz;
    }
    currentSpeed = driveState.speed;
    wheelSlip = driveState.slip;

    const freeSpinSpeed = throttle * CONFIG.MAX_WHEEL_SPIN_SPEED;
    const targetWheelSpeed = THREE.MathUtils.lerp(currentSpeed, freeSpinSpeed, wheelSlip);
    wheelSurfaceSpeed = THREE.MathUtils.lerp(
        wheelSurfaceSpeed, targetWheelSpeed,
        1 - Math.exp(-CONFIG.WHEEL_SPIN_RESPONSE * delta)
    );
}

// -----------------------------------------------------------------------------
// FBX HELPERS
// -----------------------------------------------------------------------------

function extractMesh(
    originalMesh,
    roverRoot,
    pivotCenter
) {
    originalMesh.updateWorldMatrix(true, false);
    roverRoot.updateMatrixWorld(true);

    const transform = new THREE.Matrix4()
        .multiplyMatrices(
            roverRoot.matrixWorld.clone().invert(),
            originalMesh.matrixWorld
        );

    const geometry = originalMesh.geometry.clone();
    geometry.applyMatrix4(transform);

    geometry.translate(
        -pivotCenter.x,
        -pivotCenter.y,
        -pivotCenter.z
    );

    const mesh = new THREE.Mesh(
        geometry,
        originalMesh.material
    );

    mesh.name = originalMesh.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    originalMesh.visible = false;

    return mesh;
}

function partCenter(model, name) {
    const part = model.getObjectByName(name);

    if (!part?.isMesh) {
        throw new Error(`FBX part not found: ${name}`);
    }

    const box = new THREE.Box3().setFromObject(part);

    return rover.worldToLocal(
        box.getCenter(new THREE.Vector3())
    );
}

function attachMovingPart(
    model,
    name,
    parent,
    pivotCenter
) {
    const part = model.getObjectByName(name);

    if (!part?.isMesh) {
        console.warn('Suspension part not found:', name);
        return;
    }

    parent.add(
        extractMesh(
            part,
            rover,
            pivotCenter
        )
    );
}

// -----------------------------------------------------------------------------
// WHEEL COLLIDERS
// -----------------------------------------------------------------------------

function createWheelCollider(assembly) {
    const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
    );

    const collider = RAPIER.ColliderDesc.cylinder(
        assembly.halfWidth,
        assembly.radius
    );

    collider.setRotation(CYLINDER_ROTATION);
    collider.setFriction(2);
    collider.setRestitution(0);

    world.createCollider(collider, body);

    assembly.physicsBody = body;
    assembly.contactShape = new RAPIER.Cylinder(assembly.halfWidth * 0.96, assembly.radius * 0.96);
}

// -----------------------------------------------------------------------------
// SUSPENSION HIERARCHY
// -----------------------------------------------------------------------------

function createSuspensionSide(
    model,
    sideName,
    names
) {
    const rockerOrigin = partCenter(
        model,
        names.hinge
    );

    const bogieOrigin = partCenter(
        model,
        names.bogie
    );

    // Locate the actual joints rather than using the centers of the arm meshes.
    // The rocker axle sits beside the body; the bogie bearing is at its top.
    const hingeBounds = new THREE.Box3().setFromObject(model.getObjectByName(names.hinge))
        .applyMatrix4(rover.matrixWorld.clone().invert());
    const bogieBounds = new THREE.Box3().setFromObject(model.getObjectByName(names.bogie))
        .applyMatrix4(rover.matrixWorld.clone().invert());
    const bearingRadius = (hingeBounds.max.y - hingeBounds.min.y) * 0.5;
    const bodyCenter = partCenter(model, 'body');
    rockerOrigin.z = THREE.MathUtils.clamp(bodyCenter.z,
        hingeBounds.min.z + bearingRadius, hingeBounds.max.z - bearingRadius);
    bogieOrigin.y = bogieBounds.max.y - bearingRadius;

    const rocker = new THREE.Group();

    rocker.name = `rocker_${sideName}`;
    rocker.position.copy(rockerOrigin);

    rover.add(rocker);

    const bogie = new THREE.Group();

    bogie.name = `bogie_${sideName}`;

    bogie.position.copy(bogieOrigin)
        .sub(rockerOrigin);

    rocker.add(bogie);

    attachMovingPart(
        model,
        names.arm,
        rocker,
        rockerOrigin
    );

    attachMovingPart(
        model,
        names.pivot,
        bogie,
        bogieOrigin
    );

    attachMovingPart(model, names.hinge, rocker, rockerOrigin);

    if (CONFIG.SHOW_PIVOTS) {
        rocker.add(new THREE.AxesHelper(0.3));
        bogie.add(new THREE.AxesHelper(0.3));
    }

    const side = {
        name: sideName,
        rocker,
        bogie,
        rockerOrigin,
        bogieOrigin,
        wheelNames: names.wheels,
        rockerAngle: 0,
        bogieAngle: 0
    };

    suspensionSides.push(side);

    return side;
}

// -----------------------------------------------------------------------------
// WHEEL ASSEMBLY
// -----------------------------------------------------------------------------

function createWheelAssembly(
    model,
    name,
    configuration,
    scale,
    side
) {
    const originalWheel = model.getObjectByName(name);

    if (!originalWheel?.isMesh) {
        console.error('Wheel not found:', name);
        return;
    }

    const wheelCenter = partCenter(model, name);

    const isRear =
        side.wheelNames.rear === name;

    const parent = isRear
        ? side.rocker
        : side.bogie;

    const parentOrigin = isRear
        ? side.rockerOrigin
        : side.bogieOrigin;

    const steeringPivot = new THREE.Group();

    steeringPivot.name = `steering_${name}`;

    steeringPivot.position.copy(wheelCenter)
        .sub(parentOrigin);

    parent.add(steeringPivot);

    const wheelSpinner = new THREE.Group();

    wheelSpinner.name = `spinner_${name}`;
    steeringPivot.add(wheelSpinner);

    wheelSpinner.add(
        extractMesh(
            originalWheel,
            rover,
            wheelCenter
        )
    );

    if (configuration) {
        const mount = model.getObjectByName(
            configuration.mount
        );

        if (mount?.isMesh) {
            steeringPivot.add(
                extractMesh(
                    mount,
                    rover,
                    wheelCenter
                )
            );
        }
    }

    if (CONFIG.SHOW_PIVOTS) {
        steeringPivot.add(
            new THREE.AxesHelper(0.25)
        );
    }

    const assembly = {
        name,
        side: side.name,
        wheelCenter,
        steeringPivot,
        wheelSpinner,
        previousWorldPosition: new THREE.Vector3(),

        steerable: configuration !== null,
        position: configuration ? (wheelCenter.z < 0 ? 'front' : 'rear') : 'middle',

        radius: CONFIG.WHEEL_RADIUS_FBX * scale,
        halfWidth: CONFIG.WHEEL_HALF_WIDTH_FBX * scale,

        physicsBody: null
    };

    createWheelCollider(assembly);
    wheelAssemblies.push(assembly);
}

// -----------------------------------------------------------------------------
// ROCKER-BOGIE SUSPENSION
// -----------------------------------------------------------------------------

function updateSuspension(delta) {
    if (!rover || !suspensionSolver || hopAirborne) return;
    applyRoverOrientation();
    const target = suspensionSolver.solve(rover.position, roverYaw, currentPitch, currentRoll, {
        rocker: suspensionSides[0].rockerAngle,
        bogies: suspensionSides.map(side => side.bogieAngle)
    }, currentSpeed);
    // Hysteresis keeps small changes in tire contact from switching the linkage
    // on and off. The arms may seek nearby ground, never a distant valley.
    const captureDistance = suspensionTracking
        ? CONFIG.SUSPENSION_RELEASE_DISTANCE : CONFIG.SUSPENSION_ATTACH_DISTANCE;
    suspensionTracking = !!target && target.nearestGap <= captureDistance &&
        (suspensionTracking || groundContact > 0 || verticalVelocity <= 0);
    const load = suspensionTracking
        ? THREE.MathUtils.clamp((target.largestGap - 0.025) / 0.15, 0, 1) : 0;
    suspensionLoad += (load - suspensionLoad) * (1 - Math.exp(-8 * delta));
    if (!suspensionTracking) return;

    // All six freedoms advance by the SAME fraction: independently damping the
    // body and arms breaks the fitted contacts and makes the rover bob upward.
    let fraction = 1 - Math.exp(-CONFIG.SUSPENSION_RESPONSE * delta);
    const limit = (error, speed) => {
        if (Math.abs(error) > 1e-6) fraction = Math.min(fraction, speed * delta / Math.abs(error));
    };
    limit(target.height - rover.position.y, CONFIG.SUSPENSION_HEIGHT_SPEED);
    limit(target.pitch - currentPitch, CONFIG.SUSPENSION_CHASSIS_SPEED);
    limit(target.roll - currentRoll, CONFIG.SUSPENSION_CHASSIS_SPEED);
    limit(target.rocker - suspensionSides[0].rockerAngle, CONFIG.SUSPENSION_JOINT_SPEED);
    suspensionSides.forEach((side, index) => {
        limit(target.bogies[index] - side.bogieAngle, CONFIG.SUSPENSION_JOINT_SPEED);
    });
    currentPitch += (target.pitch - currentPitch) * fraction;
    currentRoll += (target.roll - currentRoll) * fraction;
    rover.position.y += (target.height - rover.position.y) * fraction;
    const rocker = suspensionSides[0].rockerAngle +
        (target.rocker - suspensionSides[0].rockerAngle) * fraction;
    suspensionSides.forEach((side, index) => {
        side.rockerAngle = index === 0 ? rocker : -rocker;
        side.bogieAngle += (target.bogies[index] - side.bogieAngle) * fraction;
        side.rocker.rotation.x = side.rockerAngle;
        side.bogie.rotation.x = side.bogieAngle;
    });
    applyRoverOrientation();
    rover.updateMatrixWorld(true);
}

// -----------------------------------------------------------------------------
// LOAD FBX
// -----------------------------------------------------------------------------

new FBXLoader().load(
    CONFIG.MODEL_PATH,

    model => {
        const materials = createRoverMaterials();
        model.traverse(child => {
            if (!child.isMesh) return;

            child.material = /^wheel/.test(child.name) ? materials.tire
                : child.name === 'body' ? materials.body
                : /motor_mount/.test(child.name) ? materials.mount
                : materials.suspension;

            child.castShadow = true;
            child.receiveShadow = true;
        });

        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);

        if (box.isEmpty()) {
            console.error('FBX has no geometry');
            return;
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scale = CONFIG.MODEL_SIZE / Math.max(
            size.x,
            size.y,
            size.z
        );

        rover = new THREE.Group();
        scene.add(rover);

        const orientation = new THREE.Group();
        // Convert FBX up-axis, then face the model along the driving axis (-Z).
        orientation.quaternion.setFromEuler(
            new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ')
        );
        rover.add(orientation);

        const visual = new THREE.Group();

        visual.scale.setScalar(scale);

        visual.position.copy(center)
            .multiplyScalar(-scale);

        visual.add(model);
        orientation.add(visual);

        rover.updateMatrixWorld(true);

        const steeringMap = new Map();

        for (const configuration of STEERING_CONFIGURATION) {
            steeringMap.set(
                configuration.wheel,
                configuration
            );
        }

        const leftSide = createSuspensionSide(
            model,
            'left',
            {
                arm: 'arm_left',
                pivot: 'pivot_left',
                hinge: 'differential_link_left',
                bogie: 'pivot_left',

                wheels: {
                    rear: 'wheel',
                    middle: 'wheel1',
                    front: 'wheel2'
                }
            }
        );

        const rightSide = createSuspensionSide(
            model,
            'right',
            {
                arm: 'arm_right',
                pivot: 'pivot_right',
                hinge: 'differential_link_right',
                bogie: 'pivot_right',

                wheels: {
                    rear: 'wheel3',
                    middle: 'wheel4',
                    front: 'wheel5'
                }
            }
        );

        for (const name of WHEEL_NAMES) {
            const side = [
                'wheel',
                'wheel1',
                'wheel2'
            ].includes(name)
                ? leftSide
                : rightSide;

            createWheelAssembly(
                model,
                name,
                steeringMap.get(name) ?? null,
                scale,
                side
            );
        }

        suspensionSolver = createRockerBogieSolver(
            wheelAssemblies, suspensionSides, CONFIG, wheelSupport
        );

        // Pivot only the body mesh; suspension and physical contacts stay unchanged.
        const bodyMesh = model.getObjectByName('body');
        if (bodyMesh) {
            model.updateWorldMatrix(true, true);
            const bounds = new THREE.Box3().setFromObject(bodyMesh)
                .applyMatrix4(rover.matrixWorld.clone().invert());
            const halfSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.47);
            chassisCollision = {
                center: bounds.getCenter(new THREE.Vector3()),
                shape: new RAPIER.Cuboid(halfSize.x, halfSize.y, halfSize.z)
            };
            const bodyCenter = new THREE.Box3().setFromObject(bodyMesh).getCenter(new THREE.Vector3());
            const parent = bodyMesh.parent;
            chassisVisual = new THREE.Group();
            chassisVisual.position.copy(parent.worldToLocal(bodyCenter));
            parent.add(chassisVisual);
            chassisVisual.updateWorldMatrix(true, false);
            chassisVisual.attach(bodyMesh);
        }

        // Measure in rover space, after the FBX scale and orientation have been applied.
        rover.updateMatrixWorld(true);
        const centers = wheelAssemblies.map(wheel =>
            rover.worldToLocal(wheel.steeringPivot.getWorldPosition(new THREE.Vector3()))
        );
        wheelbase = Math.max(0.5, Math.max(...centers.map(p => p.z)) - Math.min(...centers.map(p => p.z)));

        rover.position.set(0, 0, 0);
        rover.updateMatrixWorld(true);

        let correction = -Infinity;

        for (const wheel of wheelAssemblies) {
            wheel.steeringPivot.getWorldPosition(
                wheelWorldPosition
            );

            const height = getPhysicalGroundHeight(
                wheelWorldPosition.x,
                wheelWorldPosition.z
            );

            if (height === null) continue;

            correction = Math.max(
                correction,
                height +
                wheel.radius +
                CONFIG.GROUND_CLEARANCE -
                wheelWorldPosition.y
            );
        }

        if (Number.isFinite(correction)) {
            rover.position.y += correction;
        }

        rover.updateMatrixWorld(true);
        synchronizeWheelColliders(true);

        autonomousRover = createAutonomousRover({
            template: rover, wheels: wheelAssemblies, sides: suspensionSides,
            config: CONFIG, scene: homeland, world, physics: RAPIER, groundBody,
            getHeight: planet.heightAtHome, chassisCollision,
            effects: createWheelEffects(scene, camera, renderer, getPhysicalGroundHeight)
        });

        // Initialize the chase camera.
        cameraForward.copy(FORWARD)
            .applyAxisAngle(UP, roverYaw);

        camera.position.copy(rover.position)
            .addScaledVector(
                cameraForward,
                -CONFIG.CAMERA_DISTANCE
            );

        camera.position.y += CONFIG.CAMERA_HEIGHT;
        cameraOrbit.position.copy(camera.position);
        cameraGroundEnvelope = -Infinity;

        controls.target.copy(rover.position)
            .addScaledVector(
                cameraForward,
                CONFIG.CAMERA_LOOK_AHEAD
            );

        controls.target.y += CONFIG.CAMERA_TARGET_HEIGHT;

        lastRoverPosition.copy(rover.position);
        controls.update();

        console.log(
            'Papaya Pathfinder loaded:',
            wheelAssemblies.length,
            'wheels'
        );
    },

    undefined,

    error => {
        console.error('FBX loading error:', error);
    }
);

// Race staging resets the existing rover, so all six real wheel contacts and
// the camera start at the grid rather than dragging old suspension velocities.
function placePlayerOnGrid(position, yaw) {
    if (!rover) return;
    currentSpeed = 0; currentSteering = 0; verticalVelocity = 0;
    hopHeld = false; hopRequested = false; hopAirborne = false;
    flightHoldAltitude = null; poweredFlight = false; flightRadialSpeed = 0; flightVerticalThrust = 0;
    currentPitch = 0; currentRoll = 0; roverYaw = yaw;
    wheelSurfaceSpeed = 0; wheelSlip = 0; suspensionTracking = false; suspensionLoad = 0;
    Object.assign(driveState, { speed: 0, lateralSpeed: 0, yawRate: 0, throttle: 0,
        brake: 0, coastBrake: 0, hillHold: 0, crawl: 0, driveAssist: 0, acceleration: 0, slip: 0, airAcceleration: 0, airStrafe: 0, thruster: 0 });
    suspensionSides.forEach(side => {
        side.rockerAngle = 0; side.bogieAngle = 0;
        side.rocker.rotation.x = 0; side.bogie.rotation.x = 0;
    });
    wheelAssemblies.forEach(wheel => { wheel.steeringPivot.rotation.y = 0; });
    rover.position.set(position.x, 0, position.z);
    applyRoverOrientation(); rover.updateMatrixWorld(true); wheelSupport.beginStep();
    let correction = -Infinity;
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(wheelWorldPosition);
        const height = wheelSupport(wheelWorldPosition.x, wheelWorldPosition.z, wheel.radius, yaw, wheel.halfWidth);
        if (height !== null) correction = Math.max(correction, height - wheelWorldPosition.y);
    }
    if (Number.isFinite(correction)) rover.position.y += correction;
    for (let i = 0; i < 12; i++) {
        wheelSupport.beginStep(); updateSuspension(CONFIG.PHYSICS_STEP); updateGroundContact(CONFIG.PHYSICS_STEP);
    }
    synchronizeWheelColliders(true);
    previousVisualSpeed = 0; visualPitch = 0; visualRoll = 0;
    if (chassisVisual) chassisVisual.rotation.set(0, 0, 0);
    physicsAccumulator = 0;
    cameraForward.copy(FORWARD).applyAxisAngle(UP, yaw);
    cameraOrbit.position.copy(rover.position).addScaledVector(cameraForward, -CONFIG.CAMERA_DISTANCE);
    cameraOrbit.position.y += CONFIG.CAMERA_HEIGHT;
    camera.position.copy(cameraOrbit.position);
    controls.target.copy(rover.position).addScaledVector(cameraForward, CONFIG.CAMERA_LOOK_AHEAD);
    controls.target.y += CONFIG.CAMERA_TARGET_HEIGHT;
    lastRoverPosition.copy(rover.position);
    cameraGroundEnvelope = -Infinity; cameraManualDelay = 0;
    updateCameraControls(CONFIG.PHYSICS_STEP);
}

// -----------------------------------------------------------------------------
// KEYBOARD
// -----------------------------------------------------------------------------

window.addEventListener('keydown', event => {
    if (event.code === 'KeyM' || (event.code === 'Escape' && planetView?.active)) {
        event.preventDefault();
        if (!event.repeat) planetView?.toggle();
        return;
    }
    if (planetView?.active) return;
    if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'Space', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
            .includes(event.code)
    ) {
        event.preventDefault();
    }

    keys.add(event.code);

    if (event.code === 'KeyR' && !event.repeat) {
        window.location.reload();
    }
});

window.addEventListener('keyup', event => {
    keys.delete(event.code);
});

window.addEventListener('blur', () => {
    keys.clear();
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) keys.clear();
});

// -----------------------------------------------------------------------------
// ROVER ORIENTATION
// -----------------------------------------------------------------------------

function applyRoverOrientation() {
    yawQuaternion.setFromAxisAngle(
        UP,
        roverYaw
    );

    tiltEuler.set(
        currentPitch,
        0,
        currentRoll
    );

    tiltQuaternion.setFromEuler(tiltEuler);

    rover.quaternion.copy(yawQuaternion)
        .multiply(tiltQuaternion);
}

// -----------------------------------------------------------------------------
// ROVER DRIVING
// -----------------------------------------------------------------------------

function updateRover(delta) {
    if (!rover) return;
    const hopPressed = input.has('KeyF');
    const launch = hopRequested || (hopPressed && !hopHeld);
    hopHeld = hopPressed;
    hopRequested = false;
    const flightKey = input.has('KeyG');
    const descendKey = input.has('KeyX');
    const continuousLift = input.has('KeyZ');
    if (((continuousLift && !descendKey) || ((flightKey || descendKey) &&
        (hopAirborne || groundContact <= 0))) && !beaconRace?.movementLocked) {
        if (!poweredFlight) { flightRadialSpeed = 0; flightPitch = 0; }
        poweredFlight = true; hopAirborne = true; suspensionTracking = false; groundContact = 0;
    }
    if (launch && !beaconRace?.movementLocked) {
        applyRoverOrientation();
        hopDirection.copy(UP).applyQuaternion(tiltQuaternion);
        driveState.speed -= hopDirection.z * CONFIG.HOP_SPEED;
        driveState.lateralSpeed += hopDirection.x * CONFIG.HOP_SPEED;
        if (poweredFlight) flightRadialSpeed += hopDirection.y * CONFIG.HOP_SPEED;
        else verticalVelocity += hopDirection.y * CONFIG.HOP_SPEED;
        wheelThrusterEffects.burst(); hopAirborne = true; suspensionTracking = false; groundContact = 0;
    }
    if (poweredFlight) {
        const previousRadialSpeed = flightRadialSpeed;
        // Flight attitude is persistent; neutral input holds the selected heading.
        // Positive local X pitch raises the nose (the rover faces local -Z).
        const pitchInput = controlAxis('pitch', 'ArrowDown', 'ArrowUp');
        const stabilizing = input.has('Space') || descendKey;
        if (stabilizing) flightPitch *= Math.exp(-3 * delta);
        else flightPitch = THREE.MathUtils.clamp(flightPitch + pitchInput * 0.85 * delta,
            -THREE.MathUtils.degToRad(85), THREE.MathUtils.degToRad(85));
        // Reframing transports the rendered attitude; retain the pilot's pitch
        // relative to the new local horizon instead of accumulating curvature.
        currentPitch = flightPitch;
        const bank = stabilizing ? 0 : THREE.MathUtils.clamp(-driveState.yawRate * 0.22, -0.3, 0.3);
        currentRoll += (bank - currentRoll) * (1 - Math.exp(-3 * delta));
        const altitude = planet.coordinates(rover.position).altitude;
        const clearance = Math.max(0, rover.position.y - getTerrainHeight(rover.position.x, rover.position.z));
        const forwardInput = controlAxis('throttle', 'KeyW', 'KeyS');
        const diving = !stabilizing && forwardInput !== 0 && Math.abs(currentPitch) > 0.005;
        if (!input.has('Space') && (continuousLift || descendKey || diving)) {
            const ascent = THREE.MathUtils.lerp(60, CONFIG.FLIGHT_ASCENT_SPEED,
                THREE.MathUtils.smoothstep(clearance, 100, 5000));
            const descent = Math.min(CONFIG.FLIGHT_DESCENT_SPEED,
                Math.max(1, Math.sqrt(2 * CONFIG.CONTINUOUS_LIFT_ACCELERATION * Math.max(0, clearance - 1))));
            // Match the vertical component to the inclined flight path. The
            // horizontal motor uses cos(pitch), so near-vertical flight remains bounded.
            const pathSpeed = Math.max(Math.abs(driveState.speed), Math.abs(forwardInput) * 3);
            const pathVertical = Math.sign(forwardInput) * pathSpeed * Math.tan(currentPitch);
            const desired = descendKey ? -descent : diving
                ? THREE.MathUtils.clamp(pathVertical, -Math.min(6000, descent), 6000) : ascent;
            const slowing = flightRadialSpeed * desired < 0 || Math.abs(flightRadialSpeed) > Math.abs(desired);
            const flightAcceleration = diving ? (flightKey ? CONFIG.AIR_FORWARD_BOOST_ACCELERATION :
                CONFIG.AIR_THRUST_ACCELERATION) : CONFIG.CONTINUOUS_LIFT_ACCELERATION;
            const acceleration = slowing ? Math.max(flightAcceleration,
                Math.abs(flightRadialSpeed) * CONFIG.AIR_BRAKING_RESPONSE) : flightAcceleration;
            flightRadialSpeed += THREE.MathUtils.clamp(desired - flightRadialSpeed, -acceleration * delta, acceleration * delta);
        } else if (!launch) {
            // Brake into a hover rather than snapping vertical speed to zero.
            flightRadialSpeed *= Math.exp(-CONFIG.AIR_BRAKING_RESPONSE * delta);
            if (Math.abs(flightRadialSpeed) < 0.01) flightRadialSpeed = 0;
        }
        flightVerticalThrust = THREE.MathUtils.clamp((flightRadialSpeed - previousRadialSpeed) / delta +
            CONFIG.FALL_GRAVITY, -CONFIG.CONTINUOUS_LIFT_ACCELERATION, CONFIG.CONTINUOUS_LIFT_ACCELERATION) /
            CONFIG.CONTINUOUS_LIFT_ACCELERATION;
        flightHoldAltitude = altitude + flightRadialSpeed * delta;
        hopAirborne = true; suspensionTracking = false; groundContact = 0;

    } else { flightHoldAltitude = null; flightVerticalThrust = 0; }
    wheelSupport.beginStep();
    rover.updateMatrixWorld(true);
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(wheel.previousWorldPosition);
    }

    const throttle = controlAxis('throttle', 'KeyW', 'KeyS');
    const steering = controlAxis('steering', 'KeyA', 'KeyD');
    const pivotTurn = throttle === 0 && !input.has('Space') ? steering : 0;
    let pivotError = 0;

    const steeringFactor = 1 - Math.exp(
        -CONFIG.STEERING_SPEED * delta
    );

    const steeringLimit = THREE.MathUtils.lerp(
        CONFIG.MAX_STEERING_ANGLE,
        CONFIG.MAX_STEERING_ANGLE * CONFIG.STEERING_HIGH_SPEED_FACTOR,
        Math.min(1, Math.abs(currentSpeed) / CONFIG.MAX_SPEED)
    );
    currentSteering = THREE.MathUtils.lerp(
        currentSteering,
        pivotTurn ? 0 : steering * steeringLimit,
        steeringFactor
    );

    for (const wheel of wheelAssemblies) {
        if (!wheel.steerable) continue;

        const direction =
            wheel.position === 'front' ? 1 : -1;

        // Inner wheels follow a tighter radius (front and rear counter-steer).
        const center = rover.worldToLocal(
            wheel.steeringPivot.getWorldPosition(new THREE.Vector3())
        );
        const curvature = 2 * Math.tan(currentSteering) / wheelbase;
        const drivingAngle = Math.atan2(
            Math.tan(currentSteering) * direction,
            Math.max(0.25, 1 + center.x * curvature)
        );
        // The four corner wheels form an X; middle wheels remain straight.
        // The same orientation serves both turn directions by reversing spin.
        const pivotAngle = -Math.sign(wheel.wheelCenter.x * wheel.wheelCenter.z) *
            CONFIG.MAX_STEERING_ANGLE;
        wheel.steeringPivot.rotation.y = THREE.MathUtils.lerp(
            wheel.steeringPivot.rotation.y, pivotTurn ? pivotAngle : drivingAngle,
            steeringFactor);
        pivotError = Math.max(pivotError, Math.abs(pivotAngle - wheel.steeringPivot.rotation.y));
    }

    yawQuaternion.setFromAxisAngle(
        UP,
        roverYaw
    );

    const pivotAlignment = 1 - THREE.MathUtils.smoothstep(pivotError,
        THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(25));
    updateDrivePhysics(throttle, delta, pivotTurn, pivotAlignment);

    if (hopAirborne || groundContact <= 0) {
        const clearance = rover.position.y - getTerrainHeight(rover.position.x, rover.position.z);
        if (clearance < 80) {
            // Orbital-speed tangential motion can leave a tiny planet even
            // after grazing it. Dissipate that energy before a low pass/landing.
            const landingSpeed = Math.max(CONFIG.AIR_BOOST_LOW_ALTITUDE_SPEED,
                Math.sqrt(160 * Math.max(0, clearance - 0.5)));
            const blend = THREE.MathUtils.smoothstep(clearance, 35, 80);
            const safeSpeed = THREE.MathUtils.lerp(landingSpeed, CONFIG.AIR_BOOST_CRUISE_SPEED, blend);
            const speed = Math.hypot(driveState.speed, driveState.lateralSpeed);
            if (speed > safeSpeed) {
                driveState.speed *= safeSpeed / speed;
                driveState.lateralSpeed *= safeSpeed / speed;
                driveState.airAcceleration = Math.min(0, driveState.airAcceleration ?? 0);
            }
        }
    }

    // Rotate the velocity into the new body frame without adding kinetic energy.
    const yawStep = driveState.yawRate * delta;
    const oldSpeed = driveState.speed;
    const oldLateral = driveState.lateralSpeed;
    driveState.speed = oldSpeed * Math.cos(yawStep) - oldLateral * Math.sin(yawStep);
    driveState.lateralSpeed = oldLateral * Math.cos(yawStep) + oldSpeed * Math.sin(yawStep);
    currentSpeed = driveState.speed;
    roverYaw += yawStep;
    applyRoverOrientation();

    // Speed is measured along the slope: climbing spends travel on gaining height.
    // Airborne motion retains its horizontal velocity instead of following unseen terrain.
    const forwardProjection = groundContact > 0 ? Math.max(0.15, Math.cos(currentSlope)) : 1;
    const lateralProjection = groundContact > 0 ? Math.max(0.15, Math.cos(currentRoll)) : 1;
    moveVector.copy(FORWARD).applyQuaternion(yawQuaternion)
        .multiplyScalar(currentSpeed * forwardProjection * delta);
    lateralVector.set(1, 0, 0).applyQuaternion(yawQuaternion);
    moveVector.addScaledVector(lateralVector, driveState.lateralSpeed * lateralProjection * delta);
    const airborneMotion = hopAirborne || groundContact <= 0;
    if (airborneMotion) moveAirborneWithCollisions(moveVector, delta);
    else {
        if (planet.homeFrame) autonomousRover?.constrainPlayerMotion(rover.position, moveVector, roverYaw);
        moveRoverWithCollisions(moveVector, delta);
    }
    updateSuspension(delta);
    if (!airborneMotion || !hopAirborne) updateGroundContact(delta);
    updateWheelRolling(delta);
}

const wheelRollingDirection = new THREE.Vector3();
const wheelRollingDisplacement = new THREE.Vector3();

function updateWheelRolling(delta) {
    rover.updateMatrixWorld(true);
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(wheelWorldPosition);
        wheel.steeringPivot.getWorldQuaternion(collisionRotation);
        wheelRollingDirection.copy(FORWARD).applyQuaternion(collisionRotation);
        wheelRollingDisplacement.subVectors(wheelWorldPosition, wheel.previousWorldPosition);
        const travel = wheelRollingDisplacement.dot(wheelRollingDirection);
        const support = wheelSupport(wheelWorldPosition.x, wheelWorldPosition.z,
            wheel.radius, roverYaw + wheel.steeringPivot.rotation.y, wheel.halfWidth);
        const touching = support !== null &&
            Math.abs(wheelWorldPosition.y - support) <= CONFIG.WHEEL_CONTACT_TOLERANCE;
        // A planted tire rolls with its actual travel, including steering and
        // articulation. Motor speed only supplies slip or airborne free spin.
        const rotationTravel = touching
            ? THREE.MathUtils.lerp(travel, wheelSurfaceSpeed * delta, wheelSlip)
            : wheelSurfaceSpeed * delta;
        wheel.wheelSpinner.rotation.x -= rotationTravel / wheel.radius;
    }
}

const flightSweep = new THREE.Vector3();
const flightDestination = new THREE.Vector3();
const flightSweepOrigin = new THREE.Vector3();

function moveAirborneWithCollisions(displacement, delta) {
    hopAirborne = true;
    suspensionTracking = false;
    groundContact = 0;
    flightDestination.copy(rover.position).add(displacement);
    if (flightHoldAltitude !== null) {
        planet.toGlobal(flightDestination, flightPosition).normalize()
            .multiplyScalar(planet.radius + flightHoldAltitude);
        planet.toLocal(flightPosition, flightDestination);
        verticalVelocity = (flightDestination.y - rover.position.y) / delta;
    } else {
        planet.upAt(rover.position, gravityDirection);
        verticalVelocity -= CONFIG.FALL_GRAVITY * gravityDirection.y * delta;
        flightDestination.y += verticalVelocity * delta;
    }
    flightSweep.subVectors(flightDestination, rover.position);
    if (flightDestination.y - getTerrainHeight(flightDestination.x, flightDestination.z) < 3 &&
        (verticalVelocity < -5 || Math.hypot(driveState.speed, driveState.lateralSpeed) > 20)) {
        // Fast cruise uses visual terrain only. Restore the landing area's
        // collision before sweeping into it, even during a steep descent.
        planetStreamer.update(flightDestination, true, false);
        world.step();
        wheelSupport.beginStep();
    }
    if (flightSweep.lengthSq() < 1e-12) return;
    let impact = null;
    const inspect = (position, orientation, shape) => {
        // Unlike crawling, flight must sweep against terrain as well as rocks,
        // along the full 3D path rather than checking only the destination.
        const hit = world.castShape(position, orientation, flightSweep, shape,
            0.002, 1, false, RAPIER.QueryFilterFlags.ONLY_FIXED);
        if (hit && (!impact || hit.time_of_impact < impact.time_of_impact)) impact = hit;
    };
    rover.updateMatrixWorld(true);
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(flightSweepOrigin);
        wheel.steeringPivot.getWorldQuaternion(collisionRotation);
        collisionRotation.multiply(CYLINDER_ROTATION);
        inspect(flightSweepOrigin, collisionRotation, wheel.contactShape);
    }
    if (chassisCollision) {
        flightSweepOrigin.copy(chassisCollision.center).applyQuaternion(rover.quaternion).add(rover.position);
        inspect(flightSweepOrigin, rover.quaternion, chassisCollision.shape);
    }
    if (!impact) { rover.position.copy(flightDestination); return; }
    const fraction = THREE.MathUtils.clamp(impact.time_of_impact - 0.002 / Math.max(0.001, flightSweep.length()), 0, 1);
    rover.position.addScaledVector(flightSweep, fraction);
    const landing = impact.normal1.y > 0.25;
    // Inelastic impact: flight energy is dissipated, never converted into a
    // suspension launch. The ground motor takes over at a driveable speed.
    const groundLimit = beaconRace?.racing ? CONFIG.RACE_MAX_SPEED : CONFIG.MAX_SPEED;
    driveState.speed = landing ? THREE.MathUtils.clamp(driveState.speed, -CONFIG.MAX_REVERSE_SPEED, groundLimit) : 0;
    driveState.lateralSpeed = landing ? THREE.MathUtils.clamp(driveState.lateralSpeed * 0.1,
        -groundLimit * 0.25, groundLimit * 0.25) : 0;
    driveState.yawRate *= 0.2;
    driveState.airAcceleration = 0;
    driveState.airStrafe = 0;
    currentSpeed = driveState.speed;
    verticalVelocity = 0;
    flightHoldAltitude = null;
    if (landing) { poweredFlight = false; flightRadialSpeed = 0; flightVerticalThrust = 0; }
    hopAirborne = !landing;
    groundContact = landing ? 1 : 0;
    wheelSupport.beginStep();
}

// Raise the tires into a clear pose before advancing across a crawlable edge.
function moveRoverWithCollisions(displacement, delta) {
    if (displacement.lengthSq() < 1e-12) return;
    rover.updateMatrixWorld(true);
    let earliestHit = null;
    let earliestClimbable = false;
    let onRock = false;
    const sweep = displacement.clone();
    const raisedPosition = new THREE.Vector3();
    const maxRise = (0.6 + Math.min(0.9, Math.abs(currentSpeed) * 0.5)) * delta;
    let travelFraction = 1;
    const contacts = wheelAssemblies.map(wheel => {
        const position = wheel.steeringPivot.getWorldPosition(new THREE.Vector3());
        const yaw = roverYaw + wheel.steeringPivot.rotation.y;
        const sampleAt = fraction => wheelSupport.sample(
            position.x + displacement.x * fraction,
            position.z + displacement.z * fraction, wheel.radius, yaw, wheel.halfWidth);
        const current = sampleAt(0);
        const next = sampleAt(1);
        const stepHeight = wheel.radius * CONFIG.WHEEL_STEP_RATIO;
        const supported = current && Math.abs(position.y - current.height) < 0.2;
        if (supported && next && next.collider.parent()?.handle !== groundBody.handle &&
            next.height - position.y > maxRise &&
            next.height - position.y <= stepHeight) {
            // Shorten travel at steep edges instead of penetrating them and
            // relying on the later ground correction to eject the rover.
            let low = 0;
            let high = 1;
            for (let i = 0; i < 8; i++) {
                const middle = (low + high) * 0.5;
                const contact = sampleAt(middle);
                if (contact && contact.height - position.y <= maxRise) low = middle;
                else high = middle;
            }
            travelFraction = Math.min(travelFraction, low);
        }
        return { wheel, position, sampleAt, supported, stepHeight };
    });
    displacement.multiplyScalar(travelFraction);
    const recordHit = (hit, climbable = false) => {
        if (hit && (!earliestHit || hit.time_of_impact < earliestHit.time_of_impact)) {
            earliestHit = hit;
            earliestClimbable = climbable;
        }
    };
    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(wheelWorldPosition);
        wheel.steeringPivot.getWorldQuaternion(collisionRotation);
        collisionRotation.multiply(CYLINDER_ROTATION);
        const yaw = roverYaw + wheel.steeringPivot.rotation.y;
        const currentSupport = wheelSupport(wheelWorldPosition.x, wheelWorldPosition.z,
            wheel.radius, yaw, wheel.halfWidth);
        const nextContact = wheelSupport.sample(wheelWorldPosition.x + displacement.x,
            wheelWorldPosition.z + displacement.z, wheel.radius, yaw, wheel.halfWidth);
        const nextSupport = nextContact?.height ?? null;
        const stepHeight = wheel.radius * CONFIG.WHEEL_STEP_RATIO;
        const supported = currentSupport !== null &&
            wheelWorldPosition.y - currentSupport < 0.2 &&
            currentSupport - wheelWorldPosition.y <= stepHeight;
        const rise = nextSupport === null ? 0 : nextSupport - wheelWorldPosition.y;
        const canStep = supported && nextSupport !== null && rise <= stepHeight && rise >= -0.2;
        // Only this tire may climb this contact. Raising all sweep origins
        // together allowed unrelated tires and even the body to bypass rocks.
        let tireLift = canStep ? Math.min(maxRise, Math.max(0, rise)) : 0;
        if (tireLift > 0 && world.castShape(wheelWorldPosition, collisionRotation,
            { x: 0, y: tireLift, z: 0 }, wheel.contactShape, 0.001, 1, false,
            RAPIER.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody)) tireLift = 0;
        sweep.copy(displacement);
        sweep.y = 0;
        raisedPosition.copy(wheelWorldPosition);
        raisedPosition.y += tireLift;
        const hit = world.castShape(raisedPosition, collisionRotation, sweep,
            wheel.contactShape, 0.001, 1, false,
            RAPIER.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody);
        const rock = nextContact && nextContact.collider.parent()?.handle !== groundBody.handle;
        const climbable = canStep && !!rock && (rise <= 0 || tireLift > 0);
        recordHit(hit, climbable);
        if (canStep && rock) onRock = true;
    }
    // Stop boulders between the wheels at the body instead of letting them pass through it.
    if (chassisCollision) {
        const center = rover.localToWorld(chassisCollision.center.clone());
        sweep.copy(displacement);
        // The body must clear the rock in its actual pose. If the arms are still
        // articulating, pause forward travel until they have really raised it.
        sweep.y = 0;
        recordHit(world.castShape(center, rover.quaternion, sweep,
            chassisCollision.shape, 0.002, 1, false,
            RAPIER.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody));
    }
    const fraction = earliestHit ? THREE.MathUtils.clamp(earliestHit.time_of_impact - 0.001, 0, 1) : 1;
    rover.position.addScaledVector(displacement, fraction);
    // The clearance pose is provisional. The coupled suspension below moves
    // the actual arms and chassis; a step never lifts the whole body by fiat.
    // The motor blends crawl speed over time; it must not remove speed in
    // discrete chunks every time another tire meets a ledge.
    rockContact = onRock;
    if (earliestHit && !earliestClimbable) {
        const normal = new THREE.Vector3(earliestHit.normal1.x, 0, earliestHit.normal1.z);
        if (normal.lengthSq() > 0.001) {
            normal.normalize();
            const direction = FORWARD.clone().applyQuaternion(yawQuaternion);
            const velocity = direction.clone().multiplyScalar(driveState.speed)
                .addScaledVector(lateralVector, driveState.lateralSpeed);
            const intoObstacle = velocity.dot(normal);
            if (intoObstacle < 0) velocity.addScaledVector(normal, -intoObstacle);
            driveState.speed = velocity.dot(direction);
            driveState.lateralSpeed = velocity.dot(lateralVector);
        }
    }
    currentSpeed = driveState.speed;
}

// -----------------------------------------------------------------------------
// VERTICAL GROUND CONTACT
// -----------------------------------------------------------------------------

function updateGroundContact(delta) {
    rover.updateMatrixWorld(true);

    let maxCorrection = -Infinity;
    let detectedGround = false;

    for (const wheel of wheelAssemblies) {
        wheel.steeringPivot.getWorldPosition(
            wheelWorldPosition
        );

        const support = wheelSupport(wheelWorldPosition.x, wheelWorldPosition.z,
            wheel.radius, roverYaw + wheel.steeringPivot.rotation.y, wheel.halfWidth);
        if (support === null || support - wheelWorldPosition.y >
            wheel.radius * CONFIG.WHEEL_STEP_RATIO + CONFIG.GROUND_CLEARANCE) continue;
        detectedGround = true;
        maxCorrection = Math.max(maxCorrection, support - wheelWorldPosition.y);
    }

    if (suspensionTracking && detectedGround) {
        // Height is already part of the coordinated six-wheel fit. Only prevent
        // penetration here; do not introduce a second height controller.
        if (maxCorrection > 0) rover.position.y += maxCorrection;
        verticalVelocity = 0;
    } else {
        planet.upAt(rover.position, gravityDirection);
        verticalVelocity -= CONFIG.FALL_GRAVITY * gravityDirection.y * delta;
        const fall = verticalVelocity * delta;
        if (detectedGround && maxCorrection >= fall) {
            rover.position.y += maxCorrection;
            verticalVelocity = 0;
            hopAirborne = false;
            flightHoldAltitude = null;
            poweredFlight = false; flightRadialSpeed = 0; flightVerticalThrust = 0;
        } else {
            groundContact = 0;
            rover.position.y += fall;
        }
    }

    rover.updateMatrixWorld(true);
}

// -----------------------------------------------------------------------------
// SYNCHRONIZE WHEEL COLLIDERS
// -----------------------------------------------------------------------------

function synchronizeWheelColliders(immediate = false) {
    if (!rover) return;

    rover.updateMatrixWorld(true);

    for (const wheel of wheelAssemblies) {
        wheel.wheelSpinner.getWorldPosition(
            wheelWorldPosition
        );

        wheel.wheelSpinner.getWorldQuaternion(
            wheelWorldQuaternion
        );

        if (immediate) {
            wheel.physicsBody.setTranslation(
                wheelWorldPosition,
                true
            );

            wheel.physicsBody.setRotation(
                wheelWorldQuaternion,
                true
            );
        } else {
            wheel.physicsBody.setNextKinematicTranslation(
                wheelWorldPosition
            );

            wheel.physicsBody.setNextKinematicRotation(
                wheelWorldQuaternion
            );
        }
    }
}

// -----------------------------------------------------------------------------
// COLLIDER DEBUG
// -----------------------------------------------------------------------------

let colliderDebugLines = null;

function updateColliderDebug() {
    if (!CONFIG.SHOW_COLLIDERS) return;

    const { vertices, colors } = world.debugRender();

    if (!colliderDebugLines) {
        colliderDebugLines = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                vertexColors: true,
                depthTest: false
            })
        );

        colliderDebugLines.frustumCulled = false;
        scene.add(colliderDebugLines);
    }

    colliderDebugLines.geometry.dispose();

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(vertices, 3)
    );

    const rgb = new Float32Array(
        (colors.length / 4) * 3
    );

    for (let i = 0, j = 0; i < colors.length; i += 4) {
        rgb[j++] = colors[i];
        rgb[j++] = colors[i + 1];
        rgb[j++] = colors[i + 2];
    }

    geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(rgb, 3)
    );

    colliderDebugLines.geometry = geometry;
}

// -----------------------------------------------------------------------------
// MINIMAL DRIVING HUD
// -----------------------------------------------------------------------------

let hudElements = null;
let hudElapsed = 0;

function createDrivingHUD() {
    if (!CONFIG.HUD_ENABLED) return;

    const hud = document.createElement('div');
    hud.id = 'papaya-hud';

    hud.innerHTML = `
        <div>
            <span class="telemetry-label">VEL</span>
            <div class="telemetry-speed"><span id="papaya-speed">0.0</span><span class="telemetry-unit">km/h</span></div>
            <div class="telemetry-meter" aria-hidden="true"><span></span></div>
        </div>
        <div class="telemetry-stat"><span class="telemetry-label">INC</span><span class="telemetry-reading" id="papaya-slope">0.0°</span></div>
        <div class="telemetry-stat"><span class="telemetry-label">ALT</span><span class="telemetry-reading" id="papaya-altitude">0.0 m</span></div>
    `;

    const hopButton = document.createElement('button');
    hopButton.type = 'button';
    hopButton.id = 'papaya-hop';
    hopButton.title = 'Propulsores de las ruedas · F · según la inclinación';
    hopButton.setAttribute('aria-label', 'Activar propulsores de las ruedas');
    hopButton.innerHTML = '<span data-hop-label>IMPULSO</span><span class="telemetry-key">F</span>';
    hopButton.addEventListener('click', () => { hopRequested = true; });
    hud.appendChild(hopButton);
    getDrivingPanel().appendChild(hud);

    hudElements = {
        speed: document.getElementById('papaya-speed'),
        slope: document.getElementById('papaya-slope'),
        altitude: document.getElementById('papaya-altitude'),
        hop: hopButton,
        hopLabel: hopButton.querySelector('[data-hop-label]'),
        mode: document.getElementById('papaya-drive-mode'),
        panel: getDrivingPanel(),
    };
}

function updateDrivingHUD(delta) {
    if (!rover || !hudElements) return;

    hudElapsed += delta;

    if (hudElapsed < CONFIG.HUD_UPDATE_INTERVAL) {
        return;
    }

    hudElapsed = 0;
    hudElements.hop.disabled = !!beaconRace?.movementLocked;
    hudElements.hopLabel.textContent = 'IMPULSO';

    const speedKmh = Math.abs(currentSpeed) * 3.6;
    const mode = groundContact <= 0 ? 'airborne' : input.has('Space') ? 'braking' : speedKmh > 0.5 ? 'moving' : 'idle';
    hudElements.panel.dataset.mode = mode;
    hudElements.mode.textContent = poweredFlight ? (flightRadialSpeed > 0.5 ? 'ASCENDIENDO' : flightRadialSpeed < -0.5 ? 'DESCENDIENDO' : 'VUELO ESTABLE') : { airborne: 'SIN APOYO', braking: 'FRENANDO', moving: 'EN RUTA', idle: 'EN ESPERA' }[mode];
    hudElements.panel.style.setProperty('--speed-level', String(Math.min(1,
        Math.abs(currentSpeed) / CONFIG.MAX_SPEED)));
    hudElements.panel.dataset.steep = String(Math.abs(currentSlope) > THREE.MathUtils.degToRad(25));

    const slopeDegrees =
        THREE.MathUtils.radToDeg(currentSlope);

    const altitude = planet.coordinates(rover.position).altitude;

    hudElements.speed.textContent =
        speedKmh.toFixed(1);

    const slopeSign =
        slopeDegrees > 0.5 ? '+' :
            slopeDegrees < -0.5 ? '−' : '';

    hudElements.slope.textContent =
        `${slopeSign}${Math.abs(slopeDegrees).toFixed(1)}°`;

    hudElements.altitude.textContent =
        `${altitude.toFixed(1)} m`;
}

createDrivingHUD();

// Cosmetic feedback runs once per rendered frame, independently of the fixed physics.
const exploration = createMarsExploration({
    scene: homeland, world, physics: RAPIER, getHeight: planet.heightAtHome, size: CONFIG.TERRAIN_SIZE
});
const wheelEffects = createWheelEffects(scene, camera, renderer, getPhysicalGroundHeight);
const wheelThrusterEffects = createWheelThrusterEffects(scene);
beaconRace = createBeaconRace({
    scene: homeland, world, physics: RAPIER, getHeight: planet.heightAtHome,
    beforeStart: returnToLandingFrame,
    getPlayer: () => rover, getOpponent: () => autonomousRover,
    placePlayer: placePlayerOnGrid, onStart: () => exploration.minimize()
});

if (touchControls.enabled) { exploration.minimize(); beaconRace.minimize?.(); }

// The original area stays resident as a small authored region, but its meshes
// and colliders sleep when travelling elsewhere. Only streamed tiles surround
// the remote tangent frame. Race staging always returns to the original region.
const planetStreamer = createPlanetStreamer({ planet, scene, world, physics: RAPIER,
    groundBody, material: ground.material, mobile: mobileGraphics });
const homeColliders = new Map();
let planetFrameVersion = 0;
const planetVelocity = new THREE.Vector3();
const planetRotation = new THREE.Quaternion();
const planetEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function captureHomeColliders() {
    homeColliders.clear();
    world.forEachCollider(collider => {
        const parent = collider.parent();
        if ((!parent || parent.isFixed()) && !planetStreamer.ownsCollider(collider.handle) && !planetLife.ownsCollider(collider.handle)) {
            homeColliders.set(collider.handle, { collider, enabled: collider.isEnabled() });
        }
    });
}
function setHomeActive(active) {
    homeland.visible = active;
    for (const { collider, enabled } of homeColliders.values()) {
        if (world.getCollider(collider.handle)) collider.setEnabled(active && enabled);
    }
    autonomousRover?.setActive(active);
    if (active) beaconRace?.syncWorldState();
}
function changePlanetFrame(forceHome = false, anchor = rover?.position) {
    if (!rover) return;
    if (planet.homeFrame) captureHomeColliders();
    planetVelocity.set(-Math.sin(roverYaw) * driveState.speed + Math.cos(roverYaw) * driveState.lateralSpeed,
        verticalVelocity, -Math.cos(roverYaw) * driveState.speed - Math.sin(roverYaw) * driveState.lateralSpeed);
    const wasGrounded = groundContact > 0 && !hopAirborne;
    const matrix = planet.reframe(anchor, forceHome);
    planetRotation.setFromRotationMatrix(matrix);
    rover.position.applyMatrix4(matrix);
    rover.quaternion.premultiply(planetRotation);
    planetEuler.setFromQuaternion(rover.quaternion, 'YXZ');
    roverYaw = planetEuler.y; currentPitch = planetEuler.x; currentRoll = planetEuler.z;
    planetVelocity.applyQuaternion(planetRotation);
    if (flightHoldAltitude !== null) {
        planet.upAt(rover.position, gravityDirection);
        planetVelocity.addScaledVector(gravityDirection,
            (poweredFlight ? flightRadialSpeed : 0) - planetVelocity.dot(gravityDirection));
    }
    driveState.speed = -Math.sin(roverYaw) * planetVelocity.x - Math.cos(roverYaw) * planetVelocity.z;
    driveState.lateralSpeed = Math.cos(roverYaw) * planetVelocity.x - Math.sin(roverYaw) * planetVelocity.z;
    verticalVelocity = wasGrounded ? 0 : planetVelocity.y;
    currentSpeed = driveState.speed;
    for (const vector of [camera.position, cameraOrbit.position, controls.target,
        lastRoverPosition, cameraFollowPosition, cameraFollowTarget]) vector.applyMatrix4(matrix);
    camera.quaternion.premultiply(planetRotation);
    cameraOrbit.quaternion.premultiply(planetRotation);
    cameraGroundEnvelope = -Infinity;
    suspensionTracking = false;
    wheelSupport.beginStep();
    wheelEffects.reset();
    setHomeActive(planet.homeFrame);
    planetStreamer.reframe(matrix);
    planet.surfaceMatrix(ground.material.userData.marsFrame);
    planetFrameVersion++;
    applyRoverOrientation();
    rover.updateMatrixWorld(true);
    for (const wheel of wheelAssemblies) wheel.steeringPivot.getWorldPosition(wheel.previousWorldPosition);
    synchronizeWheelColliders(true);
}
function returnToLandingFrame() {
    if (!planet.homeFrame) changePlanetFrame(true);
    // The race immediately places the rover on its grid; preload that area.
    planetStreamer.resume();
    planetStreamer.update(new THREE.Vector3(), true);
    world.step();
}
const terrainStreamingVelocity = new THREE.Vector3();
function updatePlanetStreaming() {
    if (!rover) return;
    const clearance = rover.position.y - getTerrainHeight(rover.position.x, rover.position.z);
    const fastFlight = clearance > 35 && clearance + Math.min(0, verticalVelocity) * 0.15 > 35 &&
        Math.hypot(driveState.speed, driveState.lateralSpeed) > 250;
    const highFlight = clearance > 2500;
    if (highFlight) planetStreamer.suspend(); else planetStreamer.resume();
    const change = planet.shouldReframe(rover.position, highFlight ? 5000 : fastFlight ? 4000 : 750);
    if (change) changePlanetFrame(change === 'home');
    terrainStreamingVelocity.set(-Math.sin(roverYaw)*driveState.speed+Math.cos(roverYaw)*driveState.lateralSpeed,
        0,-Math.cos(roverYaw)*driveState.speed-Math.sin(roverYaw)*driveState.lateralSpeed);
    planetStreamer.update(rover.position, !!change, fastFlight, terrainStreamingVelocity);
    if (change) world.step();
}
function getPlanetNavigation() {
    if (!rover) return null;
    const homeDistance = planet.homeDistance(rover.position);
    return { remote: !planet.homeFrame || Math.max(Math.abs(rover.position.x), Math.abs(rover.position.z)) > 190,
        homeDistance, coordinates: planet.coordinates(rover.position), frame: planetFrameVersion,
        tiles: planetStreamer.count, getHeight: getTerrainHeight, life: planetLife.info(),
        navigate(site) {
            const from = planet.toGlobal(rover.position).normalize();
            const to = site.position?.isVector3 ? site.position.clone().normalize() :
                new THREE.Vector3(site.x, Math.sqrt(Math.max(1, planet.radius ** 2 - site.x ** 2 - site.z ** 2)), site.z).normalize();
            const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
            const distance = planet.radius * Math.atan2(new THREE.Vector3().crossVectors(from, to).length(), dot);
            const tangent = to.clone().addScaledVector(from, -dot);
            const local = planet.directionToLocal(tangent);
            return { distance, bearing: Math.atan2(local.x, -local.z) };
        }
    };
}

const orbitalSurfaceCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 5000);
const orbitalTarget = new THREE.Vector3();
const orbitalGlobalTarget = new THREE.Vector3();
let orbitalPlayerState = null;
let orbitalRelocated = false;
const normalFogDensity = scene.fog.density;
const planetLife = createPlanetLife({ planet, scene, world, physics: RAPIER, rockShapes,
    rockMaterial: rockGroups[0].material, mobile: mobileGraphics });
const planetFlight = createPlanetFlight({ scene, planet, sky, camera, orbitCamera: cameraOrbit, homeland, mobile: mobileGraphics, hasContactTerrain: () => planetStreamer.groundReady });

function finishOrbitalView() {
    if (orbitalPlayerState && !orbitalRelocated) {
        // Preview sectors may use another tangent frame. Return to the rover's
        // real planetary location and restore its pre-pause movement exactly.
        const home = planet.homeDistance(rover.position) < 550;
        changePlanetFrame(home);
        Object.assign(driveState, orbitalPlayerState.drive);
        planet.directionToLocal(orbitalPlayerState.velocity, planetVelocity);
        driveState.speed = -Math.sin(roverYaw) * planetVelocity.x - Math.cos(roverYaw) * planetVelocity.z;
        driveState.lateralSpeed = Math.cos(roverYaw) * planetVelocity.x - Math.sin(roverYaw) * planetVelocity.z;
        verticalVelocity = planetVelocity.y;
        currentSpeed = driveState.speed;
        planetStreamer.resume();
        planetStreamer.update(rover.position, true, false);
        world.step();
    }
    orbitalPlayerState = null;
    scene.fog.density = normalFogDensity;
    controls.enabled = true; keys.clear(); touchControls.reset?.(); physicsAccumulator = 0; clock.getDelta();
}
function renderOrbitalSurface(globalCamera, normal, globalUp, altitude, prepareOnly = false) {
    if (!rover) return false;
    orbitalGlobalTarget.copy(normal).multiplyScalar(planet.radius + planet.elevation(normal));
    planet.toLocal(orbitalGlobalTarget, orbitalTarget);
    const distance = planet.homeDistance(orbitalTarget);
    if (distance < 550 && !planet.homeFrame) changePlanetFrame(true, orbitalTarget);
    else if ((planet.homeFrame && distance > 650) ||
        (!planet.homeFrame && Math.hypot(orbitalTarget.x, orbitalTarget.z) > 250)) {
        changePlanetFrame(false, orbitalTarget);
    }
    planet.toLocal(orbitalGlobalTarget, orbitalTarget);
    planetStreamer.resume();
    planetStreamer.update(orbitalTarget, false, false);
    if (prepareOnly) { planetLife.preview(orbitalTarget); return true; }
    orbitalGlobalTarget.copy(normal).multiplyScalar(planet.radius + planet.elevation(normal));
    planet.toLocal(globalCamera, orbitalSurfaceCamera.position);
    planet.directionToLocal(globalUp, orbitalSurfaceCamera.up);
    orbitalSurfaceCamera.aspect = window.innerWidth / window.innerHeight;
    orbitalSurfaceCamera.updateProjectionMatrix();
    planet.toLocal(orbitalGlobalTarget, orbitalTarget);
    orbitalSurfaceCamera.lookAt(orbitalTarget);
    homeland.visible = planet.homeFrame;
    sky.position.copy(orbitalSurfaceCamera.position);
    sunlight.position.copy(orbitalTarget).add(sunOffset); sunlight.target.position.copy(orbitalTarget);
    const previousFogDensity = scene.fog.density;
    // Keep haze mostly in the distance. A density proportional to 0.9/height
    // obscured over half the ground directly beneath the orbital camera.
    scene.fog.density = Math.min(normalFogDensity, 0.12 / Math.max(1, altitude));
    const flightLayers=['flight-planet-globe','flight-intermediate-surface','flight-intermediate-previous','flight-starfield']
        .map(name=>scene.getObjectByName(name)).filter(Boolean);
    const flightVisibility=flightLayers.map(layer=>layer.visible);
    for(const layer of flightLayers)layer.visible=false;
    try { renderer.render(scene, orbitalSurfaceCamera); }
    finally {
        scene.fog.density = previousFogDensity;
        flightLayers.forEach((layer,i)=>{layer.visible=flightVisibility[i];});
    }
    return true;
}
function descendFromOrbit(normal) {
    if (!rover) return;
    orbitalRelocated = true;
    planet.toLocal(normal.clone().multiplyScalar(planet.radius), rover.position);
    changePlanetFrame(planet.homeDistance(rover.position) < 550);
    planetStreamer.resume();
    planetStreamer.update(rover.position, true, false);
    world.step();
    placePlayerOnGrid({ x: rover.position.x, z: rover.position.z }, 0);
    beaconRace.cancel();
    wheelEffects.reset();
}
planetView = createPlanetView({ renderer, planet,
    getPosition: () => rover ? planet.toGlobal(rover.position) : null,
    onEnter() {
        orbitalRelocated = false;
        wheelThrusterEffects.reset();
        planetVelocity.set(-Math.sin(roverYaw) * driveState.speed + Math.cos(roverYaw) * driveState.lateralSpeed,
            verticalVelocity, -Math.cos(roverYaw) * driveState.speed - Math.sin(roverYaw) * driveState.lateralSpeed);
        orbitalPlayerState = { drive: { ...driveState }, velocity: planet.directionToGlobal(planetVelocity) };
        controls.enabled = false; keys.clear(); touchControls.reset?.(); physicsAccumulator = 0;
    },
    onExit: finishOrbitalView, onDescend: descendFromOrbit, renderSurface: renderOrbitalSurface
});

function updateRoverVisuals(delta) {
    sky.position.copy(camera.position);
    if (!rover || delta <= 0) return;
    sunlight.position.copy(rover.position).add(sunOffset);
    sunlight.target.position.copy(rover.position);
    const acceleration = THREE.MathUtils.clamp((currentSpeed - previousVisualSpeed) / delta, -7, 7);
    previousVisualSpeed = currentSpeed;
    const smoothing = 1 - Math.exp(-5 * delta);
    visualPitch = THREE.MathUtils.lerp(visualPitch,
        acceleration * 0.003 * groundContact, smoothing);
    visualRoll = THREE.MathUtils.lerp(visualRoll,
        THREE.MathUtils.clamp(-driveState.yawRate * currentSpeed * 0.005, -0.018, 0.018) * groundContact,
        smoothing);
    if (chassisVisual) {
        // The corrected FBX maps local X to -X and local Y to rover Z.
        chassisVisual.rotation.x = -visualPitch;
        chassisVisual.rotation.y = visualRoll;
    }
    rover.updateMatrixWorld(true);
    wheelEffects.update(delta, wheelAssemblies, currentSpeed, wheelSlip, roverYaw);
    const airThrustActive = groundContact <= 0 && !input.has('Space');
    airThrustVisual.set(airThrustActive ? -(driveState.airStrafe ?? 0) : 0, 0,
        airThrustActive ? -(driveState.throttle ?? 0) * Math.cos(poweredFlight ? currentPitch : 0) : 0).applyQuaternion(yawQuaternion);
    if (poweredFlight) {
        planet.upAt(rover.position, gravityDirection);
        airThrustVisual.addScaledVector(gravityDirection, flightVerticalThrust);
    }
    const airTurn = groundContact <= 0
        ? controlAxis('steering', 'KeyA', 'KeyD') : 0;
    wheelThrusterEffects.update(delta, wheelAssemblies, rover.quaternion,
        airThrustVisual, airTurn, rover.position);
}

// -----------------------------------------------------------------------------
// ANIMATION
// -----------------------------------------------------------------------------

const clock = new THREE.Clock();
let physicsAccumulator = 0;
world.timestep = CONFIG.PHYSICS_STEP;
// Populate scene queries before the FBX's initial ground placement.
world.step();

let lastFrameTimestamp = null;
const activityKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
document.addEventListener('visibilitychange', () => {
    physicsAccumulator = 0;
    lastFrameTimestamp = null;
    clock.getDelta();
});

function animate(timestamp = performance.now()) {
    if (document.hidden) {
        physicsAccumulator = 0;
        lastFrameTimestamp = null;
        clock.getDelta();
        return;
    }
    const active = planetView?.active || cameraDragging || cameraManualDelay > 0 || beaconRace?.racing ||
        Math.abs(currentSpeed) > 0.03 || Math.abs(driveState.lateralSpeed) > 0.03 ||
        Math.abs(verticalVelocity) > 0.1 || keys.size > 0 || activityKeys.some(code => input.has(code));
    const interval = 1000 / (active ? 60 : 30);
    if (lastFrameTimestamp !== null) {
        const elapsed = timestamp - lastFrameTimestamp;
        if (elapsed < interval - 0.5) return;
        lastFrameTimestamp = timestamp - (Math.max(0, elapsed - interval) % interval);
    } else lastFrameTimestamp = timestamp;
    const delta = Math.min(clock.getDelta(), CONFIG.MAX_FRAME_TIME);
    if (planetView?.active) {
        physicsAccumulator = 0;
        planetView.render(delta);
        return;
    }
    updatePlanetStreaming();
    planetLife.update(delta, rover, currentSpeed, input);
    physicsAccumulator += delta;
    while (physicsAccumulator >= CONFIG.PHYSICS_STEP) {
        updateRover(CONFIG.PHYSICS_STEP);
        synchronizeWheelColliders();
        world.step();
        physicsAccumulator -= CONFIG.PHYSICS_STEP;
    }

    updateColliderDebug();
    if (planet.homeFrame && planetFlight.altitude < 2500) autonomousRover?.update(delta, rover?.position, roverYaw);
    beaconRace.update(delta);
    updateFollowCamera(delta);
    updateRoverVisuals(delta);
    if (rover) planetFlight.update(rover, delta);
    touchControls.update?.({ airborne: poweredFlight || groundContact <= 0, powered: poweredFlight, delta });
    updateDrivingHUD(delta);
    exploration.update(delta, rover?.position, roverYaw, currentSpeed, input, autonomousRover?.root.position, beaconRace.mapState, getPlanetNavigation());

    graphics.render(delta, !poweredFlight || planetFlight.altitude < 60);
}

renderer.setAnimationLoop(animate);

// -----------------------------------------------------------------------------
// RESIZE
// -----------------------------------------------------------------------------

window.addEventListener('resize', () => {
    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();
    cameraOrbit.aspect = camera.aspect;
    cameraOrbit.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
    graphics.resize(window.innerWidth, window.innerHeight);
    planetView?.resize(window.innerWidth, window.innerHeight);
});
