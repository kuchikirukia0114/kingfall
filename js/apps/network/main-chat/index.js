(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};

    const networkData = networkApp.data = networkApp.data || {};
    const DEFAULT_VIEW = 'overview';
    const state = networkApp.mainChatState = networkApp.mainChatState || {
        root: null,
        isBound: false,
        unsubscribe: null,
        view: DEFAULT_VIEW,
        renderScrollSnapshots: {},
    };
    const RENDER_SCROLL_SELECTORS = [
        '#networkMainChatRules',
        '#networkMainChatPreviewOutput',
    ];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getSillyTavernContext() {
        const candidates = [window];

        try {
            if (window.opener && window.opener !== window) {
                candidates.push(window.opener);
            }
        } catch (error) {}

        try {
            if (window.parent && window.parent !== window) {
                candidates.push(window.parent);
            }
        } catch (error) {}



        try {
            if (window.top && window.top !== window) {
                candidates.push(window.top);
            }
        } catch (error) {}

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];

            try {
                if (!candidate || !candidate.SillyTavern || typeof candidate.SillyTavern.getContext !== 'function') {
                    continue;
                }

                const context = candidate.SillyTavern.getContext();
                if (context && Array.isArray(context.chat)) {
                    return context;
                }
            } catch (error) {}
        }

        return null;
    }

    function normalizeLiveChatMessageText(value) {
        return String(value == null ? '' : value)
            .replace(/\r\n?/g, '\n')
            .trim();
    }

    function getLiveChatMessageRole(rawMessage) {
        if (!rawMessage || typeof rawMessage !== 'object') {
            return '';
        }

        if (rawMessage.is_user) {
            return 'user';
        }

        if (rawMessage.is_system) {
            return 'system';
        }

        const rawRole = String(rawMessage.role || '').trim().toLowerCase();
        if (rawRole === 'user') {
            return 'user';
        }
        if (rawRole === 'system') {
            return 'system';
        }
        return 'assistant';
    }

    function readLiveChatMessagesFromContext(context = getSillyTavernContext()) {
        const rawMessages = context && Array.isArray(context.chat) ? context.chat : null;
        if (!rawMessages) {
            return null;
        }

        return rawMessages.reduce((result, rawMessage) => {
            const role = getLiveChatMessageRole(rawMessage);
            if (role !== 'user' && role !== 'assistant') {
                return result;
            }

            const content = normalizeLiveChatMessageText(rawMessage.mes ?? rawMessage.content ?? '');
            if (!content) {
                return result;
            }

            result.push({ role, content });
            return result;
        }, []);
    }

    function readStandalonePreviewMessages() {
        const socialData = typeof app.core.getStandaloneSocialData === 'function'
            ? app.core.getStandaloneSocialData()
            : null;
        const previewMessages = Array.isArray(socialData?.previewMessages)
            ? socialData.previewMessages
            : [];

        return previewMessages.reduce((result, message) => {
            const rawRole = String(message?.role || '').trim().toLowerCase();
            const role = rawRole === 'user'
                ? 'user'
                : ((rawRole === 'assistant' || rawRole === 'model') ? 'assistant' : '');
            const content = normalizeLiveChatMessageText(message?.content || '');
            if (!role || !content) {
                return result;
            }
            result.push({ role, content });
            return result;
        }, []);
    }

    function getCurrentChatPreviewMessages() {
        const contextMessages = readLiveChatMessagesFromContext();
        if (Array.isArray(contextMessages)) {
            return contextMessages;
        }

        return readStandalonePreviewMessages();
    }


    function extractTagContentWithTag(text, tagName) {
        const normalizedTag = String(tagName || '').trim();
        if (!normalizedTag) {
            return '';
        }

        const regex = new RegExp(`(<${escapeRegExp(normalizedTag)}>[\\s\\S]*?<\\/${escapeRegExp(normalizedTag)}>)`, 'gi');
        const matches = [];
        let match = null;

        while ((match = regex.exec(String(text || ''))) !== null) {
            matches.push(String(match[1] || '').trim());
        }

        return matches.join('\n\n');
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
            mainChatContextN: '10',
            mainChatUserN: '',
            mainChatXmlRules: [],
        };
    }

    function queueRender() {
        window.requestAnimationFrame(() => {
            render();
        });
    }

    function setSettings(nextSettings, { deferRender = false } = {}) {
        if (typeof networkData.setAiSettings === 'function') {
            networkData.setAiSettings(nextSettings, { silent: true });
        } else if (typeof networkData.normalizeAiSettings === 'function') {
            networkData.currentAiSettings = networkData.normalizeAiSettings(nextSettings);
        } else {
            networkData.currentAiSettings = nextSettings;
        }

        if (deferRender) {
            queueRender();
            return;
        }

        render();
    }

    function updateSettings(patch, options) {
        setSettings({
            ...getSettings(),
            ...patch,
        }, options);
    }

    function getMainChatRules(settings = getSettings()) {
        return Array.isArray(settings.mainChatXmlRules) ? settings.mainChatXmlRules : [];
    }

    function hasConfiguredRule(rule) {
        return Boolean(String(rule?.tag || '').trim() || String(rule?.n || '').trim());
    }

    function getMainChatSummaryLabel(settings = getSettings()) {
        const rules = getMainChatRules(settings);
        const isDefault = settings.mainChatContextN === '10'
            && settings.mainChatUserN === ''
            && !rules.some(hasConfiguredRule);
        return isDefault ? '默认' : '已设';
    }

    function getRuleCountLabel(settings = getSettings()) {
        const rules = getMainChatRules(settings);
        return rules.length ? `${rules.length}项` : '空';
    }

    function buildPreviewMessages(settingsSource = getSettings()) {
        const settings = settingsSource || getSettings();
        const historyMessages = getCurrentChatPreviewMessages();

        if (!historyMessages.length) {
            return [];
        }

        const validRules = getMainChatRules(settings).filter((rule) => String(rule?.tag || '').trim());
        const userNStr = String(settings.mainChatUserN ?? '').trim();
        const assistantMessages = historyMessages
            .map((message, index) => ({ index, message }))
            .filter((item) => item.message.role === 'assistant');
        const userMessages = historyMessages
            .map((message, index) => ({ index, message }))
            .filter((item) => item.message.role === 'user');
        const assistantInRange = {};
        const userInRange = {};

        if (validRules.length) {
            validRules.forEach((rule) => {
                const nStr = String(rule.n || '').trim();

                if (nStr === '0') {
                    return;
                }

                let startIndex = 0;
                let endIndex = assistantMessages.length;

                if (nStr !== '') {
                    const n = parseInt(nStr, 10) || 0;

                    if (n <= 0) {
                        return;
                    }

                    if (rule.mode === 'exclude') {
                        endIndex = Math.max(0, assistantMessages.length - n);
                    } else {
                        startIndex = Math.max(0, assistantMessages.length - n);
                    }
                }

                for (let index = startIndex; index < endIndex; index += 1) {
                    const item = assistantMessages[index];
                    if (!assistantInRange[item.index]) {
                        assistantInRange[item.index] = [];
                    }
                    assistantInRange[item.index].push(String(rule.tag || '').trim());
                }
            });
        } else {
            const aiRangeStr = String(settings.mainChatContextN ?? '').trim();
            let startIndex = 0;
            let endIndex = assistantMessages.length;

            if (aiRangeStr === '0') {
                endIndex = 0;
            } else if (aiRangeStr !== '') {
                const n = parseInt(aiRangeStr, 10) || 0;
                startIndex = Math.max(0, assistantMessages.length - n);
            }

            for (let index = startIndex; index < endIndex; index += 1) {
                const item = assistantMessages[index];
                assistantInRange[item.index] = ['__full__'];
            }
        }

        if (userNStr !== '0') {
            let startIndex = 0;
            let endIndex = userMessages.length;

            if (userNStr !== '') {
                const n = parseInt(userNStr, 10) || 0;

                if (n > 0) {
                    startIndex = Math.max(0, userMessages.length - n);
                }
            }

            for (let index = startIndex; index < endIndex; index += 1) {
                userInRange[userMessages[index].index] = true;
            }
        }

        const result = [];

        for (let index = 0; index < historyMessages.length; index += 1) {
            const message = historyMessages[index];

            if (message.role === 'user') {
                if (userInRange[index]) {
                    result.push({ role: 'user', content: message.content });
                }
                continue;
            }

            if (!assistantInRange[index]) {
                continue;
            }

            const parts = assistantInRange[index]
                .map((tag) => (tag === '__full__' ? message.content : extractTagContentWithTag(message.content, tag)))
                .filter(Boolean);

            if (parts.length) {
                result.push({ role: 'assistant', content: parts.join('\n\n') });
            }
        }

        return result;
    }

    function getPreviewText(messages) {
        if (!messages.length) {
            return '暂无匹配内容';
        }

        return messages
            .map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`)
            .join('\n\n');
    }

    function renderActionButtons(actions) {
        return actions.map((actionConfig) => `
            <button
                class="xp-button xp-button--${escapeHtml(actionConfig.tone || 'secondary')} network-main-chat__button"
                type="button"
                data-main-chat-action="${escapeHtml(actionConfig.action)}"
            >${escapeHtml(actionConfig.label)}</button>
        `).join('');
    }

    function getHeaderConfig() {
        if (state.view === 'rules') {
            return {
                title: 'XML规则',
                actions: [
                    { action: 'add-rule', label: '新增规则', tone: 'primary' },
                    { action: 'back-overview', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'preview') {
            return {
                title: '预览上下文',
                actions: [
                    { action: 'refresh-preview', label: '刷新', tone: 'secondary' },
                    { action: 'back-overview', label: '返回', tone: 'ghost' },
                ],
            };
        }

        return {
            title: '主聊天',
            actions: [],
        };
    }

    function renderOverview(settings = getSettings()) {
        return `
            <div class="network-main-chat__content network-main-chat__content--overview">
                <div class="network-main-chat__editor-card">
                    <div class="network-main-chat__field-grid">
                        <label class="network-main-chat__field-group">
                            <span class="network-main-chat__field-label">最近AI消息范围</span>
                            <input class="xp-input network-main-chat__input" data-main-chat-field="contextN" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(settings.mainChatContextN)}" placeholder="最近AI消息范围">
                            <span class="network-main-chat__microline">空=全部，0=不读取，数字=最近N条AI消息</span>
                        </label>
                        <label class="network-main-chat__field-group">
                            <span class="network-main-chat__field-label">最近用户消息范围</span>
                            <input class="xp-input network-main-chat__input" data-main-chat-field="userN" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(settings.mainChatUserN)}" placeholder="最近用户消息范围">
                            <span class="network-main-chat__microline">空=全部，0=不发送，数字=最近N条用户消息</span>
                        </label>
                    </div>
                </div>
                <div class="network-main-chat__rows">
                    <button class="xp-list-row network-main-chat__row" type="button" data-main-chat-action="open-rules">
                        <span class="network-main-chat__row-label">XML规则</span>
                        <span class="network-main-chat__row-value-wrap">
                            <span class="network-main-chat__row-value">${escapeHtml(getRuleCountLabel(settings))}</span>
                            <span class="network-main-chat__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-main-chat__row" type="button" data-main-chat-action="open-preview">
                        <span class="network-main-chat__row-label">预览上下文</span>
                        <span class="network-main-chat__row-value-wrap">
                            <span class="network-main-chat__row-value">查看</span>
                            <span class="network-main-chat__row-arrow">›</span>
                        </span>
                    </button>
                </div>
            </div>
        `;
    }

    function renderRules(settings = getSettings()) {
        const rules = getMainChatRules(settings);
        const rulesHtml = rules.length
            ? rules.map((rule, index) => `
                <div class="network-main-chat__rule" data-main-chat-rule-index="${index}">
                    <div class="network-main-chat__rule-top">
                        <input class="xp-input network-main-chat__rule-input" data-main-chat-rule-field="tag" data-main-chat-rule-index="${index}" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(rule.tag)}" placeholder="标签名">
                        <button class="xp-button xp-button--icon xp-button--danger network-main-chat__rule-delete" type="button" data-main-chat-action="delete-rule" data-main-chat-rule-index="${index}">×</button>
                    </div>
                    <div class="network-main-chat__rule-bottom">
                        <button class="xp-button xp-button--secondary network-main-chat__rule-mode" type="button" data-main-chat-action="toggle-rule-mode" data-main-chat-rule-index="${index}">${escapeHtml(rule.mode === 'exclude' ? '排除最近N楼' : '最近N楼')}</button>
                        <input class="xp-input network-main-chat__rule-n" data-main-chat-rule-field="n" data-main-chat-rule-index="${index}" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(rule.n)}" placeholder="N">
                    </div>
                </div>
            `).join('')
            : `
                <div class="network-main-chat__empty">
                    <strong>无规则</strong>
                    <span>AI消息将按原文读取</span>
                </div>
            `;

        return `
            <div class="network-main-chat__content network-main-chat__content--rules">
                <div class="network-main-chat__rules" id="networkMainChatRules">${rulesHtml}</div>
            </div>
        `;
    }

    function renderPreview(settings = getSettings()) {
        const messages = buildPreviewMessages(settings);

        return `
            <div class="network-main-chat__content network-main-chat__content--preview">
                <div class="network-main-chat__preview-card">
                    <div class="network-main-chat__preview" id="networkMainChatPreviewOutput">${escapeHtml(getPreviewText(messages))}</div>
                </div>
            </div>
        `;
    }

    function renderBody(settings = getSettings()) {
        if (state.view === 'rules') {
            return renderRules(settings);
        }

        if (state.view === 'preview') {
            return renderPreview(settings);
        }

        return renderOverview(settings);
    }
    function captureRenderScrollState() {
        if (!state.root) {
            return [];
        }

        const snapshots = [];
        RENDER_SCROLL_SELECTORS.forEach((selector) => {
            const elements = Array.from(state.root.querySelectorAll(selector));
            elements.forEach((element, index) => {
                snapshots.push({
                    key: `${selector}::${index}`,
                    top: element.scrollTop,
                    left: element.scrollLeft,
                });
            });
        });
        return snapshots;
    }

    function mergeRenderScrollState(scrollState) {
        if (!Array.isArray(scrollState) || !scrollState.length) {
 return;
        }

        const snapshotMap = state.renderScrollSnapshots && typeof state.renderScrollSnapshots === 'object'
            ? { ...state.renderScrollSnapshots }
            : {};
        scrollState.forEach((snapshot) => {
            if (!snapshot || !snapshot.key) {
                return;
            }
            snapshotMap[snapshot.key] = {
                top: Number(snapshot.top) || 0,
                left: Number(snapshot.left) || 0,
            };
        });
        state.renderScrollSnapshots = snapshotMap;
    }

    function restoreRenderScrollState() {
        if (!state.root) {
            return;
        }

        const snapshotMap = state.renderScrollSnapshots && typeof state.renderScrollSnapshots === 'object'
            ? state.renderScrollSnapshots
            : {};
        RENDER_SCROLL_SELECTORS.forEach((selector) => {
            const elements = Array.from(state.root.querySelectorAll(selector));
            elements.forEach((element, index) => {
                const snapshot = snapshotMap[`${selector}::${index}`];
                if (!snapshot) {
                    return;
                }
                element.scrollTop = Number(snapshot.top) || 0;
                element.scrollLeft = Number(snapshot.left) || 0;
            });
        });
    }

    function render() {
        if (!state.root) {
            return;
        }

        mergeRenderScrollState(captureRenderScrollState());
        const settings = getSettings();
        const headerConfig = getHeaderConfig();
        const actionsHtml = headerConfig.actions.length
            ? `<div class="network-main-chat__actions">${renderActionButtons(headerConfig.actions)}</div>`
            : '';
        const subtitleHtml = headerConfig.subtitle
            ? `<p class="network-main-chat__subtitle">${escapeHtml(headerConfig.subtitle)}</p>`
            : '';

        state.root.innerHTML = `
            <div class="network-main-chat">
                <div class="network-main-chat__main-panel">
                    <div class="network-main-chat__header">
                        <div class="network-main-chat__header-main">
                            <h2 class="network-main-chat__title">${escapeHtml(headerConfig.title)}</h2>
                            ${subtitleHtml}
                        </div>
                    </div>
                    <div class="network-main-chat__body">
                        ${renderBody(settings)}
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
        restoreRenderScrollState();
    }


    function addRule() {
        const rules = getMainChatRules(getSettings()).slice();
        rules.push({
            tag: '',
            mode: 'recent',
            n: '3',
        });
        updateSettings({ mainChatXmlRules: rules });
    }

    function removeRule(ruleIndex) {
        const rules = getMainChatRules(getSettings()).filter((rule, index) => index !== ruleIndex);
        updateSettings({ mainChatXmlRules: rules });
    }

    function toggleRuleMode(ruleIndex) {
        const rules = getMainChatRules(getSettings()).map((rule, index) => {
            if (index !== ruleIndex) {
                return rule;
            }

            return {
                ...rule,
                mode: rule.mode === 'exclude' ? 'recent' : 'exclude',
            };
        });

        updateSettings({ mainChatXmlRules: rules });
    }

    function updateRuleField(ruleIndex, fieldName, fieldValue) {
        const rules = getMainChatRules(getSettings()).map((rule, index) => {
            if (index !== ruleIndex) {
                return rule;
            }

            return {
                ...rule,
                [fieldName]: fieldValue,
            };
        });

        updateSettings({ mainChatXmlRules: rules }, { deferRender: true });
    }

    function handleClick(event) {
        const actionButton = event.target.closest('[data-main-chat-action]');
        if (!actionButton || !state.root || !state.root.contains(actionButton)) {
            return;
        }

        const action = String(actionButton.getAttribute('data-main-chat-action') || '').trim();
        const ruleIndex = parseInt(String(actionButton.getAttribute('data-main-chat-rule-index') || '').trim(), 10);

        switch (action) {
            case 'open-rules':
                state.view = 'rules';
                render();
                break;
            case 'open-preview':
                state.view = 'preview';
                render();
                break;
            case 'back-overview':
                state.view = DEFAULT_VIEW;
                render();
                break;
            case 'refresh-preview':
                render();
                break;
            case 'add-rule':
                addRule();
                break;
            case 'delete-rule':
                if (Number.isFinite(ruleIndex) && ruleIndex >= 0) {
                    removeRule(ruleIndex);
                }
                break;
            case 'toggle-rule-mode':
                if (Number.isFinite(ruleIndex) && ruleIndex >= 0) {
                    toggleRuleMode(ruleIndex);
                }
                break;
            default:
                break;
        }
    }

    function handleChange(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const fieldName = String(target.getAttribute('data-main-chat-field') || '').trim();
        if (fieldName === 'contextN') {
            updateSettings({ mainChatContextN: target.value }, { deferRender: true });
            return;
        }

        if (fieldName === 'userN') {
            updateSettings({ mainChatUserN: target.value }, { deferRender: true });
            return;
        }

        const ruleFieldName = String(target.getAttribute('data-main-chat-rule-field') || '').trim();
        const ruleIndex = parseInt(String(target.getAttribute('data-main-chat-rule-index') || '').trim(), 10);
        if (!ruleFieldName || !Number.isFinite(ruleIndex) || ruleIndex < 0) {
            return;
        }

        updateRuleField(ruleIndex, ruleFieldName, target.value);
    }

    function bindEvents() {
        if (!state.root || state.isBound) {
            return;
        }

        state.root.addEventListener('click', handleClick);
        state.root.addEventListener('change', handleChange);
        state.isBound = true;
    }

    function mount(panelElement) {
        if (!panelElement) {
            return;
        }

        panelElement.innerHTML = '<div class="network-page__canvas network-page__canvas--main-chat"></div>';
        state.root = panelElement.querySelector('.network-page__canvas--main-chat');
        bindEvents();

        if (!state.unsubscribe && typeof networkData.subscribeAiSettings === 'function') {
            state.unsubscribe = networkData.subscribeAiSettings(() => {
                render();
            });
        }

        render();
    }

    networkData.getAiMainChatSummaryLabel = getMainChatSummaryLabel;
    networkData.buildAiMainChatPreviewMessages = buildPreviewMessages;

    networkApp.mainChat = {
        mount,
        render,
        getState() {
            return { ...state };
        },
    };

    networkApp.pages.mainChat = {
        key: 'mainChat',
        label: '主聊天',
        mount,
    };
})(window.NetworkShortcutApp);
