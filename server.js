require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json({ limit: "10mb" }));
const APP_STARTED_AT = new Date().toISOString();
const APP_VERSION = process.env.APP_VERSION || APP_STARTED_AT;

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
    }
    next();
});

app.use(
    express.static(path.join(__dirname, "public"), {
        index: false,
        setHeaders: (res, filePath) => {
            const lower = String(filePath || "").toLowerCase();
            if (lower.endsWith(".js") || lower.endsWith(".css") || lower.endsWith(".html")) {
                res.setHeader("Cache-Control", "no-store");
            }
        },
    })
);

const SNOWFLAKE_ACCOUNT_IDENTIFIER = process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER;
const SNOWFLAKE_PAT = process.env.SNOWFLAKE_PAT;

const ADMIN_ROLE = process.env.ADMIN_ROLE || process.env.SNOWFLAKE_ROLE || "ACCOUNTADMIN";
const ADMIN_WAREHOUSE = process.env.ADMIN_WAREHOUSE || process.env.SNOWFLAKE_WAREHOUSE || "COMPUTE_WH";

const PORT = Number(process.env.PORT || 3001);

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : process.env.VERCEL
    ? path.join("/tmp", "arena-data")
    : path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const AUTH_SECRET_FILE = path.join(DATA_DIR, "auth.secret");
const CHATS_DIR = path.join(DATA_DIR, "chats");
const LEGACY_CHATS_FILE = path.join(__dirname, "chats.json");

const SESSION_COOKIE_NAME = "arena_auth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 70 * 1000;

const SQL_STATEMENT_TIMEOUT_SECONDS = 600;
const SQL_POLL_INTERVAL_MS = 500;
const SQL_MAX_POLLS = Math.ceil((SQL_STATEMENT_TIMEOUT_SECONDS * 1000) / SQL_POLL_INTERVAL_MS) + 30;
const SNOWFLAKE_HTTP_TIMEOUT_MS = Number(process.env.SNOWFLAKE_HTTP_TIMEOUT_MS || 10 * 60 * 1000);
const MODEL_OPERATION_TIMEOUT_MS = Number(process.env.MODEL_OPERATION_TIMEOUT_MS || 10 * 60 * 1000);

const ACC_ID = SNOWFLAKE_ACCOUNT_IDENTIFIER ? SNOWFLAKE_ACCOUNT_IDENTIFIER.replace(/\/$/, "") : "";
const REST_API_BASE = `https://${ACC_ID}.snowflakecomputing.com/api/v2`;
const SQL_API_BASE = `${REST_API_BASE}/statements`;

const MODELS_FILE_CANDIDATES = [
    process.env.MODELS_FILE,
    path.join(__dirname, "Models.txt"),
    path.join(__dirname, "models.txt"),
    path.join(DATA_DIR, "Models.txt"),
    path.join(DATA_DIR, "models.txt"),
    path.join(__dirname, "..", "Models.txt"),
    path.join(__dirname, "..", "models.txt"),
].filter(Boolean);

const DEFAULT_MODELS = (process.env.DEFAULT_MODELS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

if (DEFAULT_MODELS.length === 0) {
    DEFAULT_MODELS.push(
        "mistral-large2",
        "llama3.1-70b",
        "llama3.1-8b",
        "arctic-sentiment",
        "arctic-translate",
        "arctic-extract-answer",
        "arctic-parse-document",
        "arctic-text2sql",
        "arctic-transcribe"
    );
}

if (!SNOWFLAKE_ACCOUNT_IDENTIFIER || !SNOWFLAKE_PAT) {
    console.error("Missing ENV: SNOWFLAKE_ACCOUNT_IDENTIFIER or SNOWFLAKE_PAT");
}

/* --------------------------------------------------------
   System prompt
   -------------------------------------------------------- */
const SYSTEM_PROMPT = "You are a powerful Human assistant";

/* ---- Agents ---- */
const AGENT_PROMPTS_DIR = path.join(DATA_DIR, "agent-prompts");
const AGENTS = {
    "roblox-scripts": {
        name: "Скрипты Роблокс",
        promptFile: path.join(AGENT_PROMPTS_DIR, "roblox-scripts.txt"),
        fallbackPrompt:
            "You are a Roblox scripting assistant. Answer in Russian by default, give complete working Lua code when asked, and keep UI labels in English.",
        icon: "🎮",
        description: "Помощник по скриптам для Roblox",
    },
};

function ensureDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        return true;
    } catch (e) {
        console.error(`Failed to ensure dir ${dirPath}:`, e.message);
        return false;
    }
}

function readJsonFile(filePath, fallback) {
    try {
        const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJsonFile(filePath, value) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
        return true;
    } catch (e) {
        console.error(`Failed to write JSON file ${filePath}:`, e.message);
        return false;
    }
}

function writeTextFile(filePath, value) {
    try {
        fs.writeFileSync(filePath, value, "utf8");
        return true;
    } catch (e) {
        console.error(`Failed to write file ${filePath}:`, e.message);
        return false;
    }
}

function ensureDataFiles() {
    ensureDir(DATA_DIR);
    ensureDir(CHATS_DIR);
    ensureDir(AGENT_PROMPTS_DIR);

    if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, { users: [] });
    if (!fs.existsSync(SESSIONS_FILE)) writeJsonFile(SESSIONS_FILE, { sessions: [] });

    if (!fs.existsSync(AUTH_SECRET_FILE)) writeTextFile(AUTH_SECRET_FILE, crypto.randomBytes(48).toString("hex"));
}

function loadAuthSecret() {
    const envSecret = String(process.env.AUTH_SECRET || "").trim();
    if (envSecret) return envSecret;

    ensureDataFiles();

    try {
        const v = (fs.readFileSync(AUTH_SECRET_FILE, "utf8") || "").trim();
        if (v) return v;
    } catch (e) {
        if (e?.code !== "ENOENT") {
            console.error("Failed to read auth secret file:", e.message);
        }
    }

    const next = crypto.randomBytes(48).toString("hex");
    if (!writeTextFile(AUTH_SECRET_FILE, next)) {
        console.error("Using in-memory auth secret. Set AUTH_SECRET env variable for stable sessions on read-only FS.");
    }
    return next;
}

function loadUsers() {
    const data = readJsonFile(USERS_FILE, { users: [] });
    if (Array.isArray(data)) return { users: data };
    if (!Array.isArray(data.users)) return { users: [] };
    return data;
}

function saveUsers(data) {
    writeJsonFile(USERS_FILE, { users: Array.isArray(data.users) ? data.users : [] });
}

function loadSessions() {
    const data = readJsonFile(SESSIONS_FILE, { sessions: [] });
    if (Array.isArray(data)) return data;
    return Array.isArray(data.sessions) ? data.sessions : [];
}

function saveSessions(list) {
    writeJsonFile(SESSIONS_FILE, { sessions: Array.isArray(list) ? list : [] });
}

function getChatsFileForUser(userId) {
    return path.join(CHATS_DIR, `${userId}.json`);
}

function maybeMigrateLegacyChats(userId) {
    if (!fs.existsSync(LEGACY_CHATS_FILE)) return [];
    const users = loadUsers().users;
    if (users.length !== 1 || users[0].id !== userId) return [];

    const legacy = readJsonFile(LEGACY_CHATS_FILE, []);
    if (!Array.isArray(legacy)) return [];

    const filePath = getChatsFileForUser(userId);
    writeJsonFile(filePath, legacy);
    return legacy;
}

function loadChatsForUser(userId) {
    const filePath = getChatsFileForUser(userId);
    if (fs.existsSync(filePath)) {
        const chats = readJsonFile(filePath, []);
        return Array.isArray(chats) ? chats : [];
    }
    return maybeMigrateLegacyChats(userId);
}

function saveChatsForUser(userId, chats) {
    const filePath = getChatsFileForUser(userId);
    writeJsonFile(filePath, Array.isArray(chats) ? chats : []);
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

function isValidUsername(username) {
    return /^[A-Za-z0-9_.-]{3,32}$/.test(username);
}

function isValidPassword(password) {
    return typeof password === "string" && password.length >= 4 && password.length <= 128;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const key = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt:${salt}:${key}`;
}

function verifyPassword(password, stored) {
    if (!stored || typeof stored !== "string") return false;

    const parts = stored.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;

    const salt = parts[1];
    const savedHex = parts[2];

    try {
        const saved = Buffer.from(savedHex, "hex");
        const actual = crypto.scryptSync(password, salt, saved.length);
        if (actual.length !== saved.length) return false;
        return crypto.timingSafeEqual(actual, saved);
    } catch {
        return false;
    }
}

function getAgentPrompt(agentId) {
    const agent = AGENTS[agentId];
    if (!agent) return "";
    try {
        const raw = fs.readFileSync(agent.promptFile, "utf8");
        if (raw.length <= MAX_AGENT_PROMPT_CHARS) return raw;
        return `${raw.slice(0, MAX_AGENT_PROMPT_CHARS)}\n\n[Agent prompt truncated to ${MAX_AGENT_PROMPT_CHARS} chars]`;
    } catch (e) {
        console.error("Failed to read agent prompt:", e.message);
        return agent.fallbackPrompt || "";
    }
}

function estimateTokens(text) {
    return Math.ceil((text || "").length / 4);
}

const MAX_PROMPT_TOKENS = 150000;
const MAX_AGENT_PROMPT_CHARS = Number(process.env.MAX_AGENT_PROMPT_CHARS || 12000);
const MAX_CUSTOM_INSTRUCTIONS_CHARS = Number(process.env.MAX_CUSTOM_INSTRUCTIONS_CHARS || 6000);

function trimMessages(messages, maxTokens = MAX_PROMPT_TOKENS, basePrompt = SYSTEM_PROMPT) {
    let totalTokens = estimateTokens(basePrompt || "");
    const kept = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(messages[i].content);
        if (totalTokens + msgTokens > maxTokens && kept.length > 0) break;
        totalTokens += msgTokens;
        kept.unshift(messages[i]);
    }
    return kept;
}

function sqlEscape(str) {
    return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);

        function onAbort() {
            cleanup();
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
        }

        function cleanup() {
            clearTimeout(timer);
            if (signal) signal.removeEventListener("abort", onAbort);
        }

        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener("abort", onAbort);
        }
    });
}

function isAbortError(err) {
    const message = String(err && err.message ? err.message : "").toLowerCase();
    return err?.name === "AbortError" || message.includes("aborted") || message.includes("abort");
}

function withTimeoutSignal(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    const onParentAbort = () => controller.abort();
    if (parentSignal) {
        if (parentSignal.aborted) controller.abort();
        else parentSignal.addEventListener("abort", onParentAbort);
    }

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
        },
        didTimeout: () => timedOut,
    };
}

function withOperationTimeout(promise, timeoutMs, label = "Operation") {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        Promise.resolve(promise)
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(";").reduce((acc, chunk) => {
        const idx = chunk.indexOf("=");
        if (idx < 0) return acc;
        const key = chunk.slice(0, idx).trim();
        const value = chunk.slice(idx + 1).trim();
        try {
            acc[key] = decodeURIComponent(value);
        } catch {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function getTokenFromRequest(req) {
    const cookies = parseCookies(req);
    if (cookies[SESSION_COOKIE_NAME]) return cookies[SESSION_COOKIE_NAME];

    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);

    return "";
}

function setAuthCookie(res, token) {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearAuthCookie(res) {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function createId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return crypto.randomBytes(16).toString("hex");
}

function toPublicUser(user) {
    return { id: user.id, username: user.username };
}

const AUTH_SECRET = loadAuthSecret();
let sessions = loadSessions();
const onlinePresence = new Map();
const onlineCountSseClients = new Set();
let lastOnlineCount = -1;

function findUserById(userId) {
    const users = loadUsers().users;
    return users.find((u) => u.id === userId) || null;
}

function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    const users = loadUsers().users;
    return users.find((u) => normalizeUsername(u.username) === normalized) || null;
}

function getOnlineAccountCount(now = Date.now()) {
    const uniqueUsers = new Set();
    for (const data of onlinePresence.values()) {
        if (now - data.lastSeenAt <= ONLINE_WINDOW_MS) {
            uniqueUsers.add(data.userId);
        }
    }
    return uniqueUsers.size;
}

function broadcastOnlineCount(force = false) {
    const count = getOnlineAccountCount();
    if (!force && count === lastOnlineCount) return;
    lastOnlineCount = count;

    const payload = `data: ${JSON.stringify({ count })}\n\n`;
    for (const client of onlineCountSseClients) {
        client.write(payload);
    }
}

function pruneOnlinePresence(now = Date.now()) {
    const validSids = new Set(sessions.map((s) => s.sid));
    let changed = false;

    for (const [sid, data] of onlinePresence.entries()) {
        if (!validSids.has(sid) || now - data.lastSeenAt > ONLINE_WINDOW_MS) {
            onlinePresence.delete(sid);
            changed = true;
        }
    }

    if (changed) broadcastOnlineCount();
}

function touchOnlinePresence(session) {
    const before = getOnlineAccountCount();
    onlinePresence.set(session.sid, {
        userId: session.userId,
        username: session.username,
        lastSeenAt: Date.now(),
    });
    const after = getOnlineAccountCount();
    if (before !== after) broadcastOnlineCount(true);
    else broadcastOnlineCount();
}

function pruneExpiredSessions() {
    const now = Date.now();
    const before = sessions.length;
    sessions = sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    const changed = before !== sessions.length;
    if (changed) saveSessions(sessions);

    pruneOnlinePresence(now);
    if (changed) broadcastOnlineCount(true);
}

function createSession(user) {
    pruneExpiredSessions();

    const sid = createId();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const session = {
        sid,
        userId: user.id,
        username: user.username,
        createdAt: nowIso,
        expiresAt,
    };

    sessions.push(session);
    saveSessions(sessions);
    touchOnlinePresence(session);

    const token = jwt.sign({ sid, uid: user.id, un: user.username }, AUTH_SECRET, {
        expiresIn: Math.floor(SESSION_TTL_MS / 1000),
    });

    return token;
}

function removeSessionBySid(sid) {
    const before = sessions.length;
    sessions = sessions.filter((s) => s.sid !== sid);
    if (sessions.length !== before) {
        saveSessions(sessions);
    }

    if (onlinePresence.delete(sid)) {
        broadcastOnlineCount(true);
    }
}

function getAuthContext(req) {
    pruneExpiredSessions();

    const token = getTokenFromRequest(req);
    if (!token) return null;

    let payload;
    try {
        payload = jwt.verify(token, AUTH_SECRET);
    } catch {
        return null;
    }

    const sid = payload?.sid;
    if (!sid) return null;

    const session = sessions.find((s) => s.sid === sid);
    if (!session) return null;

    const user = findUserById(session.userId);
    if (!user) {
        removeSessionBySid(sid);
        return null;
    }

    return {
        user: toPublicUser(user),
        session,
    };
}

function requireAuth(req, res, next) {
    const auth = getAuthContext(req);
    if (!auth) {
        clearAuthCookie(res);
        return res.status(401).json({ error: "Authentication required" });
    }

    req.user = auth.user;
    req.session = auth.session;
    touchOnlinePresence(auth.session);
    next();
}

function createRequestAbortController(req, res) {
    const controller = new AbortController();
    const onReqAborted = () => controller.abort();
    const onResClose = () => {
        if (!res.writableEnded) controller.abort();
    };

    req.on("aborted", onReqAborted);
    res.on("close", onResClose);

    return {
        signal: controller.signal,
        cleanup: () => {
            req.off("aborted", onReqAborted);
            res.off("close", onResClose);
        },
    };
}

/* --------------------------------------------------------
   Snowflake headers and SQL API call
   -------------------------------------------------------- */

function headersSnowflake() {
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "arena-chat/1.0",
        Authorization: `Bearer ${SNOWFLAKE_PAT}`,
    };
}

async function postStatement(statement, options = {}) {
    const { signal } = options;

    const body = { statement, timeout: SQL_STATEMENT_TIMEOUT_SECONDS, role: ADMIN_ROLE };
    if (ADMIN_WAREHOUSE) body.warehouse = ADMIN_WAREHOUSE;

    const initTimeout = withTimeoutSignal(signal, SNOWFLAKE_HTTP_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(SQL_API_BASE, {
            method: "POST",
            headers: headersSnowflake(),
            body: JSON.stringify(body),
            signal: initTimeout.signal,
        });
    } catch (e) {
        if (isAbortError(e) && initTimeout.didTimeout() && !signal?.aborted) {
            throw new Error(`Snowflake request timeout (${SNOWFLAKE_HTTP_TIMEOUT_MS}ms)`);
        }
        throw e;
    } finally {
        initTimeout.cleanup();
    }

    const json = await res.json().catch(() => ({}));

    if (res.status === 200) return json;

    if (res.status === 202) {
        const statusUrl = json.statementStatusUrl || (json.statementHandle ? `/api/v2/statements/${json.statementHandle}` : null);
        if (!statusUrl) throw new Error(`No statementStatusUrl: ${JSON.stringify(json)}`);

        for (let i = 0; i < SQL_MAX_POLLS; i++) {
            await sleep(SQL_POLL_INTERVAL_MS, signal);

            const pollTimeout = withTimeoutSignal(signal, SNOWFLAKE_HTTP_TIMEOUT_MS);
            let pollRes;
            try {
                pollRes = await fetch(`https://${ACC_ID}.snowflakecomputing.com${statusUrl}`, {
                    method: "GET",
                    headers: headersSnowflake(),
                    signal: pollTimeout.signal,
                });
            } catch (e) {
                if (isAbortError(e) && pollTimeout.didTimeout() && !signal?.aborted) {
                    throw new Error(`Snowflake polling timeout (${SNOWFLAKE_HTTP_TIMEOUT_MS}ms)`);
                }
                throw e;
            } finally {
                pollTimeout.cleanup();
            }

            if (pollRes.status === 202) continue;
            const pollJson = await pollRes.json().catch(() => ({}));
            if (pollRes.status === 200) return pollJson;

            throw new Error(`Poll error: HTTP ${pollRes.status} ${JSON.stringify(pollJson)}`);
        }

        throw new Error("Timeout waiting for statement");
    }

    throw new Error(`SQL API Error on ${SQL_API_BASE}: HTTP ${res.status} ${JSON.stringify(json)}`);
}

/* --------------------------------------------------------
   Specialized handlers
   -------------------------------------------------------- */

async function handleSentiment(text, signal) {
    const sql = `SELECT SNOWFLAKE.CORTEX.SENTIMENT('${sqlEscape(text)}') AS s`;
    const r = await postStatement(sql, { signal });
    const score = parseFloat(r.data?.[0]?.[0] || "0");

    const label = score > 0.3 ? "Positive" : score < -0.3 ? "Negative" : "Neutral";
    return `**Sentiment Analysis**\n\nScore: **${score.toFixed(4)}**\nResult: **${label}**`;
}

async function handleTranslate(text, signal) {
    let targetLang = "en";
    const langMatch = text.match(/translate\s+(?:to|into)\s+(\w+)/i);
    if (langMatch) {
        const map = {
            english: "en",
            russian: "ru",
            french: "fr",
            german: "de",
            spanish: "es",
            italian: "it",
            portuguese: "pt",
            chinese: "zh",
            japanese: "ja",
            korean: "ko",
            arabic: "ar",
            hindi: "hi",
            turkish: "tr",
            polish: "pl",
            dutch: "nl",
            swedish: "sv",
            norwegian: "no",
            danish: "da",
            finnish: "fi",
        };

        const target = langMatch[1].toLowerCase();
        targetLang = map[target] || target.slice(0, 2);
    }

    const sql = `SELECT SNOWFLAKE.CORTEX.TRANSLATE('${sqlEscape(text)}', '', '${sqlEscape(targetLang)}') AS t`;
    const r = await postStatement(sql, { signal });
    return r.data?.[0]?.[0] || "";
}

async function handleExtractAnswer(context, question, signal) {
    const sql = `SELECT SNOWFLAKE.CORTEX.EXTRACT_ANSWER('${sqlEscape(context)}', '${sqlEscape(question)}') AS a`;
    const r = await postStatement(sql, { signal });

    try {
        const answers = JSON.parse(r.data?.[0]?.[0] || "[]");
        if (!answers || answers.length === 0) return "No answer found in the provided text.";

        return answers
            .map((a, i) => `**Answer ${i + 1}** (score: ${(a.score || 0).toFixed(3)}):\n${a.answer}`)
            .join("\n\n");
    } catch {
        return String(r.data?.[0]?.[0] || "");
    }
}

async function handleSummarize(text, signal) {
    const sql = `SELECT SNOWFLAKE.CORTEX.SUMMARIZE('${sqlEscape(text)}') AS s`;
    const r = await postStatement(sql, { signal });
    return r.data?.[0]?.[0] || "";
}

async function handleText2SQL(text, signal) {
    const sqlPrompt = `You are a SQL expert. Convert the following natural language request into a valid SQL query. Only output the SQL query, no explanations.\n\nRequest: ${sqlEscape(text)}`;
    const sql = `SELECT SNOWFLAKE.CORTEX.AI_COMPLETE('mistral-large2', '${sqlEscape(sqlPrompt)}') AS RESPONSE`;
    const r = await postStatement(sql, { signal });

    let result = r.data?.[0]?.[0] || "";
    try {
        const parsed = JSON.parse(result);
        if (parsed.choices?.[0]) {
            result = parsed.choices[0].messages || parsed.choices[0].message?.content || result;
        }
        if (typeof parsed === "string") result = parsed;
    } catch {
        // keep plain string
    }

    return `**Generated SQL:**\n\n\`\`\`sql\n${result}\n\`\`\``;
}

async function handleTranscribe() {
    return "Для ARCTIC-TRANSCRIBE загрузите аудио в Snowflake Stage и вызовите транскрипцию через SQL с BUILD_SCOPED_FILE_URL.";
}

/* --------------------------------------------------------
   Standard AI_COMPLETE call
   -------------------------------------------------------- */

async function callAIComplete(model, messages, extraPrompt = "", signal) {
    let system = SYSTEM_PROMPT;
    if (extraPrompt) system += `\n\n${extraPrompt}`;

    let trimmed = trimMessages(messages, MAX_PROMPT_TOKENS, system);
    let retries = 3;

    while (retries > 0) {
        const fullPrompt =
            system +
            "\n\n" +
            trimmed.map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content).join("\n\n");

        const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('${sqlEscape(model)}', '${sqlEscape(fullPrompt)}') AS RESPONSE`;

        try {
            const result = await postStatement(sql, { signal });

            if (!result.data || result.data.length === 0) {
                throw new Error("No response from model");
            }

            let text = result.data[0][0];
            try {
                const parsed = JSON.parse(text);
                if (parsed.choices?.[0]) {
                    text = parsed.choices[0].messages || parsed.choices[0].message?.content || text;
                }
                if (typeof parsed === "string") text = parsed;
            } catch {
                // plain string
            }

            return text;
        } catch (e) {
            if (isAbortError(e)) throw e;

            const errMsg = String(e.message || "").toLowerCase();
            const maybeContextOverflow = ["token", "context", "too long", "exceed", "max"].some((token) => errMsg.includes(token));
            if (maybeContextOverflow && retries > 1) {
                const half = Math.max(1, Math.floor(trimmed.length / 2));
                trimmed = trimmed.slice(half);
                retries -= 1;
                continue;
            }
            throw e;
        }
    }

    throw new Error("Failed after context trimming retries");
}

function loadModelsFromDisk() {
    for (const filePath of MODELS_FILE_CANDIDATES) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, "utf8");
            const models = content
                .split(/\r?\n/)
                .map((v) => v.trim())
                .filter((v) => Boolean(v) && !v.startsWith("#"));
            if (models.length > 0) {
                return models;
            }
        } catch (e) {
            console.error(`Failed to read models from ${filePath}:`, e.message);
        }
    }
    return [];
}

function getModelsList() {
    const diskModels = loadModelsFromDisk();
    const list = diskModels.length > 0 ? diskModels : DEFAULT_MODELS;
    return Array.from(new Set(list.map((m) => m.trim()).filter(Boolean)));
}

function buildExtraPrompt(customInstructions, agentId) {
    let extraPrompt = "";
    if (customInstructions) {
        const safeInstructions = String(customInstructions).slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS);
        extraPrompt += `${safeInstructions}\n\n`;
    }

    if (agentId) {
        const agentPrompt = getAgentPrompt(agentId);
        if (agentPrompt) extraPrompt += `${agentPrompt}\n\n`;
    }

    return extraPrompt;
}

ensureDataFiles();
pruneExpiredSessions();

const janitor = setInterval(() => {
    pruneExpiredSessions();
    pruneOnlinePresence();
    broadcastOnlineCount();
}, 15000);
if (typeof janitor.unref === "function") janitor.unref();

/* --------------------------------------------------------
   Auth routes
   -------------------------------------------------------- */

app.get("/api/version", (req, res) => {
    res.json({
        version: APP_VERSION,
        startedAt: APP_STARTED_AT,
        pid: process.pid,
    });
});

app.post("/api/auth/register", (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");

        if (!isValidUsername(username)) {
            return res.status(400).json({ error: "Username must be 3-32 chars: letters, numbers, _, ., -" });
        }
        if (!isValidPassword(password)) {
            return res.status(400).json({ error: "Password must be 4-128 chars" });
        }

        const usersData = loadUsers();
        const exists = usersData.users.some((u) => normalizeUsername(u.username) === normalizeUsername(username));
        if (exists) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const user = {
            id: createId(),
            username,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
        };

        usersData.users.push(user);
        saveUsers(usersData);

        const token = createSession(user);
        setAuthCookie(res, token);

        res.json({ user: toPublicUser(user) });
    } catch (e) {
        console.error("Register error:", e);
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post("/api/auth/login", (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");

        const user = findUserByUsername(username);
        if (!user || !verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const token = createSession(user);
        setAuthCookie(res, token);

        res.json({ user: toPublicUser(user) });
    } catch (e) {
        console.error("Login error:", e);
        res.status(500).json({ error: "Login failed" });
    }
});

app.post("/api/auth/logout", (req, res) => {
    try {
        const auth = getAuthContext(req);
        if (auth?.session?.sid) {
            removeSessionBySid(auth.session.sid);
        }

        clearAuthCookie(res);
        res.json({ success: true });
    } catch (e) {
        console.error("Logout error:", e);
        clearAuthCookie(res);
        res.json({ success: true });
    }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post("/api/auth/ping", requireAuth, (req, res) => {
    touchOnlinePresence(req.session);
    res.json({ success: true });
});

app.get("/api/auth/online-count", requireAuth, (req, res) => {
    if (normalizeUsername(req.user.username) !== "godli") {
        return res.status(403).json({ error: "Forbidden" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    onlineCountSseClients.add(res);
    broadcastOnlineCount(true);

    const keepAlive = setInterval(() => {
        res.write(": ping\n\n");
    }, 15000);

    req.on("close", () => {
        clearInterval(keepAlive);
        onlineCountSseClients.delete(res);
    });
});

/* --------------------------------------------------------
   Protect all other /api routes
   -------------------------------------------------------- */

app.use("/api", requireAuth);

/* --------------------------------------------------------
   Main API routes
   -------------------------------------------------------- */

app.get("/api/models", (req, res) => {
    try {
        const models = getModelsList();
        res.json(models);
    } catch (e) {
        console.error("Error reading models:", e.message);
        res.json(DEFAULT_MODELS);
    }
});

app.get("/api/agents", (req, res) => {
    const list = Object.entries(AGENTS).map(([id, a]) => ({
        id,
        name: a.name,
        icon: a.icon,
        description: a.description,
    }));
    res.json(list);
});

app.get("/api/chats", (req, res) => {
    res.json(loadChatsForUser(req.user.id));
});

app.post("/api/chats/save", (req, res) => {
    const chat = req.body;
    let chats = loadChatsForUser(req.user.id);
    const idx = chats.findIndex((c) => c.id === chat.id);
    if (idx >= 0) chats[idx] = chat;
    else chats.push(chat);
    saveChatsForUser(req.user.id, chats);
    res.json({ success: true });
});

app.delete("/api/chats/:id", (req, res) => {
    let chats = loadChatsForUser(req.user.id);
    chats = chats.filter((c) => c.id !== req.params.id);
    saveChatsForUser(req.user.id, chats);
    res.json({ success: true });
});

app.post("/api/chat", async (req, res) => {
    const { signal, cleanup } = createRequestAbortController(req, res);

    try {
        const { model, messages, customInstructions, agentId } = req.body;
        if (!model || !Array.isArray(messages)) {
            return res.status(400).json({ error: "model and messages required" });
        }

        const modelLower = String(model).toLowerCase();
        const extraPrompt = buildExtraPrompt(customInstructions, agentId);

        const lastUser = messages.filter((m) => m.role === "user").pop()?.content || "";
        const prevContext = messages.slice(0, -1).map((m) => m.content).join("\n");

        const response = await withOperationTimeout((async () => {
            if (modelLower === "arctic-sentiment") {
                return handleSentiment(lastUser, signal);
            }
            if (modelLower === "arctic-translate") {
                return handleTranslate(lastUser, signal);
            }
            if (modelLower === "arctic-extract-answer" || modelLower === "arctic-extract") {
                const doc = prevContext || lastUser;
                return handleExtractAnswer(doc, lastUser, signal);
            }
            if (modelLower === "arctic-parse-document") {
                return handleSummarize(lastUser, signal);
            }
            if (modelLower === "arctic-text2sql" || modelLower === "arctic-text2sql-r1.5") {
                return handleText2SQL(lastUser, signal);
            }
            if (modelLower === "arctic-transcribe") {
                return handleTranscribe(lastUser, signal);
            }
            if (modelLower === "twelvelabs-pegasus-1-2") {
                return "🎬 **TwelveLabs Pegasus** — модель видео-анализа.";
            }
            return callAIComplete(modelLower, messages, extraPrompt, signal);
        })(), MODEL_OPERATION_TIMEOUT_MS, "Model processing");

        if (signal.aborted) return;

        const outputTokens = estimateTokens(response);
        const inputTokens = estimateTokens(messages.map((m) => m.content).join("\n"));
        res.json({ response, inputTokens, outputTokens });
    } catch (e) {
        if (isAbortError(e)) {
            return;
        }

        console.error("Chat error:", e);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message || String(e) });
        }
    } finally {
        cleanup();
    }
});

app.post("/api/chat/regenerate", async (req, res) => {
    const { signal, cleanup } = createRequestAbortController(req, res);

    try {
        const { model, messages, customInstructions, agentId } = req.body;
        if (!model || !Array.isArray(messages)) {
            return res.status(400).json({ error: "model and messages required" });
        }

        const extraPrompt = buildExtraPrompt(customInstructions, agentId);
        const inputText = messages.map((m) => m.content).join("\n");
        const inputTokens = estimateTokens(inputText);

        const response = await withOperationTimeout(
            callAIComplete(String(model).toLowerCase(), messages, extraPrompt, signal),
            MODEL_OPERATION_TIMEOUT_MS,
            "Model processing"
        );
        if (signal.aborted) return;

        const outputTokens = estimateTokens(response);
        res.json({ response, inputTokens, outputTokens });
    } catch (e) {
        if (isAbortError(e)) {
            return;
        }

        console.error("Regenerate error:", e);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message || String(e) });
        }
    } finally {
        cleanup();
    }
});

app.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "index.html"));
});

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`godlimaster running: http://localhost:${PORT} (version: ${APP_VERSION})`);
    });

    server.requestTimeout = 10 * 60 * 1000;
    server.headersTimeout = 10 * 60 * 1000 + 10 * 1000;
}

module.exports = app;
