(function () {
  if (window.StudentLiveWorkout) return;

  let currentEvent = null;
  let exercises = [];
  let currentIdx = 0;
  let sessionStartTime = null;
  let sessionTimerInterval = null;
  let restTimerInterval = null;
  let restSecondsLeft = 0;
  let completedSetsByExercise = new Map(); // idx -> Set of set numbers

  let overlay = null;
  let confettiCanvas = null;

  function playTone(freq1, freq2, duration = 0.2) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(freq1, now);
      if (freq2) osc.frequency.setValueAtTime(freq2, now + duration / 2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {}
  }

  function triggerHaptic() {
    try {
      if ('vibrate' in navigator) navigator.vibrate([35, 45, 35]);
    } catch (_) {}
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function buildDOM() {
    overlay = document.createElement('div');
    overlay.className = 'live-player-overlay hidden';
    overlay.id = 'live-player-overlay';
    overlay.innerHTML = `
      <div class="live-player-header">
        <div class="live-player-timer" id="live-session-timer">⏱ 00:00</div>
        <div class="live-player-progress-badge" id="live-exercise-counter">Exercício 1 de 1</div>
        <button class="live-player-close-btn" id="live-player-close" type="button" aria-label="Sair do treino">✕</button>
      </div>
      <div class="live-player-progress-bar">
        <div class="live-player-progress-fill" id="live-progress-fill" style="width: 0%;"></div>
      </div>
      <div class="live-player-body" id="live-player-body">
        <!-- Rendered dynamically -->
      </div>
      <div class="live-player-footer">
        <button class="live-nav-btn prev" id="live-prev-btn" type="button">‹ Anterior</button>
        <button class="live-nav-btn next" id="live-next-btn" type="button">Próximo ›</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#live-player-close')?.addEventListener('click', () => {
      if (confirm('Deseja realmente pausar ou sair da sessão de treino?')) {
        close();
      }
    });

    overlay.querySelector('#live-prev-btn')?.addEventListener('click', () => {
      if (currentIdx > 0) {
        currentIdx--;
        renderCurrentExercise();
      }
    });

    overlay.querySelector('#live-next-btn')?.addEventListener('click', () => {
      if (currentIdx < exercises.length - 1) {
        currentIdx++;
        renderCurrentExercise();
      } else {
        openVictoryModal();
      }
    });
  }

  function start(workoutEvent) {
    if (!workoutEvent || !workoutEvent.exercises?.length) {
      alert('Esta ficha não possui exercícios cadastrados para hoje.');
      return;
    }

    if (!overlay) buildDOM();

    currentEvent = workoutEvent;
    exercises = workoutEvent.exercises;
    currentIdx = 0;
    completedSetsByExercise.clear();

    sessionStartTime = Date.now();
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(updateSessionTimer, 1000);

    overlay.classList.remove('hidden');
    document.body.classList.add('live-workout-active');

    renderCurrentExercise();
  }

  function close() {
    clearInterval(sessionTimerInterval);
    clearInterval(restTimerInterval);
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('live-workout-active');
    document.getElementById('live-victory-modal')?.remove();
    stopConfetti();
  }

  function updateSessionTimer() {
    if (!sessionStartTime) return;
    const elapsedSecs = Math.floor((Date.now() - sessionStartTime) / 1000);
    const node = document.getElementById('live-session-timer');
    if (node) node.textContent = `⏱ ${formatTime(elapsedSecs)}`;
  }

  function renderCurrentExercise() {
    const item = exercises[currentIdx];
    if (!item) return;

    // Update Counter & Progress Fill
    const counter = document.getElementById('live-exercise-counter');
    if (counter) counter.textContent = `Exercício ${currentIdx + 1} de ${exercises.length}`;

    const fill = document.getElementById('live-progress-fill');
    if (fill) {
      const pct = Math.round(((currentIdx + 1) / exercises.length) * 100);
      fill.style.width = `${pct}%`;
    }

    // Update Nav buttons
    const prevBtn = document.getElementById('live-prev-btn');
    if (prevBtn) prevBtn.disabled = currentIdx === 0;

    const nextBtn = document.getElementById('live-next-btn');
    if (nextBtn) {
      if (currentIdx === exercises.length - 1) {
        nextBtn.textContent = '🏁 Concluir Treino';
        nextBtn.className = 'live-nav-btn finish';
      } else {
        nextBtn.textContent = 'Próximo ›';
        nextBtn.className = 'live-nav-btn next';
      }
    }

    // Total sets
    const totalSets = Number(item.sets) || 3;
    if (!completedSetsByExercise.has(currentIdx)) {
      completedSetsByExercise.set(currentIdx, new Set());
    }
    const completedSetNumbers = completedSetsByExercise.get(currentIdx);

    const body = document.getElementById('live-player-body');
    if (!body) return;

    body.innerHTML = `
      <div class="live-exercise-card">
        <div class="live-exercise-media" id="live-media-host"></div>
        <div class="live-exercise-details">
          <div class="live-exercise-tags">
            ${item.muscle_group_primary || item.muscle_group ? `<span class="live-tag">${item.muscle_group_primary || item.muscle_group}</span>` : ''}
            ${item.equipment ? `<span class="live-tag">${item.equipment}</span>` : ''}
            <span class="live-tag">${item.rest_seconds ?? 60}s descanso</span>
          </div>
          <h3 class="live-exercise-title">${item.exercise_name || item.name || 'Exercício'}</h3>
          <p class="live-exercise-instructions">${item.instructions || 'Execute o movimento com controle e postura adequada.'}</p>
        </div>
      </div>

      <!-- Rest timer box (initially hidden or shown when active) -->
      <div id="live-rest-timer-box" class="live-rest-timer-box ${restTimerInterval ? '' : 'hidden'}">
        <div class="live-rest-left">
          <span>Descanso</span>
          <div class="live-rest-clock" id="live-rest-clock">00:00</div>
        </div>
        <div class="live-rest-actions">
          <button class="live-rest-btn" id="live-rest-add15" type="button">+15s</button>
          <button class="live-rest-btn skip" id="live-rest-skip" type="button">Pular</button>
        </div>
      </div>

      <div class="live-sets-section">
        <div class="live-sets-header">
          <h4>Séries planejadas</h4>
          <span style="font-size:12px;color:#94a3b8;">${completedSetNumbers.size}/${totalSets} concluídas</span>
        </div>
        <div id="live-sets-list" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
    `;

    // Render Media
    const mediaHost = body.querySelector('#live-media-host');
    if (mediaHost) {
      if (item.video_url && window.AcademiaTrainingMedia) {
        window.AcademiaTrainingMedia.appendVideoPreview(mediaHost, item.video_url);
      } else if (item.image_url) {
        const img = document.createElement('img');
        img.src = item.image_url;
        img.alt = item.exercise_name || 'Exercício';
        mediaHost.appendChild(img);
      } else {
        mediaHost.innerHTML = '<span style="color:#64748b;font-size:13px;">Sem demonstração em vídeo</span>';
      }
    }

    // Render Sets
    const setsList = body.querySelector('#live-sets-list');
    if (setsList) {
      for (let s = 1; s <= totalSets; s++) {
        const isDone = completedSetNumbers.has(s);
        const row = document.createElement('div');
        row.className = `live-set-row ${isDone ? 'is-completed' : ''}`;
        row.innerHTML = `
          <div class="live-set-info">
            <span class="live-set-num">${s}</span>
            <span class="live-set-target">${item.reps || '10-12'} reps</span>
          </div>
          <button class="live-set-check-btn" type="button">
            ${isDone ? '✓ Feito' : 'Concluir Série'}
          </button>
        `;

        row.querySelector('.live-set-check-btn').addEventListener('click', () => {
          if (completedSetNumbers.has(s)) {
            completedSetNumbers.delete(s);
            renderCurrentExercise();
          } else {
            completedSetNumbers.add(s);
            playTone(587.33, 880);
            triggerHaptic();
            renderCurrentExercise();
            startRestTimer(Number(item.rest_seconds) || 60);
          }
        });

        setsList.appendChild(row);
      }
    }

    // Rest controls
    body.querySelector('#live-rest-add15')?.addEventListener('click', () => {
      restSecondsLeft += 15;
      updateRestClock();
    });

    body.querySelector('#live-rest-skip')?.addEventListener('click', stopRestTimer);
  }

  function startRestTimer(seconds) {
    stopRestTimer();
    restSecondsLeft = seconds;
    const box = document.getElementById('live-rest-timer-box');
    if (box) box.classList.remove('hidden');
    updateRestClock();

    restTimerInterval = setInterval(() => {
      restSecondsLeft--;
      if (restSecondsLeft <= 0) {
        stopRestTimer();
        playTone(880, 1174.66, 0.4); // Chime
        triggerHaptic();
      } else {
        updateRestClock();
      }
    }, 1000);
  }

  function updateRestClock() {
    const clock = document.getElementById('live-rest-clock');
    if (clock) clock.textContent = formatTime(Math.max(0, restSecondsLeft));
  }

  function stopRestTimer() {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
    const box = document.getElementById('live-rest-timer-box');
    if (box) box.classList.add('hidden');
  }

  function openVictoryModal() {
    clearInterval(sessionTimerInterval);
    const elapsedSecs = Math.floor((Date.now() - sessionStartTime) / 1000);

    let totalCompletedSets = 0;
    completedSetsByExercise.forEach((set) => {
      totalCompletedSets += set.size;
    });

    startConfetti();
    playTone(523.25, 1046.5, 0.5);

    const modal = document.createElement('div');
    modal.className = 'live-victory-modal';
    modal.id = 'live-victory-modal';
    modal.innerHTML = `
      <div class="live-victory-card">
        <div class="live-victory-trophy">🏆</div>
        <h2 style="font-size:24px;font-weight:850;margin:0;color:#ffffff;">Treino Concluído!</h2>
        <p style="margin:0;font-size:14px;color:#94a3b8;">Excelente dedicação! Sua sessão de hoje foi registrada no seu histórico.</p>
        
        <div class="live-victory-stats">
          <div class="live-stat-item">
            <strong>${formatTime(elapsedSecs)}</strong>
            <span>Duração total</span>
          </div>
          <div class="live-stat-item">
            <strong>${totalCompletedSets}</strong>
            <span>Séries realizadas</span>
          </div>
        </div>

        <div class="live-rpe-slider-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label for="live-rpe-slider">Esforço percebido (RPE):</label>
            <strong id="live-rpe-val" style="color:#38bdf8;font-size:16px;">7 / 10</strong>
          </div>
          <input type="range" id="live-rpe-slider" min="1" max="10" value="7" />
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;">
            <span>1 Leve</span>
            <span>5 Moderado</span>
            <span>8 Intenso</span>
            <span>10 Máximo</span>
          </div>
        </div>

        <textarea class="live-victory-comment" id="live-victory-notes" placeholder="Como você se sentiu hoje? (Opcional)"></textarea>

        <button class="live-victory-submit-btn" id="live-save-btn" type="button">Salvar e Concluir</button>
      </div>
    `;

    document.body.appendChild(modal);

    const slider = modal.querySelector('#live-rpe-slider');
    const rpeVal = modal.querySelector('#live-rpe-val');
    slider?.addEventListener('input', () => {
      if (rpeVal) rpeVal.textContent = `${slider.value} / 10`;
    });

    modal.querySelector('#live-save-btn')?.addEventListener('click', async () => {
      const btn = modal.querySelector('#live-save-btn');
      btn.disabled = true;
      btn.textContent = 'Salvando no histórico...';

      try {
        if (window.StudentPortal) {
          await window.StudentPortal.api('/api/student/training/complete', {
            method: 'POST',
            body: JSON.stringify({
              plan_id: currentEvent.plan_id || currentEvent.id,
              workout_day_id: currentEvent.id,
              perceived_effort: Number(slider.value),
              feedback: modal.querySelector('#live-victory-notes')?.value.trim() || null
            })
          });
        }
        close();
        alert('🎉 Parabéns! Treino salvo com sucesso!');
        window.location.reload();
      } catch (err) {
        alert(`Erro ao salvar treino: ${err.message || 'Falha na conexão'}`);
        btn.disabled = false;
        btn.textContent = 'Tentar novamente';
      }
    });
  }

  // Pure Canvas Confetti Burst Engine
  let confettiAnimId = null;
  function startConfetti() {
    if (!confettiCanvas) {
      confettiCanvas = document.createElement('canvas');
      confettiCanvas.id = 'live-confetti-canvas';
      document.body.appendChild(confettiCanvas);
    }
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff'];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: confettiCanvas.width / 2,
        y: confettiCanvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10
      });
    }

    function renderConfetti() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // Gravity
        p.rotation += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      confettiAnimId = requestAnimationFrame(renderConfetti);
    }

    renderConfetti();
    setTimeout(stopConfetti, 4500);
  }

  function stopConfetti() {
    if (confettiAnimId) {
      cancelAnimationFrame(confettiAnimId);
      confettiAnimId = null;
    }
    if (confettiCanvas) {
      confettiCanvas.remove();
      confettiCanvas = null;
    }
  }

  window.StudentLiveWorkout = { start, close };
}());
