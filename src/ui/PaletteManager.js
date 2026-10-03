export default class PaletteManager {
    constructor() {
        this.currentColor = '#000000'; 
        this.customSwatches = [];
        this.swatchesColors = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#800080', '#8D5524', '#FFCDB2'];
        this.greyscaleColors = ['#000000', '#242424', '#494949', '#6D6D6D', '#929292', '#B6B6B6', '#DBDBDB', '#FFFFFF'];
    }
    setCurrentColor(hex) { 
        this.currentColor = hex; 
    }
    addCustomSwatch(hex) { 
        if (!this.customSwatches.includes(hex)) this.customSwatches.push(hex); 
    }
    setCustomSwatches(swatches) { 
        this.customSwatches = [...swatches]; 
    }
    static hexToRgb(hex) { 
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); 
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 255, g: 255, b: 255 }; 
    }
    static rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h, s = max === 0 ? 0 : d / max, v = max;
        if (max === min) {
            h = 0; 
        } else { 
            switch (max) { 
                case r: h = (g - b) / d + (g < b ? 6 : 0); break; 
                case g: h = (b - r) / d + 2; break; 
                case b: h = (r - g) / d + 4; break; 
            } 
            h /= 6; 
        }
        return { h: Math.round(h * 360), s: s, v: v };
    }
    static hsvToHex(h, s, v) {
        let r, g, b; 
        const i = Math.floor(h / 60);
        const f = h / 60 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        switch (i % 6) { 
            case 0: r = v, g = t, b = p; break; 
            case 1: r = q, g = v, b = p; break; 
            case 2: r = p, g = v, b = t; break; 
            case 3: r = p, g = q, b = v; break; 
            case 4: r = t, g = p, b = v; break; 
            case 5: r = v, g = p, b = q; break; 
        }
        const toHex = x => { 
            const hex = Math.round(x * 255).toString(16); 
            return hex.length === 1 ? '0' + hex : hex; 
        }; 
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }
    static rgbStrToHex(rgb) {
        if(rgb.startsWith('#')) return rgb.toUpperCase(); 
        const rgbArr = rgb.match(/\d+/g); 
        if(!rgbArr) return '#FFFFFF';
        
        const toHex = x => { 
            const hex = parseInt(x).toString(16); 
            return hex.length === 1 ? '0' + hex : hex; 
        }; 
        return `#${toHex(rgbArr[0])}${toHex(rgbArr[1])}${toHex(rgbArr[2])}`.toUpperCase();
    }
    static getSliderGradients(h, s, v) {
        return {
            hTrack: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            sTrack: `linear-gradient(to right, ${PaletteManager.hsvToHex(h, 0, v)}, ${PaletteManager.hsvToHex(h, 1, v)})`,
            vTrack: `linear-gradient(to right, #000000, ${PaletteManager.hsvToHex(h, s, 1)})`
        };
    }
}
