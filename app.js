/* app.js — AI Sparck Static App (localStorage + Auth + App-like behavior) */

(function () {
  // ---------- Utilities ----------
  const STORAGE_KEY = "ai_sparck_state_v1";

  function nowISO() {
    return new Date().toISOString();
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function uid() {
    return Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("toast--show");
    setTimeout(() => el.classList.remove("toast--show"), 1800);
  }
  function timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const d = Math.floor(hr / 24);
    return `${d} day${d > 1 ? "s" : ""} ago`;
  }

  // ---------- State ----------
  const defaultState = {
    auth: {
      isLoggedIn: false,
      currentEmail: null,
    },
    // "users table" for demo auth
    users: [
      // example user (optional). You can remove it.
      // { email: "demo@ai-sparck.com", password: "password123", name: "Demo User" }
    ],
    user: { name: "Learner", level: "A2", goal: "Conversation", dailyMinutes: 10 },
    streak: 0,
    lastActiveDay: null,
    sessionsCompleted: 0,
    chat: [], // {id, role, content, ts}
    mistakes: [], // {id, category, original, corrected, explanation, ts}
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaultState), ...parsed };
    } catch {
      return structuredClone(defaultState);
    }
  }
  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureStreak(state) {
    const t = todayKey();
    if (state.lastActiveDay === t) return state;

    if (state.lastActiveDay) {
      const last = new Date(state.lastActiveDay);
      const today = new Date(t);
      const diffDays = Math.round((today - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) state.streak = (state.streak || 0) + 1;
      else state.streak = 1;
    } else {
      state.streak = 1;
    }

    state.lastActiveDay = t;
    return state;
  }

  // ---------- DOM helpers ----------
  function $(sel) {
    return document.querySelector(sel);
  }

  // ---------- Auth ----------
  function bindAuthSignup() {
    const form = $('[data-auth="signupForm"]');
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = ($('[data-auth="name"]')?.value || "").trim() || "Learner";
      const email = ($('[data-auth="email"]')?.value || "").trim().toLowerCase();
      const password = ($('[data-auth="password"]')?.value || "").trim();

      if (!email || !password) return toast("Please enter email and password.");
      if (password.length < 6) return toast("Password must be at least 6 characters.");

      const s = loadState();
      const exists = (s.users || []).some((u) => u.email === email);
      if (exists) return toast("Account already exists. Please log in.");

      s.users = s.users || [];
      s.users.push({ email, password, name });

      // create session
      s.auth.isLoggedIn = true;
      s.auth.currentEmail = email;

      // update display user profile
      s.user.name = name;

      saveState(s);
      toast("Account created ✅ Redirecting…");
      setTimeout(() => (location.href = "index.html"), 600);
    });
  }

  function bindAuthLogin() {
    const form = $('[data-auth="loginForm"]');
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = ($('[data-auth="email"]')?.value || "").trim().toLowerCase();
      const password = ($('[data-auth="password"]')?.value || "").trim();

      const s = loadState();
      const user = (s.users || []).find((u) => u.email === email);

      if (!user || user.password !== password) {
        toast("Invalid email or password.");
        return;
      }

      s.auth.isLoggedIn = true;
      s.auth.currentEmail = email;

      // load user name into profile
      s.user.name = user.name || "Learner";

      saveState(s);
      toast("Logged in ✅ Redirecting…");
      setTimeout(() => (location.href = "index.html"), 500);
    });
  }

  function bindLogoutButtons() {
    const btn = $('[data-action="logout"]');
    if (!btn) return;
    btn.addEventListener("click", () => {
      const s = loadState();
      s.auth.isLoggedIn = false;
      s.auth.currentEmail = null;
      saveState(s);
      toast("Logged out ✅");
      setTimeout(() => (location.href = "login.html"), 450);
    });
  }

  function requireAuthOrRedirect() {
    const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const publicPages = ["login.html", "signup.html"];

    const s = loadState();
    if (!s.auth?.isLoggedIn && !publicPages.includes(page)) {
      // redirect to login
      location.replace("login.html");
      return false;
    }

    // If already logged in, keep users out of auth pages
    if (s.auth?.isLoggedIn && publicPages.includes(page)) {
      location.replace("index.html");
      return false;
    }

    return true;
  }

  // ---------- Navigation active state ----------
  function setActiveNav() {
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav__item").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      a.classList.toggle("nav__item--active", href === path);
    });
  }

  // ---------- Dashboard ----------
  function bindDashboard() {
    const state = loadState();

    const nameEl = $('[data-bind="userName"]');
    const levelEl = $('[data-bind="userLevel"]');
    const goalEl = $('[data-bind="userGoal"]');
    const dailyEl = $('[data-bind="userDaily"]');

    if (nameEl) nameEl.textContent = state.user.name;
    if (levelEl) levelEl.textContent = state.user.level;
    if (goalEl) goalEl.textContent = state.user.goal;
    if (dailyEl) dailyEl.textContent = `${state.user.dailyMinutes} min`;

    const streakEl = $('[data-bind="streak"]');
    const correctionsEl = $('[data-bind="corrections"]');
    const sessionsEl = $('[data-bind="sessions"]');

    if (streakEl) streakEl.textContent = `${state.streak || 0} days`;
    if (correctionsEl) correctionsEl.textContent = String((state.mistakes || []).length);
    if (sessionsEl) sessionsEl.textContent = String(state.sessionsCompleted || 0);

    const list = $('[data-bind="recentMistakes"]');
    if (list) {
      const recent = (state.mistakes || []).slice(-4).reverse();
      list.innerHTML = recent.length
        ? recent
            .map(
              (m) => `
          <div class="mistake">
            <div class="mistake__meta">${escapeHtml(m.category)} · ${timeAgo(m.ts)}</div>
            <div class="mistake__text">
              ${escapeHtml(m.original)}
              <span class="arrow">→</span>
              <strong>${escapeHtml(m.corrected)}</strong>
            </div>
          </div>`
            )
            .join("")
        : `<div class="muted">No mistakes yet. Start Practice to generate corrections.</div>`;
    }

    const resetBtn = $('[data-action="resetApp"]');
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        // Keep users but reset progress/chat
        const s = loadState();
        s.streak = 0;
        s.lastActiveDay = null;
        s.sessionsCompleted = 0;
        s.chat = [];
        s.mistakes = [];
        saveState(s);
        toast("Progress reset ✅");
        setTimeout(() => location.reload(), 200);
      });
    }
  }

  // ---------- Lesson ----------
  function bindLesson() {
    const state = loadState();
    const levelEl = $('[data-bind="userLevel"]');
    const goalEl = $('[data-bind="userGoal"]');
    if (levelEl) levelEl.textContent = state.user.level;
    if (goalEl) goalEl.textContent = state.user.goal;

    const completeBtn = $('[data-action="completeLesson"]');
    if (completeBtn) {
      completeBtn.addEventListener("click", () => {
        const s = loadState();
        ensureStreak(s);
        s.sessionsCompleted = (s.sessionsCompleted || 0) + 1;
        saveState(s);
        toast("Lesson completed ✅ Progress updated");
        const to = completeBtn.getAttribute("data-next");
        if (to) setTimeout(() => (location.href = to), 450);
      });
    }

    const regenBtn = $('[data-action="regenLesson"]');
    if (regenBtn) {
      regenBtn.addEventListener("click", () => {
        toast("Regenerate is a demo button (hook it to AI later).");
      });
    }
  }

  // ---------- Chat tutor (simple rules) ----------
  function tutorReply(userText) {
    const t = userText.trim();
    const mistakes = [];

    if (/cafe\b/i.test(t) && !/café/i.test(t)) {
      mistakes.push({
        category: "Spelling",
        original: t,
        corrected: t.replace(/cafe\b/gi, "café"),
        explanation: "In French, 'café' uses an accent: café.",
      });
    }

    if (/^\s*(bonjour[, ]*)?je veux\b/i.test(t)) {
      const corrected = t.replace(/je veux/gi, "je voudrais");
      mistakes.push({
        category: "Politeness",
        original: t,
        corrected,
        explanation: "Use 'Je voudrais' to sound more polite than 'Je veux'.",
      });
    }

    if (/s\s*il\s*vous\s*plait/i.test(t) && !/s['’]il/i.test(t)) {
      const corrected = t.replace(/s\s*il\s*vous\s*plait/gi, "s’il vous plaît");
      mistakes.push({
        category: "Spelling",
        original: t,
        corrected,
        explanation: "Write: s’il vous plaît (apostrophe + accent).",
      });
    }

    let response = "";
    if (mistakes.length) {
      const top = mistakes[0];
      response += `Correction: <strong>${escapeHtml(top.corrected)}</strong> ✅<br/><span class="small">${escapeHtml(
        top.explanation
      )}</span><br/><br/>`;
      if (mistakes.length > 1) {
        response += `Also: <strong>${escapeHtml(mistakes[1].corrected)}</strong> ✅<br/><span class="small">${escapeHtml(
          mistakes[1].explanation
        )}</span><br/><br/>`;
      }
    } else {
      response += `Nice! ✅ Now say it again with one extra detail (size, sugar, or “to go”).<br/><br/>`;
    }

    const followUps = [
      "Sur place ou à emporter ?",
      "Tu veux un café ou un thé ?",
      "Avec du sucre ?",
      "Quelle taille (petit, moyen, grand) ?",
    ];
    response += `<em>${escapeHtml(followUps[Math.floor(Math.random() * followUps.length)])}</em>`;
    return { response, mistakes };
  }

  function appendBubble(container, role, html) {
    const div = document.createElement("div");
    div.className = `bubble ${role === "user" ? "bubble--user" : "bubble--assistant"}`;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ---------- Practice ----------
  function bindPractice() {
    const chatLog = $('[data-chat="log"]');
    const input = $('[data-chat="input"]');
    const sendBtn = $('[data-chat="send"]');
    const resetBtn = $('[data-action="resetChat"]');

    if (!chatLog || !input || !sendBtn) return;

    const state = loadState();
    chatLog.innerHTML = "";

    if (!state.chat.length) {
      state.chat.push({
        id: uid(),
        role: "assistant",
        content: "Salut! 😊 You’re at a café. Start by greeting me and ordering a drink.",
        ts: nowISO(),
      });
      saveState(state);
    }

    loadState().chat.forEach((m) => appendBubble(chatLog, m.role, escapeHtml(m.content)));

    function sendMessage() {
      const text = String(input.value || "").trim();
      if (!text) return;
      input.value = "";

      let s = loadState();
      ensureStreak(s);

      s.chat.push({ id: uid(), role: "user", content: text, ts: nowISO() });
      saveState(s);
      appendBubble(chatLog, "user", escapeHtml(text));

      const typing = document.createElement("div");
      typing.className = "typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      chatLog.appendChild(typing);
      chatLog.scrollTop = chatLog.scrollHeight;

      setTimeout(() => {
        typing.remove();

        const current = loadState();
        const { response, mistakes } = tutorReply(text);

        const assistantPlain = response
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .trim();

        current.chat.push({ id: uid(), role: "assistant", content: assistantPlain, ts: nowISO() });

        mistakes.forEach((m) => {
          current.mistakes.push({
            id: uid(),
            category: m.category,
            original: m.original,
            corrected: m.corrected,
            explanation: m.explanation,
            ts: nowISO(),
          });
        });

        saveState(current);
        appendBubble(chatLog, "assistant", response);

        if (mistakes.length) toast(`Logged ${mistakes.length} correction(s) ✅`);
      }, 450);
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const s = loadState();
        s.chat = [];
        saveState(s);
        toast("Chat reset ✅");
        setTimeout(() => location.reload(), 200);
      });
    }
  }

  // ---------- Progress ----------
  function bindProgress() {
    const state = loadState();

    const streakEl = $('[data-bind="streak"]');
    const correctionsEl = $('[data-bind="corrections"]');
    const sessionsEl = $('[data-bind="sessions"]');

    if (streakEl) streakEl.textContent = `${state.streak || 0} days`;
    if (correctionsEl) correctionsEl.textContent = String((state.mistakes || []).length);
    if (sessionsEl) sessionsEl.textContent = String(state.sessionsCompleted || 0);

    const list = $('[data-bind="mistakeLog"]');
    if (list) {
      const items = (state.mistakes || []).slice().reverse();
      list.innerHTML = items.length
        ? items
            .map(
              (m) => `
          <div class="mistake">
            <div class="mistake__meta">${escapeHtml(m.category)} · ${timeAgo(m.ts)}</div>
            <div class="mistake__text">
              ${escapeHtml(m.original)}
              <span class="arrow">→</span>
              <strong>${escapeHtml(m.corrected)}</strong>
              ${m.explanation ? `<div class="small" style="margin-top:6px">${escapeHtml(m.explanation)}</div>` : ""}
            </div>
          </div>`
            )
            .join("")
        : `<div class="muted">No mistakes logged yet. Go to Practice and send a message.</div>`;
    }

    const exportBtn = $('[data-action="exportJSON"]');
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(loadState(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "ai-sparck-export.json";
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }
  }

  // ---------- Boot ----------
  // 1) Route guard
  if (!requireAuthOrRedirect()) return;

  // 2) Nav active state (for app pages)
  setActiveNav();

  // 3) Bind logout (if exists on page)
  bindLogoutButtons();

  // 4) Page router
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  if (page === "signup.html") bindAuthSignup();
  if (page === "login.html") bindAuthLogin();

  if (page === "index.html" || page === "") bindDashboard();
  if (page === "lesson.html") bindLesson();
  if (page === "practice.html") bindPractice();
  if (page === "progress.html") bindProgress();
})();
