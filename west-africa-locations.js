import { LOCATION_DATA_BY_ISO } from "./west-africa-locations-data.js";
import { getPhoneCountry, DEFAULT_PHONE_COUNTRY_ISO } from "./phone-utils.js";

/** Pays d’Afrique de l’Ouest pour lesquels villes / quartiers sont renseignés. */
export const WEST_AFRICA_LOCATION_ISOS = Object.freeze(
    Object.keys(LOCATION_DATA_BY_ISO)
);

export function hasLocationData(iso) {
    return WEST_AFRICA_LOCATION_ISOS.includes(String(iso || "").trim().toUpperCase());
}

function normalizeKey(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
}

function getAreas(iso) {
    const key = String(iso || "").trim().toUpperCase();
    return LOCATION_DATA_BY_ISO[key] || [];
}

function buildCityIndex(iso) {
    const areas = getAreas(iso);
    const map = new Map();
    for (const a of areas) {
        map.set(normalizeKey(a.city), a);
    }
    return map;
}

/** Nom de ville reconnu dans la base (casse / accents tolérés). */
export function resolveCityName(iso, cityInput) {
    const key = normalizeKey(cityInput);
    if (!key || !hasLocationData(iso)) return null;
    const area = buildCityIndex(iso).get(key);
    return area ? area.city : null;
}

/** Villes proposées pour un pays. */
export function getCityNamesForCountry(iso) {
    if (!hasLocationData(iso)) return [];
    return getAreas(iso).map((a) => a.city);
}

/**
 * Quartiers de la ville choisie uniquement (liste vide si ville non reconnue).
 */
export function getQuartiersForCity(iso, cityName) {
    if (!hasLocationData(iso)) return [];
    const resolved = resolveCityName(iso, cityName);
    if (!resolved) return [];
    const area = buildCityIndex(iso).get(normalizeKey(resolved));
    return area ? [...area.quartiers] : [];
}

export function getDefaultCityForCountry(iso) {
    const cities = getCityNamesForCountry(iso);
    return cities[0] || "";
}

function fillDatalist(datalistEl, values) {
    if (!datalistEl) return;
    datalistEl.innerHTML = "";
    for (const v of values) {
        const opt = document.createElement("option");
        opt.value = v;
        datalistEl.appendChild(opt);
    }
}

function updateLocationHints(iso, { cityHintEl, quartierHintEl, cityInput }) {
    const country = getPhoneCountry(iso);
    const cityVal = cityInput ? String(cityInput.value || "").trim() : "";
    const resolved = resolveCityName(iso, cityVal);

    if (cityHintEl) {
        cityHintEl.textContent = hasLocationData(iso)
            ? `Villes du ${country.name} : tapez ou choisissez dans la liste. Saisie libre possible.`
            : "Pour les suggestions de villes, choisissez un pays d’Afrique de l’Ouest dans la liste téléphone (+228 Togo, +221 Sénégal, etc.).";
    }
    if (quartierHintEl) {
        if (!hasLocationData(iso)) {
            quartierHintEl.textContent = "Quartiers proposés après sélection d’un pays d’Afrique de l’Ouest.";
        } else if (!resolved) {
            quartierHintEl.textContent = cityVal
                ? "Choisissez une ville dans la liste pour voir ses quartiers, ou saisissez votre zone manuellement."
                : "Choisissez d’abord une ville : seuls les quartiers de cette ville seront proposés.";
        } else {
            quartierHintEl.textContent = `Quartiers de ${resolved} uniquement. Saisie libre possible.`;
        }
    }
}

/** Remplit un &lt;select&gt; avec les pays ayant des données de localisation. */
export function fillLocationCountrySelect(selectEl, selectedIso = DEFAULT_PHONE_COUNTRY_ISO) {
    if (!selectEl) return;
    const iso = String(selectedIso || DEFAULT_PHONE_COUNTRY_ISO).toUpperCase();
    selectEl.innerHTML = "";
    for (const code of WEST_AFRICA_LOCATION_ISOS) {
        const c = getPhoneCountry(code);
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = c.name;
        if (code === iso) opt.selected = true;
        selectEl.appendChild(opt);
    }
}

/**
 * Autocomplétion ville / quartier liée au pays (select téléphone ou pays dédié).
 * @returns {{ refresh: () => void, getCountryIso: () => string }}
 */
export function initLocationFields(cityInput, quartierInput, options = {}) {
    const prefix = options.idPrefix || "hc-loc";
    const countrySelect = options.countrySelect || null;
    const countryIso = options.countryIso || DEFAULT_PHONE_COUNTRY_ISO;
    const cityHintEl = options.cityHintEl || null;
    const quartierHintEl = options.quartierHintEl || null;

    let cityDl = null;
    let quartDl = null;

    if (cityInput) {
        const cityListId = `${prefix}-cities`;
        cityDl = document.getElementById(cityListId);
        if (!cityDl) {
            cityDl = document.createElement("datalist");
            cityDl.id = cityListId;
            document.body.appendChild(cityDl);
        }
        cityInput.setAttribute("list", cityListId);
    }

    if (quartierInput) {
        const quartListId = `${prefix}-quartiers`;
        quartDl = document.getElementById(quartListId);
        if (!quartDl) {
            quartDl = document.createElement("datalist");
            quartDl.id = quartListId;
            document.body.appendChild(quartDl);
        }
        quartierInput.setAttribute("list", quartListId);
    }

    const getCountryIso = () => {
        if (countrySelect && countrySelect.value) {
            return String(countrySelect.value).trim().toUpperCase();
        }
        return String(countryIso).trim().toUpperCase();
    };

    const refresh = () => {
        const iso = getCountryIso();
        const cities = getCityNamesForCountry(iso);
        fillDatalist(cityDl, cities);

        const cityVal = cityInput ? cityInput.value : "";
        const quartiers = getQuartiersForCity(iso, cityVal);
        fillDatalist(quartDl, quartiers);

        if (cityInput && hasLocationData(iso)) {
            const def = getDefaultCityForCountry(iso);
            if (def && !String(cityInput.placeholder || "").includes(def)) {
                cityInput.setAttribute("placeholder", `Ex. ${def}`);
            }
        }

        updateLocationHints(iso, { cityHintEl, quartierHintEl, cityInput });
    };

    refresh();

    if (cityInput) {
        cityInput.addEventListener("input", refresh);
        cityInput.addEventListener("change", refresh);
    }
    if (countrySelect && !countrySelect.dataset.locationBound) {
        countrySelect.dataset.locationBound = "1";
        countrySelect.addEventListener("change", refresh);
    }
    if (options.locCountrySelect && !options.locCountrySelect.dataset.locationBound) {
        options.locCountrySelect.dataset.locationBound = "1";
        options.locCountrySelect.addEventListener("change", refresh);
    }

    return { refresh, getCountryIso };
}
