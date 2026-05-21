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
