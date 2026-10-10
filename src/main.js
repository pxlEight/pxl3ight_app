import PixelEditor from './PixelEditor.js?cb=103';

document.addEventListener('DOMContentLoaded', () => {
    window.defaultLongPressTimer = 450;
    const storedTimer = localStorage.getItem("longPressTimer_v2");
    let p = parseInt(storedTimer, 10); window.longPressTimer = (storedTimer && !isNaN(p) && p >= 150 && p <= 750) ? p : window.defaultLongPressTimer; localStorage.setItem("longPressTimer_v2", window.longPressTimer);
    
    try {
        window.drawOffset = JSON.parse(localStorage.getItem('drawOffset_v1') || '{"x":0, "y":0}');
    } catch(e) {
        window.drawOffset = {x:0, y:0};
    }

    window.appCore = new PixelEditor(); 
    window.appCore.init();

    // Advanced workaround to trap the back button indefinitely
    window.history.pushState(null, null, window.location.href);
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', (event) => {
        window.history.forward();
    });

    // Prevent default context menu (long press on mobile)
    window.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); return false; }, { capture: true, passive: false });

    // Final safety net: show a confirmation dialog if they somehow manage to navigate away
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = ''; // Trigger the browser's default exit warning
    });
});
