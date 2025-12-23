const API_BASE = "https://studytube-curator-vercel-j19d934dg-rbz1984s-projects.vercel.app/api/curate";
let currentIntent = "Concept Understanding";
let currentTimeFilter = "all_time";
let lastCurationUrl = "";

// ----------------------------------------------------------------
// UI INJECTION LOGIC
// ----------------------------------------------------------------

function injectPanel() {
    // Only inject if it's a search results page
    if (!window.location.pathname.includes('/results')) return;
    if ($('#studytube-curator-panel').length) return;

    const panelHtml = `
        <div id="studytube-curator-panel" style="display:none;">
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

    // Target the YouTube results area
    const target = $('ytd-search #contents.ytd-section-list-renderer, #primary #contents').first();
    if (target.length) {
        target.prepend(panelHtml);
        $('#studytube-curator-panel').fadeIn(400);
        attachEvents();
        checkOnboarding();
        performCuration();
    }
}

function attachEvents() {
    $('.st-pill').off('click').on('click', function () {
        const type = $(this).data('type');
        const val = $(this).data('value');

        if (type === 'intent') currentIntent = val;
        else currentTimeFilter = val;

        $(this).siblings().removeClass('active');
        $(this).addClass('active');

        performCuration(true); // Forced curation
    });
}

// ----------------------------------------------------------------
// DATA FETCHING
// ----------------------------------------------------------------

async function performCuration(force = false) {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search_query');
    if (!query) return;

    const currentUrl = window.location.href + currentIntent + currentTimeFilter;
    if (!force && currentUrl === lastCurationUrl) return;
    lastCurationUrl = currentUrl;

    $('#st-results-grid').html('<div style="text-align:center; padding: 40px; color: #64748b;">Curating best results...</div>');

    try {
        // Try POST first
        let response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, intent: currentIntent, timeFilter: currentTimeFilter }),
            signal: AbortSignal.timeout(10000)
        }).catch(() => null);

        // Fallback to GET if POST fails
        if (!response || !response.ok) {
            console.log("StudyTube: POST failed or timed out, trying GET fallback...");
            const getUrl = `${API_BASE}?query=${encodeURIComponent(query)}&intent=${encodeURIComponent(currentIntent)}&timeFilter=${currentTimeFilter}`;
            response = await fetch(getUrl, { signal: AbortSignal.timeout(10000) });
        }

        const videos = await response.json();
        renderCards(videos);
    } catch (error) {
        console.error("StudyTube Extension Error:", error);
        $('#st-results-grid').html('<div style="text-align:center; padding: 20px; color: #ef4444;">Failed to load curated results. Check your connection or API endpoint.</div>');
    }
}

function renderCards(videos) {
    const grid = $('#st-results-grid');
    grid.empty();

    if (!Array.isArray(videos) || videos.length === 0) {
        grid.html('<div style="text-align:center; padding: 20px; color: #64748b;">No high-quality educational results found for this topic.</div>');
        return;
    }

    videos.forEach((video, i) => {
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

// ----------------------------------------------------------------
// ONBOARDING
// ----------------------------------------------------------------

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
        { el: '#st-intent-group', text: "Choose your study goal: Revision, Understanding, or Deep Study.", pos: 'bottom' },
        { el: '#st-freshness-group', text: "Prioritize recently updated content.", pos: 'bottom' }
    ];

    tooltips.forEach((t, i) => {
        const target = $(t.el).first();
        if (target.length) {
            const offset = target.offset();
            const tt = $(`
                <div class="st-tooltip ${t.pos}">
                    ${t.text}
                    <div style="margin-top:8px; text-align:right;">
                        <button class="st-tt-close">Got it</button>
                    </div>
                </div>
            `);

            $('body').append(tt);
            tt.css({
                top: offset.top + target.outerHeight() + 12,
                left: offset.left
            });

            tt.find('.st-tt-close').click(function () {
                tt.fadeOut(200, function () {
                    $(this).remove();
                    if ($('.st-tooltip').length === 0) {
                        chrome.storage.local.set({ onboardingCompleted: true });
                    }
                });
            });
        }
    });
}

// ----------------------------------------------------------------
// YOUTUBE NAVIGATION OBSERVER
// ----------------------------------------------------------------

// Use a mutation observer to follow YouTube's SPA navigation
let lastPath = location.pathname + location.search;
const navObserver = new MutationObserver(() => {
    const currentPath = location.pathname + location.search;
    if (currentPath !== lastPath) {
        lastPath = currentPath;
        if (location.pathname === '/results') {
            console.log("StudyTube: Navigation change detected, re-injecting...");
            setTimeout(injectPanel, 1500);
        }
    }
});
navObserver.observe(document, { subtree: true, childList: true });

// Initial load check
$(document).ready(() => {
    if (window.location.pathname === '/results') {
        setTimeout(injectPanel, 2000);
    }
});
