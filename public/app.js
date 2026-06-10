import {
  buildShareUrl,
  clampProgress,
  dashboardStats,
  deadlineLabel,
  escapeHtml,
  filterSlotsForView,
  filterTasksForView,
  formatDateTime,
  labelForType,
  slotTypeLabel,
  sortUpcomingSlots,
  statusLabel,
  taskCompletionSummary,
  updatePlanItem,
  updateSlotItem,
  updateTaskItem,
  weeklyStudySeries,
  upsertCheckin,
} from "./app-utils.js";

const tabs = [
  ["overview", "总览"],
  ["plans", "学习计划"],
  ["tasks", "每日任务"],
  ["checkins", "打卡"],
  ["booking", "预约"],
];

const $ = (id) => document.getElementById(id);
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const today = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

let activeTab = "overview";
let inviteCode = "";
let currentMemberId = "";
let state = null;
let polling = null;
let taskFilter = "all";
let taskDate = today();
let taskQuery = "";
let checkDate = today();
let slotTypeFilter = "all";
let slotStatusFilter = "active";
let slotQuery = "";
let editingPlanId = "";
let editingTaskId = "";
let editingSlotId = "";

const clientId = localStorage.getItem("study-client-id") || uid("client");
localStorage.setItem("study-client-id", clientId);
const urlInvite = new URLSearchParams(window.location.search).get("invite");
if (urlInvite) $("invite").value = urlInvite.trim().toUpperCase();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

function activeMember() {
  return state?.members.find((member) => member.id === currentMemberId) || state?.members[0] || null;
}

function memberName(memberId) {
  return state?.members.find((member) => member.id === memberId)?.nickname || "未指定";
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function setNotice(message, type = "ok") {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice show ${type === "bad" ? "bad" : "ok"}`;
  clearTimeout(setNotice.timer);
  setNotice.timer = setTimeout(() => {
    notice.className = "notice";
  }, 2600);
}

function setJoinError(message) {
  const error = $("joinError");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

$("joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setJoinError("");
  try {
    inviteCode = $("invite").value.trim().toUpperCase();
    const nickname = $("nickname").value.trim();
    const joined = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode, nickname, clientId }),
    });
    state = joined;
    currentMemberId = joined.member.id;
    $("entry").classList.add("hidden");
    $("app").classList.remove("hidden");
    render();
    clearInterval(polling);
    polling = setInterval(loadLatest, 3500);
  } catch (error) {
    setJoinError(error.message);
  }
});

$("refreshBtn").addEventListener("click", loadLatest);
$("shareBtn").addEventListener("click", shareInvite);
$("exportBtn").addEventListener("click", exportBackup);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", importBackup);
$("switchBtn").addEventListener("click", () => {
  clearInterval(polling);
  polling = null;
  state = null;
  inviteCode = "";
  currentMemberId = "";
  $("app").classList.add("hidden");
  $("entry").classList.remove("hidden");
});

async function loadLatest() {
  if (!inviteCode) return;
  try {
    state = await api(`/api/state?inviteCode=${encodeURIComponent(inviteCode)}`);
    if (!state.members.some((member) => member.id === currentMemberId)) {
      currentMemberId = state.members[0]?.id || "";
    }
    $("syncLabel").textContent = "已同步";
    render();
  } catch (error) {
    $("syncLabel").textContent = "同步失败";
    setNotice(error.message, "bad");
  }
}

async function save(message = "已保存") {
  state = await api("/api/state", {
    method: "POST",
    body: JSON.stringify({ inviteCode, state }),
  });
  $("syncLabel").textContent = message;
  render();
}

async function mutate(change, message) {
  try {
    $("syncLabel").textContent = "保存中";
    state = await api(`/api/state?inviteCode=${encodeURIComponent(inviteCode)}`);
    if (!state.members.some((member) => member.id === currentMemberId)) {
      currentMemberId = state.members[0]?.id || "";
    }
    change();
    render();
    await save(message);
    setNotice(message || "已保存");
  } catch (error) {
    const conflict = error.message.includes("数据已更新");
    setNotice(conflict ? "数据已更新，页面已刷新，请重新操作一次" : error.message, "bad");
    await loadLatest();
  }
}

async function exportBackup() {
  try {
    const backup = await api(`/api/export?inviteCode=${encodeURIComponent(inviteCode)}`);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${inviteCode}-study-backup.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("备份已导出");
  } catch (error) {
    setNotice(error.message, "bad");
  }
}

async function shareInvite() {
  const url = buildShareUrl(window.location.href, inviteCode || $("invite").value);
  const text = `打开这个学习计划链接，输入你的昵称即可加入：${url}`;
  try {
    await navigator.clipboard.writeText(text);
    setNotice("邀请链接已复制");
  } catch {
    window.prompt("复制邀请链接", text);
    setNotice("邀请链接已生成");
  }
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state = await api("/api/import", { method: "POST", body: text });
    inviteCode = state.group.inviteCode;
    currentMemberId = state.members.some((member) => member.id === currentMemberId)
      ? currentMemberId
      : state.members[0]?.id || "";
    $("invite").value = inviteCode;
    render();
    setNotice("备份已导入");
  } catch (error) {
    setNotice(error.message, "bad");
  } finally {
    event.target.value = "";
  }
}

function render() {
  if (!state) return;
  const date = today();
  $("dateLabel").textContent = `今天 ${date}`;
  $("title").textContent = tabs.find(([key]) => key === activeTab)?.[1] || "总览";
  $("inviteLabel").textContent = state.group.inviteCode;
  renderNav();
  renderMembers();
  const viewRenderers = { overview, plans, tasks, checkins, booking };
  viewRenderers[activeTab]();
}

function renderNav() {
  $("nav").innerHTML = tabs
    .map(([key, label]) => `<button class="${activeTab === key ? "active" : ""}" data-tab="${key}" type="button">${label}</button>`)
    .join("");
  $("nav").querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      render();
    });
  });
}

function renderMembers() {
  $("members").innerHTML = state.members
    .map((member) => `<button class="${member.id === currentMemberId ? "active" : ""}" data-member="${escapeHtml(member.id)}" type="button">${escapeHtml(member.nickname)}</button>`)
    .join("");
  $("members").querySelectorAll("[data-member]").forEach((button) => {
    button.addEventListener("click", () => {
      currentMemberId = button.dataset.member;
      render();
    });
  });
}

function overview() {
  const stats = dashboardStats(state, today());
  const completion = stats.todayTasks ? Math.round((stats.completedTasks / stats.todayTasks) * 100) : 0;
  const upcoming = sortUpcomingSlots(state.slots).slice(0, 4);
  const week = weeklyStudySeries(state.checkins, today());
  const completionSummary = taskCompletionSummary(state.tasks);
  const active = activeMember();
  $("view").innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">当前成员：${escapeHtml(active?.nickname || "学习成员")}</p>
        <h3>今天的目标不是把自己逼满，是让计划真的往前走。</h3>
        <p>这里聚合今日任务、学习时长、计划进度和最近预约。你和同学打开同一个公网地址后，会看到同一份实时更新的数据。</p>
      </div>
      <img src="/study-room.png" alt="学习桌面" />
    </section>
    <section class="metrics">
      ${metric("今日任务", `${stats.completedTasks}/${stats.todayTasks}`, `${completion}% 完成`)}
      ${metric("今日学习", `${stats.minutes} 分钟`, "两人合计")}
      ${metric("已确认预约", `${stats.confirmedSlots} 个`, "个人与共同自习")}
      ${metric("成员", `${stats.members} 人`, state.group.inviteCode)}
    </section>
    <section class="grid-2">
      ${panel("今日任务", todayTasks().map((task) => taskRow(task, false)).join("") || empty("今天还没有任务"))}
      ${panel("最近预约", upcoming.map((slot) => slotRow(slot, false)).join("") || empty("还没有预约学习时间"))}
    </section>
    <section class="grid-2">
      ${panel("近 7 天学习趋势", weeklyChart(week))}
      ${panel("任务完成率", completionBlocks(completionSummary))}
    </section>
    <section class="cards">
      ${state.plans.slice(0, 4).map(planCard).join("") || empty("先去添加一个考研或期末复习计划")}
    </section>
  `;
}

function plans() {
  $("view").innerHTML = `
    <form class="form" id="planForm">
      <h3>新增学习计划</h3>
      <div class="form-row">
        <label>类型 <select name="type"><option value="kaoyan">考研</option><option value="final">期末</option></select></label>
        <label>科目 <input name="subject" placeholder="数学 / 英语 / 专业课" required /></label>
      </div>
      <div class="form-row">
        <label>阶段 <input name="stage" placeholder="基础复盘 / 强化刷题" required /></label>
        <label>截止日期 <input name="deadline" type="date" value="${today()}" required /></label>
      </div>
      <label>阶段目标 <textarea name="target" placeholder="写清楚这一阶段要完成什么" required></textarea></label>
      <div class="form-row">
        <label>初始进度 <input name="progress" type="number" min="0" max="100" value="0" /></label>
        <label>负责人 <select name="ownerId">${memberOptions()}</select></label>
      </div>
      <button class="primary" type="submit">添加计划</button>
    </form>
    <section class="cards">${state.plans.map(planCard).join("") || empty("还没有学习计划")}</section>
  `;
  $("planForm").addEventListener("submit", createPlan);
  $("view").querySelectorAll("[data-progress]").forEach((input) => {
    input.addEventListener("change", () => updatePlanProgress(input.dataset.progress, input.value));
  });
  $("view").querySelectorAll("[data-edit-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      editingPlanId = button.dataset.editPlan;
      render();
    });
  });
  $("view").querySelectorAll("[data-cancel-plan-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingPlanId = "";
      render();
    });
  });
  $("view").querySelectorAll("[data-plan-edit-form]").forEach((form) => {
    form.addEventListener("submit", updatePlanDetails);
  });
  $("view").querySelectorAll("[data-delete-plan]").forEach((button) => {
    button.addEventListener("click", () => deletePlan(button.dataset.deletePlan));
  });
}

function tasks() {
  const filtered = filteredTasks();
  $("view").innerHTML = `
    <form class="form" id="taskForm">
      <h3>新增每日任务</h3>
      <label>任务内容 <input name="title" placeholder="完成一套真题 / 背 80 个单词" required /></label>
      <div class="form-row">
        <label>类型 <select name="type"><option value="kaoyan">考研</option><option value="final">期末</option></select></label>
        <label>日期 <input name="date" type="date" value="${taskDate}" required /></label>
      </div>
      <div class="form-row">
        <label>负责人 <select name="ownerId">${memberOptions()}</select></label>
        <button class="primary" type="submit">添加任务</button>
      </div>
    </form>
    <section class="panel">
      <div class="panel-head">
        <h3>任务清单</h3>
        <div class="toolbar">
          ${filterChip("all", "全部")}
          ${filterChip("kaoyan", "考研")}
          ${filterChip("final", "期末")}
          <input id="taskDate" type="date" value="${taskDate}" />
          <input id="taskSearch" type="search" placeholder="搜索任务" value="${escapeHtml(taskQuery)}" />
          <button class="ghost" id="allDates" type="button">全部日期</button>
        </div>
      </div>
      <div class="list">${filtered.map(taskRow).join("") || empty("当前筛选下没有任务")}</div>
    </section>
  `;
  $("taskForm").addEventListener("submit", createTask);
  $("taskDate").addEventListener("change", (event) => {
    taskDate = event.target.value;
    render();
  });
  $("taskSearch").addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    taskQuery = event.target.value;
    render();
    const search = $("taskSearch");
    search.focus();
    if (cursor !== null) search.setSelectionRange(cursor, cursor);
  });
  $("allDates").addEventListener("click", () => {
    taskDate = "";
    render();
  });
  $("view").querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      taskFilter = button.dataset.filter;
      render();
    });
  });
  $("view").querySelectorAll("[data-toggle-task]").forEach((button) => {
    button.addEventListener("click", () => toggleTask(button.dataset.toggleTask));
  });
  $("view").querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      editingTaskId = button.dataset.editTask;
      render();
    });
  });
  $("view").querySelectorAll("[data-cancel-task-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingTaskId = "";
      render();
    });
  });
  $("view").querySelectorAll("[data-task-edit-form]").forEach((form) => {
    form.addEventListener("submit", updateTaskDetails);
  });
  $("view").querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });
}

function checkins() {
  const active = activeMember();
  const existing = state.checkins.find((checkin) => checkin.memberId === currentMemberId && checkin.date === checkDate);
  $("view").innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>${escapeHtml(active?.nickname || "成员")} 的学习统计</h3></div>
      <div class="mini-stats">${state.members.map(memberStats).join("")}</div>
    </section>
    <form class="form" id="checkForm">
      <h3>保存打卡</h3>
      <div class="form-row">
        <label>日期 <input id="checkDate" name="date" type="date" value="${checkDate}" required /></label>
        <label>学习时长 <input name="minutes" type="number" min="0" value="${existing?.minutes ?? 120}" required /></label>
      </div>
      <label>状态 <select name="mood">${["很专注", "稳住了", "有点累", "继续补"].map((mood) => `<option ${existing?.mood === mood ? "selected" : ""}>${mood}</option>`).join("")}</select></label>
      <label>完成摘要 <textarea name="summary" placeholder="今天推进了什么？">${escapeHtml(existing?.summary || "")}</textarea></label>
      <button class="primary" type="submit">保存打卡</button>
    </form>
    <section class="cards">${state.checkins.map(checkinCard).join("") || empty("还没有打卡记录")}</section>
  `;
  $("checkDate").addEventListener("change", (event) => {
    checkDate = event.target.value;
    render();
  });
  $("checkForm").addEventListener("submit", saveCheckin);
  $("view").querySelectorAll("[data-delete-checkin]").forEach((button) => {
    button.addEventListener("click", () => deleteCheckin(button.dataset.deleteCheckin));
  });
}

function booking() {
  const slots = filteredSlots();
  $("view").innerHTML = `
    <form class="form" id="slotForm">
      <h3>预约学习时间</h3>
      <div class="form-row">
        <label>类型 <select name="type"><option value="shared">共同自习</option><option value="personal">个人时段</option></select></label>
        <label>标题 <input name="title" placeholder="图书馆三楼 / 晚间刷题" required /></label>
      </div>
      <div class="form-row">
        <label>开始 <input name="startsAt" type="datetime-local" value="${today()}T19:30" required /></label>
        <label>结束 <input name="endsAt" type="datetime-local" value="${today()}T22:00" required /></label>
      </div>
      <div class="form-row">
        <label>共同自习对象 <select name="participantId">${memberOptions(true)}</select></label>
        <button class="primary" type="submit">创建预约</button>
      </div>
    </form>
    <section class="panel">
      <div class="panel-head">
        <h3>学习时间表</h3>
        <div class="toolbar">
          <select id="slotTypeFilter">
            <option value="all" ${selected(slotTypeFilter, "all")}>全部类型</option>
            <option value="shared" ${selected(slotTypeFilter, "shared")}>共同自习</option>
            <option value="personal" ${selected(slotTypeFilter, "personal")}>个人时段</option>
          </select>
          <select id="slotStatusFilter">
            <option value="active" ${selected(slotStatusFilter, "active")}>未取消</option>
            <option value="pending" ${selected(slotStatusFilter, "pending")}>待确认</option>
            <option value="confirmed" ${selected(slotStatusFilter, "confirmed")}>已确认</option>
            <option value="cancelled" ${selected(slotStatusFilter, "cancelled")}>已取消</option>
            <option value="all" ${selected(slotStatusFilter, "all")}>全部状态</option>
          </select>
          <input id="slotSearch" type="search" placeholder="搜索预约" value="${escapeHtml(slotQuery)}" />
        </div>
      </div>
      <div class="list">${slots.map(slotRow).join("") || empty("当前筛选下没有预约")}</div>
    </section>
  `;
  $("slotForm").addEventListener("submit", createSlot);
  $("slotTypeFilter").addEventListener("change", (event) => {
    slotTypeFilter = event.target.value;
    render();
  });
  $("slotStatusFilter").addEventListener("change", (event) => {
    slotStatusFilter = event.target.value;
    render();
  });
  $("slotSearch").addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    slotQuery = event.target.value;
    render();
    const search = $("slotSearch");
    search.focus();
    if (cursor !== null) search.setSelectionRange(cursor, cursor);
  });
  $("view").querySelectorAll("[data-confirm-slot]").forEach((button) => {
    button.addEventListener("click", () => updateSlotStatus(button.dataset.confirmSlot, "confirmed"));
  });
  $("view").querySelectorAll("[data-cancel-slot]").forEach((button) => {
    button.addEventListener("click", () => updateSlotStatus(button.dataset.cancelSlot, "cancelled"));
  });
  $("view").querySelectorAll("[data-edit-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      editingSlotId = button.dataset.editSlot;
      render();
    });
  });
  $("view").querySelectorAll("[data-cancel-slot-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingSlotId = "";
      render();
    });
  });
  $("view").querySelectorAll("[data-slot-edit-form]").forEach((form) => {
    form.addEventListener("submit", updateSlotDetails);
  });
  $("view").querySelectorAll("[data-delete-slot]").forEach((button) => {
    button.addEventListener("click", () => deleteSlot(button.dataset.deleteSlot));
  });
}

function metric(label, value, note) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small class="muted">${escapeHtml(note)}</small></article>`;
}

function weeklyChart(series) {
  const max = Math.max(1, ...series.map((day) => Number(day.minutes || 0)));
  return `
    <div class="week-chart">
      ${series
        .map((day) => {
          const height = Math.max(8, Math.round((Number(day.minutes || 0) / max) * 100));
          return `
            <div class="week-day">
              <div class="week-bar"><span style="height:${height}%"></span></div>
              <strong>${Number(day.minutes || 0)}</strong>
              <small>${escapeHtml(day.date.slice(5))}</small>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function completionBlocks(summary) {
  return `
    <div class="completion-grid">
      ${completionBlock("全部", summary.all)}
      ${completionBlock("考研", summary.kaoyan)}
      ${completionBlock("期末", summary.final)}
    </div>
  `;
}

function completionBlock(label, bucket) {
  return `
    <div class="completion-item">
      <div class="row-title"><strong>${escapeHtml(label)}</strong><span>${bucket.completed}/${bucket.total}</span></div>
      <div class="bar"><span style="width:${bucket.percent}%"></span></div>
      <small class="muted">${bucket.percent}% 完成</small>
    </div>
  `;
}

function panel(title, content) {
  return `<section class="panel"><div class="panel-head"><h3>${escapeHtml(title)}</h3></div><div class="list">${content}</div></section>`;
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function memberOptions(excludeCurrent = false) {
  const members = excludeCurrent ? state.members.filter((member) => member.id !== currentMemberId) : state.members;
  return members
    .map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.nickname)}</option>`)
    .join("") || `<option value="">暂无同伴</option>`;
}

function memberOptionsFor(selectedId, excludeCurrent = false) {
  const members = excludeCurrent ? state.members.filter((member) => member.id !== currentMemberId) : state.members;
  return members
    .map(
      (member) =>
        `<option value="${escapeHtml(member.id)}" ${member.id === selectedId ? "selected" : ""}>${escapeHtml(member.nickname)}</option>`,
    )
    .join("") || `<option value="">暂无同伴</option>`;
}

function selected(value, current) {
  return value === current ? "selected" : "";
}

function filterChip(key, label) {
  return `<button class="chip ${taskFilter === key ? "active" : ""}" data-filter="${key}" type="button">${label}</button>`;
}

function planCard(plan) {
  if (editingPlanId === plan.id) {
    const progress = clampProgress(plan.progress);
    return `
      <article class="card">
        <form class="edit-form" data-plan-edit-form="${escapeHtml(plan.id)}">
          <div class="form-row">
            <label>类型 <select name="type"><option value="kaoyan" ${selected(plan.type, "kaoyan")}>考研</option><option value="final" ${selected(plan.type, "final")}>期末</option></select></label>
            <label>科目 <input name="subject" value="${escapeHtml(plan.subject || "")}" required /></label>
          </div>
          <div class="form-row">
            <label>阶段 <input name="stage" value="${escapeHtml(plan.stage || "")}" required /></label>
            <label>截止日期 <input name="deadline" type="date" value="${escapeHtml(plan.deadline || today())}" required /></label>
          </div>
          <label>阶段目标 <textarea name="target" required>${escapeHtml(plan.target || "")}</textarea></label>
          <div class="form-row">
            <label>进度 <input name="progress" type="number" min="0" max="100" value="${progress}" /></label>
            <label>负责人 <select name="ownerId">${memberOptionsFor(plan.ownerId)}</select></label>
          </div>
          <div class="row-actions">
            <button class="primary" type="submit">保存</button>
            <button class="ghost" data-cancel-plan-edit="${escapeHtml(plan.id)}" type="button">取消</button>
          </div>
        </form>
      </article>
    `;
  }
  const progress = clampProgress(plan.progress);
  return `
    <article class="card">
      <div><span class="tag ${escapeHtml(plan.type)}">${labelForType(plan.type)}</span></div>
      <h3>${escapeHtml(plan.subject || "未命名科目")}</h3>
      <p class="muted">${escapeHtml(plan.stage || "未设置阶段")} · ${escapeHtml(deadlineLabel(plan.deadline, today()))} · ${escapeHtml(plan.deadline || "未设置日期")}</p>
      <p>${escapeHtml(plan.target || "还没有写目标")}</p>
      <div class="bar"><span style="width:${progress}%"></span></div>
      <div class="progress-edit">
        <input data-progress="${escapeHtml(plan.id)}" type="range" min="0" max="100" value="${progress}" />
        <strong>${progress}%</strong>
      </div>
      <div class="row-actions">
        <span class="muted">负责人：${escapeHtml(memberName(plan.ownerId))}</span>
        <button class="ghost" data-edit-plan="${escapeHtml(plan.id)}" type="button">编辑</button>
        <button class="danger" data-delete-plan="${escapeHtml(plan.id)}" type="button">删除</button>
      </div>
    </article>
  `;
}

function taskRow(task, interactive = true) {
  if (editingTaskId === task.id) {
    return `
      <form class="row edit-row" data-task-edit-form="${escapeHtml(task.id)}">
        <div class="dot">改</div>
        <div class="edit-form">
          <label>任务内容 <input name="title" value="${escapeHtml(task.title || "")}" required /></label>
          <div class="form-row">
            <label>类型 <select name="type"><option value="kaoyan" ${selected(task.type, "kaoyan")}>考研</option><option value="final" ${selected(task.type, "final")}>期末</option></select></label>
            <label>日期 <input name="date" type="date" value="${escapeHtml(task.date || today())}" required /></label>
          </div>
          <label>负责人 <select name="ownerId">${memberOptionsFor(task.ownerId)}</select></label>
        </div>
        <div class="row-actions">
          <button class="primary" type="submit">保存</button>
          <button class="ghost" data-cancel-task-edit="${escapeHtml(task.id)}" type="button">取消</button>
        </div>
      </form>
    `;
  }
  return `
    <div class="row ${task.completed ? "done" : ""}">
      <div class="dot">${task.completed ? "✓" : "○"}</div>
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${labelForType(task.type)} · ${escapeHtml(task.date)} · ${escapeHtml(memberName(task.ownerId))}</small>
      </div>
      <div class="row-actions ${interactive ? "" : "hidden"}">
        <button class="ghost" data-toggle-task="${escapeHtml(task.id)}" type="button">${task.completed ? "取消完成" : "完成"}</button>
        <button class="ghost" data-edit-task="${escapeHtml(task.id)}" type="button">编辑</button>
        <button class="danger" data-delete-task="${escapeHtml(task.id)}" type="button">删除</button>
      </div>
    </div>
  `;
}

function checkinCard(checkin) {
  return `
    <article class="card">
      <span class="muted">${escapeHtml(checkin.date)} · ${escapeHtml(checkin.mood || "未记录状态")}</span>
      <h3>${escapeHtml(memberName(checkin.memberId))}</h3>
      <p>${escapeHtml(checkin.summary || "没有填写摘要")}</p>
      <div class="row-actions">
        <strong>${Number(checkin.minutes || 0)} 分钟</strong>
        <button class="danger" data-delete-checkin="${escapeHtml(checkin.id)}" type="button">删除</button>
      </div>
    </article>
  `;
}

function slotRow(slot, interactive = true) {
  const canConfirm = slot.type === "shared" && slot.status === "pending" && slot.participantId === currentMemberId;
  if (editingSlotId === slot.id) {
    return `
      <form class="row edit-row" data-slot-edit-form="${escapeHtml(slot.id)}">
        <div class="dot">时</div>
        <div class="edit-form">
          <div class="form-row">
            <label>类型 <select name="type"><option value="shared" ${selected(slot.type, "shared")}>共同自习</option><option value="personal" ${selected(slot.type, "personal")}>个人时段</option></select></label>
            <label>标题 <input name="title" value="${escapeHtml(slot.title || "")}" required /></label>
          </div>
          <div class="form-row">
            <label>开始 <input name="startsAt" type="datetime-local" value="${escapeHtml(slot.startsAt || `${today()}T19:30`)}" required /></label>
            <label>结束 <input name="endsAt" type="datetime-local" value="${escapeHtml(slot.endsAt || `${today()}T22:00`)}" required /></label>
          </div>
          <label>共同自习对象 <select name="participantId">${memberOptionsFor(slot.participantId, true)}</select></label>
        </div>
        <div class="row-actions">
          <button class="primary" type="submit">保存</button>
          <button class="ghost" data-cancel-slot-edit="${escapeHtml(slot.id)}" type="button">取消</button>
        </div>
      </form>
    `;
  }
  return `
    <div class="row">
      <div class="dot">日</div>
      <div>
        <strong>${escapeHtml(slot.title)}</strong>
        <small>${escapeHtml(slotTypeLabel(slot.type))} · ${escapeHtml(formatDateTime(slot.startsAt))} - ${escapeHtml(formatDateTime(slot.endsAt))} · ${escapeHtml(statusLabel(slot.status))} · 发起：${escapeHtml(memberName(slot.creatorId))}${slot.participantId ? ` · 对象：${escapeHtml(memberName(slot.participantId))}` : ""}</small>
      </div>
      <div class="row-actions ${interactive ? "" : "hidden"}">
        ${canConfirm ? `<button class="primary" data-confirm-slot="${escapeHtml(slot.id)}" type="button">确认</button>` : ""}
        ${slot.status !== "cancelled" ? `<button class="ghost" data-cancel-slot="${escapeHtml(slot.id)}" type="button">取消</button>` : ""}
        <button class="ghost" data-edit-slot="${escapeHtml(slot.id)}" type="button">编辑</button>
        <button class="danger" data-delete-slot="${escapeHtml(slot.id)}" type="button">删除</button>
      </div>
    </div>
  `;
}

function memberStats(member) {
  const memberCheckins = state.checkins.filter((checkin) => checkin.memberId === member.id);
  const weekMinutes = memberCheckins
    .filter((checkin) => daysAgo(checkin.date) <= 6)
    .reduce((sum, checkin) => sum + Number(checkin.minutes || 0), 0);
  return `
    <div class="mini">
      <span>${escapeHtml(member.nickname)}</span>
      <strong>${weekMinutes} 分钟</strong>
      <small class="muted">近 7 天 · 连续 ${streak(member.id)} 天</small>
    </div>
  `;
}

function todayTasks() {
  return state.tasks.filter((task) => task.date === today());
}

function filteredTasks() {
  return filterTasksForView(state.tasks, { type: taskFilter, date: taskDate, query: taskQuery });
}

function filteredSlots() {
  return filterSlotsForView(state.slots, { type: slotTypeFilter, status: slotStatusFilter, query: slotQuery });
}

function daysAgo(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const current = new Date(`${today()}T00:00:00`);
  return Math.floor((current - date) / 86400000);
}

function streak(memberId) {
  let count = 0;
  const cursor = new Date(`${today()}T00:00:00`);
  while (count < 365) {
    const local = new Date(cursor);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    const date = local.toISOString().slice(0, 10);
    if (!state.checkins.some((checkin) => checkin.memberId === memberId && checkin.date === date)) break;
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function createPlan(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  mutate(() => {
    state.plans.unshift({
      id: uid("plan"),
      type: form.get("type"),
      subject: form.get("subject").trim(),
      stage: form.get("stage").trim(),
      target: form.get("target").trim(),
      deadline: form.get("deadline"),
      progress: clampProgress(form.get("progress")),
      ownerId: form.get("ownerId") || currentMemberId,
    });
  }, "计划已添加");
}

function updatePlanProgress(planId, progress) {
  mutate(() => {
    const plan = state.plans.find((item) => item.id === planId);
    if (plan) plan.progress = clampProgress(progress);
  }, "进度已更新");
}

function updatePlanDetails(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const planId = event.currentTarget.dataset.planEditForm;
  mutate(() => {
    state.plans = updatePlanItem(state.plans, planId, {
      type: form.get("type"),
      subject: form.get("subject"),
      stage: form.get("stage"),
      target: form.get("target"),
      deadline: form.get("deadline"),
      progress: form.get("progress"),
      ownerId: form.get("ownerId") || currentMemberId,
    });
    editingPlanId = "";
  }, "计划已更新");
}

function deletePlan(planId) {
  mutate(() => {
    state.plans = state.plans.filter((plan) => plan.id !== planId);
  }, "计划已删除");
}

function createTask(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  mutate(() => {
    state.tasks.unshift({
      id: uid("task"),
      title: form.get("title").trim(),
      type: form.get("type"),
      date: form.get("date"),
      ownerId: form.get("ownerId") || currentMemberId,
      completed: false,
    });
    taskDate = form.get("date");
  }, "任务已添加");
}

function toggleTask(taskId) {
  mutate(() => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.completed = !task.completed;
    task.completedBy = task.completed ? currentMemberId : null;
  }, "任务状态已更新");
}

function updateTaskDetails(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const taskId = event.currentTarget.dataset.taskEditForm;
  mutate(() => {
    state.tasks = updateTaskItem(state.tasks, taskId, {
      title: form.get("title"),
      type: form.get("type"),
      date: form.get("date"),
      ownerId: form.get("ownerId") || currentMemberId,
    });
    taskDate = form.get("date");
    editingTaskId = "";
  }, "任务已更新");
}

function deleteTask(taskId) {
  mutate(() => {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
  }, "任务已删除");
}

function saveCheckin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = form.get("date");
  checkDate = date;
  mutate(() => {
    state.checkins = upsertCheckin(state.checkins, {
      id: uid("checkin"),
      memberId: currentMemberId,
      date,
      minutes: Number(form.get("minutes") || 0),
      mood: form.get("mood"),
      summary: form.get("summary").trim(),
    });
  }, "打卡已保存");
}

function deleteCheckin(checkinId) {
  mutate(() => {
    state.checkins = state.checkins.filter((checkin) => checkin.id !== checkinId);
  }, "打卡已删除");
}

function createSlot(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const type = form.get("type");
  mutate(() => {
    state.slots.unshift({
      id: uid("slot"),
      type,
      title: form.get("title").trim(),
      startsAt: form.get("startsAt"),
      endsAt: form.get("endsAt"),
      creatorId: currentMemberId,
      participantId: type === "shared" ? form.get("participantId") : "",
      status: type === "shared" ? "pending" : "confirmed",
    });
  }, "预约已创建");
}

function updateSlotStatus(slotId, status) {
  mutate(() => {
    const slot = state.slots.find((item) => item.id === slotId);
    if (slot) slot.status = status;
  }, "预约状态已更新");
}

function updateSlotDetails(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const slotId = event.currentTarget.dataset.slotEditForm;
  mutate(() => {
    const current = state.slots.find((slot) => slot.id === slotId);
    const type = form.get("type");
    state.slots = updateSlotItem(state.slots, slotId, {
      type,
      title: form.get("title"),
      startsAt: form.get("startsAt"),
      endsAt: form.get("endsAt"),
      participantId: type === "shared" ? form.get("participantId") : "",
      status: type === "shared" ? current?.status || "pending" : "confirmed",
    });
    editingSlotId = "";
  }, "预约已更新");
}

function deleteSlot(slotId) {
  mutate(() => {
    state.slots = state.slots.filter((slot) => slot.id !== slotId);
  }, "预约已删除");
}
