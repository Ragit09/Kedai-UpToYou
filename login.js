import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("authMessage");
let formFlowInProgress = false;

function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
}

function setBusy(busy) {
    const button = loginForm.querySelector("button[type='submit']");
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
}

async function routeUser(user) {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists()) {
        await signOut(auth);
        setMessage("Akun belum memiliki role. Hubungi administrator.", true);
        return;
    }
    const role = profile.data().role;
    if (role === "admin") window.location.replace("./admin.html");
    else if (role === "customer") window.location.replace("./customer.html");
    else {
        await signOut(auth);
        setMessage("Role akun tidak dikenali.", true);
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formFlowInProgress = true;
    setBusy(true);
    setMessage("Memeriksa akun...");
    try {
        const credential = await signInWithEmailAndPassword(auth, loginForm.loginEmail.value.trim(), loginForm.loginPassword.value);
        await routeUser(credential.user);
    } catch (error) {
        console.error(error);
        setMessage(error.code === "auth/invalid-credential" ? "Email atau password tidak cocok." : "Login gagal. Periksa koneksi dan konfigurasi Firebase.", true);
    } finally {
        formFlowInProgress = false;
        setBusy(false);
    }
});

onAuthStateChanged(auth, (user) => {
    if (user && !formFlowInProgress) {
        routeUser(user).catch((error) => {
            console.error(error);
            setMessage("Tidak dapat membaca role akun. Periksa aturan Firestore.", true);
        });
    }
});
