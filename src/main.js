import PixelEditor from './PixelEditor.js';

document.addEventListener('DOMContentLoaded', () => {
    window.appCore = new PixelEditor(); 
    window.appCore.init();

    // Advanced workaround to trap the back button indefinitely
    window.history.pushState(null, null, window.location.href);
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', (event) => {
        window.history.forward();
    });

    // Prevent default context menu (long press on mobile)
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Final safety net: show a confirmation dialog if they somehow manage to navigate away
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = ''; // Trigger the browser's default exit warning
    });
});
