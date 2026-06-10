export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function dashboardStats(state, date) {
  const todayTasks = state.tasks.filter((task) => task.date === date);
  return {
    members: state.members.length,
    todayTasks: todayTasks.length,
    completedTasks: todayTasks.filter((task) => task.completed).length,
    minutes: state.checkins
      .filter((checkin) => checkin.date === date)
      .reduce((sum, checkin) => sum + Number(checkin.minutes || 0), 0),
    confirmedSlots: state.slots.filter((slot) => slot.status === "confirmed").length,
  };
}

export function upsertCheckin(checkins, nextCheckin) {
  const existing = checkins.find(
    (checkin) => checkin.memberId === nextCheckin.memberId && checkin.date === nextCheckin.date,
  );
  const merged = existing ? { ...nextCheckin, id: existing.id } : nextCheckin;
  const withoutExisting = checkins.filter((checkin) => checkin.id !== merged.id);
  return [merged, ...withoutExisting].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function sortUpcomingSlots(slots) {
  return slots
    .filter((slot) => slot.status !== "cancelled")
    .slice()
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export function filterSlotsForView(slots, { type = "all", status = "active", query = "" } = {}) {
  const normalizedQuery = cleanText(query).toLowerCase();
  return slots
    .filter((slot) => type === "all" || slot.type === type)
    .filter((slot) => {
      if (status === "all") return true;
      if (status === "active") return slot.status !== "cancelled";
      return slot.status === status;
    })
    .filter((slot) => !normalizedQuery || cleanText(slot.title).toLowerCase().includes(normalizedQuery))
    .slice()
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export function weeklyStudySeries(checkins, currentDate) {
  const end = new Date(`${currentDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - 6 + index);
    const key = toDateKey(date);
    return {
      date: key,
      minutes: checkins
        .filter((checkin) => checkin.date === key)
        .reduce((sum, checkin) => sum + Number(checkin.minutes || 0), 0),
    };
  });
}

export function taskCompletionSummary(tasks) {
  return {
    all: completionBucket(tasks),
    kaoyan: completionBucket(tasks.filter((task) => task.type === "kaoyan")),
    final: completionBucket(tasks.filter((task) => task.type === "final")),
  };
}

export function filterTasksForView(tasks, { type = "all", date = "", query = "" } = {}) {
  const normalizedQuery = cleanText(query).toLowerCase();
  return tasks
    .filter((task) => type === "all" || task.type === type)
    .filter((task) => !date || task.date === date)
    .filter((task) => !normalizedQuery || cleanText(task.title).toLowerCase().includes(normalizedQuery))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function updatePlanItem(plans, planId, patch) {
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    return {
      ...plan,
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.subject !== undefined ? { subject: cleanText(patch.subject) } : {}),
      ...(patch.stage !== undefined ? { stage: cleanText(patch.stage) } : {}),
      ...(patch.target !== undefined ? { target: cleanText(patch.target) } : {}),
      ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
      ...(patch.progress !== undefined ? { progress: clampProgress(patch.progress) } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
    };
  });
}

export function updateTaskItem(tasks, taskId, patch) {
  return tasks.map((task) => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      ...(patch.title !== undefined ? { title: cleanText(patch.title) } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
    };
  });
}

export function updateSlotItem(slots, slotId, patch) {
  return slots.map((slot) => {
    if (slot.id !== slotId) return slot;
    return {
      ...slot,
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.title !== undefined ? { title: cleanText(patch.title) } : {}),
      ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
      ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
      ...(patch.participantId !== undefined ? { participantId: patch.participantId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    };
  });
}

export function buildShareUrl(currentHref, inviteCode) {
  const url = new URL(currentHref);
  url.search = "";
  url.searchParams.set("invite", String(inviteCode ?? "").trim().toUpperCase());
  return url.toString();
}

export function deadlineLabel(deadline, currentDate) {
  if (!deadline) return "\u672a\u8bbe\u7f6e\u622a\u6b62";
  const target = new Date(`${deadline}T00:00:00`);
  const current = new Date(`${currentDate}T00:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(current.getTime())) return "\u672a\u8bbe\u7f6e\u622a\u6b62";
  const days = Math.round((target - current) / 86400000);
  if (days === 0) return "\u4eca\u5929\u622a\u6b62";
  if (days > 0) return `\u8fd8\u5269 ${days} \u5929`;
  return `\u5df2\u903e\u671f ${Math.abs(days)} \u5929`;
}

export function formatDateTime(value) {
  return value ? String(value).replace("T", " ") : "\u672a\u8bbe\u7f6e";
}

export function labelForType(type) {
  return { kaoyan: "\u8003\u7814", final: "\u671f\u672b" }[type] || "\u5176\u4ed6";
}

export function statusLabel(status) {
  return {
    pending: "\u5f85\u786e\u8ba4",
    confirmed: "\u5df2\u786e\u8ba4",
    cancelled: "\u5df2\u53d6\u6d88",
  }[status] || status;
}

export function slotTypeLabel(type) {
  return type === "shared" ? "\u5171\u540c\u81ea\u4e60" : "\u4e2a\u4eba\u65f6\u6bb5";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function completionBucket(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

function toDateKey(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}
