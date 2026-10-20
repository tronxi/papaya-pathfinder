export function createTerrainWorker() {
    if (typeof Worker === 'undefined') return null;
    let worker;
    try { worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' }); }
    catch { return null; }
    let nextId = 0;
    const requests = new Map();
    worker.onmessage = ({ data }) => {
        const request = requests.get(data.id);
        if (!request) return;
        requests.delete(data.id);
        if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
    };
    worker.onerror = () => {
        for (const request of requests.values()) request.reject(new Error('Terrain worker failed'));
        requests.clear(); worker.terminate(); worker = null;
    };
    return {
        build(job) {
            if (!worker) return Promise.reject(new Error('Terrain worker unavailable'));
            const id = ++nextId;
            return new Promise((resolve, reject) => {
                requests.set(id, { resolve, reject }); worker.postMessage({ id, job });
            });
        }
    };
}
