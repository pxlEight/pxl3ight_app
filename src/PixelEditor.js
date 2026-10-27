import EventBus from './core/EventBus.js?cb=171';
import AppConfig from './core/AppConfig.js?cb=171';
import HistoryManager from './core/HistoryManager.js?cb=171';
import StorageManager from './core/StorageManager.js?cb=171';
import WorkerManager from './core/WorkerManager.js?cb=171';
import ViewportManager from './rendering/ViewportManager.js?cb=171';
import SelectionManager from './selection/SelectionManager.js?cb=171';
import PlaybackController from './animation/PlaybackController.js?cb=171';
import ToolManager from './tools/ToolManager.js?cb=171';
import PaletteManager from './ui/PaletteManager.js?cb=171';
import BrushManager from './ui/BrushManager.js?cb=171';
import UIManager from './ui/UIManager.js?cb=171';
import InputManager from './ui/InputManager.js?cb=171';
import PixelDocument from './models/PixelDocument.js?cb=171';
import PixelFrame from './models/PixelFrame.js?cb=171';
import PixelLayer, { bumpVerCounter } from './models/PixelLayer.js?cb=171';
import Renderer from './rendering/Renderer.js?cb=171';
import GpuLayerAdjust from './rendering/GpuLayerAdjust.js?cb=171';
import { CONSTANTS, canvas2DOptions } from './core/Constants.js?cb=171';
import DrawingTool from './tools/DrawingTool.js?cb=171';
import ShapeTool from './tools/ShapeTool.js?cb=171';
import FillTool from './tools/FillTool.js?cb=171';
import DropperTool from './tools/DropperTool.js?cb=171';
import WandTool from './tools/WandTool.js?cb=171';
import MarqueeTool from './tools/MarqueeTool.js?cb=171';
import PolygonSelectTool from './tools/PolygonSelectTool.js?cb=171';
import ColorSelectTool from './tools/ColorSelectTool.js?cb=171';
import LassoSelectTool from './tools/LassoSelectTool.js?cb=171';
import ZoomTool from './tools/ZoomTool.js?cb=171';

export default class PixelEditor {
    constructor() {
        this.events = new EventBus(); 
        this.state = new AppConfig(this.events); 
        this.history = new HistoryManager(); 
        this.palette = new PaletteManager(); 
        
        this.bgCanvas = document.getElementById('bgCanvas'); 
        this.mainArtCanvas = document.getElementById('mainArtCanvas'); 
        this.onionCanvas = document.getElementById('onionCanvas');
        this.onionCtx = this.onionCanvas.getContext('2d', canvas2DOptions()); 
        
        this.spriteSheetViewCanvas = document.getElementById('spriteSheetViewCanvas');
        this.spriteSheetCtx = this.spriteSheetViewCanvas.getContext('2d', { willReadFrequently: true });
        
        this.scratchCanvas = document.createElement('canvas'); 
        this.scratchCtx = this.scratchCanvas.getContext('2d', canvas2DOptions());
        
        this.backupCanvas = document.createElement('canvas'); 
        this.backupCtx = this.backupCanvas.getContext('2d', canvas2DOptions());
        
        this.viewport = new ViewportManager(document.getElementById('viewport'), this.bgCanvas, this.events, this);
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
        this.events.on('core:saveState', () => this.saveState());
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
        
        this.events.on('core:toggleBrushPanel', () => {
            this.events.emit('ui:toggleBrushPanel');
        });
        
        this.events.on('core:addCustomColor', (hex) => {
            this.palette.addCustomSwatch(hex);
            this.ui.createSwatch(hex, document.getElementById('customGrid'));
        });
        
        this.events.on('core:toggleSpriteSheetView', () => this.toggleSpriteSheetView());
        this.events.on('core:toggleOnionSkin', () => this.playback.toggleOnionSkin());
        this.events.on('core:togglePlay', () => this.playback.togglePlay());
        this.events.on('subpixelSmoothingChanged', () => this.updateCanvasSmoothing());
        
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
        this.events.on('core:copyLayerFrame', (layerIdx, frameIdx) => {
            this.selection.anchor();
            this.doc.copyLayerFrame(layerIdx, frameIdx);
            this.saveState();
        });
        this.events.on('core:deleteContextFrame', () => { 
            this.selection.anchor(); 
            this.doc.deleteFrame(this.ui.contextMenuFrameIndex); 
            this.saveState(); 
        });
        this.events.on('core:addLayerFrame', (layerIdx) => {
            this.selection.anchor();
            this.doc.addLayerFrame(layerIdx);
            this.saveState();
        });
        this.events.on('core:deleteLayerFrame', (layerIdx, frameIdx) => {
            this.selection.anchor();
            this.doc.deleteLayerFrame(layerIdx, frameIdx);
            this.saveState();
        });
        this.events.on('core:switchFrame', (index) => this.switchFrame(index));
        this.events.on('core:startScrubbing', () => this.startScrubbing());
        this.events.on('core:finishScrubbing', () => this.finishScrubbing());
        
        this.events.on('core:toggleActiveLayerVisibility', () => { 
            this.selection.anchor(); 
            const isVis = !this.doc.activeLayer.visible; 
            this.doc.frames.forEach(f => { 
                if(f.layers[this.doc.activeLayerIndex]) {
                    f.layers[this.doc.activeLayerIndex].visible = isVis; 
                }
            }); 
            this.saveState();
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
            this.saveState();
            this.events.emit('layerChanged'); 
        });

        this.events.on('core:setLayerOpacity', ({ index, opacity }) => {
            if (!this.doc) return;
            const targetIdx = index !== undefined ? index : this.doc.activeLayerIndex;
            if (targetIdx < 0 || targetIdx >= this.doc.activeFrame.layers.length) return;
            this.doc.frames.forEach(f => {
                if (f.layers[targetIdx]) {
                    f.layers[targetIdx].opacity = opacity;
                }
            });
            this.playback.updateOnionSkin();
            if (this.renderer) this.renderer.render();
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
            
            // Upload the original pixels to the GPU once; each slider tick then only re-runs the shader.
            if (!this.gpuAdjust) this.gpuAdjust = new GpuLayerAdjust();
            this.gpuAdjustReady = this.gpuAdjust.setSource(this.layerAdjustOriginalBuffer);
            
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
            
            if (this.gpuAdjustReady) {
                const gpuResult = this.gpuAdjust.process({ hOff, sOff, vOff, contrast });
                if (gpuResult) {
                    this.doc.activeLayer.ctx.putImageData(gpuResult, 0, 0);
                    this.doc.activeLayer.markModified();
                    this.renderer.render();
                    return;
                }
                // GPU failed (e.g. context lost): permanently use the worker for this session.
                this.gpuAdjustReady = false;
            }
            
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
            if (this.gpuAdjust) this.gpuAdjust.release();
            this.gpuAdjustReady = false;
            document.getElementById('layerAdjustMenu').style.display = 'none';
        });

        this.events.on('ui:applyLayerAdjust', () => {
            if (this.layerAdjustOriginalBuffer) {
                this.layerAdjustOriginalBuffer = null;
                this.saveState();
            }
            if (this.gpuAdjust) this.gpuAdjust.release();
            this.gpuAdjustReady = false;
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
            this.renderCheckerboard(state.docWidth, state.docHeight);
            this.history.updateMaxSteps(state.docWidth, state.docHeight, this.doc.frames ? this.doc.frames.length : 1, (this.doc.activeFrame ? this.doc.activeFrame.layers.length : 1));
            sizeChanged = true;
        }

        const canMutateInPlace = this.doc.frames && this.doc.frames.length === state.frames.length &&
            this.doc.frames.every((f, fi) => f.layers.length === state.frames[fi].layers.length);

        if (canMutateInPlace) {
            for (let fi = 0; fi < state.frames.length; fi++) {
                const sFrame = state.frames[fi];
                const dFrame = this.doc.frames[fi];
                for (let li = 0; li < sFrame.layers.length; li++) {
                    const sLayer = sFrame.layers[li];
                    const dLayer = dFrame.layers[li];
                    const wasDeleted = dLayer.isDeleted || false;
                    const nextDeleted = sLayer.isDeleted || false;
                    dLayer.visible = sLayer.visible;
                    dLayer.opacity = sLayer.opacity;
                    dLayer.locked = sLayer.locked;
                    dLayer.isDeleted = nextDeleted;
                    dLayer.holdCount = sLayer.holdCount || 1;
                    dLayer._name = sLayer._name;
                    delete dLayer._cachedOriginIndex;

                    if (dLayer._id !== sLayer._id || dLayer._rev !== sLayer._rev || wasDeleted !== nextDeleted) {
                        dLayer._rev = sLayer._rev;
                        dLayer._id = sLayer._id;
                        if (!sLayer.isDeleted && sLayer.canvasData) {
                            if (dLayer._canvas) {
                                dLayer.ctx.clearRect(0, 0, this.doc.width, this.doc.height);
                                if (sLayer.canvasData instanceof ImageData) {
                                    dLayer.ctx.putImageData(sLayer.canvasData, 0, 0);
                                    dLayer._snapshot = sLayer.canvasData;
                                    dLayer._snapshotRev = sLayer._rev;
                                } else {
                                    dLayer.ctx.drawImage(sLayer.canvasData, 0, 0);
                                    dLayer._snapshot = null;
                                    dLayer._snapshotRev = -1;
                                }
                                dLayer._buffer = null;
                            } else {
                                if (sLayer.canvasData instanceof ImageData) {
                                    dLayer._buffer = sLayer.canvasData;
                                    dLayer._snapshot = sLayer.canvasData;
                                    dLayer._snapshotRev = sLayer._rev;
                                } else {
                                    dLayer.ctx.clearRect(0, 0, this.doc.width, this.doc.height);
                                    dLayer.ctx.drawImage(sLayer.canvasData, 0, 0);
                                    dLayer._buffer = null;
                                    dLayer._snapshot = null;
                                    dLayer._snapshotRev = -1;
                                }
                            }
                        } else {
                            if (typeof dLayer.destroy === 'function') {
                                dLayer.destroy();
                            } else {
                                if (dLayer._canvas) {
                                    dLayer.ctx.clearRect(0, 0, this.doc.width, this.doc.height);
                                }
                                dLayer._buffer = null;
                                dLayer._snapshot = null;
                            }
                            dLayer._snapshotRev = sLayer._rev;
                        }
                        dLayer._ver = bumpVerCounter(sLayer._rev);
                    }
                }
            }
        } else {
            this.doc.frames = state.frames.map((f, fi) => {
                const frame = new PixelFrame(0, 0, 0);
                frame.layers = f.layers.map(l => {
                    const layer = new PixelLayer(this.doc.width, this.doc.height); 
                    if (!l.isDeleted && l.canvasData) {
                        const isDormant = Math.abs(fi - state.currentFrameIndex) > 2;
                        if (isDormant && (l.canvasData instanceof ImageData)) {
                            layer._buffer = l.canvasData;
                            layer._snapshot = l.canvasData;
                            layer._snapshotRev = l._rev;
                        } else {
                            if (l.canvasData instanceof ImageData) {
                                layer.ctx.putImageData(l.canvasData, 0, 0);
                                layer._snapshot = l.canvasData;
                                layer._snapshotRev = l._rev;
                            } else {
                                layer.ctx.drawImage(l.canvasData, 0, 0);
                            }
                        }
                    } else if (!l.isDeleted) {
                        layer._snapshot = null;
                        layer._snapshotRev = l._rev;
                    }
                    layer.visible = l.visible; 
                    layer.opacity = l.opacity; 
                    layer.locked = l.locked; 
                    layer.isDeleted = l.isDeleted || false;
                    layer.holdCount = l.holdCount || 1;
                    layer._id = l._id;
                    layer._name = l._name; 
                    layer._rev = l._rev; 
                    layer._ver = bumpVerCounter(l._rev);
                    return layer;
                });
                return frame;
            });
        }
        this.doc.currentFrameIndex = state.currentFrameIndex; 
        this.doc.activeLayerIndex = state.activeLayerIndex;
        this.doc.virtualizeFrames(this.playback?.onionFramesBefore ?? 2, this.playback?.onionFramesAfter ?? 2);
        
        if (state.selectionMask) {
            this.selection.mask = new Uint8Array(state.selectionMask);
            this.selection.rebuildPath();
        } else {
            if (this.selection.isActive && this.selection.mask) {
                this.selection.mask.fill(0);
            }
            this.selection.isActive = false;
            this.selection.path = new Path2D();
            this.selection.bounds = { minX: 9999, minY: 9999, maxX: -1, maxY: -1 };
            this.selection.updateDragHandle();
        }

        if (state.isFloating) {
            this.selection.isFloating = true;
            this.selection.floatingCanvas.width = this.doc.width;
            this.selection.floatingCanvas.height = this.doc.height;
            this.selection.floatingCanvas.getContext('2d').clearRect(0,0,this.doc.width,this.doc.height);
            if (state.floatingCanvasData instanceof ImageData) {
                this.selection.floatingCanvas.getContext('2d').putImageData(state.floatingCanvasData, 0, 0);
            } else if (state.floatingCanvasData) {
                this.selection.floatingCanvas.getContext('2d').drawImage(state.floatingCanvasData, 0, 0);
            }
            this.selection.floatingCanvas.style.display = 'block';
            
            if (state.origFloatingCanvasData) {
                if (!this.selection.origFloatingCanvas) {
                    this.selection.origFloatingCanvas = document.createElement('canvas');
                }
                this.selection.origFloatingCanvas.width = this.doc.width;
                this.selection.origFloatingCanvas.height = this.doc.height;
                this.selection.origFloatingCanvas.getContext('2d').clearRect(0,0,this.doc.width,this.doc.height);
                if (state.origFloatingCanvasData instanceof ImageData) {
                    this.selection.origFloatingCanvas.getContext('2d').putImageData(state.origFloatingCanvasData, 0, 0);
                } else if (state.origFloatingCanvasData) {
                    this.selection.origFloatingCanvas.getContext('2d').drawImage(state.origFloatingCanvasData, 0, 0);
                }
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
            this.updateCanvasSmoothing();
            this.events.emit('ui:updateSubpixelUI');
        }
        
        if (this.renderer && typeof this.renderer.clearFrameCache === 'function') {
            this.renderer.clearFrameCache();
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
        this.renderCheckerboard(resW, resH);
        
        this.doc = new PixelDocument(resW, resH, this.events); 
        this.renderer = new Renderer(this.doc, this.mainArtCanvas, this); 
        this.selection.init(resW, resH); 
        this.doc.frames = [];
        
        if (session.customSwatches) {
            this.palette.customSwatches = [];
            this.events.emit('ui:clearCustomColors');
            session.customSwatches.forEach(colorStr => this.events.emit('core:addCustomColor', colorStr));
        }
        
        const shouldVirtualizeOnLoad = (resW * resH >= 500000) || (session.frames.length > 15 && resW * resH >= 65536);
        const loadPromises = [];
        session.frames.forEach((frameData, fi) => {
            const newFrame = new PixelFrame(0, 0, 0);
            frameData.layers.forEach((layerData) => {
                const nl = new PixelLayer(resW, resH); 
                nl.visible = layerData.visible; 
                nl.opacity = layerData.opacity; 
                nl.locked = layerData.locked !== undefined ? layerData.locked : false; 
                nl.isDeleted = layerData.isDeleted || false;
                nl.holdCount = layerData.holdCount || 1;
                if (layerData._id) nl._id = layerData._id;
                if (layerData._rev) {
                    nl._rev = layerData._rev;
                    nl._ver = bumpVerCounter(layerData._rev);
                }
                
                if (!nl.isDeleted) {
                    if (layerData.blob) {
                        const p = new Promise(resolve => {
                            const img = new Image();
                            const url = URL.createObjectURL(layerData.blob);
                            img.onload = () => {
                                nl.ctx.drawImage(img, 0, 0);
                                if (shouldVirtualizeOnLoad && fi > 2) nl.dehydrate();
                                URL.revokeObjectURL(url);
                                resolve();
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(url);
                                resolve();
                            };
                            img.src = url;
                        });
                        loadPromises.push(p);
                    } else if (layerData.buffer) {
                        const imgData = new ImageData(new Uint8ClampedArray(layerData.buffer), resW, resH);
                        if (shouldVirtualizeOnLoad && fi > 2) {
                            nl._buffer = imgData;
                            nl._snapshot = imgData;
                            nl._snapshotRev = nl._rev;
                        } else {
                            nl.ctx.putImageData(imgData, 0, 0);
                        }
                    }
                }
                
                newFrame.layers.push(nl);
            });
            this.doc.frames.push(newFrame);
        });
        
        if (loadPromises.length > 0) {
            await Promise.all(loadPromises);
        }
        this.doc.virtualizeFrames();
        
        this.doc.activeLayerIndex = 0; 
        this.doc.currentFrameIndex = 0; 
        this.history.clear(); 
        this.history.updateMaxSteps(resW, resH, session.frames.length, (session.frames[0]?.layers?.length || 1));
        this.saveState();
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        this.renderer.render(); 
        this.updateCanvasSmoothing();
        this.events.emit('ui:updateSubpixelUI');
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

    updateCanvasSmoothing() {
        const docW = this.doc ? this.doc.width : (this.bgCanvas ? this.bgCanvas.width : 0);
        const docH = this.doc ? this.doc.height : (this.bgCanvas ? this.bgCanvas.height : 0);
        const isSmoothing = !!this.state.subpixelSmoothing && (Math.max(docW, docH) >= 720);
        const canvases = [this.mainArtCanvas, this.bgCanvas, this.onionCanvas, this.floatingCanvas];
        canvases.forEach(cvs => {
            if (cvs) cvs.style.imageRendering = isSmoothing ? 'auto' : 'pixelated';
        });
        if (this.renderer) {
            this.renderer.targetCtx.imageSmoothingEnabled = isSmoothing;
            this.renderer.render();
        }
        if (this.onionCtx) {
            this.onionCtx.imageSmoothingEnabled = isSmoothing;
        }
    }

    renderCheckerboard(width, height) {
        if (!this.bgCanvas) return;
        const w = width || this.bgCanvas.width || (this.doc ? this.doc.width : 64);
        const h = height || this.bgCanvas.height || (this.doc ? this.doc.height : 64);
        if (this.bgCanvas.width !== w) this.bgCanvas.width = w;
        if (this.bgCanvas.height !== h) this.bgCanvas.height = h;

        this.bgCanvas.style.backgroundImage = 'none';

        const ctx = this.bgCanvas.getContext('2d');
        if (!ctx) return;

        let checkSize = 8;
        const minDim = Math.min(w, h);
        if (minDim <= 16) checkSize = 2;
        else if (minDim <= 32) checkSize = 4;
        else if (minDim >= 640) checkSize = 16;
        else checkSize = 8;

        if (!this._checkerCanvasCache) this._checkerCanvasCache = {};
        if (!this._checkerCanvasCache[checkSize]) {
            const pSize = checkSize * 2;
            const pCanvas = document.createElement('canvas');
            pCanvas.width = pSize;
            pCanvas.height = pSize;
            const pCtx = pCanvas.getContext('2d');
            pCtx.fillStyle = '#ffffff';
            pCtx.fillRect(0, 0, pSize, pSize);
            pCtx.fillStyle = '#dcdcdc';
            pCtx.fillRect(0, 0, checkSize, checkSize);
            pCtx.fillRect(checkSize, checkSize, checkSize, checkSize);
            this._checkerCanvasCache[checkSize] = pCanvas;
        }

        const pattern = ctx.createPattern(this._checkerCanvasCache[checkSize], 'repeat');
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
    }

    generateCheckerboard(w, h) {
        this.renderCheckerboard(w, h);
        return '';
    }

    startProject(res) {
        this.events.emit('ui:hideStartupScreen');
        this.state.setResolution(res); 
        
        const [w, h] = this.state.resolution.split('x').map(Number);
        this.bgCanvas.width = w; 
        this.bgCanvas.height = h; 
        this.renderCheckerboard(w, h);
        
        this.doc = new PixelDocument(w, h, this.events); 
        this.renderer = new Renderer(this.doc, this.mainArtCanvas, this);
        this.selection.init(w, h);
        
        this.history.clear(); 
        this.history.updateMaxSteps(w, h, this.doc.frames ? this.doc.frames.length : 1, (this.doc.activeFrame ? this.doc.activeFrame.layers.length : 1));
        this.storage.clearSession();
        this.saveState(); 
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        this.renderer.render();
        this.updateCanvasSmoothing();
        this.events.emit('ui:updateSubpixelUI');
    }

    loadProjectFile(event) {
        const file = event.target.files[0]; 
        if (!file) return;
        
        this.projectName = file.name.replace(/(\.pxl3|\.json|\.pxl3\.json)$/gi, '');
        
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
                this.renderCheckerboard(resW, resH);
                
                this.doc = new PixelDocument(resW, resH, this.events); 
                this.renderer = new Renderer(this.doc, this.mainArtCanvas, this); 
                this.selection.init(resW, resH); 
                this.doc.frames = [];
                
                if (data.customSwatches) {
                    this.palette.customSwatches = [];
                    this.events.emit('ui:clearCustomColors');
                    data.customSwatches.forEach(colorStr => this.events.emit('core:addCustomColor', PaletteManager.rgbStrToHex(colorStr)));
                }
                
                const shouldVirtualizeOnLoad = (resW * resH >= 500000) || (data.frames.length > 15 && resW * resH >= 65536);
                const imageLoadPromises = [];
                data.frames.forEach((frameData, fi) => {
                    const newFrame = new PixelFrame(0, 0, 0);
                    frameData.layers.forEach((layerData) => {
                        const nl = new PixelLayer(resW, resH); 
                        nl.visible = layerData.visible; 
                        nl.opacity = layerData.opacity; 
                        nl.locked = layerData.locked !== undefined ? layerData.locked : false; 
                        nl.isDeleted = layerData.isDeleted || false;
                        nl.holdCount = layerData.holdCount || 1;
                        newFrame.layers.push(nl);
                        
                        if (!nl.isDeleted && layerData.data) {
                            const promise = new Promise((resolve) => { 
                                const img = new Image(); 
                                img.onload = () => { 
                                    nl.ctx.drawImage(img, 0, 0); 
                                    if (shouldVirtualizeOnLoad && fi > 2) nl.dehydrate();
                                    resolve(); 
                                }; 
                                img.onerror = () => resolve();
                                img.src = layerData.data; 
                            });
                            imageLoadPromises.push(promise);
                        }
                    });
                    this.doc.frames.push(newFrame);
                });
                
                if (imageLoadPromises.length > 0) {
                    await Promise.all(imageLoadPromises);
                }
                this.doc.virtualizeFrames();
                this.doc.activeLayerIndex = 0; 
                this.doc.currentFrameIndex = 0; 
                this.history.clear(); 
                this.history.updateMaxSteps(resW, resH, data.frames.length, (data.frames[0]?.layers?.length || 1));
                this.storage.clearSession();
                this.saveState();
                this.events.emit('frameChanged'); 
                this.events.emit('layerChanged'); 
                this.viewport.reframe(); 
                this.renderer.render(); 
                this.updateCanvasSmoothing();
                this.events.emit('ui:updateSubpixelUI');
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
                layers: frame.layers.map(layer => {
                    let dataUrl = null;
                    if (!layer.isDeleted && layer.hasContent) {
                        const src = layer._canvas || (layer.isDehydrated && this.renderer ? this.renderer.getDehydratedLayerCanvas(layer) : layer.canvas);
                        if (src) dataUrl = src.toDataURL('image/png');
                    }
                    return { 
                        visible: layer.visible, 
                        opacity: layer.opacity, 
                        locked: layer.locked, 
                        isDeleted: layer.isDeleted || false,
                        holdCount: layer.holdCount || 1,
                        data: dataUrl
                    };
                }) 
            }))
        };
        this.doc.virtualizeFrames();
        
        let defaultName = this.projectName ? this.projectName : `project_${Date.now()}`;
        let fileName = prompt("Name your project file:", defaultName); 
        if (!fileName) return; 
        if (!fileName.toLowerCase().endsWith('.pxl3')) fileName += '.pxl3';
        
        this.projectName = fileName.replace(/(\.pxl3|\.json|\.pxl3\.json)$/gi, '');
        
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
                    this.history.updateMaxSteps(frameW, frameH, this.doc.frames ? this.doc.frames.length : 1, (this.doc.activeFrame ? this.doc.activeFrame.layers.length : 1));
                    this.doc.virtualizeFrames();
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
        
        const isSpriteSheet = this.state.isSpriteSheetView;
        const totalFrames = this.doc.frames.length;
        
        const modal = document.createElement('div');
        modal.id = 'exportModal';
        modal.style.cssText = 'position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; justify-content:center; align-items:center;';
        
        const content = document.createElement('div');
        content.style.cssText = 'background:var(--ui-bg, #333); padding:20px; border-radius:8px; display:flex; flex-direction:column; gap:15px; color:white; min-width: 250px; font-family: sans-serif; max-height: 80vh; overflow-y: auto;';
        
        const step1 = document.createElement('div');
        step1.style.display = isSpriteSheet ? 'none' : 'flex';
        step1.style.flexDirection = 'column';
        step1.style.gap = '10px';
        step1.innerHTML = `
            <div style="margin-bottom: 5px; padding-bottom: 15px; border-bottom: 1px solid #555; display: flex; flex-direction: column; gap: 10px;">
                <h3 style="margin:0 0 5px 0;">Export Movie</h3>
                <button id="expMovieBtn" class="startup-btn" style="background-color: var(--accent);">Export</button>
            </div>
            <h3 style="margin:0 0 10px 0;">Export Frame Range</h3>
            <label style="display:flex; justify-content:space-between; align-items:center;">Start Frame: <input type="number" id="expStart" value="1" min="1" max="${totalFrames}" style="width:60px; padding:4px;"></label>
            <label style="display:flex; justify-content:space-between; align-items:center;">End Frame: <input type="number" id="expEnd" value="${totalFrames}" min="1" max="${totalFrames}" style="width:60px; padding:4px;"></label>
            <button id="expOkayBtn" class="startup-btn" style="margin-top:10px;">Okay</button>
            <button id="expCancel1Btn" class="startup-btn" style="margin-top:5px; background:transparent; border:1px solid #777;">Cancel</button>
        `;
        
        const defaultName = this.projectName || 'Untitled01';
        const step2 = document.createElement('div');
        step2.style.display = isSpriteSheet ? 'flex' : 'none';
        step2.style.flexDirection = 'column';
        step2.style.gap = '10px';
        step2.innerHTML = `
            <h3 style="margin:0 0 10px 0;">Export Options</h3>
            <div style="display:flex; align-items:center; gap:5px;">
                <input type="text" id="expFilename" value="${defaultName}" style="flex:1; padding:4px;">
                <span>.png</span>
            </div>
            ${isSpriteSheet ? '' : '<label style="display:flex; align-items:center; gap:5px;"><input type="checkbox" id="expZip"> .zip (all frames zipped)</label>'}
            <button id="expFinalBtn" class="startup-btn" style="margin-top:10px;">Okay</button>
            <button id="expCancel2Btn" class="startup-btn" style="margin-top:5px; background:transparent; border:1px solid #777;">Cancel</button>
        `;

        const step3 = document.createElement('div');
        step3.style.display = 'none';
        step3.style.flexDirection = 'column';
        step3.style.gap = '10px';
        step3.innerHTML = `
            <h3 style="margin:0 0 10px 0;" id="expStatus">Processing...</h3>
            <button id="expShareBtn" class="startup-btn" style="margin-top:10px; display:none; background-color:var(--accent);">Export</button>
            <button id="expCloseBtn" class="startup-btn" style="margin-top:5px; background:transparent; border:1px solid #777; display:none;">Close</button>
        `;
        
        content.appendChild(step1);
        content.appendChild(step2);
        content.appendChild(step3);
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        const removeModal = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        
        if (!isSpriteSheet) {
            document.getElementById('expCancel1Btn').onclick = removeModal;
            document.getElementById('expOkayBtn').onclick = () => {
                step1.style.display = 'none';
                step2.style.display = 'flex';
            };
            document.getElementById('expMovieBtn').onclick = async () => {
                let start = Math.max(1, parseInt(document.getElementById('expStart').value, 10));
                let end = Math.min(totalFrames, parseInt(document.getElementById('expEnd').value, 10));
                if (start > end) { const temp = start; start = end; end = temp; }
                
                step1.style.display = 'none';
                step3.style.display = 'flex';
                document.getElementById('expStatus').innerText = "Recording Movie...";
                
                const baseName = this.projectName || 'Untitled01';
                const fps = this.playback && this.playback.fps ? this.playback.fps : 12;
                
                const scale = Math.max(1, Math.ceil(512 / Math.max(this.doc.width, this.doc.height)));
                const exportCanvas = document.createElement('canvas'); 
                exportCanvas.width = this.doc.width * scale; 
                exportCanvas.height = this.doc.height * scale;
                const eCtx = exportCanvas.getContext('2d'); 
                eCtx.imageSmoothingEnabled = false;
                
                let mimeType = 'video/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }
                
                const stream = exportCanvas.captureStream(0);
                const track = stream.getVideoTracks()[0];
                const recorder = new MediaRecorder(stream, { mimeType });
                const chunks = [];
                recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${baseName}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    removeModal();
                };
                
                recorder.start();
                
                let currentFrameIndex = start - 1;
                
                const drawNextFrame = () => {
                    if (currentFrameIndex > end - 1) {
                        recorder.stop();
                        this.doc.virtualizeFrames();
                        return;
                    }
                    
                    const f = this.doc.frames[currentFrameIndex];
                    eCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
                    
                    for (let li = f.layers.length - 1; li >= 0; li--) {
                        let layerToDraw = f.layers[li];
                        if (layerToDraw.isDeleted) {
                            for (let k = currentFrameIndex - 1; k >= 0; k--) {
                                const prevLayer = this.doc.frames[k].layers[li];
                                if (!prevLayer.isDeleted) {
                                    if (k + (prevLayer.holdCount || 1) > currentFrameIndex) {
                                        layerToDraw = prevLayer;
                                    }
                                    break;
                                }
                            }
                        }
                        if (layerToDraw && layerToDraw.visible && !layerToDraw.isDeleted && layerToDraw.hasContent) { 
                            eCtx.globalAlpha = layerToDraw.opacity; 
                            if (layerToDraw._canvas) {
                                eCtx.drawImage(layerToDraw._canvas, 0, 0, exportCanvas.width, exportCanvas.height); 
                            } else if (layerToDraw.isDehydrated) {
                                const src = this.renderer.getDehydratedLayerCanvas(layerToDraw);
                                if (src) eCtx.drawImage(src, 0, 0, exportCanvas.width, exportCanvas.height);
                            }
                        }
                    }
                    if (track && track.requestFrame) track.requestFrame();
                    currentFrameIndex++;
                    setTimeout(drawNextFrame, 1000 / fps);
                };
                
                drawNextFrame();
            };
        }
        
        document.getElementById('expCancel2Btn').onclick = removeModal;
        document.getElementById('expFinalBtn').onclick = async () => {
            const baseName = document.getElementById('expFilename').value || 'Untitled01';
            const doZip = document.getElementById('expZip') ? document.getElementById('expZip').checked : false;
            
            let start = 1, end = totalFrames;
            if (!isSpriteSheet) {
                start = Math.max(1, parseInt(document.getElementById('expStart').value, 10));
                end = Math.min(totalFrames, parseInt(document.getElementById('expEnd').value, 10));
                if (start > end) { const temp = start; start = end; end = temp; }
            }
            
            step2.style.display = 'none';
            step3.style.display = 'flex';
            
            let finalFiles = [];
            let finalTitle = baseName;
            
            if (isSpriteSheet) {
                const exportCanvas = document.createElement('canvas'); 
                exportCanvas.width = this.spriteSheetViewCanvas.width; 
                exportCanvas.height = this.spriteSheetViewCanvas.height;
                exportCanvas.getContext('2d').drawImage(this.spriteSheetViewCanvas, 0, 0); 
                
                const blob = await new Promise(r => exportCanvas.toBlob(r, 'image/png'));
                finalFiles = [new File([blob], `${baseName}.png`, { type: 'image/png' })];
            } else {
                const exportCanvas = document.createElement('canvas'); 
                exportCanvas.width = this.doc.width; 
                exportCanvas.height = this.doc.height;
                const eCtx = exportCanvas.getContext('2d'); 
                
                const framesToExport = [];
                for (let i = start - 1; i <= end - 1; i++) {
                    const f = this.doc.frames[i];
                    eCtx.clearRect(0, 0, this.doc.width, this.doc.height);
                    
                    for (let li = f.layers.length - 1; li >= 0; li--) {
                        let layerToDraw = f.layers[li];
                        if (layerToDraw.isDeleted) {
                            for (let k = i - 1; k >= 0; k--) {
                                const prevLayer = this.doc.frames[k].layers[li];
                                if (!prevLayer.isDeleted) {
                                    if (k + (prevLayer.holdCount || 1) > i) {
                                        layerToDraw = prevLayer;
                                    }
                                    break;
                                }
                            }
                        }
                        if (layerToDraw && layerToDraw.visible && !layerToDraw.isDeleted && layerToDraw.hasContent) { 
                            eCtx.globalAlpha = layerToDraw.opacity; 
                            if (layerToDraw._canvas) {
                                eCtx.drawImage(layerToDraw._canvas, 0, 0); 
                            } else if (layerToDraw.isDehydrated) {
                                const src = this.renderer.getDehydratedLayerCanvas(layerToDraw);
                                if (src) eCtx.drawImage(src, 0, 0);
                            }
                        }
                    }
                    const blob = await new Promise(res => exportCanvas.toBlob(res, 'image/png'));
                    framesToExport.push({ index: framesToExport.length + 1, blob });
                }
                exportCanvas.width = 0;
                exportCanvas.height = 0;
                this.doc.virtualizeFrames();
                
                const getBlobs = () => Promise.resolve(framesToExport);
                
                if (doZip) {
                    document.getElementById('expStatus').innerText = "Loading zip engine...";
                    if (!window.JSZip) {
                        try {
                            await new Promise((res, rej) => {
                                const script = document.createElement('script');
                                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                                script.onload = res;
                                script.onerror = rej;
                                document.head.appendChild(script);
                            });
                        } catch (e) {
                            console.error("Failed to load JSZip", e);
                        }
                    }

                    if (window.JSZip) {
                        document.getElementById('expStatus').innerText = "Zipping files...";
                        const zip = new window.JSZip();
                        const blobs = await getBlobs();
                        blobs.forEach(b => {
                            const idxStr = b.index.toString().padStart(3, '0');
                            zip.file(`${baseName}_${idxStr}.png`, b.blob);
                        });
                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        finalTitle = `${baseName}.zip`;
                        finalFiles = [new File([zipBlob], finalTitle, { type: 'application/zip' })];
                    } else {
                        // Fallback to individual files if JSZip failed to load
                        document.getElementById('expStatus').innerText = "Preparing images...";
                        const blobs = await getBlobs();
                        finalFiles = blobs.map(b => {
                            const idxStr = b.index.toString().padStart(3, '0');
                            return new File([b.blob], `${baseName}_${idxStr}.png`, { type: 'image/png' });
                        });
                    }
                } else {
                    document.getElementById('expStatus').innerText = "Preparing images...";
                    const blobs = await getBlobs();
                    finalFiles = blobs.map(b => {
                        const idxStr = b.index.toString().padStart(3, '0');
                        return new File([b.blob], `${baseName}_${idxStr}.png`, { type: 'image/png' });
                    });
                }
            }
            
            document.getElementById('expStatus').style.display = 'none';
            document.getElementById('expShareBtn').style.display = 'block';
            document.getElementById('expCloseBtn').style.display = 'block';
            
            document.getElementById('expShareBtn').onclick = async () => {
                let shared = false;
                if (navigator.canShare && navigator.canShare({ files: finalFiles })) {
                    try { 
                        await navigator.share({ files: finalFiles, title: finalTitle }); 
                        shared = true;
                    } catch(e) {
                        console.error("Share failed", e);
                    }
                } 
                
                removeModal();
                this.events.emit('ui:closeAllMenus');
                
                if (!shared && finalFiles.length > 0) {
                    for (const f of finalFiles) {
                        const url = URL.createObjectURL(f);
                        const a = document.createElement('a'); a.href = url; a.download = f.name;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }
                    
                    const toast = document.createElement('div');
                    toast.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: var(--ui-bg); border: 2px solid var(--accent); padding: 16px 48px; border-radius: 8px; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.8); text-align: center; backdrop-filter: blur(8px); width: max-content;';
                    toast.innerHTML = `<div style="font-weight: bold; margin-bottom: 0px; font-size: 16px; color: white;">Check Your Device Downloads Folder.</div>`;
                    document.body.appendChild(toast);
                    
                    setTimeout(() => {
                        if (toast.parentNode) toast.parentNode.removeChild(toast);
                    }, 3000);
                }
            };
            
            document.getElementById('expCloseBtn').onclick = () => {
                removeModal();
                this.events.emit('ui:closeAllMenus');
            };
        };
    }

    resampleProject(newRes) {
        if (!this.doc) return; 
        if (this.state.isSpriteSheetView) this.toggleSpriteSheetView(); 
        this.selection.anchor();
        
        this.state.setResolution(newRes); 
        const [newW, newH] = this.state.resolution.split('x').map(Number);
        const oldW = this.doc.width;
        const oldH = this.doc.height;
        
        this.bgCanvas.width = newW; 
        this.bgCanvas.height = newH; 
        this.renderCheckerboard(newW, newH);
        
        this.selection.init(newW, newH); 
        
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

        const tempC = document.createElement('canvas'); 
        tempC.width = oldW; 
        tempC.height = oldH; 
        const tempCtx = tempC.getContext('2d');
        const shouldVirtualize = (newW * newH >= 500000) || (this.doc.frames.length > 15 && newW * newH >= 65536);
        const curIdx = this.doc.currentFrameIndex;

        this.doc.frames.forEach((f, fi) => {
            f.layers.forEach(l => {
                const wasDeleted = l.isDeleted;
                if (wasDeleted || !l.hasContent) {
                    l.width = newW;
                    l.height = newH;
                    if (l._canvas) {
                        l._canvas.width = newW;
                        l._canvas.height = newH;
                        l.ctx.imageSmoothingEnabled = false;
                        l.ctx.clearRect(0, 0, newW, newH);
                    }
                    l._buffer = null;
                    l.markModified();
                    l._snapshot = null;
                    l._snapshotRev = l._rev;
                    if (wasDeleted) l.isDeleted = true;
                    return;
                }

                tempCtx.clearRect(0, 0, oldW, oldH);
                const src = l._canvas || (l.isDehydrated && this.renderer ? this.renderer.getDehydratedLayerCanvas(l) : l.canvas);
                if (src) tempCtx.drawImage(src, 0, 0);
                
                l._buffer = null;
                l.width = newW;
                l.height = newH;
                l.canvas.width = newW; 
                l.canvas.height = newH; 
                l.ctx.imageSmoothingEnabled = false; 
                l.ctx.clearRect(0, 0, newW, newH);
                l.ctx.drawImage(tempC, offsetX, offsetY, drawWidth, drawHeight); 
                l.markModified();

                if (shouldVirtualize && Math.abs(fi - curIdx) > 2) {
                    l.dehydrate();
                }
            });
        });
        tempC.width = 0;
        tempC.height = 0;
        
        this.doc.width = newW; 
        this.doc.height = newH;
        if (this.renderer && typeof this.renderer.clearFrameCache === 'function') {
            this.renderer.clearFrameCache();
        }
        this.history.updateMaxSteps(newW, newH, this.doc.frames ? this.doc.frames.length : 1, (this.doc.activeFrame ? this.doc.activeFrame.layers.length : 1));
        this.doc.virtualizeFrames();
        this.saveState(); 
        this.events.emit('frameChanged'); 
        this.events.emit('layerChanged'); 
        this.viewport.reframe(); 
        this.updateCanvasSmoothing();
        if (this.renderer) this.renderer.render(); 
        this.events.emit('ui:updateSubpixelUI');
        this.events.emit('ui:closeAllMenus');
    }

    startScrubbing() {
        if (!this.state) return;
        if (!this.state.isScrubbing) {
            this.selection.anchor();
            this.state.isScrubbing = true;
            if (this.onionCanvas) this.onionCanvas.style.display = 'none';
        }
    }

    finishScrubbing() {
        if (!this.state || !this.state.isScrubbing) return;
        this.state.isScrubbing = false;
        if (this.renderer && typeof this.renderer.clearFrameCache === 'function') {
            this.renderer.clearFrameCache();
        }
        if (!this.doc) return;
        const before = this.playback?.onionFramesBefore ?? 2;
        const after = this.playback?.onionFramesAfter ?? 2;
        this.doc.virtualizeFrames(before, after);
        this.events.emit('frameChanged');
        this.events.emit('layerChanged');
        if (this.playback) this.playback.updateOnionSkin();
        if (this.renderer) this.renderer.render();
    }

    switchFrame(index) {
        if (!this.doc || index < 0 || index >= this.doc.frames.length || this.state.isSpriteSheetView) return;
        
        const isPlaying = this.playback && this.playback.isPlaying;
        const isScrubbing = !!(this.state && this.state.isScrubbing);
        const isFastPath = isPlaying || isScrubbing;
        if (!isFastPath) {
            this.selection.anchor(); 
        }
        this.doc.currentFrameIndex = index;
        
        if (this.doc.activeLayerIndex >= this.doc.activeFrame.layers.length) {
            this.doc.activeLayerIndex = this.doc.activeFrame.layers.length - 1;
        }
        
        if (isFastPath) {
            if (this.ui && typeof this.ui.updateActiveFrameOnly === 'function') {
                this.ui.updateActiveFrameOnly();
            }
            if (this.renderer) {
                this.renderer.renderImmediate();
            }
        } else {
            const before = this.playback?.onionFramesBefore ?? 2;
            const after = this.playback?.onionFramesAfter ?? 2;
            this.doc.virtualizeFrames(before, after);
            this.events.emit('frameChanged'); 
            this.events.emit('layerChanged'); 
            this.playback.updateOnionSkin(); 
            if (this.renderer) this.renderer.render();
        }
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
            
            const maxDim = 4096;
            const rawW = this.doc.width * 4;
            const rawH = this.doc.height * 4;
            const scale = Math.min(1, maxDim / rawW, maxDim / rawH);
            const targetW = Math.round(rawW * scale);
            const targetH = Math.round(rawH * scale);
            const cellW = Math.round(this.doc.width * scale);
            const cellH = Math.round(this.doc.height * scale);

            this.spriteSheetViewCanvas.width = targetW; 
            this.spriteSheetViewCanvas.height = targetH;
            this.spriteSheetCtx.clearRect(0, 0, targetW, targetH); 
            this.spriteSheetCtx.imageSmoothingEnabled = false;
            
            this.doc.frames.forEach((frame, idx) => {
                if (idx >= 16) return; 
                const col = idx % 4;
                const row = Math.floor(idx / 4);
                
                for (let i = frame.layers.length - 1; i >= 0; i--) {
                    let layerToDraw = frame.layers[i];
                    if (layerToDraw.isDeleted) {
                        for (let k = idx - 1; k >= 0; k--) {
                            const prevLayer = this.doc.frames[k].layers[i];
                            if (!prevLayer.isDeleted) {
                                if (k + (prevLayer.holdCount || 1) > idx) {
                                    layerToDraw = prevLayer;
                                }
                                break;
                            }
                        }
                    }
                    if (layerToDraw && layerToDraw.visible && !layerToDraw.isDeleted && layerToDraw.hasContent) {
                        this.spriteSheetCtx.globalAlpha = layerToDraw.opacity; 
                        if (layerToDraw._canvas) {
                            this.spriteSheetCtx.drawImage(layerToDraw._canvas, col * cellW, row * cellH, cellW, cellH); 
                        } else if (layerToDraw.isDehydrated) {
                            const src = this.renderer.getDehydratedLayerCanvas(layerToDraw);
                            if (src) this.spriteSheetCtx.drawImage(src, col * cellW, row * cellH, cellW, cellH);
                        }
                    } 
                }
            });
            this.spriteSheetCtx.globalAlpha = 1.0;
            this.doc.virtualizeFrames();
            
            this.bgCanvas.width = targetW; 
            this.bgCanvas.height = targetH; 
            this.renderCheckerboard(targetW, targetH);
            this.viewport.reframe();
        } else {
            this.spriteSheetViewCanvas.width = 0;
            this.spriteSheetViewCanvas.height = 0;
            this.doc.virtualizeFrames();
            this.bgCanvas.width = this.doc.width; 
            this.bgCanvas.height = this.doc.height; 
            this.renderCheckerboard(this.doc.width, this.doc.height);
            if (this.renderer) this.renderer.render(); 
            this.viewport.reframe();
        }
        
        this.events.emit('ui:toggleSpriteSheet', this.state.isSpriteSheetView);
    }
}
