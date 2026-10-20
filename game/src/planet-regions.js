import * as THREE from 'three';
import { duneHeight, localGroundRelief } from './local-surface.js';

// Fictional regions inspired by Martian landforms, sampled in 3D to avoid seams.
export const PLANET_REGIONS = [
    { name: 'Llanuras ocres', color: 0xb97851, rocks: 20 },
    { name: 'Mar de dunas', color: 0xc89a73, rocks: 8 },
    { name: 'Tierras craterizadas', color: 0xa57459, rocks: 36 },
    { name: 'Cañones estratificados', color: 0xad6949, rocks: 28 },
    { name: 'Mesetas sedimentarias', color: 0xc09070, rocks: 24 },
    { name: 'Campos de basalto', color: 0x77635a, rocks: 56 }
];
const palette = PLANET_REGIONS.map(region => new THREE.Color(region.color));
export function planetRegionField(n, radius) {
    const x = n.x * radius, y = n.y * radius, z = n.z * radius;
    return THREE.MathUtils.clamp(2.5 + 1.2 * Math.sin(x / 2400 + Math.sin(y / 3100)) +
        0.95 * Math.sin(z / 1950 - y / 2700) + 0.75 * Math.sin((x + y + z) / 4100), 0, 5);
}
// Large landforms sit beneath the local biomes. All fields are continuous in
// planetary space, so neither poles nor streamed sector edges introduce steps.
export function planetMacroHeight(n, radius) {
    const x=n.x*radius,y=n.y*radius,z=n.z*radius;
    const ridgePhase=x/4700+y/6300+Math.sin(z/3900)*.85;
    const ridges=Math.pow(1-Math.abs(Math.sin(ridgePhase)),4);
    const rangeMask=THREE.MathUtils.smoothstep(Math.sin(z/8100-y/9300),-.1,.65);
    const passes=.5+.5*Math.sin(y/1700+z/2300);
    const mountains=ridges*rangeMask*(430+770*passes);
    const basinField=.5+.5*Math.sin(x/5400+Math.sin(y/6900)) * Math.sin(z/4600-y/5800);
    const depression=-720*(1-THREE.MathUtils.smoothstep(basinField,.07,.28));
    const rim=170*Math.exp(-(((basinField-.31)/.055)**2));
    const uplands=Math.sin(x/9000+z/11000)*Math.cos(y/7800)*100;
    let height=mountains+depression+rim+uplands;
    // A prominent range and impact basin near the landing region make the
    // new scale discoverable without requiring a trip around the planet.
    for(const feature of LARGE_LANDFORMS) {
        const distance=Math.hypot(n.x-feature.normal.x,n.y-feature.normal.y,n.z-feature.normal.z)*radius;
        if(distance>feature.radius*1.8)continue;
        const q=distance/feature.radius;
        if(feature.type==='range')height+=feature.height*Math.exp(-q*q*2.5);
        else height+=-feature.height*(1-THREE.MathUtils.smoothstep(q,.45,.95))+
            feature.height*.25*Math.exp(-(((q-1)/.14)**2));
    }
    const homeDistance=radius*Math.atan2(Math.hypot(n.x,n.z),n.y);
    return height*THREE.MathUtils.smoothstep(homeDistance,400,2200);
}
const LARGE_LANDFORMS=[
    {type:'range',normal:new THREE.Vector3(3200,50000,-4800).normalize(),radius:2100,height:1050},
    {type:'crater',normal:new THREE.Vector3(-5200,50000,-6800).normalize(),radius:2600,height:700},
    {type:'range',normal:new THREE.Vector3(-8000,50000,4000).normalize(),radius:3000,height:850}
];

// Smooth 3D value noise keeps metre-scale relief stable across local frames
// and cube-face boundaries. Integer hashing avoids expensive trig per corner.
function grainHash(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
function reliefNoise(x, y, z) {
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    let u=x-ix,v=y-iy,w=z-iz;
    u=u*u*(3-2*u);v=v*v*(3-2*v);w=w*w*(3-2*w);
    const mix=THREE.MathUtils.lerp;
    return mix(mix(mix(grainHash(ix,iy,iz),grainHash(ix+1,iy,iz),u),
        mix(grainHash(ix,iy+1,iz),grainHash(ix+1,iy+1,iz),u),v),
        mix(mix(grainHash(ix,iy,iz+1),grainHash(ix+1,iy,iz+1),u),
        mix(grainHash(ix,iy+1,iz+1),grainHash(ix+1,iy+1,iz+1),u),v),w);
}
export function planetGroundDetail(n, radius, field = planetRegionField(n, radius)) {
    const x=n.x*radius,y=n.y*radius,z=n.z*radius;
    // The original site combines 4 m hills, 1.2 m unevenness and 25 cm
    // bumps. Reproduce those scales globally with non-repeating 3D sampling.
    const warp=reliefNoise(x*.035+13,y*.035-7,z*.035+11)*5;
    const hills=reliefNoise(x*.045+warp*.045,y*.045,z*.045-warp*.045)*4+
        reliefNoise(x*.09+17,y*.09-11,z*.09+3)*1.5;
    const uneven=reliefNoise(x*.18-19,y*.18+5,z*.18+11)*1.2+
        reliefNoise(x*.36+7,y*.36+13,z*.36-17)*.45;
    const bumps=reliefNoise(x*.72,y*.72-23,z*.72+31)*.22+
        reliefNoise(x*1.44+41,y*1.44,z*1.44-9)*.065;
    // Dunes are gentler, basalt rougher; both still have physical wheel-scale relief.
    const duneWeight=1-THREE.MathUtils.smoothstep(Math.abs(field-1),.15,.9);
    const basaltWeight=THREE.MathUtils.smoothstep(field,4,5);
    return localGroundRelief(x,y,z,hills*(1-.45*duneWeight),uneven*(1-.4*duneWeight+.25*basaltWeight),bumps);
}

export function planetSurface(n, radius, groundDetail = true) {
    const x = n.x * radius, y = n.y * radius, z = n.z * radius;
    const field = planetRegionField(n, radius), a = Math.floor(field), b = Math.min(5, a + 1);
    const blend = THREE.MathUtils.smoothstep(field - a, 0, 1);
    const broad = Math.sin(x / 830 + Math.sin(z / 1100)) * Math.cos(y / 960 + z / 690) * 4;
    const dunes = duneHeight(x, y, z);
    const basin = 0.5 + 0.5 * Math.sin(x / 290 + y / 370) * Math.sin(z / 310 - y / 430);
    const crater = -18 * (1 - THREE.MathUtils.smoothstep(basin, 0.08, 0.3)) +
        9 * Math.exp(-(((basin - 0.32) / 0.065) ** 2));
    const channel = Math.abs(Math.sin(x / 420 + z / 570 + Math.sin(y / 810)));
    const canyon = -20 + THREE.MathUtils.smoothstep(channel, 0.12, 0.45) * 31;
    const mesa = THREE.MathUtils.smoothstep(basin, 0.35, 0.52) * 23 - 5;
    const lava = Math.pow(0.5 + 0.5 * Math.sin(x / 33 + z / 46 + y / 72), 3) * 3;
    const heights = [broad, broad * 0.4 + dunes, broad + crater, broad * 0.4 + canyon,
        broad * 0.5 + mesa, broad * 1.6 + lava];
    return { height: planetMacroHeight(n, radius) + THREE.MathUtils.lerp(heights[a], heights[b], blend) +
        (groundDetail ? planetGroundDetail(n, radius, field) : 0),
        region: PLANET_REGIONS[Math.round(field)], a, b, blend };
}
export function planetSurfaceColor(n, radius, target) {
    const field = planetRegionField(n, radius), a = Math.floor(field);
    return target.copy(palette[a]).lerp(palette[Math.min(5, a + 1)], THREE.MathUtils.smoothstep(field - a, 0, 1));
}
