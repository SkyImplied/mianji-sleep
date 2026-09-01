(function () {
  "use strict";

  var STORAGE_KEY = "mianji_sleep_records_v1";
  var PROFILE_KEY = "mianji_profile_v1";
  var POOP_KEY = "mianji_poop_records_v1";
  var CALCIUM_KEY = "mianji_calcium_records_v1";
  var CLOUD_QUEUE_PREFIX = "mianji_cloud_queue_v1_";
  var CLOUD_INITIALIZED_PREFIX = "mianji_cloud_initialized_v1_";
  var CLOUD_DIRTY_KEY = "mianji_cloud_local_dirty_v1";
  var MAX_CHART_MINUTES = 10 * 60;
  var HISTORY_PAGE_SIZE = 20;
  var SECRET_TAP_TARGET = 5;
  var SECRET_TAP_TIMEOUT = 1800;
  var OVERLAY_IDS = ["#migration-backdrop", "#login-backdrop", "#secret-backdrop", "#confirm-backdrop", "#settings-backdrop", "#calcium-backdrop", "#poop-backdrop", "#record-backdrop"];
  var state = {
    records: loadRecords(),
    poopRecords: loadPoopRecords(),
    calciumRecords: loadCalciumRecords(),
    profileName: loadProfileName(),
    bedtimeGoal: loadBedtimeGoal(),
    period: 7,
    activeView: "today",
    historyPage: loadHistoryPage(),
    calendarMetric: "sleep",
    calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  };

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  var pendingConfirmAction = null;
  var secretTapCount = 0;
  var secretTapTimer = null;
  var activeLoginMethod = "sms";
  var smsVerification = null;
  var smsPhone = "";
  var smsCountdownTimer = null;
  var smsCountdownRemaining = 0;
  var cloudState = {
    app: null,
    auth: null,
    db: null,
    user: null,
    userId: "",
    username: "",
    status: "checking",
    initialized: false,
    busy: false,
    error: ""
  };

  function storageGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (error) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      showToast("本机存储空间不足，请先导出备份");
      return false;
    }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (error) { /* The in-memory state remains usable. */ }
  }

  function loadHistoryPage() {
    try {
      var value = Number(new URL(window.location.href).searchParams.get("historyPage"));
      return Number.isInteger(value) && value > 0 ? value : 1;
    } catch (error) {
      return 1;
    }
  }

  function persistHistoryPage() {
    try {
      var url = new URL(window.location.href);
      if (state.historyPage > 1) url.searchParams.set("historyPage", state.historyPage);
      else url.searchParams.delete("historyPage");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (error) {
      /* Paging still works when the current URL cannot be rewritten. */
    }
  }

  function loadProfileName() {
    try {
      var saved = JSON.parse(storageGet(PROFILE_KEY, "{}"));
      return String(saved.name || "薯条脆脆").trim().slice(0, 12) || "薯条脆脆";
    } catch (error) {
      return "薯条脆脆";
    }
  }

  function loadBedtimeGoal() {
    try {
      var saved = JSON.parse(storageGet(PROFILE_KEY, "{}"));
      return /^\d{2}:\d{2}$/.test(saved.bedtimeGoal || "") ? saved.bedtimeGoal : "22:00";
    } catch (error) {
      return "22:00";
    }
  }

  function loadPoopRecords() {
    try {
      var raw = JSON.parse(storageGet(POOP_KEY, "[]"));
      return Array.isArray(raw) ? raw.filter(function (r) { return r && r.date && r.time; }) : [];
    } catch (error) {
      return [];
    }
  }

  function loadCalciumRecords() {
    try {
      var raw = JSON.parse(storageGet(CALCIUM_KEY, "[]"));
      return Array.isArray(raw) ? raw.filter(function (r) { return r && r.date && r.time && Number(r.dose) > 0; }) : [];
    } catch (error) {
      return [];
    }
  }

  function saveProfileName() {
    storageSet(PROFILE_KEY, JSON.stringify({ name: state.profileName, bedtimeGoal: state.bedtimeGoal }));
  }

  function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function backupFileName() {
    var safeName = String(state.profileName || "薯条脆脆")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim() || "薯条脆脆";
    return safeName + "健康记录_" + localDateKey(new Date()) + ".json";
  }

  function parseDateKey(key) {
    var parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function shiftDate(date, amount) {
    var next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function loadRecords() {
    try {
      var raw = JSON.parse(storageGet(STORAGE_KEY, "[]"));
      if (!Array.isArray(raw)) return [];
      return raw.filter(isValidRecord).sort(function (a, b) { return b.date.localeCompare(a.date); });
    } catch (error) {
      return [];
    }
  }

  function isValidRecord(record) {
    return record && /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
      /^\d{2}:\d{2}$/.test(record.bedtime) && /^\d{2}:\d{2}$/.test(record.waketime);
  }

  function saveRecords() {
    state.records.sort(function (a, b) { return b.date.localeCompare(a.date); });
    storageSet(STORAGE_KEY, JSON.stringify(state.records));
  }

  function saveWellnessRecords() {
    state.poopRecords.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    state.calciumRecords.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    storageSet(POOP_KEY, JSON.stringify(state.poopRecords));
    storageSet(CALCIUM_KEY, JSON.stringify(state.calciumRecords));
  }

  function totalLocalRecords() {
    return state.records.length + state.poopRecords.length + state.calciumRecords.length;
  }

  function cloudQueueKey() {
    return CLOUD_QUEUE_PREFIX + cloudState.userId;
  }

  function cloudInitializedKey() {
    return CLOUD_INITIALIZED_PREFIX + cloudState.userId;
  }

  function loadCloudQueue() {
    if (!cloudState.userId) return [];
    try {
      var queue = JSON.parse(storageGet(cloudQueueKey(), "[]"));
      return Array.isArray(queue) ? queue : [];
    } catch (error) {
      return [];
    }
  }

  function saveCloudQueue(queue) {
    if (cloudState.userId) storageSet(cloudQueueKey(), JSON.stringify(queue));
  }

  function markLocalDirty() {
    storageSet(CLOUD_DIRTY_KEY, "1");
  }

  function isLocalDirty() {
    return storageGet(CLOUD_DIRTY_KEY, "0") === "1";
  }

  function clearLocalDirty() {
    storageRemove(CLOUD_DIRTY_KEY);
  }

  function setCloudStatus(status, errorMessage) {
    cloudState.status = status;
    cloudState.error = errorMessage || "";
    renderCloudStatus();
  }

  function renderCloudStatus() {
    var card = $("#cloud-card");
    if (!card) return;
    var labels = {
      checking: ["正在检查云端状态", "本机记录不受影响。"],
      unavailable: ["云端服务暂不可用", "仍可继续使用本机记录，稍后刷新页面再试。"],
      "signed-out": ["仅保存在本机", "登录后可把记录加密传输到你的 CloudBase 账户。"],
      "needs-consent": ["等待首次同步", "需要你确认后，才会合并并上传本机记录。"],
      syncing: ["正在同步", "请保持页面开启，本机记录已经安全保存。"],
      synced: ["已同步到云端", "本机与 CloudBase 已完成同步。"],
      pending: ["待同步", "记录已保存在本机，联网后可再次同步。"],
      error: ["同步遇到问题", "本机记录没有丢失，可以稍后重试。"]
    };
    var content = labels[cloudState.status] || labels.error;
    card.dataset.status = cloudState.status;
    $("#cloud-status-label").textContent = content[0];
    $("#cloud-status-copy").textContent = content[1];
    $("#cloud-account").hidden = !cloudState.user;
    $("#cloud-account").textContent = cloudState.user ? "账户 · " + (cloudState.username || "已登录用户") : "";
    $("#cloud-error").hidden = !cloudState.error;
    $("#cloud-error").textContent = cloudState.error;
    $("#cloud-login").hidden = cloudState.status === "checking" || cloudState.status === "unavailable" || Boolean(cloudState.user);
    $("#cloud-sync").hidden = !cloudState.user || cloudState.status === "syncing";
    $("#cloud-logout").hidden = !cloudState.user || cloudState.status === "syncing";
    var indicator = $("#cloud-indicator");
    indicator.className = "cloud-indicator" + (["synced", "pending", "needs-consent", "error"].indexOf(cloudState.status) >= 0 ? " " + cloudState.status : "");
  }

  function setButtonBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.idleLabel || button.textContent;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function cloudUserFromData(data) {
    if (!data) return null;
    return data.user || (data.session && data.session.user) || null;
  }

  function cloudUserId(user, data) {
    return String((user && (user.id || user.sub || user.uid)) || (data && data.session && (data.session.sub || data.session.user_id)) || "");
  }

  function cloudUsername(user, fallback) {
    if (!user) return fallback || "";
    var metadata = user.user_metadata || user.metadata || {};
    var phone = String(user.phone || metadata.phone || "");
    return String(user.username || metadata.username || metadata.name || (phone ? maskPhone(phone) : "") || fallback || "");
  }

  function normalizePhone(value) {
    var phone = String(value || "").replace(/[\s()-]/g, "");
    if (phone.indexOf("+86") === 0) phone = phone.slice(3);
    else if (phone.indexOf("0086") === 0) phone = phone.slice(4);
    else if (phone.indexOf("86") === 0 && phone.length === 13) phone = phone.slice(2);
    return phone.replace(/\D/g, "");
  }

  function maskPhone(value) {
    var phone = normalizePhone(value);
    return /^1\d{10}$/.test(phone) ? phone.slice(0, 3) + "****" + phone.slice(-4) : phone;
  }

  function assertCloudResult(result) {
    if (result && result.error) throw result.error;
    return result && result.data !== undefined ? result.data : result;
  }

  function friendlyCloudError() {
    return navigator.onLine === false ? "当前网络不可用，记录已留在本机。" : "暂时无法连接云端，请稍后再试。";
  }

  function applyCloudSession(data, fallbackUsername) {
    var user = cloudUserFromData(data);
    var id = cloudUserId(user, data);
    if (!user || !id) return false;
    cloudState.user = user;
    cloudState.userId = id;
    cloudState.username = cloudUsername(user, fallbackUsername);
    cloudState.initialized = storageGet(cloudInitializedKey(), "0") === "1";
    return true;
  }

  function cloudRecordId(type, id) {
    var current = String(id || "");
    if (!cloudState.userId || current.indexOf(cloudState.userId + "_") === 0) return current;
    var cleaned = current.replace(/[^a-zA-Z0-9_-]/g, "").slice(-64) || String(Date.now());
    return cloudState.userId + "_" + type.charAt(0) + "_" + cleaned;
  }

  function newRecordId(type) {
    var raw = type.charAt(0) + Date.now() + Math.random().toString(36).slice(2, 7);
    return cloudState.user && cloudState.initialized ? cloudRecordId(type, raw) : raw;
  }

  function recordToCloudRow(type, record) {
    return {
      id: cloudRecordId(type, record.id),
      owner_id: cloudState.userId,
      record_type: type,
      record_date: record.date,
      event_time: type === "sleep" ? null : record.time,
      bedtime: type === "sleep" ? record.bedtime : null,
      waketime: type === "sleep" ? record.waketime : null,
      quality: type === "sleep" ? Number(record.quality || 3) : null,
      condition_label: type === "poop" ? String(record.condition || "正常") : null,
      dose_mg: type === "calcium" ? Number(record.dose || 0) : null,
      note: String(record.note || "").slice(0, 80)
    };
  }

  function cloudRowToRecord(row) {
    var common = { id: String(row.id), date: String(row.record_date).slice(0, 10), note: String(row.note || "").slice(0, 80) };
    if (row.record_type === "sleep") {
      common.bedtime = String(row.bedtime || "").slice(0, 5);
      common.waketime = String(row.waketime || "").slice(0, 5);
      common.quality = Math.max(1, Math.min(5, Number(row.quality) || 3));
    } else {
      common.time = String(row.event_time || "").slice(0, 5);
      if (row.record_type === "poop") common.condition = String(row.condition_label || "正常");
      if (row.record_type === "calcium") common.dose = Number(row.dose_mg || 0);
    }
    return common;
  }

  function queueCloudOperation(operation) {
    if (!cloudState.userId) return;
    var queue = loadCloudQueue().filter(function (item) { return item.key !== operation.key; });
    queue.push(operation);
    saveCloudQueue(queue);
    setCloudStatus("pending");
  }

  function queueRecordUpsert(type, record) {
    queueCloudOperation({ key: type + ":" + record.id, kind: "record-upsert", type: type, record: record });
  }

  function queueRecordDelete(type, id) {
    queueCloudOperation({ key: type + ":" + id, kind: "record-delete", type: type, id: id });
  }

  function queueProfileUpsert() {
    queueCloudOperation({ key: "profile", kind: "profile-upsert", profileName: state.profileName, bedtimeGoal: state.bedtimeGoal });
  }

  function afterLocalUpsert(type, record) {
    if (cloudState.user && cloudState.initialized) {
      queueRecordUpsert(type, record);
      flushCloudQueue();
    } else {
      markLocalDirty();
      if (cloudState.user) setCloudStatus("needs-consent");
    }
  }

  function afterLocalDelete(type, id) {
    if (cloudState.user && cloudState.initialized) {
      queueRecordDelete(type, id);
      flushCloudQueue();
    } else {
      markLocalDirty();
      if (cloudState.user) setCloudStatus("needs-consent");
    }
  }

  function afterProfileChange() {
    if (cloudState.user && cloudState.initialized) {
      queueProfileUpsert();
      flushCloudQueue();
    } else {
      markLocalDirty();
      if (cloudState.user) setCloudStatus("needs-consent");
    }
  }

  async function runCloudOperation(operation) {
    var result;
    if (operation.kind === "record-upsert") {
      result = await cloudState.db.from("health_records").upsert(recordToCloudRow(operation.type, operation.record), { onConflict: "id" });
    } else if (operation.kind === "record-delete") {
      result = await cloudState.db.from("health_records").delete().eq("id", operation.id);
    } else if (operation.kind === "profile-upsert") {
      result = await cloudState.db.from("user_profiles").upsert({ owner_id: cloudState.userId, profile_name: operation.profileName, bedtime_goal: operation.bedtimeGoal }, { onConflict: "owner_id" });
    }
    assertCloudResult(result);
  }

  async function flushCloudQueue() {
    if (!cloudState.user || !cloudState.initialized || cloudState.busy) return false;
    var queue = loadCloudQueue();
    if (!queue.length) {
      setCloudStatus("synced");
      return true;
    }
    cloudState.busy = true;
    setCloudStatus("syncing");
    try {
      while (queue.length) {
        await runCloudOperation(queue[0]);
        queue.shift();
        saveCloudQueue(queue);
      }
      setCloudStatus("synced");
      return true;
    } catch (error) {
      setCloudStatus("pending", friendlyCloudError());
      return false;
    } finally {
      cloudState.busy = false;
    }
  }

  async function fetchRemoteRecords() {
    var allRows = [];
    var pageSize = 500;
    for (var offset = 0; offset < 50000; offset += pageSize) {
      var query = cloudState.db.from("health_records")
        .select("id,record_type,record_date,event_time,bedtime,waketime,quality,condition_label,dose_mg,note")
        .order("record_date", { ascending: false });
      if (typeof query.range === "function") query = query.range(offset, offset + pageSize - 1);
      else query = query.limit(pageSize);
      var page = assertCloudResult(await query) || [];
      allRows = allRows.concat(page);
      if (page.length < pageSize || typeof query.range !== "function") break;
    }
    return allRows;
  }

  async function fetchRemoteProfile() {
    var query = cloudState.db.from("user_profiles").select("profile_name,bedtime_goal").eq("owner_id", cloudState.userId).limit(1);
    var rows = assertCloudResult(await query) || [];
    return rows[0] || null;
  }

  function splitRemoteRows(rows) {
    var remote = { sleep: [], poop: [], calcium: [] };
    rows.forEach(function (row) {
      if (!remote[row.record_type]) return;
      var record = cloudRowToRecord(row);
      if (row.record_type === "sleep" && isValidRecord(record)) remote.sleep.push(record);
      else if (row.record_type === "poop" && record.date && record.time) remote.poop.push(record);
      else if (row.record_type === "calcium" && record.date && record.time && record.dose > 0) remote.calcium.push(record);
    });
    return remote;
  }

  function hydrateFromRemote(rows, profile) {
    var remote = splitRemoteRows(rows);
    state.records = remote.sleep;
    state.poopRecords = remote.poop;
    state.calciumRecords = remote.calcium;
    if (profile) {
      state.profileName = String(profile.profile_name || state.profileName).trim().slice(0, 12) || state.profileName;
      if (/^\d{2}:\d{2}/.test(profile.bedtime_goal || "")) state.bedtimeGoal = String(profile.bedtime_goal).slice(0, 5);
    }
    saveRecords();
    saveWellnessRecords();
    saveProfileName();
    render();
  }

  function mergeByKey(localItems, remoteItems, keyFor) {
    var merged = {};
    localItems.forEach(function (item) { merged[keyFor(item)] = item; });
    remoteItems.forEach(function (item) { merged[keyFor(item)] = item; });
    return Object.keys(merged).map(function (key) { return merged[key]; });
  }

  async function upsertRowsInBatches(rows) {
    for (var start = 0; start < rows.length; start += 100) {
      assertCloudResult(await cloudState.db.from("health_records").upsert(rows.slice(start, start + 100), { onConflict: "id" }));
    }
  }

  async function migrateAndSync() {
    if (!cloudState.user || cloudState.busy) return;
    cloudState.busy = true;
    setButtonBusy($("#migration-start"), true, "正在合并…");
    setCloudStatus("syncing");
    try {
      state.records = state.records.map(function (record) { return Object.assign({}, record, { id: cloudRecordId("sleep", record.id) }); });
      state.poopRecords = state.poopRecords.map(function (record) { return Object.assign({}, record, { id: cloudRecordId("poop", record.id) }); });
      state.calciumRecords = state.calciumRecords.map(function (record) { return Object.assign({}, record, { id: cloudRecordId("calcium", record.id) }); });
      var results = await Promise.all([fetchRemoteRecords(), fetchRemoteProfile()]);
      var remote = splitRemoteRows(results[0]);
      state.records = mergeByKey(state.records, remote.sleep, function (record) { return record.date; });
      state.poopRecords = mergeByKey(state.poopRecords, remote.poop, function (record) { return record.id; });
      state.calciumRecords = mergeByKey(state.calciumRecords, remote.calcium, function (record) { return record.id; });
      if (results[1]) {
        state.profileName = String(results[1].profile_name || state.profileName).trim().slice(0, 12) || state.profileName;
        if (/^\d{2}:\d{2}/.test(results[1].bedtime_goal || "")) state.bedtimeGoal = String(results[1].bedtime_goal).slice(0, 5);
      }
      var rows = state.records.map(function (record) { return recordToCloudRow("sleep", record); })
        .concat(state.poopRecords.map(function (record) { return recordToCloudRow("poop", record); }))
        .concat(state.calciumRecords.map(function (record) { return recordToCloudRow("calcium", record); }));
      await upsertRowsInBatches(rows);
      assertCloudResult(await cloudState.db.from("user_profiles").upsert({ owner_id: cloudState.userId, profile_name: state.profileName, bedtime_goal: state.bedtimeGoal }, { onConflict: "owner_id" }));
      saveRecords();
      saveWellnessRecords();
      saveProfileName();
      saveCloudQueue([]);
      storageSet(cloudInitializedKey(), "1");
      cloudState.initialized = true;
      clearLocalDirty();
      closeSheet("#migration-backdrop");
      render();
      setCloudStatus("synced");
      showToast("本机与云端记录已合并");
    } catch (error) {
      setCloudStatus("pending", friendlyCloudError());
      closeSheet("#migration-backdrop");
      showToast("同步未完成，记录已留在本机");
    } finally {
      cloudState.busy = false;
      setButtonBusy($("#migration-start"), false);
    }
  }

  function openMigrationDialog() {
    var count = totalLocalRecords();
    $("#migration-copy").textContent = "本机现有 " + count + " 条记录。开始同步会把本机与云端记录合并，不会先清空任何一边。";
    showSheet("#migration-backdrop");
    window.setTimeout(function () { $("#migration-later").focus(); }, 0);
  }

  async function pullRemoteAndInitialize() {
    cloudState.busy = true;
    setCloudStatus("syncing");
    try {
      var results = await Promise.all([fetchRemoteRecords(), fetchRemoteProfile()]);
      hydrateFromRemote(results[0], results[1]);
      storageSet(cloudInitializedKey(), "1");
      cloudState.initialized = true;
      clearLocalDirty();
      setCloudStatus("synced");
    } catch (error) {
      setCloudStatus("pending", friendlyCloudError());
    } finally {
      cloudState.busy = false;
    }
  }

  async function continueAfterLogin(offerMigration) {
    if (!cloudState.initialized || isLocalDirty()) {
      if (totalLocalRecords()) {
        setCloudStatus("needs-consent");
        if (offerMigration) openMigrationDialog();
      } else {
        await pullRemoteAndInitialize();
      }
      return;
    }
    var flushed = await flushCloudQueue();
    if (flushed) await pullRemoteAndInitialize();
  }

  async function initializeCloud() {
    renderCloudStatus();
    var config = window.MIANJI_CLOUD_CONFIG;
    if (!config || !window.cloudbase || !config.envId || !config.publishableKey) {
      setCloudStatus("unavailable", "云端组件未能加载，本机功能仍可正常使用。");
      return;
    }
    try {
      cloudState.app = window.cloudbase.init({ env: config.envId, region: config.region, accessKey: config.publishableKey });
      cloudState.auth = cloudState.app.auth;
      cloudState.db = cloudState.app.rdb();
      var result = await cloudState.auth.getSession();
      var data = assertCloudResult(result);
      if (!applyCloudSession(data)) {
        setCloudStatus("signed-out");
        window.setTimeout(function () {
          if (!cloudState.user && cloudState.status === "signed-out") openLoginDialog("sms");
        }, 120);
        return;
      }
      await continueAfterLogin(false);
    } catch (error) {
      setCloudStatus("unavailable", friendlyCloudError());
    }
  }

  function clearLoginError(id) {
    var error = $(id);
    error.hidden = true;
    error.textContent = "";
  }

  function switchLoginMethod(method, focusField) {
    activeLoginMethod = method === "password" ? "password" : "sms";
    var smsActive = activeLoginMethod === "sms";
    var smsTab = $("#login-method-sms");
    var passwordTab = $("#login-method-password");
    smsTab.setAttribute("aria-selected", String(smsActive));
    passwordTab.setAttribute("aria-selected", String(!smsActive));
    smsTab.tabIndex = smsActive ? 0 : -1;
    passwordTab.tabIndex = smsActive ? -1 : 0;
    $("#sms-login-form").hidden = !smsActive;
    $("#password-login-form").hidden = smsActive;
    clearLoginError("#sms-login-error");
    clearLoginError("#login-error");
    if (focusField && !$("#login-backdrop").hidden) {
      window.setTimeout(function () { $(smsActive ? "#cloud-phone" : "#cloud-username").focus(); }, 0);
    }
  }

  function renderSmsCountdown() {
    var button = $("#send-cloud-otp");
    if (!button) return;
    if (smsCountdownRemaining > 0) {
      button.disabled = true;
      button.textContent = smsCountdownRemaining + " 秒后重发";
    } else {
      button.disabled = false;
      button.textContent = "获取验证码";
    }
  }

  function clearSmsCountdown() {
    window.clearInterval(smsCountdownTimer);
    smsCountdownTimer = null;
    smsCountdownRemaining = 0;
    renderSmsCountdown();
  }

  function startSmsCountdown(seconds) {
    window.clearInterval(smsCountdownTimer);
    smsCountdownRemaining = seconds;
    renderSmsCountdown();
    smsCountdownTimer = window.setInterval(function () {
      smsCountdownRemaining -= 1;
      renderSmsCountdown();
      if (smsCountdownRemaining <= 0) clearSmsCountdown();
    }, 1000);
  }

  function showSmsError(message, input) {
    var error = $("#sms-login-error");
    error.textContent = message;
    error.hidden = false;
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  }

  function openLoginDialog(method) {
    $("#login-error").hidden = true;
    $("#login-error").textContent = "";
    clearLoginError("#sms-login-error");
    $("#cloud-phone").removeAttribute("aria-invalid");
    $("#cloud-otp").removeAttribute("aria-invalid");
    $("#cloud-password").value = "";
    if (!smsVerification) $("#sms-login-hint").textContent = "首次使用这个手机号时，会自动创建一个独立的云端账户。";
    switchLoginMethod(method || "sms", false);
    showSheet("#login-backdrop");
    window.setTimeout(function () { $(activeLoginMethod === "sms" ? "#cloud-phone" : "#cloud-username").focus(); }, 0);
  }

  async function handleSendSmsCode() {
    var phoneInput = $("#cloud-phone");
    var phone = normalizePhone(phoneInput.value);
    clearLoginError("#sms-login-error");
    phoneInput.removeAttribute("aria-invalid");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showSmsError("请输入正确的中国大陆手机号。", phoneInput);
      return;
    }
    if (!cloudState.auth) {
      showSmsError("云端服务尚未准备好，请稍后再试。", phoneInput);
      return;
    }
    setButtonBusy($("#send-cloud-otp"), true, "正在发送…");
    smsVerification = null;
    smsPhone = "";
    try {
      var result = await cloudState.auth.signInWithOtp({ phone: phone, options: { shouldCreateUser: true } });
      var data = assertCloudResult(result);
      if (!data || typeof data.verifyOtp !== "function") throw new Error("Missing OTP verifier");
      smsVerification = data;
      smsPhone = phone;
      $("#cloud-otp").value = "";
      $("#sms-login-hint").textContent = "验证码已发送至 " + maskPhone(phone) + "，新手机号验证后会自动创建账户。";
      setButtonBusy($("#send-cloud-otp"), false);
      startSmsCountdown(60);
      $("#cloud-otp").focus();
    } catch (error) {
      setButtonBusy($("#send-cloud-otp"), false);
      showSmsError("验证码发送失败，请检查手机号或稍后重试。", phoneInput);
    }
  }

  async function handleSmsLogin(event) {
    event.preventDefault();
    var phoneInput = $("#cloud-phone");
    var otpInput = $("#cloud-otp");
    var phone = normalizePhone(phoneInput.value);
    var token = otpInput.value.trim();
    clearLoginError("#sms-login-error");
    phoneInput.removeAttribute("aria-invalid");
    otpInput.removeAttribute("aria-invalid");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showSmsError("请输入正确的中国大陆手机号。", phoneInput);
      return;
    }
    if (!smsVerification || phone !== smsPhone) {
      showSmsError("请先为这个手机号重新获取验证码。", phoneInput);
      return;
    }
    if (!/^\d{4,8}$/.test(token)) {
      showSmsError("请输入短信中的数字验证码。", otpInput);
      return;
    }
    setButtonBusy($("#sms-login-submit"), true, "正在登录…");
    try {
      var result = await smsVerification.verifyOtp({ token: token });
      var data = assertCloudResult(result);
      if (!applyCloudSession(data, maskPhone(phone))) throw new Error("Missing session");
      smsVerification = null;
      smsPhone = "";
      otpInput.value = "";
      clearSmsCountdown();
      closeSheet("#login-backdrop");
      await continueAfterLogin(true);
    } catch (error) {
      otpInput.value = "";
      showSmsError("验证码不正确或已过期，请重新输入。", otpInput);
    } finally {
      setButtonBusy($("#sms-login-submit"), false);
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    var usernameInput = $("#cloud-username");
    var passwordInput = $("#cloud-password");
    var username = usernameInput.value.trim();
    var password = passwordInput.value;
    usernameInput.removeAttribute("aria-invalid");
    passwordInput.removeAttribute("aria-invalid");
    if (!username || !password) {
      $("#login-error").textContent = "请输入用户名和密码。";
      $("#login-error").hidden = false;
      var firstInvalid = !username ? usernameInput : passwordInput;
      firstInvalid.setAttribute("aria-invalid", "true");
      firstInvalid.focus();
      return;
    }
    setButtonBusy($("#login-submit"), true, "正在登录…");
    $("#login-error").hidden = true;
    try {
      var result = await cloudState.auth.signInWithPassword({ username: username, password: password });
      var data = assertCloudResult(result);
      if (!applyCloudSession(data, username)) throw new Error("Missing session");
      $("#cloud-password").value = "";
      smsVerification = null;
      smsPhone = "";
      $("#cloud-otp").value = "";
      clearSmsCountdown();
      closeSheet("#login-backdrop");
      await continueAfterLogin(true);
    } catch (error) {
      $("#cloud-password").value = "";
      $("#login-error").textContent = "用户名或密码不正确，或云端暂时不可用。";
      $("#login-error").hidden = false;
      passwordInput.setAttribute("aria-invalid", "true");
      passwordInput.focus();
    } finally {
      setButtonBusy($("#login-submit"), false);
    }
  }

  async function manualCloudSync() {
    if (!cloudState.user) return openLoginDialog("sms");
    if (!cloudState.initialized || isLocalDirty()) return openMigrationDialog();
    var flushed = await flushCloudQueue();
    if (flushed) {
      await pullRemoteAndInitialize();
      showToast("云端同步已完成");
    }
  }

  async function logoutCloud() {
    if (!cloudState.auth || cloudState.busy) return;
    setButtonBusy($("#cloud-logout"), true, "正在退出…");
    var didLogout = false;
    try {
      assertCloudResult(await cloudState.auth.signOut());
      cloudState.user = null;
      cloudState.userId = "";
      cloudState.username = "";
      cloudState.initialized = false;
      setCloudStatus("signed-out");
      didLogout = true;
      showToast("已退出，仍保留本机记录");
    } catch (error) {
      setCloudStatus("error", "退出登录失败，请稍后再试。");
    } finally {
      setButtonBusy($("#cloud-logout"), false);
      if (didLogout) window.setTimeout(function () { openLoginDialog("sms"); }, 180);
    }
  }

  function timeToMinutes(value) {
    var parts = value.split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function sleepMinutes(record) {
    var bed = timeToMinutes(record.bedtime);
    var wake = timeToMinutes(record.waketime);
    if (wake <= bed) wake += 24 * 60;
    return wake - bed;
  }

  function nightMinutes(value) {
    var minutes = timeToMinutes(value);
    return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
  }

  function isSleepOnTime(record) {
    return nightMinutes(record.bedtime) <= nightMinutes(state.bedtimeGoal);
  }

  function durationParts(minutes) {
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  }

  function compactDuration(minutes) {
    var part = durationParts(minutes);
    return part.hours + "h " + String(part.minutes).padStart(2, "0") + "m";
  }

  function chineseDuration(minutes) {
    var part = durationParts(minutes);
    return part.hours + " 小时 " + String(part.minutes).padStart(2, "0") + " 分";
  }

  function recordsWithin(days) {
    var today = new Date();
    var start = shiftDate(today, -(days - 1));
    var startKey = localDateKey(start);
    var todayKey = localDateKey(today);
    return state.records.filter(function (r) { return r.date >= startKey && r.date <= todayKey; });
  }

  function average(numbers) {
    if (!numbers.length) return null;
    return numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length;
  }

  function qualityStars(value) {
    var count = Math.max(1, Math.min(5, Number(value) || 3));
    return "★".repeat(count) + "☆".repeat(5 - count);
  }

  function weekdayLabel(date) {
    return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  }

  function render() {
    renderHeader();
    renderToday();
    renderTrends();
    renderHistory();
  }

  function renderHeader() {
    var now = new Date();
    $("#today-label").textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日 · 星期" + weekdayLabel(now);
    $("#display-name").textContent = state.profileName;
    $("#display-name").setAttribute("aria-label", state.profileName);
    $("#profile-name").value = state.profileName;
    $("#bedtime-goal").value = state.bedtimeGoal;
    $("#backup-file-name").textContent = backupFileName();
    $("#home-goal-legend").innerHTML = "<i></i>目标 ≤" + state.bedtimeGoal + " · 7–9h";
    updateDocumentTitle();
  }

  function updateDocumentTitle() {
    var viewNames = { today: "今日", trends: "趋势", history: "记录" };
    document.body.dataset.view = state.activeView;
    $("#display-name").disabled = state.activeView !== "history";
    document.title = (viewNames[state.activeView] || "今日") + " · " + state.profileName + "专属";
  }

  function latestRecord() {
    var todayKey = localDateKey(new Date());
    return state.records.find(function (r) { return r.date <= todayKey; }) || null;
  }

  function renderToday() {
    var latest = latestRecord();
    if (latest) {
      var duration = durationParts(sleepMinutes(latest));
      var sleepGoalStatus = isSleepOnTime(latest) ? "按时入睡" : "晚于 " + state.bedtimeGoal;
      $("#hero-status").textContent = latest.date === localDateKey(new Date()) ? "今日已记录 · " + sleepGoalStatus : "最近记录 · " + formatShortDate(latest.date);
      $("#hero-hours").textContent = duration.hours;
      $("#hero-minutes").textContent = String(duration.minutes).padStart(2, "0");
      $("#hero-range").textContent = latest.bedtime + " 入睡 · " + latest.waketime + " 起床 · " + qualityStars(latest.quality);
    } else {
      $("#hero-status").textContent = "今晚还未记录";
      $("#hero-hours").textContent = "--";
      $("#hero-minutes").textContent = "--";
      $("#hero-range").textContent = "记录后，在这里看见你的休息节律";
    }

    var recent = recordsWithin(7);
    var avg = average(recent.map(sleepMinutes));
    $("#metric-average").textContent = avg === null ? "--" : compactDuration(Math.round(avg));
    var todayKey = localDateKey(new Date());
    var todayPoop = state.poopRecords.filter(function (r) { return r.date === todayKey; });
    var todayCalcium = state.calciumRecords.filter(function (r) { return r.date === todayKey; });
    var calciumTotal = todayCalcium.reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0);
    $("#metric-poop").textContent = todayPoop.length + " 次";
    $("#metric-poop-note").textContent = todayPoop.length ? "今日已记录" : "等待记录";
    $("#metric-calcium").textContent = calciumTotal + " mg";
    $("#metric-calcium-note").textContent = todayCalcium.length ? todayCalcium.length + " 次补充" : "等待记录";
    renderWeekBars(recent);
  }

  function renderWeekBars(records) {
    var today = new Date();
    var byDate = {};
    records.forEach(function (r) { byDate[r.date] = r; });
    var barHtml = "";
    var labelHtml = "";
    for (var i = 6; i >= 0; i -= 1) {
      var day = shiftDate(today, -i);
      var key = localDateKey(day);
      var record = byDate[key];
      var minutes = record ? sleepMinutes(record) : 0;
      var pct = Math.max(5, Math.min(100, minutes / MAX_CHART_MINUTES * 100));
      var classes = ["bar"];
      if (!record) classes.push("empty");
      if (record && minutes >= 7 * 60 && minutes <= 9 * 60 && isSleepOnTime(record)) classes.push("on-target");
      if (record && !isSleepOnTime(record)) classes.push("late");
      if (i === 0) classes.push("today");
      barHtml += '<span class="' + classes.join(" ") + '" style="height:' + pct + '%" data-value="' + (record ? (minutes / 60).toFixed(1) + "h" : "") + '"></span>';
      labelHtml += "<span>" + (i === 0 ? "今" : "周" + weekdayLabel(day)) + "</span>";
    }
    $("#home-bars").innerHTML = barHtml;
    $("#home-labels").innerHTML = labelHtml;
  }

  function renderTrends() {
    var data = recordsWithin(state.period);
    var periodStart = localDateKey(shiftDate(new Date(), -(state.period - 1)));
    var periodEnd = localDateKey(new Date());
    var periodPoop = state.poopRecords.filter(function (r) { return r.date >= periodStart && r.date <= periodEnd; });
    var periodCalcium = state.calciumRecords.filter(function (r) { return r.date >= periodStart && r.date <= periodEnd; });
    var durations = data.map(sleepMinutes);
    var avg = average(durations);
    var onTimeRate = data.length ? Math.round(data.filter(isSleepOnTime).length / data.length * 100) : null;
    $("#trend-average").textContent = avg === null ? "--" : compactDuration(Math.round(avg));
    $("#trend-average-delta").textContent = onTimeRate === null ? "暂无记录" : "按时 " + onTimeRate + "%";
    $("#trend-poop").textContent = periodPoop.length + " 次";
    $("#trend-poop-days").textContent = new Set(periodPoop.map(function (r) { return r.date; })).size + " 天记录";
    $("#trend-calcium").textContent = periodCalcium.reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0) + " mg";
    $("#trend-calcium-days").textContent = new Set(periodCalcium.map(function (r) { return r.date; })).size + " 天记录";
    renderCalendar();
  }

  function renderCalendar() {
    var month = state.calendarMonth;
    var year = month.getFullYear();
    var monthIndex = month.getMonth();
    $("#calendar-month-title").textContent = year + "年" + (monthIndex + 1) + "月";
    var first = new Date(year, monthIndex, 1);
    var mondayOffset = (first.getDay() + 6) % 7;
    var gridStart = shiftDate(first, -mondayOffset);
    var todayKey = localDateKey(new Date());
    var cells = "";
    for (var i = 0; i < 42; i += 1) {
      var date = shiftDate(gridStart, i);
      var key = localDateKey(date);
      var inMonth = date.getMonth() === monthIndex;
      var classes = ["calendar-day"];
      var detail = "无记录";
      if (!inMonth) classes.push("outside");
      if (key === todayKey) classes.push("today-cell");
      if (inMonth && state.calendarMetric === "sleep") {
        var sleepRecord = state.records.find(function (r) { return r.date === key; });
        if (sleepRecord) {
          var onTime = isSleepOnTime(sleepRecord);
          classes.push(onTime ? "sleep-good" : "sleep-late");
          detail = sleepRecord.bedtime + " 入睡 · " + (onTime ? "按时" : "晚于 " + state.bedtimeGoal);
        }
      } else if (inMonth && state.calendarMetric === "poop") {
        var poopCount = state.poopRecords.filter(function (r) { return r.date === key; }).length;
        if (poopCount) classes.push("heat-" + Math.min(3, poopCount));
        detail = poopCount ? "噗噗 " + poopCount + " 次" : "无记录";
      } else if (inMonth && state.calendarMetric === "calcium") {
        var calciumTotal = state.calciumRecords.filter(function (r) { return r.date === key; }).reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0);
        if (calciumTotal) classes.push(calciumTotal >= 600 ? "heat-3" : calciumTotal >= 400 ? "heat-2" : "heat-1");
        detail = calciumTotal ? "补钙 " + calciumTotal + " mg" : "无记录";
      }
      cells += '<span class="' + classes.join(" ") + '" title="' + (date.getMonth() + 1) + "月" + date.getDate() + "日 · " + detail + '"><b>' + date.getDate() + "</b></span>";
    }
    $("#calendar-grid").innerHTML = cells;
    if (state.calendarMetric === "sleep") {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="sleep-good"></i>按时（≤ ' + state.bedtimeGoal + '）</span><span><i class="sleep-late"></i>晚睡</span>';
    } else if (state.calendarMetric === "poop") {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="heat-1"></i>1 次</span><span><i class="heat-2"></i>2 次</span><span><i class="heat-3"></i>3 次以上</span>';
    } else {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="heat-1"></i>1–399mg</span><span><i class="heat-2"></i>400–599mg</span><span><i class="heat-3"></i>≥600mg</span>';
    }
  }

  function formatShortDate(key) {
    var d = parseDateKey(key);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function renderHistory() {
    var list = $("#history-list");
    var events = [];
    state.records.forEach(function (r) { events.push({ type: "sleep", date: r.date, time: r.bedtime, data: r }); });
    state.poopRecords.forEach(function (r) { events.push({ type: "poop", date: r.date, time: r.time, data: r }); });
    state.calciumRecords.forEach(function (r) { events.push({ type: "calcium", date: r.date, time: r.time, data: r }); });
    events.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    if (!events.length) {
      state.historyPage = 1;
      persistHistoryPage();
      list.innerHTML = '<div class="empty-state"><div class="empty-moon"></div><h3>从今天开始</h3><p>睡眠、噗噗和补钙，<br>小小记录也会变成有用的节律。</p></div>';
      return;
    }
    var pageCount = Math.max(1, Math.ceil(events.length / HISTORY_PAGE_SIZE));
    state.historyPage = Math.min(Math.max(1, state.historyPage), pageCount);
    persistHistoryPage();
    var pageStart = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
    var pageEvents = events.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);
    var groups = {};
    pageEvents.forEach(function (event) {
      var key = event.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    var groupedHtml = Object.keys(groups).sort().reverse().map(function (monthKey) {
      var parts = monthKey.split("-");
      var title = parts[0] + "年" + Number(parts[1]) + "月";
      var items = groups[monthKey].map(function (event) {
        var record = event.data;
        var date = parseDateKey(event.date);
        var dateTile = '<span class="date-tile ' + event.type + '-tile"><strong>' + date.getDate() + '</strong><small>周' + weekdayLabel(date) + '</small></span>';
        if (event.type === "sleep") {
          return '<button class="history-item" data-edit="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag">睡眠</i><strong>' + record.bedtime + ' → ' + record.waketime + '</strong><small>' + (record.note ? escapeHtml(record.note) : "无备注") + '</small></span><span class="history-duration"><strong>' + compactDuration(sleepMinutes(record)) + '</strong><small>' + qualityStars(record.quality) + "</small></span></button>";
        }
        if (event.type === "poop") {
          return '<button class="history-item" data-edit-poop="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag poop-tag">噗噗</i><strong>' + record.time + ' · ' + escapeHtml(record.condition || "正常") + '</strong><small>' + (record.note ? escapeHtml(record.note) : "顺利完成一次") + '</small></span><span class="history-duration"><strong>1 次</strong><small>已记录</small></span></button>';
        }
        return '<button class="history-item" data-edit-calcium="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag calcium-tag">补钙</i><strong>' + record.time + ' · ' + Number(record.dose) + ' mg</strong><small>' + (record.note ? escapeHtml(record.note) : "补钙打卡") + '</small></span><span class="history-duration"><strong>' + Number(record.dose) + '</strong><small>mg</small></span></button>';
      }).join("");
      return '<section><h3 class="month-title">' + title + '</h3><div class="history-group">' + items + "</div></section>";
    }).join("");
    var rangeEnd = Math.min(pageStart + HISTORY_PAGE_SIZE, events.length);
    var pagination = '<nav class="history-pagination" aria-label="记录翻页">' +
      '<button type="button" data-history-page="' + (state.historyPage - 1) + '"' + (state.historyPage === 1 ? " disabled" : "") + '>上一页</button>' +
      '<span><strong>' + state.historyPage + '</strong> / ' + pageCount + ' 页</span>' +
      '<button type="button" data-history-page="' + (state.historyPage + 1) + '"' + (state.historyPage === pageCount ? " disabled" : "") + '>下一页</button>' +
      '</nav>';
    list.innerHTML = '<div class="history-overview"><p>第 ' + (pageStart + 1) + '–' + rangeEnd + ' 条</p><span role="status" aria-live="polite">共 ' + events.length + ' 条记录</span></div>' + groupedHtml + pagination;
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function switchView(name) {
    if (state.activeView === name) return;
    state.activeView = name;
    $$(".view").forEach(function (view) { view.classList.toggle("active", view.id === "view-" + name); });
    $$(".bottom-nav button").forEach(function (button) { button.classList.toggle("active", button.dataset.view === name); });
    updateDocumentTitle();
    if (name !== "history") resetSecretTaps();
    window.scrollTo(0, 0);
  }

  function resetSecretTaps() {
    secretTapCount = 0;
    window.clearTimeout(secretTapTimer);
    secretTapTimer = null;
  }

  function handleSecretNameTap() {
    if (state.activeView !== "history") {
      resetSecretTaps();
      return;
    }
    secretTapCount += 1;
    window.clearTimeout(secretTapTimer);
    if (secretTapCount >= SECRET_TAP_TARGET) {
      resetSecretTaps();
      showSheet("#secret-backdrop");
      window.setTimeout(function () { $("#close-secret").focus(); }, 0);
      return;
    }
    secretTapTimer = window.setTimeout(resetSecretTaps, SECRET_TAP_TIMEOUT);
  }

  function showSheet(id) {
    var backdrop = $(id);
    window.clearTimeout(backdrop._closeTimer);
    backdrop._returnFocus = document.activeElement;
    backdrop.classList.remove("closing");
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function openRecordSheet(record) {
    var isEdit = Boolean(record);
    $("#sheet-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#sheet-title").textContent = isEdit ? "编辑睡眠记录" : "记录睡眠";
    $("#edit-id").value = isEdit ? record.id : "";
    $("#sleep-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#bedtime").value = isEdit ? record.bedtime : "23:30";
    $("#waketime").value = isEdit ? record.waketime : "07:30";
    $("#sleep-note").value = isEdit ? (record.note || "") : "";
    var quality = isEdit ? String(record.quality || 3) : "3";
    var radio = $('input[name="quality"][value="' + quality + '"]');
    if (radio) radio.checked = true;
    $("#delete-entry").hidden = !isEdit;
    updateDurationPreview();
    showSheet("#record-backdrop");
  }

  function currentTimeValue() {
    var now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function openPoopSheet(record) {
    var isEdit = Boolean(record);
    $("#poop-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#poop-title").textContent = isEdit ? "编辑噗噗记录" : "记录噗噗";
    $("#poop-edit-id").value = isEdit ? record.id : "";
    $("#poop-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#poop-time").value = isEdit ? record.time : currentTimeValue();
    $("#poop-note").value = isEdit ? (record.note || "") : "";
    var condition = isEdit ? (record.condition || "正常") : "正常";
    var radio = $('input[name="poop-condition"][value="' + condition + '"]');
    if (radio) radio.checked = true;
    $("#delete-poop").hidden = !isEdit;
    showSheet("#poop-backdrop");
  }

  function openCalciumSheet(record) {
    var isEdit = Boolean(record);
    $("#calcium-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#calcium-title").textContent = isEdit ? "编辑补钙记录" : "记录补钙";
    $("#calcium-edit-id").value = isEdit ? record.id : "";
    $("#calcium-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#calcium-time").value = isEdit ? record.time : currentTimeValue();
    $("#calcium-dose").value = isEdit ? Number(record.dose) : 500;
    $("#calcium-note").value = isEdit ? (record.note || "") : "";
    $("#delete-calcium").hidden = !isEdit;
    showSheet("#calcium-backdrop");
  }

  function closeSheet(id) {
    var backdrop = $(id);
    if (backdrop.hidden || backdrop.classList.contains("closing")) return;
    backdrop.classList.add("closing");
    backdrop._closeTimer = window.setTimeout(function () {
      backdrop.hidden = true;
      backdrop.classList.remove("closing");
      if (OVERLAY_IDS.every(function (id) { return $(id).hidden; })) document.body.style.overflow = "";
      if (backdrop._returnFocus && backdrop._returnFocus.isConnected && backdrop._returnFocus.offsetParent !== null) backdrop._returnFocus.focus();
    }, 170);
  }

  function openConfirm(title, message, actionLabel, action) {
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-action").textContent = actionLabel;
    pendingConfirmAction = action;
    showSheet("#confirm-backdrop");
    window.setTimeout(function () { $("#confirm-cancel").focus(); }, 0);
  }

  function acceptConfirm() {
    var action = pendingConfirmAction;
    pendingConfirmAction = null;
    closeSheet("#confirm-backdrop");
    if (action) action();
  }

  function updateDurationPreview() {
    var temp = { bedtime: $("#bedtime").value, waketime: $("#waketime").value };
    if (!temp.bedtime || !temp.waketime) return;
    var minutes = sleepMinutes(temp);
    $("#duration-preview").textContent = minutes > 16 * 60 ? "请检查时间" : chineseDuration(minutes);
  }

  function showToast(message) {
    var toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  function handleSubmit(event) {
    event.preventDefault();
    var entry = {
      id: $("#edit-id").value || newRecordId("sleep"),
      date: $("#sleep-date").value,
      bedtime: $("#bedtime").value,
      waketime: $("#waketime").value,
      quality: Number($('input[name="quality"]:checked').value),
      note: $("#sleep-note").value.trim()
    };
    var duration = sleepMinutes(entry);
    if (duration < 30 || duration > 16 * 60) {
      showToast("请检查入睡和起床时间");
      return;
    }
    var sameDate = state.records.find(function (r) { return r.date === entry.date && r.id !== entry.id; });
    if (sameDate) entry.id = sameDate.id;
    state.records = state.records.filter(function (r) { return r.id !== entry.id && r.date !== entry.date; });
    state.records.push(entry);
    saveRecords();
    afterLocalUpsert("sleep", entry);
    closeSheet("#record-backdrop");
    render();
    showToast("睡眠记录已保存");
  }

  function deleteCurrentEntry() {
    var id = $("#edit-id").value;
    if (!id) return;
    openConfirm("删除睡眠记录", "这条睡眠记录删除后无法恢复。", "删除", function () {
      state.records = state.records.filter(function (r) { return r.id !== id; });
      saveRecords();
      afterLocalDelete("sleep", id);
      closeSheet("#record-backdrop");
      render();
      showToast("记录已删除");
    });
  }

  function handlePoopSubmit(event) {
    event.preventDefault();
    var entry = {
      id: $("#poop-edit-id").value || newRecordId("poop"),
      date: $("#poop-date").value,
      time: $("#poop-time").value,
      condition: $('input[name="poop-condition"]:checked').value,
      note: $("#poop-note").value.trim()
    };
    state.poopRecords = state.poopRecords.filter(function (r) { return r.id !== entry.id; });
    state.poopRecords.push(entry);
    saveWellnessRecords();
    afterLocalUpsert("poop", entry);
    closeSheet("#poop-backdrop");
    render();
    showToast("噗噗记录已保存");
  }

  function handleCalciumSubmit(event) {
    event.preventDefault();
    var dose = Number($("#calcium-dose").value);
    if (!dose || dose < 1 || dose > 3000) {
      showToast("请输入 1–3000 mg 的剂量");
      return;
    }
    var entry = {
      id: $("#calcium-edit-id").value || newRecordId("calcium"),
      date: $("#calcium-date").value,
      time: $("#calcium-time").value,
      dose: dose,
      note: $("#calcium-note").value.trim()
    };
    state.calciumRecords = state.calciumRecords.filter(function (r) { return r.id !== entry.id; });
    state.calciumRecords.push(entry);
    saveWellnessRecords();
    afterLocalUpsert("calcium", entry);
    closeSheet("#calcium-backdrop");
    render();
    showToast("补钙记录已保存");
  }

  function deletePoopEntry() {
    var id = $("#poop-edit-id").value;
    if (!id) return;
    openConfirm("删除噗噗记录", "这条噗噗记录删除后无法恢复。", "删除", function () {
      state.poopRecords = state.poopRecords.filter(function (r) { return r.id !== id; });
      saveWellnessRecords();
      afterLocalDelete("poop", id);
      closeSheet("#poop-backdrop");
      render();
      showToast("噗噗记录已删除");
    });
  }

  function deleteCalciumEntry() {
    var id = $("#calcium-edit-id").value;
    if (!id) return;
    openConfirm("删除补钙记录", "这条补钙记录删除后无法恢复。", "删除", function () {
      state.calciumRecords = state.calciumRecords.filter(function (r) { return r.id !== id; });
      saveWellnessRecords();
      afterLocalDelete("calcium", id);
      closeSheet("#calcium-backdrop");
      render();
      showToast("补钙记录已删除");
    });
  }

  function downloadBackup(file) {
    var url = URL.createObjectURL(file);
    var link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("备份已下载");
  }

  async function exportData() {
    var payload = { app: "薯条脆脆健康记录", version: 5, profileName: state.profileName, bedtimeGoal: state.bedtimeGoal, exportedAt: new Date().toISOString(), records: state.records, poopRecords: state.poopRecords, calciumRecords: state.calciumRecords };
    var file = new File([JSON.stringify(payload, null, 2)], backupFileName(), { type: "application/json" });

    try {
      if (typeof window.showSaveFilePicker === "function") {
        var handle = await window.showSaveFilePicker({
          suggestedName: file.name,
          types: [{ description: "健康记录备份", accept: { "application/json": [".json"] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        showToast("备份已保存到所选文件夹");
        return;
      }

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        showToast("备份已交给系统处理");
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }

    downloadBackup(file);
  }

  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var records = Array.isArray(parsed) ? parsed : parsed.records;
        if (!Array.isArray(records)) throw new Error("Invalid data");
        records = records.filter(isValidRecord).map(function (r) {
          return {
            id: String(r.id || Date.now() + Math.random()),
            date: r.date,
            bedtime: r.bedtime,
            waketime: r.waketime,
            quality: Math.max(1, Math.min(5, Number(r.quality) || 3)),
            note: String(r.note || "").slice(0, 80)
          };
        });
        var poopRecords = !Array.isArray(parsed) && Array.isArray(parsed.poopRecords) ? parsed.poopRecords.filter(function (r) {
          return r && r.date && r.time;
        }).map(function (r) {
          return { id: String(r.id || "p" + Date.now() + Math.random()), date: r.date, time: r.time, condition: String(r.condition || "正常"), note: String(r.note || "").slice(0, 80) };
        }) : [];
        var calciumRecords = !Array.isArray(parsed) && Array.isArray(parsed.calciumRecords) ? parsed.calciumRecords.filter(function (r) {
          return r && r.date && r.time && Number(r.dose) > 0;
        }).map(function (r) {
          return { id: String(r.id || "c" + Date.now() + Math.random()), date: r.date, time: r.time, dose: Math.min(3000, Number(r.dose)), note: String(r.note || "").slice(0, 80) };
        }) : [];
        var merged = {};
        state.records.concat(records).forEach(function (r) { merged[r.date] = r; });
        state.records = Object.keys(merged).map(function (key) { return merged[key]; });
        state.poopRecords = state.poopRecords.concat(poopRecords);
        state.calciumRecords = state.calciumRecords.concat(calciumRecords);
        if (!Array.isArray(parsed) && parsed.profileName) {
          state.profileName = String(parsed.profileName).trim().slice(0, 12) || state.profileName;
        }
        if (!Array.isArray(parsed) && /^\d{2}:\d{2}$/.test(parsed.bedtimeGoal || "")) state.bedtimeGoal = parsed.bedtimeGoal;
        saveProfileName();
        saveRecords();
        saveWellnessRecords();
        markLocalDirty();
        if (cloudState.user) setCloudStatus("needs-consent");
        render();
        closeSheet("#settings-backdrop");
        showToast("已导入 " + (records.length + poopRecords.length + calciumRecords.length) + " 条记录");
      } catch (error) {
        showToast("无法识别这个备份文件");
      }
      $("#import-data").value = "";
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    $$(".bottom-nav button").forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.view); });
    });
    $$("[data-go]").forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.go); });
    });
    $("#quick-add").addEventListener("click", function () { openRecordSheet(); });
    $("#quick-poop").addEventListener("click", function () { openPoopSheet(); });
    $("#quick-calcium").addEventListener("click", function () { openCalciumSheet(); });
    $("#display-name").addEventListener("click", handleSecretNameTap);
    $("#close-sheet").addEventListener("click", function () { closeSheet("#record-backdrop"); });
    $("#sleep-form").addEventListener("submit", handleSubmit);
    $("#bedtime").addEventListener("input", updateDurationPreview);
    $("#waketime").addEventListener("input", updateDurationPreview);
    $("#delete-entry").addEventListener("click", deleteCurrentEntry);
    $("#close-poop").addEventListener("click", function () { closeSheet("#poop-backdrop"); });
    $("#close-calcium").addEventListener("click", function () { closeSheet("#calcium-backdrop"); });
    $("#poop-form").addEventListener("submit", handlePoopSubmit);
    $("#calcium-form").addEventListener("submit", handleCalciumSubmit);
    $("#delete-poop").addEventListener("click", deletePoopEntry);
    $("#delete-calcium").addEventListener("click", deleteCalciumEntry);
    $$("[data-dose]").forEach(function (button) {
      button.addEventListener("click", function () { $("#calcium-dose").value = button.dataset.dose; });
    });
    $("#history-list").addEventListener("click", function (event) {
      var pageButton = event.target.closest("[data-history-page]");
      if (pageButton && !pageButton.disabled) {
        state.historyPage = Number(pageButton.dataset.historyPage) || 1;
        persistHistoryPage();
        renderHistory();
        window.scrollTo(0, 0);
        return;
      }
      var sleepButton = event.target.closest("[data-edit]");
      var poopButton = event.target.closest("[data-edit-poop]");
      var calciumButton = event.target.closest("[data-edit-calcium]");
      if (sleepButton) {
        var sleepRecord = state.records.find(function (r) { return r.id === sleepButton.dataset.edit; });
        if (sleepRecord) openRecordSheet(sleepRecord);
      } else if (poopButton) {
        var poopRecord = state.poopRecords.find(function (r) { return r.id === poopButton.dataset.editPoop; });
        if (poopRecord) openPoopSheet(poopRecord);
      } else if (calciumButton) {
        var calciumRecord = state.calciumRecords.find(function (r) { return r.id === calciumButton.dataset.editCalcium; });
        if (calciumRecord) openCalciumSheet(calciumRecord);
      }
    });
    $$(".period-switch button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.period = Number(button.dataset.period);
        $$(".period-switch button").forEach(function (item) { item.classList.toggle("active", item === button); });
        renderTrends();
      });
    });
    $$("[data-calendar-metric]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.calendarMetric = button.dataset.calendarMetric;
        $$("[data-calendar-metric]").forEach(function (item) { item.classList.toggle("active", item === button); });
        renderCalendar();
      });
    });
    $("#calendar-prev").addEventListener("click", function () {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    $("#calendar-next").addEventListener("click", function () {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    $("#open-settings").addEventListener("click", function () {
      $("#profile-name").value = state.profileName;
      $("#bedtime-goal").value = state.bedtimeGoal;
      showSheet("#settings-backdrop");
    });
    $("#save-profile").addEventListener("click", function () {
      var nextName = $("#profile-name").value.trim().slice(0, 12);
      if (!nextName) {
        showToast("请输入专属名称");
        $("#profile-name").focus();
        return;
      }
      var nextGoal = $("#bedtime-goal").value;
      if (!/^\d{2}:\d{2}$/.test(nextGoal)) {
        showToast("请选择最晚入睡时间");
        return;
      }
      state.profileName = nextName;
      state.bedtimeGoal = nextGoal;
      saveProfileName();
      afterProfileChange();
      render();
      showToast("专属设置已更新");
    });
    $("#profile-name").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        $("#save-profile").click();
      }
    });
    $("#close-settings").addEventListener("click", function () { closeSheet("#settings-backdrop"); });
    $("#cloud-login").addEventListener("click", openLoginDialog);
    $("#cloud-sync").addEventListener("click", manualCloudSync);
    $("#cloud-logout").addEventListener("click", logoutCloud);
    $("#close-login").addEventListener("click", function () { closeSheet("#login-backdrop"); });
    $("#login-method-sms").addEventListener("click", function () { switchLoginMethod("sms", true); });
    $("#login-method-password").addEventListener("click", function () { switchLoginMethod("password", true); });
    $$(".login-method-switch [role=tab]").forEach(function (tab) {
      tab.addEventListener("keydown", function (event) {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
        event.preventDefault();
        var nextMethod = event.key === "ArrowLeft" || event.key === "Home" ? "sms" : "password";
        switchLoginMethod(nextMethod, false);
        $(nextMethod === "sms" ? "#login-method-sms" : "#login-method-password").focus();
      });
    });
    $("#send-cloud-otp").addEventListener("click", handleSendSmsCode);
    $("#sms-login-form").addEventListener("submit", handleSmsLogin);
    $("#password-login-form").addEventListener("submit", handlePasswordLogin);
    $("#cloud-phone").addEventListener("input", function () {
      $("#cloud-phone").removeAttribute("aria-invalid");
      clearLoginError("#sms-login-error");
      if (smsPhone && normalizePhone($("#cloud-phone").value) !== smsPhone) {
        $("#sms-login-hint").textContent = "手机号已更改，请为新号码重新获取验证码。";
      }
    });
    $("#cloud-otp").addEventListener("input", function () {
      $("#cloud-otp").removeAttribute("aria-invalid");
      clearLoginError("#sms-login-error");
    });
    ["#cloud-username", "#cloud-password"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        $(id).removeAttribute("aria-invalid");
        clearLoginError("#login-error");
      });
    });
    $("#toggle-cloud-password").addEventListener("click", function () {
      var input = $("#cloud-password");
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      $("#toggle-cloud-password").textContent = showing ? "显示" : "隐藏";
      $("#toggle-cloud-password").setAttribute("aria-pressed", String(!showing));
      $("#toggle-cloud-password").setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
    });
    $("#migration-later").addEventListener("click", function () { closeSheet("#migration-backdrop"); });
    $("#migration-start").addEventListener("click", migrateAndSync);
    $("#export-data").addEventListener("click", exportData);
    $("#import-data").addEventListener("change", function (event) { importData(event.target.files[0]); });
    $("#clear-data").addEventListener("click", function () {
      if (!state.records.length && !state.poopRecords.length && !state.calciumRecords.length) return showToast("当前没有可清空的数据");
      openConfirm("清空全部记录", "睡眠、噗噗和补钙记录都会永久删除，且无法恢复。", "全部删除", function () {
        var deletedSleep = state.records.map(function (record) { return record.id; });
        var deletedPoop = state.poopRecords.map(function (record) { return record.id; });
        var deletedCalcium = state.calciumRecords.map(function (record) { return record.id; });
        state.records = [];
        state.poopRecords = [];
        state.calciumRecords = [];
        saveRecords();
        saveWellnessRecords();
        if (cloudState.user && cloudState.initialized) {
          deletedSleep.forEach(function (id) { queueRecordDelete("sleep", id); });
          deletedPoop.forEach(function (id) { queueRecordDelete("poop", id); });
          deletedCalcium.forEach(function (id) { queueRecordDelete("calcium", id); });
          flushCloudQueue();
        } else {
          markLocalDirty();
        }
        render();
        closeSheet("#settings-backdrop");
        showToast("全部记录已清空");
      });
    });
    $("#confirm-cancel").addEventListener("click", function () {
      pendingConfirmAction = null;
      closeSheet("#confirm-backdrop");
    });
    $("#confirm-action").addEventListener("click", acceptConfirm);
    $("#close-secret").addEventListener("click", function () { closeSheet("#secret-backdrop"); });
    OVERLAY_IDS.forEach(function (id) {
      $(id).addEventListener("click", function (event) {
        if (event.target === $(id)) {
          if (id === "#confirm-backdrop") pendingConfirmAction = null;
          closeSheet(id);
        }
      });
    });
    document.addEventListener("keydown", function (event) {
      var openBackdrop = OVERLAY_IDS.map($).find(function (item) { return !item.hidden && !item.classList.contains("closing"); });
      if (!openBackdrop) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (openBackdrop.id === "confirm-backdrop") pendingConfirmAction = null;
        closeSheet("#" + openBackdrop.id);
        return;
      }
      if (event.key !== "Tab") return;
      var focusable = Array.from(openBackdrop.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (item) { return item.offsetParent !== null; });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener("online", function () {
      if (cloudState.user && cloudState.initialized && loadCloudQueue().length) flushCloudQueue();
    });
  }

  function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") return;
    navigator.storage.persist().catch(function () {
      /* Local backup remains available when persistent storage is not granted. */
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var isSecureOrigin = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isSecureOrigin) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        /* The online app remains usable if offline setup is unavailable. */
      });
    });
  }

  bindEvents();
  render();
  initializeCloud();
  requestPersistentStorage();
  registerServiceWorker();
})();
