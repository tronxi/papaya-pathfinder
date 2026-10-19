import * as THREE from 'three';
import { getGameSidebar, getDrivingPanel } from './ui.js';

const smooth = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;
const zone = (x, z, cx, cz, rx, rz) => {
    const erosion = 1 + Math.sin(x * 0.11 + z * 0.06) * 0.07 + Math.sin(z * 0.13 - x * 0.04) * 0.05;
    return 1 - smooth(Math.hypot((x - cx) / rx, (z - cz) / rz) * erosion, 0.55, 1);
};

export function getMarsRegion(x, z) {
    const dunes = zone(x, z, 73, -37, 54, 42);
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
    const dunePhase = x * 0.32 + z * 0.14 + Math.sin(z * 0.075) * 1.7;
    const dunes = Math.pow(0.5 + 0.5 * Math.sin(dunePhase), 2.5) * 2.2;
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

export const SURVEY_SITES = [
    { id: 'lander', name: 'Legado de Pathfinder', x: 25, z: -19, type: 'wreck',
        note: 'Homenaje a Mars Pathfinder, que aterrizó en Ares Vallis en 1997. La sonda del juego es ficticia.' },
    { id: 'dunes', name: 'Dunas de Nili Patera', x: 73, z: -37, type: 'station',
        note: 'Nili Patera tiene campos de dunas que muestran la acción del viento en la superficie de Marte.' },
    { id: 'canyon', name: 'Estratos de Valles Marineris', x: -69, z: -28, type: 'station',
        note: 'Valles Marineris es un gran sistema de cañones de Marte. En Candor Chasma se observan terrenos estratificados.' },
    { id: 'lake', name: 'Antiguo lago de Jezero', x: 25, z: 65, type: 'station',
        note: 'El cráter Jezero conserva restos de un antiguo lago y un delta. Perseverance estudia sus rocas y sedimentos.' },
    { id: 'mesas', name: 'Laderas del monte Sharp', x: -61, z: 65, type: 'station',
        note: 'El monte Sharp se encuentra dentro del cráter Gale. Sus capas sedimentarias registran antiguos ambientes de Marte.' },
    { id: 'basalt', name: 'Llanura de Elysium', x: 74, z: 25, type: 'station',
        note: 'Elysium es una gran región volcánica de Marte. Sus volcanes produjeron materiales que cubren parte de Elysium Planitia.' },
    { id: 'crater', name: 'Borde del cráter Gale', x: 61, z: 83, type: 'station',
        note: 'Gale es el cráter explorado por Curiosity. En su interior se eleva el monte Sharp, con numerosas capas de sedimentos.' }
];

export function isSurveyApproach(x, z) {
    return SURVEY_SITES.some(site => Math.hypot(site.x - x, site.z - z) < 9);
}

// All visible hardware has a matching fixed collider. Dust and ground details
// remain decorative; nothing changes the rover's suspension or tire physics.
export function createMarsExploration({ scene, world, physics, getHeight, size }) {
    const sites = SURVEY_SITES.map(site => ({ ...site }));
    const white = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x625d55, roughness: 0.75, metalness: 0.3 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x343a43, roughness: 0.65, metalness: 0.15 });
    function hardware(parent, geometry, material, x, y, z) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
    for (const site of sites) {
        // Prefer nearby shallow ground, so a goal never requires parking on a cliff.
        let best = Infinity;
        const origin = { x: site.x, z: site.z };
        for (let dx = -6; dx <= 6; dx += 2) for (let dz = -6; dz <= 6; dz += 2) {
            const x = origin.x + dx, z = origin.z + dz;
            const slope = Math.hypot(getHeight(x + 1, z) - getHeight(x - 1, z),
                getHeight(x, z + 1) - getHeight(x, z - 1)) / 2;
            const score = slope * 8 + Math.hypot(dx, dz) * 0.04;
            if (score < best) { best = score; site.x = x; site.z = z; }
        }
        const group = new THREE.Group();
        group.position.set(site.x, getHeight(site.x, site.z), site.z);
        if (site.type === 'wreck') {
            const body = hardware(group, new THREE.CylinderGeometry(0.85, 1.1, 0.5, 8), white, 0, 0.25, 0);
            body.rotation.y = 0.3;
            hardware(group, new THREE.BoxGeometry(1.1, 0.07, 0.65), panel, 1.25, 0.16, 0.2).rotation.z = -0.15;
            hardware(group, new THREE.CylinderGeometry(0.025, 0.025, 1, 8), metal, 0, 0.9, 0);
        } else {
            hardware(group, new THREE.CylinderGeometry(0.26, 0.4, 0.22, 6), metal, 0, 0.11, 0);
            hardware(group, new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8), white, 0, 0.85, 0);
            hardware(group, new THREE.BoxGeometry(0.42, 0.2, 0.16), white, 0, 1.55, 0);
            hardware(group, new THREE.BoxGeometry(0.55, 0.035, 0.36), panel, 0, 1.32, 0).rotation.z = 0.2;
        }
        scene.add(group);
        group.updateMatrixWorld(true);
        for (const mesh of group.children) {
            const collider = physics.ColliderDesc.convexHull(new Float32Array(mesh.geometry.attributes.position.array));
            if (!collider) continue;
            const position = mesh.getWorldPosition(new THREE.Vector3());
            collider.setTranslation(position.x, position.y, position.z);
            collider.setRotation(mesh.getWorldQuaternion(new THREE.Quaternion()));
            world.createCollider(collider.setFriction(1.5).setRestitution(0));
        }
    }

    const storageKey = 'papaya-mars-survey-v1';
    let visited = new Set();
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(saved)) visited = new Set(saved.filter(id => sites.some(site => site.id === id)));
    } catch { /* Exploration also works when storage is unavailable. */ }
    let targetIndex = Math.max(0, sites.findIndex(site => !visited.has(site.id)));
    let scan = 0, elapsed = 0, lastNext = false, message = '', messageTime = 0;
    const style = document.createElement('style');
    style.textContent = `
        #mars-survey { position:fixed; right:18px; top:18px; width:244px; box-sizing:border-box;
            padding:15px; background:rgba(35,27,23,.76); color:#f3e2cf; border:1px solid #d4b29444;
            border-radius:9px; font:12px/1.5 system-ui,sans-serif; backdrop-filter:blur(8px); z-index:99; }
        .touch-controls .survey-keyboard-hint { display:none; }
        #mars-survey small { color:#cfb69c; font-size:10px; letter-spacing:.7px; }
        #mars-survey strong { display:block; font-size:15px; margin:3px 0; }
        #mars-minimap { position:fixed; right:max(18px,env(safe-area-inset-right));
            bottom:max(18px,env(safe-area-inset-bottom)); width:210px; padding:8px;
            box-sizing:border-box; border:1px solid #d4b29466; border-radius:8px;
            background:#30251de6; pointer-events:none; z-index:104; }
        #mars-minimap canvas { display:block; width:100%; height:auto; border-radius:4px; }
        .touch-controls #mars-minimap { width:112px; padding:5px;
            right:max(10px,env(safe-area-inset-right)); bottom:max(10px,env(safe-area-inset-bottom)); }
        #mars-survey progress { width:100%; height:6px; accent-color:#e1b987; }
        #mars-survey button { background:#65503f; color:#f3e2cf; border:1px solid #b39373; padding:6px; cursor:pointer; }
        @media(max-width:600px) { #mars-survey { right:10px; top:10px; width:184px; padding:10px; font-size:11px; }
            #mars-survey strong { font-size:13px; } }
    `;
    document.head.appendChild(style);
    const hud = document.createElement('aside');
    hud.id = 'mars-survey';
    hud.setAttribute('aria-label', 'Expedición');
    hud.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <small><span data-survey-title>EXPEDICIÓN MARTE</span><span class="survey-summary"> · <span data-count></span></span></small>
        <button type="button" data-toggle aria-expanded="true" aria-controls="mars-survey-content" aria-label="Minimizar misiones" title="Minimizar misiones">−</button></div>
        <div id="mars-survey-content">
        <strong data-region></strong>
        <small>DESTINO <span class="survey-keyboard-hint">· N para cambiar</span></small><strong data-goal></strong><div data-distance></div>
        <progress max="1" value="0" aria-label="Progreso del escaneo"></progress><div data-status></div>
        <button data-reset hidden>Reiniciar expedición</button></div>`;
    getGameSidebar().appendChild(hud);
    const ui = name => hud.querySelector(`[data-${name}]`);
    const toggle = ui('toggle');
    const content = hud.querySelector('#mars-survey-content');
    const touchEnabled = () => document.documentElement.classList.contains('touch-controls');
    function setCollapsed(collapsed) {
        content.hidden = collapsed;
        hud.dataset.collapsed = String(collapsed);
        hud.querySelector('[data-survey-title]').textContent = collapsed ? 'EXPLORACIÓN' : 'EXPEDICIÓN MARTE';
        toggle.setAttribute('aria-expanded', String(!content.hidden));
        const label = content.hidden ? 'Mostrar misiones' : 'Minimizar misiones';
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        toggle.textContent = content.hidden ? '+' : '−';
    }
    toggle.addEventListener('click', () => setCollapsed(!content.hidden));
    setCollapsed(touchEnabled());
    const countLabel = ui('count'), regionLabel = ui('region'), goalLabel = ui('goal');
    const distanceLabel = ui('distance'), statusLabel = ui('status');
    const progress = hud.querySelector('progress');
    // The map is independent of menu collapse, sidebar scrolling and races.
    const minimap = document.createElement('aside');
    minimap.id = 'mars-minimap';
    minimap.setAttribute('aria-label', 'Mapa de Marte');
    minimap.innerHTML = '<canvas width="192" height="192" aria-label="Mapa del terreno: norte arriba, destinos y posición de los rovers"></canvas>';
    getDrivingPanel().appendChild(minimap);
    const canvas = minimap.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const map = document.createElement('canvas');
    map.width = map.height = 96;
    const mapCtx = map.getContext('2d');
    const pixels = mapCtx.createImageData(96, 96);
    const heights = new Float32Array(96 * 96);
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
        heights[j * 96 + i] = getHeight((i / 95 - 0.5) * size, (j / 95 - 0.5) * size);
    }
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
        const offset = j * 96 + i;
        const h = heights[offset];
        const r = getMarsRegion((i / 95 - 0.5) * size, (j / 95 - 0.5) * size);
        const light = THREE.MathUtils.clamp(1 + (h - heights[j * 96 + Math.min(95, i + 1)]) * 0.1 + h * 0.008, 0.55, 1.35);
        const color = [mix(155, 197, r.lake + r.dunes * 0.3), mix(98, 158, r.lake), mix(67, 113, r.lake)];
        for (let k = 0; k < 3; k++) pixels.data[offset * 4 + k] = color[k] * light * (1 - r.basalt * 0.35);
        pixels.data[offset * 4 + 3] = 255;
    }
    mapCtx.putImageData(pixels, 0, 0);
    function drawMap(position, yaw, companion, race) {
        ctx.drawImage(map, 0, 0, 192, 192);
        const px = x => (x / size + 0.5) * 192;
        const goal = sites[targetIndex];
        ctx.strokeStyle = '#f9deb599'; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(px(position.x), px(position.z));
        const destination = race ? race.gates[race.index] : goal;
        if (destination) ctx.lineTo(px(destination.x), px(destination.z));
        ctx.stroke(); ctx.setLineDash([]);
        if (race) {
            ctx.strokeStyle = '#ffda91aa'; ctx.beginPath();
            race.gates.forEach((gate, index) => {
                if (index === 0) ctx.moveTo(px(gate.x), px(gate.z)); else ctx.lineTo(px(gate.x), px(gate.z));
            }); ctx.stroke();
            race.gates.forEach((gate, index) => {
                ctx.fillStyle = index === race.index ? '#fff2b9' : '#c49a70';
                ctx.fillRect(px(gate.x) - 2, px(gate.z) - 2, 4, 4);
            });
        }
        sites.forEach((site, index) => {
            ctx.fillStyle = visited.has(site.id) ? '#a7c5ab' : '#f1d1a0';
            ctx.beginPath(); ctx.arc(px(site.x), px(site.z), index === targetIndex ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
        });
        if (companion) {
            ctx.fillStyle = '#ff6756'; ctx.strokeStyle = '#fff0df'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(px(companion.x), px(companion.z), 3, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }
        ctx.save(); ctx.translate(px(position.x), px(position.z)); ctx.rotate(-yaw);
        ctx.fillStyle = '#fff8ee'; ctx.strokeStyle = '#44332b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#fff3df'; ctx.font = '10px system-ui'; ctx.fillText('N', 8, 13);
    }
    const planetMap = document.createElement('canvas'); planetMap.width = planetMap.height = 192;
    const planetCtx = planetMap.getContext('2d');
    let planetMapKey = '';
    function drawPlanetMap(position, yaw, info, navigation) {
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
        ctx.strokeStyle = '#fff0c799'; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x + Math.sin(navigation.bearing) * 250,
            z - Math.cos(navigation.bearing) * 250); ctx.stroke(); ctx.setLineDash([]);
        if (info.life?.target && navigation.distance < 190) {
            const tx=x+Math.sin(navigation.bearing)*navigation.distance/400*192;
            const tz=z-Math.cos(navigation.bearing)*navigation.distance/400*192;
            ctx.fillStyle=info.life.target.visited?'#9ce6c5':'#ffd290';
            ctx.beginPath();ctx.arc(tx,tz,4,0,Math.PI*2);ctx.fill();
        }
        ctx.save(); ctx.translate(x, z); ctx.rotate(-yaw);
        ctx.fillStyle = '#fff5d7'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#fff0d1'; ctx.font = '9px monospace'; ctx.fillText('200 m', 5, 185);
    }
    const reset = ui('reset');
    reset.addEventListener('click', () => {
        visited.clear(); targetIndex = 0; scan = 0; message = ''; messageTime = 0;
        try { localStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    });
    return {
        minimize() { setCollapsed(true); },
        update(delta, position, yaw, speed, keys, companion, race, planetInfo) {
            if (!position) return;
            const next = keys.has('KeyN');
            if (next && !lastNext) { targetIndex = (targetIndex + 1) % sites.length; scan = 0; }
            lastNext = next;
            const site = sites[targetIndex];
            if (planetInfo?.remote) {
                const life = planetInfo.life, destination = life?.target;
                scan = 0; progress.value = life?.scan ?? 0;
                const navigation = planetInfo.navigate(destination ?? site);
                const { latitude, longitude } = planetInfo.coordinates;
                countLabel.textContent = `${life?.discoveries ?? 0} hallazgos planetarios`;
                regionLabel.textContent = (life?.region ?? 'PLANICIES DE MARTE').toUpperCase();
                goalLabel.textContent = destination ? `${destination.visited ? '✓ ' : ''}${destination.name}` : site.name;
                const distanceText = navigation.distance < 1000 ? `${Math.round(navigation.distance)} m` : `${(navigation.distance / 1000).toFixed(1)} km`;
                distanceLabel.textContent = `${distanceText} · rumbo ${Math.round((THREE.MathUtils.radToDeg(navigation.bearing) + 360) % 360)}°`;
                statusLabel.textContent = destination && destination.distance < 12
                    ? destination.visited ? 'Lugar registrado en el diario.' : 'Detente a menos de 7 m y mantén E / Escanear para registrar el hallazgo.'
                    : `${latitude.toFixed(3)}° · ${longitude.toFixed(3)}° · Base a ${(planetInfo.homeDistance / 1000).toFixed(1)} km`;
                reset.hidden = visited.size !== sites.length;
                elapsed += delta;
                if (elapsed >= 0.15) { elapsed = 0; drawPlanetMap(position, yaw, planetInfo, navigation); }
                return;
            }
            const distance = Math.hypot(site.x - position.x, site.z - position.z);
            const completed = visited.has(site.id);
            const canScan = distance < 7 && Math.abs(speed) < 0.5 && !completed;
            scan = canScan && keys.has('KeyE') ? Math.min(1, scan + delta / 2.5) : Math.max(0, scan - delta * 1.5);
            if (scan >= 1) {
                visited.add(site.id); message = site.note; messageTime = 9; scan = 0;
                try { localStorage.setItem(storageKey, JSON.stringify([...visited])); } catch { /* Optional storage. */ }
                const nextSite = sites.findIndex(s => !visited.has(s.id));
                if (nextSite >= 0) targetIndex = nextSite;
            }
            messageTime = Math.max(0, messageTime - delta);
            elapsed += delta;
            if (elapsed < 0.1) return;
            elapsed = 0;
            const goal = sites[targetIndex];
            const remaining = Math.hypot(goal.x - position.x, goal.z - position.z);
            const bearing = (Math.atan2(goal.x - position.x, -(goal.z - position.z)) * 180 / Math.PI + 360) % 360;
            countLabel.textContent = `${visited.size}/${sites.length}`;
            regionLabel.textContent = getMarsRegion(position.x, position.z).name;
            goalLabel.textContent = goal.name;
            distanceLabel.textContent = `${Math.round(remaining)} m · rumbo ${Math.round(bearing)}°`;
            progress.value = scan;
            statusLabel.textContent = messageTime > 0 ? message : visited.size === sites.length
                ? 'Expedición completada. Sigue explorando libremente.' : completed
                    ? touchEnabled() ? 'Lugar estudiado. Toca Destino para elegir otro.' : 'Lugar estudiado. Pulsa N para elegir otro destino.' : distance < 7
                        ? Math.abs(speed) >= 0.5 ? 'Detén el rover para investigar.' : touchEnabled() ? 'Mantén Escanear para investigar.' : 'Mantén E para escanear.'
                        : touchEnabled() ? 'Acércate y mantén Escanear con el rover detenido.' : 'Acércate al punto y mantén E con el rover detenido.';
            reset.hidden = visited.size !== sites.length;
            drawMap(position, yaw, companion, race);
        }
    };
}
