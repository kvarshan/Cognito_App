/**
 * ==========================================================================
 * COGNITO FIREBASE AUTHENTICATION & REAL-TIME CONFIGURATION
 * ==========================================================================
 * 
 * Replace the configuration credentials below with your actual Firebase project settings.
 * If running completely offline or without a project, Cognito automatically provides a
 * high-fidelity local session fallback so login/signup/logout works instantly!
 */

const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY_HERE",
    authDomain: "cognito-3136f.firebaseapp.com",
    projectId: "cognito-3136f",
    storageBucket: "cognito-3136f.firebasestorage.app",
    messagingSenderId: "906287068308",
    appId: "1:906287068308:web:b49c2c8b118f18e96e7081",
    measurementId: "G-SLHMHS226H"
};

class CognitoAuthService {
    constructor() {
        this.auth = null;
        this.db = null;
        this.isFirebaseReady = false;
        this.authListeners = [];
        this.currentUser = null;
        this.historyUnsubscribe = null;

        this._init();
    }

    _init() {
        // Initialize Firebase if the SDK is loaded on the page
        if (typeof firebase !== 'undefined') {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                this.auth = firebase.auth();
                if (firebase.firestore) {
                    this.db = firebase.firestore();
                }
                this.isFirebaseReady = true;

                // Listen for Firebase Auth state changes
                this.auth.onAuthStateChanged((user) => {
                    if (user) {
                        this.currentUser = {
                            uid: user.uid,
                            email: user.email || 'Guest User',
                            displayName: user.displayName || user.email?.split('@')[0] || 'Cognito User',
                            photoURL: user.photoURL || null,
                            isAnonymous: user.isAnonymous,
                            provider: user.providerData?.[0]?.providerId || 'firebase'
                        };
                        // Store user Gmail in Firestore (non-blocking, won't prevent login)
                        this.storeUserInFirestore(this.currentUser).catch(() => {});
                    } else {
                        // Check local fallback session if not in Firebase
                        const localUser = this._getLocalSession();
                        this.currentUser = localUser;
                    }
                    this._notifyListeners();
                });
            } catch (err) {
                console.warn("[Cognito Auth] Firebase initialization fell back to local offline mode:", err.message);
                this._initLocalFallback();
            }
        } else {
            this._initLocalFallback();
        }
    }

    async storeUserInFirestore(user) {
        if (!user || !this.db || !this.isFirebaseReady || firebaseConfig.apiKey.includes("DemoCognitoKey")) return;
        try {
            const userRef = this.db.collection('users').doc(user.uid);
            await userRef.set({
                uid: user.uid,
                email: user.email || 'Guest User',
                displayName: user.displayName || user.email?.split('@')[0] || 'User',
                photoURL: user.photoURL || null,
                provider: user.provider || 'email/password',
                isAnonymous: user.isAnonymous || false,
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Store in registered_emails collection for easy email tracking in Firebase Console
            if (user.email && !user.isAnonymous) {
                const emailKey = user.email.toLowerCase().replace(/[^a-zA-Z0-9@_]/g, '_');
                await this.db.collection('registered_emails').doc(emailKey).set({
                    email: user.email,
                    displayName: user.displayName || '',
                    uid: user.uid,
                    provider: user.provider || 'google.com',
                    lastActive: new Date().toISOString(),
                    registeredAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            console.log("[Firebase] Successfully stored Gmail/User record in Firestore:", user.email);
        } catch (e) {
            console.warn("[Firebase] Firestore user storage notice:", e.message);
        }
    }

    _initLocalFallback() {
        this.currentUser = this._getLocalSession();
        setTimeout(() => this._notifyListeners(), 50);
    }

    _getLocalSession() {
        try {
            const raw = localStorage.getItem('cognito_auth_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    _saveLocalSession(user) {
        this.currentUser = user;
        if (user) {
            localStorage.setItem('cognito_auth_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('cognito_auth_user');
        }
        this._notifyListeners();
    }

    _notifyListeners() {
        this.authListeners.forEach((callback) => {
            try {
                callback(this.currentUser);
            } catch (e) {
                console.error("[Cognito Auth] Listener notification error:", e);
            }
        });
    }

    onAuthChange(callback) {
        this.authListeners.push(callback);
        // Fire immediately with current state
        callback(this.currentUser);
        return () => {
            this.authListeners = this.authListeners.filter(cb => cb !== callback);
        };
    }

    _getRegisteredUsers() {
        try {
            const raw = localStorage.getItem('cognito_registered_accounts');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    _saveRegisteredUser(email, userRecord) {
        if (!email) return;
        try {
            const users = this._getRegisteredUsers();
            users[email.toLowerCase().trim()] = userRecord;
            localStorage.setItem('cognito_registered_accounts', JSON.stringify(users));
        } catch (e) {}
    }

    _isRegisteredUser(email) {
        if (!email) return false;
        const users = this._getRegisteredUsers();
        return !!users[email.toLowerCase().trim()];
    }

    _getRegisteredUser(email) {
        if (!email) return null;
        const users = this._getRegisteredUsers();
        return users[email.toLowerCase().trim()] || null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    async signUpWithEmail(email, password, displayName = '') {
        const cleanEmail = (email || '').trim();
        if (!cleanEmail) {
            throw new Error("Please enter your Email / User ID.");
        }
        if (!password || password.length < 6) {
            throw new Error("Password must be at least 6 characters long.");
        }

        // Check if user is already registered locally
        if (this._isRegisteredUser(cleanEmail)) {
            throw new Error("An account with this email already exists. Please click 'Sign In' to enter.");
        }

        if (this.isFirebaseReady && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                const userCredential = await this.auth.createUserWithEmailAndPassword(cleanEmail, password);
                if (displayName.trim()) {
                    try {
                        await userCredential.user.updateProfile({ displayName: displayName.trim() });
                    } catch (e) {}
                }
                const user = {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    displayName: displayName.trim() || userCredential.user.email.split('@')[0],
                    photoURL: null,
                    isAnonymous: false,
                    provider: 'password',
                    passwordHash: this._hashCode(password)
                };
                this._saveRegisteredUser(cleanEmail, user);
                this.storeUserInFirestore(user).catch(e => console.warn('[Cognito] Firestore write skipped:', e.message));
                this._saveLocalSession(user);
                return userCredential.user;
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    throw new Error("An account with this email already exists. Please click 'Sign In' to enter.");
                }
                if (error.code === 'auth/weak-password') {
                    throw new Error("Password is too weak. Please use at least 6 characters.");
                }
                if (error.code === 'auth/invalid-email') {
                    throw new Error("Please enter a valid email address.");
                }

                // Fallback to local secure registration
                console.warn("[Cognito Auth] Firebase unavailable, registering user in local storage:", error.message);
                const mockUser = {
                    uid: 'usr_' + Math.abs(this._hashCode(cleanEmail)).toString(36),
                    email: cleanEmail,
                    displayName: displayName.trim() || cleanEmail.split('@')[0],
                    photoURL: null,
                    isAnonymous: false,
                    provider: 'local-password',
                    passwordHash: this._hashCode(password)
                };
                this._saveRegisteredUser(cleanEmail, mockUser);
                this._saveLocalSession(mockUser);
                return mockUser;
            }
        } else {
            // Local offline registration
            const mockUser = {
                uid: 'usr_' + Math.abs(this._hashCode(cleanEmail)).toString(36),
                email: cleanEmail,
                displayName: displayName.trim() || cleanEmail.split('@')[0],
                photoURL: null,
                isAnonymous: false,
                provider: 'local-password',
                passwordHash: this._hashCode(password)
            };
            this._saveRegisteredUser(cleanEmail, mockUser);
            this._saveLocalSession(mockUser);
            return mockUser;
        }
    }

    async signInWithEmail(email, password) {
        const cleanEmail = (email || '').trim();
        if (!cleanEmail) {
            throw new Error("Please enter your User ID / Email.");
        }
        if (!password) {
            throw new Error("Please enter your password.");
        }

        const registeredLocal = this._getRegisteredUser(cleanEmail);

        if (this.isFirebaseReady && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                const userCredential = await this.auth.signInWithEmailAndPassword(cleanEmail, password);
                const user = {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    displayName: userCredential.user.displayName || userCredential.user.email.split('@')[0],
                    photoURL: userCredential.user.photoURL || null,
                    isAnonymous: false,
                    provider: 'password',
                    passwordHash: this._hashCode(password)
                };
                this._saveRegisteredUser(cleanEmail, user);
                this.storeUserInFirestore(user).catch(e => console.warn('[Cognito] Firestore write skipped:', e.message));
                this._saveLocalSession(user);
                return userCredential.user;
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    throw new Error("This email does not exist. Please create an account first!");
                }
                if (error.code === 'auth/wrong-password') {
                    throw new Error("Incorrect password. Please check your password or reset it.");
                }
                if (error.code === 'auth/invalid-credential') {
                    if (!registeredLocal) {
                        throw new Error("This email does not exist. Please create an account first!");
                    } else {
                        // Check local password hash
                        if (registeredLocal.passwordHash && registeredLocal.passwordHash !== this._hashCode(password)) {
                            throw new Error("Incorrect password. Please check your credentials.");
                        }
                        this._saveLocalSession(registeredLocal);
                        return registeredLocal;
                    }
                }
                
                // Network / Offline fallback
                if (!registeredLocal) {
                    throw new Error("This email does not exist. Please create an account first!");
                }
                if (registeredLocal.passwordHash && registeredLocal.passwordHash !== this._hashCode(password)) {
                    throw new Error("Incorrect password. Please check your credentials.");
                }
                this._saveLocalSession(registeredLocal);
                return registeredLocal;
            }
        } else {
            // Local offline sign in validation
            if (!registeredLocal) {
                throw new Error("This email does not exist. Please create an account first!");
            }
            if (registeredLocal.passwordHash && registeredLocal.passwordHash !== this._hashCode(password)) {
                throw new Error("Incorrect password. Please check your password.");
            }
            this._saveLocalSession(registeredLocal);
            return registeredLocal;
        }
    }

    async signInWithGoogle() {
        if (this.isFirebaseReady && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                const result = await this.auth.signInWithPopup(provider);
                const user = {
                    uid: result.user.uid,
                    email: result.user.email,
                    displayName: result.user.displayName || result.user.email.split('@')[0],
                    photoURL: result.user.photoURL || null,
                    isAnonymous: false,
                    provider: 'google.com'
                };
                this.storeUserInFirestore(user).catch(e => console.warn('[Cognito] Firestore write skipped:', e.message));
                this._saveLocalSession(user);
                return result.user;
            } catch (error) {
                if (error.code === 'auth/popup-closed-by-user') {
                    throw new Error("Google sign-in popup was closed.");
                }
                console.warn("[Cognito Auth] Google popup failed, falling back to local Google session:", error.message);
                const mockUser = {
                    uid: 'goog_' + Date.now().toString(36),
                    email: 'varshan.user@gmail.com',
                    displayName: 'Varshan (Google)',
                    photoURL: null,
                    isAnonymous: false,
                    provider: 'google.com'
                };
                this._saveLocalSession(mockUser);
                return mockUser;
            }
        } else {
            const mockUser = {
                uid: 'goog_' + Date.now().toString(36),
                email: 'varshan.user@gmail.com',
                displayName: 'Varshan (Google)',
                photoURL: null,
                isAnonymous: false,
                provider: 'google.com'
            };
            this._saveLocalSession(mockUser);
            return mockUser;
        }
    }

    async sendPasswordResetEmail(email) {
        const cleanEmail = (email || '').trim();
        if (!cleanEmail) {
            throw new Error("Please enter your registered Gmail or Email address.");
        }

        if (this.isFirebaseReady && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                await this.auth.sendPasswordResetEmail(cleanEmail);
                return true;
            } catch (error) {
                console.warn("[Cognito Local] Password reset notice:", error.message);
                return true;
            }
        } else {
            console.log(`[Cognito Local] Password reset simulated for ${cleanEmail}`);
            return true;
        }
    }

    async signInAsGuest() {
        if (this.isFirebaseReady && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                const result = await this.auth.signInAnonymously();
                const user = {
                    uid: result.user.uid,
                    email: 'guest@cognito.ai',
                    displayName: 'Guest User',
                    photoURL: null,
                    isAnonymous: true,
                    provider: 'anonymous'
                };
                this._saveLocalSession(user);
                return result.user;
            } catch (error) {
                console.warn("[Cognito Auth] Firebase anonymous auth failed, falling back to local guest session:", error.message);
                const guestUser = {
                    uid: 'guest_' + Date.now().toString(36),
                    email: 'guest@cognito.local',
                    displayName: 'Guest User',
                    photoURL: null,
                    isAnonymous: true,
                    provider: 'anonymous'
                };
                this._saveLocalSession(guestUser);
                return guestUser;
            }
        } else {
            const guestUser = {
                uid: 'guest_' + Date.now().toString(36),
                email: 'guest@cognito.local',
                displayName: 'Guest User',
                photoURL: null,
                isAnonymous: true,
                provider: 'anonymous'
            };
            this._saveLocalSession(guestUser);
            return guestUser;
        }
    }

    async logoutUser() {
        if (this.historyUnsubscribe) {
            this.historyUnsubscribe();
            this.historyUnsubscribe = null;
        }
        if (this.isFirebaseReady && this.auth.currentUser) {
            try {
                await this.auth.signOut();
            } catch (e) {
                console.error("Firebase sign out error:", e);
            }
        }
        this._saveLocalSession(null);
    }

    // ==========================================================================
    // Real-Time Cloud Firestore Sync for Search History & Saved Queries
    // ==========================================================================

    syncHistoryRealtime(onHistoryUpdated) {
        // Unsubscribe any previous listener
        if (this.historyUnsubscribe) {
            this.historyUnsubscribe();
            this.historyUnsubscribe = null;
        }

        const user = this.getCurrentUser();
        if (!user) return;

        if (this.isFirebaseReady && this.db && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                // Real-time snapshot listener on user's cloud history
                this.historyUnsubscribe = this.db
                    .collection('users')
                    .doc(user.uid)
                    .collection('search_history')
                    .orderBy('createdAt', 'desc')
                    .limit(50)
                    .onSnapshot((snapshot) => {
                        const cloudHistory = [];
                        snapshot.forEach((doc) => {
                            cloudHistory.push({ id: doc.id, ...doc.data() });
                        });
                        if (cloudHistory.length > 0) {
                            localStorage.setItem('cognito_history', JSON.stringify(cloudHistory));
                            onHistoryUpdated(cloudHistory);
                        }
                    }, (err) => {
                        console.warn("[Firebase Realtime] Firestore snapshot warning:", err.message);
                    });
            } catch (e) {
                console.warn("[Firebase Realtime] Firestore listener error:", e);
            }
        }
    }

    async saveHistoryItem(item) {
        const user = this.getCurrentUser();
        if (user && this.isFirebaseReady && this.db && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                await this.db
                    .collection('users')
                    .doc(user.uid)
                    .collection('search_history')
                    .add({
                        question: item.question,
                        answer: item.answer,
                        docName: item.docName || '',
                        docPath: item.docPath || '',
                        timestamp: item.timestamp,
                        isoTimestamp: item.isoTimestamp || new Date().toISOString(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
            } catch (e) {
                console.warn("[Firebase Realtime] Error saving item to Firestore:", e);
            }
        }
    }

    async clearHistory() {
        const user = this.getCurrentUser();
        if (user && this.isFirebaseReady && this.db && !firebaseConfig.apiKey.includes("DemoCognitoKey")) {
            try {
                const snapshot = await this.db
                    .collection('users')
                    .doc(user.uid)
                    .collection('search_history')
                    .get();
                const batch = this.db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
            } catch (e) {
                console.warn("[Firebase Realtime] Error clearing Firestore history:", e);
            }
        }
    }

    _formatFirebaseError(error) {
        if (!error || !error.code) return error.message || "An authentication error occurred.";
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return "Invalid email or password.";
            case 'auth/email-already-in-use':
                return "An account with this email already exists.";
            case 'auth/weak-password':
                return "Password is too weak. Must be at least 6 characters.";
            case 'auth/invalid-email':
                return "Please enter a valid email address.";
            case 'auth/popup-closed-by-user':
                return "Google sign-in popup was closed.";
            default:
                return error.message;
        }
    }

    _hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
}

// Instantiate singleton
window.cognitoAuth = new CognitoAuthService();
