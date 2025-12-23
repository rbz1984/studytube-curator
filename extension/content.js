const API_BASE = "https://studytube-curator-vercel-j19d934dg-rbz1984s-projects.vercel.app/api/curate";
let currentIntent = "Concept Understanding";
let currentTimeFilter = "all_time";
let lastQuery = "";

// ----------------------------------------------------------------
// UI INJECTION LOGIC
// ----------------------------------------------------------------

function injectPanel() {
    if ($('#studytube-curator-panel').length) return;

    const panelHtml = `
        <div id="studytube-curator-panel">
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
                <div style="text-align:center; padding: 40px; color: #64748b;">
                    <span class="st-loading-spinner">↺</span> Curating best results...
                </div>
            </div>
        </div>
    `;

    // Target the YouTube results contents
    const target = $('ytd-search #contents.ytd-section-list-renderer').first();
    if (target.length) {
        target.prepend(panelHtml);
        attachEvents();
        checkOnboarding();
        performCuration();
    }
}

function attachEvents() {
    $('.st-pill').on('click', function () {
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
    if (!query) return;

    if (query === lastQuery && $('#studytube-curator-panel').length > 0) {
        // Already loaded for this query
        return;
    }
    lastQuery = query;

    $('#st-results-grid').html('<div style="text-align:center; padding: 40px; color: #64748b;">Curating best results...</div>');

    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                intent: currentIntent,
                timeFilter: currentTimeFilter
            })
        });

        const videos = await response.json();
        renderCards(videos);
    } catch (error) {
        console.error("StudyTube Extension Error:", error);
        $('#st-results-grid').html('<div style="text-align:center; padding: 20px; color: #ef4444;">Failed to load curated results. Check your API endpoint.</div>');
    }
}

function renderCards(videos) {
    const grid = $('#st-results-grid');
    grid.empty();

    if (!Array.isArray(videos) || videos.length === 0) {
        grid.html('<div style="text-align:center; padding: 20px; color: #64748b;">No curated results found for this study intent.</div>');
        return;
    }

    videos.forEach((video, i) => {
        const cardHtml = `
            <a href="/watch?v=${video.videoId}" class="st-video-card ${video.isTopMatch ? 'top-match' : ''}">
                <div class="st-thumb-container">
                    <img src="${video.thumbnail}" class="st-thumb">
                    <span class="st-duration">${video.durationFormatted}</span>
                </div>
                <div class="st-details">
                    <div class="st-badges">
                        ${video.label ? `<span class="st-badge st-badge-primary">${video.label}</span>` : ''}
                        ${video.isNew ? `<span class="st-badge st-badge-secondary">🆕 Updated</span>` : ''}
                    </div>
                    <div class="st-video-title">${video.title}</div>
                    <div class="st-meta">${video.channel} • ${video.publishedYear}</div>
                    <div class="st-confidence">✓ ${video.confidenceSignal}</div>
                    ${video.contrastLine ? `<div class="st-contrast">ℹ ${video.contrastLine}</div>` : ''}
                    <div class="st-note">
                        <strong>Curator's Note:</strong><br>
                        ${video.explanation.split('\n• ').slice(1).join('<br>• ')}
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
            showTooltips();
        }
    });
}

function showTooltips() {
    const tooltips = [
        { el: '#st-intent-group', text: "Choose your study goal: Revision, Understanding, or Deep Study.", pos: 'bottom' },
        { el: '#st-freshness-group', text: "Prioritize recently updated content.", pos: 'bottom' },
        { el: '.st-start-here', text: "The #1 expert recommendation to start your session.", pos: 'bottom' }
    ];

    setTimeout(() => {
        tooltips.forEach((t, i) => {
            const target = $(t.el).first();
            if (target.length) {
                const offset = target.offset();
                const tt = $(`<div class="st-tooltip ${t.pos}">${t.text}<br><button class="st-tt-close" style="margin-top:8px; background:none; border:1px solid white; color:white; cursor:pointer; font-size:10px; border-radius:4px; padding:2px 6px;">Got it</button></div>`);

                $('body').append(tt);
                tt.css({
                    top: offset.top + target.outerHeight() + 10,
                    left: offset.left
                });

                tt.find('.st-tt-close').click(function () {
                    tt.remove();
                    if (i === tooltips.length - 1) {
                        chrome.storage.local.set({ onboardingCompleted: true });
                    }
                });
            }
        });
    }, 2000);
}

// ----------------------------------------------------------------
// YOUTUBE NAVIGATION OBSERVER
// ----------------------------------------------------------------

// YouTube uses SPA navigation. We need to catch search events.
window.addEventListener('yt-navigate-finish', function () {
    if (window.location.pathname === '/results') {
        setTimeout(injectPanel, 1000); // Give YT a moment to render basics
    }
});

// Initial load check
if (window.location.pathname === '/results') {
    $(document).ready(() => setTimeout(injectPanel, 1500));
}
