import { initialsFromName, normalizePhotoUrl } from "./image-utils.js";

export function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function renderStars(rating) {
    const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "★".repeat(r) + "☆".repeat(5 - r);
}

export function avisMillis(createdAt) {
    if (createdAt?.toMillis) return createdAt.toMillis();
    const t = new Date(createdAt || 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

export function formatRelativeFr(createdAt) {
    const ms = avisMillis(createdAt);
    if (!ms) return "";
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return hours === 1 ? "Il y a 1 heure" : `Il y a ${hours} heures`;
    const days = Math.floor(diff / 86400000);
    if (days === 1) return "Il y a 1 jour";
    if (days < 30) return `Il y a ${days} jours`;
    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? "Il y a 1 mois" : `Il y a ${months} mois`;
    const years = Math.floor(days / 365);
    return years === 1 ? "Il y a 1 an" : `Il y a ${years} ans`;
}

export function avisDateLong(createdAt) {
    const ms = avisMillis(createdAt);
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

export function clientDisplayShort(profile) {
    const n = String(profile?.name || "").trim();
    if (!n) return "";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    return parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + ".";
}

export function clientAuthorLabel(profile) {
    const short = clientDisplayShort(profile);
    if (short) return short;
    const city = String(profile?.city || "").trim();
    if (city) return `Cliente de ${city}`;
    return "Cliente";
}

export function isVerifiedClient(profile) {
    return Boolean(String(profile?.name || "").trim());
}

export function computeAvisSummary(avis) {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    for (const a of avis || []) {
        const r = Math.round(Math.max(1, Math.min(5, Number(a.rating) || 0)));
        counts[r] += 1;
        sum += r;
    }
    const total = (avis || []).length;
    const avg = total ? sum / total : null;
    const maxCount = Math.max(1, ...Object.values(counts));
    return { avg, total, counts, maxCount };
}

export function formatAvisAvg(avg) {
    if (avg == null || !Number.isFinite(avg)) return null;
    const rounded = Math.round(avg * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function renderAvisSummaryHtml(summary, { compact = false } = {}) {
    const avgLabel = formatAvisAvg(summary.avg);
    if (!summary.total) {
        return '<p class="ar-hub-summary__empty">Pas encore d’avis.</p>';
    }
    const bars = [5, 4, 3, 2, 1]
        .map((star) => {
            const count = summary.counts[star] || 0;
            const pct = Math.round((count / summary.maxCount) * 100);
            const starsLabel = "★".repeat(star) + "☆".repeat(5 - star);
            return (
                `<div class="ar-hub-summary__row">` +
                `<span class="ar-hub-summary__row-stars" aria-hidden="true">${starsLabel}</span>` +
                `<div class="ar-hub-summary__bar" role="presentation">` +
                `<div class="ar-hub-summary__bar-fill" style="width:${pct}%"></div>` +
                `</div>` +
                `<span class="ar-hub-summary__row-count">${count}</span>` +
                `</div>`
            );
        })
        .join("");
    const compactClass = compact ? " ar-hub-summary--compact" : "";
    return (
        `<div class="ar-hub-summary${compactClass}">` +
        `<div class="ar-hub-summary__head">` +
        `<p class="ar-hub-summary__score">${escapeHtml(avgLabel || "—")}</p>` +
        `<p class="ar-hub-summary__stars-main" aria-hidden="true">${escapeHtml(renderStars(Math.round(summary.avg || 0)))}</p>` +
        `<p class="ar-hub-summary__count-label">⭐ ${escapeHtml(avgLabel || "—")}/5</p>` +
        `<p class="ar-hub-summary__total">${summary.total} avis</p>` +
        `</div>` +
        `<div class="ar-hub-summary__bars">${bars}</div>` +
        `</div>`
    );
}

function avatarBlockHtml(profile, authorLabel) {
    const photo = normalizePhotoUrl(profile?.photoUrl);
    const initials = initialsFromName(profile?.name || authorLabel);
    if (photo) {
        return (
            `<div class="ar-hub-card__avatar ar-hub-card__avatar--img">` +
            `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">` +
            `</div>`
        );
    }
    return `<div class="ar-hub-card__avatar" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

export function buildAvisCardInnerHtml(avis, clientProfile) {
    const rating = Math.max(1, Math.min(5, Number(avis.rating || 0))) || 0;
    const author = clientAuthorLabel(clientProfile);
    const verified = isVerifiedClient(clientProfile);
    const rel = formatRelativeFr(avis.createdAt);
    const longDate = avisDateLong(avis.createdAt);
    const photoUrl = String(avis.photoUrl || "").trim();
    const proReply = String(avis.proReply || "").trim();

    const photoBlock = photoUrl
        ? `<p class="ar-hub-card__photo-label">📸 Photo jointe</p>` +
          `<div class="ar-hub-card__photo">` +
          `<a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener noreferrer">` +
          `<img src="${escapeHtml(photoUrl)}" alt="Photo de l’avis" loading="lazy" decoding="async">` +
          `</a></div>`
        : "";

    const replyBlock = proReply
        ? `<div class="ar-hub-card__reply">` +
          `<p class="ar-hub-card__reply-label">Réponse du professionnel :</p>` +
          `<p class="ar-hub-card__reply-text">${escapeHtml(proReply)}</p>` +
          `</div>`
        : "";

    const dateLines = [];
    if (rel) dateLines.push(`<span class="ar-hub-card__date-rel">📅 ${escapeHtml(rel)}</span>`);
    if (longDate) dateLines.push(`<span class="ar-hub-card__date-long">Publié le ${escapeHtml(longDate)}</span>`);

    return (
        `<div class="ar-hub-card__head">` +
        avatarBlockHtml(clientProfile, author) +
        `<div class="ar-hub-card__identity">` +
        `<p class="ar-hub-card__author">${escapeHtml(author)}</p>` +
        (verified ? `<p class="ar-hub-card__badge">Cliente vérifiée</p>` : "") +
        `</div></div>` +
        `<p class="ar-hub-card__stars" aria-label="${rating} sur 5">${escapeHtml(renderStars(rating))}</p>` +
        `<p class="ar-hub-card__comment">${escapeHtml(String(avis.comment || "").trim() || "Sans commentaire.")}</p>` +
        (dateLines.length ? `<div class="ar-hub-card__dates">${dateLines.join("")}</div>` : "") +
        photoBlock +
        replyBlock
    );
}

export function createAvisCardElement(avis, clientProfile, { avisId = "", allowReply = false } = {}) {
    const li = document.createElement("li");
    li.className = "ar-hub-card";
    if (avisId) li.dataset.avisId = avisId;
    li.innerHTML = buildAvisCardInnerHtml(avis, clientProfile);

    if (allowReply) {
        const replyWrap = document.createElement("div");
        replyWrap.className = "ar-hub-card__reply-form";
        const existing = String(avis.proReply || "").trim();
        const safeId = String(avis.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
        replyWrap.innerHTML =
            `<label class="ar-hub-card__reply-form-label" for="reply-${safeId}">` +
            (existing ? "Modifier votre réponse" : "Répondre à cet avis") +
            `</label>` +
            `<textarea id="reply-${safeId}" class="ar-hub-card__reply-input field-textarea" rows="2" maxlength="500" placeholder="Merci pour votre confiance…">${escapeHtml(existing)}</textarea>` +
            `<button type="button" class="ar-hub-card__reply-btn" data-avis-reply="${escapeHtml(avis.id)}">` +
            (existing ? "Enregistrer la réponse" : "Publier la réponse") +
            `</button>`;
        li.appendChild(replyWrap);
    }

    return li;
}

export async function buildClientProfileMap(avisList, fetchUserProfile) {
    const uids = [...new Set((avisList || []).map((a) => String(a.fromClientUid || "").trim()).filter(Boolean))];
    const map = {};
    await Promise.all(
        uids.map(async (id) => {
            const p = await fetchUserProfile(id).catch(() => null);
            if (p) map[id] = p;
        })
    );
    return map;
}
