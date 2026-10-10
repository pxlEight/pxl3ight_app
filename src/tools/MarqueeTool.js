import BaseTool from './BaseTool.js?cb=103';
import { CONSTANTS } from '../core/Constants.js?cb=103';

export default class MarqueeTool extends BaseTool {
    constructor(context) { 
        super(context); 
        this.isDrawing = false; 
        this.startX = -1; 
        this.startY = -1; 
        this.currentX = -1;
        this.currentY = -1;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.hasMoved = false;
        this.startMask = null;
        
        this.animating = false;
        this.antsOffset = 0;
        this.animateAnts = this.animateAnts.bind(this);
    }

    onPointerDown(pos, e) {
        this.isDrawing = false; 
        this.isLongPress = false;
        this.hasMoved = false;
        this.isMovingMask = false;
        this.isPointerDown = true;
        this.startX = pos.x; 
        this.startY = pos.y;
        this.currentX = pos.x;
        this.currentY = pos.y;
        this.downClient = { x: e.clientX, y: e.clientY };
        
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
            if (!this.isDrawing && !this.isLongPress) {
                this.startDrawing({ x: this.startX, y: this.startY });
            }
        }
    }
    
    startDrawing(pos) {
        this.isDrawing = true;
        this.currentX = pos.x;
        this.currentY = pos.y;
        
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
    
    updateDrawing(pos) {
        if (!this.isDrawing) return;
        this.currentX = pos.x;
        this.currentY = pos.y;
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
            } else if (!this.isDrawing && !this.isLongPress) {
                this.startDrawing({ x: this.startX, y: this.startY });
            }
        }
        
        if (this.hasMoved && this.isMovingMask) {
            this.updateMovingMask(pos);
        } else if (this.isDrawing) {
            this.updateDrawing(pos);
        }
    }
    
    onPointerUp(pos, e) {
        if (this.isMovingMask && this.hasMoved) {
            this.updateMovingMask(pos);
        } else if (this.isDrawing) {
            const minX = Math.max(0, Math.min(this.startX, this.currentX));
            const maxX = Math.min(this.context.canvasWidth - 1, Math.max(this.startX, this.currentX));
            const minY = Math.max(0, Math.min(this.startY, this.currentY));
            const maxY = Math.min(this.context.canvasHeight - 1, Math.max(this.startY, this.currentY));
            
            const mask = this.context.getSelectionMask();
            const mode = this.activeMode || CONSTANTS.SELECT_MODE.REPLACE;
            
            for (let i = 0; i < mask.length; i++) {
                mask[i] = this.startMask[i];
            }
            
            const w = this.context.canvasWidth;
            for (let y = minY; y <= maxY; y++) { 
                for (let x = minX; x <= maxX; x++) {
                    if (mode === CONSTANTS.SELECT_MODE.SUBTRACT) {
                        mask[y * w + x] = 0;
                    } else {
                        mask[y * w + x] = 1;
                    }
                }
            }
            this.context.rebuildSelectionPath();
            this.context.core.saveState();
        }

        this.isPointerDown = false;
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        this.isDrawing = false;
        this.isMovingMask = false;
        this.animating = false;
        
        if (document.getElementById('selectionCanvas')) {
            const selCanvas = document.getElementById('selectionCanvas');
            selCanvas.getContext('2d').clearRect(0, 0, selCanvas.width, selCanvas.height);
        }
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
        
        if (this.context.core.selection.path && this.context.core.selection.isActive) {
            ctx.strokeStyle = '#AAAAAA'; 
            ctx.setLineDash([dashLength, dashLength]); 
            ctx.lineDashOffset = -this.antsOffset * artUnitsPerScreenPixel; 
            ctx.stroke(this.context.core.selection.path);
            
            ctx.strokeStyle = '#ffffff'; 
            ctx.lineDashOffset = (-this.antsOffset * artUnitsPerScreenPixel) + dashLength; 
            ctx.stroke(this.context.core.selection.path);
        }
        
        const minX = Math.max(0, Math.min(this.startX, this.currentX));
        const maxX = Math.min(w - 1, Math.max(this.startX, this.currentX));
        const minY = Math.max(0, Math.min(this.startY, this.currentY));
        const maxY = Math.min(h - 1, Math.max(this.startY, this.currentY));
        const rw = maxX - minX + 1;
        const rh = Math.max(1, maxY - minY + 1); 
        
        ctx.beginPath();
        ctx.rect(minX, minY, Math.max(1, rw), rh);
        
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
        
        if (document.getElementById('selectionCanvas')) {
            const selCanvas = document.getElementById('selectionCanvas');
            selCanvas.getContext('2d').clearRect(0, 0, selCanvas.width, selCanvas.height);
        }
    }
}

