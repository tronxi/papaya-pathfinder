import * as THREE from 'three';
import { createRockerBogieSolver, createWheelSupportSampler } from './suspension.js';

const up = new THREE.Vector3(0, 1, 0);
const angleDelta = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const patrol = [[7, -12], [21, -24], [35, -12], [27, 12], [9, 25], [-16, 23], [-28, 4], [-17, -18]];

export function createAutonomousRover({ template, wheels, sides, config, scene, world,
    physics, groundBody, getHeight, chassisCollision, effects }) {
    const root = template.clone(true);
    root.name = 'autonomous-red-rover';
    // Clone transforms and share geometry/textures; only the red paint needs a
    // separate material. Player and companion joint states are independent.
    const nodes = new Map();
    function pair(original, copy) {
        nodes.set(original, copy);
        original.children.forEach((child, index) => pair(child, copy.children[index]));
    }
    pair(template, root);
    root.traverse(node => {
        if (node.isMesh && node.name === 'body') {
            node.material = node.material.clone();
            node.material.color.setHex(0xc53228);
        }
    });
    const npcWheels = wheels.map(wheel => ({ ...wheel,
        wheelCenter: wheel.wheelCenter.clone(),
        physicsBody: null,
        steeringPivot: nodes.get(wheel.steeringPivot), wheelSpinner: nodes.get(wheel.wheelSpinner),
        previousPosition: new THREE.Vector3() }));
    const npcSides = sides.map(side => ({ ...side,
        rocker: nodes.get(side.rocker), bogie: nodes.get(side.bogie),
        rockerOrigin: side.rockerOrigin.clone(), bogieOrigin: side.bogieOrigin.clone() }));
    const support = createWheelSupportSampler(world, physics, config.GROUND_CLEARANCE);
    const solver = createRockerBogieSolver(npcWheels, npcSides,
        { ...config, SUSPENSION_ITERATIONS: 3 }, support);
    root.position.set(7, getHeight(7, -4) + template.position.y, -4);
    scene.add(root);
    let yaw = 0, pitch = 0, roll = 0, speed = 0, fallSpeed = 0;
    let waypoint = 0, navigationTime = 0, waypointTime = 0, heading = 0;
    let fitTime = 1, target = null;
    let competition = null;
    let navigationGrade = 0, cornerSpeed = Infinity, yawRate = 0, acceleration = 0;
    // Keep steering continuous between navigation updates, including gate changes.
    const wheelbase = Math.max(1, Math.max(...wheels.map(w => w.wheelCenter.z)) -
        Math.min(...wheels.map(w => w.wheelCenter.z)));
    const headingOffsets = [0, 0.22, -0.22, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, Math.PI];
    const point = new THREE.Vector3(), start = new THREE.Vector3(), velocity = new THREE.Vector3();
    const direction = new THREE.Vector3(), rotation = new THREE.Quaternion();
    const tilt = new THREE.Quaternion(), euler = new THREE.Euler();
    const center = chassisCollision?.center.clone() ?? new THREE.Vector3(0, 0.2, 0);
    const shape = chassisCollision?.shape ?? new physics.Ball(0.65);
    const body = world.createRigidBody(physics.RigidBodyDesc.kinematicPositionBased());
    // Actual body collider, also available to debug rendering and future actors.
    const half = chassisCollision?.shape.halfExtents ?? { x: 0.65, y: 0.3, z: 0.8 };
    world.createCollider(physics.ColliderDesc.cuboid(half.x, half.y, half.z), body);

    // Footprint measured from the six tyres, in rover coordinates.
    root.updateMatrixWorld(true);
    const footprint = new THREE.Box3();
    for (const wheel of npcWheels) {
        wheel.steeringPivot.getWorldPosition(point);
        root.worldToLocal(point);
        footprint.expandByPoint(new THREE.Vector3(point.x - wheel.halfWidth, 0, point.z - wheel.radius));
        footprint.expandByPoint(new THREE.Vector3(point.x + wheel.halfWidth, 0, point.z + wheel.radius));
    }
    const footprintCenter = footprint.getCenter(new THREE.Vector3());
    const footprintHalf = footprint.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    let playerFacing = 0;
    const lastPlayer = new THREE.Vector3();
    let hasPlayerPosition = false, playerForwardSpeed = 0;
    let passing = null;

    // Continuous separating-axis sweep of both oriented footprints. A small
    // contact skin replaces the old two-metre circle and also permits sliding.
    function contactFraction(position, facing, displacement, other, otherFacing) {
        const ax = Math.cos(facing), az = -Math.sin(facing);
        const bx = Math.cos(otherFacing), bz = -Math.sin(otherFacing);
        const dx = position.x + ax * footprintCenter.x - az * footprintCenter.z -
            other.x - bx * footprintCenter.x + bz * footprintCenter.z;
        const dz = position.z + az * footprintCenter.x + ax * footprintCenter.z -
            other.z - bz * footprintCenter.x - bx * footprintCenter.z;
        let enter = -Infinity, exit = Infinity;
        for (const [nx, nz] of [[ax, az], [-az, ax], [bx, bz], [-bz, bx]]) {
            const radius = footprintHalf.x * (Math.abs(nx * ax + nz * az) + Math.abs(nx * bx + nz * bz)) +
                footprintHalf.z * (Math.abs(-nx * az + nz * ax) + Math.abs(-nx * bz + nz * bx)) + 0.025;
            const separation = dx * nx + dz * nz;
            const motion = displacement.x * nx + displacement.z * nz;
            if (Math.abs(motion) < 1e-9) {
                if (Math.abs(separation) > radius) return 1;
                continue;
            }
            const a = (-radius - separation) / motion, b = (radius - separation) / motion;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
            if (enter > exit) return 1;
        }
        if (exit < 0 || enter > 1) return 1;
        if (enter < 0) return dx * displacement.x + dz * displacement.z >= 0 ? 1 : 0;
        return Math.max(0, enter - 0.001);
    }
    function orient() {
        tilt.setFromEuler(euler.set(pitch, 0, roll));
        root.quaternion.setFromAxisAngle(up, yaw).multiply(tilt);
        root.updateMatrixWorld(true);
    }
    function chooseHeading(player) {
        const goal = competition?.goal ?? patrol[waypoint];
        let goalX = goal[0], goalZ = goal[1];
        const distance = Math.hypot(goalX - root.position.x, goalZ - root.position.z);
        const next = competition?.next ?? (!competition ? patrol[(waypoint + 1) % patrol.length] : null);
        cornerSpeed = Infinity;
        if (next) {
            const outX = next[0] - goalX, outZ = next[1] - goalZ;
            const length = Math.hypot(outX, outZ);
            if (length > 0.01 && distance > 0.01) {
                const bend = Math.acos(THREE.MathUtils.clamp(((goalX - root.position.x) * outX +
                    (goalZ - root.position.z) * outZ) / (distance * length), -1, 1));
                // Round the corner inside the gate's 4.2 m detection radius.
                // The small preview cannot bypass the checkpoint on a hairpin.
                const preview = 1.8 * THREE.MathUtils.clamp(1 - distance / 12, 0, 1);
                goalX += outX / length * preview;
                goalZ += outZ / length * preview;
                const apexSpeed = Math.max(1.2, 7 / (1 + bend * 2.5));
                cornerSpeed = Math.sqrt(apexSpeed ** 2 + 2 * 3 * Math.max(0, distance - 3));
            }
        }
        if (competition && !competition.finishing && player) {
            if (!passing && distance > 0.01) {
                const fx = (goalX - root.position.x) / distance;
                const fz = (goalZ - root.position.z) / distance;
                const px = player.x - root.position.x, pz = player.z - root.position.z;
                const ahead = px * fx + pz * fz, lateral = px * -fz + pz * fx;
                if (ahead > 0 && ahead < 8 && Math.abs(lateral) < footprintHalf.x * 2 + 0.5 &&
                    playerForwardSpeed < Math.max(2, speed + 0.5)) {
                    // Commit to one side until clear, rather than changing it every scan.
                    let bestSide = null, bestCost = Infinity;
                    for (const side of [-1, 1]) {
                        const clearance = footprintHalf.x * 2 + 0.6;
                        const x = player.x - fz * clearance * side;
                        const z = player.z + fx * clearance * side;
                        const height = getHeight(root.position.x, root.position.z);
                        const rise = getHeight(x, z) - height;
                        const travel = Math.hypot(x - root.position.x, z - root.position.z);
                        if (Math.abs(rise) / Math.max(1, travel) > 0.6) continue;
                        start.copy(center).applyQuaternion(root.quaternion).add(root.position);
                        velocity.set(x - root.position.x, rise, z - root.position.z);
                        const hit = world.castShape(start, root.quaternion, velocity, shape, 0.05, 1, false,
                            physics.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody);
                        const cost = Math.abs(rise) + Math.abs(lateral + side * clearance) * 0.2;
                        if (!hit && cost < bestCost) { bestCost = cost; bestSide = side; }
                    }
                    if (bestSide !== null) passing = { side: bestSide, fx, fz, time: 0 };
                }
            }
            if (passing) {
                const { fx, fz, side } = passing;
                const px = player.x - root.position.x, pz = player.z - root.position.z;
                const ahead = px * fx + pz * fz;
                const lateral = (px * -fz + pz * fx) * side;
                const clearance = footprintHalf.x * 2 + 0.6;
                if (ahead < -footprintHalf.z * 2 - 1 || Math.hypot(px, pz) > 14 || passing.time > 10) {
                    passing = null;
                } else if (-lateral < clearance * 0.85) {
                    // Move out first; aiming directly beyond the player cuts through it.
                    goalX = root.position.x - fz * side * (clearance + lateral) + fx * 0.3;
                    goalZ = root.position.z + fx * side * (clearance + lateral) + fz * 0.3;
                } else {
                    goalX = player.x - fz * side * clearance + fx * (footprintHalf.z * 2 + 2);
                    goalZ = player.z + fx * side * clearance + fz * (footprintHalf.z * 2 + 2);
                }
            }
        } else passing = null;
        const desired = Math.atan2(-(goalX - root.position.x), -(goalZ - root.position.z));
        let best = -Infinity, result = yaw, chosenGrade = 0;
        const lookAhead = THREE.MathUtils.clamp(3 + speed * 0.5, 3, 6);
        for (const offset of headingOffsets) {
            const candidate = desired + offset;
            const dx = -Math.sin(candidate), dz = -Math.cos(candidate);
            const height = getHeight(root.position.x, root.position.z);
            const ahead = getHeight(root.position.x + dx * 3, root.position.z + dz * 3);
            const far = getHeight(root.position.x + dx * 5, root.position.z + dz * 5);
            const grade = Math.max(Math.abs(ahead - height) / 3, Math.abs(far - ahead) / 2);
            if (grade > 0.65) continue;
            velocity.set(dx * 3, 0, dz * 3);
            const trafficClearance = player ? contactFraction(root.position, candidate, velocity, player, playerFacing) : 1;
            start.copy(center).applyQuaternion(root.quaternion).add(root.position);
            velocity.set(dx * lookAhead,
                getHeight(root.position.x + dx * lookAhead, root.position.z + dz * lookAhead) - height,
                dz * lookAhead);
            rotation.setFromAxisAngle(up, candidate).multiply(tilt);
            const hit = world.castShape(start, rotation, velocity, shape, 0.05, 1, false,
                physics.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody);
            if (hit) continue;
            const score = Math.cos(offset) - Math.abs(angleDelta(candidate - yaw)) * 0.2 - grade * 0.8 -
                Math.abs(angleDelta(candidate - heading)) * 0.25 - (1 - trafficClearance) * 1.2;
            if (score > best) { best = score; result = candidate; chosenGrade = grade; }
        }
        heading = result;
        navigationGrade = chosenGrade;
        return best !== -Infinity;
    }
    let pathClear = true;
    function fit(delta) {
        fitTime += delta;
        if (fitTime >= 1 / 30) {
            target = solver.solve(root.position, yaw, pitch, roll, {
                rocker: npcSides[0].rockerAngle, bogies: npcSides.map(side => side.bogieAngle)
            }, speed);
            fitTime = 0;
        }
        const reachable = target && target.nearestGap < 0.16;
        if (reachable) {
            let fraction = 1 - Math.exp(-24 * delta);
            for (const [error, limit] of [[target.height - root.position.y, competition ? 2.2 : 1.6],
                [target.pitch - pitch, 1.4], [target.roll - roll, 1.4],
                [target.rocker - npcSides[0].rockerAngle, 2.5],
                ...npcSides.map((side, index) => [target.bogies[index] - side.bogieAngle, 2.5])]) {
                if (Math.abs(error) > 1e-6) fraction = Math.min(fraction, limit * delta / Math.abs(error));
            }
            pitch += (target.pitch - pitch) * fraction;
            roll += (target.roll - roll) * fraction;
            root.position.y += (target.height - root.position.y) * fraction;
            const rocker = npcSides[0].rockerAngle + (target.rocker - npcSides[0].rockerAngle) * fraction;
            npcSides.forEach((side, index) => {
                side.rockerAngle = index === 0 ? rocker : -rocker;
                side.bogieAngle += (target.bogies[index] - side.bogieAngle) * fraction;
                side.rocker.rotation.x = side.rockerAngle;
                side.bogie.rotation.x = side.bogieAngle;
            });
        }
        orient();
        let floor = -Infinity;
        for (const wheel of npcWheels) {
            wheel.steeringPivot.getWorldPosition(point);
            const height = support(point.x, point.z, wheel.radius,
                yaw + wheel.steeringPivot.rotation.y, wheel.halfWidth);
            if (height !== null && height - point.y < wheel.radius * config.WHEEL_STEP_RATIO) {
                floor = Math.max(floor, height - point.y);
            }
        }
        if (reachable) { root.position.y += Math.max(0, floor); fallSpeed = 0; }
        else {
            fallSpeed -= config.FALL_GRAVITY * delta;
            const descent = fallSpeed * delta;
            root.position.y += Math.max(descent, floor);
            if (floor >= descent) fallSpeed = 0;
        }
        orient();
    }
    // Settle at the spawn before it becomes visible in the first rendered frame.
    for (let i = 0; i < 12; i++) { support.beginStep(); fit(1 / 30); }
    start.copy(center).applyQuaternion(root.quaternion).add(root.position);
    body.setTranslation(start, true);
    body.setRotation(root.quaternion, true);
    return {
        root,
        setActive(active) {
            body.setEnabled(active);
            hasPlayerPosition = false; playerForwardSpeed = 0;
            if (!active) effects?.reset?.();
        },
        startRace(goal, position, facing, nextGoal) {
            competition = { goal: [goal.x, goal.z], next: nextGoal ? [nextGoal.x, nextGoal.z] : null, paused: true };
            root.position.set(position.x, getHeight(position.x, position.z) + template.position.y - getHeight(template.position.x, template.position.z), position.z);
            yaw = facing; pitch = 0; roll = 0; speed = 0; fallSpeed = 0;
            hasPlayerPosition = false; playerForwardSpeed = 0; passing = null;
            heading = yaw; yawRate = 0; acceleration = 0; cornerSpeed = Infinity; pathClear = true; navigationTime = 0; fitTime = 1; target = null;
            npcSides.forEach(side => {
                side.rockerAngle = 0; side.bogieAngle = 0;
                side.rocker.rotation.x = 0; side.bogie.rotation.x = 0;
            });
            npcWheels.forEach(wheel => { wheel.steeringPivot.rotation.y = 0; });
            orient();
            for (let i = 0; i < 15; i++) { support.beginStep(); fit(1 / 30); }
            start.copy(center).applyQuaternion(root.quaternion).add(root.position);
            body.setTranslation(start, true); body.setRotation(root.quaternion, true);
            npcWheels.forEach(wheel => wheel.steeringPivot.getWorldPosition(wheel.previousPosition));
        },
        setRaceTarget(goal, nextGoal) {
            if (competition) {
                competition.goal = [goal.x, goal.z];
                competition.next = nextGoal ? [nextGoal.x, nextGoal.z] : null;
                navigationTime = 0;
            }
        },
        pauseRace(paused) { if (competition) competition.paused = paused; },
        finishRace() {
            if (competition) { competition.finishing = true; competition.next = null; }
        },
        endRace() {
            if (competition?.finishing) { competition.returnToPatrol = true; return; }
            competition = null; passing = null; waypointTime = 0; navigationTime = 0;
            waypoint = patrol.reduce((best, point, index) =>
                Math.hypot(root.position.x - point[0], root.position.z - point[1]) <
                Math.hypot(root.position.x - patrol[best][0], root.position.z - patrol[best][1]) ? index : best, 0);
        },
        constrainPlayerMotion(position, displacement, facing) {
            displacement.multiplyScalar(contactFraction(position, facing, displacement, root.position, yaw));
        },
        update(delta, player, facing = 0) {
            if (delta <= 0) return;
            if (competition?.paused) { speed = 0; acceleration = 0; yawRate = 0; return; }
            delta = Math.min(delta, 0.05);
            playerFacing = facing;
            if (player) {
                if (hasPlayerPosition) {
                    const forwardSpeed = (-(player.x - lastPlayer.x) * Math.sin(yaw) -
                        (player.z - lastPlayer.z) * Math.cos(yaw)) / delta;
                    playerForwardSpeed += (forwardSpeed - playerForwardSpeed) * (1 - Math.exp(-6 * delta));
                }
                lastPlayer.copy(player); hasPlayerPosition = true;
            }
            support.beginStep();
            npcWheels.forEach(wheel => wheel.steeringPivot.getWorldPosition(wheel.previousPosition));
            navigationTime -= delta; waypointTime += delta;
            if (passing) passing.time += delta;
            if (!competition && (Math.hypot(root.position.x - patrol[waypoint][0], root.position.z - patrol[waypoint][1]) < 3 || waypointTime > 40)) {
                waypoint = (waypoint + 1) % patrol.length; waypointTime = 0; navigationTime = 0;
            }
            if (navigationTime <= 0) { pathClear = chooseHeading(player); navigationTime = competition ? 0.15 : 0.25; }
            const turn = angleDelta(heading - yaw);
            // Four-wheel steering: yaw follows the wheel angle and travelled distance.
            // Only a tight recovery turn uses a slow pivot when nearly stationary.
            const steering = THREE.MathUtils.clamp(turn * 0.7, -Math.PI / 4, Math.PI / 4);
            const requestedYawRate = THREE.MathUtils.clamp(2 * speed * Math.tan(steering) / wheelbase,
                -1.15, 1.15);
            const recoveryRate = Math.abs(turn) > (passing ? 0.15 : 0.9) && speed < 0.6 ? Math.sign(turn) * 0.4 : 0;
            yawRate += THREE.MathUtils.clamp((recoveryRate || requestedYawRate) - yawRate,
                -2 * delta, 2 * delta);
            yaw += yawRate * delta;
            const playerX = player ? player.x - root.position.x : 0;
            const playerZ = player ? player.z - root.position.z : 0;
            const aheadDistance = -Math.sin(yaw) * playerX - Math.cos(yaw) * playerZ;
            const lateralDistance = Math.abs(Math.cos(yaw) * playerX - Math.sin(yaw) * playerZ);
            const relativeYaw = playerFacing - yaw;
            const lateralExtent = footprintHalf.x * (1 + Math.abs(Math.cos(relativeYaw))) +
                footprintHalf.z * Math.abs(Math.sin(relativeYaw));
            const longitudinalExtent = footprintHalf.z * (1 + Math.abs(Math.cos(relativeYaw))) +
                footprintHalf.x * Math.abs(Math.sin(relativeYaw));
            let trafficSpeed = player && aheadDistance > 0 && lateralDistance < lateralExtent + 0.08
                ? Math.max(0, playerForwardSpeed) + Math.sqrt(2 * 3 * Math.max(0, aheadDistance - longitudinalExtent - 0.12))
                : Infinity;
            if (passing && player) {
                // Once pointed into an open gap, creep out even if the player
                // remains in the forward braking zone. The swept contact still applies.
                velocity.set(-Math.sin(yaw) * 1.2, 0, -Math.cos(yaw) * 1.2);
                const gap = contactFraction(root.position, yaw, velocity, player, playerFacing);
                trafficSpeed = gap >= 1 ? Math.max(trafficSpeed, 1.6) : trafficSpeed;
            }
            const cruise = competition ? Math.min(config.RACE_MAX_SPEED / (1 + navigationGrade * 0.9),
                1.8 / Math.max(0.1, navigationGrade), cornerSpeed) : 1.15;
            const runoutSpeed = competition?.finishing
                ? Math.sqrt(2 * 2 * Math.max(0, Math.hypot(competition.goal[0] - root.position.x,
                    competition.goal[1] - root.position.z) - 1.5)) : Infinity;
            const desiredSpeed = pathClear
                ? Math.min(runoutSpeed, trafficSpeed, cruise * Math.max(0, Math.cos(turn))) : 0;
            const maxAcceleration = competition ? Math.min(config.MOTOR_ACCELERATION + config.DRIVE_THRUST_ACCELERATION,
                config.SAND_GRIP * config.GRAVITY) : 1.5;
            const requestedAcceleration = THREE.MathUtils.clamp((desiredSpeed - speed) * 3,
                -config.BRAKING_ACCELERATION, maxAcceleration);
            // Ease motor force as well as velocity, avoiding abrupt starts and braking pulses.
            acceleration += THREE.MathUtils.clamp(requestedAcceleration - acceleration, -12 * delta, 8 * delta);
            const previousSpeed = speed;
            speed = Math.max(0, speed + acceleration * delta);
            if ((desiredSpeed - previousSpeed) * (desiredSpeed - speed) <= 0) {
                speed = desiredSpeed; acceleration = 0;
            }
            orient();
            start.copy(center).applyQuaternion(root.quaternion).add(root.position);
            velocity.set(-Math.sin(yaw) * speed * delta, 0, -Math.cos(yaw) * speed * delta);
            const hit = world.castShape(start, root.quaternion, velocity, shape, 0.025, 1, false,
                physics.QueryFilterFlags.ONLY_FIXED, undefined, undefined, groundBody);
            const fraction = player ? contactFraction(root.position, yaw, velocity, player, playerFacing) : 1;
            velocity.multiplyScalar(fraction);
            if (fraction < 1) { speed *= fraction; acceleration = Math.min(0, acceleration); navigationTime = 0; }
            if (hit) { velocity.set(0, 0, 0); speed = 0; acceleration = 0; navigationTime = 0; }
            root.position.add(velocity);
            const actualSteering = speed > 0.3 ? Math.atan(yawRate * wheelbase / (2 * speed)) : steering;
            for (const wheel of npcWheels) if (wheel.steerable) {
                const sign = wheel.position === 'front' ? 1 : -1;
                wheel.steeringPivot.rotation.y += (actualSteering * sign - wheel.steeringPivot.rotation.y) * (1 - Math.exp(-5 * delta));
            }
            fit(delta);
            for (const wheel of npcWheels) {
                wheel.steeringPivot.getWorldPosition(point);
                wheel.steeringPivot.getWorldQuaternion(rotation);
                direction.set(0, 0, -1).applyQuaternion(rotation);
                point.sub(wheel.previousPosition);
                wheel.wheelSpinner.rotation.x -= point.dot(direction) / wheel.radius;
            }
            start.copy(center).applyQuaternion(root.quaternion).add(root.position);
            body.setNextKinematicTranslation(start);
            body.setNextKinematicRotation(root.quaternion);
            effects?.update(delta, npcWheels, speed, 0, yaw);
            if (competition?.finishing && runoutSpeed < 0.2 && speed < 0.2) {
                const returnToPatrol = competition.returnToPatrol;
                competition.finishing = false;
                competition.paused = true;
                if (returnToPatrol) this.endRace();
            }
        }
    };
}
