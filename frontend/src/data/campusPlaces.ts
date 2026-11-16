import type { Place } from "@/types";

type Entry = [name: string, detail: string, lat: number, lng: number, aliases?: string[]];

// Temple main campus places, matched instantly as the user types.
// Coordinates are building centroids from OpenStreetMap (Nov 2026); routes snap
// them to the nearest walkable path. To add a place, add one line.
const ENTRIES: Entry[] = [
  // Landmarks and student life
  ["Charles Library", "Library", 39.982148, -75.155368, ["library"]],
  ["Bell Tower", "Landmark", 39.981365, -75.154368],
  ["Howard Gittis Student Center", "Student center", 39.979356, -75.154976, ["student center", "sac"]],
  ["Founder's Garden", "Garden", 39.981218, -75.155571],
  ["Johnny Ring Garden", "Garden", 39.982509, -75.15657],
  ["Lenfest Circle", "Plaza", 39.981336, -75.154419],
  ["Temple University Police", "Campus safety", 39.979718, -75.152924, ["campus safety", "tupd", "police"]],

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

  // Recreation and athletics
  ["Liacouras Center", "Arena", 39.97986, -75.158582],
  ["IBC Student Recreation Center", "Gym", 39.979199, -75.158996, ["ibc", "gym", "rec center"]],
  ["STAR Complex", "Gym and fields", 39.9811, -75.159689, ["aramark star"]],
  ["Geasey Field", "Athletic field", 39.982847, -75.159525],
  ["Edberg-Olson Hall", "Football facility", 39.984477, -75.150134],
  ["Temple Sports Complex", "Athletic fields", 39.972566, -75.157618],
  ["Student Pavilion", "Recreation", 39.982202, -75.158229],

  // Residence halls
  ["Morgan Hall", "Residence hall", 39.977875, -75.157386],
  ["1300 Residence Hall", "Residence hall", 39.977738, -75.15641, ["1300"]],
  ["Temple Towers", "Residence hall", 39.977925, -75.155],
  ["Johnson and Hardwick Halls", "Residence hall", 39.984028, -75.155836, ["j&h", "jh", "hardwick", "johnson"]],
  ["White Hall", "Residence hall", 39.985567, -75.156922],
  ["1940 Residence Hall", "Residence hall", 39.982862, -75.156242, ["1940"]],
  ["Kardon Atlantic Apartments", "Residence hall", 39.980322, -75.150097, ["kardon"]],
  ["Beech International Village", "Apartments", 39.978743, -75.160838, ["beech"]],

  // Transit
  ["Temple University Station", "SEPTA Regional Rail", 39.981584, -75.14952, ["septa", "train", "regional rail"]],
  ["Cecil B. Moore Station", "SEPTA Broad Street Line", 39.97857, -75.157901, ["septa", "subway", "bsl"]],
  ["Susquehanna-Dauphin Station", "SEPTA Broad Street Line", 39.987096, -75.156042, ["septa", "subway", "bsl"]],
  ["Girard Station", "SEPTA Broad Street Line", 39.971499, -75.15946, ["septa", "subway", "bsl"]],
  ["North Philadelphia Station", "SEPTA Broad Street Line", 39.994656, -75.154392, ["septa", "subway", "bsl"]],
  ["North Broad Station", "SEPTA Regional Rail", 39.992215, -75.153904, ["septa", "train", "regional rail"]],

  // Parking
  ["Liacouras Garage", "Parking", 39.979875, -75.159759],
  ["Montgomery Garage", "Parking", 39.980199, -75.151704],
  ["Bell Garage", "Parking", 39.979917, -75.152476],
];

export const CAMPUS_PLACES: Place[] = ENTRIES.map(([name, detail, lat, lng, aliases]) => ({
  id: `campus:${name}`,
  name,
  detail,
  center: [lng, lat],
  source: "campus",
  aliases: aliases ?? [],
}));

/** Shown when a search box is focused but empty. */
export const QUICK_PICKS: Place[] = [
  "Charles Library",
  "Howard Gittis Student Center",
  "Bell Tower",
  "Temple University Station",
  "Cecil B. Moore Station",
].map((n) => CAMPUS_PLACES.find((p) => p.name === n)!);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// List order doubles as priority on ties: landmarks before parking garages.
const INDEX = CAMPUS_PLACES.map((p, order) => ({
  place: p,
  order,
  name: normalize(p.name),
  aliases: p.aliases!.map(normalize),
  detail: normalize(p.detail),
}));

/**
 * Rank campus places for a query: name prefix, then a word in the name or an
 * alias starting with the query, then the query appearing anywhere, then a
 * category match ("residence hall", "septa"). Every query word must match.
 */
export function searchCampus(query: string, limit = 5): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");

  const scored: Array<{ place: Place; score: number; order: number }> = [];
  for (const e of INDEX) {
    const haystack = `${e.name} ${e.aliases.join(" ")} ${e.detail}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    let score = 1;
    const nameWords = e.name.split(" ");
    if (e.name.startsWith(q) || e.aliases.some((a) => a.startsWith(q))) score = 4;
    else if (nameWords.some((w) => w.startsWith(words[0]))) score = 3;
    else if (`${e.name} ${e.aliases.join(" ")}`.includes(q)) score = 2;
    scored.push({ place: e.place, score, order: e.order });
  }

  // Category-only matches (score 1) are capped, so typing "broad" still leaves
  // room for Broad Street addresses instead of listing every subway station.
  let categoryMatches = 0;
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .filter((s) => s.score > 1 || ++categoryMatches <= 2)
    .slice(0, limit)
    .map((s) => s.place);
}
