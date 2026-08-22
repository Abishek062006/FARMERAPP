const mongoose = require('mongoose');

// Official department/ministry logo images for the Schemes & Subsidies
// section, stored in Mongo (not Firebase Storage — not available on this
// account). Sourced from Wikimedia Commons (public domain / government
// works), keyed by a short department key shared across schemes that
// belong to the same issuing department. Re-seed from
// backend/assets/scheme-logos/ via scripts/seedSchemeImages.js if this
// collection is ever empty.
const SchemeImageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
});

module.exports = mongoose.model('SchemeImage', SchemeImageSchema);
