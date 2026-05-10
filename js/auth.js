const firebaseConfig = {
    apiKey: "AIzaSyByMRQ3cCYQX60D-UXzBnD7cbn-hiDQMhc",
    authDomain: "bus-ticket--management-system.firebaseapp.com",
    databaseURL: "https://bus-ticket--management-system-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bus-ticket--management-system",
    storageBucket: "bus-ticket--management-system.firebasestorage.app",
    messagingSenderId: "570359874016",
    appId: "1:570359874016:web:2c033d2516b376c1ffab85",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let isLoginMode = false; // Starts on Register mode
window.isUserLoggedIn = false; 

const authForm = document.getElementById("authForm");
const authNameContainer = document.getElementById("authNameContainer"); // Targeted the new container
const authName = document.getElementById("authName"); 
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleBtn = document.getElementById("authToggleBtn");
const authToggleText = document.getElementById("authToggleText");
const authModalLabel = document.getElementById("authModalLabel");
const navAuthBtn = document.getElementById("nav-auth-btn");
const googleAuthBtn = document.getElementById("googleAuthBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

authToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authModalLabel.innerText = isLoginMode ? "Login to NexTrip" : "Create New Account";
    authSubmitBtn.innerText = isLoginMode ? "Login" : "Register Now";
    authToggleText.innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    authToggleBtn.innerText = isLoginMode ? "Register" : "Login here";
    
    // Toggles the Username field dynamically
    if (authNameContainer && authName) {
        authNameContainer.style.display = isLoginMode ? "none" : "block";
        authName.required = !isLoginMode;
    }
    
    if (forgotPasswordBtn) {
        forgotPasswordBtn.style.display = isLoginMode ? "block" : "none";
    }
});

authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;
    const username = authName ? authName.value.trim() : "";

    const originalBtnText = authSubmitBtn.innerText;
    authSubmitBtn.innerText = "Processing...";
    authSubmitBtn.disabled = true;

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, password)
            .then((result) => {
                authForm.reset();
                if(window.showToast) window.showToast(`Welcome back, ${result.user.displayName || 'User'}!`);
            })
            .catch((error) => {
                if(window.showToast) window.showToast(error.message.replace("Firebase: ", ""), true);
            })
            .finally(() => {
                authSubmitBtn.innerText = originalBtnText;
                authSubmitBtn.disabled = false;
            });
    } else {
        auth.createUserWithEmailAndPassword(email, password)
            .then((result) => {
                // Injects the custom Username into their permanent Firebase profile
                return result.user.updateProfile({
                    displayName: username
                }).then(() => {
                    authForm.reset();
                    if(window.showToast) window.showToast(`Welcome, ${username}! Your account is set up.`);
                });
            })
            .catch((error) => {
                if(window.showToast) window.showToast(error.message.replace("Firebase: ", ""), true);
            })
            .finally(() => {
                authSubmitBtn.innerText = originalBtnText;
                authSubmitBtn.disabled = false;
            });
    }
});

if (googleAuthBtn) {
    googleAuthBtn.addEventListener("click", () => {
        auth.signInWithPopup(googleProvider)
            .then((result) => {
                if(result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
                     if(window.showToast) window.showToast(`Welcome to NexTrip, ${result.user.displayName}! Your account is set up.`);
                } else {
                     if(window.showToast) window.showToast(`Welcome back, ${result.user.displayName || ''}!`);
                }
            })
            .catch((error) => {
                if(window.showToast) window.showToast(error.message.replace("Firebase: ", ""), true);
            });
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const email = authEmail.value;
        if(!email) {
            alert("Please type your email into the Email field first, then click 'Forgot Password?'");
            return;
        }
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert("A password reset link has been sent to your email. Please check your inbox.");
            })
            .catch((error) => {
                if(window.showToast) window.showToast(error.message.replace("Firebase: ", ""), true);
            });
    });
}

auth.onAuthStateChanged((user) => {
    window.isUserLoggedIn = !!user;
    
    const contentWrapper = document.getElementById("content-wrapper");
    const authModalEl = document.getElementById("authModal");
    const authModalInstance = bootstrap.Modal.getOrCreateInstance(authModalEl);

    if (user) {
        if (contentWrapper) {
            contentWrapper.style.filter = "none";
            contentWrapper.style.pointerEvents = "auto";
            contentWrapper.style.userSelect = "auto";
        }
        
        authModalInstance.hide();
        
        document.body.style.cssText = ''; 
        document.documentElement.style.cssText = '';
        document.body.classList.remove("modal-open");
        
        setTimeout(() => {
            document.body.style.cssText = ''; 
            document.documentElement.style.cssText = '';
            document.body.classList.remove("modal-open");
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        }, 500); 

        navAuthBtn.innerText = "Logout";
        navAuthBtn.classList.remove("btn-outline-success");
        navAuthBtn.classList.add("btn-custom-logout"); 
        navAuthBtn.style.display = "block";
        navAuthBtn.onclick = () => {
            auth.signOut().then(() => { window.location.reload(); });
        };
        
    } else {
        window.scrollTo(0, 0);
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        
        if (contentWrapper) {
            contentWrapper.style.filter = "blur(12px)";
            contentWrapper.style.pointerEvents = "none";
            contentWrapper.style.userSelect = "none";
        }
        
        navAuthBtn.style.display = "none";
        authModalInstance.show();
    }
});