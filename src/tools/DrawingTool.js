import BaseTool from './BaseTool.js?cb=171';

export default class DrawingTool extends BaseTool {
    constructor(context) {
        super(context);
        this.isDrawing = false;
        this.lastX = -1;
        this.lastY = -1;
        this.lastTime = 0;
        this.lastScreenX = 0;
        this.lastScreenY = 0;
        this.smoothedSpeed = 0;
        this.currentSize = 1;
    }

    computeDynamicSize(baseSize, speed, velocitySetting) {
        if (!velocitySetting) return baseSize;
        
        // speed is screen pixels per millisecond (px/ms)
        // 1.8 px/ms (1800 px/sec) is considered fast drawing speed
        const s = Math.min(1.0, speed / 1.8);
        
        // deviation from mid-speed (0.5):
        // s = 0 (slow/stopped) -> delta = -1
        // s = 0.5 (medium)     -> delta = 0
        // s = 1.0 (fast)       -> delta = +1
        const delta = (s - 0.5) * 2;
        
        // k in [-1, 1]
        const k = velocitySetting / 100;
        
        // adj in [-1, 1] when |k| = 1:
        // When k > 0 (+100): fast (delta > 0) -> adj < 0 (decreases stroke thickness)
        //                    slow (delta < 0) -> adj > 0 (increases stroke thickness)
        // When k < 0 (-100): fast (delta > 0) -> adj > 0 (increases stroke thickness)
        //                    slow (delta < 0) -> adj < 0 (decreases stroke thickness)
        const adj = -k * delta;
        
        let size;
        if (adj >= 0) {
            // Thickening
            const boost = (baseSize === 1) ? 1.5 : (baseSize * 0.8);
            size = Math.round(baseSize + adj * boost);
        } else {
            // Thinning
            const reduction = (baseSize - 1) * 0.8 + 0.3;
            size = Math.max(1, Math.round(baseSize + adj * reduction));
        }
        
        return Math.max(1, size);
    }

    updateSpeed(e, currentCanvasPos) {
        const now = performance.now();
        const dt = Math.max(5, now - this.lastTime);
        this.lastTime = now;
        
        let dist;
        if (e && e.clientX !== undefined) {
            dist = Math.hypot(e.clientX - this.lastScreenX, e.clientY - this.lastScreenY);
            this.lastScreenX = e.clientX;
            this.lastScreenY = e.clientY;
        } else {
            dist = Math.hypot(currentCanvasPos.x - this.lastX, currentCanvasPos.y - this.lastY);
        }
        
        const instSpeed = dist / dt;
        this.smoothedSpeed = this.smoothedSpeed * 0.35 + instSpeed * 0.65;
        return this.smoothedSpeed;
    }

    onPointerDown(pos, e) {
        this.context.startCrosshairTimer(e); 
        this.context.setupDrawingState();
        
        this.isDrawing = true; 
        this.lastX = pos.x; 
        this.lastY = pos.y;
        this.realX = pos.x;
        this.realY = pos.y;
        
        this.lastTime = performance.now();
        this.lastScreenX = (e && e.clientX !== undefined) ? e.clientX : pos.x;
        this.lastScreenY = (e && e.clientY !== undefined) ? e.clientY : pos.y;
        this.smoothedSpeed = 0;
        
        const baseSize = this.context.getBrushSize();
        const velocitySetting = this.context.velocity || 0;
        this.currentSize = this.computeDynamicSize(baseSize, 0, velocitySetting);
        
        this.drawPixel(pos.x, pos.y, this.currentSize); 
        this.context.updateActiveCanvasFromScratch(true);
    }
    
    onPointerMove(pos, e) {
        if (!this.isDrawing) return;
        
        const speed = this.updateSpeed(e, pos);
        const baseSize = this.context.getBrushSize();
        const velocitySetting = this.context.velocity || 0;
        const newSize = this.computeDynamicSize(baseSize, speed, velocitySetting);
        const startSize = this.currentSize;
        const endSize = newSize;
        this.currentSize = newSize;

        const smoothVal = this.context.smooth || 0;
        if (smoothVal > 0) {
            const factor = 1 - (smoothVal * 0.0095); // 0 -> 1.0, 100 -> 0.05
            this.realX += (pos.x - this.realX) * factor;
            this.realY += (pos.y - this.realY) * factor;
            
            this.drawLine(this.lastX, this.lastY, this.realX, this.realY, startSize, endSize); 
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
                const sampleCount = samples.length;
                for (let i = 0; i < sampleCount; i++) {
                    const p = input.getAdjustedPos(samples[i]);
                    const segStartSize = startSize + (i / sampleCount) * (endSize - startSize);
                    const segEndSize = startSize + ((i + 1) / sampleCount) * (endSize - startSize);
                    this.drawLine(this.lastX, this.lastY, p.x, p.y, segStartSize, segEndSize);
                    this.lastX = p.x; 
                    this.lastY = p.y;
                }
                this.realX = this.lastX;
                this.realY = this.lastY;
            } else {
                this.realX = pos.x;
                this.realY = pos.y;
                this.drawLine(this.lastX, this.lastY, this.realX, this.realY, startSize, endSize); 
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
