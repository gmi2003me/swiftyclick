console.log('--- script.js started ---'); // VERY FIRST LINE

document.addEventListener('DOMContentLoaded', () => {
    console.log('--- DOMContentLoaded event fired ---'); // INSIDE DOMContentLoaded

    const welcomeScreen = document.getElementById('welcome-screen');
    const gameScreen = document.getElementById('game-screen');
    const summaryScreen = document.getElementById('summary-screen');

    // Mode selection buttons
    const onePlayerButton = document.getElementById('one-player-button');
    const twoPlayerButton = document.getElementById('two-player-button');
    const playAgainButton = document.getElementById('play-again-button');

    // Player 1 DOM Elements
    const player1Area = document.getElementById('player1-area');
    const timerDisplayP1 = document.getElementById('timer-display-p1');
    const clickZoneP1 = document.getElementById('click-zone-p1');
    const clickCountDisplayP1 = document.getElementById('click-count-p1');
    const cpsGaugeNeedleP1 = document.getElementById('cps-gauge-needle-p1');
    const cpsGaugeValueP1 = document.getElementById('cps-gauge-value-p1');

    // Player 2 DOM Elements
    const player2Area = document.getElementById('player2-area');
    const timerDisplayP2 = document.getElementById('timer-display-p2');
    const clickZoneP2 = document.getElementById('click-zone-p2');
    const clickCountDisplayP2 = document.getElementById('click-count-p2');
    const cpsGaugeNeedleP2 = document.getElementById('cps-gauge-needle-p2');
    const cpsGaugeValueP2 = document.getElementById('cps-gauge-value-p2');

    // Summary screen elements
    const summaryResults = document.getElementById('summary-results');
    const winnerMessage = document.getElementById('winner-message');

    // Race track elements
    const raceTrackContainer = document.getElementById('race-track-container');
    const horseP1 = document.getElementById('horse-p1');
    const horseP2 = document.getElementById('horse-p2');
    const trackElement = document.getElementById('track');
    console.log("Initial track element selected:", trackElement); // Log after selection

    const initialTime = 10;
    let gameMode = '1P'; // '1P' or '2P'
    let overallGameStarted = false; // Tracks if the countdown has started for any player
    let overallTimerId = null;
    let overallTimeLeft = initialTime;
    let firstPlayerClicked = false; // To ensure timer starts only once for both in 2P mode
    let masterGameStartTimeAudioCtx = 0; // ADD THIS LINE

    // Player data objects
    let players = {
        p1: {
            clicks: 0,
            gameStartTimeStamp: 0,
            audioCtx: null,
            tapGain: null,
            toneOscillator: null,
            toneGain: null,
            // UI elements specific to P1
            clickCountDisplay: clickCountDisplayP1,
            timerDisplay: timerDisplayP1,
            cpsGaugeNeedle: cpsGaugeNeedleP1,
            cpsGaugeValue: cpsGaugeValueP1,
            clickZone: clickZoneP1,
            horseElement: horseP1
        },
        p2: {
            clicks: 0,
            gameStartTimeStamp: 0,
            audioCtx: null, 
            tapGain: null,
            toneOscillator: null,
            toneGain: null,
            // UI elements specific to P2
            clickCountDisplay: clickCountDisplayP2,
            timerDisplay: timerDisplayP2,
            cpsGaugeNeedle: cpsGaugeNeedleP2,
            cpsGaugeValue: cpsGaugeValueP2,
            clickZone: clickZoneP2,
            horseElement: horseP2
        }
    };

    function initAudio(playerKey) {
        const player = players[playerKey];
        if (!player.audioCtx) {
            try {
                player.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (!player.tapGain) {
                    player.tapGain = player.audioCtx.createGain();
                    player.tapGain.gain.setValueAtTime(0.3, player.audioCtx.currentTime);
                    player.tapGain.connect(player.audioCtx.destination);
                }
            } catch (e) {
                console.error("Failed to initialize AudioContext for", playerKey, e);
            }
        }
    }

    function playTapSound(playerKey) {
        const player = players[playerKey];
        if (!player.audioCtx || !player.tapGain) return;
        try {
            const oscillator = player.audioCtx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, player.audioCtx.currentTime);
            const individualTapGain = player.audioCtx.createGain();
            individualTapGain.gain.setValueAtTime(1, player.audioCtx.currentTime);
            individualTapGain.gain.exponentialRampToValueAtTime(0.0001, player.audioCtx.currentTime + 0.1);
            oscillator.connect(individualTapGain);
            individualTapGain.connect(player.tapGain);
            oscillator.start();
            oscillator.stop(player.audioCtx.currentTime + 0.1);
        } catch (e) {
            console.error("Error playing tap sound for", playerKey, e);
        }
    }

    function startOrUpdateCPSTone(playerKey) {
        const player = players[playerKey];
        if (!player.audioCtx ) { // Removed other conditions for broader updateGaugeDisplay call
            updateGaugeDisplay(playerKey, 0); 
            return;
        }
        
        if (overallGameStarted && !player.gameStartTimeStamp && player.audioCtx) { // If game started but player just joined
             player.gameStartTimeStamp = player.audioCtx.currentTime;
        }

        if (!player.gameStartTimeStamp && masterGameStartTimeAudioCtx === 0 && !overallGameStarted){
            updateGaugeDisplay(playerKey, 0); // Before game starts, gauge is 0
            return;
        }
        
        let trulyElapsedTime = 0;
        if(player.gameStartTimeStamp && player.audioCtx){
            trulyElapsedTime = player.audioCtx.currentTime - player.gameStartTimeStamp;
        } else if (masterGameStartTimeAudioCtx && player.audioCtx) { // Fallback for P2 if P1 started master time
            trulyElapsedTime = player.audioCtx.currentTime - masterGameStartTimeAudioCtx;
        }

        const minimumSensibleElapsedTime = 0.05;
        const effectiveElapsedTime = Math.max(minimumSensibleElapsedTime, trulyElapsedTime);
        const currentCPS = (player.clicks > 0 && effectiveElapsedTime > 0) ? (player.clicks / effectiveElapsedTime) : 0;

        updateGaugeDisplay(playerKey, currentCPS);
        
        if (!overallGameStarted || !player.gameStartTimeStamp) { // Don't start tone if game/player not active
            return;
        }

        try {
            const baseFrequency = 150;
            let frequency = baseFrequency + (currentCPS * 50);
            frequency = Math.max(100, Math.min(frequency, 1500));

            if (!player.toneOscillator) {
                player.toneOscillator = player.audioCtx.createOscillator();
                player.toneGain = player.audioCtx.createGain();
                player.toneOscillator.type = 'sawtooth';
                player.toneOscillator.frequency.setValueAtTime(frequency, player.audioCtx.currentTime);
                player.toneGain.gain.setValueAtTime(0.1, player.audioCtx.currentTime);
                player.toneOscillator.connect(player.toneGain);
                player.toneGain.connect(player.audioCtx.destination);
                player.toneOscillator.start();
            } else {
                player.toneOscillator.frequency.linearRampToValueAtTime(frequency, player.audioCtx.currentTime + 0.1);
            }
        } catch (e) {
            console.error("Error in CPSTone for", playerKey, e);
        }
    }

    function stopCPSTone(playerKey) {
        const player = players[playerKey];
        if (player.toneOscillator && player.audioCtx) {
            try {
                player.toneOscillator.stop(player.audioCtx.currentTime + 0.05);
            } catch (e) { /* Might be stopped */ }
            player.toneOscillator.disconnect();
            player.toneOscillator = null;
        }
        if (player.toneGain) {
            player.toneGain.disconnect();
            player.toneGain = null;
        }
        updateGaugeDisplay(playerKey, 0);
    }

    function showScreen(screenElement) {
        welcomeScreen.classList.remove('active');
        gameScreen.classList.remove('active');
        summaryScreen.classList.remove('active');
        screenElement.classList.add('active');

        if (screenElement === gameScreen) {
            if (gameMode === '1P') {
                player1Area.style.display = 'flex';
                if(player2Area) player2Area.style.display = 'none';
                if(raceTrackContainer) raceTrackContainer.style.display = 'none';
            } else if (gameMode === '2P') {
                player1Area.style.display = 'flex';
                if(player2Area) player2Area.style.display = 'flex';
                if(raceTrackContainer) raceTrackContainer.style.display = 'flex'; // Show for 2P
            }
        }
    }

    function resetPlayer(playerKey) {
        const player = players[playerKey];
        player.clicks = 0;
        player.gameStartTimeStamp = 0;
        if (player.toneOscillator) stopCPSTone(playerKey); // also updates gauge
        else updateGaugeDisplay(playerKey, 0); // ensure gauge reset if tone wasn't playing
        
        player.clickCountDisplay.textContent = '0';
        player.timerDisplay.textContent = initialTime;

        if (player.horseElement) {
            player.horseElement.style.transform = 'translateX(0px)'; // Reset horse position
        }
    }

    function resetGame() {
        overallGameStarted = false;
        firstPlayerClicked = false;
        if (overallTimerId) {
            clearInterval(overallTimerId);
            overallTimerId = null;
        }
        overallTimeLeft = initialTime;
        masterGameStartTimeAudioCtx = 0; // ADD THIS LINE to reset
        resetPlayer('p1');
        if (gameMode === '2P') {
            resetPlayer('p2');
        }
        // Ensure timer displays are explicitly set after player resets
        players.p1.timerDisplay.textContent = initialTime;
        if (gameMode === '2P') {
            players.p2.timerDisplay.textContent = initialTime;
        }
    }
    
    function overallGameTick() {
        overallTimeLeft--;
        players.p1.timerDisplay.textContent = overallTimeLeft;
        if (gameMode === '2P') {
            players.p2.timerDisplay.textContent = overallTimeLeft;
        }

        if (players.p1.gameStartTimeStamp > 0 && players.p1.audioCtx) {
            startOrUpdateCPSTone('p1');
        }
        if (gameMode === '2P' && players.p2.gameStartTimeStamp > 0 && players.p2.audioCtx) {
            startOrUpdateCPSTone('p2');
        }
        
        if (gameMode === '2P') {
            updateHorseRaceDisplay(); 
        }

        if (overallTimeLeft <= 0) {
            endGame();
        }
    }

    function startGame() { 
        console.log('--- startGame CALLED, gameMode:', gameMode, '---'); // AT THE START OF startGame
        resetGame();
        showScreen(gameScreen);
        // Actual timer start is deferred to first click via processClickAction -> startOverallTimer
    }

    function startOverallTimer(initiatingPlayerKey) {
        if (!overallGameStarted) {
            initAudio(initiatingPlayerKey); 
            if (!players[initiatingPlayerKey].audioCtx) { 
                console.error(`Cannot start timer: AudioContext is NULL for ${initiatingPlayerKey} after initAudio.`);
                return;
            }

            const audioCtxForMasterTime = players[initiatingPlayerKey].audioCtx;
            console.log(`--- startOverallTimer: For ${initiatingPlayerKey}, audioCtx object:`, audioCtxForMasterTime);
            console.log(`--- startOverallTimer: For ${initiatingPlayerKey}, audioCtx.state: ${audioCtxForMasterTime.state}, audioCtx.currentTime before rAF: ${audioCtxForMasterTime.currentTime}`);

            if (audioCtxForMasterTime.state === 'suspended') {
                audioCtxForMasterTime.resume().then(() => {
                    console.log(`--- startOverallTimer: AudioContext for ${initiatingPlayerKey} RESUMED.`);
                    requestAnimationFrame(() => {
                        const resumedTime = audioCtxForMasterTime.currentTime;
                        console.log(`--- startOverallTimer: Post-resume, post-rAF currentTime: ${resumedTime}`);
                        proceedWithTimerStart(initiatingPlayerKey, resumedTime);
                    });
                }).catch(e => {
                    console.error(`--- startOverallTimer: Error resuming AudioContext for ${initiatingPlayerKey}:`, e);
                    requestAnimationFrame(() => { // Fallback with rAF even on resume error
                        proceedWithTimerStart(initiatingPlayerKey, audioCtxForMasterTime.currentTime); 
                    });
                });
            } else { // If running (or closed, though closed shouldn't happen here)
                requestAnimationFrame(() => { // Use rAF even if already running to ensure currentTime ticks
                    const currentTimeToUse = audioCtxForMasterTime.currentTime;
                    console.log(`--- startOverallTimer: State is ${audioCtxForMasterTime.state}, post-rAF currentTime: ${currentTimeToUse}`);
                    proceedWithTimerStart(initiatingPlayerKey, currentTimeToUse);
                });
            }
        }
    }

    // proceedWithTimerStart remains largely the same, but masterTime is now passed after rAF
    function proceedWithTimerStart(initiatingPlayerKey, masterTime) {
        let timeToUse = masterTime;
        if (timeToUse === 0) {
            console.warn(`--- proceedWithTimerStart: masterTime was 0 for ${initiatingPlayerKey}. Using a tiny offset (0.001) as masterGameStartTimeAudioCtx instead.`);
            timeToUse = 0.001; // Assign a tiny non-zero value
        }

        overallGameStarted = true;
        firstPlayerClicked = true; 
        masterGameStartTimeAudioCtx = timeToUse; // Use timeToUse
        console.log(`--- proceedWithTimerStart: masterGameStartTimeAudioCtx SET to ${masterGameStartTimeAudioCtx} by ${initiatingPlayerKey} ---`); 

        const now = masterGameStartTimeAudioCtx; 
        players[initiatingPlayerKey].gameStartTimeStamp = now;
        if (gameMode === '2P') {
            const otherPlayerKey = initiatingPlayerKey === 'p1' ? 'p2' : 'p1';
            initAudio(otherPlayerKey);
            if(players[otherPlayerKey].audioCtx) {
                const otherAudioCtx = players[otherPlayerKey].audioCtx;
                let otherPlayerTime = 0;
                if (otherAudioCtx.state === 'suspended') {
                    otherAudioCtx.resume().then(() => {
                        requestAnimationFrame(() => { 
                            otherPlayerTime = otherAudioCtx.currentTime;
                            if (otherPlayerTime === 0) otherPlayerTime = 0.001; // Also apply for other player
                            players[otherPlayerKey].gameStartTimeStamp = otherPlayerTime;
                            console.log(`--- proceedWithTimerStart: AudioContext for ${otherPlayerKey} RESUMED & rAF, timestamped at ${players[otherPlayerKey].gameStartTimeStamp}`);
                        });
                    });
                } else {
                    requestAnimationFrame(() => { 
                        otherPlayerTime = otherAudioCtx.currentTime;
                        if (otherPlayerTime === 0) otherPlayerTime = 0.001; // Also apply for other player
                        players[otherPlayerKey].gameStartTimeStamp = otherPlayerTime;
                        console.log(`--- proceedWithTimerStart: AudioContext for ${otherPlayerKey} state ${otherAudioCtx.state} & rAF, timestamped at ${players[otherPlayerKey].gameStartTimeStamp}`);
                    });
                }
            } else {
                console.warn("Audio context for other player not ready on global start for timestamping.");
            }
        }
        
        overallTimerId = setInterval(overallGameTick, 1000);
        startOrUpdateCPSTone(initiatingPlayerKey); 
        if (gameMode === '2P') {
            updateHorseRaceDisplay();
        }
    }

    function processClickAction(playerKey) {
        initAudio(playerKey); 
        const player = players[playerKey];
        if (!player.audioCtx) { // Guard if audio failed for this player
             console.warn("Cannot process click: Audio context not ready for", playerKey);
            return;
        }

        if (!overallGameStarted) {
            startOverallTimer(playerKey);
        } else if (gameMode === '2P' && !player.gameStartTimeStamp) {
            player.gameStartTimeStamp = player.audioCtx.currentTime; 
        }

        if (overallGameStarted && overallTimeLeft > 0) {
            player.clicks++;
            player.clickCountDisplay.textContent = player.clicks;
            playTapSound(playerKey);
            if (player.gameStartTimeStamp > 0) {
                startOrUpdateCPSTone(playerKey); 
                if (gameMode === '2P') { 
                    updateHorseRaceDisplay(); 
                }
            }
        }
    }

    function endGame() {
        if(overallTimerId) clearInterval(overallTimerId);
        overallTimerId = null;
        overallGameStarted = false;
        firstPlayerClicked = false;

        // Stop tones for both players
        stopCPSTone('p1');
        if (gameMode === '2P') {
            stopCPSTone('p2');
        }

        let resultsHTML = '';
        const cpsP1 = (players.p1.clicks / initialTime).toFixed(2);
        resultsHTML += `<p>Player 1 Score: <span>${cpsP1}</span> CPS</p>`;

        if (gameMode === '2P') {
            const cpsP2 = (players.p2.clicks / initialTime).toFixed(2);
            resultsHTML += `<p>Player 2 Score: <span>${cpsP2}</span> CPS</p>`;
            
            if (parseFloat(cpsP1) > parseFloat(cpsP2)) {
                winnerMessage.textContent = 'Player 1 Wins!';
            } else if (parseFloat(cpsP2) > parseFloat(cpsP1)) {
                winnerMessage.textContent = 'Player 2 Wins!';
            } else {
                winnerMessage.textContent = 'It\'s a Tie!';
            }
        } else {
            winnerMessage.textContent = 'Good Game!'; // Or clear it
        }
        summaryResults.innerHTML = resultsHTML;
        showScreen(summaryScreen);
    }

    function updateGaugeDisplay(playerKey, cps) {
        const player = players[playerKey];
        if (!player.cpsGaugeNeedle || !player.cpsGaugeValue) return;
        const maxCPS = 15;
        const minAngle = -90;
        const maxAngle = 90;
        let cpsValue = Math.min(cps, maxCPS);
        cpsValue = Math.max(0, cpsValue);
        const percentageOfMax = cpsValue / maxCPS;
        const angle = minAngle + (percentageOfMax * (maxAngle - minAngle));
        player.cpsGaugeNeedle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        player.cpsGaugeValue.textContent = cps.toFixed(1) + ' CPS';
    }

    function updateHorseRaceDisplay() {
        // console.log("updateHorseRaceDisplay CALLED"); // Keep this if you want, or remove if too noisy once fixed.
        if (masterGameStartTimeAudioCtx === 0) {
            console.log(`HorseDisplay: EXITING because masterGameStartTimeAudioCtx is 0. GameMode: ${gameMode}`);
            return;
        }
        if (gameMode !== '2P' || !trackElement) {
            console.log(`HorseDisplay: EXITING. GameMode: ${gameMode}, TrackElement: ${!!trackElement}`);
            return;
        }

        const p1 = players.p1;
        const p2 = players.p2;

        const audioCtxForTime = p1.audioCtx || p2.audioCtx || (initAudio('p1'), p1.audioCtx);
        if (!audioCtxForTime) {
            console.log('HorseDisplay: Early exit - no audioCtxForTime'); // UNCOMMENTED
            return;
        }

        if (!p1.horseElement || !p2.horseElement) {
            console.log('HorseDisplay: Early exit - no horse elements'); // UNCOMMENTED
            return;
        }

        const trackWidth = trackElement.offsetWidth;
        const cssHorseWidth = 40; 
        const horseWidth = p1.horseElement.offsetWidth || cssHorseWidth; 

        console.log(`HorseDisplay: trackW=${trackWidth}, horseW=${horseWidth}`); // UNCOMMENTED

        if (trackWidth < (horseWidth + 40)) { 
            console.warn('HorseDisplay: Track width too small or not available yet:', trackWidth); // UNCOMMENTED
            return; 
        }

        let currentRaceTimeElapsed = audioCtxForTime.currentTime - masterGameStartTimeAudioCtx;
        currentRaceTimeElapsed = Math.max(0, Math.min(currentRaceTimeElapsed, initialTime));

        const calculateProjectedClicks = (player) => {
            if (!player.gameStartTimeStamp || !player.audioCtx) {
                 console.log(`CalcProjected: Player ${player === p1 ? 'P1' : 'P2'} - no startTimeStamp or audioCtx. Clicks=${player.clicks}`);
                return 0; 
            }
            
            const playerEffectiveStartTime = Math.max(player.gameStartTimeStamp, masterGameStartTimeAudioCtx);
            let activeTime = audioCtxForTime.currentTime - playerEffectiveStartTime;
            activeTime = Math.max(0.01, activeTime); 

            const cps = player.clicks / activeTime;
            const projected = cps * initialTime; 
            console.log(`CalcProjected: Player ${player === p1 ? 'P1' : 'P2'}, Clicks=${player.clicks}, ActiveT=${activeTime.toFixed(2)}, CPS=${cps.toFixed(2)}, Projected=${projected.toFixed(2)}`); // UNCOMMENTED
            return projected;
        };

        const projectedTotalClicksP1 = calculateProjectedClicks(p1);
        const projectedTotalClicksP2 = calculateProjectedClicks(p2);

        const finishLineVisualRightEdgeOffset = 20; 
        const finishLinePosition = trackWidth - finishLineVisualRightEdgeOffset - horseWidth;

        if (finishLinePosition <= 0) {
            console.error('HorseDisplay: Cannot calculate valid finishLinePosition:', finishLinePosition, 'TrackW:', trackWidth, 'HorseW:', horseWidth); // UNCOMMENTED & EXPANDED
            return; 
        }

        const trackProgressRatio = (initialTime > 0) ? (currentRaceTimeElapsed / initialTime) : 0;

        let targetXP1, targetXP2;

        if (projectedTotalClicksP1 >= projectedTotalClicksP2) {
            targetXP1 = trackProgressRatio * finishLinePosition;
            if (projectedTotalClicksP1 > 0) { 
                targetXP2 = (projectedTotalClicksP2 / projectedTotalClicksP1) * targetXP1;
            } else { 
                targetXP2 = targetXP1; 
            }
        } else { 
            targetXP2 = trackProgressRatio * finishLinePosition;
            targetXP1 = (projectedTotalClicksP2 > 0) ? (projectedTotalClicksP1 / projectedTotalClicksP2) * targetXP2 : targetXP2;
        }
        
        console.log(`HorseDisplay: TimeRatio=${trackProgressRatio.toFixed(2)}, FinishPos=${finishLinePosition.toFixed(0)}, P1_Proj=${projectedTotalClicksP1.toFixed(0)}, P2_Proj=${projectedTotalClicksP2.toFixed(0)}, TgtXP1=${targetXP1.toFixed(0)}, TgtXP2=${targetXP2.toFixed(0)}`); // UNCOMMENTED

        if (!isNaN(targetXP1) && !isNaN(targetXP2)) {
            p1.horseElement.style.transform = `translateX(${Math.max(0, Math.min(targetXP1, finishLinePosition))}px)`;
            p2.horseElement.style.transform = `translateX(${Math.max(0, Math.min(targetXP2, finishLinePosition))}px)`;
        } else {
            console.error('HorseDisplay: NaN targetX calculated.'); // UNCOMMENTED
        }
    }

    clickZoneP1.addEventListener('click', () => processClickAction('p1'));
    if (clickZoneP2) { 
        clickZoneP2.addEventListener('click', () => processClickAction('p2'));
    }

    document.addEventListener('keydown', (event) => {
        // If game screen is active but timer hasn't started yet
        if (gameScreen.classList.contains('active') && !overallGameStarted) {
            if (event.key.toLowerCase() === 'w') {
                event.preventDefault();
                processClickAction('p1');
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (gameMode === '2P') {
                    processClickAction('p2');
                } else { // 1P mode
                    processClickAction('p1');
                }
            }
            return; // Action processed, no further checks needed for this keydown event
        }

        // If game is actively running
        if (overallGameStarted && overallTimeLeft > 0) {
            if (event.key.toLowerCase() === 'w') {
                processClickAction('p1');
            } else if (event.key === 'ArrowUp') {
                event.preventDefault(); // Prevent scrolling
                if (gameMode === '2P') {
                    processClickAction('p2');
                } else { // 1P mode
                    processClickAction('p1');
                }
            }
            return; // Action processed
        }

        // If game has ended (overallTimeLeft <= 0) or some other state, do nothing for these keys.
    });

    onePlayerButton.addEventListener('click', () => {
        gameMode = '1P';
        startGame();
    });

    twoPlayerButton.addEventListener('click', () => {
        gameMode = '2P';
        startGame();
    });

    playAgainButton.addEventListener('click', () => {
        startGame();
    });

    showScreen(welcomeScreen);
});