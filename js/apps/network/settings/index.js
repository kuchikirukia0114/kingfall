(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};
    networkApp.data = networkApp.data || {};

    const networkData = networkApp.data;
    const MEDIA_DB_NAME = 'kingfall-media-db';
    const MEDIA_DB_VERSION = 1;
    const MEDIA_STORE_NAME = 'files';
    const SEND_BUTTON_MEDIA_KEY = 'kingfall-send-button-media';
    const DEFAULT_PLACEHOLDER_TEXT = '泰罗顶跨中~';
    const DEFAULT_MEDIA_LABEL = '默认 tailuo.gif';
    const state = networkApp.settingsPageState = networkApp.settingsPageState || {
        root: null,
        isBound: false,
        unsubscribe: null,
        mediaStateText: '',
        previewMediaUrl: '',
        draftPlaceholderText: DEFAULT_PLACEHOLDER_TEXT,
        draftMediaMeta: null,
        appliedSettingsSnapshot: '',
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSettings() {
        if (typeof networkData.getAiSettings === 'function') {
            return networkData.getAiSettings();
        }

        if (networkData.currentAiSettings && typeof networkData.currentAiSettings === 'object') {
            return networkData.currentAiSettings;
        }

        if (typeof networkData.normalizeAiSettings === 'function') {
            return networkData.normalizeAiSettings({});
        }

        return {
            kingfallEnabled: false,
            kingfallContinueSendOnError: true,
            kingfallAutoRetryEnabled: true,
            kingfallAutoRetryCount: '3',
            kingfallAutoRetryIntervalMs: '3000',
            kingfallProcessingPlaceholderText: DEFAULT_PLACEHOLDER_TEXT,
            kingfallSendButtonMedia: null,
        };
    }

    function setSettings(nextSettings) {
        if (typeof networkData.setAiSettings === 'function') {
            return networkData.setAiSettings(nextSettings, { silent: false });
        }

        networkData.currentAiSettings = nextSettings;
        return nextSettings;
    }

    function isKingfallEnabled(settings = getSettings()) {
        return settings?.kingfallEnabled === true;
    }

    function getPlaceholderText(settings = getSettings()) {
        const value = String(settings?.kingfallProcessingPlaceholderText || '').trim();
        return value || DEFAULT_PLACEHOLDER_TEXT;
    }

    function shouldContinueSendOnError(settings = getSettings()) {
        return settings?.kingfallContinueSendOnError !== false;
    }

    function getSendButtonMediaMeta(settings = getSettings()) {
        return settings?.kingfallSendButtonMedia && typeof settings.kingfallSendButtonMedia === 'object'
            ? settings.kingfallSendButtonMedia
            : null;
    }

    function isAutoRetryEnabled(settings = getSettings()) {
        return settings?.kingfallAutoRetryEnabled !== false;
    }

    function getAutoRetryCount(settings = getSettings()) {
        const value = parseInt(String(settings?.kingfallAutoRetryCount ?? '3').trim(), 10);
        if (!Number.isFinite(value)) return '3';
        return String(Math.min(10, Math.max(1, value)));
    }

    function getAutoRetryIntervalMs(settings = getSettings()) {
        const value = parseInt(String(settings?.kingfallAutoRetryIntervalMs ?? '3000').trim(), 10);
        if (!Number.isFinite(value)) return '3000';
        return String(Math.min(60000, Math.max(0, value)));
    }

    function buildAppliedSettingsSnapshot(settings = getSettings()) {
        return JSON.stringify({
            placeholder: getPlaceholderText(settings),
            media: getSendButtonMediaMeta(settings),
        });
    }

    function hasPendingChanges(settings = getSettings()) {
        return buildAppliedSettingsSnapshot({
            ...settings,
            kingfallProcessingPlaceholderText: state.draftPlaceholderText,
            kingfallSendButtonMedia: state.draftMediaMeta,
        }) !== state.appliedSettingsSnapshot;
    }

    function syncDraftFromSettings(settings = getSettings()) {
        state.draftPlaceholderText = getPlaceholderText(settings);
        state.draftMediaMeta = getSendButtonMediaMeta(settings);
        state.appliedSettingsSnapshot = buildAppliedSettingsSnapshot(settings);
    }

    function openMediaDb() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
                    db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('打开媒体库失败'));
        });
    }

    async function saveSendButtonMediaFile(file) {
        const db = await openMediaDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(MEDIA_STORE_NAME);
            const record = {
                id: SEND_BUTTON_MEDIA_KEY,
                name: String(file?.name || 'tailuo.gif').slice(0, 120),
                type: String(file?.type || '').slice(0, 80),
                mimeType: String(file?.type || '').slice(0, 120),
                size: Number(file?.size || 0),
                blob: file,
                updatedAt: Date.now(),
            };
            const request = store.put(record);
            request.onsuccess = () => resolve({
                id: record.id,
                name: record.name,
                type: record.type,
                mimeType: record.mimeType,
                size: record.size,
            });
            request.onerror = () => reject(request.error || new Error('保存媒体文件失败'));
            transaction.oncomplete = () => {
                try { db.close(); } catch (error) {}
            };
            transaction.onerror = () => reject(transaction.error || new Error('保存媒体文件失败'));
        });
    }

    async function deleteSendButtonMediaFile() {
        const db = await openMediaDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(MEDIA_STORE_NAME);
            const request = store.delete(SEND_BUTTON_MEDIA_KEY);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error || new Error('删除媒体文件失败'));
            transaction.oncomplete = () => {
                try { db.close(); } catch (error) {}
            };
            transaction.onerror = () => reject(transaction.error || new Error('删除媒体文件失败'));
        });
    }

    async function loadSendButtonMediaBlob() {
        const db = await openMediaDb();
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
                const store = transaction.objectStore(MEDIA_STORE_NAME);
                const request = store.get(SEND_BUTTON_MEDIA_KEY);
                request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null);
                request.onerror = () => resolve(null);
                transaction.oncomplete = () => {
                    try { db.close(); } catch (error) {}
                };
            } catch (error) {
                try { db.close(); } catch (closeError) {}
                resolve(null);
            }
        });
    }

    async function refreshMediaPreview() {
        if (state.previewMediaUrl && state.previewMediaUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(state.previewMediaUrl); } catch (error) {}
        }
        state.previewMediaUrl = '';

        if (!state.draftMediaMeta) {
            render();
            return;
        }

        try {
            const blob = await loadSendButtonMediaBlob();
            if (blob) {
                state.previewMediaUrl = URL.createObjectURL(blob);
            }
        } catch (error) {}
        render();
    }

    function getMediaSummaryText() {
        if (!state.draftMediaMeta) {
            return `当前使用：${DEFAULT_MEDIA_LABEL}`;
        }
        return `${String(state.draftMediaMeta.name || '未命名文件')} · ${state.draftMediaMeta.size || 0} bytes`;
    }

    function syncApplyButtonDisabledState() {
        if (!state.root) {
            return;
        }
        const applyButton = state.root.querySelector('[data-settings-action="apply-processing-appearance"]');
        if (applyButton) {
            applyButton.disabled = !hasPendingChanges(getSettings());
        }
    }

    function getDraftPlaceholderTextFromDom() {
        if (!state.root) {
            return state.draftPlaceholderText;
        }
        const input = state.root.querySelector('[data-settings-field="kingfallProcessingPlaceholderText"]');
        return input && typeof input.value === 'string'
            ? String(input.value || '').slice(0, 80)
            : state.draftPlaceholderText;
    }

    function render() {
        if (!state.root) {
            return;
        }

        const settings = getSettings();
        const enabled = isKingfallEnabled(settings);
        const continueSendOnError = shouldContinueSendOnError(settings);
        const autoRetryEnabled = isAutoRetryEnabled(settings);
        const autoRetryCount = getAutoRetryCount(settings);
        const autoRetryIntervalMs = getAutoRetryIntervalMs(settings);
        const statusText = enabled ? '已开启' : '未开启';
        const hintText = enabled
            ? '当前会在用户点击发送时先执行 Kingfall 处理，再放行原消息。'
            : '关闭时不会拦截发送，酒馆保持默认行为。';
        const mediaStateText = String(state.mediaStateText || '').trim();
        const previewHtml = state.previewMediaUrl
            ? `<div class="network-settings__media-preview-card"><img class="network-settings__media-preview" src="${escapeHtml(state.previewMediaUrl)}" alt="发送按钮媒体预览"></div>`
            : `<div class="network-settings__media-preview-card is-empty">默认媒体：tailuo.gif</div>`;
        const hasChanges = hasPendingChanges(settings);

        state.root.innerHTML = `
            <div class="network-page__canvas network-page__canvas--settings">
                <div class="network-settings__section">
                    <div class="network-settings__header">
                        <div>
                            <h3 class="network-settings__title">Kingfall 发送前处理</h3>
                            <p class="network-settings__desc">开启后，插件会在发送前先用当前网络连接配置生成一段文本，并写入变量 <strong>Kingfall</strong>。</p>
                        </div>
                        <span class="network-settings__badge ${enabled ? 'is-enabled' : 'is-disabled'}">${escapeHtml(statusText)}</span>
                    </div>

                    <label class="network-settings__switch-row">
                        <span class="network-settings__switch-label">启用 Kingfall 开关</span>
                        <span class="network-settings__switch">
                            <input class="network-settings__switch-input" type="checkbox" data-settings-field="kingfallEnabled" ${enabled ? 'checked' : ''}>
                            <span class="network-settings__switch-slider" aria-hidden="true"></span>
                        </span>
                    </label>

                    <label class="network-settings__switch-row">
                        <span class="network-settings__switch-label">报错时继续放行用户输入</span>
                        <span class="network-settings__switch">
                            <input class="network-settings__switch-input" type="checkbox" data-settings-field="kingfallContinueSendOnError" ${continueSendOnError ? 'checked' : ''}>
                            <span class="network-settings__switch-slider" aria-hidden="true"></span>
                        </span>
                    </label>

                    <div class="network-settings__subsection">
                        <div class="network-settings__subsection-head">
                            <div class="network-settings__subsection-title">自动重试</div>
                            <span class="network-settings__switch">
                                <input class="network-settings__switch-input" type="checkbox" data-settings-field="kingfallAutoRetryEnabled" ${autoRetryEnabled ? 'checked' : ''}>
                                <span class="network-settings__switch-slider" aria-hidden="true"></span>
                            </span>
                        </div>
                        <div class="network-settings__retry-grid ${autoRetryEnabled ? '' : 'is-disabled'}">
                            <label class="network-settings__field-group">
                                <span class="network-settings__field-label">重试次数</span>
                                <input class="xp-input network-settings__text-input" type="number" min="1" max="10" step="1" value="${escapeHtml(autoRetryCount)}" data-settings-field="kingfallAutoRetryCount" ${autoRetryEnabled ? '' : 'disabled'}>
                            </label>
                            <label class="network-settings__field-group">
                                <span class="network-settings__field-label">重试间隔 (ms)</span>
                                <input class="xp-input network-settings__text-input" type="number" min="0" max="60000" step="100" value="${escapeHtml(autoRetryIntervalMs)}" data-settings-field="kingfallAutoRetryIntervalMs" ${autoRetryEnabled ? '' : 'disabled'}>
                            </label>
                        </div>
                    </div>

                    <div class="network-settings__subsection">
                        <div class="network-settings__subsection-title">异步时输入框占位文本</div>
                        <label class="network-settings__field-group">
                            <span class="network-settings__field-label">占位文本内容</span>
                            <input class="xp-input network-settings__text-input" type="text" maxlength="80" value="${escapeHtml(state.draftPlaceholderText)}" data-settings-field="kingfallProcessingPlaceholderText" placeholder="例如：泰罗顶跨中~">
                        </label>
                    </div>

                    <div class="network-settings__subsection">
                        <div class="network-settings__subsection-title">发送按钮右侧媒体</div>
                        <div class="network-settings__media-row">
                            <label class="xp-button xp-button--secondary network-settings__upload-button">
                                上传图片 / GIF
                                <input class="network-settings__file-input" type="file" accept="image/*,.gif" data-settings-field="kingfallSendButtonMediaFile">
                            </label>
                            <button class="xp-button xp-button--ghost" type="button" data-settings-action="restore-default-media">恢复默认媒体</button>
                            <button class="xp-button xp-button--primary" type="button" data-settings-action="apply-processing-appearance" ${hasChanges ? '' : 'disabled'}>应用</button>
                        </div>
                        ${previewHtml}
                        <div class="network-settings__media-summary">${escapeHtml(getMediaSummaryText())}</div>
                        ${mediaStateText ? `<div class="network-settings__media-state">${escapeHtml(mediaStateText)}</div>` : ''}
                    </div>

                    <div class="network-settings__tips">
                        <div>变量名：<code>Kingfall</code></div>
                        <div>失败策略：${continueSendOnError ? '报错后继续放行发送' : '报错后中止放行发送'}</div>
                        <div>自动重试：${autoRetryEnabled ? `开启（${escapeHtml(autoRetryCount)}次 / ${escapeHtml(autoRetryIntervalMs)}ms）` : '关闭'}</div>
                        <div>当前状态：${escapeHtml(hintText)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    async function handleMediaUpload(file) {
        if (!(file instanceof File)) {
            return;
        }

        state.mediaStateText = '正在保存媒体文件…';
        render();
        try {
            const mediaMeta = await saveSendButtonMediaFile(file);
            state.draftMediaMeta = mediaMeta;
            state.mediaStateText = '媒体文件已保存到草稿。点击“应用”后生效。';
            await refreshMediaPreview();
        } catch (error) {
            console.error('[kingfall/settings] 保存按钮媒体失败。', error);
            state.mediaStateText = `保存失败：${error?.message || '未知错误'}`;
            render();
        }
    }

    async function applyAppearanceSettings() {
        state.draftPlaceholderText = getDraftPlaceholderTextFromDom();
        const nextPlaceholder = String(state.draftPlaceholderText || '').trim().slice(0, 80) || DEFAULT_PLACEHOLDER_TEXT;
        setSettings({
            ...getSettings(),
            kingfallProcessingPlaceholderText: nextPlaceholder,
            kingfallSendButtonMedia: state.draftMediaMeta,
        });
        state.appliedSettingsSnapshot = buildAppliedSettingsSnapshot(getSettings());
        state.mediaStateText = '已应用到运行时。';
        render();
    }

    async function restoreDefaultMedia() {
        state.mediaStateText = '正在恢复默认媒体…';
        render();
        try {
            await deleteSendButtonMediaFile();
            state.draftMediaMeta = null;
            state.mediaStateText = '已恢复为默认媒体。点击“应用”后生效。';
            await refreshMediaPreview();
        } catch (error) {
            console.error('[kingfall/settings] 恢复默认媒体失败。', error);
            state.mediaStateText = `恢复失败：${error?.message || '未知错误'}`;
            render();
        }
    }

    function handleChange(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const field = String(target.getAttribute('data-settings-field') || '').trim();
        if (field === 'kingfallEnabled') {
            setSettings({
                ...getSettings(),
                kingfallEnabled: target.checked === true,
            });
            return;
        }

        if (field === 'kingfallContinueSendOnError') {
            setSettings({
                ...getSettings(),
                kingfallContinueSendOnError: target.checked === true,
            });
            return;
        }

        if (field === 'kingfallAutoRetryEnabled') {
            setSettings({
                ...getSettings(),
                kingfallAutoRetryEnabled: target.checked === true,
            });
            return;
        }

        if (field === 'kingfallSendButtonMediaFile') {
            const file = target.files && target.files[0] ? target.files[0] : null;
            handleMediaUpload(file);
            target.value = '';
        }
    }

    function handleInput(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const field = String(target.getAttribute('data-settings-field') || '').trim();
        if (field === 'kingfallProcessingPlaceholderText') {
            state.draftPlaceholderText = String(target.value || '').slice(0, 80);
            syncApplyButtonDisabledState();
            return;
        }

        if (field === 'kingfallAutoRetryCount') {
            const value = parseInt(String(target.value || '3').trim(), 10);
            setSettings({
                ...getSettings(),
                kingfallAutoRetryCount: String(Number.isFinite(value) ? Math.min(10, Math.max(1, value)) : 3),
            });
            return;
        }

        if (field === 'kingfallAutoRetryIntervalMs') {
            const value = parseInt(String(target.value || '3000').trim(), 10);
            setSettings({
                ...getSettings(),
                kingfallAutoRetryIntervalMs: String(Number.isFinite(value) ? Math.min(60000, Math.max(0, value)) : 3000),
            });
            return;
        }
    }

    function handleClick(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const action = String(target.getAttribute('data-settings-action') || '').trim();
        if (action === 'restore-default-media') {
            restoreDefaultMedia();
            return;
        }
        if (action === 'apply-processing-appearance') {
            applyAppearanceSettings();
        }
    }

    function bindEvents() {
        if (!state.root || state.isBound) {
            return;
        }

        state.root.addEventListener('change', handleChange);
        state.root.addEventListener('input', handleInput);
        state.root.addEventListener('click', handleClick);
        state.isBound = true;
    }

    function mount(panelElement) {
        if (!panelElement) {
            return;
        }

        panelElement.innerHTML = '<div class="network-page__canvas network-page__canvas--settings"></div>';
        state.root = panelElement.querySelector('.network-page__canvas--settings');
        bindEvents();

        if (!state.unsubscribe && typeof networkData.subscribeAiSettings === 'function') {
            state.unsubscribe = networkData.subscribeAiSettings((settings) => {
                syncDraftFromSettings(settings);
                refreshMediaPreview();
            });
        }

        syncDraftFromSettings(getSettings());
        refreshMediaPreview();
    }

    networkApp.settingsPage = {
        mount,
        render,
        getState() {
            return { ...state };
        },
    };

    networkApp.pages.settings = {
        key: 'settings',
        label: '设置',
        mount,
    };
})(window.NetworkShortcutApp);
