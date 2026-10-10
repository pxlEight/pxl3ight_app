import { CONSTANTS } from './Constants.js?cb=103';

export default class AppConfig {
    constructor(events) {
        this.events = events;
        this.resolution = '64x64'; 
        this.mirrorMode = CONSTANTS.MIRROR.NONE; 
        this.isSpriteSheetView = false;
        this.tool = { current: CONSTANTS.TOOLS.PENCIL, shape: CONSTANTS.TOOLS.RECT, opacity: 1.0, brushShape: CONSTANTS.BRUSH_SHAPE.SQUARE, smooth: 0 };
        this.sizes = { [CONSTANTS.TOOLS.PENCIL]: 1, [CONSTANTS.TOOLS.ERASER]: 1, [CONSTANTS.TOOLS.SHAPE]: 1 };
        this.input = {
            isDrawing: false, lastX: -1, lastY: -1, shapeStartX: -1, shapeStartY: -1, 
            marqueeStartX: 0, marqueeStartY: 0, preDrawImageData: null, wandPressTimer: null, 
            isWandLongPress: false, wandStartX: -1, wandStartY: -1, crosshairTimer: null,
            isCrosshairSampling: false, didCrosshairSample: false, lastCrosshairHex: null
        };
    }
    setResolution(res) { 
        this.resolution = res; 
        this.events.emit('resolutionChanged', res); 
    }
    setTool(toolId) { 
        this.tool.current = toolId; 
        this.events.emit('toolChanged', toolId); 
    }
}
