import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function normalizeInviteCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function createStore(filePath) {
  return { filePath };
}

export async function joinGroup(store, { inviteCode, nickname, clientId }) {
  const db = await readDb(store);
  const normalized = normalizeInviteCode(inviteCode);
  ensureInviteCode(normalized);
  let group = db.groups.find((item) => item.inviteCode === normalized);

  if (!group) {
    group = createInitialGroup(normalized);
    db.groups.push(group);
  }

  const safeNickname = nickname.trim() || "学习成员";
  const safeClientId = clientId?.trim();
  let member = safeClientId
    ? group.members.find((item) => item.clientId === safeClientId)
    : group.members.find((item) => item.nickname === safeNickname);

  if (!member) {
    member = {
      id: randomId("member"),
      clientId: safeClientId || randomId("client"),
      nickname: safeNickname,
      color: group.members.length % 2 === 0 ? "#2f6fed" : "#21a67a",
    };
    group.members.push(member);
  } else {
    member.nickname = safeNickname;
  }

  await writeDb(store, db);

  return {
    ...publicState(group),
    member,
  };
}

export async function loadGroupState(store, inviteCode) {
  const db = await readDb(store);
  const normalized = normalizeInviteCode(inviteCode);
  ensureInviteCode(normalized);
  const group = db.groups.find((item) => item.inviteCode === normalized);
  if (!group) {
    throw new Error("学习组不存在");
  }
  return publicState(group);
}

export async function saveGroupState(store, inviteCode, nextState) {
  const db = await readDb(store);
  const normalized = normalizeInviteCode(inviteCode);
  ensureInviteCode(normalized);
  const index = db.groups.findIndex((item) => item.inviteCode === normalized);
  if (index === -1) {
    throw new Error("学习组不存在");
  }

  const currentGroup = db.groups[index];
  if (
    nextState?.revision !== undefined &&
    currentGroup.revision !== undefined &&
    Number(nextState.revision) !== Number(currentGroup.revision)
  ) {
    throw httpError("数据已更新，请刷新后重试", 409);
  }

  db.groups[index] = {
    ...currentGroup,
    members: arrayOrEmpty(nextState?.members),
    plans: arrayOrEmpty(nextState?.plans),
    tasks: arrayOrEmpty(nextState?.tasks),
    checkins: arrayOrEmpty(nextState?.checkins),
    slots: arrayOrEmpty(nextState?.slots),
    revision: Number(currentGroup.revision || 1) + 1,
    updatedAt: new Date().toISOString(),
  };

  await writeDb(store, db);
  return publicState(db.groups[index]);
}

export async function exportGroupState(store, inviteCode) {
  const state = await loadGroupState(store, inviteCode);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
}

export async function importGroupState(store, backup) {
  if (!isValidBackupState(backup?.state)) {
    throw new Error("备份文件无效");
  }

  const db = await readDb(store);
  const normalized = normalizeInviteCode(backup.state.group.inviteCode);
  ensureInviteCode(normalized);
  const nextGroup = {
    id: backup.state.group.id || randomId("group"),
    inviteCode: normalized,
    name: backup.state.group.name || "双人学习组",
    members: arrayOrEmpty(backup.state.members),
    plans: arrayOrEmpty(backup.state.plans),
    tasks: arrayOrEmpty(backup.state.tasks),
    checkins: arrayOrEmpty(backup.state.checkins),
    slots: arrayOrEmpty(backup.state.slots),
    revision: Number(backup.state.revision || 1),
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const index = db.groups.findIndex((item) => item.inviteCode === normalized);
  if (index === -1) {
    db.groups.push(nextGroup);
  } else {
    db.groups[index] = { ...db.groups[index], ...nextGroup };
  }

  await writeDb(store, db);
  return publicState(nextGroup);
}

function isValidBackupState(state) {
  if (!state?.group?.inviteCode) return false;
  return ["members", "plans", "tasks", "checkins", "slots"].every((key) => Array.isArray(state[key]));
}

async function readDb(store) {
  try {
    const raw = await readFile(store.filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { groups: [] };
  }
}

async function writeDb(store, db) {
  await mkdir(path.dirname(store.filePath), { recursive: true });
  await writeFile(store.filePath, JSON.stringify(db, null, 2), "utf8");
}

function publicState(group) {
  return {
    group: {
      id: group.id,
      inviteCode: group.inviteCode,
      name: group.name,
    },
    revision: Number(group.revision || 1),
    updatedAt: group.updatedAt || group.createdAt || "",
    members: group.members,
    plans: group.plans,
    tasks: group.tasks,
    checkins: group.checkins,
    slots: group.slots,
  };
}

function ensureInviteCode(inviteCode) {
  if (!inviteCode) {
    throw new Error("请输入邀请码");
  }
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function createInitialGroup(inviteCode) {
  return {
    id: randomId("group"),
    inviteCode,
    name: "双人学习组",
    revision: 1,
    members: [],
    plans: [],
    tasks: [],
    checkins: [],
    slots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function randomId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
