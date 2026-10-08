import { createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { deleteApp, initializeApp as initializeFirebaseApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    collection, doc, getDoc, getDocs, orderBy, query,
    runTransaction, serverTimestamp, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { firebaseConfig } from "./firebase-config.js";
import { renderAdminSidebar } from "./admin/sidebar/sidebar.js";

renderAdminSidebar(document.getElementById("adminSidebarMount"));

const pageTitles = {
    dashboard: "Dashboard",
    scan: "Sistem Kasir & Pemindai QR",
    add: "Pendaftaran Member Baru",
    list: "Manajemen Data Member"
};
let activeMemberId = null;
let html5QrcodeScanner;
let editingMemberId = null;
let scannerTransition = Promise.resolve();
let scannerStarting = false;
let scanInProgress = false;
let lastScannedCode = null;
let scannerVersion = 0;

window.navigate = async function(page) {
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");
    });
    document.querySelectorAll("section[id^='page-']").forEach((item) => item.classList.add("hidden"));
    document.getElementById(`nav-${page}`).classList.add("active");
    document.getElementById(`nav-${page}`).setAttribute("aria-current", "page");
    document.getElementById(`page-${page}`).classList.remove("hidden");
    document.getElementById("page-title").textContent = pageTitles[page];

    if (page === "scan") await initScanner();
    else await stopScanner();
    if (page === "dashboard") await loadDashboardSummary();
    if (page === "list") loadAllMembers();
};

async function initScanner() {
    const version = scannerVersion;
    await scannerTransition;
    if (version !== scannerVersion || document.getElementById("page-scan").classList.contains("hidden")) return;
    if (html5QrcodeScanner || scannerStarting) return;
    scannerStarting = true;
    const scanner = new Html5Qrcode("reader");
    html5QrcodeScanner = scanner;
    scanInProgress = false;
    lastScannedCode = null;
    const scanStatus = document.getElementById("scanStatus");
    scanStatus.textContent = "Mengaktifkan kamera...";
    scanStatus.classList.remove("error");
    try {
        scannerTransition = scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            () => {}
        ).then(async () => {
            if (version !== scannerVersion || document.getElementById("page-scan").classList.contains("hidden")) {
                await scanner.stop().catch(() => {});
                await scanner.clear().catch(() => {});
                if (html5QrcodeScanner === scanner) html5QrcodeScanner = null;
                return;
            }
            scanStatus.textContent = "Kamera aktif. Arahkan QR member ke kamera.";
            const videoTrack = document.querySelector("#reader video")?.srcObject?.getVideoTracks?.()[0];
            videoTrack?.addEventListener("ended", () => {
                if (version !== scannerVersion || scanner !== html5QrcodeScanner) return;
                scanStatus.textContent = "Koneksi kamera terputus. Tekan Scan Ulang untuk menyambungkan kembali.";
                scanStatus.classList.add("error");
            }, { once: true });
        }).catch(async (error) => {
            console.error("Kamera gagal dimulai:", error);
            if (html5QrcodeScanner === scanner) html5QrcodeScanner = null;
            const cameraErrors = {
                NotAllowedError: "Izin kamera ditolak. Izinkan akses kamera di browser, lalu tekan Scan Ulang.",
                NotFoundError: "Kamera tidak ditemukan. Hubungkan kamera lalu tekan Scan Ulang.",
                NotReadableError: "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu tekan Scan Ulang.",
                SecurityError: "Kamera memerlukan koneksi aman (HTTPS atau localhost)."
            };
            scanStatus.textContent = cameraErrors[error.name] || "Kamera tidak dapat dimulai. Periksa izin dan koneksi kamera, lalu tekan Scan Ulang.";
            scanStatus.classList.add("error");
            await scanner.clear().catch(() => {});
        }).finally(() => {
            scannerStarting = false;
        });
        await scannerTransition;
    } catch (error) {
        scannerStarting = false;
        throw error;
    }
}

async function stopScanner() {
    scannerVersion += 1;
    const scanner = html5QrcodeScanner;
    html5QrcodeScanner = null;
    if (scanner) {
        scannerTransition = scannerTransition
            .catch(() => {})
            .then(async () => {
                await scanner.stop().catch(() => {});
                await scanner.clear().catch(() => {});
            })
            .catch((error) => console.warn("Scanner berhenti dengan peringatan:", error));
    }
    await scannerTransition;
    document.getElementById("reader").replaceChildren();
}

async function onScanSuccess(decodedText) {
    if (scanInProgress || decodedText === lastScannedCode) return;
    scanInProgress = true;
    lastScannedCode = decodedText;
    document.getElementById("scanStatus").textContent = "QR terbaca. Kamera tetap aktif; arahkan QR berikutnya atau tekan Scan Ulang.";
    try {
        await loadMemberData(decodedText);
    } finally {
        scanInProgress = false;
    }
}

window.resetScanner = async function() {
    document.getElementById("memberPanel").classList.add("hidden");
    lastScannedCode = null;
    await stopScanner();
    scanInProgress = false;
    await initScanner();
};

async function loadMemberData(id) {
    activeMemberId = id;
    try {
        const memberSnapshot = await getDoc(doc(db, "members", id));
        if (!memberSnapshot.exists()) {
            alert("Data member tidak ditemukan.");
            return;
        }

        const member = memberSnapshot.data();
        document.getElementById("dispNama").textContent = member.nama_lengkap || "Member";
        document.getElementById("dispId").textContent = id;
        document.getElementById("dispPoin").textContent = Number(member.saldo_poin) || 0;
        document.getElementById("memberPanel").classList.remove("hidden");
        const freeCups = Math.floor((Number(member.saldo_poin) || 0) / 100);
        const notice = document.getElementById("redeemNotice");
        notice.textContent = freeCups ? `Member dapat menukarkan ${freeCups} free cup.` : "";
        notice.classList.toggle("hidden", freeCups === 0);
    } catch (error) {
        console.error(error);
        alert("Gagal membaca data member. Periksa koneksi dan aturan Firestore.");
    }
}

async function changePoints(amount, type, cups) {
    if (!activeMemberId) return;
    const memberId = activeMemberId;
    const transactionRef = doc(collection(db, "memberTransactions"));
    await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, "members", memberId);
        const snapshot = await transaction.get(memberRef);
        if (!snapshot.exists()) throw new Error("MEMBER_NOT_FOUND");
        const member = snapshot.data();
        const currentPoints = Number(member.saldo_poin) || 0;
        const nextPoints = currentPoints + amount;
        if (nextPoints < 0) throw new Error("INSUFFICIENT_POINTS");
        transaction.update(memberRef, { saldo_poin: nextPoints });
        transaction.set(transactionRef, {
            auth_uid: member.auth_uid || null,
            member_id: memberId,
            type,
            cups,
            points_delta: amount,
            created_at: serverTimestamp()
        });
    });
    await loadMemberData(activeMemberId);
}

document.getElementById("btnTambahPoin").addEventListener("click", async () => {
    const cups = Number.parseInt(document.getElementById("inputCup").value, 10);
    if (!Number.isInteger(cups) || cups <= 0 || !activeMemberId) return alert("Jumlah cup tidak valid.");
    const button = document.getElementById("btnTambahPoin");
    button.disabled = true;
    try {
        await changePoints(cups * 10, "purchase", cups);
        document.getElementById("inputCup").value = "";
        alert(`Berhasil menambahkan ${cups * 10} poin.`);
    } catch (error) {
        console.error(error);
        alert("Poin gagal diperbarui.");
    } finally {
        button.disabled = false;
    }
});

document.getElementById("btnRedeem").addEventListener("click", async () => {
    const cups = Number.parseInt(document.getElementById("inputRedeem").value, 10);
    if (!Number.isInteger(cups) || cups <= 0 || !activeMemberId) return alert("Jumlah klaim tidak valid.");
    const button = document.getElementById("btnRedeem");
    button.disabled = true;
    try {
        await changePoints(-cups * 100, "redeem", cups);
        document.getElementById("inputRedeem").value = "";
        alert(`Berhasil menukarkan ${cups} free cup.`);
    } catch (error) {
        console.error(error);
        alert(error.message === "INSUFFICIENT_POINTS" ? `Poin tidak cukup. Dibutuhkan ${cups * 100} poin.` : "Penukaran poin gagal.");
    } finally {
        button.disabled = false;
    }
});

function createMemberId() {
    const now = new Date();
    const monthYear = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getFullYear()).slice(-2)}`;
    return `UTY-${monthYear}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function resetMemberForm() {
    editingMemberId = null;
    document.getElementById("memberForm").reset();
    document.getElementById("newEmail").readOnly = false;
    document.getElementById("emailHint").classList.add("hidden");
    document.getElementById("passwordField").classList.remove("hidden");
    document.getElementById("newPassword").required = true;
    document.getElementById("memberFormTitle").textContent = "Buat member baru";
    document.getElementById("btnBuatMember").innerHTML = '<span class="material-icons-round">person_add</span> Simpan member';
    document.getElementById("cancelEdit").classList.add("hidden");
}

async function createMemberAccount(member, password) {
    const secondaryApp = initializeFirebaseApp(firebaseConfig, `member-auth-${crypto.randomUUID()}`);
    const secondaryAuth = getAuth(secondaryApp);
    let newUser;
    try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, member.email, password);
        newUser = credential.user;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = createMemberId();
            try {
                await runTransaction(db, async (transaction) => {
                    const memberRef = doc(db, "members", id);
                    const existingMember = await transaction.get(memberRef);
                    if (existingMember.exists()) {
                        const collisionError = new Error("MEMBER_ID_COLLISION");
                        collisionError.code = "member/id-collision";
                        throw collisionError;
                    }
                    transaction.set(doc(db, "users", newUser.uid), {
                        role: "customer",
                        member_id: id,
                        email: newUser.email
                    });
                    transaction.set(memberRef, {
                        ...member,
                        auth_uid: newUser.uid,
                        saldo_poin: 0,
                        created_at: serverTimestamp()
                    });
                });
                return id;
            } catch (error) {
                if (error.code !== "member/id-collision") throw error;
            }
        }
        throw new Error("MEMBER_ID_ALLOCATION_FAILED");
    } catch (error) {
        if (newUser) {
            try { await deleteUser(newUser); } catch (cleanupError) { console.error(cleanupError); }
        }
        throw error;
    } finally {
        await signOut(secondaryAuth).catch(() => {});
        await deleteApp(secondaryApp);
    }
}

document.getElementById("memberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("btnBuatMember");
    const member = {
        nama_lengkap: document.getElementById("newNama").value.trim(),
        email: document.getElementById("newEmail").value.trim(),
        no_whatsapp: document.getElementById("newWA").value.trim(),
        alamat: document.getElementById("newAddress").value.trim()
    };
    button.disabled = true;
    try {
        if (editingMemberId) {
            await updateDoc(doc(db, "members", editingMemberId), member);
            document.getElementById("memberMessage").textContent = "Data member berhasil diperbarui.";
        } else {
            const id = await createMemberAccount(member, document.getElementById("newPassword").value);
            document.getElementById("cardNama").textContent = member.nama_lengkap;
            document.getElementById("cardId").textContent = id;
            document.getElementById("cardWA").textContent = "Tel: +6287887242409";
            document.getElementById("cardQR").src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(id)}`;
            document.getElementById("newCardPreview").classList.remove("hidden");
            document.getElementById("memberMessage").textContent = "Member berhasil dibuat.";
        }
        resetMemberForm();
        await loadAllMembers();
    } catch (error) {
        console.error(error);
        const message = error.code === "auth/email-already-in-use"
            ? "Email sudah digunakan akun lain. Gunakan email yang berbeda."
            : error.code === "auth/weak-password"
                ? "Password terlalu lemah. Gunakan minimal 6 karakter."
                : "Data gagal disimpan. Periksa koneksi, Authentication, dan aturan Firestore.";
        document.getElementById("memberMessage").textContent = message;
        document.getElementById("memberMessage").classList.add("error");
    } finally {
        button.disabled = false;
    }
});

document.getElementById("cancelEdit").addEventListener("click", resetMemberForm);

window.editMember = async function(id) {
    try {
        const snapshot = await getDoc(doc(db, "members", id));
        if (!snapshot.exists()) return;
        const member = snapshot.data();
        editingMemberId = id;
        document.getElementById("newNama").value = member.nama_lengkap || "";
        document.getElementById("newEmail").value = member.email || "";
        document.getElementById("newEmail").readOnly = Boolean(member.auth_uid);
        document.getElementById("emailHint").classList.toggle("hidden", !member.auth_uid);
        document.getElementById("newWA").value = member.no_whatsapp || "";
        document.getElementById("newAddress").value = member.alamat || "";
        document.getElementById("passwordField").classList.add("hidden");
        document.getElementById("newPassword").required = false;
        document.getElementById("memberFormTitle").textContent = `Edit member ${id}`;
        document.getElementById("btnBuatMember").innerHTML = '<span class="material-icons-round">save</span> Simpan perubahan';
        document.getElementById("cancelEdit").classList.remove("hidden");
        window.navigate("add");
    } catch (error) {
        console.error(error);
        alert("Data member gagal dibuka untuk diedit.");
    }
};

window.deleteMember = async function(id) {
    try {
        const memberSnapshot = await getDoc(doc(db, "members", id));
        if (!memberSnapshot.exists()) return;
        const userId = memberSnapshot.data().auth_uid;
        const authWarning = userId ? " Hapus juga akun Firebase Authentication secara manual agar email bisa digunakan kembali." : "";
        if (!window.confirm(`Hapus data member ${id}? Tindakan ini tidak dapat dibatalkan.${authWarning}`)) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, "members", id));
        if (userId) batch.delete(doc(db, "users", userId));
        await batch.commit();
        document.getElementById("memberMessage").textContent = userId
            ? "Data Firestore dihapus. Hapus akun Authentication melalui Firebase Console."
            : "Data member berhasil dihapus.";
        await loadAllMembers();
    } catch (error) {
        console.error(error);
        document.getElementById("memberMessage").textContent = "Data gagal dihapus. Periksa aturan Firestore.";
        document.getElementById("memberMessage").classList.add("error");
    }
};

function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
    return cell;
}

window.loadAllMembers = async function() {
    const tbody = document.getElementById("tableMembersBody");
    tbody.replaceChildren();
    const loadingRow = tbody.insertRow();
    const loadingCell = loadingRow.insertCell();
    loadingCell.colSpan = 8;
    loadingCell.className = "table-message";
    loadingCell.textContent = "Mengambil data member...";
    try {
        const snapshot = await getDocs(query(collection(db, "members"), orderBy("created_at", "desc")));
        tbody.replaceChildren();
        if (snapshot.empty) {
            const row = tbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 8;
            cell.className = "table-message";
            cell.textContent = "Belum ada member terdaftar.";
            return;
        }
        snapshot.forEach((memberDoc) => {
            const member = memberDoc.data();
            const row = tbody.insertRow();
            addCell(row, memberDoc.id);
            addCell(row, member.nama_lengkap || "-");
            addCell(row, member.email || "-");
            addCell(row, member.no_whatsapp || "-");
            addCell(row, member.alamat || "-");
            const pointsCell = row.insertCell();
            const badge = document.createElement("span");
            badge.className = "badge-poin";
            badge.textContent = `${Number(member.saldo_poin) || 0} poin`;
            pointsCell.append(badge);
            const joined = member.created_at?.toDate?.().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) || "-";
            addCell(row, joined);
            const actions = row.insertCell();
            actions.className = "row-actions";
            const editButton = document.createElement("button");
            editButton.className = "icon-action";
            editButton.type = "button";
            editButton.title = "Edit member";
            editButton.setAttribute("aria-label", `Edit ${member.nama_lengkap || memberDoc.id}`);
            editButton.innerHTML = '<span class="material-icons-round">edit</span>';
            editButton.addEventListener("click", () => editMember(memberDoc.id));
            const deleteButton = document.createElement("button");
            deleteButton.className = "icon-action danger-action";
            deleteButton.type = "button";
            deleteButton.title = "Hapus member";
            deleteButton.setAttribute("aria-label", `Hapus ${member.nama_lengkap || memberDoc.id}`);
            deleteButton.innerHTML = '<span class="material-icons-round">delete</span>';
            deleteButton.addEventListener("click", () => deleteMember(memberDoc.id));
            actions.append(editButton, deleteButton);
        });
    } catch (error) {
        console.error(error);
        tbody.replaceChildren();
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 8;
        cell.className = "table-message error";
        cell.textContent = "Data gagal dimuat. Pastikan login admin dan aturan Firestore sudah benar.";
    }
};

window.loadDashboardSummary = async function() {
    const activityBody = document.getElementById("dashboardActivityBody");
    activityBody.replaceChildren();
    const loadingRow = activityBody.insertRow();
    const loadingCell = loadingRow.insertCell();
    loadingCell.colSpan = 5;
    loadingCell.className = "table-message";
    loadingCell.textContent = "Mengambil ringkasan...";

    try {
        const [membersSnapshot, transactionsSnapshot] = await Promise.all([
            getDocs(collection(db, "members")),
            getDocs(query(collection(db, "memberTransactions"), orderBy("created_at", "desc")))
        ]);
        const membersById = new Map();
        let totalPoints = 0;
        membersSnapshot.forEach((memberDocument) => {
            const member = memberDocument.data();
            membersById.set(memberDocument.id, member.nama_lengkap || "Member");
            totalPoints += Number(member.saldo_poin) || 0;
        });

        const transactions = transactionsSnapshot.docs.map((transactionDocument) => ({
            id: transactionDocument.id,
            ...transactionDocument.data()
        }));
        const cupsSold = transactions.reduce((total, transaction) => total + (transaction.type === "purchase" ? Number(transaction.cups) || 0 : 0), 0);
        const cupsRedeemed = transactions.reduce((total, transaction) => total + (transaction.type === "redeem" ? Number(transaction.cups) || 0 : 0), 0);

        document.getElementById("summaryTotalMembers").textContent = membersSnapshot.size.toLocaleString("id-ID");
        document.getElementById("summaryCupsSold").textContent = cupsSold.toLocaleString("id-ID");
        document.getElementById("summaryTransactionCount").textContent = transactions.length.toLocaleString("id-ID");
        document.getElementById("summaryCupsRedeemed").textContent = cupsRedeemed.toLocaleString("id-ID");
        document.getElementById("summaryPoints").textContent = totalPoints.toLocaleString("id-ID");
        document.getElementById("dashboardTransactionCount").textContent = `${transactions.length.toLocaleString("id-ID")} transaksi tercatat`;

        activityBody.replaceChildren();
        if (!transactions.length) {
            const row = activityBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 5;
            cell.className = "table-message";
            cell.textContent = "Belum ada transaksi tercatat.";
            return;
        }

        transactions.slice(0, 10).forEach((transaction) => {
            const row = activityBody.insertRow();
            const date = transaction.created_at?.toDate?.().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) || "-";
            addCell(row, date);
            addCell(row, membersById.get(transaction.member_id) || transaction.member_id || "Member");
            addCell(row, transaction.type === "redeem" ? "Penukaran reward" : "Pembelian");
            addCell(row, `${Number(transaction.cups) || 0} cup`);
            const points = Number(transaction.points_delta) || 0;
            addCell(row, `${points > 0 ? "+" : ""}${points.toLocaleString("id-ID")} poin`);
        });
    } catch (error) {
        console.error(error);
        document.getElementById("summaryTotalMembers").textContent = "—";
        document.getElementById("summaryCupsSold").textContent = "—";
        document.getElementById("summaryTransactionCount").textContent = "—";
        document.getElementById("summaryCupsRedeemed").textContent = "—";
        document.getElementById("summaryPoints").textContent = "—";
        document.getElementById("dashboardTransactionCount").textContent = "Data belum tersedia";
        activityBody.replaceChildren();
        const row = activityBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.className = "table-message error";
        cell.textContent = "Ringkasan gagal dimuat. Periksa login admin dan aturan Firestore.";
    }
};

window.printCard = function() {
    window.print();
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("./login.html");
        return;
    }
    try {
        const profile = await getDoc(doc(db, "users", user.uid));
        if (!profile.exists() || profile.data().role !== "admin") {
            window.location.replace(profile.data()?.role === "customer" ? "./customer.html" : "./login.html");
            return;
        }
        document.getElementById("adminName").textContent = "Administrator";
        const adminEmail = document.getElementById("adminEmail");
        adminEmail.textContent = user.email || "Email admin tidak tersedia";
        adminEmail.title = user.email || "";
        await window.navigate("dashboard");
    } catch (error) {
        console.error(error);
        window.location.replace("./login.html");
    }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("./index.html");
});
