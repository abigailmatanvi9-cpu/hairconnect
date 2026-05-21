/** Villes et quartiers proposés (Togo / zone HairConnect) — même logique que le sélecteur téléphone. */
export const LOCATION_OTHER = "__other__";

export const HAIRCONNECT_CITIES = [
    "Lomé",
    "Kara",
    "Sokodé",
    "Atakpamé",
    "Kpalimé",
    "Tsévié",
    "Dapaong",
    "Aného",
    "Mango",
    "Bassar"
];

/** Quartiers par ville (liste non exhaustive, extensible via « Autre »). */
export const QUARTIERS_BY_CITY = {
    Lomé: [
        "Tokoin",
        "Bè",
        "Adidogomé",
        "Amoutivé",
        "Agbalépédogané",
        "Djidjolé",
        "Gbossimé",
        "Hédzranawoe",
        "Kégué",
        "Nyékonakpoé",
        "Agoè",
        "Ablomé",
        "Centre-ville",
        "Port / zone portuaire"
    ],
    Kara: ["Centre-ville", "Kozah", "Pya", "Niamtougou (zone)"],
    Sokodé: ["Centre-ville", "Tchaoudjo", "Tchamba (zone)"],
    Atakpamé: ["Centre-ville", "Blitta (zone)", "Danyi (zone)"],
    Kpalimé: ["Centre-ville", "Kloto", "Kpélé (zone)"],
    Tsévié: ["Centre-ville", "Zio"],
    Dapaong: ["Centre-ville", "Cinkassé (zone)"],
    Aného: ["Centre-ville", "Bouche du Roy"],
    Mango: ["Centre-ville"],
    Bassar: ["Centre-ville"]
};

const DEFAULT_QUARTIERS = ["Centre-ville"];

function normKey(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
}

function findCityKey(city) {
    const n = normKey(city);
    if (!n) return null;
    for (const c of HAIRCONNECT_CITIES) {
        if (normKey(c) === n) return c;
    }
    return null;
}

function findQuartierKey(cityKey, quartier) {
    const list = QUARTIERS_BY_CITY[cityKey] || DEFAULT_QUARTIERS;
    const n = normKey(quartier);
    if (!n) return null;
    for (const q of list) {
        if (normKey(q) === n) return q;
    }
    return null;
}

export function fillCitySelect(selectEl, selectedCity = "") {
    if (!selectEl) return;
    const known = findCityKey(selectedCity);
    const other = selectedCity && !known ? String(selectedCity).trim() : "";
    selectEl.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Choisir une ville…";
    selectEl.appendChild(empty);
    for (const city of HAIRCONNECT_CITIES) {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = city;
        if (known === city) opt.selected = true;
        selectEl.appendChild(opt);
    }
    const otherOpt = document.createElement("option");
    otherOpt.value = LOCATION_OTHER;
    otherOpt.textContent = "Autre ville (saisir)";
    if (other) otherOpt.selected = true;
    selectEl.appendChild(otherOpt);
    return { known, other };
}

export function fillQuartierSelect(selectEl, cityKey, selectedQuartier = "") {
    if (!selectEl) return { known: null, other: "" };
    const list =
        cityKey && cityKey !== LOCATION_OTHER
            ? QUARTIERS_BY_CITY[cityKey] || DEFAULT_QUARTIERS
            : [];
    const known = cityKey && cityKey !== LOCATION_OTHER ? findQuartierKey(cityKey, selectedQuartier) : null;
    const other =
        selectedQuartier && cityKey && cityKey !== LOCATION_OTHER && !known
            ? String(selectedQuartier).trim()
            : cityKey === LOCATION_OTHER
              ? String(selectedQuartier || "").trim()
              : "";
    selectEl.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = cityKey ? "Choisir un quartier…" : "Choisissez d’abord une ville";
    selectEl.appendChild(empty);
    if (!cityKey || cityKey === LOCATION_OTHER) {
        selectEl.disabled = true;
        return { known: null, other };
    }
    selectEl.disabled = false;
    for (const q of list) {
        const opt = document.createElement("option");
        opt.value = q;
        opt.textContent = q;
        if (known === q) opt.selected = true;
        selectEl.appendChild(opt);
    }
    const otherOpt = document.createElement("option");
    otherOpt.value = LOCATION_OTHER;
    otherOpt.textContent = "Autre quartier (saisir)";
    if (other) otherOpt.selected = true;
    selectEl.appendChild(otherOpt);
    return { known, other };
}

function syncOtherVisibility(citySelect, cityOtherWrap, cityOtherInput, quartierSelect, quartierOtherWrap, quartierOtherInput) {
    const cityIsOther = citySelect && citySelect.value === LOCATION_OTHER;
    const quartIsOther = quartierSelect && quartierSelect.value === LOCATION_OTHER;
    if (cityOtherWrap) cityOtherWrap.hidden = !cityIsOther;
    if (cityOtherInput) {
        cityOtherInput.required = Boolean(cityIsOther);
        if (!cityIsOther) cityOtherInput.value = "";
    }
    if (quartierOtherWrap) quartierOtherWrap.hidden = !quartIsOther;
    if (quartierOtherInput) {
        quartierOtherInput.required = Boolean(quartIsOther);
        if (!quartIsOther) quartierOtherInput.value = "";
    }
}

export function setLocationValues(
    { citySelect, quartierSelect, cityOtherInput, quartierOtherInput },
    { city = "", quartier = "" } = {}
) {
    const cityStr = String(city || "").trim();
    const quartStr = String(quartier || "").trim();
    const { other: cityOtherVal } = fillCitySelect(citySelect, cityStr);
    if (cityOtherInput && cityOtherVal) cityOtherInput.value = cityOtherVal;
    const cityKey = citySelect ? citySelect.value : "";
    const effectiveCityKey =
        cityKey === LOCATION_OTHER ? LOCATION_OTHER : findCityKey(cityStr) || cityKey;
    const { other: quartOtherVal } = fillQuartierSelect(
        quartierSelect,
        effectiveCityKey && effectiveCityKey !== "" ? effectiveCityKey : null,
        quartStr
    );
    if (quartierOtherInput && quartOtherVal) quartierOtherInput.value = quartOtherVal;
}

export function initLocationFields({
    citySelect,
    quartierSelect,
    cityOtherWrap,
    cityOtherInput,
    quartierOtherWrap,
    quartierOtherInput,
    storedCity = "",
    storedQuartier = ""
}) {
    setLocationValues(
        { citySelect, quartierSelect, cityOtherInput, quartierOtherInput },
        { city: storedCity, quartier: storedQuartier }
    );
    syncOtherVisibility(
        citySelect,
        cityOtherWrap,
        cityOtherInput,
        quartierSelect,
        quartierOtherWrap,
        quartierOtherInput
    );

    if (!citySelect || citySelect.dataset.locationBound) return;
    citySelect.dataset.locationBound = "1";

    citySelect.addEventListener("change", () => {
        const key =
            citySelect.value === LOCATION_OTHER ? LOCATION_OTHER : findCityKey(citySelect.value) || citySelect.value;
        fillQuartierSelect(quartierSelect, key || null, "");
        if (quartierOtherInput) quartierOtherInput.value = "";
        syncOtherVisibility(
            citySelect,
            cityOtherWrap,
            cityOtherInput,
            quartierSelect,
            quartierOtherWrap,
            quartierOtherInput
        );
    });

    if (quartierSelect && !quartierSelect.dataset.locationBound) {
        quartierSelect.dataset.locationBound = "1";
        quartierSelect.addEventListener("change", () => {
            syncOtherVisibility(
                citySelect,
                cityOtherWrap,
                cityOtherInput,
                quartierSelect,
                quartierOtherWrap,
                quartierOtherInput
            );
        });
    }
}

export function readLocationFromFields({
    citySelect,
    quartierSelect,
    cityOtherInput,
    quartierOtherInput
}) {
    if (!citySelect) {
        return { ok: false, city: "", quartier: "", message: "Sélecteur ville manquant." };
    }
    const cityVal = String(citySelect.value || "").trim();
    if (!cityVal) {
        return { ok: false, city: "", quartier: "", message: "Choisissez une ville." };
    }
    let city = "";
    if (cityVal === LOCATION_OTHER) {
        city = cityOtherInput ? String(cityOtherInput.value || "").trim() : "";
        if (!city) {
            return { ok: false, city: "", quartier: "", message: "Indiquez le nom de la ville." };
        }
    } else {
        city = cityVal;
    }

    if (!quartierSelect) {
        return { ok: false, city, quartier: "", message: "Sélecteur quartier manquant." };
    }
    const quartVal = String(quartierSelect.value || "").trim();
    if (!quartVal) {
        return { ok: false, city, quartier: "", message: "Choisissez un quartier." };
    }
    let quartier = "";
    if (quartVal === LOCATION_OTHER) {
        quartier = quartierOtherInput ? String(quartierOtherInput.value || "").trim() : "";
        if (!quartier) {
            return { ok: false, city, quartier: "", message: "Indiquez le nom du quartier." };
        }
    } else {
        quartier = quartVal;
    }

    return { ok: true, city, quartier, message: "" };
}
