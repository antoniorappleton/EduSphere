const cron = require('node-cron');
const notifier = require('node-notifier');
const path = require('path');

console.log('Scheduler for EduSphere Notifications started...');
console.log('Time:', new Date().toISOString());

// Schedule task to run every minute
cron.schedule('* * * * *', () => {
  console.log('------------------------------------------------');
  console.log(`[${new Date().toISOString()}] Triggering notification task...`);
  
  sendNotification();
});

function sendNotification() {
  // 1. Local Desktop Notification (Immediate Proof)
  notifier.notify({
    title: 'EduSphere Autonóma',
    message: 'Esta é a tua notificação agendada de 1 em 1 minuto.',
    sound: true, // Play system sound
    wait: false // Wait for user action
  });

  console.log('Desktop notification sent.');

  // 2. Future FCM Integration (Placeholder)
  // To use Firebase Cloud Messaging:
  // const admin = require("firebase-admin");
  // ... initialize app with service account ...
  // admin.messaging().send(...);
}
