import EventBus from './core/EventBus.js';
import AppConfig from './core/AppConfig.js';
import HistoryManager from './core/HistoryManager.js';
import StorageManager from './core/StorageManager.js';
import WorkerManager from './core/WorkerManager.js';
import ViewportManager from './rendering/ViewportManager.js';
import SelectionManager from './selection/SelectionManager.js';
import PlaybackController from './animation/PlaybackController.js';
import ToolManager from './tools/ToolManager.js';
import PaletteManager from './ui/PaletteManager.js';
import BrushManager from './ui/BrushManager.js';
import UIManager from './ui/UIManager.js';
import InputManager from './ui/InputManager.js';
import PixelDocument from './models/PixelDocument.js';
import PixelFrame from './models/PixelFrame.js';
import PixelLayer from './models/PixelLayer.js';
import Renderer from './rendering/Renderer.js';
import { CONSTANTS } from './core/Constants.js';
import DrawingTool from './tools/DrawingTool.js';
import ShapeTool from './tools/ShapeTool.js';
import FillTool from './tools/FillTool.js';
import DropperTool from './tools/DropperTool.js';
import WandTool from './tools/WandTool.js';
import MarqueeTool from './tools/MarqueeTool.js';
import PolygonSelectTool from './tools/PolygonSelectTool.js';
import ColorSelectTool from './tools/ColorSelectTool.js';
import LassoSelectTool from './tools/LassoSelectTool.js';
import ZoomTool from './tools/ZoomTool.js';

export default class PixelEditor {
    constructor() {
        this.events = new EventBus(); 
        this.state = new AppConfig(this.events); 
        this.history = new HistoryManager(); 
        this.palette = new PaletteManager(); 
        
        this.bgCanvas = document.getElementById('bgCanvas'); 
        this.mainArtCanvas = document.getElementById('mainArtCanvas'); 
        this.onionCanvas = document.getElementById('onionCanvas');
        this.onionCtx = this.onionCanvas.getContext('2d', { willReadFrequently: true }); 
        
        this.spriteSheetViewCanvas = document.getElementById('spriteSheetViewCanvas');
        this.spriteSheetCtx = this.spriteSheetViewCanvas.getContext('2d', { willReadFrequently: true });
        
        this.scratchCanvas = document.createElement('canvas'); 
        this.scratchCtx = this.scratchCanvas.getContext('2d', { willReadFrequently: true });
        
        this.backupCanvas = document.createElement('canvas'); 
        this.backupCtx = this.backupCanvas.getContext('2d', { willReadFrequently: true });
        
        this.viewport = new ViewportManager(document.getElementById('viewport'), this.bgCanvas, this.events);
        this.selection = new SelectionManager(this); 
        this.playback = new PlaybackController(this); 
        this.tools = new ToolManager(this);
        
        this.worker = new WorkerManager();
        this.storage = new StorageManager(this);
        
        this.doc = null; 
        this.renderer = null;
    }

    init() {
        this.tools.registerTool(CONSTANTS.TOOLS.PENCIL, DrawingTool); 
        this.tools.registerTool(CONSTANTS.TOOLS.ERASER, DrawingTool);
        this.tools.registerTool(CONSTANTS.TOOLS.SHAPE, ShapeTool); 
        this.tools.registerTool(CONSTANTS.TOOLS.LINE, ShapeTool);
        this.tools.registerTool(CONSTANTS.TOOLS.RECT, ShapeTool); 
        this.tools.registerTool(CONSTANTS.TOOLS.ELLIPSE, ShapeTool);
        this.tools.registerTool(CONSTANTS.TOOLS.FILL, FillTool); 
        this.tools.registerTool(CONSTANTS.TOOLS.DROPPER, DropperTool);
        this.tools.registerTool(CONSTANTS.TOOLS.WAND, WandTool); 
        this.tools.registerTool(CONSTANTS.TOOLS.MARQUEE, MarqueeTool);
        this.tools.registerTool(CONSTANTS.TOOLS.POLYGON, PolygonSelectTool);
        this.tools.registerTool(CONSTANTS.TOOLS.COLOR_SELECT, ColorSelectTool);
        this.tools.registerTool(CONSTANTS.TOOLS.LASSO, LassoSelectTool);
        this.tools.registerTool(CONSTANTS.TOOLS.ZOOM, ZoomTool);
        
        this.ui = new UIManager(this);
        this.brushManager = new BrushManager(this);
        this.input = new InputManager(document.getElementById('mainContainer'), this);

        this.events.on('requestToolChange', (tool, isToggle = false) => { 
            if (this.state.isSpriteSheetView) return; 
            if (isToggle && (tool === CONSTANTS.TOOLS.WAND || tool === CONSTANTS.TOOLS.MARQUEE || tool === CONSTANTS.TOOLS.POLYGON || tool === CONSTANTS.TOOLS.COLOR_SELECT) && this.state.tool.current === tool) { 
                this.selection.clear(); 
                return; 
            }
            if (tool !== CONSTANTS.TOOLS.ZOOM) {
                this.selection.anchor(); 
            }
            this.state.setTool(tool); 
            this.tools.setTool(tool);
            this.events.emit('ui:updateTool', tool); 
        });
        
        this.events.on('core:resumeSession', () => this.resumeSession());
        this.events.on('core:startProject', (res) => this.startProject(res));
        this.events.on('core:saveProjectFile', () => this.saveProjectFile());
        this.events.on('core:clearHistoryMemory', () => { 
            this.history.clear(); 
            this.saveState(); 
        });
        this.events.on('core:exportPNG', () => this.exportPNG());
        this.events.on('core:resampleProject', (res) => this.resampleProject(res));
        this.events.on('core:undo', () => this.undo());
        this.events.on('core:redo', () => this.redo());
        this.events.on('core:reframeViewport', () => this.viewport.reframe());
        this.events.on('core:toggleMirror', (mode) => {
            this.state.mirrorMode = (this.state.mirrorMode === mode) ? CONSTANTS.MIRROR.NONE : mode;
            this.events.emit('ui:toggleMirror', this.state.mirrorMode);
        });
        
        this.events.on('core:setBrushShape', (shape) => { this.state.tool.brushShape = shape; });
        this.events.on('core:setHSVColor', (hx) => { this.palette.setCurrentColor(hx); });
        
        this.events.on('core:togglePalettePanel', () => {
            this.events.emit('ui:togglePalettePanel');
        });
        
        this.events.on('core:addCustomColor', (hex) => {
            this.palette.addCustomSwatch(hex);
            this.ui.createSwatch(hex, document.getElementById('customGrid'));
        });
        
        this.events.on('core:toggleSpriteSheetView', () => this.toggleSpriteSheetView());
        this.events.on('core:toggleOnionSkin', () => this.playback.toggleOnionSkin());
        this.events.on('core:togglePlay', () => this.playback.togglePlay());
        
        this.events.on('core:addFrame', () => { 
            this.selection.anchor(); 
            this.doc.addFrame(); 
            this.saveState(); 
        });
        this.events.on('core:copyContextFrame', () => { 
            this.selection.anchor(); 
            this.doc.copyFrame(this.ui.contextMenuFrameIndex); 
            this.saveState(); 
        });
        this.events.on('core:deleteContextFrame', () => { 
            this.selection.anchor(); 
            this.doc.deleteFrame(this.ui.contextMenuFrameIndex); 
            this.saveState(); 
        });
        this.events.on('core:switchFrame', (index) => this.switchFrame(index));
        
        this.events.on('core:toggleActiveLayerVisibility', () => { 
            this.selection.anchor(); 
            const isVis = !this.doc.activeLayer.visible; 
            this.doc.frames.forEach(f => { 
                if(f.layers[this.doc.activeLayerIndex]) {
                    f.layers[this.doc.activeLayerIndex].visible = isVis; 
                }
            }); 
            this.events.emit('layerChanged'); 
            this.events.emit('frameChanged'); 
            this.playback.updateOnionSkin(); 
            if(this.renderer) this.renderer.render(); 
        });
        
        this.events.on('core:toggleActiveLayerLock', () => { 
            const isLocked = !this.doc.activeLayer.locked; 
            this.doc.frames.forEach(f => { 
                if(f.layers[this.doc.activeLayerIndex]) {
                    f.layers[this.doc.activeLayerIndex].locked = isLocked; 
                }
            }); 
            this.events.emit('layerChanged'); 
        });
        
        this.events.on('core:duplicateActiveLayer', () => { 
            this.selection.anchor(); 
            this.doc.duplicateActiveLayer(); 
            this.saveState(); 
        });
        this.events.on('core:mergeLayerDown', () => { 
            this.selection.anchor(); 
            if(this.doc.mergeLayerDown()) {
                this.saveState(); 
            }
        });
        this.events.on('core:addLayer', () => { 
            this.selection.anchor(); 
            this.doc.addLayer(); 
            this.saveState(); 
        });
        this.events.on('core:deleteLayer', () => { 
            this.selection.anchor(); 
            this.doc.deleteLayer(); 
            this.saveState(); 
        });
        this.events.on('core:selectLayer', (idx) => this.selectLayer(idx));
        
        this.events.on('core:radialPaste', () => this.selection.radialPaste());
        this.events.on('core:radialCopy', () => this.selection.radialCopy());
        this.events.on('core:radialDuplicate', () => this.selection.radialDuplicate());
        this.events.on('core:radialFlip', (axis) => this.selection.radialFlip(axis));
        this.events.on('core:radialCut', () => this.selection.radialCut());
        
        this.events.on('core:importImage', (e) => this.importImage(e));
        this.events.on('core:loadProjectFile', (e) => this.loadProjectFile(e));

        this.events.on('layerChanged', () => { 
            this.events.emit('ui:layerChanged'); 
            if (this.renderer) this.renderer.render(); 
        });

        this.events.on('ui:openLayerAdjustMenu', () => {
            if (this.doc.activeLayer.locked) return;
            this.selection.anchor();
            this.layerAdjustOriginalBuffer = this.doc.activeLayer.ctx.getImageData(0, 0, this.doc.width, this.doc.height);
            document.getElementById('la-hsv-h').value = 0;
            document.getElementById('la-hsv-s').value = 0;
            document.getElementById('la-hsv-v').value = 0;
            document.getElementById('la-contrast').value = 0;
            document.getElementById('layerAdjustMenu').style.display = 'flex';
            document.getElementById('la-hsv-h').dispatchEvent(new Event('input'));
        });

        this.events.on('ui:updateLayerAdjust', async () => {
            if (!this.layerAdjustOriginalBuffer) return;
            const hOff = parseInt(document.getElementById('la-hsv-h').value);
            const sOff = parseInt(document.getElementById('la-hsv-s').value);
            const vOff = parseInt(document.getElementById('la-hsv-v').value);
            const contrast = parseInt(document.getElementById('la-contrast').value);
            
            if (this.isAdjustingLayer) return;
            this.isAdjustingLayer = true;
            
            try {
                const buffer = this.layerAdjustOriginalBuffer.data.slice(0).buffer;
                const result = await this.worker.runTask('LAYER_ADJUST', {
                    buffer, hOff, sOff, vOff, contrast
                }, [buffer]);
                
                const newImgData = new ImageData(new Uint8ClampedArray(result.buffer), this.doc.width, this.doc.height);
                this.doc.activeLayer.ctx.putImageData(newImgData, 0, 0);
                this.doc.activeLayer.markModified();
                this.renderer.render();
            } catch (e) {
                console.error("Worker Layer Adjust Error", e);
            } finally {
                this.isAdjustingLayer = false;
            }
        });

        this.events.on('ui:cancelLayerAdjust', () => {
            if (this.layerAdjustOriginalBuffer) {
                this.doc.activeLayer.ctx.putImageData(this.layerAdjustOriginalBuffer, 0, 0);
                this.layerAdjustOriginalBuffer = null;
                this.doc.activeLayer.markModified();
                this.renderer.render();
            }
            document.getElementById('layerAdjustMenu').style.display = 'none';
        });

        this.events.on('ui:applyLayerAdjust', () => {
            if (this.layerAdjustOriginalBuffer) {
                this.layerAdjustOriginalBuffer = null;
                this.saveState();
            }
            document.getElementById('layerAdjustMenu').style.display = 'none';
        });

        this.events.on('frameChanged', () => { 
            this.events.emit('ui:frameChanged'); 
            this.playback.updateOnionSkin();
            if (this.renderer) this.renderer.render(); 
        });
        
        this.storage.init().then(async () => {
            const session = await this.storage.getSavedSession();
            if (session && session.frames && session.frames.length > 0) {
                document.getElementById('btn-resume-session').style.display = 'block';
            }
        }).catch(err => console.warn('IndexedDB Init Failed', err));
    }

    saveState() { 
        this.history.saveState(this.doc, this.selection); 
        if (this.storage) this.storage.scheduleAutoSave(this.doc, this.state, this.palette);
    }

    restoreState(state) {
        let sizeChanged = false;
        if (state.docWidth && state.docHeight && (this.doc.width !== state.docWidth || this.doc.height !== state.docHeight)) {
            this.doc.width = state.docWidth;
            this.doc.height = state.docHeight;
            this.bgCanvas.width = state.docWidth;
            this.bgCanvas.height = state.docHeight;
            this.generateCheckerboard(state.docWidth, state.docHeight);
            this.history.updateMaxSteps(state.docWidth, state.docHeight);
            sizeChanged = true;
        }

        this.doc.frames = state.frames.map(f => {
            const frame = new PixelFrame(0, 0, 0);
            frame.layers = f.layers.map(l => {
                const layer = new PixelLayer(this.doc.width, this.doc.height); 
                layer.ctx.drawImage(l.canvasData, 0, 0);
                layer.visible = l.visible; 
                layer.opacity = l.opacity; 
                layer.locked = l.locked; 
                layer._id = l._id; 
                layer._rev = l._rev; 
                return layer;
            });
            return frame;
        });
        this.doc.currentFrameIndex = state.currentFrameIndex; 
        this.doc.activeLayerIndex = state.activeLayerIndex;
        
        if (state.selectionMask) {
            this.selection.mask = new Uint8Array(state.selectionMask);
            this.selection.rebuildPath();
            this.selection.isActive = this.selection.mask.some(v => v > 0);
        } else {
            this.selection.mask.fill(0);
            this.selection.isActive = false;
            this.selection.rebuildPath();
        }

        if (state.isFloating) {
            this.selection.isFloating = true;
            this.selection.floatingCanvas.width = this.doc.width;
            this.selection.floatingCanvas.height = this.doc.height;
            this.selection.floatingCanvas.getContext('2d').clearRect(0,0,this.doc.width,this.doc.height);
            this.selection.floatingCanvas.getContext('2d').drawImage(state.floatingCanvasData, 0, 0);
            this.selection.floatingCanvas.style.display = 'block';
            
            if (state.origFloatingCanvasData) {
                if (!this.selection.origFloatingCanvas) {
                    this.selection.origFloatingCanvas = document.createElement('canvas');
                }
                this.selection.origFloatingCanvas.width = this.doc.width;
                this.selection.origFloatingCanvas.height = this.doc.height;
                this.selection.origFloatingCanvas.getContext('2d').clearRect(0,0,this.doc.width,this.doc.height);
                this.selection.origFloatingCanvas.getContext('2d').drawImage(state.origFloatingCanvasData, 0, 0);
            }
            
            this.selection.transformMatrix = state.transformMatrix ? DOMMatrix.fromMatrix(state.transformMatrix) : new DOMMatrix();
            this.selection.bounds = state.bounds ? { ...state.bounds } : { minX:0, minY:0, maxX:0, maxY:0 };
            this.selection.origBounds = state.origBounds ? { ...state.origBounds } : { minX:0, minY:0, maxX:0, maxY:0 };
        } else {
            this.selection.isFloating = false;
            this.selection.floatingCanvas.style.display = 'none';
            this.selection.floatingCanvas.getContext('2d').clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
            this.selection.transformMatrix = new DOMMatrix();
            this.selection.origFloatingCanvas = null;
            this.selection.origBounds = null;
        }

        this.selection.updateDragHandle();

        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        
        if (sizeChanged) {
            this.viewport.reframe();
        }
        
        this.renderer.render(); 
        this.events.emit('updateOnionSkin');
        if (this.storage) this.storage.scheduleAutoSave(this.doc, this.state, this.palette);
    }
    
    async resumeSession() {
        const session = await this.storage.getSavedSession();
        if (!session) return;
        
        this.events.emit('ui:hideStartupScreen'); 
        if (this.playback.isPlaying) this.playback.togglePlay();
        
        this.state.setResolution(session.resolution || '64x64'); 
        const [resW, resH] = this.state.resolution.split('x').map(Number);
        
        this.bgCanvas.width = resW; 
        this.bgCanvas.height = resH; 
        this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(resW, resH)})`;
        
        this.selection.init(resW, resH); 
        this.doc = new PixelDocument(resW, resH, this.events); 
        this.renderer = new Renderer(this.doc, this.mainArtCanvas); 
        this.doc.frames = [];
        
        if (session.customSwatches) {
            this.palette.customSwatches = [];
            this.events.emit('ui:clearCustomColors');
            session.customSwatches.forEach(colorStr => this.events.emit('core:addCustomColor', colorStr));
        }
        
        session.frames.forEach((frameData) => {
            const newFrame = new PixelFrame(0, 0, 0);
            frameData.layers.forEach((layerData) => {
                const nl = new PixelLayer(resW, resH); 
                nl.visible = layerData.visible; 
                nl.opacity = layerData.opacity; 
                nl.locked = layerData.locked !== undefined ? layerData.locked : false; 
                
                const imgData = new ImageData(new Uint8ClampedArray(layerData.buffer), resW, resH);
                nl.ctx.putImageData(imgData, 0, 0);
                
                newFrame.layers.push(nl);
            });
            this.doc.frames.push(newFrame);
        });
        
        this.doc.activeLayerIndex = 0; 
        this.doc.currentFrameIndex = 0; 
        this.history.clear(); 
        this.history.updateMaxSteps(resW, resH);
        this.saveState();
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        this.renderer.render(); 
        this.events.emit('ui:closeAllMenus');
    }

    undo() { 
        if (this.state.isSpriteSheetView) this.toggleSpriteSheetView(); 
        const st = this.history.undo(); 
        if(st) this.restoreState(st); 
    }
    
    redo() { 
        if (this.state.isSpriteSheetView) this.toggleSpriteSheetView(); 
        const st = this.history.redo(); 
        if(st) this.restoreState(st); 
    }

    generateCheckerboard(w, h) {
        const tempCanvas = document.createElement('canvas'); 
        tempCanvas.width = w; 
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        const imgData = tempCtx.createImageData(w, h);
        const data = imgData.data;
        
        for (let y = 0; y < h; y++) { 
            for (let x = 0; x < w; x++) { 
                const i = (y * w + x) * 4;
                const isLight = (x % 2 === 0) === (y % 2 === 0);
                const c = isLight ? 255 : 220; 
                data[i] = c; 
                data[i+1] = c; 
                data[i+2] = c; 
                data[i+3] = 255; 
            } 
        }
        tempCtx.putImageData(imgData, 0, 0); 
        return tempCanvas.toDataURL();
    }

    startProject(res) {
        this.events.emit('ui:hideStartupScreen');
        this.state.setResolution(res); 
        
        const [w, h] = res.split('x').map(Number);
        this.bgCanvas.width = w; 
        this.bgCanvas.height = h; 
        this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(w, h)})`;
        
        this.selection.init(w, h); 
        this.doc = new PixelDocument(w, h, this.events); 
        this.renderer = new Renderer(this.doc, this.mainArtCanvas);
        
        this.history.clear(); 
        this.history.updateMaxSteps(w, h);
        this.storage.clearSession();
        this.saveState(); 
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        this.renderer.render();
    }

    loadProjectFile(event) {
        const file = event.target.files[0]; 
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result); 
                if (data.app !== 'pxl3ight') throw new Error("Invalid project file.");
                
                this.events.emit('ui:hideStartupScreen'); 
                if (this.playback.isPlaying) this.playback.togglePlay();
                
                this.state.setResolution(data.resolution || '64x64'); 
                const [resW, resH] = this.state.resolution.split('x').map(Number);
                
                this.bgCanvas.width = resW; 
                this.bgCanvas.height = resH; 
                this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(resW, resH)})`;
                
                this.selection.init(resW, resH); 
                this.doc = new PixelDocument(resW, resH, this.events); 
                this.renderer = new Renderer(this.doc, this.mainArtCanvas); 
                this.doc.frames = [];
                
                if (data.customSwatches) {
                    this.palette.customSwatches = [];
                    this.events.emit('ui:clearCustomColors');
                    data.customSwatches.forEach(colorStr => this.events.emit('core:addCustomColor', PaletteManager.rgbStrToHex(colorStr)));
                }
                
                const imageLoadPromises = [];
                data.frames.forEach((frameData) => {
                    const newFrame = new PixelFrame(0, 0, 0);
                    frameData.layers.forEach((layerData) => {
                        const nl = new PixelLayer(resW, resH); 
                        nl.visible = layerData.visible; 
                        nl.opacity = layerData.opacity; 
                        nl.locked = layerData.locked !== undefined ? layerData.locked : false; 
                        newFrame.layers.push(nl);
                        
                        const promise = new Promise((resolve) => { 
                            const img = new Image(); 
                            img.onload = () => { 
                                nl.ctx.drawImage(img, 0, 0); 
                                resolve(); 
                            }; 
                            img.src = layerData.data; 
                        });
                        imageLoadPromises.push(promise);
                    });
                    this.doc.frames.push(newFrame);
                });
                
                await Promise.all(imageLoadPromises);
                this.doc.activeLayerIndex = 0; 
                this.doc.currentFrameIndex = 0; 
                this.history.clear(); 
                this.history.updateMaxSteps(resW, resH);
                this.storage.clearSession();
                this.saveState();
                this.events.emit('frameChanged'); 
                this.events.emit('layerChanged'); 
                this.viewport.reframe(); 
                this.renderer.render(); 
                this.events.emit('ui:closeAllMenus');
            } catch (err) { 
                alert("Could not load pxl3ight project file."); 
            }
            this.events.emit('ui:resetFileInput');
        };
        reader.readAsText(file);
    }

    saveProjectFile() {
        this.selection.anchor(); 
        if (this.state.isSpriteSheetView) this.toggleSpriteSheetView();
        
        const projectData = {
            app: 'pxl3ight', 
            version: 2, 
            resolution: this.state.resolution, 
            customSwatches: this.palette.customSwatches,
            frames: this.doc.frames.map(frame => ({ 
                layers: frame.layers.map(layer => ({ 
                    visible: layer.visible, 
                    opacity: layer.opacity, 
                    locked: layer.locked, 
                    data: layer.canvas.toDataURL('image/png') 
                })) 
            }))
        };
        
        let fileName = prompt("Name your project file:", `project_${Date.now()}`); 
        if (!fileName) return; 
        if (!fileName.toLowerCase().endsWith('.pxl3')) fileName += '.pxl3';
        
        const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url; 
        a.download = fileName; 
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        URL.revokeObjectURL(url); 
        this.events.emit('ui:closeAllMenus');
    }

    importImage(event) {
        if (!this.doc) return; 
        this.selection.anchor(); 
        const file = event.target.files[0]; 
        if (!file) return; 
        this.events.emit('ui:closeAllMenus');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                if (this.state.isSpriteSheetView) {
                    let drawWidth = this.spriteSheetViewCanvas.width;
                    let drawHeight = img.height * (drawWidth / img.width);
                    let offsetY = (this.spriteSheetViewCanvas.height - drawHeight) / 2;
                    
                    this.spriteSheetCtx.imageSmoothingEnabled = false; 
                    this.spriteSheetCtx.clearRect(0, 0, this.spriteSheetViewCanvas.width, this.spriteSheetViewCanvas.height); 
                    this.spriteSheetCtx.drawImage(img, 0, offsetY, drawWidth, drawHeight);
                    
                    const [frameW, frameH] = this.state.resolution.split('x').map(Number); 
                    this.doc = new PixelDocument(frameW, frameH, this.events); 
                    this.renderer.doc = this.doc; 
                    this.doc.frames = [];
                    
                    for (let i = 0; i < 16; i++) {
                        const col = i % 4;
                        const row = Math.floor(i / 4);
                        const l = new PixelLayer(frameW, frameH); 
                        
                        l.ctx.drawImage(this.spriteSheetViewCanvas, col * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH);
                        const tempImgData = l.ctx.getImageData(0, 0, frameW, frameH).data; 
                        
                        let isEmpty = true; 
                        for (let j = 3; j < tempImgData.length; j += 4) { 
                            if (tempImgData[j] > 0) { 
                                isEmpty = false; break; 
                            } 
                        }
                        
                        if (!isEmpty) { 
                            const f = new PixelFrame(0,0,0); 
                            f.layers = [l]; 
                            this.doc.frames.push(f); 
                        }
                    }
                    if (this.doc.frames.length === 0) {
                        this.doc.frames.push(new PixelFrame(frameW, frameH, 1));
                    }
                    
                    this.history.clear();
                    this.history.updateMaxSteps(frameW, frameH);
                    this.saveState(); 
                    this.events.emit('frameChanged'); 
                    this.events.emit('layerChanged'); 
                    this.events.emit('ui:resetFileInput');
                    return; 
                }
                
                this.doc.activeCtx.imageSmoothingEnabled = false;
                const canvasRatio = this.doc.width / this.doc.height;
                const imgRatio = img.width / img.height;
                
                let drawWidth = this.doc.width;
                let drawHeight = this.doc.height;
                let offsetX = 0;
                let offsetY = 0;
                
                if (imgRatio > canvasRatio) { 
                    drawHeight = this.doc.width / imgRatio; 
                    offsetY = (this.doc.height - drawHeight) / 2; 
                } else { 
                    drawWidth = this.doc.height * imgRatio; 
                    offsetX = (this.doc.width - drawWidth) / 2; 
                }
                
                this.doc.activeCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight); 
                this.doc.activeLayer.markModified();
                
                if (this.renderer) this.renderer.render(); 
                this.saveState(); 
                this.events.emit('frameChanged'); 
                this.playback.updateOnionSkin(); 
                this.events.emit('ui:resetFileInput');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    exportPNG() {
        if (!this.doc) return; 
        this.selection.anchor(); 
        
        let exportCanvas, fileNamePrefix;
        if (this.state.isSpriteSheetView) {
            exportCanvas = document.createElement('canvas'); 
            exportCanvas.width = this.spriteSheetViewCanvas.width; 
            exportCanvas.height = this.spriteSheetViewCanvas.height;
            exportCanvas.getContext('2d').drawImage(this.spriteSheetViewCanvas, 0, 0); 
            fileNamePrefix = 'spritesheet';
        } else {
            exportCanvas = document.createElement('canvas'); 
            exportCanvas.width = this.doc.width; 
            exportCanvas.height = this.doc.height;
            
            const eCtx = exportCanvas.getContext('2d'); 
            this.doc.activeFrame.layers.forEach(l => { 
                if (l.visible) { 
                    eCtx.globalAlpha = l.opacity; 
                    eCtx.drawImage(l.canvas, 0, 0); 
                } 
            }); 
            fileNamePrefix = 'frame';
        }
        
        let fileName = prompt("Name your exported image:", `pxl3ight_${fileNamePrefix}_${Date.now()}`); 
        if (!fileName) return; 
        if (!fileName.toLowerCase().endsWith('.png')) fileName += '.png';
        
        const url = exportCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url; 
        a.download = fileName; 
        
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        this.events.emit('ui:closeAllMenus');
    }

    resampleProject(newRes) {
        if (!this.doc) return; 
        if (this.state.isSpriteSheetView) this.toggleSpriteSheetView(); 
        this.selection.anchor();
        
        this.state.setResolution(newRes); 
        const [newW, newH] = newRes.split('x').map(Number);
        const oldW = this.doc.width;
        const oldH = this.doc.height;
        
        this.bgCanvas.width = newW; 
        this.bgCanvas.height = newH; 
        this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(newW, newH)})`;
        
        this.selection.init(newW, newH); 
        this.doc.width = newW; 
        this.doc.height = newH;
        
        this.doc.frames.forEach(f => {
            f.layers.forEach(l => {
                const tempC = document.createElement('canvas'); 
                tempC.width = oldW; 
                tempC.height = oldH; 
                tempC.getContext('2d').drawImage(l.canvas, 0, 0);
                
                l.canvas.width = newW; 
                l.canvas.height = newH; 
                l.ctx.imageSmoothingEnabled = false; 
                l.ctx.clearRect(0, 0, newW, newH);
                
                let drawWidth = newW;
                let drawHeight = newH;
                let offsetX = 0;
                let offsetY = 0;
                
                if (oldH > oldW && newH === newW) { 
                    drawWidth = newW; 
                    drawHeight = newW * (oldH / oldW); 
                    offsetY = -(drawHeight - newH) / 2; 
                } else if (oldW === oldH && newH > newW) { 
                    drawHeight = newH; 
                    drawWidth = newH * (oldW / oldH); 
                    offsetX = -(drawWidth - newW) / 2; 
                } else { 
                    const canvasRatio = newW / newH;
                    const imgRatio = oldW / oldH; 
                    if (imgRatio > canvasRatio) { 
                        drawHeight = newW / imgRatio; 
                        offsetY = (newH - drawHeight) / 2; 
                    } else { 
                        drawWidth = newH * imgRatio; 
                        offsetX = (newW - drawWidth) / 2; 
                    } 
                }
                
                l.ctx.drawImage(tempC, offsetX, offsetY, drawWidth, drawHeight); 
                l.markModified();
            });
        });
        
        this.history.updateMaxSteps(newW, newH);
        this.saveState(); 
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        if (this.renderer) this.renderer.render(); 
        this.events.emit('ui:closeAllMenus');
    }

    switchFrame(index) {
        if (!this.doc || index < 0 || index >= this.doc.frames.length || this.state.isSpriteSheetView) return;
        
        this.selection.anchor(); 
        this.doc.currentFrameIndex = index;
        
        if (this.doc.activeLayerIndex >= this.doc.activeFrame.layers.length) {
            this.doc.activeLayerIndex = this.doc.activeFrame.layers.length - 1;
        }
        
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.playback.updateOnionSkin(); 
        if (this.renderer) this.renderer.render();
    }

    selectLayer(index) {
        if (!this.doc || index < 0 || index >= this.doc.activeFrame.layers.length) return;
        this.selection.anchor(); 
        this.doc.activeLayerIndex = index; 
        this.events.emit('layerChanged');
    }

    toggleSpriteSheetView() {
        if (!this.doc) return; 
        if (this.playback.isPlaying) this.playback.togglePlay();
        
        this.state.isSpriteSheetView = !this.state.isSpriteSheetView; 
        
        if (this.state.isSpriteSheetView) {
            this.selection.anchor(); 
            this.events.emit('ui:closeAllMenus');
            
            this.spriteSheetViewCanvas.width = this.doc.width * 4; 
            this.spriteSheetViewCanvas.height = this.doc.height * 4;
            this.spriteSheetCtx.clearRect(0, 0, this.spriteSheetViewCanvas.width, this.spriteSheetViewCanvas.height); 
            this.spriteSheetCtx.imageSmoothingEnabled = false;
            
            this.doc.frames.forEach((frame, idx) => {
                if (idx >= 16) return; 
                const col = idx % 4;
                const row = Math.floor(idx / 4);
                frame.layers.forEach(l => { 
                    if (l.visible) { 
                        this.spriteSheetCtx.globalAlpha = l.opacity; 
                        this.spriteSheetCtx.drawImage(l.canvas, col * this.doc.width, row * this.doc.height); 
                    } 
                });
            });
            this.spriteSheetCtx.globalAlpha = 1.0;
            
            this.bgCanvas.width = this.doc.width * 4; 
            this.bgCanvas.height = this.doc.height * 4; 
            this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(this.doc.width * 4, this.doc.height * 4)})`;
            this.viewport.reframe();
        } else {
            this.bgCanvas.width = this.doc.width; 
            this.bgCanvas.height = this.doc.height; 
            this.bgCanvas.style.backgroundImage = `url(${this.generateCheckerboard(this.doc.width, this.doc.height)})`;
            if (this.renderer) this.renderer.render(); 
            this.viewport.reframe();
        }
        
        this.events.emit('ui:toggleSpriteSheet', this.state.isSpriteSheetView);
    }
}
