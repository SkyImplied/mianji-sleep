(function () {
  "use strict";

  var STORAGE_KEY = "mianji_sleep_records_v1";
  var GOAL_MINUTES = 7 * 60;
  var MAX_CHART_MINUTES = 10 * 60;
  var state = {
    records: loadRecords(),
    period: 7,
    activeView: "today"
  };

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };

  function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
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
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
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
  }

  function latestRecord() {
    var todayKey = localDateKey(new Date());
    return state.records.find(function (r) { return r.date <= todayKey; }) || null;
  }

  function renderToday() {
    var latest = latestRecord();
    if (latest) {
      var duration = durationParts(sleepMinutes(latest));
      $("#hero-status").textContent = latest.date === localDateKey(new Date()) ? "今日已记录" : "最近记录 · " + formatShortDate(latest.date);
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
    $("#metric-goal").textContent = recent.filter(function (r) { return sleepMinutes(r) >= GOAL_MINUTES; }).length + " 天";
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
      if (minutes >= 7 * 60 && minutes <= 9 * 60) classes.push("on-target");
      if (i === 0) classes.push("today");
      barHtml += '<span class="' + classes.join(" ") + '" style="height:' + pct + '%" data-value="' + (record ? (minutes / 60).toFixed(1) + "h" : "") + '"></span>';
      labelHtml += "<span>" + (i === 0 ? "今" : "周" + weekdayLabel(day)) + "</span>";
    }
    $("#home-bars").innerHTML = barHtml;
    $("#home-labels").innerHTML = labelHtml;
  }

  function renderTrends() {
    var data = recordsWithin(state.period);
    var durations = data.map(sleepMinutes);
    var avg = average(durations);
    var avgQuality = average(data.map(function (r) { return Number(r.quality) || 3; }));
    $("#trend-average").textContent = avg === null ? "--" : compactDuration(Math.round(avg));
    $("#trend-quality").textContent = avgQuality === null ? "--" : avgQuality.toFixed(1) + "/5";
    $("#trend-consistency").textContent = consistencyLabel(data);
    $("#trend-chart-title").textContent = "最近 " + state.period + " 天";
    renderTrendChart(data);
    renderTiming(data);
    renderInsight(data);
  }

  function consistencyLabel(records) {
    if (records.length < 2) return "--";
    var adjusted = records.map(function (r) {
      var minutes = timeToMinutes(r.bedtime);
      return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
    });
    var mean = average(adjusted);
    var variance = average(adjusted.map(function (n) { return Math.pow(n - mean, 2); }));
    var deviation = Math.sqrt(variance);
    if (deviation <= 30) return "很规律";
    if (deviation <= 60) return "较规律";
    if (deviation <= 90) return "有波动";
    return "需调整";
  }

  function renderTrendChart(records) {
    var holder = $("#line-chart");
    if (records.length < 2) {
      holder.innerHTML = '<div class="empty-chart">至少记录 2 天后显示趋势曲线</div>';
      return;
    }
    var sorted = records.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var width = 340;
    var height = 180;
    var left = 22;
    var right = 10;
    var top = 14;
    var bottom = 28;
    var usableW = width - left - right;
    var usableH = height - top - bottom;
    var minM = 4 * 60;
    var maxM = 11 * 60;
    var points = sorted.map(function (r, index) {
      var x = left + (sorted.length === 1 ? usableW / 2 : index / (sorted.length - 1) * usableW);
      var clipped = Math.max(minM, Math.min(maxM, sleepMinutes(r)));
      var y = top + (maxM - clipped) / (maxM - minM) * usableH;
      return { x: x, y: y, record: r };
    });
    var path = points.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    var areaPath = path + " L " + points[points.length - 1].x.toFixed(1) + " " + (top + usableH) + " L " + points[0].x.toFixed(1) + " " + (top + usableH) + " Z";
    var labels = [5, 8, 11].map(function (hour) {
      var y = top + (maxM - hour * 60) / (maxM - minM) * usableH;
      return '<line class="chart-grid-line" x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '"/><text class="chart-axis-label" x="0" y="' + (y + 3) + '">' + hour + 'h</text>';
    }).join("");
    var pointHtml = points.map(function (p, i) {
      var label = "";
      if (sorted.length <= 10 || i === 0 || i === sorted.length - 1) {
        var d = parseDateKey(p.record.date);
        label = '<text class="chart-axis-label" text-anchor="middle" x="' + p.x + '" y="' + (height - 4) + '">' + (d.getMonth() + 1) + "/" + d.getDate() + "</text>";
      }
      return '<circle class="chart-point" cx="' + p.x + '" cy="' + p.y + '" r="3.5"><title>' + compactDuration(sleepMinutes(p.record)) + '</title></circle>' + label;
    }).join("");
    holder.innerHTML = '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="睡眠时长趋势图"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#75b296" stop-opacity=".28"/><stop offset="1" stop-color="#75b296" stop-opacity="0"/></linearGradient></defs>' + labels + '<path class="chart-area" d="' + areaPath + '"/><path class="chart-path" d="' + path + '"/>' + pointHtml + "</svg>";
  }

  function circularAverage(minutesArray) {
    if (!minutesArray.length) return null;
    var sin = 0;
    var cos = 0;
    minutesArray.forEach(function (minutes) {
      var angle = minutes / 1440 * Math.PI * 2;
      sin += Math.sin(angle);
      cos += Math.cos(angle);
    });
    var angle = Math.atan2(sin / minutesArray.length, cos / minutesArray.length);
    if (angle < 0) angle += Math.PI * 2;
    return Math.round(angle / (Math.PI * 2) * 1440) % 1440;
  }

  function minutesToClock(minutes) {
    if (minutes === null) return "--:--";
    return String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
  }

  function renderTiming(records) {
    var bed = circularAverage(records.map(function (r) { return timeToMinutes(r.bedtime); }));
    var wake = circularAverage(records.map(function (r) { return timeToMinutes(r.waketime); }));
    $("#avg-bedtime").textContent = minutesToClock(bed);
    $("#avg-waketime").textContent = minutesToClock(wake);
    $("#timing-span").style.width = records.length ? "100%" : "0";
  }

  function renderInsight(records) {
    var title = "开始记录你的睡眠";
    var text = "连续记录几天后，这里会出现关于睡眠时长与规律度的个性化提示。";
    if (records.length >= 2) {
      var avg = average(records.map(sleepMinutes));
      var goalDays = records.filter(function (r) { return sleepMinutes(r) >= GOAL_MINUTES; }).length;
      if (avg < 6 * 60) {
        title = "最近睡眠偏少";
        text = "平均睡眠不足 6 小时。可以尝试把上床时间提前 20–30 分钟，先从小幅调整开始。";
      } else if (goalDays / records.length >= .7) {
        title = "你的睡眠时长很稳定";
        text = "多数记录达到了 7 小时目标。继续保持相近的入睡和起床时间，会更有利于稳定节律。";
      } else {
        title = "试着让作息更规律";
        text = "目前睡眠时长有一些波动。优先固定起床时间，通常比强迫自己按时入睡更容易坚持。";
      }
    }
    $("#insight-title").textContent = title;
    $("#insight-text").textContent = text;
  }

  function formatShortDate(key) {
    var d = parseDateKey(key);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function renderHistory() {
    var list = $("#history-list");
    $("#history-count").textContent = state.records.length ? "共 " + state.records.length + " 条记录" : "还没有记录";
    if (!state.records.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-moon"></div><h3>从今晚开始</h3><p>记录入睡与起床时间，<br>慢慢看见自己的睡眠节律。</p></div>';
      return;
    }
    var groups = {};
    state.records.forEach(function (record) {
      var key = record.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });
    list.innerHTML = Object.keys(groups).sort().reverse().map(function (monthKey) {
      var parts = monthKey.split("-");
      var title = parts[0] + "年" + Number(parts[1]) + "月";
      var items = groups[monthKey].map(function (record) {
        var date = parseDateKey(record.date);
        return '<button class="history-item" data-edit="' + record.id + '"><span class="date-tile"><strong>' + date.getDate() + '</strong><small>周' + weekdayLabel(date) + '</small></span><span class="history-main"><strong>' + record.bedtime + ' → ' + record.waketime + '</strong><small>' + (record.note ? escapeHtml(record.note) : "无备注") + '</small></span><span class="history-duration"><strong>' + compactDuration(sleepMinutes(record)) + '</strong><small>' + qualityStars(record.quality) + "</small></span></button>";
      }).join("");
      return '<section><h3 class="month-title">' + title + '</h3><div class="history-group">' + items + "</div></section>";
    }).join("");
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function switchView(name) {
    state.activeView = name;
    $$(".view").forEach(function (view) { view.classList.toggle("active", view.id === "view-" + name); });
    $$(".bottom-nav button").forEach(function (button) { button.classList.toggle("active", button.dataset.view === name); });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    $("#record-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet(id) {
    $(id).hidden = true;
    if ($("#record-backdrop").hidden && $("#settings-backdrop").hidden) document.body.style.overflow = "";
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
      id: $("#edit-id").value || String(Date.now()),
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
    closeSheet("#record-backdrop");
    render();
    showToast("睡眠记录已保存");
  }

  function deleteCurrentEntry() {
    var id = $("#edit-id").value;
    if (!id) return;
    if (!window.confirm("确定删除这条睡眠记录吗？")) return;
    state.records = state.records.filter(function (r) { return r.id !== id; });
    saveRecords();
    closeSheet("#record-backdrop");
    render();
    showToast("记录已删除");
  }

  function exportData() {
    var payload = { app: "眠迹", version: 1, exportedAt: new Date().toISOString(), records: state.records };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "眠迹睡眠记录_" + localDateKey(new Date()) + ".json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("备份已导出");
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
        var merged = {};
        state.records.concat(records).forEach(function (r) { merged[r.date] = r; });
        state.records = Object.keys(merged).map(function (key) { return merged[key]; });
        saveRecords();
        render();
        closeSheet("#settings-backdrop");
        showToast("已导入 " + records.length + " 条记录");
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
    $("#history-add").addEventListener("click", function () { openRecordSheet(); });
    $("#close-sheet").addEventListener("click", function () { closeSheet("#record-backdrop"); });
    $("#sleep-form").addEventListener("submit", handleSubmit);
    $("#bedtime").addEventListener("input", updateDurationPreview);
    $("#waketime").addEventListener("input", updateDurationPreview);
    $("#delete-entry").addEventListener("click", deleteCurrentEntry);
    $("#history-list").addEventListener("click", function (event) {
      var button = event.target.closest("[data-edit]");
      if (!button) return;
      var record = state.records.find(function (r) { return r.id === button.dataset.edit; });
      if (record) openRecordSheet(record);
    });
    $$(".period-switch button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.period = Number(button.dataset.period);
        $$(".period-switch button").forEach(function (item) { item.classList.toggle("active", item === button); });
        renderTrends();
      });
    });
    $("#open-settings").addEventListener("click", function () {
      $("#settings-backdrop").hidden = false;
      document.body.style.overflow = "hidden";
    });
    $("#close-settings").addEventListener("click", function () { closeSheet("#settings-backdrop"); });
    $("#export-data").addEventListener("click", exportData);
    $("#import-data").addEventListener("change", function (event) { importData(event.target.files[0]); });
    $("#clear-data").addEventListener("click", function () {
      if (!state.records.length) return showToast("当前没有可清空的数据");
      if (!window.confirm("确定清空全部睡眠记录吗？此操作无法撤销。")) return;
      state.records = [];
      saveRecords();
      render();
      closeSheet("#settings-backdrop");
      showToast("全部记录已清空");
    });
    ["#record-backdrop", "#settings-backdrop"].forEach(function (id) {
      $(id).addEventListener("click", function (event) {
        if (event.target === $(id)) closeSheet(id);
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeSheet("#record-backdrop");
      closeSheet("#settings-backdrop");
    });
  }

  bindEvents();
  render();
})();
