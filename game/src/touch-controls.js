import './touch-controls.css';

const ICONS = {
    brake: '<path d="M8 5v14M16 5v14"/>',
    up: '<path d="m6 12 6-7 6 7M12 5v14"/>',
    down: '<path d="m6 12 6 7 6-7M12 5v14"/>',
    boost: '<path d="m5 16 7-6 7 6M5 10l7-6 7 6"/>',
    hop: '<path d="M5 20h14M12 16V4m-5 5 5-5 5 5M8 16l-2 2m10-2 2 2"/>',
    scan: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const action = (name, label, key, extra = '') => `<button type="button" class="touch-action touch-${name}" data-key="${key}" aria-label="${label}" aria-pressed="false" ${extra}>${icon(name)}<span>${label}</span></button>`;

// Each finger owns its control; flight attitude and propulsion remain
// independent while contextual actions appear and disappear.
export function createTouchControls() {
    const keys = new Set(), pointers = new Map();
    const axes = { throttle: 0, steering: 0, pitch: 0, strafe: 0 };
    const media = window.matchMedia('(pointer: coarse)');
    let boost = false, flight = false, canScan = false;
    const root = document.createElement('div');
    root.id = 'rover-touch-controls'; root.dataset.flight = 'false';
    root.setAttribute('aria-label', 'Controles táctiles del rover');
    root.innerHTML = `<div class="touch-stick touch-stick-drive" role="group" aria-label="Avanzar y girar"><span class="touch-stick-label" data-drive-label>CONDUCIR</span>
        <span class="touch-stick-rings" aria-hidden="true"></span><span class="touch-stick-cross" aria-hidden="true"></span>
        <span class="touch-stick-knob" aria-hidden="true"></span></div>
        <div class="touch-stick touch-stick-aim" role="group" aria-label="Girar y orientar el morro" hidden><span class="touch-stick-label">ORIENTAR</span>
        <span class="touch-stick-rings" aria-hidden="true"></span><span class="touch-stick-cross" aria-hidden="true"></span>
        <span class="touch-stick-knob" aria-hidden="true"></span></div>
        <div class="touch-actions">
            ${action('hop', 'Saltar', 'KeyF')}
            ${action('brake', 'Freno', 'Space')}
            ${action('up', 'Volar', 'KeyZ')}${action('down', 'Bajar', 'KeyX', 'hidden')}
            ${action('boost', 'Turbo', 'KeyG', 'data-toggle-boost hidden')}
            ${action('scan', 'Escanear', 'KeyE', 'hidden')}
        </div>`;
    document.body.appendChild(root);
    const hints = document.createElement('div'); hints.id = 'rover-keyboard-hints';
    document.body.appendChild(hints);
    function keyboardHints() {
        const entries = flight
            ? [['WASD', 'Volar'], ['A/D · ←/→', 'Girar'], ['Espacio', 'Subir'], ['C', 'Bajar'], ['W ×2 y mantener', 'Turbo'], ['F', 'Estabilizar']]
            : [['WASD', 'Conducir'], ['W ×2 y mantener', 'Turbo'], ['Espacio', 'Volar'], ['F', 'Saltar'], ['C', 'Frenar'], ['M', 'Mapa']];
        hints.innerHTML = entries.map(([key, label]) => `<span><kbd>${key}</kbd>${label}</span>`).join('');
    }
    keyboardHints();
    const stick = root.querySelector('.touch-stick-drive');
    const aim = root.querySelector('.touch-stick-aim');
    const sticks = [stick, aim];
    const buttons = [...root.querySelectorAll('[data-key]')];
    const up = root.querySelector('.touch-up'), down = root.querySelector('.touch-down');
    const hop = root.querySelector('.touch-hop');
    const fast = root.querySelector('.touch-boost'), scan = root.querySelector('.touch-scan');
    function refresh() {
        keys.clear();
        for (const record of pointers.values()) if (record.code && !record.element.hidden) keys.add(record.code);
        if (axes.throttle > 0) keys.add('KeyW'); if (axes.throttle < 0) keys.add('KeyS');
        if (axes.steering > 0) keys.add('KeyA'); if (axes.steering < 0) keys.add('KeyD');
        if (axes.pitch > 0) keys.add('ArrowDown'); if (axes.pitch < 0) keys.add('ArrowUp');
        if (axes.strafe > 0) keys.add('ArrowLeft'); if (axes.strafe < 0) keys.add('ArrowRight');
        if (boost && flight) keys.add('KeyG');
        for (const button of buttons) button.setAttribute('aria-pressed', String(keys.has(button.dataset.key)));
    }
    function setStickAxes(element, x, y) {
        if (element === stick) {
            axes.throttle = -y;
            if (flight) axes.strafe = -x; else axes.steering = -x;
        } else {
            axes.pitch = y; axes.steering = -x;
        }
    }
    function moveStick(event, element) {
        const bounds = element.getBoundingClientRect(), radius = bounds.width * 0.34;
        let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
        let y = (event.clientY - bounds.top - bounds.height / 2) / radius;
        const length = Math.hypot(x, y);
        if (length > 1) { x /= length; y /= length; }
        const magnitude = Math.min(1, length);
        const strength = magnitude <= 0.12 ? 0 : Math.pow((magnitude - 0.12) / 0.88, 1.35);
        const axisX = magnitude ? x / magnitude * strength : 0;
        const axisY = magnitude ? y / magnitude * strength : 0;
        const record = pointers.get(event.pointerId);
        if (record) { record.x = axisX; record.y = axisY; }
        setStickAxes(element, axisX, axisY);
        element.style.setProperty('--stick-x', `${x * radius}px`); element.style.setProperty('--stick-y', `${y * radius}px`);
        refresh();
    }
    function release(event) {
        const record = pointers.get(event.pointerId); if (!record) return;
        pointers.delete(event.pointerId);
        if (sticks.includes(record.element)) {
            if (record.element === stick) { axes.throttle = 0; if (flight) axes.strafe = 0; else axes.steering = 0; }
            else axes.pitch = axes.steering = 0;
            record.element.style.setProperty('--stick-x', '0px'); record.element.style.setProperty('--stick-y', '0px');
            record.element.classList.remove('is-active');
        }
        refresh();
    }
    for (const element of sticks) {
        element.addEventListener('pointerdown', event => {
            if (event.button !== 0 || element.hidden || [...pointers.values()].some(record => record.element === element)) return;
            event.preventDefault(); event.stopPropagation();
            pointers.set(event.pointerId, { element }); element.setPointerCapture(event.pointerId);
            element.classList.add('is-active'); moveStick(event, element);
        });
        element.addEventListener('pointermove', event => {
            if (pointers.get(event.pointerId)?.element !== element) return;
            event.preventDefault(); moveStick(event, element);
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, release);
    }
    function toggleBoost() { if (flight) { boost = !boost; refresh(); } }
    for (const button of buttons) {
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0 || button.disabled || button.hidden) return;
            event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
            if (button.hasAttribute('data-toggle-boost')) { toggleBoost(); return; }
            pointers.set(event.pointerId, { element: button, code: button.dataset.key }); refresh();
        });
        button.addEventListener('click', event => { if (event.detail === 0 && button.hasAttribute('data-toggle-boost')) toggleBoost(); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    }
    root.addEventListener('contextmenu', event => event.preventDefault());
    // OrbitControls listens on document during a camera drag. Keep joystick
    // and action fingers out of that gesture, including their release events.
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
        root.addEventListener(type, event => event.stopPropagation());
    }
    function clear() {
        pointers.clear(); boost = false; canScan = false; scan.hidden = true;
        for (const key of Object.keys(axes)) axes[key] = 0;
        for (const element of sticks) {
            element.style.setProperty('--stick-x', '0px'); element.style.setProperty('--stick-y', '0px');
            element.classList.remove('is-active');
        }
        refresh();
    }
    function syncDisplay() { document.documentElement.classList.toggle('touch-controls', media.matches); root.hidden = !media.matches; clear(); }
    media.addEventListener('change', syncDisplay);
    window.addEventListener('blur', clear); window.addEventListener('orientationchange', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    syncDisplay();
    return {
        has: code => media.matches && keys.has(code),
        axis: name => media.matches ? axes[name] ?? 0 : 0,
        update({ airborne, powered = false, scanAvailable = false }) {
            const nextFlight = powered;
            const nextScan = !airborne && !nextFlight && scanAvailable;
            if (flight === nextFlight && canScan === nextScan) return;
            flight = nextFlight; canScan = nextScan; root.dataset.flight = String(flight);
            keyboardHints();
            document.documentElement.classList.toggle('touch-flight', flight);
            aim.hidden = down.hidden = fast.hidden = !flight; scan.hidden = !canScan; hop.hidden = flight;
            up.querySelector('span').textContent = flight ? 'Subir' : 'Volar';
            up.setAttribute('aria-label', flight ? 'Subir' : 'Volar');
            stick.setAttribute('aria-label', flight ? 'Volar: avanzar y desplazarse lateralmente' : 'Avanzar y girar');
            root.querySelector('[data-drive-label]').textContent = flight ? 'MOVER' : 'CONDUCIR';
            for (const [pointerId, record] of pointers) if (record.element.hidden) release({ pointerId });
            for (const name of Object.keys(axes)) axes[name] = 0;
            for (const record of pointers.values()) if (sticks.includes(record.element) && !record.element.hidden)
                setStickAxes(record.element, record.x ?? 0, record.y ?? 0);
            if (!flight) { boost = false; axes.pitch = axes.strafe = 0; }
            refresh();
        },
        reset: clear,
        get enabled() { return media.matches; }
    };
}
