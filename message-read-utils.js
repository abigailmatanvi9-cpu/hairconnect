/** État « lu » des conversations — localStorage par utilisateur. */

const READ_STORAGE_PREFIX = "hc-msg-read:";

export function messageMillis(row) {
    const raw = row?.createdAt;
    if (raw?.toMillis) return raw.toMillis();
    const t = new Date(raw || 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

export function loadMessageReadState(userUid) {
    const uid = String(userUid || "").trim();
    if (!uid) return {};
    try {
        const raw = localStorage.getItem(READ_STORAGE_PREFIX + uid);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

export function saveMessageReadState(userUid, state) {
    const uid = String(userUid || "").trim();
    if (!uid) return;
    try {
        localStorage.setItem(READ_STORAGE_PREFIX + uid, JSON.stringify(state || {}));
    } catch {
        /* quota / mode privé */
    }
}

export function getPeerReadMs(userUid, peerUid, readState) {
    const state = readState || loadMessageReadState(userUid);
    return Number(state[String(peerUid || "").trim()]) || 0;
}

/** Marque comme lus les messages reçus d'un contact jusqu'à throughMs (inclus). */
export function markConversationRead(userUid, peerUid, throughMs) {
    const me = String(userUid || "").trim();
    const peer = String(peerUid || "").trim();
    if (!me || !peer) return;
    const ms = Number(throughMs);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const state = loadMessageReadState(me);
    const prev = Number(state[peer]) || 0;
    if (ms <= prev) return;
    state[peer] = ms;
    saveMessageReadState(me, state);
}

/** Nombre de messages reçus non encore lus. */
export function countUnreadMessages(messages, myUid, readState) {
    const uid = String(myUid || "").trim();
    if (!uid) return 0;
    const state = readState || loadMessageReadState(uid);
    let n = 0;
    for (const m of messages || []) {
        if (String(m.toUid || "").trim() !== uid) continue;
        const from = String(m.fromUid || "").trim();
        if (messageMillis(m) > getPeerReadMs(uid, from, state)) n += 1;
    }
    return n;
}

export function notifyMessagesReadChanged() {
    try {
        window.dispatchEvent(new CustomEvent("hc-messages-read"));
        if (window.parent && window.parent !== window) {
            const origin =
                window.location.origin && window.location.origin !== "null" ? window.location.origin : "*";
            window.parent.postMessage({ type: "hc-messages-read" }, origin);
        }
    } catch {
        /* ignore */
    }
}
