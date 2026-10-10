import BaseTool from './BaseTool.js?cb=103';
import { CONSTANTS } from '../core/Constants.js?cb=103';

export default class ShapeTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isDrawing = false;
        this.startX = -1;
        this.startY = -1;
    }

    onPointerDown(pos, e) {
        this.context.startCrosshairTimer(e); 
        this.context.setupDrawingState();
        
        this.isDrawing = true; 
        this.startX = pos.x; 
        this.startY = pos.y;
    }
    
    onPointerMove(pos, e) {
        if (!this.isDrawing) return;
        
        this.context.scratchCtx.clearRect(0, 0, this.context.scratchCanvas.width, this.context.scratchCanvas.height);
        
        if (this.context.shape === CONSTANTS.TOOLS.LINE) {
            this.drawLine(this.startX, this.startY, pos.x, pos.y);
        } else if (this.context.shape === CONSTANTS.TOOLS.RECT) {
            const minX = Math.min(this.startX, pos.x);
            const maxX = Math.max(this.startX, pos.x);
            const minY = Math.min(this.startY, pos.y);
            const maxY = Math.max(this.startY, pos.y);
            
            this.drawLine(minX, minY, maxX, minY); 
            this.drawLine(maxX, minY, maxX, maxY); 
            this.drawLine(maxX, maxY, minX, maxY); 
            this.drawLine(minX, maxY, minX, minY);
        } else if (this.context.shape === CONSTANTS.TOOLS.ELLIPSE) {
            this.drawEllipse(this.startX, this.startY, pos.x, pos.y);
        }
        
        this.context.updateActiveCanvasFromScratch();
        this.context.updateOnionSkin();
    }
    
    onPointerUp(pos, e) {
        if (this.isDrawing) { 
            this.context.commitDrawing();
        }
        this.isDrawing = false;
    }
    
    cancel() {
        if (this.isDrawing) {
            this.context.cancelDrawing();
            this.isDrawing = false;
        }
    }
}
