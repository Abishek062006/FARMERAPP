require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose=require('mongoose');
const User=require('../models/User'), MandiSale=require('../models/MandiSale');
const trust=require('../services/trustService');
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
(async()=>{
  await mongoose.connect(process.env.MONGODB_URI);
  const u=async e=>await User.findOne({email:e}).lean();

  const raj=await u('rajendra@demo.in');
  const chavan=await MandiSale.findOne({farmerUid:raj.firebaseUid,quantityKg:512}).lean();
  console.log('DEMO STEP 1 — the ₹2.49 sale');
  console.log('  gross', money(chavan.grossAmount), '| deductions', money(chavan.deductions.reduce((a,d)=>a+d.amount,0)), '| NET', money(chavan.netAmount));
  console.log('  card shows: "Deductions took ' + Math.round(chavan.deductions.reduce((a,d)=>a+d.amount,0)/chavan.grossAmount*100) + '% of this sale"');
  console.log('  lines:', chavan.deductions.map(d=>d.label+' '+money(d.amount)).join(', '));

  const niv=await u('nivrutti@demo.in');
  console.log('\nDEMO STEP 7 — Nivrutti\'s buyers ledger');
  for(const b of await trust.buyersForFarmer(niv.firebaseUid)){
    console.log('  '+b.buyerName.padEnd(18),
      b.scored?('band='+b.band).padEnd(14):'UNSCORED'.padEnd(14),
      't='+b.trades, 'unpaid='+b.unpaidCount,
      b.medianDaysToPay!=null?('median='+b.medianDaysToPay+'d'):'median=—',
      b.oldestUnrecordedDays?('oldest '+b.oldestUnrecordedDays+'d'):'');
  }

  console.log('\nBUYER trust (in-app orders) — must differ per buyer');
  for(const e of ['balaji@demo.in','sahyadri@demo.in','mumbaimandi@demo.in']){
    const b=await u(e); const t=await trust.forVendor(b.firebaseUid);
    console.log('  '+b.name.padEnd(18), t.scored?('band='+t.band).padEnd(14):'UNSCORED'.padEnd(14),
      't='+t.trades,'median='+t.medianDaysToPay+'d','| GSTIN:', b.business?.gstin? 'yes':'no');
  }
  await mongoose.disconnect();
})();
