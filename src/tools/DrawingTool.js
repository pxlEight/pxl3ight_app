import BaseTool from './BaseTool.js?cb=158';

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
        this.context.updateActiveCanvasFromScratch(true);
    }
    
    onPointerMove(pos, e) {
        if (!this.isDrawing) return;
        
        const smoothVal = this.context.smooth || 0;
        if (smoothVal > 0) {
            const factor = 1 - (smoothVal * 0.0095); // 0 -> 1.0, 100 -> 0.05
            this.realX += (pos.x - this.realX) * factor;
            this.realY += (pos.y - this.realY) * factor;
            
            this.drawLine(this.lastX, this.lastY, this.realX, this.realY); 
            this.lastX = this.realX; 
            this.lastY = this.realY;
        } else {
            // Replay every sub-frame sample the OS reported since the last event.
            let samples = null;
            if (e && typeof e.getCoalescedEvents === 'function') {
                const coalesced = e.getCoalescedEvents();
                if (coalesced && coalesced.length > 1) samples = coalesced;
            }
            
            if (samples) {
                const input = this.context.core.input;
                for (let i = 0; i < samples.length; i++) {
                    const p = input.getAdjustedPos(samples[i]);
                    this.drawLine(this.lastX, this.lastY, p.x, p.y);
                    this.lastX = p.x; 
                    this.lastY = p.y;
                }
                this.realX = this.lastX;
                this.realY = this.lastY;
            } else {
                this.realX = pos.x;
                this.realY = pos.y;
                this.drawLine(this.lastX, this.lastY, this.realX, this.realY); 
                this.lastX = this.realX; 
                this.lastY = this.realY;
            }
        }
        
        this.context.updateActiveCanvasFromScratch(true);
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
