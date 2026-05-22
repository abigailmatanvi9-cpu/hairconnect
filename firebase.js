/** Base de l’API : même origine en prod (Express sert le front + /api), localhost:3000 en dev séparé (Live Server, etc.). */
function resolveApiBase() {
    const override = window.__HAIRCONNECT_API_BASE__;
    if (override != null && String(override).trim() !== "") {
        return String(override).trim().replace(/\/$/, "");
    }
    try {
        const { protocol, hostname, port } = window.location;
        if (!protocol.startsWith("http")) {
            return "http://localhost:3000/api";
        }
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
        const portStr = String(port || "");
        if (isLocal && portStr !== "" && portStr !== "3000") {
            return `http://${hostname}:3000/api`;
        }
        return `${window.location.origin}/api`;
    } catch {
        /* ignore */
    }
    return "http://localhost:3000/api";
}

const API_BASE = resolveApiBase();
const STORAGE_KEY = "hairconnect_auth_user";
const authListeners = new Set();

/** Liste des types de pros (slug + libellé) — inscriptions, profil, filtre annuaire. */
export const HAIRCONNECT_METIERS = [
    { slug: "barbier", label: "Barbier" },
    { slug: "coiffeur", label: "Coiffeur" },
    { slug: "coiffeuse", label: "Coiffeuse" },
    { slug: "tresseuse", label: "Tresseuse / nattes" },
    { slug: "coloriste", label: "Coloriste" },
    { slug: "extensions", label: "Extensions / pose" },
    { slug: "soins", label: "Soins capillaires" },
    { slug: "autre", label: "Autre / polyvalent" }
];

/** Types de photo pour la galerie « S'inspirer » (slug + libellé). */
export const PUBLICATION_STYLE_TYPES = [
    { slug: "tresses", label: "Tresses / nattes" },
    { slug: "coupe", label: "Coupe & brushing" },
    { slug: "coloration", label: "Coloration" },
    { slug: "extensions", label: "Extensions & pose" },
    { slug: "barbier", label: "Barbier" },
    { slug: "afro", label: "Coiffure afro / twist" },
    { slug: "soins", label: "Soins capillaires" },
    { slug: "autre", label: "Autre style" }
];

const STYLE_TYPE_BY_SLUG = new Map(PUBLICATION_STYLE_TYPES.map((t) => [t.slug, t]));

export function isAllowedPublicationStyleType(slug) {
    return STYLE_TYPE_BY_SLUG.has(String(slug || "").trim().toLowerCase());
}

export function publicationStyleTypeLabel(slug) {
    const key = String(slug || "").trim().toLowerCase();
    return STYLE_TYPE_BY_SLUG.get(key)?.label || "";
}

function normalizeUser(rawUser) {
    if (!rawUser) return null;
    return { uid: rawUser.id || rawUser.uid, email: rawUser.email || "" };
}

function setCurrentUser(user) {
    auth.currentUser = user;
    if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
    authListeners.forEach((cb) => cb(user));
}

function readCurrentUser() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        return normalizeUser(data);
    } catch {
        return null;
    }
}

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
    });
    const rawText = await response.text();
    let payload = {};
    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = {};
        }
    }
    if (!response.ok) {
        const plain =
            rawText && rawText.length < 500
                ? rawText
                      .replace(/<[^>]*>/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                : "";
        const msg =
            (payload && payload.message) ||
            plain ||
            `Erreur serveur (${response.status}). Redémarrez le backend (npm run dev) si la fonction vient d’être ajoutée.`;
        const err = new Error(msg);
        err.code = (payload && payload.code) || "internal/error";
        err.status = response.status;
        throw err;
    }
    return payload;
}

export const app = null;
export const db = null;
export const auth = { currentUser: readCurrentUser() };

export function onAuthStateChanged(_auth, callback) {
    authListeners.add(callback);
    callback(auth.currentUser);
    return () => authListeners.delete(callback);
}

export async function registerUser(email, password) {
    const payload = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    const user = normalizeUser(payload.user);
    setCurrentUser(user);
    return { user };
}

export async function loginUser(email, password) {
    const payload = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    const user = normalizeUser(payload.user);
    setCurrentUser(user);
    return { user };
}

export async function signOut() {
    setCurrentUser(null);
}

export async function saveUserData(uid, name, email, role, extra = {}) {
    await apiFetch(`/users/${encodeURIComponent(uid)}`, {
        method: "PUT",
        body: JSON.stringify({ name, email, role, ...extra })
    });
}

/**
 * Ne lit plus le profil : le choix des types recherchés se fait sur la page Annuaire uniquement.
 * Toujours null pour que `listProfessionals()` sans option renvoie la liste complète ;
 * depuis recherche.html on passe `forClientMetiers` explicitement.
 */
export async function resolveClientMetiersForListing() {
    return null;
}

export async function fetchUserProfile(uid) {
    try {
        const payload = await apiFetch(`/users/${encodeURIComponent(uid)}`);
        return payload.user ? { id: payload.user.id, ...payload.user } : null;
    } catch (error) {
        if (error.message.includes("introuvable")) return null;
        throw error;
    }
}

export async function updateUserProfile(uid, partial) {
    await apiFetch(`/users/${encodeURIComponent(uid)}`, {
        method: "PUT",
        body: JSON.stringify({ ...partial, updatedAt: new Date().toISOString() })
    });
}

export async function listUsers() {
    const payload = await apiFetch("/users");
    return payload.users || [];
}

export async function fetchUserByEmail(email) {
    const em = String(email || "")
        .trim()
        .toLowerCase();
    if (!em) return null;
    try {
        const payload = await apiFetch(`/users/by-email?email=${encodeURIComponent(em)}`);
        return payload.user ? { id: payload.user.id, ...payload.user } : null;
    } catch (e) {
        if (String(e?.message || "").includes("introuvable") || String(e?.message || "").includes("Aucun compte")) {
            return null;
        }
        throw e;
    }
}

export async function listRendezVousForPro(proUid) {
    const payload = await apiFetch(`/rendez-vous?proUid=${encodeURIComponent(proUid)}`);
    return payload.rendezVous || [];
}

export async function listRendezVousForClient(clientUid) {
    const payload = await apiFetch(`/rendez-vous/client?clientUid=${encodeURIComponent(clientUid)}`);
    return payload.rendezVous || [];
}

export async function createRendezVous({ proUid, clientUid, scheduledAt, prestation, priceFcfa, prestationPriceFcfa }) {
    const body = {
        proUid: String(proUid || "").trim(),
        clientUid: String(clientUid || "").trim(),
        scheduledAt: scheduledAt instanceof Date ? scheduledAt.toISOString() : String(scheduledAt || ""),
        prestation: String(prestation || "").trim()
    };
    const prestRaw = prestationPriceFcfa != null && prestationPriceFcfa !== "" ? prestationPriceFcfa : priceFcfa;
    if (prestRaw != null && prestRaw !== "") {
        const n = Number(prestRaw);
        if (Number.isInteger(n) && n >= 0) body.prestationPriceFcfa = n;
    }
    const payload = await apiFetch("/rendez-vous", {
        method: "POST",
        body: JSON.stringify(body)
    });
    return payload.rendezVous;
}

export async function updateRendezVous(id, proUid, partial) {
    const body = { proUid: String(proUid || "").trim() };
    if (partial.prestation !== undefined) body.prestation = partial.prestation;
    if (partial.status !== undefined) body.status = partial.status;
    if (partial.proComment !== undefined) body.proComment = partial.proComment;
    if (Object.prototype.hasOwnProperty.call(partial, "proRating")) body.proRating = partial.proRating;
    if (partial.scheduledAt !== undefined) {
        body.scheduledAt =
            partial.scheduledAt instanceof Date ? partial.scheduledAt.toISOString() : partial.scheduledAt;
    }
    if (partial.priceFcfa !== undefined) {
        if (partial.priceFcfa === null || partial.priceFcfa === "") {
            body.priceFcfa = null;
        } else {
            const n = parseInt(String(partial.priceFcfa).replace(/\s/g, ""), 10);
            if (Number.isFinite(n) && n >= 0) body.priceFcfa = n;
        }
    }
    if (partial.prestationPriceFcfa !== undefined) {
        if (partial.prestationPriceFcfa === null || partial.prestationPriceFcfa === "") {
            body.prestationPriceFcfa = null;
        } else {
            const n = parseInt(String(partial.prestationPriceFcfa).replace(/\s/g, ""), 10);
            if (Number.isFinite(n) && n >= 0) body.prestationPriceFcfa = n;
        }
    }
    const payload = await apiFetch(`/rendez-vous/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body)
    });
    return payload.rendezVous;
}

/** Nouveau RDV « À venir » à partir d’un RDV annulé uniquement. */
export async function renewRendezVous(id, proUid, scheduledAt) {
    const payload = await apiFetch(`/rendez-vous/${encodeURIComponent(id)}/renew`, {
        method: "POST",
        body: JSON.stringify({
            proUid: String(proUid || "").trim(),
            scheduledAt:
                scheduledAt instanceof Date ? scheduledAt.toISOString() : String(scheduledAt || "")
        })
    });
    return payload.rendezVous;
}

export async function getRendezVousItemSelection(rendezVousId, uid) {
    const payload = await apiFetch(
        `/rendez-vous/${encodeURIComponent(rendezVousId)}/item-selection?uid=${encodeURIComponent(String(uid || "").trim())}`
    );
    return payload;
}

export async function saveRendezVousItemSelection(rendezVousId, clientUid, lines) {
    const payload = await apiFetch(`/rendez-vous/${encodeURIComponent(rendezVousId)}/item-selection`, {
        method: "PUT",
        body: JSON.stringify({
            clientUid: String(clientUid || "").trim(),
            lines: Array.isArray(lines)
                ? lines.map((row) => ({
                      productId: String(row?.productId || "").trim(),
                      quantity: Number(row?.quantity || 0),
                      ...(row?.color != null && String(row.color).trim()
                          ? { color: String(row.color).trim() }
                          : {})
                  }))
                : []
        })
    });
    return payload.selection;
}

export async function sendRendezVousReminderNow(id, proUid) {
    const payload = await apiFetch(`/rendez-vous/${encodeURIComponent(id)}/send-reminder`, {
        method: "POST",
        body: JSON.stringify({ proUid: String(proUid || "").trim() })
    });
    return payload;
}

export async function payRendezVousOnline(id, clientUid, provider) {
    const raw = String(provider || "").trim().toLowerCase();
    const normalized = raw === "mix_by_yas" || raw === "mix" ? "mix_by_yas" : "flooz";
    const payload = await apiFetch(`/rendez-vous/${encodeURIComponent(id)}/pay`, {
        method: "POST",
        body: JSON.stringify({
            clientUid: String(clientUid || "").trim(),
            provider: normalized
        })
    });
    return payload;
}

/**
 * Annuaire des professionnels. Si le client a renseigné « types recherchés » dans son profil,
 * seuls les pros avec au moins un métier correspondant sont renvoyés (les sans métier restent visibles).
 * `forClientMetiers: null` force la liste complète (sans filtre métier).
 */
export async function listProfessionals(options = {}) {
    let { forClientMetiers } = options;
    if (forClientMetiers === undefined) {
        forClientMetiers = await resolveClientMetiersForListing();
    }
    const params = new URLSearchParams();
    if (forClientMetiers != null && String(forClientMetiers).trim() !== "") {
        params.set("forClientMetiers", String(forClientMetiers).trim());
    }
    const qs = params.toString();
    const path = qs ? `/users?${qs}` : "/users";
    const payload = await apiFetch(path);
    return (payload.users || [])
        .filter((u) => {
            const role = String(u?.role || "").trim().toLowerCase();
            return role === "salon" || role === "coiffeur" || role === "coiffeuse" || role === "coiffeur indépendant" || role === "coiffeuse indépendante";
        })
        .map((u) => ({ id: u.id, ...u }));
}

export async function sendMessage(fromUid, toUid, text) {
    await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({ fromUid, toUid, text: text.trim() })
    });
}

export async function listMessagesForUser(uid) {
    const payload = await apiFetch(`/messages?uid=${encodeURIComponent(uid)}`);
    return (payload.messages || []).map((m) => ({ ...m, createdAt: { toMillis: () => new Date(m.createdAt).getTime() } }));
}

export async function listContactRequestsForUser(uid) {
    const payload = await apiFetch(`/contact-requests?uid=${encodeURIComponent(uid)}`);
    return payload.requests || [];
}

export async function getContactRequestBetween(clientUid, proUid) {
    const payload = await apiFetch(
        `/contact-requests/between?clientUid=${encodeURIComponent(clientUid)}&proUid=${encodeURIComponent(proUid)}`
    );
    return payload.request || null;
}

export async function createContactRequest(clientUid, proUid, message) {
    const payload = await apiFetch("/contact-requests", {
        method: "POST",
        body: JSON.stringify({
            clientUid: String(clientUid || "").trim(),
            proUid: String(proUid || "").trim(),
            message: message != null ? String(message).trim() : ""
        })
    });
    return payload.request;
}

export async function respondContactRequest(requestId, proUid, status) {
    const payload = await apiFetch(`/contact-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        body: JSON.stringify({
            proUid: String(proUid || "").trim(),
            status: String(status || "").trim().toLowerCase()
        })
    });
    return payload.request;
}

export async function createReview(fromClientUid, toProUid, rating, comment, photoUrl) {
    await apiFetch("/avis", {
        method: "POST",
        body: JSON.stringify({
            fromClientUid,
            toProUid,
            rating: Number(rating),
            comment: comment.trim(),
            photoUrl: (photoUrl || "").trim()
        })
    });
}

export async function createDomicileRequest(clientUid, proUid, message) {
    await apiFetch("/demandes-domicile", {
        method: "POST",
        body: JSON.stringify({ clientUid, proUid: proUid || null, message: message.trim() })
    });
}

export async function createOffre(
    salonUid,
    salonName,
    title,
    description,
    city,
    contractType,
    { quartier = "", remunerationType = "", salaryFcfa = null, remunerationNote = "" } = {}
) {
    const normalizedContract =
        typeof contractType === "string" && contractType.trim() ? String(contractType).trim().toLowerCase() : null;
    const body = {
        salonUid,
        salonName: salonName || "",
        title: title.trim(),
        description: description.trim(),
        city: (city || "").trim(),
        quartier: (quartier || "").trim(),
        contractType: normalizedContract,
        remunerationType: (remunerationType || "").trim().toLowerCase(),
        remunerationNote: (remunerationNote || "").trim() || null
    };
    if (body.remunerationType === "monthly" && salaryFcfa != null && salaryFcfa !== "") {
        body.salaryFcfa = Number.parseInt(String(salaryFcfa), 10);
    }
    await apiFetch("/offres", {
        method: "POST",
        body: JSON.stringify(body)
    });
}

export async function fetchOffreById(offerId) {
    try {
        const payload = await apiFetch(`/offres/${encodeURIComponent(offerId)}`);
        return payload.offre ? { id: payload.offre.id, ...payload.offre } : null;
    } catch (error) {
        if (error.message.includes("introuvable")) return null;
        throw error;
    }
}

export async function listOffres(forSalonUid) {
    const uid = forSalonUid != null ? String(forSalonUid || "").trim() : "";
    const suffix = uid ? `?forSalon=${encodeURIComponent(uid)}` : "";
    const payload = await apiFetch(`/offres${suffix}`);
    return (payload.offres || []).map((o) => ({ ...o, createdAt: { toMillis: () => new Date(o.createdAt).getTime() } }));
}

/** Marque une offre comme pourvue (filled) ou la rouvre (open). Réservé au salon propriétaire. */
export async function updateOffreStatus(offerId, salonUid, status) {
    const s = String(status || "").trim().toLowerCase();
    await apiFetch(`/offres/${encodeURIComponent(offerId)}`, {
        method: "PATCH",
        body: JSON.stringify({ salonUid: String(salonUid || "").trim(), status: s })
    });
}

/** Retire une offre (salon propriétaire uniquement). Supprime aussi les candidatures liées. */
export async function deleteOffre(offerId, salonUid) {
    await apiFetch(`/offres/${encodeURIComponent(offerId)}`, {
        method: "DELETE",
        body: JSON.stringify({ salonUid: String(salonUid || "").trim() })
    });
}

// Marketplace (multi-vendeurs) — commission plateforme 10% côté backend.
export async function listMarketplaceProducts(params = {}) {
    const q = new URLSearchParams();
    if (params.q) q.set("q", String(params.q));
    if (params.sellerUid) q.set("sellerUid", String(params.sellerUid));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const payload = await apiFetch(`/marketplace/products${suffix}`);
    return { products: payload.products || [], feeRateBp: payload.feeRateBp || 1000 };
}

export async function createMarketplaceProduct(sellerUid, sellerName, input) {
    const payload = await apiFetch("/marketplace/products", {
        method: "POST",
        body: JSON.stringify({
            sellerUid,
            sellerName: sellerName || "",
            title: String(input?.title || "").trim(),
            description: String(input?.description || "").trim(),
            priceFcfa: Number(input?.priceFcfa),
            stock: Number(input?.stock || 1),
            category: String(input?.category || "").trim(),
            colors: String(input?.colors || "").trim(),
            photoUrl: String(input?.photoUrl || "").trim()
        })
    });
    return payload.product;
}

export async function updateMarketplaceProduct(productId, sellerUid, input) {
    const body = { sellerUid: String(sellerUid || "").trim() };
    if (input?.title !== undefined) body.title = String(input.title || "").trim();
    if (input?.description !== undefined) body.description = String(input.description || "").trim();
    if (input?.category !== undefined) body.category = String(input.category || "").trim();
    if (input?.priceFcfa !== undefined) body.priceFcfa = Number(input.priceFcfa);
    if (input?.stock !== undefined) body.stock = Number(input.stock);
    if (input?.colors !== undefined) body.colors = String(input.colors || "").trim();
    if (input?.photoUrl !== undefined) body.photoUrl = String(input.photoUrl || "").trim();
    const payload = await apiFetch(`/marketplace/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        body: JSON.stringify(body)
    });
    return payload.product;
}

export async function deleteMarketplaceProduct(productId, sellerUid) {
    await apiFetch(`/marketplace/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        body: JSON.stringify({ sellerUid: String(sellerUid || "").trim() })
    });
}

/** @param {Array<{ productId: string, quantity?: number }>} items */
export async function createMarketplaceOrder(buyerUid, items) {
    const payload = await apiFetch("/marketplace/orders", {
        method: "POST",
        body: JSON.stringify({
            buyerUid,
            items: (items || []).map((row) => ({
                productId: String(row.productId || "").trim(),
                quantity: Number(row.quantity || 1),
                ...(row?.color != null && String(row.color).trim()
                    ? { color: String(row.color).trim() }
                    : {})
            }))
        })
    });
    return payload;
}

export async function cancelMarketplaceOrder(orderId, { buyerUid, sellerUid } = {}) {
    const body = {};
    if (buyerUid) body.buyerUid = String(buyerUid).trim();
    if (sellerUid) body.sellerUid = String(sellerUid).trim();
    const payload = await apiFetch(`/marketplace/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: JSON.stringify(body)
    });
    return payload.order;
}

export async function listMarketplaceMessagingPeers(uid) {
    const payload = await apiFetch(
        `/marketplace/messaging-peers?uid=${encodeURIComponent(String(uid || "").trim())}`
    );
    return { peerUids: payload.peerUids || [] };
}

export async function listMarketplaceOrders(params = {}) {
    const q = new URLSearchParams();
    if (params.buyerUid) q.set("buyerUid", String(params.buyerUid));
    if (params.sellerUid) q.set("sellerUid", String(params.sellerUid));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const payload = await apiFetch(`/marketplace/orders${suffix}`);
    return { orders: payload.orders || [], feeRateBp: payload.feeRateBp || 1000 };
}

export async function updateMarketplaceOrderStatus(orderId, sellerUid, status) {
    const payload = await apiFetch(`/marketplace/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ sellerUid, status })
    });
    return payload.order;
}

export async function createCandidature(offerId, coiffeurUid, salonUid, message) {
    await apiFetch("/candidatures", {
        method: "POST",
        body: JSON.stringify({ offerId, coiffeurUid, salonUid, message: (message || "").trim() })
    });
}

export async function listCandidaturesForCoiffeur(coiffeurUid) {
    const payload = await apiFetch(`/candidatures?coiffeurUid=${encodeURIComponent(coiffeurUid)}`);
    return (payload.candidatures || []).map((c) => ({
        ...c,
        status: String(c.status || "pending").toLowerCase(),
        createdAt: { toMillis: () => new Date(c.createdAt).getTime() },
        updatedAt: c.updatedAt ? { toMillis: () => new Date(c.updatedAt).getTime() } : null
    }));
}

export async function listCandidaturesForSalon(salonUid) {
    const payload = await apiFetch(`/candidatures?salonUid=${encodeURIComponent(salonUid)}`);
    return (payload.candidatures || []).map((c) => ({
        ...c,
        status: String(c.status || "pending").toLowerCase(),
        createdAt: { toMillis: () => new Date(c.createdAt).getTime() },
        updatedAt: c.updatedAt ? { toMillis: () => new Date(c.updatedAt).getTime() } : null
    }));
}

export async function respondCandidature(candidatureId, salonUid, status) {
    const payload = await apiFetch(`/candidatures/${encodeURIComponent(candidatureId)}`, {
        method: "PATCH",
        body: JSON.stringify({
            salonUid: String(salonUid || "").trim(),
            status: String(status || "").trim().toLowerCase()
        })
    });
    return payload.candidature;
}

export async function listAvisForPro(toProUid) {
    const payload = await apiFetch(`/avis?toProUid=${encodeURIComponent(toProUid)}`);
    return (payload.avis || []).map((a) => ({ ...a, createdAt: { toMillis: () => new Date(a.createdAt).getTime() } }));
}

/** Tous les avis (agrégation côté client, une seule requête). */
export async function listAllAvis() {
    const payload = await apiFetch("/avis");
    return (payload.avis || []).map((a) => ({ ...a, createdAt: { toMillis: () => new Date(a.createdAt).getTime() } }));
}

export async function listAvisByClient(fromClientUid) {
    const payload = await apiFetch(`/avis?fromClientUid=${encodeURIComponent(fromClientUid)}`);
    return (payload.avis || []).map((a) => ({ ...a, createdAt: { toMillis: () => new Date(a.createdAt).getTime() } }));
}

export async function addFavorite(clientId, proId) {
    await apiFetch("/favorites", {
        method: "POST",
        body: JSON.stringify({ clientId, proId })
    });
}

export async function removeFavorite(clientId, proId) {
    await apiFetch("/favorites", {
        method: "DELETE",
        body: JSON.stringify({ clientId, proId })
    });
}

export async function listFavorites(clientId) {
    const payload = await apiFetch(`/favorites?clientId=${encodeURIComponent(clientId)}`);
    return (payload.favorites || []).map((f) => ({ ...f, createdAt: { toMillis: () => new Date(f.createdAt).getTime() } }));
}

export async function createPublication({ authorUid, targetProUid, photoUrl, title, caption, kind, styleType }) {
    await apiFetch("/publications", {
        method: "POST",
        body: JSON.stringify({
            authorUid,
            targetProUid,
            photoUrl: String(photoUrl || "").trim(),
            title: String(title || "").trim(),
            caption: String(caption || "").trim(),
            kind: String(kind || "").trim(),
            styleType: String(styleType || "").trim().toLowerCase()
        })
    });
}

export async function listPublications({ targetProUid, authorUid, kind, styleType, withAuthorNames } = {}) {
    const params = new URLSearchParams();
    if (targetProUid) params.set("targetProUid", targetProUid);
    if (authorUid) params.set("authorUid", authorUid);
    if (kind) params.set("kind", kind);
    if (styleType) params.set("styleType", String(styleType).trim().toLowerCase());
    if (withAuthorNames) params.set("withAuthorNames", "1");
    const qs = params.toString();
    const payload = await apiFetch(`/publications${qs ? "?" + qs : ""}`);
    return (payload.publications || []).map((p) => ({
        ...p,
        createdAt: { toMillis: () => new Date(p.createdAt).getTime() }
    }));
}

export async function deletePublication(id, authorUid) {
    const uid = String(authorUid || "").trim();
    const qs = uid ? `?authorUid=${encodeURIComponent(uid)}` : "";
    await apiFetch(`/publications/${encodeURIComponent(id)}${qs}`, {
        method: "DELETE",
        body: JSON.stringify({ authorUid: uid })
    });
}

/** Messages en français pour les erreurs Firebase (Auth + Firestore courantes). */
export function getFirebaseErrorMessage(error) {
    const code = error?.code || "";
    const msg = String(error?.message || "");
    const authMessages = {
        "auth/email-already-in-use": "Cet e-mail est déjà utilisé.",
        "auth/invalid-email": "Adresse e-mail invalide.",
        "auth/weak-password": "Mot de passe trop faible (au moins 6 caractères).",
        "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
        "auth/user-not-found": "Aucun compte avec cet e-mail.",
        "auth/wrong-password": "Mot de passe incorrect.",
        "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
        "auth/network-request-failed": "Problème de réseau. Vérifiez votre connexion."
    };
    if (code.startsWith("auth/") && authMessages[code]) {
        return authMessages[code];
    }
    if (code === "contact/not-accepted" || code === "contact/already-accepted") {
        return msg || "Action impossible pour cette demande de contact.";
    }
    if (code === "schema/missing-table") {
        return msg;
    }
    if (code === "permission-denied") {
        return "Accès refusé : vérifiez les règles Firestore dans la console Firebase.";
    }
    if (code === "failed-precondition") {
        return "Index Firestore manquant : la console propose souvent un lien pour le créer.";
    }
    if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg === "Load failed" ||
        msg.includes("Load failed")
    ) {
        return "Impossible de joindre le serveur. Vérifiez votre connexion, attendez quelques secondes (démarrage Render) et réessayez.";
    }
    if (msg.includes("column") && msg.includes("does not exist")) {
        return "Base de données en cours de mise à jour sur le serveur. Attendez 1 à 2 minutes, rechargez la page (Ctrl+F5). Si le message persiste : sur Render, vérifiez que la commande de démarrage est « npm start », puis faites un Manual Deploy.";
    }
    if (error?.status === 404 || /Cannot POST|Cannot GET/i.test(msg)) {
        return "Le serveur n’a pas trouvé cette action (404). Lancez « npm run dev » dans le dossier HairConnect, ouvrez l’agenda via le même hôte que l’API (ex. http://127.0.0.1:3000/agenda-pro.html si vous utilisez 127.0.0.1), puis rechargez la page.";
    }
    return error?.message || "Une erreur est survenue.";
}
