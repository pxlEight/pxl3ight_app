import BaseTool from './BaseTool.js?cb=103';
import { CONSTANTS } from '../core/Constants.js?cb=103';

export default class FillTool extends BaseTool {
    constructor(context) { 
        super(context); 
        this.isDrawing = false; 
        this.isProcessing = false;
    }

    async floodFill(startX, startY, fillColorHex) {
        if (this.isProcessing) return;
        if (startX < 0 || startX >= this.context.canvasWidth || startY < 0 || startY >= this.context.canvasHeight) return;
        const imgData = this.context.getImageData();
        if (!imgData) return;
        
        let c = fillColorHex.substring(1).split(''); 
        if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]; 
        c = '0x' + c.join('');
        
        const fillR = (c>>16)&255;
        const fillG = (c>>8)&255;
        const fillB = c&255;
        const fillA = 255;
        
        const startPos = (startY * this.context.canvasWidth + startX) * 4;
        const startColor = {
            r: imgData.data[startPos],
            g: imgData.data[startPos+1],
            b: imgData.data[startPos+2],
            a: imgData.data[startPos+3]
        };
        
        if (this.context.opacity === 1.0 && startColor.r === fillR && startColor.g === fillG && startColor.b === fillB && startColor.a === fillA) return;

        this.isProcessing = true;
        
        const points = [];
        this.context.executeWithMirror(startX, startY, (x, y) => {
            if (this.context.isPixelSelected(x, y)) points.push({x, y});
        });
        
        let currentBuffer = imgData.data.buffer;
        
        try {
            for (const pt of points) {
                const result = await this.context.core.worker.runTask('FLOOD_FILL', {
                    buffer: currentBuffer,
                    w: this.context.canvasWidth,
                    h: this.context.canvasHeight,
                    startX: pt.x,
                    startY: pt.y,
                    fillR, fillG, fillB, fillA,
                    alpha: this.context.opacity,
                    isSelectionActive: this.context.core.selection.isActive,
                    selectionMask: this.context.core.selection.mask,
                    startColor
                }, [currentBuffer]);
                currentBuffer = result.data.buffer;
            }
            const newImgData = new ImageData(new Uint8ClampedArray(currentBuffer), this.context.canvasWidth, this.context.canvasHeight);
            this.context.putImageData(newImgData);
            this.context.hasDrawnInBounds = true;
            this.context.commitDrawing();
        } catch (e) {
            console.error("Worker Fill Error", e);
        } finally {
            this.isProcessing = false;
        }
    }
    
    onPointerDown(pos, e) { 
        this.context.startCrosshairTimer(e); 
        this.isDrawing = true; 
    }
    
    onPointerUp(pos, e) {
        if (this.isDrawing && !this.isProcessing) {
            this.floodFill(pos.x, pos.y, this.context.color);
        }
        this.isDrawing = false;
    }
    
    cancel() { this.isDrawing = false; }
}
