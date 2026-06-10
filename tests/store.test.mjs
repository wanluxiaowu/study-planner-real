import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createStore,
  exportGroupState,
  importGroupState,
  joinGroup,
  loadGroupState,
  normalizeInviteCode,
  saveGroupState,
} from "../server/store.mjs";

test("normalizes invite code for stable group identity", () => {
  assert.equal(normalizeInviteCode("  kaoyan-2026 "), "KAOYAN-2026");
});

test("joins the same invite group and persists shared state", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    const first = await joinGroup(store, { inviteCode: "kaoyan-2026", nickname: "我" });
    const second = await joinGroup(store, { inviteCode: "KAOYAN-2026", nickname: "同学" });

    assert.equal(first.group.id, second.group.id);
    assert.equal(second.members.length, 2);

    const nextState = {
      ...second,
      tasks: [
        {
          id: "task-1",
          title: "数学真题一套",
          type: "kaoyan",
          date: "2026-06-10",
          ownerId: first.member.id,
          completed: false,
        },
      ],
    };

    await saveGroupState(store, second.group.inviteCode, nextState);
    const loaded = await loadGroupState(store, "kaoyan-2026");

    assert.equal(loaded.tasks.length, 1);
    assert.equal(loaded.tasks[0].title, "数学真题一套");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates a new invite group with no demo study data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    const joined = await joinGroup(store, {
      inviteCode: "fresh-room",
      nickname: "owner",
      clientId: "browser-owner",
    });

    assert.deepEqual(joined.plans, []);
    assert.deepEqual(joined.tasks, []);
    assert.deepEqual(joined.checkins, []);
    assert.deepEqual(joined.slots, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("rejects empty invite codes before creating a group", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    await assert.rejects(
      () => joinGroup(store, { inviteCode: "   ", nickname: "我" }),
      /邀请码/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("normalizes missing state arrays when saving a group", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    await joinGroup(store, { inviteCode: "stable-room", nickname: "我" });

    const saved = await saveGroupState(store, "stable-room", {
      members: [{ id: "m1", nickname: "我" }],
      tasks: [{ id: "t1", title: "背单词" }],
    });

    assert.deepEqual(saved.plans, []);
    assert.deepEqual(saved.checkins, []);
    assert.deepEqual(saved.slots, []);
    assert.equal(saved.tasks[0].title, "背单词");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects stale group state instead of overwriting newer data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    await joinGroup(store, { inviteCode: "conflict-room", nickname: "我" });
    const staleState = await loadGroupState(store, "conflict-room");

    await saveGroupState(store, "conflict-room", {
      ...staleState,
      tasks: [{ id: "first", title: "先保存的任务" }],
    });

    await assert.rejects(
      () =>
        saveGroupState(store, "conflict-room", {
          ...staleState,
          tasks: [{ id: "stale", title: "旧页面里的任务" }],
        }),
      /数据已更新/,
    );

    const latest = await loadGroupState(store, "conflict-room");
    assert.equal(latest.tasks[0].id, "first");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("uses client identity so same nicknames can still be different members", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    const first = await joinGroup(store, {
      inviteCode: "public-room",
      nickname: "同学",
      clientId: "browser-a",
    });
    const second = await joinGroup(store, {
      inviteCode: "public-room",
      nickname: "同学",
      clientId: "browser-b",
    });
    const again = await joinGroup(store, {
      inviteCode: "public-room",
      nickname: "同学新昵称",
      clientId: "browser-a",
    });

    assert.notEqual(first.member.id, second.member.id);
    assert.equal(again.member.id, first.member.id);
    assert.equal(again.members.length, 2);
    assert.equal(again.members.find((member) => member.id === first.member.id).nickname, "同学新昵称");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("exports and imports a whole invite group", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const source = createStore(path.join(dir, "source.json"));
    const target = createStore(path.join(dir, "target.json"));
    const joined = await joinGroup(source, {
      inviteCode: "backup-room",
      nickname: "A",
      clientId: "browser-a",
    });

    await saveGroupState(source, joined.group.inviteCode, {
      ...joined,
      tasks: [{ id: "task-backup", title: "backup task", type: "final", date: "2026-06-10" }],
    });

    const backup = await exportGroupState(source, "backup-room");
    await importGroupState(target, backup);
    const restored = await loadGroupState(target, "backup-room");

    assert.equal(restored.group.inviteCode, "BACKUP-ROOM");
    assert.equal(restored.tasks[0].title, "backup task");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects malformed backup arrays instead of importing partial data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "study-store-"));
  try {
    const store = createStore(path.join(dir, "store.json"));
    await assert.rejects(
      () =>
        importGroupState(store, {
          state: {
            group: { inviteCode: "bad-backup" },
            members: [],
            plans: "not-array",
            tasks: [],
            checkins: [],
            slots: [],
          },
        }),
      /\u5907\u4efd\u6587\u4ef6\u65e0\u6548/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
