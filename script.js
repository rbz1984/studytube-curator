$(document).ready(function () {

    const ANTI_GRAVITY_CONFIG = {
        apiKey: "AIzaSyBNZog51yQ8y_i4uDP8lat8ikNShRYSJZQ",
        maxResults: 20
    };

    function parseDuration(duration) {
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return 0;
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);
        return (hours * 60) + minutes + (seconds / 60);
    }

    function calculateTitleScore(title, query) {
        let score = 0;
        const lowerTitle = title.toLowerCase();
        const keywords = query.toLowerCase().split(' ').filter(w => w.length > 2);
        if (lowerTitle.includes(query.toLowerCase())) score += 15;
        let matchCount = 0;
        keywords.forEach(word => {
            if (lowerTitle.includes(word)) matchCount++;
            if (word === 'rag' && lowerTitle.includes('retrieval')) matchCount++;
            if (word === 'dbms' && lowerTitle.includes('database')) matchCount++;
        });
        if (keywords.length > 0) score += Math.min(20, (matchCount / keywords.length) * 20);
        const boostWords = ['explained', 'simple words', 'beginners', 'concept', 'tutorial', 'guide', 'introduction', 'full course'];
        boostWords.forEach(word => { if (lowerTitle.includes(word)) score += 4; });
        return Math.min(35, score);
    }

    function calculateRecencyScore(publishedAt) {
        const pubDate = new Date(publishedAt);
        const yearsOld = (new Date() - pubDate) / (1000 * 60 * 60 * 24 * 365);
        if (yearsOld <= 3) return 15;
        if (yearsOld <= 5) return 10;
        return Math.max(0, 15 - (yearsOld * 2));
    }

    function calculateDurationScore(durationMin, intent) {
        if (intent === 'Quick Revision') return (durationMin < 8) ? 15 : (durationMin < 12 ? 10 : 5);
        if (intent === 'Concept Understanding') return (durationMin >= 8 && durationMin <= 20) ? 15 : (durationMin > 5 && durationMin < 25 ? 10 : 5);
        return (durationMin > 20) ? 15 : (durationMin > 15 ? 10 : 5);
    }

    function calculateTrustScore(viewCount) {
        if (!viewCount) return 0;
        const logViews = Math.log10(viewCount);
        return Math.max(0, Math.min(10, (logViews - 3) * 2.5));
    }

    async function runAntiGravityWorkflow(query, intent, timeFilter = "all_time") {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${ANTI_GRAVITY_CONFIG.maxResults}&order=relevance&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const searchData = await $.get(searchUrl);
        if (!searchData.items || searchData.items.length === 0) return { videos: [], fallback: false };

        const videoIds = searchData.items.map(item => item.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const detailsData = await $.get(detailsUrl);
        const detailsMap = {};
        detailsData.items.forEach(item => detailsMap[item.id] = item);

        // Date Threshold Logic - FIXED Mutation bug
        let dateThreshold = null;
        const baseDate = new Date();
        if (timeFilter === "this_week") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 7));
        else if (timeFilter === "this_month") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 30));
        else if (timeFilter === "last_3_months") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 90));

        function processItems(items, filterByDate) {
            let processed = [];
            let counts = {};
            let localLastView = Infinity;
            let idx = 0;

            for (const item of items) {
                idx++;
                const detail = detailsMap[item.id.videoId];
                if (!detail) continue;

                const pubDate = new Date(item.snippet.publishedAt);
                if (filterByDate && dateThreshold && pubDate < dateThreshold) continue;

                const channelId = item.snippet.channelId;
                counts[channelId] = (counts[channelId] || 0) + 1;
                if (counts[channelId] > 2) continue;

                const stats = detail.statistics;
                const viewCount = parseInt(stats.viewCount) || 0;
                const likeCount = parseInt(stats.likeCount) || 0;
                const durationMin = parseDuration(detail.contentDetails.duration);

                const titleScore = calculateTitleScore(item.snippet.title, query);
                const ratioScore = Math.min(25, (viewCount > 0 ? (likeCount / viewCount) : 0) * 800);
                const recencyScore = calculateRecencyScore(item.snippet.publishedAt);
                const durationScore = calculateDurationScore(durationMin, intent);
                const trustScore = calculateTrustScore(viewCount);
                const ytRankBonus = Math.max(0, 10 - (idx * 0.5));

                const totalScore = titleScore + ratioScore + recencyScore + durationScore + trustScore + ytRankBonus;

                if (totalScore < 40) continue;
                if (processed.length > 0 && viewCount < localLastView / 20) continue;
                localLastView = Math.max(localLastView === Infinity ? 0 : localLastView, viewCount);

                processed.push({
                    videoId: item.id.videoId,
                    title: item.snippet.title,
                    description: item.snippet.description || "",
                    thumbnail: item.snippet.thumbnails.high.url,
                    channel: item.snippet.channelTitle,
                    duration: Math.round(durationMin),
                    publishedDate: pubDate,
                    publishedYear: pubDate.getFullYear(),
                    publishedReadable: pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    score: totalScore,
                    stats: { titleScore, ratioScore, durationScore, viewCount, likeCount }
                });
            }
            return processed;
        }

        let rawResults = processItems(searchData.items, true);
        let usedFallback = false;

        if (timeFilter !== "all_time" && rawResults.length < 3) {
            rawResults = processItems(searchData.items, false);
            usedFallback = true;
        }

        rawResults.sort((a, b) => b.score - a.score);
        const finalSelection = rawResults.slice(0, 5);
        const labelCounts = {};

        const videos = finalSelection.map((video, idx) => {
            let label = "";
            const academicRegex = /normalization|definition|forms|dbms|lecture|exam|tutorial|course/i;
            const isAcademic = academicRegex.test(video.title) || academicRegex.test(video.description);

            if (idx === 0) label = "Best Explained";
            else if (video.duration < 8 && video.score >= 65) label = "Quick Revision";
            else if (video.stats.titleScore > 20 && video.duration >= 8 && video.duration <= 20) label = "Concept Clarity";
            else if (isAcademic) label = "Syllabus Friendly";
            else if (video.stats.viewCount >= 500000 && video.score >= 75) label = "Most Viewed";
            else label = video.duration < 10 ? "Quick Revision" : "Concept Clarity";

            labelCounts[label] = (labelCounts[label] || 0) + 1;
            if (labelCounts[label] > 3) {
                label = isAcademic ? "Syllabus Friendly" : "";
            }

            let contrastLine = "";
            if (idx === 1 || idx === 2) {
                const prev = finalSelection[idx - 1];
                if (video.duration > prev.duration + 5) contrastLine = "Covers the topic in more depth";
                else if (/beginner|simple|start/i.test(video.title)) contrastLine = "More beginner-friendly than above";
                else if (/example|demo|practical/i.test(video.description)) contrastLine = "Includes more practical examples";
                else if (isAcademic) contrastLine = "More exam-oriented explanation";
            }

            let confidence = "Explains step-by-step";
            if (isAcademic) confidence = "Helpful for exam preparation";
            else if (video.duration < 10) confidence = "Covers key concepts clearly";
            else if (video.stats.titleScore > 30) confidence = "Good for first-time learners";

            const isUpdated = (new Date() - video.publishedDate) < (45 * 24 * 60 * 60 * 1000) && video.score >= 60;

            return {
                ...video,
                label: label,
                explanation: `Why this video?\n• ${(["Clear topic match", "Strong explanation quality", `Suitable length for ${intent.toLowerCase()}`]).join("\n• ")}`,
                confidenceSignal: confidence,
                contrastLine: contrastLine,
                isTopMatch: idx === 0,
                isNew: isUpdated,
                durationFormatted: `${video.duration} min`
            };
        });

        return { videos, fallback: usedFallback };
    }

    $('#searchBtn').click(function () { performSearch(); });
    $('#searchInput').keypress(function (e) { if (e.which == 13) performSearch(); });
    $('input[name="timeFilter"]').change(function () {
        if ($('#searchInput').val().trim()) performSearch();
    });

    async function performSearch() {
        const query = $('#searchInput').val().trim();
        const intent = $('input[name="intent"]:checked').val();
        const timeFilter = $('input[name="timeFilter"]:checked').val();

        if (!query) { alert("Please enter a topic."); return; }

        $('#searchBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span>');
        $('#resultsContainer').addClass('searching-active');

        try {
            const { videos, fallback } = await runAntiGravityWorkflow(query, intent, timeFilter);
            renderResults(videos, intent, fallback);
        } catch (error) {
            console.error(error);
            $('#resultsContainer').html('<div class="alert alert-danger text-center mx-auto">Failed to fetch results. Check console.</div>');
        } finally {
            $('#searchBtn').prop('disabled', false).html('<i class="fas fa-search"></i>');
            $('#resultsContainer').removeClass('searching-active');
        }
    }

    function renderResults(videos, intent, showFallbackMsg) {
        const container = $('#resultsContainer');
        container.empty();
        if (videos.length === 0) { $('#emptyState').fadeIn(); return; }

        let html = '';

        if (showFallbackMsg) {
            html += `<div class="col-lg-10 col-md-12 mb-3 text-center">
                <div class="alert alert-light border-0 shadow-sm small py-2">
                    <i class="fas fa-history me-1 text-warning"></i> Not many recent videos found. Showing best available explanations instead.
                </div>
            </div>`;
        }

        html += `<div class="col-lg-10 col-md-12 mb-3 text-center active-intent-label">
            <span class="text-muted">Curated for:</span> <strong class="text-primary">${intent}</strong>
        </div>`;

        videos.forEach((video, i) => {
            let labelClass = "bg-secondary";
            if (video.label === "Best Explained") labelClass = "label-best-explained";
            if (video.label === "Quick Revision") labelClass = "label-quick-revision";
            if (video.label === "Concept Clarity") labelClass = "label-concept-clarity";
            if (video.label === "Most Viewed") labelClass = "label-most-viewed";
            if (video.label === "Syllabus Friendly") labelClass = "label-syllabus-friendly";

            const startHereBadge = video.isTopMatch ? `<div class="start-here-badge">▶ Start Here <small class="d-block text-white-50">Best overall explanation</small></div>` : "";
            const newBadge = video.isNew ? `<span class="badge-updated">🆕 Just Updated</span>` : "";
            const contrastLineHtml = video.contrastLine ? `<p class="contrast-line"><i class="fas fa-info-circle me-1"></i> ${video.contrastLine}</p>` : "";

            html += `
            <div class="col-lg-10 col-md-12 mb-4 result-item-wrap fade-in ${video.isTopMatch ? 'top-highlight' : ''}" style="animation-delay: ${i * 0.08}s">
                <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" class="text-decoration-none text-dark">
                    <div class="video-card p-0 position-relative">
                        ${startHereBadge}
                        <div class="row g-0 align-items-stretch">
                            <div class="col-md-5 position-relative">
                                <div class="video-thumbnail-container">
                                    <img src="${video.thumbnail}" class="video-thumbnail" alt="${video.title}" loading="lazy">
                                    <span class="duration-badge">${video.durationFormatted}</span>
                                </div>
                            </div>
                            <div class="col-md-7">
                                <div class="card-body">
                                    <div class="mb-2 d-flex align-items-center gap-1 flex-wrap">
                                        ${video.label ? `<span class="badge-custom ${labelClass}">${video.label}</span>` : ""}
                                        ${newBadge}
                                    </div>
                                    <h5 class="card-title">${video.title}</h5>
                                    <p class="confidence-signal mb-1"><i class="fas fa-check-circle text-success me-1"></i> ${video.confidenceSignal}</p>
                                    ${contrastLineHtml}
                                    <p class="channel-name small mb-2 text-muted"><strong>${video.channel}</strong> &bull; ${video.publishedReadable}</p>
                                    <div class="explanation-box small mt-2">
                                        <strong>Curator's Note:</strong><br>
                                        &bull; ${video.explanation.split('\n• ').slice(1).join('<br>&bull; ')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </a>
            </div><div class="divider d-md-none"></div>`;
        });

        container.html(html);
    }

    function getSkeletonHTML() {
        let html = '';
        for (let i = 0; i < 3; i++) html += `
        <div class="col-lg-10 col-md-12 mb-4">
            <div class="card border-0 shadow-sm overflow-hidden" style="height:220px">
                <div class="row g-0 h-100">
                    <div class="col-md-5 skeleton"></div>
                    <div class="col-md-7 p-4 bg-white">
                        <div class="skeleton mb-2" style="height:20px; width:40%"></div>
                        <div class="skeleton mb-3" style="height:30px; width:90%"></div>
                        <div class="skeleton" style="height:15px; width:60%"></div>
                    </div>
                </div>
            </div>
        </div>`;
        return html;
    }
});
