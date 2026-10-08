export function renderCustomerSidebar(sidebar) {
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h2><span class="material-icons-round">local_cafe</span> Up To You</h2>
        </div>
        <nav class="nav-menu" aria-label="Navigasi member">
            <button class="nav-item active" id="member-nav-dashboard" type="button" aria-current="page" onclick="navigateMember('dashboard')">
                <span class="material-icons-round">dashboard</span> Dashboard
            </button>
            <button class="nav-item" id="member-nav-card" type="button" onclick="navigateMember('card')">
                <span class="material-icons-round">credit_card</span> Kartu Member
            </button>
            <button class="nav-item" id="member-nav-rewards" type="button" onclick="navigateMember('rewards')">
                <span class="material-icons-round">redeem</span> Reward Member
            </button>
            <button class="nav-item" id="member-nav-profile" type="button" onclick="navigateMember('profile')">
                <span class="material-icons-round">person</span> Profil
            </button>
        </nav>
        <div class="user-profile">
            <div class="avatar" id="memberAvatar">M</div>
            <div class="user-info">
                <p id="memberSidebarName">Member</p>
                <span id="memberSidebarEmail">Email member</span>
            </div>
        </div>
        <button class="sidebar-logout" id="logoutButton" type="button">
            <span class="material-icons-round">logout</span> Keluar
        </button>
    `;
}
