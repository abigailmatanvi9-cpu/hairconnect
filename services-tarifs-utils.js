/** Parse / sérialise le champ texte servicesTarifs (une ligne par prestation). */

function parsePriceToken(raw) {
    const price = parseInt(String(raw || "").replace(/[\s.,]/g, ""), 10);
    return Number.isFinite(price) ? price : null;
}

export function parseServicesTarifs(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    return lines.map((line) => {
        const fromMatch = line.match(
            /^(.+?)\s*[:\-–—]\s*(?:à partir de|a partir de|dès)\s*([\d\s.,]+)(?:\s*(?:FCFA|francs?))?$/i
        );
        if (fromMatch) {
            return {
                name: fromMatch[1].trim(),
                price: parsePriceToken(fromMatch[2]),
                fromPrice: true
            };
        }
        const exactMatch = line.match(/^(.+?)\s*[:\-–—]\s*([\d\s.,]+)(?:\s*(?:FCFA|francs?))?$/i);
        if (exactMatch) {
            return {
                name: exactMatch[1].trim(),
                price: parsePriceToken(exactMatch[2]),
                fromPrice: false
            };
        }
        return { name: line, price: null, fromPrice: true };
    });
}

export function serializeServicesTarifs(rows) {
    const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
    return (rows || [])
        .filter((r) => String(r.name || "").trim())
        .map((r) => {
            const name = String(r.name).trim();
            const p = Number(r.price);
            if (!Number.isFinite(p) || p < 0) return name;
            const amount = `${fmt.format(p)} FCFA`;
            if (r.fromPrice !== false) {
                return `${name} : à partir de ${amount}`;
            }
            return `${name} : ${amount}`;
        })
        .join("\n");
}

export function formatServicePriceFcfa(price, fromPrice = true) {
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return "";
    const amount = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(p) + " FCFA";
    return fromPrice !== false ? `à partir de ${amount}` : amount;
}
