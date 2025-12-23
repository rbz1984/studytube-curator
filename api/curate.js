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

export default async function handler(req, res) {
    // 1️⃣ ENABLE FULL CORS SUPPORT
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle Preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2️⃣ FORCE JSON RESPONSE (NO HTML/FAIL-SAFE)
    res.setHeader('Content-Type', 'application/json');

    // 5️⃣ VALIDATE INPUT BODY
    let body = {};
    if (req.method === 'POST') {
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (e) {
            return res.status(200).json([]); // Fail-safe
        }
    } else {
        // Fallback for debugging, but user asked for POST JSON
        body = req.query || {};
    }

    const { query, intent = "Concept Understanding", timeFilter = "all_time" } = body;

    if (!query) {
        return res.status(200).json([]); // Mandatory empty array on missing query
    }

    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${ANTI_GRAVITY_CONFIG.maxResults}&order=relevance&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.items || searchData.items.length === 0) {
            return res.json([]); // Return plain array
        }

        const videoIds = searchData.items.map(item => item.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        const detailsMap = {};
        if (detailsData.items) {
            detailsData.items.forEach(item => detailsMap[item.id] = item);
        }

        // Freshness Filters
        let dateThreshold = null;
        const baseDate = new Date();
        if (timeFilter === "this_week") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 7));
        else if (timeFilter === "this_month") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 30));
        else if (timeFilter === "last_3_months") dateThreshold = new Date(baseDate.setDate(baseDate.getDate() - 90));

        function processItems(items, filterByDate) {
            let processed = [];
            let channelCounts = {};
            let localLastView = Infinity;
            let idx = 0;

            for (const item of items) {
                idx++;
                const videoId = item.id.videoId;
                const detail = detailsMap[videoId];
                if (!detail) continue;

                const pubDate = new Date(item.snippet.publishedAt);
                if (filterByDate && dateThreshold && pubDate < dateThreshold) continue;

                const channelId = item.snippet.channelId;
                channelCounts[channelId] = (channelCounts[channelId] || 0) + 1;
                if (channelCounts[channelId] > 2) continue; // Hard rule: Max 2 per channel

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
                if (processed.length > 0 && viewCount < localLastView / 25) continue;
                localLastView = Math.max(localLastView === Infinity ? 0 : localLastView, viewCount);

                processed.push({
                    videoId: videoId,
                    title: item.snippet.title,
                    description: item.snippet.description || "",
                    // 4️⃣ ENSURE THUMBNAILS ALWAYS LOAD (ABSOLUTE URL)
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    channel: item.snippet.channelTitle,
                    durationFormatted: `${Math.round(durationMin)} min`,
                    publishedDate: pubDate,
                    publishedYear: pubDate.getFullYear(),
                    score: totalScore,
                    stats: { titleScore, ratioScore, durationScore }
                });
            }
            return processed;
        }

        let results = processItems(searchData.items, true);

        // Fallback for freshness
        if (timeFilter !== "all_time" && results.length < 3) {
            results = processItems(searchData.items, false);
        }

        results.sort((a, b) => b.score - a.score);
        const finalSelection = results.slice(0, 5);
        const labelCounts = {};

        // 3️⃣ RESPONSE FORMAT (RETURN JSON ARRAY)
        const finalOutput = finalSelection.map((video, idx) => {
            let label = "";
            const isAcademic = /normalization|definition|forms|dbms|lecture|exam|tutorial|course/i.test(video.title + video.description);

            if (idx === 0) label = "Best Explained";
            else if (parseInt(video.durationFormatted) < 8 && video.score >= 65) label = "Quick Revision";
            else if (video.stats.titleScore > 20 && parseInt(video.durationFormatted) >= 8) label = "Concept Clarity";
            else if (isAcademic) label = "Syllabus Friendly";
            else label = parseInt(video.durationFormatted) < 10 ? "Quick Revision" : "Concept Clarity";

            // Diversity Guard
            labelCounts[label] = (labelCounts[label] || 0) + 1;
            if (labelCounts[label] > 3) label = isAcademic ? "Syllabus Friendly" : "Concept Clarity";

            let contrast = "";
            if (idx === 1 || idx === 2) {
                const prev = finalSelection[idx - 1];
                if (parseInt(video.durationFormatted) > parseInt(prev.durationFormatted) + 5) contrast = "Covers the topic in more depth";
                else if (/beginner|simple|start/i.test(video.title)) contrast = "More beginner-friendly than above";
                else if (isAcademic) contrast = "More exam-oriented explanation";
            }

            return {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                label: label,
                channel: video.channel,
                duration: video.durationFormatted,
                publishedYear: video.publishedYear,
                confidenceSignal: isAcademic ? "Helpful for exam preparation" : "Explains step-by-step",
                contrastLine: contrast,
                isTopMatch: idx === 0,
                isNew: (new Date() - video.publishedDate) < (30 * 24 * 60 * 60 * 1000),
                explanation: `Curator's Note: Clear topic match and strong explanation quality.`
            };
        });

        // 6️⃣ GUARANTEE FETCH-SAFE RESPONSE 
        return res.status(200).json(finalOutput);

    } catch (error) {
        // 7️⃣ FAIL-SAFE BEHAVIOR
        return res.status(200).json([]);
    }
}
