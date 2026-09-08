// models/FpoAdminClaim.js
const mongoose = require('mongoose');

// A claim that "I represent this real FPO" — reviewed by a human running
// scripts/reviewFpoClaims.js, the exact pattern scripts/verifyBuyer.js
// already established for GSTIN buyer verification. There is deliberately
// no document-upload field: out of scope for this phase.
const FpoAdminClaimSchema = new mongoose.Schema({
  fpoMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'FpoMaster', required: true, index: true },
  // From req.firebaseUid server-side ONLY — never trust a client-supplied
  // uid, the hard rule this codebase applies everywhere (see CLAUDE.md).
  uid: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  // Real FPO governance roles, not free text — an FPO is an already-
  // incorporated company with elected office-bearers.
  designation: {
    type: String,
    required: true,
    enum: ['CEO', 'Manager', 'Director', 'Authorized Representative'],
  },
  email: { type: String, default: '', trim: true },

  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedAt: { type: Date, default: null },

  // Provenance. null for every claim a real person submitted through
  // POST /api/fpo-master/:id/claim for a human to review. Set to
  // 'demo_illustrative' only by scripts/seedFpoDemoData.js, which creates
  // the claim directly (server-side trusted seed data, not an unreviewed
  // claim) and auto-approves it — see that script's comment for why that
  // is not the same trust boundary as a claim submitted over HTTP.
  dataSource: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FpoAdminClaim', FpoAdminClaimSchema);
