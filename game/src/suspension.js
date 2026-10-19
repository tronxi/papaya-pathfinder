import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

// Cast the whole tire down onto the world. Unlike separated ray samples, this
// gives a continuous axle-height envelope as its curved tread crosses a rock edge.
export function createWheelSupportSampler(world, physics, clearance, getHeight = null) {
    const shapes = new Map();
    const contacts = new Map();
    const orientation = new THREE.Quaternion();
    const axleRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const up = new THREE.Vector3(0, 1, 0);
    function sample(x, z, radius, yaw, halfWidth) {
        const contactKey = `${x}:${z}:${radius}:${yaw}:${halfWidth}`;
        if (contacts.has(contactKey)) return contacts.get(contactKey);
        const key = `${radius}:${halfWidth}`;
        if (!shapes.has(key)) shapes.set(key, new physics.Cylinder(halfWidth, radius));
        orientation.setFromAxisAngle(up, yaw).multiply(axleRotation);
        const originY = getHeight ? getHeight(x, z) + 40 : 80;
        const hit = world.castShape({ x, y: originY, z }, orientation, { x: 0, y: -1, z: 0 },
            shapes.get(key), clearance, 200, true, physics.QueryFilterFlags.ONLY_FIXED);
        const result = hit ? { height: originY - hit.time_of_impact, collider: hit.collider } : null;
        contacts.set(contactKey, result);
        return result;
    }
    const support = (...args) => sample(...args)?.height ?? null;
    support.sample = sample;
    // Fixed-world contacts are reused by the motor, obstacle sweeps, linkage,
    // and wheel animation within one physics step; never across world updates.
    support.beginStep = () => contacts.clear();
    return support;
}

// Critically damped joint response: passive articulation without spring oscillation.
export function dampJoint(joint, target, response, maxSpeed, dt, settleTolerance = 0) {
    const error = joint.angle - target;
    if (Math.abs(error) <= settleTolerance && Math.abs(joint.velocity) <= response * settleTolerance) {
        joint.velocity = 0;
        return joint.angle;
    }
    const decay = Math.exp(-response * dt);
    const impulse = (joint.velocity + response * error) * dt;
    const next = target + (error + impulse) * decay;
    const step = clamp(next - joint.angle, -maxSpeed * dt, maxSpeed * dt);
    joint.velocity = (joint.velocity - response * impulse) * decay;
    if (Math.abs(next - joint.angle) > maxSpeed * dt) joint.velocity = step / dt;
    joint.angle += step;
    return joint.angle;
}

function solveLinear(matrix, rhs) {
    const size = rhs.length;
    for (let col = 0; col < size; col++) {
        let pivot = col;
        for (let row = col + 1; row < size; row++) {
            if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
        }
        [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
        [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
        const divisor = matrix[col][col];
        if (Math.abs(divisor) < 1e-9) return null;
        for (let j = col; j < size; j++) matrix[col][j] /= divisor;
        rhs[col] /= divisor;
        for (let row = 0; row < size; row++) {
            if (row === col) continue;
            const scale = matrix[row][col];
            for (let j = col; j < size; j++) matrix[row][j] -= scale * matrix[col][j];
            rhs[row] -= scale * rhs[col];
        }
    }
    return rhs;
}

// Fit six tire contacts with six freedoms: chassis pitch/roll/height, opposed
// rockers and two independent bogies. No wheel is translated off its linkage.
export function createRockerBogieSolver(wheels, sides, config, wheelSupport) {
    const wheelData = wheels.map(wheel => {
        const sideIndex = sides.findIndex(side => side.name === wheel.side);
        const side = sides[sideIndex];
        const onRocker = side.wheelNames.rear === wheel.name;
        return { wheel, sideIndex, side, onRocker,
            arm: wheel.wheelCenter.clone().sub(onRocker ? side.rockerOrigin : side.bogieOrigin),
            bogieOffset: side.bogieOrigin.clone().sub(side.rockerOrigin) };
    });
    const rotation = new THREE.Quaternion();
    const tilt = new THREE.Euler(0, 0, 0, 'XYZ');
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const points = wheelData.map(() => new THREE.Vector3());
    const scratch = wheelData.map(() => new THREE.Vector3());

    function evaluate(parameters, position, yaw, output) {
        rotation.setFromEuler(tilt.set(parameters[0], 0, parameters[1]));
        for (let i = 0; i < wheelData.length; i++) {
            const data = wheelData[i];
            const point = output[i].copy(data.arm);
            if (!data.onRocker) {
                point.applyAxisAngle(xAxis, parameters[3 + data.sideIndex]);
                point.add(data.bogieOffset);
            }
            const rocker = data.sideIndex === 0 ? parameters[2] : -parameters[2];
            point.applyAxisAngle(xAxis, rocker).add(data.side.rockerOrigin);
            point.applyQuaternion(rotation).applyAxisAngle(yAxis, yaw).add(position);
            point.y += parameters[5];
        }
    }

    return {
        solve(position, yaw, pitch, roll, articulation, speed = 0) {
            // Start from the linkage that actually exists, not a previous target
            // the damped joints may never have reached.
            const parameters = [pitch, roll, articulation.rocker,
                ...articulation.bogies, 0];
            const restPose = [...parameters];
            let supported = 0;
            let nearestGap = Infinity;
            let largestGap = 0;
            for (let iteration = 0; iteration < (config.SUSPENSION_ITERATIONS ?? 5); iteration++) {
                evaluate(parameters, position, yaw, points);
                const residual = [];
                const active = [];
                supported = 0;
                for (let i = 0; i < points.length; i++) {
                    const point = points[i];
                    const radius = wheelData[i].wheel.radius;
                    const data = wheelData[i];
                    const wheelYaw = yaw + data.wheel.steeringPivot.rotation.y;
                    const actualSupport = wheelSupport(point.x, point.z, radius, wheelYaw, data.wheel.halfWidth);
                    let target = actualSupport;
                    // A ledge taller than the axle produces a discontinuous
                    // vertical support query. Let the driven tire start its
                    // climbing arc before its center reaches that discontinuity.
                    if (target !== null && Math.abs(speed) > 0.02) {
                        const reach = Math.min(radius * 1.6, Math.abs(speed) * 0.3);
                        for (const fraction of [0.5, 1]) {
                            const ahead = reach * fraction;
                            const distance = ahead * Math.sign(speed);
                            const next = wheelSupport.sample(point.x - Math.sin(yaw) * distance,
                                point.z - Math.cos(yaw) * distance, radius, wheelYaw, data.wheel.halfWidth);
                            if (next && next.height - actualSupport <= radius * config.WHEEL_STEP_RATIO) {
                                target = Math.max(target, next.height - ahead * 0.7);
                            }
                        }
                    }
                    const reachable = target !== null &&
                        point.y - target < config.SUSPENSION_DROOP &&
                        target - point.y <= radius * config.WHEEL_STEP_RATIO + config.GROUND_CLEARANCE;
                    active[i] = reachable;
                    residual[i] = reachable ? target - point.y : 0;
                    if (reachable) {
                        supported++;
                        if (iteration === 0) {
                            nearestGap = Math.min(nearestGap, point.y - actualSupport);
                            largestGap = Math.max(largestGap, point.y - actualSupport);
                        }
                    }
                }
                // In the air, retain the linkage pose instead of reaching for distant ground.
                if (supported < 3) return null;
                const jacobian = points.map(() => Array(6).fill(0));
                for (let axis = 0; axis < 6; axis++) {
                    const probe = [...parameters];
                    probe[axis] += 0.001;
                    evaluate(probe, position, yaw, scratch);
                    for (let i = 0; i < points.length; i++) {
                        if (active[i]) jacobian[i][axis] = (scratch[i].y - points[i].y) / 0.001;
                    }
                }
                const matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
                const rhs = Array(6).fill(0);
                for (let row = 0; row < 6; row++) {
                    for (let i = 0; i < points.length; i++) {
                        rhs[row] += jacobian[i][row] * residual[i];
                        for (let col = 0; col < 6; col++) {
                            matrix[row][col] += jacobian[i][row] * jacobian[i][col];
                        }
                    }
                    // When contacts are missing, prefer the current posture to
                    // another equally valid but very different arrangement.
                    const stiffness = row === 5 ? 0.003 : 0.008;
                    matrix[row][row] += stiffness;
                    rhs[row] -= stiffness * (parameters[row] - restPose[row]);
                }
                const change = solveLinear(matrix, rhs);
                if (!change) break;
                for (let axis = 0; axis < 6; axis++) parameters[axis] += clamp(change[axis], -0.12, 0.12);
                parameters[0] = clamp(parameters[0], -config.SUSPENSION_PITCH_LIMIT, config.SUSPENSION_PITCH_LIMIT);
                parameters[1] = clamp(parameters[1], -config.SUSPENSION_ROLL_LIMIT, config.SUSPENSION_ROLL_LIMIT);
                parameters[2] = clamp(parameters[2], -config.ROCKER_MAX_ANGLE, config.ROCKER_MAX_ANGLE);
                parameters[3] = clamp(parameters[3], -config.BOGIE_MAX_ANGLE, config.BOGIE_MAX_ANGLE);
                parameters[4] = clamp(parameters[4], -config.BOGIE_MAX_ANGLE, config.BOGIE_MAX_ANGLE);
                parameters[5] = clamp(parameters[5], -config.SUSPENSION_DROOP, config.SUSPENSION_DROOP);
            }
            return { nearestGap, largestGap, height: position.y + parameters[5], pitch: parameters[0], roll: parameters[1], rocker: parameters[2],
                bogies: [parameters[3], parameters[4]] };
        }
    };
}
