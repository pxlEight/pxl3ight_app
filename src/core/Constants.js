export const CONSTANTS = {
    TOOLS: {
        PENCIL: 'pencil',
        ERASER: 'eraser',
        SHAPE: 'shape',
        LINE: 'line',
        RECT: 'rect',
        ELLIPSE: 'ellipse',
        FILL: 'fill',
        DROPPER: 'dropper',
        WAND: 'wand',
        MARQUEE: 'marquee',
        POLYGON: 'polygon',
        COLOR_SELECT: 'colorSelect',
        LASSO: 'lasso',
        ZOOM: 'zoom'
    },
    MIRROR: {
        NONE: 'none',
        H: 'H',
        V: 'V',
        Q: 'Q'
    },
    SELECT_MODE: {
        ADD: 'add',
        SUBTRACT: 'subtract',
        REPLACE: 'replace'
    },
    BRUSH_SHAPE: {
        SQUARE: 'square',
        ROUND: 'round'
    }
};

// Canvas performance tuning.
// cpuBackedCanvases=false lets the browser GPU-accelerate the drawing-path canvases
// (layers, scratch, backup, display, onion) which makes full-size 1280x720 blits cheap.
// Set to true to restore the old CPU-backed behaviour (willReadFrequently) if GPU canvases misbehave on a device.
// NOTE: keep all drawing-path canvases on the same setting; mixing CPU and GPU canvases makes every drawImage upload the whole source.
export const CANVAS_PERF = {
    cpuBackedCanvases: false,
    thumbMaxWidth: 106 // internal width of timeline thumbnail canvases (displayed at 53px)
};

export function canvas2DOptions() {
    return CANVAS_PERF.cpuBackedCanvases ? { willReadFrequently: true } : {};
}
