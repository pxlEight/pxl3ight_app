import { CONSTANTS } from '../core/Constants.js?cb=103';

export default class BrushManager {
    constructor(core) {
        this.core = core;
        this.customBrushes = [];
        this.defaultBrushes = [
            // Round - 100%
            { shape: 'round', size: 2, opacity: 1.0 },
            { shape: 'round', size: 11, opacity: 1.0 },
            { shape: 'round', size: 20, opacity: 1.0 },
            // Round - 35%
            { shape: 'round', size: 2, opacity: 0.35 },
            { shape: 'round', size: 11, opacity: 0.35 },
            { shape: 'round', size: 20, opacity: 0.35 },
            // Square - 100%
            { shape: 'square', size: 2, opacity: 1.0 },
            { shape: 'square', size: 11, opacity: 1.0 },
            { shape: 'square', size: 20, opacity: 1.0 },
            // Square - 35%
            { shape: 'square', size: 2, opacity: 0.35 },
            { shape: 'square', size: 11, opacity: 0.35 },
            { shape: 'square', size: 20, opacity: 0.35 }
        ];

        this.initUI();
        
        this.core.events.on('core:addCustomBrush', () => this.addCurrentBrush());
        this.core.events.on('core:selectBrushSwatch', (brush) => this.selectBrush(brush));
    }

    initUI() {
        const defaultGrid = document.getElementById('brushGrid');
        const customGrid = document.getElementById('customBrushGrid');
        
        if (defaultGrid) defaultGrid.innerHTML = '';
        if (customGrid) customGrid.innerHTML = '';
        
        this.defaultBrushes.forEach(brush => this.createBrushSwatch(brush, defaultGrid));
        this.customBrushes.forEach(brush => this.createBrushSwatch(brush, customGrid));
    }

    createBrushSwatch(brush, container) {
        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.display = 'flex';
        swatch.style.alignItems = 'center';
        swatch.style.justifyContent = 'center';
        swatch.style.backgroundColor = 'var(--widget-bg)';
        swatch.setAttribute('data-action', 'selectBrushSwatch');
        swatch.setAttribute('data-shape', brush.shape);
        swatch.setAttribute('data-size', brush.size);
        swatch.setAttribute('data-opacity', brush.opacity);
        swatch.title = `${brush.shape}, size ${brush.size}, opacity ${Math.round(brush.opacity * 100)}%`;

        // Create icon based on shape and opacity
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "32");
        svg.setAttribute("height", "32");
        svg.setAttribute("viewBox", "0 0 32 32");
        svg.style.pointerEvents = 'none';

        const color = `rgba(255, 255, 255, ${brush.opacity})`;
        const drawSize = Math.min(24, brush.size * 4); // scale visually
        const center = 16;
        const offset = center - (drawSize / 2);

        if (brush.shape === 'round') {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", center);
            circle.setAttribute("cy", center);
            circle.setAttribute("r", drawSize / 2);
            circle.setAttribute("fill", color);
            svg.appendChild(circle);
        } else {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", offset);
            rect.setAttribute("y", offset);
            rect.setAttribute("width", drawSize);
            rect.setAttribute("height", drawSize);
            rect.setAttribute("fill", color);
            svg.appendChild(rect);
        }

        swatch.appendChild(svg);
        container.appendChild(swatch);
    }

    addCurrentBrush() {
        const toolId = this.core.state.tool.current;
        let size = this.core.state.sizes[toolId];
        if (size === undefined) size = this.core.state.sizes[CONSTANTS.TOOLS.PENCIL] || 1;
        
        const brush = {
            shape: this.core.state.tool.brushShape,
            size: size,
            opacity: this.core.state.tool.opacity
        };
        
        // Prevent duplicate custom brushes
        if (!this.customBrushes.some(b => b.shape === brush.shape && b.size === brush.size && b.opacity === brush.opacity)) {
            this.customBrushes.push(brush);
            const grid = document.getElementById('customBrushGrid');
            if (grid) this.createBrushSwatch(brush, grid);
        }
    }

    selectBrush(brush) {
        this.core.events.emit('core:setBrushShape', brush.shape);
        
        const toolId = this.core.state.tool.current;
        if (this.core.state.sizes[toolId] !== undefined) {
            this.core.state.sizes[toolId] = brush.size;
        } else {
            this.core.state.sizes[CONSTANTS.TOOLS.PENCIL] = brush.size;
            this.core.events.emit('requestToolChange', CONSTANTS.TOOLS.PENCIL);
        }
        this.core.state.tool.opacity = brush.opacity;

        // Update UI
        const opacityVal = document.getElementById('opacityVal');
        if (opacityVal) {
            opacityVal.innerText = Math.round(brush.opacity * 100);
        }
    }
}
