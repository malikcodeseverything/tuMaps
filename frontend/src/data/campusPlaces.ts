import type { Place, PlaceKind } from "@/types";

type Entry = [name: string, detail: string, lat: number, lng: number, aliases?: string[]];

// Temple campus and nearby places, matched instantly as the user types.
// Coordinates come from OpenStreetMap (Nov 2026); routes snap them to the
// nearest walkable path. Everything here is inside the routable area.
// To add a place, add one line to the right section.
const SECTIONS: Array<[PlaceKind, Entry[]]> = [
  ["campus", [
    // Landmarks and student life
    ["Charles Library", "Library", 39.982148, -75.155368, ["library"]],
    ["Bell Tower", "Landmark", 39.981365, -75.154368],
    ["Howard Gittis Student Center", "Student center", 39.979356, -75.154976, ["student center", "sac"]],
    ["Founder's Garden", "Garden", 39.981218, -75.155571],
    ["Johnny Ring Garden", "Garden", 39.982509, -75.15657],
    ["Lenfest Circle", "Plaza", 39.981336, -75.154419],

    // Academic buildings
    ["Alter Hall", "Fox School of Business", 39.980289, -75.155809, ["fox"]],
    ["Speakman Hall", "Fox School of Business", 39.980743, -75.155709, ["fox"]],
    ["Tuttleman Learning Center", "Classrooms", 39.980342, -75.154568, ["ttlc"]],
    ["TECH Center", "Computer labs", 39.980117, -75.153139, ["tech"]],
    ["Science Education and Research Center", "Science building", 39.981772, -75.153036, ["serc"]],
    ["Engineering Building", "College of Engineering", 39.982397, -75.152766],
    ["Biology-Life Sciences Building", "Science building", 39.98194, -75.153682, ["bio life"]],
    ["Beury Hall", "Science building", 39.982235, -75.154432],
    ["Paley Hall", "Academic building", 39.980922, -75.154346, ["paley library"]],
    ["Gladfelter Hall", "Academic building", 39.981345, -75.152585],
    ["Anderson Hall", "Academic building", 39.980841, -75.152645],
    ["Annenberg Hall", "Academic building", 39.983977, -75.15496],
    ["Tyler School of Art", "Art and architecture", 39.983538, -75.153537, ["tyler"]],
    ["Architecture Building", "Art and architecture", 39.983593, -75.154179],
    ["Presser Hall", "Boyer College of Music", 39.983226, -75.154289, ["boyer"]],
    ["Tomlinson and Randall Theaters", "Theaters", 39.983471, -75.155072],
    ["Temple Performing Arts Center", "Venue", 39.981442, -75.156813, ["tpac"]],
    ["Mitten Hall", "Event space", 39.982059, -75.156652],
    ["Conwell Hall", "Administration", 39.98034, -75.157015],
    ["Carnell Hall", "Administration", 39.980526, -75.156913],
    ["Wachman Hall", "Academic building", 39.98084, -75.156966],
    ["Sullivan Hall", "Administration", 39.981315, -75.156311],
    ["Barrack Hall", "Academic building", 39.981117, -75.156859],
    ["Shusterman Hall", "Academic building", 39.981056, -75.156364],
    ["1810 Liacouras Walk", "Academic building", 39.980446, -75.156484],
    ["Klein Law Building", "Beasley School of Law", 39.979864, -75.156935, ["law school", "beasley"]],
    ["Ritter Hall", "Academic building", 39.979372, -75.155973],
    ["Weiss Hall", "Academic building", 39.978621, -75.15529],
    ["Pearson and McGonigle Halls", "Athletics", 39.980839, -75.158345, ["pearson", "mcgonigle"]],

    // Venues and athletics
    ["Liacouras Center", "Arena", 39.97986, -75.158582],
    ["Geasey Field", "Athletic field", 39.982847, -75.159525],
    ["Edberg-Olson Hall", "Football facility", 39.984477, -75.150134],
    ["Temple Sports Complex", "Athletic fields", 39.972566, -75.157618],
    ["Student Pavilion", "Recreation", 39.982202, -75.158229],
  ]],

  ["gym", [
    ["IBC Student Recreation Center", "Temple gym", 39.979199, -75.158996, ["ibc", "rec center"]],
    ["STAR Complex", "Temple gym and fields", 39.9811, -75.159689, ["aramark star"]],
    ["Grind House", "Gym", 39.976772, -75.143391],
    ["Tufas Boulder Lounge", "Climbing gym", 39.975935, -75.143876, ["climbing", "bouldering"]],
    ["Will Power", "Gym", 39.972637, -75.141014],
    ["Anytime Fitness", "Gym, Fairmount", 39.967008, -75.165053],
    ["Yoga Habit", "Yoga studio, Fairmount", 39.966955, -75.165047, ["yoga"]],
    ["Lumos Yoga and Barre", "Yoga studio", 39.971037, -75.175696, ["yoga", "barre"]],
    ["Althea Gibson Tennis Center", "Tennis", 39.970421, -75.153847, ["tennis"]],
  ]],

  ["residence", [
    ["Morgan Hall", "Residence hall", 39.977875, -75.157386],
    ["1300 Residence Hall", "Residence hall", 39.977738, -75.15641, ["1300"]],
    ["Temple Towers", "Residence hall", 39.977925, -75.155],
    ["Johnson and Hardwick Halls", "Residence hall", 39.984028, -75.155836, ["j&h", "jh", "hardwick", "johnson"]],
    ["White Hall", "Residence hall", 39.985567, -75.156922],
    ["1940 Residence Hall", "Residence hall", 39.982862, -75.156242, ["1940"]],
    ["Kardon Atlantic Apartments", "Residence hall", 39.980322, -75.150097, ["kardon"]],
  ]],

  ["housing", [
    // Off-campus student apartments
    ["Vantage", "Apartments, 1717 N 12th St", 39.97857, -75.153278],
    ["The View", "Apartments, 12th and Montgomery", 39.979408, -75.153072, ["view at montgomery"]],
    ["University Village", "Apartments, 10th and Cecil B. Moore", 39.97882, -75.150579, ["uv"]],
    ["The Edge", "Apartments, 1601 N 15th St", 39.978033, -75.159428, ["avenue north"]],
    ["Oxford Village", "Apartments, 15th and Oxford", 39.97792, -75.160016],
    ["Beech International Village", "Apartments, 1520 Cecil B. Moore Ave", 39.978743, -75.160838, ["beech"]],
    ["Paseo Verde", "Apartments, 1900 N 9th St", 39.981422, -75.148965],
    ["Diamond Green Apartments", "Apartments, 1000 Diamond St", 39.983422, -75.150106],
  ]],

  ["grocery", [
    ["The Fresh Grocer", "Supermarket, 1501 N Broad St", 39.976852, -75.15764, ["fresh grocer"]],
    ["City Market", "Supermarket, 2208 N Broad St", 39.986659, -75.156534],
    ["Cousin's Supermarket", "Supermarket", 39.980874, -75.144072, ["cousins"]],
    ["Grocery Outlet", "Supermarket, 1801 N American St", 39.978591, -75.138093],
    ["Aldi", "Supermarket, 1300 Fairmount Ave", 39.966044, -75.159773],
    ["Acme", "Supermarket, 180 W Girard Ave", 39.968898, -75.139123],
    ["Giant", "Supermarket, Northern Liberties", 39.96659, -75.140396],
    ["Cecil B. Moore Farmers Market", "Farmers market", 39.9785, -75.157908, ["farmers market"]],
  ]],

  ["pharmacy", [
    ["CVS Pharmacy", "Pharmacy, Cecil B. Moore Ave", 39.978428, -75.153807, ["cvs"]],
    ["Sunray Drugs", "Pharmacy, 1501 N Broad St", 39.976297, -75.157076],
  ]],

  ["store", [
    ["7-Eleven", "1912 Liacouras Walk", 39.982039, -75.156057, ["711", "seven eleven"]],
    ["7-Eleven", "1501 Cecil B. Moore Ave", 39.979011, -75.159608, ["711", "seven eleven"]],
    ["7-Eleven", "2034 N Broad St", 39.984504, -75.157092, ["711", "seven eleven"]],
    ["Dollar Tree", "1100 W Girard Ave", 39.970547, -75.155074],
    ["Post Office", "USPS", 39.979523, -75.154756, ["usps", "mail"]],
    ["AMC Broadstreet 7", "Movie theater", 39.977496, -75.158479, ["movies", "cinema"]],
  ]],

  ["food", [
    ["Starbucks", "Coffee, 1755 N 13th St", 39.979488, -75.154858, ["coffee"]],
    ["Saxbys", "Coffee, Liacouras Walk", 39.981662, -75.156078, ["coffee"]],
    ["Dunkin'", "Coffee, Cecil B. Moore Ave", 39.978714, -75.15896, ["dunkin", "coffee"]],
    ["Honeygrow", "Restaurant, 1601 N Broad St", 39.978472, -75.157466],
    ["Insomnia Cookies", "Dessert", 39.978463, -75.157375, ["cookies"]],
    ["Owl's Nest", "Restaurant, 2010 N Broad St", 39.9837, -75.15719],
    ["McDonald's", "2109 N Broad St", 39.985222, -75.156016, ["mcdonalds"]],
    ["Food trucks on 12th Street", "Food trucks, 12th and Norris", 39.982792, -75.153433, ["trucks"]],
  ]],

  ["safety", [
    ["Temple University Police", "Campus safety", 39.979718, -75.152924, ["campus safety", "tupd", "police"]],
    ["22nd Police District", "Philadelphia Police, 1727 N 17th St", 39.980542, -75.162098, ["police"]],
  ]],

  ["transit", [
    ["Temple University Station", "SEPTA Regional Rail", 39.981584, -75.14952, ["septa", "train", "regional rail"]],
    ["Cecil B. Moore Station", "SEPTA Broad Street Line", 39.97857, -75.157901, ["septa", "subway", "bsl"]],
    ["Susquehanna-Dauphin Station", "SEPTA Broad Street Line", 39.987096, -75.156042, ["septa", "subway", "bsl"]],
    ["Girard Station", "SEPTA Broad Street Line", 39.971499, -75.15946, ["septa", "subway", "bsl"]],
    ["North Philadelphia Station", "SEPTA Broad Street Line", 39.994656, -75.154392, ["septa", "subway", "bsl"]],
    ["North Broad Station", "SEPTA Regional Rail", 39.992215, -75.153904, ["septa", "train", "regional rail"]],
  ]],

  ["parking", [
    ["Liacouras Garage", "Parking", 39.979875, -75.159759],
    ["Montgomery Garage", "Parking", 39.980199, -75.151704],
    ["Bell Garage", "Parking", 39.979917, -75.152476],
  ]],
];

// Typing one of these lists the whole category ("gym" shows every gym).
const KIND_TERMS: Partial<Record<PlaceKind, string[]>> = {
  gym: ["gym", "fitness", "workout"],
  residence: ["dorm", "residence", "housing"],
  housing: ["apartments", "housing", "off campus"],
  grocery: ["grocery", "groceries", "supermarket"],
  pharmacy: ["pharmacy", "drugstore", "medicine"],
  food: ["food", "eat", "restaurant"],
  safety: ["police", "safety"],
  transit: ["septa", "transit", "train", "subway"],
  parking: ["parking", "garage"],
};

export const CAMPUS_PLACES: Place[] = SECTIONS.flatMap(([kind, entries]) =>
  entries.map(([name, detail, lat, lng, aliases]) => ({
    id: `campus:${name}:${detail}`,
    name,
    detail,
    center: [lng, lat] as [number, number],
    source: "campus" as const,
    kind,
    aliases: aliases ?? [],
  })),
);

/** Shown when a search box is focused but empty. */
export const QUICK_PICKS: Place[] = [
  "Charles Library",
  "Howard Gittis Student Center",
  "Bell Tower",
  "The Fresh Grocer",
  "Temple University Station",
].map((n) => CAMPUS_PLACES.find((p) => p.name === n)!);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// List order doubles as priority on ties: campus before far-off places.
const INDEX = CAMPUS_PLACES.map((p, order) => ({
  place: p,
  order,
  name: normalize(p.name),
  aliases: p.aliases!.map(normalize),
  detail: normalize(p.detail),
  kindTerms: (KIND_TERMS[p.kind!] ?? []).map(normalize),
}));

/**
 * Rank places for a query: name or alias prefix, then a word in the name
 * starting with the query, then a category word ("gym", "grocery"), then the
 * query appearing anywhere. Every query word must match somewhere.
 */
export function searchCampus(query: string, limit = 6): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");

  const scored: Array<{ place: Place; score: number; order: number }> = [];
  for (const e of INDEX) {
    const haystack = `${e.name} ${e.aliases.join(" ")} ${e.detail} ${e.kindTerms.join(" ")}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    let score = 1;
    const nameWords = e.name.split(" ");
    if (e.name.startsWith(q) || e.aliases.some((a) => a.startsWith(q))) score = 5;
    else if (nameWords.some((w) => w.startsWith(words[0]))) score = 4;
    else if (q.length >= 3 && e.kindTerms.some((t) => t.startsWith(q))) score = 3;
    else if (`${e.name} ${e.aliases.join(" ")}`.includes(q)) score = 2;
    scored.push({ place: e.place, score, order: e.order });
  }

  // Loose matches (score 1, e.g. "broad" inside "SEPTA Broad Street Line")
  // are capped, so typing "broad" still leaves room for Broad Street addresses.
  let looseMatches = 0;
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .filter((s) => s.score > 1 || ++looseMatches <= 2)
    .slice(0, limit)
    .map((s) => s.place);
}
