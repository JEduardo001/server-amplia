var admin = require("firebase-admin");
//archivo no subido
var serviceAccount = require("./credenciales/amplia-1ab43-firebase-adminsdk-fbsvc-c36205c5af.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gs://amplia-1ab43.firebasestorage.app"
});

const auth = admin.auth();   
const db = admin.firestore();
const bucket = admin.storage().bucket() 

module.exports = { auth, db, admin, bucket };
 