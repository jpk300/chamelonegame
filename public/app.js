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
const hostText = document.getElementById("host-text");
const categorySelect = document.getElementById("category-select");
const secretWordEl = document.getElementById("secret-word");
const cluePanel = document.getElementById("clue-panel");
const clueTurnText = document.getElementById("clue-turn-text");
const clueForm = document.getElementById("clue-form");
const clueInput = document.getElementById("clue-input");
const cluesList = document.getElementById("clues-list");
const votePanel = document.getElementById("vote-panel");
const voteOptions = document.getElementById("vote-options");
const voteStatus = document.getElementById("vote-status");
const guessPanel = document.getElementById("guess-panel");
const guessForm = document.getElementById("guess-form");
const guessInput = document.getElementById("guess-input");
const resultsPanel = document.getElementById("results-panel");
const resultsOutput = document.getElementById("results-output");
const voteRecapPanel = document.getElementById("vote-recap-panel");
const voteRecapList = document.getElementById("vote-recap-list");
const playersList = document.getElementById("players-list");

function sendMessage(payload) {
  ws.send(JSON.stringify(payload));
}

function renderPlayers(players) {
  playersList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    const label = player.id === playerId ? `${player.name} (you)` : player.name;
    const points = player.score ?? 0;
    const pointLabel = points === 1 ? "point" : "points";
    li.textContent = `${label || "Player"} — ${points} ${pointLabel}`;
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

function renderVotes(state) {
  voteOptions.innerHTML = "";
  if (isChameleon) {
    const message = document.createElement("p");
    message.textContent = "You are the chameleon and do not vote this round.";
    voteOptions.appendChild(message);
    return;
  }
  const yourVote = state.players.find((player) => player.id === playerId)?.vote;
  const hasVoted = Boolean(yourVote);
  state.players.forEach((player) => {
    if (player.id === playerId) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Vote ${player.name || "Player"}`;
    if (hasVoted) {
      button.disabled = true;
    }
    if (player.id === yourVote) {
      button.classList.add("selected-vote");
    }
    button.addEventListener("click", () => {
      sendMessage({ type: "submit_vote", targetId: player.id });
      voteStatus.textContent = "Vote submitted. Waiting for everyone else.";
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
      : result.voteUnanimous
      ? "The chameleon escaped the unanimous vote!"
      : "The chameleon escaped because the vote was not unanimous.";

  const winners =
    result.roundWinners?.map((winnerId) => getPlayerName(currentState.players, winnerId)) || [];
  const winnersText =
    winners.length > 0 ? `<p>Round winners: <strong>${winners.join(", ")}</strong></p>` : "";
  const unanimousDetail =
    result.outcome === "chameleon-escaped" && result.voteUnanimous && result.suspectedId
      ? `<p>Unanimous vote: <strong>${getPlayerName(
          currentState.players,
          result.suspectedId
        )}</strong></p>`
      : "";

  resultsOutput.innerHTML = `
    <p>${outcomeText}</p>
    <p>Secret word: <strong>${result.secretWord}</strong></p>
    <p>Chameleon: <strong>${chameleonName}</strong></p>
    ${unanimousDetail}
    ${result.guess ? `<p>Chameleon guess: <strong>${result.guess}</strong></p>` : ""}
    ${winnersText}
  `;
}

function renderVoteRecap(state) {
  const voteCount = state.players.filter((player) => Boolean(player.vote)).length;
  const requiredVotes = Math.max(0, state.players.length - 1);
  const allVoted = state.players.length > 0 && voteCount >= requiredVotes;

  if (!allVoted) {
    voteRecapPanel.style.display = "none";
    voteRecapList.innerHTML = "";
    return;
  }

  voteRecapPanel.style.display = "block";
  voteRecapList.innerHTML = "";
  state.players.forEach((player) => {
    const li = document.createElement("li");
    const voterName = player.id === playerId ? `${player.name || "Player"} (you)` : player.name;
    const targetName = getPlayerName(state.players, player.vote);
    li.textContent = `${voterName || "Player"} → ${targetName}`;
    voteRecapList.appendChild(li);
  });
}

function getPlayerName(players, targetId) {
  return players.find((player) => player.id === targetId)?.name || "Player";
}

function renderVoteStatus(state) {
  const yourVote = state.players.find((player) => player.id === playerId)?.vote;
  if (isChameleon) {
    voteStatus.textContent = "You are the chameleon. Wait for the team to vote.";
    return;
  }
  if (yourVote) {
    voteStatus.textContent = `Vote received: ${getPlayerName(state.players, yourVote)}.`;
  } else {
    voteStatus.textContent = "Choose a player. Only non-chameleons vote, and unanimity is required.";
  }
}

function updatePhase(state) {
  const phaseMap = {
    lobby: "Waiting for players...",
    clue: "Share your hint!",
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
    renderVotes(state);
    renderVoteStatus(state);
  } else {
    voteStatus.textContent = "";
  }

  if (state.phase === "clue") {
    const remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
    const activeName = getPlayerName(state.players, state.activeCluePlayerId);
    const isYourTurn = state.activeCluePlayerId === playerId;
    const hasSubmitted = Boolean(state.players.find((player) => player.id === playerId)?.clue);
    timerText.textContent = `${activeName}'s turn: ${remaining}s left`;
    clueTurnText.textContent = isYourTurn
      ? "It's your turn! Enter a one-word hint."
      : `Waiting for ${activeName} to share a hint.`;
    clueInput.disabled = !isYourTurn || hasSubmitted;
    clueForm.querySelector("button").disabled = !isYourTurn || hasSubmitted;
  } else {
    clueTurnText.textContent = "";
    clueInput.disabled = false;
    clueForm.querySelector("button").disabled = false;
    timerText.textContent = "";
  }

  if (showGuess) {
    guessInput.placeholder = "Secret word";
  }

  renderResults(state.lastResult);
}

function updateLobbyControls(state) {
  const hostName =
    state.players.find((player) => player.id === state.hostId)?.name || "Waiting for host...";
  hostText.textContent = state.hostId ? `Host: ${hostName}` : "Host: waiting for players...";

  const canManage = playerId && playerId === state.hostId;
  const isRoundActive = state.phase === "clue" || state.phase === "vote" || state.phase === "guess";

  startButton.disabled = !canManage || isRoundActive;
  categorySelect.disabled = !canManage || isRoundActive;

  categorySelect.innerHTML = "";
  (state.categories || []).forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
  if (state.selectedCategory) {
    categorySelect.value = state.selectedCategory;
  }
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
  updateLobbyControls(state);
  renderVoteRecap(state);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage({ type: "join", name: nameInput.value });
  joinPanel.style.display = "none";
});

startButton.addEventListener("click", () => {
  sendMessage({ type: "start_round" });
});

categorySelect.addEventListener("change", () => {
  sendMessage({ type: "select_category", category: categorySelect.value });
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
