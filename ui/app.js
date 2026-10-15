
const $ = (id) => document.getElementById(id);
const audio = $("audio");

const GENRES = [
    "blues",
    "classical",
    "country",
    "disco",
    "hiphop",
    "jazz",
    "metal",
    "pop",
    "reggae",
    "rock"
];

let songs = [];
let view = "library";
let current = null;
let genreFilter = "all";
let shuffle = false;
let repeat = false;
let apiReady = false;
let busy = false;
let toastTimer = null;

function normalizeGenre(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");
}

function genreName(value) {
    const genre = normalizeGenre(value);
    const names = {
        hiphop: "Hip Hop",
        classical: "Classical",
        country: "Country",
        reggae: "Reggae",
        blues: "Blues",
        disco: "Disco",
        jazz: "Jazz",
        metal: "Metal",
        pop: "Pop",
        rock: "Rock"
    };

    return names[genre] || "Unclassified";
}

function getGenre(song) {
    if (!song || !song.genre) return "";

    if (typeof song.genre === "string") {
        return song.genre;
    }

    if (typeof song.genre === "object") {
        return song.genre.genre || "";
    }

    return "";
}

function getConfidence(song) {
    if (!song || !song.genre || typeof song.genre !== "object") {
        return null;
    }

    const value = Number(song.genre.confidence);
    return Number.isFinite(value) ? value : null;
}

function formatTime(seconds) {
    const value = Number(seconds);

    if (!Number.isFinite(value) || value < 0) {
        return "0:00";
    }

    const mins = Math.floor(value / 60);
    const secs = Math.floor(value % 60);

    return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatDate(timestamp) {
    if (!timestamp) return "—";

    const date = new Date(Number(timestamp) * 1000);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function notify(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("visible");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

function getApi() {
    if (!window.pywebview || !window.pywebview.api) {
        return null;
    }

    return window.pywebview.api;
}

function updateButtons() {
    $("analyzeBtn").disabled = !apiReady || !current || busy;
    $("addBtn").disabled = !apiReady || busy;
    $("playBtn").disabled = !current;
    $("prevBtn").disabled = songs.length === 0;
    $("nextBtn").disabled = songs.length === 0;

    $("playBtn").textContent = audio.paused ? "▶" : "Ⅱ";
    $("playBtn").title = audio.paused ? "Play" : "Pause";

    $("shuffleBtn").classList.toggle("active", shuffle);
    $("repeatBtn").classList.toggle("active", repeat);
}

function updateStats() {
    $("totalTracks").textContent = songs.length;
    $("playedTracks").textContent = songs.filter(song => song.played).length;
    $("classifiedTracks").textContent = songs.filter(song => getGenre(song)).length;

    GENRES.forEach(genre => {
        const count = songs.filter(song =>
            normalizeGenre(getGenre(song)) === genre
        ).length;

        const element = $(`count-${genre}`);

        if (element) {
            element.textContent = `${count} ${count === 1 ? "track" : "tracks"}`;
        }
    });
}

function getVisibleSongs() {
    const query = $("searchInput").value.trim().toLowerCase();

    let result = [...songs];

    if (view === "played") {
        result = result.filter(song => song.played);
        result.sort((a, b) => Number(b.played || 0) - Number(a.played || 0));
    } else if (view === "added") {
        result.sort((a, b) => Number(b.added || 0) - Number(a.added || 0));
    } else {
        result.sort((a, b) =>
            String(a.title || "").localeCompare(String(b.title || ""))
        );
    }

    if (genreFilter !== "all") {
        result = result.filter(song =>
            normalizeGenre(getGenre(song)) === genreFilter
        );
    }

    if (query) {
        result = result.filter(song => {
            const title = String(song.title || "").toLowerCase();
            const artist = String(song.artist || "").toLowerCase();
            const genre = genreName(getGenre(song)).toLowerCase();

            return title.includes(query) ||
                artist.includes(query) ||
                genre.includes(query);
        });
    }

    return result;
}

function updatePageHeading() {
    const titles = {
        library: ["My Library", "Your Music", "Every track in one place. Discover the sound behind your songs."],
        played: ["Recently Played", "Your Listening History", "Return to the tracks you've listened to."],
        added: ["Recently Added", "Fresh Additions", "Your newest tracks, ready to play."]
    };

    const info = titles[view] || titles.library;

    $("breadcrumbTitle").textContent = info[0];
    $("pageTitle").innerHTML = `${escapeHTML(info[1])}<span class="title-period">.</span>`;
    $("pageDescription").textContent = info[2];

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.remove("active");
    });

    const navId = {
        library: "libBtn",
        played: "recentBtn",
        added: "addedBtn"
    }[view];

    if (navId) {
        $(navId).classList.add("active");
    }

    document.querySelectorAll(".genre-nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.genre === genreFilter
        );
    });
}

function render() {
    updateStats();
    updatePageHeading();

    const visible = getVisibleSongs();
    const list = $("list");

    $("listCount").textContent = visible.length;

    const headings = {
        library: "All tracks",
        played: "Recently played",
        added: "Recently added"
    };

    let heading = headings[view] || "All tracks";

    if (genreFilter !== "all") {
        heading = genreName(genreFilter);
    }

    $("listTitle").innerHTML =
        `${escapeHTML(heading)} <span class="heading-count" id="listCount">${visible.length}</span>`;

    if (!visible.length) {
        let message = "Add your first songs to start building your music collection.";

        if (songs.length && $("searchInput").value.trim()) {
            message = "Try another title, artist, or genre.";
        } else if (view === "played") {
            message = "Songs you play will appear here.";
        } else if (genreFilter !== "all") {
            message = `No classified ${genreName(genreFilter)} tracks yet.`;
        }

        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">♫</div>
                <h3>${songs.length ? "No matching tracks" : "Your library is waiting"}</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;

        return;
    }

    list.innerHTML = visible.map((song, index) => {
        const playing = current && current.id === song.id;
        const genre = getGenre(song);
        const duration = song.duration ? formatTime(song.duration) : "—";

        return `
            <div class="track-row ${playing ? "is-playing" : ""}" data-id="${escapeHTML(song.id)}">
                <div class="track-index">${playing && !audio.paused ? "♫" : index + 1}</div>
                <div class="track-main">
                    <div class="track-art">${playing && !audio.paused ? "♫" : "♪"}</div>
                    <div class="track-copy">
                        <div class="track-title" title="${escapeHTML(song.title || "Unknown title")}">${escapeHTML(song.title || "Unknown title")}</div>
                        <div class="track-artist">${escapeHTML(song.artist || "Unknown artist")}</div>
                    </div>
                </div>
                <div class="track-genre"><span class="genre-pill">${escapeHTML(genreName(genre))}</span></div>
                <div class="track-date">${escapeHTML(formatDate(song.added))}</div>
                <div class="track-duration">${escapeHTML(duration)}</div>
                <div class="track-actions">
                    <button class="track-play" data-action="play" data-id="${escapeHTML(song.id)}" title="Play track" aria-label="Play track">▶</button>
                    <button class="track-remove" data-action="remove" data-id="${escapeHTML(song.id)}" title="Remove from library" aria-label="Remove from library">×</button>
                </div>
            </div>
        `;
    }).join("");
}

function clearResult() {
    $("resultTitle").textContent = "Discover your song's genre";
    $("resultText").textContent = "Select a track and choose Analyze Genre to see the classification result.";
    $("resultConfidence").textContent = "—";
    $("resultTempo").textContent = "—";
}

function showResult(song) {
    if (!song || !song.genre) {
        clearResult();
        return;
    }

    const result = typeof song.genre === "object"
        ? song.genre
        : { genre: song.genre };

    $("resultTitle").textContent = genreName(result.genre);
    $("resultText").textContent = result.method
        ? `${result.method}${result.top && result.top.length ? ` · Top results: ${result.top.map(item => `${genreName(item[0])} ${item[1]}%`).join(", ")}` : ""}`
        : "This track has a saved genre label.";

    $("resultConfidence").textContent =
        Number.isFinite(Number(result.confidence))
            ? `${Number(result.confidence).toFixed(1)}%`
            : "—";

    $("resultTempo").textContent =
        Number.isFinite(Number(result.tempo))
            ? `${Math.round(Number(result.tempo))} BPM`
            : "—";
}

function updatePlayerInfo(song) {
    $("nowTitle").textContent = song ? song.title || "Unknown title" : "No song selected";
    $("nowArtist").textContent = song ? song.artist || "Unknown artist" : "Choose a track to begin";
    $("playerArt").textContent = song ? "♫" : "♪";

    showResult(song);
    updateButtons();
}

async function refreshSongs() {
    const api = getApi();

    if (!api) return;

    try {
        const result = await api.list_songs();

        if (Array.isArray(result)) {
            songs = result;

            if (current) {
                current = songs.find(song => song.id === current.id) || current;
            }

            render();
            updatePlayerInfo(current);
        }
    } catch (error) {
        notify(`Unable to load your library: ${error.message || error}`);
    }
}

async function play(song) {
    if (!song || !song.url) {
        notify("This track does not have a playable audio URL.");
        return;
    }

    if (current && current.id === song.id && !audio.paused) {
        audio.pause();
        updateButtons();
        render();
        return;
    }

    current = song;
    audio.src = song.url;
    audio.load();

    updatePlayerInfo(song);
    render();

    try {
        await audio.play();

        const api = getApi();

        if (api) {
            await api.mark_played(song.id);
        }

        song.played = Date.now() / 1000;
        updateStats();
        updateButtons();
        render();
    } catch (error) {
        notify("Playback could not start. Check that the audio file is supported.");
        updateButtons();
    }
}

function step(direction) {
    if (!songs.length) return;

    if (direction < 0 && current && audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    let index = songs.findIndex(song =>
        current && song.id === current.id
    );

    if (index < 0) {
        index = direction > 0 ? -1 : 0;
    }

    let nextIndex;

    if (shuffle && songs.length > 1) {
        const choices = songs.filter(song => !current || song.id !== current.id);
        const selected = choices[Math.floor(Math.random() * choices.length)];
        play(selected);
        return;
    }

    nextIndex = (index + direction + songs.length) % songs.length;
    play(songs[nextIndex]);
}

async function addSongs() {
    const api = getApi();

    if (!api || busy) return;

    busy = true;
    updateButtons();

    try {
        const result = await api.add_songs();

        if (Array.isArray(result)) {
            songs = result;
        }

        render();
        updateStats();
        notify("Your library has been updated.");
    } catch (error) {
        notify(`Unable to add music: ${error.message || error}`);
    } finally {
        busy = false;
        updateButtons();
    }
}

async function removeSong(id) {
    const song = songs.find(item => item.id === id);

    if (!song) return;

    const accepted = window.confirm(
        `Remove "${song.title || "this track"}" from your Neon Music Player library?\n\nThis action should remove the library entry only.`
    );

    if (!accepted) return;

    const api = getApi();

    if (!api) return;

    try {
        const result = await api.delete_song(id);

        if (Array.isArray(result)) {
            songs = result;
        } else {
            songs = songs.filter(item => item.id !== id);
        }

        if (current && current.id === id) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            current = null;
            updatePlayerInfo(null);
        }

        render();
        notify("Track removed from your library.");
    } catch (error) {
        notify(`Unable to remove track: ${error.message || error}`);
    }
}

async function analyze() {
    const api = getApi();

    if (!api || !current || busy) return;

    busy = true;
    updateButtons();

    $("resultTitle").textContent = "Analyzing audio...";
    $("resultText").textContent = "Extracting audio features and classifying the genre.";
    $("resultConfidence").textContent = "…";
    $("resultTempo").textContent = "…";

    try {
        const result = await api.classify_song(current.id);

        if (!result || result.error) {
            throw new Error(result && result.error ? result.error : "Classification failed.");
        }

        current.genre = result;

        const index = songs.findIndex(song => song.id === current.id);

        if (index >= 0) {
            songs[index].genre = result;
        }

        showResult(current);
        render();
        notify(`Genre identified: ${genreName(result.genre)}.`);
    } catch (error) {
        $("resultTitle").textContent = "Analysis failed";
        $("resultText").textContent = error.message || "Unable to classify this track.";
        $("resultConfidence").textContent = "—";
        $("resultTempo").textContent = "—";
        notify("The genre analysis could not be completed.");
    } finally {
        busy = false;
        updateButtons();
    }
}

function setView(nextView) {
    view = nextView;
    genreFilter = "all";
    $("searchInput").value = "";
    render();
}

function setGenre(genre) {
    genreFilter = genre;
    view = "library";
    render();

    $("list").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

$("libBtn").addEventListener("click", () => setView("library"));
$("recentBtn").addEventListener("click", () => setView("played"));
$("addedBtn").addEventListener("click", () => setView("added"));
$("addBtn").addEventListener("click", addSongs);
$("analyzeBtn").addEventListener("click", analyze);

$("allGenresBtn").addEventListener("click", () => {
    setGenre("all");
});

$("searchInput").addEventListener("input", render);

document.querySelectorAll("[data-genre]").forEach(button => {
    button.addEventListener("click", () => {
        setGenre(button.dataset.genre);
    });
});

$("shuffleAll").addEventListener("click", () => {
    if (!songs.length) {
        notify("Add some music first.");
        return;
    }

    shuffle = true;
    updateButtons();

    const selected = songs[Math.floor(Math.random() * songs.length)];
    play(selected);
});

$("shuffleBtn").addEventListener("click", () => {
    shuffle = !shuffle;
    updateButtons();
    notify(shuffle ? "Shuffle enabled." : "Shuffle disabled.");
});

$("repeatBtn").addEventListener("click", () => {
    repeat = !repeat;
    audio.loop = repeat;
    updateButtons();
    notify(repeat ? "Repeat enabled." : "Repeat disabled.");
});

$("playBtn").addEventListener("click", () => {
    if (!current) {
        const visible = getVisibleSongs();

        if (visible.length) {
            play(visible[0]);
        } else if (songs.length) {
            play(songs[0]);
        }

        return;
    }

    if (audio.paused) {
        audio.play().catch(() => {
            notify("Playback could not start.");
        });
    } else {
        audio.pause();
    }
});

$("prevBtn").addEventListener("click", () => step(-1));
$("nextBtn").addEventListener("click", () => step(1));

$("list").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (button) {
        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "play") {
            const song = songs.find(item => item.id === id);

            if (song) play(song);
        } else if (action === "remove") {
            removeSong(id);
        }

        return;
    }

    const row = event.target.closest(".track-row");

    if (row) {
        const song = songs.find(item => item.id === row.dataset.id);

        if (song) play(song);
    }
});

audio.addEventListener("play", () => {
    updateButtons();
    render();
});

audio.addEventListener("pause", () => {
    updateButtons();
    render();
});

audio.addEventListener("loadedmetadata", () => {
    $("duration").textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
    $("currentTime").textContent = formatTime(audio.currentTime);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        $("seek").value = (audio.currentTime / audio.duration) * 100;
        $("duration").textContent = formatTime(audio.duration);
    }
});

$("seek").addEventListener("input", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = (Number($("seek").value) / 100) * audio.duration;
    }
});

$("volume").addEventListener("input", () => {
    audio.volume = Number($("volume").value);
});

audio.volume = Number($("volume").value);

audio.addEventListener("ended", () => {
    if (!repeat) {
        step(1);
    }
});

audio.addEventListener("error", () => {
    if (current) {
        notify("This audio file could not be played.");
    }
});

window.addEventListener("pywebviewready", async () => {
    apiReady = true;
    updateButtons();
    await refreshSongs();
});

document.addEventListener("DOMContentLoaded", () => {
    render();
    updateButtons();
});

if (getApi()) {
    apiReady = true;
    refreshSongs();
}

updateButtons();