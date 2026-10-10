import BaseTool from './BaseTool.js?cb=104';
import { CONSTANTS } from '../core/Constants.js?cb=104';

export default class LassoSelectTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isDrawing = false;
        this.points = [];
        this.startMask = null;
        this.activeMode = null;
        this.isPointerDown = false;
        
        this.isLongPress = false;
        this.longPressTimer = null;
        this.lastModifierTapTime = 0;
        
        this.hasMoved = false;
        this.isMovingMask = false;
        this.downClient = null;
        
        this.currentX = -1;
        this.currentY = -1;
        this.startX = -1;
        this.startY = -1;
        
        this.animating = false;
        this.antsOffset = 0;
        
        this.animateAnts = this.animateAnts.bind(this);
    }
    
    startMovingMask() {
        this.context.core.events.emit('selection:startMoveMask');
    }
    
    updateMovingMask(pos) {
        this.context.core.events.emit('selection:updateMoveMask', { dx: pos.x - this.startX, dy: pos.y - this.startY });
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
    
    onPointerDown(pos, e) {
        this.isPointerDown = true;
        this.isLongPress = false;
        this.hasMoved = false;
        this.isMovingMask = false;
        this.downClient = { x: e.clientX, y: e.clientY };
        this.startX = pos.x;
        this.startY = pos.y;
        
        const mode = this.context.core.selection.selectionMode || CONSTANTS.SELECT_MODE.REPLACE;
        const isActive = this.context.core.selection.isActive;
        const isInside = this.context.isPixelSelected(pos.x, pos.y);

        const now = Date.now();
        if (this.lastModifierTapTime && (now - this.lastModifierTapTime < 300) && isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = 0;
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            return;
        }

        if (isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = now;
        } else {
            this.lastModifierTapTime = 0;
        }

        if (isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.isMovingMask = true;
            this.longPressTimer = setTimeout(() => {
                this.longPressTimer = null;
                this.isLongPress = true; if (navigator.vibrate) navigator.vibrate(40);
                this.isMovingMask = false;
                this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            }, window.longPressTimer || 500);
        } else {
            if (isActive && !isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
                this.context.core.selection.clear();
            }
            this.startDrawing(pos);
        }
    }
    
    onPointerMove(pos, e) {
        if (!this.isPointerDown) return;
        
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
            if (this.points.length === 0 || Math.hypot(this.points[this.points.length - 1].x - pos.x, this.points[this.points.length - 1].y - pos.y) > 0.5) {
                this.points.push({ x: pos.x, y: pos.y });
            }
            this.currentPoint = { x: pos.x, y: pos.y };
        }
    }
    
    onPointerUp(pos, e) {
        this.isPointerDown = false;
        
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
            this.commitSelection();
        }
        this.isLongPress = false;
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
