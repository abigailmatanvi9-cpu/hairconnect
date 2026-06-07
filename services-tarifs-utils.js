/** Parse / sérialise le champ texte servicesTarifs (une ligne par prestation). */

export function parseServicesTarifs(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    return lines.map((line) => {
        const m = line.match(/^(.+?)\s*[:\-–—]\s*([\d\s.,]+)(?:\s*(?:FCFA|francs?))?$/i);
        if (m) {
            const price = parseInt(String(m[2]).replace(/[\s.,]/g, ""), 10);
            return { name: m[1].trim(), price: Number.isFinite(price) ? price : null };
        }
        return { name: line, price: null };
    });
}

export function serializeServicesTarifs(rows) {
    const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
    return (rows || [])
        .filter((r) => String(r.name || "").trim())
        .map((r) => {
            const name = String(r.name).trim();
            const p = Number(r.price);
            if (Number.isFinite(p) && p >= 0) {
                return `${name} : ${fmt.format(p)} FCFA`;
            }
            return name;
        })
        .join("\n");
}

export function formatServicePriceFcfa(price) {
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return "";
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(p) + " FCFA";
}
