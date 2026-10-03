import BaseTool from './BaseTool.js';

export default class DrawingTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isDrawing = false;
        this.lastX = -1;
        this.lastY = -1;
    }

    onPointerDown(pos, e) {
        this.context.startCrosshairTimer(e); 
        this.context.setupDrawingState();
        
        this.isDrawing = true; 
        this.lastX = pos.x; 
        this.lastY = pos.y;
        
        this.drawPixel(pos.x, pos.y); 
        this.context.updateActiveCanvasFromScratch();
        this.context.updateOnionSkin();
    }
    
    onPointerMove(pos, e) {
        if (!this.isDrawing) return;
        
        this.drawLine(this.lastX, this.lastY, pos.x, pos.y); 
        this.context.updateActiveCanvasFromScratch();
        this.context.updateOnionSkin();
        
        this.lastX = pos.x; 
        this.lastY = pos.y;
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
