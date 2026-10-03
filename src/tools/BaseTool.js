export default class BaseTool {
    constructor(context) { 
        this.context = context; 
    }
    
    onPointerDown(pos, e) {} 
    onPointerMove(pos, e) {} 
    onPointerUp(pos, e) {} 
    cancel() {}
    
    drawPixel(cx, cy) { 
        this.context.executeWithMirror(Math.round(cx), Math.round(cy), (x, y) => this.context.drawPixelToScratch(x, y)); 
    }
    
    drawLine(x0, y0, x1, y1) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, e2; 
        
        while (true) { 
            this.drawPixel(x0, y0); 
            if (x0 === x1 && y0 === y1) break; 
            e2 = 2 * err; 
            if (e2 >= dy) { err += dy; x0 += sx; } 
            if (e2 <= dx) { err += dx; y0 += sy; } 
        }
    }
    
    drawEllipse(x0, y0, x1, y1) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        let a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
        let dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a;
        let err = dx + dy + b1 * a * a, e2; 
        
        if (x0 > x1) { x0 = x1; x1 += a; } 
        if (y0 > y1) y0 = y1; 
        
        y0 += (b + 1) / 2; y1 = y0 - b1; 
        a *= 8 * a; b1 = 8 * b * b;
        
        do {
            this.drawPixel(x1, y0); this.drawPixel(x0, y0); 
            this.drawPixel(x0, y1); this.drawPixel(x1, y1); 
            e2 = 2 * err;
            if (e2 <= dy) { y0++; y1--; err += dy += a; } 
            if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; } 
        } while (x0 <= x1);
        
        while (y0 - y1 < b) { 
            this.drawPixel(x0 - 1, y0); this.drawPixel(x1 + 1, y0++); 
            this.drawPixel(x0 - 1, y1); this.drawPixel(x1 + 1, y1--); 
        }
    }
}
