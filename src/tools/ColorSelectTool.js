import BaseTool from './BaseTool.js';
import { CONSTANTS } from '../core/Constants.js';

export default class ColorSelectTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isWandLongPress = false;
        this.wandPressTimer = null;
        this.startX = -1;
        this.startY = -1;
        this.isProcessing = false;
    }

    async doColorSelect(startX, startY, mode) {
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
        
        if (startColor.a === 0) return; // Don't select empty space
        await this._performColorSelect(imgData, w, h, startColor, mode);
    }

    async doColorSelectHex(hex, mode) {
        if (this.isProcessing) return;
        
        const imgData = this.context.getImageData();
        if (!imgData) return;
        
        const w = this.context.canvasWidth;
        const h = this.context.canvasHeight;
        
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const startColor = { r, g, b, a: 255 };
        
        await this._performColorSelect(imgData, w, h, startColor, mode);
    }

    async _performColorSelect(imgData, w, h, startColor, mode) {
        this.isProcessing = true;
        if (mode === CONSTANTS.SELECT_MODE.REPLACE) this.context.clearSelectionMask();
        
        const buffer = imgData.data.buffer.slice(0);
        const currentMask = this.context.getSelectionMask().slice(0);
        
        try {
            const result = await this.context.core.worker.runTask('COLOR_SELECT', {
                buffer, w, h, mode, startColor, currentMask
            }, [buffer, currentMask.buffer]);
            
            this.context.core.selection.mask = new Uint8Array(result.mask.buffer);
            this.context.rebuildSelectionPath();
            this.context.core.saveState();
        } catch (e) {
            console.error("Worker Color Select Error", e);
        } finally {
            this.isProcessing = false;
        }
    }
    
    onPointerDown(pos, e) {
        this.isPointerDown = true;
        this.startX = pos.x; 
        this.startY = pos.y;
        this.downClient = { x: e.clientX, y: e.clientY };
        this.hasMoved = false;
        
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
            this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            return;
        }
        
        if (isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.lastModifierTapTime = now;
        } else {
            this.lastModifierTapTime = 0;
        }
        
        if (isActive && isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
            this.longPressTimer = setTimeout(() => {
                this.longPressTimer = null;
                this.isModifierUIPress = true;
                this.context.core.events.emit('selection:showModifierUI', { clientX: e.clientX, clientY: e.clientY });
            }, window.longPressTimer || 500);
        } else {
            if (isActive && !isInside && mode === CONSTANTS.SELECT_MODE.REPLACE) {
                this.context.core.selection.clear();
            }
            this.context.startCrosshairTimer(e, true);
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
        }
    }
    
    onPointerUp(pos, e) {
        if (!this.isPointerDown) return;
        this.isPointerDown = false;
        
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        if (this.isModifierUIPress) {
            this.isModifierUIPress = false;
            return;
        }
        
        if (!this.hasMoved) {
            this.doColorSelect(this.startX, this.startY, this.activeMode);
        }
    }
    
    cancel() { 
        this.isPointerDown = false;
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
}
