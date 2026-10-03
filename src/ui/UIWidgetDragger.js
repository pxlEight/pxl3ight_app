export default class UIWidgetDragger {
    constructor(widgetId, handleId) {
        this.widget = document.getElementById(widgetId);
        this.handle = document.getElementById(handleId);
        this.isDragging = false;
        this.startX = 0; this.startY = 0;
        this.initX = 0; this.initY = 0;

        if (!this.widget || !this.handle) return;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.handle.addEventListener('pointerdown', this.onPointerDown);
    }

    onPointerDown(e) {
        if (e.target !== this.handle && !this.handle.contains(e.target)) return;
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        this.initX = this.widget.offsetLeft;
        this.initY = this.widget.offsetTop;
        
        this.handle.setPointerCapture(e.pointerId);
        this.handle.addEventListener('pointermove', this.onPointerMove);
        this.handle.addEventListener('pointerup', this.onPointerUp);
        this.handle.addEventListener('pointercancel', this.onPointerUp);
    }

    onPointerMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;
        this.widget.style.left = `${this.initX + dx}px`;
        this.widget.style.top = `${this.initY + dy}px`;
        this.widget.style.right = 'auto'; 
        this.widget.style.bottom = 'auto';
    }

    onPointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.handle.releasePointerCapture(e.pointerId);
        this.handle.removeEventListener('pointermove', this.onPointerMove);
        this.handle.removeEventListener('pointerup', this.onPointerUp);
        this.handle.removeEventListener('pointercancel', this.onPointerUp);
    }
}
