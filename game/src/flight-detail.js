// Distances are metres above the local surface. Streaming stays awake until
// the detailed mesh has completely faded, including during a fast descent.
export const FLIGHT_DETAIL_FADE_START = 5000;
export const FLIGHT_DETAIL_FADE_END = 10000;
export const FLIGHT_STREAMING_CEILING = 10500;

export function terrainViewProfile(mobile = false) {
    return mobile
        ? { range: 12, fineRange: 5, mediumRange: 10 }
        : { range: 20, fineRange: 8, mediumRange: 14 };
}

// Include elevated silhouettes beyond the sea-level horizon. A tangent-plane
// projection needs R*tan(angle), rather than a linear multiple of altitude.
export function flightPatchExtent(clearance, radius = 50000) {
    const horizonAngle = Math.acos(radius / (radius + Math.max(0, clearance) + 1800));
    return radius * Math.tan(Math.min(1.52, horizonAngle * 1.12));
}

export function flightPatchCoordinate(coordinate, extent) {
    const unit = coordinate / extent;
    return Math.sign(unit) * Math.pow(Math.abs(unit), 2.2) * extent;
}

export function predictedFlightClearance(clearance, verticalSpeed, seconds = 2) {
    return Math.max(0, clearance + Math.min(0, verticalSpeed) * seconds);
}
