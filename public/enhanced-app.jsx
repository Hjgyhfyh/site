(() => {
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const MODEL_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
    const FALLBACK_AGENTS = [
        {
            id: 'roblox-scripts',
            name: 'Скрипты Роблокс',
            icon: '🎮',
            description: 'Помощник по скриптам для Roblox',
        },
    ];

    function renderMarkdown(text) {
        if (!text) return '';
        // 1. Extract code blocks BEFORE escaping HTML
        const codeBlocks = [];
        let src = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            const idx = codeBlocks.length;
            const id = 'cb_' + Math.random().toString(36).slice(2, 8);
            const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            codeBlocks.push(`<pre><div class="code-header"><span>${lang || 'code'}</span><button class="copy-btn" onclick="var b=this;navigator.clipboard.writeText(document.getElementById('${id}').textContent).then(function(){b.textContent='✓';setTimeout(function(){b.textContent='copy'},800)})">copy</button></div><code id="${id}">${escaped}</code></pre>`);
            return `%%CODEBLOCK_${idx}%%`;
        });
        // 2. Escape HTML in remaining text
        src = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // 3. Inline code
        src = src.replace(/`([^`]+)`/g, '<code>$1</code>');
        // 4. Bold / italic
        src = src.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        src = src.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // 5. Headings
        src = src.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        src = src.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        src = src.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        // 6. Lists
        src = src.replace(/^- (.+)$/gm, '<li>$1</li>');
        src = src.replace(/((?:<li>.*<\/li>\s*)+)/gs, '<ul>$1</ul>');
        // 7. Blockquotes
        src = src.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        // 8. Links
        src = src.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        // 9. Horizontal rule
        src = src.replace(/^---$/gm, '<hr/>');
        // 10. Newlines to <br/>, then trim leading ones
        src = src.replace(/\n/g, '<br/>');
        src = src.replace(/^(<br\/>)+/, '');
        // 11. Restore code blocks
        codeBlocks.forEach((block, idx) => {
            src = src.replace(`%%CODEBLOCK_${idx}%%`, block);
        });
        return src;
    }

    function getModelColor(m) {
        const n = (m || '').toLowerCase();
        if (n.includes('llama')) return '#a78bfa';
        if (n.includes('mistral') || n.includes('mixtral')) return '#f59e0b';
        if (n.includes('gemma') || n.includes('gemini')) return '#34d399';
        if (n.includes('claude')) return '#fb923c';
        if (n.includes('arctic') || n.includes('snowflake')) return '#38bdf8';
        if (n.includes('jamba')) return '#f472b6';
        if (n.includes('reka')) return '#a3e635';
        if (n.includes('deep')) return '#818cf8';
        if (n.includes('openai') || n.includes('gpt')) return '#10b981';
        if (n.includes('codestral')) return '#c084fc';
        if (n.includes('pixtral')) return '#e879f9';
        return '#8b8b9e';
    }
    function getModelInitial(m) {
        const n = (m || '').toLowerCase();
        if (n.includes('llama')) return 'L';
        if (n.includes('mistral')) return 'M';
        if (n.includes('gemma') || n.includes('gemini')) return 'G';
        if (n.includes('claude')) return 'C';
        if (n.includes('arctic') || n.includes('snowflake')) return 'S';
        if (n.includes('jamba')) return 'J';
        if (n.includes('reka')) return 'R';
        if (n.includes('deep')) return 'D';
        if (n.includes('openai') || n.includes('gpt')) return 'O';
        return m ? m[0].toUpperCase() : '?';
    }
    function getModelCaps(m) {
        const n = (m || '').toUpperCase();
        const c = [];
        if (n.includes('SENTIMENT')) c.push({ i: '😊', l: 'Sentiment' });
        if (n.includes('TRANSLATE')) c.push({ i: '🌐', l: 'Translate' });
        if (n.includes('EXTRACT') || n.includes('PARSE')) c.push({ i: '📄', l: 'Documents' });
        if (n.includes('TRANSCRIBE') || n.includes('PEGASUS')) c.push({ i: '🎙️', l: 'Audio' });
        if (n.includes('TEXT2SQL')) c.push({ i: '🗃️', l: 'SQL' });
        if (n.includes('CODESTRAL') || n.includes('DEEPSEEK')) c.push({ i: '💻', l: 'Code' });
        if (n.includes('GUARD')) c.push({ i: '🛡️', l: 'Safety' });
        return c;
    }
    function isToolModel(m) { const t = ['SENTIMENT', 'TRANSLATE', 'EXTRACT', 'PARSE', 'TRANSCRIBE', 'TEXT2SQL', 'GUARD', 'PEGASUS']; const u = (m || '').toUpperCase(); return t.some(k => u.includes(k)); }
    function getFileIcon(name) { const e = (name || '').split('.').pop().toLowerCase(); const map = { pdf: '📕', doc: '📘', docx: '📘', txt: '📄', csv: '📊', xls: '📊', xlsx: '📊', json: '📋', js: '⚡', py: '🐍', html: '🌐', css: '🎨', md: '📝', zip: '📦', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', mp3: '🎵', wav: '🎵', mp4: '🎬' }; return map[e] || '📄'; }
    function formatFileSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'; return (b / 1048576).toFixed(1) + 'MB'; }
    function toSafeArray(v) { if (Array.isArray(v)) return v; if (v instanceof Set) return Array.from(v); if (v && typeof v[Symbol.iterator] === 'function') { try { return Array.from(v); } catch { return []; } } return []; }
    function toDefaultModelsMap(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    function parseDefaultModels(raw) { try { return toDefaultModelsMap(JSON.parse(raw || '{}')); } catch { return {}; } }
    function toFavoriteModelSet(v) { if (v instanceof Set) return new Set(Array.from(v)); if (Array.isArray(v)) return new Set(v); if (v && typeof v === 'object') return new Set(Object.keys(v).filter(k => v[k])); return new Set(); }
    function parseFavoriteModels(raw) { try { return toFavoriteModelSet(JSON.parse(raw || '[]')); } catch { return new Set(); } }

    function App() {
        const [currentUser, setCurrentUser] = useState(null);
        const [authChecking, setAuthChecking] = useState(true);
        const [authLoading, setAuthLoading] = useState(false);
        const [authMode, setAuthMode] = useState('login');
        const [authUsername, setAuthUsername] = useState(() => localStorage.getItem('arena_last_username') || '');
        const [authPassword, setAuthPassword] = useState('');
        const [authError, setAuthError] = useState('');
        const [onlineAccountsCount, setOnlineAccountsCount] = useState(0);
        const [backendVersion, setBackendVersion] = useState('');
        const [bootstrapErrors, setBootstrapErrors] = useState([]);
        const [models, setModels] = useState([]);
        const [agents, setAgents] = useState([]);
        const [chats, setChats] = useState([]);
        const [activeChatId, setActiveChatId] = useState(null);
        const [selectedModel, setSelectedModel] = useState('');
        const [activeAgent, setActiveAgent] = useState(null); // agent id or null
        const [input, setInput] = useState('');
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState('');
        const [sidebarOpen, setSidebarOpen] = useState(true);
        const [sidebarSearch, setSidebarSearch] = useState('');
        const [sidebarTab, setSidebarTab] = useState('chats'); // 'chats' | 'agents'
        const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
        const [modelSearch, setModelSearch] = useState('');
        const [copiedIdx, setCopiedIdx] = useState(null);
        const [regeneratingIdx, setRegeneratingIdx] = useState(null);
        const [toast, setToast] = useState('');
        const [settingsOpen, setSettingsOpen] = useState(false);
        const [instructionsOpen, setInstructionsOpen] = useState(false);
        const [customInstructions, setCustomInstructions] = useState(() => localStorage.getItem('arena_instructions') || '');
        const [instructionsDraft, setInstructionsDraft] = useState('');
        const [defaultModels, setDefaultModels] = useState(() => parseDefaultModels(localStorage.getItem('arena_defaultModels')));
        const [favoriteModels, setFavoriteModels] = useState(() => parseFavoriteModels(localStorage.getItem('arena_favorites')));
        const [attachedFiles, setAttachedFiles] = useState([]);
        const [loadingTime, setLoadingTime] = useState(0);
        const [failedAction, setFailedAction] = useState(null);

        const messagesEndRef = useRef(null);
        const inputRef = useRef(null);
        const fileInputRef = useRef(null);
        const modelDropdownRef = useRef(null);
        const modelSearchRef = useRef(null);
        const requestAbortRef = useRef(null);
        const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); }, []);

        const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
        useEffect(() => { const h = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);

        const activeChat = useMemo(() => chats.find(c => c.id === activeChatId) || null, [chats, activeChatId]);
        const currentAgent = useMemo(() => agents.find(a => a.id === activeAgent) || null, [agents, activeAgent]);
        const favoriteModelSet = useMemo(() => toFavoriteModelSet(favoriteModels), [favoriteModels]);
        const backendVersionShort = useMemo(() => {
            if (!backendVersion) return '';
            return backendVersion.replace('T', ' ').slice(0, 19);
        }, [backendVersion]);

        useEffect(() => { if (!loading) { setLoadingTime(0); return; } const start = Date.now(); const iv = setInterval(() => setLoadingTime(((Date.now() - start) / 1000).toFixed(1)), 100); return () => clearInterval(iv); }, [loading]);
        useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat?.messages?.length, loading]);

        const resetInputHeight = useCallback(() => {
            if (!inputRef.current) return;
            inputRef.current.style.height = 'auto';
            inputRef.current.scrollTop = 0;
        }, []);

        const syncInputHeight = useCallback(() => {
            if (!inputRef.current) return;
            inputRef.current.style.height = 'auto';
            if (!inputRef.current.value.trim()) {
                inputRef.current.scrollTop = 0;
                return;
            }
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
        }, []);

        const fetchJson = useCallback(async (url, options = {}) => {
            const resp = await fetch(url, options);
            let data = null;
            try { data = await resp.json(); } catch { data = null; }

            if (resp.status === 401) {
                setCurrentUser(null);
                throw new Error('Требуется вход');
            }
            if (!resp.ok) throw new Error((data && data.error) || resp.statusText || 'Error');
            return data;
        }, []);

        const postJson = useCallback(async (url, body, signal) => {
            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; controller.abort(); }, MODEL_REQUEST_TIMEOUT_MS);

            const onAbort = () => controller.abort();
            if (signal) {
                if (signal.aborted) controller.abort();
                else signal.addEventListener('abort', onAbort);
            }

            try {
                return await fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            } catch (e) {
                if (timedOut && !(signal && signal.aborted)) {
                    throw new Error('Модель отвечает слишком долго (таймаут 10 минут). Попробуйте короче запрос или другую модель.');
                }
                throw e;
            } finally {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', onAbort);
            }
        }, [fetchJson]);

        useEffect(() => {
            let cancelled = false;
            (async () => {
                try {
                    const data = await fetchJson('/api/auth/me');
                    if (!cancelled) setCurrentUser(data?.user || null);
                } catch {
                    if (!cancelled) setCurrentUser(null);
                } finally {
                    if (!cancelled) setAuthChecking(false);
                }
            })();
            return () => { cancelled = true; };
        }, [fetchJson]);

        useEffect(() => {
            if (!currentUser) return;
            let cancelled = false;
            (async () => {
                const [versionRes, modelsRes, chatsRes, agentsRes] = await Promise.allSettled([
                    fetchJson('/api/version'),
                    fetchJson('/api/models'),
                    fetchJson('/api/chats'),
                    fetchJson('/api/agents'),
                ]);

                if (cancelled) return;

                const errors = [];

                if (versionRes.status === 'fulfilled') {
                    setBackendVersion(String(versionRes.value?.version || ''));
                } else {
                    setBackendVersion('');
                    errors.push('version');
                }

                const validModels = modelsRes.status === 'fulfilled' && Array.isArray(modelsRes.value)
                    ? modelsRes.value
                    : [];
                if (modelsRes.status !== 'fulfilled') errors.push('models');

                const validChats = chatsRes.status === 'fulfilled' && Array.isArray(chatsRes.value)
                    ? chatsRes.value
                    : [];
                if (chatsRes.status !== 'fulfilled') errors.push('chats');

                const validAgents = agentsRes.status === 'fulfilled' && Array.isArray(agentsRes.value) && agentsRes.value.length > 0
                    ? agentsRes.value
                    : FALLBACK_AGENTS;
                if (agentsRes.status !== 'fulfilled' || !Array.isArray(agentsRes.value) || agentsRes.value.length === 0) errors.push('agents');

                setModels(validModels);
                setChats(validChats);
                setAgents(validAgents);
                setBootstrapErrors(errors);

                if (errors.length > 0) {
                    showToast(`Проблема API: ${errors.join(', ')}. Включен резервный режим.`);
                }

                if (validModels.length > 0) {
                    setSelectedModel(prev => {
                        if (prev && validModels.includes(prev)) return prev;
                        const saved = localStorage.getItem('arena_model');
                        return saved && validModels.includes(saved) ? saved : validModels[0];
                    });
                }
            })();
            return () => { cancelled = true; };
        }, [currentUser, fetchJson, showToast]);

        useEffect(() => {
            if (!currentUser) return;
            const ping = () => { fetch('/api/auth/ping', { method: 'POST' }).catch(() => { }); };
            ping();
            const iv = setInterval(ping, 25000);
            return () => clearInterval(iv);
        }, [currentUser]);

        useEffect(() => {
            if (!input.trim()) {
                resetInputHeight();
                return;
            }
            syncInputHeight();
        }, [input, activeChatId, resetInputHeight, syncInputHeight]);

        useEffect(() => {
            if (!currentUser || (currentUser.username || '').toLowerCase() !== 'godli') {
                setOnlineAccountsCount(0);
                return;
            }

            const es = new EventSource('/api/auth/online-count');
            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data || '{}');
                    if (typeof data.count === 'number') setOnlineAccountsCount(data.count);
                } catch { }
            };
            es.onerror = () => { };
            return () => es.close();
        }, [currentUser]);

        useEffect(() => {
            if (currentUser) return;
            setChats([]);
            setAgents([]);
            setBootstrapErrors([]);
            setBackendVersion('');
            setActiveChatId(null);
            setLoading(false);
            setError('');
            setFailedAction(null);
        }, [currentUser]);

        useEffect(() => { const h = e => { if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) setModelDropdownOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
        useEffect(() => { if (modelDropdownOpen && modelSearchRef.current) modelSearchRef.current.focus(); }, [modelDropdownOpen]);

        const saveChat = useCallback((chat) => {
            if (!currentUser) return;
            fetchJson('/api/chats/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chat) }).catch(() => { });
        }, [currentUser, fetchJson]);
        const sidebarWidth = sidebarOpen ? 260 : 0;

        const filteredChats = useMemo(() => { const list = toSafeArray(chats); if (!sidebarSearch) return list; const s = sidebarSearch.toLowerCase(); return list.filter(c => (c.title || '').toLowerCase().includes(s)); }, [chats, sidebarSearch]);
        const groupedChats = useMemo(() => { const g = {}; const now = new Date(); const sorted = toSafeArray(filteredChats).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); sorted.forEach(c => { const d = new Date(c.createdAt || 0); const diff = (now - d) / 86400000; const l = diff < 1 ? 'Today' : diff < 7 ? 'This Week' : diff < 30 ? 'This Month' : 'Older'; if (!g[l]) g[l] = []; g[l].push(c); }); return g; }, [filteredChats]);
        const filteredModels = useMemo(() => {
            let list = toSafeArray(models).slice();
            const favSet = toFavoriteModelSet(favoriteModelSet);
            const favArr = Array.from(favSet);
            list.sort((a, b) => { const af = favArr.includes(a) ? 0 : 1; const bf = favArr.includes(b) ? 0 : 1; return af - bf; });
            if (modelSearch) { const s = modelSearch.toLowerCase(); list = list.filter(m => m.toLowerCase().includes(s)); }
            return list;
        }, [models, modelSearch, favoriteModelSet]);

        const newChat = useCallback(() => {
            setActiveChatId(null);
            setInput('');
            resetInputHeight();
            setError('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }, [resetInputHeight]);
        const selectChat = useCallback((id) => { setActiveChatId(id); setError(''); if (isMobile) setSidebarOpen(false); }, [isMobile]);
        const deleteChat = useCallback((id, e) => {
            e.stopPropagation();
            setChats(p => p.filter(c => c.id !== id));
            if (activeChatId === id) setActiveChatId(null);
            fetchJson('/api/chats/' + id, { method: 'DELETE' }).catch(() => { });
        }, [activeChatId, fetchJson]);
        const selectModel = useCallback((m) => { setSelectedModel(m); localStorage.setItem('arena_model', m); setModelDropdownOpen(false); }, []);
        const toggleFavorite = useCallback((m, e) => {
            e.stopPropagation();
            setFavoriteModels(prev => {
                const base = toFavoriteModelSet(prev);
                const next = new Set(base);
                if (next.has(m)) next.delete(m); else next.add(m);
                localStorage.setItem('arena_favorites', JSON.stringify(Array.from(next)));
                return next;
            });
        }, []);
        const updateDefaultModel = useCallback((key, value) => { setDefaultModels(prev => { const base = toDefaultModelsMap(prev); const next = { ...base, [key]: value }; localStorage.setItem('arena_defaultModels', JSON.stringify(next)); return next; }); }, []);
        const copyMessage = useCallback((content, idx) => { navigator.clipboard.writeText(content).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500); }); }, []);
        const handleFileUpload = useCallback(() => fileInputRef.current?.click(), []);
        const removeFile = useCallback((id) => setAttachedFiles(p => p.filter(f => f.id !== id)), []);
        const onFileSelected = useCallback((e) => { const files = Array.from(e.target.files || []); files.forEach(file => { const id = generateId(); const isImage = file.type.startsWith('image/'); if (isImage) { const r = new FileReader(); r.onload = (ev) => setAttachedFiles(p => [...p, { id, name: file.name, size: file.size, type: 'image', preview: ev.target.result }]); r.readAsDataURL(file); } else { const r = new FileReader(); r.onload = (ev) => setAttachedFiles(p => [...p, { id, name: file.name, size: file.size, type: 'file', content: ev.target.result }]); r.readAsText(file); } }); e.target.value = ''; }, []);
        const handleInputChange = useCallback((e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            if (!e.target.value.trim()) {
                e.target.scrollTop = 0;
                return;
            }
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
        }, []);
        const handleKeyDown = useCallback((e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }, [input, loading, selectedModel, activeChat, attachedFiles]);

        const saveInstructions = useCallback(() => { setCustomInstructions(instructionsDraft); localStorage.setItem('arena_instructions', instructionsDraft); setInstructionsOpen(false); showToast('Инструкции сохранены'); }, [instructionsDraft, showToast]);
        const stopGeneration = useCallback(() => {
            if (requestAbortRef.current) requestAbortRef.current.abort();
        }, []);

        const submitAuth = useCallback(async (e) => {
            e.preventDefault();
            const username = authUsername.trim();
            const password = authPassword;
            if (!username || !password) {
                setAuthError('Введите логин и пароль');
                return;
            }

            setAuthLoading(true);
            setAuthError('');

            try {
                const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) throw new Error(data.error || 'Ошибка авторизации');
                if (!data?.user) throw new Error('Сервер не вернул пользователя');

                localStorage.setItem('arena_last_username', data.user.username || username);
                setCurrentUser(data.user);
                setAuthPassword('');
                setError('');
                setFailedAction(null);
                setInput('');
                resetInputHeight();
            } catch (err) {
                setAuthError(err.message || 'Ошибка авторизации');
            } finally {
                setAuthLoading(false);
            }
        }, [authMode, authPassword, authUsername, resetInputHeight]);

        const logout = useCallback(async () => {
            try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { }
            if (requestAbortRef.current) requestAbortRef.current.abort();
            setCurrentUser(null);
            setAuthPassword('');
            showToast('Вы вышли из аккаунта');
        }, [showToast]);

        const regenerateResponse = useCallback(async (msgIdx) => {
            if (!activeChat || loading || regeneratingIdx !== null) return;
            setRegeneratingIdx(msgIdx);
            try {
                const msgs = activeChat.messages.slice(0, msgIdx);
                const request = {
                    model: activeChat.messages[msgIdx]?.model || selectedModel,
                    messages: msgs.map(m => ({ role: m.role, content: m.content })),
                    customInstructions: customInstructions || undefined,
                    agentId: activeAgent || undefined,
                };
                const data = await postJson('/api/chat/regenerate', request);
                setChats(p => { const i = p.findIndex(c => c.id === activeChat.id); if (i < 0) return p; const u = [...p]; const msgs2 = [...(Array.isArray(u[i].messages) ? u[i].messages : [])]; const old = msgs2[msgIdx]; const variants = old.variants || [{ content: old.content, model: old.model }]; variants.push({ content: data.response, model: old.model || selectedModel }); msgs2[msgIdx] = { ...old, content: data.response, variants, activeVariant: variants.length - 1, inputTokens: data.inputTokens, outputTokens: data.outputTokens }; u[i] = { ...u[i], messages: msgs2 }; saveChat(u[i]); return u; });
                setFailedAction(null);
            } catch (e) {
                if (e?.name === 'AbortError') {
                    setError('');
                    showToast('Генерация остановлена');
                } else {
                    const errMsg = e.message || 'Ошибка';
                    setError(errMsg);
                    showToast(errMsg);
                    setFailedAction({
                        type: 'regenerate',
                        chatId: activeChat.id,
                        msgIdx,
                        request: {
                            model: activeChat.messages[msgIdx]?.model || selectedModel,
                            messages: activeChat.messages.slice(0, msgIdx).map(m => ({ role: m.role, content: m.content })),
                            customInstructions: customInstructions || undefined,
                            agentId: activeAgent || undefined,
                        },
                    });
                }
            } finally { setRegeneratingIdx(null); }
        }, [activeChat, loading, regeneratingIdx, selectedModel, saveChat, customInstructions, activeAgent, postJson, showToast]);

        const switchVariant = useCallback((msgIdx, dir) => { setChats(p => { const i = p.findIndex(c => c.id === activeChat?.id); if (i < 0) return p; const u = [...p]; const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])]; const msg = { ...msgs[msgIdx] }; if (!msg.variants) return p; const nv = (msg.activeVariant || 0) + dir; if (nv < 0 || nv >= msg.variants.length) return p; msg.activeVariant = nv; msg.content = msg.variants[nv].content; msgs[msgIdx] = msg; u[i] = { ...u[i], messages: msgs }; return u; }); }, [activeChat]);

        const sendMessage = useCallback(async () => {
            const text = input.trim();
            if ((!text && attachedFiles.length === 0) || loading || !selectedModel || !currentUser) return;
            setError('');
            setFailedAction(null);
            setLoading(true);
            setInput('');
            resetInputHeight();
            let aiContent = '';
            const imgs = [];
            attachedFiles.forEach(f => { if (f.type === 'image') { imgs.push({ name: f.name, data: f.preview }); } else { aiContent += '[File: ' + f.name + ']\n' + f.content + '\n\n'; } });
            aiContent += text;
            const fileMetas = attachedFiles.map(f => ({ name: f.name, size: f.size, type: f.type }));
            const userMsg = { role: 'user', content: aiContent, images: imgs.length ? imgs : undefined, displayText: text, files: fileMetas.length > 0 ? fileMetas : undefined };
            setAttachedFiles([]);
            let chat;
            if (activeChat) { chat = { ...activeChat, messages: [...(Array.isArray(activeChat.messages) ? activeChat.messages : []), userMsg] }; }
            else { chat = { id: generateId(), title: text.slice(0, 60) || attachedFiles[0]?.name || 'Chat', model: selectedModel, agentId: activeAgent || undefined, messages: [userMsg], createdAt: new Date().toISOString() }; }
            setChats(p => { const i = p.findIndex(c => c.id === chat.id); if (i >= 0) { const u = [...p]; u[i] = chat; return u; } return [chat, ...p]; });
            setActiveChatId(chat.id);

            const request = { model: selectedModel, messages: chat.messages.map(m => ({ role: m.role, content: m.content })), customInstructions: customInstructions || undefined, agentId: activeAgent || undefined };

            try {
                const assistantMsg = { role: 'assistant', content: '', model: selectedModel };
                setChats(p => { const i = p.findIndex(c => c.id === chat.id); if (i < 0) return p; const u = [...p]; u[i] = { ...u[i], messages: [...(Array.isArray(u[i].messages) ? u[i].messages : []), assistantMsg] }; return u; });
                const controller = new AbortController();
                requestAbortRef.current = controller;
                const data = await postJson('/api/chat', request, controller.signal);
                setChats(p => { const i = p.findIndex(c => c.id === chat.id); if (i < 0) return p; const u = [...p]; const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])]; const lastMsg = { ...msgs[msgs.length - 1] }; lastMsg.content = data.response; lastMsg.inputTokens = data.inputTokens; lastMsg.outputTokens = data.outputTokens; msgs[msgs.length - 1] = lastMsg; u[i] = { ...u[i], messages: msgs }; saveChat(u[i]); return u; });
                setFailedAction(null);
            } catch (e) {
                if (e?.name === 'AbortError') {
                    setError('');
                    showToast('Генерация остановлена');
                } else {
                    const errMsg = e.message || String(e);
                    setError(errMsg);
                    showToast(errMsg);
                    setFailedAction({ type: 'send', chatId: chat.id, request });
                }
                setChats(p => { const i = p.findIndex(c => c.id === chat.id); if (i < 0) return p; const u = [...p]; const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])]; if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && !msgs[msgs.length - 1].content) msgs.pop(); u[i] = { ...u[i], messages: msgs }; return u; });
            } finally {
                requestAbortRef.current = null;
                setLoading(false);
            }
        }, [input, loading, selectedModel, activeChat, attachedFiles, saveChat, customInstructions, activeAgent, currentUser, postJson, resetInputHeight, showToast]);

        const retryFailedAction = useCallback(async () => {
            if (!failedAction || loading || regeneratingIdx !== null) return;
            setError('');

            if (failedAction.type === 'send') {
                const chatId = failedAction.chatId;
                setLoading(true);
                setChats(p => {
                    const i = p.findIndex(c => c.id === chatId);
                    if (i < 0) return p;
                    const u = [...p];
                    const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])];
                    const last = msgs[msgs.length - 1];
                    if (!last || last.role !== 'assistant') msgs.push({ role: 'assistant', content: '', model: failedAction.request.model || selectedModel });
                    u[i] = { ...u[i], messages: msgs };
                    return u;
                });

                try {
                    const controller = new AbortController();
                    requestAbortRef.current = controller;
                    const data = await postJson('/api/chat', failedAction.request, controller.signal);
                    setChats(p => {
                        const i = p.findIndex(c => c.id === chatId);
                        if (i < 0) return p;
                        const u = [...p];
                        const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])];
                        if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
                            msgs.push({ role: 'assistant', content: data.response, model: failedAction.request.model || selectedModel, inputTokens: data.inputTokens, outputTokens: data.outputTokens });
                        } else {
                            const lastMsg = { ...msgs[msgs.length - 1] };
                            lastMsg.content = data.response;
                            lastMsg.inputTokens = data.inputTokens;
                            lastMsg.outputTokens = data.outputTokens;
                            msgs[msgs.length - 1] = lastMsg;
                        }
                        u[i] = { ...u[i], messages: msgs };
                        saveChat(u[i]);
                        return u;
                    });
                    setFailedAction(null);
                } catch (e) {
                    if (e?.name === 'AbortError') {
                        setError('');
                        showToast('Генерация остановлена');
                    } else {
                        const errMsg = e.message || 'Ошибка';
                        setError(errMsg);
                        showToast(errMsg);
                    }
                } finally {
                    requestAbortRef.current = null;
                    setLoading(false);
                }
                return;
            }

            if (failedAction.type === 'regenerate') {
                const { chatId, msgIdx } = failedAction;
                setRegeneratingIdx(msgIdx);
                try {
                    const data = await postJson('/api/chat/regenerate', failedAction.request);
                    setChats(p => {
                        const i = p.findIndex(c => c.id === chatId);
                        if (i < 0) return p;
                        const u = [...p];
                        const msgs = [...(Array.isArray(u[i].messages) ? u[i].messages : [])];
                        const old = msgs[msgIdx];
                        if (!old) return p;
                        const variants = old.variants || [{ content: old.content, model: old.model }];
                        variants.push({ content: data.response, model: old.model || selectedModel });
                        msgs[msgIdx] = { ...old, content: data.response, variants, activeVariant: variants.length - 1, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
                        u[i] = { ...u[i], messages: msgs };
                        saveChat(u[i]);
                        return u;
                    });
                    setFailedAction(null);
                } catch (e) {
                    const errMsg = e.message || 'Ошибка';
                    setError(errMsg);
                    showToast(errMsg);
                } finally {
                    setRegeneratingIdx(null);
                }
            }
        }, [failedAction, loading, regeneratingIdx, postJson, saveChat, selectedModel, showToast]);

        function renderMsg(msg, chatModel, msgIdx) {
            const isUser = msg.role === 'user';
            const msgModel = msg.model || chatModel;
            const hasVariants = msg.variants && msg.variants.length > 1;
            const currentVariant = msg.activeVariant || 0;
            const totalVariants = msg.variants ? msg.variants.length : 1;
            const isRegenerating = regeneratingIdx === msgIdx;
            const isWaiting = (!msg.content && loading && msgIdx === (activeChat?.messages || []).length - 1);
            return (
                <div className={'msg-appear mb-5 flex gap-3 msg-wrapper'}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-1" style={isUser ? { background: 'rgba(255,255,255,0.06)', color: '#aab' } : { background: getModelColor(msgModel), color: '#0a0a0a' }}>{isUser ? 'U' : getModelInitial(msgModel)}</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide flex items-center">
                            {isUser ? 'You' : (msgModel || '').toLowerCase()}
                            {!isUser && msg.inputTokens != null && (<span className="token-badge"><span title="Input tokens">↑{msg.inputTokens}</span><span title="Output tokens">↓{msg.outputTokens}</span></span>)}
                        </div>
                        <div className={isUser ? 'msg-user' : 'msg-ai'}>
                            {isUser && msg.files && msg.files.length > 0 && (<div className="mb-2 flex flex-wrap">{msg.files.map((f, fi) => (<span key={fi} className="msg-file-badge"><span className="file-icon">{getFileIcon(f.name)}</span><span>{f.name}</span>{f.size && <span className="text-[10px] text-gray-500 ml-1">({formatFileSize(f.size)})</span>}</span>))}</div>)}
                            {msg.images && msg.images.map((img, j) => (<img key={j} src={img.data} alt={img.name} className="rounded-xl max-w-sm border border-arena-border mb-3" style={{ maxHeight: '300px', objectFit: 'contain' }} />))}
                            {isRegenerating || isWaiting ? (
                                <div className="flex items-center gap-3 py-2">
                                    <div className="flex gap-1.5"><span className="w-1.5 h-1.5 bg-gray-500 rounded-full pulse-dot" style={{ animationDelay: '0s' }}></span><span className="w-1.5 h-1.5 bg-gray-500 rounded-full pulse-dot" style={{ animationDelay: '.2s' }}></span><span className="w-1.5 h-1.5 bg-gray-500 rounded-full pulse-dot" style={{ animationDelay: '.4s' }}></span></div>
                                    {isRegenerating && <span className="text-xs text-gray-600">regenerating...</span>}
                                    {isWaiting && <span className="text-xs text-gray-600 font-mono">{loadingTime}s</span>}
                                </div>
                            ) : (<div className="md text-gray-200 text-[14px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(isUser ? (msg.displayText || msg.content) : msg.content) }} />)}
                        </div>
                        {!isUser && !isRegenerating && !isWaiting && (
                            <div className="msg-actions flex items-center gap-1 mt-1.5 ml-1">
                                <button className={'msg-action-btn' + (copiedIdx === msgIdx ? ' copied' : '')} onClick={() => copyMessage(msg.content, msgIdx)} title="Copy">{copiedIdx === msgIdx ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}</button>
                                <button className="msg-action-btn" onClick={() => regenerateResponse(msgIdx)} disabled={loading || regeneratingIdx !== null} title="Regenerate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg></button>
                                {hasVariants && (<div className="variant-nav ml-1"><button onClick={() => switchVariant(msgIdx, -1)} disabled={currentVariant === 0}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg></button><span className="text-[11px] text-gray-500 font-mono">{currentVariant + 1}/{totalVariants}</span><button onClick={() => switchVariant(msgIdx, 1)} disabled={currentVariant >= totalVariants - 1}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg></button></div>)}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        if (authChecking) {
            return (
                <div className="h-screen flex items-center justify-center" style={{ background: '#101014', color: '#777' }}>
                    Проверка сессии...
                </div>
            );
        }

        if (!currentUser) {
            return (
                <div className="h-screen flex items-center justify-center px-4" style={{ background: '#101014' }}>
                    {toast && <div className="toast">{toast}</div>}
                    <form onSubmit={submitAuth} className="w-full max-w-md rounded-2xl p-6" style={{ background: '#16161e', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="text-xl font-semibold mb-2" style={{ color: '#ddd' }}>{authMode === 'register' ? 'Регистрация' : 'Вход'}</div>
                        <div className="text-xs mb-5" style={{ color: '#666' }}>Для доступа к чатам нужен логин и пароль.</div>
                        <div className="space-y-3">
                            <input value={authUsername} onChange={e => setAuthUsername(e.target.value)} autoComplete="username" placeholder="Логин" className="w-full rounded-xl px-4 py-3 text-sm subtle-input" />
                            <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} type="password" placeholder="Пароль" className="w-full rounded-xl px-4 py-3 text-sm subtle-input" />
                        </div>
                        {authError && <div className="mt-3 text-sm" style={{ color: '#f87171' }}>{authError}</div>}
                        <button type="submit" disabled={authLoading} className="w-full mt-5 rounded-xl py-3 text-sm font-medium disabled:opacity-50" style={{ background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.35)', color: '#fff' }}>
                            {authLoading ? 'Загрузка...' : (authMode === 'register' ? 'Зарегистрироваться' : 'Войти')}
                        </button>
                        <button type="button" onClick={() => { setAuthMode(p => p === 'register' ? 'login' : 'register'); setAuthError(''); }} className="w-full mt-2 rounded-xl py-2.5 text-sm" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#999' }}>
                            {authMode === 'register' ? 'У меня уже есть аккаунт' : 'Создать новый аккаунт'}
                        </button>
                    </form>
                </div>
            );
        }

        return (
            <div className="flex h-screen overflow-hidden" style={{ background: '#101014' }}>
                {toast && <div className="toast">{toast}</div>}
                {/* Mobile overlay */}
                {isMobile && sidebarOpen && <div className="mobile-overlay show" onClick={() => setSidebarOpen(false)} />}
                {/* Sidebar */}
                <div className={'sidebar-wrap flex-shrink-0 h-full' + (!sidebarOpen && isMobile ? ' sidebar-closed' : '')} style={{ width: (isMobile ? undefined : sidebarWidth + 'px') }}>
                    <div className={'sidebar-inner h-full flex flex-col border-r border-arena-border' + (sidebarOpen ? '' : ' sidebar-collapsed')} style={{ width: '260px', background: '#14141c' }}>
                        <div className="p-3 flex items-center justify-between h-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex items-center gap-2.5">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#c8a97e" /><stop offset="100%" stopColor="#e8d5b7" /></linearGradient></defs><path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#lg)" opacity=".7" /><path d="M2 17l10 5 10-5" stroke="url(#lg)" strokeWidth="1.5" fill="none" /><path d="M2 12l10 5 10-5" stroke="url(#lg)" strokeWidth="1.5" fill="none" /></svg>
                                <span className="font-brand font-bold text-base brand-text tracking-wide">godlimaster</span>
                            </div>
                            <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 transition-colors" style={{ background: 'transparent' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg></button>
                        </div>
                        {/* Sidebar tabs */}
                        <div className="flex gap-0 px-3 pt-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <button onClick={() => setSidebarTab('chats')} className="flex-1 py-2 text-xs font-medium tracking-wide rounded-t-lg transition-colors" style={sidebarTab === 'chats' ? { color: '#c0c0d0', background: 'rgba(255,255,255,0.03)' } : { color: '#555', background: 'transparent' }}>💬 Чаты</button>
                            <button onClick={() => setSidebarTab('agents')} className="flex-1 py-2 text-xs font-medium tracking-wide rounded-t-lg transition-colors" style={sidebarTab === 'agents' ? { color: '#a78bfa', background: 'rgba(139,92,246,0.06)' } : { color: '#555', background: 'transparent' }}>🤖 Агенты</button>
                        </div>
                        {sidebarTab === 'chats' ? (
                            <React.Fragment>
                                <div className="p-3"><button onClick={newChat} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-500 hover:text-gray-300 transition-all text-sm font-medium" style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>New Chat</button></div>
                                <div className="px-3 pb-2"><div className="relative"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-3 top-2.5 text-gray-600" style={{ opacity: .5 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><input className="subtle-input w-full rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Search" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} /></div></div>
                                <div className="flex-1 overflow-y-auto px-2 pb-4">
                                    {Object.entries(groupedChats).map(([label, items]) => (<div key={label} className="mb-2"><div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#444' }}>{label}</div>{items.map(c => (<div key={c.id} onClick={() => selectChat(c.id)} className={'sidebar-item flex items-center gap-2 px-2.5 py-2 cursor-pointer group' + (c.id === activeChatId ? ' active' : '')}><span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: getModelColor(c.model), color: '#0a0a0a' }}>{getModelInitial(c.model)}</span><span className="text-[13px] truncate flex-1" style={{ color: '#888' }}>{c.title || 'Untitled'}</span>{c.agentId && <span style={{ fontSize: '10px' }}>🤖</span>}<button onClick={e => deleteChat(c.id, e)} className="chat-delete-btn p-1 rounded text-gray-700 hover:text-red-400 transition-colors"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>))}</div>))}
                                    {filteredChats.length === 0 && <div className="text-center text-xs mt-8 italic" style={{ color: '#3a3a44' }}>No chats yet</div>}
                                </div>
                            </React.Fragment>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-3">
                                <div className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#555' }}>Доступные агенты</div>
                                {bootstrapErrors.includes('agents') && <div className="mb-3 p-2 rounded-lg text-[11px]" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>Список агентов загружен из резервного набора (API `/api/agents` недоступен).</div>}
                                {agents.map(a => (<div key={a.id} onClick={() => setActiveAgent(activeAgent === a.id ? null : a.id)} className={'agent-card mb-2' + (activeAgent === a.id ? ' active' : '')}><div className="flex items-center gap-3"><span className="text-xl">{a.icon}</span><div className="flex-1 min-w-0"><div className="text-sm font-medium" style={{ color: activeAgent === a.id ? '#c4b5fd' : '#bbb' }}>{a.name}</div><div className="text-[11px]" style={{ color: '#555' }}>{a.description}</div></div>{activeAgent === a.id && <span className="agent-dot"></span>}</div></div>))}
                                {agents.length === 0 && <div className="text-center text-xs mt-8 italic" style={{ color: '#3a3a44' }}>Нет агентов</div>}
                                <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', fontSize: '11px', color: '#555' }}>💡 Выберите агента, чтобы ИИ использовал специальные инструкции в каждом ответе.</div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Main */}
                <main className="flex-1 flex flex-col h-full min-w-0">
                    <div className="main-header h-12 flex-shrink-0 flex items-center px-3 gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 transition-colors mr-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg></button>}
                        <div className="relative" ref={modelDropdownRef}>
                            <button onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setModelSearch(''); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors" style={{ color: '#999', background: 'transparent' }}>
                                {selectedModel && <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: getModelColor(selectedModel), color: '#0a0a0a' }}>{getModelInitial(selectedModel)}</span>}
                                <span className="font-medium">{selectedModel ? selectedModel.toLowerCase() : 'Select model'}</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={'transition-transform duration-200 ' + (modelDropdownOpen ? 'rotate-180' : '')}><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            {modelDropdownOpen && (
                                <div className="model-dropdown-panel dropdown-enter absolute left-0 mt-1 w-96 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ top: '100%', background: '#16161e', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
                                    <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><div className="relative"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-2.5" style={{ color: '#444' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><input ref={modelSearchRef} className="subtle-input w-full rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Search models" value={modelSearch} onChange={e => setModelSearch(e.target.value)} /></div></div>
                                    <div className="max-h-80 overflow-y-auto py-1">
                                        {filteredModels.map(m => {
                                            const caps = getModelCaps(m); const isTool = isToolModel(m); const isFav = favoriteModelSet.has(m); return (
                                                <button key={m} onClick={() => selectModel(m)} className={'model-item w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm ' + (m === selectedModel ? 'text-white' : 'text-gray-500')}>
                                                    <span className={'star-btn' + (isFav ? ' starred' : '')} onClick={e => toggleFavorite(m, e)}>{isFav ? '★' : '☆'}</span>
                                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: getModelColor(m), color: '#0a0a0a' }}>{getModelInitial(m)}</span>
                                                    <span className="font-mono text-[12px] flex-1">{m.toLowerCase()}{isTool && <span className="tool-badge">TOOL</span>}</span>
                                                    <span className="flex gap-1 flex-shrink-0">{caps.map((c, j) => <span key={j} className="cap-badge text-sm" title={c.l}>{c.i}</span>)}</span>
                                                </button>
                                            );
                                        })}
                                        {filteredModels.length === 0 && <div className="text-center text-sm py-6" style={{ color: '#444' }}>No models found</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                        {currentAgent && <div className="agent-badge"><span className="agent-dot"></span>{currentAgent.icon} {currentAgent.name}</div>}
                        <div className="text-xs px-2 py-1 rounded-lg" style={{ color: '#888', border: '1px solid rgba(255,255,255,0.06)' }}>{currentUser.username}</div>
                        {backendVersionShort && <div className="text-[10px] px-2 py-1 rounded-lg font-mono" style={{ color: '#666', border: '1px solid rgba(255,255,255,0.05)' }}>v:{backendVersionShort}</div>}
                        {(currentUser.username || '').toLowerCase() === 'godli' && <div className="text-xs px-2 py-1 rounded-lg font-mono" style={{ color: '#94a3b8', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(148,163,184,0.07)' }}>Онлайн аккаунтов: {onlineAccountsCount}</div>}
                        <div className="ml-auto flex items-center gap-1">
                            <button onClick={() => { setInstructionsDraft(customInstructions); setInstructionsOpen(true); }} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 transition-colors" title="Инструкции для ИИ"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></button>
                            <button onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 transition-colors" title="Настройки"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg></button>
                            <button onClick={logout} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 transition-colors" title="Выйти"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></button>
                        </div>
                    </div>
                    {bootstrapErrors.length > 0 && (
                        <div className="px-4 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                            API частично недоступен: {bootstrapErrors.join(', ')}. Проверьте, что backend перезапущен и открыт тот же проект.
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {!activeChat ? (
                            <div className="flex-1 flex flex-col items-center justify-center px-4 fade-in" style={{ padding: isMobile ? '16px 12px' : undefined }}>
                                {currentAgent && <div className="agent-banner mb-6"><span className="agent-dot"></span><span>{currentAgent.icon}</span><span className="font-medium">Режим агента: {currentAgent.name}</span></div>}
                                <h1 className="welcome-title text-3xl font-light mb-10" style={{ letterSpacing: '-.02em', color: '#666' }}>What would you like to do?</h1>
                                <div className="w-full max-w-2xl">
                                    {attachedFiles.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{attachedFiles.map(f => <div key={f.id} className="file-preview group relative">{f.type === 'image' ? <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: '120px', border: '1px solid rgba(255,255,255,0.05)' }}><img src={f.preview} alt={f.name} className="w-full h-20 object-cover" /><button onClick={() => removeFile(f.id)} className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button><div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-0.5 text-[10px] text-gray-300 truncate">{f.name}</div></div> : <div className="relative flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}><span className="text-lg">{getFileIcon(f.name)}</span><div className="min-w-0"><div className="text-xs text-gray-300 truncate max-w-[120px]">{f.name}</div><div className="text-[10px] text-gray-600">{formatFileSize(f.size)}</div></div><button onClick={() => removeFile(f.id)} className="ml-1 w-5 h-5 rounded-full flex items-center justify-center text-gray-600 hover:text-white transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>}</div>)}</div>}
                                    <div className="input-glow relative rounded-2xl flex items-end" style={{ background: '#16161c', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelected} multiple accept="*/*" />
                                        <button onClick={handleFileUpload} className="p-3.5 text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                                        <textarea ref={inputRef} className="flex-1 bg-transparent text-sm py-3.5 px-1 max-h-40 overflow-y-auto" placeholder="Ask anything..." rows="1" value={input} style={{ color: '#ccc', resize: 'none', outline: 'none' }} onChange={handleInputChange} onKeyDown={handleKeyDown} />
                                        {loading ? (
                                            <button onClick={stopGeneration} className="p-3.5 text-red-400 hover:text-red-300 transition-colors flex-shrink-0" title="Остановить генерацию"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>
                                        ) : (
                                            <button onClick={sendMessage} disabled={!input.trim() && attachedFiles.length === 0} className="p-3.5 text-gray-600 hover:text-white transition-colors flex-shrink-0 disabled:opacity-20"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <React.Fragment>
                                <div className="flex-1 overflow-y-auto">
                                    <div className="max-w-3xl mx-auto px-4 py-6">
                                        {currentAgent && <div className="agent-banner mb-4"><span className="agent-dot"></span><span>{currentAgent.icon}</span><span className="font-medium text-[12px]">Агент: {currentAgent.name}</span></div>}
                                        {activeChat.messages.map((msg, idx) => <React.Fragment key={idx}>{renderMsg(msg, activeChat.model || selectedModel, idx)}</React.Fragment>)}
                                        {error && <div className="mb-5 p-3 rounded-xl text-sm fade-in flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#f87171' }}><span>{error}</span><button onClick={retryFailedAction} disabled={!failedAction || loading || regeneratingIdx !== null} className="ml-3 px-2 py-0.5 rounded text-xs disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Перегенерировать</button></div>}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </div>
                                <div className="flex-shrink-0 p-4"><div className="max-w-3xl mx-auto">
                                    {attachedFiles.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{attachedFiles.map(f => <div key={f.id} className="file-preview group relative">{f.type === 'image' ? <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: '120px', border: '1px solid rgba(255,255,255,0.05)' }}><img src={f.preview} alt={f.name} className="w-full h-20 object-cover" /><button onClick={() => removeFile(f.id)} className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div> : <div className="relative flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}><span className="text-lg">{getFileIcon(f.name)}</span><div className="min-w-0"><div className="text-xs text-gray-300 truncate max-w-[120px]">{f.name}</div></div><button onClick={() => removeFile(f.id)} className="ml-1 w-5 h-5 rounded-full flex items-center justify-center text-gray-600 hover:text-white transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>}</div>)}</div>}
                                    <div className="input-glow relative rounded-2xl flex items-end" style={{ background: '#16161c', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelected} multiple accept="*/*" />
                                        <button onClick={handleFileUpload} className="p-3.5 text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                                        <textarea ref={inputRef} className="flex-1 bg-transparent text-sm py-3.5 px-1 max-h-40 overflow-y-auto" placeholder="Ask anything..." rows="1" value={input} style={{ color: '#ccc', resize: 'none', outline: 'none' }} onChange={handleInputChange} onKeyDown={handleKeyDown} />
                                        {loading ? (
                                            <button onClick={stopGeneration} className="p-3.5 text-red-400 hover:text-red-300 transition-colors flex-shrink-0" title="Остановить генерацию"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>
                                        ) : (
                                            <button onClick={sendMessage} disabled={!input.trim() && attachedFiles.length === 0} className="p-3.5 text-gray-600 hover:text-white transition-colors flex-shrink-0 disabled:opacity-20"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
                                        )}
                                    </div>
                                </div></div>
                            </React.Fragment>
                        )}
                    </div>
                </main>
                {/* Instructions Modal */}
                {instructionsOpen && (<div className="modal-overlay" onClick={() => setInstructionsOpen(false)}><div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '520px' }}><div className="modal-header"><h2>📝 Инструкции для ИИ</h2><button className="modal-close" onClick={() => setInstructionsOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div><div className="p-5"><div className="text-xs mb-3" style={{ color: '#666' }}>Эти инструкции будут использоваться ИИ в каждом чате и диалоге.</div><textarea value={instructionsDraft} onChange={e => setInstructionsDraft(e.target.value)} className="w-full rounded-xl p-4 text-sm" rows="8" placeholder="Например: Отвечай всегда на русском. Будь кратким. Используй примеры кода." style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#bbb', resize: 'vertical', outline: 'none', fontFamily: 'Inter,sans-serif' }} /><div className="flex justify-end gap-2 mt-4"><button onClick={() => setInstructionsOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: '#888', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>Отмена</button><button onClick={saveInstructions} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: '#fff', background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.3)' }}>Сохранить</button></div></div></div></div>)}
                {/* Settings Modal */}
                {settingsOpen && (<div className="modal-overlay" onClick={() => setSettingsOpen(false)}><div className="modal-content" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>⚙️ Настройки моделей</h2><button className="modal-close" onClick={() => setSettingsOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div><div className="p-1"><div className="px-5 py-3 text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#444' }}>Дефолтная модель по задаче</div>{[{ key: 'documents', icon: '📄', label: 'Документы', desc: 'Чтение и анализ файлов', filter: m => getModelCaps(m).some(c => c.i === '📄') }, { key: 'code', icon: '💻', label: 'Код', desc: 'Написание и анализ кода', filter: m => getModelCaps(m).some(c => c.i === '💻') }, { key: 'audio', icon: '🎙️', label: 'Аудио', desc: 'Распознавание речи', filter: m => getModelCaps(m).some(c => c.i === '🎙️') }, { key: 'translation', icon: '🌐', label: 'Перевод', desc: 'Перевод текстов', filter: m => getModelCaps(m).some(c => c.i === '🌐') }, { key: 'sentiment', icon: '😊', label: 'Тональность', desc: 'Анализ тональности', filter: m => getModelCaps(m).some(c => c.i === '😊') }, { key: 'sql', icon: '🗃️', label: 'SQL', desc: 'Генерация SQL-запросов', filter: m => getModelCaps(m).some(c => c.i === '🗃️') }].map(task => { const available = models.filter(task.filter); if (available.length === 0) return null; return (<div key={task.key} className="setting-row"><div className="setting-icon">{task.icon}</div><div className="setting-info"><div className="setting-label">{task.label}</div><div className="setting-desc">{task.desc}</div></div><select className="setting-select" value={defaultModels[task.key] || ''} onChange={e => updateDefaultModel(task.key, e.target.value)}><option value="">Авто</option>{available.map(m => <option key={m} value={m}>{m.toLowerCase()}</option>)}</select></div>); })}</div></div></div>)}
            </div>
        );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
