import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

const app = express();
const PORT = 3000;

// Simple cache for lotto history
let lottoCache: any[] = [];
let lastCacheUpdate: number = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

const getLottoRoundData = async (round: number) => {
  try {
    const response = await axios.get(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`);
    if (response.data.returnValue === "success") {
      return {
        round: response.data.drwNo,
        date: response.data.drwNoDate,
        numbers: [
          response.data.drwtNo1,
          response.data.drwtNo2,
          response.data.drwtNo3,
          response.data.drwtNo4,
          response.data.drwtNo5,
          response.data.drwtNo6,
        ],
        bonus: response.data.bnusNo,
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch round ${round}:`, error);
    return null;
  }
};

const updateLottoHistory = async () => {
  const now = Date.now();
  if (lottoCache.length > 0 && now - lastCacheUpdate < CACHE_DURATION) {
    return lottoCache;
  }

  // Calculate latest round
  const round1Date = new Date("2002-12-07T20:45:00+09:00");
  const currentDate = new Date();
  const diffMs = currentDate.getTime() - round1Date.getTime();
  const latestRound = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

  const history: any[] = [];
  const roundsToFetch = 52; // 1 year approx

  // Fetch in chunks to avoid overwhelming the server
  for (let i = 0; i < roundsToFetch; i++) {
    const round = latestRound - i;
    if (round < 1) break;
    const data = await getLottoRoundData(round);
    if (data) {
      history.push(data);
    }
  }

  if (history.length > 0) {
    lottoCache = history;
    lastCacheUpdate = now;
  }
  return lottoCache;
};

async function startServer() {
  // API routes
  app.get("/api/lotto/history", async (req, res) => {
    try {
      const history = await updateLottoHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lotto history" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
