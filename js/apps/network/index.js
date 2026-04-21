(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};
    networkApp.state = networkApp.state || {
        activePageKey: 'resultDesign',
    };

    const onDomReady = app.core.onDomReady;
    const DEFAULT_PAGE_KEY = 'resultDesign';

    function getResolvedPageKey(pageKey) {
        if (networkApp.pages[pageKey]) {
            return pageKey;
        }

        if (networkApp.pages[DEFAULT_PAGE_KEY]) {
            return DEFAULT_PAGE_KEY;
        }

        const fallbackPageKey = Object.keys(networkApp.pages)[0];
        return fallbackPageKey || DEFAULT_PAGE_KEY;
    }

    function mountPage(panelElement, pageDefinition) {
        if (!panelElement || !pageDefinition || panelElement.dataset.networkPageMounted === 'true') {
            return;
        }

        if (typeof pageDefinition.mount === 'function') {
            pageDefinition.mount(panelElement);
        } else if (typeof pageDefinition.render === 'function') {
            panelElement.innerHTML = pageDefinition.render();
        } else {
            panelElement.innerHTML = '<div class="network-page__canvas"></div>';
        }

        panelElement.dataset.networkPageMounted = 'true';
    }

    function setPageSelection(menuItems, panelMap, pageKey) {
        const resolvedPageKey = getResolvedPageKey(pageKey);
        const currentPageKey = getResolvedPageKey(networkApp.state.activePageKey || DEFAULT_PAGE_KEY);
        const currentPageDefinition = networkApp.pages[currentPageKey] || null;

        if (currentPageKey !== resolvedPageKey && currentPageDefinition && typeof currentPageDefinition.canLeave === 'function') {
            try {
                if (currentPageDefinition.canLeave({ fromPageKey: currentPageKey, toPageKey: resolvedPageKey }) === false) {
                    return false;
                }
            } catch (error) {
                console.error('[网络连接] 页面切换离开检查失败', error);
                return false;
            }
        }

        const pageDefinition = networkApp.pages[resolvedPageKey] || null;
        const activePanel = panelMap[resolvedPageKey];

        if (activePanel) {
            mountPage(activePanel, pageDefinition);
        }

        menuItems.forEach((menuItem) => {
            const isActive = menuItem.getAttribute('data-network-page') === resolvedPageKey;
            menuItem.classList.toggle('is-active', isActive);
            menuItem.setAttribute('aria-selected', isActive ? 'true' : 'false');
            menuItem.tabIndex = isActive ? 0 : -1;
        });

        Object.keys(panelMap).forEach((key) => {
            const panelElement = panelMap[key];
            const isActive = key === resolvedPageKey;

            panelElement.classList.toggle('is-active', isActive);
            panelElement.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        networkApp.state.activePageKey = resolvedPageKey;
        return true;
    }

    if (typeof onDomReady !== 'function') {
        return;
    }

    onDomReady(() => {
        const menuElement = document.getElementById('networkMenu');
        const viewportElement = document.getElementById('networkPageViewport');

        if (!menuElement || !viewportElement) {
            return;
        }

        const menuItems = Array.from(menuElement.querySelectorAll('[data-network-page]'));
        const panelMap = Array.from(viewportElement.querySelectorAll('[data-network-page-panel]')).reduce((result, panelElement) => {
            const key = panelElement.getAttribute('data-network-page-panel');

            if (key) {
                result[key] = panelElement;
                panelElement.setAttribute('role', 'tabpanel');
            }

            return result;
        }, {});

        if (!menuItems.length || !Object.keys(panelMap).length) {
            return;
        }

        menuElement.setAttribute('role', 'tablist');

        menuItems.forEach((menuItem) => {
            const pageKey = menuItem.getAttribute('data-network-page') || '';
            menuItem.setAttribute('role', 'tab');

            const activatePage = () => setPageSelection(menuItems, panelMap, pageKey);

            menuItem.addEventListener('click', activatePage);
            menuItem.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activatePage();
                }
            });
        });

        setPageSelection(menuItems, panelMap, networkApp.state.activePageKey || DEFAULT_PAGE_KEY);
    });
})(window.NetworkShortcutApp);
