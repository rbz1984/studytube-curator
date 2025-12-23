const ANTI_GRAVITY_CONFIG = {
    apiKey: "AIzaSyBNZog51yQ8y_i4uDP8lat8ikNShRYSJZQ",
    maxResults: 15 // Reduced for speed
};

function parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    return ((parseInt(match[1]) || 0) * 60) + (parseInt(match[2]) || 0) + ((parseInt(match[3]) || 0) / 60);
}

export default async function handler(req, res) {
    // Optimized Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600'); // Cache for 1 hour

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query, intent = "Concept Understanding", timeFilter = "all_time" } = req.query;

    if (!query) return res.status(200).json([]);

    try {
        // Optimized YouTube Calls
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${ANTI_GRAVITY_CONFIG.maxResults}&order=relevance&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.items?.length) return res.status(200).json([]);

        const videoIds = searchData.items.map(item => item.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${ANTI_GRAVITY_CONFIG.apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        const detailsMap = {};
        detailsData.items?.forEach(item => detailsMap[item.id] = item);

        // Date logic
        let dateThreshold = null;
        if (timeFilter !== "all_time") {
            const now = new Date();
            const days = timeFilter === "this_week" ? 7 : (timeFilter === "this_month" ? 30 : 90);
            dateThreshold = new Date(now.setDate(now.getDate() - days));
        }

        function process(items, filter) {
            let processed = [];
            let channels = {};
            let lastView = Infinity;

            for (const item of items) {
                const vid = item.id.videoId;
                const d = detailsMap[vid];
                if (!d) continue;

                if (filter && dateThreshold && new Date(item.snippet.publishedAt) < dateThreshold) continue;

                channels[item.snippet.channelId] = (channels[item.snippet.channelId] || 0) + 1;
                if (channels[item.snippet.channelId] > 2) continue;

                const views = parseInt(d.statistics.viewCount) || 0;
                const durMin = parseDuration(d.contentDetails.duration);
                const score = (/(normalization|lecture|exam|tutorial|course)/i.test(item.snippet.title) ? 20 : 0) + (views > 100000 ? 10 : 5);

                processed.push({
                    videoId: vid,
                    title: item.snippet.title,
                    thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, // Faster thumbnail
                    channel: item.snippet.channelTitle,
                    duration: `${Math.round(durMin)} min`,
                    publishedYear: new Date(item.snippet.publishedAt).getFullYear(),
                    score: score,
                    isAcademic: /(normalization|dbms|lecture|exam|tutorial|course)/i.test(item.snippet.title + item.snippet.description)
                });
            }
            return processed;
        }

        let results = process(searchData.items, true);
        if (timeFilter !== "all_time" && results.length < 3) results = process(searchData.items, false);

        const final = results.slice(0, 5).map((v, i) => ({
            ...v,
            label: i === 0 ? "Best Explained" : (v.isAcademic ? "Syllabus Friendly" : "Concept Clarity"),
            confidenceSignal: v.isAcademic ? "Helpful for exam preparation" : "Explains step-by-step",
            isTopMatch: i === 0,
            isNew: (new Date() - new Date(v.publishedDate)) < (45 * 24 * 60 * 60 * 1000),
            explanation: `Curator's Note: High relevance for students on this topic.`
        }));

        return res.status(200).json(final);

    } catch (e) {
        return res.status(200).json([]);
    }
}
