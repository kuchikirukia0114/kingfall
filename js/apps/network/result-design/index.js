(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};
    networkApp.data = networkApp.data || {};

    const networkData = networkApp.data;
    const VARIABLE_NAME = 'Kingfall';
    const HOST_SYNC_FLAG = '__kingfallVariableSyncInstalled__';
    const MOBILE_BREAKPOINT = 768;
    const state = networkApp.resultDesignPageState = networkApp.resultDesignPageState || {
        root: null,
        isBound: false,
        unsubscribe: null,
        expandedNodes: {},
        pendingScrollToNodeId: '',
        draftTree: [],
        draftInitialized: false,
        savedTreeSnapshot: '[]',
        statusText: '',
        statusTone: 'neutral',
        isSaving: false,
        syncTimer: 0,
        selectedNodeId: '',
        selectedNodeType: '',
        selectedParentId: '',
        modalOpen: false,
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createParentId(index) {
        return 'result_parent_' + Date.now() + '_' + (index || 0) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function createChildId(parentIndex, childIndex) {
        return 'result_child_' + Date.now() + '_' + (parentIndex || 0) + '_' + (childIndex || 0) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function normalizeResultDesignTree(tree) {
        if (!Array.isArray(tree)) return [];
        return tree.map(function (parentNode, parentIndex) {
            return {
                id: (typeof parentNode?.id === 'string' && parentNode.id.trim())
                    ? parentNode.id.trim().slice(0, 80)
                    : createParentId(parentIndex),
                name: typeof parentNode?.name === 'string' ? parentNode.name.trim().slice(0, 40) : '',
                description: typeof parentNode?.description === 'string' ? parentNode.description.trim().slice(0, 200) : '',
                children: Array.isArray(parentNode?.children)
                    ? parentNode.children.map(function (childNode, childIndex) {
                        return {
                            id: (typeof childNode?.id === 'string' && childNode.id.trim())
                                ? childNode.id.trim().slice(0, 80)
                                : createChildId(parentIndex, childIndex),
                            name: typeof childNode?.name === 'string' ? childNode.name.trim().slice(0, 40) : '',
                            description: typeof childNode?.description === 'string' ? childNode.description.trim().slice(0, 200) : '',
                            value: typeof childNode?.value === 'string' ? childNode.value.slice(0, 20000) : '',
                        };
                    })
                    : [],
            };
        });
    }

    function cloneResultDesignTree(tree) {
        return normalizeResultDesignTree(tree).map(function (parentNode) {
            return {
                id: parentNode.id,
                name: parentNode.name,
                description: parentNode.description,
                children: (Array.isArray(parentNode.children) ? parentNode.children : []).map(function (childNode) {
                    return {
                        id: childNode.id,
                        name: childNode.name,
                        description: childNode.description,
                        value: childNode.value,
                    };
                }),
            };
        });
    }

    function buildTreeSnapshot(tree) {
        return JSON.stringify(normalizeResultDesignTree(tree));
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

    function getSTAPI() {
        const candidates = getCandidateWindows();
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

    function getSillyTavernContextHost() {
        const candidates = getCandidateWindows();
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            try {
                if (!candidate || !candidate.SillyTavern || typeof candidate.SillyTavern.getContext !== 'function') {
                    continue;
                }
                const context = candidate.SillyTavern.getContext();
                if (context && (context.eventSource || context.variables || context.event_types)) {
                    return {
                        hostWindow: candidate,
                        context,
                    };
                }
            } catch (error) {}
        }
        return null;
    }

    function getLocalVariableAccessor() {
        var hostInfo = getSillyTavernContextHost();
        var localVariables = hostInfo?.context?.variables?.local;
        if (!localVariables) {
            return null;
        }
        if (typeof localVariables.get !== 'function' || typeof localVariables.set !== 'function') {
            return null;
        }
        return localVariables;
    }

    function isMobileView() {
        try {
            return window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)').matches;
        } catch (error) {
            return window.innerWidth <= MOBILE_BREAKPOINT;
        }
    }

    function getSettings() {
        if (typeof networkData.getAiSettings === 'function') return networkData.getAiSettings();
        if (networkData.currentAiSettings && typeof networkData.currentAiSettings === 'object') return networkData.currentAiSettings;
        if (typeof networkData.normalizeAiSettings === 'function') return networkData.normalizeAiSettings({});
        return { resultDesignTree: [] };
    }

    function setSettings(nextSettings, opts) {
        var silent = opts && opts.silent === true;
        if (typeof networkData.setAiSettings === 'function') return networkData.setAiSettings(nextSettings, { silent: silent });
        networkData.currentAiSettings = nextSettings;
        return nextSettings;
    }

    function getResultDesignTree(settings) {
        return normalizeResultDesignTree((settings || getSettings())?.resultDesignTree);
    }

    function updateResultDesignTree(nextTree, opts) {
        var settings = getSettings();
        return setSettings(Object.assign({}, settings, {
            resultDesignTree: normalizeResultDesignTree(nextTree),
        }), opts || {});
    }

    function buildResultDesignJson(tree) {
        if (!tree) tree = getResultDesignTree();
        var result = {};
        tree.forEach(function (parentNode) {
            var parentName = String(parentNode?.name || '').trim();
            if (!parentName) return;
            var parentPayload = {};
            var parentDescription = String(parentNode?.description || '').trim();
            if (parentDescription) parentPayload.description = parentDescription;
            var children = Array.isArray(parentNode?.children) ? parentNode.children : [];
            children.forEach(function (childNode) {
                var childName = String(childNode?.name || '').trim();
                if (!childName) return;
                parentPayload[childName] = {
                    description: String(childNode?.description || '').trim(),
                    value: String(childNode?.value || ''),
                };
            });
            result[parentName] = parentPayload;
        });
        return result;
    }

    function getResultDesignJsonText(tree) {
        return JSON.stringify(buildResultDesignJson(tree), null, 2);
    }

    function parseResultDesignJsonToTree(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return [];
        }

        var parentKeys = Object.keys(payload);
        return parentKeys.map(function (parentName, parentIndex) {
            var parentPayload = payload[parentName];
            var normalizedParentPayload = parentPayload && typeof parentPayload === 'object' && !Array.isArray(parentPayload)
                ? parentPayload
                : {};
            var childKeys = Object.keys(normalizedParentPayload).filter(function (key) {
                return key !== 'description';
            });

            return {
                id: createParentId(parentIndex),
                name: String(parentName || '').trim().slice(0, 40),
                description: typeof normalizedParentPayload.description === 'string'
                    ? normalizedParentPayload.description.trim().slice(0, 200)
                    : '',
                children: childKeys.map(function (childName, childIndex) {
                    var childPayload = normalizedParentPayload[childName];
                    var normalizedChildPayload = childPayload && typeof childPayload === 'object' && !Array.isArray(childPayload)
                        ? childPayload
                        : null;
                    return {
                        id: createChildId(parentIndex, childIndex),
                        name: String(childName || '').trim().slice(0, 40),
                        description: typeof normalizedChildPayload?.description === 'string'
                            ? normalizedChildPayload.description.trim().slice(0, 200)
                            : '',
                        value: normalizedChildPayload
                            ? String(normalizedChildPayload.value || '').slice(0, 20000)
                            : String(childPayload || '').slice(0, 20000),
                    };
                }),
            };
        }).filter(function (parentNode) {
            return !!String(parentNode.name || '').trim();
        });
    }

    function parseResultDesignJsonText(jsonText) {
        var text = String(jsonText || '').trim();
        if (!text) {
            return [];
        }
        return parseResultDesignJsonToTree(JSON.parse(text));
    }

    function clearSelection() {
        state.selectedNodeId = '';
        state.selectedNodeType = '';
        state.selectedParentId = '';
    }

    function closeMobileEditorModal() {
        state.modalOpen = false;
    }

    function syncDraftFromSaved(settings) {
        var savedTree = cloneResultDesignTree(getResultDesignTree(settings));
        state.draftTree = savedTree;
        state.draftInitialized = true;
        state.savedTreeSnapshot = buildTreeSnapshot(savedTree);
        clearSelection();
        closeMobileEditorModal();
    }

    function getWorkingTree() {
        if (!state.draftInitialized) {
            syncDraftFromSaved(getSettings());
        }
        return cloneResultDesignTree(state.draftTree);
    }

    function setWorkingTree(nextTree) {
        state.draftTree = cloneResultDesignTree(nextTree);
        state.draftInitialized = true;
    }

    function hasUnsavedChanges() {
        return buildTreeSnapshot(getWorkingTree()) !== state.savedTreeSnapshot;
    }

    function resolveStatusText(hasUnsaved) {
        if (String(state.statusText || '').trim()) {
            return state.statusText;
        }
        return hasUnsaved ? '当前有未保存修改。' : '已与保存状态一致。';
    }

    function markDirtyStatus() {
        state.statusText = '当前有未保存修改。';
        state.statusTone = 'warning';
    }

    function markStatus(text, tone) {
        state.statusText = String(text || '').trim();
        state.statusTone = tone || 'neutral';
    }

    async function readKingfallVariableText() {
        const localVariables = getLocalVariableAccessor();
        if (localVariables?.get) {
            try {
                return String(await Promise.resolve(localVariables.get(VARIABLE_NAME)) ?? '').trim();
            } catch (error) {}
        }

        const stApi = getSTAPI();
        if (stApi?.variables?.get) {
            try {
                const result = await stApi.variables.get({ name: VARIABLE_NAME, scope: 'local' });
                return String(result?.value ?? '').trim();
            } catch (error) {}
        }

        return '';
    }

    function isLikelyWrappedKingfallPayload(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        return Array.isArray(value.operations) || Object.prototype.hasOwnProperty.call(value, 'reply');
    }

    function safeJsonParse(text) {
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function summarizeKingfallVariableText(text) {
        var normalizedText = String(text == null ? '' : text);
        var trimmedText = normalizedText.trim();
        var parsed = safeJsonParse(trimmedText);
        var keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? Object.keys(parsed).slice(0, 8)
            : [];
        return {
            length: trimmedText.length,
            preview: trimmedText.slice(0, 300),
            keys: keys,
            hasOperations: !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'operations')),
            hasReply: !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'reply')),
        };
    }

    function logKingfallVariableTrace(stage, payload) {
        try {
            console.warn('[kingfall/result-design][trace:' + String(stage || 'unknown') + ']', payload || {});
        } catch (error) {}
    }

    async function traceKingfallVariableSnapshot(stage, extra) {
        var text = '';
        try {
            text = await readKingfallVariableText();
        } catch (error) {
            logKingfallVariableTrace(stage, Object.assign({
                readFailed: true,
                error: error?.message || String(error || ''),
            }, extra || {}));
            return '';
        }
        logKingfallVariableTrace(stage, Object.assign({
            value: summarizeKingfallVariableText(text),
        }, extra || {}));
        return text;
    }

    async function assertKingfallVariableIntegrity(expectedValue, reason) {
        var expectedText = String(expectedValue == null ? '' : expectedValue).trim();
        if (!expectedText) {
            return '';
        }

        var actualText = '';
        try {
            actualText = await readKingfallVariableText();
        } catch (error) {
            console.warn('[kingfall/result-design] 写入后回读 Kingfall 变量失败。', error);
            return expectedText;
        }

        if (!actualText) {
            console.warn('[kingfall/result-design] Kingfall 变量写入后为空，准备自动修复。', { reason: reason || 'unknown' });
            await forceRewriteKingfallVariable(expectedText, reason || 'empty-after-write');
            return expectedText;
        }

        if (actualText === expectedText) {
            return actualText;
        }

        var parsedActual = safeJsonParse(actualText);
        if (isLikelyWrappedKingfallPayload(parsedActual)) {
            console.warn('[kingfall/result-design] 检测到 Kingfall 变量被包装成 operations/reply 结构，准备自动修复。', {
                reason: reason || 'wrapped-after-write',
                actual: parsedActual,
            });
            await forceRewriteKingfallVariable(expectedText, reason || 'wrapped-after-write');
            return expectedText;
        }

        console.warn('[kingfall/result-design] Kingfall 变量写入后与期望不一致。', {
            reason: reason || 'mismatch-after-write',
            expected: expectedText,
            actual: actualText,
        });
        return actualText;
    }

    async function forceRewriteKingfallVariable(value, reason) {
        const nextValue = String(value == null ? '' : value);
        const localVariables = getLocalVariableAccessor();
        if (localVariables?.set) {
            await Promise.resolve(localVariables.set(VARIABLE_NAME, nextValue));
            console.warn('[kingfall/result-design] 已使用 context.variables.local.set 强制修复 Kingfall 变量。', { reason: reason || 'unknown' });
            return nextValue;
        }

        const stApi = getSTAPI();
        if (stApi?.variables?.set) {
            await stApi.variables.set({ name: VARIABLE_NAME, value: nextValue, scope: 'local' });
            console.warn('[kingfall/result-design] 已使用 ST_API.variables.set 强制修复 Kingfall 变量。', { reason: reason || 'unknown' });
            return nextValue;
        }

        throw new Error('当前环境缺少可用的当前聊天变量强制修复接口');
    }

    async function writeKingfallVariableText(value, options) {
        const nextValue = String(value == null ? '' : value);
        const writeReason = String(options?.reason || 'direct-write').trim() || 'direct-write';

        logKingfallVariableTrace('before-write', {
            reason: writeReason,
            expected: summarizeKingfallVariableText(nextValue),
        });

        const localVariables = getLocalVariableAccessor();
        if (localVariables?.set) {
            await Promise.resolve(localVariables.set(VARIABLE_NAME, nextValue));
            const verifiedText = await assertKingfallVariableIntegrity(nextValue, writeReason);
            await traceKingfallVariableSnapshot('after-write', {
                reason: writeReason,
                channel: 'context.variables.local.set',
                expected: summarizeKingfallVariableText(nextValue),
                actual: summarizeKingfallVariableText(verifiedText),
            });
            return verifiedText;
        }

        const stApi = getSTAPI();
        if (stApi?.variables?.set) {
            await stApi.variables.set({ name: VARIABLE_NAME, value: nextValue, scope: 'local' });
            const verifiedText = await assertKingfallVariableIntegrity(nextValue, writeReason);
            await traceKingfallVariableSnapshot('after-write', {
                reason: writeReason,
                channel: 'ST_API.variables.set',
                expected: summarizeKingfallVariableText(nextValue),
                actual: summarizeKingfallVariableText(verifiedText),
            });
            return verifiedText;
        }

        throw new Error('当前环境缺少可用的当前聊天变量写入接口');
    }

    async function syncKingfallVariableFromResultDesign(tree, options) {
        const sourceTree = tree ? cloneResultDesignTree(tree) : getResultDesignTree();
        const jsonText = getResultDesignJsonText(sourceTree);
        await writeKingfallVariableText(jsonText, { reason: options?.reason || 'result-design-sync' });
        return jsonText;
    }

    async function ensureCurrentChatKingfallStateReady() {
        const savedTree = getResultDesignTree();
        const fallbackText = getResultDesignJsonText(savedTree);
        let variableText = '';

        try {
            variableText = await readKingfallVariableText();
        } catch (error) {
            console.warn('[kingfall/result-design] 读取 Kingfall 变量失败。', error);
            return fallbackText;
        }

        if (!variableText) {
            try {
                await writeKingfallVariableText(fallbackText, { reason: 'ensure-empty-init' });
            } catch (error) {
                console.warn('[kingfall/result-design] 初始化 Kingfall 变量失败。', error);
            }
            return fallbackText;
        }

        try {
            var parsedTree = parseResultDesignJsonText(variableText);
            var parsedSnapshot = buildTreeSnapshot(parsedTree);
            if (parsedSnapshot !== buildTreeSnapshot(savedTree)) {
                updateResultDesignTree(parsedTree);
            }
            return variableText;
        } catch (error) {
            console.warn('[kingfall/result-design] 当前聊天的 Kingfall 变量不是结构 JSON，已回退为已保存结构。', error);
            try {
                await writeKingfallVariableText(fallbackText, { reason: 'ensure-invalid-repair' });
            } catch (writeError) {
                console.warn('[kingfall/result-design] 回写 Kingfall 变量失败。', writeError);
            }
            return fallbackText;
        }
    }

    function scheduleCurrentChatKingfallStateSync() {
        if (state.syncTimer) {
            window.clearTimeout(state.syncTimer);
        }
        state.syncTimer = window.setTimeout(function () {
            state.syncTimer = 0;
            ensureCurrentChatKingfallStateReady().catch(function (error) {
                console.warn('[kingfall/result-design] 同步当前聊天的 Kingfall 状态失败。', error);
            });
        }, 0);
    }

    function installCurrentChatKingfallSyncIfNeeded() {
        var hostInfo = getSillyTavernContextHost();
        if (!hostInfo || !hostInfo.context || !hostInfo.context.eventSource || !hostInfo.context.event_types) {
            scheduleCurrentChatKingfallStateSync();
            return;
        }

        var hostWindow = hostInfo.hostWindow || window;
        if (hostWindow[HOST_SYNC_FLAG]) {
            return;
        }
        hostWindow[HOST_SYNC_FLAG] = true;

        var ensureReady = function () {
            scheduleCurrentChatKingfallStateSync();
        };

        hostInfo.context.eventSource.on(hostInfo.context.event_types.APP_READY, ensureReady);
        hostInfo.context.eventSource.on(hostInfo.context.event_types.CHAT_CHANGED, ensureReady);
        ensureReady();
    }

    function setSelectedParent(parentId) {
        state.selectedNodeId = String(parentId || '').trim();
        state.selectedNodeType = state.selectedNodeId ? 'parent' : '';
        state.selectedParentId = state.selectedNodeId;
    }

    function setSelectedChild(parentId, childId) {
        state.selectedNodeId = String(childId || '').trim();
        state.selectedNodeType = state.selectedNodeId ? 'child' : '';
        state.selectedParentId = String(parentId || '').trim();
    }

    function getSelectedNodeMeta() {
        var tree = getWorkingTree();
        if (state.selectedNodeType === 'parent') {
            var parentNode = findParentNodeById(tree, state.selectedNodeId);
            if (!parentNode) return null;
            return {
                type: 'parent',
                parentId: parentNode.id,
                node: parentNode,
            };
        }
        if (state.selectedNodeType === 'child') {
            var selectedParent = findParentNodeById(tree, state.selectedParentId);
            if (!selectedParent) return null;
            var childNode = findChildNodeById(selectedParent, state.selectedNodeId);
            if (!childNode) return null;
            return {
                type: 'child',
                parentId: selectedParent.id,
                childId: childNode.id,
                node: childNode,
            };
        }
        return null;
    }

    function getMobileSelectedLabel() {
        var selectedMeta = getSelectedNodeMeta();
        if (!selectedMeta) {
            return '未选中节点';
        }
        return selectedMeta.type === 'parent'
            ? '已选中父键：' + (selectedMeta.node.name || '(未命名)')
            : '已选中子键：' + (selectedMeta.node.name || '(未命名)');
    }

    function openSelectedNodeEditor() {
        if (!getSelectedNodeMeta()) {
            return;
        }
        state.modalOpen = true;
        render();
    }

    function deleteSelectedNode() {
        var selectedMeta = getSelectedNodeMeta();
        if (!selectedMeta) {
            return;
        }
        if (selectedMeta.type === 'parent') {
            deleteParentNode(selectedMeta.parentId);
            return;
        }
        deleteChildNode(selectedMeta.parentId, selectedMeta.childId);
    }

    function addNodeFromMobileAction() {
        var selectedMeta = getSelectedNodeMeta();
        if (selectedMeta?.type === 'parent') {
            addChildNode(selectedMeta.parentId);
            return;
        }
        if (selectedMeta?.type === 'child') {
 addChildNode(selectedMeta.parentId);
            return;
        }
        addParentNode();
    }

    /* --- find helpers --- */

    function findParentNodeById(tree, parentId) {
        var tid = String(parentId || '').trim();
        if (!tid) return null;
        for (var i = 0; i < tree.length; i++) { if (tree[i].id === tid) return tree[i]; }
        return null;
    }

    function findParentNodeByName(tree, parentName) {
        var tn = String(parentName || '').trim();
        if (!tn) return null;
        for (var i = 0; i < tree.length; i++) { if (String(tree[i]?.name || '').trim() === tn) return tree[i]; }
        return null;
    }

    function findChildNodeById(parentNode, childId) {
        var tid = String(childId || '').trim();
        if (!tid) return null;
        var ch = Array.isArray(parentNode?.children) ? parentNode.children : [];
        for (var i = 0; i < ch.length; i++) { if (ch[i].id === tid) return ch[i]; }
        return null;
    }

    function findChildNodeByName(parentNode, childName) {
        var tn = String(childName || '').trim();
        if (!tn) return null;
        var ch = Array.isArray(parentNode?.children) ? parentNode.children : [];
        for (var i = 0; i < ch.length; i++) { if (String(ch[i]?.name || '').trim() === tn) return ch[i]; }
        return null;
    }

    /* --- apply operations (AI only touches child values) --- */

    function applyResultDesignOperations(operationsInput) {
        var operations = Array.isArray(operationsInput)
            ? operationsInput
            : (Array.isArray(operationsInput?.operations) ? operationsInput.operations : []);
        if (!operations.length) return { ok: false, applied: 0, tree: getResultDesignTree() };
        var tree = getResultDesignTree();
        var applied = 0;
        var lastTouchedNodeId = '';
        operations.forEach(function (op, opIndex) {
            var action = String(op?.action || '').trim();
            var parentNode = findParentNodeById(tree, op?.parentId) || findParentNodeByName(tree, op?.parentName);
            if (!parentNode) return;
            if (action === 'updateChild') {
                var c = findChildNodeById(parentNode, op?.childId) || findChildNodeByName(parentNode, op?.childName);
                if (!c) return;
                c.value = String(op?.value || '').slice(0, 20000);
                lastTouchedNodeId = c.id;
                applied++;
                return;
            }
            if (action === 'addChild') {
                var cp = (op?.child && typeof op.child === 'object') ? op.child : {};
                var cn = String(cp.name || op?.childName || '').trim().slice(0, 40);
                if (!cn) return;
                var ec = findChildNodeByName(parentNode, cn);
                if (ec) {
                    ec.description = String(cp.description || op?.description || ec.description || '').slice(0, 200);
                    ec.value = String(cp.value || op?.value || ec.value || '').slice(0, 20000);
                    lastTouchedNodeId = ec.id;
                    applied++;
                    return;
                }
                var ch = Array.isArray(parentNode.children) ? parentNode.children : [];
                var newChildId = createChildId(opIndex, ch.length);
                ch.push({ id: newChildId, name: cn, description: String(cp.description || op?.description || '').slice(0, 200), value: String(cp.value || op?.value || '').slice(0, 20000) });
                parentNode.children = ch;
                lastTouchedNodeId = newChildId;
                applied++;
                return;
            }
            if (action === 'deleteChild') {
                var dc = findChildNodeById(parentNode, op?.childId) || findChildNodeByName(parentNode, op?.childName);
                if (!dc) return;
                parentNode.children = (Array.isArray(parentNode.children) ? parentNode.children : []).filter(function (x) { return x.id !== dc.id; });
                lastTouchedNodeId = parentNode.id;
                applied++;
            }
        });
        if (applied > 0) {
            state.expandedNodes = {};
            if (lastTouchedNodeId) {
                state.expandedNodes[lastTouchedNodeId] = true;
                state.pendingScrollToNodeId = lastTouchedNodeId;
            }
            updateResultDesignTree(tree);
            syncKingfallVariableFromResultDesign(tree, { reason: 'ai-operations-apply' }).catch(function (error) {
                console.warn('[kingfall/result-design] AI 更新后同步 Kingfall 变量失败。', error);
            });
        }
        return { ok: applied > 0, applied: applied, tree: getResultDesignTree() };
    }

    /* --- data mutations --- */

    function addParentNode() {
        var tree = getWorkingTree();
        var newId = createParentId(tree.length);
        tree.push({ id: newId, name: '', description: '', children: [] });
        setWorkingTree(tree);
        state.expandedNodes = {};
        state.expandedNodes[newId] = true;
        state.pendingScrollToNodeId = newId;
        setSelectedParent(newId);
        markDirtyStatus();
        render();
    }

    function deleteParentNode(parentId) {
        var tid = String(parentId || '').trim();
        if (!tid) return;
        delete state.expandedNodes[tid];
        var tree = getWorkingTree().filter(function (p) { return p.id !== tid; });
        setWorkingTree(tree);
        if (state.selectedNodeId === tid || state.selectedParentId === tid) {
            clearSelection();
        }
        closeMobileEditorModal();
        markDirtyStatus();
        render();
    }

    function addChildNode(parentId) {
        var tid = String(parentId || '').trim();
        if (!tid) return;
        var newChildId = '';
        var tree = getWorkingTree().map(function (parentNode, parentIndex) {
            if (parentNode.id !== tid) return parentNode;
            var children = Array.isArray(parentNode.children) ? parentNode.children.slice() : [];
            newChildId = createChildId(parentIndex, children.length);
            children.push({ id: newChildId, name: '', description: '', value: '' });
            return Object.assign({}, parentNode, { children: children });
        });
        setWorkingTree(tree);
        state.expandedNodes = {};
        if (newChildId) {
            state.expandedNodes[newChildId] = true;
            state.pendingScrollToNodeId = newChildId;
            setSelectedChild(tid, newChildId);
        }
        markDirtyStatus();
        render();
    }

    function deleteChildNode(parentId, childId) {
        var tpid = String(parentId || '').trim();
        var tcid = String(childId || '').trim();
        if (!tpid || !tcid) return;
        delete state.expandedNodes[tcid];
        var tree = getWorkingTree().map(function (parentNode) {
            if (parentNode.id !== tpid) return parentNode;
            return Object.assign({}, parentNode, {
                children: (Array.isArray(parentNode.children) ? parentNode.children : []).filter(function (c) { return c.id !== tcid; }),
            });
        });
        setWorkingTree(tree);
        if (state.selectedNodeId === tcid) {
            setSelectedParent(tpid);
        }
        closeMobileEditorModal();
        markDirtyStatus();
        render();
    }

    function updateParentField(parentId, field, value) {
        var tid = String(parentId || '').trim();
        if (!tid) return [];
        var tree = getWorkingTree().map(function (p) {
            if (p.id !== tid) return p;
            var patch = {}; patch[field] = String(value || '');
            return Object.assign({}, p, patch);
        });
        setWorkingTree(tree);
        return tree;
    }

    function updateChildField(parentId, childId, field, value) {
        var tpid = String(parentId || '').trim();
        var tcid = String(childId || '').trim();
        if (!tpid || !tcid) return [];
        var tree = getWorkingTree().map(function (parentNode) {
            if (parentNode.id !== tpid) return parentNode;
            return Object.assign({}, parentNode, {
                children: (Array.isArray(parentNode.children) ? parentNode.children : []).map(function (c) {
                    if (c.id !== tcid) return c;
                    var patch = {}; patch[field] = String(value || '');
                    return Object.assign({}, c, patch);
                }),
            });
        });
        setWorkingTree(tree);
        return tree;
    }

    async function saveDraftTree() {
        if (state.isSaving) {
            return;
        }

        var tree = getWorkingTree();
        state.isSaving = true;
        markStatus('正在保存到 Kingfall 变量…', 'neutral');
        syncJsonPaneMeta();

        try {
            await syncKingfallVariableFromResultDesign(tree, { reason: 'manual-save' });
            updateResultDesignTree(tree);
            syncDraftFromSaved(Object.assign({}, getSettings(), { resultDesignTree: tree }));
            markStatus('已保存，当前聊天已同步。', 'success');
            render();
        } catch (error) {
            console.error('[kingfall/result-design] 保存结构失败。', error);
            markStatus('保存失败：' + (error?.message || '未知错误'), 'danger');
            syncJsonPaneMeta();
        } finally {
            state.isSaving = false;
            syncJsonPaneMeta();
        }
    }

    function restoreDraftTree() {
        syncDraftFromSaved(getSettings());
        markStatus('已恢复到上一次保存状态，当前聊天已同步。', 'neutral');
        render();
    }

    function buildJsonExportFileName() {
        var now = new Date();
        var year = String(now.getFullYear());
        var month = String(now.getMonth() + 1).padStart(2, '0');
        var day = String(now.getDate()).padStart(2, '0');
        var hour = String(now.getHours()).padStart(2, '0');
        var minute = String(now.getMinutes()).padStart(2, '0');
        var second = String(now.getSeconds()).padStart(2, '0');
        return 'Kingfall结构-' + year + month + day + '-' + hour + minute + second + '.json';
    }

    function exportDraftJson() {
        try {
            var jsonText = getResultDesignJsonText(getWorkingTree());
            var blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
            var objectUrl = URL.createObjectURL(blob);
            var anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = buildJsonExportFileName();
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(objectUrl);
            markStatus('已导出当前JSON。', 'success');
            syncJsonPaneMeta();
        } catch (error) {
            console.error('[kingfall/result-design] 导出 JSON 失败。', error);
            markStatus('导出失败：' + (error?.message || '未知错误'), 'danger');
            syncJsonPaneMeta();
        }
    }

    function triggerJsonImport() {
        if (!state.root || state.isSaving) {
            return;
        }
        var fileInput = state.root.querySelector('[data-result-import-input="json"]');
        if (!fileInput) {
            return;
        }
        fileInput.value = '';
        fileInput.click();
    }

    function readImportFileAsText(file) {
        if (file && typeof file.text === 'function') {
            return file.text();
        }

        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                resolve(String(reader.result || ''));
            };
            reader.onerror = function () {
                reject(reader.error || new Error('读取文件失败'));
            };
            reader.readAsText(file);
        });
    }

    async function importDraftJsonFile(file) {
        if (!file) {
            return;
        }

        try {
            var text = String(await readImportFileAsText(file) || '').trim();
            if (!text) {
                throw new Error('JSON 内容为空');
            }
            var payload = JSON.parse(text);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                throw new Error('JSON 顶层必须是对象');
            }
            var nextTree = parseResultDesignJsonToTree(payload);
            setWorkingTree(nextTree);
            state.expandedNodes = {};
            state.pendingScrollToNodeId = nextTree[0]?.id || '';
            clearSelection();
            closeMobileEditorModal();
            markStatus('已导入JSON，请保存以同步到当前聊天。', 'warning');
            render();
        } catch (error) {
            console.error('[kingfall/result-design] 导入 JSON 失败。', error);
            markStatus('导入失败：' + (error?.message || '未知错误'), 'danger');
            syncJsonPaneMeta();
        }
    }

    /* --- render helpers --- */

    function isExpanded(nodeId) {
        return state.expandedNodes[nodeId] === true;
    }

    function renderChildDetail(childNode, parentNode) {
        var cid = escapeHtml(childNode.id);
        var pid = escapeHtml(parentNode.id);
        return '<div class="rd-node__detail">' +
            '<label class="rd-node__detail-label">名称</label>' +
            '<input class="rd-node__detail-input" type="text" maxlength="40" placeholder="子键名" value="' + escapeHtml(childNode.name) + '" data-result-child-field="name" data-result-parent-id="' + pid + '" data-result-child-id="' + cid + '">' +
            '<label class="rd-node__detail-label">描述</label>' +
            '<textarea class="rd-node__detail-textarea rd-node__detail-textarea--desc" spellcheck="false" placeholder="可选" data-result-child-field="description" data-result-parent-id="' + pid + '" data-result-child-id="' + cid + '">' + escapeHtml(childNode.description) + '</textarea>' +
            '<label class="rd-node__detail-label">值</label>' +
            '<textarea class="rd-node__detail-textarea" spellcheck="false" placeholder="AI 只更新这里" data-result-child-field="value" data-result-parent-id="' + pid + '" data-result-child-id="' + cid + '">' + escapeHtml(childNode.value) + '</textarea>' +
        '</div>';
    }

    function renderParentDetail(parentNode) {
        var pid = escapeHtml(parentNode.id);
        return '<div class="rd-node__detail">' +
            '<label class="rd-node__detail-label">名称</label>' +
            '<input class="rd-node__detail-input" type="text" maxlength="40" placeholder="父键名" value="' + escapeHtml(parentNode.name) + '" data-result-parent-field="name" data-result-parent-id="' + pid + '">' +
            '<label class="rd-node__detail-label">描述</label>' +
            '<textarea class="rd-node__detail-textarea rd-node__detail-textarea--desc" spellcheck="false" placeholder="可选" data-result-parent-field="description" data-result-parent-id="' + pid + '">' + escapeHtml(parentNode.description) + '</textarea>' +
        '</div>';
    }

    function renderChildLi(childNode, parentNode) {
        var cid = escapeHtml(childNode.id);
        var pid = escapeHtml(parentNode.id);
        var selected = state.selectedNodeType === 'child' && state.selectedNodeId === childNode.id;
        var expanded = !isMobileView() && isExpanded(childNode.id);
        var displayName = childNode.name || '(未命名)';
        var valuePreview = String(childNode.value || '').trim();
        var subtitleHtml = '';
        if (valuePreview && !expanded) {
            var short = valuePreview.length > 22 ? valuePreview.slice(0, 22) + '…' : valuePreview;
            subtitleHtml = '<span class="rd-node__sub">' + escapeHtml(short) + '</span>';
        }

        var detailHtml = expanded ? renderChildDetail(childNode, parentNode) : '';

        return '<li>' +
            '<div class="rd-node rd-node--child' + (expanded ? ' is-expanded' : '') + (selected ? ' is-selected' : '') + '" data-result-child-id="' + cid + '">' +
                '<div class="rd-node__head" data-result-action="toggle" data-result-toggle-id="' + cid + '" data-result-parent-id="' + pid + '" data-result-child-id="' + cid + '">' +
                    '<span class="rd-node__name">' + escapeHtml(displayName) + '</span>' +
                    subtitleHtml +
                    '<button class="rd-node__icon rd-node__icon--del" type="button" data-result-action="delete-child" data-result-parent-id="' + pid + '" data-result-child-id="' + cid + '" title="删除">&times;</button>' +
                '</div>' +
                detailHtml +
            '</div>' +
        '</li>';
    }

    function renderParentLi(parentNode) {
        var pid = escapeHtml(parentNode.id);
        var expanded = !isMobileView() && isExpanded(parentNode.id);
        var selected = state.selectedNodeType === 'parent' && state.selectedNodeId === parentNode.id;
        var children = Array.isArray(parentNode.children) ? parentNode.children : [];
        var displayName = parentNode.name || '(未命名)';
        var detailHtml = expanded ? renderParentDetail(parentNode) : '';
        var childrenUl = children.length
            ? '<ul>' + children.map(function (c) { return renderChildLi(c, parentNode); }).join('') + '</ul>'
            : '';

        return '<li data-result-parent-id="' + pid + '">' +
            '<div class="rd-node rd-node--parent' + (expanded ? ' is-expanded' : '') + (selected ? ' is-selected' : '') + '" data-result-parent-id="' + pid + '">' +
                '<div class="rd-node__head" data-result-action="toggle" data-result-toggle-id="' + pid + '" data-result-parent-id="' + pid + '">' +
                    '<span class="rd-node__name">' + escapeHtml(displayName) + '</span>' +
                    '<button class="rd-node__icon rd-node__icon--add" type="button" data-result-action="add-child" data-result-parent-id="' + pid + '" title="新增子键">+</button>' +
                    '<button class="rd-node__icon rd-node__icon--del" type="button" data-result-action="delete-parent" data-result-parent-id="' + pid + '" title="删除">&times;</button>' +
                '</div>' +
                detailHtml +
            '</div>' +
            childrenUl +
        '</li>';
    }

    function renderMobileToolbar() {
        if (!isMobileView()) {
            return '';
        }
        var selectedMeta = getSelectedNodeMeta();
        var canEdit = !!selectedMeta;
        var canDelete = !!selectedMeta;
        return '<div class="rd-mobile-tools">' +
            '<button class="rd-mobile-tools__button rd-mobile-tools__button--ghost" type="button" data-result-action="mobile-add">新增</button>' +
            '<button class="rd-mobile-tools__button rd-mobile-tools__button--ghost" type="button" data-result-action="mobile-delete" ' + (canDelete ? '' : 'disabled') + '>删除</button>' +
            '<button class="rd-mobile-tools__button rd-mobile-tools__button--primary" type="button" data-result-action="mobile-edit" ' + (canEdit ? '' : 'disabled') + '>编辑</button>' +
        '</div>';
    }

    function renderMobileEditorModal() {
        if (!isMobileView() || !state.modalOpen) {
            return '';
        }
        var selectedMeta = getSelectedNodeMeta();
        if (!selectedMeta) {
            return '';
        }
        var workingTree = getWorkingTree();
        var parentNode = selectedMeta.type === 'child' ? findParentNodeById(workingTree, selectedMeta.parentId) : null;
        var detailHtml = selectedMeta.type === 'parent'
            ? renderParentDetail(selectedMeta.node)
            : renderChildDetail(selectedMeta.node, parentNode || { id: selectedMeta.parentId });
        var title = selectedMeta.type === 'parent' ? '编辑父键' : '编辑子键';
        return '<div class="rd-mobile-modal" data-result-action="close-modal-mask">' +
            '<div class="rd-mobile-modal__dialog" role="dialog" aria-modal="true" aria-label="' + escapeHtml(title) + '">' +
                '<div class="rd-mobile-modal__header">' +
                    '<div class="rd-mobile-modal__title">' + escapeHtml(title) + '</div>' +
                    '<button class="rd-mobile-modal__close" type="button" data-result-action="close-mobile-editor" aria-label="关闭">×</button>' +
                '</div>' +
                '<div class="rd-mobile-modal__body">' + detailHtml + '</div>' +
                '<div class="rd-mobile-modal__footer">' +
                    '<button class="rd-mobile-modal__done rd-mobile-modal__done--danger" type="button" data-result-action="mobile-delete">删除</button>' +
                    '<button class="rd-mobile-modal__done" type="button" data-result-action="close-mobile-editor">完成</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function syncJsonPaneMeta() {
        if (!state.root) return;
        var unsaved = hasUnsavedChanges();
        var badge = state.root.querySelector('.rd-json__badge');
        var status = state.root.querySelector('.rd-json__status');
        var saveButton = state.root.querySelector('[data-result-action="save-tree"]');
        var restoreButton = state.root.querySelector('[data-result-action="restore-tree"]');
        var mobileSummary = state.root.querySelector('.rd-mobile-tools__summary');
        if (badge) {
            badge.textContent = unsaved ? '未保存' : '已保存';
            badge.className = 'rd-json__badge' + (unsaved ? ' is-unsaved' : ' is-saved');
        }
        if (status) {
            status.textContent = resolveStatusText(unsaved);
            status.className = 'rd-json__status is-' + String(state.statusTone || 'neutral');
        }
        if (saveButton) {
            saveButton.disabled = state.isSaving || !unsaved;
            saveButton.textContent = state.isSaving ? '保存中…' : '保存';
        }
        if (restoreButton) {
            restoreButton.disabled = state.isSaving || !unsaved;
        }
        if (mobileSummary) {
            mobileSummary.textContent = getMobileSelectedLabel();
        }
    }

    function refreshJsonOutput(tree) {
        if (!state.root) return;
        var output = state.root.querySelector('.rd-json__output');
        if (output) output.value = getResultDesignJsonText(tree || getWorkingTree());
        syncJsonPaneMeta();
    }

    function getTreeViewport() {
        if (!state.root) return null;
        return state.root.querySelector('.rd-page__tree-area');
    }

    function withPreservedTreeScroll(action) {
        var viewport = getTreeViewport();
        var previousScrollTop = viewport ? viewport.scrollTop : 0;
        var previousScrollLeft = viewport ? viewport.scrollLeft : 0;
        action();
        var nextViewport = getTreeViewport();
        if (!nextViewport) {
            return;
        }
        nextViewport.scrollTop = previousScrollTop;
        nextViewport.scrollLeft = previousScrollLeft;
    }

    function scrollToPendingNode() {
        if (!state.root || !state.pendingScrollToNodeId) return;
        var nodeId = String(state.pendingScrollToNodeId || '').trim();
        if (!nodeId) return;
        var selector = '.rd-node[data-result-child-id="' + nodeId + '"]'
            + ', .rd-node[data-result-parent-id="' + nodeId + '"]';
        var nodeEl = state.root.querySelector(selector);
        var viewport = state.root.querySelector('.rd-page__tree-area');
        if (nodeEl && viewport && typeof nodeEl.scrollIntoView === 'function') {
            try {
                nodeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } catch (error) {
                nodeEl.scrollIntoView();
            }
        }
        state.pendingScrollToNodeId = '';
    }

    function render() {
        if (!state.root) return;
        var tree = getWorkingTree();
        var jsonText = getResultDesignJsonText(tree);
        var hasUnsaved = hasUnsavedChanges();
        var mobileSummary = getMobileSelectedLabel();
        var parentsUl = tree.length
            ? '<ul>' + tree.map(renderParentLi).join('') + '</ul>'
            : '<div class="rd-tree__empty">点 + 新增父键</div>';

        state.root.innerHTML =
            '<div class="rd-page">' +
                '<div class="rd-page__tree-area">' +
                    '<div class="rd-tree">' +
                        '<ul>' +
                            '<li>' +
                                '<div class="rd-node rd-node--root">' +
                                    '<div class="rd-node__head">' +
                                        '<span class="rd-node__name rd-node__name--root">Kingfall</span>' +
                                        '<button class="rd-node__icon rd-node__icon--add" type="button" data-result-action="add-parent" title="新增父键">+</button>' +
                                    '</div>' +
                                '</div>' +
                                parentsUl +
                            '</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +
                '<div class="rd-json">' +
                    '<div class="rd-json__head">' +
                        '<span class="rd-json__title">Kingfall JSON</span>' +
                        '<span class="rd-json__badge ' + (hasUnsaved ? 'is-unsaved' : 'is-saved') + '">' + (hasUnsaved ? '未保存' : '已保存') + '</span>' +
                    '</div>' +
                    '<textarea class="rd-json__output" readonly spellcheck="false">' + escapeHtml(jsonText) + '</textarea>' +
                    '<div class="rd-json__foot">' +
                        renderMobileToolbar() +
                        '<div class="rd-json__status-wrap">' +
                            '<div class="rd-mobile-tools__summary">' + escapeHtml(mobileSummary) + '</div>' +
                            '<div class="rd-json__status is-' + escapeHtml(state.statusTone || 'neutral') + '">' + escapeHtml(resolveStatusText(hasUnsaved)) + '</div>' +
                        '</div>' +
                        '<div class="rd-json__actions">' +
                            '<button class="rd-json__button rd-json__button--ghost" type="button" data-result-action="import-json" ' + (state.isSaving ? 'disabled' : '') + '>导入</button>' +
                            '<button class="rd-json__button rd-json__button--ghost" type="button" data-result-action="export-json">导出</button>' +
                            '<button class="rd-json__button rd-json__button--ghost" type="button" data-result-action="restore-tree" ' + ((state.isSaving || !hasUnsaved) ? 'disabled' : '') + '>恢复</button>' +
                            '<button class="rd-json__button rd-json__button--primary" type="button" data-result-action="save-tree" ' + ((state.isSaving || !hasUnsaved) ? 'disabled' : '') + '>' + (state.isSaving ? '保存中…' : '保存') + '</button>' +
                        '</div>' +
                        '<input class="rd-json__file-input" type="file" accept=".json,application/json" data-result-import-input="json">' +
                    '</div>' +
                '</div>' +
                renderMobileEditorModal() +
            '</div>';

        scrollToPendingNode();
    }

    /* --- events --- */

    function closestWithAttr(el, attr, root) {
        var cur = el;
        while (cur && cur !== root) {
            if (cur.getAttribute && cur.getAttribute(attr)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    function closestNode(el, root) {
        var cur = el;
        while (cur && cur !== root) {
            if (cur.classList && cur.classList.contains('rd-node')) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    function handleClick(event) {
        if (!state.root) return;

        var actionEl = closestWithAttr(event.target, 'data-result-action', state.root);
        if (actionEl) {
            var action = String(actionEl.getAttribute('data-result-action') || '').trim();
            var parentId = String(actionEl.getAttribute('data-result-parent-id') || '').trim();
            var childId = String(actionEl.getAttribute('data-result-child-id') || '').trim();

            if (action === 'toggle') {
                if (isMobileView()) {
                    if (childId) {
                        setSelectedChild(parentId, childId);
                    } else {
                        setSelectedParent(parentId);
                    }
                    withPreservedTreeScroll(render);
                    return;
                }

                var toggleId = String(actionEl.getAttribute('data-result-toggle-id') || '').trim();
                if (toggleId) {
                    var wasOpen = state.expandedNodes[toggleId] === true;
                    state.expandedNodes = {};
                    if (!wasOpen) state.expandedNodes[toggleId] = true;
                    withPreservedTreeScroll(render);
                }
                return;
            }
            if (action === 'add-parent') { addParentNode(); return; }
            if (action === 'delete-parent') { deleteParentNode(parentId); return; }
            if (action === 'add-child') { addChildNode(parentId); return; }
            if (action === 'delete-child') { deleteChildNode(parentId, childId); return; }
            if (action === 'import-json') { triggerJsonImport(); return; }
            if (action === 'export-json') { exportDraftJson(); return; }
            if (action === 'save-tree') { saveDraftTree(); return; }
            if (action === 'restore-tree') { restoreDraftTree(); return; }
            if (action === 'mobile-add') { addNodeFromMobileAction(); return; }
            if (action === 'mobile-delete') { deleteSelectedNode(); return; }
            if (action === 'mobile-edit') { openSelectedNodeEditor(); return; }
            if (action === 'close-mobile-editor') {
                closeMobileEditorModal();
                render();
                return;
            }
            if (action === 'close-modal-mask' && event.target === actionEl) {
                closeMobileEditorModal();
                render();
                return;
            }
            return;
        }

        var nodeEl = closestNode(event.target, state.root);
        if (!nodeEl) return;
        if (closestWithAttr(event.target, 'data-result-parent-field', state.root)) return;
        if (closestWithAttr(event.target, 'data-result-child-field', state.root)) return;

        if (nodeEl.classList.contains('rd-node--root')) {
            if (isMobileView()) {
                clearSelection();
                withPreservedTreeScroll(render);
            }
            return;
        }

        var head = nodeEl.querySelector('.rd-node__head[data-result-toggle-id]');
        if (!head) return;
        var tid = String(head.getAttribute('data-result-toggle-id') || '').trim();
        if (!tid) return;

        if (isMobileView()) {
            var mobileParentId = String(head.getAttribute('data-result-parent-id') || '').trim();
            var mobileChildId = String(head.getAttribute('data-result-child-id') || '').trim();
            if (mobileChildId) {
                setSelectedChild(mobileParentId, mobileChildId);
            } else {
                setSelectedParent(mobileParentId || tid);
            }
            withPreservedTreeScroll(render);
            return;
        }

        var wasOpen2 = state.expandedNodes[tid] === true;
        state.expandedNodes = {};
        if (!wasOpen2) state.expandedNodes[tid] = true;
        withPreservedTreeScroll(render);
    }

    function handleInput(event) {
        var target = event.target;
        if (!target || typeof target.getAttribute !== 'function') return;

        var parentField = String(target.getAttribute('data-result-parent-field') || '').trim();
        if (parentField) {
            var pid = String(target.getAttribute('data-result-parent-id') || '').trim();
            var tree = updateParentField(pid, parentField, target.value);
            markDirtyStatus();
            if (parentField === 'name' && state.root) {
                var parentLi = state.root.querySelector('li[data-result-parent-id="' + pid + '"]');
                if (parentLi) {
                    var nameEl = parentLi.querySelector('.rd-node--parent .rd-node__name');
                    if (nameEl) nameEl.textContent = target.value || '(未命名)';
                }
            }
            refreshJsonOutput(tree);
            return;
        }

        var childField = String(target.getAttribute('data-result-child-field') || '').trim();
        if (childField) {
            var cpid = String(target.getAttribute('data-result-parent-id') || '').trim();
            var ccid = String(target.getAttribute('data-result-child-id') || '').trim();
            var ctree = updateChildField(cpid, ccid, childField, target.value);
            markDirtyStatus();
            if (childField === 'name' && state.root) {
                var childNode = state.root.querySelector('.rd-node--child[data-result-child-id="' + ccid + '"]');
                if (childNode) {
                    var cNameEl = childNode.querySelector('.rd-node__name');
                    if (cNameEl) cNameEl.textContent = target.value || '(未命名)';
                }
            }
            refreshJsonOutput(ctree);
        }
    }

    async function handleChange(event) {
        var target = event.target;
        if (!target || typeof target.getAttribute !== 'function') return;
        var importType = String(target.getAttribute('data-result-import-input') || '').trim();
        if (importType === 'json') {
            var file = target.files && target.files[0] ? target.files[0] : null;
            target.value = '';
            await importDraftJsonFile(file);
        }
    }

    function bindEvents() {
        if (!state.root || state.isBound) return;
        state.root.addEventListener('click', handleClick);
        state.root.addEventListener('input', handleInput);
        state.root.addEventListener('change', handleChange);
        state.isBound = true;
    }

    function mount(panelElement) {
        if (!panelElement) return;
        panelElement.innerHTML = '<div class="network-page__canvas network-page__canvas--result-design"></div>';
        state.root = panelElement.querySelector('.network-page__canvas--result-design');
        bindEvents();
        if (!state.unsubscribe && typeof networkData.subscribeAiSettings === 'function') {
            state.unsubscribe = networkData.subscribeAiSettings(function (settings) {
                var savedSnapshot = buildTreeSnapshot(getResultDesignTree(settings));
                if (!state.draftInitialized || savedSnapshot !== state.savedTreeSnapshot) {
                    syncDraftFromSaved(settings);
                }
                render();
            });
        }
        syncDraftFromSaved(getSettings());
        installCurrentChatKingfallSyncIfNeeded();
        render();
    }

    installCurrentChatKingfallSyncIfNeeded();

    networkData.getResultDesignTree = getResultDesignTree;
    networkData.getResultDesignJson = buildResultDesignJson;
    networkData.getResultDesignJsonText = getResultDesignJsonText;
    networkData.applyResultDesignOperations = applyResultDesignOperations;
    networkData.readKingfallVariableText = readKingfallVariableText;
    networkData.writeKingfallVariableText = writeKingfallVariableText;
    networkData.traceKingfallVariableSnapshot = traceKingfallVariableSnapshot;
    networkData.syncKingfallVariableFromResultDesign = syncKingfallVariableFromResultDesign;
    networkData.ensureCurrentChatKingfallStateReady = ensureCurrentChatKingfallStateReady;
    networkData.parseResultDesignJsonText = parseResultDesignJsonText;

    networkApp.resultDesignPage = {
        mount: mount,
        render: render,
        getState: function () { return Object.assign({}, state); },
    };

    networkApp.pages.resultDesign = {
        key: 'resultDesign',
        label: '结构设计与查看',
        mount: mount,
    };
})(window.NetworkShortcutApp);
