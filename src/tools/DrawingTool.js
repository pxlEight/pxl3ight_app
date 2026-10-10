import BaseTool from './BaseTool.js?cb=103';

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
        this.realX = pos.x;
        this.realY = pos.y;
        
        this.drawPixel(pos.x, pos.y); 
        this.context.updateActiveCanvasFromScratch();
        this.context.updateOnionSkin();
    }
    
    onPointerMove(pos, e) {
        if (!this.isDrawing) return;
        
        const smoothVal = this.context.smooth || 0;
        if (smoothVal > 0) {
            const factor = 1 - (smoothVal * 0.0095); // 0 -> 1.0, 100 -> 0.05
            this.realX += (pos.x - this.realX) * factor;
            this.realY += (pos.y - this.realY) * factor;
        } else {
            this.realX = pos.x;
            this.realY = pos.y;
        }
        
        this.drawLine(this.lastX, this.lastY, this.realX, this.realY); 
        this.context.updateActiveCanvasFromScratch();
        this.context.updateOnionSkin();
        
        this.lastX = this.realX; 
        this.lastY = this.realY;
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
