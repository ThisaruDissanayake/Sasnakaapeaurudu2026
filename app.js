// GitHub Copilot (GPT-5.1) - Aurudu 2026 site logic

let currentUser = null;

// ---- Data Model ----
// category: 'kumara' or 'kumariya'
// contestant: { id, category, name, district, age, photoDataUrl, scores: { judgeKey: number }, total: number }
// Data is loaded from and saved to MongoDB Atlas via the backend API.
let contestants = [];
let requests = [];
let removed = [];

function canViewContestants() {
  return currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'judge');
}

function canManageContestants() {
  return currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
}

// Helper to convert backend Mongo document to client object
function mapContestant(doc) {
  return {
    id: doc._id,
    category: doc.category,
    name: doc.name,
    district: doc.district,
    age: doc.age,
    photoDataUrl: doc.photoDataUrl,
    starred: !!doc.starred,
    scores: doc.scores || {},
    total: typeof doc.total === 'number' ? doc.total : 0
  };
}

// ---- DOM Helpers ----
const $ = (id) => document.getElementById(id);

const views = {
  home: $('homeView'),
  leaderboards: $('leaderboardsView'),
  admin: $('adminView'),
  judge: $('judgeView')
};

function showView(key) {
  Object.values(views).forEach((el) => el.classList.remove('active'));
  if (views[key]) views[key].classList.add('active');
}

// ---- Toast Notifications ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  // trigger transition
  requestAnimationFrame(() => {
    el.classList.add('show');
  });

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.remove();
    }, 220);
  }, 2600);
}

// ---- Auth ----
function updateAuthUI() {
  const label = $('currentUserLabel');
  const loginBtn = $('loginBtn');
  const logoutBtn = $('logoutBtn');
  const adminNav = $('adminNav');
  const leaderboardsNav = $('leaderboardsNav');
  const judgeNav = $('judgeNav');

  if (!currentUser) {
    label.textContent = 'Not logged in';
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    adminNav.disabled = true;
    if (leaderboardsNav) leaderboardsNav.disabled = true;
    judgeNav.disabled = true;
  } else {
    label.textContent = `${currentUser.username} (${currentUser.role})`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';

    if (currentUser.role === 'superadmin') {
      adminNav.disabled = false;
      if (leaderboardsNav) leaderboardsNav.disabled = false;
      judgeNav.disabled = false;
    } else if (currentUser.role === 'admin') {
      adminNav.disabled = false;
      if (leaderboardsNav) leaderboardsNav.disabled = true;
      judgeNav.disabled = true;
    } else if (currentUser.role === 'judge') {
      adminNav.disabled = true;
      if (leaderboardsNav) leaderboardsNav.disabled = false;
      judgeNav.disabled = false;
    }
  }
}

async function handleLogin(username, password) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    currentUser = { username: data.username, role: data.role };
    updateAuthUI();
    if (canViewContestants()) {
      await fetchContestantsFromServer();
    } else {
      contestants = [];
      renderAll();
    }
    showToast(`Logged in as ${data.username}`, 'success');
    if (data.role === 'superadmin') {
      fetchRequestsFromServer();
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function handleLogout() {
  currentUser = null;
  contestants = [];
  updateAuthUI();
  renderAll();
  showToast('Logged out', 'info');
}

// ---- Contestant Management ----
async function fetchContestantsFromServer() {
  if (!canViewContestants()) {
    contestants = [];
    renderAll();
    return;
  }

  try {
    const res = await fetch('/api/contestants');
    if (!res.ok) throw new Error('Failed to fetch contestants');
    const data = await res.json();
    contestants = data.map(mapContestant);
    renderAll();
  } catch (err) {
    console.error(err);
  }
}

async function addContestantToServer({ category, name, district, age, photoDataUrl }) {
  try {
    const res = await fetch('/api/contestants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, name, district, age, photoDataUrl })
    });
    if (!res.ok) throw new Error('Failed to save contestant');
    const saved = await res.json();
    const clientContestant = mapContestant(saved);
    contestants.push(clientContestant);
    renderAll();
    showToast('Contestant added successfully', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error saving contestant. Please try again.', 'error');
  }
}

async function fetchRequestsFromServer() {
  try {
    const res = await fetch('/api/requests?status=pending');
    if (!res.ok) throw new Error('Failed to fetch requests');
    const data = await res.json();
    requests = data;
    renderRequests();
  } catch (err) {
    console.error(err);
    showToast('Error loading requests', 'error');
  }
}

async function createRequestOnServer(payload) {
  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create request');
    await fetchRequestsFromServer();
  } catch (err) {
    console.error(err);
    showToast('Error sending request. Please try again.', 'error');
  }
}

async function fetchRemovedFromServer() {
  try {
    const res = await fetch('/api/requests?status=approved&action=delete');
    if (!res.ok) throw new Error('Failed to fetch removed contestants');
    const data = await res.json();
    removed = data;
    renderRemoved();
  } catch (err) {
    console.error(err);
    showToast('Error loading removed contestants', 'error');
  }
}

async function deleteContestantFromServer(id, reason) {
  try {
    const res = await fetch(`/api/contestants/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' })
    });
    if (!res.ok) throw new Error('Failed to delete contestant');
    contestants = contestants.filter((c) => c.id !== id);
    renderAll();
    showToast('Contestant deleted', 'success');
    // Also refresh removed list so direct deletions appear there
    fetchRemovedFromServer();
  } catch (err) {
    console.error(err);
    showToast('Error deleting contestant. Please try again.', 'error');
  }
}

async function updateStarOnServer(id, starred) {
  try {
    const res = await fetch(`/api/contestants/${id}/star`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred })
    });
    if (!res.ok) throw new Error('Failed to update star');
    const updated = await res.json();
    const updatedClient = mapContestant(updated);
    const idx = contestants.findIndex((c) => c.id === id);
    if (idx !== -1) {
      contestants[idx] = updatedClient;
    }
    renderAll();
    showToast(starred ? 'Contestant starred' : 'Star removed', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error updating star. Please try again.', 'error');
  }
}

function computeTotal(scores) {
  return Object.values(scores).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
}

function setScore(contestantId, judgeKey, scoreValue) {
  const c = contestants.find((x) => x.id === contestantId);
  if (!c) return;
  const v = Number(scoreValue);
  if (!Number.isFinite(v) || v < 0 || v > 10) return;
  c.scores[judgeKey] = v;
  c.total = computeTotal(c.scores);
}

// ---- Rendering ----
function renderLeaderboards() {
  const kumaraLeaderboard = $('kumaraLeaderboard');
  const kumariyaLeaderboard = $('kumariyaLeaderboard');
  const homeKumaraBoard = $('homeKumaraBoard');
  const homeKumariyaBoard = $('homeKumariyaBoard');

  const restrictedMessage = '<p class="hint">Contestants are visible to superadmins and judges only.</p>';

  if (!canViewContestants()) {
    if (kumaraLeaderboard) kumaraLeaderboard.innerHTML = restrictedMessage;
    if (kumariyaLeaderboard) kumariyaLeaderboard.innerHTML = restrictedMessage;
    if (homeKumaraBoard) homeKumaraBoard.innerHTML = restrictedMessage;
    if (homeKumariyaBoard) homeKumariyaBoard.innerHTML = restrictedMessage;
    return;
  }

  const renderTable = (category) => {
    const filtered = contestants
      .filter((c) => c.category === category)
      .slice()
      .sort((a, b) => {
        const starDiff = (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
        if (starDiff !== 0) return starDiff; // starred first
        return b.total - a.total; // then by marks
      });

    if (!filtered.length) {
      return '<p class="hint">No contestants yet.</p>';
    }

    const rows = filtered
      .map((c, index) => {
        const rank = index + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'rank-1';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';
        return `
          <tr class="leaderboard-row ${rank === 1 ? 'leaderboard-first' : ''}">
            <td class="${rankClass}">${rank}</td>
            <td><img src="${c.photoDataUrl}" alt="${c.name}" class="avatar avatar-medium" /></td>
            <td>${c.name}${c.starred ? ' <span class="star-flag">★</span>' : ''}</td>
            <td>${c.district}</td>
            <td>${c.age}</td>
            <td>${c.total.toFixed(1)}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Photo</th>
              <th>Name</th>
              <th>District</th>
              <th>Age</th>
              <th>Total Marks</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  kumaraLeaderboard.innerHTML = renderTable('kumara');
  kumariyaLeaderboard.innerHTML = renderTable('kumariya');
  homeKumaraBoard.innerHTML = renderTable('kumara');
  homeKumariyaBoard.innerHTML = renderTable('kumariya');
}

function renderRemoved() {
  const removedList = $('removedList');
  if (!removedList) return;

  if (!removed.length) {
    removedList.innerHTML = '<p class="hint">No contestants have been removed yet.</p>';
    return;
  }

  removedList.innerHTML = removed
    .map((r) => {
      const created = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
      const reason = r.note ? `Reason: ${r.note}` : 'Reason not specified';
      return `
      <div class="contestant-card">
        <div class="contestant-info">
          <div class="contestant-name">${r.contestantName}</div>
          <div class="contestant-meta">Requested by: ${r.requestedBy}</div>
          <div class="contestant-meta">${reason}</div>
          ${created ? '<div class="contestant-meta">Removed at: ' + created + '</div>' : ''}
        </div>
      </div>
    `;
    })
    .join('');
}

function renderAdminLists() {
  const adminKumaraList = $('adminKumaraList');
  const adminKumariyaList = $('adminKumariyaList');

  if (!adminKumaraList || !adminKumariyaList) return;

  if (!canManageContestants()) {
    const message = '<p class="hint">Only admin or superadmin can add contestants. Contestant lists are hidden for this role.</p>';
    adminKumaraList.innerHTML = message;
    adminKumariyaList.innerHTML = message;
    return;
  }

  const renderList = (category) => {
    const list = contestants.filter((c) => c.category === category);
    if (!list.length) return '<p class="hint">No contestants added yet.</p>';

    const role = currentUser?.role;

    return list
      .map((c) => {
        const isStarred = !!c.starred;
        let actionsHtml = '';
        if (role === 'superadmin') {
          actionsHtml =
            '<button class="secondary-btn star-btn' +
            (isStarred ? ' star-btn-on' : '') +
            '" data-id="' +
            c.id +
            '" data-star="' +
            (isStarred ? 'on' : 'off') +
            '">★</button>' +
            ' <button class="secondary-btn danger-btn delete-contestant-btn" data-id="' +
            c.id +
            '">Delete</button>';
        } else if (role === 'admin') {
          actionsHtml =
            '<button class="secondary-btn request-btn request-delete-btn" data-id="' +
            c.id +
            '">Request Delete</button>';
        }

        return `
      <div class="contestant-card">
        <img src="${c.photoDataUrl}" alt="${c.name}" class="avatar" />
        <div class="contestant-info">
          <div class="contestant-name">${c.name}${
            isStarred ? ' <span class="star-flag">★</span>' : ''
          }</div>
          <div class="contestant-meta">${c.district} • Age ${c.age}</div>
        </div>
        <div class="contestant-score">
          Total: <strong>${c.total.toFixed(1)}</strong>
        </div>
        ${actionsHtml}
      </div>
    `;
      })
      .join('');
  };

  adminKumaraList.innerHTML = renderList('kumara');
  adminKumariyaList.innerHTML = renderList('kumariya');
}

function renderJudgeLists() {
  const judgeKumaraList = $('judgeKumaraList');
  const judgeKumariyaList = $('judgeKumariyaList');

  const judgeSlots = [
    { key: 'judge1', label: 'Mr Hasitha Wijesundara' },
    { key: 'judge2', label: 'Mis Dilanjalee Wijesundara' },
    { key: 'judge3', label: 'Mr Charith Weerasinghe' },
    { key: 'judge4', label: 'Mis Hiruni Tharaka' },
    { key: 'judge5', label: 'Ms Pavithra Dulmini' }
  ];

  const disabledHint = !currentUser || (currentUser && currentUser.role !== 'judge')
    ? '<p class="hint">Login as Judge to give marks. Our judges: Mr Hasitha Wijesundara, Mis Dilanjalee Wijesundara, Mr Charith Weerasinghe, Mis Hiruni Tharaka, Ms Pavithra Dulmini.</p>'
    : '';

  const renderList = (category) => {
    const list = contestants.filter((c) => c.category === category && c.starred);
    if (!list.length) return '<p class="hint">No starred contestants yet.</p>';

    return (
      disabledHint +
      list
        .map((c) => {
          const disabledAttr = !currentUser || currentUser.role !== 'judge' ? 'disabled' : '';

          const slotsHtml = judgeSlots
            .map(({ key, label }) => {
              const value = c.scores[key] ?? '';
              return `
                <div>
                  <div class="judge-slot-label">${label}</div>
                  <input type="number" min="0" max="10" step="0.5" class="score-input" ${disabledAttr}
                    data-id="${c.id}" data-judge="${key}" value="${value}" />
                </div>
              `;
            })
            .join('');

          return `
          <div class="contestant-card">
            <img src="${c.photoDataUrl}" alt="${c.name}" class="avatar avatar-large" />
            <div class="contestant-info">
              <div class="contestant-name">${c.name}</div>
              <div class="contestant-meta">${c.district} • Age ${c.age}</div>
              <div class="contestant-meta">Total so far: <strong>${c.total.toFixed(1)}</strong></div>
              <div class="judge-slots">
                ${slotsHtml}
              </div>
            </div>
            <div>
              <button class="primary-btn score-save-btn" ${disabledAttr}
                data-id="${c.id}">Save Marks</button>
            </div>
          </div>
        `;
        })
        .join('')
    );
  };

  judgeKumaraList.innerHTML = renderList('kumara');
  judgeKumariyaList.innerHTML = renderList('kumariya');
}

function renderAll() {
  renderLeaderboards();
  renderAdminLists();
  renderJudgeLists();
  renderRemoved();
}

function renderRequests() {
  const card = $('superadminRequestsCard');
  const listEl = $('requestsList');
  if (!card || !listEl) return;

  if (!currentUser || currentUser.role !== 'superadmin') {
    card.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  card.style.display = '';

  if (!requests.length) {
    listEl.innerHTML = '<p class="hint">No pending requests.</p>';
    return;
  }

  listEl.innerHTML = requests
    .map(
      (r) => `
      <div class="contestant-card">
        <div class="contestant-info">
          <div class="contestant-name">${r.action.toUpperCase()} - ${r.contestantName}</div>
          <div class="contestant-meta">Requested by: ${r.requestedBy}</div>
          ${r.note ? '<div class="contestant-meta">Note: ' + r.note + '</div>' : ''}
        </div>
        <div>
          <button class="primary-btn approve-request-btn" data-id="${r._id}">Approve</button>
          <button class="secondary-btn danger-btn reject-request-btn" data-id="${r._id}">Reject</button>
        </div>
      </div>
    `
    )
    .join('');
}

// ---- Event Wiring ----
function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (!view) return;
      if (view === 'admin' && (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin'))) return;
      if (view === 'judge' && (!currentUser || (currentUser.role !== 'judge' && currentUser.role !== 'superadmin'))) return;
      if (view === 'leaderboards' && !canViewContestants()) return;
      showView(view);
    });
  });
}

function initLeaderboardTabs() {
  const kumaraSection = $('lbKumaraSection');
  const kumariyaSection = $('lbKumariyaSection');
  const removedSection = $('lbRemovedSection');
  const buttons = Array.from(document.querySelectorAll('.subnav-btn[data-lb]'));
  if (!kumaraSection || !kumariyaSection || !removedSection || !buttons.length) return;

  const setActive = (target) => {
    if (target === 'kumara') {
      kumaraSection.style.display = '';
      kumariyaSection.style.display = 'none';
      removedSection.style.display = 'none';
    } else if (target === 'kumariya') {
      kumaraSection.style.display = 'none';
      kumariyaSection.style.display = '';
      removedSection.style.display = 'none';
    } else if (target === 'removed') {
      kumaraSection.style.display = 'none';
      kumariyaSection.style.display = 'none';
      removedSection.style.display = '';
      fetchRemovedFromServer();
    }
    buttons.forEach((b) => {
      const val = b.getAttribute('data-lb');
      b.classList.toggle('active', val === target);
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-lb');
      if (!target) return;
      setActive(target);
    });
  });

  setActive('kumara');
}

function initJudgeTabs() {
  const kumaraSection = $('judgeKumaraSection');
  const kumariyaSection = $('judgeKumariyaSection');
  const buttons = Array.from(document.querySelectorAll('.subnav-btn[data-judge-tab]'));
  if (!kumaraSection || !kumariyaSection || !buttons.length) return;

  const setActive = (target) => {
    if (target === 'kumara') {
      kumaraSection.style.display = '';
      kumariyaSection.style.display = 'none';
    } else {
      kumaraSection.style.display = 'none';
      kumariyaSection.style.display = '';
    }
    buttons.forEach((b) => {
      const val = b.getAttribute('data-judge-tab');
      b.classList.toggle('active', val === target);
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-judge-tab');
      if (!target) return;
      setActive(target);
    });
  });

  setActive('kumara');
}

function initAuth() {
  const loginModal = $('loginModal');
  const loginBtn = $('loginBtn');
  const logoutBtn = $('logoutBtn');
  const cancelLogin = $('cancelLogin');
  const loginForm = $('loginForm');
  const loginError = $('loginError');

  loginBtn.addEventListener('click', () => {
    loginModal.classList.remove('hidden');
    loginError.style.display = 'none';
    $('loginUser').focus();
  });

  cancelLogin.addEventListener('click', () => {
    loginModal.classList.add('hidden');
  });

  logoutBtn.addEventListener('click', () => {
    handleLogout();
    showView('home');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value.trim();
    const ok = await handleLogin(username, password);
    if (!ok) {
      loginError.textContent = 'Invalid username or password';
      loginError.style.display = 'block';
      return;
    }
    loginModal.classList.add('hidden');
    loginForm.reset();
  });

  // Close modal on backdrop click
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      loginModal.classList.add('hidden');
    }
  });
}

function initAdminForm() {
  const form = $('contestantForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canManageContestants()) {
      alert('Only admin or superadmin can add contestants.');
      return;
    }

    const category = $('category').value;
    const name = $('name').value.trim();
    const district = $('district').value.trim();
    const age = Number($('age').value);
    const photoInput = $('photo');
    const file = photoInput.files[0];

    if (!file) {
      alert('Please select a photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (ev) {
      const photoDataUrl = ev.target.result;
      addContestantToServer({ category, name, district, age, photoDataUrl });
      form.reset();
    };
    reader.readAsDataURL(file);
  });
}

function initAdminActions() {
  const handler = (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const id = e.target.getAttribute('data-id');
    if (!id) return;

    if (e.target.classList.contains('delete-contestant-btn')) {
      if (!currentUser || currentUser.role !== 'superadmin') return;
      const reason = window.prompt('Please enter the reason for deleting this contestant:');
      if (reason === null) return; // cancelled
      if (!reason.trim()) {
        alert('Reason is required to delete a contestant.');
        return;
      }
      deleteContestantFromServer(id, reason.trim());
      return;
    }

    if (e.target.classList.contains('star-btn')) {
      if (!currentUser || currentUser.role !== 'superadmin') return;
      const current = e.target.getAttribute('data-star') === 'on';
      updateStarOnServer(id, !current);
      return;
    }

    if (e.target.classList.contains('request-delete-btn')) {
      if (!currentUser || currentUser.role !== 'admin') return;
      const contestant = contestants.find((c) => c.id === id);
      if (!contestant) return;
      const note = window.prompt('Reason for delete (optional):') || '';
      createRequestOnServer({
        action: 'delete',
        contestantId: contestant.id,
        contestantName: contestant.name,
        requestedBy: currentUser.username,
        note
      });
    }
  };

  const adminKumaraList = $('adminKumaraList');
  const adminKumariyaList = $('adminKumariyaList');
  if (adminKumaraList) adminKumaraList.addEventListener('click', handler);
  if (adminKumariyaList) adminKumariyaList.addEventListener('click', handler);
}

function initRequestActions() {
  const listEl = $('requestsList');
  if (!listEl) return;

  listEl.addEventListener('click', async (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const id = e.target.getAttribute('data-id');
    if (!id) return;

    try {
      if (e.target.classList.contains('approve-request-btn')) {
        const res = await fetch(`/api/requests/${id}/approve`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to approve request');
        await fetchRequestsFromServer();
        await fetchContestantsFromServer();
        await fetchRemovedFromServer();
        showToast('Request approved', 'success');
      } else if (e.target.classList.contains('reject-request-btn')) {
        const res = await fetch(`/api/requests/${id}/reject`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to reject request');
        await fetchRequestsFromServer();
        showToast('Request rejected', 'info');
      }
    } catch (err) {
      console.error(err);
      showToast('Error processing request. Please try again.', 'error');
    }
  });
}

function initJudgeActions() {
  const onClick = async (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (!e.target.classList.contains('score-save-btn')) return;
    if (!currentUser || currentUser.role !== 'judge') {
      alert('Login as judge to save scores.');
      return;
    }
    const id = e.target.getAttribute('data-id');
    const container = e.target.closest('.contestant-card');
    if (!container) return;
    const inputs = container.querySelectorAll('.score-input');
    const updates = [];

    for (const input of inputs) {
      const judgeKey = input.getAttribute('data-judge');
      if (!judgeKey) continue;
      const value = input.value;
      if (value === '') continue; // allow leaving blank
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 10) {
        alert('Please enter scores between 0 and 10 for all filled fields.');
        return;
      }
      updates.push({ judgeKey, num });
    }

    if (!updates.length) {
      showToast('Please enter at least one score before saving.', 'info');
      return;
    }

    try {
      const scoresPayload = {};
      updates.forEach(({ judgeKey, num }) => {
        scoresPayload[judgeKey] = num;
      });

      const res = await fetch(`/api/contestants/${id}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: scoresPayload })
      });

      if (!res.ok) throw new Error('Failed to save scores');
      const updated = await res.json();
      const updatedClient = mapContestant(updated);

      const idx = contestants.findIndex((c) => c.id === id);
      if (idx !== -1) {
        contestants[idx] = updatedClient;
      }
      renderAll();
      showToast('Scores saved', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error saving scores. Please try again.', 'error');
    }
  };

  $('judgeKumaraList').addEventListener('click', onClick);
  $('judgeKumariyaList').addEventListener('click', onClick);
}

function initImageModal() {
  const modal = $('imageModal');
  const img = $('imageModalImg');
  const closeBtn = $('imageModalClose');
  if (!modal || !img || !closeBtn) return;

  const hide = () => {
    modal.classList.add('hidden');
  };

  closeBtn.addEventListener('click', hide);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.classList.contains('avatar')) return;
    img.src = target.src;
    img.alt = target.alt || '';
    modal.classList.remove('hidden');
  });
}

function initBasicProtections() {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Block some common devtools shortcuts (can still be bypassed by experts)
  document.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();
    if (
      key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
      (e.ctrlKey && key === 'U')
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

// ---- Initialization ----
window.addEventListener('DOMContentLoaded', () => {
  initNav();
  initAuth();
  initAdminForm();
  initAdminActions();
  initRequestActions();
  initJudgeActions();
   initLeaderboardTabs();
   initJudgeTabs();
  initImageModal();
  initBasicProtections();
  initLanding();
  updateAuthUI();
  if (currentUser && currentUser.role === 'superadmin') {
    fetchRequestsFromServer();
  }
});

// Landing overlay logic
function initLanding() {
  const overlay = document.getElementById('landingOverlay');
  const enterBtn = document.getElementById('enterSiteBtn');
  if (!overlay || !enterBtn) return;

  const hideOverlay = () => {
    overlay.classList.add('landing-overlay-hidden');
    setTimeout(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }, 1250);
  };

  enterBtn.addEventListener('click', hideOverlay);

  // While landing is visible, prevent background scrolling
  document.body.style.overflow = 'hidden';
}
