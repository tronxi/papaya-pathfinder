const smooth = (value, min, max) => {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return t * t * (3 - 2 * t);
};

// Planetary coordinates keep these 15–50 m patches fixed across tile/cube
// boundaries and floating-origin changes. The material uses the same field.
export function localSurfaceField(x, y, z) {
    return 0.5 + 0.5 * Math.sin(x * .041 + Math.sin(z * .027 + y * .019) * 1.7) *
        Math.cos(z * .034 - y * .021 + Math.sin(x * .017) * .8);
}

export function localSurfaceWeights(x, y, z) {
    const field = localSurfaceField(x, y, z);
    return {
        sand: 1 - smooth(field, .18, .36),
        gravel: smooth(field, .2, .38) * (1 - smooth(field, .52, .66)),
        slab: smooth(field, .5, .66) * (1 - smooth(field, .78, .9)),
        clay: smooth(field, .76, .92)
    };
}

export function localGroundRelief(x, y, z, hills, uneven, bumps) {
    const field = localSurfaceField(x, y, z);
    const sand = 1 - smooth(field, .18, .36), clay = smooth(field, .76, .92);
    const slab = smooth(field, .5, .66) * (1 - smooth(field, .78, .9));
    return hills * (1 - sand * .55 - clay * .65 - slab * .15) +
        uneven * (1 - sand * .7 - clay * .85 - slab * .5) +
        bumps * (1 - sand * .8 - clay * .9 - slab * .6);
}

// Broad windward slopes and shorter lee slopes, with winding, uneven crests.
export function duneHeight(x, y, z) {
    const phase = x * .105 + z * .046 + Math.sin(z * .022 + y * .003) * 1.15 +
        Math.sin(x * .013 - z * .018) * .45;
    const profile = .5 + .5 * Math.sin(phase + .38 * Math.sin(phase));
    const height = 7.5 + 2.5 * Math.sin(z * .016 + y * .005);
    return profile * profile * height +
        Math.pow(.5 + .5 * Math.sin(phase * 2.07 + z * .019), 3) * 1.1;
}
