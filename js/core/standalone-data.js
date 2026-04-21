(function (app) {
    app.core = app.core || {};

    const STORAGE_KEY = 'network-shortcut.standaloneRuntime';
    const DEFAULT_DATA = {
        previewMessages: [
            {
                role: 'user',
                content: '我们今晚沿着海边步道散步吧，我想去码头旁的旧灯塔看看。',
            },
            {
                role: 'assistant',
                content: '<setting>夏末的海滨小镇被橙金色晚霞笼罩，海风里带着一点咸味。</setting>\n<memory>你提到过想在码头边喝一杯海盐拿铁，再等夜灯亮起。</memory>\n我已经把相机和薄外套都带上了。',
            },
            {
                role: 'user',
                content: '如果来得及，我们再去港口书店挑几张明信片。',
            },
            {
                role: 'assistant',
                content: '<mood>轻松、期待、带一点旅行结束前的不舍。</mood>\n那家书店晚上九点才关门，我们可以先去落日观景台，再回到书店慢慢挑。',
            },
        ],
        qq: {
            contacts: [
                {
                    name: '好友',
                    members: [
                        { id: 10001, name: '阿澄', remark: '海边搭子' },
                        { id: 10002, name: '小鱼', remark: '摄影社' },
                    ],
                },
                {
                    name: '群聊',
                    members: [
                        {
                            id: 20001,
                            type: 'group',
                            name: '落日码头群',
                            remark: '周末出行',
                            groupMembers: [
                                { memberId: 1, name: '我', remark: '', sourceKey: 'me' },
                                { memberId: 10001, name: '阿澄', remark: '海边搭子', sourceKey: 'contact:10001' },
                                { memberId: 10003, name: '夏栀', remark: '后勤', sourceKey: 'contact:10003' },
                            ],
                        },
                    ],
                },
            ],
            chatHistory: {
                '10001': [
                    { sender: 'friend', type: 'text', text: '可以呀，我顺便带上三脚架。' },
                    { sender: 'me', type: 'text', text: '那我们先去观景台，再去书店。' },
                    { sender: 'friend', type: 'text', text: '好，正好可以买几张明信片。' },
                ],
                '20001': [
                    { sender: 'system', type: 'text', text: '你加入了群聊“落日码头群”' },
                    { sender: 'other', senderMemberId: 10003, type: 'text', text: '我来带便携灯和驱蚊喷雾。' },
                    { sender: 'me', type: 'text', text: '集合地点还是老码头入口，别走错啦。' },
                ],
            },
            pendingMessages: {
                '10001': [
                    { sender: 'me', type: 'text', text: '今晚去灯塔下看落日吗？' },
                    { sender: 'me', type: 'image', text: '刚拍的海面颜色像橘子汽水。' },
                ],
                '20001': [
                    { sender: 'me', type: 'text', text: '大家记得带外套，海风会有点大。' },
                ],
            },
            me: { name: '我' },
            aiRequestContext: {
                chatIds: ['10001', '20001'],
                focusChatId: '10001',
                hasPendingMessages: true,
            },
            chatHistoryLimit: 10,
        },
        qzone: {
            postsById: {
                post_1: {
                    id: 'post_1',
                    authorSource: 'contact',
                    authorSourceKey: 'contact:10001',
                    authorName: '阿澄',
                    time: '今天 18:42',
                    device: 'iPhone 15',
                    views: 128,
                    likeNames: ['我', '夏栀', '小鱼'],
                    content: [
                        { type: 'text', text: '风把云吹成了很长的橘色丝带，今天的海边像电影最后一幕。' },
                        {
                            type: 'media',
                            media: [
                                {
                                    media: 'photo',
                                    summary: '码头尽头的晚霞',
                                    desc: '逆光下的海面被拉成了一条金色的路，木栈道边缘全是柔软的橙色反光。',
                                },
                            ],
                        },
                    ],
                    comments: [
                        {
                            id: 'comment_1',
                            authorSource: 'owner',
                            authorSourceKey: 'me',
                            authorName: '我',
                            content: '这张真的很好看！',
                            time: '今天 18:50',
                            replies: [
                                {
                                    id: 'comment_1_reply_1',
                                    replyToCommentId: 'comment_1',
                                    authorSource: 'contact',
                                    authorSourceKey: 'contact:10001',
                                    authorName: '阿澄',
                                    content: '下次一起去拍，我把滤镜也带上。',
                                    time: '今天 18:53',
                                },
                            ],
                        },
                    ],
                },
                post_2: {
                    id: 'post_2',
                    authorSource: 'contact',
                    authorSourceKey: 'contact:10002',
                    authorName: '小鱼',
                    time: '昨天 21:18',
                    device: 'HarmonyOS',
                    views: 86,
                    likeNames: ['我', '阿澄'],
                    content: [
                        { type: 'text', text: '港口书店二楼新摆了一整排旅行地图，窗边的位置还能看到灯塔。' },
                    ],
                    comments: [
                        {
                            id: 'comment_2',
                            authorSource: 'owner',
                            authorSourceKey: 'me',
                            authorName: '我',
                            content: '那我今天顺路过去看看。',
                            time: '昨天 21:20',
                            replies: [],
                        },
                    ],
                },
            },
            mainFeedPostIds: ['post_1', 'post_2'],
            contactsBySourceKey: {
                'contact:10001': { name: '阿澄', remark: '海边搭子' },
                'contact:10002': { name: '小鱼', remark: '摄影社' },
                'contact:10003': { name: '夏栀', remark: '后勤' },
            },
        },
        worldBooks: [
            {
                name: '海滨小镇设定',
                scope: 'global',
                ownerId: '',
                entries: [
                    {
                        index: 0,
                        name: '落日观景台',
                        content: '观景台位于旧灯塔旁，傍晚能看到整片海岸线被夕阳染成金色。',
                        enabled: true,
                        activationMode: 'always',
                        key: [],
                        secondaryKey: [],
                    },
                    {
                        index: 1,
                        name: '港口书店',
                        content: '港口书店晚上九点闭店，一层卖明信片和旅行笔记，二层靠窗位置能看到码头。',
                        enabled: true,
                        activationMode: 'keyword',
                        key: ['书店', '明信片', '港口书店'],
                        secondaryKey: [],
                    },
                    {
                        index: 2,
                        name: '海盐拿铁',
                        content: '海边咖啡馆的招牌饮品，表面撒有细盐和橙皮屑，适合傍晚外带。',
                        enabled: true,
                        activationMode: 'keyword',
                        key: ['海盐拿铁', '咖啡'],
                        secondaryKey: [],
                    },
                ],
            },
            {
                name: '码头夜行角色设定',
                scope: 'character',
                ownerId: 'sample-character',
                entries: [
                    {
                        index: 0,
                        name: '阿澄',
                        content: '阿澄擅长摄影，讲话温柔，习惯把旅行细节记在随身的小本子上。',
                        enabled: true,
                        activationMode: 'keyword',
                        key: ['阿澄', '三脚架', '摄影'],
                        secondaryKey: [],
                    },
                ],
            },
            {
                name: '落日散步聊天设定',
                scope: 'chat',
                ownerId: 'sample-chat',
                entries: [
                    {
                        index: 0,
                        name: '夜灯',
                        content: '海边夜灯会在 19:10 左右亮起，码头木板在灯下会反出温暖的琥珀色。',
                        enabled: true,
                        activationMode: 'keyword',
                        key: ['夜灯', '码头', '灯塔'],
                        secondaryKey: [],
                    },
                ],
            },
        ],
    };

    function cloneDefaultData() {
        return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    function normalizePreviewMessages(messages) {
        return Array.isArray(messages)
            ? messages.map((item) => ({
                role: String(item?.role || '').trim().toLowerCase(),
                content: String(item?.content || '').trim(),
            })).filter((item) => item.role && item.content)
            : [];
    }

    function normalizeStandaloneWorldBooks(worldBooks) {
        if (!Array.isArray(worldBooks)) {
            return [];
        }

        return worldBooks.map((book, bookIndex) => ({
            name: String(book?.name || '').trim(),
            scope: String(book?.scope || 'global').trim() || 'global',
            ownerId: String(book?.ownerId || '').trim(),
            entries: Array.isArray(book?.entries)
                ? book.entries.map((entry, entryIndex) => ({
                    index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : entryIndex,
                    name: String(entry?.name || '').trim(),
                    content: String(entry?.content || '').trim(),
                    enabled: entry?.enabled !== false,
                    activationMode: String(entry?.activationMode || '').trim() || 'keyword',
                    key: Array.isArray(entry?.key) ? entry.key.map((item) => String(item || '').trim()).filter(Boolean) : [],
                    secondaryKey: Array.isArray(entry?.secondaryKey) ? entry.secondaryKey.map((item) => String(item || '').trim()).filter(Boolean) : [],
                    caseSensitive: entry?.caseSensitive == null ? null : !!entry.caseSensitive,
                }))
                : [],
        })).filter((book) => book.name);
    }

    function normalizeData(source) {
        const next = source && typeof source === 'object' ? source : {};
        const merged = cloneDefaultData();

        if (Array.isArray(next.previewMessages)) {
            merged.previewMessages = normalizePreviewMessages(next.previewMessages);
        }

        if (next.qq && typeof next.qq === 'object') {
            merged.qq = {
                ...merged.qq,
                ...next.qq,
                contacts: Array.isArray(next.qq.contacts) ? next.qq.contacts : merged.qq.contacts,
                chatHistory: next.qq.chatHistory && typeof next.qq.chatHistory === 'object' ? next.qq.chatHistory : merged.qq.chatHistory,
                pendingMessages: next.qq.pendingMessages && typeof next.qq.pendingMessages === 'object' ? next.qq.pendingMessages : merged.qq.pendingMessages,
                me: next.qq.me && typeof next.qq.me === 'object' ? next.qq.me : merged.qq.me,
            };
        }

        if (next.qzone && typeof next.qzone === 'object') {
            merged.qzone = {
                ...merged.qzone,
                ...next.qzone,
                postsById: next.qzone.postsById && typeof next.qzone.postsById === 'object' ? next.qzone.postsById : merged.qzone.postsById,
                mainFeedPostIds: Array.isArray(next.qzone.mainFeedPostIds) ? next.qzone.mainFeedPostIds : merged.qzone.mainFeedPostIds,
                contactsBySourceKey: next.qzone.contactsBySourceKey && typeof next.qzone.contactsBySourceKey === 'object' ? next.qzone.contactsBySourceKey : merged.qzone.contactsBySourceKey,
            };
        }

        if (Array.isArray(next.worldBooks)) {
            merged.worldBooks = normalizeStandaloneWorldBooks(next.worldBooks);
        }

        return merged;
    }

    function loadStandaloneSocialData() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return normalizeData(raw ? JSON.parse(raw) : null);
        } catch (error) {
            return cloneDefaultData();
        }
    }

    function saveStandaloneSocialData(data) {
        const normalized = normalizeData(data);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (error) {
            // ignore
        }
        return normalized;
    }

    let cachedData = loadStandaloneSocialData();

    function getStandaloneSocialData() {
        return cachedData;
    }

    function setStandaloneSocialData(data) {
        cachedData = saveStandaloneSocialData(data);
        return cachedData;
    }

    app.core.getStandaloneSocialData = getStandaloneSocialData;
    app.core.setStandaloneSocialData = setStandaloneSocialData;
})(window.NetworkShortcutApp);
