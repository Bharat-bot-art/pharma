const bcrypt = require('bcryptjs');
const { db, migrate } = require('../config/db');

const ADMIN_EMAIL = 'admin@biosym.pharma';
const ADMIN_PASSWORD = 'Admin@123';

function category(id, name, slug, description, imageColor, icon) {
  return { id, name, slug, description, imageColor, icon };
}

function product(categoryId, name, slug, short, desc, mrp, price, stock, rx, rating, ratingCount, featured, hue, tags) {
  return { categoryId, name, slug, short, desc, mrp, price, stock, rx, rating, ratingCount, featured, hue, tags };
}

const categories = [
  category(1, 'Pain & Fever Relief', 'pain-fever', 'Trusted relief for headaches, body ache and fever for the whole family.', '#0e7a5f', 'thermometer'),
  category(2, 'Antibiotics (Rx)', 'antibiotics', 'Prescription antibiotics for bacterial infections. Sold on prescription only.', '#1d4ed8', 'pill'),
  category(3, 'Vitamins & Supplements', 'vitamins', 'Daily wellness essentials — vitamins, minerals and immunity boosters.', '#0891b2', 'vitamin'),
  category(4, 'Cough & Cold', 'cough-cold', 'Soothing syrups, lozenges and cold-relief tablets.', '#7c3aed', 'syrup'),
  category(5, 'Digestive Health', 'digestive', 'Antacids, probiotics and gut-health support.', '#b45309', 'stomach'),
  category(6, 'Skin Care', 'skin-care', 'Dermatologist-trusted creams, ointments and medicated skincare.', '#be185d', 'droplet'),
  category(7, 'Diabetes Care', 'diabetes', 'Monitors, strips and diabetic-friendly nutrition.', '#c2410c', 'glucose'),
  category(8, 'Baby & Mother Care', 'baby-care', 'Gentle baby care and mother-health essentials.', '#4d7c0f', 'baby'),
];

const products = [
  product(1, 'Paracetamol 650mg Tablets', 'paracetamol-650mg', 'Fast-acting fever & pain relief tablets, 15 tablets.', 'Effective relief from fever, headache and body ache. Safe when taken as directed. Each pack contains 15 film-coated tablets.', 45.0, 32.0, 500, 0, 4.6, 1820, 1, 210, 'analgesic,antipyretic'),
  product(1, 'Ibuprofen 400mg Tablets', 'ibuprofen-400mg', 'Anti-inflammatory pain relief for muscle and joint pain.', 'Non-steroidal anti-inflammatory for muscle, joint and menstrual pain. 10 tablets per strip.', 60.0, 41.0, 420, 0, 4.4, 930, 0, 8, 'pain,joint'),
  product(1, 'Diclofenac Gel 30g', 'diclofenac-gel', 'Topical gel for localised pain and inflammation.', 'Apply locally for relief from joint pain, backache and sprains. 30g tube.', 95.0, 72.0, 300, 0, 4.3, 610, 0, 150, 'pain,topical'),
  product(1, 'Aspirin 75mg Tablets', 'aspirin-75mg', 'Low-dose aspirin for cardiovascular support (as directed).', 'Blood-thinning aspirin tablets, 14 per strip. Use only as directed by your physician.', 35.0, 26.0, 260, 1, 4.2, 340, 0, 330, 'cardio,blood'),
  product(2, 'Amoxicillin 500mg Capsules', 'amoxicillin-500mg', 'Broad-spectrum antibiotic capsules (Rx required).', 'Antibiotic for bacterial infections. Prescription essential — complete the full course as advised by your doctor.', 120.0, 89.0, 180, 1, 4.5, 740, 1, 260, 'antibiotic,rx'),
  product(2, 'Azithromycin 500mg Tablets', 'azithromycin-500mg', 'Macrolide antibiotic, 3-tablet course (Rx required).', 'Effective against a range of bacterial infections. Prescription only — take exactly as prescribed.', 95.0, 78.0, 200, 1, 4.4, 520, 0, 40, 'antibiotic,rx'),
  product(2, 'Cefixime 200mg Tablets', 'cefixime-200mg', 'Cephalosporin antibiotic for bacterial infections (Rx).', 'Third-generation cephalosporin. Prescription only. Complete the prescribed course.', 160.0, 122.0, 150, 1, 4.2, 260, 0, 280, 'antibiotic,rx'),
  product(2, 'Metronidazole 400mg Tablets', 'metronidazole-400mg', 'Antiprotozoal & antibacterial tablets (Rx required).', 'Treats amoebiasis and certain bacterial infections. 10 tablets. Prescription required.', 55.0, 42.0, 320, 1, 4.1, 410, 0, 20, 'antibiotic,gi'),
  product(3, 'Vitamin D3 60K Capsules', 'vitamin-d3-60k', 'Weekly immunity & bone-health Vitamin D3 supplement.', 'Supports bone strength, immunity and calcium absorption. 4 capsules, one per week.', 110.0, 74.0, 600, 0, 4.7, 2140, 1, 45, 'vitamin,immunity,bone'),
  product(3, 'Multivitamin with Zinc Tablets', 'multivitamin-zinc', 'Complete daily multivitamin with zinc — 30 tablets.', '13 essential vitamins and minerals with zinc for daily immunity and energy. One tablet a day.', 190.0, 124.0, 540, 0, 4.6, 1580, 1, 190, 'vitamin,immunity'),
  product(3, 'Omega-3 Fish Oil Softgels', 'omega-3-fish-oil', '1000mg Omega-3 for heart, brain and joint health.', 'High-purity EPA/DHA fish oil softgels. 60 capsules. Supports heart & brain function.', 340.0, 228.0, 380, 0, 4.5, 870, 0, 170, 'heart,omega'),
  product(3, 'Calcium + Vitamin D3 Tablets', 'calcium-vitamin-d3', 'Bone-strength formula with calcium and Vitamin D3.', 'For stronger bones and teeth. 30 effervescent tablets.', 165.0, 112.0, 460, 0, 4.4, 730, 0, 120, 'bone,calcium'),
  product(3, 'Iron + Folic Acid Tablets', 'iron-folic-acid', 'Supports healthy haemoglobin levels (30 tablets).', 'Iron and folic acid for blood health and energy. Ideal for anaemia support.', 85.0, 59.0, 480, 0, 4.3, 680, 0, 350, 'iron,blood'),
  product(4, 'Cough Syrup 100ml', 'cough-syrup-100ml', 'Soothing honey-based cough syrup for dry & wet cough.', 'Gives soothing relief from cough and throat irritation. 100ml bottle.', 98.0, 72.0, 520, 0, 4.4, 960, 0, 230, 'cough,throat'),
  product(4, 'Cetirizine 10mg Tablets', 'cetirizine-10mg', 'Allergy & cold relief tablets, 15 tablets.', 'Relieves sneezing, runny nose and allergic rhinitis. 15 tablets per strip.', 40.0, 26.0, 620, 0, 4.5, 1240, 1, 0, 'allergy,cold'),
  product(4, 'Cold Relief Combo Pack', 'cold-relief-combo', 'Paracetamol + Phenylephrine for cold symptoms.', 'Day-and-night cold symptom relief pack for adults.', 115.0, 84.0, 340, 0, 4.2, 420, 0, 300, 'cold,flu'),
  product(5, 'Antacid Suspension 170ml', 'antacid-suspension', 'Fast relief from acidity, heartburn and gas.', 'Neutralises excess stomach acid for fast acidity relief. 170ml.', 75.0, 51.0, 560, 0, 4.4, 1180, 0, 90, 'acidity,gas'),
  product(5, 'Probiotic Capsules 30s', 'probiotic-capsules', '10 billion CFU gut-health probiotic capsules.', 'Restores healthy gut flora for better digestion. 30 capsules.', 260.0, 178.0, 350, 0, 4.5, 640, 0, 130, 'gut,probiotic'),
  product(5, 'Lactulose Syrup 200ml', 'lactulose-syrup', 'Gentle constipation relief for adults & children.', 'Osmotic laxative for gentle, predictable constipation relief. 200ml.', 145.0, 108.0, 280, 0, 4.3, 520, 0, 20, 'constipation,gi'),
  product(6, 'Moisturising Skin Cream 50g', 'moisturising-cream', 'Deep-hydration cream for dry and sensitive skin.', 'Clinically tested moisture barrier for dry skin. Fragrance-free. 50g.', 220.0, 158.0, 390, 0, 4.5, 890, 0, 15, 'skin,moisture'),
  product(6, 'Antifungal Cream 30g', 'antifungal-cream', 'Clotrimazole cream for fungal skin infections.', 'Treats athlete\'s foot, ringworm and fungal rashes. 30g.', 90.0, 63.0, 420, 0, 4.3, 570, 0, 270, 'skin,antifungal'),
  product(6, 'Sunscreen SPF 50 PA+++', 'sunscreen-spf50', 'Broad-spectrum sun protection with SPF 50.', 'Non-greasy, water-resistant sunscreen for daily use. 60ml.', 310.0, 224.0, 310, 0, 4.6, 1020, 0, 35, 'sun,sunscreen'),
  product(7, 'Blood Glucose Monitor Kit', 'glucose-monitor-kit', 'Complete diabetes monitoring kit with 25 strips.', 'Instant, accurate glucose readings. Kit includes monitor, 25 strips and lancets.', 890.0, 649.0, 120, 0, 4.6, 780, 1, 100, 'diabetes,monitor'),
  product(7, 'Glucose Test Strips 50s', 'glucose-test-strips', '50 test strips compatible with leading glucometers.', 'High-accuracy test strips for daily glucose monitoring. 50 per vial.', 420.0, 329.0, 220, 0, 4.5, 640, 0, 25, 'diabetes,strips'),
  product(7, 'Sugar-Free Digestive Biscuits', 'sugar-free-biscuits', 'Diabetic-friendly digestive biscuits, 200g.', 'Low-GI, sugar-free biscuits formulated for diabetic nutrition.', 85.0, 62.0, 400, 0, 4.2, 390, 0, 40, 'diabetic,health'),
  product(8, 'Baby Diapers Size M (56s)', 'baby-diapers-m', 'Ultra-soft, leak-proof diapers for 7–12 kg babies.', 'Breathable and gentle on baby skin with wetness indicator. Pack of 56.', 649.0, 489.0, 140, 0, 4.6, 1150, 1, 320, 'baby,comfort'),
  product(8, 'Baby Powder 200g', 'baby-powder', 'Gentle, talc-free baby powder for delicate skin.', 'Dermatologically tested, keeps baby skin soft and dry.', 140.0, 99.0, 260, 0, 4.4, 460, 0, 200, 'baby,skin'),
  product(8, 'Postnatal Multivitamin Tablets', 'postnatal-vitamins', 'Complete nutrition support for new mothers.', 'Folic acid, iron, calcium and DHA for mother & baby health. 60 tablets.', 380.0, 289.0, 180, 0, 4.7, 530, 0, 290, 'mother,postnatal'),
];

function run() {
  migrate();

  const existing = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (existing > 0) {
    console.log('Seed skipped — data already present.');
    return;
  }

  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, slug, description, image_color, icon) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const c of categories) {
    insertCategory.run(c.id, c.name, c.slug, c.description, c.imageColor, c.icon);
  }
  console.log(`Categories seeded: ${categories.length}`);

  const insertProduct = db.prepare(
    `INSERT INTO products
      (category_id, name, slug, short_description, description, mrp, price, stock,
       is_prescription, rating, rating_count, featured, image_hue, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of products) {
    insertProduct.run(
      p.categoryId, p.name, p.slug, p.short, p.desc, p.mrp, p.price, p.stock,
      p.rx, p.rating, p.ratingCount, p.featured, p.hue, p.tags
    );
  }
  console.log(`Products seeded: ${products.length}`);

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!adminExists) {
    db.prepare(
      `INSERT INTO users (full_name, email, mobile, password_hash, role, is_email_verified, is_mobile_verified, is_active)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1)`
    ).run('BIOSYM Administrator', ADMIN_EMAIL, '9000000000', hash, 'admin');
    console.log('Admin user seeded.');
  }

  console.log('Database seeded successfully.');
}

run();
