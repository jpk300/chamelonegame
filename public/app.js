const ws = new WebSocket(`ws://${window.location.host}`);

let playerId = null;
let currentState = null;
let secretWord = null;
let isChameleon = false;

const joinPanel = document.getElementById("join-panel");
const joinForm = document.getElementById("join-form");
const nameInput = document.getElementById("name-input");
const phaseText = document.getElementById("phase-text");
const timerText = document.getElementById("timer-text");
const startButton = document.getElementById("start-button");
const secretWordEl = document.getElementById("secret-word");
const cluePanel = document.getElementById("clue-panel");
const clueForm = document.getElementById("clue-form");
const clueInput = document.getElementById("clue-input");
const cluesList = document.getElementById("clues-list");
const votePanel = document.getElementById("vote-panel");
const voteOptions = document.getElementById("vote-options");
const guessPanel = document.getElementById("guess-panel");
const guessForm = document.getElementById("guess-form");
const guessInput = document.getElementById("guess-input");
const resultsPanel = document.getElementById("results-panel");
const resultsOutput = document.getElementById("results-output");
const playersList = document.getElementById("players-list");

function sendMessage(payload) {
  ws.send(JSON.stringify(payload));
}

function renderPlayers(players) {
  playersList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    const label = player.id === playerId ? `${player.name} (you)` : player.name;
    li.textContent = label || "Player";
    playersList.appendChild(li);
  });
}

function renderClues(players) {
  cluesList.innerHTML = "";
  players.forEach((player) => {
    if (!player.clue) return;
    const li = document.createElement("li");
    li.textContent = `${player.name || "Player"}: ${player.clue}`;
    cluesList.appendChild(li);
  });
}

function renderVotes(players) {
  voteOptions.innerHTML = "";
  players.forEach((player) => {
    if (player.id === playerId) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Vote ${player.name || "Player"}`;
    button.addEventListener("click", () => {
      sendMessage({ type: "submit_vote", targetId: player.id });
    });
    voteOptions.appendChild(button);
  });
}

function renderResults(result) {
  if (!result) {
    resultsOutput.textContent = "";
    return;
  }
  const chameleonName =
    currentState.players.find((player) => player.id === result.chameleonId)?.name || "Unknown";
  const outcomeText =
    result.outcome === "team-wins"
      ? "The team wins! The chameleon guessed wrong."
      : result.outcome === "chameleon-wins"
      ? "The chameleon wins by guessing the word!"
      : "The chameleon escaped!";

  resultsOutput.innerHTML = `
    <p>${outcomeText}</p>
    <p>Secret word: <strong>${result.secretWord}</strong></p>
    <p>Chameleon: <strong>${chameleonName}</strong></p>
    ${result.guess ? `<p>Chameleon guess: <strong>${result.guess}</strong></p>` : ""}
  `;
}

function updatePhase(state) {
  const phaseMap = {
    lobby: "Waiting for players...",
    clue: "Share your clue!",
    vote: "Vote for the chameleon.",
    guess: "Chameleon guesses the word.",
    reveal: "Round over."
  };
  phaseText.textContent = phaseMap[state.phase] || "";

  const showClue = state.phase === "clue";
  const showVote = state.phase === "vote";
  const showGuess = state.phase === "guess" && isChameleon;

  cluePanel.style.display = showClue ? "block" : "none";
  votePanel.style.display = showVote ? "block" : "none";
  guessPanel.style.display = state.phase === "guess" ? "block" : "none";
  resultsPanel.style.display = state.phase === "reveal" ? "block" : "none";

  if (showVote) {
    renderVotes(state.players);
  }

  if (state.phase === "clue") {
    const remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
    timerText.textContent = `Time left: ${remaining}s`;
  } else {
    timerText.textContent = "";
  }

  if (showGuess) {
    guessInput.placeholder = "Secret word";
  }

  renderResults(state.lastResult);
}

function updateSecret(word) {
  if (word) {
    secretWordEl.textContent = word;
  } else {
    secretWordEl.textContent = "You are the chameleon. Blend in!";
  }
}

function handleState(state) {
  currentState = state;
  renderPlayers(state.players);
  renderClues(state.players);
  updatePhase(state);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage({ type: "join", name: nameInput.value });
  joinPanel.style.display = "none";
});

startButton.addEventListener("click", () => {
  sendMessage({ type: "start_round" });
});

clueForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage({ type: "submit_clue", clue: clueInput.value });
  clueInput.value = "";
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage({ type: "chameleon_guess", guess: guessInput.value });
  guessInput.value = "";
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "init") {
    playerId = message.id;
    handleState(message.state);
  }

  if (message.type === "state") {
    handleState(message.data);
  }

  if (message.type === "secret") {
    secretWord = message.word;
    isChameleon = !secretWord;
    updateSecret(secretWord);
  }

  if (message.type === "error") {
    alert(message.message);
  }
});

setInterval(() => {
  if (currentState?.phase === "clue") {
    updatePhase(currentState);
  }
}, 500);
