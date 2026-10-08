import {
    EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential,
    signOut, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection, doc, getDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { renderCustomerSidebar } from "./customer/sidebar/sidebar.js";

renderCustomerSidebar(document.getElementById("memberSidebarMount"));

const pageTitles = {
    dashboard: "Dashboard",
    card: "Kartu Member",
    rewards: "Reward Member",
    profile: "Profil Member"
};
let currentUser = null;

window.navigateMember = function(page) {
    document.querySelectorAll("#memberSidebarMount .nav-item").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");
    });
    document.querySelectorAll("section[id^='member-page-']").forEach((section) => section.classList.add("hidden"));
    document.getElementById(`member-nav-${page}`).classList.add("active");
    document.getElementById(`member-nav-${page}`).setAttribute("aria-current", "page");
    document.getElementById(`member-page-${page}`).classList.remove("hidden");
    document.getElementById("memberPageTitle").textContent = pageTitles[page];
};

const logoutButton = document.getElementById("logoutButton");
logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("./index.html");
});

document.getElementById("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser?.email) return;
    const message = document.getElementById("passwordMessage");
    const button = event.currentTarget.querySelector("button[type='submit']");
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (newPassword !== confirmPassword) {
        message.textContent = "Konfirmasi password baru tidak sama.";
        message.classList.add("error");
        return;
    }
    button.disabled = true;
    message.textContent = "Memperbarui password...";
    message.classList.remove("error");
    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        event.currentTarget.reset();
        message.textContent = "Password berhasil diperbarui.";
    } catch (error) {
        console.error(error);
        const messages = {
            "auth/invalid-credential": "Password saat ini tidak sesuai.",
            "auth/wrong-password": "Password saat ini tidak sesuai.",
            "auth/weak-password": "Password baru terlalu lemah. Gunakan minimal 6 karakter.",
            "auth/requires-recent-login": "Sesi terlalu lama. Keluar lalu masuk kembali sebelum mengganti password."
        };
        message.textContent = messages[error.code] || "Password gagal diperbarui. Coba masuk kembali lalu ulangi.";
        message.classList.add("error");
    } finally {
        button.disabled = false;
    }
});

function renderTransactions(transactionDocs) {
    const activityList = document.getElementById("memberActivityList");
    const transactions = transactionDocs.map((transactionDoc) => transactionDoc.data());
    transactions.sort((first, second) => (second.created_at?.toMillis?.() || 0) - (first.created_at?.toMillis?.() || 0));
    const redeemedCups = transactions.reduce((total, transaction) => total + (transaction.type === "redeem" ? Number(transaction.cups) || 0 : 0), 0);

    document.getElementById("totalRedeems").textContent = redeemedCups.toLocaleString("id-ID");
    document.getElementById("totalTransactions").textContent = transactions.length.toLocaleString("id-ID");
    document.getElementById("activityCount").textContent = `${transactions.length.toLocaleString("id-ID")} transaksi`;
    activityList.replaceChildren();

    if (!transactions.length) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "table-message";
        emptyMessage.textContent = "Belum ada transaksi tercatat.";
        activityList.append(emptyMessage);
        return;
    }

    transactions.slice(0, 8).forEach((transaction) => {
        const isRedeem = transaction.type === "redeem";
        const row = document.createElement("div");
        row.className = `activity-row${isRedeem ? " redeem" : ""}`;
        const icon = document.createElement("span");
        icon.className = "material-icons-round activity-icon";
        icon.textContent = isRedeem ? "redeem" : "local_cafe";
        const details = document.createElement("span");
        details.className = "activity-copy";
        const title = document.createElement("strong");
        title.textContent = isRedeem ? `Tukar ${transaction.cups} free cup` : `Pembelian ${transaction.cups} cup`;
        const date = document.createElement("small");
        date.textContent = transaction.created_at?.toDate?.().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) || "Baru saja";
        details.append(title, date);
        const points = document.createElement("span");
        points.className = "activity-points";
        const pointDelta = Number(transaction.points_delta) || 0;
        points.textContent = `${pointDelta > 0 ? "+" : ""}${pointDelta.toLocaleString("id-ID")} poin`;
        row.append(icon, details, points);
        activityList.append(row);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("./login.html");
        return;
    }

    currentUser = user;
    try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        if (!userSnapshot.exists() || userSnapshot.data().role !== "customer") {
            window.location.replace(userSnapshot.data()?.role === "admin" ? "./admin.html" : "./login.html");
            return;
        }

        const memberId = userSnapshot.data().member_id;
        const memberSnapshot = await getDoc(doc(db, "members", memberId));
        if (!memberSnapshot.exists()) throw new Error("Data member tidak ditemukan.");
        const member = memberSnapshot.data();
        const name = member.nama_lengkap || "Member";
        const points = Number(member.saldo_poin) || 0;

        document.getElementById("customerName").textContent = name;
        document.getElementById("memberSidebarName").textContent = name;
        document.getElementById("memberSidebarEmail").textContent = member.email || user.email || "Email member";
        document.getElementById("memberSidebarEmail").title = member.email || user.email || "";
        document.getElementById("memberAvatar").textContent = name.charAt(0).toUpperCase() || "M";
        document.getElementById("cardCustomerName").textContent = name;
        document.getElementById("customerPoints").textContent = points.toLocaleString("id-ID");
        document.getElementById("cardCustomerId").textContent = memberId;
        document.getElementById("profileName").textContent = name;
        document.getElementById("profileEmail").textContent = member.email || user.email || "-";
        document.getElementById("profilePhone").textContent = member.no_whatsapp || "-";
        document.getElementById("profileAddress").textContent = member.alamat || "-";
        document.getElementById("rewardBalance").textContent = `${points.toLocaleString("id-ID")} poin`;
        document.getElementById("rewardProgress").textContent = `${100 - (points % 100)} poin untuk free cup berikutnya`;
        document.getElementById("customerQR").src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(memberId)}`;

        const transactionsQuery = query(collection(db, "memberTransactions"), where("auth_uid", "==", user.uid));
        try {
            const transactionsSnapshot = await getDocs(transactionsQuery);
            renderTransactions(transactionsSnapshot.docs);
        } catch (transactionError) {
            console.error(transactionError);
            document.getElementById("totalRedeems").textContent = "—";
            document.getElementById("totalTransactions").textContent = "—";
            document.getElementById("memberActivityList").textContent = "Riwayat transaksi belum tersedia.";
        }
    } catch (error) {
        console.error(error);
        document.getElementById("memberActivityList").textContent = "Data member belum dapat dimuat.";
    }
});
