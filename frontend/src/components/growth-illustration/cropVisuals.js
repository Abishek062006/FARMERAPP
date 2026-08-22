// Per-crop visual identity for all 82 crops in the catalog.
//
// `emoji` is the crop's OWN emoji and never changes with growth stage — the
// header icon should always say "this is a cotton field", not "this is
// currently flowering" (the stage is already stated in words right next to
// it, and a stage-based emoji made every crop show 🍅 at fruiting).
//
// `archetype` picks which parametric SVG renderer draws the plant, so each
// crop is drawn with the right morphology — a gourd climbs and dangles, a
// palm has a trunk and fronds, a root crop shows its root under the soil
// line — instead of every crop being the same generic stem-with-blobs.
// `leaf`/`fruit`/`fruitAlt` then colour it correctly for that species.

const FALLBACK_BY_CATEGORY = {
  cereal: { emoji: '🌾', archetype: 'grass', leaf: '#6FBF5C', fruit: '#E3C34A' },
  pulse: { emoji: '🫘', archetype: 'legume', leaf: '#6FBF5C', fruit: '#8FAF52' },
  oilseed: { emoji: '🌿', archetype: 'legume', leaf: '#6FBF5C', fruit: '#C9A24A' },
  vegetable_fruiting: { emoji: '🥬', archetype: 'bush', leaf: '#6FBF5C', fruit: '#E4432A' },
  vegetable_leafy_root: { emoji: '🥬', archetype: 'root', leaf: '#6FBF5C', fruit: '#C9793D' },
  spice: { emoji: '🌿', archetype: 'rhizome', leaf: '#6FBF5C', fruit: '#D9A441' },
  flower: { emoji: '🌼', archetype: 'flower', leaf: '#6FBF5C', fruit: '#F48FB1' },
  plantation_perennial: { emoji: '🌳', archetype: 'tree', leaf: '#4E9E45', fruit: '#C0642E' },
  fruit_tree: { emoji: '🌳', archetype: 'tree', leaf: '#4E9E45', fruit: '#E4432A' },
};

export const CROP_VISUALS = {
  // ── Cereals & millets ────────────────────────────────────────────────
  'Rice (Paddy)': { emoji: '🌾', archetype: 'grass', leaf: '#7CC262', fruit: '#E0C24C' },
  'Sorghum (Cholam)': { emoji: '🌾', archetype: 'grass', leaf: '#6DB356', fruit: '#D6A03C' },
  'Pearl Millet (Cumbu)': { emoji: '🌾', archetype: 'grass', leaf: '#6DB356', fruit: '#C8B45A' },
  'Finger Millet (Ragi)': { emoji: '🌾', archetype: 'grass', leaf: '#5FA84D', fruit: '#B4753C' },
  'Foxtail Millet (Thinai)': { emoji: '🌾', archetype: 'grass', leaf: '#78BE5C', fruit: '#DCC055' },
  'Little Millet (Samai)': { emoji: '🌾', archetype: 'grass', leaf: '#78BE5C', fruit: '#D8BA5A' },
  'Kodo Millet (Varagu)': { emoji: '🌾', archetype: 'grass', leaf: '#6DB356', fruit: '#B9974A' },
  'Barnyard Millet (Kuthiraivali)': { emoji: '🌾', archetype: 'grass', leaf: '#78BE5C', fruit: '#CBB35A' },
  Maize: { emoji: '🌽', archetype: 'cane', leaf: '#5FAE4B', fruit: '#F2C63C' },
  Sugarcane: { emoji: '🎋', archetype: 'cane', leaf: '#6DB356', fruit: '#9BBE55' },

  // ── Pulses ───────────────────────────────────────────────────────────
  'Black Gram': { emoji: '🫘', archetype: 'legume', leaf: '#6FBF5C', fruit: '#4A4A4A' },
  'Green Gram': { emoji: '🫘', archetype: 'legume', leaf: '#7CC262', fruit: '#6F9E3A' },
  'Red Gram (Tur)': { emoji: '🫘', archetype: 'legume', leaf: '#65B052', fruit: '#B9773A' },
  'Bengal Gram (Chickpea)': { emoji: '🫘', archetype: 'legume', leaf: '#7CC262', fruit: '#D2A65C' },
  'Horse Gram (Kollu)': { emoji: '🫘', archetype: 'legume', leaf: '#6DB356', fruit: '#8A6238' },
  'Cowpea (Karamani)': { emoji: '🫘', archetype: 'legume', leaf: '#7CC262', fruit: '#C9B07A' },
  'Field Bean (Mochai)': { emoji: '🫛', archetype: 'legume', leaf: '#6FBF5C', fruit: '#8FAF52' },

  // ── Oilseeds ─────────────────────────────────────────────────────────
  Groundnut: { emoji: '🥜', archetype: 'groundnut', leaf: '#6FBF5C', fruit: '#C9A277' },
  'Sesame (Gingelly)': { emoji: '🌿', archetype: 'herb', leaf: '#7CC262', fruit: '#E8DCC0' },
  Sunflower: { emoji: '🌻', archetype: 'sunflower', leaf: '#5FAE4B', fruit: '#F2B705' },
  Castor: { emoji: '🌿', archetype: 'castor', leaf: '#5E9E4A', fruit: '#B4553C' },

  // ── Fruiting vegetables ──────────────────────────────────────────────
  Tomato: { emoji: '🍅', archetype: 'bush', leaf: '#5FAE4B', fruit: '#E4432A', fruitAlt: '#C9351E' },
  Brinjal: { emoji: '🍆', archetype: 'bush', leaf: '#5E9E4A', fruit: '#7B3FA0', fruitAlt: '#5E2E7D' },
  Chili: { emoji: '🌶️', archetype: 'bush', leaf: '#5FAE4B', fruit: '#D62E1F' },
  Capsicum: { emoji: '🫑', archetype: 'bush', leaf: '#5FAE4B', fruit: '#3FA34D' },
  'Okra (Ladies Finger)': { emoji: '🥒', archetype: 'bush', leaf: '#6DB356', fruit: '#6FA83C' },
  Cotton: { emoji: '☁️', archetype: 'cotton', leaf: '#5E9E4A', fruit: '#FFFFFF' },
  'Cluster Bean (Kothavarai)': { emoji: '🫛', archetype: 'legume', leaf: '#6FBF5C', fruit: '#7FA83F' },
  'French Beans': { emoji: '🫛', archetype: 'legume', leaf: '#7CC262', fruit: '#6F9E3A' },

  // ── Gourds & vines ───────────────────────────────────────────────────
  'Bitter Gourd (Pavakkai)': { emoji: '🥒', archetype: 'vine', leaf: '#6DB356', fruit: '#7FB93C' },
  'Bottle Gourd (Sorakkai)': { emoji: '🥒', archetype: 'vine', leaf: '#6DB356', fruit: '#9CC45A' },
  'Ridge Gourd (Peerkangai)': { emoji: '🥒', archetype: 'vine', leaf: '#6DB356', fruit: '#5F9E3C' },
  'Snake Gourd (Pudalangai)': { emoji: '🥒', archetype: 'vine', leaf: '#6DB356', fruit: '#8CBE5C' },
  Cucumber: { emoji: '🥒', archetype: 'vine', leaf: '#6DB356', fruit: '#4E9E45' },
  'Ash Gourd': { emoji: '🥒', archetype: 'sprawl', leaf: '#6DB356', fruit: '#A8C4A0' },
  'Pumpkin (Poosanikai)': { emoji: '🎃', archetype: 'sprawl', leaf: '#5E9E4A', fruit: '#E88B26' },
  Watermelon: { emoji: '🍉', archetype: 'sprawl', leaf: '#5E9E4A', fruit: '#3E8E41' },
  Muskmelon: { emoji: '🍈', archetype: 'sprawl', leaf: '#6DB356', fruit: '#D9B96A' },

  // ── Roots, tubers & leafy ────────────────────────────────────────────
  Onion: { emoji: '🧅', archetype: 'root', leaf: '#6FBF5C', fruit: '#C77B4A' },
  Carrot: { emoji: '🥕', archetype: 'root', leaf: '#6FBF5C', fruit: '#EA7B26' },
  Radish: { emoji: '🥕', archetype: 'root', leaf: '#7CC262', fruit: '#F0E6E6' },
  Beetroot: { emoji: '🫐', archetype: 'root', leaf: '#7A9E4A', fruit: '#9B2247' },
  'Sweet Potato': { emoji: '🍠', archetype: 'root', leaf: '#6DB356', fruit: '#C9793D' },
  'Tapioca (Maravalli Kizhangu)': { emoji: '🥔', archetype: 'root', leaf: '#5E9E4A', fruit: '#A8703F' },
  'Elephant Foot Yam (Senai)': { emoji: '🥔', archetype: 'root', leaf: '#5E9E4A', fruit: '#8A6238' },
  'Colocasia (Seppankizhangu)': { emoji: '🥔', archetype: 'root', leaf: '#4E9E45', fruit: '#8A6238' },
  Cabbage: { emoji: '🥬', archetype: 'head', leaf: '#7FBF5F', fruit: '#9CCB6A' },
  Cauliflower: { emoji: '🥦', archetype: 'head', leaf: '#6DB356', fruit: '#F2EBD5' },
  'Betel Leaf (Vetrilai)': { emoji: '🍃', archetype: 'climber', leaf: '#4E9E45', fruit: '#4E9E45' },

  // ── Spices & herbs ───────────────────────────────────────────────────
  Turmeric: { emoji: '🫚', archetype: 'rhizome', leaf: '#6DB356', fruit: '#E09B22' },
  Ginger: { emoji: '🫚', archetype: 'rhizome', leaf: '#6DB356', fruit: '#D2A15C' },
  Cardamom: { emoji: '🌿', archetype: 'rhizome', leaf: '#5E9E4A', fruit: '#B9C46A' },
  'Black Pepper': { emoji: '🫘', archetype: 'climber', leaf: '#4E9E45', fruit: '#3A3A3A' },
  Coriander: { emoji: '🌿', archetype: 'herb', leaf: '#7CC262', fruit: '#C9BE7A' },
  Fennel: { emoji: '🌾', archetype: 'herb', leaf: '#8FC97A', fruit: '#C9BE7A' },
  Fenugreek: { emoji: '🍃', archetype: 'herb', leaf: '#7CC262', fruit: '#C9A24A' },

  // ── Plantation & perennials ──────────────────────────────────────────
  Coconut: { emoji: '🥥', archetype: 'palm', leaf: '#4E9E45', fruit: '#8A6238' },
  'Areca Nut (Betel Nut)': { emoji: '🌴', archetype: 'palm', leaf: '#4E9E45', fruit: '#E08A2E' },
  Cashew: { emoji: '🥜', archetype: 'tree', leaf: '#4E9E45', fruit: '#E0A22E' },
  Rubber: { emoji: '🌳', archetype: 'tree', leaf: '#3E8E41', fruit: '#8A6238' },
  Coffee: { emoji: '☕', archetype: 'tree', leaf: '#3E8E41', fruit: '#C0392B' },
  Tea: { emoji: '🍵', archetype: 'teaBush', leaf: '#3E8E41', fruit: '#7FBF5F' },
  Cocoa: { emoji: '🍫', archetype: 'tree', leaf: '#4E9E45', fruit: '#C9762E' },

  // ── Fruit trees ──────────────────────────────────────────────────────
  Banana: { emoji: '🍌', archetype: 'broadleaf', leaf: '#5FAE4B', fruit: '#E8C33C' },
  Mango: { emoji: '🥭', archetype: 'tree', leaf: '#4E9E45', fruit: '#F0A62E' },
  Guava: { emoji: '🍐', archetype: 'tree', leaf: '#5FAE4B', fruit: '#B9CE5A' },
  Papaya: { emoji: '🍈', archetype: 'papaya', leaf: '#4E9E45', fruit: '#EFA83C' },
  'Sapota (Sapodilla)': { emoji: '🥝', archetype: 'tree', leaf: '#4E9E45', fruit: '#9C7248' },
  Pomegranate: { emoji: '🍎', archetype: 'tree', leaf: '#5FAE4B', fruit: '#C0392B' },
  Jackfruit: { emoji: '🍈', archetype: 'tree', leaf: '#3E8E41', fruit: '#9CB84A' },
  'Orange (Sathukudi)': { emoji: '🍊', archetype: 'tree', leaf: '#4E9E45', fruit: '#EF8A22' },
  Lemon: { emoji: '🍋', archetype: 'tree', leaf: '#5FAE4B', fruit: '#EFD02E' },
  Grapes: { emoji: '🍇', archetype: 'climber', leaf: '#5FAE4B', fruit: '#7B3FA0' },
  Pineapple: { emoji: '🍍', archetype: 'pineapple', leaf: '#5FAE4B', fruit: '#E0A62E' },
  'Amla (Indian Gooseberry)': { emoji: '🫒', archetype: 'tree', leaf: '#5FAE4B', fruit: '#C9D66A' },
  'Custard Apple (Sithapazham)': { emoji: '🍏', archetype: 'tree', leaf: '#4E9E45', fruit: '#A8C48A' },
  Tamarind: { emoji: '🫘', archetype: 'tree', leaf: '#4E9E45', fruit: '#8A5A38' },
  'Drumstick (Murungai)': { emoji: '🌿', archetype: 'drumstick', leaf: '#6DB356', fruit: '#6FA83C' },

  // ── Flowers ──────────────────────────────────────────────────────────
  'Jasmine (Malli)': { emoji: '🌼', archetype: 'flower', leaf: '#4E9E45', fruit: '#FFFFFF' },
  'Marigold (Thagarai)': { emoji: '🏵️', archetype: 'flower', leaf: '#5FAE4B', fruit: '#F2A20C' },
  Rose: { emoji: '🌹', archetype: 'flower', leaf: '#4E9E45', fruit: '#D32F4F' },
  'Chrysanthemum (Sevanthi)': { emoji: '🌸', archetype: 'flower', leaf: '#5FAE4B', fruit: '#F2C0D8' },
};

function lookup(cropName) {
  if (!cropName) return null;
  if (CROP_VISUALS[cropName]) return CROP_VISUALS[cropName];
  const trimmed = String(cropName).trim().toLowerCase();
  const key = Object.keys(CROP_VISUALS).find((n) => n.toLowerCase() === trimmed);
  return key ? CROP_VISUALS[key] : null;
}

export function getCropVisual(cropName, category) {
  return (
    lookup(cropName) ||
    FALLBACK_BY_CATEGORY[category] ||
    FALLBACK_BY_CATEGORY.vegetable_fruiting
  );
}

export function getCropEmoji(cropName, category) {
  return getCropVisual(cropName, category).emoji;
}
