const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const smooth = (value, target, response, dt) => value + (target - value) * (1 - Math.exp(-response * dt));
const smoothstep = (value, min, max) => {
    const t = clamp((value - min) / (max - min), 0, 1);
    return t * t * (3 - 2 * t);
};

// Velocities are measured along the surface, in the chassis frame (forward/right).
// The scene rotates them when yaw changes and projects them onto the ground.
export function stepDrive(state, input, dt, config) {
    if (dt <= 0) return;
    const { throttle, brake, steering, slope, roll, grip, contact, wheelbase } = input;
    const previousSpeed = state.speed;
    state.throttle = smooth(state.throttle ?? 0, brake ? 0 : throttle,
        throttle ? config.THROTTLE_RESPONSE : config.THROTTLE_RELEASE_RESPONSE, dt);
    if (contact <= 0) {
        // Reaction thrusters work without tyre grip. Keep momentum in the body
        // frame; the caller rotates it when yaw changes to preserve world velocity.
        state.thruster = !brake && throttle > 0 ? Math.max(0, state.throttle) : 0;
        state.driveAssist = 0;
        const thrustAcceleration = input.flightBoost ? config.AIR_BOOST_ACCELERATION : config.AIR_THRUST_ACCELERATION;
        const directionalThrust = throttle !== 0 || (input.airStrafe ?? 0) !== 0;
        const driftDamping = input.flightBoost && directionalThrust
            ? config.AIR_BOOST_DRIFT_DAMPING : config.AIR_DRIFT_DAMPING;
        const damping = Math.exp(-(brake ? config.AIR_BRAKING_RESPONSE : driftDamping) * dt);
        const pitchProjection = Math.cos(input.airPitch ?? 0);
        const forwardAcceleration = input.flightBoost && throttle > 0
            ? config.AIR_FORWARD_BOOST_ACCELERATION : thrustAcceleration;
        const clearanceBlend = smoothstep(input.airClearance ?? 20, 2, 15);
        const cruiseSpeed = config.AIR_BOOST_LOW_ALTITUDE_SPEED +
            (config.AIR_BOOST_CRUISE_SPEED - config.AIR_BOOST_LOW_ALTITUDE_SPEED) * clearanceBlend;
        let forwardForce = throttle === 0 ? 0 : state.throttle * forwardAcceleration * pitchProjection;
        if (throttle === 0) state.airAcceleration = Math.min(0, state.airAcceleration ?? 0);
        if (input.flightBoost && throttle > 0) {
            const target = Math.max(0, state.throttle) * cruiseSpeed * pitchProjection;
            forwardForce = clamp((target - state.speed) * config.AIR_BOOST_SPEED_RESPONSE,
                -config.AIR_FORWARD_BOOST_ACCELERATION, config.AIR_FORWARD_BOOST_ACCELERATION);
        }
        state.airAcceleration = approach(state.airAcceleration ?? 0, brake ? 0 : forwardForce, (input.flightBoost && throttle > 0 ? config.AIR_BOOST_ACCELERATION_RAMP : 300) * dt);
        state.speed = (state.speed + (brake ? 0 : state.airAcceleration * dt)) * damping;
        const strafe = brake ? 0 : (input.airStrafe ?? 0);
        state.airStrafe = smooth(state.airStrafe ?? 0, strafe, config.THROTTLE_RESPONSE, dt);
        // Side controls fire lateral thrusters instead of steering wheels in mid-air.
        state.lateralSpeed = (state.lateralSpeed - state.airStrafe * thrustAcceleration * dt) * damping;
        if (input.flightBoost && Math.abs(strafe) < 0.01) {
            state.lateralSpeed = approach(state.lateralSpeed, 0,
                Math.max(config.AIR_LATERAL_STABILIZATION_ACCELERATION, Math.abs(state.lateralSpeed) * 1.5) * dt);
        }
        const yawSensitivity = Math.max(0.2, 1 / (1 + Math.hypot(state.speed, state.lateralSpeed) / config.AIR_FAST_TURN_SPEED));
        const targetYaw = (input.airSteering ?? 0) * config.AIR_YAW_SPEED * yawSensitivity;
        state.yawRate = smooth(state.yawRate, targetYaw, config.AIR_YAW_RESPONSE, dt);
        state.acceleration = smooth(state.acceleration ?? 0, (state.speed - previousSpeed) / dt, 8, dt);
        state.slip = smooth(state.slip, 0, config.WHEEL_SPIN_RESPONSE, dt);
        state.hillHold = 0;
        return;
    }
    state.airAcceleration = 0;
    state.airStrafe = smooth(state.airStrafe ?? 0, 0, config.THROTTLE_RESPONSE, dt);
    state.filteredGrip = smooth(state.filteredGrip ?? grip, grip, 10, dt);
    const normal = config.GRAVITY * Math.max(0, Math.cos(slope) * Math.cos(roll));
    const traction = state.filteredGrip * normal * contact;
    const gravityForward = -config.GRAVITY * Math.sin(slope) * contact;
    const gravitySide = -config.GRAVITY * Math.sin(roll) * contact;

    // Preserve the crawler's climbing ability, blending the assistance by grade.
    const uphill = throttle !== 0 && throttle * Math.sin(slope) > 0;
    const grade = Math.abs(slope);
    const downhill = state.speed * Math.sin(slope) < -0.01 ||
        throttle * Math.sin(slope) < 0;
    const descentBlend = downhill ? smoothstep(grade, 0.22, 0.75) : 0;
    const climbBlend = smoothstep(grade, 0.15, 0.7) *
        (1 - smoothstep(grade, config.CLIMB_ASSIST_MAX_ANGLE, config.CLIMB_ASSIST_MAX_ANGLE + 0.12));
    const driveGrip = state.filteredGrip + Math.max(0, config.CLIMB_GRIP - state.filteredGrip) *
        Math.max(climbBlend, descentBlend);
    const driveTraction = driveGrip * normal * contact;

    // A short hill-start hold bridges brake release and motor torque buildup.
    state.hillHold = Math.max(0, (state.hillHold ?? 0) - dt);
    if (brake && Math.abs(state.speed) < 0.15 && contact > 0) state.hillHold = config.HILL_HOLD_TIME;
    const holding = state.hillHold > 0 && Math.abs(state.speed) < 0.15;
    const opposing = throttle !== 0 && state.speed * throttle < -0.15;
    const braking = brake || (opposing && !uphill);
    const coasting = throttle === 0 && !brake;
    state.brake = smooth(state.brake ?? 0, braking ? 1 : 0, config.BRAKE_RESPONSE, dt);
    state.coastBrake = smooth(state.coastBrake ?? 0, coasting ? 1 : 0,
        config.COAST_BRAKE_RESPONSE, dt);

    const racingForward = input.racing && throttle > 0 && !brake;
    const suspensionDemand = (input.suspensionLoad ?? 0) * (racingForward ? 0.2 : 1);
    const crawlDemand = Math.max(input.rockContact ? 1 : 0, suspensionDemand);
    state.crawl = smooth(state.crawl ?? 0, crawlDemand,
        crawlDemand > (state.crawl ?? 0) ? 6 : 2.5, dt);
    const thrustDemand = throttle > 0 && !braking && !holding
        ? (1 - state.crawl) * (racingForward ? 1 : 1 - smoothstep(grade, 0.2, 0.65)) : 0;
    state.driveAssist = smooth(state.driveAssist ?? 0, thrustDemand, 5, dt);
    const roadSpeedLimit = throttle < 0 ? config.MAX_REVERSE_SPEED :
        input.racing ? config.RACE_MAX_SPEED : config.MAX_SPEED;
    const crawlLimit = roadSpeedLimit + (config.ROCK_CLIMB_SPEED - roadSpeedLimit) * state.crawl;
    // Keep vertical travel below the linkage's response speed. A horizontal
    // speed cap alone cannot prevent the chassis outrunning its wheels downhill.
    const descentLimit = Math.min(crawlLimit,
        config.DESCENT_VERTICAL_SPEED / Math.max(0.2, Math.abs(Math.sin(slope))));
    const speedLimit = crawlLimit + (descentLimit - crawlLimit) * descentBlend;
    const uphillLoad = uphill ? Math.abs(gravityForward) * climbBlend : 0;
    const motorTorque = Math.min(config.LOW_GEAR_ACCELERATION,
        config.MOTOR_ACCELERATION + uphillLoad);
    const motor = braking ? 0 : state.throttle * motorTorque *
        clamp(1 - Math.pow(Math.max(0, state.speed * Math.sign(state.throttle)) / speedLimit, 2), 0, 1);
    const drag = config.AIR_RESISTANCE * state.speed * Math.abs(state.speed);
    const rolling = config.ROLLING_RESISTANCE * contact;
    // Steering consumes grip progressively; straight climbs keep full torque.
    const steeringDemand = clamp(Math.abs(steering) / config.MAX_STEERING_ANGLE, 0, 1);
    const available = driveTraction * (1 - 0.18 * steeringDemand);
    const crawlBraking = Math.sign(state.speed) * Math.max(0, Math.abs(state.speed) - speedLimit) *
        config.CRAWL_BRAKING_RESPONSE * Math.max(state.crawl, state.driveAssist);
    let longitudinal = clamp(motor - crawlBraking, -available, available);
    if (racingForward && !braking && !holding) {
        // Match the opponent's cruising limit with tire-limited acceleration;
        // the ordinary torque falloff otherwise settles below that limit.
        const desiredAcceleration = clamp((speedLimit - state.speed) * 4,
            -config.BRAKING_ACCELERATION, motorTorque);
        longitudinal = clamp(desiredAcceleration - gravityForward + drag + rolling,
            -available, available);
    }
    if (descentBlend > 0 && throttle !== 0 && !braking && !holding) {
        // Motor braking counters gravity even while the accelerator is held.
        // Apply tire-limited forces rather than abruptly clamping velocity.
        const targetSpeed = Math.sign(throttle) * speedLimit;
        const desiredAcceleration = clamp((targetSpeed - state.speed) * config.DESCENT_SPEED_RESPONSE,
            -config.BRAKING_ACCELERATION, config.BRAKING_ACCELERATION);
        const descentForce = clamp(desiredAcceleration - gravityForward + drag, -available, available);
        longitudinal += (descentForce - longitudinal) * descentBlend;
    }
    if (braking || holding || coasting) {
        // Limit deceleration before crossing zero (ABS-like braking, no reverse kick).
        const staticGrip = Math.abs(state.speed) < 0.15 ? config.STATIC_GRIP_FACTOR : 1;
        const brakeStrength = holding ? 1 : coasting ? state.coastBrake : state.brake;
        const brakeAcceleration = coasting && !holding
            ? config.COAST_BRAKING_ACCELERATION : config.BRAKING_ACCELERATION;
        const brakeLimit = Math.min(driveTraction * staticGrip,
            (brakeAcceleration + Math.abs(gravityForward)) * brakeStrength);
        longitudinal = clamp(-state.speed / dt - gravityForward + drag, -brakeLimit, brakeLimit);
        if (holding && throttle !== 0 && motor * throttle > -gravityForward * throttle + rolling) {
            state.hillHold = 0;
            longitudinal = clamp(motor, -available, available);
        }
    }
    // Wheel thrusters assist forward driving automatically, independently of
    // tyre grip. Braking and coasting immediately stop the external thrust.
    let thrusterForce = 0;
    if (throttle > 0 && !braking && !holding && state.driveAssist > 0) {
        const desiredAcceleration = clamp((speedLimit - state.speed) * 3,
            -config.BRAKING_ACCELERATION, motorTorque + config.DRIVE_THRUST_ACCELERATION);
        const requiredForce = desiredAcceleration - gravityForward + drag + rolling;
        if (racingForward) {
            thrusterForce = Math.min(state.driveAssist * config.DRIVE_THRUST_ACCELERATION, Math.max(0, requiredForce));
            longitudinal = clamp(requiredForce - thrusterForce, -available, available);
        } else {
            thrusterForce = Math.min(state.driveAssist * config.DRIVE_THRUST_ACCELERATION,
                Math.max(0, requiredForce - longitudinal));
        }
    }
    state.thruster = thrusterForce / Math.max(0.001, config.DRIVE_THRUST_ACCELERATION);
    state.speed += (longitudinal + thrusterForce + gravityForward - drag) * dt;
    state.speed = approach(state.speed, 0, rolling * dt);

    // Combined tire forces leave a small lateral reserve for controllable steering.
    const utilization = Math.min(0.94, Math.abs(longitudinal) / Math.max(0.001, driveTraction));
    const lateralBudget = traction * Math.sqrt(1 - utilization * utilization);
    const desiredSideForce = -state.lateralSpeed * config.LATERAL_RESPONSE - gravitySide;
    const sideForce = clamp(desiredSideForce, -lateralBudget, lateralBudget);
    state.lateralSpeed += (sideForce + gravitySide) * dt;

    // Tire compliance produces gradual understeer instead of an abrupt yaw clamp.
    const speed = Math.abs(state.speed);
    const pivot = input.pivotTurn ?? 0;
    const pivotBlend = pivot ? (input.pivotAlignment ?? 0) *
        (1 - smoothstep(Math.hypot(state.speed, state.lateralSpeed), 0.15, 0.7)) : 0;
    const drivingYaw = state.speed * 2 * Math.tan(steering) / wheelbase /
        (1 + Math.pow(speed / config.UNDERSTEER_SPEED, 2));
    const desiredYaw = pivot ? pivot * config.PIVOT_YAW_SPEED * pivotBlend : drivingYaw;
    const yawLimit = Math.max(0.001, lateralBudget / Math.max(0.5, speed));
    const targetYaw = desiredYaw / Math.sqrt(1 + Math.pow(desiredYaw / yawLimit, 2));
    if (contact > 0) {
        const response = config.YAW_RESPONSE * (pivot ? 2 : 1) / (1 + speed * 0.08);
        state.yawRate = smooth(state.yawRate, targetYaw, response * contact, dt);
    }
    const wheelspin = Math.max(0, Math.abs(motor) - available) / Math.max(1, motorTorque);
    const sidewaysSlip = Math.max(0, Math.abs(desiredSideForce) - lateralBudget) /
        Math.max(1, traction) * 0.12;
    const targetSlip = contact === 0 ? Math.abs(state.throttle) :
        clamp(wheelspin * 0.25 + sidewaysSlip, 0, 0.25);
    state.slip = smooth(state.slip, targetSlip, config.WHEEL_SPIN_RESPONSE, dt);
    state.acceleration = smooth(state.acceleration ?? 0, (state.speed - previousSpeed) / dt, 8, dt);
}
