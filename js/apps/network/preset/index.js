(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};

    const networkData = networkApp.data = networkApp.data || {};
    const DEFAULT_VIEW = 'list';
    const MESSAGE_ROLE_ORDER = ['system', 'user', 'assistant'];
    const BLOCK_TYPE_OPTIONS = [
        { key: 'message', label: '消息块' },
        { key: 'context', label: '主聊天' },
        { key: 'info', label: '信息块' },
        { key: 'worldinfo', label: '世界书' },
        { key: 'prefix', label: '对话前缀续写' },
    ];
    const INFO_SOURCE_OPTIONS = [
        {
            id: '__kingfall_user_input__',
            name: '当前用户输入',
            subtitle: '就是酒馆输入框里这次准备发送的内容',
            scope: 'kingfall_user_input',
            template: '{{当前用户输入}}',
        },
        {
            id: '__kingfall_previous_value__',
            name: '伟大的kingfall',
            subtitle: '读取当前聊天里保存的 Kingfall 结构 JSON / 参考结果',
            scope: 'kingfall_previous_value',
            template: '{{伟大的kingfall}}',
        },
    ];
    const state = networkApp.presetState = networkApp.presetState || {
        root: null,
        isBound: false,
        unsubscribe: null,
        view: DEFAULT_VIEW,
        currentPresetId: '',
        pendingPresetName: '',
        pendingPresetBlocks: [],
        selectedPresetIndex: -1,
        selectedPresetBlockIndex: -1,
        presetBlockListScrollTop: 0,
        editingBlockIndex: -1,
        pendingBlockDraft: null,
        blockDraftBaseline: '',
        infoSourceBaselineIndex: -1,
        previewTitle: '',
        previewText: '',
        previewJsonText: '',
        previewMode: 'text',
        previewReturnView: 'editor',
        selectedInfoSourceIndex: -1,
        selectedWorldBookIndex: -1,
        worldBookBaselineIndex: -1,
        pickerRoleOverrides: {},
    };
    const RENDER_SCROLL_SELECTORS = [
        '#networkPresetList',
        '#networkPresetBlockList',
        '#networkPresetTypeList',
        '#networkPresetInfoSourceList',
        '#networkPresetWorldBookList',
        '.network-preset__preview-card',
    ];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    function getDefaultBlockName(role = 'system', index = 0) {
        if (role === 'user') return '用户块';
        if (role === 'assistant') return '助手块';
        if (role === '_context') return '主聊天';
        if (role === '_info') return '信息块';
        if (role === '_worldinfo') return '世界书';
        if (role === '_prefix') return '前缀续写';
        return index > 0 ? `系统块 ${index + 1}` : '系统块';
    }

    function normalizePresetBlock(block, index = 0) {
        if (typeof networkData.normalizeAiPresetBlock === 'function') {
            return networkData.normalizeAiPresetBlock(block, index);
        }

        const rawRole = typeof block?.role === 'string' ? block.role.trim() : '';
        const role = ['system', 'user', 'assistant', '_context', '_info', '_worldinfo', '_prefix'].includes(rawRole)
            ? rawRole
            : 'system';
        const explicitMessageRole = typeof block?.messageRole === 'string' ? block.messageRole.trim() : '';
        const messageRole = MESSAGE_ROLE_ORDER.includes(explicitMessageRole)
            ? explicitMessageRole
            : ((role === '_info' || role === '_worldinfo') ? 'system' : '');

        return {
            id: typeof block?.id === 'string' && block.id.trim()
                ? block.id.trim()
                : `ai_preset_block_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            role,
            messageRole,
            name: typeof block?.name === 'string' && block.name.trim()
                ? block.name.trim().slice(0, 32)
                : getDefaultBlockName(role, index),
            text: (role === '_context' || role === '_info' || role === '_worldinfo') ? '' : String(block?.text || '').slice(0, 20000),
            prefixContent: role === '_prefix' ? String(block?.prefixContent || block?.text || '').slice(0, 20000) : '',
            stopSequence: role === '_prefix' ? String(block?.stopSequence || '').slice(0, 200) : '',
            sourceId: typeof block?.sourceId === 'string' ? block.sourceId.trim().slice(0, 80) : '',
            sourceName: typeof block?.sourceName === 'string' ? block.sourceName.trim().slice(0, 48) : '',
            sourceScope: typeof block?.sourceScope === 'string' ? block.sourceScope.trim().slice(0, 32) : '',
        };
    }

    function normalizePresetBlocks(blocks) {
        if (typeof networkData.normalizeAiPresetBlocks === 'function') {
            return networkData.normalizeAiPresetBlocks(blocks);
        }

        return Array.isArray(blocks)
            ? blocks.map((block, index) => normalizePresetBlock(block, index)).slice(0, 60)
            : [];
    }

    function normalizePresetEntry(entry, index = 0) {
        if (typeof networkData.normalizeAiPresetEntry === 'function') {
            return networkData.normalizeAiPresetEntry(entry, index);
        }

        return {
            id: typeof entry?.id === 'string' && entry.id.trim()
                ? entry.id.trim()
                : `ai_preset_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            name: typeof entry?.name === 'string' && entry.name.trim()
                ? entry.name.trim().slice(0, 24)
                : `预设 ${index + 1}`,
            blocks: normalizePresetBlocks(entry?.blocks),
        };
    }

    function normalizePresetEntries(entries) {
        if (typeof networkData.normalizeAiPresetEntries === 'function') {
            return networkData.normalizeAiPresetEntries(entries);
        }

        return Array.isArray(entries)
            ? entries.map((entry, index) => normalizePresetEntry(entry, index)).slice(0, 20)
            : [];
    }

    function resolveSelectedPresetId(presetId, presetEntries) {
        if (typeof networkData.resolveSelectedAiPresetId === 'function') {
            return networkData.resolveSelectedAiPresetId(presetId, presetEntries);
        }

        const validPresetIds = new Set((presetEntries || []).map((entry) => entry.id));
        const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';

        if (validPresetIds.has(targetPresetId)) {
            return targetPresetId;
        }

        return presetEntries?.[0]?.id || '';
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
            presetEntries: [],
            selectedPresetId: '',
        };
    }

    function setSettings(nextSettings) {
        if (typeof networkData.setAiSettings === 'function') {
            networkData.setAiSettings(nextSettings, { silent: true });
            return;
        }

        if (typeof networkData.normalizeAiSettings === 'function') {
            networkData.currentAiSettings = networkData.normalizeAiSettings(nextSettings);
            return;
        }

        networkData.currentAiSettings = nextSettings;
    }

    function getPresetEntries(settings = getSettings()) {
        return normalizePresetEntries(settings?.presetEntries);
    }

    function getPresetById(presetId, settings = getSettings()) {
        if (typeof networkData.getAiPresetById === 'function') {
            return networkData.getAiPresetById(presetId, settings);
        }

        const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';
        if (!targetPresetId) {
            return null;
        }

        return getPresetEntries(settings).find((entry) => entry.id === targetPresetId) || null;
    }

    function getCurrentPreset(settings = getSettings()) {
        return getPresetById(settings.selectedPresetId || state.currentPresetId, settings);
    }

    function selectPreset(presetId, settingsSource = getSettings()) {
        const settings = settingsSource && Array.isArray(settingsSource.presetEntries)
            ? settingsSource
            : getSettings();
        const presetEntries = getPresetEntries(settings);
        const resolvedPresetId = resolveSelectedPresetId(presetId, presetEntries);

        const nextSettings = {
            ...settings,
            presetEntries,
            selectedPresetId: resolvedPresetId,
        };

        setSettings(nextSettings);
        syncPresetSelectionFromSettings(nextSettings);
        return resolvedPresetId;
    }

    function getNextPresetName(settings = getSettings()) {
        if (typeof networkData.getNextAiPresetName === 'function') {
            return networkData.getNextAiPresetName(settings);
        }

        return `预设 ${getPresetEntries(settings).length + 1}`;
    }

    function getPresetSummaryLabel(settings = getSettings()) {
        const preset = getPresetById(settings.selectedPresetId, settings);
        return preset?.name || '未设';
    }

    function syncPresetSelectionFromSettings(settings = getSettings()) {
        const presetEntries = getPresetEntries(settings);
        const preferredPresetId = typeof settings.selectedPresetId === 'string' && settings.selectedPresetId.trim()
            ? settings.selectedPresetId.trim()
            : state.currentPresetId;
        const resolvedPresetId = resolveSelectedPresetId(preferredPresetId, presetEntries);
        const currentPreset = getPresetById(resolvedPresetId, { ...settings, presetEntries, selectedPresetId: resolvedPresetId });

        state.currentPresetId = resolvedPresetId;
        state.pendingPresetName = currentPreset?.name || '';
        state.pendingPresetBlocks = normalizePresetBlocks(currentPreset?.blocks || []);
        state.selectedPresetIndex = currentPreset
            ? presetEntries.findIndex((entry) => entry.id === currentPreset.id)
            : -1;
        state.selectedPresetBlockIndex = state.pendingPresetBlocks.length
            ? Math.min(Math.max(state.selectedPresetBlockIndex, 0), state.pendingPresetBlocks.length - 1)
            : -1;
        if (state.editingBlockIndex >= state.pendingPresetBlocks.length) {
            state.editingBlockIndex = -1;
        }
    }

    function resetBlockDraft() {
        state.editingBlockIndex = -1;
        state.pendingBlockDraft = null;
        state.blockDraftBaseline = '';
        state.infoSourceBaselineIndex = -1;
        state.selectedInfoSourceIndex = -1;
        state.worldBookBaselineIndex = -1;
        state.selectedWorldBookIndex = -1;
        state.pickerRoleOverrides = {};
    }

    function capturePresetBlockListScrollTop() {
        if (!state.root) {
            return;
        }
        const listElement = state.root.querySelector('#networkPresetBlockList');
        if (listElement) {
            state.presetBlockListScrollTop = listElement.scrollTop;
        }
    }

    function scheduleRestorePresetBlockListScroll(options = {}) {
        const ensureSelected = !!options.ensureSelected;
        requestAnimationFrame(() => {
            if (!state.root || state.view !== 'editor') {
                return;
            }
            const listElement = state.root.querySelector('#networkPresetBlockList');
            if (!listElement) {
                return;
            }
            listElement.scrollTop = Number(state.presetBlockListScrollTop) || 0;
            if (ensureSelected) {
                listElement.querySelector('.network-preset__block-item.is-selected')?.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    function createPresetBlock(role = 'system') {
        return normalizePresetBlock({
            role,
            name: getDefaultBlockName(role, state.pendingPresetBlocks.length),
            text: '',
            messageRole: role === '_info' ? 'system' : '',
        }, state.pendingPresetBlocks.length);
    }

    function getBlockDisplayName(block, index = 0) {
        const role = String(block?.role || '').trim();
        if (role === '_context') {
            return '主聊天';
        }
        if (role === '_info') {
            return String(block?.sourceName || block?.name || '').trim() || '信息块';
        }
        if (role === '_worldinfo') {
            return String(block?.sourceName || block?.name || '').trim() || '世界书';
        }
        if (role === '_prefix') {
            return String(block?.name || '').trim() || '前缀续写';
        }
        return String(block?.name || '').trim() || getDefaultBlockName(role || 'system', index);
    }

    function getBlockSubtitle(block) {
        const role = String(block?.role || '').trim();
        const messageRole = String(block?.messageRole || '').trim();
        if (role === '_context') {
            return '主聊天';
        }
        if (role === '_info' || role === '_worldinfo') {
            return MESSAGE_ROLE_ORDER.includes(messageRole) ? messageRole : 'system';
        }
        if (role === '_prefix') {
            const stop = String(block?.stopSequence || '').trim();
            return stop ? `assistant / stop: ${stop}` : 'assistant / prefix';
        }
        if (MESSAGE_ROLE_ORDER.includes(role)) {
            return role;
        }
        return '';
    }

    function buildMainChatMessages(settings = getSettings()) {
        if (typeof networkData.buildAiMainChatPreviewMessages === 'function') {
            return networkData.buildAiMainChatPreviewMessages(settings) || [];
        }

        return [];
    }

    function getInfoSourceOptions() {
        return INFO_SOURCE_OPTIONS.slice();
    }

    function getInfoSourceOptionById(sourceId = '', sourceScope = '') {
        const normalizedSourceId = String(sourceId || '').trim();
        const normalizedSourceScope = String(sourceScope || '').trim();
        return getInfoSourceOptions().find((option) => {
            if (normalizedSourceId && option.id === normalizedSourceId) {
                return true;
            }
            return normalizedSourceScope && option.scope === normalizedSourceScope;
        }) || null;
    }

    function getInfoSourceTemplate(block = null) {
        const option = getInfoSourceOptionById(block?.sourceId, block?.sourceScope);
        return option ? String(option.template || '').trim() : '';
    }

    function getConfiguredWorldBookEntries(settingsSource = getSettings()) {
        const settings = settingsSource && Array.isArray(settingsSource.worldBookEntries)
            ? settingsSource
            : getSettings();

        if (typeof networkData.getAiWorldBookSettingsEntries === 'function') {
            return networkData.getAiWorldBookSettingsEntries(settings);
        }

        if (typeof networkData.normalizeAiWorldBookEntries === 'function') {
            return networkData.normalizeAiWorldBookEntries(settings?.worldBookEntries);
        }

        return Array.isArray(settings?.worldBookEntries) ? settings.worldBookEntries.slice() : [];
    }

    function getConfiguredWorldBookOptions(settingsSource = getSettings()) {
        return getConfiguredWorldBookEntries(settingsSource)
            .map((entry, index) => ({
                id: String(entry?.id || '').trim() || `configured_worldbook_${index}`,
                name: String(entry?.name || '').trim(),
                scope: String(entry?.scope || 'global').trim() || 'global',
                ownerId: String(entry?.ownerId || '').trim(),
 }))
            .filter((entry) => entry.name);
    }

    async function getWorldInfoSlotText(block = null, settingsSource = getSettings()) {
        const sourceId = String(block?.sourceId || '').trim();
        const sourceName = String(block?.sourceName || '').trim();
        const sourceScope = String(block?.sourceScope || '').trim();
        const configuredEntries = getConfiguredWorldBookEntries(settingsSource);
        const configuredEntry = configuredEntries.find((entry) => String(entry?.id || '').trim() === sourceId)
            || configuredEntries.find((entry) => String(entry?.name || '').trim() === sourceName && String(entry?.scope || '').trim() === sourceScope)
            || null;

        if (configuredEntry && typeof networkData.buildAiWorldBookTriggerText === 'function') {
            return await networkData.buildAiWorldBookTriggerText(configuredEntry, settingsSource) || '';
        }

        if (!sourceName || typeof networkData.getAiCompatibleWorldBook !== 'function') {
            return '';
        }

        try {
            const result = await networkData.getAiCompatibleWorldBook(sourceName, {
                scope: sourceScope || undefined,
            });
            if (!result?.worldBook) {
                return '';
            }

            const entries = Array.isArray(result.worldBook.entries) ? result.worldBook.entries : [];
            const enabledEntries = entries.filter((entry) => entry?.enabled !== false && String(entry?.content || '').trim());
 if (!enabledEntries.length) {
                return '';
            }

            return [
                `世界书：${result.worldBook.name || sourceName}`,
                ...enabledEntries.map((entry) => {
                    const entryName = String(entry?.name || '').trim();
                    const entryContent = String(entry?.content || '').trim();
                    return entryName ? `${entryName}：${entryContent}` : entryContent;
                }),
            ].filter(Boolean).join('\n');
        } catch (error) {
            return '';
        }
    }

    function openWorldBookPicker(blockIndex = -1) {
        const normalizedIndex = Number(blockIndex);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetBlock = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            && String(blocks[normalizedIndex]?.role || '').trim() === '_worldinfo'
            ? blocks[normalizedIndex]
            : null;
        const options = getConfiguredWorldBookOptions(getSettings());
        const matchedIndex = targetBlock
            ? options.findIndex((source) => source.id === String(targetBlock.sourceId || '').trim()
                || (source.name === String(targetBlock.sourceName || '').trim() && source.scope === String(targetBlock.sourceScope || '').trim()))
            : -1;

        state.editingBlockIndex = targetBlock ? normalizedIndex : -1;
        state.pendingBlockDraft = normalizePresetBlock({
            ...targetBlock,
            role: '_worldinfo',
            name: targetBlock?.name || '世界书',
            text: '',
            messageRole: targetBlock?.messageRole || 'system',
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.selectedWorldBookIndex = options.length
            ? (matchedIndex >= 0
                ? matchedIndex
                : Math.min(Math.max(state.selectedWorldBookIndex, 0), options.length - 1))
            : -1;
        state.blockDraftBaseline = buildComparableBlockSnapshot(state.pendingBlockDraft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.worldBookBaselineIndex = state.selectedWorldBookIndex;
        state.pickerRoleOverrides = {};
        if (targetBlock && matchedIndex >= 0) {
            state.pickerRoleOverrides[matchedIndex] = String(targetBlock.messageRole || 'system').trim();
        }
        state.view = 'worldBookPicker';
        render();
    }

    function selectWorldBook(worldBookIndex = 0) {
        const options = getConfiguredWorldBookOptions(getSettings());
        const normalizedIndex = Number(worldBookIndex);
        if (!options.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= options.length) {
            return;
        }

        state.selectedWorldBookIndex = normalizedIndex;
        if (state.view === 'worldBookPicker') {
            render();
        }
    }

    function confirmWorldBookSelection(worldBookIndex = state.selectedWorldBookIndex) {
        const options = getConfiguredWorldBookOptions(getSettings());
        const normalizedIndex = Number(worldBookIndex);
        if (!options.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= options.length) {
            return;
        }

        const source = options[normalizedIndex];
        const targetIndex = state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length;
        const selectedRole = getPickerRoleAtIndex(normalizedIndex);
        const nextBlock = normalizePresetBlock({
            role: '_worldinfo',
            name: `世界书块 · ${source.name}`,
            text: '',
            messageRole: MESSAGE_ROLE_ORDER.includes(selectedRole) ? selectedRole : 'system',
            sourceId: source.id,
            sourceName: source.name,
            sourceScope: source.scope,
        }, targetIndex);
        const nextBlocks = normalizePresetBlocks(state.pendingPresetBlocks);

        if (state.editingBlockIndex >= 0 && state.editingBlockIndex < nextBlocks.length) {
            nextBlocks[state.editingBlockIndex] = nextBlock;
            state.selectedPresetBlockIndex = state.editingBlockIndex;
        } else {
            nextBlocks.push(nextBlock);
            state.selectedPresetBlockIndex = nextBlocks.length - 1;
        }

        state.pendingPresetBlocks = nextBlocks;
        resetBlockDraft();
        state.view = 'editor';
        render();
    }

    async function openSelectedWorldBookPreview(worldBookIndex = state.selectedWorldBookIndex) {
        const options = getConfiguredWorldBookOptions(getSettings());
        const normalizedIndex = Number(worldBookIndex);
        if (!options.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= options.length) {
            return;
        }

        const source = options[normalizedIndex];
        openPreview(`${source.name}预览`, '读取中...', 'worldBookPicker');

        try {
            const previewText = await getWorldInfoSlotText({
                role: '_worldinfo',
                sourceId: source.id,
                sourceName: source.name,
                sourceScope: source.scope,
            }, getSettings());
            state.previewTitle = `${source.name}预览`;
            state.previewText = String(previewText || '').trim() || '暂无内容';
            state.previewReturnView = 'worldBookPicker';
            if (state.view === 'preview') {
                render();
            }
        } catch (error) {
            state.previewTitle = `${source.name}预览`;
            state.previewText = '读取失败';
            state.previewReturnView = 'worldBookPicker';
            if (state.view === 'preview') {
                render();
            }
        }
    }


    function createInfoBlockFromSource(source, index = state.pendingPresetBlocks.length) {
        return normalizePresetBlock({
            role: '_info',
            name: `信息块 · ${source.name}`,
            text: '',
            messageRole: 'system',
            sourceId: source.id,
            sourceName: source.name,
            sourceScope: source.scope,
        }, index);
    }
    function getStandaloneSocialData() {
        return typeof app.core.getStandaloneSocialData === 'function'
            ? app.core.getStandaloneSocialData()
            : { previewMessages: [], qq: { contacts: [], chatHistory: {}, pendingMessages: {}, me: { name: '我' }, aiRequestContext: null }, qzone: { postsById: {}, mainFeedPostIds: [], contactsBySourceKey: {} } };
    }

    function getQQRuntimeBundle() {
        const socialData = getStandaloneSocialData();
        const qqData = socialData && socialData.qq && typeof socialData.qq === 'object' ? socialData.qq : {};
        return {
            qqRuntime: null,
            qqState: {
                contacts: Array.isArray(qqData.contacts) ? qqData.contacts : [],
                chatHistory: qqData.chatHistory && typeof qqData.chatHistory === 'object' ? qqData.chatHistory : {},
                pendingMessages: qqData.pendingMessages && typeof qqData.pendingMessages === 'object' ? qqData.pendingMessages : {},
                me: qqData.me && typeof qqData.me === 'object' ? qqData.me : { name: '我' },
                aiRequestContext: qqData.aiRequestContext && typeof qqData.aiRequestContext === 'object' ? qqData.aiRequestContext : null,
                chatHistoryLimit: Number.isFinite(Number(qqData.chatHistoryLimit)) ? Number(qqData.chatHistoryLimit) : 20,
            },
            qqView: null,
            qqController: null,
        };
    }

    async function ensureQQRuntimePreviewDataReady() {
        return getQQRuntimeBundle();
    }

    function getQzoneRuntimeBundle() {
        const socialData = getStandaloneSocialData();
        const qzoneData = socialData && socialData.qzone && typeof socialData.qzone === 'object' ? socialData.qzone : {};
        return {
            qzoneBootstrap: null,
            qzoneController: null,
            qzoneRepository: null,
            qzoneStorage: null,
            qzoneState: {
                postsById: qzoneData.postsById && typeof qzoneData.postsById === 'object' ? qzoneData.postsById : {},
                mainFeedPostIds: Array.isArray(qzoneData.mainFeedPostIds) ? qzoneData.mainFeedPostIds : [],
                contactsBySourceKey: qzoneData.contactsBySourceKey && typeof qzoneData.contactsBySourceKey === 'object' ? qzoneData.contactsBySourceKey : {},
            },
        };
    }

    async function ensureQzoneRuntimePreviewDataReady() {
        return getQzoneRuntimeBundle();
    }

    function buildQQDisplayName(nickname = '', remark = '') {
        const normalizedNickname = String(nickname || '').trim();
        const normalizedRemark = String(remark || '').trim();
        if (normalizedRemark && normalizedNickname && normalizedRemark !== normalizedNickname) {
            return `${normalizedRemark}（${normalizedNickname}）`;
        }
        return normalizedRemark || normalizedNickname;
    }

    function buildQQSessionDirectory(bundle = getQQRuntimeBundle()) {
        const qqState = bundle.qqState;
        const qqView = bundle.qqView;
        const records = [];
        const sessions = [];
        let friendIndex = 0;
        let groupIndex = 0;
        const contactGroups = Array.isArray(qqState?.contacts) ? qqState.contacts : [];

        contactGroups.forEach((group) => {
            const members = Array.isArray(group?.members) ? group.members : [];
            members.forEach((member) => {
                const chatId = Number(member?.id);
                if (!Number.isFinite(chatId)) {
                    return;
                }

                if (member.type === 'group') {
                    const sessionKey = `group${groupIndex}`;
                    groupIndex += 1;
                    const rawMembers = Array.isArray(member.groupMembers) ? member.groupMembers : [];
                    const sortedMembers = typeof qqView?.getSortedGroupMembers === 'function'
                        ? qqView.getSortedGroupMembers(rawMembers)
                        : rawMembers.slice();
                    const memberKeyById = {};
                    const memberProfileById = {};
                    const groupMembers = sortedMembers.map((groupMember, memberIndex) => {
                        const memberKey = `m${memberIndex}`;
                        const memberId = parseInt(groupMember?.memberId, 10);
                        const nickname = String(groupMember?.name || '').trim();
                        const remark = String(groupMember?.remark || '').trim();
                        if (Number.isFinite(memberId)) {
                            memberKeyById[String(memberId)] = memberKey;
                            memberProfileById[String(memberId)] = {
                                nickname,
                                remark,
                            };
                        }
                        return {
                            member: memberKey,
                            nickname,
                            remark,
                            isMe: String(groupMember?.sourceKey || '').trim() === 'me',
                        };
                    });
                    const nickname = String(member.name || '').trim() || `群聊${groupIndex}`;
                    const remark = String(member.remark || '').trim();
                    sessions.push({
                        session: sessionKey,
                        type: 'group',
                        nickname,
                        remark,
                        members: groupMembers,
                    });
                    records.push({
                        chatId: String(chatId),
                        session: sessionKey,
                        type: 'group',
                        nickname,
                        remark,
                        memberKeyById,
                        memberProfileById,
                    });
                    return;
                }

                const sessionKey = `friend${friendIndex}`;
                friendIndex += 1;
                const nickname = String(member.name || '').trim();
                const remark = String(member.remark || '').trim();
                sessions.push({
                    session: sessionKey,
                    type: 'friend',
                    nickname,
                    remark,
                });
                records.push({
                    chatId: String(chatId),
                    session: sessionKey,
                    type: 'friend',
                    nickname,
                    remark,
                    memberKeyById: {},
                });
            });
        });

        return { sessions, records };
    }

    function getQQMessageContextText(message, qqView = null) {
        const normalizedMessage = typeof qqView?.normalizeMessageRecord === 'function'
            ? qqView.normalizeMessageRecord(message)
            : (message && typeof message === 'object' ? { ...message } : {});
        const previewText = typeof qqView?.getMessagePreviewText === 'function'
            ? qqView.getMessagePreviewText(normalizedMessage)
            : (normalizedMessage.text || '');
        return {
            normalizedMessage,
            text: String(previewText || normalizedMessage.text || '').trim(),
        };
    }

    function buildQQCurrentMessagesPayload(bundle = getQQRuntimeBundle(), directory = buildQQSessionDirectory(bundle)) {
        const pendingMap = bundle.qqState && typeof bundle.qqState.pendingMessages === 'object'
            ? bundle.qqState.pendingMessages
            : {};
        const requestContext = bundle.qqState && bundle.qqState.aiRequestContext && typeof bundle.qqState.aiRequestContext === 'object'
            ? bundle.qqState.aiRequestContext
            : null;
        const requestedChatIds = Array.isArray(requestContext?.chatIds)
            ? new Set(requestContext.chatIds.map((chatId) => String(chatId || '').trim()).filter(Boolean))
            : null;
        const focusChatId = String(requestContext?.focusChatId || '').trim();
        const hasPendingMessages = requestContext?.hasPendingMessages === true;
        const selfLabel = `我（${String(bundle.qqState?.me?.name || '我').trim() || '我'}）`;
        const focusedRecord = directory.records.find((record) => String(record.chatId) === focusChatId) || null;
        return {
            note: hasPendingMessages
                ? '以下 messages 都是我刚发给对方的待发送消息，不是对方发言。'
                : '当前没有我新发出的消息，这是主动发言触发。',
            focusSession: focusedRecord
                ? {
                    session: focusedRecord.session,
                    label: buildQQDisplayName(focusedRecord.nickname, focusedRecord.remark) || String(focusedRecord.nickname || focusedRecord.remark || '').trim() || focusedRecord.session,
                }
                : null,
            sessions: directory.records.map((record) => {
                if (requestedChatIds && requestedChatIds.size > 0 && !requestedChatIds.has(String(record.chatId))) {
                    return null;
                }
                const pendingMessages = Array.isArray(pendingMap[record.chatId]) ? pendingMap[record.chatId] : [];
                const targetLabel = buildQQDisplayName(record.nickname, record.remark) || String(record.nickname || record.remark || '').trim() || record.session;
                const messages = pendingMessages.map((message) => {
                    const preview = getQQMessageContextText(message, bundle.qqView);
                    const normalizedMessage = preview && preview.normalizedMessage ? preview.normalizedMessage : {};
                    const currentType = String(normalizedMessage.type || 'text').trim() || 'text';
                    const hasVisibleMedia = currentType !== 'text';
                    const hasVisibleText = !!String(preview.text || '').trim();
                    if (!hasVisibleMedia && !hasVisibleText) {
                        return null;
                    }

                    const nextMessage = {
                        from: selfLabel,
                    };
                    const contentText = String(preview.text || '').trim();
                    if (currentType === 'image') {
                        nextMessage.image = [contentText || '[图片]'];
                    } else if (currentType === 'video') {
                        nextMessage.video = [
                            ...(normalizedMessage.videoDuration ? [`duration: ${normalizedMessage.videoDuration}`] : []),
                            ...(contentText ? [contentText] : []),
                        ];
                    } else if (currentType === 'audio') {
                        nextMessage.audio = [
                            ...(Number.isFinite(Number(normalizedMessage.audioDuration)) ? [`duration: ${Math.round(Number(normalizedMessage.audioDuration))}`] : []),
                            ...(contentText ? [contentText] : []),
                        ];
                    } else if (currentType === 'file') {
                        nextMessage.file = [
                            ...(String(normalizedMessage.fileName || '').trim() ? [String(normalizedMessage.fileName || '').trim()] : []),
                            ...(contentText ? [contentText] : []),
                        ];
                    } else if (currentType === 'location') {
                        const locationRegion = String(normalizedMessage.locationRegion || '').trim();
                        const locationAddress = String(normalizedMessage.locationAddress || '').trim();
                        nextMessage.location = [
                            ...[locationRegion, locationAddress].filter(Boolean),
                            ...(contentText ? [contentText] : []),
                        ];
                    } else if (hasVisibleText) {
                        nextMessage.text = contentText;
                    }
                    return nextMessage;
                }).filter(Boolean);
                return {
                    session: record.session,
                    to: targetLabel,
                    nickname: String(record.nickname || '').trim(),
                    remark: String(record.remark || '').trim(),
                    messages,
                };
            }).filter(Boolean),
 };
    }

    function buildQQContactsGroupsPayload(bundle = getQQRuntimeBundle(), directory = buildQQSessionDirectory(bundle)) {
        return {
            sessions: directory.sessions,
        };
    }

    function buildQQFriendBriefPayload(bundle = getQQRuntimeBundle()) {
        const contactGroups = Array.isArray(bundle.qqState?.contacts) ? bundle.qqState.contacts : [];
        const seenAuthors = new Set();
        const friends = [];

        contactGroups.forEach((group) => {
            const members = Array.isArray(group?.members) ? group.members : [];
            members.forEach((member) => {
                if (member?.type === 'group') {
                    return;
                }
                const contactId = parseInt(member?.id, 10);
                if (!Number.isFinite(contactId)) {
                    return;
                }
                const author = `contact:${contactId}`;
                if (seenAuthors.has(author)) {
                    return;
                }
                seenAuthors.add(author);
                friends.push({
                    author,
                    name: String(member?.name || '').trim(),
                    remark: String(member?.remark || '').trim(),
                });
            });
        });

        return {
            friends,
        };
    }

    function buildQQChatHistoryPayload(bundle = getQQRuntimeBundle(), directory = buildQQSessionDirectory(bundle), limit) {
        const rawStateLimit = bundle.qqState && Number.isFinite(Number(bundle.qqState.chatHistoryLimit))
            ? Number(bundle.qqState.chatHistoryLimit)
            : 20;
        const stateLimit = rawStateLimit <= 0 ? Infinity : rawStateLimit;
        const effectiveLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : stateLimit;
        const qqController = bundle.qqController;
        const canUsePromptEligibleMessages = qqController && typeof qqController.getPromptEligibleChatMessages === 'function';
        const chatHistoryMap = bundle.qqState && typeof bundle.qqState.chatHistory === 'object'
            ? bundle.qqState.chatHistory
            : {};

        return {
            sessions: directory.records.map((record) => {
                const history = canUsePromptEligibleMessages
                    ? qqController.getPromptEligibleChatMessages(record.chatId).slice(-effectiveLimit)
                    : (Array.isArray(chatHistoryMap[record.chatId]) ? chatHistoryMap[record.chatId].slice(-effectiveLimit) : []);
                const recentMessages = history.reduce((result, message) => {
                    const preview = getQQMessageContextText(message, bundle.qqView);
                    const normalizedMessage = preview && preview.normalizedMessage ? preview.normalizedMessage : {};
                    const currentType = String(normalizedMessage.type || 'text').trim() || 'text';
                    const hasVisibleMedia = currentType !== 'text';
                    const hasVisibleText = !!String(preview.text || '').trim();
                    if (!hasVisibleMedia && !hasVisibleText) {
                        return result;
                    }

                    let fromLabel = '';
                    if (record.type === 'group') {
                        if (normalizedMessage.sender === 'me') {
                            fromLabel = `我（${String(bundle.qqState?.me?.name || '我').trim() || '我'}）`;
                        } else if (normalizedMessage.sender === 'system') {
                            fromLabel = '系统';
                        } else {
                            const senderMemberId = parseInt(normalizedMessage.senderMemberId, 10);
                            const memberProfile = Number.isFinite(senderMemberId)
                                ? record.memberProfileById?.[String(senderMemberId)]
                                : null;
                            fromLabel = buildQQDisplayName(memberProfile?.nickname, memberProfile?.remark) || '群成员';
                        }
                    } else {
                        fromLabel = normalizedMessage.sender === 'me'
                            ? `我（${String(bundle.qqState?.me?.name || '我').trim() || '我'}）`
                            : (normalizedMessage.sender === 'system'
                                ? '系统'
                                : (buildQQDisplayName(record.nickname, record.remark) || '对方'));
                    }

                    let currentEntry = result[result.length - 1];
                    if (!currentEntry || currentEntry.from !== fromLabel) {
                        currentEntry = { from: fromLabel };
                        result.push(currentEntry);
                    }

                    const contentText = String(preview.text || '').trim();
                    const appendNumberedArrayField = (prefix, values) => {
                        const normalizedValues = values.filter((value) => String(value || '').trim()).map((value) => String(value).trim());
                        if (!normalizedValues.length) {
                            return;
                        }
                        const existingKeys = Object.keys(currentEntry)
                            .filter((key) => new RegExp(`^${prefix}_(\\d+)$`).test(key))
                            .sort((left, right) => parseInt(left.split('_')[1], 10) - parseInt(right.split('_')[1], 10));
                        const nextIndex = existingKeys.length + 1;
                        currentEntry[`${prefix}_${nextIndex}`] = normalizedValues;
                    };

                    if (currentType === 'image') {
                        appendNumberedArrayField('image', [contentText || '[图片]']);
                    } else if (currentType === 'video') {
                        appendNumberedArrayField('video', [
                            ...(normalizedMessage.videoDuration ? [`duration: ${normalizedMessage.videoDuration}`] : []),
                            ...(contentText ? [contentText] : []),
                        ]);
                    } else if (currentType === 'audio') {
                        appendNumberedArrayField('audio', [
                            ...(Number.isFinite(Number(normalizedMessage.audioDuration)) ? [`duration: ${Math.round(Number(normalizedMessage.audioDuration))}`] : []),
                            ...(contentText ? [contentText] : []),
                        ]);
                    } else if (currentType === 'file') {
                        appendNumberedArrayField('file', [
                            ...(String(normalizedMessage.fileName || '').trim() ? [String(normalizedMessage.fileName || '').trim()] : []),
                            ...(contentText ? [contentText] : []),
                        ]);
                    } else if (currentType === 'location') {
                        const locationRegion = String(normalizedMessage.locationRegion || '').trim();
                        const locationAddress = String(normalizedMessage.locationAddress || '').trim();
                        appendNumberedArrayField('location', [
                            ...[locationRegion, locationAddress].filter(Boolean),
                            ...(contentText ? [contentText] : []),
                        ]);
                    } else if (hasVisibleText) {
                        appendNumberedArrayField('text', [contentText]);
                    }
                    return result;
                }, []);

                return recentMessages.length ? {
                    session: record.session,
                    sessionLabel: buildQQDisplayName(record.nickname, record.remark) || String(record.nickname || record.remark || '').trim() || record.session,
                    nickname: String(record.nickname || '').trim(),
                    remark: String(record.remark || '').trim(),
                    recentMessages,
                } : null;
            }).filter(Boolean),
        };
    }

    function buildQQDynamicSourcePayload(option, bundle = getQQRuntimeBundle()) {
        const directory = buildQQSessionDirectory(bundle);
        if (!option) {
            return { sessions: [] };
        }
        if (option.scope === 'qq_pending_messages') {
            return buildQQCurrentMessagesPayload(bundle, directory);
        }
        if (option.scope === 'qq_contact_profiles') {
            return buildQQContactsGroupsPayload(bundle, directory);
        }
        if (option.scope === 'qq_friend_brief_profiles') {
            return buildQQFriendBriefPayload(bundle);
        }
        if (option.scope === 'qq_chat_history_records') {
            return buildQQChatHistoryPayload(bundle, directory);
        }
        return { sessions: [] };
    }

    function buildQzoneActorKey(source = '', sourceKey = '') {
        const normalizedSource = String(source || '').trim();
        const normalizedSourceKey = String(sourceKey || '').trim();
        if (normalizedSource === 'owner') {
            return 'me';
        }
        return normalizedSourceKey;
    }

    function buildQzoneActionContent(post) {
        const contentBlocks = Array.isArray(post?.content) ? post.content : [];
        return contentBlocks.map((block) => {
            const blockType = String(block?.type || '').trim();
            if (blockType === 'media') {
                const media = Array.isArray(block?.media)
                    ? block.media.map((item) => ({
                        kind: String(item?.media || '').trim() === 'video' ? 'video' : 'photo',
                        summary: String(item?.summary || '').trim(),
                        description: String(item?.desc || '').trim(),
                    })).filter((item) => item.kind)
                    : [];
                return media.length > 0
                    ? { type: 'media', media }
                    : null;
            }
            const text = String(block?.text || '').trim();
            return text ? { type: 'text', text } : null;
        }).filter(Boolean);
    }

    function buildQzoneIdentityFields(author = '', rawName = '', rawRemark = '') {
        const fields = {
            author: String(author || '').trim(),
        };
        const name = String(rawName || '').trim();
        const remark = String(rawRemark || '').trim();
        if (name) {
            fields.name = name;
        }
        if (remark) {
            fields.remark = remark;
        }
        return fields;
    }

    function buildQzoneIdentityFromRecord(record) {
        const author = buildQzoneActorKey(record?.authorSource, record?.authorSourceKey);
        if (author === 'me') {
            return buildQzoneIdentityFields('me', String(record?.authorName || '').trim(), '');
        }
        const socialData = getStandaloneSocialData();
        const contactsBySourceKey = socialData && socialData.qzone && typeof socialData.qzone.contactsBySourceKey === 'object'
            ? socialData.qzone.contactsBySourceKey
            : {};
        const contact = contactsBySourceKey[String(record?.authorSourceKey || '').trim()] || null;
        return buildQzoneIdentityFields(
            author,
            String(record?.authorName || contact?.name || '').trim(),
            String(contact?.remark || '').trim()
        );
    }

    function buildQzonePostCommentEntries(post = null, recentCommentLimit = 5) {
        const rootComments = Array.isArray(post?.comments) ? post.comments : [];
        const flattenedComments = [];

        rootComments.forEach((rootComment) => {
            if (!rootComment) {
                return;
            }
            flattenedComments.push(rootComment);
            const replies = Array.isArray(rootComment.replies) ? rootComment.replies : [];
            replies.forEach((reply) => {
                if (reply) {
                    flattenedComments.push(reply);
                }
            });
        });

        return flattenedComments.slice(-recentCommentLimit).map((comment) => {
            const payload = {
                commentId: String(comment?.id || '').trim(),
                ...buildQzoneIdentityFromRecord(comment),
                text: String(comment?.content || '').trim(),
                time: String(comment?.time || '').trim(),
            };
            const replyToId = String(comment?.replyToCommentId || '').trim();
            if (replyToId) {
                payload.replyToId = replyToId;
            }
            return payload;
        }).filter((comment) => comment.commentId && comment.text);
    }

    function buildQzoneMainFeedPostsPayload(bundle = getQzoneRuntimeBundle(), limit = 30, recentCommentLimit = 5) {
        const normalizedState = bundle.qzoneState || {};
        const postsById = normalizedState && typeof normalizedState.postsById === 'object' ? normalizedState.postsById : {};
        const mainFeedPostIds = Array.isArray(normalizedState?.mainFeedPostIds) ? normalizedState.mainFeedPostIds : [];

        return {
            posts: mainFeedPostIds.slice(0, limit).map((postId) => {
                const post = postsById[String(postId)] || postsById[postId];
                if (!post) {
                    return null;
                }
                return {
                    postId: String(post.id || postId),
                    ...buildQzoneIdentityFromRecord(post),
                    time: String(post?.time || '').trim(),
                    device: String(post?.device || '').trim(),
                    views: Number.isFinite(post?.views) ? post.views : 0,
                    likes: Array.isArray(post?.likeNames) ? post.likeNames.slice() : [],
                    content: buildQzoneActionContent(post),
                    comments: buildQzonePostCommentEntries(post, recentCommentLimit),
                };
            }).filter(Boolean),
        };
    }

    function buildQzoneDynamicSourcePayload(option, bundle = getQzoneRuntimeBundle()) {
        if (!option) {
            return { posts: [] };
        }
        if (option.scope === 'qzone_main_feed_posts') {
            return buildQzoneMainFeedPostsPayload(bundle);
        }
        return { posts: [] };
    }

    async function buildInfoSourceResolvedText(block = null, runtimeContext = null) {
        const option = getInfoSourceOptionById(block?.sourceId, block?.sourceScope);
        if (!option) {
            return getInfoSourceTemplate(block);
        }

        const resolvedRuntimeContext = runtimeContext && typeof runtimeContext === 'object'
            ? runtimeContext
            : {};

        if (option.scope === 'kingfall_user_input') {
            return String(
                resolvedRuntimeContext.kingfallUserInput
                || resolvedRuntimeContext.userInput
                || ''
            ).trim();
        }

        if (option.scope === 'kingfall_previous_value') {
            const runtimeValue = String(
                resolvedRuntimeContext.kingfallPreviousValue
                || resolvedRuntimeContext.previousKingfallValue
                || ''
            ).trim();
            if (runtimeValue) {
                return runtimeValue;
            }

            try {
                const stApi = getSTAPI();
                if (stApi?.variables?.get) {
                    const result = await stApi.variables.get({ name: 'Kingfall', scope: 'local' });
                    return String(result?.value ?? '').trim();
                }
            } catch (error) {}

            return '';
        }

        return '';
    }



    async function buildMessagesFromPresetBlocks(blocks, settings = getSettings(), runtimeContext = null) {
        const normalizedBlocks = normalizePresetBlocks(blocks);
        const messages = [];
        const mainChatMessages = buildMainChatMessages(settings);

        for (let index = 0; index < normalizedBlocks.length; index += 1) {
            const block = normalizedBlocks[index];
            const role = String(block?.role || '').trim();
            if (MESSAGE_ROLE_ORDER.includes(role)) {
                const content = String(block?.text || '').trim();
                if (content) {
                    messages.push({ role, content });
                }
                continue;
            }

            if (role === '_context') {
                const content = mainChatMessages
                    .map((message) => `${message.role === 'user' ? '主聊天用户' : '主聊天AI'}：${message.content}`)
                    .join('\n\n')
                    .trim();
                if (content) {
                    messages.push({ role: 'system', content });
                }
                continue;
            }

            if (role === '_info') {
                const content = await buildInfoSourceResolvedText(block, runtimeContext);
                if (content) {
                    const messageRole = MESSAGE_ROLE_ORDER.includes(String(block?.messageRole || '').trim())
                        ? String(block.messageRole).trim()
                        : 'system';
                    messages.push({ role: messageRole, content });
                }
                continue;
            }

            if (role === '_worldinfo') {
                const content = await getWorldInfoSlotText(block, settings);
                if (content) {
                    const messageRole = MESSAGE_ROLE_ORDER.includes(String(block?.messageRole || '').trim())
                        ? String(block.messageRole).trim()
                        : 'system';
                    messages.push({ role: messageRole, content });
                }
            }

            if (role === '_prefix') {
                const prefixContent = String(block?.prefixContent || '').trim();
                if (prefixContent) {
                    const prefixMessage = { role: 'assistant', content: prefixContent, prefix: true };
                    messages.push(prefixMessage);
                }
            }
        }

        return messages;
    }

    function hasPreviewJsonText() {
        return String(state.previewJsonText || '').trim() !== '';
    }

    function getActivePreviewText() {
        if (state.previewMode === 'json' && hasPreviewJsonText()) {
            return state.previewJsonText;
        }
        return state.previewText || '暂无内容';
    }

    function getPreviewToggleLabel() {
        return state.previewMode === 'json' ? '可读文本' : '原始 JSON';
    }

    function togglePreviewMode() {
        if (!hasPreviewJsonText()) {
            return;
        }
        state.previewMode = state.previewMode === 'json' ? 'text' : 'json';
        render();
    }

    function openPreview(title, text, returnView = 'editor', options = {}) {
        const readableText = String(text || '').trim() || '暂无内容';
        const rawJsonText = String(options.rawJsonText || '').trim();
        state.previewTitle = title || '预览';
        state.previewText = readableText;
        state.previewJsonText = rawJsonText;
        state.previewMode = rawJsonText && options.initialMode === 'json' ? 'json' : 'text';
        state.previewReturnView = returnView || 'editor';
        state.view = 'preview';
        render();
    }

    function formatPresetPromptPreviewText(messages) {
        if (!Array.isArray(messages) || !messages.length) {
            return '暂无内容';
        }

        return messages
            .map((message) => String(message && message.content || '').trim())
            .filter(Boolean)
            .join('\n\n');
    }

    async function openPresetPreview(options = {}) {
        const settings = getSettings();
        const currentView = state.view;
        const currentPreset = currentView === 'list' ? getCurrentPreset(settings) : null;
        const previewBlocks = Array.isArray(options.blocks)
            ? options.blocks
            : (currentView === 'list' ? normalizePresetBlocks(currentPreset?.blocks || []) : state.pendingPresetBlocks);
        const previewName = String(
            options.name
            || (currentView === 'list' ? currentPreset?.name : state.pendingPresetName)
            || '预设'
        ).trim() || '预设';

        try {
            const messages = await buildMessagesFromPresetBlocks(previewBlocks, settings);
            openPreview(
                `${previewName}提示词预览`,
                formatPresetPromptPreviewText(messages),
                options.returnView || currentView || 'editor',
                {
                    rawJsonText: JSON.stringify(messages, null, 2) || '[]',
                }
            );
        } catch (error) {
            openPreview(`${previewName}提示词预览`, '读取失败', options.returnView || currentView || 'editor');
        }
    }

    async function openBlockPreviewFromDraft() {
        const draft = normalizePresetBlock(
            state.pendingBlockDraft || createPresetBlock('system'),
            state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length
        );
        const role = String(draft.role || '').trim();
        const previewTitle = getBlockDisplayName(draft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : 0);

        if (role === '_context') {
            const text = buildMainChatMessages(getSettings())
                .map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`)
                .join('\n\n');
            openPreview('主聊天', text || '暂无内容', 'contextEditor');
            return;
        }

        if (role === '_worldinfo') {
            openPreview(previewTitle, '读取中...', 'worldBookPicker');
            try {
                const text = await getWorldInfoSlotText(draft, getSettings());
                state.previewTitle = previewTitle;
                state.previewText = String(text || '').trim() || '暂无内容';
                state.previewReturnView = 'worldBookPicker';
                if (state.view === 'preview') {
                    render();
                }
            } catch (error) {
                state.previewTitle = previewTitle;
                state.previewText = '读取失败';
                state.previewReturnView = 'worldBookPicker';
                if (state.view === 'preview') {
                    render();
                }
            }
            return;
        }

        openPreview(previewTitle, draft.text || '暂无内容', 'messageEditor');
    }

    function buildNewPresetDraft() {
        return {
            name: getNextPresetName(getSettings()),
            blocks: [normalizePresetBlock({
                role: 'system',
                name: getDefaultBlockName('system', 0),
                text: '',
                messageRole: '',
            }, 0)],
        };
    }

    function buildComparableBlockSnapshot(block, fallbackIndex = 0) {
        const normalizedBlock = normalizePresetBlock(block || {}, fallbackIndex);
        return JSON.stringify({
            role: String(normalizedBlock.role || ''),
            messageRole: String(normalizedBlock.messageRole || ''),
            name: String(normalizedBlock.name || ''),
 text: String(normalizedBlock.text || ''),
            prefixContent: String(normalizedBlock.prefixContent || ''),
            stopSequence: String(normalizedBlock.stopSequence || ''),
            sourceId: String(normalizedBlock.sourceId || ''),
            sourceName: String(normalizedBlock.sourceName || ''),
            sourceScope: String(normalizedBlock.sourceScope || ''),
        });
    }

    function buildComparablePresetSnapshot(name = '', blocks = []) {
        return JSON.stringify({
            name: String(name || '').trim().slice(0, 24),
            blocks: normalizePresetBlocks(blocks).map((block) => ({
                role: String(block.role || ''),
                messageRole: String(block.messageRole || ''),
                name: String(block.name || ''),
                text: String(block.text || ''),
                sourceId: String(block.sourceId || ''),
                sourceName: String(block.sourceName || ''),
                sourceScope: String(block.sourceScope || ''),
            })),
        });
    }

    function confirmDiscardUnsavedChanges(message = '当前修改尚未保存，确定离开吗？') {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            return window.confirm(message);
        }
        return true;
    }

    function hasUnsavedPresetChanges(settings = getSettings()) {
        if (state.view === 'list') {
            return false;
        }

        if (!state.currentPresetId) {
            return String(state.pendingPresetName || '').trim() !== ''
                || normalizePresetBlocks(state.pendingPresetBlocks).length > 0;
        }

        const savedPreset = getPresetById(state.currentPresetId, settings);
        if (!savedPreset) {
            return true;
        }

        return buildComparablePresetSnapshot(state.pendingPresetName, state.pendingPresetBlocks)
            !== buildComparablePresetSnapshot(savedPreset.name, savedPreset.blocks);
    }

    function hasUnsavedBlockDraftChanges() {
        if (!state.pendingBlockDraft || !state.blockDraftBaseline) {
            return false;
        }

        const fallbackIndex = state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length;
        const currentSnapshot = buildComparableBlockSnapshot(state.pendingBlockDraft, fallbackIndex);
        if (currentSnapshot !== state.blockDraftBaseline) {
            return true;
        }

        if (state.view === 'infoSourcePicker') {
            return state.infoSourceBaselineIndex !== state.selectedInfoSourceIndex;
        }

        if (state.view === 'worldBookPicker') {
            return state.worldBookBaselineIndex !== state.selectedWorldBookIndex;
        }

        return false;
    }

    function canLeavePresetEditor() {
        if (hasUnsavedBlockDraftChanges()) {
            return confirmDiscardUnsavedChanges('当前块尚未保存，确定离开吗？');
        }
        if (hasUnsavedPresetChanges()) {
            return confirmDiscardUnsavedChanges('当前预设尚未保存，确定离开吗？');
        }
        return true;
    }

    function saveCurrentPreset() {
        const settings = getSettings();
        const presetEntries = getPresetEntries(settings);
        const targetIndex = presetEntries.findIndex((entry) => entry.id === state.currentPresetId);

        if (targetIndex < 0) {
            const nextPreset = normalizePresetEntry({
                name: state.pendingPresetName,
                blocks: state.pendingPresetBlocks,
            }, presetEntries.length);

            presetEntries.push(nextPreset);
            setSettings({
                ...settings,
                presetEntries,
                selectedPresetId: nextPreset.id,
            });

            syncPresetSelectionFromSettings();
            render();
            return;
        }

        presetEntries[targetIndex] = normalizePresetEntry({
            ...presetEntries[targetIndex],
            name: state.pendingPresetName,
            blocks: state.pendingPresetBlocks,
        }, targetIndex);

        setSettings({
            ...settings,
            presetEntries,
            selectedPresetId: presetEntries[targetIndex].id,
        });

        syncPresetSelectionFromSettings();
        render();
    }

    function sanitizePresetExportFileName(name = '预设') {
        const safeName = String(name || '预设')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48);
        return `${safeName || '预设'}-预设.json`;
    }

    function downloadPresetExportFile(fileName, text) {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => {
            try {
                URL.revokeObjectURL(objectUrl);
            } catch (error) {}
        }, 0);
    }

    function exportPreset(presetId = state.currentPresetId) {
        const settings = getSettings();
        const preset = getPresetById(presetId || settings.selectedPresetId, settings);
        if (!preset) {
            return;
        }

        const exportPayload = {
            type: 'network-shortcut-preset',
            version: 1,
            exportedAt: new Date().toISOString(),
            preset: normalizePresetEntry(preset),
        };

        downloadPresetExportFile(
            sanitizePresetExportFileName(preset.name),
            JSON.stringify(exportPayload, null, 2)
        );
    }

    function resolveImportPresetPayloads(rawPayload) {
        if (Array.isArray(rawPayload)) {
            return rawPayload.filter((item) => item && typeof item === 'object');
        }

        if (!rawPayload || typeof rawPayload !== 'object') {
            return [];
        }

        if (Array.isArray(rawPayload.presets)) {
            return rawPayload.presets.filter((item) => item && typeof item === 'object');
        }

        if (rawPayload.preset && typeof rawPayload.preset === 'object') {
            return [rawPayload.preset];
        }

        if (Array.isArray(rawPayload.blocks) || typeof rawPayload.name === 'string') {
            return [rawPayload];
        }

        return [];
    }

    function buildPresetNameRegistry(presetEntries = []) {
        return new Set(
            presetEntries
                .map((entry) => String(entry && entry.name || '').trim())
                .filter(Boolean)
        );
    }

    function createUniqueImportedPresetName(name, nameRegistry, fallbackName = '预设') {
        const normalizedBaseName = String(name || '').trim().slice(0, 24)
            || String(fallbackName || '预设').trim().slice(0, 24)
            || '预设';
        if (!nameRegistry.has(normalizedBaseName)) {
            nameRegistry.add(normalizedBaseName);
            return normalizedBaseName;
        }

        let duplicateIndex = 2;
        while (duplicateIndex < 10000) {
            const suffix = `（${duplicateIndex}）`;
            const safeBase = normalizedBaseName.slice(0, Math.max(1, 24 - suffix.length)).trim() || '预设';
            const nextName = `${safeBase}${suffix}`;
            if (!nameRegistry.has(nextName)) {
                nameRegistry.add(nextName);
                return nextName;
            }
            duplicateIndex += 1;
        }

        const fallbackUniqueName = `${normalizedBaseName.slice(0, 20) || '预设'}${Date.now().toString().slice(-4)}`.slice(0, 24);
        nameRegistry.add(fallbackUniqueName);
        return fallbackUniqueName;
    }

    function buildImportedPresetEntries(rawPayload, settings = getSettings(), nameRegistry = buildPresetNameRegistry(getPresetEntries(settings))) {
        const rawPresets = resolveImportPresetPayloads(rawPayload);
        if (!rawPresets.length) {
            throw new Error('文件格式不正确');
        }

        const baseIndex = getPresetEntries(settings).length;
        return rawPresets.map((rawPreset, index) => {
            const importedBlocks = Array.isArray(rawPreset.blocks)
                ? rawPreset.blocks.map((block) => {
                    if (!block || typeof block !== 'object') {
                        return {};
                    }
                    const { id, ...rest } = block;
                    return rest;
                })
                : [];
            const normalizedPreset = normalizePresetEntry({
                name: typeof rawPreset.name === 'string' ? rawPreset.name : '',
                blocks: importedBlocks,
            }, baseIndex + index);

            return {
                ...normalizedPreset,
                name: createUniqueImportedPresetName(normalizedPreset.name, nameRegistry, `预设 ${baseIndex + index + 1}`),
            };
        });
    }

    function readPresetImportFileAsText(file) {
        if (file && typeof file.text === 'function') {
            return file.text();
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsText(file);
        });
    }

    async function importPresetFiles(files) {
        const fileList = Array.from(files || []).filter(Boolean);
        if (!fileList.length) {
            return { importedCount: 0, failedFiles: [], lastImportedPresetId: '' };
        }

        const settings = getSettings();
        const originalPresetEntries = getPresetEntries(settings);
        const nextPresetEntries = originalPresetEntries.slice();
        const nameRegistry = buildPresetNameRegistry(nextPresetEntries);
        const failedFiles = [];
        let lastImportedPresetId = '';

        for (const [fileIndex, file] of fileList.entries()) {
            try {
                const text = await readPresetImportFileAsText(file);
                let parsedPayload = null;
                try {
                    parsedPayload = JSON.parse(text);
                } catch (error) {
                    throw new Error('JSON 格式不正确');
                }

                const importedPresets = buildImportedPresetEntries(
                    parsedPayload,
                    {
                        ...settings,
                        presetEntries: nextPresetEntries,
                    },
                    nameRegistry
                );

                importedPresets.forEach((preset) => {
                    nextPresetEntries.push(preset);
                    lastImportedPresetId = preset.id;
                });
            } catch (error) {
                failedFiles.push({
                    fileName: String(file && file.name || `文件${fileIndex + 1}`),
                    message: error && error.message ? error.message : '未知错误',
                });
            }
        }

        const importedCount = nextPresetEntries.length - originalPresetEntries.length;
        if (importedCount > 0) {
            setSettings({
                ...settings,
                presetEntries: nextPresetEntries,
                selectedPresetId: lastImportedPresetId || settings.selectedPresetId,
            });
            syncPresetSelectionFromSettings();
            state.view = 'list';
            render();
        }

        return { importedCount, failedFiles, lastImportedPresetId };
    }

    async function handlePresetImportChange(fileInput) {
        const files = Array.from(fileInput && fileInput.files ? fileInput.files : []);
        if (fileInput) {
            fileInput.value = '';
        }
        if (!files.length) {
            return;
        }

        const result = await importPresetFiles(files);
        if (!result.failedFiles.length) {
            return;
        }

        const errorSummary = result.failedFiles
            .map((item) => `- ${item.fileName}：${item.message}`)
            .join('\n');
        const alertMessage = result.importedCount > 0
            ? `已导入 ${result.importedCount} 个预设，但以下文件失败：\n${errorSummary}`
            : `导入预设失败：\n${errorSummary}`;

        console.error('[网络连接/预设] 导入预设失败', result.failedFiles);
        if (typeof window.alert === 'function') {
            window.alert(alertMessage);
        }
    }

    function openPresetEditor(presetId) {
        const resolvedPresetId = selectPreset(presetId);
        if (!resolvedPresetId) {
            return;
        }

        resetBlockDraft();
        state.view = 'editor';
        render();
    }

    function createPreset() {
        const draft = buildNewPresetDraft();
        state.currentPresetId = '';
        state.pendingPresetName = draft.name;
        state.pendingPresetBlocks = draft.blocks;
        state.selectedPresetIndex = -1;
        state.selectedPresetBlockIndex = draft.blocks.length ? 0 : -1;
        resetBlockDraft();
        state.view = 'editor';
        render();
    }

    function deletePreset(presetId) {
        const settings = getSettings();
        const presetEntries = getPresetEntries(settings);

        if (presetEntries.length <= 1) {
            return;
        }

        const nextPresetEntries = presetEntries.filter((entry) => entry.id !== presetId);
        const nextSelectedPresetId = presetId === state.currentPresetId
            ? nextPresetEntries[0]?.id || ''
            : resolveSelectedPresetId(settings.selectedPresetId, nextPresetEntries);

        setSettings({
            ...settings,
            presetEntries: nextPresetEntries,
            selectedPresetId: nextSelectedPresetId,
        });

        syncPresetSelectionFromSettings();
        resetBlockDraft();
        state.view = 'list';
        render();
    }

    function openAddTypePicker() {
        capturePresetBlockListScrollTop();
        resetBlockDraft();
        state.view = 'addType';
        render();
    }

    function openMessageBlockEditor(blockIndex = -1) {
        const normalizedIndex = Number(blockIndex);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetBlock = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? blocks[normalizedIndex]
            : createPresetBlock('user');
        const role = MESSAGE_ROLE_ORDER.includes(targetBlock.role) ? targetBlock.role : 'user';

        state.editingBlockIndex = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? normalizedIndex
            : -1;
        state.pendingBlockDraft = normalizePresetBlock({
            ...targetBlock,
            role,
            text: targetBlock.text || '',
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.blockDraftBaseline = buildComparableBlockSnapshot(state.pendingBlockDraft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.infoSourceBaselineIndex = -1;
        state.view = 'messageEditor';
        render();
    }

    function openContextBlockEditor(blockIndex = -1) {
        const normalizedIndex = Number(blockIndex);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetBlock = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? blocks[normalizedIndex]
            : createPresetBlock('_context');

        state.editingBlockIndex = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? normalizedIndex
            : -1;
        state.pendingBlockDraft = normalizePresetBlock({
            ...targetBlock,
            role: '_context',
            name: targetBlock.name || '主聊天',
            text: '',
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.blockDraftBaseline = buildComparableBlockSnapshot(state.pendingBlockDraft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.infoSourceBaselineIndex = -1;
        state.view = 'contextEditor';
        render();
    }

    function openPrefixBlockEditor(blockIndex = -1) {
        const normalizedIndex = Number(blockIndex);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetBlock = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? blocks[normalizedIndex]
            : createPresetBlock('_prefix');

        state.editingBlockIndex = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            ? normalizedIndex
            : -1;
        state.pendingBlockDraft = normalizePresetBlock({
            ...targetBlock,
            role: '_prefix',
            name: targetBlock.name || '前缀续写',
            prefixContent: targetBlock.prefixContent || '',
            stopSequence: targetBlock.stopSequence || '',
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.blockDraftBaseline = buildComparableBlockSnapshot(state.pendingBlockDraft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.infoSourceBaselineIndex = -1;
        state.view = 'prefixEditor';
        render();
    }

    function openInfoSourcePicker(blockIndex = -1) {
        const normalizedIndex = Number(blockIndex);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetBlock = Number.isFinite(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < blocks.length
            && String(blocks[normalizedIndex]?.role || '').trim() === '_info'
            ? blocks[normalizedIndex]
            : null;
        const sources = getInfoSourceOptions();
        const matchedIndex = targetBlock
            ? sources.findIndex((source) => source.id === String(targetBlock.sourceId || '').trim())
            : -1;

        state.editingBlockIndex = targetBlock ? normalizedIndex : -1;
        state.pendingBlockDraft = normalizePresetBlock({
            ...targetBlock,
            role: '_info',
            name: targetBlock?.name || '信息块',
            text: '',
            messageRole: targetBlock?.messageRole || 'system',
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.selectedInfoSourceIndex = sources.length
            ? (matchedIndex >= 0
                ? matchedIndex
                : Math.min(Math.max(state.selectedInfoSourceIndex, 0), sources.length - 1))
            : -1;
        state.blockDraftBaseline = buildComparableBlockSnapshot(state.pendingBlockDraft, state.editingBlockIndex >= 0 ? state.editingBlockIndex : blocks.length);
        state.infoSourceBaselineIndex = state.selectedInfoSourceIndex;
        state.pickerRoleOverrides = {};
        if (targetBlock && matchedIndex >= 0) {
            state.pickerRoleOverrides[matchedIndex] = String(targetBlock.messageRole || 'system').trim();
        }
        state.view = 'infoSourcePicker';
        render();
    }

    function selectInfoSource(sourceIndex = 0) {
        const sources = getInfoSourceOptions();
        const normalizedIndex = Number(sourceIndex);
        if (!sources.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= sources.length) {
            return;
        }

        state.selectedInfoSourceIndex = normalizedIndex;
        if (state.view === 'infoSourcePicker') {
            render();
        }
    }

    function confirmInfoSourceSelection(sourceIndex = state.selectedInfoSourceIndex) {
        const sources = getInfoSourceOptions();
        const normalizedIndex = Number(sourceIndex);
        if (!sources.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= sources.length) {
            return;
        }

        const targetIndex = state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length;
        const selectedRole = getPickerRoleAtIndex(normalizedIndex);
        const nextBlock = createInfoBlockFromSource(sources[normalizedIndex], targetIndex);
        if (MESSAGE_ROLE_ORDER.includes(selectedRole)) {
            nextBlock.messageRole = selectedRole;
        }
        const nextBlocks = normalizePresetBlocks(state.pendingPresetBlocks);

        if (state.editingBlockIndex >= 0 && state.editingBlockIndex < nextBlocks.length) {
            nextBlocks[state.editingBlockIndex] = nextBlock;
            state.selectedPresetBlockIndex = state.editingBlockIndex;
        } else {
            nextBlocks.push(nextBlock);
            state.selectedPresetBlockIndex = nextBlocks.length - 1;
        }

        state.pendingPresetBlocks = nextBlocks;
        resetBlockDraft();
        state.view = 'editor';
        render();
    }

    async function openSelectedInfoSourcePreview(sourceIndex = state.selectedInfoSourceIndex) {
        const sources = getInfoSourceOptions();
        const normalizedIndex = Number(sourceIndex);
        if (!sources.length || !Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= sources.length) {
            return;
        }

        const source = sources[normalizedIndex];
        openPreview(`${source.name}预览`, '读取中...', 'infoSourcePicker');

        try {
            const previewText = await buildInfoSourceResolvedText({
                sourceId: source.id,
                sourceScope: source.scope,
            });
            state.previewTitle = `${source.name}预览`;
            state.previewText = String(previewText || '').trim() || '暂无内容';
            state.previewReturnView = 'infoSourcePicker';
            if (state.view === 'preview') {
                render();
            }
        } catch (error) {
            state.previewTitle = `${source.name}预览`;
            state.previewText = '读取失败';
            state.previewReturnView = 'infoSourcePicker';
            if (state.view === 'preview') {
                render();
            }
        }
    }



    function confirmAddType(typeKey) {
        if (typeKey === 'context') {
            openContextBlockEditor();
            return;
        }
        if (typeKey === 'info') {
            openInfoSourcePicker();
            return;
        }
        if (typeKey === 'worldinfo') {
            openWorldBookPicker();
            return;
        }
        if (typeKey === 'prefix') {
            openPrefixBlockEditor();
            return;
        }

        openMessageBlockEditor();
    }

    function saveDraftBlock() {
        const targetIndex = state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length;
        const nextBlock = normalizePresetBlock({
            ...(state.pendingBlockDraft || {}),
        }, targetIndex);
        const nextBlocks = normalizePresetBlocks(state.pendingPresetBlocks);

        if (state.editingBlockIndex >= 0 && state.editingBlockIndex < nextBlocks.length) {
            nextBlocks[state.editingBlockIndex] = nextBlock;
            state.selectedPresetBlockIndex = state.editingBlockIndex;
        } else {
            nextBlocks.push(nextBlock);
            state.selectedPresetBlockIndex = nextBlocks.length - 1;
        }

        state.pendingPresetBlocks = nextBlocks;
        resetBlockDraft();
        state.view = 'editor';
        render();
        scheduleRestorePresetBlockListScroll({ ensureSelected: true });
    }

    function cycleDraftRole(step = 1) {
        const draft = normalizePresetBlock(state.pendingBlockDraft || createPresetBlock('user'), 0);
        const currentIndex = Math.max(0, MESSAGE_ROLE_ORDER.indexOf(draft.role));
        const nextRole = MESSAGE_ROLE_ORDER[(currentIndex + step + MESSAGE_ROLE_ORDER.length) % MESSAGE_ROLE_ORDER.length];
        const currentDefaultName = getDefaultBlockName(draft.role || 'system', 0);
        const nextDefaultName = getDefaultBlockName(nextRole, 0);
        const currentName = String(draft.name || '').trim();

        state.pendingBlockDraft = normalizePresetBlock({
            ...draft,
            role: nextRole,
            name: !currentName || currentName === currentDefaultName ? nextDefaultName : currentName,
        }, state.editingBlockIndex >= 0 ? state.editingBlockIndex : state.pendingPresetBlocks.length);
        render();
    }

    function preserveBlockListAnchorPosition(previousIndex, nextIndex) {
        if (!state.root || !Number.isFinite(previousIndex) || !Number.isFinite(nextIndex)) {
            return;
        }

        const listElement = state.root.querySelector('#networkPresetBlockList');
        const anchorItem = listElement
            ? listElement.querySelector(`[data-preset-block-index="${previousIndex}"]`)
            : null;
        if (!listElement || !anchorItem) {
            return;
        }

        const listRect = listElement.getBoundingClientRect();
        const itemRect = anchorItem.getBoundingClientRect();
        const anchorOffsetTop = itemRect.top - listRect.top;
        const anchorOffsetLeft = itemRect.left - listRect.left;

        requestAnimationFrame(() => {
            if (!state.root) {
                return;
            }
            const nextListElement = state.root.querySelector('#networkPresetBlockList');
            const nextAnchorItem = nextListElement
                ? nextListElement.querySelector(`[data-preset-block-index="${nextIndex}"]`)
                : null;
            if (!nextListElement || !nextAnchorItem) {
                return;
            }

            const nextListRect = nextListElement.getBoundingClientRect();
            const nextItemRect = nextAnchorItem.getBoundingClientRect();
            const nextOffsetTop = nextItemRect.top - nextListRect.top;
            const nextOffsetLeft = nextItemRect.left - nextListRect.left;
            const deltaTop = nextOffsetTop - anchorOffsetTop;
            const deltaLeft = nextOffsetLeft - anchorOffsetLeft;

            if (Number.isFinite(deltaTop) && deltaTop !== 0) {
                nextListElement.scrollTop += deltaTop;
            }
            if (Number.isFinite(deltaLeft) && deltaLeft !== 0) {
                nextListElement.scrollLeft += deltaLeft;
            }
        });
    }

    function moveBlock(index, offset) {
        const sourceIndex = Number(index);
        const step = Number(offset);
        const nextBlocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const targetIndex = sourceIndex + step;

        if (!Number.isFinite(sourceIndex) || !Number.isFinite(step) || sourceIndex < 0 || sourceIndex >= nextBlocks.length || targetIndex <0 || targetIndex >= nextBlocks.length) {
            return;
        }

        const movedBlock = nextBlocks[sourceIndex];
        nextBlocks.splice(sourceIndex, 1);
        nextBlocks.splice(targetIndex, 0, movedBlock);
        state.pendingPresetBlocks = nextBlocks;
        state.selectedPresetBlockIndex = targetIndex;
        capturePresetBlockListScrollTop();
        preserveBlockListAnchorPosition(sourceIndex, targetIndex);
        render();
    }

    function deleteBlock(index) {
        const targetIndex = Number(index);
        const nextBlocks = normalizePresetBlocks(state.pendingPresetBlocks);

        if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= nextBlocks.length) {
            return;
        }

        nextBlocks.splice(targetIndex, 1);
        state.pendingPresetBlocks = nextBlocks;
        state.selectedPresetBlockIndex = nextBlocks.length
            ? Math.min(targetIndex, nextBlocks.length - 1)
            : -1;
        render();
    }

    function openBlockEditor(index) {
        const targetIndex = Number(index);
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const block = Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < blocks.length
            ? blocks[targetIndex]
            : null;

        if (!block) {
            return;
        }

        capturePresetBlockListScrollTop();
        state.selectedPresetBlockIndex = targetIndex;

        const role = String(block.role || '').trim();
        if (role === '_context') {
            openContextBlockEditor(targetIndex);
            return;
        }
        if (role === '_info') {
            openInfoSourcePicker(targetIndex);
            return;
        }
        if (role === '_worldinfo') {
            openWorldBookPicker(targetIndex);
            return;
        }
        if (role === '_prefix') {
            openPrefixBlockEditor(targetIndex);
            return;
        }

        openMessageBlockEditor(targetIndex);
    }

    function cancelEditorAndReturnToList() {
        if (!canLeavePresetEditor()) {
            return;
        }
        syncPresetSelectionFromSettings();
        resetBlockDraft();
        state.view = 'list';
        render();
    }

    function backToPresetEditor() {
        if (hasUnsavedBlockDraftChanges() && !confirmDiscardUnsavedChanges('当前块尚未保存，确定返回吗？')) {
            return;
        }
        resetBlockDraft();
        state.view = 'editor';
        render();
        scheduleRestorePresetBlockListScroll({ ensureSelected: true });
    }

    function backFromPreview() {
        state.view = state.previewReturnView || 'editor';
        render();
    }

    function getHeaderConfig() {
        if (state.view === 'editor') {
            return {
                title: state.pendingPresetName || '预设配置',
                actions: [
                    { action: 'open-add-type', label: '添加块', tone: 'secondary' },
                    { action: 'open-preset-preview', label: '预览', tone: 'secondary' },
                    { action: 'save-preset', label: '保存', tone: 'primary' },
                    { action: 'back-list', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'addType') {
            return {
                title: '选择块类型',
                actions: [
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'messageEditor') {
            return {
                title: '消息块',
                actions: [
                    { action: 'preview-draft-block', label: '查看', tone: 'secondary' },
                    { action: 'save-draft-block', label: '保存', tone: 'primary' },
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'contextEditor') {
            return {
                title: '主聊天',
                actions: [
                    { action: 'preview-draft-block', label: '查看', tone: 'secondary' },
                    { action: 'save-draft-block', label: '保存', tone: 'primary' },
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'prefixEditor') {
            return {
                title: '对话前缀续写',
                actions: [
                    { action: 'save-draft-block', label: '保存', tone: 'primary' },
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'infoSourcePicker') {
            return {
                title: '选择动态信息',
                actions: [
                    { action: 'preview-info-source', label: '查看', tone: 'secondary' },
                    { action: 'confirm-info-source', label: '添加', tone: 'primary' },
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'worldBookPicker') {
            return {
                title: '选择世界书',
                actions: [
                    { action: 'preview-world-book', label: '查看', tone: 'secondary' },
                    { action: 'confirm-world-book', label: '添加', tone: 'primary' },
                    { action: 'back-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'preview') {
            const actions = [];
            if (hasPreviewJsonText()) {
                actions.push({ action: 'toggle-preview-mode', label: getPreviewToggleLabel(), tone: 'secondary' });
            }
            actions.push({ action: 'back-preview', label: '返回', tone: 'ghost' });
            return {
                title: state.previewTitle || '预览',
                actions,
            };
        }

        const currentPreset = getCurrentPreset();
        return {
            title: '预设',
            actions: [
                { action: 'open-import-preset', label: '导入', tone: 'secondary' },
                { action: 'export-selected-preset', label: '导出', tone: 'secondary', disabled: !currentPreset },
                { action: 'preview-selected-preset', label: '预览', tone: 'secondary', disabled: !currentPreset },
                { action: 'open-selected-preset-editor', label: '编辑', tone: 'secondary', disabled: !currentPreset },
                { action: 'create-preset', label: '新建预设', tone: 'primary' },
            ],
        };
    }

    function renderActionButtons(actions) {
        return actions.map((actionConfig) => `
            <button
                class="xp-button xp-button--${escapeHtml(actionConfig.tone || 'secondary')} network-preset__button"
                type="button"
                data-preset-action="${escapeHtml(actionConfig.action)}"
                ${actionConfig.disabled ? 'disabled' : ''}
            >${escapeHtml(actionConfig.label)}</button>
        `).join('');
    }

    function renderPresetList(settings = getSettings()) {
        const presetEntries = getPresetEntries(settings);
        const canDeletePreset = presetEntries.length > 1;

        if (!presetEntries.length) {
            return `
                <div class="network-preset__empty">
                    <strong>暂无预设</strong>
                </div>
            `;
        }

        return `
            <div class="network-preset__list" id="networkPresetList">
                ${presetEntries.map((entry, index) => {
                    const isSelected = entry.id === settings.selectedPresetId;
                    return `
                        <div class="xp-list-item network-preset__preset-item ${isSelected ? 'is-selected' : ''}" data-preset-id="${escapeHtml(entry.id)}" data-preset-index="${index}">
                            <div class="network-preset__preset-main">
                                <div class="network-preset__preset-head">
                                    <span class="network-preset__preset-name">${escapeHtml(entry.name)}</span>
                                    <span class="network-preset__badge ${isSelected ? 'is-active' : ''}" aria-hidden="${isSelected ? 'false' : 'true'}">当前</span>
                                </div>
                                <span class="network-preset__preset-meta">${escapeHtml(`${Array.isArray(entry.blocks) ? entry.blocks.length : 0}块`)}</span>
                            </div>
                            ${canDeletePreset ? `<button class="xp-button xp-button--icon xp-button--danger network-preset__delete-button" type="button" data-preset-action="delete-preset" data-preset-id="${escapeHtml(entry.id)}">×</button>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderPresetEditor() {
        const blocks = normalizePresetBlocks(state.pendingPresetBlocks);
        const blocksHtml = blocks.length
            ? blocks.map((block, index) => {
                const canMoveUp = index > 0;
                const canMoveDown = index < blocks.length - 1;
                const subtitle = getBlockSubtitle(block);
                return `
                    <div class="xp-list-item network-preset__block-item ${state.selectedPresetBlockIndex === index ? 'is-selected' : ''}" data-preset-block-index="${index}">
                        <div class="network-preset__block-main">
                            <span class="network-preset__block-name">${escapeHtml(getBlockDisplayName(block, index))}</span>
                            ${subtitle ? `<span class="network-preset__block-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                        </div>
                        <div class="network-preset__block-actions">
                            <button class="xp-button xp-button--icon network-preset__move-button" type="button" data-preset-action="move-block" data-preset-block-index="${index}" data-preset-block-offset="-1" ${canMoveUp ? '' : 'disabled'}>↑</button>
                            <button class="xp-button xp-button--icon network-preset__move-button" type="button" data-preset-action="move-block" data-preset-block-index="${index}" data-preset-block-offset="1" ${canMoveDown ? '' : 'disabled'}>↓</button>
                            <button class="xp-button xp-button--icon xp-button--danger network-preset__delete-button" type="button" data-preset-action="delete-block" data-preset-block-index="${index}">×</button>
                        </div>
                    </div>
                `;
            }).join('')
            : `
                <div class="network-preset__empty">
                    <strong>暂无块</strong>
                </div>
            `;

        return `
            <div class="network-preset__content network-preset__content--editor">
                <div class="network-preset__name-card">
                    <input class="xp-input network-preset__name-input" data-preset-field="name" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(state.pendingPresetName)}" placeholder="预设名称">
                </div>
                <div class="network-preset__block-list" id="networkPresetBlockList">${blocksHtml}</div>
            </div>
        `;
    }

    function renderAddTypePicker() {
        return `
            <div class="network-preset__list network-preset__list--type" id="networkPresetTypeList">
                ${BLOCK_TYPE_OPTIONS.map((option) => `
                    <button class="xp-list-row network-preset__type-item" type="button" data-preset-action="select-type" data-preset-type="${escapeHtml(option.key)}">
                        <span class="network-preset__row-label">${escapeHtml(option.label)}</span>
                        <span class="network-preset__row-arrow">›</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    function renderMessageBlockEditor() {
        const draft = normalizePresetBlock(state.pendingBlockDraft || createPresetBlock('user'), state.editingBlockIndex >= 0 ? state.editingBlockIndex : 0);

        return `
            <div class="network-preset__content network-preset__content--message-editor">
                <div class="network-preset__editor-card">
                    <div class="network-preset__field-group">
                        <span class="network-preset__field-label">块名称</span>
                        <input class="xp-input network-preset__input" data-preset-draft-field="name" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(draft.name)}" placeholder="块名称">
                    </div>
                    <button class="xp-list-row network-preset__row" type="button" data-preset-action="toggle-draft-role">
                        <span class="network-preset__row-label">角色</span>
                        <span class="network-preset__row-value-wrap">
                            <span class="network-preset__row-value">${escapeHtml(draft.role)}</span>
                            <span class="network-preset__row-arrow">⇆</span>
                        </span>
                    </button>
                    <div class="network-preset__field-group">
                        <span class="network-preset__field-label">内容</span>
                        <textarea class="network-preset__textarea" data-preset-draft-field="text" spellcheck="false" placeholder="内容">${escapeHtml(draft.text)}</textarea>
                    </div>
                </div>
            </div>
        `;
    }

    function renderContextBlockEditor(settings = getSettings()) {
        const summaryLabel = typeof networkData.getAiMainChatSummaryLabel === 'function'
            ? networkData.getAiMainChatSummaryLabel(settings)
            : '默认';

        return `
            <div class="network-preset__content network-preset__content--context-editor">
                <div class="network-preset__editor-card">
                    <div class="network-preset__summary-row">
                        <span class="network-preset__summary-label">当前规则</span>
                        <span class="network-preset__summary-value">${escapeHtml(summaryLabel)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPrefixBlockEditor() {
        const draft = normalizePresetBlock(state.pendingBlockDraft || createPresetBlock('_prefix'), state.editingBlockIndex >= 0 ? state.editingBlockIndex : 0);
        const prefixContent = String(draft.prefixContent || '').trim();
        const stopSequence = String(draft.stopSequence || '').trim();

        return `
            <div class="network-preset__content network-preset__content--prefix-editor">
                <div class="network-preset__editor-card">
                    <div class="network-preset__field-group">
                        <span class="network-preset__field-label">角色</span>
                        <input class="xp-input network-preset__input" type="text" value="assistant" disabled>
                    </div>
                    <div class="network-preset__field-group">
                        <span class="network-preset__field-label">前缀内容 (prefix)</span>
                        <textarea class="network-preset__textarea" data-preset-draft-field="prefixContent" spellcheck="false" placeholder="模型会从这里接着写">${escapeHtml(prefixContent)}</textarea>
                    </div>
                    <div class="network-preset__field-group">
                        <span class="network-preset__field-label">stop 停止序列</span>
                        <input class="xp-input network-preset__input" data-preset-draft-field="stopSequence" type="text" maxlength="200" spellcheck="false" value="${escapeHtml(stopSequence)}" placeholder="停止符，如三个反引号">
                        <span class="network-preset__field-label" style="color:#6a7c90;font-size:10px;">模型生成到该序列时停止，留空则不发送 stop 参数</span>
                    </div>
                </div>
            </div>
        `;
    }

    function getMessageRoleLabel(messageRole) {
        if (messageRole === 'user') return 'user';
        if (messageRole === 'assistant') return 'ai助手';
        return '系统';
    }

    function cyclePickerRoleAtIndex(sourceIndex) {
        const idx = Number(sourceIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        const defaultRole = String((state.pendingBlockDraft && state.pendingBlockDraft.messageRole) || 'system').trim();
        const current = state.pickerRoleOverrides[idx] || defaultRole;
        const currentPos = Math.max(0, MESSAGE_ROLE_ORDER.indexOf(current));
        const nextRole = MESSAGE_ROLE_ORDER[(currentPos + 1) % MESSAGE_ROLE_ORDER.length];
        state.pickerRoleOverrides = { ...state.pickerRoleOverrides, [idx]: nextRole };
        render();
    }

    function getPickerRoleAtIndex(sourceIndex) {
        const idx = Number(sourceIndex);
        if (Number.isFinite(idx) && state.pickerRoleOverrides[idx]) {
            return state.pickerRoleOverrides[idx];
        }
        return String((state.pendingBlockDraft && state.pendingBlockDraft.messageRole) || 'system').trim();
    }

    function renderInfoSourcePicker() {
        const sources = getInfoSourceOptions();
        if (!sources.length) {
            return `
                <div class="network-preset__empty">
                    <strong>暂无动态信息</strong>
                </div>
            `;
        }

        return `
            <div class="network-preset__block-list" id="networkPresetInfoSourceList">
                ${sources.map((source, index) => {
                    const rowRole = getPickerRoleAtIndex(index);
                    const rowRoleLabel = getMessageRoleLabel(rowRole);
                    return `
                    <div class="xp-list-item network-preset__block-item ${state.selectedInfoSourceIndex === index ? 'is-selected' : ''}" data-preset-action="select-info-source" data-preset-info-source-index="${index}">
                        <div class="network-preset__block-main">
                            <span class="network-preset__block-name">${escapeHtml(source.name)}</span>
                            <span class="network-preset__block-subtitle">${escapeHtml(source.subtitle)}</span>
                        </div>
                        <button class="network-preset__role-badge" type="button" data-preset-action="cycle-picker-role" data-preset-source-index="${index}" title="点击切换角色身份">${escapeHtml(rowRoleLabel)}</button>
                    </div>
                `; }).join('')}
            </div>
        `;
    }

    function renderWorldBookPicker() {
        const options = getConfiguredWorldBookOptions(getSettings());
        if (!options.length) {
            return `
                <div class="network-preset__empty">
                    <strong>请先在世界书页面添加世界书</strong>
                </div>
            `;
        }

        return `
            <div class="network-preset__block-list" id="networkPresetWorldBookList">
                ${options.map((source, index) => {
                    const rowRole = getPickerRoleAtIndex(index);
                    const rowRoleLabel = getMessageRoleLabel(rowRole);
                    return `
                    <div class="xp-list-item network-preset__block-item ${state.selectedWorldBookIndex === index ? 'is-selected' : ''}" data-preset-action="select-world-book" data-preset-world-book-index="${index}">
                        <div class="network-preset__block-main">
                            <span class="network-preset__block-name">${escapeHtml(source.name)}</span>
                            <span class="network-preset__block-subtitle">${escapeHtml(typeof networkData.getAiWorldBookScopeLabel === 'function' ? networkData.getAiWorldBookScopeLabel(source.scope) : source.scope)}</span>
                        </div>
                        <button class="network-preset__role-badge" type="button" data-preset-action="cycle-picker-role" data-preset-source-index="${index}" title="点击切换角色身份">${escapeHtml(rowRoleLabel)}</button>
                    </div>
                `; }).join('')}
            </div>
        `;
    }

    function renderPreview() {
        return `
            <div class="network-preset__content network-preset__content--preview">
                <div class="network-preset__preview-card">
                    <pre class="network-preset__preview-text">${escapeHtml(getActivePreviewText())}</pre>
                </div>
            </div>
        `;
    }

    function renderBody(settings = getSettings()) {
        if (state.view === 'editor') {
            return renderPresetEditor();
        }

        if (state.view === 'addType') {
            return renderAddTypePicker();
        }

        if (state.view === 'messageEditor') {
            return renderMessageBlockEditor();
        }

        if (state.view === 'contextEditor') {
            return renderContextBlockEditor(settings);
        }

        if (state.view === 'prefixEditor') {
            return renderPrefixBlockEditor();
        }

        if (state.view === 'infoSourcePicker') {
            return renderInfoSourcePicker();
        }

        if (state.view === 'worldBookPicker') {
            return renderWorldBookPicker();
        }

        if (state.view === 'preview') {
            return renderPreview();
        }

        return renderPresetList(settings);
    }

    function captureRenderScrollState() {
        if (!state.root) {
            return [];
        }

        return RENDER_SCROLL_SELECTORS.map((selector) => {
            const element = state.root.querySelector(selector);
            return element
                ? { selector, top: element.scrollTop, left: element.scrollLeft }
                : null;
        }).filter(Boolean);
    }

    function restoreRenderScrollState(scrollState) {
        if (!state.root || !Array.isArray(scrollState) || !scrollState.length) {
            return;
        }

        scrollState.forEach((snapshot) => {
            const element = state.root.querySelector(snapshot.selector);
            if (!element) {
                return;
            }
            element.scrollTop = Number(snapshot.top) || 0;
            element.scrollLeft = Number(snapshot.left) || 0;
        });
    }

    function render() {
        if (!state.root) {
            return;
        }

        const scrollState = captureRenderScrollState();
        const settings = getSettings();
        const headerConfig = getHeaderConfig();
        const actionsHtml = headerConfig.actions.length
            ? `<div class="network-preset__actions">${renderActionButtons(headerConfig.actions)}</div>`
            : '';

        state.root.innerHTML = `
            <div class="network-preset">
                <div class="network-preset__main-panel">
                    <div class="network-preset__header">
                        <div class="network-preset__header-main">
                            <h2 class="network-preset__title">${escapeHtml(headerConfig.title)}</h2>
                        </div>
                    </div>
                    <div class="network-preset__body">
                        ${renderBody(settings)}
                    </div>
                </div>
                ${actionsHtml}
                <input class="network-preset__file-input" type="file" accept=".json,application/json" data-preset-file-input multiple hidden>
            </div>
        `;
        restoreRenderScrollState(scrollState);
    }

    function handleClick(event) {
        const actionButton = event.target.closest('[data-preset-action]');
        if (actionButton && state.root && state.root.contains(actionButton)) {
            const action = String(actionButton.getAttribute('data-preset-action') || '').trim();
            const presetId = String(actionButton.getAttribute('data-preset-id') || '').trim();
            const blockIndex = Number(actionButton.getAttribute('data-preset-block-index'));
            const blockOffset = Number(actionButton.getAttribute('data-preset-block-offset'));
            const typeKey = String(actionButton.getAttribute('data-preset-type') || '').trim();
            const infoSourceIndex = Number(actionButton.getAttribute('data-preset-info-source-index'));
            const worldBookIndex = Number(actionButton.getAttribute('data-preset-world-book-index'));
            const pickerSourceIndex = Number(actionButton.getAttribute('data-preset-source-index'));

            switch (action) {
                case 'create-preset':
                    createPreset();
                    return;
                case 'delete-preset':
                    deletePreset(presetId);
                    return;
                case 'open-import-preset': {
                    const importInput = state.root.querySelector('[data-preset-file-input]');
                    if (importInput) {
                        importInput.value = '';
                        importInput.click();
                    }
                    return;
                }
                case 'open-selected-preset-editor':
                    openPresetEditor(getSettings().selectedPresetId || state.currentPresetId);
                    return;
                case 'export-selected-preset':
                    exportPreset(getSettings().selectedPresetId || state.currentPresetId);
                    return;
                case 'preview-selected-preset':
                    openPresetPreview({ returnView: 'list' });
                    return;
                case 'open-add-type':
                    openAddTypePicker();
                    return;
                case 'save-preset':
                    saveCurrentPreset();
                    return;
                case 'back-list':
                    cancelEditorAndReturnToList();
                    return;
                case 'back-editor':
                    backToPresetEditor();
                    return;
                case 'toggle-preview-mode':
                    togglePreviewMode();
                    return;
                case 'back-preview':
                    backFromPreview();
                    return;
                case 'select-type':
                    confirmAddType(typeKey);
                    return;
                case 'select-info-source':
                    selectInfoSource(infoSourceIndex);
                    return;
                case 'preview-info-source':
                    openSelectedInfoSourcePreview();
                    return;
                case 'confirm-info-source':
                    confirmInfoSourceSelection();
                    return;
                case 'select-world-book':
                    selectWorldBook(worldBookIndex);
                    return;
                case 'preview-world-book':
                    openSelectedWorldBookPreview();
                    return;
                case 'confirm-world-book':
                    confirmWorldBookSelection();
                    return;
                case 'toggle-draft-role':
                    cycleDraftRole(1);
                    return;
                case 'cycle-picker-role':
                    cyclePickerRoleAtIndex(pickerSourceIndex);
                    return;
                case 'save-draft-block':
                    saveDraftBlock();
                    return;
                case 'preview-draft-block':
                    openBlockPreviewFromDraft();
                    return;
                case 'move-block':
                    moveBlock(blockIndex, blockOffset);
                    return;
                case 'delete-block':
                    deleteBlock(blockIndex);
                    return;
                case 'open-preset-preview':
                    openPresetPreview();
                    return;
                default:
                    break;
            }
        }

        const presetItem = event.target.closest('[data-preset-id][data-preset-index]');
        if (presetItem && state.root && state.root.contains(presetItem) && !event.target.closest('[data-preset-action="delete-preset"]')) {
            selectPreset(presetItem.getAttribute('data-preset-id') || '');
            render();
            return;
        }

        const blockItem = event.target.closest('[data-preset-block-index]');
        if (blockItem && state.root && state.root.contains(blockItem) && !event.target.closest('[data-preset-action]')) {
            openBlockEditor(blockItem.getAttribute('data-preset-block-index'));
        }
    }

    function handleDoubleClick(event) {
        const presetItem = event.target.closest('[data-preset-id][data-preset-index]');
        if (!presetItem || !state.root || !state.root.contains(presetItem) || event.target.closest('[data-preset-action="delete-preset"]')) {
            return;
        }

        openPresetEditor(presetItem.getAttribute('data-preset-id') || '');
    }

    function handleChange(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        if (target.hasAttribute('data-preset-file-input')) {
            handlePresetImportChange(target);
        }
    }

    function handleScroll(event) {
        const target = event.target;
        if (!target || target.id !== 'networkPresetBlockList') {
            return;
        }
        state.presetBlockListScrollTop = target.scrollTop;
    }

    function handleInput(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const presetField = String(target.getAttribute('data-preset-field') || '').trim();
        if (presetField === 'name') {
            state.pendingPresetName = target.value;
            return;
        }

        const draftField = String(target.getAttribute('data-preset-draft-field') || '').trim();
        if (!draftField) {
            return;
        }

        state.pendingBlockDraft = {
            ...(state.pendingBlockDraft || createPresetBlock('user')),
            [draftField]: target.value,
        };
    }

    function bindEvents() {
        if (!state.root || state.isBound) {
            return;
        }

        state.root.addEventListener('click', handleClick);
        state.root.addEventListener('dblclick', handleDoubleClick);
        state.root.addEventListener('change', handleChange);
        state.root.addEventListener('scroll', handleScroll, true);
        state.root.addEventListener('input', handleInput);
        state.isBound = true;
    }

    function mount(panelElement) {
        if (!panelElement) {
            return;
        }

        panelElement.innerHTML = '<div class="network-page__canvas network-page__canvas--preset"></div>';
        state.root = panelElement.querySelector('.network-page__canvas--preset');
        bindEvents();
        syncPresetSelectionFromSettings();

        if (!state.unsubscribe && typeof networkData.subscribeAiSettings === 'function') {
            state.unsubscribe = networkData.subscribeAiSettings(() => {
                if (state.view === 'list') {
                    syncPresetSelectionFromSettings();
                }
                render();
            });
        }

        render();
    }

    networkData.getAiPresetSummaryLabel = getPresetSummaryLabel;
    networkData.getAiInfoSourceOptions = getInfoSourceOptions;
    networkData.getAiInfoSourceOptionById = getInfoSourceOptionById;
    networkData.buildAiInfoSourceResolvedText = buildInfoSourceResolvedText;
    networkData.buildAiMessagesFromPresetBlocks = buildMessagesFromPresetBlocks;

    networkApp.preset = {
        mount,
        render,
        canLeave: canLeavePresetEditor,
        getState() {
            return { ...state };
        },
    };

    networkApp.pages.preset = {
        key: 'preset',
        label: '预设',
        mount,
        canLeave: canLeavePresetEditor,
    };
})(window.NetworkShortcutApp);

