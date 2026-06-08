export function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function offerMillis(createdAt) {
    if (createdAt?.toMillis) return createdAt.toMillis();
    const t = new Date(createdAt || 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

export function getContractType(offer) {
    if (typeof offer?.contractType === "string" && offer.contractType.trim()) {
        return offer.contractType.trim().toLowerCase();
    }
    const text = `${offer?.title || ""} ${offer?.description || ""}`.toLowerCase();
    if (text.includes("temps plein") || text.includes("full-time") || text.includes("cdi")) return "full-time";
    if (text.includes("temps partiel") || text.includes("mi-temps") || text.includes("part-time")) return "part-time";
    if (text.includes("cdd")) return "cdd";
    return "all";
}

export function getContractLabel(type) {
    if (type === "full-time") return "Temps plein";
    if (type === "part-time") return "Temps partiel";
    if (type === "cdd") return "CDD";
    return "Offre";
}

export function formatOfferLocation(offer) {
    const city = String(offer?.city || "").trim();
    const quartier = String(offer?.quartier || "").trim();
    if (quartier && city) return `${quartier}, ${city}`;
    return quartier || city || "Lieu à préciser";
}

export function extractPercentFromNote(note) {
    const m = String(note || "").match(/(\d{1,3})\s*%/);
    return m ? m[1] : "";
}

export function formatOfferRemuneration(offer, { short = false } = {}) {
    const type = String(offer?.remunerationType || "").trim().toLowerCase();
    const note = String(offer?.remunerationNote || "").trim();
    if (type === "monthly") {
        const amount = Number(offer?.salaryFcfa);
        const base =
            Number.isFinite(amount) && amount > 0
                ? `${amount.toLocaleString("fr-FR")} FCFA / mois`
                : "Salaire mensuel";
        if (short) return base;
        return note ? `${base} — ${note}` : base;
    }
    if (type === "per_prestation") {
        const pct = extractPercentFromNote(note);
        if (short && pct) return `Paiement à la prestation (${pct}%)`;
        if (short) return note ? `Paiement à la prestation (${note})` : "Paiement à la prestation";
        return note ? `Paiement à la prestation — ${note}` : "Paiement à chaque prestation";
    }
    return "Rémunération à préciser";
}

export function formatOfferPublishedRelative(createdAt) {
    const ms = offerMillis(createdAt);
    if (!ms) return "Publication récente";
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86400000);
    if (days < 1) return "Publiée aujourd'hui";
    if (days === 1) return "Publiée il y a 1 jour";
    if (days < 30) return `Publiée il y a ${days} jours`;
    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? "Publiée il y a 1 mois" : `Publiée il y a ${months} mois`;
    return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatOfferPublishedLong(createdAt) {
    const ms = offerMillis(createdAt);
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function parseOfferDescription(text) {
    const raw = String(text || "").trim().replace(/\r\n/g, "\n");
    if (!raw) return { intro: "", benefits: [], requirements: [] };

    const benefits = [];
    const requirements = [];
    let intro = "";

    const blocks = raw.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    for (const block of blocks) {
        const lower = block.toLowerCase();
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const bullets = lines
            .filter((l) => /^[✓✔\-•*]\s*/.test(l))
            .map((l) => l.replace(/^[\s✓✔\-•*]+/, "").trim())
            .filter(Boolean);
        const prose = lines.filter((l) => !/^[✓✔\-•*]\s*/.test(l)).join("\n").trim();

        if (/profil recherch|nous recherch|compétences recherch/i.test(lower)) {
            if (bullets.length) requirements.push(...bullets);
            else if (prose) requirements.push(prose.replace(/^profil recherch[ée]?\s*:?\s*/i, "").trim());
        } else if (/ce que nous offrons|nous offrons|avantages/i.test(lower)) {
            if (bullets.length) benefits.push(...bullets);
            else if (prose) benefits.push(prose.replace(/^ce que nous offrons\s*:?\s*/i, "").trim());
        } else if (!intro) {
            intro = prose || block;
            if (bullets.length) benefits.push(...bullets);
        } else if (bullets.length) {
            benefits.push(...bullets);
        } else {
            intro = intro ? `${intro}\n\n${block}` : block;
        }
    }

    if (!intro && !benefits.length && !requirements.length) {
        const allBullets = raw
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => /^[✓✔\-•*]\s*/.test(l))
            .map((l) => l.replace(/^[\s✓✔\-•*]+/, "").trim());
        if (allBullets.length) {
            benefits.push(...allBullets);
            intro = raw
                .split("\n")
                .filter((l) => !/^[✓✔\-•*]\s*/.test(l.trim()))
                .join("\n")
                .trim();
        } else {
            intro = raw;
        }
    }

    return { intro, benefits, requirements };
}

export function renderBulletList(items) {
    if (!items?.length) return "";
    return (
        `<ul class="job-detail__checks">` +
        items.map((it) => `<li class="job-detail__check">✓ ${escapeHtml(it)}</li>`).join("") +
        `</ul>`
    );
}
