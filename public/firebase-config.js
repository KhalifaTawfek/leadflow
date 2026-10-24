// Firebase web config (PUBLIC — safe to ship in the browser).
//
// HOW TO FILL THIS IN (about 10 minutes, free):
//   1. Go to https://console.firebase.google.com and create a project.
//   2. Build > Authentication > Get started. Enable "Email/Password" and "Google".
//   3. Project settings (gear icon) > "Your apps" > add a Web app (</>).
//   4. Copy the firebaseConfig values it shows into the object below.
//   5. Authentication > Settings > Authorized domains: add shop.cookblog.net
//      (and your new domain when you buy it).
//   6. On the server, set the matching service account (see .env.example / README),
//      then redeploy. Until BOTH are set, the site uses its built-in login.
//
// While the apiKey still starts with "PASTE", the site keeps its original
// username/password login, so nothing breaks before you finish setup.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOzyrYAqawZlk8O7_VbeYDsi5eUGO3Tvg",
  authDomain: "leadflow-ai-4b916.firebaseapp.com",
  projectId: "leadflow-ai-4b916",
  storageBucket: "leadflow-ai-4b916.firebasestorage.app",
  messagingSenderId: "67894658227",
  appId: "1:67894658227:web:2870b3c4a3e97032e15cc6",
  measurementId: "G-59LK9VR4QC"
};
