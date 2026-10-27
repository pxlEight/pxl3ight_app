import { CONSTANTS } from '../core/Constants.js?cb=171';

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
    get brushShape() { return this.core.state.tool.brushShape; }
    get smooth() { return this.core.state.tool.smooth; }
    get velocity() { return this.core.state.tool.velocity || 0; }
    get isSubpixelSmoothing() { 
        return !!this.core.state.subpixelSmoothing && (Math.max(this.canvasWidth, this.canvasHeight) >= 720); 
    }
    
    getBrushSize() {
        if (this.toolId === CONSTANTS.TOOLS.ERASER) return this.core.state.sizes[CONSTANTS.TOOLS.ERASER];
        if ([CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE].includes(this.toolId)) return this.core.state.sizes[CONSTANTS.TOOLS.SHAPE];
        return this.core.state.sizes[CONSTANTS.TOOLS.PENCIL];
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

    setupDrawingState() {
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
        if (this._hasScratchClip) {
            this.scratchCtx.restore();
            this._hasScratchClip = false;
        }
        this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);

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
        if (!this.activeCtx) return;
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

    drawVectorPointToScratch(cx, cy, customSize) {
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const startX = cx - size / 2;
        const startY = cy - size / 2;
        
        if (startX < this.canvasWidth && startY < this.canvasHeight && startX + size > 0 && startY + size > 0) {
            this.hasDrawnInBounds = true;
        }
        this._markDirty(Math.floor(startX - 2), Math.floor(startY - 2), Math.ceil(startX + size + 2), Math.ceil(startY + size + 2));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        ctx.fillStyle = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fill();
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorLineToScratch(x0, y0, x1, y1, customSize) {
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const minX = Math.min(x0, x1) - size / 2 - 2;
        const minY = Math.min(y0, y1) - size / 2 - 2;
        const maxX = Math.max(x0, x1) + size / 2 + 2;
        const maxY = Math.max(y0, y1) + size / 2 + 2;
        
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
        const color = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (Math.abs(x0 - x1) < 0.001 && Math.abs(y0 - y1) < 0.001) {
            ctx.beginPath();
            ctx.arc(x0, y0, size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        if (needsClip) {
            ctx.restore();
        }
    }

    drawVectorEllipseToScratch(x0, y0, x1, y1) {
        const size = this.getBrushSize();
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(0.1, (maxX - minX) / 2);
        const ry = Math.max(0.1, (maxY - minY) / 2);
        
        this.hasDrawnInBounds = true;
        this._markDirty(Math.floor(minX - size - 2), Math.floor(minY - size - 2), Math.ceil(maxX + size + 2), Math.ceil(maxY + size + 2));
        
        const ctx = this.scratchCtx;
        const needsClip = !this._hasScratchClip && (this.core.selection && this.core.selection.isActive && this.core.selection.path);
        if (needsClip) {
            ctx.save();
            ctx.clip(this.core.selection.path);
        }
        ctx.strokeStyle = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (needsClip) {
            ctx.restore();
        }
    }

    drawPixelToScratch(cx, cy, customSize) {
        cx = Math.round(cx); cy = Math.round(cy);
        const size = (customSize !== undefined) ? customSize : this.getBrushSize();
        const startX = cx - Math.floor(size / 2);
        const startY = cy - Math.floor(size / 2);
        
        if (startX < this.canvasWidth && startY < this.canvasHeight && startX + size > 0 && startY + size > 0) {
            this.hasDrawnInBounds = true;
        }
        this._markDirty(startX, startY, startX + size, startY + size);
        
        this.scratchCtx.fillStyle = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND && size > 1 && (this.toolId === CONSTANTS.TOOLS.PENCIL || this.toolId === CONSTANTS.TOOLS.ERASER));
        const centerOffset = (size - 1) / 2;
        const radiusSq = Math.pow(size / 2, 2);
        
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
        if (!this.activeCtx) return;
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


