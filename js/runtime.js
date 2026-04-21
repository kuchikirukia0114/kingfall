(function () {
    const currentScript = document.currentScript;
    const baseUrl = currentScript
        ? currentScript.src.slice(0, currentScript.src.lastIndexOf('/') + 1)
        : './';

    function loadScript(scriptPath) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = false;
            script.src = new URL(scriptPath, baseUrl).href;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`加载脚本失败: ${scriptPath}`));
            document.head.appendChild(script);
        });
    }

    const scriptPaths = [
        'core/namespace.js',
        'core/dom-ready.js',
        'core/standalone-data.js',
        'apps/network/settings/index.js',
        'apps/network/api-config/index.js',
        'apps/network/runtime-policy/index.js',
        'apps/network/preset/index.js',
        'apps/network/result-design/index.js',
        'apps/network/main-chat/index.js',
        'apps/network/world-book/index.js',
        'apps/network/index.js',
        'kingfall-send-hook.js',
    ];

    scriptPaths
        .reduce((promise, scriptPath) => promise.then(() => loadScript(scriptPath)), Promise.resolve())
        .catch((error) => {
            console.error(error);
            const loading = document.querySelector('.standalone-loading');
            if (loading) {
                loading.textContent = `网络连接模块加载失败：${error.message}`;
            }
        });
})();
