import * as THREE from 'three';
import { duneHeight } from './local-surface.js';
import { createExplorationCatalog } from './exploration-catalog.js';
import { getDrivingPanel } from './ui.js';

const smooth = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;
const zone = (x, z, cx, cz, rx, rz) => {
    const erosion = 1 + Math.sin(x * 0.11 + z * 0.06) * 0.07 + Math.sin(z * 0.13 - x * 0.04) * 0.05;
    return 1 - smooth(Math.hypot((x - cx) / rx, (z - cz) / rz) * erosion, 0.55, 1);
};

export function getMarsRegion(x, z) {
    const dunes = zone(x, z, 73, -37, 70, 55);
    const canyon = zone(x, z, -70, -29, 37, 65);
    const mesas = zone(x, z, -63, 65, 49, 40);
    const lake = zone(x, z, 25, 65, 38, 29);
    const basalt = zone(x, z, 75, 25, 30, 27);
    const weights = [dunes, canyon, mesas, lake, basalt];
    const index = weights.indexOf(Math.max(...weights));
    return { dunes, canyon, mesas, lake, basalt,
        name: weights[index] > 0.35 ? ['Nili Patera', 'Valles Marineris', 'Monte Sharp',
            'Cráter Jezero', 'Elysium Planitia'][index] : 'Ares Vallis' };
}

export function shapeMarsTerrain(x, z, base) {
    const region = getMarsRegion(x, z);
    const dunes = duneHeight(x, 50000, z);
    let height = mix(base, base * 0.32 + dunes, region.dunes);
    // Wide entrances and a winding floor make the canyon a route, not a trap.
    const canyonCenter = -70 + Math.sin(z * 0.045) * 7 + Math.sin(z * 0.11) * 2;
    const bank = smooth(Math.abs(x - canyonCenter), 5, 19);
    const shelf = smooth(Math.abs(x - canyonCenter), 11, 25);
    height = mix(height, base * 0.23 - 4.5 + bank * 9 + shelf * 4, region.canyon);
    const mesaRadius = Math.hypot((x + 63) / 36, (z - 65) / 27);
    const mesa = (1 - smooth(mesaRadius, 0.54, 0.95)) * 8 +
        (1 - smooth(mesaRadius, 0.27, 0.53)) * 5;
    height = mix(height, base * 0.3 + mesa, region.mesas);
    const lakeFloor = -2.2 + Math.sin(x * 0.15 + Math.sin(z * 0.09)) * 0.07;
    height = mix(height, lakeFloor + base * 0.06, region.lake);
    const lavaRidges = Math.pow(0.5 + 0.5 * Math.sin(x * 0.28 + z * 0.13), 3) * 0.65;
    height = mix(height, base * 0.6 + lavaRidges, region.basalt);
    // Keep the landing site level and introduce the new terrain gradually.
    return mix(base, height, smooth(Math.hypot(x, z), 10, 22));
}

export function createMarsExploration({ planet }) {
    const catalog = createExplorationCatalog({ planet });
    let elapsed = 0;
    const style = document.createElement('style');
    style.textContent = `
        #planet-orbit-panel #mars-survey { margin-top:10px; padding:10px 0 0; border-top:1px solid #739b9444;
            font:12px/1.5 system-ui,sans-serif; }
        #mars-survey small { color:#cfb69c; font-size:10px; }
        #mars-minimap { position:fixed; right:max(18px,env(safe-area-inset-right));
            bottom:max(18px,env(safe-area-inset-bottom)); width:210px; padding:8px;
            box-sizing:border-box; border:1px solid #d4b29466; border-radius:8px;
            background:#30251de6; pointer-events:none; z-index:104; }
        #mars-minimap canvas { display:block; width:100%; height:auto; border-radius:4px; }
        .touch-controls #mars-minimap { width:112px; padding:5px;
            right:max(10px,env(safe-area-inset-right)); bottom:max(10px,env(safe-area-inset-bottom)); }
    `;
    document.head.appendChild(style);
    const hud = document.createElement('aside');
    hud.id = 'mars-survey';
    hud.setAttribute('aria-label', 'Expedición');
    hud.innerHTML = '<small data-count></small>';
    const countLabel = hud.querySelector('[data-count]');
    function formatHeading(angle) {
        const degrees = ((Math.round(THREE.MathUtils.radToDeg(angle)) % 360) + 360) % 360;
        const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(degrees / 45) % 8];
        return `${degrees}° ${cardinal}`;
    }
    // The map is independent of menu collapse, sidebar scrolling and races.
    const minimap = document.createElement('aside');
    minimap.id = 'mars-minimap';
    minimap.setAttribute('aria-label', 'Mapa de Marte');
    minimap.innerHTML = '<canvas width="192" height="192" aria-label="Mapa del terreno: norte arriba, destinos y posición de los rovers"></canvas>';
    const navigation = document.createElement('dl');
    navigation.className = 'map-navigation';
    navigation.setAttribute('aria-label', 'Distancias y rumbos de navegación');
    navigation.innerHTML = `
        <div class="map-target"><dt data-map-target-label>Objetivo</dt><dd><strong data-map-target-distance><span class="distance-value">—</span><small class="distance-unit"></small></strong><span data-map-target>—</span></dd></div>
        <div class="map-home"><dt>Base</dt><dd><strong data-map-base-distance><span class="distance-value">—</span><small class="distance-unit"></small></strong><span data-map-base>—</span></dd></div>`;
    const bearingsStyle = document.createElement('style');
    bearingsStyle.textContent = `
        #rover-driving-panel .map-navigation { grid-column:1 / -1; grid-row:3; display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0;
            border-top:1px solid #668b8b40; padding-top:7px; font-variant-numeric:tabular-nums; }
        .map-navigation > div { min-width:0; padding:2px 4px; }
        .map-navigation > div + div { border-left:1px solid #668b8b40; padding-left:8px; }
        .map-navigation dt { font-size:8px; letter-spacing:1px; text-transform:uppercase; opacity:.8; }
        .map-navigation dd { margin:3px 0 0; min-width:0; }
        .map-navigation strong { display:flex; flex-wrap:wrap; align-items:baseline; gap:0 4px;
            min-width:0; font-size:16px; font-weight:600; line-height:1.3; }
        .map-navigation .distance-value { min-width:0; overflow-wrap:anywhere; }
        .map-navigation .distance-unit { font-size:10px; white-space:nowrap; }
        .map-navigation dd > span { display:block; margin-top:2px; font-size:10px; }
        .map-navigation .map-target { color:#ffe08c; }
        .map-navigation .map-home { color:#9ce9d4; }
        .touch-controls .map-navigation strong { font-size:14px; }
        .touch-controls .map-navigation dd > span { font-size:9px; }
    `;
    document.head.appendChild(bearingsStyle);
    const targetLabel = navigation.querySelector('[data-map-target-label]');
    const targetBearing = navigation.querySelector('[data-map-target]');
    const targetDistance = navigation.querySelector('[data-map-target-distance]');
    const baseBearing = navigation.querySelector('[data-map-base]');
    const baseDistance = navigation.querySelector('[data-map-base-distance]');
    function setDistance(element, value, unit) {
        element.querySelector('.distance-value').textContent = value;
        element.querySelector('.distance-unit').textContent = unit;
    }
    function updateMapBearings(position, goal, planetInfo, race) {
        const destination = race?.gates[Math.min(race.index, race.gates.length - 1)] ?? goal;
        const navigate = site => planetInfo ? planetInfo.navigate(site) : {
            distance: Math.hypot(site.x - position.x, site.z - position.z),
            bearing: Math.atan2(site.x - position.x, position.z - site.z)
        };
        const target = navigate(destination), home = navigate({ x: 0, z: 0 });
        targetLabel.textContent = race ? 'Baliza' : 'Objetivo';
        setDistance(targetDistance, target.distance < 1000 ? String(Math.round(target.distance)) : (target.distance / 1000).toFixed(2), target.distance < 1000 ? 'm' : 'km');
        targetBearing.textContent = target.distance < 1 ? 'Aquí' : formatHeading(target.bearing);
        targetBearing.title = race ? `Baliza ${race.index + 1}` : destination.name;
        baseBearing.textContent = home.distance < 1 ? 'Aquí' : formatHeading(home.bearing);
        setDistance(baseDistance, (home.distance / 1000).toFixed(home.distance < 1000 ? 3 : 2), 'km');
    }
    getDrivingPanel().append(minimap, navigation);
    const canvas = minimap.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const planetMap = document.createElement('canvas'); planetMap.width = planetMap.height = 192;
    const planetCtx = planetMap.getContext('2d');
    const visibleObjectives = new Map();
    let planetMapKey = '';
    function drawPlanetMap(position, yaw, info, exploration, companion, race) {
        const cx = Math.floor(position.x / 50) * 50, cz = Math.floor(position.z / 50) * 50;
        const key = `${info.frame}:${cx}:${cz}`;
        if (key !== planetMapKey) {
            planetMapKey = key;
            for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
                const h = info.getHeight(cx + (i / 31 - 0.5) * 400, cz + (j / 31 - 0.5) * 400);
                const shade = Math.round(THREE.MathUtils.clamp(145 + h * 2, 105, 195));
                planetCtx.fillStyle = `rgb(${shade + 30},${shade - 22},${shade - 48})`;
                planetCtx.fillRect(i * 6, j * 6, 6, 6);
            }
        }
        ctx.drawImage(planetMap, 0, 0);
        ctx.strokeStyle = '#ffe5ba33'; ctx.lineWidth = 1;
        for (let i = 0; i <= 192; i += 48) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 192); ctx.moveTo(0, i); ctx.lineTo(192, i); ctx.stroke();
        }
        const x = 96 + (position.x - cx) / 400 * 192;
        const z = 96 + (position.z - cz) / 400 * 192;
        const home = info.navigate({ x: 0, z: 0 });
        const hx = Math.sin(home.bearing), hz = -Math.cos(home.bearing);
        const homePixels = home.distance / 400 * 192;
        // Clip the base indicator to the map edge when landing is outside this sector.
        const edge = Math.min(hx > 0 ? (184 - x) / hx : hx < 0 ? (8 - x) / hx : Infinity,
            hz > 0 ? (184 - z) / hz : hz < 0 ? (8 - z) / hz : Infinity);
        const reach = Math.min(homePixels, edge);
        const bx = x + hx * reach, bz = z + hz * reach;
        ctx.strokeStyle = '#8fe2cf'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(bx, bz); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#9ce9d4'; ctx.fillRect(bx - 3, bz - 3, 6, 6);
        ctx.font = '9px system-ui'; ctx.fillText('BASE', Math.min(160, Math.max(3, bx - 12)), Math.max(10, bz - 7));
        visibleObjectives.clear();
        for (const site of info.visibleObjectives ?? []) visibleObjectives.set(site.id, site);
        if (exploration.target && !visibleObjectives.has(exploration.target.id)) visibleObjectives.set(exploration.target.id, exploration.target);
        const sitesOnMap = visibleObjectives.values();
        for (const site of sitesOnMap) {
            const nav = info.navigate(site);
            const tx = x + Math.sin(nav.bearing) * nav.distance / 400 * 192;
            const tz = z - Math.cos(nav.bearing) * nav.distance / 400 * 192;
            if (tx < 4 || tx > 188 || tz < 4 || tz > 188) continue;
            ctx.fillStyle = catalog.isVisited(site.id) ? '#9ce6c5' : '#ffd290';
            ctx.beginPath(); ctx.arc(tx, tz, 3, 0, Math.PI * 2); ctx.fill();
            if (site.id === exploration.target?.id) {
                ctx.strokeStyle = '#ffe08c'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(tx, tz, 6, 0, Math.PI * 2); ctx.stroke();
            }
        }
        if (!info.remote) {
            const projectX = value => x + (value - position.x) / 400 * 192;
            const projectZ = value => z + (value - position.z) / 400 * 192;
            if (companion) {
                ctx.fillStyle = '#ff6756'; ctx.beginPath(); ctx.arc(projectX(companion.x), projectZ(companion.z), 3, 0, Math.PI * 2); ctx.fill();
            }
            for (const [index, gate] of (race?.gates ?? []).entries()) {
                ctx.fillStyle = index === race.index ? '#fff2b9' : '#c49a70';
                ctx.fillRect(projectX(gate.x) - 2, projectZ(gate.z) - 2, 4, 4);
            }
        }
        ctx.save(); ctx.translate(x, z); ctx.rotate(-yaw);
        ctx.fillStyle = '#fff5d7'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff0d1'; ctx.font = '9px monospace'; ctx.fillText('200 m', 5, 185);
    }
    function refreshPanel() {
        const info = catalog.info();
        countLabel.textContent = `${info.registered}/${info.total} objetivos registrados`;
    }
    return {
        catalog, panel: hud, refresh: refreshPanel,
        update(delta, position, yaw, speed, keys, companion, race, planetInfo) {
            if (!position || !planetInfo) return;
            document.getElementById('papaya-heading').textContent = `RUMBO ${formatHeading(-yaw)}`;
            catalog.update(delta, position, speed, keys, race);
            const info = catalog.info(), goal = info.target;
            if (goal) updateMapBearings(position, goal, planetInfo, race);
            elapsed += delta;
            if (elapsed >= 0.15) { elapsed = 0; drawPlanetMap(position, yaw, planetInfo, info, companion, race); }
        }
    };
}
