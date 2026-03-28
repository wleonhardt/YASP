import { io } from "socket.io-client";

const URL = "http://localhost:3001";
const DELAY = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connect(name) {
  return new Promise((resolve) => {
    const socket = io(URL, { transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.sessionId = `session-${name.toLowerCase().replace(/\s/g, "-")}`;
    socket.displayName = name;
    socket.on("server_error", (err) => {
      console.log(`  [${name}] SERVER ERROR: ${err.code} — ${err.message}`);
    });
  });
}

function emit(socket, event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (res) => resolve(res));
  });
}

function logState(label, state) {
  const voters = state.participants.filter((p) => p.role === "voter");
  const spectators = state.participants.filter((p) => p.role === "spectator");
  const voted = voters.filter((p) => p.hasVoted).length;

  console.log(`\n  ── ${label} ──`);
  console.log(`  Room: ${state.id} | Round: ${state.roundNumber} | Revealed: ${state.revealed}`);
  console.log(`  Deck: ${state.deck.label}`);
  console.log(
    `  Participants (${state.participants.length}: ${voters.length} voters, ${spectators.length} spectators):`
  );
  for (const p of state.participants) {
    const badges = [];
    if (p.isModerator) badges.push("MOD");
    if (p.role === "spectator") badges.push("spectator");
    if (p.hasVoted) badges.push("voted");
    if (!p.connected) badges.push("offline");
    const vote = state.votes?.[p.id] ?? "";
    const voteStr = vote ? ` → ${vote}` : "";
    console.log(`    ${p.name} [${badges.join(", ")}]${voteStr}`);
  }
  if (state.revealed && state.votes) {
    console.log(`  Votes: ${JSON.stringify(state.votes)}`);
  } else {
    console.log(`  Votes hidden | ${voted}/${voters.length} voted`);
  }
  if (state.stats) {
    const s = state.stats;
    console.log(
      `  Stats: avg=${s.numericAverage ?? "N/A"} | mode=${s.mostCommon ?? "N/A"} | consensus=${s.consensus} | total=${s.totalVotes}`
    );
    console.log(`  Distribution: ${JSON.stringify(s.distribution)}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  YASP Simulation — 4 participants, 3 rounds");
  console.log("═══════════════════════════════════════════\n");

  // Connect all 4 clients
  console.log("Connecting clients...");
  const [alice, bob, carol, dave] = await Promise.all([
    connect("Alice"),
    connect("Bob"),
    connect("Carol"),
    connect("Dave"),
  ]);
  console.log("All 4 clients connected.\n");

  // Alice creates the room (she's the moderator)
  console.log("▸ Alice creates room with Modified Fibonacci deck...");
  const createRes = await emit(alice, "create_room", {
    sessionId: alice.sessionId,
    displayName: "Alice",
    requestedRole: "voter",
    deck: { type: "modified_fibonacci" },
  });
  if (!createRes.ok) {
    console.error("Failed to create room:", createRes.error);
    process.exit(1);
  }
  const roomId = createRes.data.roomId;
  console.log(`  Room created: ${roomId}`);
  logState("After create", createRes.data.state);
  await sleep(DELAY);

  // Bob, Carol, Dave join
  for (const [socket, role] of [
    [bob, "voter"],
    [carol, "voter"],
    [dave, "spectator"],
  ]) {
    const name = socket.displayName;
    console.log(`\n▸ ${name} joins as ${role}...`);
    const joinRes = await emit(socket, "join_room", {
      roomId,
      sessionId: socket.sessionId,
      displayName: name,
      requestedRole: role,
    });
    if (!joinRes.ok) {
      console.error(`  ${name} failed to join:`, joinRes.error);
    } else {
      logState(`After ${name} joins`, joinRes.data.state);
    }
    await sleep(DELAY);
  }

  // ═══════════════════════════════════════
  // ROUND 1 — Consensus round
  // ═══════════════════════════════════════
  console.log("\n\n╔═══════════════════════════════════════╗");
  console.log("║         ROUND 1 — Easy consensus       ║");
  console.log("╚═══════════════════════════════════════╝");

  const round1Votes = [
    [alice, "5"],
    [bob, "5"],
    [carol, "5"],
  ];

  for (const [socket, value] of round1Votes) {
    const name = socket.displayName;
    console.log(`\n▸ ${name} votes ${value}...`);
    const res = await emit(socket, "cast_vote", { roomId, value });
    if (!res.ok) console.log(`  FAILED: ${res.error.message}`);
    await sleep(DELAY);
  }

  // Dave tries to vote (spectator — should fail)
  console.log("\n▸ Dave (spectator) tries to vote 8...");
  const daveVote = await emit(dave, "cast_vote", { roomId, value: "8" });
  console.log(
    `  Result: ${daveVote.ok ? "OK" : `REJECTED — ${daveVote.error.code}: ${daveVote.error.message}`}`
  );
  await sleep(DELAY);

  // Alice reveals
  console.log("\n▸ Alice reveals votes...");
  const revealRes1 = await emit(alice, "reveal_votes", { roomId });
  if (revealRes1.ok) {
    // Get fresh state from Alice's perspective
    const stateRes = await emit(alice, "join_room", {
      roomId,
      sessionId: alice.sessionId,
      displayName: "Alice",
      requestedRole: "voter",
    });
    if (stateRes.ok) logState("Round 1 revealed", stateRes.data.state);
  }
  await sleep(DELAY);

  // ═══════════════════════════════════════
  // ROUND 2 — Split votes
  // ═══════════════════════════════════════
  console.log("\n\n╔═══════════════════════════════════════╗");
  console.log("║        ROUND 2 — Split opinions        ║");
  console.log("╚═══════════════════════════════════════╝");

  console.log("\n▸ Alice advances to next round...");
  const nextRes = await emit(alice, "next_round", { roomId });
  if (nextRes.ok) {
    const stateRes = await emit(alice, "join_room", {
      roomId,
      sessionId: alice.sessionId,
      displayName: "Alice",
      requestedRole: "voter",
    });
    if (stateRes.ok) logState("Round 2 started", stateRes.data.state);
  }
  await sleep(DELAY);

  const round2Votes = [
    [alice, "3"],
    [bob, "8"],
    [carol, "5"],
  ];

  for (const [socket, value] of round2Votes) {
    const name = socket.displayName;
    console.log(`\n▸ ${name} votes ${value}...`);
    const res = await emit(socket, "cast_vote", { roomId, value });
    if (!res.ok) console.log(`  FAILED: ${res.error.message}`);
    await sleep(DELAY);
  }

  // Bob changes his mind before reveal
  console.log("\n▸ Bob changes vote from 8 to 5...");
  const bobChange = await emit(bob, "cast_vote", { roomId, value: "5" });
  if (!bobChange.ok) console.log(`  FAILED: ${bobChange.error.message}`);
  await sleep(DELAY);

  // Alice reveals
  console.log("\n▸ Alice reveals votes...");
  const revealRes2 = await emit(alice, "reveal_votes", { roomId });
  if (revealRes2.ok) {
    const stateRes = await emit(alice, "join_room", {
      roomId,
      sessionId: alice.sessionId,
      displayName: "Alice",
      requestedRole: "voter",
    });
    if (stateRes.ok) logState("Round 2 revealed", stateRes.data.state);
  }
  await sleep(DELAY);

  // ═══════════════════════════════════════
  // ROUND 3 — Reset then re-vote
  // ═══════════════════════════════════════
  console.log("\n\n╔═══════════════════════════════════════╗");
  console.log("║     ROUND 3 — Reset and re-estimate    ║");
  console.log("╚═══════════════════════════════════════╝");

  console.log("\n▸ Alice advances to next round...");
  await emit(alice, "next_round", { roomId });
  await sleep(DELAY);

  // First attempt
  const round3aVotes = [
    [alice, "13"],
    [bob, "20"],
    [carol, "8"],
  ];

  for (const [socket, value] of round3aVotes) {
    console.log(`\n▸ ${socket.displayName} votes ${value}...`);
    await emit(socket, "cast_vote", { roomId, value });
    await sleep(DELAY);
  }

  // Alice peeks at progress then decides to reset for discussion
  console.log("\n▸ Alice resets the round (too spread out, needs discussion)...");
  const resetRes = await emit(alice, "reset_round", { roomId });
  if (resetRes.ok) {
    const stateRes = await emit(alice, "join_room", {
      roomId,
      sessionId: alice.sessionId,
      displayName: "Alice",
      requestedRole: "voter",
    });
    if (stateRes.ok) logState("After reset (votes cleared, same round)", stateRes.data.state);
  }
  await sleep(DELAY);

  // Re-vote after discussion
  console.log("\n  (Team discusses... converges on 13)");
  const round3bVotes = [
    [alice, "13"],
    [bob, "13"],
    [carol, "13"],
  ];

  for (const [socket, value] of round3bVotes) {
    console.log(`\n▸ ${socket.displayName} votes ${value}...`);
    await emit(socket, "cast_vote", { roomId, value });
    await sleep(DELAY);
  }

  // Bob tries to reveal (not moderator, policy is moderator_only)
  console.log("\n▸ Bob tries to reveal (not moderator)...");
  const bobReveal = await emit(bob, "reveal_votes", { roomId });
  console.log(
    `  Result: ${bobReveal.ok ? "OK" : `REJECTED — ${bobReveal.error.code}: ${bobReveal.error.message}`}`
  );
  await sleep(DELAY);

  // Alice reveals
  console.log("\n▸ Alice reveals votes...");
  const revealRes3 = await emit(alice, "reveal_votes", { roomId });
  if (revealRes3.ok) {
    const stateRes = await emit(alice, "join_room", {
      roomId,
      sessionId: alice.sessionId,
      displayName: "Alice",
      requestedRole: "voter",
    });
    if (stateRes.ok) logState("Round 3 revealed (after reset)", stateRes.data.state);
  }
  await sleep(DELAY);

  // ═══════════════════════════════════════
  // Wrap up
  // ═══════════════════════════════════════
  console.log("\n\n═══════════════════════════════════════════");
  console.log("  Simulation complete — 3 rounds finished");
  console.log("═══════════════════════════════════════════");

  // Everyone leaves
  for (const socket of [dave, carol, bob, alice]) {
    console.log(`\n▸ ${socket.displayName} leaves...`);
    await emit(socket, "leave_room", { roomId });
    socket.disconnect();
    await sleep(200);
  }

  console.log("\nAll clients disconnected. Done.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
