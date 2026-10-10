import { CONSTANTS } from '../core/Constants.js?cb=103';

export default class ToolContext {
    constructor(core) {
        this.core = core;
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
    
    getBrushSize() {
        if (this.toolId === CONSTANTS.TOOLS.ERASER) return this.core.state.sizes[CONSTANTS.TOOLS.ERASER];
        if ([CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE].includes(this.toolId)) return this.core.state.sizes[CONSTANTS.TOOLS.SHAPE];
        return this.core.state.sizes[CONSTANTS.TOOLS.PENCIL];
    }

    isPixelSelected(x, y) {
        if (!this.core.selection.isActive) return true;
        if (x < 0 || x >= this.canvasWidth || y < 0 || y >= this.canvasHeight) return false;
        return !!this.core.selection.mask[y * this.canvasWidth + x];
    }

    setupDrawingState() {
        if (!this.activeCanvas) return;
        this.hasDrawnInBounds = false;
        const cvs = this.activeCanvas;
        if (this.core.backupCanvas.width !== cvs.width || this.core.backupCanvas.height !== cvs.height) {
            this.core.backupCanvas.width = cvs.width; this.core.backupCanvas.height = cvs.height;
        }
        this.core.backupCtx.clearRect(0, 0, this.core.backupCanvas.width, this.core.backupCanvas.height);
        this.core.backupCtx.drawImage(cvs, 0, 0);
        
        if (this.scratchCanvas.width !== cvs.width || this.scratchCanvas.height !== cvs.height) {
            this.scratchCanvas.width = cvs.width; this.scratchCanvas.height = cvs.height;
        }
        this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
    }

    updateActiveCanvasFromScratch() {
        if (!this.activeCtx) return;
        const ctx = this.activeCtx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(this.core.backupCanvas, 0, 0);
        ctx.globalAlpha = this.opacity;
        if (this.toolId === CONSTANTS.TOOLS.ERASER) ctx.globalCompositeOperation = 'destination-out';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.scratchCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        if (!this.isSpriteSheetView) {
            this.core.doc.activeLayer.markModified();
            if(this.core.renderer) this.core.renderer.render();
        }
    }
    
    commitDrawing() {
        if (this.hasDrawnInBounds === false) {
            this.cancelDrawing();
            return;
        }
        if (!this.isSpriteSheetView) {
            if (this.core.input && this.core.input.hiddenTapPending) {
                this.core.input.hiddenTapPending = false;
                this.core.input.hiddenTapTimeout = setTimeout(() => {
                    this.core.input.hiddenTapTimeout = null;
                    this.core.saveState();
                    this.core.events.emit('frameChanged');
                    this.core.playback.updateOnionSkin();
                }, 300);
            } else {
                this.core.saveState();
                this.core.events.emit('frameChanged');
                this.core.playback.updateOnionSkin();
            }
        }
        this.hasDrawnInBounds = false;
    }

    cancelDrawing() {
        if (!this.activeCtx) return;
        const ctx = this.activeCtx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(this.core.backupCanvas, 0, 0);
        if (!this.isSpriteSheetView) {
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

    drawPixelToScratch(cx, cy) {
        cx = Math.round(cx); cy = Math.round(cy);
        const size = this.getBrushSize();
        const startX = cx - Math.floor(size / 2);
        const startY = cy - Math.floor(size / 2);
        
        if (startX < this.canvasWidth && startY < this.canvasHeight && startX + size > 0 && startY + size > 0) {
            this.hasDrawnInBounds = true;
        }
        
        this.scratchCtx.fillStyle = (this.toolId === CONSTANTS.TOOLS.ERASER) ? "#000000" : this.color;
        const isRound = (this.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND && size > 1 && (this.toolId === CONSTANTS.TOOLS.PENCIL || this.toolId === CONSTANTS.TOOLS.ERASER));
        const centerOffset = (size - 1) / 2;
        const radiusSq = Math.pow(size / 2, 2);
        
        if (this.core.selection.isActive) {
            for (let y = 0; y < size; y++) {
                let spanStart = -1;
                for (let x = 0; x <= size; x++) {
                    let drawThisPixel = false;
                    if (x < size) {
                        let validShape = true;
                        if (isRound) {
                            const dx = x - centerOffset; const dy = y - centerOffset;
                            if ((dx * dx + dy * dy) > radiusSq) validShape = false;
                        }
                        if (validShape) {
                            const px = startX + x; const py = startY + y;
                            if (this.isPixelSelected(px, py)) drawThisPixel = true;
                        }
                    }
                    if (drawThisPixel) {
                        if (spanStart === -1) spanStart = x;
                    } else {
                        if (spanStart !== -1) {
                            this.scratchCtx.fillRect(startX + spanStart, startY + y, x - spanStart, 1);
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
        }
    }

    getSelectionMask() { return this.core.selection.mask; }
    rebuildSelectionPath() { this.core.selection.rebuildPath(); }
    clearSelectionMask() { this.core.selection.mask.fill(0); }
    setSelectionPixel(x, y, val) { this.core.selection.mask[y * this.canvasWidth + x] = val; }
}


