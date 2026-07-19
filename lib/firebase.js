import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  getDocs, 
  getDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getStorage } from "firebase/storage";

// Firebase's web configuration is public and embedded in the client build.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const firebaseVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Set persistence to LOCAL (6 months)
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence)
    .then(() => console.log("✅ Auth persistence set: 6 months"))
    .catch((error) => console.error("❌ Persistence error:", error));
}

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ 
  prompt: 'select_account' 
});
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Initialize Messaging
let messaging = null;
if (typeof window !== "undefined") {
  try {
    messaging = getMessaging(app);
    console.log("✅ Firebase Messaging initialized");
  } catch (error) {
    console.log("⚠️ Messaging not available:", error.message);
  }
}

export { messaging };

// ============================================================
// FCM TOKEN MANAGEMENT - MULTI-DEVICE SUPPORT
// ============================================================

/**
 * Get FCM Token and save to Firestore
 * Supports multiple devices per user via subcollection
 * Same email = Same userId = Multiple tokens in subcollection
 */
export const getFCMToken = async (userId) => {
  try {
    if (!messaging) {
      console.log('❌ Messaging not initialized');
      return null;
    }
    
    if (!firebaseVapidKey) {
      console.error('❌ NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured');
      return null;
    }
    
    console.log('🔑 Getting FCM token for user:', userId);
    console.log('📱 Platform:', navigator.platform);
    console.log('📱 User Agent:', navigator.userAgent.substring(0, 100));

    const serviceWorkerParams = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      storageBucket: firebaseConfig.storageBucket || '',
      messagingSenderId: firebaseConfig.messagingSenderId || '',
      appId: firebaseConfig.appId || '',
    });
    const serviceWorkerUrl = `/firebase-messaging-sw.js?${serviceWorkerParams}`;

    // Registering again updates older workers/config while preserving the scope.
    console.log('📝 Registering Firebase messaging service worker...');
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: "/",
      updateViaCache: "none",
    });
    console.log('✅ Service worker registered:', registration.scope);
    
    await navigator.serviceWorker.ready;
    console.log('✅ Service worker ready');

    // Get FCM token
    console.log('🔑 Getting FCM token with VAPID key...');
    const currentToken = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (currentToken) {
      // Detect device type
      const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
      const deviceType = isMobile ? 'mobile' : 'desktop';
      
      // Create a unique device ID based on device type and token prefix
      const deviceId = `${deviceType}_${currentToken.substring(0, 12)}`;
      
      console.log(`✅ FCM Token obtained: ${deviceType}`);
      console.log(`🔑 Token: ${currentToken.substring(0, 30)}...`);
      console.log(`📝 Device ID: ${deviceId}`);
      
      // ============================================================
      // SAVE TO SUBCOLLECTION (supports multiple devices)
      // Structure: fcmTokens/{userId}/devices/{deviceId}
      // Same user on multiple devices = multiple documents in subcollection
      // ============================================================
      await setDoc(doc(db, "fcmTokens", userId, "devices", deviceId), {
        token: currentToken,
        deviceType: deviceType,
        platform: navigator.platform || 'unknown',
        userAgent: navigator.userAgent.substring(0, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Also update main document for backward compatibility
      await setDoc(doc(db, "fcmTokens", userId), {
        latestToken: currentToken,
        deviceType: deviceType,
        platform: navigator.platform || 'unknown',
        userAgent: navigator.userAgent.substring(0, 200),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      import('./notificationDelivery')
        .then(({ flushQueuedPushNotifications }) => flushQueuedPushNotifications(userId))
        .catch((error) => console.error('Queued notification flush failed:', error));

      console.log('💾 Token saved to Firestore (subcollection + main doc)');
      return currentToken;
    } else {
      console.log('❌ No token returned - user may have blocked notifications');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
};

/**
 * Get ALL device tokens for a user
 * Reads from subcollection first, falls back to main document
 * Returns tokens sorted: mobile first, then desktop
 */
export const getAllFCMTokens = async (userId) => {
  try {
    const tokens = [];
    
    // ============================================================
    // PRIMARY: Read from subcollection (supports multiple devices)
    // ============================================================
    const devicesRef = collection(db, "fcmTokens", userId, "devices");
    const devicesSnap = await getDocs(devicesRef);
    
    if (!devicesSnap.empty) {
      devicesSnap.forEach(d => {
        const data = d.data();
        if (data.token) {
          tokens.push({
            token: data.token,
            deviceType: data.deviceType || 'unknown',
            platform: data.platform || 'unknown',
            deviceId: d.id,
          });
        }
      });
      console.log(`📱 Found ${tokens.length} devices in subcollection for user ${userId}`);
    }
    
    // ============================================================
    // FALLBACK: If subcollection is empty, check main document
    // ============================================================
    if (tokens.length === 0) {
      const mainDoc = await getDoc(doc(db, "fcmTokens", userId));
      if (mainDoc.exists()) {
        const data = mainDoc.data();
        if (data.latestToken || data.token) {
          tokens.push({
            token: data.latestToken || data.token,
            deviceType: data.deviceType || 'unknown',
            platform: data.platform || 'unknown',
            deviceId: 'legacy',
          });
        }
      }
      console.log('📱 Using fallback single token from main document');
    }
    
    // ============================================================
    // SORT: Mobile devices first (higher priority)
    // ============================================================
    tokens.sort((a, b) => {
      if (a.deviceType === 'mobile' && b.deviceType !== 'mobile') return -1;
      if (a.deviceType !== 'mobile' && b.deviceType === 'mobile') return 1;
      return 0;
    });
    
    const mobileCount = tokens.filter(t => t.deviceType === 'mobile').length;
    const desktopCount = tokens.filter(t => t.deviceType === 'desktop').length;
    
    console.log(`📊 Total tokens for user ${userId}: ${tokens.length} (${mobileCount} 📱 mobile, ${desktopCount} 🖥️ desktop)`);
    return tokens;
  } catch (error) {
    console.error('❌ Error getting all FCM tokens:', error);
    return [];
  }
};

/**
 * Check if user has any FCM tokens registered
 */
export const hasFCMToken = async (userId) => {
  try {
    const tokens = await getAllFCMTokens(userId);
    return tokens.length > 0;
  } catch {
    return false;
  }
};

/**
 * Remove a specific device token
 */
export const removeFCMToken = async (userId, deviceId) => {
  try {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "fcmTokens", userId, "devices", deviceId));
    console.log(`🗑️ Removed device token: ${deviceId}`);
    return true;
  } catch (error) {
    console.error('Error removing token:', error);
    return false;
  }
};

// ============================================================
// PUSH NOTIFICATION SETUP
// ============================================================

/**
 * Setup push notifications for a user
 * Requests permission, gets token, saves to Firestore
 */
export const setupPushNotifications = async (userId) => {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.log('❌ Notifications or Service Worker not supported');
      return false;
    }

    if (Notification.permission === "denied") {
      console.log('❌ Notification permission denied');
      await setDoc(doc(db, "notificationSettings", userId), {
        enabled: false,
        permission: "denied",
        updatedAt: new Date(),
      }, { merge: true });
      return false;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      console.log('🔔 Requesting notification permission...');
      permission = await Notification.requestPermission();
      console.log('🔔 Permission result:', permission);
    }

    if (permission === "granted") {
      const token = await getFCMToken(userId);
      console.log('✅ Notifications setup complete, token:', token ? 'Yes' : 'No');

      await setDoc(doc(db, "notificationSettings", userId), {
        enabled: true,
        permission: "granted",
        token: token || '',
        platform: navigator.platform || '',
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other',
        updatedAt: new Date(),
      }, { merge: true });

      return true;
    }

    await setDoc(doc(db, "notificationSettings", userId), {
      enabled: false,
      permission: permission,
      updatedAt: new Date(),
    }, { merge: true });

    return false;
  } catch (error) {
    console.error("❌ Error setting up notifications:", error);
    return false;
  }
};

// ============================================================
// MESSAGE LISTENER (Foreground notifications)
// ============================================================

/**
 * Listen for foreground messages
 */
export const onMessageListener = (callback) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    console.log('📬 Foreground message received:', payload);
    callback?.(payload);
  });
};
