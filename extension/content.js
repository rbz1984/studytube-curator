const API_BASE = "https://studytube-curator-vercel-j19d934dg-rbz1984s-projects.vercel.app/api/curate";
let currentIntent = "Concept Understanding";
let currentTimeFilter = "all_time";
let isFetching = false;

// ----------------------------------------------------------------
// UI INJECTION LOGIC
// ----------------------------------------------------------------

function injectPanel() {
    if (!window.location.pathname.includes('/results')) return;
    if (document.getElementById('studytube-curator-panel')) return;

    const panelHtml = `
        <div id="studytube-curator-panel" style="display:none; margin-bottom: 20px;">
            <div class="st-header">
                <div class="st-title-wrap">
                    <h2>🎓 StudyTube Curated Results</h2>
                    <div class="st-subtitle">Best explanations for learning • Curated to save you study time</div>
                </div>
            </div>

            <div class="st-controls">
                <div class="st-control-group" id="st-intent-group">
                    <span class="st-control-label">Study Intent:</span>
                    <div class="st-pill-container">
                        <div class="st-pill ${currentIntent === 'Quick Revision' ? 'active' : ''}" data-type="intent" data-value="Quick Revision">⚡ Revision</div>
                        <div class="st-pill ${currentIntent === 'Concept Understanding' ? 'active' : ''}" data-type="intent" data-value="Concept Understanding">🧠 Understanding</div>
                        <div class="st-pill ${currentIntent === 'Deep Study' ? 'active' : ''}" data-type="intent" data-value="Deep Study">📚 Deep Study</div>
                    </div>
                </div>

                <div class="st-control-group" id="st-freshness-group">
                    <span class="st-control-label">Freshness:</span>
                    <div class="st-pill-container">
                        <div class="st-pill ${currentTimeFilter === 'all_time' ? 'active' : ''}" data-type="time" data-value="all_time">All Time</div>
                        <div class="st-pill ${currentTimeFilter === 'this_week' ? 'active' : ''}" data-type="time" data-value="this_week">Week</div>
                        <div class="st-pill ${currentTimeFilter === 'this_month' ? 'active' : ''}" data-type="time" data-value="this_month">Month</div>
                    </div>
                </div>
            </div>

            <div id="st-results-grid">
                <div class="st-loading-state">
                    <span class="st-loading-spinner">↺</span> Curating best results...
                </div>
            </div>
        </div>
    `;

    const searchTarget = document.querySelector('ytd-search #contents.ytd-section-list-renderer, #primary #contents, ytd-search #primary-items');

    if (searchTarget) {
        $(searchTarget).prepend(panelHtml);
        $('#studytube-curator-panel').slideDown(300);
        attachEvents();
        checkOnboarding();
        performCuration();
    }
}

function attachEvents() {
    $('.st-pill').off('click').on('click', function () {
        if (isFetching) return;
        const type = $(this).data('type');
        const val = $(this).data('value');

        if (type === 'intent') currentIntent = val;
        else currentTimeFilter = val;

        $(this).siblings().removeClass('active');
        $(this).addClass('active');

        performCuration();
    });
}

// ----------------------------------------------------------------
// DATA FETCHING
// ----------------------------------------------------------------

async function performCuration() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search_query');
    if (!query || isFetching) return;

    isFetching = true;
    const grid = $('#st-results-grid');
    grid.html('<div class="st-loading-state"><span class="st-loading-spinner">↺</span> Curating best results...</div>');

    const url = `${API_BASE}?query=${encodeURIComponent(query)}&intent=${encodeURIComponent(currentIntent)}&timeFilter=${currentTimeFilter}`;
    console.log("StudyTube: Fetching from", url);

    try {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const videos = await response.json();
        renderCards(videos);
    } catch (error) {
        console.error("StudyTube Extension Error:", error);
        grid.html(`<div class="st-error-state">⚠️ Failed to connect to curator. Please refresh or check your connection.</div>`);
    } finally {
        isFetching = false;
    }
}

function renderCards(videos) {
    const grid = $('#st-results-grid');
    grid.empty();

    if (!Array.isArray(videos) || videos.length === 0) {
        grid.html('<div class="st-no-results">No high-quality educational videos found for this topic.</div>');
        return;
    }

    videos.forEach((video) => {
        const cardHtml = `
            <a href="/watch?v=${video.videoId}" class="st-video-card ${video.isTopMatch ? 'top-match' : ''}">
                <div class="st-thumb-container">
                    <img src="${video.thumbnail}" class="st-thumb">
                    <span class="st-duration">${video.duration}</span>
                </div>
                <div class="st-details">
                    <div class="st-badges">
                        ${video.label ? `<span class="st-badge st-badge-primary">${video.label}</span>` : ''}
                        ${video.isNew ? `<span class="st-badge st-badge-secondary">🆕 Updated</span>` : ''}
                    </div>
                    <div class="st-video-title">${video.title}</div>
                    <div class="st-meta">${video.channel} • Published ${video.publishedYear}</div>
                    <div class="st-confidence">✓ ${video.confidenceSignal}</div>
                    ${video.contrastLine ? `<div class="st-contrast">ℹ ${video.contrastLine}</div>` : ''}
                    <div class="st-note">
                        <strong>Curator's Note:</strong><br>
                        ${video.explanation}
                    </div>
                    ${video.isTopMatch ? '<div class="st-start-here">▶ Start Here</div>' : ''}
                </div>
            </a>
        `;
        grid.append(cardHtml);
    });
}

function checkOnboarding() {
    chrome.storage.local.get(['onboardingCompleted'], function (result) {
        if (!result.onboardingCompleted) {
            setTimeout(showTooltips, 1500);
        }
    });
}

function showTooltips() {
    if ($('.st-tooltip').length) return;
    const tooltips = [
        { el: '#st-intent-group', text: "Choose your study goal: Revision, Understanding, or Deep Study." },
        { el: '#st-freshness-group', text: "Prioritize recently updated content." }
    ];
    tooltips.forEach((t) => {
        const target = $(t.el);
        if (target.length) {
            const offset = target.offset();
            const tt = $(`<div class="st-tooltip">${t.text}<button class="st-tt-close">Got it</button></div>`);
            $('body').append(tt);
            tt.css({ top: offset.top + target.outerHeight() + 10, left: offset.left });
            tt.find('.st-tt-close').click(() => {
                tt.remove();
                if ($('.st-tooltip').length === 0) chrome.storage.local.set({ onboardingCompleted: true });
            });
        }
    });
}

document.addEventListener('yt-navigate-finish', () => {
    if (window.location.pathname === '/results') {
        const p = document.getElementById('studytube-curator-panel');
        if (p) p.remove();
        setTimeout(injectPanel, 1000);
    }
});

$(document).ready(() => {
    if (window.location.pathname === '/results') setTimeout(injectPanel, 1500);
});
