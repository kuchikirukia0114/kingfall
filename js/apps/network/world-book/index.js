(function (app) {
    app.apps.network = app.apps.network || {};

    const networkApp = app.apps.network;
    networkApp.pages = networkApp.pages || {};

    const networkData = networkApp.data = networkApp.data || {};
    const DEFAULT_VIEW = 'list';
    const state = networkApp.worldBookState = networkApp.worldBookState || {
        root: null,
        isBound: false,
        unsubscribe: null,
        view: DEFAULT_VIEW,
        editingEntryId: '',
        draftEntryName: '',
        pendingMainChatContextN: '10',
        pendingMainChatUserN: '',
        pendingMainChatXmlRules: [],
        selectedInfoBindingIndex: -1,
        selectedInfoSourceIndex: -1,
        pickerOptions: [],
        pickerStatus: '',
        selectedPickerIndex: -1,
        pickerRequestId: 0,
        triggeredPreviewText: '',
        triggeredPreviewStatus: '',
        renderScrollSnapshots: {},
    };
    const RENDER_SCROLL_SELECTORS = [
        '#networkWorldBookList',
        '#networkWorldBookPickerList',
        '#networkWorldBookBindingList',
        '#networkWorldBookInfoSourceList',
        '#networkWorldBookRulesList',
        '#networkWorldBookMainChatPreviewCard',
        '#networkWorldBookTriggeredPreviewCard',
    ];
    let hasRegisteredEmbeddedWorldBookApis = false;
    const EMBEDDED_WORLD_BOOK_API_MARKER = '__networkShortcutEmbeddedWorldBookApi';

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
                if (context) {
                    return context;
                }
            } catch (error) {}
        }

        return null;
    }

    function getStandaloneWorldBooks() {
        const socialData = typeof app.core.getStandaloneSocialData === 'function'
            ? app.core.getStandaloneSocialData()
            : null;
        return Array.isArray(socialData?.worldBooks) ? socialData.worldBooks : [];
    }

    function getStandaloneWorldBookByName(name = '', scope = '') {
        const normalizedName = String(name || '').trim();
        const normalizedScope = String(scope || '').trim().toLowerCase();
        if (!normalizedName) {
            return null;
        }

        const worldBooks = getStandaloneWorldBooks();
        return worldBooks.find((book) => {
            const sameName = String(book?.name || '').trim() === normalizedName;
            const sameScope = !normalizedScope || String(book?.scope || 'global').trim().toLowerCase() === normalizedScope;
            return sameName && sameScope;
        }) || null;
    }

    function getOrCreateLocalStApi() {
        try {
            if (!window.ST_API || typeof window.ST_API !== 'object') {
                window.ST_API = {};
            }
            return window.ST_API;
        } catch (error) {
            return null;
        }
    }

    function registerEmbeddedApiEndpoint(namespace = '', endpointName = '', handler = null) {
        const stApi = getSTAPI() || getOrCreateLocalStApi();
        if (!stApi || !namespace || !endpointName || typeof handler !== 'function') {
            return false;
        }

        handler[EMBEDDED_WORLD_BOOK_API_MARKER] = true;

        if (!stApi[namespace] || typeof stApi[namespace] !== 'object') {
            stApi[namespace] = {};
        }

        if (typeof stApi[namespace][endpointName] !== 'function') {
            stApi[namespace][endpointName] = handler;
        }

        return true;
    }

    async function listEmbeddedWorldBooks(input = {}) {
        const normalizedScope = String(input?.scope || '').trim().toLowerCase();
        const compatResult = await listCompatibleWorldBookPickerOptions();
        const options = Array.isArray(compatResult?.options) ? compatResult.options : [];
        const worldBooks = options
            .filter((option) => !normalizedScope || String(option?.scope || '').trim().toLowerCase() === normalizedScope)
            .map((option) => ({
                name: String(option?.name || '').trim(),
                scope: String(option?.scope || 'global').trim() || 'global',
                ownerId: String(option?.ownerId || '').trim(),
            }))
            .filter((option) => option.name);

        return { worldBooks };
    }

    async function getEmbeddedWorldBook(input = {}) {
        const context = getSillyTavernContext();
        const normalizedName = String(input?.name || '').trim();
        const normalizedScope = String(input?.scope || '').trim().toLowerCase();

        if (!normalizedName) {
            throw new Error('worldBook.get: name is required');
        }

        const scopes = normalizedScope ? [normalizedScope] : ['global', 'character', 'chat'];

        for (let index = 0; index < scopes.length; index += 1) {
            const currentScope = scopes[index];

            if (currentScope === 'global') {
                const globalResult = await getGlobalCompatibleWorldBookByName(normalizedName, context);
                if (globalResult) {
                    return { worldBook: globalResult.worldBook, scope: 'global' };
                }
                continue;
            }

            if (currentScope === 'character') {
                const currentCharacter = getCurrentSillyTavernCharacter(context);
                const currentCharacterName = String(currentCharacter.character?.name || '').trim();
                const boundWorldBookName = getLegacyBoundWorldBookName('character', context);
                const isLegacyAlias = normalizedName === 'Current Character'
                    || (currentCharacter.characterId && normalizedName === currentCharacter.characterId)
                    || (currentCharacterName && normalizedName === currentCharacterName);

                if (boundWorldBookName && (normalizedName === boundWorldBookName || isLegacyAlias)) {
                    const globalResult = await getGlobalCompatibleWorldBookByName(boundWorldBookName, context);
                    if (globalResult) {
                        return { worldBook: globalResult.worldBook, scope: 'character' };
                    }
                }
                continue;
            }

            if (currentScope === 'chat') {
                const currentChatId = getCurrentSillyTavernChatId(context);
                const boundWorldBookName = getLegacyBoundWorldBookName('chat', context);
                const isLegacyAlias = normalizedName === 'Current Chat'
                    || (currentChatId && normalizedName === currentChatId);

                if (boundWorldBookName && (normalizedName === boundWorldBookName || isLegacyAlias)) {
                    const globalResult = await getGlobalCompatibleWorldBookByName(boundWorldBookName, context);
                    if (globalResult) {
                        return { worldBook: globalResult.worldBook, scope: 'chat' };
                    }
                }
            }
        }

        throw new Error(`WorldBook not found: ${normalizedName}`);
    }

    function ensureEmbeddedWorldBookApis() {
        if (hasRegisteredEmbeddedWorldBookApis) {
            const currentApi = getSTAPI();
            return Boolean(currentApi?.worldBook?.list && currentApi?.worldBook?.get);
        }

        const stApi = getSTAPI() || getOrCreateLocalStApi();
        if (!stApi) {
            return false;
        }

        registerEmbeddedApiEndpoint('worldBook', 'list', listEmbeddedWorldBooks);
        registerEmbeddedApiEndpoint('worldBook', 'get', getEmbeddedWorldBook);
        hasRegisteredEmbeddedWorldBookApis = true;
        return Boolean(stApi?.worldBook?.list && stApi?.worldBook?.get);
    }

    function cloneMainChatRules(rules) {
        if (!Array.isArray(rules)) {
            return [];
        }

        return rules.map((rule) => ({
            tag: String(rule?.tag || '').trim(),
            mode: rule?.mode === 'exclude' ? 'exclude' : 'recent',
            n: String(rule?.n || '').trim(),
        }));
    }

    function hasConfiguredRule(rule) {
        return Boolean(String(rule?.tag || '').trim() || String(rule?.n || '').trim());
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
            worldBookEntries: [],
            mainChatContextN: '10',
            mainChatUserN: '',
            mainChatXmlRules: [],
        };
    }

    function setSettings(nextSettings) {
        if (typeof networkData.setAiSettings === 'function') {
            return networkData.setAiSettings(nextSettings, { silent: true });
        }

        if (typeof networkData.normalizeAiSettings === 'function') {
            networkData.currentAiSettings = networkData.normalizeAiSettings(nextSettings);
            return networkData.currentAiSettings;
        }

        networkData.currentAiSettings = nextSettings;
        return nextSettings;
    }

    function getWorldBookEntries(settings = getSettings()) {
        if (typeof networkData.normalizeAiWorldBookEntries === 'function') {
            return networkData.normalizeAiWorldBookEntries(settings?.worldBookEntries);
        }

        return Array.isArray(settings?.worldBookEntries) ? settings.worldBookEntries.slice() : [];
    }

    function getWorldBookById(entryId, settings = getSettings()) {
        const targetEntryId = String(entryId || '').trim();
        if (!targetEntryId) {
            return null;
        }

        return getWorldBookEntries(settings).find((entry) => entry.id === targetEntryId) || null;
    }

    function getCurrentWorldBookEntry(settings = getSettings()) {
        return getWorldBookById(state.editingEntryId, settings);
    }

    function getWorldBookScopeLabel(scope = '') {
        if (typeof networkData.getAiWorldBookScopeLabel === 'function') {
            return networkData.getAiWorldBookScopeLabel(scope);
        }

        const normalizedScope = String(scope || '').trim();
        if (normalizedScope === 'chat') return '聊天绑定';
        if (normalizedScope === 'character') return '角色绑定';
        return '全局世界书';
    }

    function getWorldBookMainChatSummary(entry = null) {
        const targetEntry = entry || getCurrentWorldBookEntry();
        if (!targetEntry) {
            return '默认';
        }

        const rules = cloneMainChatRules(targetEntry.mainChatXmlRules);
        const isDefault = String(targetEntry.mainChatContextN ?? '10') === '10'
            && String(targetEntry.mainChatUserN ?? '') === ''
            && !rules.some(hasConfiguredRule);
        return isDefault ? '默认' : '已设';
    }

    function getWorldBookInfoBindingsSummary(entry = null) {
        const bindings = Array.isArray((entry || getCurrentWorldBookEntry())?.infoSourceBindings)
            ? (entry || getCurrentWorldBookEntry()).infoSourceBindings
            : [];
        return bindings.length ? `${bindings.length}项` : '空';
    }

    function createWorldBookInfoBindingId(index = 0) {
        return `worldbook_info_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getFallbackInfoSourceOptions() {
        return [
            {
                id: '__qq_pending_messages__',
                name: '待发送消息',
                subtitle: 'QQ 当前待正式发送的消息',
                scope: 'qq_pending_messages',
            },
            {
                id: '__qq_contact_profiles__',
                name: '联系人资料',
                subtitle: 'QQ 好友、群聊与群成员资料',
                scope: 'qq_contact_profiles',
            },
            {
                id: '__qq_chat_history_records__',
                name: '聊天历史记录',
                subtitle: 'QQ 最近聊天历史记录',
                scope: 'qq_chat_history_records',
            },
        ];
    }

    function getWorldBookInfoSourceOptions() {
        const sourceOptions = typeof networkData.getAiInfoSourceOptions === 'function'
            ? networkData.getAiInfoSourceOptions()
            : getFallbackInfoSourceOptions();

        return Array.isArray(sourceOptions)
            ? sourceOptions.map((source) => ({
                id: String(source?.id || '').trim(),
                name: String(source?.name || '').trim(),
                subtitle: String(source?.subtitle || '').trim(),
                scope: String(source?.scope || '').trim(),
            })).filter((source) => source.id && source.name)
            : [];
    }



    function getWorldBookTriggeredPreviewSummary() {
        return String(state.triggeredPreviewStatus || '').trim() || '查看';
    }

    function buildWorldBookPickerOptionId(book, index = 0) {
        const scope = String(book?.scope || 'global').trim() || 'global';
        const ownerId = String(book?.ownerId || '').trim();
        const name = String(book?.name || '').trim();

        if (!name) {
            return `worldbook_option_${index}`;
        }

        return `${scope}:${ownerId || '-'}:${name}`;
    }

    function normalizeWorldBookPickerOptions(worldBooks) {
        if (!Array.isArray(worldBooks)) {
            return [];
        }

        return worldBooks
            .map((book, index) => ({
                id: buildWorldBookPickerOptionId(book, index),
                name: String(book?.name || '').trim(),
                scope: String(book?.scope || 'global').trim() || 'global',
                ownerId: String(book?.ownerId || '').trim(),
            }))
            .filter((book) => book.name);
    }

    function getCurrentSillyTavernChatId(context = getSillyTavernContext()) {
        if (!context) {
            return '';
        }

        try {
            if (typeof context.getCurrentChatId === 'function') {
                const currentChatId = context.getCurrentChatId();
                if (currentChatId != null && currentChatId !== '') {
                    return String(currentChatId);
                }
            }
        } catch (error) {}

        return context.chatId == null ? '' : String(context.chatId);
    }

    function getCurrentSillyTavernCharacter(context = getSillyTavernContext()) {
        const rawCharacterId = context?.characterId;
        const characterId = rawCharacterId == null ? '' : String(rawCharacterId);
        const numericCharacterId = Number.parseInt(characterId, 10);
        const characters = Array.isArray(context?.characters) ? context.characters : [];
        const character = characterId && Object.prototype.hasOwnProperty.call(characters, characterId)
            ? characters[characterId]
            : (!Number.isNaN(numericCharacterId) && numericCharacterId >= 0 ? (characters[numericCharacterId] || null) : null);

        return {
            characterId,
            character,
        };
    }

    function getLegacyBoundWorldBookName(scope = '', context = getSillyTavernContext()) {
        const normalizedScope = String(scope || '').trim().toLowerCase();
        if (!context) {
            return '';
        }

        if (normalizedScope === 'chat') {
            return String(context.chatMetadata?.world_info || context.chatMetadata?.worldInfo || '').trim();
        }

        if (normalizedScope === 'character') {
            const currentCharacter = getCurrentSillyTavernCharacter(context).character;
            return String(
                currentCharacter?.data?.extensions?.world
                || currentCharacter?.extensions?.world
                || currentCharacter?.worldBook?.name
                || ''
            ).trim();
        }

        return '';
    }

    function getLegacyWorldBookPickerOptions(context = getSillyTavernContext()) {
        const options = [];
        const seenIds = new Set();

        function appendOption(name, scope, ownerId = '') {
            const normalizedName = String(name || '').trim();
            const normalizedScope = String(scope || 'global').trim() || 'global';
            const normalizedOwnerId = String(ownerId || '').trim();
            if (!normalizedName) {
                return;
            }

            const optionId = buildWorldBookPickerOptionId({
                name: normalizedName,
                scope: normalizedScope,
                ownerId: normalizedOwnerId,
            }, options.length);

            if (seenIds.has(optionId)) {
                return;
            }

            seenIds.add(optionId);
            options.push({
                id: optionId,
                name: normalizedName,
                scope: normalizedScope,
                ownerId: normalizedOwnerId,
            });
        }

        appendOption(
            getLegacyBoundWorldBookName('chat', context),
            'chat',
            getCurrentSillyTavernChatId(context)
        );

        const currentCharacter = getCurrentSillyTavernCharacter(context);
        appendOption(
            getLegacyBoundWorldBookName('character', context),
            'character',
            currentCharacter.characterId
        );

        return options;
    }
    async function listCompatibleWorldBookPickerOptions(context = getSillyTavernContext()) {
        const options = [];
        const seenIds = new Set();
        let hasGlobalListSource = false;
        let hasStandaloneSource = false;

        function appendOption(option) {
            const normalizedName = String(option?.name || '').trim();
            const normalizedScope = String(option?.scope || 'global').trim() || 'global';
            const normalizedOwnerId = String(option?.ownerId || '').trim();
            if (!normalizedName) {
                return;
            }

            const optionId = buildWorldBookPickerOptionId({
                name: normalizedName,
                scope: normalizedScope,
                ownerId: normalizedOwnerId,
            }, options.length);

            if (seenIds.has(optionId)) {
                return;
            }

            seenIds.add(optionId);
            options.push({
                id: optionId,
                name: normalizedName,
                scope: normalizedScope,
                ownerId: normalizedOwnerId,
            });
        }

        if (context && typeof context.updateWorldInfoList === 'function') {
            try {
                await context.updateWorldInfoList();
            } catch (error) {}
        }

        let worldNames = [];
        try {
            const headers = {
                ...(typeof context?.getRequestHeaders === 'function' ? (context.getRequestHeaders() || {}) : {}),
                'Content-Type': 'application/json',
            };
            const response = await fetch('/api/settings/get', {
                method: 'POST',
                headers,
                body: JSON.stringify({}),
            });

            if (response.ok) {
                hasGlobalListSource = true;
                const data = await response.json();
                if (Array.isArray(data?.world_names)) {
                    worldNames = data.world_names;
                }
            }
        } catch (error) {}

        if (!worldNames.length) {
            let legacyWorldNames = [];
            try {
                if (Array.isArray(window.world_names)) {
                    legacyWorldNames = window.world_names.slice();
                }
            } catch (error) {}

            if (!legacyWorldNames.length && Array.isArray(context?.world_names)) {
                legacyWorldNames = context.world_names.slice();
            }

            if (legacyWorldNames.length) {
                hasGlobalListSource = true;
                worldNames = legacyWorldNames;
            }
        }

        worldNames.forEach((name) => {
            appendOption({ name, scope: 'global' });
        });

        getLegacyWorldBookPickerOptions(context).forEach((option) => {
            appendOption(option);
        });

        getStandaloneWorldBooks().forEach((book) => {
            hasStandaloneSource = true;
            appendOption({
                name: String(book?.name || '').trim(),
                scope: String(book?.scope || 'global').trim() || 'global',
                ownerId: String(book?.ownerId || '').trim(),
            });
        });

        return {
            options,
            source: hasGlobalListSource
                ? 'compat_full'
                : (hasStandaloneSource ? 'standalone' : 'legacy_bound_only'),
        };
    }





    function normalizeWorldBookEntryKeywords(values) {
        return Array.isArray(values)
            ? values.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
    }

    function normalizeCompatibleWorldBookResult(rawResult, { fallbackName = '', fallbackScope = 'global' } = {}) {
        if (!rawResult || typeof rawResult !== 'object') {
            return null;
        }

        const directBook = rawResult.worldBook && typeof rawResult.worldBook === 'object'
            ? rawResult.worldBook
            : rawResult;
        const rawEntries = directBook && typeof directBook === 'object' ? directBook.entries : null;
        if (!rawEntries) {
            return null;
        }

        const entries = (Array.isArray(rawEntries)
            ? rawEntries
            : Object.keys(rawEntries).map((key) => ({
                ...rawEntries[key],
                index: Number(key),
            }))).map((entry, index) => {
            const secondaryKeywords = Array.isArray(entry?.secondaryKey)
                ? entry.secondaryKey
                : (Array.isArray(entry?.keysecondary)
                    ? entry.keysecondary
                    : (Array.isArray(entry?.secondary_keys) ? entry.secondary_keys : []));
            const rawOrder = entry?.order;
            const normalizedOrder = Number.isFinite(Number(rawOrder)) ? Number(rawOrder) : null;
            const rawUid = entry?.uid ?? entry?.id ?? entry?.entryId;
            const normalizedUid = Number.isFinite(Number(rawUid)) ? Number(rawUid) : null;

            return {
                index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : index,
                uid: normalizedUid,
                order: normalizedOrder,
                name: String(entry?.name || entry?.comment || '').trim(),
                content: String(entry?.content || '').trim(),
                enabled: entry?.enabled === false ? false : entry?.disable !== true,
                activationMode: String(entry?.activationMode || '').trim()
                    || (entry?.constant ? 'always' : (entry?.vectorized ? 'vector' : 'keyword')),
                key: normalizeWorldBookEntryKeywords(
                    Array.isArray(entry?.key) ? entry.key : (Array.isArray(entry?.keys) ? entry.keys : [])
                ),
                secondaryKey: normalizeWorldBookEntryKeywords(secondaryKeywords),
                caseSensitive: entry?.caseSensitive == null ? null : !!entry.caseSensitive,
            };
        });

        return {
            worldBook: {
                name: String(directBook.name || rawResult.name || fallbackName || '').trim(),
                entries,
            },
            scope: String(rawResult.scope || fallbackScope || 'global').trim() || 'global',
        };
    }

    async function getGlobalCompatibleWorldBookByName(name = '', context = getSillyTavernContext()) {
        const normalizedName = String(name || '').trim();
        if (!normalizedName) {
            return null;
        }

        if (typeof context?.loadWorldInfo === 'function') {
            const attemptFactories = [
                () => context.loadWorldInfo(normalizedName),
                () => context.loadWorldInfo({ name: normalizedName, scope: 'global' }),
                () => context.loadWorldInfo(normalizedName, 'global'),
            ];

            for (let index = 0; index < attemptFactories.length; index += 1) {
                try {
                    const rawResult = await attemptFactories[index]();
                    const normalizedResult = normalizeCompatibleWorldBookResult(rawResult, {
                        fallbackName: normalizedName,
                        fallbackScope: 'global',
                    });
                    if (normalizedResult) {
                        return normalizedResult;
                    }
                } catch (error) {}
            }
        }

        try {
            const headers = {
                ...(typeof context?.getRequestHeaders === 'function' ? (context.getRequestHeaders() || {}) : {}),
                'Content-Type': 'application/json',
            };
            const response = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: normalizedName }),
            });

            if (response.ok) {
                return normalizeCompatibleWorldBookResult(await response.json(), {
                    fallbackName: normalizedName,
                    fallbackScope: 'global',
                });
            }
        } catch (error) {}

        const standaloneBook = getStandaloneWorldBookByName(normalizedName, 'global');
        if (standaloneBook) {
            return {
                worldBook: {
                    name: String(standaloneBook.name || normalizedName).trim(),
                    entries: Array.isArray(standaloneBook.entries) ? standaloneBook.entries : [],
                },
                scope: String(standaloneBook.scope || 'global').trim() || 'global',
            };
        }

        return null;
    }

    async function getCompatibleWorldBook(name = '', { scope = '' } = {}) {
        const normalizedName = String(name || '').trim();
        const normalizedScope = String(scope || '').trim().toLowerCase();
        const context = getSillyTavernContext();
        ensureEmbeddedWorldBookApis();
        const stApi = getSTAPI();

        if (typeof stApi?.worldBook?.get === 'function') {
            try {
                const result = await stApi.worldBook.get({
                    name: normalizedName,
                    scope: normalizedScope || undefined,
                });
                const normalizedResult = normalizeCompatibleWorldBookResult(result, {
                    fallbackName: normalizedName,
                    fallbackScope: normalizedScope || 'global',
                });
                if (normalizedResult) {
                    return normalizedResult;
                }
            } catch (error) {}
        }

        if (normalizedScope === 'character') {
            const boundWorldBookName = getLegacyBoundWorldBookName('character', context);
            if (boundWorldBookName) {
                const globalResult = await getGlobalCompatibleWorldBookByName(boundWorldBookName, context);
                if (globalResult) {
                    return { worldBook: globalResult.worldBook, scope: 'character' };
                }
            }
            const standaloneCharacterBook = getStandaloneWorldBookByName(normalizedName, 'character');
            if (standaloneCharacterBook) {
                return {
                    worldBook: {
                        name: String(standaloneCharacterBook.name || normalizedName).trim(),
                        entries: Array.isArray(standaloneCharacterBook.entries) ? standaloneCharacterBook.entries : [],
                    },
                    scope: 'character',
                };
            }
            return null;
        }

        if (normalizedScope === 'chat') {
            const boundWorldBookName = getLegacyBoundWorldBookName('chat', context);
            if (boundWorldBookName) {
                const globalResult = await getGlobalCompatibleWorldBookByName(boundWorldBookName, context);
                if (globalResult) {
                    return { worldBook: globalResult.worldBook, scope: 'chat' };
                }
            }
            const standaloneChatBook = getStandaloneWorldBookByName(normalizedName, 'chat');
            if (standaloneChatBook) {
                return {
                    worldBook: {
                        name: String(standaloneChatBook.name || normalizedName).trim(),
                        entries: Array.isArray(standaloneChatBook.entries) ? standaloneChatBook.entries : [],
                    },
                    scope: 'chat',
                };
            }
            return null;
        }

        return getGlobalCompatibleWorldBookByName(normalizedName, context);
    }

    function getWorldBookEntryKeywords(entry = null) {
        return normalizeWorldBookEntryKeywords([
            ...(Array.isArray(entry?.key) ? entry.key : []),
            ...(Array.isArray(entry?.secondaryKey) ? entry.secondaryKey : []),
        ]);
    }

    function isWorldBookEntryTriggered(entry = null, contextText = '') {
        if (!entry || entry.enabled === false || !String(entry.content || '').trim()) {
            return false;
        }

        const activationMode = String(entry.activationMode || '').trim().toLowerCase();
        if (activationMode === 'always') {
            return true;
        }

        const keywords = getWorldBookEntryKeywords(entry);
        if (!keywords.length) {
            return false;
        }

        const useCaseSensitive = entry.caseSensitive === true;
        const normalizedContext = useCaseSensitive
            ? String(contextText || '')
            : String(contextText || '').toLowerCase();

        return keywords.some((keyword) => {
            const normalizedKeyword = useCaseSensitive ? keyword : keyword.toLowerCase();
            return normalizedKeyword ? normalizedContext.includes(normalizedKeyword) : false;
        });
    }

    async function buildTriggeredPreviewContextText(entry = null, settingsSource = getSettings()) {
        const settings = {
            ...settingsSource,
            mainChatContextN: entry?.mainChatContextN == null ? '10' : String(entry.mainChatContextN),
            mainChatUserN: entry?.mainChatUserN == null ? '' : String(entry.mainChatUserN),
            mainChatXmlRules: cloneMainChatRules(entry?.mainChatXmlRules),
        };

        const contextParts = [];
        const mainChatMessages = typeof networkData.buildAiMainChatPreviewMessages === 'function'
            ? (networkData.buildAiMainChatPreviewMessages(settings) || [])
            : [];
        if (mainChatMessages.length) {
            contextParts.push(
                mainChatMessages
                    .map((message) => String(message?.content || '').trim())
                    .filter(Boolean)
                    .join('\n\n')
            );
        }

        if (typeof networkData.buildAiInfoSourceResolvedText === 'function') {
            const infoSourceBindings = Array.isArray(entry?.infoSourceBindings) ? entry.infoSourceBindings : [];
            for (let index = 0; index < infoSourceBindings.length; index += 1) {
                const binding = infoSourceBindings[index];
                const content = await networkData.buildAiInfoSourceResolvedText({
                    sourceId: String(binding?.sourceId || '').trim(),
                    sourceScope: String(binding?.sourceScope || '').trim(),
                });
                if (content) {
                    contextParts.push(String(content).trim());
                }
            }
        }

        return contextParts.filter(Boolean).join('\n\n').trim();
    }

    function getWorldBookEntrySortValue(entry, field, fallbackValue) {
        const rawValue = entry && entry[field];
        return Number.isFinite(Number(rawValue)) ? Number(rawValue) : fallbackValue;
    }

    function sortWorldBookEntriesForOutput(entries) {
        return (Array.isArray(entries) ? entries.slice() : []).sort((left, right) => {
            const leftOrder = getWorldBookEntrySortValue(left, 'order', Number.POSITIVE_INFINITY);
            const rightOrder = getWorldBookEntrySortValue(right, 'order', Number.POSITIVE_INFINITY);
            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            const leftUid = getWorldBookEntrySortValue(left, 'uid', Number.POSITIVE_INFINITY);
            const rightUid = getWorldBookEntrySortValue(right, 'uid', Number.POSITIVE_INFINITY);
            if (leftUid !== rightUid) {
                return leftUid - rightUid;
            }

            const leftIndex = getWorldBookEntrySortValue(left, 'index', Number.POSITIVE_INFINITY);
            const rightIndex = getWorldBookEntrySortValue(right, 'index', Number.POSITIVE_INFINITY);
            return leftIndex - rightIndex;
        });
    }

    function formatTriggeredWorldBookEntryPreviewLine(worldBookEntry) {
        const matchedEntryName = String(worldBookEntry?.name || '').trim();
        const matchedEntryContent = String(worldBookEntry?.content || '').trim();
        const orderText = Number.isFinite(Number(worldBookEntry?.order)) ? String(Number(worldBookEntry.order)) : '-';
        const uidText = Number.isFinite(Number(worldBookEntry?.uid)) ? String(Number(worldBookEntry.uid)) : '-';
        const prefix = `[order:${orderText} uid:${uidText}] `;
        return matchedEntryName
            ? `${prefix}${matchedEntryName}：${matchedEntryContent}`
            : `${prefix}${matchedEntryContent}`;
    }

    function formatTriggeredWorldBookEntryPromptLine(worldBookEntry) {
        return String(worldBookEntry?.content || '').trim();
    }

    async function buildWorldBookTriggerText(entry = null, settingsSource = getSettings()) {
        const entryName = String(entry?.name || '').trim();
        if (!entryName) {
            return '';
        }

        const contextText = await buildTriggeredPreviewContextText(entry, settingsSource);
        if (!contextText) {
            return '';
        }

        const result = await getCompatibleWorldBook(entryName, {
            scope: String(entry?.scope || '').trim() || undefined,
        });
        if (!result?.worldBook) {
            return '';
        }

        const worldBookEntries = Array.isArray(result.worldBook.entries) ? result.worldBook.entries : [];
        const matchedEntries = sortWorldBookEntriesForOutput(
            worldBookEntries.filter((worldBookEntry) => isWorldBookEntryTriggered(worldBookEntry, contextText))
        ).slice(0, 20);

        if (!matchedEntries.length) {
            return '';
        }

        return [
            `世界书触发：${result.worldBook.name || entryName}`,
            ...matchedEntries.map(formatTriggeredWorldBookEntryPromptLine).filter(Boolean),
        ].filter(Boolean).join('\n');
    }

    async function refreshTriggeredPreview() {
        state.triggeredPreviewText = '';
        state.triggeredPreviewStatus = '读取中...';
        if (state.view === 'entryTriggeredPreview') {
            render();
        }

        try {
            const entry = getCurrentWorldBookEntry();
            const entryName = String(entry?.name || '').trim();
            if (!entryName) {
                state.triggeredPreviewStatus = '未选择世界书';
                if (state.view === 'entryTriggeredPreview') {
                    render();
                }
                return;
            }

            const contextText = await buildTriggeredPreviewContextText(entry);
            if (!contextText) {
                state.triggeredPreviewStatus = '暂无触发内容';
                if (state.view === 'entryTriggeredPreview') {
                    render();
                }
                return;
            }

            const result = await getCompatibleWorldBook(entryName, {
                scope: String(entry?.scope || '').trim() || undefined,
            });
            if (!result?.worldBook) {
                state.triggeredPreviewStatus = '未找到世界书';
                if (state.view === 'entryTriggeredPreview') {
                    render();
                }
                return;
            }

            const worldBookEntries = Array.isArray(result.worldBook.entries) ? result.worldBook.entries : [];
            const matchedEntries = sortWorldBookEntriesForOutput(
                worldBookEntries.filter((worldBookEntry) => isWorldBookEntryTriggered(worldBookEntry, contextText))
            ).slice(0, 20);

            if (!matchedEntries.length) {
                state.triggeredPreviewStatus = '暂无触发内容';
                if (state.view === 'entryTriggeredPreview') {
                    render();
                }
                return;
            }

            state.triggeredPreviewText = [
                `世界书触发：${result.worldBook.name || entryName}`,
                ...matchedEntries.map(formatTriggeredWorldBookEntryPreviewLine),
            ].filter(Boolean).join('\n');
            state.triggeredPreviewStatus = `已触发 ${matchedEntries.length} 条`;
        } catch (error) {
            state.triggeredPreviewText = '';
            state.triggeredPreviewStatus = '读取失败';
            console.error('[世界书触发预览] 读取失败', error);
        }

        if (state.view === 'entryTriggeredPreview') {
            render();
        }
    }



    async function loadWorldBookPickerOptions() {
        const requestId = state.pickerRequestId + 1;
        state.pickerRequestId = requestId;
        state.pickerStatus = '读取中...';
        state.pickerOptions = [];

        if (state.view === 'picker') {
            render();
        }

        try {
            ensureEmbeddedWorldBookApis();
            const stApi = getSTAPI();
            let nextOptions = [];
            let nextStatus = '';

            if (typeof stApi?.worldBook?.list === 'function') {
                const result = await stApi.worldBook.list();
                if (state.pickerRequestId !== requestId) {
                    return [];
                }

                nextOptions = normalizeWorldBookPickerOptions(result?.worldBooks);
                nextStatus = nextOptions.length ? '' : '暂无世界书';
            } else {
                const compatResult = await listCompatibleWorldBookPickerOptions();
                nextOptions = normalizeWorldBookPickerOptions(compatResult.options);
                nextStatus = compatResult.source === 'legacy_bound_only'
                    ? (nextOptions.length
                        ? '当前环境缺少 worldBook.list；仅显示当前角色/当前聊天已绑定世界书'
                        : '当前环境缺少 worldBook.list；请升级 SillyTavern 以获取完整世界书列表')
                    : (nextOptions.length ? '' : '暂无世界书');
            }

            state.pickerOptions = nextOptions;
            state.selectedPickerIndex = nextOptions.length
                ? Math.min(Math.max(state.selectedPickerIndex, 0), nextOptions.length - 1)
                : -1;
            state.pickerStatus = nextStatus;

            if (state.view === 'picker') {
                render();
            }

            return nextOptions;
        } catch (error) {
            if (state.pickerRequestId !== requestId) {
                return [];
            }

            console.warn('[世界书] 读取世界书列表失败', error);
            state.pickerOptions = [];
            state.selectedPickerIndex = -1;
            state.pickerStatus = '读取失败';

            if (state.view === 'picker') {
                render();
            }

            return [];
        }
    }

    function openWorldBookPicker() {
        state.view = 'picker';
        state.selectedPickerIndex = -1;
        state.pickerStatus = '读取中...';
        state.pickerOptions = [];
        render();
        loadWorldBookPickerOptions();
    }

    function closeWorldBookPicker() {
        state.view = 'list';
        render();
    }

    function addSelectedWorldBookFromPicker() {
        const selectedOption = state.pickerOptions[state.selectedPickerIndex] || null;
        if (!selectedOption) {
            return;
        }

        const settings = getSettings();
        const currentEntries = getWorldBookEntries(settings);
        const existedEntry = currentEntries.find((entry) => String(entry?.sourceId || '').trim() === selectedOption.id);

        if (existedEntry) {
            state.editingEntryId = existedEntry.id;
            syncEditingEntryState(settings);
            state.view = 'entry';
            render();
            return;
        }

        const nextSettings = setSettings({
            ...settings,
            worldBookEntries: currentEntries.concat({
                sourceId: selectedOption.id,
                name: selectedOption.name,
                scope: selectedOption.scope,
                ownerId: selectedOption.ownerId,
                mainChatContextN: '10',
                mainChatUserN: '',
                mainChatXmlRules: [],
                infoSourceBindings: [],
            }),
        });
        const entries = getWorldBookEntries(nextSettings);
        const createdEntry = entries.find((entry) => String(entry?.sourceId || '').trim() === selectedOption.id) || entries[entries.length - 1] || null;

        state.editingEntryId = createdEntry?.id || '';
        syncEditingEntryState(nextSettings);
        state.view = 'entry';
        render();
    }


    function getNextWorldBookName(settings = getSettings()) {
        return `世界书 ${getWorldBookEntries(settings).length + 1}`;
    }

    function syncEditingEntryState(settings = getSettings()) {
        const entries = getWorldBookEntries(settings);
        const fallbackEntryId = entries[0]?.id || '';
        const nextEntryId = getWorldBookById(state.editingEntryId, { ...settings, worldBookEntries: entries })
            ? state.editingEntryId
            : fallbackEntryId;
        const currentEntry = getWorldBookById(nextEntryId, { ...settings, worldBookEntries: entries });

        state.editingEntryId = currentEntry?.id || '';
        state.draftEntryName = currentEntry?.name || '';

        const bindings = Array.isArray(currentEntry?.infoSourceBindings) ? currentEntry.infoSourceBindings : [];
        state.selectedInfoBindingIndex = bindings.length
            ? Math.min(Math.max(state.selectedInfoBindingIndex, 0), bindings.length - 1)
            : -1;
    }

    function commitEntryName() {
        const settings = getSettings();
        const entries = getWorldBookEntries(settings);
        const targetIndex = entries.findIndex((entry) => entry.id === state.editingEntryId);

        if (targetIndex < 0) {
            return settings;
        }

        const nextName = String(state.draftEntryName || '').trim() || `世界书 ${targetIndex + 1}`;
        if (entries[targetIndex].name === nextName) {
            return settings;
        }

        const nextEntries = entries.slice();
        nextEntries[targetIndex] = {
            ...nextEntries[targetIndex],
            name: nextName,
        };

        const nextSettings = setSettings({
            ...settings,
            worldBookEntries: nextEntries,
        });
        syncEditingEntryState(nextSettings);
        return nextSettings;
    }

    function loadMainChatDraftFromEntry(entry = getCurrentWorldBookEntry()) {
        state.pendingMainChatContextN = entry?.mainChatContextN == null ? '10' : String(entry.mainChatContextN);
        state.pendingMainChatUserN = entry?.mainChatUserN == null ? '' : String(entry.mainChatUserN);
        state.pendingMainChatXmlRules = cloneMainChatRules(entry?.mainChatXmlRules);
    }

    function saveMainChatDraftToEntry() {
        const settings = getSettings();
        const entries = getWorldBookEntries(settings);
        const targetIndex = entries.findIndex((entry) => entry.id === state.editingEntryId);

        if (targetIndex < 0) {
            return settings;
        }

        const nextEntries = entries.slice();
        nextEntries[targetIndex] = {
            ...nextEntries[targetIndex],
            mainChatContextN: state.pendingMainChatContextN,
            mainChatUserN: state.pendingMainChatUserN,
            mainChatXmlRules: cloneMainChatRules(state.pendingMainChatXmlRules),
        };

        return setSettings({
            ...settings,
            worldBookEntries: nextEntries,
        });
    }

    function buildMainChatPreviewMessages() {
        if (typeof networkData.buildAiMainChatPreviewMessages !== 'function') {
            return [];
        }

        return networkData.buildAiMainChatPreviewMessages({
            ...getSettings(),
            mainChatContextN: state.pendingMainChatContextN,
            mainChatUserN: state.pendingMainChatUserN,
            mainChatXmlRules: cloneMainChatRules(state.pendingMainChatXmlRules),
        }) || [];
    }

    function getMainChatPreviewText() {
        const messages = buildMainChatPreviewMessages();
        if (!messages.length) {
            return '';
        }

        return messages
            .map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`)
            .join('\n\n');
    }

    function openWorldBookEntry(entryId) {
        const settings = getSettings();
        const targetEntry = getWorldBookById(entryId, settings);
        if (!targetEntry) {
            return;
        }

        state.editingEntryId = targetEntry.id;
        syncEditingEntryState(settings);
        state.view = 'entry';
        render();
    }

    function createWorldBookEntry() {
        const settings = getSettings();
        const nextSettings = setSettings({
            ...settings,
            worldBookEntries: getWorldBookEntries(settings).concat({
                name: getNextWorldBookName(settings),
                scope: 'global',
                ownerId: '',
                sourceId: '',
                mainChatContextN: '10',
                mainChatUserN: '',
                mainChatXmlRules: [],
                infoSourceBindings: [],
            }),
        });
        const entries = getWorldBookEntries(nextSettings);
        const createdEntry = entries[entries.length - 1] || null;

        state.editingEntryId = createdEntry?.id || '';
        syncEditingEntryState(nextSettings);
        state.view = 'entry';
        render();
    }

    function deleteWorldBookEntry(entryId) {
        const settings = getSettings();
        const nextEntries = getWorldBookEntries(settings).filter((entry) => entry.id !== entryId);
        const nextSettings = setSettings({
            ...settings,
            worldBookEntries: nextEntries,
        });

        if (state.editingEntryId === entryId) {
            state.editingEntryId = nextEntries[0]?.id || '';
        }

        syncEditingEntryState(nextSettings);
        state.view = 'list';
        render();
    }

    function openWorldBookInfoSourcePicker() {
        const sources = getWorldBookInfoSourceOptions();
        state.selectedInfoSourceIndex = sources.length
            ? Math.min(Math.max(state.selectedInfoSourceIndex, 0), sources.length - 1)
            : -1;
        state.view = 'entryInfoSourcePicker';
        render();
    }

    function closeWorldBookInfoSourcePicker() {
        state.view = 'entryInfoBindings';
        render();
    }

    function addSelectedWorldBookInfoSourceBinding() {
        const sources = getWorldBookInfoSourceOptions();
        if (!sources.length || state.selectedInfoSourceIndex < 0) {
            return false;
        }

        const source = sources[Math.min(state.selectedInfoSourceIndex, sources.length - 1)] || null;
        if (!source) {
            return false;
        }

        const settings = getSettings();
        const entries = getWorldBookEntries(settings);
        const targetIndex = entries.findIndex((entry) => entry.id === state.editingEntryId);
        if (targetIndex < 0) {
            return false;
        }

        const currentBindings = Array.isArray(entries[targetIndex].infoSourceBindings)
            ? entries[targetIndex].infoSourceBindings.slice()
            : [];
        const existingIndex = currentBindings.findIndex((binding) => String(binding?.sourceId || '').trim() === String(source.id || '').trim());
        if (existingIndex >= 0) {
            state.selectedInfoBindingIndex = existingIndex;
            closeWorldBookInfoSourcePicker();
            return false;
        }

        const nextBindings = currentBindings.concat({
            id: createWorldBookInfoBindingId(currentBindings.length),
            sourceId: source.id,
            sourceName: source.name,
            sourceScope: source.scope,
        });

        entries[targetIndex] = {
            ...entries[targetIndex],
            infoSourceBindings: nextBindings,
        };
        const nextSettings = setSettings({

            ...settings,
            worldBookEntries: entries,
        });
        syncEditingEntryState(nextSettings);
        state.selectedInfoBindingIndex = nextBindings.length - 1;
        state.view = 'entryInfoBindings';
        render();
        return true;
    }



    function openEntryMainChat() {
        commitEntryName();
        loadMainChatDraftFromEntry();
        state.view = 'entryMainChat';
        render();
    }

    function saveEntryMainChat() {
        const nextSettings = saveMainChatDraftToEntry();
        syncEditingEntryState(nextSettings);
        state.view = 'entry';
        render();
    }

    function openEntryMainChatRules() {
        state.view = 'entryMainChatRules';
        render();
    }

    function openEntryMainChatPreview() {
        state.view = 'entryMainChatPreview';
        render();
    }

    function openEntryInfoBindings() {
        commitEntryName();
        syncEditingEntryState();
        state.view = 'entryInfoBindings';
        render();
    }

    function deleteInfoBinding(index) {
        const settings = getSettings();
        const entries = getWorldBookEntries(settings);
        const targetIndex = entries.findIndex((entry) => entry.id === state.editingEntryId);
        if (targetIndex < 0) {
            return;
        }

        const currentBindings = Array.isArray(entries[targetIndex].infoSourceBindings)
            ? entries[targetIndex].infoSourceBindings.slice()
            : [];
        const bindingIndex = Number(index);

        if (!Number.isFinite(bindingIndex) || bindingIndex < 0 || bindingIndex >= currentBindings.length) {
            return;
        }

        currentBindings.splice(bindingIndex, 1);
        entries[targetIndex] = {
            ...entries[targetIndex],
            infoSourceBindings: currentBindings,
        };

        const nextSettings = setSettings({
            ...settings,
            worldBookEntries: entries,
        });
        syncEditingEntryState(nextSettings);
        render();
    }

    function openTriggeredPreview() {
        commitEntryName();
        state.view = 'entryTriggeredPreview';
        state.triggeredPreviewText = '';
        state.triggeredPreviewStatus = '';
        render();
        refreshTriggeredPreview();
    }

    function backToList() {
        commitEntryName();
        syncEditingEntryState();
        state.view = 'list';
        render();
    }

    function backToEntry() {
        syncEditingEntryState();
        state.view = 'entry';
        render();
    }

    function backToEntryMainChat() {
        state.view = 'entryMainChat';
        render();
    }

    function addRule() {
        state.pendingMainChatXmlRules = cloneMainChatRules(state.pendingMainChatXmlRules).concat({
            tag: '',
            mode: 'recent',
            n: '',
        });
        render();
    }

    function toggleRuleMode(ruleIndex) {
        state.pendingMainChatXmlRules = cloneMainChatRules(state.pendingMainChatXmlRules).map((rule, index) => {
            if (index !== ruleIndex) {
                return rule;
            }

            return {
                ...rule,
                mode: rule.mode === 'exclude' ? 'recent' : 'exclude',
            };
        });
        render();
    }

    function deleteRule(ruleIndex) {
        state.pendingMainChatXmlRules = cloneMainChatRules(state.pendingMainChatXmlRules).filter((rule, index) => index !== ruleIndex);
        render();
    }

    function getHeaderConfig() {
        if (state.view === 'picker') {
            return {
                title: '选择世界书',
                actions: [
                    { action: 'add-selected-picker', label: '添加', tone: 'primary', disabled: state.selectedPickerIndex < 0 },
                    { action: 'back-picker', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entry') {
            return {
                title: state.draftEntryName || getCurrentWorldBookEntry()?.name || '世界书',
                actions: [
                    { action: 'back-list', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryMainChat') {
            return {
                title: '主聊天上下文',
                actions: [
                    { action: 'save-entry-main-chat', label: '保存', tone: 'primary' },
                    { action: 'back-entry', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryMainChatRules') {
            return {
                title: 'XML规则',
                actions: [
                    { action: 'add-rule', label: '新增规则', tone: 'secondary' },
                    { action: 'save-entry-main-chat', label: '保存', tone: 'primary' },
                    { action: 'back-entry-main-chat', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryMainChatPreview') {
            return {
                title: '预览上下文',
                actions: [
                    { action: 'back-entry-main-chat', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryInfoBindings') {
            return {
                title: '信息块',
                actions: [
                    { action: 'open-info-source-picker', label: '添加', tone: 'secondary' },
                    { action: 'back-entry', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryInfoSourcePicker') {
            return {
                title: '选择信息来源',
                actions: [
                    { action: 'add-selected-info-source', label: '添加', tone: 'primary', disabled: state.selectedInfoSourceIndex < 0 },
                    { action: 'back-info-source-picker', label: '返回', tone: 'ghost' },
                ],
            };
        }

        if (state.view === 'entryTriggeredPreview') {
            return {
                title: '已触发预览',
                actions: [
                    { action: 'refresh-triggered-preview', label: '刷新', tone: 'secondary' },
                    { action: 'back-entry', label: '返回', tone: 'ghost' },
                ],
            };
        }

        return {
            title: '世界书',
            actions: [
                { action: 'open-picker', label: '添加世界书', tone: 'primary' },
            ],
        };
    }

    function renderActionButtons(actions) {
        return actions.map((actionConfig) => `
            <button
                class="xp-button xp-button--${escapeHtml(actionConfig.tone || 'secondary')} network-world-book__button"
                type="button"
                data-world-book-action="${escapeHtml(actionConfig.action)}"
                ${actionConfig.disabled ? 'disabled' : ''}
            >${escapeHtml(actionConfig.label)}</button>
        `).join('');
    }

    function renderEntryList(settings = getSettings()) {
        const entries = getWorldBookEntries(settings);

        if (!entries.length) {
            return `
                <div class="network-world-book__empty">
                    <strong>暂无世界书</strong>
                </div>
            `;
        }

        return `
            <div class="network-world-book__list" id="networkWorldBookList">
                ${entries.map((entry) => `
                    <div class="xp-list-item network-world-book__entry-item ${state.editingEntryId === entry.id ? 'is-selected' : ''}" data-world-book-entry-id="${escapeHtml(entry.id)}">
                        <div class="network-world-book__entry-main">
                            <span class="network-world-book__entry-name">${escapeHtml(entry.name)}</span>
                            <span class="network-world-book__entry-meta">${escapeHtml(getWorldBookScopeLabel(entry.scope))}</span>
                        </div>
                        <button class="xp-button xp-button--icon xp-button--danger network-world-book__delete-button" type="button" data-world-book-action="delete-entry" data-world-book-entry-id="${escapeHtml(entry.id)}">×</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderPickerView() {
        if (!state.pickerOptions.length) {
            return `
                <div class="network-world-book__empty">
                    <strong>${escapeHtml(state.pickerStatus || '暂无世界书')}</strong>
                </div>
            `;
        }

        return `
            <div class="network-world-book__list" id="networkWorldBookPickerList">
                ${state.pickerOptions.map((entry, index) => `
                    <div class="xp-list-item network-world-book__picker-item ${state.selectedPickerIndex === index ? 'is-selected' : ''}" data-world-book-picker-index="${index}">
                        <div class="network-world-book__picker-main">
                            <span class="network-world-book__picker-name">${escapeHtml(entry.name)}</span>
                            <span class="network-world-book__picker-meta">${escapeHtml(getWorldBookScopeLabel(entry.scope))}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderEntryView() {
        const entry = getCurrentWorldBookEntry();
        if (!entry) {
            return renderEntryList(getSettings());
        }

        return `
            <div class="network-world-book__content network-world-book__content--entry">
                <div class="network-world-book__editor-card">
                    <div class="network-world-book__field-group">
                        <span class="network-world-book__field-label">名称</span>
                        <input class="xp-input network-world-book__input" data-world-book-field="name" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(state.draftEntryName)}" placeholder="世界书名称">
                    </div>
                </div>
                <div class="network-world-book__rows">
                    <button class="xp-list-row network-world-book__row" type="button" data-world-book-action="open-entry-main-chat">
                        <span class="network-world-book__row-label">主聊天上下文</span>
                        <span class="network-world-book__row-value-wrap">
                            <span class="network-world-book__row-value">${escapeHtml(getWorldBookMainChatSummary(entry))}</span>
                            <span class="network-world-book__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-world-book__row" type="button" data-world-book-action="open-entry-info-bindings">
                        <span class="network-world-book__row-label">信息块</span>
                        <span class="network-world-book__row-value-wrap">
                            <span class="network-world-book__row-value">${escapeHtml(getWorldBookInfoBindingsSummary(entry))}</span>
                            <span class="network-world-book__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-world-book__row" type="button" data-world-book-action="open-entry-triggered-preview">
                        <span class="network-world-book__row-label">已触发预览</span>
                        <span class="network-world-book__row-value-wrap">
                            <span class="network-world-book__row-value">${escapeHtml(getWorldBookTriggeredPreviewSummary())}</span>
                            <span class="network-world-book__row-arrow">›</span>
                        </span>
                    </button>
                </div>
            </div>
        `;
    }

    function renderEntryMainChatView() {
        const entry = getCurrentWorldBookEntry();
        return `
            <div class="network-world-book__content network-world-book__content--main-chat">
                <div class="network-world-book__editor-card">
                    <div class="network-world-book__field-grid">
                        <label class="network-world-book__field-group">
                            <span class="network-world-book__field-label">最近AI消息范围</span>
                            <input class="xp-input network-world-book__input" data-world-book-main-chat-field="contextN" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(state.pendingMainChatContextN)}" placeholder="最近AI消息范围">
                        </label>
                        <label class="network-world-book__field-group">
                            <span class="network-world-book__field-label">最近用户消息范围</span>
                            <input class="xp-input network-world-book__input" data-world-book-main-chat-field="userN" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(state.pendingMainChatUserN)}" placeholder="最近用户消息范围">
                        </label>
                    </div>
                </div>
                <div class="network-world-book__rows">
                    <button class="xp-list-row network-world-book__row" type="button" data-world-book-action="open-entry-main-chat-rules">
                        <span class="network-world-book__row-label">XML规则</span>
                        <span class="network-world-book__row-value-wrap">
                            <span class="network-world-book__row-value">${escapeHtml(state.pendingMainChatXmlRules.length ? `${state.pendingMainChatXmlRules.length}项` : '空')}</span>
                            <span class="network-world-book__row-arrow">›</span>
                        </span>
                    </button>
                    <button class="xp-list-row network-world-book__row" type="button" data-world-book-action="open-entry-main-chat-preview">
                        <span class="network-world-book__row-label">预览上下文</span>
                        <span class="network-world-book__row-value-wrap">
                            <span class="network-world-book__row-value">查看</span>
                            <span class="network-world-book__row-arrow">›</span>
                        </span>
                    </button>
                </div>
            </div>
        `;
    }

    function renderEntryMainChatRulesView() {
        const rules = cloneMainChatRules(state.pendingMainChatXmlRules);
        const rulesHtml = rules.length
            ? rules.map((rule, index) => `
                <div class="network-world-book__rule" data-world-book-rule-index="${index}">
                    <div class="network-world-book__rule-top">
                        <input class="xp-input network-world-book__rule-input" data-world-book-rule-field="tag" data-world-book-rule-index="${index}" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(rule.tag)}" placeholder="标签名">
                        <button class="xp-button xp-button--icon xp-button--danger network-world-book__rule-delete" type="button" data-world-book-action="delete-rule" data-world-book-rule-index="${index}">×</button>
                    </div>
                    <div class="network-world-book__rule-bottom">
                        <button class="xp-button xp-button--secondary network-world-book__rule-mode" type="button" data-world-book-action="toggle-rule-mode" data-world-book-rule-index="${index}">${escapeHtml(rule.mode === 'exclude' ? '排除最近N楼' : '最近N楼')}</button>
                        <input class="xp-input network-world-book__rule-n" data-world-book-rule-field="n" data-world-book-rule-index="${index}" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(rule.n)}" placeholder="N">
                    </div>
                </div>
            `).join('')
            : `
                <div class="network-world-book__empty">
                    <strong>无规则</strong>
                </div>
            `;

        return `
            <div class="network-world-book__content network-world-book__content--rules">
                <div class="network-world-book__rules" id="networkWorldBookRulesList">${rulesHtml}</div>
            </div>
        `;
    }

    function renderEntryMainChatPreviewView() {
        return `
            <div class="network-world-book__content network-world-book__content--preview">
                <div class="network-world-book__preview-card" id="networkWorldBookMainChatPreviewCard">
                    <pre class="network-world-book__preview-text">${escapeHtml(getMainChatPreviewText())}</pre>
                </div>
            </div>
        `;
    }

    function renderInfoBindingsView() {
        const bindings = Array.isArray(getCurrentWorldBookEntry()?.infoSourceBindings)
            ? getCurrentWorldBookEntry().infoSourceBindings
            : [];
        const bindingsHtml = bindings.length
            ? bindings.map((binding, index) => `
                <div class="xp-list-item network-world-book__binding-item ${state.selectedInfoBindingIndex === index ? 'is-selected' : ''}" data-world-book-binding-index="${index}">
                    <div class="network-world-book__binding-main">
                        <span class="network-world-book__binding-name">${escapeHtml(binding.sourceName || binding.sourceId)}</span>
                    </div>
                    <button class="xp-button xp-button--icon xp-button--danger network-world-book__delete-button" type="button" data-world-book-action="delete-binding" data-world-book-binding-index="${index}">×</button>
                </div>
            `).join('')
            : `
                <div class="network-world-book__empty">
                    <strong>暂无信息来源</strong>
                </div>
            `;

        return `
            <div class="network-world-book__content network-world-book__content--bindings">
                <div class="network-world-book__list" id="networkWorldBookBindingList">${bindingsHtml}</div>
            </div>
        `;
    }

    function renderInfoSourcePickerView() {
        const sources = getWorldBookInfoSourceOptions();
        if (!sources.length) {
            return `
                <div class="network-world-book__empty">
                    <strong>暂无信息来源</strong>
                </div>
            `;
        }

        return `
            <div class="network-world-book__content network-world-book__content--info-source-picker">
                <div class="network-world-book__list" id="networkWorldBookInfoSourceList">
                    ${sources.map((source, index) => `
                        <div class="xp-list-item network-world-book__picker-item ${state.selectedInfoSourceIndex === index ? 'is-selected' : ''}" data-world-book-info-source-index="${index}">
                            <div class="network-world-book__picker-main">
                                <span class="network-world-book__picker-name">${escapeHtml(source.name)}</span>
                                <span class="network-world-book__picker-meta">${escapeHtml(source.subtitle || getWorldBookScopeLabel(source.scope))}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderTriggeredPreviewView() {
        const previewText = String(state.triggeredPreviewText || '').trim();
        const statusText = String(state.triggeredPreviewStatus || '').trim();
        return `
            <div class="network-world-book__content network-world-book__content--triggered-preview">
                <div class="network-world-book__preview-card" id="networkWorldBookTriggeredPreviewCard">
                    <pre class="network-world-book__preview-text">${escapeHtml(previewText || statusText)}</pre>
                </div>
            </div>
        `;
    }

    function renderBody(settings = getSettings()) {
        if (state.view === 'picker') {
            return renderPickerView();
        }

        if (state.view === 'entry') {
            return renderEntryView();
        }

        if (state.view === 'entryMainChat') {
            return renderEntryMainChatView(settings);
        }

        if (state.view === 'entryMainChatRules') {
            return renderEntryMainChatRulesView();
        }

        if (state.view === 'entryMainChatPreview') {
            return renderEntryMainChatPreviewView();
        }

        if (state.view === 'entryInfoBindings') {
            return renderInfoBindingsView();
        }

        if (state.view === 'entryInfoSourcePicker') {
            return renderInfoSourcePickerView();
        }

        if (state.view === 'entryTriggeredPreview') {
            return renderTriggeredPreviewView();
        }

        return renderEntryList(settings);
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
            ? `<div class="network-world-book__actions">${renderActionButtons(headerConfig.actions)}</div>`
            : '';

        state.root.innerHTML = `
            <div class="network-world-book">
                <div class="network-world-book__main-panel">
                    <div class="network-world-book__header">
                        <div class="network-world-book__header-main">
                            <h2 class="network-world-book__title">${escapeHtml(headerConfig.title)}</h2>
                        </div>
                    </div>
                    <div class="network-world-book__body">
                        ${renderBody(settings)}
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
        restoreRenderScrollState();
    }

    function handleClick(event) {
        const actionButton = event.target.closest('[data-world-book-action]');
        if (actionButton && state.root && state.root.contains(actionButton)) {
            const action = String(actionButton.getAttribute('data-world-book-action') || '').trim();
            const entryId = String(actionButton.getAttribute('data-world-book-entry-id') || '').trim();
            const bindingIndex = Number(actionButton.getAttribute('data-world-book-binding-index'));
            const ruleIndex = Number(actionButton.getAttribute('data-world-book-rule-index'));

            switch (action) {
                case 'open-picker':
                    openWorldBookPicker();
                    return;
                case 'add-selected-picker':
                    addSelectedWorldBookFromPicker();
                    return;
                case 'back-picker':
                    closeWorldBookPicker();
                    return;
                case 'create-entry':
                    createWorldBookEntry();
                    return;
                case 'delete-entry':
                    deleteWorldBookEntry(entryId);
                    return;
                case 'back-list':
                    backToList();
                    return;
                case 'back-entry':
                    backToEntry();
                    return;
                case 'back-entry-main-chat':
                    backToEntryMainChat();
                    return;
                case 'open-entry-main-chat':
                    openEntryMainChat();
                    return;
                case 'save-entry-main-chat':
                    saveEntryMainChat();
                    return;
                case 'open-entry-main-chat-rules':
                    openEntryMainChatRules();
                    return;
                case 'open-entry-main-chat-preview':
                    openEntryMainChatPreview();
                    return;
                case 'add-rule':
                    addRule();
                    return;
                case 'toggle-rule-mode':
                    toggleRuleMode(ruleIndex);
                    return;
                case 'delete-rule':
                    deleteRule(ruleIndex);
                    return;
                case 'open-entry-info-bindings':
                    openEntryInfoBindings();
                    return;
                case 'open-info-source-picker':
                    openWorldBookInfoSourcePicker();
                    return;
                case 'back-info-source-picker':
                    closeWorldBookInfoSourcePicker();
                    return;
                case 'add-selected-info-source':
                    addSelectedWorldBookInfoSourceBinding();
                    return;
                case 'delete-binding':
                    deleteInfoBinding(bindingIndex);
                    return;
                case 'open-entry-triggered-preview':
                    openTriggeredPreview();
                    return;
                case 'refresh-triggered-preview':
                    refreshTriggeredPreview();
                    return;
                default:
                    break;
            }
        }

        const pickerItem = event.target.closest('[data-world-book-picker-index]');
        if (pickerItem && state.root && state.root.contains(pickerItem)) {
            const nextIndex = Number(pickerItem.getAttribute('data-world-book-picker-index'));
            state.selectedPickerIndex = Number.isFinite(nextIndex) ? nextIndex : -1;
            render();
            return;
        }

        const entryItem = event.target.closest('[data-world-book-entry-id]');
        if (entryItem && state.root && state.root.contains(entryItem) && !event.target.closest('[data-world-book-action="delete-entry"]')) {
            openWorldBookEntry(entryItem.getAttribute('data-world-book-entry-id') || '');
            return;
        }

        const infoSourceItem = event.target.closest('[data-world-book-info-source-index]');
        if (infoSourceItem && state.root && state.root.contains(infoSourceItem)) {
            const nextIndex = Number(infoSourceItem.getAttribute('data-world-book-info-source-index'));
            state.selectedInfoSourceIndex = Number.isFinite(nextIndex) ? nextIndex : -1;
            render();
            return;
        }

        const bindingItem = event.target.closest('[data-world-book-binding-index]');
        if (bindingItem && state.root && state.root.contains(bindingItem) && !event.target.closest('[data-world-book-action="delete-binding"]')) {
            const nextIndex = Number(bindingItem.getAttribute('data-world-book-binding-index'));
            state.selectedInfoBindingIndex = Number.isFinite(nextIndex) ? nextIndex : -1;
            render();
        }
    }

    function handleInput(event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
            return;
        }

        const fieldName = String(target.getAttribute('data-world-book-field') || '').trim();
        if (fieldName === 'name') {
            state.draftEntryName = target.value;
            return;
        }

        const mainChatFieldName = String(target.getAttribute('data-world-book-main-chat-field') || '').trim();
        if (mainChatFieldName === 'contextN') {
            state.pendingMainChatContextN = target.value;
            return;
        }
        if (mainChatFieldName === 'userN') {
            state.pendingMainChatUserN = target.value;
            return;
        }

        const ruleFieldName = String(target.getAttribute('data-world-book-rule-field') || '').trim();
        if (!ruleFieldName) {
            return;
        }

        const ruleIndex = Number(target.getAttribute('data-world-book-rule-index'));
        if (!Number.isFinite(ruleIndex) || ruleIndex < 0) {
            return;
        }

        state.pendingMainChatXmlRules = cloneMainChatRules(state.pendingMainChatXmlRules).map((rule, index) => {
            if (index !== ruleIndex) {
                return rule;
            }

            return {
                ...rule,
                [ruleFieldName]: target.value,
            };
        });
    }

    function bindEvents() {
        if (!state.root || state.isBound) {
            return;
        }

        state.root.addEventListener('click', handleClick);
        state.root.addEventListener('input', handleInput);
        state.isBound = true;
    }

    function mount(panelElement) {
        if (!panelElement) {
            return;
        }

        panelElement.innerHTML = '<div class="network-page__canvas network-page__canvas--world-book"></div>';
        state.root = panelElement.querySelector('.network-page__canvas--world-book');
        bindEvents();
        syncEditingEntryState();

        if (!state.unsubscribe && typeof networkData.subscribeAiSettings === 'function') {
            state.unsubscribe = networkData.subscribeAiSettings(() => {
                if (state.view === 'list' || state.view === 'entry' || state.view === 'entryInfoBindings' || state.view === 'entryInfoSourcePicker' || state.view === 'entryTriggeredPreview') {
                    syncEditingEntryState();
                }
                render();
            });
        }

        render();
    }

    networkData.getWorldBookSettingsLabel = function getWorldBookSettingsLabel(settings = getSettings()) {
        const entries = getWorldBookEntries(settings);
        return entries.length ? `${entries.length}本` : '空';
    };
    networkData.getAiWorldBookSettingsEntries = getWorldBookEntries;
    networkData.getAiCompatibleWorldBook = getCompatibleWorldBook;
    networkData.buildAiWorldBookTriggerText = buildWorldBookTriggerText;

    networkApp.worldBook = {
        mount,
        render,
        getState() {
            return { ...state };
        },
    };

    networkApp.pages.worldBook = {
        key: 'worldBook',
        label: '世界书',
        mount,
    };
})(window.NetworkShortcutApp);
