(function (app) {
    app.apps.network =app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};
    const networkData = networkApp.data = networkApp.data || {};
    const pageState = networkApp.runtimePolicyPageState = networkApp.runtimePolicyPageState || {
        root: null,
        isBound: false,
        pendingAiRuntimePolicy: {
            streamEnabled: true,
            responseDispatchMode: 'final',
            showTypingIndicator: true,
            targetQueueMode: 'serial',
        },
        statusMessage: '',
        statusTone: 'neutral',
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureSettingsLoaded() {
        if (typeof networkData.getAiSettings === 'function') {
            return networkData.getAiSettings();
        }
        return {};
    }

    function normalizeRuntimePolicy(policy) {
        if (typeof networkData.normalizeAiRuntimePolicy === 'function') {
            return networkData.normalizeAiRuntimePolicy(policy);
        }
        const nextPolicy = policy && typeof policy === 'object' ? policy : {};
        return {
            streamEnabled: nextPolicy.streamEnabled !== false,
            responseDispatchMode: nextPolicy.responseDispatchMode === 'stream' ? 'stream' : 'final',
            showTypingIndicator: nextPolicy.showTypingIndicator !== false,
            targetQueueMode: nextPolicy.targetQueueMode === 'parallel' ? 'parallel' : 'serial',
        };
    }

    function syncPendingFromSettings(settingsSource = ensureSettingsLoaded()) {
        pageState.pendingAiRuntimePolicy = normalizeRuntimePolicy(settingsSource && settingsSource.aiRuntimePolicy);
    }

    function setStatusMessage(message, tone) {
        pageState.statusMessage = String(message || '').trim();
        pageState.statusTone = tone || 'neutral';
    }

    function renderStatusText() {
        if (!pageState.statusMessage) {
            return '';
        }
        var toneClass = ' is-' + escapeHtml(pageState.statusTone || 'neutral');
        return '<p class="network-api__status' + toneClass + '">' + escapeHtml(pageState.statusMessage) + '</p>';
    }

    function renderSettingRow(label, hint, inputHtml) {
        var hintHtml = hint ? '<span class="runtime-policy__row-hint">' + escapeHtml(hint) + '</span>' : '';
        return '<div class="runtime-policy__row">'
            + '<div class="runtime-policy__row-text">'
            + '<span class="runtime-policy__row-label">' + escapeHtml(label) + '</span>'
           + hintHtml
            + '</div>'
            + '<div class="runtime-policy__row-control">'
            + inputHtml
            + '</div>'
            + '</div>';
    }

    function render() {
        if (!pageState.root) {
            return;
        }
        var p = normalizeRuntimePolicy(pageState.pendingAiRuntimePolicy);

        var rows = [
            renderSettingRow(
                '流式输出',
                '',
                '<input data-runtime-policy-field="streamEnabled" type="checkbox"' + (p.streamEnabled ? ' checked' : '') + '>'
            ),
            renderSettingRow(
                '响应派发模式',
                'final：生成完毕后一次性投递给窗口；stream：逐 token 实时投递',
                '<select class="xp-input runtime-policy__select" data-runtime-policy-field="responseDispatchMode">'
                + '<option value="final"' + (p.responseDispatchMode === 'final' ? ' selected' : '') + '>完成后投递 (final)</option>'
                + '<option value="stream"' + (p.responseDispatchMode === 'stream' ? ' selected' : '') + '>实时投递 (stream)</option>'
                + '</select>'
            ),
            renderSettingRow(
                'Typing 状态提示',
                '生成期间在应用窗口显示“正在输入…”指示器',
                '<input data-runtime-policy-field="showTypingIndicator" type="checkbox"' + (p.showTypingIndicator ? ' checked' : '') + '>'
            ),
            renderSettingRow(
                '请求队列模式',
                '串行：前一个请求完成后再发下一个；并行：允许同时发起多个请求',
                '<select class="xp-input runtime-policy__select" data-runtime-policy-field="targetQueueMode">'
                + '<option value="serial"' + (p.targetQueueMode === 'serial' ? ' selected' : '') + '>串行</option>'
                + '<option value="parallel"' + (p.targetQueueMode === 'parallel' ? ' selected' : '') + '>并行</option>'
                + '</select>'
            ),
        ];


        pageState.root.innerHTML = ''
            + '<div class="network-api">'
            + '<div class="network-api__main-panel">'
            + '<div class="network-api__header">'
            + '<div class="network-api__header-main">'
            + '<h2 class="network-api__title">全局运行策略</h2>'
            + '<p class="runtime-policy__desc">所有 API 的默认行为；单个 API 可单独覆盖。</p>'
            + renderStatusText()
            + '</div>'
            + '</div>'
            + '<div class="network-api__body">'
            + '<div class="network-api__scroll-pane">'
            + '<div class="runtime-policy__list">'
            + rows.join('')
            + '</div>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="network-api__actions">'
            + '<button class="xp-button xp-button--primary network-api__button" type="button" data-runtime-policy-action="save">保存</button>'
            + '<button class="xp-button xp-button--ghost network-api__button" type="button" data-runtime-policy-action="reset">还原</button>'
            + '</div>'
            + '</div>';
    }

    function saveRuntimePolicy() {
        var settings = ensureSettingsLoaded();
        if (typeof networkData.setAiSettings !== 'function') {
            return;
        }
        var nextSettings = networkData.setAiSettings({
            ...settings,
            aiRuntimePolicy: normalizeRuntimePolicy(pageState.pendingAiRuntimePolicy),
        }, { silent: false });
        syncPendingFromSettings(nextSettings);
        setStatusMessage('已保存', 'success');
        render();
    }

    function resetRuntimePolicy() {
        syncPendingFromSettings(ensureSettingsLoaded());
        setStatusMessage('已还原', 'neutral');
        render();
    }

    function handleRootInput(event) {
        var fieldName = event.target.getAttribute('data-runtime-policy-field');
        if (!fieldName) {
            return;
        }
        var nextValue = event.target.type === 'checkbox'
            ? !!event.target.checked
            : event.target.value;
        pageState.pendingAiRuntimePolicy = normalizeRuntimePolicy({
            ...pageState.pendingAiRuntimePolicy,
            [fieldName]: nextValue,
        });
    }

    function handleRootClick(event) {
        var actionButton = event.target.closest('[data-runtime-policy-action]');
        if (!actionButton) {
            return;
        }
        var action = actionButton.getAttribute('data-runtime-policy-action') || '';
        if (action === 'save') {
            saveRuntimePolicy();
            return;
        }
        if (action === 'reset') {
            resetRuntimePolicy();
        }
    }

    function mount(panelElement) {
        pageState.root = panelElement;
        syncPendingFromSettings(ensureSettingsLoaded());
        if (!pageState.isBound) {
            panelElement.addEventListener('input', handleRootInput);
            panelElement.addEventListener('click', handleRootClick);
            pageState.isBound = true;
        }
        render();
    }

    if (typeof networkData.subscribeAiSettings === 'function') {
        networkData.subscribeAiSettings(function (settings) {
            syncPendingFromSettings(settings);
            if (pageState.root) {
                render();
            }
        });
    }

    networkApp.runtimePolicyPage = {
        mount: mount,
        render: render,
        getState: function () {
            return { ...pageState };
        },
    };

    networkApp.pages.runtimePolicy = {
        key: 'runtimePolicy',
        title: '全局运行策略',
        mount: mount,
        render: render,
    };
})(window.NetworkShortcutApp);
