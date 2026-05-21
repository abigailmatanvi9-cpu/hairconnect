/** Indicatifs et règles de numéros (chiffres nationaux sans le 0 initial). */
export const PHONE_COUNTRIES = [
    { iso: "TG", name: "Togo", dial: "+228", digits: 8, pattern: /^[2-9]\d{7}$/, example: "90 12 34 56" },
    { iso: "BJ", name: "Bénin", dial: "+229", digits: 8, pattern: /^[2-9]\d{7}$/, example: "90 12 34 56" },
    { iso: "GH", name: "Ghana", dial: "+233", digits: 9, pattern: /^[2-9]\d{8}$/, example: "24 123 4567" },
    { iso: "CI", name: "Côte d’Ivoire", dial: "+225", digits: 10, pattern: /^[0-9]{10}$/, example: "07 12 34 56 78" },
    { iso: "BF", name: "Burkina Faso", dial: "+226", digits: 8, pattern: /^[2-9]\d{7}$/, example: "70 12 34 56" },
    { iso: "SN", name: "Sénégal", dial: "+221", digits: 9, pattern: /^[3-9]\d{8}$/, example: "77 123 45 67" },
    { iso: "ML", name: "Mali", dial: "+223", digits: 8, pattern: /^[2-9]\d{7}$/, example: "65 12 34 56" },
    { iso: "NE", name: "Niger", dial: "+227", digits: 8, pattern: /^[2-9]\d{7}$/, example: "90 12 34 56" },
    { iso: "GN", name: "Guinée", dial: "+224", digits: 9, pattern: /^[2-9]\d{8}$/, example: "621 12 34 56" },
    { iso: "CM", name: "Cameroun", dial: "+237", digits: 9, pattern: /^[2-9]\d{8}$/, example: "6 12 34 56 78" },
    { iso: "FR", name: "France", dial: "+33", digits: 9, pattern: /^[1-9]\d{8}$/, example: "6 12 34 56 78" },
    { iso: "BE", name: "Belgique", dial: "+32", digits: 9, pattern: /^[1-9]\d{8}$/, example: "470 12 34 56" },
    { iso: "US", name: "États-Unis", dial: "+1", digits: 10, pattern: /^[2-9]\d{9}$/, example: "202 555 0123" }
];

export const DEFAULT_PHONE_COUNTRY_ISO = "TG";

const BY_ISO = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));
const BY_DIAL_DESC = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function getPhoneCountry(iso) {
    return BY_ISO.get(String(iso || "").trim().toUpperCase()) || BY_ISO.get(DEFAULT_PHONE_COUNTRY_ISO);
}

export function digitsOnly(raw) {
    return String(raw || "").replace(/\D/g, "");
}

/** Retire espaces/tirets et un 0 de tête en format local. */
export function normalizeNationalDigits(iso, raw) {
    let d = digitsOnly(raw);
    const country = getPhoneCountry(iso);
    if (!d) return "";
    if (d.startsWith("0") && d.length === country.digits + 1) {
        d = d.slice(1);
    }
    return d;
}

export function validatePhoneNational(iso, rawNational) {
    const country = getPhoneCountry(iso);
    const national = normalizeNationalDigits(iso, rawNational);
    if (!national) {
        return { ok: true, iso: country.iso, national: "", e164: null, message: "" };
    }
    if (national.length !== country.digits) {
        return {
            ok: false,
            iso: country.iso,
            national,
            e164: null,
            message: `Pour ${country.name} (${country.dial}), saisissez ${country.digits} chiffres (ex. ${country.example}).`
        };
    }
    if (!country.pattern.test(national)) {
        return {
            ok: false,
            iso: country.iso,
            national,
            e164: null,
            message: `Numéro invalide pour ${country.name}. Exemple : ${country.example}.`
        };
    }
    return {
        ok: true,
        iso: country.iso,
        national,
        e164: `${country.dial}${national}`,
        message: ""
    };
}

export function parseStoredPhone(stored, defaultIso = DEFAULT_PHONE_COUNTRY_ISO) {
    const s = String(stored || "").trim();
    if (!s) {
        const c = getPhoneCountry(defaultIso);
        return { ok: true, iso: c.iso, national: "", e164: null };
    }
    const compact = s.replace(/[\s().-]/g, "");
    if (compact.startsWith("+")) {
        for (const country of BY_DIAL_DESC) {
            if (compact.startsWith(country.dial)) {
                const national = compact.slice(country.dial.length);
                return validatePhoneNational(country.iso, national);
            }
        }
        return {
            ok: false,
            iso: defaultIso,
            national: "",
            e164: null,
            message: "Indicatif pays non reconnu. Choisissez le pays dans la liste."
        };
    }
    const nationalOnly = normalizeNationalDigits(defaultIso, compact);
    return validatePhoneNational(defaultIso, nationalOnly);
}

export function validateE164Phone(stored) {
    return parseStoredPhone(stored);
}

export function formatPhoneDisplay(stored) {
    const parsed = parseStoredPhone(stored);
    if (!parsed.ok || !parsed.e164) return String(stored || "").trim() || "—";
    const country = getPhoneCountry(parsed.iso);
    const national = parsed.national;
    const grouped = national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    return `${country.dial} ${grouped}`;
}

export function fillPhoneCountrySelect(selectEl, selectedIso = DEFAULT_PHONE_COUNTRY_ISO) {
    if (!selectEl) return;
    const iso = String(selectedIso || DEFAULT_PHONE_COUNTRY_ISO).toUpperCase();
    selectEl.innerHTML = "";
    for (const c of PHONE_COUNTRIES) {
        const opt = document.createElement("option");
        opt.value = c.iso;
        opt.textContent = `${c.dial} ${c.name}`;
        if (c.iso === iso) opt.selected = true;
        selectEl.appendChild(opt);
    }
}

export function updatePhoneHint(hintEl, iso) {
    if (!hintEl) return;
    const c = getPhoneCountry(iso);
    hintEl.textContent = `Format ${c.name} : ${c.digits} chiffres après ${c.dial} (ex. ${c.example}).`;
}

export function initPhoneField({ countrySelect, nationalInput, hintEl, storedPhone, defaultIso = DEFAULT_PHONE_COUNTRY_ISO }) {
    const parsed = parseStoredPhone(storedPhone, defaultIso);
    const iso = parsed.ok ? parsed.iso : defaultIso;
    fillPhoneCountrySelect(countrySelect, iso);
    if (nationalInput) {
        nationalInput.value = parsed.national || "";
        nationalInput.placeholder = getPhoneCountry(iso).example;
        nationalInput.setAttribute("inputmode", "numeric");
        nationalInput.setAttribute("autocomplete", "tel-national");
    }
    updatePhoneHint(hintEl, iso);
    if (!countrySelect || countrySelect.dataset.phoneBound) return;
    countrySelect.dataset.phoneBound = "1";
    countrySelect.addEventListener("change", () => {
        const nextIso = countrySelect.value;
        updatePhoneHint(hintEl, nextIso);
        if (nationalInput) nationalInput.placeholder = getPhoneCountry(nextIso).example;
    });
}

export function readPhoneFromField(countrySelect, nationalInput) {
    const iso = countrySelect ? countrySelect.value : DEFAULT_PHONE_COUNTRY_ISO;
    const raw = nationalInput ? nationalInput.value : "";
    return validatePhoneNational(iso, raw);
}
