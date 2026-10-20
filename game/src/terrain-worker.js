import * as THREE from 'three';
import { createMarsPlanet } from './planet.js';
import { getHomeTerrainHeight } from './home-terrain.js';
import { terrainEdgeNormals } from './terrain-normals.js';
import { flightPatchCoordinate } from './flight-detail.js';

export function buildTerrainData(job) {
    if (job.type === 'tiles') return job.tiles.map(tile => buildTerrainData({ ...job, ...tile, type: 'tile' }));
    const planet = createMarsPlanet({ radius: job.radius, homeHeight: getHomeTerrainHeight });
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    if (job.type === 'patch') {
        const { extent, segments } = job;
        const north = new THREE.Vector3().fromArray(job.north);
        const east = new THREE.Vector3().fromArray(job.east);
        normal.fromArray(job.normal);
        const geometry = new THREE.PlaneGeometry(2 * extent, 2 * extent, segments, segments);
        const vertices = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < vertices.count; i++) {
            const x = flightPatchCoordinate(vertices.getX(i), extent);
            const y = flightPatchCoordinate(vertices.getY(i), extent);
            point.copy(normal).multiplyScalar(job.radius).addScaledVector(east, x).addScaledVector(north, y).normalize();
            point.multiplyScalar(job.radius + planet.elevation(point, true) - 0.3);
            vertices.setXYZ(i, point.x, point.y, point.z);
            uv.setXY(i, x / (2 * extent) + 0.5, y / (2 * extent) + 0.5);
        }
        geometry.computeVertexNormals();
        return { position: vertices.array, normal: geometry.attributes.normal.array,
            uv: uv.array, index: geometry.index.array };
    }
    const frame = new THREE.Matrix4().fromArray(job.frame);
    const count = (job.segments + 1) ** 2;
    const height = new Float32Array(count), uv = new Float32Array(count * 2), color = new Float32Array(count * 3);
    const tintColor = new THREE.Color();
    function heightAt(x, z) {
        let elevation = 0;
        for (let iteration = 0; iteration < 4; iteration++) {
            point.set(x, Math.sqrt(Math.max(1, (job.radius + elevation) ** 2 - x*x - z*z)) - job.radius, z);
            normal.copy(point).applyMatrix4(frame).normalize();
            elevation = planet.elevation(normal);
        }
        return Math.sqrt(Math.max(1, (job.radius + elevation) ** 2 - x*x - z*z)) - job.radius;
    }
    for (let i = 0; i < count; i++) {
        const x = job.x * 50 + (i % (job.segments + 1)) / job.segments * 50;
        const z = job.z * 50 + Math.floor(i / (job.segments + 1)) / job.segments * 50;
        height[i] = heightAt(x, z);
        point.set(x, height[i], z).applyMatrix4(frame);
        uv.set([point.x / 400, point.z / 400], i * 2);
        const tint = 0.5 + 0.5 * Math.sin(point.x / 80 + point.z / 130 + point.y / 150);
        planet.surfaceColor(normal.copy(point).normalize(), tintColor).multiplyScalar(0.95 + tint * 0.1);
        color.set([tintColor.r, tintColor.g, tintColor.b], i * 3);
    }
    return { height, uv, color, edgeNormals: terrainEdgeNormals(job.x, job.z, job.segments, heightAt) };
}

// Importable in Node for parity tests without starting a browser worker.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
    self.onmessage = ({ data }) => {
        try {
            const result = buildTerrainData(data.job);
            const buffers = (Array.isArray(result) ? result : [result]).flatMap(item => Object.values(item).map(array => array.buffer));
            self.postMessage({ id: data.id, result }, buffers);
        } catch (error) {
            self.postMessage({ id: data.id, error: error.message });
        }
    };
}
