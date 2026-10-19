import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// A cube sphere avoids the skinny triangles and pinched lighting at UV poles.
// Weld face borders before calculating normals so cube edges remain invisible.
export function createPlanetGlobeGeometry(planet, mobile = false, inset = 0) {
    const segments=mobile?96:160;
    const cube=new THREE.BoxGeometry(1,1,1,segments,segments,segments);
    const positions=cube.attributes.position,normal=new THREE.Vector3();
    for(let i=0;i<positions.count;i++) {
        normal.fromBufferAttribute(positions,i).normalize();
        const distance=planet.radius+planet.elevation(normal,false)-inset;
        positions.setXYZ(i,normal.x*distance,normal.y*distance,normal.z*distance);
    }
    cube.deleteAttribute('normal');cube.deleteAttribute('uv');
    const geometry=mergeVertices(cube);cube.dispose();
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    return geometry;
}
