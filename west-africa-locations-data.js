/** Quartiers génériques pour les villes sans découpage détaillé. */
export const GENERIC_QUARTIERS = [
    "Centre-ville",
    "Marché central",
    "Zone résidentielle nord",
    "Zone résidentielle sud",
    "Zone industrielle",
    "Périphérie"
];

function city(name, quartiers) {
    return { city: name, quartiers: quartiers || [...GENERIC_QUARTIERS] };
}

/** Villes et quartiers par code ISO (Afrique de l’Ouest). */
export const LOCATION_DATA_BY_ISO = {
    TG: [
        city("Lomé", [
            "Ablogamé", "Adablui", "Adakpamé", "Adidogomé", "Agbadahonou", "Agbalépédogan",
            "Akodésséwa", "Amoutivé", "Anfamé", "Atikoumé", "Avénou", "Baguida", "Bé",
            "Bowodé", "Casablanca", "Cacaveli", "Dékon", "Dogbéavou", "Dzifa", "Gbényédzi",
            "Hanoukopé", "Kégué", "Klikamé", "Kodjoviakopé", "Koukongu", "Lomé II", "Nukafu",
            "Nyékonakpoé", "Opposition", "Plage", "Quartier administratif", "Sagbado",
            "Saint-Joseph", "Soviépé", "Tokoin", "Totsi", "Zongo", "Zone portuaire"
        ]),
        city("Agoè", ["Agoè centre", "Agoè nord", "Agoè sud", "Hédzranawoe", "Vakpossito"]),
        city("Adétikopé", ["Adétikopé centre", "Adétikopé nord", "Adétikopé sud"]),
        city("Baguida", ["Baguida centre", "Baguida plage"]),
        city("Tsévié", ["Centre-ville", "Gblainvié", "Kpovié", "Mission-Tové", "Zongo"]),
        city("Aného", ["Centre-ville", "Gbedzeme", "Zébé", "Aného plage"]),
        city("Tabligbo", ["Centre-ville", "Agbodji", "Kpélé"]),
        city("Vogan", ["Centre-ville", "Afanyagan", "Zèvémé"]),
        city("Afagnan", ["Centre-ville", "Agbodrafo", "Aného route"]),
        city("Kpalimé", ["Centre-ville", "Kpégoudou", "Agomé-Yoh", "Tomégbé", "Kpadapé"]),
        city("Atakpamé", ["Centre-ville", "Assivito", "Kamina", "Dida"]),
        city("Badou", ["Centre-ville", "Kpaza", "Kévé route"]),
        city("Notsé", ["Centre-ville", "Hahotoé", "Kpémé"]),
        city("Anié", ["Centre-ville", "Kpélé", "Adéta route"]),
        city("Sokodé", ["Centre-ville", "Tchitchao", "Komah", "Kopébé", "Didaouré", "Kpangalam"]),
        city("Tchamba", ["Centre-ville", "Koussountou", "Larini"]),
        city("Sotouboua", ["Centre-ville", "Kombonloaga", "Tchalo"]),
        city("Blitta", ["Centre-ville", "Tchifama", "Kpaza route"]),
        city("Kara", ["Centre-ville", "Kozah", "Pia", "Lama", "Tomdè"]),
        city("Bassar", ["Centre-ville", "Kabou", "Dimouri", "Banger"]),
        city("Niamtougou", ["Centre-ville", "Kara route", "Djarkpanga"]),
        city("Bafilo", ["Centre-ville", "Kara route", "Alédjo"]),
        city("Pagouda", ["Centre-ville", "Kétao route"]),
        city("Dapaong", ["Centre-ville", "Nano", "Cinkassé route", "Gando route"]),
        city("Mango", ["Centre-ville", "Tandjouaré route", "Cinkassé route"]),
        city("Mandouri", ["Centre-ville", "Frontière Bénin"]),
        city("Cinkassé", ["Centre-ville", "Burkina route"]),
        city("Gando", ["Centre-ville", "Dapaong route"]),
        city("Boufale", ["Centre-ville"]),
        city("Kande", ["Centre-ville", "Kara route"]),
        city("Elavagnon", ["Centre-ville"]),
        city("Kévé", ["Centre-ville", "Badou route"]),
        city("Agou", ["Centre-ville", "Kpalimé route"]),
        city("Kati", ["Centre-ville"]),
        city("Tandjouaré", ["Centre-ville", "Mango route"])
    ],
    SN: [
        city("Dakar", [
            "Plateau", "Médina", "Grand Dakar", "Parcelles Assainies", "Almadies", "Ouakam",
            "Yoff", "Mermoz", "Fann", "Point E", "Liberté 6", "HLM", "Pikine extension"
        ]),
        city("Pikine", ["Centre-ville", "Thiaroye", "Guinaw Rails", "Djiddah", "Icotaf"]),
        city("Guédiawaye", ["Centre-ville", "Wakhinane", "Médina Gounass", "Sahm"]),
        city("Rufisque", ["Centre-ville", "Bargny", "Sangalkam", "Yène"]),
        city("Thiès", ["Centre-ville", "Randoulène", "Lakhyata", "Cité Malick Sy"]),
        city("Mbour", ["Centre-ville", "Saly", "Somone", "Joal-Fadiouth"]),
        city("Saint-Louis", ["Centre-ville", "Sor", "Ndar Toute", "Hydrobase"]),
        city("Kaolack", ["Centre-ville", "Ndoffane", "Kahone"]),
        city("Touba", ["Centre-ville", "Darou Minam", "Barkel"]),
        city("Ziguinchor", ["Centre-ville", "Kandé", "Bignona route"]),
        city("Louga", ["Centre-ville", "Keur Momar Sarr"]),
        city("Tambacounda", ["Centre-ville", "Bakel route"]),
        city("Kolda", ["Centre-ville", "Vélingara route"]),
        city("Diourbel", ["Centre-ville", "Bambey route"]),
        city("Fatick", ["Centre-ville", "Foundiougne"])
    ],
    CI: [
        city("Abidjan", [
            "Plateau", "Cocody", "Riviera", "Yopougon", "Marcory", "Treichville", "Adjamé",
            "Koumassi", "Port-Bouët", "Attécoubé", "Abobo", "Anyama", "Bingerville"
        ]),
        city("Bouaké", ["Centre-ville", "Air France", "Brobo", "Koko"]),
        city("Yamoussoukro", ["Centre-ville", "Habitat", "Koumassou", "N'Gattakro"]),
        city("Daloa", ["Centre-ville", "Lobia", "Tazibou"]),
        city("San-Pédro", ["Centre-ville", "Bardot", "Séwéké"]),
        city("Korhogo", ["Centre-ville", "Petit Paris", "Résidentiel"]),
        city("Man", ["Centre-ville", "Liberté", "Gbonné"]),
        city("Gagnoa", ["Centre-ville", "Ouarégou"]),
        city("Divo", ["Centre-ville", "Chiépo"]),
        city("Abengourou", ["Centre-ville", "Amelekia"]),
        city("Bondoukou", ["Centre-ville", "Laoudi-Ba"]),
        city("Odienné", ["Centre-ville", "Bako"])
    ],
    GH: [
        city("Accra", [
            "Osu", "Labadi", "Adabraka", "Cantonments", "East Legon", "Madina", "Tema route",
            "Jamestown", "Usshertown", "Airport Residential", "Achimota", "Dansoman"
        ]),
        city("Kumasi", ["Centre-ville", "Asokwa", "Bantama", "Suame", "Ahodwo", "Kejetia"]),
        city("Tamale", ["Centre-ville", "Lamashegu", "Sagnarigu", "Aboabo"]),
        city("Takoradi", ["Centre-ville", "Sekondi", "Effia", "Kwesimintsim"]),
        city("Cape Coast", ["Centre-ville", "Kotokuraba", "University area"]),
        city("Tema", ["Centre-ville", "Community 1", "Community 25", "Harbour area"]),
        city("Sunyani", ["Centre-ville", "New Dormaa"]),
        city("Ho", ["Centre-ville", "Bankoe"]),
        city("Koforidua", ["Centre-ville", "Effiduase"]),
        city("Wa", ["Centre-ville", "Jengboto"]),
        city("Bolgatanga", ["Centre-ville", "Zuarungu"])
    ],
    BJ: [
        city("Cotonou", [
            "Ganhi", "Cadjehoun", "Akpakpa", "Fidjrossè", "Godomey route", "Saint-Michel",
            "Zongo", "Agla", "Vedoko", "Fidjrossè plage"
        ]),
        city("Porto-Novo", ["Centre-ville", "Ouando", "Avassa", "Tokpota"]),
        city("Parakou", ["Centre-ville", "Albarika", "Guema", "Zongo"]),
        city("Abomey-Calavi", ["Centre-ville", "Godomey", "Calavi", "Togba"]),
        city("Djougou", ["Centre-ville", "Bakabaka", "Barèi"]),
        city("Bohicon", ["Centre-ville", "Saclo", "Dassa route"]),
        city("Natitingou", ["Centre-ville", "Toucountouna route"]),
        city("Lokossa", ["Centre-ville", "Comè route"]),
        city("Ouidah", ["Centre-ville", "Plage", "Route des esclaves"]),
        city("Kandi", ["Centre-ville", "Frontière Niger"])
    ],
    BF: [
        city("Ouagadougou", [
            "Centre-ville", "Zogona", "Cissin", "Dassasgho", "Gounghin", "Paspanga",
            "Tampouy", "Saaba route", "Karpala", "Gounghin nord"
        ]),
        city("Bobo-Dioulasso", ["Centre-ville", "Koko", "Dafra", "Tondogousso", "Sarfalao"]),
        city("Koudougou", ["Centre-ville", "Nayiri", "Villy"]),
        city("Ouahigouya", ["Centre-ville", "Résidentiel"]),
        city("Banfora", ["Centre-ville", "Sindou route"]),
        city("Kaya", ["Centre-ville", "Pissila route"]),
        city("Tenkodogo", ["Centre-ville", "Bissiga"]),
        city("Fada N'Gourma", ["Centre-ville", "Gourmantché"]),
        city("Dédougou", ["Centre-ville", "Solenzo route"]),
        city("Gaoua", ["Centre-ville", "Poni"])
    ],
    ML: [
        city("Bamako", [
            "Badalabougou", "Hippodrome", "Hamdallaye", "ACI 2000", "Kalaban Coura",
            "Sotuba", "Niaréla", "Point G", "Faladié", "Banconi", "Djikoroni", "Magnambougou"
        ]),
        city("Sikasso", ["Centre-ville", "Médine", "Liberté", "Wayerma"]),
        city("Ségou", ["Centre-ville", "Sébougou route", "Pelengana"]),
        city("Mopti", ["Centre-ville", "Komoguel", "Sévaré"]),
        city("Kayes", ["Centre-ville", "Liberté", "Khoulouba"]),
        city("Gao", ["Centre-ville", "Château", "Sossokoira"]),
        city("Koutiala", ["Centre-ville", "N'Golobougou"]),
        city("San", ["Centre-ville", "Tominian route"]),
        city("Kidal", ["Centre-ville", "Anderamboukane route"]),
        city("Tombouctou", ["Centre-ville", "Abaradjou", "Sareyeh"])
    ],
    NE: [
        city("Niamey", [
            "Plateau", "Yantala", "Lazaret", "Terminus", "Gamkallé", "Katako", "Goudel",
            "Lamordé", "Talladjé", "Koiramé", "Riviera"
        ]),
        city("Zinder", ["Centre-ville", "Zengou", "Kandadji", "Birni"]),
        city("Maradi", ["Centre-ville", "Dan Goulbi", "Tchadoua route"]),
        city("Agadez", ["Centre-ville", "Tchirozerine", "Iferouane route"]),
        city("Tahoua", ["Centre-ville", "Kokorou", "Bambey route"]),
        city("Dosso", ["Centre-ville", "Gaya route", "Loga"]),
        city("Diffa", ["Centre-ville", "Bagara", "N'Guigmi route"]),
        city("Arlit", ["Centre-ville", "Akokan"]),
        city("Tillabéri", ["Centre-ville", "Sinder"])
    ],
    GN: [
        city("Conakry", [
            "Kaloum", "Dixinn", "Matam", "Ratoma", "Matoto", "Kagbelen", "Sonfonia",
            "Taouyah", "Boulbinet", "Coronthie"
        ]),
        city("Kankan", ["Centre-ville", "Kabadou", "Missamana route"]),
        city("Labé", ["Centre-ville", "Hafia", "Garambé"]),
        city("N'Zérékoré", ["Centre-ville", "Sérédou", "Gouécké route"]),
        city("Kindia", ["Centre-ville", "Damakanin"]),
        city("Mamou", ["Centre-ville", "Pita route"]),
        city("Boké", ["Centre-ville", "Kamsar", "Sangarédi route"]),
        city("Fria", ["Centre-ville", "Bauxite zone"]),
        city("Siguiri", ["Centre-ville", "Kouroussa route"])
    ],
    CM: [
        city("Douala", [
            "Bonanjo", "Akwa", "Bali", "Deido", "New Bell", "Bonabéri", "Logpom", "Makepe",
            "Kotto", "Bépanda", "PK", "Village"
        ]),
        city("Yaoundé", [
            "Centre-ville", "Bastos", "Mvan", "Emana", "Mvog-Ada", "Nlongkak", "Odza",
            "Mendong", "Essos", "Nkolbisson"
        ]),
        city("Garoua", ["Centre-ville", "Foulbéré", "Djamboutou"]),
        city("Bafoussam", ["Centre-ville", "Tamdja", "Famla"]),
        city("Bamenda", ["Centre-ville", "Mile 4", "Nkwen"]),
        city("Maroua", ["Centre-ville", "Doualaré", "Domayo"]),
        city("Buea", ["Centre-ville", "Molyko", "Bonduma"]),
        city("Limbe", ["Centre-ville", "Down Beach", "Mile 4"]),
        city("Kribi", ["Centre-ville", "Plage", "Londji"]),
        city("Ebolowa", ["Centre-ville", "Nko'ovos"])
    ]
};
