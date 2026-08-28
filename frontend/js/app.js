/* ==========================================================================
   COGNITO APP CONTROLLER - SPA Router and API Coordinator
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // API endpoint base URL (local server)
    const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';

    // Get the currently authenticated user's Firebase UID for multi-user isolation
    function getCurrentUserId() {
        if (window.cognitoAuth) {
            const user = window.cognitoAuth.getCurrentUser();
            return user ? user.uid : '';
        }
        return '';
    }

    // Build a localStorage key namespaced by user ID
    function getHistoryStorageKey() {
        const uid = getCurrentUserId();
        return uid ? `cognito_history_${uid}` : 'cognito_history';
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // State indicators
    let isTrained = false;
    let indexedDocs = [];
    let activeTab = 'dashboard-view';
    
    // Color mapping for file extensions
    const typeColors = {
        'PDF': '#f43f5e',
        'Word (DOCX)': '#3b82f6',
        'PowerPoint (PPTX)': '#f97316',
        'Text (TXT)': '#64748b',
        'Markdown (MD)': '#10b981',
        'CSV': '#8b5cf6',
        'Log (LOG)': '#7c3aed',
        'JSON': '#ec4899'
    };

    const typeIcons = {
        'PDF': 'fa-file-pdf',
        'Word (DOCX)': 'fa-file-word',
        'PowerPoint (PPTX)': 'fa-file-powerpoint',
        'Text (TXT)': 'fa-file-lines',
        'Markdown (MD)': 'fa-file-code',
        'CSV': 'fa-file-csv',
        'Log (LOG)': 'fa-file-lines',
        'JSON': 'fa-file-code'
    };

    // DOM Elements
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    // Dashboard Elements
    const directoryPathInput = document.getElementById('directory-path');
    const scanBtn = document.getElementById('scan-btn');
    const demoBtn = document.getElementById('demo-btn');
    const trainBtn = document.getElementById('train-btn');
    const terminalLogs = document.getElementById('terminal-logs');
    
    const statTotalDocs = document.getElementById('stat-total-docs');
    const statTotalSize = document.getElementById('stat-total-size');
    const statClusters = document.getElementById('stat-clusters');
    const breakdownBar = document.getElementById('breakdown-bar');
    const breakdownList = document.getElementById('breakdown-list');

    // Search Elements
    const searchQueryInput = document.getElementById('search-query');
    const searchBtn = document.getElementById('search-btn');
    const filterTypeChips = document.querySelectorAll('#filter-type-chips .chip');
    const searchClusterFilter = document.getElementById('search-cluster-filter');
    const searchFilenameFilter = document.getElementById('search-filename-filter');
    const chatMessagesContainer = document.getElementById('chat-messages-container');

    // Document Drawer Elements
    const documentDrawer = document.getElementById('document-drawer');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const drawerFilename = document.getElementById('drawer-filename');
    const drawerPath = document.getElementById('drawer-path');
    const drawerTypeBadge = document.getElementById('drawer-type-badge');
    const drawerSizeBadge = document.getElementById('drawer-size-badge');
    const drawerClusterBadge = document.getElementById('drawer-cluster-badge');
    const drawerOpenFolderBtn = document.getElementById('drawer-open-folder-btn');
    const drawerTextBody = document.getElementById('drawer-text-body');

    // Mobile Sync Elements
    const syncIpVal = document.getElementById('sync-ip-val');
    const syncStatusDot = document.getElementById('sync-status-dot');
    const syncStatusText = document.getElementById('sync-status-text');

    // History Elements
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // Firebase Auth Elements
    const openAuthModalBtn = document.getElementById('open-auth-modal-btn');
    const closeAuthModalBtn = document.getElementById('close-auth-modal-btn');
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const groupDisplayName = document.getElementById('group-display-name');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authDisplayName = document.getElementById('auth-display-name');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authAlert = document.getElementById('auth-alert');
    const authAlertMsg = document.getElementById('auth-alert-msg');
    const authModalTitle = document.getElementById('auth-modal-title');
    const googleAuthBtn = document.getElementById('google-auth-btn');
    const guestAuthBtn = document.getElementById('guest-auth-btn');
    const authLogoutBtn = document.getElementById('auth-logout-btn');
    const userLoggedOut = document.getElementById('user-logged-out');
    const userLoggedIn = document.getElementById('user-logged-in');
    const userDisplayName = document.getElementById('user-display-name');
    const userEmailText = document.getElementById('user-email-text');

    // Full-Screen Auth Gate Elements
    const authGateScreen = document.getElementById('auth-gate-screen');
    const appContainer = document.getElementById('app-container');
    const gateAuthTitle = document.getElementById('gate-auth-title');
    const gateTabLogin = document.getElementById('gate-tab-login');
    const gateTabSignup = document.getElementById('gate-tab-signup');
    const gateAuthAlert = document.getElementById('gate-auth-alert');
    const gateAuthAlertMsg = document.getElementById('gate-auth-alert-msg');
    const gateAuthForm = document.getElementById('gate-auth-form');
    const gateGroupDisplayName = document.getElementById('gate-group-display-name');
    const gateAuthDisplayName = document.getElementById('gate-auth-display-name');
    const gateAuthEmail = document.getElementById('gate-auth-email');
    const gateAuthPassword = document.getElementById('gate-auth-password');
    const gateAuthSubmitBtn = document.getElementById('gate-auth-submit-btn');
    const gateGoogleAuthBtn = document.getElementById('gate-google-auth-btn');
    const gateGuestAuthBtn = document.getElementById('gate-guest-auth-btn');

    let currentGateMode = 'signup'; // 'signup' or 'login'
    let currentAuthMode = 'signup'; // 'signup' or 'login'

    // Initialize Map Visualizer
    const docMap = new DocumentMap('document-map-canvas', 'map-node-tooltip', openDocumentDrawer);

    // ==========================================================================
    // 0. Strict Firebase Authentication & Gate Controller
    // ==========================================================================
    
    function updateAuthUI(user) {
        if (user) {
            // Unlock Application
            if (authGateScreen) authGateScreen.classList.add('hidden');
            if (appContainer) appContainer.classList.remove('hidden');

            userLoggedOut.classList.add('hidden');
            userLoggedIn.classList.remove('hidden');
            userDisplayName.innerText = user.displayName || 'Cognito User';
            userEmailText.innerText = user.isAnonymous ? 'Guest Session' : (user.email || 'user@cognito.ai');
            hideAuthModal();

            // Connect Real-Time Cloud Firestore Sync for this user
            if (window.cognitoAuth) {
                window.cognitoAuth.syncHistoryRealtime((cloudHistory) => {
                    if (activeTab === 'history-view') {
                        renderSearchHistory();
                    }
                });
            }

            // Refresh all data for the newly logged-in user and restore state
            fetchDocuments(true).then(() => {
                const savedTab = localStorage.getItem(`cognito_active_tab_${user.uid}`);
                if (savedTab && savedTab !== 'dashboard-view') {
                    switchTab(savedTab);
                }
            });
            fetchSyncStatus();
            renderSearchHistory();
        } else {
            // Lock Application Behind Login Gate
            if (appContainer) appContainer.classList.add('hidden');
            if (authGateScreen) authGateScreen.classList.remove('hidden');

            userLoggedIn.classList.add('hidden');
            userLoggedOut.classList.remove('hidden');

            // Clear displayed data on logout
            indexedDocs = [];
            isTrained = false;
            statTotalDocs.innerText = '0';
            statTotalSize.innerText = '0 KB';
            statClusters.innerText = '0';
            directoryPathInput.value = '';
            setGateMode('signup');
        }
    }

    function setGateMode(mode) {
        currentGateMode = mode;
        const gateForgotBtn = document.getElementById('gate-forgot-pwd-btn');
        const gateSubtitle = document.querySelector('.auth-gate-card .modal-subtitle');
        if (mode === 'signup') {
            gateTabSignup.classList.add('active');
            gateTabLogin.classList.remove('active');
            gateGroupDisplayName.classList.remove('hidden');
            if (gateForgotBtn) gateForgotBtn.classList.add('hidden');
            gateAuthTitle.innerText = 'Create Cognito Account';
            if (gateSubtitle) gateSubtitle.innerText = 'First create your account to access your offline documents, AI clustering, and search';
            gateAuthSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account & Enter';
        } else {
            gateTabLogin.classList.add('active');
            gateTabSignup.classList.remove('active');
            gateGroupDisplayName.classList.add('hidden');
            if (gateForgotBtn) gateForgotBtn.classList.remove('hidden');
            gateAuthTitle.innerText = 'Welcome Back to Cognito';
            if (gateSubtitle) gateSubtitle.innerText = 'Sign in to access your offline documents, AI clustering, and search';
            gateAuthSubmitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to Enter';
        }
        clearGateAlert();
    }

    function showGateAlert(message, isSuccess = false) {
        if (!gateAuthAlert) return;
        gateAuthAlertMsg.innerHTML = message;
        gateAuthAlert.className = `auth-alert ${isSuccess ? 'success' : ''}`;
        gateAuthAlert.classList.remove('hidden');

        const switchLink = document.getElementById('alert-switch-signup');
        if (switchLink) {
            switchLink.addEventListener('click', (e) => {
                e.preventDefault();
                setGateMode('signup');
            });
        }
        const switchLoginLink = document.getElementById('alert-switch-login');
        if (switchLoginLink) {
            switchLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                setGateMode('login');
            });
        }
    }

    function clearGateAlert() {
        if (!gateAuthAlert) return;
        gateAuthAlert.classList.add('hidden');
        gateAuthAlertMsg.innerHTML = '';
    }

    if (gateTabLogin) gateTabLogin.addEventListener('click', () => setGateMode('login'));
    if (gateTabSignup) gateTabSignup.addEventListener('click', () => setGateMode('signup'));

    // Handle Gate Form Submit
    if (gateAuthForm) {
        gateAuthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = gateAuthEmail.value.trim();
            const password = gateAuthPassword.value;
            const displayName = gateAuthDisplayName ? gateAuthDisplayName.value.trim() : '';

            gateAuthSubmitBtn.disabled = true;
            gateAuthSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            clearGateAlert();

            try {
                if (currentGateMode === 'signup') {
                    await window.cognitoAuth.signUpWithEmail(email, password, displayName);
                    showGateAlert("Account created! Entering Cognito...", true);
                } else {
                    await window.cognitoAuth.signInWithEmail(email, password);
                    showGateAlert("Signed in! Entering Cognito...", true);
                }
            } catch (err) {
                let msg = err.message || "Authentication failed. Check your credentials.";
                if (msg.includes("does not exist") || msg.includes("create an account first")) {
                    msg += ` <a href="#" id="alert-switch-signup" style="color: #60a5fa; text-decoration: underline; margin-left: 6px; font-weight: 600;">Create Account</a>`;
                } else if (msg.includes("already exists")) {
                    msg += ` <a href="#" id="alert-switch-login" style="color: #60a5fa; text-decoration: underline; margin-left: 6px; font-weight: 600;">Sign In</a>`;
                }
                showGateAlert(msg);
            } finally {
                gateAuthSubmitBtn.disabled = false;
                setGateMode(currentGateMode);
            }
        });
    }

    // Gate Google Sign-In
    if (gateGoogleAuthBtn) {
        gateGoogleAuthBtn.addEventListener('click', async () => {
            try {
                gateGoogleAuthBtn.disabled = true;
                await window.cognitoAuth.signInWithGoogle();
            } catch (err) {
                showGateAlert(err.message || "Google sign in failed.");
            } finally {
                gateGoogleAuthBtn.disabled = false;
            }
        });
    }

    // Gate Guest Sign-In
    if (gateGuestAuthBtn) {
        gateGuestAuthBtn.addEventListener('click', async () => {
            try {
                gateGuestAuthBtn.disabled = true;
                await window.cognitoAuth.signInAsGuest();
            } catch (err) {
                showGateAlert(err.message || "Guest sign in failed.");
            } finally {
                gateGuestAuthBtn.disabled = false;
            }
        });
    }

    // Forgot Password Flow
    const gateForgotPwdBtn = document.getElementById('gate-forgot-pwd-btn');
    const gateResetPwdForm = document.getElementById('gate-reset-pwd-form');
    const gateResetEmail = document.getElementById('gate-reset-email');
    const gateResetSubmitBtn = document.getElementById('gate-reset-submit-btn');
    const gateResetBackBtn = document.getElementById('gate-reset-back-btn');
    const gateAuthTabs = document.querySelector('.auth-gate-card .auth-tabs');
    const gateSocialGrid = document.querySelector('.auth-gate-card .social-auth-grid');
    const gateDivider = document.querySelector('.auth-gate-card .auth-divider');

    function showResetPasswordView() {
        if (gateAuthForm) gateAuthForm.classList.add('hidden');
        if (gateResetPwdForm) gateResetPwdForm.classList.remove('hidden');
        if (gateAuthTabs) gateAuthTabs.classList.add('hidden');
        if (gateSocialGrid) gateSocialGrid.classList.add('hidden');
        if (gateDivider) gateDivider.classList.add('hidden');
        if (gateAuthTitle) gateAuthTitle.innerText = 'Reset Your Password';
        clearGateAlert();
    }

    function hideResetPasswordView() {
        if (gateResetPwdForm) gateResetPwdForm.classList.add('hidden');
        if (gateAuthForm) gateAuthForm.classList.remove('hidden');
        if (gateAuthTabs) gateAuthTabs.classList.remove('hidden');
        if (gateSocialGrid) gateSocialGrid.classList.remove('hidden');
        if (gateDivider) gateDivider.classList.remove('hidden');
        setGateMode('login');
        clearGateAlert();
    }

    if (gateForgotPwdBtn) {
        gateForgotPwdBtn.addEventListener('click', () => showResetPasswordView());
    }

    if (gateResetBackBtn) {
        gateResetBackBtn.addEventListener('click', () => hideResetPasswordView());
    }

    if (gateResetPwdForm) {
        gateResetPwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = gateResetEmail ? gateResetEmail.value.trim() : '';
            if (!email) {
                showGateAlert("Please enter your registered Gmail or email address.");
                return;
            }

            gateResetSubmitBtn.disabled = true;
            gateResetSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending Reset Link...';
            clearGateAlert();

            try {
                await window.cognitoAuth.sendPasswordResetEmail(email);
                showGateAlert(`Password reset link sent to ${email}! Check your inbox.`, true);
            } catch (err) {
                showGateAlert(err.message || "Failed to send reset link. Check your email address.");
            } finally {
                gateResetSubmitBtn.disabled = false;
                gateResetSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Reset Link to Gmail';
            }
        });
    }

    function showAuthModal(mode = 'login') {
        setAuthMode(mode);
        clearAuthAlert();
        authModal.classList.remove('hidden');
    }

    function hideAuthModal() {
        authModal.classList.add('hidden');
        clearAuthAlert();
    }

    function setAuthMode(mode) {
        currentAuthMode = mode;
        if (mode === 'signup') {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            groupDisplayName.classList.remove('hidden');
            authModalTitle.innerText = 'Create Cognito Account';
            authSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        } else {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            groupDisplayName.classList.add('hidden');
            authModalTitle.innerText = 'Sign In to Cognito';
            authSubmitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
        }
        clearAuthAlert();
    }

    function showAuthAlert(message, isSuccess = false) {
        authAlertMsg.innerText = message;
        authAlert.className = `auth-alert ${isSuccess ? 'success' : ''}`;
        authAlert.classList.remove('hidden');
    }

    function clearAuthAlert() {
        authAlert.classList.add('hidden');
        authAlertMsg.innerText = '';
    }

    if (openAuthModalBtn) openAuthModalBtn.addEventListener('click', () => showAuthModal('login'));
    if (closeAuthModalBtn) closeAuthModalBtn.addEventListener('click', hideAuthModal);
    if (tabLogin) tabLogin.addEventListener('click', () => setAuthMode('login'));
    if (tabSignup) tabSignup.addEventListener('click', () => setAuthMode('signup'));

    // Modal background click closes modal
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) hideAuthModal();
        });
    }

    // Handle Form Submit
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = authEmail.value.trim();
            const password = authPassword.value;
            const displayName = authDisplayName ? authDisplayName.value.trim() : '';

            authSubmitBtn.disabled = true;
            authSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
            clearAuthAlert();

            try {
                if (currentAuthMode === 'signup') {
                    await window.cognitoAuth.signUpWithEmail(email, password, displayName);
                    showAuthAlert("Account created successfully!", true);
                } else {
                    await window.cognitoAuth.signInWithEmail(email, password);
                    showAuthAlert("Signed in successfully!", true);
                }
                setTimeout(() => hideAuthModal(), 600);
            } catch (err) {
                showAuthAlert(err.message || "Authentication failed.");
            } finally {
                authSubmitBtn.disabled = false;
                setAuthMode(currentAuthMode);
            }
        });
    }

    // Google Sign-In
    if (googleAuthBtn) {
        googleAuthBtn.addEventListener('click', async () => {
            try {
                googleAuthBtn.disabled = true;
                await window.cognitoAuth.signInWithGoogle();
                hideAuthModal();
            } catch (err) {
                showAuthAlert(err.message || "Google sign in failed.");
            } finally {
                googleAuthBtn.disabled = false;
            }
        });
    }

    // Guest Sign-In
    if (guestAuthBtn) {
        guestAuthBtn.addEventListener('click', async () => {
            try {
                guestAuthBtn.disabled = true;
                await window.cognitoAuth.signInAsGuest();
                hideAuthModal();
            } catch (err) {
                showAuthAlert(err.message || "Guest sign in failed.");
            } finally {
                guestAuthBtn.disabled = false;
            }
        });
    }

    // Logout
    if (authLogoutBtn) {
        authLogoutBtn.addEventListener('click', async () => {
            await window.cognitoAuth.logoutUser();
            printTerminalLog("[SYSTEM] User signed out.", "info-line");
        });
    }

    // Register Auth Listener
    if (window.cognitoAuth) {
        window.cognitoAuth.onAuthChange((user) => updateAuthUI(user));
    }

    // ==========================================================================
    // 1. Navigation & Routing
    // ==========================================================================
    
    // Helper to switch tab programmatically and persist tab state per user
    function switchTab(targetTab) {
        if (!targetTab) return;
        if (targetTab === 'map-view' && !isTrained) {
            targetTab = 'dashboard-view';
        }

        navButtons.forEach(b => {
            if (b.getAttribute('data-tab') === targetTab) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        tabContents.forEach(content => {
            if (content.id === targetTab) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        activeTab = targetTab;
        const uid = getCurrentUserId();
        if (uid) {
            try {
                localStorage.setItem(`cognito_active_tab_${uid}`, targetTab);
            } catch (e) {}
        }

        if (targetTab === 'history-view') {
            renderSearchHistory();
        }

        if (targetTab === 'map-view') {
            setTimeout(() => {
                docMap.resize();
                docMap.recenter();
            }, 50);
        }
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Check if attempting to go to map without training
            if (targetTab === 'map-view' && !isTrained) {
                printTerminalLog("[SYSTEM] Cannot load relationship map yet: Local model has not been trained on indexed files.", "error-line");
                alert("Please scan a directory and click 'Train Local Model' first to generate relationship coordinates!");
                return;
            }

            switchTab(targetTab);
        });
    });

    document.getElementById('map-reset-btn').addEventListener('click', () => {
        docMap.recenter();
    });

    // ==========================================================================
    // 2. Directory Scanning
    // ==========================================================================

    scanBtn.addEventListener('click', triggerScan);
    demoBtn.addEventListener('click', loadDemoData);

    async function triggerScan() {
        const dirPath = directoryPathInput.value.trim();
        if (!dirPath) {
            alert("Please enter a valid directory path first!");
            return;
        }

        setAppStatus('busy', 'Scanning...');
        scanBtn.disabled = true;
        printTerminalLog(`[SYSTEM] Scanning directory tree recursively at: ${dirPath}`, "system-line");

        try {
            const response = await fetch(`${API_BASE}/api/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ directory_path: dirPath, user_id: getCurrentUserId() })
            });

            const data = await response.json();
            
            if (response.ok && data.success) {
                printTerminalLog(`[SYSTEM] Scanned completed! Ingested ${data.scan_results.indexed} new documents. Ignored/skipped images & binaries.`, "success-line");
                updateDashboardStats(data.db_stats);
                
                // Enable model training
                trainBtn.disabled = false;
                trainBtn.classList.remove('disabled');
                
                // Reload documents list
                await fetchDocuments(false);
            } else {
                const errMsg = data.detail || "Scanning failed.";
                printTerminalLog(`[ERROR] Scanning aborted: ${errMsg}`, "error-line");
                alert(errMsg);
            }
        } catch (error) {
            printTerminalLog(`[ERROR] Server communication failure: ${error.message}`, "error-line");
        } finally {
            setAppStatus('ready', 'Ready');
            scanBtn.disabled = false;
        }
    }

    function loadDemoData() {
        // Load default relative demo folder structure
        directoryPathInput.value = "demo_data";
        triggerScan();
    }

    // ==========================================================================
    // 3. Machine Learning Training (EventSource Streamer)
    // ==========================================================================

    trainBtn.addEventListener('click', triggerModelTraining);

    function triggerModelTraining() {
        setAppStatus('busy', 'Training...');
        trainBtn.disabled = true;
        trainBtn.classList.add('disabled');
        
        // Clear previous logs
        terminalLogs.innerHTML = '';
        printTerminalLog("[SYSTEM] Initiating local machine learning pipeline...", "system-line");
        
        // Create SSE Stream
        const eventSource = new EventSource(`${API_BASE}/api/train?user_id=${encodeURIComponent(getCurrentUserId())}`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.status === 'training') {
                printTerminalLog(data.message, "process-line");
            } else if (data.status === 'completed') {
                printTerminalLog(`[SUCCESS] ${data.message}`, "success-line");
                eventSource.close();
                setAppStatus('ready', 'Ready');
                
                // Fetch newly structured document mapping & update views
                fetchDocuments(true);
            } else if (data.status === 'failed') {
                printTerminalLog(`[ERROR] ${data.message}`, "error-line");
                eventSource.close();
                setAppStatus('ready', 'Ready');
                trainBtn.disabled = false;
                trainBtn.classList.remove('disabled');
            }
        };

        eventSource.onerror = (error) => {
            printTerminalLog("[ERROR] Server connection interrupted during model fit. Pipeline aborted.", "error-line");
            eventSource.close();
            setAppStatus('ready', 'Ready');
            trainBtn.disabled = false;
            trainBtn.classList.remove('disabled');
        };
    }

    // ==========================================================================
    // 4. Loading Documents & Populating Dashboards
    // ==========================================================================

    async function fetchDocuments(reloadMap = false) {
        try {
            const response = await fetch(`${API_BASE}/api/documents?user_id=${encodeURIComponent(getCurrentUserId())}`);
            const data = await response.json();

            if (response.ok) {
                indexedDocs = data.documents;
                isTrained = data.is_trained;

                // Sync path input to logged-in user's indexed directory
                if (data.indexed_directory) {
                    directoryPathInput.value = data.indexed_directory;
                } else if (!directoryPathInput.value) {
                    directoryPathInput.value = '';
                }

                // Update Stats
                updateDashboardStats(data.stats);
                
                if (isTrained) {
                    // Enable Training Button (allow re-fit)
                    trainBtn.disabled = false;
                    trainBtn.classList.remove('disabled');
                    
                    // Enable Navigation Link highlight
                    document.getElementById('nav-map').classList.remove('disabled-link');
                    
                    // Load into canvas map engine
                    docMap.setNodes(indexedDocs);
                    
                    // Re-render UI elements
                    renderClustersLegendList();
                    populateSearchClusterDropdown();
                    
                    if (reloadMap && activeTab === 'map-view') {
                        docMap.resize();
                        docMap.recenter();
                    }
                } else {
                    document.getElementById('nav-map').classList.add('disabled-link');
                    if (indexedDocs.length > 0) {
                        trainBtn.disabled = false;
                        trainBtn.classList.remove('disabled');
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load local index documents:", error);
        }
    }

    function updateDashboardStats(stats) {
        statTotalDocs.innerText = stats.total_documents;
        
        // Format size
        const kbSize = stats.total_size_bytes / 1024;
        if (kbSize > 1024) {
            statTotalSize.innerText = `${(kbSize / 1024).toFixed(1)} MB`;
        } else {
            statTotalSize.innerText = `${kbSize.toFixed(0)} KB`;
        }
        
        statClusters.innerText = stats.num_clusters;

        // Render File Breakdown Graphics
        breakdownBar.innerHTML = '';
        breakdownList.innerHTML = '';

        const fileTypes = stats.file_types;
        const total = stats.total_documents;

        if (total === 0) {
            breakdownList.innerHTML = '<li class="empty-state">No documents indexed yet.</li>';
            return;
        }

        // Sort descending
        const sortedTypes = Object.entries(fileTypes).sort((a,b) => b[1] - a[1]);

        sortedTypes.forEach(([type, count]) => {
            const percent = ((count / total) * 100).toFixed(0);
            const color = typeColors[type] || '#8b5cf6';

            // 1. Add bar segment
            const segment = document.createElement('div');
            segment.className = 'breakdown-segment';
            segment.style.width = `${percent}%`;
            segment.style.backgroundColor = color;
            segment.title = `${type}: ${count} docs (${percent}%)`;
            breakdownBar.appendChild(segment);

            // 2. Add legend row
            const item = document.createElement('li');
            item.className = 'breakdown-item';
            
            const legendItem = document.createElement('div');
            legendItem.className = 'breakdown-legend-item';
            legendItem.innerHTML = `
                <span class="legend-color-dot" style="background-color: ${color}"></span>
                <span class="legend-text">${type}</span>
            `;
            
            const countItem = document.createElement('div');
            countItem.className = 'breakdown-count';
            countItem.innerText = `${count} files (${percent}%)`;

            item.appendChild(legendItem);
            item.appendChild(countItem);
            breakdownList.appendChild(item);
        });
    }

    function renderClustersLegendList() {
        const legendContainer = document.getElementById('map-legend-list');
        legendContainer.innerHTML = '';

        // Extract unique cluster IDs
        const clusters = {};
        indexedDocs.forEach(doc => {
            if (doc.cluster_id !== null && !clusters[doc.cluster_id]) {
                clusters[doc.cluster_id] = doc.cluster_name;
            }
        });

        const sortedClusters = Object.entries(clusters).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));

        if (sortedClusters.length === 0) {
            legendContainer.innerHTML = '<li class="empty-state">Train Cognito model to view topic clusters.</li>';
            return;
        }

        // Add "All Clusters" toggle
        const allCard = document.createElement('li');
        allCard.className = 'legend-card highlighted';
        allCard.innerHTML = `
            <div class="legend-topic-name">
                <span class="legend-color-dot" style="background-color: #cbd5e1"></span>
                <span>Show All Topics</span>
            </div>
        `;
        allCard.addEventListener('click', () => {
            document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('highlighted'));
            allCard.classList.add('highlighted');
            docMap.highlightCluster("");
        });
        legendContainer.appendChild(allCard);

        sortedClusters.forEach(([id, name]) => {
            const clusterId = parseInt(id);
            const color = docMap.colors[clusterId % docMap.colors.length];
            const parsedName = name.split(': ');
            const topicNum = parsedName[0];
            const keywords = parsedName[1] || "";

            const card = document.createElement('li');
            card.className = 'legend-card';
            card.innerHTML = `
                <div class="legend-topic-name">
                    <span class="legend-color-dot" style="background-color: ${color}"></span>
                    <span>${topicNum}</span>
                </div>
                <div class="legend-topic-words">${keywords}</div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('highlighted'));
                card.classList.add('highlighted');
                docMap.highlightCluster(clusterId);
            });

            legendContainer.appendChild(card);
        });
    }

    function populateSearchClusterDropdown() {
        searchClusterFilter.innerHTML = '<option value="">All Categories</option>';

        const clusters = {};
        indexedDocs.forEach(doc => {
            if (doc.cluster_id !== null && !clusters[doc.cluster_id]) {
                clusters[doc.cluster_id] = doc.cluster_name;
            }
        });

        Object.entries(clusters).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([id, name]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.innerText = name;
            searchClusterFilter.appendChild(opt);
        });
    }

    // ==========================================================================
    // 5. Search Subsystem
    // ==========================================================================

    let activeTypeFilter = "";

    // Toggle Type Filter Chips
    filterTypeChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterTypeChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeTypeFilter = chip.getAttribute('data-type');
            triggerSearch();
        });
    });

    searchClusterFilter.addEventListener('change', triggerSearch);
    searchBtn.addEventListener('click', triggerSearch);
    searchQueryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });
    searchFilenameFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });

    async function triggerSearch() {
        let query = searchQueryInput.value.trim();
        if (!query) {
            query = "what is the Aadhaar cardholder name?";
        }

        // Clear search input for next question
        searchQueryInput.value = '';

        // 1. Create and Append QA Exchange Card
        const qaCard = document.createElement('div');
        qaCard.className = 'qa-exchange-card';
        qaCard.innerHTML = `
            <div class="qa-question-row">
                <i class="fa-solid fa-circle-question"></i>
                <span>${escapeHtml(query)}</span>
            </div>
            <div class="qa-answer-row">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="chat-thinking-loader">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="chat-thinking-text" style="font-size: 0.82rem; color: var(--text-muted); font-style: italic;">Cognito is searching documents...</div>
                </div>
            </div>
        `;
        chatMessagesContainer.appendChild(qaCard);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        // 2. Start dynamic loader status messages
        const thinkingText = qaCard.querySelector('.chat-thinking-text');
        const progressMessages = [
            "Cognito is searching documents...",
            "Analyzing matching text segments...",
            "Loading local AI model weights...",
            "Extracting the best answers..."
        ];
        let msgIndex = 0;
        const msgInterval = setInterval(() => {
            if (thinkingText && msgIndex < progressMessages.length - 1) {
                msgIndex++;
                thinkingText.innerText = progressMessages[msgIndex];
            }
        }, 1200);

        // 3. Build API parameters
        const filenameVal = searchFilenameFilter.value.trim();
        let qaUrl = `${API_BASE}/api/qa?q=${encodeURIComponent(query)}&user_id=${encodeURIComponent(getCurrentUserId())}`;
        if (filenameVal) {
            qaUrl += `&filename=${encodeURIComponent(filenameVal)}`;
        }
        if (activeTypeFilter) {
            qaUrl += `&filetype=${encodeURIComponent(activeTypeFilter)}`;
        }
        const clusterVal = searchClusterFilter.value;
        if (clusterVal !== "") {
            qaUrl += `&cluster_id=${encodeURIComponent(clusterVal)}`;
        }

        setAppStatus('busy', 'Thinking...');

        try {
            const response = await fetch(qaUrl);
            const data = await response.json();
            
            // Stop progress ticker
            clearInterval(msgInterval);

            const answerRow = qaCard.querySelector('.qa-answer-row');
            
            if (data && data.result) {
                const qa = data.result;
                
                let sourceCardHtml = '';
                if (qa.sourceDocumentPath) {
                    sourceCardHtml = `
                        <div class="chat-source-card">
                            <div class="chat-source-header">
                                <span class="chat-source-name"><i class="fa-solid fa-file-invoice"></i> ${escapeHtml(qa.sourceDocumentName)}</span>
                                <span class="chat-source-score">Confidence: ${qa.score}%</span>
                            </div>
                            <div class="chat-source-path" title="${escapeHtml(qa.sourceDocumentPath)}">${escapeHtml(qa.sourceDocumentPath)}</div>
                            <div class="chat-source-text-block">${escapeHtml(qa.contextSnippet || '')}</div>
                            <div class="chat-source-actions">
                                <button class="chat-source-btn toggle-text-btn"><i class="fa-solid fa-eye"></i> Show Source Context</button>
                                <button class="chat-source-btn view-doc-btn"><i class="fa-solid fa-folder-open"></i> Open Document</button>
                            </div>
                        </div>
                    `;
                }

                answerRow.innerHTML = `
                    <div class="qa-answer-text">${escapeHtml(qa.answer)}</div>
                    ${sourceCardHtml}
                `;

                // Wire up toggle context and view document buttons
                const toggleBtn = qaCard.querySelector('.toggle-text-btn');
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', () => {
                        const textBlock = qaCard.querySelector('.chat-source-text-block');
                        textBlock.classList.toggle('visible');
                        toggleBtn.innerHTML = textBlock.classList.contains('visible') ? 
                            `<i class="fa-solid fa-eye-slash"></i> Hide Source Context` : 
                            `<i class="fa-solid fa-eye"></i> Show Source Context`;
                    });
                }

                const viewDocBtn = qaCard.querySelector('.view-doc-btn');
                if (viewDocBtn) {
                    viewDocBtn.addEventListener('click', () => {
                        const matchedDoc = indexedDocs.find(d => d.filepath === qa.sourceDocumentPath);
                        if (matchedDoc) {
                            openDocumentDrawer(matchedDoc.id);
                        } else {
                            printTerminalLog(`[SYSTEM] Document not found in local index cache: ${qa.sourceDocumentName}`, "error-line");
                        }
                    });
                }

                // Save to localStorage search history
                saveSearchHistory(query, qa.answer, qa.sourceDocumentName, qa.sourceDocumentPath);

            } else {
                answerRow.innerHTML = `
                    <div class="qa-answer-text">Sorry, I encountered an issue retrieving an answer from the local server.</div>
                `;
            }

            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        } catch (error) {
            console.error("Communication failure in search and QA:", error);
            clearInterval(msgInterval);
            
            const answerRow = qaCard.querySelector('.qa-answer-row');
            if (answerRow) {
                answerRow.innerHTML = `
                    <div class="qa-answer-text" style="color: var(--color-error);">Network connection error: Failed to reach Cognito local sync server.</div>
                `;
            }
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        } finally {
            setAppStatus('ready', 'Ready');
        }
    }

    function renderSearchResults(results, query) {
        searchResultsList.innerHTML = '';
        resultsCount.innerText = `${results.length} matches found`;

        if (results.length === 0) {
            searchResultsList.innerHTML = `
                <div class="search-empty-state">
                    <i class="fa-solid fa-face-frown"></i>
                    <h3>No Matches Found</h3>
                    <p>We couldn't find any documents matching your keywords. Try widening filters or indexing new files!</p>
                </div>
            `;
            return;
        }

        // Split query into terms to highlight
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

        results.forEach(res => {
            const sizeKb = (res.filesize / 1024).toFixed(1);
            const icon = typeIcons[res.filetype] || 'fa-file-lines';
            const color = docMap.colors[res.cluster_id % docMap.colors.length] || '#cbd5e1';

            // High/low score color scaling
            const scoreClass = res.score >= 50 ? 'high-score' : '';

            const card = document.createElement('div');
            card.className = 'result-card';
            
            // Build card structure
            card.innerHTML = `
                <div class="result-header-row">
                    <div class="result-file-title">
                        <i class="fa-solid ${icon}"></i>
                        <span>${res.filename}</span>
                    </div>
                    <div class="score-badge ${scoreClass}">
                        <i class="fa-solid fa-bolt"></i> ${res.score}% relevance
                    </div>
                </div>
                
                <div class="result-snippet">${highlightText(res.snippet, queryTerms)}</div>
                
                <div class="result-footer-row">
                    <div class="result-path" title="${res.filepath}">
                        <i class="fa-solid fa-location-dot"></i> ${res.filepath}
                    </div>
                    <span class="badge type-badge">${res.filetype}</span>
                    <span class="badge size-badge">${sizeKb} KB</span>
                    <span class="badge cluster-badge" style="background-color: ${color}15; color: ${color}; border-color: ${color}40;" title="${res.cluster_name}">
                        ${res.cluster_name.split(': ')[0]}
                    </span>
                    <button class="btn btn-secondary btn-sm open-explorer-btn" style="margin-left: 0.5rem;" data-path="${res.filepath}">
                        <i class="fa-solid fa-folder-open"></i> Reveal
                    </button>
                </div>
            `;

            // Card Click event (opens preview)
            card.addEventListener('click', (e) => {
                // If clicked the reveal button, don't open drawer
                if (e.target.closest('.open-explorer-btn')) return;
                openDocumentDrawer(res.id);
            });

            // Reveal folder click event
            card.querySelector('.open-explorer-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                revealInExplorer(res.filepath);
            });

            searchResultsList.appendChild(card);
        });
    }

    // Helper function for highlighted marks
    function highlightText(text, terms) {
        if (!terms || terms.length === 0) return text;
        
        let highlighted = text;
        terms.forEach(term => {
            // Safe regex generation for letters/numbers
            if (/^[a-zA-Z0-9]+$/.test(term)) {
                const regex = new RegExp(`\\b(${term})\\b`, 'gi');
                highlighted = highlighted.replace(regex, '<mark>$1</mark>');
            }
        });
        return highlighted;
    }

    // ==========================================================================
    // 6. Document Viewer Side Drawer
    // ==========================================================================

    closeDrawerBtn.addEventListener('click', closeDocumentDrawer);

    async function openDocumentDrawer(docId) {
        try {
            const response = await fetch(`${API_BASE}/api/preview?id=${docId}&user_id=${encodeURIComponent(getCurrentUserId())}`);
            const doc = await response.json();

            if (response.ok) {
                const sizeKb = (doc.filesize / 1024).toFixed(1);
                
                drawerFilename.innerText = doc.filename;
                drawerPath.innerText = doc.filepath;
                drawerTypeBadge.innerText = doc.filetype;
                drawerSizeBadge.innerText = `${sizeKb} KB`;
                drawerClusterBadge.innerText = doc.cluster_name || "General Archive";

                // Visual color syncing
                const clusterId = indexedDocs.find(d => d.id === docId)?.cluster_id ?? 0;
                const color = docMap.colors[clusterId % docMap.colors.length];
                drawerClusterBadge.style.backgroundColor = `${color}15`;
                drawerClusterBadge.style.color = color;
                drawerClusterBadge.style.borderColor = `${color}40`;

                // Set file text preview
                drawerTextBody.innerText = doc.content || "Empty content or failed to parse text.";

                // Bind reveal button
                drawerOpenFolderBtn.onclick = () => revealInExplorer(doc.filepath);

                // Open drawer
                documentDrawer.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Failed to load document content preview:", error);
        }
    }

    function closeDocumentDrawer() {
        documentDrawer.classList.add('hidden');
    }

    // Trigger explorer focus command
    async function revealInExplorer(filepath) {
        try {
            const response = await fetch(`${API_BASE}/api/open-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: filepath })
            });
            const data = await response.json();
            if (!response.ok) {
                alert(data.detail || "Failed to reveal file in Windows Explorer.");
            }
        } catch (error) {
            console.error("Reveal in explorer error:", error);
        }
    }

    // ==========================================================================
    // 7. System Log Mechanics & Helpers
    // ==========================================================================

    function printTerminalLog(message, lineClass = "system-line") {
        const line = document.createElement('div');
        line.className = `terminal-line ${lineClass}`;
        
        // Prefix with timestamp
        const timestamp = new Date().toLocaleTimeString();
        line.innerText = `[${timestamp}] ${message}`;
        
        terminalLogs.appendChild(line);
        
        // Auto scroll
        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }

    function setAppStatus(type, label) {
        statusText.innerText = label;
        statusDot.className = 'pulse-dot';
        
        if (type === 'ready') {
            statusDot.classList.add('green');
        } else if (type === 'busy') {
            statusDot.classList.add('amber');
        }
    }

    async function fetchSyncStatus() {
        try {
            const response = await fetch(`${API_BASE}/api/sync/status?user_id=${encodeURIComponent(getCurrentUserId())}`);
            const data = await response.json();
            if (response.ok && data.success) {
                syncIpVal.innerText = `http://${data.ip}:${data.port}`;
                syncStatusDot.className = 'sync-status-dot';
                syncStatusDot.style.backgroundColor = 'var(--color-success)';
                syncStatusDot.style.boxShadow = '0 0 6px var(--color-success)';
                syncStatusText.innerText = 'Local Sync Server Active';
            }
        } catch (error) {
            console.error("Failed to query local sync server status:", error);
            syncStatusDot.style.backgroundColor = 'var(--color-error)';
            syncStatusDot.style.boxShadow = '0 0 6px var(--color-error)';
            syncStatusText.innerText = 'Offline';
        }
    }

    // ==========================================================================
    // History Management Logic
    // ==========================================================================
    function loadSearchHistory() {
        try {
            return JSON.parse(localStorage.getItem(getHistoryStorageKey())) || [];
        } catch (e) {
            return [];
        }
    }

    function saveSearchHistory(question, answer, docName, docPath) {
        const history = loadSearchHistory();
        
        const existingIndex = history.findIndex(item => item.question.toLowerCase() === question.toLowerCase());
        if (existingIndex !== -1) {
            history.splice(existingIndex, 1);
        }

        const now = new Date();
        const newItem = {
            id: Date.now(),
            question: question,
            answer: answer,
            docName: docName,
            docPath: docPath,
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + now.toLocaleDateString(),
            isoTimestamp: now.toISOString()
        };

        history.unshift(newItem);
        if (history.length > 50) history.pop();

        localStorage.setItem(getHistoryStorageKey(), JSON.stringify(history));

        // Sync to Firebase Cloud Firestore in real time
        if (window.cognitoAuth) {
            window.cognitoAuth.saveHistoryItem(newItem);
        }
    }

    function clearSearchHistory() {
        localStorage.removeItem(getHistoryStorageKey());
        if (window.cognitoAuth) {
            window.cognitoAuth.clearHistory();
        }
        renderSearchHistory();
        printTerminalLog("[SYSTEM] Search history cleared successfully.", "info-line");
    }

    function getDateGroupLabel(dateObj) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const itemDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

        if (itemDate.getTime() === today.getTime()) return 'Today';
        if (itemDate.getTime() === yesterday.getTime()) return 'Yesterday';

        const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
            return itemDate.toLocaleDateString(undefined, { weekday: 'long' });
        }
        return itemDate.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }

    function renderSearchHistory() {
        const history = loadSearchHistory();
        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="search-empty-state">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    <h3>No Search History</h3>
                    <p>Your past queries and AI extracted answers will appear here.</p>
                </div>
            `;
            return;
        }

        // Group history items by date
        const grouped = {};
        const groupOrder = [];
        history.forEach(item => {
            let itemDate;
            if (item.isoTimestamp) {
                itemDate = new Date(item.isoTimestamp);
            } else if (item.id) {
                // Fallback: use the id (which is Date.now() epoch ms) for older items
                itemDate = new Date(item.id);
            } else {
                itemDate = new Date();
            }
            const label = getDateGroupLabel(itemDate);
            if (!grouped[label]) {
                grouped[label] = [];
                groupOrder.push(label);
            }
            grouped[label].push(item);
        });

        groupOrder.forEach(label => {
            // Create date group header
            const header = document.createElement('div');
            header.className = 'history-date-header';
            header.innerHTML = `
                <i class="fa-solid fa-calendar-day"></i>
                <span>${label}</span>
                <span class="history-date-count">${grouped[label].length} ${grouped[label].length === 1 ? 'query' : 'queries'}</span>
            `;
            historyList.appendChild(header);

            grouped[label].forEach(item => {
                const card = document.createElement('div');
                card.className = 'history-item';

                // Extract time portion for display
                let timeDisplay = '';
                if (item.isoTimestamp) {
                    timeDisplay = new Date(item.isoTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else if (item.timestamp) {
                    timeDisplay = item.timestamp;
                }

                card.innerHTML = `
                    <div class="history-question-row">
                        <i class="fa-solid fa-circle-question"></i>
                        <span>${item.question}</span>
                    </div>
                    <div class="history-answer-row">
                        <i class="fa-solid fa-brain"></i>
                        <span>${item.answer}</span>
                    </div>
                    <div class="history-meta-row">
                        <span class="history-doc-link">Source: ${item.docName || 'None'}</span>
                        <span class="history-time">${timeDisplay}</span>
                    </div>
                `;

                card.addEventListener('click', () => {
                    searchQueryInput.value = item.question;
                    const searchTabBtn = document.getElementById('nav-search');
                    if (searchTabBtn) searchTabBtn.click();
                    triggerSearch();
                });

                historyList.appendChild(card);
            });
        });
    }

    clearHistoryBtn.addEventListener('click', clearSearchHistory);

    // ==========================================================================
    // Real-Time Live Sync & Heartbeat Subsystem
    // ==========================================================================
    
    // 1. Cross-Tab Live Search History Sync
    window.addEventListener('storage', (e) => {
        if (e.key === getHistoryStorageKey() && activeTab === 'history-view') {
            renderSearchHistory();
        }
    });

    // 2. Real-Time Background Heartbeat (detects external folder scans or mobile pushes)
    let lastStatsSignature = "";
    async function checkRealtimeSync() {
        try {
            const response = await fetch(`${API_BASE}/api/sync/status?user_id=${encodeURIComponent(getCurrentUserId())}`);
            const data = await response.json();
            if (response.ok && data.success) {
                const signature = `${data.stats.total_documents}_${data.stats.total_size_bytes}_${data.stats.num_clusters}_${data.is_trained}`;
                if (lastStatsSignature !== "" && lastStatsSignature !== signature) {
                    console.log("[Realtime Sync] Database change detected! Updating UI live...");
                    fetchDocuments(true);
                }
                lastStatsSignature = signature;
            }
        } catch (e) {
            // Background polling network pause
        }
    }

    setInterval(checkRealtimeSync, 3000);

    // Fetch initial documents and sync status on application load
    fetchDocuments(false);
    fetchSyncStatus();
});
