// One-time (re-runnable) seed script: loads the department logo PNGs from
// backend/assets/scheme-logos/ into MongoDB. Run with:
//   node scripts/seedSchemeImages.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const SchemeImage = require('../models/SchemeImage');

const LOGOS_DIR = path.join(__dirname, '..', 'assets', 'scheme-logos');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const files = fs.readdirSync(LOGOS_DIR).filter((f) => f.endsWith('.png'));

  for (const file of files) {
    const key = path.basename(file, '.png');
    const data = fs.readFileSync(path.join(LOGOS_DIR, file));

    await SchemeImage.findOneAndUpdate(
      { key },
      { key, contentType: 'image/png', data },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`✅ Seeded image: ${key} (${data.length} bytes)`);
  }

  console.log(`🎉 Done — ${files.length} scheme images seeded.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
