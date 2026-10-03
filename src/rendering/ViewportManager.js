export default class ViewportManager {
    constructor(viewportElement, bgCanvasElement, events) {
        this.element = viewportElement; 
        this.bgCanvas = bgCanvasElement; 
        this.events = events;
        this.scale = 1; 
        this.panX = 0; 
        this.panY = 0; 
        this.cachedBgRect = null;
        
        this.updateCache = this.updateCache.bind(this);
        window.addEventListener('resize', this.updateCache); 
        window.addEventListener('orientationchange', this.updateCache);
    }
    updateCache() { 
        if (this.bgCanvas) this.cachedBgRect = this.bgCanvas.getBoundingClientRect(); 
    }
    getMetrics() {
        const containerW = this.bgCanvas.clientWidth;
        const containerH = this.bgCanvas.clientHeight;
        const canvasRatio = this.bgCanvas.width / this.bgCanvas.height;
        const containerRatio = containerW / containerH;
        
        let renderedW = containerW;
        let renderedH = containerH;
        let offsetX = 0;
        let offsetY = 0;
        
        if (canvasRatio > containerRatio) { 
            renderedH = containerW / canvasRatio; 
            offsetY = (containerH - renderedH) / 2; 
        } else { 
            renderedW = containerH * canvasRatio; 
            offsetX = (containerW - renderedW) / 2; 
        }
        return { 
            offsetX, 
            offsetY, 
            renderedW, 
            renderedH, 
            scaleX: renderedW / this.bgCanvas.width, 
            scaleY: renderedH / this.bgCanvas.height 
        };
    }
    getCanvasPos(clientX, clientY) {
        if (!this.cachedBgRect) this.updateCache(); 
        const rect = this.cachedBgRect;
        const canvasRatio = this.bgCanvas.width / this.bgCanvas.height;
        const rectRatio = rect.width / rect.height;
        
        let renderedWidth = rect.width;
        let renderedHeight = rect.height;
        let offsetX = 0;
        let offsetY = 0;
        
        if (canvasRatio > rectRatio) { 
            renderedHeight = rect.width / canvasRatio; 
            offsetY = (rect.height - renderedHeight) / 2; 
        } else { 
            renderedWidth = rect.height * canvasRatio; 
            offsetX = (rect.width - renderedWidth) / 2; 
        }
        
        const scaleX = this.bgCanvas.width / renderedWidth;
        const scaleY = this.bgCanvas.height / renderedHeight;
        const actualLeft = rect.left + offsetX;
        const actualTop = rect.top + offsetY;
        
        return { 
            x: Math.floor((clientX - actualLeft) * scaleX), 
            y: Math.floor((clientY - actualTop) * scaleY) 
        };
    }
    updateTransform() { 
        this.element.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`; 
        this.events.emit('viewportTransformed'); 
        this.updateCache(); 
    }
    reframe() { 
        this.scale = 1; 
        this.panX = 0; 
        this.panY = 0; 
        this.updateTransform(); 
    }
    handlePinchZoom(touches, lastPinchDistance, lastCenterX, lastCenterY) {
        const currentDistance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
        const centerX = (touches[0].clientX + touches[1].clientX) / 2;
        const centerY = (touches[0].clientY + touches[1].clientY) / 2;
        
        if (lastPinchDistance > 0) {
            const zoomFactor = currentDistance / lastPinchDistance;
            const oldScale = this.scale;
            this.scale = Math.min(Math.max(0.1, this.scale * zoomFactor), 10);
            
            const ptX = (lastCenterX - this.panX) / oldScale;
            const ptY = (lastCenterY - this.panY) / oldScale;
            
            this.panX = lastCenterX - ptX * this.scale; 
            this.panY = lastCenterY - ptY * this.scale;
            this.panX += (centerX - lastCenterX); 
            this.panY += (centerY - lastCenterY);
        }
        this.updateTransform(); 
        return { distance: currentDistance, centerX: centerX, centerY: centerY };
    }
}
