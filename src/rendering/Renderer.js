import { canvas2DOptions } from '../core/Constants.js?cb=158';
export default class Renderer {
    constructor(doc, targetCanvas, core = null) { 
        this.doc = doc; 
        this.targetCanvas = targetCanvas; 
        this.core = core;
        this.targetCtx = targetCanvas.getContext('2d', canvas2DOptions()); 
        this.targetCtx.imageSmoothingEnabled = false; 
        this.renderPending = false; 
        this._pendingRect = null;
        this._pendingFull = false;
        this._scratchLayerId = null;
        this._scratchLayerVer = -1;
        this._frameCache = new Map();
    }
    render(rect) { 
        if (!this.doc) return; 
        // No rect => full redraw. Partial requests are merged until the next frame.
        if (!rect) {
            this._pendingFull = true;
        } else if (!this._pendingFull) {
            const p = this._pendingRect;
            if (!p) {
                this._pendingRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
            } else {
                const nx = Math.min(p.x, rect.x), ny = Math.min(p.y, rect.y);
                const mx = Math.max(p.x + p.w, rect.x + rect.w), my = Math.max(p.y + p.h, rect.y + rect.h);
                p.x = nx; p.y = ny; p.w = mx - nx; p.h = my - ny;
            }
        }
        if (this.renderPending) return; 
        this.renderPending = true; 
        requestAnimationFrame(() => { 
            const full = this._pendingFull;
            const rect = this._pendingRect;
            this._pendingFull = false;
            this._pendingRect = null;
            this._doRender(full ? null : rect); 
            this.renderPending = false; 
        }); 
    }
    renderImmediate(rect = null) {
        if (!this.doc) return;
        this._pendingFull = false;
        this._pendingRect = null;
        this._doRender(rect);
    }
    _ensureScratch(w, h) {
        if (!this._scratchCanvas) {
            this._scratchCanvas = document.createElement('canvas');
            this._scratchCtx = this._scratchCanvas.getContext('2d', canvas2DOptions());
            this._scratchCtx.imageSmoothingEnabled = false;
            this._scratchLayerId = null;
            this._scratchLayerVer = -1;
        }
        if (this._scratchCanvas.width !== w || this._scratchCanvas.height !== h) {
            this._scratchCanvas.width = w;
            this._scratchCanvas.height = h;
            this._scratchCtx.imageSmoothingEnabled = false;
            this._scratchLayerId = null;
            this._scratchLayerVer = -1;
        }
    }
    _getScratch(w, h) {
        this._ensureScratch(w, h);
        this._scratchLayerId = null;
        this._scratchLayerVer = -1;
        return { canvas: this._scratchCanvas, ctx: this._scratchCtx };
    }
    getDehydratedLayerCanvas(layer) {
        if (!layer || !layer._buffer || !this.doc) return null;
        this._ensureScratch(this.doc.width, this.doc.height);
        if (this._scratchLayerId !== layer._id || this._scratchLayerVer !== layer._ver) {
            this._scratchCtx.putImageData(layer._buffer, 0, 0);
            this._scratchLayerId = layer._id;
            this._scratchLayerVer = layer._ver;
        }
        return this._scratchCanvas;
    }
    _getLayerToDraw(frameIndex, i) {
        const frame = this.doc.frames[frameIndex];
        if (!frame) return null;
        let layerToDraw = frame.layers[i];
        if (layerToDraw && layerToDraw.isDeleted) {
            let found = null;
            if (layerToDraw._cachedOriginIndex !== undefined) {
                const originLayer = this.doc.frames[layerToDraw._cachedOriginIndex]?.layers?.[i];
                if (originLayer && !originLayer.isDeleted && 
                    (layerToDraw._cachedOriginIndex + (originLayer.holdCount || 1) > frameIndex)) {
                    found = originLayer;
                }
            }
            if (!found) {
                for (let k = frameIndex - 1; k >= 0; k--) {
                    const prevLayer = this.doc.frames[k]?.layers?.[i];
                    if (prevLayer && !prevLayer.isDeleted) {
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
    }
    _resolveFrameInfo(frameIndex) {
        const frame = this.doc && this.doc.frames[frameIndex];
        if (!frame) return { key: '', hasDehydrated: false };
        let key = `${this.doc.width}x${this.doc.height}`;
        let hasDehydrated = false;
        for (let i = frame.layers.length - 1; i >= 0; i--) {
            const l = this._getLayerToDraw(frameIndex, i);
            if (l && l.visible && !l.isDeleted && l.hasContent) {
                key += `|${l._id}:${l._ver}:${l.opacity}`;
                if (l.isDehydrated) hasDehydrated = true;
            }
        }
        return { key, hasDehydrated };
    }
    _compositeFrameToCtx(ctx, frameIndex, rect = null) {
        const frame = this.doc.frames[frameIndex];
        if (!frame) return;
        for (let i = frame.layers.length - 1; i >= 0; i--) {
            const layerToDraw = this._getLayerToDraw(frameIndex, i);
            if (layerToDraw && layerToDraw.visible && !layerToDraw.isDeleted && layerToDraw.hasContent) {
                ctx.globalAlpha = layerToDraw.opacity;
                const src = layerToDraw._canvas || (layerToDraw.isDehydrated ? this.getDehydratedLayerCanvas(layerToDraw) : null);
                if (src) {
                    if (rect) ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
                    else ctx.drawImage(src, 0, 0);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }
    _getOrRenderCachedFrame(frameIndex, info = null) {
        if (!this.doc) return null;
        const { key, hasDehydrated } = info || this._resolveFrameInfo(frameIndex);
        if (!key) return null;
        const w = this.doc.width, h = this.doc.height;
        const existing = this._frameCache.get(frameIndex);
        if (existing && existing.key === key && existing.canvas.width === w && existing.canvas.height === h) {
            this._frameCache.delete(frameIndex);
            this._frameCache.set(frameIndex, existing);
            return existing.canvas;
        }
        if (!hasDehydrated) return null;

        const maxEntries = Math.min(20, Math.max(8, Math.floor(20000000 / Math.max(1, w * h))));
        let entry = existing;
        if (!entry) {
            if (this._frameCache.size >= maxEntries) {
                const oldestKey = this._frameCache.keys().next().value;
                entry = this._frameCache.get(oldestKey);
                this._frameCache.delete(oldestKey);
            } else {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', canvas2DOptions());
                ctx.imageSmoothingEnabled = false;
                entry = { canvas, ctx, key: '' };
            }
        } else {
            this._frameCache.delete(frameIndex);
        }

        if (entry.canvas.width !== w || entry.canvas.height !== h) {
            entry.canvas.width = w;
            entry.canvas.height = h;
            entry.ctx.imageSmoothingEnabled = false;
        } else {
            entry.ctx.clearRect(0, 0, w, h);
        }
        this._compositeFrameToCtx(entry.ctx, frameIndex, null);
        entry.key = key;
        this._frameCache.set(frameIndex, entry);
        return entry.canvas;
    }
    warmFrame(frameIndex) {
        if (!this.doc || frameIndex < 0 || frameIndex >= this.doc.frames.length) return;
        this._getOrRenderCachedFrame(frameIndex);
    }
    clearFrameCache() {
        for (const entry of this._frameCache.values()) {
            if (entry.canvas) {
                entry.canvas.width = 0;
                entry.canvas.height = 0;
            }
        }
        this._frameCache.clear();
    }
    _doRender(rect) {
        if (this.targetCanvas.width !== this.doc.width) { this.targetCanvas.width = this.doc.width; rect = null; }
        if (this.targetCanvas.height !== this.doc.height) { this.targetCanvas.height = this.doc.height; rect = null; }
        
        const isSmoothing = !!(this.doc && (Math.max(this.doc.width, this.doc.height) >= 720) && (this.core && this.core.state ? this.core.state.subpixelSmoothing : false));
        if (this.targetCtx.imageSmoothingEnabled !== isSmoothing) {
            this.targetCtx.imageSmoothingEnabled = isSmoothing;
        }

        if (rect) this.targetCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
        else this.targetCtx.clearRect(0, 0, this.targetCanvas.width, this.targetCanvas.height);
        const frameIndex = this.doc.currentFrameIndex;
        const frame = this.doc.frames[frameIndex]; 
        if (!frame) return;

        const isFastPath = !rect && this.core && ((this.core.playback && this.core.playback.isPlaying) || (this.core.state && this.core.state.isScrubbing));
        if (isFastPath) {
            const cachedCanvas = this._getOrRenderCachedFrame(frameIndex);
            if (cachedCanvas) {
                this.targetCtx.drawImage(cachedCanvas, 0, 0);
                return;
            }
        }
        
        this._compositeFrameToCtx(this.targetCtx, frameIndex, rect);
    }
    destroy() {
        this.clearFrameCache();
        if (this._scratchCanvas) {
            this._scratchCanvas.width = 0;
            this._scratchCanvas.height = 0;
            this._scratchCanvas = null;
            this._scratchCtx = null;
            this._scratchLayerId = null;
            this._scratchLayerVer = -1;
        }
    }
}
