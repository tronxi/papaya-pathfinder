import * as THREE from 'three';

// Routes follow the current terrain through regional passes and avoid research stations.
export const RACE_COURSES = [
    {
        id: 'ares-long-v2', name: 'Circuito de Ares Vallis',
        points: [
            [0, -6], [14, -24], [26, -40], [42, -22], [50, -14], [42, 8],
            [32, 18], [12, 28], [0, 30], [-18, 14], [-30, 12], [-30, -20],
            [-10, -6], [0, -6],
        ]
    },
    {
        id: 'dunes-long-v2', name: 'Dunas de Nili Patera',
        points: [
            [40, -30], [50, -52], [56, -64], [86, -64], [108, -40], [100, -10],
            [70, 0], [46, -4], [40, -30],
        ]
    },
    {
        id: 'canyon-v1', name: 'Rally de Valles Marineris',
        points: [
            [-34, 0], [-44, -6], [-46, -30], [-56, -58], [-66, -72], [-74, -64],
            [-84, -34], [-78, -10], [-74, 0], [-64, 24], [-40, 36], [-32, 14],
            [-34, 0],
        ]
    },
    {
        id: 'mesas-v1', name: 'Ascenso al monte Sharp',
        points: [
            [-20, 36], [-44, 42], [-60, 52], [-78, 66], [-88, 68], [-92, 82],
            [-70, 98], [-46, 98], [-38, 92], [-28, 92], [-38, 88], [-22, 82],
            [-14, 70], [-16, 46], [-20, 36],
        ]
    },
    {
        id: 'lake-basalt-v1', name: 'Travesía Jezero–Elysium',
        points: [
            [76, 26], [104, 36], [116, 60], [104, 80], [96, 90], [66, 96],
            [46, 86], [16, 76], [6, 50], [16, 36], [38, 26], [56, 10],
            [76, 26],
        ]
    },
    {
        id: 'grand-tour-v1', name: 'Gran Ruta de Tharsis',
        points: [
            [0, -6], [14, -24], [28, -42], [36, -50], [58, -56], [76, -70],
            [100, -68], [110, -60], [118, -38], [116, -14], [118, 0], [128, 20],
            [128, 40], [130, 52], [126, 64], [122, 74], [104, 94], [96, 100],
            [72, 96], [48, 98], [26, 100], [2, 96], [-26, 88], [-40, 84],
            [-64, 86], [-90, 80], [-92, 56], [-92, 32], [-108, 10], [-98, -12],
            [-98, -36], [-100, -64], [-82, -78], [-70, -84], [-44, -86], [-60, -90],
            [-40, -88], [-18, -86], [-4, -80], [-8, -56], [-6, -32], [0, -6],
        ]
    },
].map(course => {
    const distance = course.points.slice(1).reduce((total, point, index) =>
        total + Math.hypot(point[0] - course.points[index][0], point[1] - course.points[index][1]), 0);
    // Longer events allow time to negotiate slopes or recover from a missed turn.
    const timeLimit = Math.max(180, Math.ceil((distance / 1.5 + 60) / 30) * 30);
    return { ...course, distance, timeLimit };
});

function segmentDistance(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// Keep a narrow driving corridor and the beacon approaches free of spawned
// boulders. Terrain, bumps, dunes and all rocks outside the lane remain intact.
export function isRaceCorridor(x, z) {
    return RACE_COURSES.some(course => course.points.some((point, index) => index > 0 &&
        segmentDistance(x, z, ...course.points[index - 1], ...point) < 4));
}

function crossing(from, to, gate) {
    const x = from.x - gate.x, z = from.z - gate.z;
    const dx = to.x - from.x, dz = to.z - from.z;
    const c = x * x + z * z - 4.2 ** 2;
    if (c <= 0) return 0;
    const a = dx * dx + dz * dz;
    if (a < 1e-10) return null;
    const b = x * dx + z * dz, disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : null;
}
const formatTime = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

export function createBeaconRace({ scene, world, physics, getHeight, getPlayer, getOpponent, placePlayer, onStart, beforeStart }) {
    let state = 'idle', selected = 0, gates = [], gateMeshes = [], colliders = [];
    let countdown = 3, elapsed = 0, playerGate = 0, opponentGate = 0, opponentTime = null;
    let lastPlayer = new THREE.Vector3(), lastOpponent = new THREE.Vector3(), refreshTime = 0;
    let result = '', best = {};
    let finishBannerTime = 0;
    const storageKey = 'papaya-beacon-records-v1';
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        for (const course of RACE_COURSES) if (Number.isFinite(saved?.[course.id]) && saved[course.id] > 0) best[course.id] = saved[course.id];
    } catch { /* Records are optional when storage is unavailable. */ }
    const group = new THREE.Group(); group.name = 'beacon-race'; scene.add(group);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xdad1c3, roughness: 0.8 });
    const poleGeometry = new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6);
    const capGeometry = new THREE.BoxGeometry(0.32, 0.35, 0.2);
    function setCourseActive(enabled) {
        group.visible = enabled;
        colliders.forEach(collider => collider.setEnabled(enabled));
    }
    function makeCourse() {
        for (const collider of colliders) world.removeCollider(collider, true);
        for (const gate of gateMeshes) {
            gate.material.dispose();
            gate.label?.material.map.dispose();
            gate.label?.material.dispose();
        }
        colliders = []; gateMeshes = []; group.clear();
        const route = RACE_COURSES[selected].points;
        gates = route.slice(1).map(([x, z]) => ({ x, z }));
        gates.forEach((gate, index) => {
            const previous = route[index];
            const dx = gate.x - previous[0], dz = gate.z - previous[1];
            const length = Math.hypot(dx, dz), rx = -dz / length, rz = dx / length;
            const material = new THREE.MeshBasicMaterial({ color: 0x9d785b });
            const caps = [];
            for (const sign of [-1, 1]) {
                const x = gate.x + rx * 4.6 * sign, z = gate.z + rz * 4.6 * sign;
                const y = getHeight(x, z);
                const pole = new THREE.Mesh(poleGeometry, poleMaterial);
                pole.position.set(x, y + 1.25, z); pole.castShadow = true; group.add(pole);
                const cap = new THREE.Mesh(capGeometry, material);
                cap.position.set(x, y + 2.4, z); group.add(cap); caps.push(cap);
                colliders.push(world.createCollider(physics.ColliderDesc.cylinder(1.25, 0.1).setTranslation(x, y + 1.25, z)));
            }
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
            const context = canvas.getContext('2d');
            let label = null;
            if (context) {
                context.fillStyle = 'rgba(40,29,21,0.85)'; context.fillRect(0, 0, 128, 64);
                context.fillStyle = '#ffdfaa'; context.textAlign = 'center'; context.textBaseline = 'middle';
                context.font = 'bold 36px system-ui';
                context.fillText(index === gates.length - 1 ? 'META' : String(index + 1), 64, 34);
                const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
                label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
                label.position.set(gate.x, getHeight(gate.x, gate.z) + 3.3, gate.z);
                label.scale.set(2.6, 1.3, 1); group.add(label);
            }
            gateMeshes.push({ material, caps, label });
        });
        setCourseActive(false);
    }
    makeCourse();
    const style = document.createElement('style');
    style.textContent = `
        #beacon-race-panel { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); width:280px;
            box-sizing:border-box; padding:12px; color:#f5e7d4; background:#30251de8; border:1px solid #cfac8055;
            border-radius:8px; font:12px/1.4 system-ui,sans-serif; z-index:102; }
        #beacon-race-panel .race-panel-header {display:grid;grid-template-columns:minmax(0,1fr) 40px;gap:2px 6px;align-items:center}
        #beacon-race-panel .race-panel-header strong {grid-column:1;grid-row:1}
        #beacon-race-panel .race-panel-header [data-time] {grid-column:1;grid-row:2;float:none}
        #beacon-race-panel .race-panel-header [data-toggle-panel] {grid-column:2;grid-row:1 / span 2;min-width:40px;min-height:40px;padding:4px}
        #beacon-race-panel[data-collapsed="true"][data-active="false"] [data-time] {display:none}
        #beacon-race-panel [hidden] {display:none!important}
        #beacon-race-panel strong { font-size:13px; } #beacon-race-panel p { margin:6px 0; }
        #beacon-race-panel button,#beacon-race-panel select { background:#5b4432; color:#fff0dc;
            border:1px solid #bd956d; border-radius:4px; padding:7px; font:inherit; touch-action:manipulation; }
        #beacon-race-panel button { cursor:pointer; } #beacon-race-panel button:disabled { opacity:.55; cursor:default; }
        #beacon-race-panel select { width:100%; margin:7px 0; }
        #beacon-race-panel [data-time] { float:right; font-variant-numeric:tabular-nums; }
        #beacon-race-banner { position:fixed; left:50%; top:26%; transform:translateX(-50%);
            color:#fff2d7; font:700 46px system-ui,sans-serif; text-shadow:0 3px 8px #000b;
            pointer-events:none; z-index:103; }
        #beacon-race-banner[data-result="true"] { width:min(85vw,560px); box-sizing:border-box;
            padding:16px; text-align:center; font-size:clamp(20px,4vw,32px);
            background:#30251de8; border:1px solid #ffd37f; border-radius:8px; }
        #beacon-race-panel[data-result="true"] { border-color:#ffd37f; }
        #beacon-race-panel[data-result="true"] [data-status] { font-size:14px; color:#ffe0a8; }
        .touch-controls #beacon-race-panel { bottom:calc(max(14px,env(safe-area-inset-bottom)) + 152px);
            width:250px; padding:8px; font-size:11px; }
        .touch-controls #beacon-race-panel button { min-height:40px; }
        .touch-controls #beacon-race-panel[data-active="true"] { width:235px; }
        @media(max-height:440px) { .touch-controls #beacon-race-panel { bottom:12px; width:230px; }
            .touch-controls #beacon-race-panel p { margin:3px 0; } }
    `;
    document.head.appendChild(style);
    const hud = document.createElement('section'); hud.id = 'beacon-race-panel';
    hud.setAttribute('aria-label', 'Carrera entre balizas');
    hud.innerHTML = `<header class="race-panel-header"><strong data-heading>CARRERAS</strong><span data-time>0:00.0</span></header><div id="race-panel-content">
        <select aria-label="Circuito">${RACE_COURSES.map((course, index) => `<option value="${index}">${course.name} · ${Math.round(course.distance)} m</option>`).join('')}</select>
        <p data-status>Te lleva a la salida. Cruza las balizas en orden.</p>
        <div><button type="button" data-start disabled>Correr</button> <button type="button" data-cancel hidden>Abandonar</button>
        <button type="button" data-close hidden>Seguir explorando</button>
        <small data-best></small></div></div>`;
    const banner = document.createElement('div'); banner.id = 'beacon-race-banner';
    banner.setAttribute('aria-live', 'polite'); document.body.appendChild(banner);
    const status = hud.querySelector('[data-status]'), timer = hud.querySelector('[data-time]');
    const select = hud.querySelector('select'), startButton = hud.querySelector('[data-start]');
    const cancelButton = hud.querySelector('[data-cancel]'), bestLabel = hud.querySelector('[data-best]');
    const closeButton = hud.querySelector('[data-close]'), heading = hud.querySelector('[data-heading]');
    function active() { return state === 'countdown' || state === 'running'; }
    function paintGates() {
        gateMeshes.forEach((gate, index) => gate.material.color.setHex(index < playerGate ? 0x8a9c83 : index === playerGate ? 0xffd37f : 0x9d785b));
    }
    function show() {
        const live = active(); hud.dataset.active = String(live);
        hud.dataset.result = String(state === 'results');
        heading.textContent = state === 'results' ? 'CARRERA TERMINADA' : 'CARRERAS';
        select.hidden = live; select.disabled = live;
        startButton.disabled = live || !getPlayer() || !getOpponent();
        startButton.hidden = live; startButton.textContent = state === 'results' ? 'Repetir' : 'Correr';
        cancelButton.hidden = !live;
        closeButton.hidden = state !== 'results';
        timer.textContent = formatTime(elapsed);
        const record = best[RACE_COURSES[selected].id];
        bestLabel.textContent = record ? `Récord ${formatTime(record)}` : '';
        status.textContent = state === 'countdown' ? 'Preparados… acelera cuando termine la cuenta atrás.' : state === 'running'
            ? `Baliza ${Math.min(playerGate + 1, gates.length)}/${gates.length} · Rival ${opponentGate}/${gates.length}${opponentTime !== null ? ' · El rival ha terminado' : ''}`
            : state === 'results' ? result : `${gates.length} balizas · ${Math.round(RACE_COURSES[selected].distance)} m · límite ${formatTime(RACE_COURSES[selected].timeLimit)}. Correr te lleva a la salida.`;
        banner.dataset.result = String(state === 'results' && finishBannerTime > 0);
        banner.textContent = state === 'results' && finishBannerTime > 0 ? '¡CARRERA TERMINADA!'
            : state === 'countdown' ? String(Math.ceil(countdown)) : state === 'running' && elapsed < 0.8 ? '¡YA!' : '';
    }
    function finish(text, playerTime) {
        state = 'results'; result = text; finishBannerTime = 5;
        setCourseActive(false);
        if (playerTime !== null) {
            const id = RACE_COURSES[selected].id;
            if (!best[id] || playerTime < best[id]) {
                best[id] = playerTime; result += ' · Nuevo récord';
                try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch { /* Optional storage. */ }
            }
        }
        getOpponent()?.endRace();
        show();
    }
    function finishDirection() {
        const route = RACE_COURSES[selected].points;
        const last = route[route.length - 1], previous = route[route.length - 2];
        const length = Math.hypot(last[0] - previous[0], last[1] - previous[1]);
        return { x: (last[0] - previous[0]) / length, z: (last[1] - previous[1]) / length };
    }
    function opponentTarget(index) {
        if (index !== gates.length - 1) return gates[index];
        const direction = finishDirection(), gate = gates[index];
        return { x: gate.x + direction.x * 12, z: gate.z + direction.z * 12 };
    }
    function gateCrossing(from, to, index) {
        if (index !== gates.length - 1) return crossing(from, to, gates[index]);
        const gate = gates[index], direction = finishDirection();
        const before = (from.x - gate.x) * direction.x + (from.z - gate.z) * direction.z;
        const after = (to.x - gate.x) * direction.x + (to.z - gate.z) * direction.z;
        if (before > 0 || after < 0 || after <= before) return null;
        const t = -before / (after - before);
        const x = from.x + (to.x - from.x) * t - gate.x;
        const z = from.z + (to.z - from.z) * t - gate.z;
        return Math.abs(x * direction.z - z * direction.x) <= 4.2 ? t : null;
    }
    function begin() {
        const player = getPlayer(), opponent = getOpponent();
        if (!player || !opponent || active()) return;
        beforeStart?.();
        const route = RACE_COURSES[selected].points, origin = route[0], next = route[1];
        const dx = next[0] - origin[0], dz = next[1] - origin[1], length = Math.hypot(dx, dz);
        const rx = -dz / length, rz = dx / length, yaw = Math.atan2(-dx, -dz);
        placePlayer({ x: origin[0] - rx * 2, z: origin[1] - rz * 2 }, yaw);
        opponent.startRace(opponentTarget(0), { x: origin[0] + rx * 2, z: origin[1] + rz * 2 }, yaw, gates[1]);
        countdown = 3; elapsed = 0; playerGate = 0; opponentGate = 0; opponentTime = null;
        state = 'countdown'; result = ''; finishBannerTime = 0;
        lastPlayer.copy(player.position); lastOpponent.copy(opponent.root.position);
        setCourseActive(true);
        paintGates(); onStart?.(); show();
    }
    startButton.addEventListener('click', begin);
    cancelButton.addEventListener('click', () => {
        state = 'idle'; elapsed = 0; getOpponent()?.endRace();
        setCourseActive(false); show();
    });
    closeButton.addEventListener('click', () => {
        state = 'idle'; elapsed = 0; finishBannerTime = 0; show();
    });
    select.addEventListener('change', () => {
        if (active()) return;
        selected = Number(select.value); state = 'idle'; elapsed = 0;
        makeCourse(); show();
    });
    show();
    return {
        panel: hud, refresh: show,
        syncWorldState() { setCourseActive(active()); },
        cancel() {
            state = 'idle'; elapsed = 0; finishBannerTime = 0;
            getOpponent()?.endRace(); setCourseActive(false); show();
        },
        get racing() { return state === 'running'; },
        get movementLocked() { return state === 'countdown'; },
        get mapState() { return active() ? { gates, index: playerGate } : null; },
        update(delta) {
            const player = getPlayer(), opponent = getOpponent();
            if (!player || !opponent) return;
            finishBannerTime = Math.max(0, finishBannerTime - delta);
            if (state === 'countdown') {
                countdown -= delta;
                if (countdown <= 0) { state = 'running'; opponent.pauseRace(false); }
                show(); return;
            }
            if (state === 'running') {
                const playerHit = gateCrossing(lastPlayer, player.position, playerGate);
                const opponentHit = opponentGate < gates.length ? gateCrossing(lastOpponent, opponent.root.position, opponentGate) : null;
                if (opponentHit !== null) {
                    opponentGate++;
                    if (opponentGate === gates.length) { opponentTime = elapsed + delta * opponentHit; opponent.finishRace(); }
                    else opponent.setRaceTarget(opponentTarget(opponentGate), gates[opponentGate + 1]);
                }
                if (playerHit !== null) {
                    playerGate++; paintGates();
                    if (playerGate === gates.length) {
                        const time = elapsed + delta * playerHit;
                        elapsed = time;
                        finish(`${opponentTime === null || time <= opponentTime ? '¡Ganaste!' : 'Ganó el rival'} · ${formatTime(time)}`, time);
                    }
                }
                if (state === 'running') {
                    elapsed += delta;
                    if (elapsed >= RACE_COURSES[selected].timeLimit) finish('Tiempo agotado. Vuelve a intentarlo.', null);
                }
                lastPlayer.copy(player.position); lastOpponent.copy(opponent.root.position);
            }
            refreshTime += delta;
            if (refreshTime >= 0.1) { refreshTime = 0; show(); }
        }
    };
}
