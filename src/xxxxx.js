import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Configuration for the main project (Auth & Realtime DB)
const firebaseConfigMain = {
  apiKey: "AIzaSyB3EIkStAonDn_F21DACuW3-NM42vWUqX8",
  authDomain: "testchtf.firebaseapp.com",
  databaseURL: "https://testchtf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testchtf",
  // storageBucket should use the storage config below
  messagingSenderId: "367935774876",
  appId: "1:367935774876:web:7464591eceb618ae9d4d59",
  // measurementId: "G-H42HP6FL5E" // Optional and not needed for Auth/DB
};

// Configuration for the separate Storage project
const firebaseConfigStorage = {
  apiKey: "AIzaSyBd4LuzCnlJ4btfGWw9rkwwncXKajMG5WM",
  authDomain: "appdev-86a96.firebaseapp.com",
  // databaseURL is not needed if only using Storage from this project
  projectId: "appdev-86a96",
  storageBucket: "appdev-86a96.appspot.com",
  messagingSenderId: "808437266046",
  appId: "1:808437266046:web:7926787aef998b7d19ca2f",
  // measurementId: "G-NK1GHB5YVS" // Optional and not needed for Storage
};


// Initialize the main Firebase app (for Auth and Database)
const mainApp = initializeApp(firebaseConfigMain, "mainApp");

// Initialize the separate Firebase app for Storage, giving it a unique name
const storageApp = initializeApp(firebaseConfigStorage, "storageApp");

// Get services from the corresponding app instances
export const auth = getAuth(mainApp);
export const database = getDatabase(mainApp);
export const storage = getStorage(storageApp); // Get Storage from the storageApp instance
