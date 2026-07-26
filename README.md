# AnimePahe Standalone Vercel Stream Proxy

A lightweight, standalone serverless proxy for searching AnimePahe, fetching episode lists, and decoding Kwik `.m3u8` video stream URLs. Designed specifically to run on **Vercel** with CORS enabled, without touching your main Railway server codebase.

---

### Endpoints

#### 1. Search Anime
```http
GET /api/search?q=solo+leveling
```

#### 2. Get Episodes List
```http
GET /api/episodes?id={animeSessionId}&page=1
```

#### 3. Extract M3U8 Video Stream
```http
GET /api/extract?anime={animeSessionId}&episode={episodeSessionId}
```

---

### 1-Click Vercel Deployment

1. Create a new GitHub repository (e.g., `animepahe-vercel-proxy`).
2. Copy the files in this folder (`package.json`, `vercel.json`, and the `api/` folder) to your new repo.
3. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/animepahe-vercel-proxy.git
   git push -u origin main
   ```
4. Connect the repository to [Vercel](https://vercel.com) and click **Deploy**.

---

### Using in HypeAnime Frontend

In your React player modal (`MovieModal.jsx`):
```javascript
const PROXY_URL = "https://your-app-name.vercel.app";

// 1. Search
const searchRes = await fetch(`${PROXY_URL}/api/search?q=${encodeURIComponent(animeTitle)}`);

// 2. Extract Stream
const streamRes = await fetch(`${PROXY_URL}/api/extract?anime=${animeSession}&episode=${epSession}`);
const m3u8Url = streamRes.sources[0].url;
```
