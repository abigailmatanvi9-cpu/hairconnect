import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseStoredPhone, validatePhoneNational } from "./phone-utils.js";
import { isCoiffeurRole, resolveUserRole } from "./role-utils.js";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const publicationsFile = path.join(process.cwd(), ".data", "publications.json");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const MARKETPLACE_FEE_RATE_BP = 1000; // 10%
const MARKETPLACE_MSG_PREFIX = "[Marketplace HairConnect]";
const MARKETPLACE_MSG_PREFIX_VENDEUR = "[Marketplace HairConnect · vendeur]";
const MARKETPLACE_MSG_PREFIX_ACHETEUR = "[Marketplace HairConnect · acheteur]";

/** Slugs autorisés — alignés sur `HAIRCONNECT_METIERS` côté client. */
const METIER_SLUGS = new Set([
  "barbier",
  "coiffeur",
  "coiffeuse",
  "tresseuse",
  "coloriste",
  "extensions",
  "soins",
  "autre"
]);

function normalizeMetierSlugsFromJson(raw) {
  if (raw == null) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    const s = String(x || "")
      .trim()
      .toLowerCase();
    if (METIER_SLUGS.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function parseMetierSlugsFromQuery(q) {
  if (!q) return [];
  return String(q)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => METIER_SLUGS.has(s));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  if (safeUser.photoUrl == null && safeUser.photourl != null) {
    safeUser.photoUrl = safeUser.photourl;
    delete safeUser.photourl;
  }
  return safeUser;
}

/** Colonnes publiques (hors mot de passe) — lecture SQL pour inclure champs même si le client Prisma n’a pas été régénéré. */
async function findUserPublicById(id) {
  const rows = await prisma.$queryRaw`
    SELECT id, email, name, role, city, quartier, phone, "photoUrl", bio, "servicesTarifs", "tarifMenuPhotoUrl", "salonName", gender, clientele,
      "proMetiers", "rechercheMetiers",
      "balanceFloozFcfa", "balanceMixFcfa", "createdAt", "updatedAt"
    FROM "User"
    WHERE id = ${id}
    LIMIT 1
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function findUsersPublic(roleInList) {
  const roles = Array.isArray(roleInList) ? roleInList.map((s) => String(s).trim()).filter(Boolean) : [];
  if (roles.length) {
    return prisma.$queryRaw`
      SELECT id, email, name, role, city, quartier, phone, "photoUrl", bio, "servicesTarifs", "tarifMenuPhotoUrl", "salonName", gender, clientele,
        "proMetiers", "rechercheMetiers",
        "balanceFloozFcfa", "balanceMixFcfa", "createdAt", "updatedAt"
      FROM "User"
      WHERE role IN (${Prisma.join(roles)})
    `;
  }
  return prisma.$queryRaw`
    SELECT id, email, name, role, city, quartier, phone, "photoUrl", bio, "servicesTarifs", "tarifMenuPhotoUrl", "salonName", gender, clientele,
      "proMetiers", "rechercheMetiers",
      "balanceFloozFcfa", "balanceMixFcfa", "createdAt", "updatedAt"
    FROM "User"
  `;
}

/** Entier FCFA ≥ 0 depuis le corps JSON (chaîne ou nombre). */
function parsePriceFcfaInput(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseInt(String(raw).replace(/\s/g, ""), 10);
  if (!Number.isFinite(n) || n < 0 || n > 50_000_000) return undefined;
  return n === 0 ? null : n;
}

function parsePositiveInt(raw, fallback = null) {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Rôle « coiffeur indépendant » (hors salon) — utilisé pour le filtre annuaire par genre. */
function isIndepCoiffeurRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "salon" || r === "client") return false;
  return (
    r === "coiffeur" ||
    r === "coiffeuse" ||
    r.includes("coiffeur") ||
    r.includes("coiffeuse")
  );
}

/** Salon ou coiffeur(se) indépendant(e) — seuls ces comptes peuvent vendre sur le marketplace. */
function isMarketplaceSellerRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "salon") return true;
  return isIndepCoiffeurRole(role);
}

const MARKETPLACE_PHOTO_URL_MAX_LEN = 3_500_000;

/**
 * Client : ne garde que les pros (salon + coiffeur indep.) dont `proMetiers` a au moins un slug
 * en commun avec la recherche. Si le pro n’a rien renseigné, il reste visible (rétrocompat).
 * Si `wanted` est vide, pas de filtre.
 */
function filterUsersByClientMetierSearch(users, wantedSlugs) {
  const want = new Set(wantedSlugs);
  if (want.size === 0) return users;
  return users.filter((u) => {
    const role = String(u.role || "")
      .trim()
      .toLowerCase();
    if (role === "client") return true;
    const isPro = role === "salon" || isIndepCoiffeurRole(u.role);
    if (!isPro) return true;
    const proM = normalizeMetierSlugsFromJson(u.proMetiers);
    if (proM.length === 0) return true;
    return proM.some((m) => want.has(m));
  });
}

function computeMarketplaceAmounts(unitPriceFcfa, qty, feeRateBp = MARKETPLACE_FEE_RATE_BP) {
  const subtotal = Math.max(0, Number(unitPriceFcfa) || 0) * Math.max(1, Number(qty) || 1);
  const fee = Math.floor((subtotal * feeRateBp) / 10_000);
  const sellerNet = subtotal - fee;
  return { subtotal, fee, sellerNet };
}

/** Si le schéma prévoit priceFcfa mais le client Prisma n’a pas été régénéré, les PATCH échouent. */
function warnIfPrismaClientStale() {
  try {
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
    const dtsPath = path.join(process.cwd(), "node_modules", ".prisma", "client", "index.d.ts");
    if (!readFileSync(schemaPath, "utf8").includes("priceFcfa")) return;
    if (readFileSync(dtsPath, "utf8").includes("priceFcfa")) return;
    console.warn(
      "\n[HairConnect] Le schéma Prisma contient « priceFcfa », mais le client généré est obsolète.\n" +
        "  Arrêtez npm run dev (Ctrl+C), exécutez : npx prisma generate\n" +
        "  puis relancez le serveur. Sinon l’enregistrement du prix sur un RDV provoque une erreur.\n"
    );
  } catch {
    /* ignore */
  }
}

/** Libellé public sous une photo « pro » : salon, nom affiché, puis identifiant e-mail. */
function publicationAuthorLabelFromUser(u) {
  const salon = String(u.salonName || "").trim();
  if (salon) return salon;
  const nm = String(u.name || "").trim();
  if (nm) return nm;
  const email = String(u.email || "").trim();
  if (email) {
    const at = email.indexOf("@");
    if (at > 0) return email.slice(0, at);
    return email;
  }
  return "Membre";
}

function formatRdvDateTimeFr(value) {
  try {
    return new Date(value).toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris"
    });
  } catch {
    return String(value);
  }
}

function normalizePaymentProvider(raw) {
  const provider = String(raw || "").trim().toLowerCase();
  if (provider === "mix_by_yas" || provider === "mix") return "mix_by_yas";
  if (provider === "flooz") return "flooz";
  return "";
}

function normalizePaymentStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (["pending", "success", "paid", "failed"].includes(s)) return s === "success" ? "paid" : s;
  return "";
}

function buildRdvReminderText(rdv) {
  if (!rdv?.pro) {
    throw new Error("Données professionnel manquantes.");
  }
  const proLabel = publicationAuthorLabelFromUser(rdv.pro);
  const when = formatRdvDateTimeFr(rdv.scheduledAt);
  const prest = String(rdv.prestation || "").trim().replace(/</g, "");
  const lieu = rdvLocationLabel(rdv.atHome);
  return `Rappel HairConnect : votre rendez-vous${
    prest ? ` « ${prest} »` : ""
  } avec ${proLabel} est prévu le ${when} (${lieu}). À très bientôt !`;
}

function rdvLocationLabel(atHome) {
  return atHome ? "à domicile (chez vous)" : "au salon / en cabine";
}

function buildRdvConfirmationText(rdv, pro) {
  const proLabel = publicationAuthorLabelFromUser(pro);
  const when = formatRdvDateTimeFr(rdv.scheduledAt);
  const prest = String(rdv.prestation || "").trim().replace(/</g, "") || "—";
  const lieu = rdvLocationLabel(rdv.atHome);
  let priceLine = "";
  if (rdv.prestationPriceFcfa != null && Number(rdv.prestationPriceFcfa) > 0) {
    priceLine = `\nPrix prestation : ${Number(rdv.prestationPriceFcfa)} FCFA`;
  }
  return `[HairConnect · rendez-vous] ${proLabel} a planifié un rendez-vous avec vous :\n\nPrestation : ${prest}\nDate : ${when}\nLieu : ${lieu}${priceLine}\n\nConsultez « Mes RDV » ou répondez ici pour confirmer les détails.`;
}

async function sendRdvConfirmationToClient(rdv, pro) {
  if (!rdv?.clientUid || !rdv?.proUid || !pro) return;
  try {
    await ensureContactAcceptedForMarketplaceOrder(rdv.clientUid, rdv.proUid);
    const text = buildRdvConfirmationText(rdv, pro);
    await prisma.message.create({
      data: {
        fromUid: rdv.proUid,
        toUid: rdv.clientUid,
        text
      }
    });
  } catch (e) {
    console.error("[rdv] confirmation client:", e);
  }
}

async function createRdvReminderForRecord(rdv) {
  const text = buildRdvReminderText(rdv);
  await prisma.$transaction([
    prisma.message.create({
      data: {
        fromUid: rdv.proUid,
        toUid: rdv.clientUid,
        text
      }
    }),
    prisma.rendezVous.update({
      where: { id: rdv.id },
      data: { reminder24hSentAt: new Date() }
    })
  ]);
}

/**
 * Message automatique au client lorsque le rendez-vous est dans ~24 h (fenêtre 23 h–25 h).
 * Évite les doublons via `reminder24hSentAt`. Nécessite que `npm run dev` tourne régulièrement.
 */
async function sendRdv24hReminders() {
  const t = Date.now();
  const winStart = new Date(t + 23 * 60 * 60 * 1000);
  const winEnd = new Date(t + 25 * 60 * 60 * 1000);
  const rows = await prisma.rendezVous.findMany({
    where: {
      status: "planned",
      reminder24hSentAt: null,
      scheduledAt: {
        gte: winStart,
        lte: winEnd
      }
    },
    include: {
      pro: { select: { id: true, name: true, salonName: true, email: true } }
    }
  });
  for (const rdv of rows) {
    try {
      await createRdvReminderForRecord(rdv);
      console.log(`[rdv-reminder] message envoyé (rdv ${rdv.id})`);
    } catch (e) {
      console.error(`[rdv-reminder] échec rdv ${rdv.id}`, e);
    }
  }
}

async function ensurePublicationsFile() {
  const dir = path.dirname(publicationsFile);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(publicationsFile);
  } catch {
    await fs.writeFile(publicationsFile, "[]", "utf8");
  }
}

async function readPublications() {
  await ensurePublicationsFile();
  const raw = await fs.readFile(publicationsFile, "utf8");
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    let changed = false;
    const normalized = rows.map((p) => {
      const next = { ...p };
      if (!next.id) {
        next.id = randomUUID();
        changed = true;
      }
      if (!next.createdAt) {
        next.createdAt = new Date().toISOString();
        changed = true;
      }
      return next;
    });
    if (changed) {
      await writePublications(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

async function writePublications(rows) {
  await ensurePublicationsFile();
  await fs.writeFile(publicationsFile, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * Garde uniquement les publications dont l'auteur ET le pro cible existent encore en base.
 * Permet de retirer les photos « S'inspirer » quand un compte a été supprimé (hors cascade JSON).
 */
async function filterPublicationRowsByExistingUsers(rows) {
  const ids = new Set();
  for (const p of rows) {
    if (p && p.authorUid != null && String(p.authorUid).trim()) ids.add(String(p.authorUid).trim());
    if (p && p.targetProUid != null && String(p.targetProUid).trim()) ids.add(String(p.targetProUid).trim());
  }
  const idArr = [...ids];
  if (!idArr.length) return rows;
  const existing = await prisma.user.findMany({
    where: { id: { in: idArr } },
    select: { id: true }
  });
  const ok = new Set(existing.map((u) => u.id));
  return rows.filter((p) => {
    const author = p && p.authorUid != null ? String(p.authorUid).trim() : "";
    const target = p && p.targetProUid != null ? String(p.targetProUid).trim() : "";
    if (author && !ok.has(author)) return false;
    if (target && !ok.has(target)) return false;
    return true;
  });
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ code: "auth/invalid-email", message: "Email et mot de passe requis." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ code: "auth/email-already-in-use", message: "Cet e-mail est déjà utilisé." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: "", role: "" }
    });

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ code: "auth/invalid-credential", message: "Identifiants invalides." });
    }
    let ok = false;
    const rawPassword = String(password || "");
    const storedHash = String(user.passwordHash || "");

    if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
      ok = await bcrypt.compare(rawPassword, storedHash);
    } else {
      // Compat mode: some manually inserted users may still have plain-text passwords.
      ok = rawPassword.length > 0 && rawPassword === storedHash;
      if (ok) {
        const nextHash = await bcrypt.hash(rawPassword, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: nextHash }
        });
      }
    }

    if (!ok) {
      return res.status(401).json({ code: "auth/invalid-credential", message: "Identifiants invalides." });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await findUserPublicById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

/** Photo de profil en binaire — évite les limites des data URL dans les balises <img>. */
function parseDataUrlImageBuffer(dataUrl) {
  const u = String(dataUrl || "").trim();
  const m = u.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!m) return null;
  try {
    const buf = Buffer.from(String(m[2]).replace(/\s/g, ""), "base64");
    if (!buf.length) return null;
    return { mime: m[1], buf };
  } catch {
    return null;
  }
}

app.get("/api/users/:id/avatar", async (req, res) => {
  try {
    const user = await findUserPublicById(req.params.id);
    const raw = String(user?.photoUrl || "").trim();
    if (!raw) return res.status(404).end();
    if (/^https?:\/\//i.test(raw)) {
      return res.redirect(302, raw);
    }
    const parsed = parseDataUrlImageBuffer(raw);
    if (!parsed) return res.status(404).end();
    res.setHeader("Content-Type", parsed.mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(parsed.buf);
  } catch {
    return res.status(500).end();
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = { ...req.body };
    delete data.latitude;
    delete data.longitude;
    delete data.passwordHash;
    delete data.balanceFloozFcfa;
    delete data.balanceMixFcfa;
    delete data.createdAt;
    delete data.updatedAt;
    /** Ne pas passer gender / clientele à prisma.user.update si le client généré est obsolète — mise à jour en SQL brut. */
    delete data.gender;
    delete data.clientele;
    delete data.proMetiers;
    delete data.rechercheMetiers;
    let genderDbUpdate = null;
    if (Object.prototype.hasOwnProperty.call(req.body, "gender")) {
      const raw = req.body.gender;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        genderDbUpdate = { value: null };
      } else {
        const g = String(raw)
          .trim()
          .toLowerCase();
        if (g === "homme" || g === "femme") genderDbUpdate = { value: g };
      }
    }
    let clienteleDbUpdate = null;
    if (Object.prototype.hasOwnProperty.call(req.body, "clientele")) {
      const raw = req.body.clientele;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        clienteleDbUpdate = { value: null };
      } else {
        const c = String(raw)
          .trim()
          .toLowerCase();
        if (c === "hommes" || c === "femmes" || c === "tous") clienteleDbUpdate = { value: c };
      }
    }

    let proMetiersJsonStr = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, "proMetiers")) {
      const arr = normalizeMetierSlugsFromJson(req.body.proMetiers);
      proMetiersJsonStr = JSON.stringify(arr);
    }
    let rechercheMetiersJsonStr = undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, "rechercheMetiers")) {
      const arr = normalizeMetierSlugsFromJson(req.body.rechercheMetiers);
      rechercheMetiersJsonStr = JSON.stringify(arr);
    }

    if (Object.prototype.hasOwnProperty.call(data, "quartier")) {
      const rawQ = data.quartier;
      if (rawQ === null || rawQ === undefined || String(rawQ).trim() === "") {
        data.quartier = null;
      } else {
        data.quartier = String(rawQ).trim().slice(0, 160);
      }
    }

    delete data.phoneCountry;
    delete data.phoneNational;
    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
      const rawPhone = req.body.phone;
      if (rawPhone === null || rawPhone === undefined || String(rawPhone).trim() === "") {
        data.phone = null;
      } else {
        let phoneCheck = parseStoredPhone(String(rawPhone).trim());
        if (!phoneCheck.ok && req.body.phoneCountry && req.body.phoneNational !== undefined) {
          phoneCheck = validatePhoneNational(req.body.phoneCountry, req.body.phoneNational);
        }
        if (!phoneCheck.ok) {
          return res.status(400).json({
            message: phoneCheck.message || "Numéro de téléphone invalide pour le pays choisi."
          });
        }
        data.phone = phoneCheck.e164;
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, "tarifMenuPhotoUrl")) {
      const raw = data.tarifMenuPhotoUrl;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        data.tarifMenuPhotoUrl = null;
      } else {
        const v = String(raw).trim();
        if (v.length > MARKETPLACE_PHOTO_URL_MAX_LEN) {
          return res.status(400).json({
            message: "Photo du menu tarifs trop volumineuse (réduisez la taille ou compressez l’image)."
          });
        }
        if (!/^https?:\/\//i.test(v) && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v)) {
          return res.status(400).json({
            message:
              "Menu tarifs : image PNG, JPEG, WebP ou GIF (import depuis l’appareil), ou URL https."
          });
        }
        data.tarifMenuPhotoUrl = v;
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, "photoUrl")) {
      const raw = data.photoUrl;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        data.photoUrl = null;
      } else {
        const v = String(raw).trim();
        if (v.length > MARKETPLACE_PHOTO_URL_MAX_LEN) {
          return res.status(400).json({
            message: "Photo de profil trop volumineuse (réduisez la taille ou compressez l’image)."
          });
        }
        if (!/^https?:\/\//i.test(v) && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v)) {
          return res.status(400).json({
            message:
              "Photo de profil : image PNG, JPEG, WebP ou GIF (import depuis l’appareil), ou URL https."
          });
        }
        data.photoUrl = v;
      }
    }

    await prisma.user.update({
      where: { id },
      data
    });

    if (genderDbUpdate) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "User" SET gender = ${genderDbUpdate.value}, "updatedAt" = NOW() WHERE id = ${id}`
      );
    }
    if (clienteleDbUpdate) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "User" SET clientele = ${clienteleDbUpdate.value}, "updatedAt" = NOW() WHERE id = ${id}`
      );
    }
    if (proMetiersJsonStr !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "proMetiers" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
        proMetiersJsonStr,
        id
      );
    }
    if (rechercheMetiersJsonStr !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "rechercheMetiers" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
        rechercheMetiersJsonStr,
        id
      );
    }

    const fresh = await findUserPublicById(id);
    return res.json({ user: sanitizeUser(fresh) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const roleIn = req.query.roleIn ? String(req.query.roleIn).split(",") : undefined;
    const metierParam = String(req.query.forClientMetiers || "").trim();
    const wanted = parseMetierSlugsFromQuery(metierParam);
    let users = await findUsersPublic(roleIn);
    if (wanted.length > 0) {
      users = filterUsersByClientMetierSearch(users, wanted);
    }
    return res.json({ users: users.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/users/by-email", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Paramètre email requis." });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "Aucun compte avec cet e-mail." });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

function isClientRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase() === "client";
}

function isProMessagingRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  return (
    r === "salon" ||
    r === "coiffeur" ||
    r === "coiffeuse" ||
    r === "coiffeur indépendant" ||
    r === "coiffeuse indépendante"
  );
}

/** Paire client + pro : la messagerie nécessite une demande acceptée. */
function messagingPairNeedsContactGate(roleA, roleB) {
  return (
    (isClientRole(roleA) && isProMessagingRole(roleB)) || (isProMessagingRole(roleA) && isClientRole(roleB))
  );
}

function contactClientProPair(fromUid, toUid, roleById) {
  const rFrom = roleById.get(fromUid);
  const rTo = roleById.get(toUid);
  if (messagingPairNeedsContactGate(rFrom, rTo)) {
    if (isClientRole(rFrom) && isProMessagingRole(rTo)) return { clientUid: fromUid, proUid: toUid };
    if (isProMessagingRole(rFrom) && isClientRole(rTo)) return { clientUid: toUid, proUid: fromUid };
  }
  return null;
}

async function buildRoleMapForIds(ids) {
  const uniq = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: uniq } },
    select: { id: true, role: true }
  });
  return new Map(users.map((u) => [u.id, u.role]));
}

async function filterMessagesByContactGate(viewerUid, messages) {
  if (!messages.length) return messages;
  const ids = new Set([viewerUid]);
  for (const m of messages) {
    ids.add(m.fromUid);
    ids.add(m.toUid);
  }
  const roleMap = await buildRoleMapForIds([...ids]);
  const accepted = await prisma.contactRequest.findMany({
    where: { status: "accepted", OR: [{ clientUid: viewerUid }, { proUid: viewerUid }] },
    select: { clientUid: true, proUid: true }
  });
  const okPairs = new Set(accepted.map((r) => `${r.clientUid}\t${r.proUid}`));
  const marketPairs = await buildActiveMarketplacePairSetFromMessages(messages, roleMap);
  return messages.filter((m) => {
    if (!marketplaceNoticeVisibleToViewer(m, viewerUid)) return false;
    if (isMarketplaceSystemMessage(m.text)) return true;
    const pair = contactClientProPair(m.fromUid, m.toUid, roleMap);
    if (!pair) return true;
    const key = `${pair.clientUid}\t${pair.proUid}`;
    if (okPairs.has(key)) return true;
    return marketPairs.has(key);
  });
}

async function pairHasActiveMarketplaceOrder(clientUid, proUid) {
  const row = await prisma.marketOrder.findFirst({
    where: {
      buyerUid: clientUid,
      sellerUid: proUid,
      status: { not: "cancelled" }
    },
    select: { id: true }
  });
  return Boolean(row);
}

/** Paires client↔pro ayant au moins une commande marketplace active (hors annulée). */
async function buildActiveMarketplacePairSetFromMessages(messages, roleMap) {
  const keys = new Set();
  for (const m of messages) {
    const pair = contactClientProPair(m.fromUid, m.toUid, roleMap);
    if (pair) keys.add(`${pair.clientUid}\t${pair.proUid}`);
  }
  if (!keys.size) return new Set();
  const or = [...keys].map((k) => {
    const [clientUid, proUid] = k.split("\t");
    return { buyerUid: clientUid, sellerUid: proUid };
  });
  const orders = await prisma.marketOrder.findMany({
    where: { status: { not: "cancelled" }, OR: or },
    select: { buyerUid: true, sellerUid: true }
  });
  return new Set(orders.map((o) => `${o.buyerUid}\t${o.sellerUid}`));
}

function isMarketplaceSystemMessage(text) {
  const t = String(text || "").trimStart();
  return (
    t.startsWith(MARKETPLACE_MSG_PREFIX_VENDEUR) ||
    t.startsWith(MARKETPLACE_MSG_PREFIX_ACHETEUR) ||
    t.startsWith(MARKETPLACE_MSG_PREFIX)
  );
}

/** Notification automatique : visible uniquement par le destinataire (toUid). */
function marketplaceNoticeVisibleToViewer(message, viewerUid) {
  const t = String(message?.text || "").trimStart();
  if (t.startsWith(MARKETPLACE_MSG_PREFIX_VENDEUR) || t.startsWith(MARKETPLACE_MSG_PREFIX_ACHETEUR)) {
    return String(message.toUid) === String(viewerUid);
  }
  if (t.startsWith(MARKETPLACE_MSG_PREFIX)) {
    return String(message.toUid) === String(viewerUid);
  }
  return true;
}

/** Ouvre la messagerie client↔pro après une commande (sinon le message est masqué par le filtre contact). */
async function ensureContactAcceptedForMarketplaceOrder(buyerUid, sellerUid) {
  const roleMap = await buildRoleMapForIds([buyerUid, sellerUid]);
  const pair = contactClientProPair(buyerUid, sellerUid, roleMap);
  if (!pair) return;
  const { clientUid, proUid } = pair;
  try {
    const existing = await prisma.contactRequest.findUnique({
      where: { clientUid_proUid: { clientUid, proUid } }
    });
    if (existing?.status === "accepted") return;
    if (existing) {
      await prisma.contactRequest.update({
        where: { id: existing.id },
        data: { status: "accepted" }
      });
      return;
    }
    await prisma.contactRequest.create({
      data: {
        clientUid,
        proUid,
        status: "accepted",
        message: "Ouverture automatique suite à une commande marketplace."
      }
    });
  } catch (e) {
    console.warn("[marketplace] contact auto-accept:", e?.message || e);
  }
}

async function sendMarketplaceOrderNotifications(order, buyerUid, buyerName, sellerName) {
  if (!order?.sellerUid || !buyerUid) return;
  const sellerUid = String(order.sellerUid);
  await ensureContactAcceptedForMarketplaceOrder(buyerUid, sellerUid);
  const sellerText = marketplaceOrderSellerNoticeText(order, buyerName);
  const buyerText = marketplaceOrderBuyerNoticeText(order, sellerName);
  await prisma.message.create({
    data: { fromUid: buyerUid, toUid: sellerUid, text: sellerText }
  });
  await prisma.message.create({
    data: { fromUid: sellerUid, toUid: buyerUid, text: buyerText }
  });
}

async function assertMessageContactAllowed(fromUid, toUid) {
  const roleMap = await buildRoleMapForIds([fromUid, toUid]);
  const pair = contactClientProPair(fromUid, toUid, roleMap);
  if (!pair) return;
  const row = await prisma.contactRequest.findUnique({
    where: { clientUid_proUid: { clientUid: pair.clientUid, proUid: pair.proUid } }
  });
  if (row?.status === "accepted") return;
  if (await pairHasActiveMarketplaceOrder(pair.clientUid, pair.proUid)) return;
  const err = new Error(
    "Messagerie indisponible : envoyez une demande de contact depuis la fiche du professionnel, ou passez une commande sur sa boutique marketplace."
  );
  err.code = "contact/not-accepted";
  err.status = 403;
  throw err;
}

async function computeRdvSelectionSummaryMap(rendezVousIds) {
  const ids = [...new Set((rendezVousIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const rows = await prisma.rdvMarketplaceSelection.findMany({
    where: { rendezVousId: { in: ids } },
    select: { rendezVousId: true, itemsCount: true, itemsSubtotalFcfa: true, updatedAt: true }
  });
  for (const row of rows) {
    out.set(String(row.rendezVousId), {
      itemsCount: Number(row.itemsCount || 0),
      itemsSubtotalFcfa: Number(row.itemsSubtotalFcfa || 0),
      updatedAt: row.updatedAt
    });
  }
  return out;
}

function withRdvSelectionSummary(rows, summaryMap) {
  return (rows || []).map((r) => {
    const s = summaryMap.get(String(r.id));
    return {
      ...r,
      itemSelectionSummary: s || { itemsCount: 0, itemsSubtotalFcfa: 0, updatedAt: null }
    };
  });
}

function parseProductColorsField(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c || "").trim()).filter(Boolean).slice(0, 24);
  }
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((c) => String(c || "").trim()).filter(Boolean).slice(0, 24);
    }
  } catch {
    /* texte libre */
  }
  return s
    .split(/[,;|]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function serializeProductColorsField(raw) {
  const arr = parseProductColorsField(raw);
  return arr.length ? JSON.stringify(arr) : null;
}

function resolveLineColorChoice(rawColor, allowedColors) {
  const allowed = parseProductColorsField(allowedColors);
  if (!allowed.length) return null;
  const c = String(rawColor || "").trim();
  if (!c) return null;
  const hit = allowed.find((a) => a.toLowerCase() === c.toLowerCase());
  return hit || null;
}

function cartLineKey(productId, color) {
  return `${String(productId || "").trim()}\0${String(color || "").trim()}`;
}

function normalizeRdvSelectionLines(raw) {
  if (!Array.isArray(raw)) return [];
  const map = new Map();
  for (const row of raw) {
    const productId = String(row?.productId || "").trim();
    const color = row?.color != null ? String(row.color).trim() : "";
    const q = parsePositiveInt(row?.quantity, 1) || 0;
    if (!productId || q <= 0) continue;
    const key = cartLineKey(productId, color);
    map.set(key, {
      productId,
      quantity: (map.get(key)?.quantity || 0) + q,
      color: color || null
    });
  }
  return [...map.values()];
}

/** Seul un RDV « À venir » (planned) accepte achat / modification d’articles marketplace côté client. */
function rdvAllowsClientItemSelection(status) {
  return String(status || "planned").toLowerCase() === "planned";
}

/** RDV clôturé côté pro : plus de modification (terminé, annulé, absent). */
function rdvIsClosedForProEdit(status) {
  const s = String(status || "planned").toLowerCase();
  return s === "completed" || s === "cancelled" || s === "noshow";
}

/** Renouvellement : uniquement pour un RDV annulé. */
function rdvAllowsRenew(status) {
  return String(status || "planned").toLowerCase() === "cancelled";
}

function rdvItemSelectionBlockedMessage(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") {
    return "Cette prestation est terminée : vous ne pouvez plus acheter d’articles pour ce rendez-vous.";
  }
  if (s === "cancelled") {
    return "Ce rendez-vous est annulé : achat d’articles impossible.";
  }
  if (s === "noshow") {
    return "Ce rendez-vous est marqué « absent » : achat d’articles impossible.";
  }
  return "Ce rendez-vous n’accepte plus d’achat d’articles.";
}

function computeRdvTotalPriceFcfa(prestationPriceFcfa, itemsSubtotalFcfa) {
  const items = Number(itemsSubtotalFcfa || 0);
  if (prestationPriceFcfa == null || prestationPriceFcfa === "") {
    return items > 0 ? items : null;
  }
  const prest = Number(prestationPriceFcfa);
  if (!Number.isFinite(prest) || prest < 0) return items > 0 ? items : null;
  return prest + items;
}

async function getRdvItemsSubtotalFcfa(rendezVousId) {
  const row = await prisma.rdvMarketplaceSelection.findUnique({
    where: { rendezVousId: String(rendezVousId) },
    select: { itemsSubtotalFcfa: true }
  });
  return row ? Number(row.itemsSubtotalFcfa || 0) : 0;
}

function parsePrestationPriceFcfaInput(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = parsePriceFcfaInput(raw);
  return parsed === undefined ? undefined : parsed;
}

app.get("/api/rendez-vous", async (req, res) => {
  try {
    const proUid = String(req.query.proUid || "").trim();
    if (!proUid) {
      return res.status(400).json({ message: "proUid requis." });
    }
    const rows = await prisma.rendezVous.findMany({
      where: { proUid },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            photoUrl: true,
            role: true
          }
        }
      },
      orderBy: { scheduledAt: "asc" }
    });
    const summaryMap = await computeRdvSelectionSummaryMap(rows.map((r) => r.id));
    return res.json({ rendezVous: withRdvSelectionSummary(rows, summaryMap) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/rendez-vous/client", async (req, res) => {
  try {
    const clientUid = String(req.query.clientUid || "").trim();
    if (!clientUid) {
      return res.status(400).json({ message: "clientUid requis." });
    }
    const rows = await prisma.rendezVous.findMany({
      where: { clientUid },
      include: {
        pro: {
          select: {
            id: true,
            name: true,
            salonName: true,
            email: true,
            city: true
          }
        }
      },
      orderBy: { scheduledAt: "desc" }
    });
    const summaryMap = await computeRdvSelectionSummaryMap(rows.map((r) => r.id));
    return res.json({ rendezVous: withRdvSelectionSummary(rows, summaryMap) });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/rendez-vous", async (req, res) => {
  try {
    const proUid = String(req.body.proUid || "").trim();
    const clientUid = String(req.body.clientUid || "").trim();
    const prestation = String(req.body.prestation || "").trim();
    const scheduledRaw = req.body.scheduledAt;
    if (!proUid || !clientUid || !prestation) {
      return res.status(400).json({ message: "proUid, clientUid et prestation requis." });
    }
    if (proUid === clientUid) {
      return res.status(400).json({ message: "Le client doit être une autre personne." });
    }
    const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ message: "Date et heure invalides." });
    }
    const client = await prisma.user.findUnique({ where: { id: clientUid } });
    if (!client || !isClientRole(client.role)) {
      return res.status(400).json({ message: "Le compte client est introuvable ou n’est pas un client." });
    }
    const pro = await prisma.user.findUnique({ where: { id: proUid } });
    if (!pro) {
      return res.status(400).json({ message: "Professionnel introuvable." });
    }
    let prestationPriceFcfa = null;
    if (req.body.prestationPriceFcfa !== undefined && req.body.prestationPriceFcfa !== null && req.body.prestationPriceFcfa !== "") {
      const parsed = parsePrestationPriceFcfaInput(req.body.prestationPriceFcfa);
      if (parsed !== undefined) prestationPriceFcfa = parsed;
    } else if (req.body.priceFcfa !== undefined && req.body.priceFcfa !== null && req.body.priceFcfa !== "") {
      const parsed = parsePriceFcfaInput(req.body.priceFcfa);
      if (parsed !== undefined) prestationPriceFcfa = parsed;
    }
    const priceFcfa = computeRdvTotalPriceFcfa(prestationPriceFcfa, 0);
    const atHome = Boolean(req.body?.atHome);
    const row = await prisma.rendezVous.create({
      data: {
        proUid,
        clientUid,
        scheduledAt,
        prestation,
        atHome,
        status: "planned",
        prestationPriceFcfa,
        priceFcfa
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            photoUrl: true,
            role: true
          }
        }
      }
    });
    try {
      await sendRdvConfirmationToClient(row, pro);
    } catch (notifyErr) {
      console.error("[rdv] notification création:", notifyErr);
    }
    return res.status(201).json({ rendezVous: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/rendez-vous/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const proUid = String(req.body.proUid || "").trim();
    if (!id || !proUid) {
      return res.status(400).json({ message: "id et proUid requis." });
    }
    const existing = await prisma.rendezVous.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }
    if (String(existing.proUid) !== proUid) {
      return res.status(403).json({ message: "Modification non autorisée." });
    }
    if (rdvIsClosedForProEdit(existing.status)) {
      return res.status(400).json({
        message:
          "Ce rendez-vous est terminé, annulé ou marqué « absent » : modification impossible. Pour un RDV annulé, utilisez « Renouveler »."
      });
    }
    const data = {};
    if (req.body.prestation !== undefined) {
      const p = String(req.body.prestation || "").trim();
      if (p) data.prestation = p;
    }
    if (req.body.atHome !== undefined) {
      data.atHome = Boolean(req.body.atHome);
    }
    if (req.body.scheduledAt !== undefined) {
      const d = new Date(req.body.scheduledAt);
      if (!Number.isNaN(d.getTime())) {
        data.scheduledAt = d;
        const prev = new Date(existing.scheduledAt);
        if (prev.getTime() !== d.getTime()) {
          data.reminder24hSentAt = null;
        }
      }
    }
    if (req.body.status !== undefined) {
      const s = String(req.body.status || "").trim().toLowerCase();
      if (["planned", "completed", "cancelled", "noshow"].includes(s)) data.status = s;
    }
    if (req.body.proComment !== undefined) {
      data.proComment = String(req.body.proComment || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "proRating")) {
      if (req.body.proRating === null || req.body.proRating === "") {
        data.proRating = null;
      } else {
        const n = Number(req.body.proRating);
        if (Number.isInteger(n) && n >= 1 && n <= 5) data.proRating = n;
      }
    }
    if (req.body.prestationPriceFcfa !== undefined) {
      let nextPrestation = existing.prestationPriceFcfa == null ? null : Number(existing.prestationPriceFcfa);
      if (req.body.prestationPriceFcfa === null || req.body.prestationPriceFcfa === "") {
        nextPrestation = null;
      } else {
        const parsed = parsePrestationPriceFcfaInput(req.body.prestationPriceFcfa);
        if (parsed !== undefined) nextPrestation = parsed;
      }
      const currentPrestation =
        existing.prestationPriceFcfa == null ? null : Number(existing.prestationPriceFcfa);
      if (currentPrestation !== nextPrestation) {
        data.prestationPriceFcfa = nextPrestation;
      }
    }
    if (data.prestationPriceFcfa !== undefined || req.body.priceFcfa !== undefined) {
      const itemsSubtotal = await getRdvItemsSubtotalFcfa(id);
      let nextPrice;
      if (data.prestationPriceFcfa !== undefined) {
        nextPrice = computeRdvTotalPriceFcfa(data.prestationPriceFcfa, itemsSubtotal);
      } else {
        nextPrice = existing.priceFcfa == null ? null : Number(existing.priceFcfa);
        if (req.body.priceFcfa === null || req.body.priceFcfa === "") {
          nextPrice = null;
        } else {
          const parsed = parsePriceFcfaInput(req.body.priceFcfa);
          if (parsed !== undefined) nextPrice = parsed;
        }
      }
      const currentPrice = existing.priceFcfa == null ? null : Number(existing.priceFcfa);
      if (currentPrice !== nextPrice) {
        if (["paid", "pending"].includes(String(existing.paymentStatus || "unpaid"))) {
          return res.status(400).json({
            message: "Impossible de modifier le prix d’un rendez-vous deja en cours de paiement ou deja paye."
          });
        }
        data.priceFcfa = nextPrice;
      }
    }
    const row = await prisma.rendezVous.update({
      where: { id },
      data,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            photoUrl: true,
            role: true
          }
        }
      }
    });
    return res.json({ rendezVous: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

/** Crée un nouveau RDV « À venir » à partir d’un RDV annulé (même client / prestation / prix prestation). */
app.post("/api/rendez-vous/:id/renew", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const proUid = String(req.body.proUid || "").trim();
    const scheduledRaw = req.body.scheduledAt;
    if (!id || !proUid) {
      return res.status(400).json({ message: "id et proUid requis." });
    }
    const existing = await prisma.rendezVous.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }
    if (String(existing.proUid) !== proUid) {
      return res.status(403).json({ message: "Renouvellement non autorisé." });
    }
    if (!rdvAllowsRenew(existing.status)) {
      return res.status(400).json({
        message: "Le renouvellement n’est possible que pour un rendez-vous annulé."
      });
    }
    const pro = await prisma.user.findUnique({ where: { id: proUid } });
    if (!pro) {
      return res.status(404).json({ message: "Professionnel introuvable." });
    }
    const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ message: "Date et heure du nouveau rendez-vous invalides." });
    }
    const row = await prisma.rendezVous.create({
      data: {
        proUid: existing.proUid,
        clientUid: existing.clientUid,
        scheduledAt,
        prestation: existing.prestation,
        atHome: Boolean(existing.atHome),
        status: "planned",
        prestationPriceFcfa: existing.prestationPriceFcfa,
        priceFcfa: computeRdvTotalPriceFcfa(existing.prestationPriceFcfa, 0)
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            photoUrl: true,
            role: true
          }
        }
      }
    });
    try {
      await sendRdvConfirmationToClient(row, pro);
    } catch (notifyErr) {
      console.error("[rdv] notification renouvellement:", notifyErr);
    }
    return res.status(201).json({ rendezVous: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/rendez-vous/:id/item-selection", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const uid = String(req.query.uid || "").trim();
    if (!id || !uid) {
      return res.status(400).json({ message: "id et uid requis." });
    }
    const rdv = await prisma.rendezVous.findUnique({
      where: { id },
      select: { id: true, clientUid: true, proUid: true, status: true, priceFcfa: true }
    });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }
    if (uid !== String(rdv.clientUid) && uid !== String(rdv.proUid)) {
      return res.status(403).json({ message: "Accès non autorisé à cette sélection." });
    }
    const selection = await prisma.rdvMarketplaceSelection.findUnique({
      where: { rendezVousId: id },
      include: {
        lines: { orderBy: [{ productTitle: "asc" }, { createdAt: "asc" }] }
      }
    });
    return res.json({
      rendezVous: rdv,
      selection: selection
        ? {
            id: selection.id,
            rendezVousId: selection.rendezVousId,
            clientUid: selection.clientUid,
            proUid: selection.proUid,
            itemsCount: Number(selection.itemsCount || 0),
            itemsSubtotalFcfa: Number(selection.itemsSubtotalFcfa || 0),
            updatedAt: selection.updatedAt,
            lines: selection.lines || []
          }
        : {
            id: null,
            rendezVousId: rdv.id,
            clientUid: rdv.clientUid,
            proUid: rdv.proUid,
            itemsCount: 0,
            itemsSubtotalFcfa: 0,
            updatedAt: null,
            lines: []
          }
    });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.put("/api/rendez-vous/:id/item-selection", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const clientUid = String(req.body?.clientUid || "").trim();
    if (!id || !clientUid) {
      return res.status(400).json({ message: "id et clientUid requis." });
    }
    const rdv = await prisma.rendezVous.findUnique({
      where: { id },
      select: { id: true, clientUid: true, proUid: true, status: true }
    });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }
    if (String(rdv.clientUid) !== clientUid) {
      return res.status(403).json({ message: "Seule la cliente du rendez-vous peut modifier cette sélection." });
    }
    if (!rdvAllowsClientItemSelection(rdv.status)) {
      return res.status(400).json({
        message: rdvItemSelectionBlockedMessage(rdv.status),
        code: "rdv/selection-closed",
        status: String(rdv.status || "")
      });
    }
    const normalized = normalizeRdvSelectionLines(req.body?.lines);
    if (normalized.length > 80) {
      return res.status(400).json({ message: "Trop d’articles sélectionnés (80 max)." });
    }

    const productIds = [...new Set(normalized.map((x) => x.productId))];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } }
        })
      : [];
    const byId = new Map(products.map((p) => [String(p.id), p]));

    const nextLines = [];
    for (const line of normalized) {
      const p = byId.get(String(line.productId));
      if (!p) {
        return res.status(400).json({ message: `Article introuvable : ${line.productId}.` });
      }
      if (String(p.sellerUid) !== String(rdv.proUid)) {
        return res.status(400).json({ message: "Les articles doivent appartenir au professionnel du rendez-vous." });
      }
      if (String(p.status || "").toLowerCase() !== "active") {
        return res.status(400).json({ message: `Article indisponible : ${p.title || p.id}.` });
      }
      const qty = Number(line.quantity || 0);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ message: "Quantité invalide." });
      }
      const allowedColors = parseProductColorsField(p.colors);
      const color = resolveLineColorChoice(line.color, allowedColors);
      if (allowedColors.length && !color) {
        return res.status(400).json({
          message: `Choisissez une couleur pour « ${p.title || "cet article"} ».`
        });
      }
      const unit = Number(p.priceFcfa || 0);
      nextLines.push({
        productId: String(p.id),
        productTitle: String(p.title || "Article"),
        unitPriceFcfa: unit,
        quantity: qty,
        color,
        lineTotalFcfa: unit * qty
      });
    }

    const existingRdvOrder = await prisma.marketOrder.findUnique({
      where: { rendezVousId: id },
      include: { items: true }
    });
    const reservedByProduct = new Map();
    if (existingRdvOrder && String(existingRdvOrder.status || "").toLowerCase() !== "cancelled") {
      for (const it of existingRdvOrder.items || []) {
        const pid = String(it.productId || "");
        reservedByProduct.set(pid, (reservedByProduct.get(pid) || 0) + Number(it.quantity || 0));
      }
    }
    for (const line of nextLines) {
      const p = byId.get(String(line.productId));
      const reserved = reservedByProduct.get(String(line.productId)) || 0;
      const available = Number(p?.stock || 0) + reserved;
      if (available < Number(line.quantity || 0)) {
        return res.status(400).json({
          message: `Stock insuffisant pour « ${p?.title || line.productId} » (disponible : ${available}).`
        });
      }
    }

    const itemsCount = nextLines.reduce((acc, row) => acc + Number(row.quantity || 0), 0);
    const itemsSubtotalFcfa = nextLines.reduce((acc, row) => acc + Number(row.lineTotalFcfa || 0), 0);

    const buyer = await prisma.user.findUnique({ where: { id: clientUid } });
    const proSeller = await prisma.user.findUnique({ where: { id: String(rdv.proUid) } });
    const buyerName = buyer ? publicationAuthorLabelFromUser(buyer) : "Client";
    const sellerProduct = products.find((p) => String(p.sellerUid) === String(rdv.proUid));
    const sellerName =
      (sellerProduct ? String(sellerProduct.sellerName || "").trim() : "") ||
      (proSeller ? publicationAuthorLabelFromUser(proSeller) : "Vendeur");

    let rdvMarketOrder = null;
    const selection = await prisma.$transaction(async (tx) => {
      let base = await tx.rdvMarketplaceSelection.findUnique({
        where: { rendezVousId: id },
        select: { id: true }
      });
      if (!base) {
        base = await tx.rdvMarketplaceSelection.create({
          data: {
            rendezVousId: id,
            clientUid,
            proUid: String(rdv.proUid),
            itemsCount,
            itemsSubtotalFcfa
          },
          select: { id: true }
        });
      } else {
        await tx.rdvMarketplaceSelection.update({
          where: { id: base.id },
          data: {
            clientUid,
            proUid: String(rdv.proUid),
            itemsCount,
            itemsSubtotalFcfa
          }
        });
      }
      await tx.rdvMarketplaceSelectionLine.deleteMany({ where: { selectionId: base.id } });
      if (nextLines.length) {
        await tx.rdvMarketplaceSelectionLine.createMany({
          data: nextLines.map((row) => ({ selectionId: base.id, ...row }))
        });
      }
      const sel = await tx.rdvMarketplaceSelection.findUnique({
        where: { id: base.id },
        include: { lines: { orderBy: [{ productTitle: "asc" }, { createdAt: "asc" }] } }
      });
      rdvMarketOrder = await syncRdvLinkedMarketOrder(tx, {
        rendezVousId: id,
        buyerUid: clientUid,
        sellerUid: String(rdv.proUid),
        sellerName,
        buyerName,
        nextLines
      });
      return sel;
    });

    const prevOrderSubtotal =
      existingRdvOrder && String(existingRdvOrder.status || "").toLowerCase() !== "cancelled"
        ? Number(existingRdvOrder.subtotalFcfa || 0)
        : null;
    const newOrderSubtotal = rdvMarketOrder ? Number(rdvMarketOrder.subtotalFcfa || 0) : null;
    const shouldNotifySeller =
      rdvMarketOrder &&
      rdvMarketOrder.sellerUid &&
      (prevOrderSubtotal === null || prevOrderSubtotal !== newOrderSubtotal);
    if (shouldNotifySeller) {
      try {
        await sendMarketplaceOrderNotifications(rdvMarketOrder, clientUid, buyerName, sellerName);
      } catch (notifyErr) {
        console.error("[marketplace-rdv] message vendeur:", notifyErr);
      }
    }

    const rdvPricing = await prisma.rendezVous.findUnique({
      where: { id },
      select: { prestationPriceFcfa: true, paymentStatus: true, priceFcfa: true }
    });
    if (
      rdvPricing &&
      rdvPricing.prestationPriceFcfa != null &&
      !["paid", "pending"].includes(String(rdvPricing.paymentStatus || "unpaid"))
    ) {
      const nextTotal = computeRdvTotalPriceFcfa(rdvPricing.prestationPriceFcfa, itemsSubtotalFcfa);
      const currentPrice = rdvPricing.priceFcfa == null ? null : Number(rdvPricing.priceFcfa);
      if (currentPrice !== nextTotal) {
        await prisma.rendezVous.update({
          where: { id },
          data: { priceFcfa: nextTotal }
        });
      }
    } else if (
      rdvPricing &&
      rdvPricing.prestationPriceFcfa == null &&
      itemsSubtotalFcfa > 0 &&
      !["paid", "pending"].includes(String(rdvPricing.paymentStatus || "unpaid"))
    ) {
      const currentPrice = rdvPricing.priceFcfa == null ? null : Number(rdvPricing.priceFcfa);
      if (currentPrice !== itemsSubtotalFcfa) {
        await prisma.rendezVous.update({
          where: { id },
          data: { priceFcfa: itemsSubtotalFcfa }
        });
      }
    }

    return res.json({ selection, order: rdvMarketOrder });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("Stock insuffisant")) {
      return res.status(400).json({ message: "Stock insuffisant pour un ou plusieurs articles." });
    }
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/rendez-vous/:id/send-reminder", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const proUid = String(req.body.proUid || "").trim();
    if (!id || !proUid) {
      return res.status(400).json({ message: "id et proUid requis." });
    }
    const rdv = await prisma.rendezVous.findUnique({
      where: { id },
      include: {
        pro: { select: { id: true, name: true, salonName: true, email: true } }
      }
    });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }
    if (String(rdv.proUid) !== proUid) {
      return res.status(403).json({ message: "Envoi non autorisé." });
    }
    if (String(rdv.status || "").toLowerCase() !== "planned") {
      return res.status(400).json({
        message: "Le rappel n’est possible que pour un rendez-vous « À venir »."
      });
    }
    await createRdvReminderForRecord(rdv);
    return res.status(201).json({ ok: true, message: "Rappel envoyé au client dans la messagerie." });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/rendez-vous/:id/pay", async (req, res) => {
  return res.status(410).json({
    code: "payment/disabled",
    message: "Le paiement mobile en ligne est actuellement désactivé."
  });
});

app.post("/api/payments/webhook", async (req, res) => {
  try {
    const attemptId = String(req.body.attemptId || "").trim();
    const operatorTxnId = String(req.body.operatorTxnId || "").trim() || null;
    const status = normalizePaymentStatus(req.body.status);
    const provider = normalizePaymentProvider(req.body.provider);
    const failureReason = String(req.body.failureReason || "").trim();
    if (!attemptId || !status) {
      return res.status(400).json({ message: "attemptId et status requis." });
    }
    const rdv = await prisma.rendezVous.findFirst({
      where: { paymentAttemptId: attemptId }
    });
    if (!rdv) {
      return res.status(404).json({ message: "Tentative de paiement introuvable." });
    }
    if (provider && String(rdv.paymentProvider || "") !== provider) {
      return res.status(400).json({ message: "Provider incoherent pour cette tentative." });
    }
    if (String(rdv.paymentStatus || "") === "paid") {
      return res.status(200).json({ ok: true, message: "Paiement deja confirme." });
    }

    if (status === "failed") {
      const failed = await prisma.rendezVous.update({
        where: { id: rdv.id },
        data: {
          paymentStatus: "failed",
          paymentFailureReason: failureReason || "Echec operateur.",
          paymentFailedAt: new Date(),
          paymentOperatorTxnId: operatorTxnId
        }
      });
      return res.status(200).json({ ok: true, rendezVous: failed });
    }

    if (String(rdv.paymentStatus || "") !== "pending") {
      return res.status(409).json({ message: "Le rendez-vous n'est pas en attente de paiement." });
    }
    const price = rdv.priceFcfa != null ? Number(rdv.priceFcfa) : 0;
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Prix invalide pour finaliser le paiement." });
    }
    const paymentProvider = String(rdv.paymentProvider || "");
    const balanceField = paymentProvider === "flooz" ? "balanceFloozFcfa" : "balanceMixFcfa";
    const user = await prisma.user.findUnique({ where: { id: rdv.clientUid } });
    if (!user || !isClientRole(user.role)) {
      return res.status(400).json({ message: "Compte client invalide." });
    }
    const bal = Number(user[balanceField]) || 0;
    if (bal < price) {
      const failed = await prisma.rendezVous.update({
        where: { id: rdv.id },
        data: {
          paymentStatus: "failed",
          paymentFailureReason: `Solde insuffisant au moment de la confirmation (${bal} FCFA / ${price} FCFA).`,
          paymentFailedAt: new Date(),
          paymentOperatorTxnId: operatorTxnId
        }
      });
      return res.status(200).json({ ok: false, rendezVous: failed });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: rdv.clientUid },
        data: { [balanceField]: bal - price }
      }),
      prisma.rendezVous.update({
        where: { id: rdv.id },
        data: {
          paymentStatus: "paid",
          paymentFailureReason: null,
          paymentFailedAt: null,
          paymentOperatorTxnId: operatorTxnId,
          paidAt: new Date()
        }
      })
    ]);
    const updated = await prisma.rendezVous.findUnique({ where: { id: rdv.id } });
    return res.status(200).json({ ok: true, rendezVous: updated });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

async function enrichContactRequestsWithClient(rows) {
  if (!rows.length) return rows;
  const clientIds = [...new Set(rows.map((r) => String(r.clientUid || "").trim()).filter(Boolean))];
  const clients = clientIds.length
    ? await prisma.user.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true, email: true, city: true, quartier: true, phone: true, photoUrl: true }
      })
    : [];
  const byId = Object.fromEntries(clients.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    client: byId[r.clientUid] || null
  }));
}

app.get("/api/contact-requests", async (req, res) => {
  try {
    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ message: "uid requis." });
    }
    const viewer = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, role: true, salonName: true }
    });
    if (!viewer) {
      return res.status(404).json({ message: "Compte introuvable." });
    }
    const roleKey = resolveUserRole(viewer);
    let where;
    if (roleKey === "salon" || roleKey === "coiffeur") {
      where = { proUid: uid };
    } else if (roleKey === "client") {
      where = { clientUid: uid };
    } else {
      where = { OR: [{ clientUid: uid }, { proUid: uid }] };
    }
    const rows = await prisma.contactRequest.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });
    const enriched =
      roleKey === "salon" || roleKey === "coiffeur"
        ? await enrichContactRequestsWithClient(rows)
        : rows;
    return res.json({ requests: enriched, roleKey });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("ContactRequest") || msg.includes("does not exist")) {
      return res.status(503).json({
        code: "schema/missing-table",
        message:
          "Table ContactRequest absente : exécutez « npx prisma migrate deploy » (ou « prisma db push ») sur le serveur."
      });
    }
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/contact-requests/between", async (req, res) => {
  try {
    const clientUid = String(req.query.clientUid || "").trim();
    const proUid = String(req.query.proUid || "").trim();
    if (!clientUid || !proUid) {
      return res.status(400).json({ message: "clientUid et proUid requis." });
    }
    const row = await prisma.contactRequest.findUnique({
      where: { clientUid_proUid: { clientUid, proUid } }
    });
    return res.json({ request: row || null });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/contact-requests", async (req, res) => {
  try {
    const clientUid = String(req.body?.clientUid || "").trim();
    const proUid = String(req.body?.proUid || "").trim();
    const message = req.body?.message != null ? String(req.body.message).trim().slice(0, 2000) : "";
    if (!clientUid || !proUid || clientUid === proUid) {
      return res.status(400).json({ message: "clientUid et proUid valides requis." });
    }
    const client = await prisma.user.findUnique({ where: { id: clientUid }, select: { id: true, role: true } });
    const pro = await prisma.user.findUnique({ where: { id: proUid }, select: { id: true, role: true } });
    if (!client || !isClientRole(client.role)) {
      return res.status(400).json({ message: "Le demandeur doit être un compte client." });
    }
    if (!pro || !isProMessagingRole(pro.role)) {
      return res.status(400).json({ message: "Le destinataire doit être un professionnel." });
    }

    const existing = await prisma.contactRequest.findUnique({
      where: { clientUid_proUid: { clientUid, proUid } }
    });
    if (existing) {
      if (existing.status === "accepted") {
        return res.status(409).json({ code: "contact/already-accepted", message: "Vous êtes déjà en contact avec ce professionnel." });
      }
      if (existing.status === "pending") {
        return res.json({ request: existing });
      }
      const updated = await prisma.contactRequest.update({
        where: { id: existing.id },
        data: {
          status: "pending",
          message: message || existing.message || null
        }
      });
      return res.json({ request: updated });
    }

    const created = await prisma.contactRequest.create({
      data: {
        clientUid,
        proUid,
        status: "pending",
        message: message || null
      }
    });
    return res.status(201).json({ request: created });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("ContactRequest") || msg.includes("does not exist")) {
      return res.status(503).json({
        code: "schema/missing-table",
        message:
          "Table ContactRequest absente : exécutez « npx prisma migrate deploy » sur le serveur."
      });
    }
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/contact-requests/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const proUid = String(req.body?.proUid || "").trim();
    const status = String(req.body?.status || "")
      .trim()
      .toLowerCase();
    if (!id || !proUid) {
      return res.status(400).json({ message: "id et proUid requis." });
    }
    if (status !== "accepted" && status !== "rejected") {
      return res.status(400).json({ message: "status doit être accepted ou rejected." });
    }
    const row = await prisma.contactRequest.findUnique({ where: { id } });
    if (!row) {
      return res.status(404).json({ message: "Demande introuvable." });
    }
    if (row.proUid !== proUid) {
      return res.status(403).json({ message: "Seul le professionnel concerné peut répondre à cette demande." });
    }
    if (row.status !== "pending") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }
    const updated = await prisma.contactRequest.update({
      where: { id },
      data: { status }
    });
    return res.json({ request: updated });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const fromUid = String(req.body?.fromUid || "").trim();
    const toUid = String(req.body?.toUid || "").trim();
    const text = req.body?.text != null ? String(req.body.text) : "";
    if (!fromUid || !toUid) {
      return res.status(400).json({ message: "fromUid et toUid requis." });
    }
    try {
      await assertMessageContactAllowed(fromUid, toUid);
    } catch (e) {
      if (e.status === 403) {
        return res.status(403).json({ code: e.code || "contact/not-accepted", message: e.message });
      }
      throw e;
    }
    const row = await prisma.message.create({
      data: { fromUid, toUid, text }
    });
    return res.status(201).json({ message: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const uid = String(req.query.uid || "");
    const rows = await prisma.message.findMany({
      where: { OR: [{ toUid: uid }, { fromUid: uid }] },
      orderBy: { createdAt: "desc" }
    });
    const filtered = await filterMessagesByContactGate(uid, rows);
    return res.json({ messages: filtered });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/avis", async (req, res) => {
  try {
    const row = await prisma.avis.create({ data: req.body });
    return res.status(201).json({ avis: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/avis", async (req, res) => {
  try {
    const toProUid = req.query.toProUid ? String(req.query.toProUid) : undefined;
    const fromClientUid = req.query.fromClientUid ? String(req.query.fromClientUid) : undefined;
    const rows = await prisma.avis.findMany({
      where: {
        ...(toProUid ? { toProUid } : {}),
        ...(fromClientUid ? { fromClientUid } : {})
      },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ avis: rows });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/avis/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const fromClientUid = String(req.body?.fromClientUid || "").trim();
    const toProUid = String(req.body?.toProUid || "").trim();
    if (!id || (!fromClientUid && !toProUid)) {
      return res.status(400).json({ message: "id et fromClientUid ou toProUid requis." });
    }
    const existing = await prisma.avis.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Avis introuvable." });
    const isClient = fromClientUid && existing.fromClientUid === fromClientUid;
    const isPro = toProUid && existing.toProUid === toProUid;
    if (!isClient && !isPro) {
      return res.status(403).json({ message: "Modification non autorisée." });
    }
    const data = {};
    if (isClient) {
      if (req.body.rating != null) {
        const rating = Number(req.body.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          return res.status(400).json({ message: "La note doit être comprise entre 1 et 5." });
        }
        data.rating = Math.round(rating);
      }
      if (req.body.comment != null) {
        const comment = String(req.body.comment || "").trim();
        if (!comment) return res.status(400).json({ message: "Le commentaire est obligatoire." });
        data.comment = comment;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, "photoUrl")) {
        data.photoUrl = String(req.body.photoUrl || "").trim() || null;
      }
    }
    if (isPro && Object.prototype.hasOwnProperty.call(req.body, "proReply")) {
      const reply = String(req.body.proReply || "").trim().slice(0, 500);
      data.proReply = reply || null;
      data.proReplyAt = reply ? new Date() : null;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ message: "Aucune modification demandée." });
    }
    const row = await prisma.avis.update({ where: { id }, data });
    return res.json({ avis: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.delete("/api/avis/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const fromClientUid = String(req.body?.fromClientUid || req.query.fromClientUid || "").trim();
    if (!id || !fromClientUid) {
      return res.status(400).json({ message: "id et fromClientUid requis." });
    }
    const existing = await prisma.avis.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Avis introuvable." });
    if (existing.fromClientUid !== fromClientUid) {
      return res.status(403).json({ message: "Suppression non autorisée." });
    }
    await prisma.avis.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

function parseOffreRemunerationInput(body) {
  const allowed = new Set(["monthly", "per_prestation"]);
  const raw = String(body?.remunerationType || "")
    .trim()
    .toLowerCase();
  const remunerationType = allowed.has(raw) ? raw : null;
  if (!remunerationType) {
    return { error: "remunerationType requis (monthly ou per_prestation)." };
  }
  let salaryFcfa = null;
  if (remunerationType === "monthly") {
    const parsed = Number.parseInt(String(body?.salaryFcfa ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "salaryFcfa requis (entier positif) pour un salaire mensuel." };
    }
    salaryFcfa = parsed;
  }
  const remunerationNote =
    body?.remunerationNote != null && String(body.remunerationNote).trim()
      ? String(body.remunerationNote).trim()
      : null;
  return { remunerationType, salaryFcfa, remunerationNote };
}

app.post("/api/offres", async (req, res) => {
  try {
    const allowedContractTypes = new Set(["full-time", "part-time", "cdd"]);
    const rawContractType = String(req.body?.contractType || "")
      .trim()
      .toLowerCase();
    const contractType = allowedContractTypes.has(rawContractType) ? rawContractType : null;
    const city = String(req.body?.city || "").trim();
    const quartier = String(req.body?.quartier || "").trim();
    if (!city) {
      return res.status(400).json({ message: "La ville est requise." });
    }
    if (!quartier) {
      return res.status(400).json({ message: "Le quartier est requis." });
    }
    const pay = parseOffreRemunerationInput(req.body);
    if (pay.error) {
      return res.status(400).json({ message: pay.error });
    }
    const data = {
      salonUid: String(req.body?.salonUid || "").trim(),
      salonName: String(req.body?.salonName || "").trim() || null,
      title: String(req.body?.title || "").trim(),
      description: String(req.body?.description || "").trim(),
      city,
      quartier,
      contractType,
      remunerationType: pay.remunerationType,
      salaryFcfa: pay.salaryFcfa,
      remunerationNote: pay.remunerationNote
    };
    if (!data.salonUid || !data.title || !data.description) {
      return res.status(400).json({ message: "salonUid, title et description sont requis." });
    }
    try {
      const row = await prisma.offre.create({ data });
      return res.status(201).json({ offre: row });
    } catch (error) {
      const msg = String(error?.message || "");
      const unknownField =
        msg.includes("Unknown argument `contractType`") ||
        msg.includes("Unknown argument contractType") ||
        msg.includes("Unknown argument `quartier`") ||
        msg.includes("Unknown argument `remunerationType`") ||
        msg.includes("Unknown argument `salaryFcfa`") ||
        msg.includes("Unknown argument `remunerationNote`");
      if (!unknownField) throw error;

      const legacyData = {
        salonUid: data.salonUid,
        salonName: data.salonName,
        title: data.title,
        description: data.description,
        city: data.city
      };
      if (!msg.includes("Unknown argument `contractType`") && !msg.includes("Unknown argument contractType")) {
        legacyData.contractType = data.contractType;
      }
      const row = await prisma.offre.create({ data: legacyData });
      return res.status(201).json({
        offre: row,
        warning:
          "Certains champs (quartier, rémunération…) ignorés : exécutez « npx prisma db push » ou appliquez la migration."
      });
    }
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/offres", async (req, res) => {
  try {
    const forSalon = String(req.query.forSalon || "").trim();
    const where = forSalon
      ? {
          OR: [{ status: "open" }, { salonUid: forSalon }]
        }
      : { status: "open" };
    const rows = await prisma.offre.findMany({ where, orderBy: { createdAt: "desc" } });
    return res.json({ offres: rows });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/offres/:id", async (req, res) => {
  try {
    const row = await prisma.offre.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: "Offre introuvable." });
    return res.json({ offre: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/offres/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const salonUid = String(req.body?.salonUid || "").trim();
    const raw = String(req.body?.status || "").trim().toLowerCase();
    if (!id || !salonUid) {
      return res.status(400).json({ message: "Identifiant d’offre et salonUid sont requis." });
    }
    if (raw !== "open" && raw !== "filled") {
      return res.status(400).json({ message: "status doit être open ou filled." });
    }
    const offre = await prisma.offre.findUnique({ where: { id } });
    if (!offre) return res.status(404).json({ message: "Offre introuvable." });
    if (String(offre.salonUid) !== salonUid) {
      return res.status(403).json({ message: "Seul le salon auteur peut modifier le statut de l’offre." });
    }
    const row = await prisma.offre.update({ where: { id }, data: { status: raw } });
    return res.json({ offre: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.delete("/api/offres/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const salonUid = String(req.body?.salonUid || "").trim();
    if (!id || !salonUid) {
      return res.status(400).json({ message: "Identifiant d’offre et salonUid sont requis." });
    }
    const offre = await prisma.offre.findUnique({ where: { id } });
    if (!offre) return res.status(404).json({ message: "Offre introuvable." });
    if (String(offre.salonUid) !== salonUid) {
      return res.status(403).json({ message: "Vous ne pouvez retirer que les offres publiées par votre salon." });
    }
    await prisma.$transaction([
      prisma.candidature.deleteMany({ where: { offerId: id } }),
      prisma.offre.delete({ where: { id } })
    ]);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/marketplace/products", async (req, res) => {
  try {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const sellerUid = String(req.query.sellerUid || "").trim();
    const where = {
      status: "active",
      ...(sellerUid ? { sellerUid } : {})
    };
    const rows = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    const sellerIds = [...new Set(rows.map((p) => String(p.sellerUid || "").trim()).filter(Boolean))];
    let roleBySellerId = {};
    if (sellerIds.length) {
      const sellers = await prisma.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, role: true }
      });
      roleBySellerId = Object.fromEntries(sellers.map((u) => [u.id, u.role]));
    }
    const proRows = rows.filter((p) => isMarketplaceSellerRole(roleBySellerId[p.sellerUid]));
    const filtered = q
      ? proRows.filter((p) =>
          `${p.title || ""} ${p.description || ""} ${p.category || ""} ${p.sellerName || ""}`.toLowerCase().includes(q)
        )
      : proRows;
    return res.json({ products: filtered, feeRateBp: MARKETPLACE_FEE_RATE_BP });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/marketplace/products", async (req, res) => {
  try {
    const sellerUid = String(req.body?.sellerUid || "").trim();
    const sellerName = String(req.body?.sellerName || "").trim() || "Vendeur";
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const category = String(req.body?.category || "").trim() || null;
    let photoUrl = String(req.body?.photoUrl || "").trim() || null;
    const priceFcfa = parsePositiveInt(req.body?.priceFcfa);
    const stock = parsePositiveInt(req.body?.stock, 1);
    if (!sellerUid || !title || !description || !priceFcfa) {
      return res.status(400).json({ message: "sellerUid, title, description et priceFcfa sont requis." });
    }
    const sellerUser = await prisma.user.findUnique({ where: { id: sellerUid }, select: { id: true, role: true } });
    if (!sellerUser || !isMarketplaceSellerRole(sellerUser.role)) {
      return res.status(403).json({ message: "Seuls les professionnels (salon ou coiffeur) peuvent publier sur le marketplace." });
    }
    if (photoUrl && photoUrl.length > MARKETPLACE_PHOTO_URL_MAX_LEN) {
      return res.status(400).json({ message: "Photo trop volumineuse (réduisez la taille ou compressez l’image)." });
    }
    if (photoUrl && !/^https?:\/\//i.test(photoUrl) && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(photoUrl)) {
      return res.status(400).json({
        message: "Photo : fournissez une URL https ou une image (PNG, JPEG, WebP, GIF) importée depuis votre appareil."
      });
    }
    const colors = serializeProductColorsField(req.body?.colors);
    const row = await prisma.product.create({
      data: {
        sellerUid,
        sellerName,
        title,
        description,
        category,
        colors,
        photoUrl,
        priceFcfa,
        stock
      }
    });
    return res.status(201).json({ product: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/marketplace/products/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const sellerUid = String(req.body?.sellerUid || "").trim();
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Article introuvable." });
    if (!sellerUid || sellerUid !== String(existing.sellerUid || "")) {
      return res.status(403).json({ message: "Modification non autorisée." });
    }
    const sellerUser = await prisma.user.findUnique({ where: { id: sellerUid }, select: { role: true } });
    if (!sellerUser || !isMarketplaceSellerRole(sellerUser.role)) {
      return res.status(403).json({ message: "Seuls les professionnels peuvent modifier des articles marketplace." });
    }
    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title || "").trim() || existing.title;
    if (req.body.description !== undefined)
      data.description = String(req.body.description || "").trim() || existing.description;
    if (req.body.category !== undefined) data.category = String(req.body.category || "").trim() || null;
    if (req.body.colors !== undefined) data.colors = serializeProductColorsField(req.body.colors);
    if (req.body.photoUrl !== undefined) {
      const nextPhoto = String(req.body.photoUrl || "").trim() || null;
      if (nextPhoto && nextPhoto.length > MARKETPLACE_PHOTO_URL_MAX_LEN) {
        return res.status(400).json({ message: "Photo trop volumineuse (réduisez la taille ou compressez l’image)." });
      }
      if (
        nextPhoto &&
        !/^https?:\/\//i.test(nextPhoto) &&
        !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(nextPhoto)
      ) {
        return res.status(400).json({
          message: "Photo : fournissez une URL https ou une image (PNG, JPEG, WebP, GIF) importée depuis votre appareil."
        });
      }
      data.photoUrl = nextPhoto;
    }
    if (req.body.status !== undefined) {
      const status = String(req.body.status || "").trim().toLowerCase();
      if (["active", "paused", "soldout", "deleted"].includes(status)) data.status = status;
    }
    if (req.body.priceFcfa !== undefined) {
      const price = parsePositiveInt(req.body.priceFcfa);
      if (!price) return res.status(400).json({ message: "priceFcfa doit être > 0." });
      data.priceFcfa = price;
    }
    if (req.body.stock !== undefined) {
      const stock = parseInt(String(req.body.stock ?? ""), 10);
      if (!Number.isFinite(stock) || stock < 0) {
        return res.status(400).json({ message: "stock invalide." });
      }
      data.stock = stock;
      if (stock === 0 && !data.status) data.status = "soldout";
      if (stock > 0 && String(existing.status || "") === "soldout" && !data.status) data.status = "active";
    }
    const row = await prisma.product.update({ where: { id }, data });
    return res.json({ product: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.delete("/api/marketplace/products/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const sellerUid = String(req.body?.sellerUid || "").trim();
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Article introuvable." });
    if (!sellerUid || sellerUid !== String(existing.sellerUid || "")) {
      return res.status(403).json({ message: "Suppression non autorisée." });
    }
    const sellerUser = await prisma.user.findUnique({ where: { id: sellerUid }, select: { role: true } });
    if (!sellerUser || !isMarketplaceSellerRole(sellerUser.role)) {
      return res.status(403).json({ message: "Seuls les professionnels peuvent retirer des articles marketplace." });
    }
    await prisma.product.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

function normalizeMarketplaceCartItems(body) {
  const raw = body?.items;
  if (Array.isArray(raw) && raw.length) {
    const map = new Map();
    for (const row of raw) {
      const productId = String(row?.productId || "").trim();
      const color = row?.color != null ? String(row.color).trim() : "";
      const q = parsePositiveInt(row?.quantity, 1) || 1;
      if (!productId) continue;
      const key = cartLineKey(productId, color);
      const prev = map.get(key);
      map.set(key, {
        productId,
        quantity: (prev?.quantity || 0) + q,
        color: color || null
      });
    }
    return [...map.values()];
  }
  const singleId = String(body?.productId || "").trim();
  const singleQty = parsePositiveInt(body?.quantity, 1) || 1;
  const singleColor = body?.color != null ? String(body.color).trim() : null;
  if (singleId) return [{ productId: singleId, quantity: singleQty, color: singleColor || null }];
  return [];
}

/** Rétablit le stock après annulation ou remplacement d’une commande. */
async function restoreMarketOrderItemsStock(tx, items) {
  for (const it of items || []) {
    const p = await tx.product.findUnique({ where: { id: it.productId } });
    if (!p) continue;
    const nextStock = Number(p.stock || 0) + Number(it.quantity || 0);
    const prevSold = Number(p.unitsSold || 0);
    const dec = Number(it.quantity || 0);
    let nextStatus = String(p.status || "active");
    if (nextStock > 0 && nextStatus === "soldout") nextStatus = "active";
    await tx.product.update({
      where: { id: it.productId },
      data: {
        stock: nextStock,
        status: nextStatus,
        unitsSold: Math.max(0, prevSold - dec)
      }
    });
  }
}

async function decrementProductStockForOrder(tx, productId, quantity) {
  const current = await tx.product.findUnique({ where: { id: productId } });
  if (!current || Number(current.stock || 0) < quantity || String(current.status || "") !== "active") {
    throw new Error("Stock insuffisant ou article indisponible (conflit).");
  }
  const nextStock = Number(current.stock || 0) - quantity;
  await tx.product.update({
    where: { id: productId },
    data: {
      stock: nextStock,
      status: nextStock === 0 ? "soldout" : String(current.status || "active"),
      unitsSold: { increment: quantity }
    }
  });
}

/**
 * Crée ou met à jour la commande marketplace liée à un RDV :
 * rétablit l’ancien stock, applique la nouvelle sélection, décrémente le stock.
 */
async function syncRdvLinkedMarketOrder(tx, params) {
  const { rendezVousId, buyerUid, sellerUid, sellerName, buyerName, nextLines } = params;
  let order = await tx.marketOrder.findUnique({
    where: { rendezVousId },
    include: { items: true }
  });

  if (order && String(order.status || "").toLowerCase() !== "cancelled") {
    await restoreMarketOrderItemsStock(tx, order.items);
    await tx.marketOrderItem.deleteMany({ where: { orderId: order.id } });
  }

  if (!nextLines.length) {
    if (order) {
      await tx.marketOrder.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          subtotalFcfa: 0,
          platformFeeFcfa: 0,
          sellerNetFcfa: 0
        }
      });
    }
    return null;
  }

  for (const line of nextLines) {
    await decrementProductStockForOrder(tx, line.productId, line.quantity);
  }

  const subtotal = nextLines.reduce((acc, row) => acc + Number(row.lineTotalFcfa || 0), 0);
  const fee = Math.floor((subtotal * MARKETPLACE_FEE_RATE_BP) / 10_000);
  const sellerNet = subtotal - fee;

  if (order) {
    order = await tx.marketOrder.update({
      where: { id: order.id },
      data: {
        buyerUid,
        sellerUid,
        sellerName,
        buyerName,
        status: "pending",
        subtotalFcfa: subtotal,
        platformFeeFcfa: fee,
        sellerNetFcfa: sellerNet
      }
    });
  } else {
    order = await tx.marketOrder.create({
      data: {
        rendezVousId,
        buyerUid,
        sellerUid,
        sellerName,
        buyerName,
        status: "pending",
        subtotalFcfa: subtotal,
        platformFeeFcfa: fee,
        sellerNetFcfa: sellerNet,
        platformFeeRateBp: MARKETPLACE_FEE_RATE_BP
      }
    });
  }

  for (const line of nextLines) {
    await tx.marketOrderItem.create({
      data: {
        orderId: order.id,
        productId: line.productId,
        sellerUid,
        buyerUid,
        productTitle: line.productTitle,
        unitPriceFcfa: line.unitPriceFcfa,
        quantity: line.quantity,
        color: line.color,
        lineTotalFcfa: line.lineTotalFcfa
      }
    });
  }

  return tx.marketOrder.findUnique({ where: { id: order.id }, include: { items: true } });
}

function marketplaceOrderItemsLines(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items
    .map((it) => {
      const colorBit = it.color ? `, couleur ${String(it.color).trim()}` : "";
      return `- ${String(it.productTitle || "Article").trim()} × ${Number(it.quantity || 0)}${colorBit} (${Number(it.lineTotalFcfa || 0)} FCFA)`;
    })
    .join("\n");
}

function marketplaceOrderRdvContextLine(order) {
  return order.rendezVousId
    ? `\nContexte : achat lié au rendez-vous ${String(order.rendezVousId).slice(0, 8)}…`
    : "";
}

/** Message automatique visible uniquement par le vendeur (toUid = sellerUid). */
function marketplaceOrderSellerNoticeText(order, buyerName) {
  const name = String(buyerName || "Acheteur").trim() || "Acheteur";
  const lines = marketplaceOrderItemsLines(order);
  const sub = Number(order.subtotalFcfa || 0);
  const net = Number(order.sellerNetFcfa || 0);
  const st = String(order.status || "pending");
  const head =
    `${MARKETPLACE_MSG_PREFIX_VENDEUR} Nouvelle commande\nRéférence : ${String(order.id)}\nAcheteur : ${name}${marketplaceOrderRdvContextLine(order)}\n`;
  const foot = `\nTotal commande : ${sub} FCFA\nNet vendeur après commission : ${net} FCFA\nStatut : ${st}\nConvenez du retrait ou de la livraison avec l’acheteur via la messagerie HairConnect.`;
  const body = `${head}\n${lines || "(détail indisponible)"}${foot}`;
  return body.length > 8000 ? body.slice(0, 7997) + "…" : body;
}

/** Message automatique visible uniquement par l’acheteur (toUid = buyerUid). */
function marketplaceOrderBuyerNoticeText(order, sellerName) {
  const name = String(sellerName || "Vendeur").trim() || "Vendeur";
  const lines = marketplaceOrderItemsLines(order);
  const sub = Number(order.subtotalFcfa || 0);
  const st = String(order.status || "pending");
  const head =
    `${MARKETPLACE_MSG_PREFIX_ACHETEUR} Commande enregistrée\nRéférence : ${String(order.id)}\nVendeur : ${name}${marketplaceOrderRdvContextLine(order)}\n`;
  const foot = `\nTotal : ${sub} FCFA\nStatut : ${st}\nConvenez du retrait ou de la livraison avec le vendeur via la messagerie HairConnect.`;
  const body = `${head}\n${lines || "(détail indisponible)"}${foot}`;
  return body.length > 8000 ? body.slice(0, 7997) + "…" : body;
}

app.post("/api/marketplace/orders", async (req, res) => {
  try {
    const buyerUid = String(req.body?.buyerUid || "").trim();
    const merged = normalizeMarketplaceCartItems(req.body);
    if (!buyerUid || !merged.length) {
      return res.status(400).json({ message: "buyerUid et items (productId, quantity) sont requis." });
    }

    const ids = [...new Set(merged.map((m) => m.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));

    for (const { productId, quantity, color } of merged) {
      const p = byId[productId];
      if (!p || String(p.status || "") === "deleted") {
        return res.status(404).json({ message: `Article introuvable (${productId}).` });
      }
      if (buyerUid === String(p.sellerUid || "")) {
        return res.status(400).json({ message: "Vous ne pouvez pas acheter votre propre article." });
      }
      const allowedColors = parseProductColorsField(p.colors);
      const resolvedColor = resolveLineColorChoice(color, allowedColors);
      if (allowedColors.length && !resolvedColor) {
        return res.status(400).json({
          message: `Choisissez une couleur pour « ${p.title || "cet article"} ».`
        });
      }
      if (String(p.status || "") !== "active" || Number(p.stock || 0) < quantity) {
        return res.status(400).json({ message: `Stock insuffisant ou indisponible : ${p.title || productId}.` });
      }
    }

    /** @type {Map<string, Array<{ product: typeof products[0]; quantity: number; color: string|null }>>} */
    const groups = new Map();
    for (const { productId, quantity, color } of merged) {
      const p = byId[productId];
      const sid = String(p.sellerUid || "");
      const resolvedColor = resolveLineColorChoice(color, parseProductColorsField(p.colors));
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push({ product: p, quantity, color: resolvedColor });
    }

    const buyer = await prisma.user.findUnique({ where: { id: buyerUid } });
    const buyerName = buyer ? publicationAuthorLabelFromUser(buyer) : "Acheteur";

    const ordersOut = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const { productId, quantity } of merged) {
        const current = await tx.product.findUnique({ where: { id: productId } });
        if (!current || Number(current.stock || 0) < quantity || String(current.status || "") !== "active") {
          throw new Error("Stock insuffisant ou article indisponible (conflit).");
        }
        const nextStock = Number(current.stock || 0) - quantity;
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: nextStock,
            status: nextStock === 0 ? "soldout" : String(current.status || "active"),
            unitsSold: { increment: quantity }
          }
        });
      }

      for (const [sellerUid, lines] of groups) {
        let subtotal = 0;
        for (const { product, quantity } of lines) {
          subtotal += Number(product.priceFcfa) * quantity;
        }
        const fee = Math.floor((subtotal * MARKETPLACE_FEE_RATE_BP) / 10_000);
        const sellerNet = subtotal - fee;
        const first = lines[0].product;
        const order = await tx.marketOrder.create({
          data: {
            buyerUid,
            sellerUid,
            sellerName: first.sellerName,
            buyerName,
            status: "pending",
            subtotalFcfa: subtotal,
            platformFeeFcfa: fee,
            sellerNetFcfa: sellerNet,
            platformFeeRateBp: MARKETPLACE_FEE_RATE_BP
          }
        });
        for (const { product, quantity, color } of lines) {
          const lineTotal = Number(product.priceFcfa) * quantity;
          await tx.marketOrderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              sellerUid,
              buyerUid,
              productTitle: product.title,
              unitPriceFcfa: product.priceFcfa,
              quantity,
              color: color || null,
              lineTotalFcfa: lineTotal
            }
          });
        }
        const full = await tx.marketOrder.findUnique({ where: { id: order.id }, include: { items: true } });
        out.push(full);
      }
      return out;
    });

    for (const order of ordersOut) {
      if (!order || !order.sellerUid) continue;
      try {
        const sellerLabel = String(order.sellerName || "").trim() || "Vendeur";
        await sendMarketplaceOrderNotifications(order, buyerUid, buyerName, sellerLabel);
      } catch (notifyErr) {
        console.error("[marketplace] message vendeur:", notifyErr);
      }
    }

    return res.status(201).json({ orders: ordersOut, feeRateBp: MARKETPLACE_FEE_RATE_BP });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/marketplace/messaging-peers", async (req, res) => {
  try {
    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ message: "uid requis." });
    }
    const rows = await prisma.marketOrder.findMany({
      where: {
        status: { not: "cancelled" },
        OR: [{ buyerUid: uid }, { sellerUid: uid }]
      },
      select: { buyerUid: true, sellerUid: true }
    });
    const peerUids = new Set();
    for (const o of rows) {
      const other = String(o.buyerUid) === uid ? o.sellerUid : o.buyerUid;
      if (other) peerUids.add(String(other));
    }
    return res.json({ peerUids: [...peerUids] });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/marketplace/orders", async (req, res) => {
  try {
    const buyerUid = String(req.query.buyerUid || "").trim();
    const sellerUid = String(req.query.sellerUid || "").trim();
    if (!buyerUid && !sellerUid) {
      return res.status(400).json({ message: "buyerUid ou sellerUid requis." });
    }
    const rows = await prisma.marketOrder.findMany({
      where: {
        ...(buyerUid ? { buyerUid } : {}),
        ...(sellerUid ? { sellerUid } : {})
      },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ orders: rows, feeRateBp: MARKETPLACE_FEE_RATE_BP });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/marketplace/orders/:id/status", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const sellerUid = String(req.body?.sellerUid || "").trim();
    const status = String(req.body?.status || "")
      .trim()
      .toLowerCase();
    if (!["pending", "confirmed", "shipped", "delivered"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const existing = await prisma.marketOrder.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Commande introuvable." });
    if (!sellerUid || sellerUid !== String(existing.sellerUid || "")) {
      return res.status(403).json({ message: "Mise à jour non autorisée." });
    }
    const row = await prisma.marketOrder.update({ where: { id }, data: { status } });
    return res.json({ order: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/marketplace/orders/:id/cancel", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const buyerUid = String(req.body?.buyerUid || "").trim();
    const sellerUid = String(req.body?.sellerUid || "").trim();
    if (!id || (!buyerUid && !sellerUid)) {
      return res.status(400).json({ message: "id et buyerUid ou sellerUid requis." });
    }
    const existing = await prisma.marketOrder.findUnique({ where: { id }, include: { items: true } });
    if (!existing) return res.status(404).json({ message: "Commande introuvable." });
    const st = String(existing.status || "").toLowerCase();
    if (st === "cancelled") {
      return res.status(400).json({ message: "Cette commande est déjà annulée." });
    }
    const isBuyer = buyerUid && buyerUid === String(existing.buyerUid || "");
    const isSeller = sellerUid && sellerUid === String(existing.sellerUid || "");
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: "Annulation non autorisée." });
    }
    if (isBuyer && ["shipped", "delivered"].includes(st)) {
      return res.status(400).json({
        message:
          st === "delivered"
            ? "Cette commande est livrée : vous ne pouvez plus l’annuler."
            : "Cette commande a déjà été expédiée : annulation impossible côté acheteur."
      });
    }
    if (["shipped", "delivered"].includes(st)) {
      return res.status(400).json({ message: "Impossible d’annuler une commande déjà expédiée ou livrée." });
    }

    await prisma.$transaction(async (tx) => {
      const order = await tx.marketOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order || String(order.status || "").toLowerCase() === "cancelled") return;
      const orderSt = String(order.status || "").toLowerCase();
      if (isBuyer && ["shipped", "delivered"].includes(orderSt)) {
        throw new Error("Annulation acheteur impossible pour ce statut.");
      }
      if (["shipped", "delivered"].includes(orderSt)) {
        throw new Error("Statut incompatible pour annulation.");
      }
      await restoreMarketOrderItemsStock(tx, order.items);
      await tx.marketOrder.update({ where: { id }, data: { status: "cancelled" } });
    });

    const updated = await prisma.marketOrder.findUnique({ where: { id }, include: { items: true } });
    return res.json({ order: updated });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/candidatures", async (req, res) => {
  try {
    const offerId = String(req.body?.offerId || "").trim();
    const coiffeurUid = String(req.body?.coiffeurUid || "").trim();
    const salonUid = String(req.body?.salonUid || "").trim();
    const message = req.body?.message != null ? String(req.body.message) : null;
    if (!offerId || !coiffeurUid || !salonUid) {
      return res.status(400).json({ message: "offerId, coiffeurUid et salonUid sont requis." });
    }
    const applicant = await prisma.user.findUnique({ where: { id: coiffeurUid } });
    if (!applicant) {
      return res.status(404).json({ message: "Compte introuvable." });
    }
    if (String(applicant.role || "").trim().toLowerCase() === "salon") {
      return res.status(403).json({ message: "Les salons ne peuvent pas postuler aux offres d'emploi." });
    }
    if (!isCoiffeurRole(applicant)) {
      return res.status(403).json({ message: "Seuls les coiffeurs peuvent postuler aux offres d'emploi." });
    }
    const offre = await prisma.offre.findUnique({ where: { id: offerId } });
    if (!offre) {
      return res.status(404).json({ message: "Offre introuvable." });
    }
    if (String(offre.status || "").toLowerCase() === "filled") {
      return res.status(409).json({ message: "Ce poste a déjà été pourvu." });
    }
    if (String(offre.salonUid) !== salonUid) {
      return res.status(400).json({ message: "Le salon de l'offre ne correspond pas." });
    }
    const existing = await prisma.candidature.findFirst({
      where: { offerId, coiffeurUid }
    });
    if (existing) {
      return res.status(409).json({
        message: "Vous avez déjà postulé à cette offre d'emploi."
      });
    }
    const row = await prisma.candidature.create({
      data: {
        offerId,
        coiffeurUid,
        salonUid,
        message: message || null,
        status: "pending"
      }
    });
    return res.status(201).json({ candidature: { ...row, status: normalizeCandidatureStatus(row.status) } });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        message: "Vous avez déjà postulé à cette offre d'emploi."
      });
    }
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

function sanitizeCandidatureCoiffeurPublic(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    city: u.city,
    quartier: u.quartier,
    bio: u.bio,
    photoUrl: u.photoUrl,
    role: u.role,
    proMetiers: u.proMetiers
  };
}

async function enrichCandidaturesForSalon(rows) {
  if (!rows.length) return rows;
  const coiffeurIds = [...new Set(rows.map((r) => String(r.coiffeurUid || "").trim()).filter(Boolean))];
  const offerIds = [...new Set(rows.map((r) => String(r.offerId || "").trim()).filter(Boolean))];
  const [coiffeurs, offres] = await Promise.all([
    coiffeurIds.length
      ? prisma.user.findMany({
          where: { id: { in: coiffeurIds } },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            quartier: true,
            bio: true,
            photoUrl: true,
            role: true,
            proMetiers: true
          }
        })
      : [],
    offerIds.length
      ? prisma.offre.findMany({
          where: { id: { in: offerIds } },
          select: {
            id: true,
            title: true,
            description: true,
            city: true,
            quartier: true,
            contractType: true,
            remunerationType: true,
            salaryFcfa: true,
            remunerationNote: true,
            status: true,
            salonName: true
          }
        })
      : []
  ]);
  const coiffeurById = Object.fromEntries(coiffeurs.map((u) => [u.id, sanitizeCandidatureCoiffeurPublic(u)]));
  const offreById = Object.fromEntries(offres.map((o) => [o.id, o]));
  return rows
    .map((r) => ({
      ...r,
      coiffeur: coiffeurById[r.coiffeurUid] || null,
      offre: offreById[r.offerId] || null
    }))
    .filter((r) => r.coiffeur && isCoiffeurRole(r.coiffeur));
}

function normalizeCandidatureStatus(raw) {
  const s = String(raw || "pending")
    .trim()
    .toLowerCase();
  return s === "accepted" || s === "rejected" ? s : "pending";
}

function candidatureStatusNoticeText(candidature, offre, salonLabel, status) {
  const title = String(offre?.title || "cette offre").trim();
  const salon = String(salonLabel || "Le salon").trim();
  if (status === "accepted") {
    return `[HairConnect · candidature] Bonne nouvelle : ${salon} a accepté votre candidature pour « ${title} ». Ouvrez la messagerie pour convenir des prochaines étapes.`;
  }
  return `[HairConnect · candidature] ${salon} a refusé votre candidature pour « ${title} ». Vous pouvez consulter d'autres offres sur HairConnect.`;
}

app.patch("/api/candidatures/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const salonUid = String(req.body?.salonUid || "").trim();
    const status = normalizeCandidatureStatus(req.body?.status);
    if (!id || !salonUid) {
      return res.status(400).json({ message: "id et salonUid requis." });
    }
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status doit être accepted ou rejected." });
    }
    const existing = await prisma.candidature.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Candidature introuvable." });
    }
    if (String(existing.salonUid) !== salonUid) {
      return res.status(403).json({ message: "Seul le salon concerné peut traiter cette candidature." });
    }
    const current = normalizeCandidatureStatus(existing.status);
    if (current !== "pending") {
      return res.status(409).json({
        message: `Cette candidature est déjà ${current === "accepted" ? "acceptée" : "refusée"}.`
      });
    }
    const row = await prisma.candidature.update({
      where: { id },
      data: { status }
    });
    const [offre, salonUser, coiffeurUser] = await Promise.all([
      prisma.offre.findUnique({
        where: { id: row.offerId },
        select: { id: true, title: true, salonName: true }
      }),
      prisma.user.findUnique({ where: { id: salonUid }, select: { id: true, name: true, salonName: true } }),
      prisma.user.findUnique({ where: { id: row.coiffeurUid }, select: { id: true, name: true } })
    ]);
    const salonLabel = publicationAuthorLabelFromUser(salonUser || {}) || offre?.salonName || "Salon";
    try {
      const text = candidatureStatusNoticeText(row, offre, salonLabel, status);
      await prisma.message.create({
        data: {
          fromUid: salonUid,
          toUid: String(row.coiffeurUid),
          text
        }
      });
    } catch (notifyErr) {
      console.error("[candidature] notification coiffeur:", notifyErr);
    }
    const enriched = await enrichCandidaturesForSalon([row]);
    return res.json({ candidature: enriched[0] || row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/candidatures", async (req, res) => {
  try {
    const coiffeurUid = req.query.coiffeurUid ? String(req.query.coiffeurUid) : undefined;
    const salonUid = req.query.salonUid ? String(req.query.salonUid) : undefined;
    const offerId = req.query.offerId ? String(req.query.offerId).trim() : undefined;
    let rows = await prisma.candidature.findMany({
      where: {
        ...(coiffeurUid ? { coiffeurUid } : {}),
        ...(salonUid ? { salonUid } : {}),
        ...(offerId ? { offerId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
    rows = rows.map((r) => ({ ...r, status: normalizeCandidatureStatus(r.status) }));
    if (salonUid) {
      rows = await enrichCandidaturesForSalon(rows);
    }
    return res.json({ candidatures: rows });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.post("/api/favorites", async (req, res) => {
  try {
    const { clientId, proId } = req.body;
    if (!clientId || !proId) {
      return res.status(400).json({ message: "clientId et proId requis." });
    }
    const favorite = await prisma.favorite.create({
      data: { clientId, proId }
    });
    return res.status(201).json({ favorite });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: "Déjà en favoris." });
    }
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.delete("/api/favorites", async (req, res) => {
  try {
    const { clientId, proId } = req.body;
    if (!clientId || !proId) {
      return res.status(400).json({ message: "clientId et proId requis." });
    }
    const deleted = await prisma.favorite.deleteMany({
      where: { clientId, proId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ message: "Favori introuvable." });
    }
    return res.status(200).json({ message: "Favori supprimé." });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/favorites", async (req, res) => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    if (!clientId) {
      return res.status(400).json({ message: "clientId requis." });
    }
    const favorites = await prisma.favorite.findMany({
      where: { clientId },
      include: { pro: true }
    });
    return res.json({ favorites });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/favorites/count", async (req, res) => {
  try {
    const proId = req.query.proId ? String(req.query.proId).trim() : "";
    if (!proId) {
      return res.status(400).json({ message: "proId requis." });
    }
    const count = await prisma.favorite.count({ where: { proId } });
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

const PUBLICATION_STYLE_TYPE_SLUGS = new Set([
  "tresses",
  "coupe",
  "coloration",
  "extensions",
  "barbier",
  "afro",
  "soins",
  "autre"
]);

function normalizePublicationStyleType(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase();
  return PUBLICATION_STYLE_TYPE_SLUGS.has(slug) ? slug : null;
}

app.post("/api/publications", async (req, res) => {
  try {
    const authorUid = String(req.body.authorUid || "").trim();
    const photoUrl = String(req.body.photoUrl || "").trim();
    const title = String(req.body.title || "").trim().slice(0, 120);
    const caption = String(req.body.caption || "").trim().slice(0, 500);
    const kind = String(req.body.kind || "").trim();
    const styleType = normalizePublicationStyleType(req.body.styleType);
    let targetProUid = String(req.body.targetProUid || "").trim();
    if (!authorUid || !photoUrl) {
      return res.status(400).json({ message: "authorUid et photoUrl requis." });
    }
    if (!title) {
      return res.status(400).json({ message: "Le nom de la photo est requis." });
    }
    if (kind !== "pro" && kind !== "client_after_service") {
      return res.status(400).json({ message: "kind invalide." });
    }
    if (!styleType) {
      return res.status(400).json({
        message: "Choisissez un type dans la liste (tresses, coupe, coloration, etc.)."
      });
    }
    if (kind === "pro") targetProUid = authorUid;
    if (!targetProUid) {
      return res.status(400).json({ message: "targetProUid requis." });
    }

    const rows = await readPublications();
    const row = {
      id: randomUUID(),
      authorUid,
      targetProUid,
      photoUrl,
      title,
      caption,
      kind,
      styleType,
      createdAt: new Date().toISOString()
    };
    rows.push(row);
    await writePublications(rows);
    return res.status(201).json({ publication: row });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.get("/api/publications", async (req, res) => {
  try {
    const targetProUid = req.query.targetProUid ? String(req.query.targetProUid) : "";
    const authorUid = req.query.authorUid ? String(req.query.authorUid) : "";
    const kind = req.query.kind ? String(req.query.kind) : "";
    const styleTypeFilter = normalizePublicationStyleType(req.query.styleType);
    const withAuthorNames =
      String(req.query.withAuthorNames || "") === "1" ||
      String(req.query.withAuthorNames || "").toLowerCase() === "true";
    const rows = await readPublications();
    const pruned = await filterPublicationRowsByExistingUsers(rows);
    if (pruned.length !== rows.length) {
      await writePublications(pruned);
    }
    let filtered = pruned
      .filter((p) => (targetProUid ? String(p.targetProUid) === targetProUid : true))
      .filter((p) => (authorUid ? String(p.authorUid) === authorUid : true))
      .filter((p) => (kind ? String(p.kind) === kind : true))
      .filter((p) =>
        styleTypeFilter ? String(p.styleType || "").toLowerCase() === styleTypeFilter : true
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (withAuthorNames && filtered.length) {
      const uidSet = new Set();
      for (const p of filtered) {
        const u = String(p.authorUid || p.targetProUid || "").trim();
        if (u) uidSet.add(u);
      }
      const uids = [...uidSet];
      const users =
        uids.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: uids } },
              select: { id: true, name: true, salonName: true, email: true }
            })
          : [];
      const displayById = Object.fromEntries(users.map((u) => [u.id, publicationAuthorLabelFromUser(u)]));
      filtered = filtered.map((p) => {
        const key = String(p.authorUid || p.targetProUid || "").trim();
        const authorDisplayName = key ? displayById[key] || "Compte supprimé" : "—";
        return { ...p, authorDisplayName };
      });
    }

    return res.json({ publications: filtered });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.patch("/api/publications/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const authorUid = String(req.body?.authorUid || "").trim();
    if (!id || !authorUid) {
      return res.status(400).json({ message: "id et authorUid requis." });
    }
    const rows = await readPublications();
    const idx = rows.findIndex((p) => String(p.id) === id);
    if (idx === -1) {
      return res.status(404).json({ message: "Publication introuvable." });
    }
    if (String(rows[idx].authorUid) !== authorUid) {
      return res.status(403).json({ message: "Modification non autorisée." });
    }
    if (req.body.title != null) {
      const title = String(req.body.title || "").trim().slice(0, 120);
      if (!title) return res.status(400).json({ message: "Le nom de la réalisation est requis." });
      rows[idx].title = title;
    }
    if (req.body.caption != null) {
      rows[idx].caption = String(req.body.caption || "").trim().slice(0, 500);
    }
    if (req.body.styleType != null) {
      const styleType = normalizePublicationStyleType(req.body.styleType);
      if (!styleType) {
        return res.status(400).json({ message: "Type de réalisation invalide." });
      }
      rows[idx].styleType = styleType;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "photoUrl")) {
      const photoUrl = String(req.body.photoUrl || "").trim();
      if (!photoUrl) return res.status(400).json({ message: "La photo est requise." });
      rows[idx].photoUrl = photoUrl;
    }
    await writePublications(rows);
    return res.json({ publication: rows[idx] });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

app.delete("/api/publications/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const authorUid = String(req.body?.authorUid || req.query?.authorUid || "").trim();
    if (!id || !authorUid) {
      return res.status(400).json({ message: "id et authorUid requis." });
    }
    const rows = await readPublications();
    const idx = rows.findIndex((p) => String(p.id) === id);
    if (idx === -1) {
      return res.status(404).json({ message: "Publication introuvable." });
    }
    if (String(rows[idx].authorUid) !== authorUid) {
      return res.status(403).json({ message: "Suppression non autorisée." });
    }
    rows.splice(idx, 1);
    await writePublications(rows);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ code: "internal/error", message: error.message });
  }
});

/** Vérifier quelle version tourne en prod (commit Render ou local). */
app.get("/api/version", (_req, res) => {
  res.json({
    app: "HairConnect",
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "dev-local",
    builtAt: new Date().toISOString()
  });
});

app.use((req, res, next) => {
  const p = String(req.path || "");
  if (p === "/" || p.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(express.static("."));

app.listen(port, () => {
  console.log(`HairConnect backend running on http://localhost:${port}`);
  warnIfPrismaClientStale();
  const intervalMs = Number(process.env.RDV_REMINDER_INTERVAL_MS || 10 * 60 * 1000);
  setInterval(() => {
    sendRdv24hReminders().catch((err) => console.error("[rdv-reminder]", err));
  }, intervalMs);
  setTimeout(() => {
    sendRdv24hReminders().catch((err) => console.error("[rdv-reminder]", err));
  }, 12_000);
});
