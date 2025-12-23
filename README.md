# StudyTube Curator 🎓 (Chrome Extension)
**Find the best explanation. Skip the noise directly on YouTube.**

StudyTube Curator is a smart Chrome Extension that enhances your YouTube search results with a curated student-focused panel. It uses a custom logic engine to prioritize educational quality, clarity, and trust.

## 🌟 Key Features
- **Native Injection**: Slides a premium curation panel directly into the top of YouTube search results.
- **Study Intent Selection**: Switch between *Quick Revision*, *Concept Understanding*, or *Deep Study*.
- **Freshness Control**: Filter for latest content without leaving YouTube.
- **Expert Labels**: Identifies *Best Explained*, *Syllabus Friendly*, and *New Updates*.
- **Decision Confidence**: Human-readable "Curator's Notes" and "Contrast Lines" for choosing the right video.

## 🛠️ Folder Structure
- `/extension`: The Chrome Extension source files (Manifest V3).
- `/api`: Vercel Serverless Function code for the backend curation logic.

## 🚀 Installation (Developer Mode)
1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the `/extension` folder.
5. Search for any academic topic on YouTube!

## 🌐 Backend Setup
The extension calls a serverless API. To host your own:
1. Deploy the `/api` folder to Vercel.
2. Update the `API_BASE` variable in `extension/content.js` to your new URL.
3. Ensure your YouTube API Key is configured in `api/curate.js`.

## 📝 License
MIT License.
