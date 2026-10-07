import BaseTool from './BaseTool.js';
import { CONSTANTS } from '../core/Constants.js';

export default class WandTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isWandLongPress = false;
        this.wandPressTimer = null;
        this.startX = -1;
        this.startY = -1;
        this.isProcessing = false;
    }

    async doFloodSelect(startX, startY, mode) {
        if (this.isProcessing) return;
        
        const imgData = this.context.getImageData();
        if (!imgData) return;
        
        const w = this.context.canvasWidth;
        const h = this.context.canvasHeight;
        const startPos = (startY * w + startX) * 4;
        
        const startColor = {
            r: imgData.data[startPos],
            g: imgData.data[startPos+1],
            b: imgData.data[startPos+2],
            a: imgData.data[startPos+3]
        };
        
        this.isProcessing = true;
        if (mode === CONSTANTS.SELECT_MODE.REPLACE) this.context.clearSelectionMask();
        
        const buffer = imgData.data.buffer.slice(0);
        const currentMask = this.context.getSelectionMask().slice(0);
        
        try {
            const result = await this.context.core.worker.runTask('WAND_SELECT', {
                buffer, w, h, startX, startY, mode, startColor, currentMask
            }, [buffer, currentMask.buffer]);
            
            this.context.core.selection.mask = new Uint8Array(result.mask.buffer);
            this.context.rebuildSelectionPath();
            this.context.core.saveState();
        } catch (e) {
            console.error("Worker Wand Error", e);
        } finally {
            this.isProcessing = false;
        }
    }
    
    onPointerDown(pos, e) {
        this.isWandLongPress = false; 
        this.isPointerDown = true;
        this.hasMoved = false;
        this.isMovingMask = false;
        this.startX = pos.x; 
        this.startY = pos.y;
        this.downClient = { x: e.clientX, y: e.clientY };
        
        const mode = this.context.core.selection.selectionMode || CONSTANTS.SELECT_MODE.REPLACE;
        this.activeMode = mode;
        const isActive = this.context.core.selection.isActive;
        const isInside = this.context.isPixelSelected(pos.x, pos.y);
        
        const now = Date.now();
        if (this.lastModifierTapTime && (now - this.lastModifierTapTime < 300) && isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = 0;
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            if (this.doubleTapWaitTimer) {
                clearTimeout(this.doubleTapWaitTimer);
                this.doubleTapWaitTimer = null;
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
                this.isWandLongPress = true; if (navigator.vibrate) navigator.vibrate(window.longPressTimer || 500); 
                this.longPressTimer = null;
                this.isMovingMask = false;
                if (this.doubleTapWaitTimer) {
                    clearTimeout(this.doubleTapWaitTimer);
                    this.doubleTapWaitTimer = null;
                }
                this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            }, window.longPressTimer || 500);
        } else {
            if (isActive && !isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
                this.context.core.selection.clear();
            }
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
        }
    }
    
    onPointerUp(pos, e) {
        if (!this.isPointerDown) return;
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
        
        if (!this.isWandLongPress && !this.hasMoved) {
            const mode = this.activeMode || CONSTANTS.SELECT_MODE.REPLACE;
            const isActive = this.context.core.selection.isActive;
            const isInside = this.context.isPixelSelected(this.startX, this.startY);
            
            if (isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
                this.doubleTapWaitTimer = setTimeout(() => {
                    this.doubleTapWaitTimer = null;
                    this.doFloodSelect(this.startX, this.startY, mode);
                }, 300);
            } else {
                this.doFloodSelect(this.startX, this.startY, mode);
            }
        }
    }
    
    cancel() { 
        this.isPointerDown = false;
        if (this.longPressTimer) { 
            clearTimeout(this.longPressTimer); 
            this.longPressTimer = null; 
        } 
        if (this.doubleTapWaitTimer) {
            clearTimeout(this.doubleTapWaitTimer);
            this.doubleTapWaitTimer = null;
        }
    }
}
