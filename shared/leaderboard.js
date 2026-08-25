// ============================================================
// 미니게임 서랍 - 공용 랭킹 모듈
// 모든 게임 페이지 + 허브 페이지가 이 파일을 함께 사용합니다.
// Firestore 컬렉션 구조:
//   scores_{gameId} / {playerId}  -> { name, moves, timeSec, points, updatedAt }
//
//  전체 합산 랭킹(players 컬렉션)은 사용하지 않습니다.
//  게임마다 잘하는 기준이 달라 하나의 점수로 합치면 각 게임의 성격이 사라져서,
//  대신 '게임별 1위'를 모아 보여주는 방식으로 바꿨습니다.
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

  // ============================================================
  //  점수 환산
  //   모든 게임이 "아주 잘하면 1900점 안팎"이 되도록 맞춰,
  //   전체 합산 랭킹에서 특정 게임이 유리해지지 않게 했습니다.
  //
  //   freeMoves / freeTime : 이 이하는 감점하지 않는 여유분
  //   movePenalty / timePenalty : 여유분을 넘긴 만큼의 감점
  //
  //   게임마다 필요한 이동 수가 크게 달라(라이트 아웃 8수 vs 15퍼즐 60수)
  //   같은 감점을 쓰면 한쪽이 항상 최저점에 깔립니다. 그래서 게임별로
  //   실제 플레이 범위에 맞춘 계수를 따로 둡니다.
  // ============================================================
  const SCORE_CAP = 2000;   // 모든 게임 공통 상한
  const SCORE_MIN = 100;    // 퍼즐류 최저 보장 점수

  const SCORING = {
    'color-flood':  { freeMoves:10, movePenalty:60,  freeTime:15, timePenalty:6 },
    'lights-out':   { freeMoves:7,  movePenalty:45,  freeTime:15, timePenalty:5 },
    'slide-puzzle': { freeMoves:50, movePenalty:6,   freeTime:45, timePenalty:1.6 },
    'pipe-connect': { freeMoves:20, movePenalty:16,  freeTime:25, timePenalty:3.5 }
  };

  // 게임별 랭킹 점수 상한 — shared/firestore.rules 의 상한과 반드시 같게 유지
  const MAX_POINTS = {
    'bullet-storm': SCORE_CAP,
    'merge-2048':   SCORE_CAP,
    'slide-puzzle': SCORE_CAP,
    'pipe-connect': SCORE_CAP,
    'color-flood':  SCORE_CAP,
    'lights-out':   SCORE_CAP
  };
  function maxPointsOf(gameId) { return MAX_POINTS[gameId] || SCORE_CAP; }

  // 게임별 성과를 비교 가능한 포인트로 환산
  //  숫자가 아닌 값/음수/무한대가 들어와도 항상 0 ~ 상한 사이의 정수가 나옵니다.
  function computePoints(gameId, stats) {
    stats = stats || {};
    const num = function (v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; };

    // 점수형 게임 — 게임 안에서 이미 계산된 점수를 환산해서 씁니다
    if (gameId === 'bullet-storm') {
      return Math.max(0, Math.min(SCORE_CAP, Math.round(num(stats.score))));
    }
    // 숫자 합치기(1024 머지)는 게임 점수가 수천 단위라 1/4 로 줄입니다.
    //  (1024 타일 클리어 = 게임 점수 약 7,300~8,000 = 1800~2000점)
    if (gameId === 'merge-2048') {
      return Math.max(0, Math.min(SCORE_CAP, Math.round(num(stats.score) / 4)));
    }

    const c = SCORING[gameId] || SCORING['lights-out'];
    const overMoves = Math.max(0, num(stats.moves) - c.freeMoves);
    const overTime  = Math.max(0, num(stats.timeSec) - c.freeTime);
    const raw = SCORE_CAP - overMoves * c.movePenalty - overTime * c.timePenalty;
    return Math.max(SCORE_MIN, Math.min(SCORE_CAP, Math.round(raw)));
  }

  // 점수 제출: 이전 최고 기록보다 좋을 때만 갱신합니다.
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

  // 게임별 1위만 모아서 반환. 기록이 없는 게임은 champion 이 null 입니다.
  async function fetchChampions(gameIds) {
    const jobs = gameIds.map(function (gid) {
      return db.collection('scores_' + gid)
        .orderBy('points', 'desc').limit(1).get()
        .then(function (snap) {
          if (snap.empty) return { gameId: gid, champion: null };
          const d = snap.docs[0];
          return { gameId: gid, champion: Object.assign({ id: d.id }, d.data()) };
        })
        .catch(function () { return { gameId: gid, champion: null, failed: true }; });
    });
    return Promise.all(jobs);
  }

  window.MiniGameLeaderboard = {
    getPlayerId: getPlayerId,
    getPlayerName: getPlayerName,
    setPlayerName: setPlayerName,
    computePoints: computePoints,
    submitScore: submitScore,
    fetchTopScores: fetchTopScores,
    fetchChampions: fetchChampions
  };
})(window);
