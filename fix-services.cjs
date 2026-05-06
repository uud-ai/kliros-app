const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'klirosapp' });
const db = admin.firestore();

async function fixAllSundays() {
  const snapshot = await db.collection('days').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.services) continue;
    
    const updates = {};
    
    if (data.services.liturgy && !data.services.vespers) {
      updates['services.vespers'] = 'vespers-sunday';
    }
    if (data.services.liturgy && !data.services.matins) {
      updates['services.matins'] = 'matins-sunday';
    }
    if (data.services.liturgy && !data.services.hours) {
      updates['services.hours'] = {
        "1": "hours-1",
        "3": "hours-3",
        "6": "hours-6",
        "9": "hours-9"
      };
    }
    
    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      count++;
      console.log('Исправлен:', doc.id);
    }
  }
  
  console.log('Всего исправлено дней:', count);
}

fixAllSundays().catch(e => console.error(e));
