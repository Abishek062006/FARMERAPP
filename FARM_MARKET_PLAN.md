# FARM Market + Uber-style Transport — Implementation Plan

Target: `/Users/rsabishek/Desktop/farmerapp/FARMERAPP`
Constraints: Expo SDK 54 **Expo Go only**, no native modules, no push, no sockets, Leaflet-in-WebView maps, MongoDB **Atlas** (`mongodb+srv` → replica set → **transactions available**), Mongoose 9, Express 5.

---

## 0. Verdict on your plan

Your plan is ~80% right. Five things change:

| # | Your plan | Change | Why |
|---|---|---|---|
| 1 | Populate `CropListing.location.lat/lng` from `getCurrentLocation()` | **Take pickup location from `Land.location`** | `Land.location.coordinates.lat/lng` and `location.district` are **`required: true`** in the schema (`backend/models/Land.js:14-24`), set through `LocationMapPicker`/GPS. `Crop.landId` is required. So *every* crop already resolves to real, precise coordinates. This kills the "unreliable location" problem for the farmer side. **Coordinates only** — see §0.1: the stored `district` strings are not trustworthy. Never call `getCurrentLocation()` at post time — the farmer may be posting from home, not the field. |
| 2 | Extend `CropListing` with buyer fields, add `quantityAvailableKg` | **Extend it as *inventory only*; move buyer identity off it entirely** | `vendorUid/vendorName/vendorPhone/vendorCompany/acceptedAt/confirmedAt` are single-buyer fields. The moment a listing supports partial purchases they are wrong. Listing = stock. `Order` = buyer. |
| 3 | Separate `Order` status machine ending at `delivered` | Add **`pickupOtp` / `dropOtp` handover gates** and a **farmer-facing order list** | In your flow the farmer never learns a sale happened. An agent turns up at a farm gate and the farmer knows nothing. Porter/Rapido solve this with a handover code. |
| 4 | Auto ≤ 20 km rule | Add a **weight/capacity constraint** | The 20 km rule is a proxy for the real constraint. You cannot put 2 000 kg of paddy in an auto at any distance. `capacityKg` per vehicle, enforced server-side alongside `maxKm`. |
| 5 | Remove the "Mark Harvested" button entirely | Keep a **low-emphasis "Harvest without selling"** escape hatch | If the only path to harvest is "post to market", a farmer whose crop failed to disease can **never free the plot** — `POST /api/crops` trips the `plot.cropId && plot.status==='active'` guard forever. Hard blocker; one text link fixes it. |

Plus one addition that decides whether the demo works at all: **a route-simulation mode** (§7, Phase 4).

### 0.1 What the live database actually contains

Audited against Atlas after Phase 1. This changes one design decision.

| Finding | Count | Consequence |
|---|---|---|
| `Land.location.coordinates` | 14/14 real, varied, precise | ✅ Pickup coordinates are solid. Distance sorting will work. |
| `Land.location.district` | **3 of 11 distinct values are real TN districts** | ❌ The rest are neighbourhoods and towns: *Semmanjeri, Ellis Nagar, Alagappa Puram, Madurai Main, Gandhiji Street, Thiruppuvanam, Manamadurai, Karaikkudi*. `matchTnDistrict` exists but the registration flow never applied it. |
| `User.location.district` | **13 of 13 are "Chennai"** | ❌ The `RegisterScreen` hardcode, confirmed in production data. Unusable, as expected. |
| Harvested crops with `actualYield` | **0 of 2** | ✅ The falsy-`0` bug, confirmed in production data. Fixed in Phase 1. |
| Vendor accounts | **0** | ⚠️ Blocks any marketplace demo. |
| Agent accounts | **0** | ⚠️ Blocks any dispatch demo. |

**Design change — do not tier on the stored district string.** §2.5 originally sorted "same district first, then by distance". With 8 of 11 district values being neighbourhood names, that tier would scatter. Two corrections:

1. **Primary sort is distance bands, not district equality.** `≤ 25 km` = "Near you", then everything else strictly by distance. This needs only coordinates, which are reliable.
2. **Derive the district from coordinates**, not from the stored string. The vendor's "search other districts" requirement needs a canonical district per listing, so add `backend/data/tnDistrictCentroids.js` — 38 `{district, lat, lng}` rows — and assign each listing its nearest centroid at creation time. Cheap, deterministic, and immune to whatever the device geocoder returned. Keep the stored string as a display label only (`"Karaikkudi, Sivaganga"`).

Run the stored value through `matchTnDistrict()` first; fall back to nearest centroid when it doesn't match.

---

## 1. Data model

### 1.1 `backend/models/CropListing.js` — MODIFY

```js
const CropListingSchema = new mongoose.Schema({
  cropId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true, index: true },
  landId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Land' },   // NEW — provenance of the coords
  farmerUid:   { type: String, required: true, index: true },
  farmerName:  { type: String, default: 'Farmer' },
  farmerPhone: { type: String, default: '' },        // NEVER returned on public browse — see §2.3
  cropName:    { type: String, required: true },
  cropTamilName: { type: String, default: '' },      // NEW — Crop.tamilName, farmer-facing UI
  variety:     { type: String, default: '' },        // NEW

  // ── Harvest proof / provenance (NEW) ──
  harvestedAt:   { type: Date },
  actualYieldKg: { type: Number },                   // what came off the field
  proofImageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ListingImage', default: null },
  notes:         { type: String, maxlength: 500 },
  gradeNote:     { type: String, default: '' },      // "A grade", "slightly bruised"

  // ── Inventory (CHANGED semantics) ──
  quantityKg:          { type: Number, required: true },   // originally posted — immutable
  quantityAvailableKg: { type: Number, required: true },   // decrements on each order
  minOrderKg:          { type: Number, required: true, default: 1 },
  pricePerKg:          { type: Number, required: true },
  totalPrice:          { type: Number },                   // kept for old rows / display

  location: {
    city:     { type: String, required: true },
    district: { type: String, index: true },
    state:    { type: String, default: 'Tamil Nadu' },
    lat:      { type: Number },   // ← NOW ACTUALLY POPULATED (from Land)
    lng:      { type: Number },
    address:  { type: String, default: '' },
  },

  status: {
    type: String,
    enum: ['available', 'sold_out', 'withdrawn',
           'pending', 'confirmed', 'declined'],   // ← legacy values kept so old rows still validate
    default: 'available',
    index: true,
  },

  // legacy single-buyer fields — DO NOT write to these any more, delete after migration
  vendorUid: { type: String, default: null },
  vendorName: { type: String, default: null },
  vendorPhone: { type: String, default: null },
  vendorCompany: { type: String, default: null },
  acceptedAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
}, { timestamps: true });

// There are currently ZERO indexes on this collection.
CropListingSchema.index({ status: 1, createdAt: -1 });
CropListingSchema.index({ status: 1, 'location.district': 1 });
CropListingSchema.index({ status: 1, cropName: 1 });
CropListingSchema.index({ farmerUid: 1, createdAt: -1 });
```

**Migration** (`backend/scripts/migrateListings.js`, run once, mirrors `seedSchemeImages.js` style):
```js
// 1. every legacy row gets inventory fields
await CropListing.updateMany(
  { quantityAvailableKg: { $exists: false } },
  [{ $set: { quantityAvailableKg: '$quantityKg', minOrderKg: 1 } }]   // aggregation pipeline update
);
// 2. legacy terminal statuses become sold_out so they leave the market cleanly
await CropListing.updateMany({ status: { $in: ['pending', 'confirmed'] } }, { $set: { status: 'sold_out' } });
await CropListing.updateMany({ status: 'declined' }, { $set: { status: 'withdrawn' } });
// 3. backfill coords from the crop's land
for (const l of await CropListing.find({ 'location.lat': null })) {
  const crop = await Crop.findById(l.cropId).select('landId').lean();
  const land = crop && await Land.findById(crop.landId).select('location').lean();
  if (!land) continue;
  l.landId = crop.landId;
  l.location.lat = land.location.coordinates.lat;
  l.location.lng = land.location.coordinates.lng;
  l.location.district = land.location.district;
  await l.save();
}
```

### 1.2 `backend/models/ListingImage.js` — NEW

Mirrors `SchemeImage.js` exactly, which already has a **proven serving route** (`GET /api/schemes/image/:key`).

```js
const ListingImageSchema = new mongoose.Schema({
  listingId:   { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', index: true },
  ownerUid:    { type: String, required: true },
  contentType: { type: String, required: true },
  data:        { type: Buffer, required: true },
}, { timestamps: true });
```
Separate collection, **not** an embedded Buffer on `CropListing` — otherwise every marketplace query drags ~120 KB per row over the wire.

### 1.3 `backend/models/Order.js` — NEW

One document = one purchase **and** its delivery job. They are a single atomic checkout in this UX ("buy + book" in one flow), so splitting them buys nothing but joins.

```js
const OrderSchema = new mongoose.Schema({
  // ── Idempotency (double-tap protection) ──
  idempotencyKey: { type: String },   // client-generated uuid

  // ── What was bought (SNAPSHOT — never re-read from the listing) ──
  listingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', required: true, index: true },
  cropName:   { type: String, required: true },
  cropTamilName: { type: String, default: '' },
  quantityKg: { type: Number, required: true },
  pricePerKg: { type: Number, required: true },   // snapshot: farmer can edit the listing later
  cropTotal:  { type: Number, required: true },   // quantityKg * pricePerKg

  // ── Parties (all from req.profile, never client-supplied) ──
  farmerUid:  { type: String, required: true, index: true },
  farmerName: String,
  farmerPhone: String,
  vendorUid:  { type: String, required: true, index: true },
  vendorName: String,
  vendorPhone: String,
  vendorCompany: String,

  agentUid:   { type: String, default: null, index: true },
  agentName:  { type: String, default: null },
  agentPhone: { type: String, default: null },
  agentVehicleNumber: { type: String, default: null },

  // ── Route (flat {lat,lng} everywhere in new code) ──
  pickup: {
    lat: Number, lng: Number,
    label: String, district: String, city: String,
  },
  dropoff: {
    lat: Number, lng: Number,
    label: String, district: String, city: String,
  },

  // ── Transport quote — FROZEN at creation, never recomputed ──
  vehicleType: { type: String, enum: ['auto', 'tempo', 'truck'], required: true },
  distanceKm:  { type: Number, required: true },   // loaded leg: pickup → dropoff
  durationMin: { type: Number, required: true },
  routeSource: { type: String, enum: ['osrm', 'haversine'], default: 'haversine' },
  routePolyline: [[Number]],                        // [[lat,lng], ...] decimated to ≤300 points
  fare: {
    base: Number, perKm: Number, distanceCharge: Number,
    total: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    agentPayout: Number,
  },
  grandTotal: { type: Number, required: true },     // cropTotal + fare.total

  payment: {
    mode:   { type: String, enum: ['cod'], default: 'cod' },
    status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  },

  // ── Status machine ──
  status: {
    type: String,
    enum: ['awaiting_agent', 'no_agents', 'accepted', 'picked_up', 'delivered', 'cancelled'],
    default: 'awaiting_agent',
    index: true,
  },
  isActiveJob: { type: Boolean },   // set true on accept, $unset on delivered/cancelled — see §3.3

  dispatchExpiresAt: Date,          // createdAt + 5 min
  acceptedAt: Date, pickedUpAt: Date, deliveredAt: Date, cancelledAt: Date,
  cancelledBy: String,
  rejectedBy: [String],             // agentUids that hit "Reject" — don't re-show them the card

  // ── Handover gates (NEW — the farmer must know a pickup is coming) ──
  pickupOtp: String,   // 4 digits, shown to the FARMER, entered by the agent to go accepted→picked_up
  dropOtp:   String,   // 4 digits, shown to the VENDOR, entered by the agent to go picked_up→delivered

  // ── Live tracking ──
  tracking: {
    lat: Number, lng: Number,
    heading: { type: Number, default: 0 },
    seq: { type: Number, default: 0 },        // monotonic client counter — out-of-order guard
    updatedAt: Date,
    simulated: { type: Boolean, default: false },
  },
}, { timestamps: true });

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ vendorUid: 1, createdAt: -1 });
OrderSchema.index({ farmerUid: 1, createdAt: -1 });
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
// ONE active job per agent, enforced by the DB — see §3.3
OrderSchema.index({ agentUid: 1 }, { unique: true, partialFilterExpression: { isActiveJob: true } });
```

> `partialFilterExpression` uses only an **equality** clause (`isActiveJob: true`), which every MongoDB version supports. Do **not** write `{ status: { $in: [...] } }` there — `$in` in partial filters is 6.0+ only and brittle.

### 1.4 `backend/models/User.js` — MODIFY (small)

```js
  // agents only
  vehicle: {
    type:   { type: String, enum: ['auto', 'tempo', 'truck'] },
    number: { type: String },   // "TN 45 AB 1234"
  },
  isOnline: { type: Boolean, default: false },   // agent duty toggle
```
Add `'vehicle'` and `'isOnline'` to the `updateFields` whitelist in `routes/users.js:147`.
`role` is **not** in that whitelist — good, keep it that way.

---

## 2. Backend routes & services

### 2.1 `backend/middleware/requireRole.js` — NEW

```js
const User = require('../models/User');

function requireRole(...roles) {
  return async (req, res, next) => {
    const user = await User.findOne({ firebaseUid: req.firebaseUid })
      .select('role name phone location vehicle isOnline').lean();
    if (!user) return res.status(403).json({ success: false, error: 'Complete your profile first' });
    if (!roles.includes(user.role))
      return res.status(403).json({ success: false, error: 'Not allowed for your role' });
    req.profile = user;    // routes use this instead of trusting client-supplied name/phone
    next();
  };
}
module.exports = { requireRole };
```

Two wins beyond authorization: (a) it closes the current hole where **any authenticated user — including the farmer themself — can `PUT /api/listings/:id/accept`**; (b) `req.profile` removes the client-supplied `vendorName`/`vendorPhone` trust problem in the existing accept route (those are spoofable today).

Cost: one indexed `findOne` per request. With 5 s polling from a handful of devices that's negligible. If it ever matters, wrap in a 60 s `Map` cache.

### 2.2 `backend/services/geoService.js` — NEW

```js
// haversine — there is no distance helper anywhere in this codebase yet
function haversineKm(a, b) { /* R=6371 */ }

// Absorbs all four location shapes that already exist in this repo:
//   {lat,lng} (CropListing)  ·  {coordinates:{lat,lng}} (User, Land)
//   {latitude,longitude} (locationService)  ·  {coords:{latitude,longitude}} (expo-location raw)
function toLatLng(any) { ... }   // → {lat, lng} | null
```

### 2.3 `backend/services/routeService.js` — NEW (OSRM client)

```js
const CACHE = new Map();               // key → { at, value }, TTL 10 min, cap 500 entries
const TTL = 10 * 60 * 1000;

// Round to 4 decimals (~11 m) so a jittering GPS pin doesn't blow the cache.
const key = (a, b) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

async function getRoute(from, to) {
  // cache hit → return
  const url = `https://router.project-osrm.org/route/v1/driving/`
            + `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const { data } = await axios.get(url, { timeout: 6000 });   // HARD 6s timeout
    const r = data.routes[0];
    return {
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      polyline: decimate(r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), 300),
      source: 'osrm',
    };
  } catch {
    const d = haversineKm(from, to) * 1.35;        // TN road-winding factor
    return { distanceKm: d, durationMin: (d / 28) * 60,  // 28 km/h avg on district roads
             polyline: [[from.lat, from.lng], [to.lat, to.lng]], source: 'haversine' };
  }
}
```

**Risks with `router.project-osrm.org`, and the mitigations:**
- It is a **demo server with a fair-use policy, no SLA and aggressive rate limits.** A vendor dragging a destination pin would fire a request per frame. → **Debounce the quote request 600 ms client-side** and cache server-side as above.
- It can be slow or down mid-demo. → 6 s `timeout` + silent haversine fallback + `routeSource` recorded on the order so you can tell which path ran.
- Calls are **server-side only** (Node → OSRM). Never call it from the app: no CORS problem, one cache, and the fare stays server-authoritative.
- Long term: `docker run osrm/osrm-backend` with the `india-latest.osm.pbf` Tamil Nadu extract. Same URL shape, one env var (`OSRM_URL`). Write the service to read `process.env.OSRM_URL || 'https://router.project-osrm.org'` from day one.

### 2.4 `backend/services/fareService.js` — NEW

```js
const VEHICLES = {
  auto:  { label: 'Auto',      tamil: 'ஆட்டோ',   base: 40,  perKm: 18, minFare: 60,   capacityKg: 300,   maxKm: 20   },
  tempo: { label: 'Tempo Van', tamil: 'டெம்போ',  base: 300, perKm: 28, minFare: 400,  capacityKg: 1500,  maxKm: null },
  truck: { label: 'Truck',     tamil: 'லாரி',    base: 800, perKm: 42, minFare: 1200, capacityKg: 10000, maxKm: null },
};

function quote(vehicleType, distanceKm, quantityKg) {
  const v = VEHICLES[vehicleType];
  if (!v) return { ok: false, reason: 'Unknown vehicle' };
  if (v.maxKm && distanceKm > v.maxKm)
    return { ok: false, reason: `${v.label} is only available up to ${v.maxKm} km` };
  if (quantityKg > v.capacityKg)
    return { ok: false, reason: `${v.label} carries up to ${v.capacityKg} kg` };
  const distanceCharge = Math.round(distanceKm * v.perKm);
  const total = Math.max(v.minFare, v.base + distanceCharge);
  return { ok: true, base: v.base, perKm: v.perKm, distanceCharge, total,
           platformFee: 0, agentPayout: total };
}
```

`quoteAll(distanceKm, quantityKg)` returns all three with `{ ok, reason }` so the client can render **greyed-out but visible** cards (Uber shows unavailable options; hiding them confuses users). The **20 km rule and the capacity rule both apply to the loaded leg (pickup → dropoff)**, not the agent's approach leg.

### 2.5 `backend/routes/listings.js` — MODIFY

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/` | `requireAuth, requireRole('farmer')` | **DELETE this route.** Listings are now only created via harvest — see §2.6. |
| `GET` | `/market` | `requireAuth, requireRole('vendor')` | **NEW.** Replaces the unauthenticated `GET /`. Query: `?q=<crop>&district=<d>&lat=&lng=&scope=near|all`. |
| `GET` | `/photo/:id` | public | Serves `ListingImage.data` — copy `routes/schemes.js:15-27` verbatim (Content-Type + 7-day cache). |
| `GET` | `/farmer/:uid` | `requireAuth` (self) | Keep; change status filter to `['available','sold_out']`. |
| `PUT` | `/:id/withdraw` | `requireAuth, requireRole('farmer')` (owner) | **NEW.** `status → 'withdrawn'`. |
| `PUT` | `/:id/accept`, `/confirm`, `/decline` | — | **DELETE.** Superseded by `POST /api/orders`. |

`GET /` today is **unauthenticated and returns `farmerPhone` to anonymous callers.** Fix as part of this work: require auth, and **never** project `farmerPhone` on market browse. The phone is released only on an `Order` the caller placed.

**`GET /market` implementation** — proximity by tier, computed in Node:
```js
const q = (req.query.q || '').trim();
const filter = { status: 'available', quantityAvailableKg: { $gt: 0 } };
if (q) filter.cropName = new RegExp(escapeRegex(q), 'i');   // ESCAPE — current code injects raw user input
if (req.query.district && req.query.scope !== 'all') filter['location.district'] = req.query.district;

const rows = await CropListing.find(filter)
  .select('-farmerPhone -vendorUid -vendorName -vendorPhone -vendorCompany')
  .limit(200).lean();

const me = toLatLng(req.query) || toLatLng(req.profile.location);   // ?lat=&lng= from the live GPS fix
const myDistrict = req.query.district || req.profile.location?.district;

// Tier on DISTANCE BANDS, not on district equality — see §0.1: the stored
// district strings are neighbourhood names for 8 of 11 lands in the live DB.
const NEAR_KM = 25;
for (const r of rows) {
  const p = toLatLng(r.location);
  r.distanceKm = (me && p) ? roundKm(haversineKm(me, p)) : null;
  r.isNear = r.distanceKm != null && r.distanceKm <= NEAR_KM;
}
rows.sort((a, b) =>
     (b.isNear - a.isNear)                             // tier 1: within 25 km
  || ((a.distanceKm == null) - (b.distanceKm == null)) // tier 2: coord-less last, never crash
  || ((a.distanceKm ?? 0) - (b.distanceKm ?? 0))       // tier 3: nearest first
  || (new Date(b.createdAt) - new Date(a.createdAt))); // tier 4: newest
```

> `district` in the filter is the **derived** district (nearest centroid), not the raw stored string.

> **Why Node-side and not `$geoNear`:** listings will number in the dozens-to-hundreds. `$geoNear` needs a `2dsphere` index on a **GeoJSON** field, which means adding `geo: {type:'Point', coordinates:[lng,lat]}` and migrating — and it cannot express "same district first, *then* distance" without extra `$addFields`/`$sort` stages anyway. Node sorting is exact, debuggable, and free at this scale. Add the GeoJSON field + `$geoNear` when you cross ~5 000 live listings; note it in a comment so the upgrade path is obvious.

### 2.6 `backend/routes/crops.js` — MODIFY (the harvest rewrite)

**Fix `PUT /:cropId/harvest`** (currently `if (actualYield)` — the frontend sends `{actualYield: 0}`, which is falsy, so yield is **never** persisted; and it assigns a raw Number to a `{value, unit}` sub-document):
```js
if (actualYield !== undefined && actualYield !== null && actualYield !== '') {
  crop.actualYield = { value: Number(actualYield), unit: 'kg' };
}
```
Keep this route — it becomes the **"Harvest without selling"** escape hatch (§4.1).

**NEW `POST /api/crops/:cropId/harvest-and-list`** — `requireAuth, requireRole('farmer'), upload.single('proof')`

This is the one place a **real transaction earns its keep**: it spans three collections (Crop, Plot, CropListing) plus ListingImage, and a partial failure leaves the plot permanently unusable. Atlas is a replica set, so `session.withTransaction` works.

```js
// multer memoryStorage (NOT diskStorage) — 5 MB limit, image-only fileFilter
// multer parses text fields into req.body, so this one multipart request carries everything.
const { actualYieldKg, quantityKg, pricePerKg, minOrderKg, gradeNote, notes } = req.body;

const crop = await Crop.findById(cropId);
if (!crop)                              → 404
if (crop.firebaseUid !== req.firebaseUid) → 403
if (crop.isHarvested)                   → 400 'Already harvested'   // ← also enforces one listing per crop
const land = await Land.findById(crop.landId).lean();
if (!land)                              → 400 'Land record missing'

// Validation — all server-side, all rejected with a specific message
const yieldKg = Number(actualYieldKg), qty = Number(quantityKg),
      price = Number(pricePerKg), minOrder = Number(minOrderKg || 1);
if (!(yieldKg > 0))            → 400 'Enter the harvested quantity in kg'
if (!(qty > 0 && qty <= yieldKg)) → 400 'You cannot list more than you harvested'
if (!(price > 0))              → 400 'Enter a price per kg'
if (!(minOrder > 0 && minOrder <= qty)) → 400 'Minimum order must be between 1 kg and the listed quantity'
if (!req.file)                 → 400 'A harvest proof photo is required'

await session.withTransaction(async () => {
  crop.isHarvested = true; crop.isActive = false;
  crop.harvestDate = new Date(); crop.currentStage = 'completed';
  crop.actualYield = { value: yieldKg, unit: 'kg' };
  await crop.save({ session });

  if (crop.plotId) await Plot.findByIdAndUpdate(crop.plotId,
    { $set: { status: 'harvested', cropId: null } }, { session });

  const [listing] = await CropListing.create([{
    cropId: crop._id, landId: land._id,
    farmerUid: req.firebaseUid,
    farmerName: req.profile.name, farmerPhone: req.profile.phone,   // from req.profile, not the client
    cropName: crop.name, cropTamilName: crop.tamilName, variety: crop.variety,
    harvestedAt: crop.harvestDate, actualYieldKg: yieldKg,
    quantityKg: qty, quantityAvailableKg: qty, minOrderKg: minOrder,
    pricePerKg: price, totalPrice: qty * price,
    gradeNote, notes,
    location: {
      city: land.location.city, district: land.location.district,
      state: land.location.state, address: land.location.address,
      lat: land.location.coordinates.lat,     // ← the bug fix: real coords, every time
      lng: land.location.coordinates.lng,
    },
  }], { session });

  const [img] = await ListingImage.create([{
    listingId: listing._id, ownerUid: req.firebaseUid,
    contentType: req.file.mimetype, data: req.file.buffer,
  }], { session });

  listing.proofImageId = img._id;
  await listing.save({ session });
  result = listing;
});
```

### 2.7 `backend/routes/orders.js` — NEW, mounted at `/api/orders` in `server.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/quote` | vendor | `{listingId, quantityKg, dropoff:{lat,lng,label}}` → `{distanceKm, durationMin, polyline, vehicles:[{type,label,tamil,fare,ok,reason,etaMin}], cropTotal}`. **Read-only, reserves nothing.** |
| `POST` | `/` | vendor | Create order + atomically decrement stock. §3.1 |
| `GET` | `/vendor/mine` | vendor | `?active=1` → orders not `delivered`/`cancelled`. |
| `GET` | `/farmer/mine` | farmer | Incoming pickups; includes `pickupOtp`, excludes `dropOtp`. |
| `GET` | `/:id/track` | vendor \| farmer \| assigned agent | Small payload for the 5 s poll: `{status, tracking, agentName, agentPhone, agentVehicleNumber, etaMin}`. |
| `GET` | `/agent/available` | agent | Pending jobs matching the agent's `vehicle.type`, sorted by distance to agent. Runs the lazy expiry sweep. §3.5 |
| `POST` | `/:id/accept` | agent | Atomic claim. §3.2 |
| `POST` | `/:id/reject` | agent | `$addToSet: { rejectedBy: uid }` — card never re-shows for that agent. |
| `POST` | `/:id/pickup` | agent | Body `{otp}`. `accepted → picked_up`. §3.4 |
| `POST` | `/:id/deliver` | agent | Body `{otp}`. `picked_up → delivered`. Clears `isActiveJob`. |
| `POST` | `/:id/location` | agent | `{lat, lng, heading, seq}` — the 5 s tracking ping. §3.6 |
| `POST` | `/:id/cancel` | vendor | Only while `awaiting_agent` / `no_agents`. Restocks. §3.7 |

---

## 3. Concurrency — every hazard and its exact operation

MongoDB guarantees **single-document atomicity**. Every guard below is expressed as query conditions on one document, so no transaction is needed except where noted.

### 3.1 Two vendors buy the same stock (oversell)

```js
// ONE operation checks availability, min-order and stock, and reserves — atomically.
const listing = await CropListing.findOneAndUpdate(
  {
    _id: listingId,
    status: 'available',
    minOrderKg: { $lte: qty },            // enforces the farmer's minimum
    quantityAvailableKg: { $gte: qty },   // enforces "don't oversell"
  },
  { $inc: { quantityAvailableKg: -qty } },
  { new: true }
);
if (!listing) return res.status(409).json({
  success: false, code: 'STOCK_GONE',
  error: 'This stock was just bought or is below the minimum order. Refresh the market.'
});
```
Losing vendor gets a clean 409; frontend refetches the market. **Never** `find()` then `save()` — that is the read-modify-write race.

Then create the order. If `Order.create` throws, **compensate**:
```js
try { order = await Order.create({...}); }
catch (e) {
  await CropListing.updateOne({ _id: listingId }, { $inc: { quantityAvailableKg: qty } });
  throw e;
}
```
Compensation beats a transaction here: the window is milliseconds, the compensating write is one line, and it keeps working if you ever run a standalone `mongod` (transactions would not).

**Dead-stock flip** — after a successful order, if the remainder is below the farmer's own minimum, nobody can ever buy it. `$expr` compares two fields in the same document:
```js
await CropListing.updateOne(
  { _id: listingId, status: 'available',
    $expr: { $lt: ['$quantityAvailableKg', '$minOrderKg'] } },
  { $set: { status: 'sold_out' } }
);
```

### 3.2 Two agents accept the same order

```js
const order = await Order.findOneAndUpdate(
  { _id: id, status: 'awaiting_agent', agentUid: null },   // belt and braces
  { $set: {
      status: 'accepted', isActiveJob: true,
      agentUid: req.firebaseUid, agentName: req.profile.name,
      agentPhone: req.profile.phone,
      agentVehicleNumber: req.profile.vehicle?.number,
      acceptedAt: new Date(),
      'tracking.lat': lat, 'tracking.lng': lng, 'tracking.seq': 0,
      'tracking.updatedAt': new Date(),
  }},
  { new: true }
);
if (!order) return res.status(409).json({ success:false, code:'ALREADY_TAKEN',
  error: 'Another captain took this trip' });
```
Frontend: on `ALREADY_TAKEN`, dismiss the popup with a toast — **not** an error Alert. Losing a race is normal, not a failure.

### 3.3 One agent accepts two orders

A cross-document invariant, so the read-then-check is TOCTOU-unsafe. Let the DB enforce it:
```js
OrderSchema.index({ agentUid: 1 }, { unique: true, partialFilterExpression: { isActiveJob: true } });
```
`isActiveJob` is `$set: true` on accept and **`$unset`** (not `false`) on deliver/cancel — an absent field drops out of a partial index, whereas `false` would still be indexed and collide.

> **Gotcha found while building this (Phase 3).** `OrderSchema.index({ agentUid: 1 }, {...})` auto-names its index `agentUid_1` — the *same* name a field-level `agentUid: { index: true }` generates. On a name collision the plain index wins and **the unique partial index is silently discarded**, with no warning and no error. The guard simply does not exist, and you only find out when two agents both hold a job. Two rules: never put `index: true` on a field that also has an explicit `schema.index()` on the same key, and give any non-trivial index an explicit `name`. Verify with `db.orders.getIndexes()` rather than trusting the schema — `scripts/testOrders.js` §9 asserts it.
```js
catch (e) {
  if (e.code === 11000) return res.status(409).json({ success:false, code:'ALREADY_BUSY',
    error: 'Finish your current trip first' });
}
```

### 3.4 Handover state transitions

Every transition is a guarded `findOneAndUpdate` — never `if (order.status === X) { order.status = Y; save() }`.
```js
// accepted → picked_up, gated on the farmer's OTP
const o = await Order.findOneAndUpdate(
  { _id: id, agentUid: req.firebaseUid, status: 'accepted', pickupOtp: String(req.body.otp) },
  { $set: { status: 'picked_up', pickedUpAt: new Date() } }, { new: true });
if (!o) → 400 'Wrong code, or this trip is no longer at the pickup stage'

// picked_up → delivered, gated on the vendor's OTP; releases the agent
const o = await Order.findOneAndUpdate(
  { _id: id, agentUid: req.firebaseUid, status: 'picked_up', dropOtp: String(req.body.otp) },
  { $set: { status: 'delivered', deliveredAt: new Date(), 'payment.status': 'collected' },
    $unset: { isActiveJob: '' } }, { new: true });
```
Do **not** distinguish `picked_up` from `in_transit`: they differ only by an extra button press for a driver holding a phone in one hand. The map switches from leg A (agent→farm) to leg B (farm→destination) on `picked_up`, which is the only thing the extra state would have bought you.

### 3.5 Nobody accepts (expiry) — no cron in this app

Lazy sweep at the top of `GET /agent/available` and `GET /vendor/mine`:
```js
await Order.updateMany(
  { status: 'awaiting_agent', dispatchExpiresAt: { $lt: new Date() } },
  { $set: { status: 'no_agents' } }
);
```
**Deliberately does not restock.** The vendor's *purchase* is final; only the *dispatch* lapsed. `no_agents` renders as "No captain available — Retry / Cancel". Retry: `no_agents → awaiting_agent` with a fresh `dispatchExpiresAt` and `rejectedBy: []`. This avoids restock churn on every timeout and it matches what actually happened.

### 3.6 Out-of-order location pings

Mobile networks reorder. Without a guard the vehicle marker jumps backwards.
```js
await Order.updateOne(
  { _id: id, agentUid: req.firebaseUid,
    status: { $in: ['accepted', 'picked_up'] },
    'tracking.seq': { $lt: Number(seq) } },        // monotonic client counter, not a clock
  { $set: { 'tracking.lat': lat, 'tracking.lng': lng, 'tracking.heading': heading,
            'tracking.seq': Number(seq), 'tracking.updatedAt': new Date() } }
);
```
`seq` is a client-side counter, **not** `Date.now()` — phone clocks are routinely wrong by minutes and a skewed clock would freeze the marker permanently.

### 3.7 Vendor cancels while an agent is accepting

```js
const o = await Order.findOneAndUpdate(
  { _id: id, vendorUid: req.firebaseUid, status: { $in: ['awaiting_agent', 'no_agents'] } },
  { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'vendor' } }, { new: true });
if (!o) → 409 'A captain already accepted — call them to cancel'
// restock, then un-sell-out if the listing had been retired
await CropListing.updateOne({ _id: o.listingId }, { $inc: { quantityAvailableKg: o.quantityKg } });
await CropListing.updateOne(
  { _id: o.listingId, status: 'sold_out',
    $expr: { $gte: ['$quantityAvailableKg', '$minOrderKg'] } },
  { $set: { status: 'available' } }
);
```

### 3.8 Double-tap "Confirm Booking"

Two identical orders, stock decremented twice. The frontend generates a uuid per checkout attempt and sends it as `idempotencyKey`; the sparse unique index rejects the second insert with `E11000` → return the **existing** order with `200`, not an error. Also disable the button on submit — but never rely on that alone.

### 3.9 Race summary

| Hazard | Guard |
|---|---|
| Oversell | `findOneAndUpdate` with `quantityAvailableKg: {$gte: qty}` + `$inc` negative |
| Below minimum order | `minOrderKg: {$lte: qty}` in the same filter |
| Order create fails post-decrement | compensating `$inc` in `catch` |
| Dead-stock remainder | `$expr: {$lt: ['$quantityAvailableKg','$minOrderKg']}` → `sold_out` |
| Two agents accept | filter on `status:'awaiting_agent', agentUid: null` |
| Agent double-booked | unique partial index on `{agentUid}` where `isActiveJob:true` |
| Wrong-order state transition | status in the filter, never in an `if` |
| Reordered GPS pings | `'tracking.seq': {$lt: seq}` |
| Cancel vs accept | status set in the filter; loser gets 409 |
| Double-tap | `idempotencyKey` sparse unique index |
| Harvest partial failure | `session.withTransaction` across Crop/Plot/CropListing/ListingImage |

---

## 4. Frontend

New shared pieces:
- `src/hooks/usePolling.js` — **the one new abstraction.** `setInterval` appears nowhere in this codebase today; three screens now need it, so build it once:
  ```js
  usePolling(fn, ms, enabled)   // useFocusEffect + AppState 'active' gate + cleanup +
                                // in-flight guard so a slow request never stacks
  ```
  Gating on focus **and** AppState is what stops a backgrounded app burning battery and Atlas connections.
- `src/components/vehicles/vehicleArt.js` — **raw SVG markup strings**, not components:
  ```js
  export const AUTO_SVG  = `<svg viewBox="0 0 64 40">…</svg>`;   // yellow-green TN auto
  export const TEMPO_SVG = `<svg viewBox="0 0 64 40">…</svg>`;   // white Ace-style van
  export const TRUCK_SVG = `<svg viewBox="0 0 64 40">…</svg>`;   // blue-cab lorry
  ```
  **Why strings and not `react-native-svg` components:** the map is an HTML page in a WebView, so `react-native-svg` cannot render there. The same art is needed in the RN vehicle picker *and* inside a Leaflet `divIcon`. One string source feeds both — `<SvgXml xml={AUTO_SVG}/>` in RN, string interpolation into `L.divIcon({html: ...})` in the page. Two art sources would drift immediately.
- `src/components/vehicles/VehicleIcon.jsx` — thin `SvgXml` wrapper for RN.
- `src/utils/geo.js` — frontend `toLatLng` mirror + `formatKm`/`formatEta`.
- `src/utils/config.js` — add `LISTINGS_MARKET`, `ORDERS: ${API_URL}/api/orders`.

### 4.1 Farmer — `src/screens/Farmer/CropDetailScreen.jsx` (MODIFY)

**Delete:** `handleMarkHarvested` (lines 295-325), the "Mark as Harvested" `TouchableOpacity` (735-744), the "🛒 Sell to Vendors" button (747-752), `openSellModal` (282-292), `handlePostListing` (328-367), the sell Modal (867-956), and `sellQty`/`sellPrice`/`userLocation` state.

**Add:** one primary button in `actionsSection`, plus the escape hatch:
```jsx
{!cropData.isHarvested ? (
  <>
    <TouchableOpacity style={styles.harvestButton} onPress={() => setShowHarvestModal(true)}>
      <Ionicons name="storefront" size={22} color="#fff" />
      <Text style={styles.harvestButtonText}>Post Harvest to FARM Market</Text>
    </TouchableOpacity>
    {/* Escape hatch — a failed crop still has to free its plot */}
    <TouchableOpacity onPress={handleHarvestOnly} style={styles.linkBtn}>
      <Text style={styles.linkBtnText}>Crop failed? Harvest without selling</Text>
    </TouchableOpacity>
  </>
) : (
  <View style={styles.harvestedBanner}>…Harvested on {date}…</View>
)}
```
`handleHarvestOnly` → `Alert.alert` confirm → `PUT /api/crops/:id/harvest` with `{ actualYield: <prompted kg, may be 0> }`.

**New `HarvestPostModal`** (`src/screens/Farmer/HarvestPostModal.jsx`), styled with the marketplace tokens (bg `#F8FAFC`, card `#fff` r18 p16, primary `#16A34A`, chips `#F8FAFC`/`#E2E8F0`, Ionicons, `ActivityIndicator color="#16A34A"`):

1. **Proof photo — required.** Reuses the exact `expo-image-picker` flow already in this file (line 18), then `expo-image-manipulator` (already installed) → `resize {width: 1200}`, `compress 0.6`, `format: JPEG` → ~120 KB.
2. **Actual harvested quantity (kg)** — explicitly kg, because `Crop.unit` may be `plants`/`saplings` and 500 plants ≠ 500 kg.
3. **Quantity to sell (kg)** — prefilled with #2, validated `≤ #2`.
4. **Minimum order (kg)** — validated `≤ #3`. Helper: *"Vendors must buy at least this much."*
5. **Price per kg (₹)** — with a "Mandi price today: ₹X" hint pulled from the existing `/api/mandi` route.
6. **Grade / notes** — optional.
7. **Pickup location — read-only chip** showing `land.location.city, district` with a pin icon, plus *"Vendors will collect from your registered land."* No GPS call, no editing.
8. Live total card, then **Post to FARM Market**.

Submit → `FormData` (identical shape to the disease-detect call at line 169-177) to `POST /api/crops/:cropId/harvest-and-list`. Send numbers as strings; the server `Number()`s them.

**New tab on `FarmerDashboard`** or a new stack screen `FarmerOrders` — "My Sales": listings (with remaining kg) + incoming pickups showing the **`pickupOtp` in large type** and the agent's name/phone/vehicle once accepted.

### 4.2 Vendor — `VendorNavigator.jsx` currently has exactly one screen. Add four.

```jsx
<Stack.Screen name="VendorDashboard" component={VendorDashboard} initialParams={{userData}} />
<Stack.Screen name="ListingDetail"   component={ListingDetailScreen} />
<Stack.Screen name="BookTransport"   component={BookTransportScreen} />
<Stack.Screen name="TrackOrder"      component={TrackOrderScreen} options={{headerShown:false}} />
<Stack.Screen name="VendorOrders"    component={VendorOrdersScreen} />
```
`VendorDashboard` does not currently receive `navigation` — it destructures only `{ route }` (line 13). Change to `{ navigation, route }`.

**`VendorDashboard` (MODIFY)** — keep the existing header/tab/card architecture and every style token; change the data layer:
- Tabs become **Market** / **My Orders** (drop the old "My Deals" offer flow).
- Add a **search bar** above the list (`#F8FAFC` r12, `#E2E8F0` border, `search-outline` icon) → 400 ms debounce → `GET /api/listings/market?q=`.
- Add a scope chip row: `[ Near me ] [ My district ] [ All Tamil Nadu ]` → `scope`/`district` params. This is how the vendor "searches farmers in other districts".
- Keep the live `getCurrentLocation()` call at mount (lines 27-38) — it is the right workaround for unreliable `User.location` — and pass `lat`/`lng` to `/market` so the server can tier by distance.
- `MarketCard` gains: the proof photo (`Image source={{uri: ${API_URL}/api/listings/photo/${item.proofImageId}}}`, 100% × 140, r12), a **distance pill** (`#EFF6FF`/`#2563EB` "12.4 km · Thanjavur" or `#FFF7ED`/`#C2410C` "Other district · 86 km"), an **available/min** chip (`"180 kg left · min 25 kg"`), and a harvest-date chip. CTA becomes **"Buy & Book Transport"** → `ListingDetail`.

**`ListingDetailScreen` (NEW)** — full-bleed proof photo, farmer name (no phone), harvest date, grade, price, available/min. Quantity stepper clamped to `[minOrderKg, quantityAvailableKg]` with a live `₹` total. → **Continue** → `BookTransport`.

**`BookTransportScreen` (NEW)** — the Uber screen:
- **Top ~55%:** `TrackingMapSurface` in preview mode — green pickup pin at the farm, red drop pin, blue route polyline, auto-`fitBounds`.
- **Destination row** (Uber-style, over the map): `● Pickup — <farm>` / `■ Drop — <tap to choose>`. Tapping the drop row opens the **existing `LocationMapPicker`** (`src/components/LocationMapPicker.jsx`) — already built, already returns `{coordinates:{lat,lng}, city, district, state, address}`. Add a "Use my saved shop" chip that fills from `User.location`, and save the chosen destination back to `User.location` on first use so it becomes the default.
- **Bottom sheet:** three vehicle rows. Each: `<VehicleIcon type={t} width={56}/>`, label + Tamil name, capacity, ETA, right-aligned bold `₹fare`. Unavailable ones are rendered at `opacity: 0.45`, untappable, with the server's `reason` in `#C2410C` (*"Auto is only available up to 20 km"* / *"Auto carries up to 300 kg"*). **Show them greyed, don't hide them** — Uber does this, and it explains the rule instead of silently omitting an option.
- Fares come from `POST /api/orders/quote` (600 ms debounce after any destination change). Never compute a fare on the client.
- **Confirm ₹grandTotal** → `POST /api/orders` with a fresh `idempotencyKey` → navigate to `TrackOrder`.

**`TrackOrderScreen` (NEW)** — Zomato-style:
- Map fills the screen; a card slides up from the bottom.
- `usePolling(fetchTrack, 5000, true)` on `GET /api/orders/:id/track`.
- **`awaiting_agent`:** pulsing "Finding a captain nearby…" + the vehicle icon + a countdown to `dispatchExpiresAt`. **`no_agents`:** Retry / Cancel.
- **`accepted`:** agent card (avatar, name, vehicle number, call button reusing the `callChip` style at `VendorDashboard.jsx:476`), *"Arriving at the farm"*, blue line = agent→farm.
- **`picked_up`:** *"On the way to you · ETA 34 min"*, blue line = farm→destination, and the **`dropOtp` in large type** — *"Share this code with the driver on delivery."*
- **Staleness, not a lie:** if `Date.now() - tracking.updatedAt > 30 s`, dim the marker and show `"Last seen 2 min ago — driver's signal is weak"`. A frozen marker that claims to be live is worse than no marker.
- **`delivered`:** a green summary card, poll stops.

### 4.3 Agent — `AgentDashboard.jsx` is a 99-line stub. Full rewrite.

`AgentNavigator.jsx:49` is **missing `initialParams={{ userData }}`** — add it, or the agent screen has no uid.

Also add `<Stack.Screen name="AgentTrip" component={AgentTripScreen} options={{headerShown:false}} />`.

**`AgentDashboard` (REWRITE)**, marketplace style language (not the old `COLORS` palette it uses today):
- **First-run onboarding sheet** if `!user.vehicle?.type`: pick auto/tempo/truck (`VehicleIcon` cards) + vehicle number → `PUT /api/users/:uid`. `RegisterScreen` never asks for this and shouldn't be touched — it works.
- **Online/Offline toggle** — big, top of screen. Offline stops all polling.
- While online: `usePolling(fetchJobs, 5000, isOnline)` → `GET /api/orders/agent/available`.
- **Rapido-captain popup:** when the first job arrives, a `Modal transparent animationType="slide"` sheet:
  - `<VehicleIcon>` + `₹agentPayout` in 32px bold `#15803D`
  - `● Pickup` farm name, village, `2.1 km away`
  - `■ Drop` destination, `18.4 km trip`
  - crop + `250 kg` + "COD — collect ₹X"
  - an animated countdown bar over ~20 s
  - **Reject** (`#F1F5F9`) | **Accept** (`#16A34A`)
  - Timeout → auto-reject. Reject → `$addToSet` on `rejectedBy`, never shown again.
  - On `409 ALREADY_TAKEN`: close with a toast, refetch. Losing a race is normal.

**`AgentTripScreen` (NEW)** — the live job:
- Map with the **full route the agent must drive** (blue polyline), his own marker, and the next waypoint pin.
- `Location.watchPositionAsync({ accuracy: Balanced, timeInterval: 5000, distanceInterval: 20 })` → `POST /api/orders/:id/location` with an incrementing `seq`.
- Stage bar: `Go to farm → Collect → Deliver`.
- **`accepted`:** "Navigate" (`Linking.openURL('google.navigation:q=lat,lng')`) + **"Enter pickup code"** → 4-digit input → `POST /:id/pickup`.
- **`picked_up`:** route redraws to the destination; **"Enter delivery code"** → `POST /:id/deliver`.
- `expo-keep-awake` (`npx expo install expo-keep-awake` — bundled in Expo Go) `useKeepAwake()` so the screen doesn't lock mid-trip, plus a persistent banner: *"Keep this screen open — tracking stops if you leave the app."*

---

## 5. `TrackingMapSurface` — the imperative API (riskiest piece)

### 5.1 What breaks today

`WebMapSurface.jsx:122` is `source={{ html: buildMapHtml(center) }}`. Two problems:
1. `buildMapHtml` **interpolates `center.lat/lng` into the HTML string**, so any center change produces different HTML → full page reload → marker, polyline and zoom all lost.
2. The object literal is rebuilt on every render, so identity is never stable.

For tracking, the center changes every 5 seconds. This must be inverted: **the HTML is built exactly once; everything afterwards is a JS call into the live page.**

### 5.2 File layout

Leave `WebMapSurface.jsx` structurally alone (it backs a working feature — LocationMapPicker). Extract only the shared basemap chunk:

- **`src/components/map/leafletBase.js` (NEW)** — exports `BASE_CSS` and `baseMapJs()` returning the Esri `{z}/{y}/{x}` satellite + labels + OSM toggle block verbatim from `WebMapSurface.jsx:44-80`, including the `maxNativeZoom: 18` comment (that was hard-won).
- **`WebMapSurface.jsx` (MODIFY, mechanical)** — import from `leafletBase`. **Verify LocationMapPicker still works before touching anything else, as its own commit.**
- **`src/components/map/TrackingMapSurface.jsx` (NEW)** — the imperative one.

### 5.3 The mechanism

```jsx
export default function TrackingMapSurface({ initialCenter, onReady, onError }) {
  const webRef   = useRef(null);
  const readyRef = useRef(false);
  const queueRef = useRef([]);

  // BUILT ONCE. `initialCenter` is captured on first render and deliberately
  // never re-read — every later camera move goes through the imperative API.
  // If this HTML string ever changes, the WebView reloads and all state is lost.
  const frozen = useRef(initialCenter).current;
  const html   = useMemo(() => buildTrackingHtml(frozen), []);      // eslint-disable-line
  const source = useMemo(() => ({ html }), [html]);                  // stable identity

  const call = useCallback((js) => {
    // Every injection is guarded and terminated with `true;`.
    // iOS WKWebView warns loudly if injected JS returns a non-serialisable value.
    const wrapped = `try{ if(window.__map){ ${js} } }catch(e){}; true;`;
    if (!readyRef.current) { queueRef.current.push(wrapped); return; }
    webRef.current?.injectJavaScript(wrapped);
  }, []);

  const api = useMemo(() => ({
    setPins:    (p, d) => call(`window.__map.setPins(${JSON.stringify(p)},${JSON.stringify(d)});`),
    setRoute:   (coords) => call(`window.__map.setRoute(${JSON.stringify(coords)});`),
    setVehicle: (lat, lng, heading, type, ms = 5000) =>
                  call(`window.__map.setVehicle(${lat},${lng},${heading},'${type}',${ms});`),
    setStale:   (on) => call(`window.__map.setStale(${!!on});`),
    fitAll:     () => call(`window.__map.fitAll();`),
    follow:     (on) => call(`window.__map.follow(${!!on});`),
  }), [call]);

  const handleMessage = (e) => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') {
      readyRef.current = true;
      queueRef.current.forEach(js => webRef.current?.injectJavaScript(js));
      queueRef.current = [];
      onReady?.(api);                    // parent receives the API only once the page can serve it
    }
    if (msg.type === 'error') onError?.(msg.detail);
  };

  return <WebView ref={webRef} originWhitelist={['*']} source={source}
                  onMessage={handleMessage} style={{flex:1}}
                  javaScriptEnabled domStorageEnabled
                  androidLayerType="hardware" />;
}
```

**Four things that make this actually work:**

1. **Freeze the source.** `useRef(initialCenter).current` + `useMemo(..., [])`. Add the eslint-disable with the comment above it, so nobody "fixes" the dependency array and silently reintroduces remounts.
2. **A named API inside the page** (`window.__map = {…}`), so each injection is one short function call rather than a blob of JS re-parsed 12 times a minute.
3. **Ready handshake + queue.** `injectJavaScript` fired before the page's `<script>` has run does nothing — `window.__map` is undefined and the ReferenceError is swallowed. The page posts `{type:'ready'}` at the end of its script; calls made earlier are queued and flushed. `onReady(api)` is how the parent learns it may start drawing — do **not** call `setPins` from a mount effect and hope.
4. **Guarded injection.** `try{ if(window.__map){…} }catch(e){}; true;` — a call that lands during a reload can never throw, and the trailing `true;` silences the iOS warning.

### 5.4 Inside the page

```js
window.__map = {
  setPins: function (p, d) { /* L.marker with .pin-pickup / .pin-drop divIcons */ },

  setRoute: function (coords) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(coords, { color: '#2563EB', weight: 5, opacity: 0.85 }).addTo(map);
  },

  // Smooth motion is done HERE, not in React Native. A requestAnimationFrame
  // lerp from the current position to the new one over the poll interval turns
  // one update per 5s into 60fps movement, with zero bridge traffic.
  setVehicle: function (lat, lng, heading, type, ms) {
    if (!vehicle) {
      vehicle = L.marker([lat, lng], { icon: L.divIcon({
        className: '', iconSize: [48, 30], iconAnchor: [24, 15],
        html: '<div class="veh" id="veh">' + ART[type] + '</div>'
      })}).addTo(map);
      return;
    }
    var from = vehicle.getLatLng(), t0 = performance.now();
    cancelAnimationFrame(raf);
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      vehicle.setLatLng([from.lat + (lat - from.lat) * k, from.lng + (lng - from.lng) * k]);
      if (following) map.panTo(vehicle.getLatLng(), { animate: false });
      if (k < 1) raf = requestAnimationFrame(step);
    })(t0);
    document.getElementById('veh').style.transform = 'rotate(' + heading + 'deg)';
  },

  setStale: function (on) { document.getElementById('veh').style.opacity = on ? 0.4 : 1; },
  fitAll: function () { map.fitBounds(L.featureGroup(layers).getBounds().pad(0.15)); },
  follow: function (on) { following = on; },
};
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
```
`ART` is `{ auto: '<svg…>', tempo: '…', truck: '…' }` — the **same strings** from `vehicleArt.js`, interpolated into the HTML at build time.

### 5.5 CDN failure

Leaflet loads from `unpkg.com`. On a bad network the page renders but `L` is undefined and you get a white rectangle with no error. Add:
```html
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        onerror="window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',detail:'leaflet'}))"></script>
```
→ RN renders a `#F8FAFC` placeholder with `map-outline` and *"Map unavailable — check your connection"*, and the tracking **card** keeps working (status, ETA, agent phone, OTP). The trip must remain completable without the map.

Not worth vendoring Leaflet locally: **the tiles come over the network anyway**, so an offline map is impossible regardless. The CDN adds no failure mode that tiles don't already have.

---

## 6. Proof photo storage — use Mongo Buffer (Pattern B)

**Decision: extend Pattern B (`SchemeImage`) into a `ListingImage` collection with a runtime write path.**

| | Verdict |
|---|---|
| **A — multer to disk** | Rejected. `server.js` has no `express.static`, so nothing on disk is reachable — that's fixable in one line, but the deeper problem is `config.js`: `API_URL` is derived from `Constants.expoConfig.hostUri`, i.e. **the Mac's current LAN IP, which changes with every Wi-Fi/hotspot switch**. A stored absolute URL goes stale the moment you move networks; a stored relative path plus disk files dies the moment you deploy to Render/Railway (ephemeral filesystem). The existing code also `fs.unlinkSync`s every upload, so there is no retention pattern to copy. |
| **B — Mongo Buffer** ✅ | **Chosen.** It is the only one of the three with a **proven serving path already in the repo** — `routes/schemes.js:15-27` sets Content-Type and a 7-day cache and works today. Photos live in Atlas next to the listing, so they survive IP churn, laptop reboots and any future host. The size objection is dead: `expo-image-manipulator` is **already installed**, so resize to 1200 px @ 0.6 quality → ~120 KB, and 512 MB of free-tier Atlas holds ~4 000 photos. The only new code is `multer.memoryStorage()` instead of `diskStorage` and a 25-line GET route copied from `schemes.js`. |
| **C — Firebase Storage** | Rejected on risk. It works in `ProfileScreen.jsx:41-43`, but `SchemeImage.js:3-9` states Storage is *"not available on this account"* — one of those is stale and **you find out which one at demo time**. Firebase Storage on the Spark plan has required a billing-enabled project for new buckets since Oct 2024; a legacy bucket may still work, but that's an unverified dependency on someone else's billing state. It also puts the image outside the transaction in §2.6, so a failed harvest leaves an orphaned blob. |

Serving route (copy `schemes.js` structure exactly):
```js
router.get('/photo/:id', async (req, res) => {
  const img = await ListingImage.findById(req.params.id);
  if (!img) return res.status(404).json({ success: false, message: 'Not found' });
  res.set('Content-Type', img.contentType);
  res.set('Cache-Control', 'public, max-age=604800');
  res.send(img.data);
});
```
Public, unauthenticated, keyed by an unguessable ObjectId — a crop photo is not sensitive and `<Image source={{uri}}>` in RN will not carry the auth header (the `fetch` patch in `apiAuthInterceptor.js` does not cover native image loading). This is deliberate; don't "fix" it by adding auth or images silently break.

---

## 7. Phasing

| Phase | Work | Demo-able at the end |
|---|---|---|
| **1 — Foundations** (½ day) | `requireRole`, `geoService`, `usePolling`, `leafletBase` extraction, `AgentNavigator` `initialParams` fix, `actualYield` bug fix, listing indexes, migration script | Nothing visible. Verify LocationMapPicker still works after the map refactor. Commit separately. |
| **2 — FARM Market** (2 days) | `CropListing` v2, `ListingImage`, `harvest-and-list`, `GET /market`, `HarvestPostModal`, `VendorDashboard` rewrite, `ListingDetailScreen` | **Full loop: farmer harvests with a proof photo → listing appears in the vendor's market, photo visible, sorted nearest-first, cross-district search works.** This alone is a complete, shippable feature. |
| **3 — Order + fare** (1.5 days) | `Order`, `routeService`, `fareService`, `/quote`, `POST /orders`, `vehicleArt`, `BookTransportScreen` | **Uber screen: pick destination on the map, see auto/tempo/truck with real OSRM road fares, auto correctly greyed out past 20 km or over 300 kg, confirm → order created, stock decrements, both vendor and farmer see it.** |
| **4 — Dispatch** (1.5 days) | `AgentDashboard` rewrite, onboarding, polling, Rapido popup, accept/reject, OTP pickup/deliver, farmer's Sales tab | **Two phones: vendor books → agent's popup fires within 5 s → accept → farmer reads out the pickup code → agent enters it → vendor reads the drop code → delivered.** The concurrency guards are testable here (two agents, one job). |
| **5 — Live tracking** (1.5 days) | `TrackingMapSurface`, `watchPositionAsync` uploads, `TrackOrderScreen`, `AgentTripScreen`, **simulation mode** | **Zomato view: 2D vehicle sliding along a blue route line, ETA counting down, leg switching at pickup; agent sees his route.** |

**Build the simulation toggle in Phase 5 first, not last.** A dev-only switch on `AgentTripScreen` that walks the agent's position along the OSRM polyline at 30 km/h and POSTs it on the normal `/location` endpoint. Without it, demoing live tracking requires two people driving a real vehicle between two real districts. With it, the whole tracking feature is demoable from one desk — and it exercises the identical server path, so it isn't a fake.

---

## 8. Risks and flaws

### Hard blockers you must design around

1. **Expo Go foreground-only tracking — unfixable.** `watchPositionAsync` dies when the app backgrounds or the screen locks. A real driver pockets the phone; tracking stops. There is no background location and no `expo-task-manager` in Expo Go. Mitigations: `expo-keep-awake` on the trip screen, a persistent "keep this screen open" banner, and — most importantly — the vendor UI **shows staleness honestly** (`"Last seen 2 min ago"`) instead of a frozen marker pretending to be live. If this ever needs to be real, it requires an EAS dev build with `expo-location`'s background mode, and that is a different app-distribution story. Say this out loud in any demo.

2. **No push notifications.** An agent who isn't holding the phone with the app open will not see a job. Polling only works while the app is foregrounded. The 20 s popup countdown then expires, the order goes `no_agents`, and the vendor retries. That is a genuine product limitation, not a bug — surface it as "Captains must be online".

3. **The farmer is cut out of the sale.** Your flow lets a vendor buy instantly and dispatch an agent to a farm gate where the farmer knows nothing. The `pickupOtp` + farmer Sales tab in §1.3/§4.1 is the minimum fix. Consider also: should the farmer be able to *decline* a sale after the fact? For a marketplace, no — "buy" must mean buy. But then the farmer must be able to **withdraw a listing** before anyone buys, which is why `PUT /:id/withdraw` is in §2.5.

4. **No payment.** COD is the right call: it is how TN agri trade actually settles, it needs zero integration, and it demos cleanly ("Collect ₹X from the vendor"). The `payment: { mode, status }` sub-document leaves room for Razorpay later — its standard checkout does run in a WebView, so it is *possible* in Expo Go, but it needs a merchant account and backend order signing. Out of scope. Decide explicitly **who bears the fare** (vendor, per this model) and **what happens on cancellation after acceptance** (currently: the vendor can't cancel — they must call the driver; that's a real gap, flag it as a known limitation).

### Things that will bite you

5. **OSRM demo server.** Fair-use, rate-limited, no SLA, occasionally slow. Handled by cache + 6 s timeout + haversine fallback + `OSRM_URL` env var from day one. Watch for: the haversine fallback silently producing a different fare than a cached OSRM quote for the same trip, which looks like a pricing bug to a user. That's why `routeSource` is stored on the order.

6. **Two location shapes, four in practice.** `User.location.coordinates{lat,lng}`, `Land.location.coordinates{lat,lng}`, `CropListing.location{lat,lng}` (flat), `locationService` `{latitude,longitude}`. Don't migrate — write `toLatLng()` once (§2.2) and use flat `{lat,lng}` in all new fields. Migrating four call sites is more risk than one 8-line adapter.

7. **`RegisterScreen` hardcodes `city:'Chennai', district:'Chennai'` for every user.** This is why proximity looked impossible. The Land-based pickup coords route around it for farmers, and `VendorDashboard`'s live `getCurrentLocation()` routes around it for vendors — but **fix registration too** (reverse-geocode + `matchTnDistrict` from `src/utils/tnDistricts.js`, which already exists for exactly this reason). Cheap, and it stops the bad data accumulating.

8. **Existing listings have no coordinates and existing users have wrong districts.** Run the migration in §1.1 *and* accept that some rows stay null. The sort in §2.5 puts coord-less listings last rather than crashing — do not skip that branch.

9. **Regex injection in the current `GET /`** — `{ $regex: city }` takes raw user input. A vendor typing `(a+)+$` can pin a CPU core. `escapeRegex()` it.

10. **`GET /api/listings` is unauthenticated and hands `farmerPhone` to anyone on the LAN.** Fix while you're in there.

11. **Unit confusion.** `Crop.unit` allows `plants`/`seeds`/`saplings`. A 500-plant tomato crop does not yield 500 kg. The harvest form must say **kg** explicitly and not prefill from `crop.quantity`.

### Smaller gaps worth a line each

12. **One trip, one farmer.** A vendor buying from three farmers in one area pays three fares. Real users will want a multi-pickup cart. Out of scope, but shape `Order.pickup` as an object now so it can become an array later without a migration.
13. **No agent verification, no ratings, no trip history.** Fine for a demo; say so.
14. **Tamil.** The app already carries `tamilName` and Tamil labels. Farmer- and agent-facing new screens should carry Tamil subtitles — cheap, and it's the product's whole identity. `vehicleArt`/`fareService` already carry the Tamil labels.
15. **Atlas free tier + 5 s polling.** Fine at demo scale. Mongoose pools connections; `requireRole`'s extra `findOne` is on a unique index. If you add agents in bulk, raise the agent poll to 8 s before anything else.
16. **The vendor's destination will be the same shop every time.** Persist it to `User.location` on first use and offer a "Use my saved shop" chip, or you'll watch them pan the map to the same market every single booking.
