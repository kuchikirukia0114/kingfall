/**
 * 异步资料参考
 *
 * 在 SillyTavern 扩展菜单中以原界面浮层方式打开 Kingfall。
 */
const MODULE_NAME = '异步资料参考';
const MENU_ITEM_ID = 'kingfall-menu-item';
const MENU_API_ID = 'kingfall.open';
const MENU_LABEL = '异步资料参考';
const MENU_ICON = 'fa-solid fa-crown';
const NETWORK_PAGE_RELATIVE = './html/network.html';
const HOST_RUNTIME_RELATIVE = './js/runtime.js';
const HOST_RUNTIME_SCRIPT_ID = 'kingfall-host-runtime';
const OVERLAY_ID = 'kingfall-overlay';
const OVERLAY_FRAME_ID = 'kingfall-overlay-frame';
const OVERLAY_STYLE_ID = 'kingfall-overlay-style';

let initialized = false;
let overlayRoot = null;
let overlayFrame = null;
let hostRuntimePromise = null;

function showToast(level, message) {
    const toast = window.toastr && window.toastr[level];
    if (typeof toast === 'function') {
        toast(message);
        return;
    }
    const method = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    console[method](`[${MODULE_NAME}] ${message}`);
}

function resolveNetworkPageUrl() {
    return new URL(NETWORK_PAGE_RELATIVE, import.meta.url).href;
}

function resolveHostRuntimeUrl() {
    return new URL(HOST_RUNTIME_RELATIVE, import.meta.url).href;
}

function ensureHostRuntimeLoaded() {
    if (window.NetworkShortcutApp?.apps?.network?.kingfallHook) {
        return Promise.resolve(window.NetworkShortcutApp);
    }

    if (hostRuntimePromise) {
        return hostRuntimePromise;
    }

    const existingScript = document.getElementById(HOST_RUNTIME_SCRIPT_ID);
    if (existingScript) {
        hostRuntimePromise = new Promise((resolve, reject) => {
            existingScript.addEventListener('load', () => resolve(window.NetworkShortcutApp), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Kingfall host runtime load failed')), { once: true });
            window.setTimeout(() => resolve(window.NetworkShortcutApp), 2000);
        });
        return hostRuntimePromise;
    }

    hostRuntimePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = HOST_RUNTIME_SCRIPT_ID;
        script.async = false;
        script.src = resolveHostRuntimeUrl();
        script.onload = () => resolve(window.NetworkShortcutApp);
        script.onerror = () => reject(new Error('Kingfall host runtime load failed'));
        document.head.appendChild(script);
    }).catch((error) => {
        console.error(`[${MODULE_NAME}] 主界面运行时加载失败。`, error);
        throw error;
    });

    return hostRuntimePromise;
}

function ensureOverlayStyles() {
    if (document.getElementById(OVERLAY_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
        #${OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483000;
            display: flex;
            align-items: stretch;
            justify-content: center;
            padding: 0 16px;
            pointer-events: auto;
            background: transparent;
        }

        #${OVERLAY_ID}.${OVERLAY_ID}--hidden {
            display: none;
        }

        #${OVERLAY_ID} .kingfall-overlay__frame {
            width: min(960px, calc(100vw - 32px));
            height: 100%;
            max-height: 100%;
            border: 0;
            background: transparent;
            pointer-events: auto;
            border-radius: 14px;
            overflow: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        #${OVERLAY_ID} .kingfall-overlay__frame::-webkit-scrollbar {
            width: 0;
            height: 0;
        }

        @media (max-width: 768px) {
            #${OVERLAY_ID} {
                padding: 0;
            }

            #${OVERLAY_ID} .kingfall-overlay__frame {
                width: 100vw;
                border-radius: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

function syncOverlayRefs() {
    overlayRoot = document.getElementById(OVERLAY_ID) || null;
    overlayFrame = document.getElementById(OVERLAY_FRAME_ID) || null;
}

function focusExistingOverlay() {
    syncOverlayRefs();
    if (!overlayRoot || !overlayFrame) {
        return null;
    }

    overlayRoot.classList.remove(`${OVERLAY_ID}--hidden`);
    try {
        overlayFrame.focus();
        overlayFrame.contentWindow?.focus?.();
    } catch (error) {}
    return overlayRoot;
}

function createOverlay() {
    ensureOverlayStyles();
    const existing = focusExistingOverlay();
    if (existing) {
        return existing;
    }

    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.addEventListener('click', (event) => {
        if (event.target === root) {
            closeOverlay();
        }
    });

    const frame = document.createElement('iframe');
    frame.id = OVERLAY_FRAME_ID;
    frame.className = 'kingfall-overlay__frame';
    frame.src = resolveNetworkPageUrl();
    frame.title = MENU_LABEL;
    frame.setAttribute('allowtransparency', 'true');

    root.appendChild(frame);
    document.body.appendChild(root);

    overlayRoot = root;
    overlayFrame = frame;
    return root;
}

function closeOverlay() {
    syncOverlayRefs();
    if (!overlayRoot) {
        return;
    }
    try {
        overlayRoot.remove();
    } catch (error) {
        console.warn(`[${MODULE_NAME}] 关闭界面浮层失败。`, error);
    }
    overlayRoot = null;
    overlayFrame = null;
}

function openNetworkConnection() {
    const overlay = createOverlay();
    if (!overlay) {
        showToast('warning', '异步资料参考界面打开失败。');
        return null;
    }

    try {
        overlayFrame?.focus?.();
        overlayFrame?.contentWindow?.focus?.();
    } catch (error) {}

    return overlay;
}

function handleOverlayMessage(event) {
    const data = event && event.data;
    if (!data || typeof data !== 'object') {
        return;
    }

    if (data.type === 'kingfall.closeOverlay') {
        closeOverlay();
    }
}

function activateFromMenu(event) {
    if (event && event.type === 'keydown') {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
    }
    openNetworkConnection();
}

function createManualMenuItem() {
    if (document.getElementById(MENU_ITEM_ID)) {
        return true;
    }

    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        return false;
    }

    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = `
        <div class="${MENU_ICON} extensionsMenuExtensionButton"></div>
        <span>${MENU_LABEL}</span>
    `;
    item.addEventListener('click', activateFromMenu);
    item.addEventListener('keydown', activateFromMenu);
    menu.appendChild(item);
    return true;
}

function ensureManualMenuItem(retries = 20) {
    if (createManualMenuItem()) {
        return;
    }

    if (retries <= 0) {
        console.warn(`[${MODULE_NAME}] 未找到 #extensionsMenu，无法插入菜单项。`);
        return;
    }

    window.setTimeout(() => ensureManualMenuItem(retries - 1), 500);
}

async function registerMenuItem() {
    if (window.ST_API?.ui?.registerExtensionsMenuItem) {
        try {
            await window.ST_API.ui.registerExtensionsMenuItem({
                id: MENU_API_ID,
                label: MENU_LABEL,
                icon: MENU_ICON,
                onClick: openNetworkConnection,
            });
            return;
        } catch (error) {
            console.warn(`[${MODULE_NAME}] ST_API 菜单注册失败，改用手动注入。`, error);
        }
    }

    ensureManualMenuItem();
}

function getContext() {
    return window.SillyTavern?.getContext?.() || null;
}

function init() {
    if (initialized) {
        return;
    }
    initialized = true;
    window.addEventListener('message', handleOverlayMessage);
    ensureHostRuntimeLoaded().catch((error) => {
        console.error(`[${MODULE_NAME}] 无法在酒馆主界面启用 Kingfall 运行时。`, error);
    });
    registerMenuItem();
    console.log(`[${MODULE_NAME}] 已初始化。`);
}

function bootstrap() {
    const context = getContext();
    if (!context || !context.eventSource || !context.event_types) {
        window.setTimeout(bootstrap, 500);
        return;
    }

    const { eventSource, event_types } = context;
    if (typeof eventSource.on === 'function' && event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, init);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.setTimeout(init, 0);
    } else {
        window.addEventListener('load', init, { once: true });
    }
}

bootstrap();
