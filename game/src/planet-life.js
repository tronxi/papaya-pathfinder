import * as THREE from 'three';
import { createSurfaceTransition } from './surface-transition.js';

// Cube-face cells give every rock and outpost a permanent planetary address.
// Their coordinates survive unloading, frame transport, poles and the date line.
export function createPlanetLife({ planet, scene, world, physics, rockShapes, rockMaterial, mobile = false }) {
    const cells = new Map(), size = 256, radius = planet.radius;
    const colliderHandles = new Set();
    const root = new THREE.Group(); root.name = 'planet-expedition-sectors';
    root.matrixAutoUpdate = false; scene.add(root);
    const frame = new THREE.Matrix4(), previousFrame = new THREE.Matrix4();
    const global = new THREE.Vector3(), normal = new THREE.Vector3(), local = new THREE.Vector3();
    const predicted = new THREE.Vector3(), flightDirection = new THREE.Vector3();
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), spin = new THREE.Quaternion();
    const scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const visited = new Set();
    try { for (const id of JSON.parse(localStorage.getItem('papaya-planet-discoveries-v1') || '[]')) if (typeof id === 'string') visited.add(id); } catch { /* Optional storage. */ }
    const white = new THREE.MeshStandardMaterial({color:0xdad3c3,roughness:.85});
    const dark = new THREE.MeshStandardMaterial({color:0x333a43,roughness:.7,metalness:.25});
    const hardwareShapes = [new THREE.CylinderGeometry(.65,.9,.5,8),new THREE.BoxGeometry(2,.06,1),
        new THREE.CylinderGeometry(.045,.045,2.6,6),new THREE.BoxGeometry(.5,.3,.3)];
    let scan = 0, target = null, lastNext = false, focusedId = null;
    function randomGenerator(face, x, z) {
        let seed = (Math.imul(face + 1, 73856093) ^ Math.imul(x, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
        return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    }
    function direction(face, u, v, result) {
        const sign = face % 2 ? -1 : 1;
        if (face < 2) result.set(sign, u, v);
        else if (face < 4) result.set(u, sign, v);
        else result.set(u, v, sign);
        return result.normalize();
    }
    function surfacePosition(face, u, v, result) {
        direction(face, u / radius, v / radius, result);
        return result.multiplyScalar(radius + planet.elevation(result));
    }
    function build(face, x, z) {
        const random = randomGenerator(face, x, z), group = new THREE.Group();root.add(group);
        const colliders = [], objects = [];
        const center = surfacePosition(face,(x+.5)*size,(z+.5)*size,new THREE.Vector3());
        const region = planet.surface(center.clone().normalize()).region;
        const count = Math.round((420 + region.rocks * 6) * (mobile ? .65 : 1));
        const meshes = rockShapes.map(shape => {
            const mesh = new THREE.InstancedMesh(shape, rockMaterial, count);mesh.count = 0;
            mesh.castShadow = true;mesh.receiveShadow = true;group.add(mesh);return mesh;
        });
        for (let i=0;i<count;i++) {
            const position = surfacePosition(face,(x+random())*size,(z+random())*size,new THREE.Vector3());
            if (planet.homeDistance(planet.toLocal(position,local)) < 340) continue;
            if (position.distanceTo(center) < 6) continue;
            normal.copy(position).normalize();
            const height = .12 + Math.pow(random(),3)*1.3;
            const angle = random()*Math.PI*2;
            rotation.setFromUnitVectors(up,normal).multiply(spin.setFromAxisAngle(up,angle));
            scale.set(height*(1+random()),height*.7,height*(.8+random()));
            position.addScaledVector(normal,height*.25);
            const variant = Math.floor(random()*meshes.length), mesh=meshes[variant];
            matrix.compose(position,rotation,scale);mesh.setMatrixAt(mesh.count++,matrix);
            mesh.setColorAt(mesh.count-1,new THREE.Color(region.color).multiplyScalar(.55+random()*.25));
            objects.push({position,rotation:rotation.clone(),scale:scale.clone(),shape:rockShapes[variant]});
        }
        for(const mesh of meshes) {mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
        let site = null;
        // A regular sparse schedule guarantees destinations without a global list.
        if (((x % 3 + 3) % 3) === 1 && ((z % 3 + 3) % 3) === 1 &&
            planet.homeDistance(planet.toLocal(center,local)) > 450) {
            const id=`${face}:${x}:${z}`, type=Math.floor(random()*3);
            site={id,position:center.clone(),name:['Sonda abandonada','Estación geológica','Baliza de expedición'][type],region:region.name};
            normal.copy(center).normalize();rotation.setFromUnitVectors(up,normal);
            const station=new THREE.Group();station.position.copy(center);station.quaternion.copy(rotation);group.add(station);
            const parts = type === 0 ? [[0,0,.25,0],[1,1.1,.3,0],[1,-1.1,.3,0],[2,0,1.6,0]]
                : type === 1 ? [[0,0,.25,0],[1,1.1,.6,0],[2,0,1.6,0],[3,0,2.8,0],[3,.7,.4,.7],[3,-.7,.4,-.7]]
                : [[0,0,.25,0],[2,0,1.6,0],[3,0,2.8,0]];
            for(const [shape,x,y,z]of parts) {
                const geometry=hardwareShapes[shape],mesh=new THREE.Mesh(geometry,shape===1?dark:white);
                mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;station.add(mesh);
                const position=new THREE.Vector3(x,y,z).applyQuaternion(rotation).add(center);
                objects.push({position,rotation:rotation.clone(),scale:new THREE.Vector3(1,1,1),shape:geometry});
            }
        }
        const fade=createSurfaceTransition(group,'lifeCoverage');fade(0);
        const fadeMaterials=new Set();group.traverse(mesh=>{if(mesh.isMesh)fadeMaterials.add(mesh.material);});
        return {group,center,objects,colliders,site,fade,fadeMaterials,coverage:0};
    }
    function clearCollisions(cell) {
        for(const object of cell.objects) if(object.collider) {
            colliderHandles.delete(object.collider.handle);world.removeCollider(object.collider,false);object.collider=null;
        }
        cell.colliders.length=0;
    }
    function remove(id,cell) {clearCollisions(cell);root.remove(cell.group);cell.group.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});for(const mat of cell.fadeMaterials)mat.dispose();cells.delete(id);}
    function collisions(cell, enabled, changed) {
        if(changed||!enabled)clearCollisions(cell);
        if(!enabled)return;
        planet.globalToLocalMatrix(frame);
        const frameRotation=new THREE.Quaternion().setFromRotationMatrix(frame);
        for(const object of cell.objects) {
            const distance=object.position.distanceToSquared(global);
            if(object.collider && distance>120*120) {
                colliderHandles.delete(object.collider.handle);world.removeCollider(object.collider,false);object.collider=null;
            }
            if(object.collider || distance>100*100)continue;
            const vertices=object.shape.attributes.position,points=new Float32Array(vertices.count*3);
            for(let i=0;i<vertices.count;i++){points[i*3]=vertices.getX(i)*object.scale.x;points[i*3+1]=vertices.getY(i)*object.scale.y;points[i*3+2]=vertices.getZ(i)*object.scale.z;}
            const desc=physics.ColliderDesc.convexHull(points);if(!desc)continue;
            local.copy(object.position).applyMatrix4(frame);
            rotation.copy(frameRotation).multiply(object.rotation);
            desc.setTranslation(local.x,local.y,local.z).setRotation(rotation).setFriction(2).setRestitution(0);
            object.collider=world.createCollider(desc);colliderHandles.add(object.collider.handle);
        }
    }
    return {
        update(delta, rover, speed, input) {
            if(!rover)return;
            planet.toGlobal(rover.position,global);normal.copy(global).normalize();
            const clearance=global.length()-radius-planet.elevation(normal);
            planet.surfaceMatrix(rockMaterial.userData.marsFrame);
            planet.globalToLocalMatrix(frame);const changed=!frame.equals(previousFrame);previousFrame.copy(frame);
            root.matrix.copy(frame);root.matrixWorldNeedsUpdate=true;
            const lead=THREE.MathUtils.clamp(Math.abs(speed)*.65,0,mobile?400:800);
            flightDirection.set(0,0,-Math.sign(speed)).applyQuaternion(rover.quaternion);
            planet.directionToGlobal(flightDirection,flightDirection);
            predicted.copy(global).addScaledVector(flightDirection,lead).normalize().multiplyScalar(radius+planet.elevation(normal));
            const wanted=new Map();
            if(clearance<2200)for(const anchor of [global,predicted])for(let face=0;face<6;face++) {
                const anchorNormal=anchor.clone().normalize();
                const axis=face<2?anchorNormal.x:face<4?anchorNormal.y:anchorNormal.z;
                const sign=face%2?-1:1;if(axis*sign<.5)continue;
                const divisor=Math.abs(axis);
                const u=(face<2?anchorNormal.y:anchorNormal.x)/divisor*radius;
                const v=(face<4?anchorNormal.z:anchorNormal.y)/divisor*radius;
                const cx=Math.floor(u/size),cz=Math.floor(v/size);
                const reach=anchor===predicted?1:mobile?2:3;
                for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++) {
                    const x=cx+dx,z=cz+dz;
                    if(Math.abs((x+.5)*size)>radius+size*.5||Math.abs((z+.5)*size)>radius+size*.5)continue;
                    const id=`${face}:${x}:${z}`;wanted.set(id,{face,x,z});
                }
            }
            // Build at most one sector per frame; the globe covers pending cells.
            const pending = [...wanted].filter(([id]) => !cells.has(id));
            pending.sort((a,b) => {
                surfacePosition(a[1].face,(a[1].x+.5)*size,(a[1].z+.5)*size,local);
                const currentA=local.distanceToSquared(global);
                const distanceA=currentA<150*150?currentA-1e8:Math.min(currentA,local.distanceToSquared(predicted)+lead*lead*.1);
                surfacePosition(b[1].face,(b[1].x+.5)*size,(b[1].z+.5)*size,local);
                const currentB=local.distanceToSquared(global);
                const distanceB=currentB<150*150?currentB-1e8:Math.min(currentB,local.distanceToSquared(predicted)+lead*lead*.1);
                return distanceA-distanceB;
            });
            const deadline=performance.now()+(mobile?2:4);
            let built=0;
            while(pending.length&&built<(mobile?1:3)&&performance.now()<deadline) {
                const [id,key]=pending.shift();cells.set(id,build(key.face,key.x,key.z));built++;
            }
            const candidates=[];
            for(const [id,cell]of cells) {
                const distance=cell.center.distanceTo(global);
                const desired=wanted.has(id)?(1-THREE.MathUtils.smoothstep(distance,mobile?450:650,mobile?1000:1400))*(1-THREE.MathUtils.smoothstep(clearance,900,2100)):0;
                cell.coverage+=(desired-cell.coverage)*(1-Math.exp(-3*delta));cell.fade(cell.coverage);cell.group.visible=cell.coverage>.005;
                collisions(cell,wanted.has(id)&&clearance<70&&distance<400,changed);
                if(!wanted.has(id)&&cell.coverage<.005){remove(id,cell);continue;}
                if(cell.site)candidates.push({...cell.site,distance:cell.site.position.distanceTo(global),visited:visited.has(cell.site.id)});
            }
            candidates.sort((a,b)=>a.distance-b.distance);
            const next=input.has('KeyN');
            if(next&&!lastNext&&candidates.length) {
                const index=candidates.findIndex(site=>site.id===(focusedId??target?.id));
                focusedId=candidates[(index+1)%candidates.length].id;
            }
            lastNext=next;
            const selected=candidates.find(site=>site.id===focusedId);
            target=selected??candidates[0]??null;
            if(!selected)focusedId=null;
            normal.copy(global).normalize();
            if(target&&!target.visited&&target.distance<7&&Math.abs(speed)<.5&&input.has('KeyE'))scan=Math.min(1,scan+delta/2.5);else scan=0;
            if(scan>=1){visited.add(target.id);target.visited=true;scan=0;try{localStorage.setItem('papaya-planet-discoveries-v1',JSON.stringify([...visited]));}catch{/* Optional storage. */}}
        },
        preview(position) {
            // The inspection view streams scenery without moving the player
            // or triggering discoveries and input actions.
            this.update(1/60,{position,quaternion:new THREE.Quaternion()},0,{has:()=>false});
        },
        info() {return {region:planet.surface(normal).region.name,target,scan,discoveries:visited.size,sectors:cells.size};},
        ownsCollider(handle) {return colliderHandles.has(handle);}
    };
}
