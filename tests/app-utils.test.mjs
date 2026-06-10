import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShareUrl,
  clampProgress,
  dashboardStats,
  deadlineLabel,
  escapeHtml,
  filterTasksForView,
  filterSlotsForView,
  sortUpcomingSlots,
  taskCompletionSummary,
  updatePlanItem,
  updateSlotItem,
  updateTaskItem,
  weeklyStudySeries,
  upsertCheckin,
} from "../public/app-utils.js";

test("escapes user text before rendering into HTML", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert(1)"> & review`),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; review",
  );
});

test("keeps plan progress in the 0 to 100 range", () => {
  assert.equal(clampProgress(-10), 0);
  assert.equal(clampProgress(45), 45);
  assert.equal(clampProgress(120), 100);
  assert.equal(clampProgress("not-a-number"), 0);
});

test("upserts one checkin per member and date without removing other members", () => {
  const checkins = [
    { id: "a-old", memberId: "a", date: "2026-06-10", minutes: 60 },
    { id: "b", memberId: "b", date: "2026-06-10", minutes: 80 },
  ];

  const updated = upsertCheckin(checkins, {
    id: "a-new",
    memberId: "a",
    date: "2026-06-10",
    minutes: 120,
  });

  assert.equal(updated.length, 2);
  assert.equal(updated.find((item) => item.memberId === "a").id, "a-old");
  assert.equal(updated.find((item) => item.memberId === "a").minutes, 120);
  assert.equal(updated.find((item) => item.memberId === "b").minutes, 80);
});

test("computes dashboard stats for the selected day", () => {
  const state = {
    members: [{ id: "a" }, { id: "b" }],
    tasks: [
      { date: "2026-06-10", completed: true },
      { date: "2026-06-10", completed: false },
      { date: "2026-06-09", completed: true },
    ],
    checkins: [
      { date: "2026-06-10", minutes: 90 },
      { date: "2026-06-10", minutes: 30 },
      { date: "2026-06-09", minutes: 40 },
    ],
    slots: [{ status: "confirmed" }, { status: "pending" }],
  };

  assert.deepEqual(dashboardStats(state, "2026-06-10"), {
    members: 2,
    todayTasks: 2,
    completedTasks: 1,
    minutes: 120,
    confirmedSlots: 1,
  });
});

test("sorts upcoming slots by start time and hides cancelled slots", () => {
  const slots = [
    { id: "late", startsAt: "2026-06-10T21:00", status: "confirmed" },
    { id: "cancelled", startsAt: "2026-06-10T18:00", status: "cancelled" },
    { id: "early", startsAt: "2026-06-10T19:00", status: "pending" },
  ];

  assert.deepEqual(sortUpcomingSlots(slots).map((slot) => slot.id), ["early", "late"]);
});

test("builds a share url that preserves the public origin and invite code", () => {
  assert.equal(
    buildShareUrl("https://study.example.com/app?old=1", "kaoyan-2026"),
    "https://study.example.com/app?invite=KAOYAN-2026",
  );
});

test("formats deadline distance for study plans", () => {
  assert.equal(deadlineLabel("2026-06-12", "2026-06-10"), "\u8fd8\u5269 2 \u5929");
  assert.equal(deadlineLabel("2026-06-10", "2026-06-10"), "\u4eca\u5929\u622a\u6b62");
  assert.equal(deadlineLabel("2026-06-08", "2026-06-10"), "\u5df2\u903e\u671f 2 \u5929");
  assert.equal(deadlineLabel("", "2026-06-10"), "\u672a\u8bbe\u7f6e\u622a\u6b62");
});

test("filters tasks by type date and search query", () => {
  const tasks = [
    { id: "a", title: "math paper", type: "kaoyan", date: "2026-06-10" },
    { id: "b", title: "english words", type: "final", date: "2026-06-10" },
    { id: "c", title: "math notes", type: "kaoyan", date: "2026-06-11" },
  ];

  assert.deepEqual(
    filterTasksForView(tasks, { type: "kaoyan", date: "2026-06-10", query: "math" }).map((task) => task.id),
    ["a"],
  );
  assert.deepEqual(filterTasksForView(tasks, { type: "all", date: "", query: "WORDS" }).map((task) => task.id), ["b"]);
});

test("updates editable plan fields while preserving unchanged data", () => {
  const plans = [{ id: "p1", subject: "old", progress: 10, ownerId: "m1", untouched: true }];
  const updated = updatePlanItem(plans, "p1", {
    subject: "  math  ",
    stage: "phase 2",
    target: "finish",
    deadline: "2026-06-30",
    progress: 130,
    ownerId: "m2",
    type: "final",
  });

  assert.equal(updated[0].subject, "math");
  assert.equal(updated[0].progress, 100);
  assert.equal(updated[0].untouched, true);
  assert.equal(plans[0].subject, "old");
});

test("updates editable task and slot fields", () => {
  const tasks = [{ id: "t1", title: "old", completed: true }];
  const slots = [{ id: "s1", title: "old", status: "pending", creatorId: "m1" }];

  assert.deepEqual(updateTaskItem(tasks, "t1", { title: "  new task ", type: "final", date: "2026-06-12" })[0], {
    id: "t1",
    title: "new task",
    completed: true,
    type: "final",
    date: "2026-06-12",
  });
  assert.deepEqual(updateSlotItem(slots, "s1", { title: "  library ", type: "personal", status: "confirmed" })[0], {
    id: "s1",
    title: "library",
    status: "confirmed",
    creatorId: "m1",
    type: "personal",
  });
});

test("builds a seven day study series ending at the selected date", () => {
  const series = weeklyStudySeries(
    [
      { date: "2026-06-04", minutes: 20 },
      { date: "2026-06-10", minutes: 80 },
      { date: "2026-06-10", minutes: 40 },
      { date: "2026-06-03", minutes: 999 },
    ],
    "2026-06-10",
  );

  assert.equal(series.length, 7);
  assert.deepEqual(series.map((day) => day.date), [
    "2026-06-04",
    "2026-06-05",
    "2026-06-06",
    "2026-06-07",
    "2026-06-08",
    "2026-06-09",
    "2026-06-10",
  ]);
  assert.deepEqual(series.map((day) => day.minutes), [20, 0, 0, 0, 0, 0, 120]);
});

test("summarizes task completion by type", () => {
  const summary = taskCompletionSummary([
    { type: "kaoyan", completed: true },
    { type: "kaoyan", completed: false },
    { type: "final", completed: true },
  ]);

  assert.deepEqual(summary.all, { total: 3, completed: 2, percent: 67 });
  assert.deepEqual(summary.kaoyan, { total: 2, completed: 1, percent: 50 });
  assert.deepEqual(summary.final, { total: 1, completed: 1, percent: 100 });
});

test("filters slots by type status and search query", () => {
  const slots = [
    { id: "a", type: "shared", status: "pending", title: "library", startsAt: "2026-06-10T19:00" },
    { id: "b", type: "personal", status: "confirmed", title: "home", startsAt: "2026-06-10T18:00" },
    { id: "c", type: "shared", status: "cancelled", title: "library cancelled", startsAt: "2026-06-10T20:00" },
  ];

  assert.deepEqual(
    filterSlotsForView(slots, { type: "shared", status: "active", query: "LIB" }).map((slot) => slot.id),
    ["a"],
  );
  assert.deepEqual(filterSlotsForView(slots, { type: "all", status: "confirmed", query: "" }).map((slot) => slot.id), [
    "b",
  ]);
});
