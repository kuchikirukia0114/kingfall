(function (app) {
    app.apps = app.apps || {};
    app.apps.network = app.apps.network || {};
    app.apps.network.data = app.apps.network.data || {};

    const networkApp = app.apps.network;
    const networkData = networkApp.data;
    const HOOK_ID = 'network-shortcut.kingfall-send-hook';
    const VARIABLE_NAME = 'Kingfall';
    const SEND_BUTTON_GIF_STYLE_ID = 'kingfall-send-button-gif-style';
    const SEND_BUTTON_GIF_URL = new URL('../assets/tailuo.gif', document.currentScript?.src || window.location.href).href;

    const state = networkApp.kingfallHookState = networkApp.kingfallHookState || {
        installed: false,
        listening: false,
        running: false,
        handler: null,
        refreshTimer: 0,
        inputVisualState: null,
        sendButtonVisualState: null,
        listenTargets: [],
        fetchAbortController: null,
        cancelRequested: false,
    };

    function getSTAPI() {
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
                if (candidate && candidate.ST_API) {
                    return candidate.ST_API;
                }
            } catch (error) {}
        }

        return null;
    }

    function getSettings() {
        if (typeof networkData.getAiSettings === 'function') {
            return networkData.getAiSettings();
        }

        if (networkData.currentAiSettings && typeof networkData.currentAiSettings === 'object') {
            return networkData.currentAiSettings;
        }

        return {};
    }

    function getFreshSettings() {
        if (typeof networkData.reloadAiSettingsFromStorage === 'function') {
            try {
                return networkData.reloadAiSettingsFromStorage();
            } catch (error) {
                console.warn('[Kingfall] 从存储强制刷新 API 配置失败，回退到当前内存设置。', error);
            }
        }
        return getSettings();
    }

    function isEnabled(settings = getSettings()) {
        return settings?.kingfallEnabled === true;
    }

    function shouldContinueSendOnError(settings = getSettings()) {
        return settings?.kingfallContinueSendOnError !== false;
    }

    function getCandidateWindows() {
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

        return candidates;
    }

    function getCurrentInputElement() {
        const candidates = getCandidateWindows();
        for (let index = 0; index < candidates.length; index += 1) {
            const candidateWindow = candidates[index];
            try {
                const candidateDocument = candidateWindow?.document;
                const inputElement = candidateDocument?.getElementById('send_textarea')
                    || candidateDocument?.getElementById('user_input')
                    || null;
                if (inputElement) {
                    return inputElement;
                }
            } catch (error) {}
        }
        return null;
    }

    function dispatchInputMutationEvents(inputElement) {
        if (!inputElement || typeof inputElement.dispatchEvent !== 'function') {
            return;
        }

        try {
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (error) {}

        try {
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (error) {}
    }

    function setInputProcessingState(active, options = {}) {
        if (active) {
            const inputElement = getCurrentInputElement();
            if (!inputElement) {
                return;
            }

            if (state.inputVisualState?.element === inputElement) {
                return;
            }

            state.inputVisualState = {
                element: inputElement,
                readOnly: inputElement.readOnly === true,
                disabled: inputElement.disabled === true,
                value: typeof inputElement.value === 'string' ? inputElement.value : '',
                placeholder: inputElement.getAttribute('placeholder') || '',
                backgroundColor: inputElement.style.backgroundColor || '',
                color: inputElement.style.color || '',
                opacity: inputElement.style.opacity || '',
                filter: inputElement.style.filter || '',
                cursor: inputElement.style.cursor || '',
                transition: inputElement.style.transition || '',
            };

            inputElement.readOnly = true;
            inputElement.value = '';
            inputElement.setAttribute('placeholder', getPlaceholderText());
            inputElement.style.backgroundColor = 'rgba(148, 163, 184, 0.16)';
            inputElement.style.color = 'rgba(100, 116, 139, 0.85)';
            inputElement.style.opacity = '0.82';
            inputElement.style.filter = 'grayscale(0.08)';
            inputElement.style.cursor = 'wait';
            inputElement.style.transition = 'background-color 0.18s ease, opacity 0.18s ease, filter 0.18s ease';
            inputElement.setAttribute('aria-busy', 'true');
            return;
        }

        const snapshot = state.inputVisualState;
        if (!snapshot?.element) {
            return;
        }

        const restoreValue = options?.restoreValue !== false;
        const nextValue = typeof options?.nextValue === 'string' ? options.nextValue : null;

        try {
            snapshot.element.readOnly = snapshot.readOnly;
            snapshot.element.disabled = snapshot.disabled;
            if (restoreValue) {
                snapshot.element.value = snapshot.value;
            } else if (nextValue !== null) {
                snapshot.element.value = nextValue;
            }
            snapshot.element.setAttribute('placeholder', snapshot.placeholder);
            snapshot.element.style.backgroundColor = snapshot.backgroundColor;
            snapshot.element.style.color = snapshot.color;
            snapshot.element.style.opacity = snapshot.opacity;
            snapshot.element.style.filter = snapshot.filter;
            snapshot.element.style.cursor = snapshot.cursor;
            snapshot.element.style.transition = snapshot.transition;
            snapshot.element.removeAttribute('aria-busy');
            if (restoreValue || nextValue !== null) {
                dispatchInputMutationEvents(snapshot.element);
            }
        } catch (error) {}

        state.inputVisualState = null;
    }

    function getCurrentInputText() {
        const inputElement = getCurrentInputElement();
        return String(inputElement?.value ?? '').replace(/\r\n?/g, '\n');
    }

    function getCurrentSendButtonElement() {
        const candidates = getCandidateWindows();
        for (let index = 0; index < candidates.length; index += 1) {
            const candidateWindow = candidates[index];
            try {
                const candidateDocument = candidateWindow?.document;
                const buttonElement = candidateDocument?.getElementById('send_but')
                    || candidateDocument?.querySelector('#send_but, [data-testid="send_but"], .send_but')
                    || null;
                if (buttonElement) {
                    return buttonElement;
                }
            } catch (error) {}
        }
        return null;
    }

    function getPlaceholderText(settings = getSettings()) {
        if (typeof networkData.getKingfallProcessingPlaceholderText === 'function') {
            return String(networkData.getKingfallProcessingPlaceholderText(settings) || '泰罗顶跨中~').slice(0, 80);
        }
        return String(settings?.kingfallProcessingPlaceholderText || '泰罗顶跨中~').slice(0, 80) || '泰罗顶跨中~';
    }

    function openSendButtonMediaDb() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open('kingfall-media-db', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('打开媒体数据库失败'));
        });
    }

    async function getConfiguredSendButtonMediaUrl(settings = getSettings()) {
        const mediaMeta = typeof networkData.getKingfallSendButtonMediaMeta === 'function'
            ? networkData.getKingfallSendButtonMediaMeta(settings)
            : settings?.kingfallSendButtonMedia;
        const mediaId = String(mediaMeta?.id || '').trim();
        if (!mediaId) {
            return SEND_BUTTON_GIF_URL;
        }

        const db = await openSendButtonMediaDb();
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction('files', 'readonly');
                const store = transaction.objectStore('files');
                const request = store.get(mediaId);
                request.onsuccess = () => {
                    const record = request.result;
                    if (record?.blob instanceof Blob) {
                        resolve(URL.createObjectURL(record.blob));
                        return;
                    }
                    resolve(SEND_BUTTON_GIF_URL);
                };
                request.onerror = () => resolve(SEND_BUTTON_GIF_URL);
                transaction.oncomplete = () => {
                    try { db.close(); } catch (error) {}
                };
            } catch (error) {
                try { db.close(); } catch (closeError) {}
                resolve(SEND_BUTTON_GIF_URL);
            }
        });
    }

    function ensureSendButtonGifStyle(buttonElement) {
        const ownerDocument = buttonElement?.ownerDocument;
        if (!ownerDocument || ownerDocument.getElementById(SEND_BUTTON_GIF_STYLE_ID)) {
            return;
        }

        const styleElement = ownerDocument.createElement('style');
        styleElement.id = SEND_BUTTON_GIF_STYLE_ID;
        styleElement.textContent = `
            .kingfall-send-button-gif {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                overflow: hidden;
                border-radius: inherit;
                background: rgba(255, 255, 255, 0.0);
            }

            .kingfall-send-button-gif img {
                max-width: 90%;
                max-height: 90%;
                object-fit: contain;
                pointer-events: none;
                image-rendering: auto;
            }

            .kingfall-send-button-gif + * {
                visibility: hidden !important;
            }
        `;
        ownerDocument.head.appendChild(styleElement);
    }

    async function setSendButtonProcessingState(active, settings = getSettings()) {
        const sendButton = getCurrentSendButtonElement();
        if (active) {
            if (!sendButton || state.sendButtonVisualState?.button === sendButton) {
                return;
            }

            ensureSendButtonGifStyle(sendButton);

            const ownerDocument = sendButton.ownerDocument;
            const computedPosition = ownerDocument?.defaultView?.getComputedStyle(sendButton).position || '';
            const overlay = ownerDocument.createElement('span');
            overlay.className = 'kingfall-send-button-gif';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = '<img alt="">';
            const imageElement = overlay.querySelector('img');
            const mediaUrl = await getConfiguredSendButtonMediaUrl(settings);
            if (imageElement) {
                imageElement.src = mediaUrl;
            }

            state.sendButtonVisualState = {
                button: sendButton,
                position: sendButton.style.position || '',
                overflow: sendButton.style.overflow || '',
                opacity: sendButton.style.opacity || '',
                html: sendButton.innerHTML,
                mediaUrl,
                overlay,
            };

            if (!computedPosition || computedPosition === 'static') {
                sendButton.style.position = 'relative';
            }
            sendButton.style.overflow = 'hidden';
            sendButton.style.opacity = '0.96';
            sendButton.innerHTML = '';
            sendButton.appendChild(overlay);
            return;
        }

        const snapshot = state.sendButtonVisualState;
        if (!snapshot?.button) {
            return;
        }

        try {
            snapshot.button.innerHTML = snapshot.html;
            snapshot.button.style.position = snapshot.position;
            snapshot.button.style.overflow = snapshot.overflow;
            snapshot.button.style.opacity = snapshot.opacity;
            if (snapshot.mediaUrl && snapshot.mediaUrl.startsWith('blob:')) {
                URL.revokeObjectURL(snapshot.mediaUrl);
            }
        } catch (error) {}

        state.sendButtonVisualState = null;
    }

    function getRuntimeProfileDebugText(bindingKey = 'default', settings = getSettings()) {
        const profile = typeof networkData.getAiBindingProfile === 'function'
            ? networkData.getAiBindingProfile(bindingKey, settings)
            : null;
        const profileName = String(profile?.name || '').trim() || '未命名API';
        const modelName = String(profile?.model || '').trim() || '未设模型';
        const endpoint = String(profile?.url || '').trim() || '未设地址';
        return `${profileName} | ${modelName} | ${endpoint}`;
    }

    async function buildPromptMessages(userInput, settings = getSettings()) {
        const messages = [];
        const presetEntry = typeof networkData.getSelectedAiPresetEntry === 'function'
            ? networkData.getSelectedAiPresetEntry(settings)
            : null;

        if (presetEntry && typeof networkData.buildAiMessagesFromPresetBlocks === 'function') {
            try {
                const presetMessages = await networkData.buildAiMessagesFromPresetBlocks(presetEntry.blocks || [], settings, {
                    kingfallUserInput: userInput,
                });
                if (Array.isArray(presetMessages) && presetMessages.length) {
                    messages.push(...presetMessages);
                }
            } catch (error) {
                console.warn('[network-shortcut/Kingfall] 预设消息构建失败。', error);
            }
        }

        if (!messages.length) {
            messages.push({
                role: 'system',
                content: '你是 Kingfall 前置处理器。请基于给定的上下文，输出一段可供后续主回复参考的中文文本。',
            });
        }

        return messages.filter((message) => {
            const role = String(message?.role || '').trim();
            const content = String(message?.content || '').trim();
            return !!role && !!content;
        });
    }

    function logOutboundMessages(messages) {
        if (!Array.isArray(messages)) {
            console.log('[Kingfall] 即将发送的 messages：[]');
            return;
        }

        const printableMessages = messages.map((message, index) => ({
            index,
            role: String(message?.role || '').trim(),
            content: String(message?.content || ''),
        }));

        console.groupCollapsed(`[Kingfall] 即将发送的 messages（共 ${printableMessages.length} 条）`);
        printableMessages.forEach((message) => {
            console.log(`#${message.index} [${message.role || 'unknown'}]`);
            console.log(message.content);
        });
        try {
            console.log('[Kingfall] messages JSON =', JSON.stringify(printableMessages, null, 2));
        } catch (error) {
            console.warn('[Kingfall] messages JSON 序列化失败。', error);
        }
        console.groupEnd();
    }

    function extractJsonTextFromReply(replyText) {
        const text = String(replyText || '').trim();
        if (!text) {
            return '';
        }

        const xmlWrappedMatch = text.match(/<kingfall_json>([\s\S]*?)<\/kingfall_json>/i);
        if (xmlWrappedMatch && xmlWrappedMatch[1]) {
            return String(xmlWrappedMatch[1]).trim();
        }

        const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch && fencedMatch[1]) {
            return String(fencedMatch[1]).trim();
        }

        const firstBraceIndex = text.indexOf('{');
        const lastBraceIndex = text.lastIndexOf('}');
        if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex >= firstBraceIndex) {
            return text.slice(firstBraceIndex, lastBraceIndex + 1).trim();
        }

        const firstBracketIndex = text.indexOf('[');
        const lastBracketIndex = text.lastIndexOf(']');
        if (firstBracketIndex !== -1 && lastBracketIndex !== -1 && lastBracketIndex >= firstBracketIndex) {
            return text.slice(firstBracketIndex, lastBracketIndex + 1).trim();
        }

        return text;
    }

    function parseKingfallOperationPayload(replyText) {
        const jsonText = extractJsonTextFromReply(replyText);
        if (!jsonText) {
            throw new Error('Kingfall 返回内容为空，无法解析结构操作');
        }

        try {
            return JSON.parse(jsonText);
        } catch (error) {
            console.warn('[Kingfall] 结构操作 JSON 解析失败，原文本：', replyText);
            throw new Error('Kingfall 返回的结构操作不是合法 JSON');
        }
    }

    async function ensureKingfallVariableReady() {
        const stApi = getSTAPI();

        try {
            if (typeof networkData.readKingfallVariableText === 'function') {
                return String(await networkData.readKingfallVariableText() || '').trim();
            }
            if (stApi?.variables?.get) {
                const existing = await stApi.variables.get({ name: VARIABLE_NAME, scope: 'local' });
                return String(existing?.value ?? '').trim();
            }
        } catch (error) {}

        let fallbackText = '';
        if (typeof networkData.ensureCurrentChatKingfallStateReady === 'function') {
            try {
                fallbackText = String(await networkData.ensureCurrentChatKingfallStateReady() || '').trim();
            } catch (error) {
                console.warn('[network-shortcut/Kingfall] 初始化当前聊天的 Kingfall 变量失败。', error);
            }
        }

        if (!fallbackText && typeof networkData.getResultDesignJsonText === 'function') {
            fallbackText = String(networkData.getResultDesignJsonText() || '').trim();
        }

        if (typeof networkData.writeKingfallVariableText === 'function') {
            await networkData.writeKingfallVariableText(fallbackText, { reason: 'ensure-variable-ready-fallback' });
            return fallbackText;
        }

        if (!stApi?.variables?.set) {
            return fallbackText;
        }

        await stApi.variables.set({ name: VARIABLE_NAME, value: fallbackText, scope: 'local' });
        return fallbackText;
    }

    async function generateKingfallReply(userInput, settings = getSettings()) {
        const stApi = getSTAPI();
        if (!stApi?.prompt?.generate || !stApi?.variables?.set) {
            throw new Error('当前环境缺少 ST_API.prompt.generate 或 ST_API.variables.set');
        }

        await ensureKingfallVariableReady();

        const freshSettings = getFreshSettings();
        const runtimeSettings = typeof networkData.getAiRuntimeSettings === 'function'
            ? networkData.getAiRuntimeSettings('default', freshSettings)
            : freshSettings;
        const messages = await buildPromptMessages(userInput, freshSettings);

        const stopSequences = [];
        try {
            const presetEntry = typeof networkData.getSelectedAiPresetEntry === 'function'
                ? networkData.getSelectedAiPresetEntry(freshSettings)
                : null;
            if (presetEntry && Array.isArray(presetEntry.blocks)) {
                presetEntry.blocks.forEach((block) => {
                    if (String(block?.role || '').trim() === '_prefix') {
                        const stop = String(block?.stopSequence || '').trim();
                        if (stop && !stopSequences.includes(stop)) {
                            stopSequences.push(stop);
                        }
                    }
                });
            }
        } catch (error) {}

        const endpoint = String(runtimeSettings?.url || '').trim();
        const apiKey = String(runtimeSettings?.key || '').trim();
        const model = String(runtimeSettings?.model || '').trim();
        const runtimeProfileDebugText = getRuntimeProfileDebugText('default', settings);
        const abortController = new AbortController();

        state.fetchAbortController = abortController;

        console.log('[Kingfall] 更新生成参考资料……');
        console.log('[Kingfall] 当前调用 API：', runtimeProfileDebugText);
        logOutboundMessages(messages);

        if (!endpoint || !apiKey || !model) {
            const configError = new Error('Kingfall 所需的 API 地址、密钥或模型未配置完整');
            console.error('[Kingfall] 实际报错：', configError);
            console.error('[Kingfall] 原生文本：', '（无，配置未完成）');
            state.fetchAbortController = null;
            throw configError;
        }

        let rawResponseText = '';
        try {
            const deepseekThinking = String(runtimeSettings?.deepseekThinking || '').trim();
            const deepseekReasoningEffort = String(runtimeSettings?.deepseekReasoningEffort || '').trim();
            const isDeepseekThinkingEnabled = deepseekThinking === 'enabled';

            const requestBody = {
                model,
                messages,
                temperature: runtimeSettings?.temperature === '' ? undefined : Number(runtimeSettings.temperature),
                top_p: runtimeSettings?.topP === '' ? undefined : Number(runtimeSettings.topP),
                stream: false,
            };

            if (isDeepseekThinkingEnabled) {
                requestBody.thinking = { type: 'enabled' };
                requestBody.reasoning_effort = deepseekReasoningEffort === 'max' ? 'max' : 'high';
            } else if (deepseekThinking === 'disabled') {
                requestBody.thinking = { type: 'disabled' };
            }

            if (stopSequences.length) {
                requestBody.stop = stopSequences;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            rawResponseText = await response.text().catch(() => '');

            if (!response.ok) {
                const httpError = new Error(`Kingfall 请求失败：${response.status} ${rawResponseText}`.trim());
                console.error('[Kingfall] 原生文本：', rawResponseText || '（空）');
                console.error('[Kingfall] 实际报错：', httpError);
                throw httpError;
            }

            let payload = null;
            try {
                payload = rawResponseText ? JSON.parse(rawResponseText) : null;
            } catch (error) {
                console.error('[Kingfall] 原生文本：', rawResponseText || '（空）');
                console.error('[Kingfall] 实际报错：', error);
                throw new Error('Kingfall 返回的内容不是合法 JSON');
            }

            const replyText = String(
                payload?.choices?.[0]?.message?.content
                || payload?.choices?.[0]?.text
                || payload?.text
                || ''
            ).trim();

            console.log('[Kingfall] 原生文本：', replyText || rawResponseText || '（空）');

            if (!replyText) {
                const emptyError = new Error('Kingfall 返回内容为空');
                console.error('[Kingfall] 实际报错：', emptyError);
                console.error('[Kingfall] 原生文本：', rawResponseText || '（空）');
                throw emptyError;
            }

            let operationPayload = null;
            try {
                operationPayload = parseKingfallOperationPayload(replyText);
            } catch (error) {
                console.error('[Kingfall] 实际报错：', error);
                throw error;
            }

            let appliedTree = null;
            if (typeof networkData.applyResultDesignOperations === 'function') {
                try {
                    const applyResult = networkData.applyResultDesignOperations(operationPayload?.operations || operationPayload);
                    if (applyResult && Array.isArray(applyResult.tree)) {
                        appliedTree = applyResult.tree;
                    }
                } catch (error) {
                    console.warn('[network-shortcut/Kingfall] 应用结果设计操作失败。', error);
                }
            }

            if (!appliedTree && typeof networkData.syncKingfallVariableFromResultDesign === 'function') {
                try {
                    await networkData.syncKingfallVariableFromResultDesign(undefined, { reason: 'send-hook-no-apply-result-sync' });
                } catch (error) {
                    console.warn('[network-shortcut/Kingfall] 无 applyResult 时回写 Kingfall 结构 JSON 失败。', error);
                }
            } else if (!appliedTree) {
                const fallbackJsonText = typeof networkData.getResultDesignJsonText === 'function'
                    ? String(networkData.getResultDesignJsonText() || '').trim()
                    : '';
                if (typeof networkData.writeKingfallVariableText === 'function') {
                    await networkData.writeKingfallVariableText(fallbackJsonText, { reason: 'send-hook-no-apply-result-fallback-sync' });
                } else {
                    await stApi.variables.set({ name: VARIABLE_NAME, value: fallbackJsonText, scope: 'local' });
                }
            }

            return replyText;
        } catch (error) {
            if (error?.name === 'AbortError') {
                console.warn('[Kingfall] 本次参考资料更新已取消。');
                throw error;
            }
            if (rawResponseText) {
                console.error('[Kingfall] 原生文本：', rawResponseText);
            }
            console.error('[Kingfall] 实际报错：', error);
            throw error;
        } finally {
            if (state.fetchAbortController === abortController) {
                state.fetchAbortController = null;
            }
        }
    }

    async function setBusy(busy) {
        /*
         * 暂时不再切换酒馆发送按钮的 spinner 等待态。
         * 原因：这会让酒馆内容区右侧出现额外滚动条，看起来像整个内容区被撑开了。
         * 目前保留输入框灰化即可。
         */
        void busy;
    }

    function prepareInputForNativeSend(inputText) {
        const inputElement = getCurrentInputElement();
        if (!inputElement) {
            return null;
        }

        inputElement.readOnly = false;
        inputElement.disabled = false;
        inputElement.value = String(inputText || '');
        inputElement.removeAttribute('aria-busy');
        dispatchInputMutationEvents(inputElement);
        return inputElement;
    }

    async function bypassAndSend(target, inputText) {
        const stApi = getSTAPI();
        if (!stApi?.hooks?.bypassOnce) {
            throw new Error('当前环境缺少 ST_API.hooks.bypassOnce');
        }

        await stApi.hooks.bypassOnce({ id: HOOK_ID, target });
        const inputElement = prepareInputForNativeSend(inputText);

        const sendButton = getCurrentSendButtonElement();
        if (sendButton) {
            try {
                sendButton.disabled = false;
                sendButton.removeAttribute('disabled');
                sendButton.removeAttribute('aria-busy');
            } catch (error) {}
        }

        if (inputElement) {
            try {
                inputElement.focus();
            } catch (error) {}
        }

        if (target === 'sendEnter') {
            if (inputElement) {
                const keyboardEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                    cancelable: true,
                });
                inputElement.dispatchEvent(keyboardEvent);
                return;
            }
        }

        if (sendButton) {
            try {
                if (typeof sendButton.focus === 'function') {
                    sendButton.focus();
                }
            } catch (error) {}

            try {
                sendButton.click();
                return;
            } catch (error) {
                console.warn('[Kingfall] 发送按钮 click 放行失败，尝试原生 MouseEvent。', error);
            }

            try {
                sendButton.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: sendButton.ownerDocument?.defaultView || window,
                }));
                return;
            } catch (error) {
                console.warn('[Kingfall] 发送按钮 MouseEvent 放行失败。', error);
            }
        }

        throw new Error('未找到酒馆发送按钮');
    }

    function cancelCurrentProcessing() {
        state.cancelRequested = true;
        try {
            state.fetchAbortController?.abort();
        } catch (error) {
            console.warn('[Kingfall] 取消当前请求失败。', error);
        }
    }

    async function handleInterceptEvent(event) {
        const payload = event?.detail;
        const target = String(payload?.target || '').trim();
        if (target !== 'sendButton' && target !== 'sendEnter') {
            return;
        }

        if (state.running) {
            cancelCurrentProcessing();
            return;
        }

        const settings = getSettings();
        if (!isEnabled(settings)) {
            return;
        }

        const userInput = String(getCurrentInputText() || '').trim();
        if (!userInput) {
            try {
                await bypassAndSend(target);
            } catch (error) {
                console.warn('[network-shortcut/Kingfall] 空输入放行失败。', error);
            }
            return;
        }

        state.running = true;
        state.cancelRequested = false;
        let handedOffToNativeSend = false;
        setInputProcessingState(true);
        await setSendButtonProcessingState(true, settings);
        await setBusy(true);
        try {
            let shouldBypassAndSend = true;
            try {
                await generateKingfallReply(userInput, settings);
            } catch (error) {
                if (state.cancelRequested || error?.name === 'AbortError') {
                    shouldBypassAndSend = false;
                } else {
                    shouldBypassAndSend = shouldContinueSendOnError(settings);
                    console.warn(shouldBypassAndSend
                        ? '[network-shortcut/Kingfall] 预处理失败，按设置继续放行发送。'
                        : '[network-shortcut/Kingfall] 预处理失败，按设置中止放行发送。');
                    console.error('[Kingfall] 实际报错：', error);
                }
            }

            if (shouldBypassAndSend && !state.cancelRequested) {
                if (typeof networkData.traceKingfallVariableSnapshot === 'function') {
                    await networkData.traceKingfallVariableSnapshot('before-bypass-send', {
                        reason: 'pre-native-send',
                        target,
                    });
                }
                await bypassAndSend(target, userInput);
                handedOffToNativeSend = true;
                if (typeof networkData.traceKingfallVariableSnapshot === 'function') {
                    window.setTimeout(() => {
                        networkData.traceKingfallVariableSnapshot('after-bypass-send-0ms', {
                            reason: 'post-native-send',
                            delayMs: 0,
                            target,
                        }).catch((error) => {
                            console.warn('[Kingfall] 0ms 延迟回读 Kingfall 变量失败。', error);
                        });
                    }, 0);
                    window.setTimeout(() => {
                        networkData.traceKingfallVariableSnapshot('after-bypass-send-50ms', {
                            reason: 'post-native-send',
                            delayMs: 50,
                            target,
                        }).catch((error) => {
                            console.warn('[Kingfall] 50ms 延迟回读 Kingfall 变量失败。', error);
                        });
                    }, 50);
                    window.setTimeout(() => {
                        networkData.traceKingfallVariableSnapshot('after-bypass-send-200ms', {
                            reason: 'post-native-send',
                            delayMs: 200,
                            target,
                        }).catch((error) => {
                            console.warn('[Kingfall] 200ms 延迟回读 Kingfall 变量失败。', error);
                        });
                    }, 200);
                }
            }
        } finally {
            await setBusy(false);
            setSendButtonProcessingState(false);
            if (handedOffToNativeSend) {
                window.setTimeout(() => {
                    setInputProcessingState(false, { restoreValue: false });
                }, 0);
            } else {
                setInputProcessingState(false);
            }
            state.fetchAbortController = null;
            state.cancelRequested = false;
            state.running = false;
        }
    }

    function ensureInterceptListeners() {
        const nextTargets = [];
        const seenTargets = new Set();
        const candidateWindows = getCandidateWindows();

        for (let index = 0; index < candidateWindows.length; index += 1) {
            const targetWindow = candidateWindows[index];
            if (!targetWindow || seenTargets.has(targetWindow)) {
                continue;
            }
            seenTargets.add(targetWindow);
            nextTargets.push(targetWindow);
        }

        if (!state.handler) {
            state.handler = handleInterceptEvent;
        }

        const previousTargets = Array.isArray(state.listenTargets) ? state.listenTargets : [];
        previousTargets.forEach((targetWindow) => {
            if (!nextTargets.includes(targetWindow)) {
                try {
                    targetWindow.removeEventListener('st-api-wrapper:intercept', state.handler);
                } catch (error) {}
            }
        });

        nextTargets.forEach((targetWindow) => {
            if (!previousTargets.includes(targetWindow)) {
                try {
                    targetWindow.addEventListener('st-api-wrapper:intercept', state.handler);
                } catch (error) {}
            }
        });

        state.listenTargets = nextTargets;
        state.listening = nextTargets.length > 0;
    }

    function removeInterceptListeners() {
        const previousTargets = Array.isArray(state.listenTargets) ? state.listenTargets : [];
        previousTargets.forEach((targetWindow) => {
            try {
                if (state.handler) {
                    targetWindow.removeEventListener('st-api-wrapper:intercept', state.handler);
                }
            } catch (error) {}
        });
        state.listenTargets = [];
        state.listening = false;
    }

    async function installHookIfNeeded() {
        const stApi = getSTAPI();
        if (!stApi?.hooks?.install || !stApi?.hooks?.uninstall) {
            return false;
        }

        ensureInterceptListeners();

        if (state.installed) {
            return true;
        }

        try {
            await stApi.hooks.uninstall({ id: HOOK_ID }).catch(() => null);
        } catch (error) {}

        await stApi.hooks.install({
            id: HOOK_ID,
            intercept: {
                targets: ['sendButton', 'sendEnter'],
                block: {
                    sendButton: true,
                    sendEnter: true,
                },
                onlyWhenSendOnEnter: true,
            },
            broadcast: { target: 'dom' },
        });

        state.installed = true;
        return true;
    }

    async function uninstallHookIfNeeded() {
        const stApi = getSTAPI();
        if (state.installed && stApi?.hooks?.uninstall) {
            try {
                await stApi.hooks.uninstall({ id: HOOK_ID });
            } catch (error) {
                console.warn('[network-shortcut/Kingfall] 卸载发送拦截失败。', error);
            }
        }
        removeInterceptListeners();
        state.installed = false;
    }

    async function refreshHookState() {
        const stApi = getSTAPI();
        const enabled = isEnabled(getSettings());
        const supported = !!(stApi?.hooks?.install && stApi?.hooks?.bypassOnce && stApi?.variables?.set);

        if (!supported) {
            await uninstallHookIfNeeded();
            return;
        }

        if (enabled) {
            await installHookIfNeeded();
            return;
        }

        await uninstallHookIfNeeded();
    }

    function scheduleRefresh() {
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
        }

        state.refreshTimer = window.setTimeout(() => {
            state.refreshTimer = 0;
            refreshHookState().catch((error) => {
                console.warn('[network-shortcut/Kingfall] 刷新发送拦截状态失败。', error);
            });
        }, 0);
    }

    if (typeof networkData.subscribeAiSettings === 'function') {
        networkData.subscribeAiSettings(() => {
            scheduleRefresh();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleRefresh, { once: true });
    } else {
        scheduleRefresh();
    }

    networkApp.kingfallHook = {
        refresh: scheduleRefresh,
        getState() {
            return { ...state };
        },
    };
})(window.NetworkShortcutApp);
