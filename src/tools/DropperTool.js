import BaseTool from './BaseTool.js?cb=202';
import { CONSTANTS } from '../core/Constants.js?cb=202';

export default class DropperTool extends BaseTool {
    constructor(context) { super(context); this.isDrawing = false; }

    pickColor(x, y, autoSwitch = false) {
        if (!this.context.isSpriteSheetView && this.context.core.renderer && this.context.core.renderer.renderPending) {
            this.context.core.renderer.renderImmediate();
        }
        const canvas = this.context.isSpriteSheetView ? this.context.core.spriteSheetViewCanvas : this.context.core.mainArtCanvas;
        const ctx = canvas ? canvas.getContext('2d') : null;
        if (!ctx) return;
        
        x = Math.floor(x);
        y = Math.floor(y);
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
        
        const data = ctx.getImageData(x, y, 1, 1).data;
        if (data[3] === 0) return; 
        
        const hex = "#" + (1 << 24 | data[0] << 16 | data[1] << 8 | data[2]).toString(16).slice(1).toUpperCase();
        this.context.pickColor(hex);
        
        if (autoSwitch) {
            this.context.requestToolChange(CONSTANTS.TOOLS.PENCIL);
        }
    }
    
    onPointerDown(pos, e) { 
        this.context.startCrosshairTimer(e, false); 
        this.isDrawing = true; 
    }
    
    onPointerUp(pos, e) { 
        if (this.isDrawing) {
            this.pickColor(pos.x, pos.y, false); 
        }
        this.isDrawing = false; 
    }
    
    cancel() { 
        this.isDrawing = false; 
        if (this.context && this.context.core && this.context.core.state && this.context.core.state.input) {
            if (this.context.core.state.input.crosshairTimer) {
                clearTimeout(this.context.core.state.input.crosshairTimer);
                this.context.core.state.input.crosshairTimer = null;
            }
            if (this.context.core.state.input.isCrosshairSampling) {
                this.context.core.state.input.isCrosshairSampling = false;
                this.context.core.events.emit('ui:hideCrosshair');
                this.context.core.state.input.lastCrosshairHex = null;
            }
        }
    }
}
