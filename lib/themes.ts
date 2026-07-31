// Curated portal themes. Each palette is a full 50–900 ramp stored as RGB
// triplets, applied through the --brand-* CSS variables that tailwind.config
// reads. Every theme keeps white text readable on the portal hero (which uses
// the 600–900 range) — agents pick a look, never a contrast problem.

export type Theme = {
  label: string;
  swatch: string; // hex used for the picker chip (shade 600)
  vars: Record<string, string>;
};

function ramp(shades: [string, string, string, string, string, string, string, string, string, string]): Record<string, string> {
  const keys = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  const out: Record<string, string> = {};
  keys.forEach((k, i) => {
    out[`--brand-${k}`] = shades[i];
  });
  return out;
}

// Ordered as a hue sweep so the picker reads like a paint strip.
export const THEMES: Record<string, Theme> = {
  default: {
    label: "ReferBound",
    swatch: "#2547eb",
    vars: ramp([
      "238 244 255", "219 230 254", "191 211 254", "147 180 253", "96 138 250",
      "59 99 246", "37 71 235", "29 54 216", "30 47 175", "30 44 138",
    ]),
  },
  sky: {
    label: "Sky",
    swatch: "#0284c7",
    vars: ramp([
      "240 249 255", "224 242 254", "186 230 253", "125 211 252", "56 189 248",
      "14 165 233", "2 132 199", "3 105 161", "7 89 133", "12 74 110",
    ]),
  },
  ocean: {
    label: "Ocean",
    swatch: "#0e7490",
    vars: ramp([
      "236 254 255", "207 250 254", "165 243 252", "103 232 249", "34 211 238",
      "6 182 212", "8 145 178", "14 116 144", "21 94 117", "22 78 99",
    ]),
  },
  teal: {
    label: "Teal",
    swatch: "#0d9488",
    vars: ramp([
      "240 253 250", "204 251 241", "153 246 228", "94 234 212", "45 212 191",
      "20 184 166", "13 148 136", "15 118 110", "17 94 89", "19 78 74",
    ]),
  },
  emerald: {
    label: "Emerald",
    swatch: "#059669",
    vars: ramp([
      "236 253 245", "209 250 229", "167 243 208", "110 231 183", "52 211 153",
      "16 185 129", "5 150 105", "4 120 87", "6 95 70", "6 78 59",
    ]),
  },
  forest: {
    label: "Forest",
    swatch: "#16a34a",
    vars: ramp([
      "240 253 244", "220 252 231", "187 247 208", "134 239 172", "74 222 128",
      "34 197 94", "22 163 74", "21 128 61", "22 101 52", "20 83 45",
    ]),
  },
  olive: {
    label: "Olive",
    swatch: "#4d7c0f",
    vars: ramp([
      "247 254 231", "236 252 203", "217 249 157", "190 242 100", "163 230 53",
      "132 204 22", "101 163 13", "77 124 15", "63 98 18", "54 83 20",
    ]),
  },
  copper: {
    label: "Copper",
    swatch: "#b45309",
    vars: ramp([
      "255 251 235", "254 243 199", "253 230 138", "252 211 77", "251 191 36",
      "245 158 11", "217 119 6", "180 83 9", "146 64 14", "120 53 15",
    ]),
  },
  sunset: {
    label: "Sunset",
    swatch: "#c2410c",
    vars: ramp([
      "255 247 237", "255 237 213", "254 215 170", "253 186 116", "251 146 60",
      "249 115 22", "234 88 12", "194 65 12", "154 52 18", "124 45 18",
    ]),
  },
  crimson: {
    label: "Crimson",
    swatch: "#dc2626",
    vars: ramp([
      "254 242 242", "254 226 226", "254 202 202", "252 165 165", "248 113 113",
      "239 68 68", "220 38 38", "185 28 28", "153 27 27", "127 29 29",
    ]),
  },
  burgundy: {
    label: "Burgundy",
    swatch: "#be123c",
    vars: ramp([
      "255 241 242", "255 228 230", "254 205 211", "253 164 175", "251 113 133",
      "244 63 94", "225 29 72", "190 18 60", "159 18 57", "136 19 55",
    ]),
  },
  rose: {
    label: "Rose",
    swatch: "#be185d",
    vars: ramp([
      "253 242 248", "252 231 243", "251 207 232", "249 168 212", "244 114 182",
      "236 72 153", "219 39 119", "190 24 93", "157 23 77", "131 24 67",
    ]),
  },
  plum: {
    label: "Plum",
    swatch: "#a21caf",
    vars: ramp([
      "253 244 255", "250 232 255", "245 208 254", "240 171 252", "232 121 249",
      "217 70 239", "192 38 211", "162 28 175", "134 25 143", "112 26 117",
    ]),
  },
  royal: {
    label: "Royal",
    swatch: "#7c3aed",
    vars: ramp([
      "245 243 255", "237 233 254", "221 214 254", "196 181 253", "167 139 250",
      "139 92 246", "124 58 237", "109 40 217", "91 33 182", "76 29 149",
    ]),
  },
  navy: {
    label: "Navy",
    swatch: "#4f46e5",
    vars: ramp([
      "238 242 255", "224 231 255", "199 210 254", "165 180 252", "129 140 248",
      "99 102 241", "79 70 229", "67 56 202", "55 48 163", "49 46 129",
    ]),
  },
  graphite: {
    label: "Graphite",
    swatch: "#475569",
    vars: ramp([
      "248 250 252", "241 245 249", "226 232 240", "203 213 225", "148 163 184",
      "100 116 139", "71 85 105", "51 65 85", "30 41 59", "15 23 42",
    ]),
  },
  onyx: {
    label: "Onyx",
    swatch: "#3f3f46",
    vars: ramp([
      "250 250 250", "244 244 245", "228 228 231", "212 212 216", "161 161 170",
      "113 113 122", "82 82 91", "63 63 70", "39 39 42", "24 24 27",
    ]),
  },
};

// Inline style object for server components (portal pages) — cascades the
// theme to every brand-* Tailwind class inside the wrapper.
export function themeStyle(key: string | null | undefined): Record<string, string> | undefined {
  const t = THEMES[key ?? ""];
  if (!t || key === "default") return undefined;
  return t.vars;
}
