import * as THREE from 'three';
import { mobileGraphics } from './performance.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTerrainRenderLayers } from './terrain-render-layers.js';

export function createGraphics(renderer, scene, camera) {
    const terrain = createTerrainRenderLayers(renderer, scene, camera);
    if (mobileGraphics) {
        // Native antialiasing without HDR/GTAO buffers.
        let resolutionScale = 1;
        let baseRatio = 1;
        let duration = 0, frames = 0;
        return {
            setTerrainLayers: terrain.configure,
            renderSurface: terrain.renderDirect,
            resize(width, height) {
                baseRatio = Math.min(window.devicePixelRatio || 1, 2,
                    Math.sqrt(1500000 / Math.max(1, width * height)));
                renderer.setPixelRatio(baseRatio * resolutionScale);
                duration = 0; frames = 0;
            },
            render(delta) {
                terrain.renderDirect();
                if (document.hidden || delta <= 0) return;
                duration += delta; frames++;
                // Back off gradually on slower devices; avoid constant quality
                // changes or a sharp resolution drop after one expensive frame.
                if (duration >= 3) {
                    if (duration / frames > 1 / 28 && resolutionScale > 0.85) {
                        resolutionScale = Math.max(0.85, resolutionScale - 0.075);
                        renderer.setPixelRatio(baseRatio * resolutionScale);
                    }
                    duration = 0; frames = 0;
                }
            }
        };
    }
    const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: Math.min(2, renderer.capabilities.maxSamples)
    });
    const composer = new EffectComposer(renderer, target);
    const worldPass = new RenderPass(scene, camera);
    composer.addPass(worldPass);
    const contactShadows = new GTAOPass(scene, camera);
    contactShadows.blendIntensity = 0.35;
    contactShadows.updateGtaoMaterial({ radius: 0.55, thickness: 0.4,
        distanceFallOff: 1, samples: 6, screenSpaceRadius: false });
    contactShadows.updatePdMaterial({ radius: 4, rings: 2, samples: 4 });
    composer.addPass(contactShadows);
    composer.addPass(new OutputPass());
    return {
        setTerrainLayers(layers) {
            terrain.configure(layers);
            terrain.scenes.forEach((background, index) => {
                const pass = new RenderPass(background, camera);
                pass.clear = index === 0;
                pass.clearDepth = index > 0;
                composer.insertPass(pass, index);
            });
            worldPass.clear = false; worldPass.clearDepth = true;
        },
        renderSurface: terrain.renderDirect,
        resize(width, height) {
            // Bound Retina render cost without falling back to the phone profile.
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5,
                Math.sqrt(3000000 / Math.max(1, width * height)));
            renderer.setPixelRatio(ratio);
            composer.setPixelRatio(ratio);
            composer.setSize(width, height);
            // Contact detail at half resolution limits the cost of the extra geometry pass.
            contactShadows.setSize(Math.max(1, Math.round(width * ratio * 0.5)),
                Math.max(1, Math.round(height * ratio * 0.5)));
        },
        render(delta, groundDetail = true) {
            contactShadows.enabled = groundDetail;
            terrain.withBackgrounds(() => composer.render(delta));
        }
    };
}
