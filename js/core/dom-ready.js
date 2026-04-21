(function (app) {
    app.core = app.core || {};

    app.core.onDomReady = function onDomReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }

        callback();
    };
})(window.NetworkShortcutApp);
