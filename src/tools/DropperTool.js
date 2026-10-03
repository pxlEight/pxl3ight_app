import BaseTool from './BaseTool.js';
import { CONSTANTS } from '../core/Constants.js';

export default class DropperTool extends BaseTool {
    constructor(context) { super(context); this.isDrawing = false; }

    pickColor(x, y, autoSwitch = true) {
        const imgData = this.context.getImageData();
        if (!imgData) return;
        
        if (x < 0 || x >= this.context.canvasWidth || y < 0 || y >= this.context.canvasHeight) return;
        
        const startPos = (y * this.context.canvasWidth + x) * 4;
        const data = imgData.data;
        if (data[startPos+3] === 0) return; 
        
        const hex = "#" + (1 << 24 | data[startPos] << 16 | data[startPos+1] << 8 | data[startPos+2]).toString(16).slice(1).toUpperCase();
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
            this.pickColor(pos.x, pos.y, true); 
        }
        this.isDrawing = false; 
    }
    
    cancel() { this.isDrawing = false; }
}
