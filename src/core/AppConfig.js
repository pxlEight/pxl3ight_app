import { CONSTANTS } from './Constants.js?cb=203';

export default class AppConfig {
    constructor(events) {
        this.events = events;
        this.resolution = '64x64'; 
        this.mirrorMode = CONSTANTS.MIRROR.NONE; 
        this.isSpriteSheetView = false;
        this.isScrubbing = false;
        this.tool = { current: CONSTANTS.TOOLS.PENCIL, shape: CONSTANTS.TOOLS.RECT, opacity: 1.0, brushShape: CONSTANTS.BRUSH_SHAPE.SQUARE, smooth: 0, velocity: 0, soft: 0 };
        this.sizes = { [CONSTANTS.TOOLS.PENCIL]: 1, [CONSTANTS.TOOLS.ERASER]: 1, [CONSTANTS.TOOLS.SHAPE]: 1 };
        this.softness = { [CONSTANTS.TOOLS.PENCIL]: 0, [CONSTANTS.TOOLS.ERASER]: 0, [CONSTANTS.TOOLS.SHAPE]: 0 };
        this.brushShapes = {
            [CONSTANTS.TOOLS.PENCIL]: CONSTANTS.BRUSH_SHAPE.SQUARE,
            [CONSTANTS.TOOLS.ERASER]: CONSTANTS.BRUSH_SHAPE.SQUARE,
            [CONSTANTS.TOOLS.SHAPE]: CONSTANTS.BRUSH_SHAPE.SQUARE
        };
        this.fillTolerance = undefined;
        this.input = {
            isDrawing: false, lastX: -1, lastY: -1, shapeStartX: -1, shapeStartY: -1, 
            marqueeStartX: 0, marqueeStartY: 0, preDrawImageData: null, wandPressTimer: null, 
            isWandLongPress: false, wandStartX: -1, wandStartY: -1, crosshairTimer: null,
            isCrosshairSampling: false, didCrosshairSample: false, lastCrosshairHex: null
        };
        try {
            this.subpixelSmoothing = localStorage.getItem('subpixelSmoothing_v1') === 'true';
        } catch (e) {
            this.subpixelSmoothing = false;
        }
    }
    getActiveToolCategory(toolId = this.tool?.current) {
        if (toolId === CONSTANTS.TOOLS.ERASER) return CONSTANTS.TOOLS.ERASER;
        if ([CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE, CONSTANTS.TOOLS.SHAPE].includes(toolId)) {
            return CONSTANTS.TOOLS.SHAPE;
        }
        return CONSTANTS.TOOLS.PENCIL;
    }
    setResolution(res) { 
        this.resolution = typeof res === 'string' ? res.toLowerCase().replace(/\s+/g, '') : res; 
        this.events.emit('resolutionChanged', this.resolution); 
    }
    setTool(toolId) { 
        this.tool.current = toolId; 
        const cat = this.getActiveToolCategory(toolId);
        if (this.brushShapes && this.brushShapes[cat]) {
            this.tool.brushShape = this.brushShapes[cat];
        }
        if (this.softness && this.softness[cat] !== undefined) {
            this.tool.soft = this.softness[cat];
        }
        this.events.emit('toolChanged', toolId); 
    }
    setSubpixelSmoothing(enabled) {
        this.subpixelSmoothing = !!enabled;
        try {
            localStorage.setItem('subpixelSmoothing_v1', this.subpixelSmoothing ? 'true' : 'false');
        } catch (e) {}
        this.events.emit('subpixelSmoothingChanged', this.subpixelSmoothing);
    }
}
