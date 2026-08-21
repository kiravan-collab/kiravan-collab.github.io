// ============================================================
// 미니게임 서랍 - 공용 랭킹 모듈
// 모든 게임 페이지 + 허브 페이지가 이 파일을 함께 사용합니다.
// Firestore 컬렉션 구조:
//   scores_{gameId} / {playerId}  -> { name, moves, timeSec, points, updatedAt }
//   players / {playerId}          -> { name, perGame: {gameId: points, ...}, totalPoints, updatedAt }
// ============================================================
(function (window) {
  "use strict";

  if (!window.firebase || !window.FIREBASE_CONFIG) {
    console.warn('[leaderboard] firebase 스크립트 또는 firebase-config.js 가 로드되지 않았습니다.');
    return;
  }
  if (window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey.indexOf('여기에') === 0) {
    console.warn('[leaderboard] firebase-config.js 에 아직 실제 프로젝트 키를 입력하지 않았습니다.');
  }

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();

  const PLAYER_ID_KEY = 'mg_player_id';
  const PLAYER_NAME_KEY = 'mg_player_name';

  function getPlayerId() {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }

  function getPlayerName() {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  }

  function setPlayerName(name) {
    name = (name || '').trim().slice(0, 20);
    if (name) localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  }

  // 게임별 성과(이동 횟수/걸린 시간)를 비교 가능한 포인트로 환산
  function computePoints(gameId, stats) {
    const moves = Math.max(0, stats.moves || 0);
    const timeSec = Math.max(0, stats.timeSec || 0);
    let raw;
    if (gameId === 'color-flood') {
      raw = 2000 - moves * 60 - timeSec * 4;
    } else if (gameId === 'lights-out') {
      raw = 2000 - moves * 50 - timeSec * 4;
    } else if (gameId === 'slide-puzzle') {
      raw = 2500 - moves * 20 - timeSec * 3;
    } else {
      raw = 2000 - moves * 50 - timeSec * 4;
    }
    return Math.max(100, Math.round(raw));
  }

  // 점수 제출: 이전 최고 기록보다 좋을 때만 갱신. players 컬렉션(합산용)도 함께 갱신.
  async function submitScore(gameId, stats) {
    const name = getPlayerName() || '익명';
    const playerId = getPlayerId();
    const points = computePoints(gameId, stats);

    const scoreRef = db.collection('scores_' + gameId).doc(playerId);
    const scoreSnap = await scoreRef.get();
    const prevPoints = scoreSnap.exists ? (scoreSnap.data().points || 0) : -1;

    let improved = false;
    if (points > prevPoints) {
      improved = true;
      await scoreRef.set({
        name: name,
        moves: stats.moves,
        timeSec: stats.timeSec,
        points: points,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      const perGame = playerSnap.exists ? (playerSnap.data().perGame || {}) : {};
      perGame[gameId] = points;
      const totalPoints = Object.keys(perGame).reduce((sum, k) => sum + (perGame[k] || 0), 0);

      await playerRef.set({
        name: name,
        perGame: perGame,
        totalPoints: totalPoints,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    const bestPoints = Math.max(points, prevPoints);
    const higherSnap = await db.collection('scores_' + gameId)
      .where('points', '>', bestPoints).get();
    const rank = higherSnap.size + 1;

    return { points: bestPoints, improved: improved, rank: rank };
  }

  async function fetchTopScores(gameId, limitCount) {
    const snap = await db.collection('scores_' + gameId)
      .orderBy('points', 'desc')
      .limit(limitCount || 10)
      .get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }

  async function fetchOverallTop(limitCount) {
    const snap = await db.collection('players')
      .orderBy('totalPoints', 'desc')
      .limit(limitCount || 10)
      .get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }

  window.MiniGameLeaderboard = {
    getPlayerId: getPlayerId,
    getPlayerName: getPlayerName,
    setPlayerName: setPlayerName,
    computePoints: computePoints,
    submitScore: submitScore,
    fetchTopScores: fetchTopScores,
    fetchOverallTop: fetchOverallTop
  };
})(window);
