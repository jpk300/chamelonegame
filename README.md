# Kayser Chameleon Game

A lightweight local multiplayer party game inspired by the Chameleon. One player is secretly the chameleon and does not see the word. Everyone gives a quick clue, votes, and the chameleon can guess the word if caught.

## Requirements

- Node.js 18+

## Running locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in multiple tabs or on different devices on the same network.

## How to play

1. Each player joins with a name.
2. Start the round (minimum 3 players).
3. Everyone but the chameleon sees the secret word.
4. Players have 45 seconds to submit a clue (missing a hint costs a point).
5. Everyone but the chameleon votes on who the chameleon is.
6. If the vote is unanimous and correct, the chameleon gets a final guess. If the chameleon skips their hint, the team wins immediately.
