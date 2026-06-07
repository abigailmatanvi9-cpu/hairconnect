/** Paramètres adaptés aux photos de profil (petit avatar, data URL fiable dans <img>). */
export const PROFILE_AVATAR_COMPRESS = {
    maxWidth: 512,
    maxHeight: 512,
    maxBytes: 320_000,
    quality: 0.85
};

/** Taille max (caractères) d'une data URL affichable de façon fiable dans un <img>. */
const DISPLAYABLE_DATA_URL_MAX_LEN = 450_000;

export function initialsFromName(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normalizePhotoUrl(raw) {
    if (raw == null) return "";
    const u = String(raw).trim();
    if (!u) return "";
    if (u.startsWith("data:") && u.length > DISPLAYABLE_DATA_URL_MAX_LEN) return "";
    return u;
}

/** Affiche une photo de profil dans un couple img + fallback initiales. */
export function applyAvatarElements(img, fb, displayName, url) {
    if (!img || !fb) return;
    const initials = initialsFromName(displayName);
    const showFallback = () => {
        img.onload = null;
        img.onerror = null;
        img.removeAttribute("src");
        img.hidden = true;
        fb.hidden = false;
        fb.textContent = initials;
    };
    const u = normalizePhotoUrl(url);
    if (!u) {
        showFallback();
        return;
    }
    img.onerror = showFallback;
    img.onload = () => {
        img.hidden = false;
        fb.hidden = true;
        img.onerror = null;
        img.onload = null;
    };
    img.hidden = true;
    fb.hidden = false;
    fb.textContent = initials;
    img.src = u;
    if (img.complete && img.naturalWidth > 0) {
        img.hidden = false;
        fb.hidden = true;
        img.onerror = null;
        img.onload = null;
    }
}

/** Résout une photo pro pour affichage liste (gère les anciennes data URL trop longues). */
export async function resolveProPhotoUrl(raw) {
    const u = String(raw || "").trim();
    if (!u) return "";
    if (!/^data:image\//i.test(u)) return u;
    if (u.length <= DISPLAYABLE_DATA_URL_MAX_LEN) return u;
    try {
        const blob = await fetch(u).then((res) => res.blob());
        return URL.createObjectURL(blob);
    } catch {
        return "";
    }
}

export async function mountProAvatar(img, fb, displayName, rawUrl) {
    const url = await resolveProPhotoUrl(rawUrl);
    applyAvatarElements(img, fb, displayName, url);
}

export function createProAvatarMedia(
    displayName,
    photoUrl,
    {
        wrapClass = "dash-near-card__media",
        imgClass = "dash-near-card__img",
        fbClass = "dash-near-card__fb"
    } = {}
) {
    const imgWrap = document.createElement("div");
    imgWrap.className = wrapClass;
    const img = document.createElement("img");
    img.className = imgClass;
    img.alt = "";
    img.hidden = true;
    const fb = document.createElement("span");
    fb.className = fbClass;
    fb.textContent = initialsFromName(displayName);
    imgWrap.appendChild(img);
    imgWrap.appendChild(fb);
    mountProAvatar(img, fb, displayName, photoUrl);
    return imgWrap;
}

/**
 * Redimensionne et compresse une image avant envoi (data URL) — limite la taille côté API.
 */
export async function compressImageFile(
    file,
    { maxWidth = 1400, maxHeight = 1400, maxBytes = 1_800_000, quality = 0.82 } = {}
) {
    if (!file || !String(file.type || "").startsWith("image/")) {
        throw new Error("Fichier image invalide.");
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Impossible de lire la photo."));
        reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Image illisible."));
        el.src = dataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("Dimensions d'image invalides.");
    const ratio = Math.min(1, maxWidth / w, maxHeight / h);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Compression impossible sur cet appareil.");
    ctx.drawImage(img, 0, 0, w, h);
    let q = quality;
    let out = canvas.toDataURL("image/jpeg", q);
    const approxBytes = (s) => Math.ceil((String(s).length - "data:image/jpeg;base64,".length) * 0.75);
    while (approxBytes(out) > maxBytes && q > 0.45) {
        q -= 0.08;
        out = canvas.toDataURL("image/jpeg", q);
    }
    if (approxBytes(out) > maxBytes) {
        throw new Error("La photo reste trop volumineuse après compression (max ~2 Mo). Choisissez une image plus petite.");
    }
    return out;
}
