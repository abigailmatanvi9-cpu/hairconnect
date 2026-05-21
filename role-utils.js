/**
 * Normalisation des rôles utilisateur (Client, Coiffeur, Salon).
 * Aligné sur les valeurs enregistrées à l'inscription : "Client", "Coiffeur", "Salon".
 */

function foldRole(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeRole(raw) {
    const r = foldRole(raw);
    if (!r) return "unknown";
    if (r === "client") return "client";
    if (r === "salon" || r.startsWith("salon ")) return "salon";
    if (
        r === "coiffeur" ||
        r === "coiffeuse" ||
        r === "coiffeur independant" ||
        r === "coiffeuse independante"
    ) {
        return "coiffeur";
    }
    return "unknown";
}

/** Déduit le rôle si le champ role est vide (anciens comptes avec salonName renseigné). */
export function resolveUserRole(profile) {
    if (!profile || typeof profile !== "object") return "unknown";
    const direct = normalizeRole(profile.role);
    if (direct !== "unknown") return direct;
    if (String(profile.salonName || "").trim()) return "salon";
    return "unknown";
}

export function isProRole(rawOrProfile) {
    if (rawOrProfile && typeof rawOrProfile === "object") {
        const rk = resolveUserRole(rawOrProfile);
        return rk === "salon" || rk === "coiffeur";
    }
    const rk = normalizeRole(rawOrProfile);
    return rk === "salon" || rk === "coiffeur";
}

export function isSalonRole(rawOrProfile) {
    if (rawOrProfile && typeof rawOrProfile === "object") {
        return resolveUserRole(rawOrProfile) === "salon";
    }
    return normalizeRole(rawOrProfile) === "salon";
}

export function isCoiffeurRole(rawOrProfile) {
    if (rawOrProfile && typeof rawOrProfile === "object") {
        return resolveUserRole(rawOrProfile) === "coiffeur";
    }
    return normalizeRole(rawOrProfile) === "coiffeur";
}

export function isClientRole(rawOrProfile) {
    if (rawOrProfile && typeof rawOrProfile === "object") {
        return resolveUserRole(rawOrProfile) === "client";
    }
    return normalizeRole(rawOrProfile) === "client";
}

export function authUserId(user) {
    return String(user?.uid || user?.id || "").trim();
}
