import ToolContext from './ToolContext.js';
import { CONSTANTS } from '../core/Constants.js';
import PolygonSelectTool from './PolygonSelectTool.js';

export default class ToolManager {
    constructor(core) { 
        this.core = core; 
        this.context = new ToolContext(core);
        this.tools = {}; 
        this.currentToolId = CONSTANTS.TOOLS.PENCIL; 
    }
    registerTool(id, ToolClass) { 
        this.tools[id] = new ToolClass(this.context); 
    }
    registerTools(toolsObj) {
        for (const [id, ToolClass] of Object.entries(toolsObj)) {
            this.registerTool(id, ToolClass);
        }
    }
    setTool(id) { 
        if (this.tools[id]) {
            this.currentToolId = id; 
        }
    }
    get activeTool() { 
        return this.tools[this.currentToolId]; 
    }
}
