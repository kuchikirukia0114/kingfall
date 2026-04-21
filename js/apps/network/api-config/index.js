(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};

    const networkData = networkApp.data = networkApp.data || {};
    const STORAGE_KEY = 'network-shortcut.aiSettings';
    const DEFAULT_PAGE_VIEW = 'list';
    const AI_API_BINDING_OPTIONS = [
        { key: 'default', label: '默认功能' },
        { key: 'qqChat', label: 'QQ聊天' },
        { key: 'qqSummary', label: 'QQ总结' },
        { key: 'qqQzone', label: 'QQ空间' },
    ];
    const AI_RUNTIME_POLICY_DEFAULTS = Object.freeze({
        streamEnabled: true,
        responseDispatchMode: 'final',
        showTypingIndicator: true,
        targetQueueMode: 'serial',
    });
    const AI_RUNTIME_POLICY_OVERRIDE_DEFAULTS = Object.freeze({
        streamEnabled: '',
        responseDispatchMode: '',
        showTypingIndicator: '',
        targetQueueMode: '',
    });
    const DEFAULT_SETTINGS = Object.freeze({
        apiProfiles: [],
        apiBindings: {
            default: '',
            qqChat: '',
            qqSummary: '',
            qqQzone: '',
        },
        selectedApiProfileId: '',
        presetEntries: [],
        selectedPresetId: '',
        qqChatPresetId: '',
        qqSummaryPresetId: '',
        qqQzonePresetId: '',
        mainChatContextN: '10',
        mainChatUserN: '',
        mainChatXmlRules: [],
        worldBookEntries: [],
        aiRuntimePolicy: AI_RUNTIME_POLICY_DEFAULTS,
        kingfallEnabled: false,
        kingfallProcessingPlaceholderText: '泰罗顶跨中~',
        kingfallSendButtonMedia: null,
        resultDesignTree: [],
    });
    const state = networkApp.apiConfigState = networkApp.apiConfigState || {
        root: null,
        isBound: false,
        settings: null,
        view: DEFAULT_PAGE_VIEW,
        pendingAiApiProfileId: '',
        pendingAiApiName: '',
        pendingAiUrl: '',
        pendingAiKey: '',
        pendingAiModel: '',
        pendingAiTemperature: '',
        pendingAiTopP: '',
        pendingAiRequestStreamMode: 'auto',
        pendingAiProfileRuntimePolicy: { ...AI_RUNTIME_POLICY_OVERRIDE_DEFAULTS },
        aiConfigStatusMessage: '',
        aiConfigStatusTone: 'neutral',
        aiConfigConnectionState: 'idle',
        selectedAiModelIndex: -1,
        isConnecting: false,
        pendingAiRuntimePolicy: { ...AI_RUNTIME_POLICY_DEFAULTS },
        renderScrollSnapshots: {},
    };
    const runtimePolicyPageState = networkApp.runtimePolicyPageState = networkApp.runtimePolicyPageState || {
        root: null,
        isBound: false,
        settings: null,
        pendingAiRuntimePolicy: { ...AI_RUNTIME_POLICY_DEFAULTS },
        statusMessage: '',
        statusTone: 'neutral',
    };
    const RENDER_SCROLL_SELECTORS = [
        '#networkApiProfileList',
        '#networkApiModelList',
        '.network-api__scroll-pane',
    ];
    const settingsListeners = Array.isArray(networkData.aiSettingsListeners)
        ? networkData.aiSettingsListeners
        : [];

    networkData.aiSettingsListeners = settingsListeners;
    networkData.aiApiBindingOptions = AI_API_BINDING_OPTIONS.slice();

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function clampAiNumberSetting(value, min, max) {
        if (value === '' || value == null) return '';
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue)) return '';
        return String(Math.min(max, Math.max(min, nextValue)));
    }

    function clampAiIntegerSetting(value, min, max, fallback = '') {
        if (value === '' || value == null) return fallback;
        const nextValue = parseInt(String(value).trim(), 10);
        if (!Number.isFinite(nextValue)) return fallback;
        return String(Math.min(max, Math.max(min, nextValue)));
    }

    function normalizeAiMainChatRules(rules) {
        if (!Array.isArray(rules)) return [];

        return rules.map((rule) => ({
            tag: typeof rule?.tag === 'string' ? rule.tag.trim() : '',
            mode: rule?.mode === 'exclude' ? 'exclude' : 'recent',
            n: clampAiIntegerSetting(rule?.n, 0, 99, ''),
        }));
    }

    function normalizeAiEndpoint(endpoint) {
        const normalizedEndpoint = String(endpoint || '').trim().replace(/\/+$/, '');
        if (!normalizedEndpoint) return '';
        if (/\/chat\/completions$/i.test(normalizedEndpoint)) return normalizedEndpoint;
        return `${normalizedEndpoint}/chat/completions`;
    }

    function getAiModelsEndpoint(endpoint) {
        const normalizedEndpoint = normalizeAiEndpoint(endpoint);
        if (!normalizedEndpoint) return '';
        return normalizedEndpoint.replace(/\/chat\/completions$/i, '/models');
    }

    function createAiApiProfileId(index = 0) {
        return `ai_api_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getAiApiHostLabel(endpoint) {
        try {
            const url = new URL(normalizeAiEndpoint(endpoint));
            return String(url.host || '').replace(/^api\./i, '').trim();
        } catch (error) {
            return '';
        }
    }

    function getAiApiDefaultName(profile) {
        const explicitName = typeof profile?.name === 'string' ? profile.name.trim() : '';
        if (explicitName) return explicitName;
        return '默认';
    }

    function normalizeAiModelCache(modelCache) {
        return Array.isArray(modelCache)
            ? modelCache.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 200)
            : [];
    }

    function normalizeAiRuntimePolicy(policy) {
        const nextPolicy = policy && typeof policy === 'object' ? policy : {};
        const responseDispatchMode = String(nextPolicy.responseDispatchMode || '').trim() === 'stream'
            ? 'stream'
            : 'final';
        const targetQueueMode = String(nextPolicy.targetQueueMode || '').trim() === 'parallel'
            ? 'parallel'
            : 'serial';

        return {
            streamEnabled: nextPolicy.streamEnabled !== false,
            responseDispatchMode,
            showTypingIndicator: nextPolicy.showTypingIndicator !== false,
            targetQueueMode,
        };
    }

    function normalizeAiRuntimePolicyOverrides(policy) {
        const nextPolicy = policy && typeof policy === 'object' ? policy : {};
        const responseDispatchMode = String(nextPolicy.responseDispatchMode || '').trim();
        const targetQueueMode = String(nextPolicy.targetQueueMode || '').trim();

        return {
            streamEnabled: typeof nextPolicy.streamEnabled === 'boolean' ? nextPolicy.streamEnabled : '',
            responseDispatchMode: responseDispatchMode === 'stream' || responseDispatchMode === 'final' ? responseDispatchMode : '',
            showTypingIndicator: typeof nextPolicy.showTypingIndicator === 'boolean' ? nextPolicy.showTypingIndicator : '',
            targetQueueMode: targetQueueMode === 'parallel' || targetQueueMode === 'serial' ? targetQueueMode : '',
        };
    }

    function resolveAiRuntimePolicy(globalPolicy, policyOverrides) {
        const basePolicy = normalizeAiRuntimePolicy(globalPolicy);
        const overrides = normalizeAiRuntimePolicyOverrides(policyOverrides);
        return normalizeAiRuntimePolicy({
            streamEnabled: typeof overrides.streamEnabled === 'boolean' ? overrides.streamEnabled : basePolicy.streamEnabled,
            responseDispatchMode: overrides.responseDispatchMode || basePolicy.responseDispatchMode,
            showTypingIndicator: typeof overrides.showTypingIndicator === 'boolean' ? overrides.showTypingIndicator : basePolicy.showTypingIndicator,
            targetQueueMode: overrides.targetQueueMode || basePolicy.targetQueueMode,
        });
    }

    function hasAiRuntimePolicyOverrides(policyOverrides) {
        const overrides = normalizeAiRuntimePolicyOverrides(policyOverrides);
        return typeof overrides.streamEnabled === 'boolean'
            || typeof overrides.showTypingIndicator === 'boolean'
            || !!overrides.responseDispatchMode
            || !!overrides.targetQueueMode;
    }

    function normalizeAiApiRequestStreamMode(value) {
        return String(value || '').trim() === 'alwaysOn' ? 'alwaysOn' : 'auto';
    }

    function normalizeAiApiProfile(profile, index = 0) {
        const nextProfile = profile && typeof profile === 'object' ? profile : {};
        return {
            id: typeof nextProfile.id === 'string' && nextProfile.id.trim() ? nextProfile.id.trim() : createAiApiProfileId(index),
            name: getAiApiDefaultName(nextProfile),
            url: normalizeAiEndpoint(nextProfile.url),
            key: typeof nextProfile.key === 'string' ? nextProfile.key.trim() : '',
            model: typeof nextProfile.model === 'string' ? nextProfile.model.trim() : '',
            temperature: clampAiNumberSetting(nextProfile.temperature, 0, 2),
            topP: clampAiNumberSetting(nextProfile.topP, 0, 1),
            requestStreamMode: normalizeAiApiRequestStreamMode(nextProfile.requestStreamMode),
            runtimePolicyOverrides: normalizeAiRuntimePolicyOverrides(nextProfile.runtimePolicyOverrides),
            modelCache: normalizeAiModelCache(nextProfile.modelCache),
        };
    }

    function isAiApiProfileMeaningful(profile) {
        if (!profile || typeof profile !== 'object') return false;
        return Boolean(
            String(profile.url || '').trim()
            || String(profile.key || '').trim()
            || String(profile.model || '').trim()
            || (Array.isArray(profile.modelCache) && profile.modelCache.length)
        );
    }

    function normalizeAiApiProfiles(profiles, legacySettings = {}) {
        if (Array.isArray(profiles) && profiles.length) {
            return profiles
                .map((profile, index) => normalizeAiApiProfile(profile, index))
                .filter((profile) => isAiApiProfileMeaningful(profile))
                .slice(0, 20);
        }

        const legacyProfile = normalizeAiApiProfile({
            name: '默认API',
            url: legacySettings.url,
            key: legacySettings.key,
            model: legacySettings.model,
            temperature: legacySettings.temperature,
            topP: legacySettings.topP,
            modelCache: legacySettings.modelCache,
        }, 0);

        return isAiApiProfileMeaningful(legacyProfile) ? [legacyProfile] : [];
    }

    function normalizeAiApiBindings(bindings, profiles, selectedApiProfileId = '') {
        const nextBindings = bindings && typeof bindings === 'object' ? bindings : {};
        const validProfileIds = new Set((profiles || []).map((profile) => profile.id));
        const normalizedBindings = {};

        AI_API_BINDING_OPTIONS.forEach((option) => {
            const nextId = typeof nextBindings[option.key] === 'string' ? nextBindings[option.key].trim() : '';
            normalizedBindings[option.key] = validProfileIds.has(nextId) ? nextId : '';
        });

        if (!normalizedBindings.default && profiles?.length) {
            normalizedBindings.default = validProfileIds.has(selectedApiProfileId) ? selectedApiProfileId : profiles[0].id;
        }

        return normalizedBindings;
    }

    function resolveSelectedAiApiProfileId(profileId, profiles, apiBindings = {}) {
        const validProfileIds = new Set((profiles || []).map((profile) => profile.id));
        const requestedId = typeof profileId === 'string' ? profileId.trim() : '';
        if (validProfileIds.has(requestedId)) return requestedId;
        const defaultBindingId = typeof apiBindings.default === 'string' ? apiBindings.default.trim() : '';
        if (validProfileIds.has(defaultBindingId)) return defaultBindingId;
        return profiles?.[0]?.id || '';
    }

    function getAiProfileById(profileId, settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        const targetId = typeof profileId === 'string' ? profileId.trim() : '';
        if (!targetId) return null;
        return (Array.isArray(settings.apiProfiles) ? settings.apiProfiles : []).find((profile) => profile.id === targetId) || null;
    }

    function getSelectedAiApiProfile(settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return getAiProfileById(settings.selectedApiProfileId, settings);
    }

    function getAiBindingProfileId(bindingKey = 'default', settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        const key = String(bindingKey || 'default').trim() || 'default';
        const specificBindingId = typeof settings.apiBindings?.[key] === 'string' ? settings.apiBindings[key].trim() : '';
        if (specificBindingId) return specificBindingId;
        const defaultBindingId = typeof settings.apiBindings?.default === 'string' ? settings.apiBindings.default.trim() : '';
        if (defaultBindingId) return defaultBindingId;
        return settings.selectedApiProfileId || '';
    }

    function getAiBindingProfile(bindingKey = 'default', settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return getAiProfileById(getAiBindingProfileId(bindingKey, settings), settings);
    }

    function getAiBindingProfileName(bindingKey = 'default', settingsSource = state.settings) {
        const profile = getAiBindingProfile(bindingKey, settingsSource);
        if (profile?.name) return profile.name;
        return bindingKey === 'default' ? '未设' : '跟随默认';
    }

    function getAiRuntimePolicy(settingsSource = state.settings) {
        const settings = settingsSource && typeof settingsSource === 'object'
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return normalizeAiRuntimePolicy(settings.aiRuntimePolicy);
    }

    function getAiRuntimeSettings(bindingKey = 'default', settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        const profile = getAiBindingProfile(bindingKey, settings) || getSelectedAiApiProfile(settings);
        const globalRuntimePolicy = getAiRuntimePolicy(settings);
        const runtimePolicyOverrides = normalizeAiRuntimePolicyOverrides(profile?.runtimePolicyOverrides);
        return {
            ...settings,
            aiRuntimePolicy: resolveAiRuntimePolicy(globalRuntimePolicy, runtimePolicyOverrides),
            globalAiRuntimePolicy: globalRuntimePolicy,
            runtimePolicyOverrides,
            url: profile?.url || '',
            key: profile?.key || '',
            model: profile?.model || '',
            temperature: profile?.temperature || '',
            topP: profile?.topP || '',
            requestStreamMode: profile?.requestStreamMode || 'auto',
            modelCache: normalizeAiModelCache(profile?.modelCache),
        };
    }

    function getNextAiApiProfileName(settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.apiProfiles)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return (Array.isArray(settings.apiProfiles) && settings.apiProfiles.length)
            ? `API ${settings.apiProfiles.length + 1}`
            : '默认';
    }


    function normalizeAiPresetBlock(block, index = 0) {
        const rawRole = typeof block?.role === 'string' ? block.role.trim() : '';
        const role = ['system', 'user', 'assistant', '_context', '_info', '_worldinfo'].includes(rawRole)
            ? rawRole
            : 'system';
        const defaultNameMap = {
            system: '系统块',
            user: '用户块',
            assistant: '助手块',
            _context: '主聊天',
            _info: '信息块',
            _worldinfo: '世界书',
        };
        const explicitMessageRole = typeof block?.messageRole === 'string' ? block.messageRole.trim() : '';
        const messageRole = ['system', 'user', 'assistant'].includes(explicitMessageRole)
            ? explicitMessageRole
            : (role === '_info' ? 'system' : '');
        const sourceId = typeof block?.sourceId === 'string' ? block.sourceId.trim().slice(0, 80) : '';
        const sourceName = typeof block?.sourceName === 'string' ? block.sourceName.trim().slice(0, 48) : '';
        const sourceScope = typeof block?.sourceScope === 'string' ? block.sourceScope.trim().slice(0, 32) : '';

        return {
            id: typeof block?.id === 'string' && block.id.trim()
                ? block.id.trim()
                : `ai_preset_block_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            role,
            messageRole,
            name: typeof block?.name === 'string' && block.name.trim()
                ? block.name.trim().slice(0, 32)
                : (defaultNameMap[role] || `消息块 ${index + 1}`),
            text: (role === '_context' || role === '_info' || role === '_worldinfo') ? '' : String(block?.text || '').slice(0, 20000),
            sourceId,
            sourceName,
            sourceScope,
        };
    }

    function normalizeAiPresetBlocks(blocks) {
        if (!Array.isArray(blocks)) {
            return [];
        }

        return blocks
            .map((block, index) => normalizeAiPresetBlock(block, index))
            .slice(0, 60);
    }

    function normalizeAiPresetEntry(entry, index = 0) {
        return {
            id: typeof entry?.id === 'string' && entry.id.trim()
                ? entry.id.trim()
                : `ai_preset_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            name: typeof entry?.name === 'string' && entry.name.trim()
                ? entry.name.trim().slice(0, 24)
                : `预设 ${index + 1}`,
            blocks: normalizeAiPresetBlocks(entry?.blocks),
        };
    }

    function normalizeAiPresetEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries
            .map((entry, index) => normalizeAiPresetEntry(entry, index))
            .slice(0, 20);
    }

    function resolveSelectedAiPresetId(presetId, presetEntries) {
        const validPresetIds = new Set((presetEntries || []).map((entry) => entry.id));
        const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';

        if (validPresetIds.has(targetPresetId)) {
            return targetPresetId;
        }

        return presetEntries?.[0]?.id || '';
    }

    function getAiPresetById(presetId, settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.presetEntries)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';

        if (!targetPresetId) {
            return null;
        }

        return Array.isArray(settings.presetEntries)
            ? settings.presetEntries.find((entry) => entry.id === targetPresetId) || null
            : null;
    }

    function getSelectedAiPresetEntry(settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.presetEntries)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return getAiPresetById(settings.selectedPresetId, settings);
    }

    function getNextAiPresetName(settingsSource = state.settings) {
        const settings = settingsSource && Array.isArray(settingsSource.presetEntries)
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return `预设 ${((Array.isArray(settings.presetEntries) ? settings.presetEntries.length : 0) + 1)}`;
    }

    function createAiWorldBookSelectionId(index = 0) {
        return `worldbook_selection_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function createAiWorldBookInfoBindingId(index = 0) {
        return `worldbook_info_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizeAiWorldBookInfoBindings(bindings) {
        if (!Array.isArray(bindings)) {
            return [];
        }

        return bindings
            .map((binding, index) => ({
                id: typeof binding?.id === 'string' && binding.id.trim()
                    ? binding.id.trim()
                    : createAiWorldBookInfoBindingId(index),
                sourceId: typeof binding?.sourceId === 'string'
                    ? binding.sourceId.trim()
                    : '',
                sourceName: typeof binding?.sourceName === 'string'
                    ? binding.sourceName.trim().slice(0, 48)
                    : '',
                sourceScope: typeof binding?.sourceScope === 'string'
                    ? binding.sourceScope.trim().slice(0, 24)
                    : '',
            }))
            .filter((binding) => binding.sourceId || binding.sourceName)
            .slice(0, 50);
    }

    function normalizeAiWorldBookEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries
            .map((entry, index) => ({
                id: typeof entry?.id === 'string' && entry.id.trim()
                    ? entry.id.trim()
                    : createAiWorldBookSelectionId(index),
                sourceId: typeof entry?.sourceId === 'string'
                    ? entry.sourceId.trim()
                    : '',
                name: typeof entry?.name === 'string' && entry.name.trim()
                    ? entry.name.trim().slice(0, 32)
                    : `世界书 ${index + 1}`,
                scope: typeof entry?.scope === 'string' && entry.scope.trim()
                    ? entry.scope.trim().slice(0, 24)
                    : 'global',
                ownerId: typeof entry?.ownerId === 'string'
                    ? entry.ownerId.trim().slice(0, 80)
                    : '',
                mainChatContextN: entry?.mainChatContextN == null
                    ? '10'
                    : clampAiIntegerSetting(entry.mainChatContextN, 0, 99, ''),
                mainChatUserN: entry?.mainChatUserN === '' || entry?.mainChatUserN == null
                    ? ''
                    : clampAiIntegerSetting(entry.mainChatUserN, 0, 99, ''),
                mainChatXmlRules: normalizeAiMainChatRules(entry?.mainChatXmlRules),
                infoSourceBindings: normalizeAiWorldBookInfoBindings(entry?.infoSourceBindings),
            }))
            .slice(0, 100);
    }

    function getAiWorldBookScopeLabel(scope = '') {
        const normalizedScope = String(scope || '').trim();
        if (normalizedScope === 'chat') return '聊天绑定';
        if (normalizedScope === 'character') return '角色绑定';
        return '全局世界书';
    }


    function normalizeAiSettings(settings) {
        const nextSettings = settings && typeof settings === 'object' ? settings : {};
        const normalizedSettings = { ...DEFAULT_SETTINGS, ...nextSettings };
        const apiProfiles = normalizeAiApiProfiles(nextSettings.apiProfiles, nextSettings);
        const initialBindings = normalizeAiApiBindings(nextSettings.apiBindings, apiProfiles, nextSettings.selectedApiProfileId);
        const selectedApiProfileId = resolveSelectedAiApiProfileId(nextSettings.selectedApiProfileId, apiProfiles, initialBindings);
        const apiBindings = normalizeAiApiBindings(nextSettings.apiBindings, apiProfiles, selectedApiProfileId);
        const selectedApiProfile = getAiProfileById(selectedApiProfileId, { apiProfiles, selectedApiProfileId, apiBindings }) || null;

        const presetEntries = normalizeAiPresetEntries(nextSettings.presetEntries);
        const selectedPresetId = resolveSelectedAiPresetId(nextSettings.selectedPresetId, presetEntries);
        const qqChatPresetId = resolveSelectedAiPresetId(nextSettings.qqChatPresetId || selectedPresetId, presetEntries);
        const qqSummaryPresetId = resolveSelectedAiPresetId(nextSettings.qqSummaryPresetId || selectedPresetId, presetEntries);
        const qqQzonePresetId = resolveSelectedAiPresetId(nextSettings.qqQzonePresetId || selectedPresetId, presetEntries);
        const aiRuntimePolicy = normalizeAiRuntimePolicy(nextSettings.aiRuntimePolicy);

        normalizedSettings.apiProfiles = apiProfiles;
        normalizedSettings.apiBindings = apiBindings;
        normalizedSettings.selectedApiProfileId = selectedApiProfileId;
        normalizedSettings.presetEntries = presetEntries;
        normalizedSettings.selectedPresetId = selectedPresetId;
        normalizedSettings.qqChatPresetId = qqChatPresetId;
        normalizedSettings.qqSummaryPresetId = qqSummaryPresetId;
        normalizedSettings.qqQzonePresetId = qqQzonePresetId;
        normalizedSettings.aiRuntimePolicy = aiRuntimePolicy;
        normalizedSettings.mainChatContextN = nextSettings.mainChatContextN == null
            ? '10'
            : clampAiIntegerSetting(nextSettings.mainChatContextN, 0, 99, '');
        normalizedSettings.mainChatUserN = nextSettings.mainChatUserN === '' || nextSettings.mainChatUserN == null
            ? ''
            : clampAiIntegerSetting(nextSettings.mainChatUserN, 0, 99, '');
        normalizedSettings.mainChatXmlRules = normalizeAiMainChatRules(nextSettings.mainChatXmlRules);
        normalizedSettings.worldBookEntries = normalizeAiWorldBookEntries(nextSettings.worldBookEntries);
        normalizedSettings.kingfallEnabled = nextSettings.kingfallEnabled === true;
        normalizedSettings.kingfallProcessingPlaceholderText = typeof nextSettings.kingfallProcessingPlaceholderText === 'string'
            ? nextSettings.kingfallProcessingPlaceholderText.slice(0, 80)
            : '泰罗顶跨中~';
        normalizedSettings.kingfallSendButtonMedia = nextSettings.kingfallSendButtonMedia && typeof nextSettings.kingfallSendButtonMedia === 'object'
            ? {
                id: typeof nextSettings.kingfallSendButtonMedia.id === 'string' ? nextSettings.kingfallSendButtonMedia.id.slice(0, 80) : '',
                name: typeof nextSettings.kingfallSendButtonMedia.name === 'string' ? nextSettings.kingfallSendButtonMedia.name.slice(0, 120) : '',
                type: typeof nextSettings.kingfallSendButtonMedia.type === 'string' ? nextSettings.kingfallSendButtonMedia.type.slice(0, 80) : '',
                mimeType: typeof nextSettings.kingfallSendButtonMedia.mimeType === 'string' ? nextSettings.kingfallSendButtonMedia.mimeType.slice(0, 120) : '',
                size: Number.isFinite(Number(nextSettings.kingfallSendButtonMedia.size)) ? Number(nextSettings.kingfallSendButtonMedia.size) : 0,
            }
            : null;
        normalizedSettings.resultDesignTree = Array.isArray(nextSettings.resultDesignTree)
            ? nextSettings.resultDesignTree.map((parentNode, parentIndex) => ({
                id: typeof parentNode?.id === 'string' && parentNode.id.trim()
                    ? parentNode.id.trim().slice(0, 80)
                    : `result_parent_${parentIndex + 1}`,
                name: typeof parentNode?.name === 'string' ? parentNode.name.trim().slice(0, 40) : '',
                description: typeof parentNode?.description === 'string' ? parentNode.description.trim().slice(0, 200) : '',
                children: Array.isArray(parentNode?.children)
                    ? parentNode.children.map((childNode, childIndex) => ({
                        id: typeof childNode?.id === 'string' && childNode.id.trim()
                            ? childNode.id.trim().slice(0, 80)
                            : `result_child_${parentIndex + 1}_${childIndex + 1}`,
                        name: typeof childNode?.name === 'string' ? childNode.name.trim().slice(0, 40) : '',
                        description: typeof childNode?.description === 'string' ? childNode.description.trim().slice(0, 200) : '',
                        value: typeof childNode?.value === 'string' ? childNode.value.slice(0, 20000) : '',
                    }))
                    : [],
            }))
            : [];
        normalizedSettings.url = selectedApiProfile?.url || '';
        normalizedSettings.key = selectedApiProfile?.key || '';
        normalizedSettings.model = selectedApiProfile?.model || '';
        normalizedSettings.temperature = selectedApiProfile?.temperature || '';
        normalizedSettings.topP = selectedApiProfile?.topP || '';
        normalizedSettings.modelCache = normalizeAiModelCache(selectedApiProfile?.modelCache);

        return normalizedSettings;
    }

    function persistAiSettingsToLocalStorage(settings) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAiSettings(settings)));
        } catch (error) {
            // 本地文件场景下可能被禁用，忽略即可。
        }
    }

    function getStoredAiSettings() {
        try {
            return normalizeAiSettings(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
        } catch (error) {
            return normalizeAiSettings(DEFAULT_SETTINGS);
        }
    }

    function notifyAiSettingsChange() {
        settingsListeners.slice().forEach((listener) => {
            try {
                listener(state.settings);
            } catch (error) {
                console.error('[网络连接/API配置] 设置变更监听执行失败', error);
            }
        });
    }

    function setAiSettings(nextSettings, { silent = false } = {}) {
        state.settings = normalizeAiSettings(nextSettings);
        networkData.currentAiSettings = state.settings;
        persistAiSettingsToLocalStorage(state.settings);
        if (!silent) {
            notifyAiSettingsChange();
        }
        return state.settings;
    }

    function ensureSettingsLoaded() {
        if (!state.settings) {
            state.settings = getStoredAiSettings();
            networkData.currentAiSettings = state.settings;
            setPendingAiSettings(state.settings);
        }

        return state.settings;
    }

    function subscribeAiSettings(listener) {
        if (typeof listener !== 'function') {
            return function noop() {};
        }

        settingsListeners.push(listener);
        return function unsubscribeAiSettings() {
            const index = settingsListeners.indexOf(listener);
            if (index >= 0) {
                settingsListeners.splice(index, 1);
            }
        };
    }

    function setStatusMessage(message = '', tone = 'neutral') {
        state.aiConfigStatusMessage = String(message || '').trim();
        state.aiConfigStatusTone = tone;
    }

    function setPendingAiSettings(settings = ensureSettingsLoaded()) {
        const nextSettings = normalizeAiSettings(settings);
        const selectedProfile = getSelectedAiApiProfile(nextSettings);

        state.settings = nextSettings;
        networkData.currentAiSettings = nextSettings;
        state.pendingAiApiProfileId = selectedProfile?.id || '';
        state.pendingAiApiName = selectedProfile?.name || getNextAiApiProfileName(nextSettings);
        state.pendingAiUrl = selectedProfile?.url || '';
        state.pendingAiKey = selectedProfile?.key || '';
        state.pendingAiModel = selectedProfile?.model || '';
        state.pendingAiTemperature = selectedProfile?.temperature || '';
        state.pendingAiTopP = selectedProfile?.topP || '';
        state.pendingAiRequestStreamMode = normalizeAiApiRequestStreamMode(selectedProfile?.requestStreamMode || 'auto');
        state.pendingAiProfileRuntimePolicy = normalizeAiRuntimePolicyOverrides(selectedProfile?.runtimePolicyOverrides);
        state.pendingAiRuntimePolicy = normalizeAiRuntimePolicy(nextSettings.aiRuntimePolicy);
        state.selectedAiModelIndex = -1;
        syncAiConfigConnectionState(nextSettings);
        return nextSettings;
    }

    function syncAiConfigConnectionState(settings = ensureSettingsLoaded()) {
        const selectedProfile = getSelectedAiApiProfile(settings);
        state.aiConfigConnectionState = Array.isArray(selectedProfile?.modelCache) && selectedProfile.modelCache.length
            ? 'success'
            : 'idle';
    }

    function buildPendingAiApiProfile(currentSettings = ensureSettingsLoaded(), overrides = {}) {
        const settings = currentSettings && Array.isArray(currentSettings.apiProfiles)
            ? currentSettings
            : normalizeAiSettings(currentSettings);
        const currentProfile = getAiProfileById(state.pendingAiApiProfileId || settings.selectedApiProfileId, settings);

        return normalizeAiApiProfile({
            ...currentProfile,
            ...overrides,
            id: overrides.id ?? state.pendingAiApiProfileId ?? currentProfile?.id,
            name: overrides.name ?? state.pendingAiApiName,
            url: overrides.url ?? state.pendingAiUrl,
            key: overrides.key ?? state.pendingAiKey,
            model: overrides.model ?? state.pendingAiModel,
            temperature: overrides.temperature ?? state.pendingAiTemperature,
            topP: overrides.topP ?? state.pendingAiTopP,
            requestStreamMode: overrides.requestStreamMode ?? state.pendingAiRequestStreamMode,
            runtimePolicyOverrides: overrides.runtimePolicyOverrides ?? state.pendingAiProfileRuntimePolicy,
            modelCache: overrides.modelCache ?? currentProfile?.modelCache ?? [],
        }, Array.isArray(settings.apiProfiles) ? settings.apiProfiles.length : 0);
    }

    function saveAiRuntimePolicy(policyOverrides = {}) {
        const currentSettings = ensureSettingsLoaded();
        const nextPolicy = normalizeAiRuntimePolicy({
            ...state.pendingAiRuntimePolicy,
            ...policyOverrides,
        });
        const nextSettings = setAiSettings({
            ...currentSettings,
            aiRuntimePolicy: nextPolicy,
        }, { silent: true });

        state.pendingAiRuntimePolicy = normalizeAiRuntimePolicy(nextSettings.aiRuntimePolicy);
        return nextSettings;
    }

    function saveAiProfileRuntimePolicy(policyOverrides = {}) {
        const nextPolicyOverrides = normalizeAiRuntimePolicyOverrides({
            ...state.pendingAiProfileRuntimePolicy,
            ...policyOverrides,
        });
        const nextSettings = saveAiSettings({
            runtimePolicyOverrides: nextPolicyOverrides,
        });
        state.pendingAiProfileRuntimePolicy = normalizeAiRuntimePolicyOverrides(
            getSelectedAiApiProfile(nextSettings)?.runtimePolicyOverrides
        );
        return nextSettings;
    }

    function saveAiSettings(overrides = {}) {
        const currentSettings = ensureSettingsLoaded();
        const editingProfileId = typeof (overrides.id ?? state.pendingAiApiProfileId ?? currentSettings.selectedApiProfileId) === 'string'
            ? (overrides.id ?? state.pendingAiApiProfileId ?? currentSettings.selectedApiProfileId).trim()
            : '';
        const currentProfile = getAiProfileById(editingProfileId, currentSettings);
        const nextProfile = buildPendingAiApiProfile(currentSettings, overrides);
        const nextProfiles = currentSettings.apiProfiles.filter((profile) => profile.id !== currentProfile?.id);
        const nextUrl = nextProfile.url;
        const nextKey = nextProfile.key;
        const preservedModelCache = currentProfile && currentProfile.url === nextUrl && currentProfile.key === nextKey
            ? currentProfile.modelCache
            : [];
        const finalizedProfile = normalizeAiApiProfile({
            ...nextProfile,
            modelCache: overrides.modelCache ?? preservedModelCache,
        }, nextProfiles.length);

        if (isAiApiProfileMeaningful(finalizedProfile)) {
            nextProfiles.push(finalizedProfile);
        }

        const nextSettings = setAiSettings({
            ...currentSettings,
            apiProfiles: nextProfiles,
            apiBindings: currentSettings.apiBindings,
            selectedApiProfileId: isAiApiProfileMeaningful(finalizedProfile)
                ? finalizedProfile.id
                : currentSettings.selectedApiProfileId,
        }, { silent: true });

        setPendingAiSettings(nextSettings);
        return nextSettings;
    }

    function selectAiApiProfile(profileId, { openEditor = false, persist = true } = {}) {
        const currentSettings = ensureSettingsLoaded();
        const selectedProfile = getAiProfileById(profileId, currentSettings);

        if (!selectedProfile) {
            return;
        }

        const nextSettings = normalizeAiSettings({
            ...currentSettings,
            selectedApiProfileId: selectedProfile.id,
        });

        if (persist) {
            setAiSettings(nextSettings, { silent: true });
        } else {
            state.settings = nextSettings;
            networkData.currentAiSettings = nextSettings;
        }

        setPendingAiSettings(nextSettings);
        syncAiConfigConnectionState(nextSettings);

        if (openEditor) {
            state.view = 'editor';
            setStatusMessage('', 'neutral');
        } else if (persist) {
            setStatusMessage(`已选中 ${selectedProfile.name || '默认'}`, 'success');
        }

        render();
    }

    function openAiConfigList() {
        ensureSettingsLoaded();
        state.view = DEFAULT_PAGE_VIEW;
        setStatusMessage('', 'neutral');
        render();
    }

    function openNewAiApiProfileDraft() {
        ensureSettingsLoaded();
        state.pendingAiApiProfileId = '';
        state.pendingAiApiName = '';
        state.pendingAiUrl = '';
        state.pendingAiKey = '';
        state.pendingAiModel = '';
        state.pendingAiTemperature = '';
        state.pendingAiTopP = '';
        state.pendingAiRequestStreamMode = 'auto';
        state.pendingAiProfileRuntimePolicy = { ...AI_RUNTIME_POLICY_OVERRIDE_DEFAULTS };
        state.selectedAiModelIndex = -1;
        state.aiConfigConnectionState = 'idle';
        state.view = 'editor';
        setStatusMessage('', 'neutral');
        render();
    }

    function openAiConfigEditor(profileId = ensureSettingsLoaded().selectedApiProfileId || '') {
        if (profileId) {
            selectAiApiProfile(profileId, { openEditor: true, persist: true });
            return;
        }

        openNewAiApiProfileDraft();
    }

    function deleteAiApiProfile(profileId) {
        const currentSettings = ensureSettingsLoaded();
        const nextProfiles = currentSettings.apiProfiles.filter((profile) => profile.id !== profileId);

        if (nextProfiles.length === currentSettings.apiProfiles.length) {
            return;
        }

        const nextSettings = setAiSettings({
            ...currentSettings,
            apiProfiles: nextProfiles,
            selectedApiProfileId: currentSettings.selectedApiProfileId === profileId ? '' : currentSettings.selectedApiProfileId,
        }, { silent: true });

        setPendingAiSettings(nextSettings);
        state.view = DEFAULT_PAGE_VIEW;
        setStatusMessage(nextProfiles.length ? '已删除API' : 'API列表已清空', 'success');
        render();
    }

    function getCurrentModelCache() {
        const selectedProfile = getSelectedAiApiProfile(ensureSettingsLoaded());
        return Array.isArray(selectedProfile?.modelCache) ? selectedProfile.modelCache : [];
    }

    function hasFetchedAiModels() {
        return state.aiConfigConnectionState === 'success' && getCurrentModelCache().length > 0;
    }

    function openAiModelList() {
        if (!hasFetchedAiModels()) {
            openAiModelEditor();
            return;
        }

        const modelCache = getCurrentModelCache();
        const currentModel = state.pendingAiModel || getSelectedAiApiProfile(ensureSettingsLoaded())?.model || '';
        state.selectedAiModelIndex = modelCache.length
            ? Math.max(0, modelCache.indexOf(currentModel) >= 0 ? modelCache.indexOf(currentModel) : 0)
            : -1;
        state.view = 'modelList';
        render();
    }

    function openAiModelEditor() {
        state.view = 'modelEditor';
        render();
    }

    function closeAiModelView() {
        state.view = 'editor';
        render();
    }

    function openAiParamConfig() {
        state.view = 'paramConfig';
        render();
    }

    function closeAiParamConfig() {
        state.view = 'editor';
        render();
    }

    function saveProfileRuntimePolicy() {
        saveAiProfileRuntimePolicy();
        syncAiConfigConnectionState();
        state.view = 'editor';
        setStatusMessage('已保存当前 API 运行策略', 'success');
        render();
    }

    function applySelectedAiModel() {
        const modelCache = getCurrentModelCache();
        const selectedModel = modelCache[state.selectedAiModelIndex] || '';

        if (!selectedModel) {
            setStatusMessage('请先选择一个模型', 'error');
            render();
            return;
        }

        state.pendingAiModel = selectedModel;
        saveAiSettings({ model: selectedModel });
        syncAiConfigConnectionState();
        state.view = 'editor';
        setStatusMessage('已保存', 'success');
        render();
    }

    function saveManualModel() {
        saveAiSettings({ model: state.pendingAiModel });
        syncAiConfigConnectionState();
        state.view = 'editor';
        setStatusMessage('已保存', 'success');
        render();
    }

    function saveParameters() {
        saveAiSettings();
        syncAiConfigConnectionState();
        state.view = 'editor';
        setStatusMessage('已保存', 'success');
        render();
    }

    function saveProfile() {
        saveAiSettings();
        syncAiConfigConnectionState();
        setStatusMessage('已保存', 'success');
        render();
    }

    async function connectAiProfile() {
        if (state.isConnecting) {
            return false;
        }

        const modelsEndpoint = getAiModelsEndpoint(state.pendingAiUrl);
        const apiKey = String(state.pendingAiKey || '').trim();

        if (!modelsEndpoint) {
            state.aiConfigConnectionState = 'error';
            setStatusMessage('连接失败(查看控制台)', 'error');
            console.error('[网络连接/API配置] 请先填写自定义端点');
            render();
            return false;
        }

        if (!apiKey) {
            state.aiConfigConnectionState = 'error';
            setStatusMessage('连接失败(查看控制台)', 'error');
            console.error('[网络连接/API配置] 请先填写 API Key');
            render();
            return false;
        }

        state.isConnecting = true;
        state.aiConfigConnectionState = 'idle';
        setStatusMessage('正在拉取模型…', 'loading');
        render();

        let didConnectSucceed = false;

        try {
            const response = await fetch(modelsEndpoint, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data?.error?.message || `拉取失败 (${response.status})`);
            }

            const models = Array.isArray(data?.data)
                ? data.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
                : [];

            if (!models.length) {
                throw new Error('未获取到模型列表');
            }

            const nextModel = state.pendingAiModel && models.includes(state.pendingAiModel)
                ? state.pendingAiModel
                : models[0];

            saveAiSettings({
                model: nextModel,
                modelCache: models,
            });

            state.pendingAiModel = nextModel;
            state.aiConfigConnectionState = 'success';
            setStatusMessage('连接成功', 'success');
            state.view = 'editor';
            didConnectSucceed = true;
        } catch (error) {
            state.aiConfigConnectionState = 'error';
            setStatusMessage('连接失败(查看控制台)', 'error');
            console.error('[网络连接/API配置] 模型拉取失败', error);
        } finally {
            state.isConnecting = false;
            render();
        }

        return didConnectSucceed;
    }

    function getParameterSummary() {
        const parts = [];
        const temperature = String(state.pendingAiTemperature || '').trim();
        const topP = String(state.pendingAiTopP || '').trim();

        if (temperature) {
            parts.push(`Temp ${temperature}`);
        }

        if (topP) {
            parts.push(`Top P ${topP}`);
        }

        return parts.length ? parts.join(' / ') : '默认';
    }

    function getRuntimePolicySummary(policy = state.pendingAiRuntimePolicy) {
        const runtimePolicy = normalizeAiRuntimePolicy(policy);
        const streamLabel = runtimePolicy.streamEnabled ? '流式开' : '流式关';
        const dispatchLabel = runtimePolicy.responseDispatchMode === 'stream' ? '窗口实时接收' : '完成后投递';
        const typingLabel = runtimePolicy.showTypingIndicator ? '显示输入中' : '不显示输入中';
        const queueLabel = runtimePolicy.targetQueueMode === 'parallel' ? '并行' : '串行';
        return `${streamLabel} / ${dispatchLabel} / ${typingLabel} / ${queueLabel}`;
    }

    function getRuntimePolicyOverrideSummary(policyOverrides = state.pendingAiProfileRuntimePolicy, globalPolicy = state.pendingAiRuntimePolicy) {
        const overrides = normalizeAiRuntimePolicyOverrides(policyOverrides);
        const mergedPolicy = resolveAiRuntimePolicy(globalPolicy, overrides);
        if (!hasAiRuntimePolicyOverrides(overrides)) {
            return `跟随全局：${getRuntimePolicySummary(globalPolicy)}`;
        }
        return `单独覆盖：${getRuntimePolicySummary(mergedPolicy)}`;
    }

    function renderRuntimePolicyForm(runtimePolicy, fieldAttributeName = 'data-runtime-field') {
        return `
            <div class="network-api__card network-api__card--form">
                <div class="network-api__section-head">
                    <strong>全局 AI 运行策略</strong>
                    <span>对所有使用“网络连接/API配置”的应用统一生效</span>
                </div>
                <div class="network-api__form">
                    <label class="network-api__toggle-row">
                        <span class="network-api__toggle-copy">
                            <strong>启用流式生成</strong>
                            <small>控制运行时是否启用流式处理；请求层强制流式请在 API 档案里设置。</small>
                        </span>
                        <input ${fieldAttributeName}="streamEnabled" type="checkbox" ${runtimePolicy.streamEnabled ? 'checked' :''}>
                    </label>
                    <label class="network-api__field-group">
                        <span class="network-api__field-label">窗口接收时机</span>
                        <select class="xp-input network-api__input" ${fieldAttributeName}="responseDispatchMode">
                            <option value="final" ${runtimePolicy.responseDispatchMode === 'final' ? 'selected' : ''}>等待 AI 完成后再一次性投递</option>
                            <option value="stream" ${runtimePolicy.responseDispatchMode === 'stream' ? 'selected' : ''}>边生成边投递到窗口</option>
                        </select>
                    </label>
                    <label class="network-api__toggle-row">
                        <span class="network-api__toggle-copy">
                            <strong>显示“正在输入”状态</strong>
                            <small>当窗口暂缓接收正文时，可用统一的 typing 状态提示用户。</small>
                        </span>
                        <input ${fieldAttributeName}="showTypingIndicator" type="checkbox" ${runtimePolicy.showTypingIndicator ? 'checked' : ''}>
                    </label>
                    <label class="network-api__field-group">
                        <span class="network-api__field-label">同目标请求队列</span>
                        <select class="xp-input network-api__input" ${fieldAttributeName}="targetQueueMode">
                            <option value="serial" ${runtimePolicy.targetQueueMode === 'serial' ? 'selected' : ''}>串行：同一窗口一个完成后再处理下一个</option>
                            <option value="parallel" ${runtimePolicy.targetQueueMode === 'parallel' ? 'selected' : ''}>并行：允许同一窗口同时发起多个请求</option>
                        </select>
                    </label>
                </div>
            </div>
        `;
    }

    function renderRuntimePolicyView() {
        const runtimePolicy = normalizeAiRuntimePolicy(state.pendingAiRuntimePolicy);
        return `
            <div class="network-api__scroll-pane">
                ${renderRuntimePolicyForm(runtimePolicy)}
            </div>
        `;
    }

    function renderProfilePolicyCheckboxRow(label, hint, fieldName, overrideValue, globalValue) {
        var isOverridden = typeof overrideValue === 'boolean';
        var effectiveValue = isOverridden ? overrideValue : globalValue;
        var statusText = isOverridden ? '已覆盖' : '跟随全局';
        var hintParts = [];
        if (hint) { hintParts.push(hint); }
        hintParts.push(statusText);
        var hintHtml = '<span class="runtime-policy__row-hint">' + escapeHtml(hintParts.join(' · ')) + '</span>';
        return '<div class="runtime-policy__row">'
            + '<div class="runtime-policy__row-text">'
            + '<span class="runtime-policy__row-label">' + escapeHtml(label) + '</span>'
            + hintHtml
            + '</div>'
            + '<div class="runtime-policy__row-control">'
            + '<input data-profile-runtime-field="' + escapeHtml(fieldName) + '" type="checkbox"' + (effectiveValue ? ' checked' : '') + '>'
            + '</div>'
            + '</div>';
    }

    function renderProfilePolicySelectRow(label, hint, fieldName, selectOptionsHtml) {
        var hintHtml = hint ? '<span class="runtime-policy__row-hint">' + escapeHtml(hint) + '</span>' : '';
        return '<div class="runtime-policy__row">'
            + '<div class="runtime-policy__row-text">'
            + '<span class="runtime-policy__row-label">' + escapeHtml(label) + '</span>'
            + hintHtml
            + '</div>'
            + '<div class="runtime-policy__row-control">'
            + '<select class="xp-input runtime-policy__select" data-profile-runtime-field="' + escapeHtml(fieldName) + '">'
            + selectOptionsHtml
            + '</select>'
            + '</div>'
            + '</div>';
    }


    function renderProfileRuntimePolicyView() {
        const overrides = normalizeAiRuntimePolicyOverrides(state.pendingAiProfileRuntimePolicy);
        const gp = normalizeAiRuntimePolicy(state.pendingAiRuntimePolicy);
        const requestStreamMode = normalizeAiApiRequestStreamMode(state.pendingAiRequestStreamMode);

        const rows = [
            renderProfilePolicySelectRow(
                '请求流式模式',
                'auto：由运行策略决定；alwaysOn：始终以 stream:true 请求接口',
                'requestStreamMode',
                '<option value="auto"' + (requestStreamMode === 'auto' ? ' selected' : '') + '>自动 (auto)</option>'
                + '<option value="alwaysOn"' + (requestStreamMode === 'alwaysOn' ? ' selected' : '') + '>强制流式 (alwaysOn)</option>'
            ),
            renderProfilePolicyCheckboxRow(
                '流式输出',
                '',
                'streamEnabled',
                overrides.streamEnabled,
                gp.streamEnabled
            ),
            renderProfilePolicySelectRow(
                '响应派发模式',
                'final：生成完毕后一次性投递；stream：逐 token 实时投递',
                'responseDispatchMode',
                '<option value=""' + (!overrides.responseDispatchMode ? ' selected' : '') + '>跟随全局（' + escapeHtml(gp.responseDispatchMode === 'stream' ? '实时投递' : '完成后投递') + '）</option>'
                + '<option value="final"' + (overrides.responseDispatchMode === 'final' ? ' selected' : '') + '>完成后投递 (final)</option>'
                + '<option value="stream"' + (overrides.responseDispatchMode === 'stream' ? ' selected' : '') + '>实时投递 (stream)</option>'
            ),
            renderProfilePolicyCheckboxRow(
                'Typing 状态提示',
                '',
                'showTypingIndicator',
                overrides.showTypingIndicator,
                gp.showTypingIndicator
            ),
            renderProfilePolicySelectRow(
                '请求队列模式',
                '串行：前一个完成后再发下一个；并行：允许同时发起多个',
                'targetQueueMode',
                '<option value=""' + (!overrides.targetQueueMode ? ' selected' : '') + '>跟随全局（' + escapeHtml(gp.targetQueueMode === 'parallel' ? '并行' : '串行') + '）</option>'
                + '<option value="serial"' + (overrides.targetQueueMode === 'serial' ? ' selected' : '') + '>串行</option>'
                + '<option value="parallel"' + (overrides.targetQueueMode === 'parallel' ? ' selected' : '') + '>并行</option>'
            ),
        ];

        return `
            <div class="network-api__scroll-pane">
                <div class="runtime-policy__list">
                    ${rows.join('')}
                </div>
            </div>
        `;
    }



    function getHeaderConfig() {
        const modelCache = getCurrentModelCache();

        if (state.view === 'modelList') {
            return {
                title: '模型列表',
                subtitle: '连接成功后可从这里选择已缓存模型',
                actions: [
                    { action: 'open-model-editor', label: '手动输入', tone: 'secondary' },
                    { action: 'apply-model', label: '应用所选', tone: 'primary', disabled: !modelCache.length },
                    { action: 'back-to-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'modelEditor') {
            return {
                title: '手动输入模型',
                subtitle: '可直接填写模型名称并保存到当前 API',
                actions: [
                    { action: 'save-manual-model', label: '保存模型', tone: 'primary' },
                    { action: 'back-to-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'paramConfig') {
            return {
                title: '参数配置',
                subtitle: '仅支持 Temperature / Top P',
                actions: [
                    { action: 'save-params', label: '保存参数', tone: 'primary' },
                    { action: 'back-to-editor', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'profileRuntimePolicy') {
            return {
                title: '当前 API 运行策略',
                subtitle: '仅覆盖当前 API，未设置时继承全局',
                actions: [
                    { action: 'back-to-editor', label: '返回', tone: 'ghost' },
           ],
            };
        }

        if (state.view === 'editor') {
            return {
                title: state.pendingAiApiProfileId
                    ? (state.pendingAiApiName || '未命名API')
                    : '新建API',
                subtitle: '编辑当前 API 的基础连接信息',
                actions: [
                    { action: 'connect', label: state.isConnecting ? '连接中...' : '连接', tone: 'secondary', disabled: state.isConnecting },
                    { action: 'save-profile', label: '保存', tone: 'primary', disabled: state.isConnecting },
                    { action: 'back-to-list', label: '返回', tone: 'ghost', disabled: state.isConnecting },
                ],
            };
        }

        return {
            title: 'API 列表',
            subtitle: '管理可复用的 API 连接',
            actions: [
                { action: 'create-profile', label: '新建API', tone: 'primary' },
            ],
        };
    }

    function renderActionButtons(actions) {
        return actions.map((actionConfig) => `
            <button
                class="xp-button xp-button--${escapeHtml(actionConfig.tone || 'secondary')} network-api__button network-api__button--${escapeHtml(actionConfig.tone || 'secondary')}"
                type="button"
                data-api-action="${escapeHtml(actionConfig.action)}"
                ${actionConfig.disabled ? 'disabled' : ''}
            >${escapeHtml(actionConfig.label)}</button>
        `).join('');
    }

    function renderStatusText() {
        if (!state.aiConfigStatusMessage) {
            return '';
        }

        const toneClass = ` is-${escapeHtml(state.aiConfigStatusTone || 'neutral')}`;
        return `<p class="network-api__status${toneClass}">${escapeHtml(state.aiConfigStatusMessage)}</p>`;
    }

    function renderProfileList() {
        const settings = ensureSettingsLoaded();
        const profiles = Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
        const selectedProfileId = settings.selectedApiProfileId || '';

        if (!profiles.length) {
            return `
                <div class="network-api__empty">
                    <strong>暂无已保存 API</strong>
                </div>
            `;
        }

        return `
            <div class="network-api__list" id="networkApiProfileList">
                ${profiles.map((profile) => {
                    const subtitle = profile.model || '未设模型';
                    const badgeHtml = selectedProfileId === profile.id
                        ? '<span class="network-api__profile-badge">当前</span>'
                        : '';

                    return `
                        <div class="xp-list-item network-api__profile ${selectedProfileId === profile.id ? 'is-selected' : ''}" data-ai-api-profile-id="${escapeHtml(profile.id)}">
                            <div class="network-api__profile-main">
                                <div class="network-api__profile-head">
                                    <span class="network-api__profile-name">${escapeHtml(profile.name || '默认')}</span>
                                    ${badgeHtml}
                                </div>
                                <span class="network-api__profile-subtitle">${escapeHtml(subtitle)}</span>
                            </div>
                            <button class="xp-button xp-button--icon xp-button--danger network-api__delete-button" type="button" data-api-action="delete-profile" data-ai-api-profile-id="${escapeHtml(profile.id)}">×</button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderEditorView() {
        const selectedProfile = getSelectedAiApiProfile(ensureSettingsLoaded());
        const modelCache = getCurrentModelCache();
        const requestStreamMode = normalizeAiApiRequestStreamMode(state.pendingAiRequestStreamMode || selectedProfile?.requestStreamMode || 'auto');
        const requestStreamModeLabel = requestStreamMode === 'alwaysOn' ? '强制流式' : '自动';
        const modelRowStateClass = state.isConnecting
            ? ' is-loading'
            : state.aiConfigConnectionState === 'success'
                ? ' is-ready'
                : state.aiConfigConnectionState === 'error'
                    ? ' is-error'
                    : '';

        return `
            <div class="network-api__scroll-pane">
                <div class="network-api__card network-api__card--form">
                    <div class="network-api__form">
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">名称</span>
                            <input class="xp-input network-api__input" data-api-field="name" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(state.pendingAiApiName)}" placeholder="默认">
                        </label>
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">端点</span>
                            <input class="xp-input network-api__input" data-api-field="url" type="text" spellcheck="false" value="${escapeHtml(state.pendingAiUrl)}" placeholder="自定义端点">
                        </label>
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">API Key</span>
                            <input class="xp-input network-api__input" data-api-field="key" type="password" spellcheck="false" value="${escapeHtml(state.pendingAiKey)}" placeholder="API Key">
                        </label>
                    </div>
                </div>


                <div class="network-api__rows">
                    <button class="xp-list-row network-api__row${modelRowStateClass}" type="button" data-api-action="open-model-view">
                        <span class="network-api__row-label">模型</span>
                        <span class="network-api__row-value-wrap">
                            <span class="network-api__row-value">${escapeHtml(state.pendingAiModel || '未设')}</span>
                            <span class="network-api__row-badge">${escapeHtml(selectedProfile?.modelCache?.length ? '可选' : '手动')}</span>
                            <span class="network-api__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-api__row" type="button" data-api-action="open-params-view">
                        <span class="network-api__row-label">参数配置</span>
                        <span class="network-api__row-value-wrap">
                            <span class="network-api__row-value">${escapeHtml(getParameterSummary())}</span>
                            <span class="network-api__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-api__row" type="button" data-api-action="open-profile-runtime-policy-view">
                        <span class="network-api__row-label">运行策略</span>
                        <span class="network-api__row-value-wrap">
                            <span class="network-api__row-value">${escapeHtml(getRuntimePolicyOverrideSummary())}</span>
                            <span class="network-api__row-arrow">›</span>
                        </span>
                    </button>
                </div>

            </div>
        `;
    }

    function renderModelListView() {
        const modelCache = getCurrentModelCache();

        if (!modelCache.length) {
            return `
                <div class="network-api__empty">
                    <strong>暂无模型列表</strong>
                </div>
            `;
        }

        return `
            <div class="network-api__list network-api__model-list" id="networkApiModelList">
                ${modelCache.map((model, index) => `
                    <div class="xp-list-item network-api__model-item ${state.selectedAiModelIndex === index ? 'is-selected' : ''}" data-ai-model-index="${index}">
                        <span class="network-api__model-name">${escapeHtml(model)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderModelEditorView() {
        return `
            <div class="network-api__scroll-pane">
                <div class="network-api__card network-api__card--form">
                    <div class="network-api__form">
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">模型</span>
                            <input class="xp-input network-api__input" data-api-field="model" type="text" maxlength="120" spellcheck="false" value="${escapeHtml(state.pendingAiModel)}" placeholder="模型名称">
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    function renderParamConfigView() {
        return `
            <div class="network-api__scroll-pane">
                <div class="network-api__card network-api__card--form">
                    <div class="network-api__form network-api__form--split">
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">Temperature</span>
                            <input class="xp-input network-api__input" data-api-field="temperature" type="number" min="0" max="2" step="0.1" inputmode="decimal" spellcheck="false" value="${escapeHtml(state.pendingAiTemperature)}" placeholder="0 - 2">
                        </label>
                        <label class="network-api__field-group">
                            <span class="network-api__field-label">Top P</span>
                            <input class="xp-input network-api__input" data-api-field="topP" type="number" min="0" max="1" step="0.1" inputmode="decimal" spellcheck="false" value="${escapeHtml(state.pendingAiTopP)}" placeholder="0 - 1">
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    function renderBody() {
        if (state.view === 'editor') {
            return renderEditorView();
        }

        if (state.view === 'modelList') {
            return renderModelListView();
        }

        if (state.view === 'modelEditor') {
            return renderModelEditorView();
        }

        if (state.view === 'paramConfig') {
            return renderParamConfigView();
        }

        if (state.view === 'profileRuntimePolicy') {
            return renderProfileRuntimePolicyView();
        }

        return renderProfileList();
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
        ensureSettingsLoaded();

        const headerConfig = getHeaderConfig();
        state.root.innerHTML = `
            <div class="network-api">
                <div class="network-api__main-panel">
                    <div class="network-api__header">
                        <div class="network-api__header-main">
                            <h2 class="network-api__title">${escapeHtml(headerConfig.title)}</h2>
                            ${renderStatusText()}
                        </div>
                    </div>
                    <div class="network-api__body">
                        ${renderBody()}
                    </div>
                </div>
                <div class="network-api__actions">
                    ${renderActionButtons(headerConfig.actions)}
                </div>
            </div>
        `;
        restoreRenderScrollState();
    }

    function handleActionClick(actionButton) {
        const action = actionButton.getAttribute('data-api-action') || '';

        switch (action) {
            case 'create-profile':
                openNewAiApiProfileDraft();
                break;
            case 'delete-profile':
                deleteAiApiProfile(actionButton.getAttribute('data-ai-api-profile-id') || '');
                break;
            case 'back-to-list':
                openAiConfigList();
                break;
            case 'connect':
                connectAiProfile();
                break;
            case 'save-profile':
                saveProfile();
                break;
            case 'open-model-view':
                openAiModelList();
                break;
            case 'open-params-view':
                openAiParamConfig();
                break;
            case 'open-profile-runtime-policy-view':
                state.view = 'profileRuntimePolicy';
                render();
                break;
            case 'open-model-editor':
                openAiModelEditor();
                break;
            case 'apply-model':
                applySelectedAiModel();
                break;
            case 'save-manual-model':
                saveManualModel();
                break;
            case 'save-params':
                saveParameters();
                break;
            case 'back-to-editor':
                if (state.view === 'paramConfig') {
                    closeAiParamConfig();
                } else {
                    closeAiModelView();
                }
                break;
            default:
                break;
        }
    }

    function handleRootClick(event) {
        const actionButton = event.target.closest('[data-api-action]');
        if (actionButton) {
            handleActionClick(actionButton);
            return;
        }

        const profileItem = event.target.closest('[data-ai-api-profile-id]');
        if (profileItem && state.view === 'list') {
            openAiConfigEditor(profileItem.getAttribute('data-ai-api-profile-id') || '');
            return;
        }

        const modelItem = event.target.closest('[data-ai-model-index]');
        if (modelItem && state.view === 'modelList') {
            state.selectedAiModelIndex = Number(modelItem.getAttribute('data-ai-model-index'));
            render();
        }
    }

    function handleRootInput(event) {
        const runtimeFieldName = event.target.getAttribute('data-runtime-field');
        if (runtimeFieldName) {
            const nextValue = event.target.type === 'checkbox'
                ? !!event.target.checked
                : event.target.value;
            state.pendingAiRuntimePolicy = normalizeAiRuntimePolicy({
                ...state.pendingAiRuntimePolicy,
                [runtimeFieldName]: nextValue,
            });
            return;
        }

        const profileRuntimeFieldName = event.target.getAttribute('data-profile-runtime-field');
        if (profileRuntimeFieldName) {
            if (profileRuntimeFieldName === 'requestStreamMode') {
                state.pendingAiRequestStreamMode = normalizeAiApiRequestStreamMode(event.target.value);
                return;
            }
            let nextValue = event.target.type === 'checkbox'
                ? !!event.target.checked
                : event.target.value;
            if (nextValue === 'true') {
                nextValue = true;
            } else if (nextValue === 'false') {
                nextValue = false;
            }
            state.pendingAiProfileRuntimePolicy = normalizeAiRuntimePolicyOverrides({
                ...state.pendingAiProfileRuntimePolicy,
                [profileRuntimeFieldName]: nextValue,
            });
            return;
        }

        const fieldName = event.target.getAttribute('data-api-field');
        if (!fieldName) {
            return;
        }

        const nextValue = event.target.value;

        if (fieldName === 'name') {
            state.pendingAiApiName = nextValue;
            return;
        }

        if (fieldName === 'url') {
            state.pendingAiUrl = nextValue;
            state.aiConfigConnectionState = 'idle';
            return;
        }

        if (fieldName === 'key') {
            state.pendingAiKey = nextValue;
            state.aiConfigConnectionState = 'idle';
            return;
        }

        if (fieldName === 'model') {
            state.pendingAiModel = nextValue;
            return;
        }

        if (fieldName === 'temperature') {
            state.pendingAiTemperature = nextValue;
            return;
        }

        if (fieldName === 'topP') {
            state.pendingAiTopP = nextValue;
            return;
        }

        if (fieldName === 'requestStreamMode') {
            state.pendingAiRequestStreamMode = normalizeAiApiRequestStreamMode(nextValue);
        }
    }

    function mount(panelElement) {
        state.root = panelElement;

        if (!state.isBound) {
            panelElement.addEventListener('click', handleRootClick);
            panelElement.addEventListener('input', handleRootInput);
            state.isBound = true;
        }

        ensureSettingsLoaded();
        render();
    }

    networkData.storageKey = STORAGE_KEY;
    networkData.aiRuntimePolicyDefaults = { ...AI_RUNTIME_POLICY_DEFAULTS };
    networkData.aiRuntimePolicyOverrideDefaults = { ...AI_RUNTIME_POLICY_OVERRIDE_DEFAULTS };
    networkData.normalizeAiRuntimePolicy = normalizeAiRuntimePolicy;
    networkData.normalizeAiRuntimePolicyOverrides = normalizeAiRuntimePolicyOverrides;
    networkData.resolveAiRuntimePolicy = resolveAiRuntimePolicy;
    networkData.normalizeAiSettings = normalizeAiSettings;
    networkData.getAiSettings = ensureSettingsLoaded;
    networkData.setAiSettings = setAiSettings;
    networkData.subscribeAiSettings = subscribeAiSettings;
    networkData.getAiProfileById = getAiProfileById;
    networkData.getSelectedAiApiProfile = getSelectedAiApiProfile;
    networkData.getAiBindingProfileId = getAiBindingProfileId;
    networkData.getAiBindingProfile = getAiBindingProfile;
    networkData.getAiBindingProfileName = getAiBindingProfileName;
    networkData.getAiRuntimePolicy = getAiRuntimePolicy;
    networkData.getAiRuntimeSettings = getAiRuntimeSettings;
    networkData.getKingfallProcessingPlaceholderText = function (settingsSource = state.settings) {
        const settings = settingsSource && typeof settingsSource === 'object'
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return typeof settings.kingfallProcessingPlaceholderText === 'string' && settings.kingfallProcessingPlaceholderText.trim()
            ? settings.kingfallProcessingPlaceholderText.trim()
            : '泰罗顶跨中~';
    };
    networkData.getKingfallSendButtonMediaMeta = function (settingsSource = state.settings) {
        const settings = settingsSource && typeof settingsSource === 'object'
            ? settingsSource
            : normalizeAiSettings(settingsSource);
        return settings.kingfallSendButtonMedia && typeof settings.kingfallSendButtonMedia === 'object'
            ? { ...settings.kingfallSendButtonMedia }
            : null;
    };
    networkData.getAiModelsEndpoint = getAiModelsEndpoint;
    networkData.getAiApiHostLabel = getAiApiHostLabel;
    networkData.getNextAiApiProfileName = getNextAiApiProfileName;
    networkData.normalizeAiPresetBlock = normalizeAiPresetBlock;
    networkData.normalizeAiPresetBlocks = normalizeAiPresetBlocks;
    networkData.normalizeAiPresetEntry = normalizeAiPresetEntry;
    networkData.normalizeAiPresetEntries = normalizeAiPresetEntries;
    networkData.resolveSelectedAiPresetId = resolveSelectedAiPresetId;
    networkData.getAiPresetById = getAiPresetById;
    networkData.getSelectedAiPresetEntry = getSelectedAiPresetEntry;
    networkData.getNextAiPresetName = getNextAiPresetName;
    networkData.normalizeAiWorldBookInfoBindings = normalizeAiWorldBookInfoBindings;
    networkData.normalizeAiWorldBookEntries = normalizeAiWorldBookEntries;
    networkData.getAiWorldBookScopeLabel = getAiWorldBookScopeLabel;

    networkApp.apiConfig = {
        mount,
        render,
        openAiConfigList,
        openAiConfigEditor,
        openNewAiApiProfileDraft,
        getState() {
            return { ...state };
        },
    };

    networkApp.pages.apiConfig = {
        key: 'apiConfig',
        label: 'API配置',
        mount,
    };
})(window.NetworkShortcutApp);
