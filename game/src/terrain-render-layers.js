import * as THREE from 'three';

// Each surface needs depth for its own hills, but its approximate depth must
// not hide a finer surface or a vehicle in the next layer. Preserve color and
// clear only depth between layers.
export function createTerrainRenderLayers(renderer, world, camera) {
    const scenes = [];
    const lights = [];
    function configure({ sky, globe, previousPatch, patch, stars }) {
        if (scenes.length) return;
        for (const objects of [[sky, globe, stars], [previousPatch], [patch]]) {
            const scene = new THREE.Scene();
            scene.fog = world.fog;
            for (const object of objects) if (object) scene.add(object);
            for (const source of world.children.filter(object => object.isLight)) {
                const light = source.clone(); light.castShadow = false;
                scene.add(light);
                if (light.target) scene.add(light.target);
                lights.push({ source, light });
            }
            scenes.push(scene);
        }
    }
    function withBackgrounds(draw) {
        if (!scenes.length) return draw();
        const background = world.background;
        scenes[0].background = background; world.background = null;
        for (const scene of scenes) scene.fog = world.fog;
        for (const { source, light } of lights) {
            source.getWorldPosition(light.position);
            source.getWorldQuaternion(light.quaternion);
            light.color.copy(source.color); light.intensity = source.intensity;
            if (light.target && source.target) source.target.getWorldPosition(light.target.position);
        }
        try { return draw(); }
        finally { world.background = background; }
    }
    function renderDirect(viewCamera = camera) {
        const autoClear = renderer.autoClear;
        try {
            withBackgrounds(() => {
                renderer.autoClear = false;
                renderer.clear();
                for (const scene of scenes) {
                    renderer.clearDepth(); renderer.render(scene, viewCamera);
                }
                renderer.clearDepth(); renderer.render(world, viewCamera);
            });
        } finally { renderer.autoClear = autoClear; }
    }
    return { scenes, configure, withBackgrounds, renderDirect };
}
