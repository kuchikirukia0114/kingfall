(function () {
    function bindWindowControls() {
        const closeButton = document.getElementById('btnCloseNetworkStandalone');

        if (!closeButton) {
            return;
        }

        closeButton.addEventListener('click', () => {
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'kingfall.closeOverlay' }, '*');
                    return;
                }
                window.close();
            } catch (error) {
                console.warn('[kingfall] 关闭界面失败。', error);
            }
        });
    }

    function watchRuntimeReady() {
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            const app = window.NetworkShortcutApp;
            const ready = !!(app && app.apps && app.apps.network && app.apps.network.pages && app.apps.network.pages.apiConfig);

            if (ready || attempts > 120) {
                window.clearInterval(timer);

                const loading = document.querySelector('.standalone-loading');
                if (ready && loading) {
                    loading.remove();
                }
            }
        }, 250);
    }

    function init() {
        bindWindowControls();
        watchRuntimeReady();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
