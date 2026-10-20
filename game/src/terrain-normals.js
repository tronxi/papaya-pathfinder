function edgeIndices(segments) {
    const indices = [], stride = segments + 1;
    for (let i = 0; i <= segments; i++) indices.push(i, segments * stride + i);
    for (let row = 1; row < segments; row++) indices.push(row * stride, row * stride + segments);
    return indices;
}

// Use the same physical sampling distance on both sides of every tile edge,
// including edges shared by different mesh resolutions.
export function terrainEdgeNormals(tx, tz, segments, heightAt) {
    const indices = edgeIndices(segments), normals = new Float32Array(indices.length * 3);
    const step = 0.5;
    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        const x = tx * 50 + index % (segments + 1) / segments * 50;
        const z = tz * 50 + Math.floor(index / (segments + 1)) / segments * 50;
        const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
        const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
        const scale = 1 / Math.hypot(dx, 1, dz);
        normals.set([-dx * scale, scale, -dz * scale], i * 3);
    }
    return normals;
}

export function applyTerrainEdgeNormals(geometry, normals) {
    const indices = edgeIndices(geometry.parameters.widthSegments);
    const attribute = geometry.attributes.normal;
    for (let i = 0; i < indices.length; i++) attribute.setXYZ(indices[i], ...normals.subarray(i * 3, i * 3 + 3));
    attribute.needsUpdate = true;
}
