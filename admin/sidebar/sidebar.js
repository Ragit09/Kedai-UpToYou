export function renderAdminSidebar(sidebar) {
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h2><span class="material-icons-round">local_cafe</span> Up To You</h2>
        </div>
        <nav class="nav-menu" aria-label="Navigasi admin">
            <button class="nav-item active" id="nav-dashboard" type="button" aria-current="page" onclick="navigate('dashboard')">
                <span class="material-icons-round">dashboard</span> Dashboard
            </button>
            <button class="nav-item" id="nav-scan" type="button" onclick="navigate('scan')">
                <span class="material-icons-round">qr_code_scanner</span> Kasir & Scan QR
            </button>
            <button class="nav-item" id="nav-add" type="button" onclick="navigate('add')">
                <span class="material-icons-round">person_add</span> Buat Member Baru
            </button>
            <button class="nav-item" id="nav-list" type="button" onclick="navigate('list')">
                <span class="material-icons-round">groups</span> Semua Member
            </button>
        </nav>
        <div class="user-profile">
            <div class="avatar">A</div>
            <div class="user-info">
                <p id="adminName">Administrator</p>
                <span id="adminEmail">Email admin</span>
            </div>
        </div>
        <button class="sidebar-logout" id="logoutButton" type="button">
            <span class="material-icons-round">logout</span> Keluar
        </button>
    `;
}
