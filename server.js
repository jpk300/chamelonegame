const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const CATEGORIES = {
  "Everyday Objects": ["keyboard", "backpack", "accordion", "bicycle"],
  Nature: ["volcano", "rainbow", "cucumber", "snowflake", "mountain"],
  "Fun & Food": ["pineapple", "marshmallow", "fireworks"],
  Adventures: ["giraffe", "spaceship", "lighthouse"],
  Animals: ["chameleon", "panda", "dolphin", "kangaroo", "owl"],
  Hobbies: ["gardening", "painting", "baking", "photography", "knitting"],
  Games: ["chess", "monopoly", "scrabble", "minecraft", "fortnite"],
  Movies: ["inception", "coco", "avatar", "frozen", "gladiator"],
  Sports: ["soccer", "basketball", "tennis", "swimming", "cycling"]
};

const CLUE_DURATION_MS = 30000;

const state = {
  phase: "lobby",
  secretWord: null,
  chameleonId: null,
  clues: {},
  votes: {},
  timerEndsAt: null,
  lastResult: null,
  clueOrder: [],
  clueIndex: 0,
  activeCluePlayerId: null,
  clueTimeout: null,
  hostId: null,
  selectedCategory: Object.keys(CATEGORIES)[0]
};

const players = new Map();

function randomWord(category) {
  const words = CATEGORIES[category] || Object.values(CATEGORIES).flat();
  return words[Math.floor(Math.random() * words.length)];
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const player of players.values()) {
    player.ws.send(message);
  }
}

function sendToPlayer(player, payload) {
  if (!player) return;
  player.ws.send(JSON.stringify(payload));
}

function publicState() {
  return {
    phase: state.phase,
    timerEndsAt: state.timerEndsAt,
    activeCluePlayerId: state.activeCluePlayerId,
    hostId: state.hostId,
    categories: Object.keys(CATEGORIES),
    selectedCategory: state.selectedCategory,
    players: Array.from(players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      clue: state.clues[player.id] || null,
      vote: state.votes[player.id] || null
    })),
    lastResult: state.lastResult
  };
}

function resetRoundData() {
  state.secretWord = null;
  state.chameleonId = null;
  state.clues = {};
  state.votes = {};
  state.timerEndsAt = null;
  state.lastResult = null;
  state.clueOrder = [];
  state.clueIndex = 0;
  state.activeCluePlayerId = null;
  if (state.clueTimeout) {
    clearTimeout(state.clueTimeout);
    state.clueTimeout = null;
  }
}

function resetGame() {
  resetRoundData();
  state.phase = "lobby";
  for (const player of players.values()) {
    player.score = 0;
  }
}

function shuffle(array) {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function awardPoints(winnerIds) {
  winnerIds.forEach((id) => {
    const winner = players.get(id);
    if (winner) {
      winner.score += 1;
    }
  });
}

function startVotePhase() {
  state.phase = "vote";
  state.timerEndsAt = null;
  state.activeCluePlayerId = null;
  if (state.clueTimeout) {
    clearTimeout(state.clueTimeout);
    state.clueTimeout = null;
  }
  broadcast({ type: "state", data: publicState() });
}

function startNextClueTurn() {
  if (state.clueIndex >= state.clueOrder.length) {
    startVotePhase();
    return;
  }

  state.activeCluePlayerId = state.clueOrder[state.clueIndex];
  state.timerEndsAt = Date.now() + CLUE_DURATION_MS;
  broadcast({ type: "state", data: publicState() });

  if (state.clueTimeout) {
    clearTimeout(state.clueTimeout);
  }

  state.clueTimeout = setTimeout(() => {
    if (state.phase !== "clue") return;
    if (!state.clues[state.activeCluePlayerId]) {
      state.clues[state.activeCluePlayerId] = "No hint";
    }
    state.clueIndex += 1;
    startNextClueTurn();
  }, CLUE_DURATION_MS);
}

function startCluePhase() {
  state.phase = "clue";
  state.clueOrder = shuffle(Array.from(players.keys()));
  state.clueIndex = 0;
  startNextClueTurn();
}

function startRound() {
  if (players.size < 3) {
    broadcast({
      type: "error",
      message: "Need at least 3 players to start a round."
    });
    return;
  }

  resetRoundData();
  state.secretWord = randomWord(state.selectedCategory);
  const playerIds = Array.from(players.keys());
  state.chameleonId = playerIds[Math.floor(Math.random() * playerIds.length)];

  for (const player of players.values()) {
    sendToPlayer(player, {
      type: "secret",
      word: player.id === state.chameleonId ? null : state.secretWord
    });
  }

  startCluePhase();
}

function finishVoting() {
  const eligibleVoterIds = Array.from(players.keys()).filter((id) => id !== state.chameleonId);
  const votes = eligibleVoterIds.map((id) => state.votes[id]).filter(Boolean);
  if (votes.length !== eligibleVoterIds.length) {
    return;
  }

  const uniqueVotes = new Set(votes);
  const voteUnanimous = uniqueVotes.size === 1;
  const suspectedId = voteUnanimous ? votes[0] : null;

  if (voteUnanimous && suspectedId === state.chameleonId) {
    state.phase = "guess";
    broadcast({
      type: "state",
      data: publicState()
    });
    sendToPlayer(players.get(state.chameleonId), {
      type: "guess_prompt"
    });
    return;
  }

  awardPoints([state.chameleonId]);
  state.phase = "reveal";
  state.lastResult = {
    outcome: "chameleon-escaped",
    secretWord: state.secretWord,
    chameleonId: state.chameleonId,
    voteUnanimous,
    suspectedId,
    roundWinners: [state.chameleonId]
  };
  broadcast({ type: "state", data: publicState() });
}

function handleGuess(guess) {
  const correct = guess.trim().toLowerCase() === state.secretWord.toLowerCase();
  const winners = correct
    ? [state.chameleonId]
    : Array.from(players.keys()).filter((id) => id !== state.chameleonId);
  awardPoints(winners);
  state.phase = "reveal";
  state.lastResult = {
    outcome: correct ? "chameleon-wins" : "team-wins",
    secretWord: state.secretWord,
    chameleonId: state.chameleonId,
    voteUnanimous: true,
    roundWinners: winners,
    guess
  };
  broadcast({ type: "state", data: publicState() });
}

wss.on("connection", (ws) => {
  const playerId = `player-${Math.random().toString(36).slice(2, 10)}`;
  const player = { id: playerId, name: "", ws, score: 0 };
  players.set(playerId, player);
  if (!state.hostId) {
    state.hostId = playerId;
  }

  ws.send(
    JSON.stringify({
      type: "init",
      id: playerId,
      state: publicState()
    })
  );

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      return;
    }

    if (message.type === "join") {
      player.name = message.name?.trim() || "Player";
      broadcast({ type: "state", data: publicState() });
      return;
    }

    if (message.type === "start_round") {
      if (state.phase === "clue" || state.phase === "vote" || state.phase === "guess") {
        return;
      }
      if (player.id !== state.hostId) {
        return;
      }
      startRound();
      return;
    }

    if (message.type === "start_new_game") {
      if (player.id !== state.hostId) {
        return;
      }
      resetGame();
      broadcast({ type: "state", data: publicState() });
      return;
    }

    if (message.type === "select_category") {
      if (player.id !== state.hostId) return;
      if (state.phase === "clue" || state.phase === "vote" || state.phase === "guess") {
        return;
      }
      if (!CATEGORIES[message.category]) return;
      state.selectedCategory = message.category;
      broadcast({ type: "state", data: publicState() });
      return;
    }

    if (message.type === "submit_clue" && state.phase === "clue") {
      if (player.id !== state.activeCluePlayerId) return;
      if (state.clues[player.id]) return;
      state.clues[player.id] = message.clue?.trim() || "No hint";
      state.clueIndex += 1;
      startNextClueTurn();
      return;
    }

    if (message.type === "submit_vote" && state.phase === "vote") {
      if (!players.has(message.targetId)) return;
      if (player.id === state.chameleonId) return;
      state.votes[player.id] = message.targetId;
      broadcast({ type: "state", data: publicState() });

      if (Object.keys(state.votes).length === players.size - 1) {
        finishVoting();
      }
      return;
    }

    if (message.type === "chameleon_guess" && state.phase === "guess") {
      if (player.id !== state.chameleonId) return;
      handleGuess(message.guess || "");
    }
  });

  ws.on("close", () => {
    players.delete(playerId);
    if (state.hostId === playerId) {
      state.hostId = players.keys().next().value || null;
    }
    if (state.phase === "clue") {
      const index = state.clueOrder.indexOf(playerId);
      if (index !== -1) {
        state.clueOrder.splice(index, 1);
        if (index <= state.clueIndex && state.clueIndex > 0) {
          state.clueIndex -= 1;
        }
      }
      if (state.activeCluePlayerId === playerId) {
        if (state.clueTimeout) {
          clearTimeout(state.clueTimeout);
          state.clueTimeout = null;
        }
        state.clues[playerId] = state.clues[playerId] || "Left the game";
        state.clueIndex += 1;
        startNextClueTurn();
      }
    }
    if (players.size === 0) {
      resetRoundData();
      state.phase = "lobby";
      state.hostId = null;
    }
    broadcast({ type: "state", data: publicState() });
  });
});

server.listen(PORT, () => {
  console.log(`Chameleon game server running on http://localhost:${PORT}`);
});
