import { canvas2DOptions } from '../core/Constants.js?cb=171';

export default class PlaybackController {
    constructor(core) { 
        this.core = core; 
        this.isPlaying = false; 
        this.playInterval = null; 
        this.onionSkinEnabled = false; 
        this.fps = 12;
        this.loopMode = 'on'; // 'on', 'off', 'pingpong'
        this.playDirection = 1;
        this.onionFramesBefore = 1;
        this.onionFramesAfter = 1;
        this.currentHoldTick = 0;
        
        this.core.events.on('updateOnionSkin', () => this.updateOnionSkin()); 
    }
    togglePlay() {
        if (!this.core.doc || this.core.state.isSpriteSheetView) return;
        this.isPlaying = !this.isPlaying; 
        this.core.events.emit('ui:playbackChanged', this.isPlaying);
        
        if (this.isPlaying) {
            this.core.onionCanvas.style.display = 'none'; 
            this.playDirection = 1;
            this.currentHoldTick = 0;
            
            this._startPlaybackLoop();
        } else { 
            this._stopPlaybackLoop();
            if (this.core.renderer && typeof this.core.renderer.clearFrameCache === 'function') {
                this.core.renderer.clearFrameCache();
            }
            if (this.core.doc && typeof this.core.doc.virtualizeFrames === 'function') {
                this.core.doc.virtualizeFrames(this.onionFramesBefore, this.onionFramesAfter);
            }
            this.core.events.emit('frameChanged'); 
            this.core.events.emit('layerChanged'); 
            this.updateOnionSkin(); 
            if (this.core.renderer) this.core.renderer.render();
        }
    }
    _computeNextStep(curIdx, dir) {
        const len = this.core.doc ? this.core.doc.frames.length : 0;
        if (len <= 0) return { nextIndex: null, nextDir: dir };
        let nextIndex = curIdx + dir;
        let nextDir = dir;

        if (this.loopMode === 'on') {
            nextIndex = (nextIndex + len) % len;
        } else if (this.loopMode === 'pingpong') {
            if (nextIndex >= len) {
                nextDir = -1;
                nextIndex = len - 2;
                if (nextIndex < 0) nextIndex = 0;
            } else if (nextIndex < 0) {
                nextDir = 1;
                nextIndex = 1;
                if (nextIndex >= len) nextIndex = 0;
            }
        } else if (this.loopMode === 'off') {
            if (nextIndex >= len) {
                return { nextIndex: null, nextDir: dir };
            }
        }
        return { nextIndex, nextDir };
    }
    _startPlaybackLoop() {
        this._stopPlaybackLoop();
        let lastTime = performance.now();
        let accumulator = 0;

        const loop = (now) => {
            if (!this.isPlaying) return;
            const frameDuration = 1000 / this.fps;
            const delta = Math.min(250, now - lastTime);
            lastTime = now;
            accumulator += delta;

            if (accumulator >= frameDuration) {
                accumulator %= frameDuration;

                const { nextIndex, nextDir } = this._computeNextStep(this.core.doc.currentFrameIndex, this.playDirection);
                if (nextIndex === null) {
                    this.togglePlay();
                    return;
                }
                this.playDirection = nextDir;
                this.core.switchFrame(nextIndex);
            } else if (this.core.renderer && typeof this.core.renderer.warmFrame === 'function') {
                const { nextIndex } = this._computeNextStep(this.core.doc.currentFrameIndex, this.playDirection);
                if (nextIndex !== null) {
                    this.core.renderer.warmFrame(nextIndex);
                }
            }

            this.playRaf = requestAnimationFrame(loop);
        };
        this.playRaf = requestAnimationFrame(loop);
    }
    _stopPlaybackLoop() {
        if (this.playRaf) {
            cancelAnimationFrame(this.playRaf);
            this.playRaf = null;
        }
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }
    setFPS(fps) {
        this.fps = Math.max(1, Math.min(30, fps));
        if (this.isPlaying) {
            this._startPlaybackLoop();
        }
    }
    setLoopMode(mode) {
        this.loopMode = mode;
    }
    toggleOnionSkin() {
        this.onionSkinEnabled = !this.onionSkinEnabled; 
        this.core.events.emit('ui:onionSkinToggled', this.onionSkinEnabled);
        this.core.onionCanvas.style.display = (this.onionSkinEnabled && !this.core.state.isSpriteSheetView) ? 'block' : 'none';
        this.updateOnionSkin();
    }
    // Coalesced: several callers in one user action (switchFrame, frameChanged, saveState...) used to each redraw the whole onion layer.
    updateOnionSkin() {
        if (!this.onionSkinEnabled || this.isPlaying || this.core.state.isSpriteSheetView || this.core.state.isScrubbing) {
            if (this.core.onionCanvas) this.core.onionCanvas.style.display = 'none';
            return;
        }
        if (this._onionUpdateQueued) return;
        this._onionUpdateQueued = true;
        queueMicrotask(() => {
            this._onionUpdateQueued = false;
            this._updateOnionSkinNow();
        });
    }
    _updateOnionSkinNow() {
        if (!this.core.doc || !this.onionSkinEnabled || this.core.state.isSpriteSheetView || this.isPlaying || this.core.state.isScrubbing) { 
            this.core.onionCanvas.style.display = 'none'; 
            return; 
        }
        
        // If there are no frames to show, hide the canvas (unless we are just on frame 0 and have framesAfter)
        const curIdx = this.core.doc.currentFrameIndex;
        if (this.onionFramesBefore === 0 && this.onionFramesAfter === 0) {
             this.core.onionCanvas.style.display = 'none'; 
             return;
        }

        this.core.onionCanvas.style.display = 'block';
        if (this.core.onionCanvas.width !== this.core.doc.width) this.core.onionCanvas.width = this.core.doc.width; 
        if (this.core.onionCanvas.height !== this.core.doc.height) this.core.onionCanvas.height = this.core.doc.height;
        
        this.core.onionCtx.clearRect(0, 0, this.core.onionCanvas.width, this.core.onionCanvas.height); 
        this.core.onionCtx.imageSmoothingEnabled = false;
        
        const frames = this.core.doc.frames;

        // Draw frames before (older frames) -> draw them first so they are under, or maybe it doesn't matter much.
        // Actually, the prompt doesn't specify z-order, but let's draw them.
        for (let i = this.onionFramesBefore; i >= 1; i--) {
            let fIdx = curIdx - i;
            if (fIdx < 0) continue;
            let alpha = Math.max(0, 1.0 - 0.15 * (i - 1));
            this._drawFrameToOnion(fIdx, alpha, '#ff0000');
        }

        for (let i = this.onionFramesAfter; i >= 1; i--) {
            let fIdx = curIdx + i;
            if (fIdx >= frames.length) continue;
            let alpha = Math.max(0, 1.0 - 0.15 * (i - 1));
            this._drawFrameToOnion(fIdx, alpha, '#00ff00');
        }
    }
    
    _getOnionTemp(key, w, h) {
        let t = this[key];
        if (!t) {
            const canvas = document.createElement('canvas');
            t = this[key] = { canvas, ctx: canvas.getContext('2d', canvas2DOptions()) };
        }
        if (t.canvas.width !== w || t.canvas.height !== h) {
            t.canvas.width = w; t.canvas.height = h;
        } else {
            t.ctx.setTransform(1, 0, 0, 1, 0, 0);
            t.ctx.globalCompositeOperation = 'source-over';
            t.ctx.globalAlpha = 1.0;
            t.ctx.clearRect(0, 0, w, h);
        }
        t.ctx.globalCompositeOperation = 'source-over';
        t.ctx.globalAlpha = 1.0;
        return t;
    }
    
    _drawFrameToOnion(frameIndex, baseAlpha, tint = null) {
        const frame = this.core.doc.frames[frameIndex];
        if (!frame) return;
        
        const getLayerToDraw = (i) => {
            let layerToDraw = frame.layers[i];
            if (layerToDraw.isDeleted) {
                let found = null;
                if (layerToDraw._cachedOriginIndex !== undefined) {
                    const originLayer = this.core.doc.frames[layerToDraw._cachedOriginIndex].layers[i];
                    if (originLayer && !originLayer.isDeleted && 
                        (layerToDraw._cachedOriginIndex + (originLayer.holdCount || 1) > frameIndex)) {
                        found = originLayer;
                    }
                }

                if (!found) {
                    for (let k = frameIndex - 1; k >= 0; k--) {
                        const prevLayer = this.core.doc.frames[k].layers[i];
                        if (!prevLayer.isDeleted) {
                            if (k + (prevLayer.holdCount || 1) > frameIndex) {
                                found = prevLayer;
                                layerToDraw._cachedOriginIndex = k;
                            }
                            break;
                        }
                    }
                }
                if (found) {
                    layerToDraw = found;
                }
            }
            return layerToDraw;
        };
        
        if (!tint) {
            for (let i = frame.layers.length - 1; i >= 0; i--) {
                const l = getLayerToDraw(i);
                if (l && l.visible && !l.isDeleted && l.hasContent) { 
                    const src = l._canvas || (l.isDehydrated && this.core.renderer ? this.core.renderer.getDehydratedLayerCanvas(l) : l.canvas);
                    if (src) {
                        this.core.onionCtx.globalAlpha = l.opacity * baseAlpha; 
                        this.core.onionCtx.drawImage(src, 0, 0); 
                    }
                } 
            }
        } else {
            // Reused scratch canvases (previously 2 new full-size canvases were allocated per onion frame per update).
            const w = this.core.doc.width, h = this.core.doc.height;
            const tmp = this._getOnionTemp('_onionTmpA', w, h);
            const tempCanvas = tmp.canvas;
            const tCtx = tmp.ctx;
            
            for (let i = frame.layers.length - 1; i >= 0; i--) {
                const l = getLayerToDraw(i);
                if (l && l.visible && !l.isDeleted && l.hasContent) { 
                    const src = l._canvas || (l.isDehydrated && this.core.renderer ? this.core.renderer.getDehydratedLayerCanvas(l) : l.canvas);
                    if (src) {
                        tCtx.globalAlpha = l.opacity; 
                        tCtx.drawImage(src, 0, 0); 
                    }
                } 
            }
            
            const tint2 = this._getOnionTemp('_onionTmpB', w, h);
            const tintCanvas = tint2.canvas;
            const tintCtx = tint2.ctx;
            
            tintCtx.fillStyle = tint;
            tintCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
            
            tintCtx.globalCompositeOperation = 'destination-in';
            tintCtx.drawImage(tempCanvas, 0, 0);
            
            tCtx.globalCompositeOperation = 'multiply';
            tCtx.drawImage(tintCanvas, 0, 0);
            
            this.core.onionCtx.globalAlpha = baseAlpha;
            this.core.onionCtx.drawImage(tempCanvas, 0, 0);
        }
        this.core.onionCtx.globalAlpha = 1.0; 
    }
}
