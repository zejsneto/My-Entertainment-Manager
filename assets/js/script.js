// ============================
// LocalStorage Utilities (Fallback if no Firebase)
// ============================

const STORAGE_KEY = "myMediaList";

function loadFromLocalStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
}

function saveToLocalStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ============================
// Load Media Data (JSON)
// ============================

let globalMedias = []; // Stores all media items fetched from JSON
let currentRenderedMedias = []; // Stores the current result visible on the screen
let currentFilter = 'all'; // Stores the current filter type (e.g., 'games', 'movies')
let currentSort = ''; // Stores the current sort option (e.g., 'title-asc')

// fetch('data/media.json')
//     .then(res => {
//         if (!res.ok) throw new Error('media.json not found or invalid.');
//         return res.json();
//     })
//     .then(data => {
//         if (!Array.isArray(data) || data.length === 0) {
//             console.warn('media.json is empty or in incorrect format.');
//             document.getElementById('json-btn').style.display = "none";
//             return;
//         }

//         globalMedias = data;

//         // Only shows the button if there is data
//         document.getElementById('json-btn').style.display = "inline-block";

//         // Filter before rendering
//         const activeTypes = JSON.parse(localStorage.getItem("activeMediaTypes")) || [];
//         const filtered = globalMedias.filter(m => {
//             if (m.type === "animated_movies") {
//                 // Appears if movies or animations are actively active (or if animated_movies are active directly)
//                 return activeTypes.includes("movies") || activeTypes.includes("animations") || activeTypes.includes("animated_movies");
//             }
//             return activeTypes.includes(m.type);
//         });

//         renderMedias(filtered);

//         filterSetup();
//         searchSetup();
//         setupSort();

//         updateAchievementsTooltip();

//     })
//     .catch(error => {
//         console.error('Error loading media.json:', error);
//         //alert("Error loading media data. Check if the file exists and is correct.");
//         globalMedias = [];
//         document.getElementById('json-btn').style.display = "none";
//     });

// ============================
// Firebase Auth (Email/Password)
// ============================

window.AUTH = window.AUTH || window._AUTH;

document.getElementById("login-form").addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    login(email, password);
});

// Configura persistência do login
AUTH.setPersistence(firebase.auth.Auth.Persistence.LOCAL) // LOCAL = mantém após fechar página
    .then(() => {
        console.log("Persistência configurada: LOCAL (permanece após reload).");
    })
    .catch(err => {
        console.error("Erro ao configurar persistência:", err);
    });

// Logar usuário
async function login(email, password) {
    try {
        await AUTH.signInWithEmailAndPassword(email, password);
        console.log("Login bem-sucedido!");
        checkUserPermissions();

        // Fecha modal automaticamente após login
        const modal = document.getElementById("edit-profile-modal");
        modal.classList.add("hidden");

        // Atualiza profile na tela
        loadProfileFromFirebase();

    } catch (err) {
        console.error("Erro ao logar:", err);
        alert("Email ou senha inválidos.");
    }
}

// Checar se usuário logado é você
function checkUserPermissions() {
    const user = AUTH.currentUser;
    if (user && user.uid === "5z1Csjq7NlNFU1F744kqBkX6WRB3") {
        console.log("Você pode editar/criar/deletar.");
        window.canEdit = true;
    } else {
        console.log("Usuário não autorizado para CUD.");
        window.canEdit = false;
    }
}

// Deslogar
document.getElementById("logout-btn").addEventListener("click", (e) => {
    e.preventDefault(); // evita submit do form
    logout();
});


function logout() {
    AUTH.signOut().then(() => {
        console.log("Deslogado.");
        window.canEdit = false;
    });
}

// Monitorar estado de login (persistência)
AUTH.onAuthStateChanged(user => {
    if (user) {
        checkUserPermissions();

        // Fecha modal caso esteja aberto
        const modal = document.getElementById("edit-profile-modal");
        modal.classList.add("hidden");

        // Atualiza profile visível
        loadProfileFromFirebase();

        // Usuário logado → mostra botões/campos restritos
        document.body.classList.add("logged-in");
    } else {
        // Usuário não logado → esconde botões/campos restritos
        document.body.classList.remove("logged-in");

        window.canEdit = false;
    }
});

document.getElementById("login-btn").addEventListener("click", () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    login(email, password);
});

// ============================
// Firebase CRUD Functions
// ============================
// ADD
async function createMediaFirestore(mediaObj, imageFile) {
    const maxId = globalMedias.length > 0 ? Math.max(...globalMedias.map(m => Number(m.id) || 0)) : 0;
    mediaObj.id = maxId + 1;

    const template = {
        id: null,
        type: null,
        title: null,
        rating: null,
        cover_img: null, // Base64 vai aqui
        consumed_date: null,
        seasons_watched: null,
        seasons_total: null,
        use_episodes: null,
        episodes_watched: null,
        episodes_total: null,
        hours_played: null,
        online: null,
        beaten: null,
        trophies_total: null,
        trophies_obtained: null,
        pages_read: null,
        pages_total: null,
        duration_only_minutes: null,
        use_hours: null,
        duration_hours: null,
        duration_minutes: null,
        volume_amount: null,
        volume_read: null
    };

    mediaObj = { ...template, ...mediaObj };

    try {
        if (imageFile) {
            mediaObj.cover_img = await fileToBase64(imageFile);
        }

        const docRef = await window._DB.collection('media').add(mediaObj);
        mediaObj._docId = docRef.id;
        globalMedias.push(mediaObj);
        renderFilteredAndSorted();

        console.log('Mídia adicionada com ID:', docRef.id);
    } catch (err) {
        console.error('Erro ao adicionar mídia:', err);
        alert('Erro ao adicionar mídia (veja console).');
    }
}

// EDIT
async function updateMediaFirestore(docId, updatedData, imageFile) {
    try {
        if (imageFile) {
            updatedData.cover_img = await fileToBase64(imageFile);
        }

        await window._DB.collection('media').doc(docId).update(updatedData);

        const idx = globalMedias.findIndex(m => m._docId === docId);
        if (idx > -1) {
            globalMedias[idx] = { ...globalMedias[idx], ...updatedData };
            renderFilteredAndSorted();
        }

        console.log('Mídia atualizada:', docId);
    } catch (err) {
        console.error('Erro ao atualizar mídia:', err);
        alert('Erro ao atualizar mídia (veja console).');
    }
}

// DELETE
async function deleteMediaFirestore(docId) {
    try {
        await window._DB.collection('media').doc(docId).delete();

        // Remove do array local
        globalMedias = globalMedias.filter(m => m._docId !== docId);
        renderFilteredAndSorted();

        console.log('Mídia deletada:', docId);
    } catch (err) {
        console.error('Erro ao deletar mídia:', err);
        alert('Erro ao deletar mídia (veja console).');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}


loadMediaFromFirestore();

// ============================
// Load Media Data from Firestore
// ============================
async function loadMediaFromFirestore() {
    try {
        const snapshot = await window._DB.collection('media').get();
        if (snapshot.empty) {
            console.warn('Firestore: media collection is empty.');
            document.getElementById('json-btn').style.display = "none";
            globalMedias = [];
            return;
        }

        globalMedias = snapshot.docs.map(doc => ({
            _docId: doc.id, // <- id do Firestore
            ...doc.data()
        }));

        // Só mostra botão se tem dados
        document.getElementById('json-btn').style.display = "inline-block";

        // Filtrar antes de renderizar
        const activeTypes = JSON.parse(localStorage.getItem("activeMediaTypes")) || [];
        const filtered = globalMedias.filter(m => {
            if (m.type === "animated_movies") {
                return activeTypes.includes("movies") || activeTypes.includes("animations") || activeTypes.includes("animated_movies");
            }
            return activeTypes.includes(m.type);
        });

        renderMedias(filtered);
        filterSetup();
        searchSetup();
        setupSort();
        updateAchievementsTooltip();

    } catch (err) {
        console.error('Erro ao carregar do Firestore:', err);
        globalMedias = [];
        document.getElementById('json-btn').style.display = "none";
    }
}

// ============================
// Profile Functions (GLOBAL)
// ============================
async function loadProfileFromFirebase() {
    const profilePic = document.querySelector(".profile-pic");
    const nameDisplay = document.querySelector(".profile-text strong");
    const usernameDisplay = document.querySelector(".profile-text span");

    try {
        const doc = await window._DB.collection("profile").doc("mainProfile").get();
        if (doc.exists) {
            const data = doc.data();
            nameDisplay.textContent = data.name || "Sem nome";
            usernameDisplay.textContent = '@' + (data.username || "user");
            if (data.photo) profilePic.src = data.photo;
        }
    } catch (err) {
        console.error("Erro ao carregar profile:", err);
    }
}

// ============================
// Profile Modal Handling (Firebase / Base64)
// ============================

document.addEventListener("DOMContentLoaded", () => {
    const profilePic = document.querySelector(".profile-pic");
    const modal = document.getElementById("edit-profile-modal");
    const nameField = document.getElementById("edit-name");
    const usernameField = document.getElementById("edit-username");
    const fileInput = document.getElementById("edit-photo-file");
    const saveBtn = document.getElementById("save-profile");
    const cancelBtn = document.getElementById("cancel-edit");
    
    profilePic.addEventListener("click", () => {
        const nameDisplay = document.querySelector(".profile-text strong");
        const usernameDisplay = document.querySelector(".profile-text span");

        nameField.value = nameDisplay.textContent;
        usernameField.value = usernameDisplay.textContent.replace('@', '');
        modal.classList.remove("hidden");
    });

    cancelBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        fileInput.value = "";
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.add("hidden");
            fileInput.value = "";
        }
    });

    saveBtn.addEventListener("click", async () => {
        const newName = nameField.value.trim();
        const newUsername = usernameField.value.trim();
        const file = fileInput.files[0];
        const profilePic = document.querySelector(".profile-pic");
        const nameDisplay = document.querySelector(".profile-text strong");
        const usernameDisplay = document.querySelector(".profile-text span");

        if (!newName || !newUsername) {
            alert("Name and username are required.");
            return;
        }

        let photoBase64 = profilePic.src; // fallback

        if (file && file.type.match(/^image\/(jpeg|jpg|png)$/)) {
            photoBase64 = await fileToBase64(file);
        }

        try {
            await window._DB.collection("profile").doc("mainProfile").set({
                name: newName,
                username: newUsername,
                photo: photoBase64
            });

            nameDisplay.textContent = newName;
            usernameDisplay.textContent = '@' + newUsername;
            profilePic.src = photoBase64;

            modal.classList.add("hidden");
            fileInput.value = "";

            console.log("Profile salvo no Firebase!");
        } catch (err) {
            console.error("Erro ao salvar profile:", err);
            alert("Erro ao salvar profile no Firebase");
        }
    });

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = err => reject(err);
            reader.readAsDataURL(file);
        });
    }

    // Carrega profile assim que DOM estiver pronto
    loadProfileFromFirebase();
});

// ============================
// Tooltip Achievements
// ============================

const ACHIEVEMENT_THRESHOLDS = {
    movies: [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    series: [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    animations: [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    games: [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    platinum: [5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    books: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    mangas: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
    comics: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
};

const suffixKeyMap = {
    movies: "moviesWatched",
    series: "seriesWatched",
    animations: "animationsWatched",
    games: "gamesPlayed",
    games_platinum: "gamesPlatinumed",
    books: "booksRead",
    mangas: "mangasRead",
    comics: "comicsRead"
};

function getNestedTranslation(path, obj) {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
}


function calculateAchievementsStats(mediaList, enabledTypes = []) {
    const stats = {
        movies: 0,
        series: 0,
        animations: 0,
        games: 0,
        platinum: 0,
        books: 0,
        mangas: 0,
        comics: 0,
        totalPoints: 0
    };

    mediaList.forEach(media => {
        const type = media.type;

        // Skip disabled types
        if (!enabledTypes.includes(type)) {
            // Exception: animated_movies contribute to both movies and animations
            if (type !== 'animated_movies') return;
        }

        switch (type) {
            case 'movies':
                stats.movies++;
                break;

            case 'animated_movies':
                // Only count if user has 'movies' or 'animations' enabled
                if (enabledTypes.includes("movies")) stats.movies++;
                if (enabledTypes.includes("animations")) stats.animations++;
                break;

            case 'series':
                if (
                    media.use_episodes &&
                    media.episodes_watched >= media.episodes_total
                ) stats.series++;
                else if (
                    !media.use_episodes &&
                    media.seasons_watched >= media.seasons_total
                ) stats.series++;
                else if (
                    !media.use_episodes &&
                    media.seasons_watched > 0
                ) stats.series++;
                break;

            case 'animations':
                if (
                    media.use_episodes &&
                    media.episodes_watched >= media.episodes_total
                ) stats.animations++;
                else if (
                    !media.use_episodes &&
                    media.seasons_watched >= media.seasons_total
                ) stats.animations++;
                break;

            case 'games':
                if (media.beaten) stats.games++;

                if (
                    media.trophies_total &&
                    media.trophies_obtained === media.trophies_total
                ) stats.platinum++;
                break;

            case 'books':
                if (
                    Math.abs(media.pages_read - media.pages_total) <= 1
                ) stats.books++;
                break;

            case 'mangas':
                if (
                    media.volume_read >= media.volume_amount
                ) stats.mangas++;
                break;

            case 'comics':
                if (
                    media.volume_read >= media.volume_amount
                ) stats.comics++;
                break;
        }
    });

    // Count points only for enabled types
    for (const [key, value] of Object.entries(stats)) {
        if (key === 'totalPoints') continue;
        if (key === 'platinum' && !enabledTypes.includes('games')) continue;
        if (!enabledTypes.includes(key) && key !== 'platinum') continue;

        const thresholds = ACHIEVEMENT_THRESHOLDS[key] || [];
        for (let i = 0; i < thresholds.length; i++) {
            if (value >= thresholds[i]) {
                stats.totalPoints += 1000;
            } else {
                break;
            }
        }
    }

    return stats;
}

function updateAchievementsTooltip() {

    if (!translations.header?.achievementsTooltip) {
        console.warn("Translations not loaded yet for achievementsTooltip.");
        return;
    }

    const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || "[]");

    const stats = calculateAchievementsStats(globalMedias, enabledTypes);
    document.getElementById('achievements-points').textContent = ` ${stats.totalPoints}`;

    const tooltipContainer = document.getElementById("dynamic-achievement-sections");
    tooltipContainer.innerHTML = ""; // Clear previous content

    const createSection = (label, idPrefix, current, thresholds, icon) => {
        const currentGoal = thresholds.find(t => current < t) || thresholds[thresholds.length - 1];
        const displayValue = Math.min(current, currentGoal);
        const percent = Math.min(100, Math.round((current / currentGoal) * 100));

        // Get the translation key for this section
        const suffixKey = suffixKeyMap[idPrefix] || '';
        const suffix = getNestedTranslation(`header.achievementsTooltip.${suffixKey}`, translations) || '';

        const sectionHTML = `
        ${icon} <b>${label}:</b> <span id="${idPrefix}-watched">${displayValue}</span>/
        <span id="${idPrefix}-next-goal">${currentGoal}</span> ${suffix}<br>
        <div class="progress-bar">
            <div id="${idPrefix}-progress" class="progress" style="width:${percent}%"></div>
        </div><br>
    `;
        tooltipContainer.insertAdjacentHTML("beforeend", sectionHTML);
    };

    function getLabel(type) {
        return translations.header.achievementsTooltip.mediaLabels[type] || type;
    }

    // Map for display label, prefix, icon, and thresholds
    const typeConfig = {
        movies: { label: "Movies", prefix: "movies", icon: "🎬", thresholds: ACHIEVEMENT_THRESHOLDS.movies },
        series: { label: "Series", prefix: "series", icon: "📺", thresholds: ACHIEVEMENT_THRESHOLDS.series },
        animations: { label: "Animations", prefix: "animations", icon: "✨", thresholds: ACHIEVEMENT_THRESHOLDS.animations },
        games: { label: "Games", prefix: "games", icon: "🎮", thresholds: ACHIEVEMENT_THRESHOLDS.games },
        platinum: { label: "Games", prefix: "games_platinum", icon: "🎮", thresholds: ACHIEVEMENT_THRESHOLDS.platinum },
        books: { label: "Books", prefix: "books", icon: "📚", thresholds: ACHIEVEMENT_THRESHOLDS.books },
        mangas: { label: "Manga", prefix: "mangas", icon: "📖", thresholds: ACHIEVEMENT_THRESHOLDS.mangas },
        comics: { label: "Comics", prefix: "comics", icon: "💥", thresholds: ACHIEVEMENT_THRESHOLDS.comics },
    };

    for (const [key, { prefix, icon, thresholds }] of Object.entries(typeConfig)) {
        if (enabledTypes.includes(key) || (key === "platinum" && enabledTypes.includes("games"))) {
            const label = getLabel(key); // Dynamic translation from JSON
            createSection(label, prefix, stats[key] || 0, thresholds, icon);
        }
    }

}

let animationPlayed = false; // Flag to ensure the animation only occurs once

// Function to animate the count-up in achievement points
function animateCountUp(elementId, startValue, endValue, duration = 1000) {
    let startTime = null;

    function updateCountUp(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentValue = Math.floor(startValue + (endValue - startValue) * progress);

        // Updates the value in the element
        document.getElementById(elementId).textContent = currentValue;

        if (progress < 1) {
            requestAnimationFrame(updateCountUp);
        }
    }

    // Start animation
    requestAnimationFrame(updateCountUp);
}

// Adds hover events to the tooltip icon
document.querySelector('.tooltip-icon').addEventListener('mouseover', function () {
    const tooltipContent = document.querySelector('.tooltip-content-achievements');

    // Recalculate based on latest enabled types
    const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || "[]");
    const stats = calculateAchievementsStats(globalMedias, enabledTypes);

    // Animate only if not yet played
    if (!animationPlayed) {
        animateCountUp('achievements-points', 0, stats.totalPoints);
        animationPlayed = true;
    }

    updateAchievementsTooltip(); // Ensure fresh content
    tooltipContent.style.visibility = 'visible';
    tooltipContent.style.opacity = '1';
});


// Allows you to navigate within the tooltip without hiding it
document.querySelector('.tooltip-container-achievements').addEventListener('mouseover', function () {
    // It does nothing, it just allows navigation within the tooltip without animation.
});

// Hides the tooltip and resets the animation when the mouse leaves the full container
document.querySelector('.tooltip-container-achievements').addEventListener('mouseleave', function () {
    const tooltipContent = document.querySelector('.tooltip-content-achievements');

    // Hides the tooltip
    tooltipContent.style.visibility = 'hidden';
    tooltipContent.style.opacity = '0';

    // Resets the animation flag for the next interaction
    animationPlayed = false; // Resets the animation to allow counting next time
});

// ============================
// Utilities
// ============================

/**
 * Format a date string to local readable format
 */
function formatDate(dateSty) {
    const date = new Date(dateSty + "T00:00:00");
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    const lang = localStorage.getItem("language") || 'en';

    if (lang.toLowerCase().startsWith('pt')) {
        return `${day}/${month}/${year}`; // DD/MM/YYYY
    } else {
        return `${month}/${day}/${year}`; // MM/DD/YYYY
    }
}

/**
 * Returns the correct label for consumed date depending on media type
 */
function getConsumedLabel(type) {
    switch (type) {
        case 'games': return '<span data-i18n="main.cards.utilitiesLabels.playedOn">Played on:</span>';
        case 'books':
        case 'comics':
        case 'mangas': return '<span data-i18n="main.cards.utilitiesLabels.readOn">Read on:</span>';
        case 'series':
        case 'movies':
        case 'animations':
        case 'animated_movies': return '<span data-i18n="main.cards.utilitiesLabels.watchedOn">Watched on:</span>';
        default: return 'Consumed on:';
    }
}

/**
 * Get currently active filter (from UI)
 */
function getActiveFilter() {
    const activeBtn = document.querySelector('nav button.active');
    return activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
}

/**
 * Update number of results shown
 */
function updateResultsCount(count) {
    const infoEl = document.getElementById('results-info');

    // Select translation key based on count
    const key = count === 1 ? 'main.controlsBar.resultsInfo.singular' : 'main.controlsBar.resultsInfo.plural';
    const template = getNestedTranslation(key, translations);

    // Fallback in case translation is missing
    const fallback = count === 1 ? `${count} media found.` : `${count} medias found.`;

    infoEl.textContent = template
        ? template.replace('{count}', count)
        : fallback;
}

/**
 * Get the percentage of read pages or volumes
 */
function getCompletionPercentage(read, total) {
    if (!read || !total || total === 0) return '';
    const percentage = (read / total) * 100;
    return `${Math.round(percentage)}%`;
}

// ============================
// Side Menu for Mobile Screens
// ============================

/**
 * Hamburger Icon functionality when in Mobile Screens
 */
const mobileMenu = document.getElementById('mobile-menu');
const hamburgerBtn = document.getElementById('hamburger-toggle');
const closeBtn = document.getElementById('close-menu');

hamburgerBtn.addEventListener('click', () => {
    mobileMenu.classList.remove('hidden');
    document.body.classList.add('menu-open'); // Prevent Scroll
});

closeBtn.addEventListener('click', () => {
    mobileMenu.classList.add('hidden');
    document.body.classList.remove('menu-open'); // Allow Scroll
});

// Close the hamburguer menu
function closeMobileMenu() {
    mobileMenu.classList.add('hidden');
    document.body.classList.remove('menu-open');
}

// Close the hamburger menu when clicking on the filters within the mobile menu
document.querySelectorAll('#mobile-menu nav button').forEach(button => {
    button.addEventListener('click', () => {
        closeMobileMenu(); // reuses the function
    });
});

// List of pairs: mobile button => main button
const mobileButtonMap = {
    'add-media-mobile': 'add-media-button',
    'sort-mobile': 'sort-select',
    'search-mobile': 'search-input',
    'dashboard-mobile': 'dashboard-btn',
    'json-export-mobile': 'json-btn',
    'advanced-search-mobile': 'advanced-search-btn',
    'share-btn-mobile': 'share-btn'
    //'print-mobile': 'print-btn',
};

// Apply event listeners
Object.entries(mobileButtonMap).forEach(([mobileId, desktopId]) => {
    const mobileEl = document.getElementById(mobileId);
    const desktopEl = document.getElementById(desktopId);

    if (!mobileEl || !desktopEl) return;

    if (mobileId === 'sort-mobile') {
        mobileEl.addEventListener('change', e => {
            desktopEl.value = e.target.value;
            desktopEl.dispatchEvent(new Event('change'));
            closeMobileMenu();
        });
    } else if (mobileId === 'search-mobile') {
        mobileEl.addEventListener('input', e => {
            desktopEl.value = e.target.value;
            desktopEl.dispatchEvent(new Event('input'));
        });
    } else {
        mobileEl.addEventListener('click', () => {
            desktopEl.click();
            closeMobileMenu();
        });
    }
});

// New mobile menu close if click outside it 
document.addEventListener('click', function (event) {
    const mobileMenu = document.getElementById('mobile-menu');

    // If the menu is hidden, it does nothing
    if (mobileMenu.classList.contains('hidden')) return;

    // If the click was outside the menu AND outside the hamburger button
    if (!mobileMenu.contains(event.target) && !hamburgerBtn.contains(event.target)) {
        closeMobileMenu();
    }
});

// ============================
// Rendering
// ============================

/**
 * Renders media cards on the page
 */
function renderMedias(medias) {
    currentMedias = medias; // Saves every time it renders
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    //console.log('isMobile?', isMobile);

    const container = document.getElementById('media-container');
    container.innerHTML = ''; // Clear existing cards

    if (medias.length === 0) {
        container.innerHTML = `<p class="no-results" data-i18n="main.cards.noResultFound">No items found for current filter/search.</p>`;
        updateResultsCount(0);
        return;
    }

    // Icons by media type
    const emojiByType = {
        games: '🎮',
        movies: '🎬',
        series: '📺',
        books: '📚',
        mangas: '📖',
        animations: '✨',
        animated_movies: '🎬✨',  // Two emojis for blinking effect (reusable)
        comics: '💥',
    };

    // Loop through each media item and create a card
    medias.forEach(media => {
        const card = document.createElement('div');
        card.className = 'card';

        // Get emoji(s) for media type or default pin emoji
        const rawEmoji = emojiByType[media.type] || '📌';

        // If emoji string has more than one emoji, create blinking span
        let emojiHtml = '';
        if ([...rawEmoji].length > 1) {
            // Split emoji string into array of emojis for blinking
            const emojisArray = [...rawEmoji];
            emojiHtml = `<span class="emoji-blink" data-emojis='${JSON.stringify(emojisArray)}'>${emojisArray[0]}</span>`;
        } else {
            emojiHtml = rawEmoji;
        }

        // Construct the card HTML
        let html = `
        <div class="edit-media-trigger edit-icon-card restricted" data-id="${media._docId}" data-i18n-title="main.cards.editTitle"><i class="fa-solid fa-pen-to-square"></i></div>
        <div class="card-image">
            <img src="${media.cover_img || 'default-cover.png'}" alt="${media.title}">
            <div class="badge badge-${media.type}">${emojiHtml}</div>
        </div>
        <div class="card-content">
            <h3>${media.title}</h3>
            <div class="row">
                <span>⭐ ${media.rating ?? 'N/A'}</span>
                <span>📅 ${isMobile ? formatDate(media.consumed_date) : `${getConsumedLabel(media.type)} ${formatDate(media.consumed_date)}`}</span>
            </div>
        `;

        // Optional: gameplay hours and beaten flag
        const row2 = [];
        if (media.type === 'games') {  // <--- só entra se for game
            if (media.hours_played) row2.push(`🎮 ${media.hours_played}h`);
            if (media.online) {
                row2.push(`🌐 ${isMobile ? '<span data-i18n="main.cards.games.onlineOrNA">Online or N/A</span>' : '<span data-i18n="main.cards.games.onlineNoCampaign">Online/No Campaign</span>'}`);
            } else if (media.beaten !== undefined && media.beaten !== null) {
                row2.push(`${media.beaten ? '✔️ <span data-i18n="main.cards.games.completed">Completed</span>' : '✖️ <span data-i18n="main.cards.games.notCompleted">Not Completed</span>'}`);
            }
        }
        if (row2.length) html += `<div class="row">${row2.map(i => `<span>${i}</span>`).join('')}</div>`;


        // Optional: trophies info for games
        const row3 = [];
        if (media.trophies_total && media.trophies_obtained !== undefined) {
            row3.push(`🥇 ${media.trophies_obtained}/${media.trophies_total}`);
            if (media.trophies_obtained === media.trophies_total) {
                row3.push(isMobile ? '🏆 <span data-i18n="main.cards.games.platinum">Platinum</span>' : '🏆 <span data-i18n="main.cards.games.platinumTrophy">Platinum Trophy<span>');
            }
            else {
                const progress = Math.round((media.trophies_obtained / media.trophies_total) * 100);
                row3.push(`🏆 <span data-i18n="main.cards.games.progress">Progress:</span> ${progress}%`);
            }
        }
        if (row3.length) html += `<div class="row">${row3.map(i => `<span>${i}</span>`).join('')}</div>`;

        // Optional: reading progress (with percentage)
        const row4 = [];
        if (media.pages_total && media.pages_read !== undefined) {
            row4.push(`📖 ${media.pages_read}/${media.pages_total}${isMobile ? '' : '<span data-i18n="main.cards.booksMangaComics.pages">pages</span>'}`);
            const percent = Math.round((media.pages_read / media.pages_total) * 100);
            row4.push(`📊 ${isMobile ? percent + '%' : '<span data-i18n="main.cards.booksMangaComics.read">Read: </span>' + percent + '%'}`);
        }
        if (media.volume_amount && media.volume_read !== undefined) {
            row4.push(`🔖 ${media.volume_read}/${media.volume_amount}${isMobile ? '' : ' <span data-i18n="main.cards.booksMangaComics.volumes">volumes</span>'}`);
            const percent = Math.round((media.volume_read / media.volume_amount) * 100);
            row4.push(`📊 ${isMobile ? percent + '%' : '<span data-i18n="main.cards.booksMangaComics.read">Read: </span>' + percent + '%'}`);
        }
        if (row4.length) html += `<div class="row">${row4.map(i => `<span>${i}</span>`).join('')}</div>`;

        // Optional: list seasons/episodes for series/animations
        if (media.type === 'series' || media.type === 'animations') {
            const usingEpisodes = !!media.use_episodes;

            if (usingEpisodes && media.episodes_watched != null && media.episodes_total != null) {
                html += `<div class="row">
                <span>🎞️ <span data-i18n="main.cards.seriesAnimations.episodesWatched">Episodes Watched: </span>${media.episodes_watched}/${media.episodes_total}</span>
            </div>`;
            } else if (media.seasons_watched != null && media.seasons_total != null) {
                html += `<div class="row">
                <span>🎞️ <span data-i18n="main.cards.seriesAnimations.seasonsWatched">Seasons Watched: </span>${media.seasons_watched}/${media.seasons_total}</span>
            </div>`;
            }
        }

        // Optional: duration for movies (always formatted with 'h' and 'min')
        if (media.type === 'movies' || media.type === 'animated_movies') {
            let durationText = '';

            // Se o usuário escolheu inserir duração somente em minutos
            if (media.use_hours === false) {
                // Converte minutos para horas e minutos
                const hours = Math.floor(media.duration_only_minutes / 60);
                const minutes = media.duration_only_minutes % 60;
                durationText = `${hours}h ${minutes}min`;
            } else {
                // Se usou horas, exibe normalmente
                durationText = `${media.duration_hours}h ${media.duration_minutes}min`;
            }
            html += `<div class="row duration-row"><span>🕒 ${isMobile ? '' : '<span data-i18n="main.cards.moviesAnimatedMovies.duration">Duration:</span>'} ${durationText}</span></div>`;
        }

        // Optional: user comments
        // if (media.commentaries && media.commentaries.trim() !== '') {
        //     html += `<p class="comment">"${media.commentaries}"</p>`;
        // }

        // <<< Adiciona os listeners de editar apenas depois de renderizar tudo >>>
        document.querySelectorAll('.edit-media-trigger').forEach(btn => {
            btn.addEventListener('click', e => {
                const mediaId = e.currentTarget.dataset.id;
                openEditMediaModal(mediaId);
            });
        });

        html += `</div>`; // Close card content
        card.innerHTML = html;
        container.appendChild(card);
    });

    updateResultsCount(medias.length);

    // Start blinking emoji effect after cards are rendered
    startEmojiBlinking();

    if (typeof applyTranslations === 'function') {
        applyTranslations();
    }
}

/**
 * Starts blinking effect for emojis inside elements with .emoji-blink class.
 * It cycles through each emoji in the data-emojis attribute every 700ms.
 */
function startEmojiBlinking() {
    const blinkElements = document.querySelectorAll('.emoji-blink');

    blinkElements.forEach(el => {
        const emojis = JSON.parse(el.getAttribute('data-emojis'));
        let index = 0;

        setInterval(() => {
            index = (index + 1) % emojis.length;
            el.textContent = emojis[index];
        }, 1500);
    });
}

/* Previous way of checking resizing */
// let resizeTimeout;
// window.addEventListener('resize', () => {
//     clearTimeout(resizeTimeout);
//     resizeTimeout = setTimeout(() => {
//         renderMedias(currentMedias);
//     }, 200); // 200ms Debounce
// });

let resizeTimeout;

let lastIsMobile = window.matchMedia('(max-width: 768px)').matches;

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile !== lastIsMobile) {
            lastIsMobile = isMobile;
            renderMedias(currentMedias);
        }
    }, 200);
});

// ============================
// Filtering / Searching / Sorting
// ============================

/**
 * Sets up filter buttons (All, Movies, Books, etc.)
 */
function filterSetup() {
    const buttons = document.querySelectorAll('nav button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            const filter = button.getAttribute('data-filter');
            currentFilter = filter;

            // Apply filter
            if (filter === 'all') {
                renderFilteredAndSorted(globalMedias);
            } else if (filter === 'movies') {
                renderFilteredAndSorted(globalMedias.filter(m => m.type === 'movies' || m.type === 'animated_movies'));
            } else if (filter === 'animations') {
                renderFilteredAndSorted(globalMedias.filter(m => ['animations', 'animated_movies'].includes(m.type)));
            } else {
                renderFilteredAndSorted(globalMedias.filter(m => m.type === filter));
            }

            // Reset search input
            document.getElementById('search-input').value = '';
        });
    });
}

/**
 * Setup live search bar to filter media by title/type
 */
function searchSetup() {
    const searchInput = document.getElementById('search-input');

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const activeFilter = getActiveFilter();
        const activeTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');

        // If input is empty, reapply full filter + sort logic
        if (searchTerm === '') {
            renderFilteredAndSorted();
            return;
        }

        // Filter only allowed types
        let filtered = globalMedias.filter(m => activeTypes.includes(m.type));

        // Apply filter button logic
        if (activeFilter !== 'all') {
            filtered = filtered.filter(m => {
                if (activeFilter === 'movies') return m.type === 'movies' || m.type === 'animated_movies';
                if (activeFilter === 'animations') return ['animations', 'animated_movies'].includes(m.type);
                return m.type === activeFilter;
            });
        }

        // Apply search term
        filtered = filtered.filter(m =>
            m.title.toLowerCase().includes(searchTerm) ||
            m.type.toLowerCase().includes(searchTerm)
        );

        // Reapply sort (optional but recommended)
        renderFilteredAndSorted(filtered);
    });
}

/**
 * Setup sorting dropdown
 */
function setupSort() {
    const select = document.getElementById('sort-select');
    select.addEventListener('change', () => {
        // Reset advanced filters
        const advForm = document.getElementById('advanced-filters-form');
        advForm.reset();
        updateOrderByOptions();

        currentSort = select.value;
        renderFilteredAndSorted();
    });
}

/**
 * Apply current filter and sort order, then render results
 */
function renderFilteredAndSorted(data = globalMedias) {
    const activeTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');

    // First, filter only the types allowed in the settings
    let filtered = data.filter(m => {
        if (m.type === 'animated_movies') {
            // If "movies" or "animations" are active, let it pass
            return activeTypes.includes('movies') || activeTypes.includes('animations') || activeTypes.includes('animated_movies');
        }
        return activeTypes.includes(m.type);
    });

    // Then apply current filter (like movies, books etc)
    if (currentFilter !== 'all') {
        if (currentFilter === 'movies') {
            filtered = filtered.filter(m => m.type === 'movies' || m.type === 'animated_movies');
        } else if (currentFilter === 'animations') {
            filtered = filtered.filter(m => ['animations', 'animated_movies'].includes(m.type));
        } else {
            filtered = filtered.filter(m => m.type === currentFilter);
        }
    }

    // Ordering
    let sorted = [...filtered];
    switch (currentSort) {
        case 'title-asc': sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
        case 'title-desc': sorted.sort((a, b) => b.title.localeCompare(a.title)); break;
        case 'rating-desc': sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
        case 'rating-asc': sorted.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0)); break;
        case 'date-desc': sorted.sort((a, b) => new Date(b.consumed_date) - new Date(a.consumed_date)); break;
        case 'date-asc': sorted.sort((a, b) => new Date(a.consumed_date) - new Date(b.consumed_date)); break;
    }

    renderMedias(sorted);
}

// ============================
// Advanced Filter Logic
// ============================

// Open advanced filters modal
document.getElementById('advanced-search-btn').addEventListener('click', () => {
    document.getElementById('advanced-filters-modal').classList.remove('hidden');
});

// Cancel button
document.getElementById('cancel-advanced').addEventListener('click', () => {
    document.getElementById('advanced-filters-modal').classList.add('hidden');
});

// Close advanced filters modal when clicking outside
document.getElementById('advanced-filters-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
        document.getElementById('advanced-filters-modal').classList.add('hidden');
    }
});

// Handle filter submission
document.getElementById('advanced-filters-form').addEventListener('submit', e => {
    e.preventDefault();

    // Reset sort dropdown
    document.getElementById('sort-select').selectedIndex = 0;
    currentSort = '';

    const form = e.target;

    const formData = new FormData(form);
    const types = formData.getAll('filter');
    const yearFrom = parseInt(formData.get('year_from')) || null;
    const yearTo = parseInt(formData.get('year_to')) || null;
    const ratingMin = parseFloat(formData.get('rating_min')) || 0;
    const ratingMax = parseFloat(formData.get('rating_max')) || 10;
    const completionMin = parseFloat(formData.get('completion_min')) || 0;
    const orderBy = formData.get('order_by');
    const orderDir = formData.get('order_dir');

    const filtered = globalMedias.filter(m => {

        const typeAliases = {
            movies: ['movies', 'animated_movies'],
            animations: ['animations', 'animated_movies'],
            animated_movies: ['animated_movies'],
            series: ['series'],
            games: ['games'],
            books: ['books'],
            mangas: ['mangas'],
            comics: ['comics']
        };

        const expandedTypes = new Set();
        types.forEach(type => {
            const equivalents = typeAliases[type] || [];
            equivalents.forEach(eq => expandedTypes.add(eq));
        });

        // Type Check
        if (expandedTypes.size && !expandedTypes.has(m.type)) return false;

        // Consumed Year
        const consumedYear = new Date(m.consumed_date).getFullYear();
        if (yearFrom && consumedYear < yearFrom) return false;
        if (yearTo && consumedYear > yearTo) return false;

        // Rating Range
        if (m.rating < ratingMin || m.rating > ratingMax) return false;

        // Completion Percentage
        let percent = 100;
        if (m.type === 'games' && m.trophies_total > 0) {
            percent = (m.trophies_obtained / m.trophies_total) * 100;
        } else if ((m.type === 'books' || m.type === 'mangas' || m.type === 'comics')
            && (m.pages_total || m.volume_amount)) {
            const done = m.pages_read || m.volume_read;
            const total = m.pages_total || m.volume_amount;
            percent = (done / total) * 100;
        }
        if (percent < completionMin) return false;

        return true;
    });

    // Sort Filtered Array
    filtered.sort((a, b) => {
        let aKey, bKey;

        switch (orderBy) {
            case 'title':
                aKey = a.title.toLowerCase();
                bKey = b.title.toLowerCase();
                break;
            case 'rating':
                aKey = a.rating;
                bKey = b.rating;
                break;
            case 'consumed_date':
                aKey = new Date(a.consumed_date);
                bKey = new Date(b.consumed_date);
                break;
            case 'completion':
                const calcPercent = item => {
                    if (item.type === 'games') return (item.trophies_obtained / item.trophies_total) * 100;
                    if (['books', 'mangas', 'comics'].includes(item.type)) {
                        const done = item.pages_read || item.volume_read;
                        const total = item.pages_total || item.volume_amount;
                        return (done / total) * 100;
                    }
                    return 100;
                };
                aKey = calcPercent(a);
                bKey = calcPercent(b);
                break;
            case 'hours_played':
                aKey = a.hours_played || 0;
                bKey = b.hours_played || 0;
                break;
            default:
                aKey = 0;
                bKey = 0;
        }

        // Comparing
        if (typeof aKey === 'string') {
            if (orderDir === 'asc') {
                return aKey.localeCompare(bKey);
            } else {
                return bKey.localeCompare(aKey);
            }
        } else {
            if (orderDir === 'asc') {
                return aKey - bKey;
            } else {
                return bKey - aKey;
            }
        }
    });

    renderMedias(filtered);
    document.getElementById('advanced-filters-modal').classList.add('hidden');
});

// All Checkbox marked
document.addEventListener("DOMContentLoaded", function () {
    const allCheckbox = document.querySelector('input[type="checkbox"][value="all"]');
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"][name="filter"]')).filter(cb => cb.value !== 'all');

    allCheckbox.addEventListener("change", function () {
        checkboxes.forEach(cb => cb.checked = allCheckbox.checked);
    });

    checkboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            if (!cb.checked) {
                allCheckbox.checked = false;
            } else if (checkboxes.every(cb => cb.checked)) {
                allCheckbox.checked = true;
            }
        });
    });
});

function clearFilters() {
    const form = document.getElementById('advanced-filters-form');
    form.reset();
}

const filterCheckboxes = document.querySelectorAll('input[name="filter"]');
const orderBySelect = document.getElementById('order-by-select');

// Updates Order By options based on selected categories
function updateOrderByOptions() {
    const selectedTypes = Array.from(filterCheckboxes)
        .filter(cb => cb.checked && cb.value !== 'all')
        .map(cb => cb.value);

    const options = orderBySelect.querySelectorAll('option');

    options.forEach(option => {
        const allowed = option.dataset.types;
        if (!allowed) {
            option.disabled = false;
        } else {
            const types = allowed.split(' ');
            const show = types.some(type => selectedTypes.includes(type));
            option.disabled = !show;
        }
    });

    // If the selected option is disabled, reset it
    if (orderBySelect.options[orderBySelect.selectedIndex].disabled) {
        orderBySelect.selectedIndex = 0;
    }
}

filterCheckboxes.forEach(cb => cb.addEventListener("change", updateOrderByOptions));

// Call when loading too
updateOrderByOptions();

// ============================
// Rezise Image (For Add and Edit/Delete Media)
// ============================

function resizeImageToCard(file, targetWidth = 300, targetHeight = 200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// ============================
// Add Media Modal Handling
// ============================

function t(key) {
    return getNestedTranslation(key, translations) || key;
}

// Update the Media Type Options able to select based on Settings
function updateMediaTypeOptions() {
    const select = document.getElementById('media-type');
    if (!select) return;

    const activeTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');
    const mediaLabels = translations?.main?.modals?.addMedia?.selectMedia || {}; // fallback if translations not loaded

    const options = {
        movies: mediaLabels.movie || "🎬 Movie",
        series: mediaLabels.serie || "📺 Serie",
        animations: mediaLabels.animation || "✨ Animation",
        animated_movies: "🎥 Animated Movie", // opcional: adicionar no JSON
        games: mediaLabels.game || "🎮 Game",
        books: mediaLabels.book || "📚 Book",
        mangas: mediaLabels.manga || "📖 Manga",
        comics: mediaLabels.comic || "💥 Comic"
    };

    // Clear all but the default
    select.innerHTML = `<option value="">${mediaLabels.choose || "Choose..."}</option>`;

    for (const [value, label] of Object.entries(options)) {
        if (activeTypes.includes(value)) {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = label;
            select.appendChild(opt);
        }
    }
}

// Add Media Modal 
const mediaTypeSelect = document.getElementById('media-type');
const specificFieldsContainer = document.getElementById('media-specific-fields');
const addMediaModal = document.getElementById('add-media-modal');
const cancelBtn = document.getElementById('cancel-add-media');

// Open the modal
document.getElementById('add-media-button').addEventListener('click', () => {
    updateMediaTypeOptions();

    const hasOptions = document.getElementById('media-type').options.length > 1;
    if (!hasOptions) {
        alert("No media types are enabled in settings.");
        return;
    }

    addMediaModal.classList.remove('hidden');
});

// Close the modal and reset form
cancelBtn.addEventListener('click', () => {
    addMediaModal.classList.add('hidden');
    document.getElementById('add-media-form').reset();
    specificFieldsContainer.innerHTML = '';
});

// Close Add Media modal when clicking outside its content
addMediaModal.addEventListener('click', (e) => {
    if (e.target === addMediaModal) {
        addMediaModal.classList.add('hidden');
        document.getElementById('add-media-form').reset();
        specificFieldsContainer.innerHTML = '';
    }
});

// Dynamically update fields based on selected media type
mediaTypeSelect.addEventListener('change', () => {
    const type = mediaTypeSelect.value;
    specificFieldsContainer.innerHTML = ''; // Clean before adding new content

    let html = '';

    if (type === 'games') {
        html = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.game.hoursPlayed')}
                <input type="number" name="hours_played" step="any" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterHours')}" required />
            </label>
        </div>

        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.game.online')}
                <select name="online" id="online-select">
                    <option value="false">${t('main.modals.addEditMedia.specificFields.game.no')}</option>
                    <option value="true">${t('main.modals.addEditMedia.specificFields.game.yes')}</option>
                </select>
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.game.beaten')}
                <select name="beaten" id="beaten-select">
                    <option value="false">${t('main.modals.addEditMedia.specificFields.game.no')}</option>
                    <option value="true">${t('main.modals.addEditMedia.specificFields.game.yes')}</option>
                </select>
            </label>
        </div>

        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.game.trophiesEarned')}
                <input type="number" name="trophies_obtained" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"  />
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.game.totalTrophies')}
                <input type="number" name="trophies_total" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"  />
            </label>
        </div>
        `;

        specificFieldsContainer.innerHTML = html;

        const onlineSelect = document.getElementById('online-select');
        const beatenSelect = document.getElementById('beaten-select');

        // Set default selected options explicitly
        if (onlineSelect && beatenSelect) {
            onlineSelect.value = "true";   // Online = Yes
            beatenSelect.value = "false";  // Completed = No
        }

        function syncOnlineAndBeaten(changed) {
            if (!onlineSelect || !beatenSelect) return;

            const online = onlineSelect.value === 'true';
            const beaten = beatenSelect.value === 'true';

            // Regra: Yes/Yes não pode → ajusta baseado em quem mudou
            if (online && beaten) {
                if (changed === 'online') {
                    beatenSelect.value = 'false'; // força Completed para No
                } else if (changed === 'beaten') {
                    onlineSelect.value = 'false'; // força Online para No
                }
            }
        }

        // Run sync right after setting initial values to avoid invalid pairs on load
        syncOnlineAndBeaten('online');

        onlineSelect.addEventListener('change', () => syncOnlineAndBeaten('online'));
        beatenSelect.addEventListener('change', () => syncOnlineAndBeaten('beaten'));

        return;
    }
    else if (type === 'books') {
        html = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.book.pagesRead')}
                <input type="number" name="pages_read" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.book.totalPages')}
                <input type="number" name="pages_total" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
            </label>
        </div>
        `;
        specificFieldsContainer.innerHTML = html;
    } else if (type === 'mangas' || type === 'comics') {
        html = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.mangaComic.volumesRead')}
                <input type="number" name="volume_read" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.mangaComic.totalVolumes')}
                <input type="number" name="volume_amount" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
            </label>
        </div>
        `;
        specificFieldsContainer.innerHTML = html;
    } else if (type === 'series' || type === 'animations') {
        html = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlBy')}
                <select name="use_episodes" id="use-episodes-select">
                    <option value="false">${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlSeasons')}</option>
                    <option value="true">${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlEpisodes')}</option>
                </select>
            </label>
        </div>
        <div class="form-row" id="season-or-episode-fields"></div>
        `;

        // Add the HTML first
        specificFieldsContainer.innerHTML = html;

        // Then select the inserted elements
        const select = document.getElementById('use-episodes-select');
        const dynamicFields = document.getElementById('season-or-episode-fields');

        function renderSeasonOrEpisodeFields(useEpisodes) {
            if (useEpisodes) {
                dynamicFields.innerHTML = `
                    <label>
                        ${t('main.modals.addEditMedia.specificFields.seriesAnimation.episodesWatched')}
                        <input type="number" name="episodes_watched" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
                    </label>
                    <label>
                        ${t('main.modals.addEditMedia.specificFields.seriesAnimation.totalEpisodes')}
                        <input type="number" name="episodes_total" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
                    </label>
                `;
            } else {
                dynamicFields.innerHTML = `
                    <label>
                        ${t('main.modals.addEditMedia.specificFields.seriesAnimation.seasonsWatched')}
                        <input type="number" name="seasons_watched" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
                    </label>
                    <label>
                        ${t('main.modals.addEditMedia.specificFields.seriesAnimation.totalSeasons')}
                        <input type="number" name="seasons_total" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}" />
                    </label>
                `;
            }
        }

        // Sets default value based on type
        const defaultUseEpisodes = type === 'animations';
        select.value = defaultUseEpisodes ? 'true' : 'false';
        renderSeasonOrEpisodeFields(defaultUseEpisodes);

        // Listener for select
        select.addEventListener('change', () => {
            const isEpisodes = select.value === 'true';
            renderSeasonOrEpisodeFields(isEpisodes);
        });

        return;
    } else if (type === 'movies' || type === 'animated_movies') {
        html = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.movie.durationType')}
                <select name="duration_type" id="duration-type-select">
                    <option value="minutes">${t('main.modals.addEditMedia.specificFields.movie.durationMinutesOnly')}</option>
                    <option value="hours_minutes">${t('main.modals.addEditMedia.specificFields.movie.durationHours')}</option>
                </select>
            </label>
        </div>
        <div class="form-row" id="duration-fields"></div>
        <div class="form-row">
            <label class="inline-label">
                <input type="checkbox" id="animated-checkbox" />
                ${t('main.modals.addEditMedia.specificFields.movie.animatedCheckbox')}
            </label>
        </div>
        `;

        specificFieldsContainer.innerHTML = html;

        const durationSelect = document.getElementById('duration-type-select');
        const durationFieldsContainer = document.getElementById('duration-fields');
        let currentMinutes = 0;

        function convertMinutesToHoursAndMinutes(minutes) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return { hours, minutes: remainingMinutes };
        }

        function updateDurationFields(durationType) {
            if (durationType === 'minutes') {
                durationFieldsContainer.innerHTML = `
            <label>
            ${t('main.modals.addEditMedia.specificFields.movie.durationMinutes')}
                <input required type="number" name="duration_minutes" value="${currentMinutes}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterMinutes')}" />
            </label>
        `;
            }
            else if (durationType === 'hours_minutes') {
                const { hours, minutes } = convertMinutesToHoursAndMinutes(currentMinutes);
                durationFieldsContainer.innerHTML = `
            <label>
                ${t('main.modals.addEditMedia.specificFields.movie.durationHoursAndMinutes')}
                <input required type="number" name="duration_hours" value="${hours}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterHours')}" />
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.movie.durationMinutes')}
                <input required type="number" name="duration_minutes" value="${minutes}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterMinutes')}" />
            </label>
        `;
            }
        }

        durationSelect.addEventListener('change', () => {
            updateDurationFields(durationSelect.value);
        });

        durationFieldsContainer.addEventListener('input', (event) => {
            if (event.target.name === "duration_minutes") {
                currentMinutes = parseInt(event.target.value, 10);
            }
            else if (event.target.name === "duration_hours") {
                const newHours = parseInt(event.target.value, 10);
                currentMinutes = newHours * 60 + (currentMinutes % 60);
            }
        });

        updateDurationFields('minutes');
    }
});

// Limit rating values in Add Media
document.getElementById('add-media-form').querySelector('[name="rating"]').addEventListener('input', function () {
    let value = parseFloat(this.value);
    if (value < 0) this.value = 0;
    if (value > 10) this.value = 10;
});

const form = document.getElementById('add-media-form');

function getSpecificFields(type, form) {
    let specificData = {};

    if (type === 'games') {
        specificData.hours_played = form.hours_played?.value ? parseFloat(form.hours_played.value) : null;
        specificData.online = form.online?.value === 'true' ? true : false;
        specificData.beaten = form.beaten?.value === 'true' ? true : false;
        specificData.trophies_obtained = form.trophies_obtained?.value || null;
        specificData.trophies_total = form.trophies_total?.value || null;
    }
    else if (type === 'movies' || type === 'animated_movies') {
        if (form['duration_hours'] && form['duration_minutes']) {
            specificData.duration_hours = form.duration_hours.value || null;
            specificData.duration_minutes = form.duration_minutes.value || null;
            specificData.use_hours = true;
        } else if (form.duration_minutes) {
            specificData.duration_only_minutes = form.duration_minutes.value || null;
            specificData.use_hours = false;
        }
    }
    else if (type === 'books') {
        specificData.pages_read = form.pages_read?.value || null;
        specificData.pages_total = form.pages_total?.value || null;
    }
    else if (type === 'series' || type === 'animations') {
        specificData.use_episodes = form.use_episodes?.value === 'true' ? true : false;
        if (specificData.use_episodes) {
            specificData.episodes_watched = form.episodes_watched?.value || null;
            specificData.episodes_total = form.episodes_total?.value || null;
        } else {
            specificData.seasons_watched = form.seasons_watched?.value || null;
            specificData.seasons_total = form.seasons_total?.value || null;
        }
    }
    else if (type === 'mangas' || type === 'comics') {
        specificData.volume_read = form.volume_read?.value || null;
        specificData.volume_amount = form.volume_amount?.value || null;
    }

    return specificData;
}

// ============================
// Validação customizada para "total >= parcial"
// ============================
function validateTotals(type, form) {
    let isValid = true;
    let message = "";

    if (type === 'games') {
        const trophiesObtained = parseInt(form.trophies_obtained?.value || 0, 10);
        const trophiesTotal = parseInt(form.trophies_total?.value || 0, 10);
        if (trophiesTotal && trophiesObtained > trophiesTotal) {
            isValid = false;
            message = "Troféus obtidos não podem ser maiores que o total.";
        }
    }
    else if (type === 'books') {
        const pagesRead = parseInt(form.pages_read?.value || 0, 10);
        const pagesTotal = parseInt(form.pages_total?.value || 0, 10);
        if (pagesTotal && pagesRead > pagesTotal) {
            isValid = false;
            message = "Páginas lidas não podem ser maiores que o total.";
        }
    }
    else if (type === 'series' || type === 'animations') {
        if (form.use_episodes?.value === 'true') {
            const epWatched = parseInt(form.episodes_watched?.value || 0, 10);
            const epTotal = parseInt(form.episodes_total?.value || 0, 10);
            if (epTotal && epWatched > epTotal) {
                isValid = false;
                message = "Episódios assistidos não podem ser maiores que o total.";
            }
        } else {
            const seasonsWatched = parseInt(form.seasons_watched?.value || 0, 10);
            const seasonsTotal = parseInt(form.seasons_total?.value || 0, 10);
            if (seasonsTotal && seasonsWatched > seasonsTotal) {
                isValid = false;
                message = "Temporadas assistidas não podem ser maiores que o total.";
            }
        }
    }
    else if (type === 'mangas' || type === 'comics') {
        const volRead = parseInt(form.volume_read?.value || 0, 10);
        const volTotal = parseInt(form.volume_amount?.value || 0, 10);
        if (volTotal && volRead > volTotal) {
            isValid = false;
            message = "Volumes lidos não podem ser maiores que o total.";
        }
    }

    if (!isValid) {
        alert(message);
    }
    return isValid;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Campos obrigatórios
    const title = form.title.value.trim();
    const rating = form.rating.value.trim();
    const consumedDate = form.consumed_date.value.trim();
    const coverImgFile = form.cover_img?.files?.[0];

    const type = document.getElementById('media-type').value;
    const isAnimated = document.getElementById('animated-checkbox')?.checked;

    const finalType = (type === 'movies' && isAnimated) ? 'animated_movies' : type;

    // 🔒 Rodar validação ANTES de salvar
    if (!validateTotals(finalType, form)) {
        return; // não envia
    }

    // Campos fixos
    const baseData = {
        title,
        rating: parseFloat(rating),
        consumed_date: consumedDate,
        type: finalType,
        duration: form.duration?.value || '',
    };

    // Campos dinâmicos específicos do tipo
    const specificData = getSpecificFields(finalType, form);

    // Mesclar
    const newMedia = {
        ...baseData,
        ...specificData,
    };

    let imageFile = coverImgFile;
    try {
        imageFile = await resizeImageToCard(imageFile, 300, 200);
    } catch (err) {
        console.error('Erro ao redimensionar a imagem:', err);
        alert('Erro ao processar a imagem. Tente outro arquivo.');
        return; // interrompe o envio
    }

    await createMediaFirestore(newMedia, imageFile);

    addMediaModal.classList.add('hidden');
    form.reset();
    specificFieldsContainer.innerHTML = '';
});

// ============================
// Edit / Delete Media Modal Handling
// ============================

/*
    Edit/Delete Card
*/
// Open Edit/Delete Model when Icon is clicked
document.addEventListener('click', async (e) => {
    const editIcon = e.target.closest('.edit-icon-card');
    if (!editIcon) return;

    const mediaId = editIcon.dataset.id;

    try {
        const doc = await window._DB.collection('media').doc(mediaId).get();
        if (!doc.exists) return alert("Mídia não encontrada");

        const media = { _docId: doc.id, ...doc.data() };
        openEditMediaModal(media);
    } catch (err) {
        console.error("Erro ao buscar mídia:", err);
        alert("Erro ao carregar mídia.");
    }
});

function openEditMediaModal(media) {
    // Populate general fields
    document.getElementById('edit-title').value = media.title;
    document.getElementById('edit-rating').value = media.rating ?? '';
    document.getElementById('edit-date').value = media.consumed_date ?? '';
    document.getElementById('edit-cover').value = '';

    // Store the media ID in the form dataset
    document.getElementById('edit-media-form').dataset.id = media._docId;

    // Fill specific fields based on media type
    const container = document.getElementById('edit-specific-fields');
    container.innerHTML = ''; // Reset container

    if (media.type === 'games') {
        container.innerHTML = `
            <div class="form-row">
                <label>
                    ${t('main.modals.addEditMedia.specificFields.game.hoursPlayed')}
                    <input type="number" name="hours_played" step="any" value="${media.hours_played ?? ''}" required/>
                </label>
            </div>  
            <div class="form-row">  
                <label>
                    ${t('main.modals.addEditMedia.specificFields.game.online')}
                    <select name="online" id="edit-online-select">
                        <option value="false" ${!media.online ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.game.no')}</option>
                        <option value="true" ${media.online ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.game.yes')}</option>
                    </select>
                </label>
                <label>
                    ${t('main.modals.addEditMedia.specificFields.game.beaten')}
                    <select name="beaten" id="edit-beaten-select">
                        <option value="false" ${!media.beaten ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.game.no')}</option>
                        <option value="true" ${media.beaten ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.game.yes')}</option>
                    </select>
                </label>
            </div>    
            <div class="form-row">  
                <label>
                    ${t('main.modals.addEditMedia.specificFields.game.trophiesEarned')}
                    <input type="number" name="trophies_obtained" value="${media.trophies_obtained ?? ''}" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
                <label>
                    ${t('main.modals.addEditMedia.specificFields.game.totalTrophies')}
                    <input type="number" name="trophies_total" value="${media.trophies_total ?? ''}" placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
            </div>
        `;

        // Interdependent logic between Online and Completed fields in edit modal
        const editOnlineSelect = document.getElementById('edit-online-select');
        const editBeatenSelect = document.getElementById('edit-beaten-select');

        function syncEditOnlineBeaten(changed) {
            if (!editOnlineSelect || !editBeatenSelect) return;

            const online = editOnlineSelect.value === 'true';
            const beaten = editBeatenSelect.value === 'true';

            // Regra: Yes/Yes não pode → ajusta baseado em quem mudou
            if (online && beaten) {
                if (changed === 'online') {
                    // Online foi marcado como Yes → força Completed para No
                    editBeatenSelect.value = 'false';
                } else if (changed === 'beaten') {
                    // Completed foi marcado como Yes → força Online para No
                    editOnlineSelect.value = 'false';
                }
            }
        }

        editOnlineSelect.addEventListener('change', () => syncEditOnlineBeaten('online'));
        editBeatenSelect.addEventListener('change', () => syncEditOnlineBeaten('beaten'));

        // Ensure no invalid state on modal open
        syncEditOnlineBeaten('online');

    }
    else if (media.type === 'movies' || media.type === 'animated_movies') {
        const isAnimated = media.type === 'animated_movies';
        let durationType = 'minutes';
        let hours = '';
        let minutes = '';

        // Check the duration format (whether it is 'minutes' or 'hours_minutes')
        if (media.duration_only_minutes !== null) {
            // If it is just minutes, convert to hours and minutes
            durationType = 'minutes';
            minutes = media.duration_only_minutes;

            // Convert minutes to hours and minutes
            hours = Math.floor(minutes / 60);  // Calculate the hours
            minutes = minutes % 60;  // Calculates remaining minutes
        } else if (media.duration_hours !== null && media.duration_minutes !== null) {
            // If you have hours and minutes directly
            durationType = 'hours_minutes';
            hours = media.duration_hours;
            minutes = media.duration_minutes;
        }

        container.innerHTML = `
        <div class="form-row">
            <label>
                ${t('main.modals.addEditMedia.specificFields.movie.durationType')}
                <select name="duration_type" id="edit-duration-type-select">
                    <option value="minutes" ${durationType === 'minutes' ? 'selected' : ''}>
                    ${t('main.modals.addEditMedia.specificFields.movie.durationMinutesOnly')}</option>
                    <option value="hours_minutes" ${durationType === 'hours_minutes' ? 'selected' : ''}>
                    ${t('main.modals.addEditMedia.specificFields.movie.durationHours')}</option>
                </select>
            </label>
        </div>
        <div class="form-row" id="edit-duration-fields">
            <!-- Campos de duração serão inseridos aqui -->
        </div>
        <!--
        <div class="form-row">
            <label class="inline-label">
                <input type="checkbox" id="edit-animated-checkbox" ${isAnimated ? 'checked' : ''} />
                ${t('main.modals.addEditMedia.specificFields.movie.animatedCheckbox')}
            </label>
        </div>
        -->
    `;

        const editDurationSelect = document.getElementById('edit-duration-type-select');
        const editDurationFieldsContainer = document.getElementById('edit-duration-fields');

        // Function to update duration fields in edit modal
        function updateEditDurationFields(durationType) {
            if (durationType === 'minutes') {
                // Convert hours and minutes to minutes
                const totalMinutes = hours * 60 + minutes;
                editDurationFieldsContainer.innerHTML = ` 
                <label>
                    ${t('main.modals.addEditMedia.specificFields.movie.durationMinutes')}
                    <input required type="number" name="duration_minutes" value="${totalMinutes ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterMinutes')}" />
                </label>
            `;
            } else if (durationType === 'hours_minutes') {
                // Displays hours and minutes as they were
                editDurationFieldsContainer.innerHTML = `
                <label>
                    ${t('main.modals.addEditMedia.specificFields.movie.durationHoursAndMinutes')}
                    <input required type="number" name="duration_hours" value="${hours ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterHours')}" />
                </label>
                <label>
                    ${t('main.modals.addEditMedia.specificFields.movie.durationMinutes')}
                    <input required type="number" name="duration_minutes" value="${minutes ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterMinutes')}" />
                </label>
            `;
            }
        }

        // Updates duration fields based on initial type selection
        editDurationSelect.addEventListener('change', () => {
            updateEditDurationFields(editDurationSelect.value);
        });

        // Updates fields according to the JSON duration type (converts if necessary)
        updateEditDurationFields(durationType);
    }
    else if (media.type === 'series' || media.type === 'animations') {
        const useEpisodes = !!media.use_episodes;

        container.innerHTML = `
    <div class="form-row">
        <label>
             ${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlBy')}
            <select name="use_episodes" id="edit-use-episodes-select">
                <option value="false" ${!useEpisodes ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlSeasons')}</option>
                <option value="true" ${useEpisodes ? 'selected' : ''}>${t('main.modals.addEditMedia.specificFields.seriesAnimation.controlEpisodes')}</option>
            </select>
        </label>
    </div>
    <div class="form-row" id="edit-dynamic-fields"></div>
`;

        const select = document.getElementById('edit-use-episodes-select');
        const dynamicFields = document.getElementById('edit-dynamic-fields');

        function renderEditFields(useEpisodes) {
            if (useEpisodes) {
                dynamicFields.innerHTML = `
            <label>
                ${t('main.modals.addEditMedia.specificFields.seriesAnimation.episodesWatched')}
                <input type="number" name="episodes_watched" placeholder="Enter a number" value="${media.episodes_watched ?? ''}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.seriesAnimation.totalEpisodes')}
                <input type="number" name="episodes_total" placeholder="Enter a number" value="${media.episodes_total ?? ''}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
            </label>
        `;
            } else {
                dynamicFields.innerHTML = `
            <label>
                ${t('main.modals.addEditMedia.specificFields.seriesAnimation.seasonsWatched')}
                <input type="number" name="seasons_watched" placeholder="Enter a number" value="${media.seasons_watched ?? ''}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
            </label>
            <label>
                ${t('main.modals.addEditMedia.specificFields.seriesAnimation.totalSeasons')}
                <input type="number" name="seasons_total" placeholder="Enter a number" value="${media.seasons_total ?? ''}" 
                placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
            </label>
        `;
            }
        }

        renderEditFields(useEpisodes);

        select.addEventListener('change', () => {
            const isEpisodes = select.value === 'true';
            renderEditFields(isEpisodes);
        });

    }

    else if (media.type === 'mangas' || media.type === 'comics') {
        container.innerHTML = `
            <div class="form-row">
                <label>
                    ${t('main.modals.addEditMedia.specificFields.mangaComic.volumesRead')}
                    <input type="number" name="volume_read" value="${media.volume_read ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
                <label>
                    ${t('main.modals.addEditMedia.specificFields.mangaComic.totalVolumes')}
                    <input type="number" name="volume_amount" value="${media.volume_amount ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
            </div>
        `;
    }
    else if (media.type === 'books') {
        container.innerHTML = `
            <div class="form-row">
                <label>
                    ${t('main.modals.addEditMedia.specificFields.book.pagesRead')}
                    <input type="number" name="pages_read" value="${media.pages_read ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
                <label>
                    ${t('main.modals.addEditMedia.specificFields.book.totalPages')}
                    <input type="number" name="pages_total" value="${media.pages_total ?? ''}" 
                    placeholder="${t('main.modals.addEditMedia.specificFields.placeholders.enterNumber')}"/>
                </label>
            </div>
        `;
    }

    // Show the edit modal
    document.getElementById('edit-media-modal').classList.remove('hidden');

    // This line prevents Tab spamming to access content outside the Edit Media Modal
    trapFocus(document.getElementById('edit-media-modal'));
}

// Limit rating values in Edit Media
document.getElementById('edit-media-form').querySelector('[name="rating"]').addEventListener('input', function () {
    let value = parseFloat(this.value);
    if (value < 0) this.value = 0;
    if (value > 10) this.value = 10;
});

document.getElementById('cancel-edit-media').addEventListener('click', () => {
    document.getElementById('edit-media-modal').classList.add('hidden');
});

// Close Edit Media modal when clicking outside the modal content
const editMediaModal = document.getElementById('edit-media-modal');

editMediaModal.addEventListener('click', (e) => {
    if (e.target === editMediaModal) {
        editMediaModal.classList.add('hidden');
    }
});

// ============================
// Validação simples no Edit Media (corrigida)
// ============================
function validateEditMediaForm() {
    const form = document.getElementById('edit-media-form');

    // Troféus
    const trophiesObtained = parseInt(form.querySelector('[name="trophies_obtained"]')?.value) || 0;
    const trophiesTotal = parseInt(form.querySelector('[name="trophies_total"]')?.value) || 0;
    if (trophiesObtained > trophiesTotal) {
        alert("O número de troféus obtidos não pode ser maior que o total.");
        return false;
    }

    // Temporadas / Episódios
    const seasonsWatched = parseInt(form.querySelector('[name="seasons_watched"]')?.value) || 0;
    const seasonsTotal = parseInt(form.querySelector('[name="seasons_total"]')?.value) || 0;
    const episodesWatched = parseInt(form.querySelector('[name="episodes_watched"]')?.value) || 0;
    const episodesTotal = parseInt(form.querySelector('[name="episodes_total"]')?.value) || 0;

    if (seasonsWatched > seasonsTotal) {
        alert("O número de temporadas assistidas não pode ser maior que o total.");
        return false;
    }
    if (episodesWatched > episodesTotal) {
        alert("O número de episódios assistidos não pode ser maior que o total.");
        return false;
    }

    // Volumes
    const volumesRead = parseInt(form.querySelector('[name="volume_read"]')?.value) || 0;
    const volumesTotal = parseInt(form.querySelector('[name="volume_amount"]')?.value) || 0;
    if (volumesRead > volumesTotal) {
        alert("O número de volumes lidos não pode ser maior que o total.");
        return false;
    }

    // Páginas
    const pagesRead = parseInt(form.querySelector('[name="pages_read"]')?.value) || 0;
    const pagesTotal = parseInt(form.querySelector('[name="pages_total"]')?.value) || 0;
    if (pagesRead > pagesTotal) {
        alert("O número de páginas lidas não pode ser maior que o total.");
        return false;
    }

    // Jogos: horas jogadas não negativas
    const hoursPlayed = form.querySelector('[name="hours_played"]')?.value || 0;
    if (hoursPlayed < 0) {
        alert("Horas jogadas não podem ser negativas.");
        return false;
    }

    return true;
}

// Editar (submit)
document.getElementById('edit-media-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateEditMediaForm()) return; // <- só deixa salvar se passar na validação

    const form = e.target;
    const id = form.dataset.id;
    if (!id) return alert("ID da mídia não encontrado");

    // Encontra a mídia original
    const doc = await window._DB.collection('media').doc(id).get();
    if (!doc.exists) return alert("Mídia não encontrada");
    const media = { _docId: doc.id, ...doc.data() };

    // Validações obrigatórias
    const title = form['edit-title'].value.trim();
    const rating = form['edit-rating'].value.trim();
    const consumedDate = form['edit-date'].value.trim();

    // Imagem
    const imageFileInput = form.querySelector('#edit-cover');
    const newFile = imageFileInput?.files[0] || null;

    let cover_img = media.cover_img; // valor atual, se não trocar
    if (newFile) {
        cover_img = await fileToBase64(newFile);
    }

    const type = media.type; // mantém o tipo original
    let specificFields = {};

    switch (type) {
        case 'games':
            specificFields = {
                hours_played: form.querySelector('[name="hours_played"]')?.value || 0,
                online: form.querySelector('[name="online"]')?.value === 'true',
                beaten: form.querySelector('[name="beaten"]')?.value === 'true',
                trophies_obtained: parseInt(form.querySelector('[name="trophies_obtained"]')?.value) || 0,
                trophies_total: parseInt(form.querySelector('[name="trophies_total"]')?.value) || 0,
            };
            break;
        case 'movies':
        case 'animated_movies':
            const durationType = form.querySelector('[name="duration_type"]')?.value;
            if (durationType === 'minutes') {
                specificFields.duration_only_minutes = parseInt(form.querySelector('[name="duration_minutes"]')?.value) || 0;
                specificFields.duration_hours = null;
                specificFields.duration_minutes = null;
            } else {
                specificFields.duration_hours = parseInt(form.querySelector('[name="duration_hours"]')?.value) || 0;
                specificFields.duration_minutes = parseInt(form.querySelector('[name="duration_minutes"]')?.value) || 0;
                specificFields.duration_only_minutes = null;
            }
            break;
        case 'series':
        case 'animations':
            const useEpisodes = form.querySelector('[name="use_episodes"]')?.value === 'true';
            if (useEpisodes) {
                specificFields.episodes_watched = parseInt(form.querySelector('[name="episodes_watched"]')?.value) || 0;
                specificFields.episodes_total = parseInt(form.querySelector('[name="episodes_total"]')?.value) || 0;
            } else {
                specificFields.seasons_watched = parseInt(form.querySelector('[name="seasons_watched"]')?.value) || 0;
                specificFields.seasons_total = parseInt(form.querySelector('[name="seasons_total"]')?.value) || 0;
            }
            break;
        case 'books':
            specificFields.pages_read = parseInt(form.querySelector('[name="pages_read"]')?.value) || 0;
            specificFields.pages_total = parseInt(form.querySelector('[name="pages_total"]')?.value) || 0;
            break;
        case 'mangas':
        case 'comics':
            specificFields.volume_read = parseInt(form.querySelector('[name="volume_read"]')?.value) || 0;
            specificFields.volume_amount = parseInt(form.querySelector('[name="volume_amount"]')?.value) || 0;
            break;
    }

    const updatedMedia = {
        id,
        title,
        rating: parseFloat(rating),
        consumed_date: consumedDate,
        type,
        cover_img,
        ...specificFields
    };

    try {
        await updateMediaFirestore(id, updatedMedia); // Atualiza Firestore

        // Recarrega o item atualizado do Firestore
        const doc = await window._DB.collection('media').doc(id).get();
        const updatedDocData = { _docId: doc.id, ...doc.data() };

        // Atualiza o item no globalMedias
        const idx = globalMedias.findIndex(m => m._docId === id);
        if (idx > -1) {
            globalMedias[idx] = updatedDocData;
        }

        renderFilteredAndSorted(); // Agora renderiza com dados 100% atualizados
        document.getElementById('edit-media-modal').classList.add('hidden');
        //alert("Mídia atualizada com sucesso!");
        window.location.reload();
    } catch (err) {
        console.error("Erro ao atualizar mídia:", err);
        alert("Erro ao atualizar mídia");
    }

});

// Delete Media
document.getElementById('delete-media').addEventListener('click', async () => {
    const form = document.getElementById('edit-media-form');
    const mediaId = form.dataset.id;

    if (!mediaId) return alert("ID da mídia não encontrado");

    if (!confirm("Tem certeza que deseja deletar esta mídia?")) return;

    try {
        await deleteMediaFirestore(mediaId);
        document.getElementById('edit-media-modal').classList.add('hidden');
        alert("Mídia deletada com sucesso!");
        window.location.reload();
    } catch (err) {
        console.error("Erro ao deletar mídia:", err);
        alert("Erro ao deletar mídia.");
    }
});

// ============================
// Export JSON Button Logic
// ============================

document.getElementById('json-btn').addEventListener('click', () => {
    if (!currentMedias || currentMedias.length === 0) {
        alert("No data available for export.");
        return;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:]/g, '-').split('.')[0];
    const fileName = `media_export_${timestamp}.json`;

    // Função para filtrar campos null e encurtar imagens
    function cleanMedia(media) {
        const result = {};
        for (let key in media) {
            if (media[key] === null || media[key] === undefined) continue;

            // Se for cover_img e começar com "data:image/", encurtar
            if (key === 'cover_img' && typeof media[key] === 'string' && media[key].startsWith('data:image/')) {
                result[key] = '[BASE64 IMAGE]'; // placeholder
            } else {
                result[key] = media[key];
            }
        }
        return result;
    }

    const cleanedData = currentMedias.map(cleanMedia);

    const jsonData = JSON.stringify(cleanedData, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// ============================
// Print Cards
// ============================

// document.getElementById('print-btn').addEventListener('click', () => {
//     const visible = Array.from(document.querySelectorAll('#media-container .card'))
//         .filter(c => c.offsetParent !== null);

//     if (!visible.length) {
//         alert('Nenhum card visível para imprimir.');
//         return;
//     }

//     const svgHref = document.querySelector('link[rel="icon"]').href;
//     const header = `
//     <header style="display:flex;align-items:center;padding:1em;border-bottom:2px solid #333;margin-bottom:1em;">
//       <img src="${svgHref}" alt="Logo" style="width:40px;height:40px;margin-right:0.5em;">
//       <h1 style="font-family:sans-serif;margin:0;font-size:1.5em;">My Entertainment Manager</h1>
//     </header>`;

//     const cardsHtml = visible.map(card => {
//         const clone = card.cloneNode(true);

//         // Remove ícones de edição
//         clone.querySelectorAll('.edit-icon-card').forEach(i => i.remove());

//         // Ajusta box-shadow e borda
//         clone.style.boxShadow = 'none';
//         clone.style.border = '1px solid #ccc';

//         // Ajusta badges que tenham 'emoji-blink' para mostrar todos os emojis juntos
//         clone.querySelectorAll('.emoji-blink').forEach(emojiSpan => {
//             const emojis = emojiSpan.dataset.emojis;
//             if (emojis) {
//                 // emojis é uma string tipo '["🎬","✨"]'
//                 try {
//                     const arr = JSON.parse(emojis);
//                     emojiSpan.textContent = arr.join('');
//                 } catch {
//                     // fallback, não alterar
//                 }
//             }
//         });

//         return clone.outerHTML;
//     }).join('');

//     const html = `
//     <html>
//     <head>
//         <link rel="icon" type="image/svg+xml" href="./assets/favicon/favicon.svg">
//         <title>My Entertainment Manager | Print Cards</title>
//         <link rel="icon" type="image/svg+xml" href="${svgHref}">
//         <style>
//             body {
//                 font-family: sans-serif;
//                 margin: 1em;
//                 background: white;
//                 color: #000;
//             }
//             header {
//                 page-break-after: avoid;
//             }
//             .grid {
//                 display: grid;
//                 grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
//                 gap: 1em;
//             }
//             .card {
//                 background: #fff;
//                 border-radius: 8px;
//                 overflow: hidden;
//                 display: flex;
//                 flex-direction: column;
//                 justify-content: space-between;
//                 border: 1px solid #ccc;
//                 page-break-inside: avoid;
//             }
//             .card-image {
//                 position: relative;
//                 width: 100%;
//                 height: 180px;
//                 overflow: hidden;
//             }
//             .card-image img {
//                 width: 100%;
//                 height: 100%;
//                 object-fit: cover;
//                 display: block;
//             }
//             .badge {
//                 position: absolute;
//                 top: 0;
//                 left: 0;
//                 background-color: rgba(0, 0, 0, 0.6);
//                 backdrop-filter: blur(2px);
//                 color: #fff;
//                 padding: 0.3em 0.5em;
//                 font-size: 1.1em;
//                 border-bottom-right-radius: 12px;
//                 font-weight: bold;
//                 display: flex;
//                 align-items: center;
//                 justify-content: center;
//                 min-width: 2em;
//                 height: 2em;
//                 box-sizing: border-box;
//             }
//             .card-content {
//                 padding: 1em;
//                 display: flex;
//                 flex-direction: column;
//                 gap: 0.4em;
//             }
//             .card-content h3 {
//                 margin: 0 0 0.3em;
//                 font-size: 1.2em;
//                 color: #222;
//             }
//             .card-content .row {
//                 display: flex;
//                 justify-content: space-between;
//                 flex-wrap: wrap;
//                 font-size: 0.9em;
//                 margin: 0.2em 0;
//             }
//             .card-content .row span:first-child {
//                 justify-self: flex-start;
//                 text-align: left;
//                 flex: 1;
//             }
//             .card-content .row span:last-child {
//                 justify-self: flex-end;
//                 text-align: right;
//             }
//             .card-content .duration-row {
//                 justify-content: flex-start;
//             }
//             .card-content .row span {
//                 display: flex;
//                 align-items: center;
//                 gap: 4px;
//                 white-space: nowrap;
//             }
//             .comment {
//                 font-style: italic;
//                 color: #555;
//                 margin-top: 0.4em;
//                 font-size: 0.95em;
//             }
//             .emoji-blink {
//                 display: inline-block;
//                 font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif;
//                 text-align: center;
//                 min-width: 2em;
//             }
//             img { break-inside: avoid; }

//             @media print {
//                 body { margin: 0; }
//                 .card { page-break-inside: avoid; }
//                 header { page-break-after: avoid; }
//             }
//         </style>
//     </head>
//     <body>
//         ${header}
//         <div class="grid">${cardsHtml}</div>
//         <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
//     </body>
//     </html>`;

//     const w = window.open('My Entertainment Manager | Print Cards', '_blank');
//     w.document.open();
//     w.document.write(html);
//     w.document.close();
// });

// ============================
// Modal Accessibility (Focus Trap + Keyboard Nav)
// ============================

function setupModalAccessibility(modalId, openButtonId, closeButtonId) {
    const modal = document.getElementById(modalId);
    const openBtn = openButtonId ? document.getElementById(openButtonId) : null;
    const closeBtn = document.getElementById(closeButtonId);

    if (!modal) return;

    // When modal is opened
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            trapFocus(modal);
        });
    }

    // When modal is closed
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            removeFocusTrap();
            if (openBtn) openBtn.focus(); // Return focus to trigger button
        });
    }
}

// Focus trapping setup
let previouslyFocusedElement = null;
let focusableElements = [];
let firstFocusable = null;
let lastFocusable = null;

function trapFocus(modal) {
    previouslyFocusedElement = document.activeElement;

    // Get all focusable children in the modal
    focusableElements = modal.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    firstFocusable = focusableElements[0];
    lastFocusable = focusableElements[focusableElements.length - 1];

    firstFocusable.focus();

    // Listen for tab key inside modal
    document.addEventListener('keydown', handleTabKey);
}

// Remove focus trap when modal closes
function removeFocusTrap() {
    document.removeEventListener('keydown', handleTabKey);
    if (previouslyFocusedElement) previouslyFocusedElement.focus();
}

// Keep focus inside the modal
function handleTabKey(e) {
    if (e.key !== 'Tab') return;
    if (!firstFocusable || !lastFocusable) return;

    if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
        }
    } else {
        // Tab
        if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
        }
    }
}

// Setup modals with open/close IDs
setupModalAccessibility('favorite-modal', 'select-favorite-btn', 'cancel-favorite-btn');
setupModalAccessibility('edit-media-modal', null, 'cancel-edit-media');
setupModalAccessibility('settings-modal', 'settings-btn', 'cancel-settings');
setupModalAccessibility('advanced-filters-modal', 'advanced-search-btn', 'cancel-advanced');
setupModalAccessibility('add-media-modal', 'add-media-button', 'cancel-add-media');
setupModalAccessibility('edit-profile-modal', 'edit-profile-trigger', 'cancel-edit');

// Escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        openModals.forEach(modal => {
            modal.classList.add('hidden');
        });
        removeFocusTrap();
    }
});

// ============================
// Share Profile
// ============================

document.getElementById("share-btn").addEventListener("click", async () => {
    try {
        if (navigator.share) {
            await navigator.share({
                title: translations?.shareTexts?.title || 'My Entertainment Manager - Profile',
                text: translations?.shareTexts?.subtitle || 'Check out my activity on Entertainment Manager!',
                url: window.location.href,
            });
        } else {
            alert(translations?.shareTexts?.unsupported || 'Sharing is not supported in this browser. Try another one.');
        }
    } catch (error) {
        console.error("Error sharing:", error);
    }
});

// ============================
// Settings Modal Handling
// ============================

// === DOM Elements ===
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const saveSettingsBtn = document.getElementById("save-settings");
const cancelSettingsBtn = document.getElementById("cancel-settings");

// === Modal Open ===
settingsBtn.addEventListener("click", () => {
    loadSettingsIntoUI();
    settingsModal.classList.remove("hidden");
    document.body.classList.add("menu-open");
});

// === Modal Cancel (or click outside) ===
cancelSettingsBtn.addEventListener("click", closeSettingsModal);
settingsModal.addEventListener("click", e => {
    if (e.target === settingsModal) closeSettingsModal();
});

// === Modal Close Helper ===
function closeSettingsModal() {
    settingsModal.classList.add("hidden");
    document.body.classList.remove("menu-open");
}

// === Save Settings ===
saveSettingsBtn.addEventListener("click", async () => {
    const currentActiveTypes = JSON.parse(localStorage.getItem("activeMediaTypes")) || [];
    const newActiveTypes = Array.from(document.querySelectorAll("input[name='mediaTypes']:checked")).map(cb => cb.value);

    if (newActiveTypes.length === 0) {
        alert(translations?.main?.modals?.settings?.alertSelectOne || "⚠️ Please select at least one media type.");
        return;
    }

    // Before saving, get the current state of the filters
    const currentFilterState = getCategoryFilterState();

    // Detects disabled media (left the array)
    const disabledTypes = currentActiveTypes.filter(type => !newActiveTypes.includes(type));
    disabledTypes.forEach(type => {
        savedFilterStates[type] = currentFilterState; // salva o estado completo para essa mídia
    });

    // Detects activated (new) media
    const enabledTypes = newActiveTypes.filter(type => !currentActiveTypes.includes(type));

    // Saves new types to localStorage
    localStorage.setItem("activeMediaTypes", JSON.stringify(newActiveTypes));

    // Updates general settings
    localStorage.setItem("language", document.getElementById("language-select").value);
    localStorage.setItem("darkMode", document.getElementById("darkmode-select").value);

    // Updates general settings
    const selectedLang = document.getElementById("language-select").value;
    localStorage.setItem("language", selectedLang);
    localStorage.setItem("darkMode", document.getElementById("darkmode-select").value);

    await loadTranslations(selectedLang);

    // Apply settings (theme, filters, etc.)
    applySettings();

    // Apply language after settings saved
    loadTranslations(selectedLang);

    // Updates categories filter for enabled media to restore saved state, if any
    const currentFilters = getCategoryFilterState();

    enabledTypes.forEach(type => {
        if (savedFilterStates[type]) {
            // Restores the saved filter for this media
            // Here we are merging so that the activated media returns to the filter state it had.
            Object.entries(savedFilterStates[type]).forEach(([key, checked]) => {
                currentFilters[key] = checked;
            });
            delete savedFilterStates[type]; // Clear after restore
        }
    });

    setCategoryFilterState(currentFilters);

    // Redoes filter and renders dashboard with active types
    const filtered = globalMedias.filter(m => {
        if (m.type === "animated_movies") {
            return newActiveTypes.includes("movies") || newActiveTypes.includes("animations") || newActiveTypes.includes("animated_movies");
        }
        return newActiveTypes.includes(m.type);
    });

    // Call other funcions on the end
    renderMedias(filtered);
    populateDashboard(filtered);

    updateAchievementsTooltip();

    closeSettingsModal();
});

// === Load Saved Settings Into UI ===
function loadSettingsIntoUI() {
    let storedTypes = JSON.parse(localStorage.getItem("activeMediaTypes"));

    // If there are no saved types or the array is empty, apply default
    if (!Array.isArray(storedTypes) || storedTypes.length === 0) {
        storedTypes = ["movies", "series", "games", "books", "comics", "mangas", "animations"];
        localStorage.setItem("activeMediaTypes", JSON.stringify(storedTypes)); // garante persistência
    }

    document.querySelectorAll("input[name='mediaTypes']").forEach(cb => {
        cb.checked = storedTypes.includes(cb.value);
    });

    document.getElementById("language-select").value = localStorage.getItem("language") || "en";
    document.getElementById("darkmode-select").value = localStorage.getItem("darkMode") || "light";

    // Update the "All" checkbox
    const allCheckbox = document.getElementById("select-all-types");
    const mediaCheckboxes = Array.from(document.querySelectorAll('input[name="mediaTypes"]'));
    allCheckbox.checked = mediaCheckboxes.every(cb => cb.checked);
}

// === Apply Settings to UI ===
function applySettings() {
    const types = JSON.parse(localStorage.getItem("activeMediaTypes") || "[]");

    // Show/hide filter buttons based on active types
    document.querySelectorAll("nav button[data-filter]").forEach(btn => {
        const type = btn.dataset.filter;
        btn.style.display = (type === "all" || types.includes(type)) ? "inline-flex" : "none";
    });

    // Apply theme
    applyDarkMode(localStorage.getItem("darkMode") || "system");

    // Update filter modals and UI
    updateAllFilterButtons();
    updateAdvancedFilterOptions();

    // Update media count after applying settings
    updateResultsCount(currentMedias.length);

    renderFilteredAndSorted();
}

// === View All Button Logic ===
document.querySelectorAll('button[data-filter="all"]').forEach(button => {
    button.addEventListener('click', () => {
        const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');
        const filtered = globalMedias.filter(m => enabledTypes.includes(m.type));
        renderMedias(filtered);
    });
});

// === Show/Hide "View All" Based on Settings ===
function updateAllFilterButtons() {
    const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');

    const allButtons = document.querySelectorAll('button[data-filter="all"]');
    allButtons.forEach(button => {
        // Show only if there are 2 or more active types
        button.style.display = enabledTypes.length >= 2 ? "inline-flex" : "none";
    });
}

// === Advanced Filter Visibility Based on Settings ===
function updateAdvancedFilterOptions() {
    const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');

    const allFilterItems = document.querySelectorAll('#filterContainer .filter-item');
    allFilterItems.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (!checkbox || checkbox.value === 'all') return;

        item.style.display = enabledTypes.includes(checkbox.value) ? 'flex' : 'none';
    });
}

// === Reset Data (Factory Reset) + Firebase ===
document.getElementById("reset-data").addEventListener("click", async () => {
    const confirmReset = confirm(
        translations?.main?.modals?.settings?.resetConfirm ||
        "This will erase ALL your profile and media data. Are you sure?"
    );

    if (!confirmReset) return;

    const user = AUTH.currentUser;
    if (!user) {
        alert("You must be logged in to reset your data.");
        return;
    }

    try {
        // === Apaga profile ===
        const profileDoc = await DB.collection("profile").doc("mainProfile").get();
        if (profileDoc.exists) {
            await DB.collection("profile").doc("mainProfile").delete();
            console.log("Profile deletado.");
        }

        // === Apaga todas as mídias ===
        const mediaSnapshot = await DB.collection("media").get();
        if (!mediaSnapshot.empty) {
            const deletePromises = [];
            mediaSnapshot.forEach(docSnap => {
                deletePromises.push(DB.collection("media").doc(docSnap.id).delete());
            });
            await Promise.all(deletePromises);
            console.log("Todas as mídias deletadas.");
        }

        // Limpar localStorage e recarregar
        localStorage.clear();
        alert("All your data has been deleted.");
        location.reload();

    } catch (err) {
        console.error("Erro ao resetar dados:", err);
        alert("Failed to reset data. Try again later.");
    }
});


// === Dark Mode Preference ===
function applyDarkMode(mode) {
    const body = document.body;
    if (mode === "dark") {
        body.classList.add("dark-mode");
    } else if (mode === "light") {
        body.classList.remove("dark-mode");
    } else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        body.classList.toggle("dark-mode", prefersDark);
    }

    updateBaseOptions();

    // 🧹 Destroy all existing charts
    Object.keys(charts).forEach(id => {
        if (charts[id]) {
            charts[id].destroy();
            delete charts[id];
        }
    });

    renderFilteredAndSorted();

    // Rebuild dashboard if visible
    if (!dashboard.classList.contains('hidden')) {
        populateDashboard(globalMedias);
    }
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const savedMode = localStorage.getItem("darkMode") || "auto";
    if (savedMode === "auto") {
        applyDarkMode("auto");
    }
});

// === On Page Load ===
document.addEventListener("DOMContentLoaded", () => {
    loadSettingsIntoUI();         // Load UI based on localStorage
    applySettings();
    initSettingsCheckboxSync();

    const enabledTypes = JSON.parse(localStorage.getItem("activeMediaTypes") || '[]');
    const filtered = globalMedias.filter(m => enabledTypes.includes(m.type));
    renderMedias(filtered);

    filterSetup();      // Ensures buttons are active
    searchSetup();      // Ensures search works
    setupSort();        // Ensures ordering 
    renderFilteredAndSorted(); // Applies the active type filter
});

function initSettingsCheckboxSync() {
    const allCheckbox = document.getElementById("select-all-types");
    const mediaCheckboxes = Array.from(document.querySelectorAll('input[name="mediaTypes"]'));

    // Click on "All"
    allCheckbox.addEventListener("change", () => {
        mediaCheckboxes.forEach(cb => {
            cb.checked = allCheckbox.checked;
        });
    });

    // Individual changes
    mediaCheckboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            const allChecked = mediaCheckboxes.every(cb => cb.checked);
            allCheckbox.checked = allChecked;
        });
    });
}

// ============================
// Dashboard
// ============================

// Dashboard Global References
const dashboardBtn = document.getElementById('dashboard-btn');
const backBtn = document.getElementById('back-to-cards-btn');
const mediaContainer = document.getElementById('media-container');
const dashboard = document.getElementById('dashboard');
const charts = {};
// Saves the state of disabled media filters
const savedFilterStates = {};

// Function to retrieve the current state of the category filters
function getCategoryFilterState() {
    const catList = document.getElementById('category-list');
    const checkboxes = Array.from(catList.querySelectorAll('input[type="checkbox"]'));
    const state = {};
    checkboxes.forEach(cb => {
        state[cb.dataset.type] = cb.checked;
    });
    return state;
}

// Function to set the category filter state based on a given object
function setCategoryFilterState(state) {
    const catList = document.getElementById('category-list');
    const checkboxes = Array.from(catList.querySelectorAll('input[type="checkbox"]'));
    checkboxes.forEach(cb => {
        if (state.hasOwnProperty(cb.dataset.type)) {
            cb.checked = state[cb.dataset.type];
        }
    });
}

// Show/Hide Controls Bar
dashboardBtn.addEventListener('click', () => {
    mediaContainer.style.display = 'none';
    dashboard.classList.remove('hidden');

    // Hide the control bar and main nav
    document.querySelector('.controls-bar').style.display = 'none';
    document.querySelector('.main-nav').style.display = 'none';

    const activeTypes = getActiveMediaTypes();
    const filtered = globalMedias.filter(m => activeTypes.includes(m.type));
    populateDashboard(filtered);
});

backBtn.addEventListener('click', () => {
    dashboard.classList.add('hidden');
    mediaContainer.style.display = 'flex';

    // Show the control bar again and main nav
    document.querySelector('.controls-bar').style.display = '';
    document.querySelector('.main-nav').style.display = '';
});

// Dashboard Toggle Handlers
dashboardBtn.addEventListener('click', () => {
    mediaContainer.style.display = 'none';
    dashboard.classList.remove('hidden');

    const activeTypes = getActiveMediaTypes();
    const filtered = globalMedias.filter(m => activeTypes.includes(m.type));
    populateDashboard(filtered);
});


backBtn.addEventListener('click', () => {
    dashboard.classList.add('hidden');
    mediaContainer.style.display = 'flex';
});

// ============================
// Fetch JSON Data 
// ============================

// fetch('data/media.json')
//     .then(res => {
//         if (!res.ok) throw new Error('media.json load error');
//         return res.json();
//     })
//     .then(arr => {
//         globalMedias = arr;
//         // If the dashboard is already open, we will fill it with the data
//         if (!dashboard.classList.contains('hidden')) populateDashboard(arr);
//     })
//     .catch(console.error);

// function getCss(variable) {
//     return getComputedStyle(document.body).getPropertyValue(variable).trim();
// }

// DASHBOARD...

loadDashboardFromFirestore();

async function loadDashboardFromFirestore() {
    try {
        const snapshot = await window._DB.collection('media').get();
        globalMedias = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if (!dashboard.classList.contains('hidden')) {
            populateDashboard(globalMedias);
        }
    } catch (err) {
        console.error('Erro ao carregar Dashboard do Firestore:', err);
    }
}

// ============================
// Format Category Names with emoji and spacing 
// ============================

function formatCategoryName(type) {
    const emojiMap = {
        'movies': '🎬',
        'series': '📺',
        'animations': '✨',
        'animated_movies': '✨🎬',
        'games': '🎮',
        'books': '📚',
        'mangas': '📖',
        'comics': '💥'
    };

    // Caminho esperado: main.dashboard.mediaFilter.mediaTypes.movies
    const translationKey = `main.dashboard.mediaFilter.mediaTypes.${type}`;
    const translatedName = getNestedTranslation(translationKey, translations);

    return `${emojiMap[type] || ''} ${translatedName || type.charAt(0).toUpperCase() + type.slice(1)}`;
}


// ============================
// Get Current Theme 
// ============================

function isDarkMode() {
    return document.body.classList.contains('dark-mode');
}

function getActiveMediaTypes() {
    const types = JSON.parse(localStorage.getItem('activeMediaTypes')) || [];

    // Include "animated_movies" if "movies" or "animations" are enabled
    if ((types.includes("movies") || types.includes("animations")) && !types.includes("animated_movies")) {
        types.push("animated_movies");
    }

    return types;
}

// ============================
// Base Options
// ============================

let baseOptions;

function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function updateBaseOptions() {
    const textColor = isDarkMode() ? '#ededed' : '#1a1a1a';
    const bgColor = isDarkMode() ? '#2a2a2a' : '#ffffff';
    const gridColor = isDarkMode() ? '#444' : '#ccc'; // Updated line

    baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                ticks: { color: textColor },
                grid: { color: gridColor } // Updated line
            },
            y: {
                ticks: { color: textColor },
                grid: { color: gridColor } // Updated line
            }
        },
        plugins: {
            legend: { labels: { color: textColor } },
            tooltip: {
                titleColor: textColor,
                bodyColor: textColor,
                backgroundColor: bgColor
            }
        }
    };
}

// Updates the Convert Hour/Days Text (Declared outside the populateDashboard() because it is called on ApplyTranslations)
const btnConvert = document.getElementById('convert-time-btn');

function updateConvertButtonText() {
    const key = btnConvert.dataset.mode === 'hours'
        ? 'main.dashboard.timeSpentEstimate.convertToDays'
        : 'main.dashboard.timeSpentEstimate.convertToHours';

    const label = getNestedTranslation(key, translations) || (btnConvert.dataset.mode === 'hours' ? 'Convert to days' : 'Convert to hours');
    btnConvert.textContent = label;
}

// Colors for the Dashboard
function generatePurpleGradient(n) {
    const gradient = [
        '#f5e9ff', '#e5d0ff', '#d5b6ff', '#c49dff',
        '#b483ff', '#a469ff', '#944eff', '#8434ff',
        '#741aff', '#6400ff', '#4b00cc' // Colors for rating 0 to 10
    ];
    return Array.from({ length: n }, (_, i) => gradient[i % gradient.length]);
}

const fixedOrder = ['movies', 'series', 'animations', 'animated_movies', 'games', 'books', 'mangas', 'comics'];

// Populate Dashboard with Data
function populateDashboard(allData) {
    updateBaseOptions();

    const catList = document.getElementById('category-list');
    const checkboxes = Array.from(catList.querySelectorAll('input'));
    const selectedTypes = checkboxes.length
        ? checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.type)
        : [...new Set(allData.map(m => m.type))];

    const filteredData = allData.filter(m => selectedTypes.includes(m.type));
    document.getElementById('total-items').textContent = filteredData.length;

    const catCount = {};
    allData.forEach(m => catCount[m.type] = (catCount[m.type] || 0) + 1);

    // When assembling the checkboxes, use:
    catList.innerHTML = '';
    fixedOrder.forEach(type => {
        if (catCount[type]) {
            const count = catCount[type];
            const isChecked = selectedTypes.includes(type);
            const li = document.createElement('li');
            li.innerHTML = `<label><input type="checkbox" data-type="${type}" ${isChecked ? 'checked' : ''}> ${formatCategoryName(type)} (${count})</label>`;
            const input = li.querySelector('input');
            input.addEventListener('change', () => populateDashboard(allData));
            catList.appendChild(li);
        }
    });

    // ===== Rating Chart =====
    const ratings = Array(11).fill(0);
    filteredData.forEach(m => {
        const r = Math.round(m.rating || 0);
        if (r >= 0 && r <= 10) ratings[r]++;
    });
    const ratingColors = generatePurpleGradient(11);

    updateChart('chart-rating', 'bar', {
        labels: ratings.map((_, i) => i.toString()),
        datasets: [{
            data: ratings,
            backgroundColor: ratingColors,
            borderColor: ratingColors,
            borderWidth: 1
        }]
    }, {
        plugins: {
            legend: { display: false }, // Removes subtitle
        },
        onClick: null, // Avoid any action
        responsive: true
    });

    // ===== Books/Volumes Read Chart (dynamic) =====
    const activeTypes = selectedTypes; // Already comes from the filter or the settings modal
    const barLabels = [];
    const barData = [];
    const barColors = [];

    if (activeTypes.includes('books')) {
        const count = filteredData.filter(m => m.type === 'books' && m.pages_read === m.pages_total).length;
        if (count > 0) {
            barLabels.push(translations.main.dashboard.amountRead.books || 'Books');
            barData.push(count);
            barColors.push(generatePurpleGradient(3)[0]);
        }
    }

    if (activeTypes.includes('mangas')) {
        const count = filteredData.filter(m => m.type === 'mangas' && m.volume_read > 0).length;
        if (count > 0) {
            barLabels.push(translations.main.dashboard.amountRead.mangas || 'Manga');
            barData.push(count);
            barColors.push(generatePurpleGradient(3)[1]);
        }
    }

    if (activeTypes.includes('comics')) {
        const count = filteredData.filter(m => m.type === 'comics' && m.volume_read > 0).length;
        if (count > 0) {
            barLabels.push(translations.main.dashboard.amountRead.comics || 'Comics');
            barData.push(count);
            barColors.push(generatePurpleGradient(3)[2]);
        }
    }


    // Only generate the graph if there is visible data
    if (barLabels.length > 0) {
        document.querySelector('[data-id="chart-pages"]').style.display = ''; // Ensures visibility
        updateChart('chart-pages', 'bar', {
            labels: barLabels,
            datasets: [{
                label: 'Count',
                data: barData,
                backgroundColor: barColors
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: {
                        precision: 0,
                        stepSize: 1
                    }
                }
            }
        });
    } else {
        // Hides the card if there is no visible data
        document.querySelector('[data-id="chart-pages"]').style.display = 'none';
    }

    // ===== Consumption Timeline =====
    const yearCount = {};
    filteredData.forEach(m => {
        const year = new Date(m.consumed_date).getFullYear();
        if (year) yearCount[year] = (yearCount[year] || 0) + 1;
    });
    const years = Object.keys(yearCount).sort();
    const counts = years.map(y => yearCount[y]);

    const timelineColor = generatePurpleGradient(11)[8];

    updateChart('chart-timeline', 'line', {
        labels: years,
        datasets: [{
            data: counts,
            fill: false,
            borderColor: timelineColor,
            backgroundColor: timelineColor,
            tension: 0
        }]
    },
        {
            plugins: {
                legend: { display: false },
            },
            onClick: null,
            responsive: true,
            scales: {
                y: {
                    ticks: {
                        precision: 0,
                        stepSize: 1
                    }
                }
            }
        });

    // ===== Game Completion Status =====
    const gameStatus = { beaten: 0, notBeaten: 0, online: 0 };
    filteredData.forEach(m => {
        if (m.type === 'games') {
            if (m.beaten) gameStatus.beaten++;
            else if (m.online) gameStatus.online++;
            else gameStatus.notBeaten++;
        }
    });

    // Translations with fallback
    const gameStatusTranslations = translations?.main?.dashboard?.gameCompletionStatus || {};
    const labelCompleted = '✔️ ' + (gameStatusTranslations.completed || 'Completed');
    const labelNotCompleted = '✖️ ' + (gameStatusTranslations.notCompleted || 'Not Completed');
    const labelOnline = '🌐 ' + (gameStatusTranslations.onlineNoCampaign || 'Online/No Campaign');

    updateChart('chart-game-status', 'pie', {
        labels: [labelCompleted, labelNotCompleted, labelOnline],
        datasets: [{
            data: [gameStatus.beaten, gameStatus.notBeaten, gameStatus.online],
            backgroundColor: generatePurpleGradient(3)
        }]
    }, {
        plugins: {
            legend: {
                labels: {
                    boxWidth: 12,
                    padding: 10
                }
            }
        },
        scales: {
            x: { display: false },
            y: { display: false }
        }
    });

    // ===== Game Trophies =====
    let trophyTotal = 0;
    let platinumCount = 0;

    filteredData.forEach(m => {
        if (m.type === 'games') {
            const total = Number(m.trophies_total) || 0;
            const obtained = Number(m.trophies_obtained) || 0;

            trophyTotal += obtained;
            if (total > 0 && obtained === total) platinumCount++;
        }
    });

    document.getElementById('trophy-total').textContent = trophyTotal;
    document.getElementById('platinum-count').textContent = platinumCount;

    // ===== Media by Category =====
    const categoryMap = {};
    filteredData.forEach(m => {
        categoryMap[m.type] = (categoryMap[m.type] || 0) + 1;
    });

    // Similarly for media by category:
    const catLabels = [];
    const catValues = [];

    fixedOrder.forEach(type => {
        if (categoryMap[type]) {
            catLabels.push(formatCategoryName(type));
            catValues.push(categoryMap[type]);
        }
    })

    updateChart('chart-category', 'pie', {
        labels: catLabels,
        datasets: [{
            data: catValues,
            backgroundColor: generatePurpleGradient(catLabels.length)
        }]
    });

    const chartTypeBtns = document.querySelectorAll('.chart-type-btn[data-target="chart-category"]');
    chartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            chartTypeBtns.forEach(b => b.classList.toggle('active', b === btn));
            const type = btn.dataset.type;
            createInteractiveChart('chart-category', type, catLabels, catValues);
        });
    });

    // And then again later:
    const activeBtn = document.querySelector('.chart-type-btn[data-target="chart-category"].active');
    const initialType = activeBtn ? activeBtn.dataset.type : 'bar'; // fallback to 'bar'
    createInteractiveChart('chart-category', initialType, catLabels, catValues);

    const gamesExist = filteredData.some(m => m.type === 'games');
    document.querySelector('[data-id="chart-game-status"]').style.display = gamesExist ? '' : 'none';
    document.querySelector('[data-id="chart-trophies"]').style.display = gamesExist ? '' : 'none';

    // Favorite Media
    const favKey = 'favoriteMediaId';
    const favMediaId = localStorage.getItem(favKey);
    const favContainer = document.getElementById('favorite-media-content');
    favContainer.innerHTML = '';

    if (favMediaId) {
        const media = allData.find(m => String(m.id) === favMediaId);
        if (media) {
            favContainer.innerHTML = `
            <div class="favorite-media-box">
                <div class="favorite-media-text">
                <strong>${media.title}</strong><br>
                <div class="favorite-rating-type">
                    <span>⭐ ${media.rating ?? 'N/A'}</span>
                    <small>${formatCategoryName(media.type)}</small>
                </div>
                </div>
            </div>
            `;
        } else {
            favContainer.innerHTML = '<p>Favorite media not found</p>';
        }
    } else {
        favContainer.innerHTML = '<p>No favorite selected</p>';
    }

    // Time Spent Estimate
    let totalHours = 0;

    filteredData.forEach(m => {
        switch (m.type) {
            case 'movies':
            case 'animated_movies':
                if (m.duration_only_minutes != null) {
                    totalHours += Number(m.duration_only_minutes) / 60 || 0;
                } else {
                    const hours = Number(m.duration_hours) || 0;
                    const minutes = Number(m.duration_minutes) || 0;
                    totalHours += hours + (minutes / 60);
                }
                break;

            case 'games':
                totalHours += Number(m.playtime) || Number(m.hours_played) || 0;
                break;

            case 'books':
                totalHours += (Number(m.pages_read) || 0) / 25;
                break;

            case 'comics':
            case 'mangas':
                const vols = Number(m.volume_read) || (Number(m.pages_read) ? Number(m.pages_read) / 180 : 0);
                totalHours += vols * 0.5;
                break;

            case 'series':
                const eps = Number(m.episodes_watched) || (Number(m.seasons_watched) || 0) * 10;
                totalHours += eps * 0.75;
                break;

            case 'animations':
                const animEps = Number(m.episodes_watched) || (Number(m.seasons_watched) || 0) * 12;
                totalHours += animEps * 0.33;
                break;
        }
    });

    const timeDisplay = document.getElementById('time-spent');

    // Set initial mode
    btnConvert.dataset.mode = 'hours';

    function updateTimeDisplay(hours) {
        const safeHours = Number(hours) || 0;
        const roundedHours = Math.floor(safeHours);
        const remainingMinutes = Math.round((safeHours - roundedHours) * 60);
        timeDisplay.textContent = `${roundedHours}h ${remainingMinutes}min`;
    }

    btnConvert.onclick = () => {
        if (btnConvert.dataset.mode === 'hours') {
            const days = (totalHours / 24).toFixed(1);
            timeDisplay.textContent = `${days}d`;
            btnConvert.dataset.mode = 'days';
        } else {
            updateTimeDisplay(totalHours);
            btnConvert.dataset.mode = 'hours';
        }
        updateConvertButtonText();
    };

    // Show inicial value
    updateTimeDisplay(totalHours);
    updateConvertButtonText();

    // Media not Completed
    const gapList = document.getElementById('media-gaps-list');
    gapList.innerHTML = '';

    const excludeTypes = ['movies', 'series', 'animations', 'animated_movies'];
    const unfinished = filteredData.filter(m => {
        const isGame = m.type === 'games';
        const isBook = m.type === 'books';
        const isComic = m.type === 'comics';
        const isManga = m.type === 'mangas';
        const isSeries = m.type === 'series';
        const isAnimation = m.type === 'animations';

        if (isBook) return m.pages_read < m.pages_total;

        if (isComic || isManga) {
            const total = m.volume_total ?? m.volume_amount;
            return m.volume_read < total;
        }

        if (isSeries || isAnimation) {
            return (m.seasons_watched < m.seasons_total) ||
                (m.episodes_watched < m.episodes_total);
        }

        if (isGame) {
            const isOnline = m.online;
            const hasTrophyGap = m.trophies_total > 0 && m.trophies_obtained < m.trophies_total;

            if (isOnline && hasTrophyGap) return true;
            if (!isOnline && m.beaten && hasTrophyGap) return true;
            if (!isOnline && !m.beaten) return true;
            return false;
        }

        return false;
    });

    unfinished.sort((a, b) => new Date(b.consumed_date) - new Date(a.consumed_date));

    if (unfinished.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'no-results';
        msg.setAttribute('data-i18n', 'main.dashboard.mediaNotCompleted.mediaNotCompletedWarning');
        msg.textContent = 'No incomplete media found.';

        gapList.appendChild(msg);

        // Force translation if function exists
        if (typeof applyTranslations === 'function') {
            applyTranslations();
        }

        return; // Skip rendering columns
    }

    const top6 = unfinished
        .sort((a, b) => new Date(b.consumed_date) - new Date(a.consumed_date))
        .slice(0, 6);


    const col1 = [];
    const col2 = [];

    top6.forEach((item, i) => {
        const markup = buildItem(item, i); // Index from 0 to 5
        (i % 2 === 0 ? col1 : col2).push(markup);
    });

    function translate(key) {
        return getNestedTranslation(key, translations) || key;
    }

    function buildItem(m, index) {
        const calendar = `📅 ${new Date(m.consumed_date).toLocaleDateString()}`;
        let progress = '';

        if (m.type === 'books') progress = `📄 ${m.pages_read}/${m.pages_total} ${translate('main.dashboard.mediaNotCompleted.pages')}`;
        else if (['mangas', 'comics'].includes(m.type)) {
            const total = m.volume_total ?? m.volume_amount;
            progress = `🔖 ${m.volume_read}/${total} ${translate('main.dashboard.mediaNotCompleted.volumes')}`;
        }
        else if (m.type === 'games') {
            if (m.online && m.trophies_total > 0 && m.trophies_obtained < m.trophies_total) {
                progress = `🏆 ${m.trophies_obtained}/${m.trophies_total}`;
            } else if (m.beaten) {
                progress = `🏆 ${m.trophies_obtained}/${m.trophies_total}`;
            } else {
                progress = `✖️ ${translate('main.dashboard.mediaNotCompleted.notCompleted')}`;
            }
        }
        else if (m.type === 'series' || m.type === 'animations') {
            if (m.episodes_total > 0) {
                progress = `🎞️ ${m.episodes_watched}/${m.episodes_total} eps`;
            } else {
                progress = `🎞️ ${m.seasons_watched}/${m.seasons_total} ${translate('main.dashboard.mediaNotCompleted.seasons')}`;
            }
        }

        return `<li>
                    <div class="media-item-text">
                        <div class="media-line-top">${index + 1}. ${m.title} ${getTypeEmoji(m.type)}</div>
                        <div class="media-line-bottom">
                            📅 ${new Date(m.consumed_date).toLocaleDateString()} 
                            <span class="media-progress">${progress}</span>
                        </div>
                    </div>
                </li>`;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'media-gaps-columns';
    wrapper.innerHTML = `
  <ul>${col1.join('')}</ul>
  <ul>${col2.join('')}</ul>
`;
    gapList.appendChild(wrapper);

    Sortable.create(document.querySelector('.dashboard-grid'), {
        animation: 150,
        ghostClass: 'sortable-ghost',
    });
}

function getTypeEmoji(type) {
    const map = {
        movies: '🎬',
        series: '📺',
        animations: '✨',
        animated_movies: '✨🎬',
        games: '🎮',
        books: '📚',
        mangas: '📖',
        comics: '💥'
    };
    return map[type] || '❔';
}

function createCategoryChart(data, chartType) {
    updateBaseOptions();

    const textColor = getCss('--text-color');
    const borderColor = getCss('--border-color');
    const labels = []; const values = [];
    fixedOrder.forEach(type => {
        const count = data.filter(m => m.type === type).length;
        if (count) {
            labels.push(formatCategoryName(type));
            values.push(count);
        }
    });

    const chartData = {
        labels,
        datasets: [{ data: values, backgroundColor: generatePurpleGradient(labels.length) }]
    };

    const opts = {
        scales: {},
        plugins: {}
    };

    if (chartType === 'bar') {
        opts.scales.x = { stacked: true, grid: { color: borderColor } };
        opts.scales.y = { stacked: true, grid: { color: borderColor } };
    }

    opts.plugins = {
        legend: { display: true },
        tooltip: baseOptions.plugins.tooltip
    };

    updateChart('chart-category', chartType, chartData, opts);
}

function createInteractiveChart(chartId, chartType, labels, values) {
    updateBaseOptions(); // Ensures theme is up to date

    const chartData = {};
    const datasets = [];

    const colors = generatePurpleGradient(labels.length);

    if (chartType === 'bubble') {
        chartData.datasets = labels.map((label, i) => ({
            label,
            data: [{ x: i, y: values[i], r: values[i] }],
            backgroundColor: colors[i]
        }));
    } else {
        chartData.labels = (chartType === 'bar') ? [''] : labels;

        chartData.datasets = labels.map((label, i) => ({
            label,
            data: chartType === 'line'
                ? labels.map((_, j) => (i === j ? values[i] : 0))
                : [values[i]],
            backgroundColor: colors[i],
            borderColor: colors[i],
            fill: chartType === 'line' ? false : undefined,
            tension: chartType === 'line' ? 0.4 : undefined
        }));
    }

    const opts = {
        plugins: {}
    };

    if (chartType === 'bubble') {
        opts.plugins.tooltip = {
            callbacks: {
                title: () => '',
                label: ctx => `${ctx.dataset.label}: ${ctx.raw?.r || 0}`
            }
        };
    }

    if (chartType === 'pie' || chartType === 'doughnut') {
        chartData.labels = labels;
        chartData.datasets = [{
            data: values,
            backgroundColor: colors,
            borderColor: colors
        }];
    }

    // Remove the grid on these charts
    if (chartType === 'pie' || chartType === 'doughnut') {
        opts.scales = { x: { display: false }, y: { display: false } };
    }

    updateChart(chartId, chartType, chartData, opts);
}

// Creates a deep merge between objects
function deepMerge(target, source) {
    for (const key in source) {
        const src = source[key];
        if (src && typeof src === 'object' && !Array.isArray(src)) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], src);
        } else {
            target[key] = src;
        }
    }
    return target;
}

// ============================
// Update Chart Function
// ============================

// Graph update function using deep merge
function updateChart(chartId, type, data, options = {}) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) return;

    if (charts[chartId]) charts[chartId].destroy();

    const mergedOpts = deepMerge(
        JSON.parse(JSON.stringify(baseOptions)), //Copy baseOptions
        options
    );

    charts[chartId] = new Chart(ctx, { type, data, options: mergedOpts });
}

// ============================
// Favorite Media Modal Setup
// ============================
const favKey = 'favoriteMediaId';
const btnOpenModal = document.getElementById('select-favorite-btn');
const modal = document.getElementById('favorite-modal');
const selectCategory = document.getElementById('favorite-category-select');
const selectMedia = document.getElementById('favorite-media-select');
const btnSave = document.getElementById('save-favorite-btn');
const btnCancel = document.getElementById('cancel-favorite-btn');

document.getElementById('save-favorite-btn').addEventListener('click', () => {
    const mediaId = document.getElementById('favorite-media-select').value;
    if (!mediaId) return;

    localStorage.setItem('favoriteMediaId', mediaId);
    updateFavoriteModule(); // Update the module on the dashboard

    document.getElementById('favorite-modal').classList.add('hidden'); // Close the modal
});

// Open the modal
btnOpenModal.addEventListener('click', async () => {
    if (Object.keys(translations).length === 0) {
        const lang = localStorage.getItem("language") || "en";
        await loadTranslations(lang);
    }
    openFavoriteModal();
});


btnCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
    resetFavoriteModal();
});

btnSave.addEventListener('click', () => {
    const selectedId = selectMedia.value;
    if (selectedId) {
        localStorage.setItem(favKey, selectedId);
        modal.classList.add('hidden');
        resetFavoriteModal();
        populateDashboard(globalMedias); // Update the dashboard
    }
});

function resetFavoriteModal() {
    selectCategory.innerHTML = '';
    selectMedia.innerHTML = '';
    selectMedia.disabled = true;
    btnSave.disabled = true;
}

function openFavoriteModal() {
    modal.classList.remove('hidden');
    resetFavoriteModal();

    // Keep same ordering used on the rest of the project
    const desiredOrder = [
        'movies',
        'series',
        'animations',
        'animated_movies',
        'games',
        'books',
        'mangas',
        'comics'
    ];

    const activeTypes = getActiveMediaTypes();
    const sortedTypes = desiredOrder.filter(type => activeTypes.includes(type));

    const options = sortedTypes
        .map(t => `<option value="${t}">${formatCategoryName(t)}</option>`)
        .join('');

    const placeholder =
        translations?.main?.modals?.chooseFavoriteMedia?.selectCategory ||
        translations?.modals?.chooseFavoriteMedia?.selectCategory ||
        'Select...';

    selectCategory.innerHTML = `<option value="" disabled selected>${placeholder}</option>${options}`;

}

selectCategory.addEventListener('change', () => {
    const selectedType = selectCategory.value;
    const filtered = globalMedias
        .filter(m => m.type === selectedType)
        .sort((a, b) => a.title.localeCompare(b.title));

    if (filtered.length === 0) {
        const noMediaText =
            translations?.main?.modals?.chooseFavoriteMedia?.noMedia || 'No media available';
        selectMedia.innerHTML = `<option>${noMediaText}</option>`;
        selectMedia.disabled = true;
        btnSave.disabled = true;
        return;
    }

    const mediaPlaceholder =
        translations?.main?.modals?.chooseFavoriteMedia?.selectMedia || 'Select media';

    const mediaOptions = filtered
        .map(m => `<option value="${m.id}">${m.title}</option>`)
        .join('');

    selectMedia.innerHTML = `<option value="" disabled selected>${mediaPlaceholder}</option>${mediaOptions}`;
    selectMedia.disabled = false;
    btnSave.disabled = true;
});

selectMedia.addEventListener('change', () => {
    btnSave.disabled = false;
});

function updateFavoriteModule() {
    const favMediaId = localStorage.getItem(favKey);
    const favContainer = document.getElementById('favorite-media-content');
    favContainer.innerHTML = '';

    if (favMediaId) {
        const media = globalMedias.find(m => String(m.id) === favMediaId);
        if (media) {
            favContainer.innerHTML = `
                <div class="favorite-media-box">
                    <div class="favorite-media-text">
                        <strong>${media.title}</strong><br>
                        <span>⭐ ${media.rating ?? 'N/A'}</span><br>
                        <small>${formatCategoryName(media.type)}</small>
                    </div>
                </div>
            `;
        } else {
            const notFoundText = translations?.main?.modals?.chooseFavoriteMedia?.notFound || 'Favorite media not found.';
            favContainer.innerHTML = `<p>${notFoundText}</p>`;
        }
    } else {
        const notSelectedText = translations?.main?.modals?.chooseFavoriteMedia?.notSelected || 'No favorite selected';
        favContainer.innerHTML = `<p>${notSelectedText}</p>`;
    }
}

// Close Favorite Modal when clicking outside the modal content
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.add('hidden');
        resetFavoriteModal();
    }
});

// ============================
// Dashboard Header
// ============================

// Save & Reset Logic
const layoutKey = 'dashboardLayout';

function showSaveTooltip() {
    const btn = document.getElementById('save-dashboard-layout-btn');

    let tooltip = btn.querySelector('.save-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('span');
        tooltip.className = 'save-tooltip';
        tooltip.textContent = 'Layout saved!';
        btn.appendChild(tooltip);
    }

    tooltip.classList.add('show');

    // Removes tooltip after 2 seconds
    setTimeout(() => {
        tooltip.classList.remove('show');
    }, 2000);
}

function saveLayout() {
    const cards = Array.from(document.querySelectorAll('.dashboard-grid .dashboard-card'));
    const layout = cards.map(card => card.getAttribute('data-id'));
    localStorage.setItem('dashboardLayout', JSON.stringify(layout));

    // Show tooltip without alert
    showSaveTooltip();
}

document.getElementById('save-dashboard-layout-btn').addEventListener('click', saveLayout);

function loadLayout() {
    const savedLayout = JSON.parse(localStorage.getItem(layoutKey));
    if (!savedLayout || !Array.isArray(savedLayout)) return;

    const container = document.querySelector('.dashboard-grid');
    const cardMap = {};

    document.querySelectorAll('.dashboard-grid .dashboard-card').forEach(card => {
        const id = card.getAttribute('data-id');
        cardMap[id] = card;
    });

    container.innerHTML = '';

    savedLayout.forEach(id => {
        if (cardMap[id]) {
            container.appendChild(cardMap[id]);
        }
    });

    Object.keys(cardMap).forEach(id => {
        if (!savedLayout.includes(id)) {
            container.appendChild(cardMap[id]);
        }
    });
}

function resetLayout() {
    localStorage.removeItem(layoutKey);
    location.reload();
}

// Dashboard Button Event Listeners
document.getElementById('save-dashboard-layout-btn').addEventListener('click', saveLayout);
document.getElementById('reset-dashboard-layout-btn').addEventListener('click', resetLayout);

// When loading the page (or dashboard)
document.addEventListener('DOMContentLoaded', loadLayout);

// ============================
// Translations
// ============================

let translations = {};

async function loadTranslations(lang) {
    try {
        const fileLang = lang === "pt" ? "ptbr" : lang;  // map 'pt' -> 'ptbr'
        const response = await fetch(`data/lang/lang-${fileLang}.json`);
        translations = await response.json();
        applyTranslations();
    } catch (error) {
        console.error("Failed to load translations:", error);
    }
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = getNestedTranslation(key, translations);

        if (translation) {
            el.textContent = translation;
        } else {
            console.warn(`Missing translation for key: ${key}`);//3457
        }
    });

    // Translate titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translation = getNestedTranslation(key, translations);

        if (translation) {
            el.title = translation;
        } else {
            console.warn(`Missing title translation for key: ${key}`);
        }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translation = getNestedTranslation(key, translations);

        if (translation) {
            el.placeholder = translation;
        } else {
            console.warn(`Missing placeholder translation for key: ${key}`);
        }
    });

    // Update dynamic content like results count AFTER translations are applied
    updateResultsCount(currentMedias?.length || 0);

    // To ensure updated translation after language change on Convert Button (Time Spent Estimate Module - Dashboard)
    updateConvertButtonText();
}

function getNestedTranslation(key, obj) {
    return key.split('.').reduce((o, k) => (o || {})[k], obj);
}

// Function to show alerts or confirms with translated text, only call after translations loaded
function alertSelectOne() {
    alert(translations.settings.alertSelectOne || "Please select at least one option.");
}

function confirmReset() {
    return confirm(translations.settings.resetConfirm || "Are you sure you want to reset?");
}

// On page load, load saved language or default and apply translations
window.addEventListener("DOMContentLoaded", async () => {
    const lang = localStorage.getItem("language") || "en";
    document.getElementById("language-select").value = lang;
    await loadTranslations(lang); // Wait for translations to load
});

// ============================
// End
// ============================