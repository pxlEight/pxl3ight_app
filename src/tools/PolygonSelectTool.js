import BaseTool from './BaseTool.js?cb=104';
import { CONSTANTS } from '../core/Constants.js?cb=104';

export default class PolygonSelectTool extends BaseTool {
    constructor(context) { 
        super(context);
        this.points = [];
        this.isDrawing = false;
        this.lastPos = null;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.startMask = null;
        this.ctx = document.getElementById('selectionCanvas').getContext('2d');
        
        this.animateAnts = this.animateAnts.bind(this);
        this.antsOffset = 0;
        this.animating = false;
    }

    onPointerDown(pos, e) {
        this.isLongPress = false;
        this.isMovingMask = false;
        this.hasMoved = false;
        this.startX = pos.x;
        this.startY = pos.y;
        this.downClient = { x: e.clientX, y: e.clientY };
        
        const mode = this.context.core.selection.selectionMode || CONSTANTS.SELECT_MODE.REPLACE;
        const isActive = this.context.core.selection.isActive;
        const isInside = this.context.isPixelSelected(pos.x, pos.y);

        const now = Date.now();
        if (!this.isDrawing && this.lastModifierTapTime && (now - this.lastModifierTapTime < 300) && isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = 0;
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            return;
        }

        if (!this.isDrawing && isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = now;
        } else {
            this.lastModifierTapTime = 0;
        }

        if (!this.isDrawing && isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.isMovingMask = true;
            this.longPressTimer = setTimeout(() => {
                this.longPressTimer = null;
                this.isLongPress = true; if (navigator.vibrate) navigator.vibrate(40);
                this.isMovingMask = false;
                this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            }, window.longPressTimer || 500);
        } else {
            if (!this.isDrawing && isActive && !isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
                this.context.core.selection.clear();
            }
            if (!this.isDrawing) {
                this.startDrawing(pos);
            } else {
                this.currentPoint = { x: pos.x, y: pos.y };
            }
        }
    }
    
    startDrawing(pos) {
        this.isDrawing = true;
        this.points = [];
        this.points.push({ x: pos.x, y: pos.y });
        this.currentPoint = { x: pos.x, y: pos.y };
        
        this.activeMode = this.context.core.selection.selectionMode || CONSTANTS.SELECT_MODE.REPLACE;
        if (this.activeMode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.context.clearSelectionMask();
        }
        
        this.startMask = new Uint8Array(this.context.getSelectionMask());
        
        if (!this.animating) {
            this.animating = true;
            requestAnimationFrame(this.animateAnts);
        }
    }

    startMovingMask() {
        this.isMovingMask = true;
        this.startMask = new Uint8Array(this.context.getSelectionMask());
    }
    
    updateMovingMask(pos) {
        if (!this.isMovingMask) return;
        
        const dx = Math.round(pos.x - this.startX);
        const dy = Math.round(pos.y - this.startY);
        
        const w = this.context.canvasWidth;
        const h = this.context.canvasHeight;
        const mask = this.context.getSelectionMask();
        
        mask.fill(0);
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (this.startMask[y * w + x]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        mask[ny * w + nx] = 1;
                    }
                }
            }
        }
        
        this.context.core.selection.rebuildPath();
    }
    
    onPointerMove(pos, e) {
        if (!this.hasMoved && this.downClient && (Math.abs(e.clientX - this.downClient.x) > 15 || Math.abs(e.clientY - this.downClient.y) > 15)) {
            this.hasMoved = true;
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            if (this.isMovingMask) {
                this.startMovingMask();
            }
        }

        if (this.hasMoved && this.isMovingMask) {
            this.updateMovingMask(pos);
        } else if (this.isDrawing) {
            this.currentPoint = { x: pos.x, y: pos.y };
        }
    }
    
    onPointerUp(pos, e) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        if (this.isMovingMask && this.hasMoved) {
            this.updateMovingMask(pos);
            this.isMovingMask = false;
            return;
        }
        this.isMovingMask = false;
        
        if (this.isDrawing && !this.isLongPress) {
            const now = Date.now();
            const timeSinceLastTap = this.lastTapTime ? now - this.lastTapTime : Infinity;
            this.lastTapTime = now;
            
            if (this.points.length > 0) {
                const distToStart = Math.hypot(pos.x - this.points[0].x, pos.y - this.points[0].y);
                const distToLast = Math.hypot(pos.x - this.points[this.points.length - 1].x, pos.y - this.points[this.points.length - 1].y);
                
                let scale = 1;
                if (this.context.core.viewport && this.context.core.viewport.cachedBgRect) {
                    const rect = this.context.core.viewport.cachedBgRect;
                    const w = this.context.canvasWidth;
                    const h = this.context.canvasHeight;
                    const canvasRatio = w / h;
                    const rectRatio = rect.width / rect.height;
                    let actualRenderedWidth = rect.width;
                    if (canvasRatio < rectRatio) actualRenderedWidth = rect.height * canvasRatio;
                    scale = actualRenderedWidth / w;
                }
                
                const distToStartScreen = distToStart * scale;
                const distToLastScreen = distToLast * scale;
                
                if (distToStartScreen < 40 && this.points.length > 1) {
                    this.commitSelection();
                    return;
                }
                
                if (timeSinceLastTap < 400 && distToLastScreen < 20 && this.points.length > 1) {
                    // Double tap
                    this.commitSelection();
                    return;
                }
            }
            
            this.points.push({ x: pos.x, y: pos.y });
        }
    }
    
    commitSelection() {
        if (!this.isDrawing || this.points.length < 3) {
            this.cancel();
            return;
        }
        
        this.isDrawing = false;
        this.animating = false;
        
        // Draw polygon to an offscreen canvas to get the mask
        const w = this.context.canvasWidth;
        const h = this.context.canvasHeight;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.fillStyle = '#ffffff';
        tCtx.beginPath();
        tCtx.moveTo(this.points[0].x + 0.5, this.points[0].y + 0.5);
        for (let i = 1; i < this.points.length; i++) {
            tCtx.lineTo(this.points[i].x + 0.5, this.points[i].y + 0.5);
        }
        tCtx.closePath();
        tCtx.fill();
        
        const imgData = tCtx.getImageData(0, 0, w, h).data;
        const mask = this.context.getSelectionMask();
        const mode = this.activeMode || CONSTANTS.SELECT_MODE.REPLACE;
        
        for (let i = 0; i < mask.length; i++) {
            mask[i] = this.startMask[i];
        }
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (imgData[(y * w + x) * 4 + 3] > 128) {
                    if (mode === CONSTANTS.SELECT_MODE.SUBTRACT) {
                        mask[y * w + x] = 0;
                    } else {
                        mask[y * w + x] = 1;
                    }
                }
            }
        }
        
        this.context.rebuildSelectionPath();
        this.context.core.saveState();
        
        // Clear selection canvas from drawing ants
        const selCanvas = document.getElementById('selectionCanvas');
        selCanvas.getContext('2d').clearRect(0, 0, selCanvas.width, selCanvas.height);
    }
    
    animateAnts() {
        if (!this.isDrawing || !this.animating) return;
        
        const selCanvas = document.getElementById('selectionCanvas');
        const w = this.context.canvasWidth;
        const h = this.context.canvasHeight;
        const rect = this.context.core.viewport.cachedBgRect;
        if (!rect) { requestAnimationFrame(this.animateAnts); return; }
        
        const canvasRatio = w / h;
        const rectRatio = rect.width / rect.height; 
        let actualRenderedWidth = rect.width; 
        if (canvasRatio < rectRatio) {
            actualRenderedWidth = rect.height * canvasRatio;
        }
        
        const internalScale = Math.ceil(Math.max(1, actualRenderedWidth / w));
        const targetW = w * internalScale;
        const targetH = h * internalScale;
        
        if (selCanvas.width !== targetW) selCanvas.width = targetW; 
        if (selCanvas.height !== targetH) selCanvas.height = targetH;
        
        const ctx = selCanvas.getContext('2d'); 
        ctx.clearRect(0, 0, targetW, targetH); 
        ctx.save(); 
        ctx.scale(internalScale, internalScale);
        
        const artUnitsPerScreenPixel = w / actualRenderedWidth;
        const strokeThickness = artUnitsPerScreenPixel * 1.5;
        const dashLength = artUnitsPerScreenPixel * 5; 
        
        ctx.lineWidth = strokeThickness; 
        
        // Stroke existing selection first
        if (this.context.core.selection.path && this.context.core.selection.isActive) {
            ctx.strokeStyle = '#AAAAAA'; 
            ctx.setLineDash([dashLength, dashLength]); 
            ctx.lineDashOffset = -this.antsOffset * artUnitsPerScreenPixel; 
            ctx.stroke(this.context.core.selection.path);
            
            ctx.strokeStyle = '#ffffff'; 
            ctx.lineDashOffset = (-this.antsOffset * artUnitsPerScreenPixel) + dashLength; 
            ctx.stroke(this.context.core.selection.path);
        }
        
        ctx.beginPath();
        if (this.points.length > 0) {
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo(this.points[i].x, this.points[i].y);
            }
        }
        if (this.currentPoint && this.points.length > 0) {
            ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
        }
        
        ctx.strokeStyle = '#AAAAAA'; 
        ctx.setLineDash([dashLength, dashLength]); 
        ctx.lineDashOffset = -this.antsOffset * artUnitsPerScreenPixel; 
        ctx.stroke();
        
        ctx.strokeStyle = '#ffffff'; 
        ctx.lineDashOffset = (-this.antsOffset * artUnitsPerScreenPixel) + dashLength; 
        ctx.stroke();
        
        ctx.restore(); 
        this.antsOffset += 0.25; 
        requestAnimationFrame(this.animateAnts);
    }
    
    cancel() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.isDrawing = false;
        this.animating = false;
        
        // Clear selection canvas from drawing ants
        if (document.getElementById('selectionCanvas')) {
            const selCanvas = document.getElementById('selectionCanvas');
            selCanvas.getContext('2d').clearRect(0, 0, selCanvas.width, selCanvas.height);
        }
    }
}
