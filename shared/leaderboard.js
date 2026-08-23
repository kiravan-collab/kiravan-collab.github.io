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

  const PLAYER_NAME_KEY = 'mg_player_name';

  // ----------------------------------------------------------
  //  익명 로그인
  //   기록 문서의 ID를 '검증 가능한' uid 로 고정하기 위한 것입니다.
  //   예전에는 localStorage 의 랜덤 문자열을 ID로 썼기 때문에
  //   누구나 남의 ID로 기록을 덮어쓰거나 지울 수 있었습니다.
  //   보안 규칙(shared/firestore.rules)이 uid 와 문서 ID가 같을 때만
  //   쓰기를 허용하므로, 이제 자기 기록 외에는 손댈 수 없습니다.
  // ----------------------------------------------------------
  let cachedUid = '';
  let authReady = null;

  function ensureAuth() {
    if (authReady) return authReady;
    if (!firebase.auth) {
      authReady = Promise.reject(new Error('firebase-auth-compat.js 가 로드되지 않았습니다.'));
      return authReady;
    }
    authReady = new Promise(function (resolve, reject) {
      const unsub = firebase.auth().onAuthStateChanged(function (user) {
        if (user) { unsub(); cachedUid = user.uid; resolve(user.uid); }
      }, reject);
      firebase.auth().signInAnonymously().catch(function (e) {
        console.warn('[leaderboard] 익명 로그인 실패 — Firebase 콘솔에서 Authentication > 로그인 방법 > 익명 을 사용 설정하세요.', e);
        reject(e);
      });
    });
    return authReady;
  }
  ensureAuth().catch(function () { /* 랭킹 없이도 게임은 동작 */ });

  // 로그인 전에는 빈 문자열. 랭킹 목록에서 '내 기록' 강조에만 쓰입니다.
  function getPlayerId() {
    return cachedUid;
  }

  function getPlayerName() {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  }

  function setPlayerName(name) {
    name = (name || '').trim().slice(0, 20);
    if (name) localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  }

  // 게임별 랭킹 점수 상한 — shared/firestore.rules 의 maxPoints() 와 반드시 같게 유지
  const MAX_POINTS = {
    'bullet-storm': 3000,
    'slide-puzzle': 2500,
    'pipe-connect': 2500,
    'color-flood': 2000,
    'lights-out': 2000
  };
  function maxPointsOf(gameId) { return MAX_POINTS[gameId] || 2000; }

  // 게임별 성과(이동 횟수/걸린 시간)를 비교 가능한 포인트로 환산
  //  숫자가 아닌 값/음수/무한대가 들어와도 항상 0 ~ 상한 사이의 정수가 나옵니다.
  function computePoints(gameId, stats) {
    stats = stats || {};
    const num = function (v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; };
    const moves = num(stats.moves);
    const timeSec = num(stats.timeSec);
    const cap = maxPointsOf(gameId);

    let raw, floor;
    if (gameId === 'bullet-storm') {
      raw = num(stats.score); floor = 0;            // 슈팅류는 게임 내 점수가 곧 랭킹 점수
    } else {
      floor = 100;
      if (gameId === 'color-flood')       raw = 2000 - moves * 60 - timeSec * 4;
      else if (gameId === 'lights-out')   raw = 2000 - moves * 50 - timeSec * 4;
      else if (gameId === 'slide-puzzle') raw = 2500 - moves * 20 - timeSec * 3;
      else if (gameId === 'pipe-connect') raw = 2500 - moves * 25 - timeSec * 3;
      else                                raw = 2000 - moves * 50 - timeSec * 4;
    }
    return Math.max(floor, Math.min(cap, Math.round(raw)));
  }

  // 점수 제출: 이전 최고 기록보다 좋을 때만 갱신. players 컬렉션(합산용)도 함께 갱신.
  //  기록은 반드시 '내 uid' 문서에만 쓰입니다 (보안 규칙과 동일 조건).
  async function submitScore(gameId, stats) {
    const playerId = await ensureAuth();      // 로그인 완료 후에만 기록
    const name = (getPlayerName() || '익명').slice(0, 20);
    const points = computePoints(gameId, stats);

    const scoreRef = db.collection('scores_' + gameId).doc(playerId);
    const scoreSnap = await scoreRef.get();
    const prevPoints = scoreSnap.exists ? (scoreSnap.data().points || 0) : -1;

    let improved = false;
    if (points > prevPoints) {
      improved = true;
      const clamp = function (v, hi) {
        v = Math.round(Number(v));
        return isFinite(v) && v > 0 ? Math.min(v, hi) : 0;
      };
      await scoreRef.set({
        name: name,
        moves: clamp(stats.moves, 100000),
        timeSec: clamp(stats.timeSec, 86400),
        points: points,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      const perGame = playerSnap.exists ? (playerSnap.data().perGame || {}) : {};
      perGame[gameId] = points;
      // 저장된 값이 오염돼 있어도 각 게임 상한으로 잘라서 합산
      Object.keys(perGame).forEach(function (k) {
        perGame[k] = Math.max(0, Math.min(maxPointsOf(k), Math.round(Number(perGame[k])) || 0));
      });
      const totalPoints = Object.keys(perGame).reduce(function (sum, k) { return sum + perGame[k]; }, 0);

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
