const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'klirosapp' });
const db = admin.firestore();
db.collection('days').doc('2026-05-24').get().then(snap => {
  if (!snap.exists) { console.log('Документ не найден'); return; }
  const d = snap.data();
  console.log('services:', JSON.stringify(d.services, null, 2));
  console.log('variables:', JSON.stringify(d.variables, null, 2));
}).catch(e => console.error(e.message));
