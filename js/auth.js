const firebaseConfig = {
    apiKey: "AIzaSyByMRQ3cCYQX60D-UXzBnD7cbn-hiDQMhc",
    authDomain: "bus-ticket--management-system.firebaseapp.com",
    projectId: "bus-ticket--management-system",
    storageBucket: "bus-ticket--management-system.firebasestorage.app",
    messagingSenderId: "570359874016",
    appId: "1:570359874016:web:2c033d2516b376c1ffab85",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let isLoginMode = true;

const authForm = document.getElementById("authForm");
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
    
    if (forgotPasswordBtn) {
        forgotPasswordBtn.style.display = isLoginMode ? "block" : "none";
    }
});

authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    const originalBtnText = authSubmitBtn.innerText;
    authSubmitBtn.innerText = "Processing...";
    authSubmitBtn.disabled = true;

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
                authForm.reset();
                if(window.showToast) window.showToast("Logged in successfully!");
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
            .then(() => {
                bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
                authForm.reset();
                alert("SUCCESS! Your new account has been created and you are now logged in.");
                if(window.showToast) window.showToast("Registered successfully!");
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
                bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
                if(result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
                     alert(`Welcome to NexTrip, ${result.user.displayName}! Your account is set up.`);
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
    if (user) {
        navAuthBtn.innerText = "Logout";
        navAuthBtn.classList.replace("btn-outline-success", "btn-danger");
        
        // CRITICAL FIX: Reload the page instantly upon clicking Logout
        navAuthBtn.onclick = () => {
            auth.signOut().then(() => {
                window.location.reload(); 
            });
        };
        
        navAuthBtn.removeAttribute("data-bs-toggle");
        navAuthBtn.removeAttribute("data-bs-target");
    } else {
        navAuthBtn.innerText = "Login";
        navAuthBtn.classList.replace("btn-danger", "btn-outline-success");
        navAuthBtn.onclick = null;
        navAuthBtn.setAttribute("data-bs-toggle", "modal");
        navAuthBtn.setAttribute("data-bs-target", "#authModal");
    }
});