const API_BASE = "https://studytube-curator-vercel-j19d934dg-rbz1984s-projects.vercel.app/api/curate";
let currentIntent = "Concept Understanding";
let currentTimeFilter = "all_time";
let lastCurationKey = "";
let isFetching = false;

// ----------------------------------------------------------------
// UI INJECTION LOGIC
// ----------------------------------------------------------------

function injectPanel() {
    if (!window.location.pathname.includes('/results')) return;

    // Check if panel already exists in the DOM
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
                    <span class="st-loading-spinner">↺</span> Curating best results for your session...
                </div>
            </div>
        </div>
    `;

    // High-reliability search target
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

        performCuration(true);
    });
}

// ----------------------------------------------------------------
// DATA FETCHING
// ----------------------------------------------------------------

async function performCuration(force = false) {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search_query');
    if (!query || isFetching) return;

    const curationKey = query + currentIntent + currentTimeFilter;
    if (!force && curationKey === lastCurationKey) return;

    isFetching = true;
    lastCurationKey = curationKey;

    const grid = $('#st-results-grid');
    grid.html('<div class="st-loading-state"><span class="st-loading-spinner">↺</span> Curating best results...</div>');

    try {
        const payload = { query, intent: currentIntent, timeFilter: currentTimeFilter };

        // Use GET with AbortController for better reliability on Vercel Free
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const response = await fetch(`${API_BASE}?query=${encodeURIComponent(query)}&intent=${encodeURIComponent(currentIntent)}&timeFilter=${currentTimeFilter}`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("API Error");

        const videos = await response.json();
        renderCards(videos);
    } catch (error) {
        console.error("StudyTube Error:", error);
        // Only show error if the panel is still in DOM
        if ($('#studytube-curator-panel').length) {
            grid.html('<div class="st-error-state">⚠️ Failed to load curated results. Trying to reconnect...</div>');
            // Subtle retry
            setTimeout(() => performCuration(true), 3000);
        }
    } finally {
        isFetching = false;
    }
}

function renderCards(videos) {
    const grid = $('#st-results-grid');
    grid.empty();

    if (!Array.isArray(videos) || videos.length === 0) {
        grid.html('<div class="st-no-results">No curated educational videos found for this specific topic.</div>');
        return;
    }

    videos.forEach((video, i) => {
        const cardHtml = `
            <a href="/watch?v=${video.videoId}" class="st-video-card ${video.isTopMatch ? 'top-match' : ''}">
                <div class="st-thumb-container">
                    <img src="${video.thumbnail}" class="st-thumb" loading="lazy">
                    <span class="st-duration">${video.duration}</span>
                </div>
                <div class="st-details">
                    <div class="st-badges">
                        ${video.label ? `<span class="st-badge st-badge-primary">${video.label}</span>` : ''}
                        ${video.isNew ? `<span class="st-badge st-badge-secondary">🆕 Updated</span>` : ''}
                    </div>
                    <div class="st-video-title" title="${video.title}">${video.title}</div>
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

// ----------------------------------------------------------------
// ONBOARDING
// ----------------------------------------------------------------

function checkOnboarding() {
    chrome.storage.local.get(['onboardingCompleted'], function (result) {
        if (!result.onboardingCompleted) {
            setTimeout(showTooltips, 2000);
        }
    });
}

function showTooltips() {
    if ($('.st-tooltip').length) return;

    const tooltips = [
        { el: '#st-intent-group', text: "Choose your study goal: Revision, Understanding, or Deep Study.", pos: 'bottom' },
        { el: '#st-freshness-group', text: "Prioritize recently updated content.", pos: 'bottom' }
    ];

    tooltips.forEach((t) => {
        const target = $(t.el);
        if (target.length) {
            const offset = target.offset();
            const tt = $(`
                <div class="st-tooltip">
                    ${t.text}
                    <button class="st-tt-close">Got it</button>
                </div>
            `);
            $('body').append(tt);
            tt.css({ top: offset.top + target.outerHeight() + 10, left: offset.left });
            tt.find('.st-tt-close').click(() => {
                tt.fadeOut(200, () => {
                    tt.remove();
                    if ($('.st-tooltip').length === 0) chrome.storage.local.set({ onboardingCompleted: true });
                });
            });
        }
    });
}

// ----------------------------------------------------------------
// YOUTUBE NAVIGATION TRACKING
// ----------------------------------------------------------------

// yt-navigate-finish is the official YouTube SPA navigation event
document.addEventListener('yt-navigate-finish', () => {
    if (window.location.pathname === '/results') {
        // Clear panel to force fresh injection
        $('#studytube-curator-panel').remove();
        setTimeout(injectPanel, 1000);
    }
});

// Initial startup
$(document).ready(() => {
    if (window.location.pathname === '/results') {
        setTimeout(injectPanel, 1500);
    }
});
