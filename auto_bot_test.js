/**
 * Auto-player bot: connects 6 Socket.IO clients, auto-acts (fold/call/check)
 */
const { io } = require("socket.io-client");
const http = require("http");

const SERVER = "https://pokernight.cc";
const TABLE_CODE = "TEST04";
const NUM_BOTS = 6;

function apiRequest(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`${SERVER}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendCode(email) {
  await apiRequest("/api/auth/send-code", "POST", { email });
  // In dev mode, codes are logged. Get from server.
  return null;
}

async function getCodeFromServer() {
  // Use fixed test codes by querying the API
  return null;
}

async function main() {
  // Step 1: Register/login 6 bots via API
  const bots = [];
  for (let i = 1; i <= NUM_BOTS; i++) {
    const email = `auto_bot${i}@poker.test`;
    const nickname = `AutoBot${i}`;
    
    // Send code
    await apiRequest("/api/auth/send-code", "POST", { email });
    
    // Try to register with code (dev mode might accept any 6-digit code)
    const regRes = await apiRequest("/api/auth/register", "POST", { email, code: "000000", nickname });
    
    if (regRes.status !== 200) {
      // Try login
      const loginRes = await apiRequest("/api/auth/login", "POST", { email, code: "000000" });
      if (loginRes.status === 200) {
        bots.push({ email, nickname, token: loginRes.data.token, playerId: loginRes.data.playerId });
        console.log(`Bot${i}: logged in`);
        continue;
      }
    }
    
    if (regRes.status === 200) {
      bots.push({ email, nickname, token: regRes.data.token, playerId: regRes.data.playerId });
      console.log(`Bot${i}: registered`);
    } else {
      console.log(`Bot${i}: FAILED`, regRes.status, regRes.data);
    }
  }
  
  if (bots.length < NUM_BOTS) {
    console.error(`Only ${bots.length} bots ready, need ${NUM_BOTS}`);
    process.exit(1);
  }
  
  // Step 2: Create tournament via API
  // First get a table
  const tablesRes = await apiRequest("/api/tables");
  console.log("Tables:", tablesRes.status, JSON.stringify(tablesRes.data).substring(0, 200));
  
  // Create tournament
  const createRes = await apiRequest("/api/tournaments", "POST", {
    displayCode: TABLE_CODE,
    tableId: tablesRes.data[0]?.id || "00000000-0000-0000-0000-000000000001",
    launchFee: 2500,
    maxPlayers: 6,
    startChips: 1000,
    startBlind: 10,
    blindInterval: 30, // 30s blind
    actionTimeout: 15, // 15s per action
    waitCountdown: 10,
  });
  console.log("Create tournament:", createRes.status, JSON.stringify(createRes.data).substring(0, 200));
  
  if (createRes.status !== 200 && createRes.status !== 201) {
    console.error("Failed to create tournament");
    process.exit(1);
  }
  
  const tournamentId = createRes.data.id || createRes.data.tournament?.id;
  console.log("Tournament ID:", tournamentId);
  
  // Step 3: Join tournament for each bot
  for (let i = 0; i < bots.length; i++) {
    const joinRes = await apiRequest(`/api/tournaments/${tournamentId}/join`, "POST", {
      playerId: bots[i].playerId,
      seatIndex: i,
    });
    console.log(`Bot${i+1} join:`, joinRes.status, JSON.stringify(joinRes.data).substring(0, 100));
  }
  
  // Step 4: Connect each bot via Socket.IO
  const sockets = [];
  for (let i = 0; i < bots.length; i++) {
    const socket = io(SERVER, {
      query: { role: "player", playerId: bots[i].playerId, token: bots[i].token },
      transports: ["websocket"],
    });
    
    socket.on("connect", () => {
      console.log(`Bot${i+1} socket connected`);
      socket.emit("join_table", { tableCode: TABLE_CODE, playerId: bots[i].playerId, seatIndex: i });
    });
    
    socket.on("table_state", (data) => {
      console.log(`Bot${i+1} table_state:`, JSON.stringify(data).substring(0, 150));
    });
    
    socket.on("hand_started", (data) => {
      console.log(`Bot${i+1} hand_started:`, data.handNumber, "stage:", data.stage, "actingIndex:", data.actingIndex, "mySeat:", i);
    });
    
    socket.on("turn_changed", (data) => {
      console.log(`Bot${i+1} turn_changed: actingIndex=${data.actingIndex} mySeat=${i} currentBet=${data.currentBet} pot=${data.pot}`);
      // Auto-act after 1-2 seconds
      if (data.actingIndex === i) {
        setTimeout(() => {
          // Simple strategy: if currentBet is 0, check; otherwise fold (50% call for fun)
          const action = data.currentBet === 0 ? "check" : (Math.random() < 0.3 ? "call" : "fold");
          console.log(`Bot${i+1} ACTION: ${action}`);
          socket.emit("player_action", {
            playerId: bots[i].playerId,
            action,
            amount: action === "call" ? data.currentBet : 0,
          });
        }, 1000 + Math.random() * 2000);
      }
    });
    
    socket.on("action_result", (data) => {
      if (data.playerId === bots[i].playerId) {
        console.log(`Bot${i+1} action_result: ${data.action} amount=${data.amount} pot=${data.pot}`);
      }
    });
    
    socket.on("stage_changed", (data) => {
      console.log(`Bot${i+1} stage_changed: ${data.stage} communityCards=${data.communityCards?.length || 0} pot=${data.pot}`);
    });
    
    socket.on("hand_result", (data) => {
      console.log(`Bot${i+1} hand_result: winner=${data.winnerId?.substring(0,8)} pot=${data.pot}`);
    });
    
    socket.on("player_eliminated", (data) => {
      console.log(`Bot${i+1} player_eliminated: ${data.playerId?.substring(0,8)}`);
    });
    
    socket.on("tournament_finished", (data) => {
      console.log(`Bot${i+1} tournament_finished! rankings:`, JSON.stringify(data.rankings).substring(0, 200));
    });
    
    socket.on("error", (err) => console.error(`Bot${i+1} socket error:`, err));
    socket.on("disconnect", () => console.log(`Bot${i+1} disconnected`));
    
    sockets.push(socket);
  }
  
  // Wait 5s then activate
  await new Promise(r => setTimeout(r, 5000));
  console.log("\nActivating tournament...");
  
  const actRes = await apiRequest("/internal/activate", "POST", { tournamentId });
  console.log("Activate:", actRes.status, JSON.stringify(actRes.data).substring(0, 100));
  
  // Wait for tournament to finish (max 10 minutes)
  console.log("\nWaiting for tournament to complete (max 10 min)...");
  await new Promise(r => setTimeout(r, 600000));
  
  // Cleanup
  sockets.forEach(s => s.disconnect());
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
