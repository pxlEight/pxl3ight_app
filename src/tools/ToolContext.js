import { CONSTANTS } from '../core/Constants.js?cb=202';

export default class ToolContext {
    constructor(core) {
        this.core = core;
        this._hasScratchClip = false;
    }
    
    get isSpriteSheetView() { return this.core.state.isSpriteSheetView; }
    get activeCanvas() { return this.isSpriteSheetView ? this.core.spriteSheetViewCanvas : (this.core.doc ? this.core.doc.activeLayer.canvas : null); }
    get activeCtx() { return this.isSpriteSheetView ? this.core.spriteSheetCtx : (this.core.doc ? this.core.doc.activeCtx : null); }
    get scratchCanvas() { return this.core.scratchCanvas; }
    get scratchCtx() { return this.core.scratchCtx; }
    get canvasWidth() { return this.core.bgCanvas ? this.core.bgCanvas.width : 0; }
    get canvasHeight() { return this.core.bgCanvas ? this.core.bgCanvas.height : 0; }
    
    get color() { return this.core.palette.currentColor; }
    get opacity() { return this.core.state.tool.opacity; }
    get toolId() { return this.core.state.tool.current; }
    get shape() { return this.core.state.tool.shape; }
    get activeToolCategory() {
        if (this.core.state && typeof this.core.state.getActiveToolCategory === 'function') {
            return this.core.state.getActiveToolCategory(this.toolId);
        }
        if (this.toolId === CONSTANTS.TOOLS.ERASER) return CONSTANTS.TOOLS.ERASER;
        if ([CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE, CONSTANTS.TOOLS.SHAPE].includes(this.toolId)) {
            return CONSTANTS.TOOLS.SHAPE;
        }
        return CONSTANTS.TOOLS.PENCIL;
    }

    get brushShape() {
        const cat = this.activeToolCategory;
        if (this.core.state.brushShapes && this.core.state.brushShapes[cat]) {
            return this.core.state.brushShapes[cat];
        }
        return this.core.state.tool.brushShape || CONSTANTS.BRUSH_SHAPE.SQUARE;
    }
    get smooth() { return this.core.state.tool.smooth; }
    get velocity() { return this.core.state.tool.velocity || 0; }
    get isSubpixelSmoothing() { 
        return !!this.core.state.subpixelSmoothing && (Math.max(this.canvasWidth, this.canvasHeight) >= 720); 
    }
    get fillTolerance() {
        if (this.core.state.fillTolerance !== undefined) {
            return this.core.state.fillTolerance;
        }
        const isHighRes = (Math.max(this.canvasWidth, this.canvasHeight) >= 720) || this.isSubpixelSmoothing;
        return isHighRes ? 64 : 0;
    }
    get soft() { 
        const cat = this.activeToolCategory;
        if (this.core.state.softness && this.core.state.softness[cat] !== undefined) {
            return this.core.state.softness[cat];
        }
        return this.core.state.tool.soft || 0; 
    }

    _hexToRgba(colorStr, alpha) {
        if (!colorStr || colorStr === 'none') return `rgba(0, 0, 0, ${alpha})`;
        if (colorStr.startsWith('rgba')) {
            return colorStr.replace(/[\d\.]+\)$/, `${alpha})`);
        }
        if (colorStr.startsWith('rgb')) {
            return colorStr.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        }
        let h = colorStr.replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const num = parseInt(h, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    _erf(x) {
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }

    _erfc(x) {
        return 1.0 - this._erf(x);
    }

    _computeGaussianAlpha(dist, R, sigma, isRound = true) {
        if (sigma <= 0.001) return dist <= R ? 1.0 : 0.0;
        const invSqrt2Sigma = 1.0 / (Math.SQRT2 * sigma);
        if (isRound && sigma / Math.max(0.001, R) >= 0.1) {
            // Exact radial profile of a disc (radius R) convolved with a 2D Gaussian (sigma),
            // i.e. what CSS blur() produces for the preview.
            const k = sigma / R;
            const n = Math.max(24, Math.ceil(8 / k));
            const h = R / n;
            const inv2s2 = 1.0 / (2.0 * sigma * sigma);
            const invS2 = 1.0 / (sigma * sigma);
            let sum = 0;
            for (let i = 0; i <= n; i++) {
                const rho = i * h;
                const d = dist - rho;
                const w = (i === 0 || i === n) ? 0.5 : 1.0;
                sum += w * rho * Math.exp(-d * d * inv2s2) * this._besselI0e(dist * rho * invS2);
            }
            return Math.max(0.0, Math.min(1.0, sum * h * invS2));
        }
        if (isRound) {
            const k = sigma / Math.max(0.001, R);
            const A0 = 1.0 - Math.exp(-0.5 / (k * k));
            const shift = 0.25 * sigma * k;
            const z0 = (0 - (R - shift)) * invSqrt2Sigma;
            const pred0 = 0.5 * this._erfc(z0);
            if (pred0 <= 0.0001) return 0.0;
            const z = (dist - (R - shift)) * invSqrt2Sigma;
            const val = (0.5 * this._erfc(z)) * (A0 / pred0);
            return Math.max(0.0, Math.min(1.0, val));
        } else {
            const z1 = (dist + R) * invSqrt2Sigma;
            const z2 = (dist - R) * invSqrt2Sigma;
            const val = 0.5 * (this._erf(z1) - this._erf(z2));
            return Math.max(0.0, Math.min(1.0, val));
        }
    }

    // exp(-x) * I0(x) for x >= 0 (Abramowitz & Stegun polynomial approximations)
    _besselI0e(x) {
        if (x < 3.75) {
            const t = x / 3.75, t2 = t * t;
            const i0 = 1 + t2 * (3.5156229 + t2 * (3.0899424 + t2 * (1.2067492 + t2 * (0.2659732 + t2 * (0.0360768 + t2 * 0.0045813)))));
            return i0 * Math.exp(-x);
        }
        const t = 3.75 / x;
        return (0.39894228 + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) / Math.sqrt(x);
    }

    /**
     * Fast soft-brush renderer. A soft stroke's alpha at a pixel is A(distance to the stroke path),
     * so one pass per segment over its bounding box (no per-stamp loops, no per-pixel fillRect)
     * and one putImageData for the touched rectangle. Used for taps and line segments alike,
     * so single taps and long strokes share the exact same profile.
     */
    drawSoftSegmentToScratch(x0, y0, x1, y1, size, snapToPixelCenter) {
        const soft = this.soft;
        if (soft <= 0) return;
        const scale = this._softScale || 1;
        const isDownscaled = (scale > 1);

        const cw = isDownscaled ? this._downW : this.canvasWidth;
        const ch = isDownscaled ? this._downH : this.canvasHeight;
        const buf = isDownscaled ? this._downAlphaBuffer : this._strokeAlphaBuffer;
        if (!buf) return;

        let curX0 = x0, curY0 = y0, curX1 = x1, curY1 = y1, curSize = size;
        if (isDownscaled) {
            curX0 /= scale;
            curY0 /= scale;
            curX1 /= scale;
            curY1 /= scale;
            curSize /= scale;
        }

        const R = curSize / 2;
        const sigma = Math.max(1.0, R) * (soft / 100) * 1.25;
        if (snapToPixelCenter) {
            const halfPix = isDownscaled ? (0.5 / scale) : 0.5;
            curX0 += halfPix; curY0 += halfPix; curX1 += halfPix; curY1 += halfPix;
        }
        const reach = R + 2.8 * sigma;
        const bx0 = Math.max(0, Math.floor(Math.min(curX0, curX1) - reach));
        const by0 = Math.max(0, Math.floor(Math.min(curY0, curY1) - reach));
        const bx1 = Math.min(cw, Math.ceil(Math.max(curX0, curX1) + reach));
        const by1 = Math.min(ch, Math.ceil(Math.max(curY0, curY1) + reach));
        if (bx1 <= bx0 || by1 <= by0) return;

        this.hasDrawnInBounds = true;
        const fullBx0 = isDownscaled ? Math.max(0, Math.floor(bx0 * scale)) : bx0;
        const fullBy0 = isDownscaled ? Math.max(0, Math.floor(by0 * scale)) : by0;
        const fullBx1 = isDownscaled ? Math.min(this.canvasWidth, Math.ceil(bx1 * scale)) : bx1;
        const fullBy1 = isDownscaled ? Math.min(this.canvasHeight, Math.ceil(by1 * scale)) : by1;
        this._markDirty(fullBx0, fullBy0, fullBx1, fullBy1);

        const hasSel = (this.core.selection && this.core.selection.isActive && this.core.selection.mask);
        const mask = hasSel ? this.core.selection.mask : null;
        const bounds = hasSel ? this.core.selection.bounds : null;
        if (bounds && (fullBx0 > bounds.maxX || fullBx1 - 1 < bounds.minX || fullBy0 > bounds.maxY || fullBy1 - 1 < bounds.minY)) {
            return;
        }

        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND);
        const vx = curX1 - curX0, vy = curY1 - curY0;
        const len2 = vx * vx + vy * vy;
        const invLen2 = len2 > 1e-9 ? 1.0 / len2 : 0;

        if (isRound) {
            const lut = this._getGaussianLutSq(R, sigma, true);
            const lutLen = lut.length;

            for (let py = by0; py < by1; py++) {
                const dy0 = (py + 0.5) - curY0;
                const row = py * cw;
                for (let px = bx0; px < bx1; px++) {
                    if (mask) {
                        const fullPx = isDownscaled ? Math.floor(px * scale) : px;
                        const fullPy = isDownscaled ? Math.floor(py * scale) : py;
                        if (!mask[fullPy * this.canvasWidth + fullPx]) continue;
                    }
                    const dx = (px + 0.5) - curX0;
                    let t = (dx * vx + dy0 * vy) * invLen2;
                    t = t < 0 ? 0 : (t > 1 ? 1 : t);
                    const ex = dx - t * vx, ey = dy0 - t * vy;
                    const d2 = (ex * ex + ey * ey) | 0;
                    if (d2 >= lutLen) continue;
                    const a = lut[d2];
                    const bufIdx = row + px;
                    if (a > buf[bufIdx]) buf[bufIdx] = a;
                }
            }
        } else {
            const lut = this._getGaussian1DLut(R, sigma);
            const lutLen = lut.length;

            for (let py = by0; py < by1; py++) {
                const dy0 = (py + 0.5) - curY0;
                const row = py * cw;
                for (let px = bx0; px < bx1; px++) {
                    if (mask) {
                        const fullPx = isDownscaled ? Math.floor(px * scale) : px;
                        const fullPy = isDownscaled ? Math.floor(py * scale) : py;
                        if (!mask[fullPy * this.canvasWidth + fullPx]) continue;
                    }
                    const dx = (px + 0.5) - curX0;
                    let t = (dx * vx + dy0 * vy) * invLen2;
                    t = t < 0 ? 0 : (t > 1 ? 1 : t);
                    const ex = dx - t * vx, ey = dy0 - t * vy;
                    const ix = (Math.abs(ex) * 4 + 0.5) | 0;
                    if (ix >= lutLen) continue;
                    const iy = (Math.abs(ey) * 4 + 0.5) | 0;
                    if (iy >= lutLen) continue;
                    const a = (lut[ix] * lut[iy] * 255 + 0.5) | 0;
                    const bufIdx = row + px;
                    if (a > buf[bufIdx]) buf[bufIdx] = a;
                }
            }
        }

        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const rgbaParts = this._hexToRgba(color, 1).match(/[\d.]+/g);
        const rgb = ((+rgbaParts[2] | 0) << 16) | ((+rgbaParts[1] | 0) << 8) | (+rgbaParts[0] | 0);
        const w = bx1 - bx0, h = by1 - by0;

        const targetCtx = isDownscaled ? this._downCtx : this.scratchCtx;
        const imgProp = isDownscaled ? '_downImg' : '_softImg';
        const u32Prop = isDownscaled ? '_downU32' : '_softU32';
        if (!this[imgProp] || this[imgProp].width !== w || this[imgProp].height !== h) {
            this[imgProp] = targetCtx.createImageData(w, h);
            this[u32Prop] = new Uint32Array(this[imgProp].data.buffer);
        }
        const u32 = this[u32Prop];
        let k = 0;
        for (let py = by0; py < by1; py++) {
            const row = py * cw;
            for (let px = bx0; px < bx1; px++) {
                u32[k++] = ((buf[row + px] << 24) | rgb) >>> 0;
            }
        }
        targetCtx.putImageData(this[imgProp], bx0, by0);

        if (isDownscaled) {
            const sctx = this.scratchCtx;
            sctx.save();
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = 'medium';
            sctx.globalCompositeOperation = 'copy';
            sctx.drawImage(this._downCanvas, 0, 0, cw, ch, 0, 0, this.canvasWidth, this.canvasHeight);
            sctx.restore();
        }
    }

    _getGaussian1DLut(radius, sigma) {
        if (this._gaussian1DLut &&
            this._gaussian1DLut.radius === radius &&
            this._gaussian1DLut.sigma === sigma) {
            return this._gaussian1DLut.lut;
        }
        const span = 2.8 * sigma;
        const maxDist = Math.ceil(radius + span) + 2;
        const samples = maxDist * 4 + 1;
        const lut = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            lut[i] = this._computeGaussianAlpha(i * 0.25, radius, sigma, false);
        }
        this._gaussian1DLut = { radius, sigma, lut };
        return lut;
    }

    _getGaussianLutSq(radius, sigma, isRound) {
        if (this._gaussianLutSq &&
            this._gaussianLutSq.radius === radius &&
            this._gaussianLutSq.sigma === sigma &&
            this._gaussianLutSq.isRound === isRound) {
            return this._gaussianLutSq.lut;
        }
        const span = 2.8 * sigma;
        const maxDist = Math.ceil(radius + span) + 2;
        const maxDistSq = maxDist * maxDist;

        // Sample 1D radial profile in 0.25-pixel increments (< 500 samples, takes < 0.3ms)
        const samples = maxDist * 4 + 1;
        const distLut = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            distLut[i] = this._computeGaussianAlpha(i * 0.25, radius, sigma, isRound);
        }

        // Precompute Uint8 lookup table indexed by distance squared (d2).
        // The per-pixel inner loop skips Math.sqrt and float math entirely.
        const lut = new Uint8Array(maxDistSq + 1);
        for (let d2 = 0; d2 <= maxDistSq; d2++) {
            const idx = (Math.sqrt(d2) * 4 + 0.5) | 0;
            lut[d2] = (distLut[Math.min(idx, samples - 1)] * 255 + 0.5) | 0;
        }
        this._gaussianLutSq = { radius, sigma, isRound, lut };
        return lut;
    }

    _getGaussianLut(radius, sigma, isRound) {
        if (this._gaussianLut &&
            this._gaussianLut.radius === radius &&
            this._gaussianLut.sigma === sigma &&
            this._gaussianLut.isRound === isRound) {
            return this._gaussianLut.lut;
        }
        const span = 2.8 * sigma;
        const maxDist = Math.ceil(radius + span) + 2;
        const lut = new Float32Array(maxDist * 2 + 1);
        for (let i = 0; i < lut.length; i++) {
            const d = i * 0.5;
            lut[i] = this._computeGaussianAlpha(d, radius, sigma, isRound);
        }
        this._gaussianLut = { radius, sigma, isRound, lut };
        return lut;
    }

    _computeSoftCore(size, soft) {
        const outerR = size / 2;
        if (soft <= 0) return { outerR, coreR: outerR, denom: 0.001 };
        const sigma = Math.max(1.0, outerR) * (soft / 100) * 1.25;
        const span = 2.8 * sigma;
        const rFeather = outerR + span;
        const coreR = Math.max(0, outerR - span);
        const denom = Math.max(0.001, rFeather - coreR);
        return { outerR: rFeather, coreR, denom };
    }
    
    getBrushSize() {
        const cat = this.activeToolCategory;
        if (this.core.state.sizes && this.core.state.sizes[cat] !== undefined) {
            return this.core.state.sizes[cat];
        }
        return 1;
    }

    isPixelSelected(x, y) {
        if (!this.core.selection || !this.core.selection.isActive) return true;
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || x >= this.canvasWidth || y < 0 || y >= this.canvasHeight) return false;
        const sel = this.core.selection;
        if (sel.bounds) {
            const b = sel.bounds;
            if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return false;
        }
        return !!sel.mask && !!sel.mask[y * this.canvasWidth + x];
    }

    clearScratch() {
        if (this._hasScratchClip) {
            this.scratchCtx.restore();
            this._hasScratchClip = false;
        }
        if (this.scratchCanvas) {
            this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
        }

        const totalPixels = this.canvasWidth * this.canvasHeight;
        if (!this._strokeAlphaBuffer || this._strokeAlphaBuffer.length !== totalPixels) {
            this._strokeAlphaBuffer = new Uint8Array(totalPixels);
        } else {
            this._strokeAlphaBuffer.fill(0);
        }

        const scale = this._softScale || 1;
        if (scale > 1) {
            const dw = Math.ceil(this.canvasWidth / scale);
            const dh = Math.ceil(this.canvasHeight / scale);
            const downPixels = dw * dh;
            if (!this._downAlphaBuffer || this._downAlphaBuffer.length !== downPixels) {
                this._downAlphaBuffer = new Uint8Array(downPixels);
            } else {
                this._downAlphaBuffer.fill(0);
            }
            if (!this._downCanvas || this._downCanvas.width !== dw || this._downCanvas.height !== dh) {
                this._downCanvas = document.createElement('canvas');
                this._downCanvas.width = dw;
                this._downCanvas.height = dh;
                this._downCtx = this._downCanvas.getContext('2d', { willReadFrequently: true });
            } else {
                this._downCtx.clearRect(0, 0, dw, dh);
            }
            this._downW = dw;
            this._downH = dh;
            this._downImg = null;
            this._downU32 = null;
        }
    }

    setupDrawingState() {
        if (!this.isSpriteSheetView && this.core.doc && typeof this.core.doc.ensureLayerFrameBeforeDraw === 'function') {
            this._createdGapFrames = this.core.doc.ensureLayerFrameBeforeDraw();
        }
        if (!this.activeCanvas) return;
        this.hasDrawnInBounds = false;
        this._dirty = null;
        if (!this.isSpriteSheetView && this.core.doc && this.core.doc.activeLayer) {
            this._backupRev = this.core.doc.activeLayer._rev;
            this._backupIsDeleted = this.core.doc.activeLayer.isDeleted;
        }
        const cvs = this.activeCanvas;
        if (this.core.backupCanvas.width !== cvs.width || this.core.backupCanvas.height !== cvs.height) {
            this.core.backupCanvas.width = cvs.width; this.core.backupCanvas.height = cvs.height;
        }
        this.core.backupCtx.clearRect(0, 0, this.core.backupCanvas.width, this.core.backupCanvas.height);
        this.core.backupCtx.drawImage(cvs, 0, 0);
        
        if (this.scratchCanvas.width !== cvs.width || this.scratchCanvas.height !== cvs.height) {
            this.scratchCanvas.width = cvs.width; this.scratchCanvas.height = cvs.height;
        }

        const brushSize = this.getBrushSize();
        const soft = this.soft;
        const hasSel = (this.core.selection && this.core.selection.isActive);

        let scale = 1;
        if (soft > 0 && !hasSel) {
            if (brushSize >= 65) scale = 4;
            else if (brushSize >= 33) scale = 2;
        }
        this._softScale = scale;

        this.clearScratch();

        if (this.core.selection && this.core.selection.isActive) {
            this.core.selection.pauseAnts();
            if (this.isSubpixelSmoothing && this.core.selection.path) {
                this.scratchCtx.save();
                this.scratchCtx.clip(this.core.selection.path);
                this._hasScratchClip = true;
            }
        }
    }

    updateActiveCanvasFromScratch(incremental = false) {
        if (!this.activeCtx || (this.core.doc && this.core.doc.activeLayer && this.core.doc.activeLayer.locked)) return;
        const ctx = this.activeCtx;
        
        let rect = null;
        if (incremental) {
            // Only strokes that accumulate onto scratch (never erase from it) may use this path.
            rect = this._dirty;
            if (!rect) return; // nothing new since the last update
            this._dirty = null;
        }
        
        if (rect) {
            const { x, y, w, h } = rect;
            ctx.clearRect(x, y, w, h);
            ctx.drawImage(this.core.backupCanvas, x, y, w, h, x, y, w, h);
            ctx.globalAlpha = this.opacity;
            if (this.toolId === CONSTANTS.TOOLS.ERASER) ctx.globalCompositeOperation = 'destination-out';
            ctx.imageSmoothingEnabled = this.isSubpixelSmoothing;
            ctx.drawImage(this.scratchCanvas, x, y, w, h, x, y, w, h);
        } else {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(this.core.backupCanvas, 0, 0);
            ctx.globalAlpha = this.opacity;
            if (this.toolId === CONSTANTS.TOOLS.ERASER) ctx.globalCompositeOperation = 'destination-out';
            ctx.imageSmoothingEnabled = this.isSubpixelSmoothing;
            ctx.drawImage(this.scratchCanvas, 0, 0);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        if (!this.isSpriteSheetView) {
            this.core.doc.activeLayer.markModified();
            if(this.core.renderer) this.core.renderer.render(rect);
        }
    }

    _markDirty(x0, y0, x1, y1) {
        const target = this.activeCanvas;
        if (!target) return;
        const cw = target.width, ch = target.height;
        x0 = Math.max(0, x0); y0 = Math.max(0, y0);
        x1 = Math.min(cw, x1); y1 = Math.min(ch, y1);
        if (x1 <= x0 || y1 <= y0) return;
        const d = this._dirty;
        if (!d) {
            this._dirty = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        } else {
            const nx = Math.min(d.x, x0), ny = Math.min(d.y, y0);
            const mx = Math.max(d.x + d.w, x1), my = Math.max(d.y + d.h, y1);
            d.x = nx; d.y = ny; d.w = mx - nx; d.h = my - ny;
        }
    }
    
    commitDrawing() {
        if (this._hasScratchClip) {
            this.scratchCtx.restore();
            this._hasScratchClip = false;
        }
        if (this.core.selection) {
            this.core.selection.resumeAnts();
        }
        if (this.hasDrawnInBounds === false) {
            this.cancelDrawing();
            return;
        }
        this._createdGapFrames = null;
        if (!this.isSpriteSheetView) {
            if (this.core.renderer) this.core.renderer.render();
            if (this.core.input && this.core.input.hiddenTapPending) {
                this.core.input.hiddenTapPending = false;
                this.core.input.hiddenTapTimeout = setTimeout(() => {
                    this.core.input.hiddenTapTimeout = null;
                    this.core.saveState();
                    this.core.events.emit('ui:updateActiveThumbnail');
                    this.core.playback.updateOnionSkin();
                }, 300);
            } else {
                this.core.saveState();
                this.core.events.emit('ui:updateActiveThumbnail');
                this.core.playback.updateOnionSkin();
            }
        }
        this.hasDrawnInBounds = false;
    }

    cancelDrawing() {
        if (this._hasScratchClip) {
            this.scratchCtx.restore();
            this._hasScratchClip = false;
        }
        if (this.core.selection) {
            this.core.selection.resumeAnts();
        }
        if (this._createdGapFrames && this._createdGapFrames.length > 0) {
            if (this.core.doc && this.core.doc.frames) {
                const aIdx = this.core.doc.activeLayerIndex;
                this._createdGapFrames.forEach(fIdx => {
                    if (this.core.doc.frames[fIdx]?.layers[aIdx]) {
                        this.core.doc.frames[fIdx].layers[aIdx].isDeleted = true;
                    }
                });
                this.core.events.emit('frameChanged');
            }
            this._createdGapFrames = null;
        }
        if (!this.activeCtx) return;
        const ctx = this.activeCtx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(this.core.backupCanvas, 0, 0);
        if (!this.isSpriteSheetView) {
            if (this.core.doc && this.core.doc.activeLayer) {
                if (this._backupRev !== undefined) this.core.doc.activeLayer._rev = this._backupRev;
                if (this._backupIsDeleted !== undefined) this.core.doc.activeLayer.isDeleted = this._backupIsDeleted;
            }
            if(this.core.renderer) this.core.renderer.render();
            this.core.playback.updateOnionSkin();
        }
    }

    executeWithMirror(x, y, actionFn) {
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const mode = this.core.state.mirrorMode;
        actionFn(x, y);
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x, y);
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) actionFn(x, h - 1 - y);
        if (mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x, h - 1 - y);
    }

    executeLineWithMirror(x0, y0, x1, y1, actionFn) {
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const mode = this.core.state.mirrorMode;
        actionFn(x0, y0, x1, y1);
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x0, y0, w - 1 - x1, y1);
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) actionFn(x0, h - 1 - y0, x1, h - 1 - y1);
        if (mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x0, h - 1 - y0, w - 1 - x1, h - 1 - y1);
    }

    executeEllipseWithMirror(x0, y0, x1, y1, actionFn) {
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const mode = this.core.state.mirrorMode;
        actionFn(x0, y0, x1, y1);
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x0, y0, w - 1 - x1, y1);
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) actionFn(x0, h - 1 - y0, x1, h - 1 - y1);
        if (mode === CONSTANTS.MIRROR.Q) actionFn(w - 1 - x0, h - 1 - y0, w - 1 - x1, h - 1 - y1);
    }

    executeRectWithMirror(x, y, w, h, actionFn) {
        const cw = this.canvasWidth;
        const ch = this.canvasHeight;
        const mode = this.core.state.mirrorMode;
        actionFn(x, y, w, h);
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) actionFn(cw - x - w, y, w, h);
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) actionFn(x, ch - y - h, w, h);
        if (mode === CONSTANTS.MIRROR.Q) actionFn(cw - x - w, ch - y - h, w, h);
    }

    drawVectorPointToScratch(cx, cy, customSize) {
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const R = size / 2;
        const soft = this.soft;
        if (soft > 0) {
            this.drawSoftSegmentToScratch(cx, cy, cx, cy, size, false);
            return;
        }
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND);
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const sigma = (soft > 0) ? Math.max(1.0, R) * (soft / 100) * 1.25 : 0;
        const span = 2.8 * sigma;
        const R_feather = R + span;
        const pad = (soft > 0) ? (R_feather + 2) : (size / 2 + 2);

        const startX = cx - pad;
        const startY = cy - pad;
        if (startX < this.canvasWidth && startY < this.canvasHeight && cx + pad > 0 && cy + pad > 0) {
            this.hasDrawnInBounds = true;
        }
        this._markDirty(Math.floor(startX), Math.floor(startY), Math.ceil(cx + pad), Math.ceil(cy + pad));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        
        if (soft <= 0) {
            ctx.fillStyle = color;
            if (isRound) {
                ctx.beginPath();
                ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
            }
        } else {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R_feather);
            const steps = 32;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const a = this._computeGaussianAlpha(t * R_feather, R, sigma, true);
                grad.addColorStop(t, this._hexToRgba(color, a));
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, R_feather, 0, Math.PI * 2);
            ctx.fill();
        }
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorLineToScratch(x0, y0, x1, y1, customSize) {
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const R = size / 2;
        const soft = this.soft;
        if (soft > 0) {
            this.drawSoftSegmentToScratch(x0, y0, x1, y1, size, false);
            return;
        }
        const sigma = (soft > 0) ? Math.max(1.0, R) * (soft / 100) * 1.25 : 0;
        const span = 2.8 * sigma;
        const R_feather = R + span;
        const pad = (soft > 0) ? (R_feather + 2) : (size / 2 + 2);

        const minX = Math.min(x0, x1) - pad;
        const minY = Math.min(y0, y1) - pad;
        const maxX = Math.max(x0, x1) + pad;
        const maxY = Math.max(y0, y1) + pad;
        
        if (minX < this.canvasWidth && minY < this.canvasHeight && maxX > 0 && maxY > 0) {
            this.hasDrawnInBounds = true;
        }
        this._markDirty(Math.floor(minX), Math.floor(minY), Math.ceil(maxX), Math.ceil(maxY));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND);
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        ctx.lineCap = isRound ? 'round' : 'square';
        ctx.lineJoin = isRound ? 'round' : 'miter';
        
        if (Math.abs(x0 - x1) < 0.001 && Math.abs(y0 - y1) < 0.001) {
            this.drawVectorPointToScratch(x0, y0, size);
        } else if (soft <= 0) {
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        } else {
            const N = 48;
            let A_prev = 0;
            for (let i = 0; i < N; i++) {
                const r = R_feather * (1 - i / N);
                const w = r * 2;
                const A_target = this._computeGaussianAlpha(r, R, sigma, true);
                const alpha_i = Math.max(0, Math.min(0.85, (A_target - A_prev) / Math.max(0.001, 1 - A_prev)));
                A_prev = A_prev + alpha_i * (1 - A_prev);
                if (alpha_i <= 0.001) continue;
                ctx.lineWidth = w;
                ctx.strokeStyle = this._hexToRgba(color, alpha_i);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
        }
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorEllipseToScratch(x0, y0, x1, y1) {
        const size = this.getBrushSize();
        const R = size / 2;
        const soft = this.soft;
        const sigma = (soft > 0) ? Math.max(1.0, R) * (soft / 100) * 1.25 : 0;
        const span = 2.8 * sigma;
        const R_feather = R + span;
        const pad = (soft > 0) ? (R_feather + 2) : (size + 2);

        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(0.1, (maxX - minX) / 2);
        const ry = Math.max(0.1, (maxY - minY) / 2);
        
        this.hasDrawnInBounds = true;
        this._markDirty(Math.floor(minX - pad), Math.floor(minY - pad), Math.ceil(maxX + pad), Math.ceil(maxY + pad));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        
        if (soft <= 0) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            const N = 48;
            let A_prev = 0;
            for (let i = 0; i < N; i++) {
                const r = R_feather * (1 - i / N);
                const w = r * 2;
                const A_target = this._computeGaussianAlpha(r, R, sigma, true);
                const alpha_i = Math.max(0, Math.min(0.85, (A_target - A_prev) / Math.max(0.001, 1 - A_prev)));
                A_prev = A_prev + alpha_i * (1 - A_prev);
                if (alpha_i <= 0.001) continue;
                ctx.lineWidth = w;
                ctx.strokeStyle = this._hexToRgba(color, alpha_i);
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorRectToScratch(x, y, w, h) {
        const size = this.getBrushSize();
        const R = size / 2;
        const soft = this.soft;
        const sigma = (soft > 0) ? Math.max(1.0, R) * (soft / 100) * 1.25 : 0;
        const span = 2.8 * sigma;
        const R_feather = R + span;
        const pad = (soft > 0) ? (R_feather + 2) : (size + 2);

        this.hasDrawnInBounds = true;
        this._markDirty(Math.floor(x - pad), Math.floor(y - pad), Math.ceil(x + w + pad), Math.ceil(y + h + pad));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND);
        ctx.lineJoin = isRound ? 'round' : 'miter';

        if (soft <= 0) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.stroke();
        } else {
            const N = 48;
            let A_prev = 0;
            for (let i = 0; i < N; i++) {
                const r = R_feather * (1 - i / N);
                const w = r * 2;
                const A_target = this._computeGaussianAlpha(r, R, sigma, isRound);
                const alpha_i = Math.max(0, Math.min(0.85, (A_target - A_prev) / Math.max(0.001, 1 - A_prev)));
                A_prev = A_prev + alpha_i * (1 - A_prev);
                if (alpha_i <= 0.001) continue;
                ctx.lineWidth = w;
                ctx.strokeStyle = this._hexToRgba(color, alpha_i);
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.stroke();
            }
        }
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorStrokeToScratch(points) {
        if (!points || points.length === 0) return;
        
        const ctx = this.scratchCtx;
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }

        const soft = this.soft;
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND);
        ctx.lineCap = isRound ? 'round' : 'square';
        ctx.lineJoin = isRound ? 'round' : 'miter';

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let maxSize = 1;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const s = p.size || 1;
            if (s > maxSize) maxSize = s;
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        const pad = Math.ceil(maxSize / 2) + 4;
        const cw = this.canvasWidth;
        const ch = this.canvasHeight;
        this.hasDrawnInBounds = true;
        this._markDirty(Math.floor(minX - pad), Math.floor(minY - pad), Math.ceil(maxX + pad), Math.ceil(maxY + pad));

        const mode = this.core.state.mirrorMode;
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) {
            this._markDirty(Math.floor(cw - 1 - maxX - pad), Math.floor(minY - pad), Math.ceil(cw - 1 - minX + pad), Math.ceil(maxY + pad));
        }
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) {
            this._markDirty(Math.floor(minX - pad), Math.floor(ch - 1 - maxY - pad), Math.ceil(maxX + pad), Math.ceil(ch - 1 - minY + pad));
        }
        if (mode === CONSTANTS.MIRROR.Q) {
            this._markDirty(Math.floor(cw - 1 - maxX - pad), Math.floor(ch - 1 - maxY - pad), Math.ceil(cw - 1 - minX + pad), Math.ceil(ch - 1 - minY + pad));
        }

        const strokePathConcentric = (pts, size) => {
            if (pts.length === 1) {
                this.drawVectorPointToScratch(pts[0].x, pts[0].y, size);
                return;
            }
            
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }

            if (soft <= 0) {
                ctx.strokeStyle = color;
                ctx.lineWidth = size;
                ctx.stroke();
            } else {
                const R = size / 2;
                const sigma = Math.max(1.0, R) * (soft / 100) * 1.25;
                const span = 2.8 * sigma;
                const R_feather = R + span;
                const N = 48;
                let A_prev = 0;
                for (let i = 0; i < N; i++) {
                    const r = R_feather * (1 - i / N);
                    const w = r * 2;
                    const A_target = this._computeGaussianAlpha(r, R, sigma, true);
                    const alpha_i = Math.max(0, Math.min(0.85, (A_target - A_prev) / Math.max(0.001, 1 - A_prev)));
                    A_prev = A_prev + alpha_i * (1 - A_prev);
                    if (alpha_i <= 0.001) continue;
                    ctx.lineWidth = w;
                    ctx.strokeStyle = this._hexToRgba(color, alpha_i);
                    ctx.stroke();
                }
            }
        };

        const renderStroke = (pts) => {
            if (pts.length <= 1) {
                strokePathConcentric(pts, pts[0]?.size || maxSize);
                return;
            }
            let curRun = [pts[0]];
            let curSize = Math.round(pts[0].size || maxSize);
            for (let i = 1; i < pts.length; i++) {
                const p = pts[i];
                const pSize = Math.round(p.size || maxSize);
                if (pSize === curSize) {
                    curRun.push(p);
                } else {
                    curRun.push(p);
                    strokePathConcentric(curRun, curSize);
                    curRun = [p];
                    curSize = pSize;
                }
            }
            if (curRun.length > 0) {
                strokePathConcentric(curRun, curSize);
            }
        };

        renderStroke(points);
        if (mode === CONSTANTS.MIRROR.H || mode === CONSTANTS.MIRROR.Q) {
            renderStroke(points.map(p => ({ x: cw - 1 - p.x, y: p.y, size: p.size })));
        }
        if (mode === CONSTANTS.MIRROR.V || mode === CONSTANTS.MIRROR.Q) {
            renderStroke(points.map(p => ({ x: p.x, y: ch - 1 - p.y, size: p.size })));
        }
        if (mode === CONSTANTS.MIRROR.Q) {
            renderStroke(points.map(p => ({ x: cw - 1 - p.x, y: ch - 1 - p.y, size: p.size })));
        }

        if (needsClip) {
            ctx.restore();
        }
    }

    drawPixelToScratch(cx, cy, customSize) {
        cx = Math.round(cx); cy = Math.round(cy);
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const startX = cx - Math.floor(size / 2);
        const startY = cy - Math.floor(size / 2);
        const soft = this.soft;
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        
        if (soft <= 0) {
            if (startX < this.canvasWidth && startY < this.canvasHeight && startX + size > 0 && startY + size > 0) {
                this.hasDrawnInBounds = true;
            }
            this._markDirty(startX, startY, startX + size, startY + size);
            
            const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND && size > 1);
            const centerOffset = (size - 1) / 2;
            const radiusSq = Math.pow(size / 2, 2);
            
            this.scratchCtx.fillStyle = color;
            if (this.core.selection && this.core.selection.isActive) {
                const sel = this.core.selection;
                const b = sel.bounds;
                if (b) {
                    if (startX + size - 1 < b.minX || startX > b.maxX || startY + size - 1 < b.minY || startY > b.maxY) {
                        return;
                    }
                }
                const mask = sel.mask;
                if (!mask) return;
                const cw = this.canvasWidth;
                const ch = this.canvasHeight;

                if (isRound) {
                    for (let y = 0; y < size; y++) {
                        const py = startY + y;
                        if (py < 0 || py >= ch) continue;
                        const dy = y - centerOffset;
                        const dxSq = radiusSq - dy * dy;
                        if (dxSq < 0) continue;
                        const dx = Math.sqrt(dxSq);
                        const minX = Math.ceil(-dx); 
                        const maxX = Math.floor(dx);
                        const rowStart = centerOffset + minX;
                        const rowEnd = centerOffset + maxX;
                        const rowOffset = py * cw;
                        
                        let spanStart = -1;
                        for (let x = rowStart; x <= rowEnd + 1; x++) {
                            let drawThisPixel = false;
                            if (x <= rowEnd) {
                                const px = startX + x;
                                if (px >= 0 && px < cw && mask[rowOffset + px]) {
                                    drawThisPixel = true;
                                }
                            }
                            if (drawThisPixel) {
                                if (spanStart === -1) spanStart = x;
                            } else if (spanStart !== -1) {
                                this.scratchCtx.fillRect(startX + spanStart, py, x - spanStart, 1);
                                spanStart = -1;
                            }
                        }
                    }
                } else {
                    for (let y = 0; y < size; y++) {
                        const py = startY + y;
                        if (py < 0 || py >= ch) continue;
                        const rowOffset = py * cw;
                        let spanStart = -1;
                        for (let x = 0; x <= size; x++) {
                            let drawThisPixel = false;
                            if (x < size) {
                                const px = startX + x;
                                if (px >= 0 && px < cw && mask[rowOffset + px]) {
                                    drawThisPixel = true;
                                }
                            }
                            if (drawThisPixel) {
                                if (spanStart === -1) spanStart = x;
                            } else if (spanStart !== -1) {
                                this.scratchCtx.fillRect(startX + spanStart, py, x - spanStart, 1);
                                spanStart = -1;
                            }
                        }
                    }
                }
            } else {
                if (isRound) {
                    for (let y = 0; y < size; y++) {
                        const dy = y - centerOffset;
                        const dxSq = radiusSq - dy * dy;
                        if (dxSq >= 0) {
                            const dx = Math.sqrt(dxSq);
                            const minX = Math.ceil(-dx); const maxX = Math.floor(dx);
                            const width = maxX - minX + 1;
                            if (width > 0) this.scratchCtx.fillRect(startX + centerOffset + minX, startY + y, width, 1);
                        }
                    }
                } else {
                    this.scratchCtx.fillRect(startX, startY, size, size);
                }
            }
        } else {
            this.drawSoftSegmentToScratch(cx, cy, cx, cy, size, true);
        }
    }
    
    updateOnionSkin() {
        if (!this.isSpriteSheetView) this.core.playback.updateOnionSkin();
    }
    
    startCrosshairTimer(e, requireLongPress = true) {
        this.core.events.emit('tool:startCrosshairTimer', { e, requireLongPress });
    }
    
    pickColor(hex) {
        this.core.events.emit('core:setHSVColor', hex);
    }
    
    requestToolChange(toolId) {
        this.core.events.emit('requestToolChange', toolId);
    }

    getImageData() {
        if (!this.activeCtx) return null;
        return this.activeCtx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
    }

    putImageData(imgData) {
        if (!this.activeCtx || (this.core.doc && this.core.doc.activeLayer && this.core.doc.activeLayer.locked)) return;
        this.activeCtx.putImageData(imgData, 0, 0);
        if (!this.isSpriteSheetView) {
            this.core.doc.activeLayer.markModified();
            if (this.core.renderer) this.core.renderer.render();
        }
    }

    getSelectionMask() { return this.core.selection.mask; }
    rebuildSelectionPath() { this.core.selection.rebuildPath(); }
    clearSelectionMask() { this.core.selection.mask.fill(0); }
    setSelectionPixel(x, y, val) { this.core.selection.mask[y * this.canvasWidth + x] = val; }
}


