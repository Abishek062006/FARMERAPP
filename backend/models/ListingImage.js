const mongoose = require('mongoose');

// Harvest proof photos, stored as binary in MongoDB.
//
// Chosen over the two alternatives already in this codebase:
//   - multer-to-disk (routes/diseases.js) writes files nothing can serve —
//     server.js has no express.static, and every upload is unlinked after
//     use. Worse, API_URL is derived from the Mac's current LAN IP, so any
//     absolute URL pointing at local disk goes stale the moment the dev
//     machine changes network.
//   - Firebase Storage works in ProfileScreen, but SchemeImage.js states it
//     is unavailable on this account. One of those is out of date, and the
//     wrong answer only shows up at demo time.
// Mongo has a proven serving path here already (GET /api/schemes/image/:key),
// travels with the listing, and depends on nobody's billing state.
//
// Kept in its OWN collection rather than embedded on CropListing: the market
// browse returns many listings at once and must not drag ~120 KB of JPEG per
// row across the wire.
const ListingImageSchema = new mongoose.Schema({
  listingId:   { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', index: true },
  ownerUid:    { type: String, required: true, index: true },
  contentType: { type: String, required: true },
  data:        { type: Buffer, required: true },
}, { timestamps: true });

module.exports = mongoose.model('ListingImage', ListingImageSchema);
