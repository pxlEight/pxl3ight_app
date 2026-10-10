import BaseTool from './BaseTool.js?cb=103';

export default class ZoomTool extends BaseTool {
    constructor(context) {
        super(context);
        this.anchorX = null;
        this.anchorY = null;
        this.initialScale = null;
        this.initialPanX = null;
        this.initialPanY = null;
    }

    onPointerDown(pos, e) {
        this.anchorX = e.clientX;
        this.anchorY = e.clientY;
        
        const viewport = this.context.core.viewport;
        this.initialScale = viewport.scale;
        this.initialPanX = viewport.panX;
        this.initialPanY = viewport.panY;
    }

    onPointerMove(pos, e) {
        if (this.anchorX === null || this.anchorY === null) return;
        
        const dx = e.clientX - this.anchorX;
        const dy = e.clientY - this.anchorY;
        const dist = Math.hypot(dx, dy);
        
        // Dragging generally upwards (or rightwards) zooms in. Dragging downwards zooms out.
        // We use the sign of -dy (up is positive) or if purely horizontal, dx (right is positive).
        const direction = (Math.abs(dy) >= Math.abs(dx)) ? Math.sign(-dy) : Math.sign(dx);
        
        // Use exponential zoom factor
        const zoomFactor = Math.pow(1.005, dist * (direction || 1));
        
        const viewport = this.context.core.viewport;
        
        // Clamp scale between 0.1x and 10x
        const newScale = Math.min(Math.max(0.1, this.initialScale * zoomFactor), 10);
        viewport.scale = newScale;
        
        // Keep the anchor point fixed under the touch point
        const ptX = (this.anchorX - this.initialPanX) / this.initialScale;
        const ptY = (this.anchorY - this.initialPanY) / this.initialScale;
        
        viewport.panX = this.anchorX - ptX * viewport.scale;
        viewport.panY = this.anchorY - ptY * viewport.scale;
        
        viewport.updateTransform();
    }

    onPointerUp(pos, e) {
        this.anchorX = null;
        this.anchorY = null;
    }

    cancel() {
        this.anchorX = null;
        this.anchorY = null;
    }
}
