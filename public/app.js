const ws = new WebSocket(`ws://${window.location.host}`);

let playerId = null;
let currentState = null;
let secretWord = null;
let isChameleon = false;
let hasJoined = false;

const joinScreen = document.getElementById("join-screen");
const gameScreen = document.getElementById("game-screen");
const joinForm = document.getElementById("join-form");
const nameInput = document.getElementById("name-input");
const phaseText = document.getElementById("phase-text");
const timerText = document.getElementById("timer-text");
const startButton = document.getElementById("start-button");
const resetButton = document.getElementById("reset-button");
const leaveButton = document.getElementById("leave-button");
const hostText = document.getElementById("host-text");
const categoryDisplay = document.getElementById("category-display");
const categoryLabel = document.querySelector('label[for="category-select"]');
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
const noticeText = document.getElementById("notice-text");

function setScreen(screen) {
  const showJoin = screen === "join";
  joinScreen.classList.toggle("active", showJoin);
  gameScreen.classList.toggle("active", !showJoin);
}

function sendMessage(payload) {
  ws.send(JSON.stringify(payload));
}

function renderPlayers(state) {
  playersList.innerHTML = "";
  const isHost = state.hostId === playerId;
  state.players.forEach((player) => {
    const li = document.createElement("li");
    const label = player.id === playerId ? `${player.name} (you)` : player.name;
    const points = player.score ?? 0;
    const pointLabel = points === 1 ? "point" : "points";
    li.classList.add("player-item");
    const info = document.createElement("span");
    info.textContent = `${label || "Player"} — ${points} ${pointLabel}`;
    li.appendChild(info);

    if (isHost) {
      const controls = document.createElement("div");
      controls.classList.add("score-controls");

      const decrementButton = document.createElement("button");
      decrementButton.type = "button";
      decrementButton.classList.add("score-button");
      decrementButton.textContent = "-1";
      decrementButton.addEventListener("click", () => {
        sendMessage({ type: "adjust_score", targetId: player.id, delta: -1 });
      });

      const incrementButton = document.createElement("button");
      incrementButton.type = "button";
      incrementButton.classList.add("score-button");
      incrementButton.textContent = "+1";
      incrementButton.addEventListener("click", () => {
        sendMessage({ type: "adjust_score", targetId: player.id, delta: 1 });
      });

      controls.appendChild(decrementButton);
      controls.appendChild(incrementButton);
      li.appendChild(controls);
    }
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
    result.reason === "chameleon-no-hint"
      ? "The chameleon skipped their hint and loses the round."
      : result.outcome === "team-wins"
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
    <p>The chameleon was: <strong>${chameleonName}</strong></p>
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
  const showGuess = state.phase === "guess";

  cluePanel.style.display = showClue ? "block" : "none";
  votePanel.style.display = showVote ? "block" : "none";
  guessPanel.style.display = showGuess ? "block" : "none";
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
      ? "Your turn! Give your hint now."
      : `Waiting for ${activeName} to share a hint.`;
    cluePanel.classList.toggle("your-turn", isYourTurn);
    clueInput.disabled = !isYourTurn || hasSubmitted;
    clueForm.querySelector("button").disabled = !isYourTurn || hasSubmitted;
  } else if (showGuess) {
    const remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
    timerText.textContent = `Chameleon guess: ${remaining}s left`;
  } else {
    clueTurnText.textContent = "";
    cluePanel.classList.remove("your-turn");
    clueInput.disabled = false;
    clueForm.querySelector("button").disabled = false;
    timerText.textContent = "";
  }

  if (showGuess) {
    const canGuess = isChameleon;
    guessInput.disabled = !canGuess;
    guessForm.querySelector("button").disabled = !canGuess;
    guessInput.placeholder = canGuess
      ? "Secret word"
      : "Only the chameleon can guess the secret word";
  } else {
    guessInput.disabled = false;
    guessForm.querySelector("button").disabled = false;
  }

  renderResults(state.lastResult);
}

function updateLobbyControls(state) {
  const hostName =
    state.players.find((player) => player.id === state.hostId)?.name || "Waiting for host...";
  hostText.textContent = state.hostId ? `Host: ${hostName}` : "Host: waiting for players...";
  const categoryName = state.selectedCategory || "Waiting for host selection...";
  categoryDisplay.textContent = `Category: ${categoryName}`;

  const canManage = playerId && playerId === state.hostId;
  const isRoundActive = state.phase === "clue" || state.phase === "vote" || state.phase === "guess";
  const hasEnoughPlayers = state.players.length >= 3;

  startButton.style.display = canManage ? "inline-flex" : "none";
  resetButton.style.display = canManage ? "inline-flex" : "none";
  categorySelect.style.display = canManage ? "block" : "none";
  categoryLabel.style.display = canManage ? "block" : "none";

  startButton.disabled = !canManage || isRoundActive || !hasEnoughPlayers;
  resetButton.disabled = !canManage;
  categorySelect.disabled = !canManage || isRoundActive;
  leaveButton.disabled = !playerId;

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

function showNotice(message) {
  noticeText.textContent = message || "";
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
  const you = state.players.find((player) => player.id === playerId);
  hasJoined = hasJoined || Boolean(you?.name);
  setScreen(hasJoined ? "game" : "join");
  if (state.phase === "lobby" && !state.lastResult) {
    secretWord = null;
    isChameleon = false;
    secretWordEl.textContent = "Join to receive a word.";
  }
  renderPlayers(state);
  renderClues(state.players);
  updatePhase(state);
  updateLobbyControls(state);
  renderVoteRecap(state);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage({ type: "join", name: nameInput.value });
  hasJoined = true;
  setScreen("game");
});

startButton.addEventListener("click", () => {
  sendMessage({ type: "start_round" });
});

resetButton.addEventListener("click", () => {
  sendMessage({ type: "start_new_game" });
});

leaveButton.addEventListener("click", () => {
  sendMessage({ type: "leave" });
  leaveButton.disabled = true;
  showNotice("You left the game. Refresh to join again.");
  ws.close();
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

  if (message.type === "notice") {
    showNotice(message.message);
  }
});

setInterval(() => {
  if (currentState?.phase === "clue" || currentState?.phase === "guess") {
    updatePhase(currentState);
  }
}, 500);
