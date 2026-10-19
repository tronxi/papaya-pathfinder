import * as THREE from 'three';

const CELL_SIZE = 256;
const SECTOR_CELLS = 32;
const STORAGE_KEY = 'papaya-exploration-v2';
const NAMES = ['Sonda abandonada', 'Estación geológica', 'Baliza de expedición', 'Observatorio', 'Depósito de suministros'];

export function createExplorationCatalog({ planet }) {
    const radius = planet.radius;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Optional storage. */ }
    const previous = Array.isArray(saved?.visited) ? [...saved.visited] : [];
    if (!saved) for (const key of ['papaya-mars-survey-v1', 'papaya-planet-discoveries-v1']) {
        try { const ids = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(ids)) previous.push(...ids); } catch { /* Optional storage. */ }
    }
    const definitions = new Map();
    function randomGenerator(face, x, z) {
        let seed = (Math.imul(face + 1, 73856093) ^ Math.imul(x, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
            value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
            return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
    }
    const minCell = Math.ceil((-radius - CELL_SIZE * 0.5) / CELL_SIZE - 0.5);
    const maxCell = Math.floor((radius + CELL_SIZE * 0.5) / CELL_SIZE - 0.5);
    // Sparse, seeded clusters with independent offsets: fixed between visits,
    // with gaps and varied spacing instead of a visible planetary lattice.
    for (let face = 0; face < 6; face++) {
        for (let sx = Math.floor(minCell / SECTOR_CELLS); sx <= Math.floor(maxCell / SECTOR_CELLS); sx++) {
            for (let sz = Math.floor(minCell / SECTOR_CELLS); sz <= Math.floor(maxCell / SECTOR_CELLS); sz++) {
                const random = randomGenerator(face, sx, sz);
                if (random() > 0.62) continue;
                const count = random() < 0.28 ? 2 : 1;
                const minX = Math.max(minCell, sx * SECTOR_CELLS), maxX = Math.min(maxCell, (sx + 1) * SECTOR_CELLS - 1);
                const minZ = Math.max(minCell, sz * SECTOR_CELLS), maxZ = Math.min(maxCell, (sz + 1) * SECTOR_CELLS - 1);
                for (let i = 0; i < count; i++) {
                    const x = minX + Math.floor(random() * (maxX - minX + 1));
                    const z = minZ + Math.floor(random() * (maxZ - minZ + 1));
                    const id = `${face}:${x}:${z}`;
                    definitions.set(id, { id, face, x, z, u: 0.18 + random() * 0.64,
                        v: 0.18 + random() * 0.64, type: Math.floor(random() * NAMES.length) });
                }
            }
        }
    }
    // Retain previously registered destinations at their original coordinates.
    const legacySites = new Set(Array.isArray(saved?.legacySites) ? saved.legacySites : []);
    if (saved?.layout !== 3) for (const id of [...previous, saved?.target]) if (typeof id === 'string') legacySites.add(id);
    for (const id of legacySites) {
        const parts = typeof id === 'string' ? id.split(':').map(Number) : [];
        if (parts.length !== 3) continue;
        const [face, x, z] = parts;
        if (![face, x, z].every(Number.isInteger) || face < 0 || face > 5 || x < minCell || x > maxCell || z < minCell || z > maxCell) continue;
        const hash = (Math.imul(face + 1, 73856093) ^ Math.imul(x, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
        definitions.set(id, { id, face, x, z, u: 0.5, v: 0.5, type: hash % 3 });
    }
    const objectives = [...definitions.values()].sort((a, b) => a.face - b.face || a.x - b.x || a.z - b.z);
    const indices = new Map(objectives.map((site, index) => [site.id, index]));
    const total = objectives.length, cache = new Map();
    function resolve(token) {
        const index = typeof token === 'number' ? token : indices.get(token);
        const definition = objectives[index]; if (!definition) return null;
        if (cache.has(index)) return cache.get(index);
        const { id, face, x, z, u, v, type } = definition;
        const a = (x + u) * CELL_SIZE / radius, b = (z + v) * CELL_SIZE / radius;
        const sign = face % 2 ? -1 : 1, n = new THREE.Vector3();
        if (face < 2) n.set(sign, a, b);
        else if (face < 4) n.set(a, sign, b);
        else n.set(a, b, sign);
        n.normalize();
        const site = { id, type, name: `${NAMES[type]} ${index + 1}`,
            position: n.multiplyScalar(radius + planet.elevation(n)) };
        if (cache.size >= 512) cache.delete(cache.keys().next().value);
        cache.set(index, site); return site;
    }
    const visited = new Set(previous.filter(id => indices.has(id)));
    let target = resolve(saved?.target) ?? resolve(objectives.find(site => !visited.has(site.id))?.id) ?? resolve(0);
    let scan = 0, revision = 0;
    let orbitalPositions = null, orbitalVisited = null, orbitalTypes = null, orbitalRevision = -1;
    function persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout: 3, visited: [...visited],
            legacySites: [...legacySites], target: target?.id })); } catch { /* Optional storage. */ }
    }
    function select(id) {
        const next = resolve(id); if (!next) return;
        target = next; scan = 0;
        revision++; persist();
    }
    function canScan(position, speed) {
        return !!position && !!target && !visited.has(target.id) && Math.abs(speed) < 0.5 &&
            planet.toGlobal(position).distanceTo(target.position) < 7;
    }
    if (target) select(target.id); else persist();
    return {
        resolve, canScan, isVisited: id => visited.has(id),
        cellSite(face, x, z) { return resolve(`${face}:${x}:${z}`); },
        select,
        orbitalData() {
            if (!orbitalPositions) {
                orbitalPositions = new Float32Array(total * 3);
                orbitalVisited = new Uint8Array(total); orbitalTypes = new Uint8Array(total);
                for (let index = 0; index < total; index++) {
                    resolve(index).position.toArray(orbitalPositions, index * 3);
                    orbitalTypes[index] = objectives[index].type;
                }
            }
            if (orbitalRevision !== revision) {
                orbitalVisited.fill(0);
                for (const id of visited) orbitalVisited[indices.get(id)] = 1;
                orbitalRevision = revision;
            }
            return { positions: orbitalPositions, visited: orbitalVisited, types: orbitalTypes, revision,
                selected: target ? indices.get(target.id) : -1 };
        },
        reset() { visited.clear(); scan = 0; revision++; persist(); },
        update(delta, position, speed, input, race) {
            if (!target || race) { scan = 0; return; }
            scan = canScan(position, speed) && input.has('KeyE') ? Math.min(1, scan + delta / 2.5) : 0;
            if (scan >= 1) { visited.add(target.id); scan = 0; revision++; persist(); }
        },
        info() {
            return { target, scan, revision, registered: visited.size, total, discoveries: visited.size,
                globalTotal: total };
        }
    };
}
