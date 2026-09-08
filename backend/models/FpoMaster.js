// models/FpoMaster.js
const mongoose = require('mongoose');

// One document per REAL, already-incorporated Farmer Producer Organisation,
// sourced from SFAC's (Small Farmers' Agri-Business Consortium, Govt of
// India) official Maharashtra FPO registry
// (backend/data/sources_fpo/mh_fpo_master.json, 213 rows).
//
// This is a REGISTRY, not the working `Fpo` model. `Fpo` (models/Fpo.js) is
// the membership + revenue-share machinery F2 already ships; this is the
// list of real institutions a farmer can search, claim, and turn INTO one of
// those working `Fpo` documents once a real representative is verified.
// Same separation `Warehouse.dataSource` draws between illustrative and
// verified — see that model's comment.
const FpoMasterSchema = new mongoose.Schema({
  sNo: { type: String, default: '' },
  state: { type: String, default: 'Maharashtra' },
  district: { type: String, required: true, index: true },
  block: { type: String, default: '' },
  cbboName: { type: String, default: '' },       // Cluster-Based Business Organisation that promoted it
  fpoName: { type: String, required: true, trim: true },
  registrationNo: { type: String, required: true, unique: true, trim: true },
  registrationAct: { type: String, default: '' },
  dateOfIncorporation: { type: String, default: '' }, // kept as the source's own string (e.g. "16-Jun-21") — not reparsed, so it always matches the registry

  // Every row in this collection comes from the SFAC registry — a constant,
  // not a per-row choice, matching Warehouse.dataSource's provenance-tagging
  // convention.
  dataSource: { type: String, default: 'sfac_registry' },

  // Claim lifecycle. 'unclaimed' → 'pending' (someone applied) →
  // 'approved' (a human reviewed it, see scripts/reviewFpoClaims.js) or back
  // to 'unclaimed' on 'rejected' handling — see that script for the exact
  // transition table.
  claimStatus: {
    type: String,
    enum: ['unclaimed', 'pending', 'approved', 'rejected'],
    default: 'unclaimed',
    index: true,
  },
  // Set only once a claim is approved. Never returned to a caller who is not
  // that FPO's own admin — see routes/fpoMaster.js.
  claimedByUid: { type: String, default: null },
  // The real, working Fpo document created on approval.
  linkedFpoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fpo', default: null },
}, { timestamps: true });

FpoMasterSchema.index({ district: 1, block: 1 });

module.exports = mongoose.model('FpoMaster', FpoMasterSchema);
