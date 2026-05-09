// popup.js
// Зависит от: глобальной переменной SERVICES, определённой в services.js
(function () {
  "use strict";

  // --- DOM ---
  const cpeIdInput      = document.getElementById("cpeId");
  const activateBtn     = document.getElementById("activateBtn");
  const statusDiv       = document.getElementById("status");
  const responseDetails = document.getElementById("responseDetails");
  const responseBody    = document.getElementById("responseBody");

  // ESM
  const vnInput            = document.getElementById("vnInput");
  const vnFromTabBtn       = document.getElementById("vnFromTabBtn");
  const checkEsmBtn        = document.getElementById("checkEsmBtn");
  const esmStatusDiv       = document.getElementById("esmStatus");
  const mscInfoCard        = document.getElementById("mscInfoCard");
  const esmResponseDetails = document.getElementById("esmResponseDetails");
  const esmResponseBody    = document.getElementById("esmResponseBody");

  // ESM options
  const portsCtrl       = document.getElementById("portsCtrl");
  const fttbVlanRow     = document.getElementById("fttbVlanRow");
  const fttbTvVlanInput = document.getElementById("fttbTvVlan");

  // Auth indicator
  const authDot      = document.getElementById("authDot");
  const authLabel    = document.getElementById("authLabel");
  const authLoginBtn = document.getElementById("authLoginBtn");

  var PORTAL_URL_PATTERN  = "http://lo.sibir.rt.ru/*";

  // ACS LEGACYUI — открытие этой страницы триггерит переавторизацию в ACS.
  var ACS_LEGACY_UI_URL = "http://acs.sibir.rt.ru:9673/live/SupportPortal/LEGACYUI/";
  // Реальный API-эндпоинт для проверки сессии: разлогиненному вернёт 401 или
  // редирект/HTML логин-страницы; авторизованному — JSON/CORS-ответ.
  var ACS_AUTH_PROBE_URL =
    "http://acs.sibir.rt.ru:9673/live/SupportPortal/UI/CPEManager/AXServiceStorage/Interfaces/rest/v1/action//transferServices";

  var selectedTech  = "gpon"; // определяется автоматически из techname в ответе MSC
  var selectedPorts = 4;      // 2 | 3 | 4

  var ESM_PREDICTS_URL  = "http://10.143.52.18:3012/clientsPredicts/getSanByVn";
  var ESM_MSC_URL       = "http://10.143.52.18:3012/clientsPredicts/getMesuServiceMsc";
  var ESM_SESSION_URL   = "http://10.143.52.18:3012/clientsPredicts/getMesuSessionStartIpLoginMscOnlineInfo";
  var ESM_MSC_BRANCHES  = [-2, 2, 3, 4, 5, 1, 6, 7];
  var ESM_VERSION_APP  = "1.33";

  var ESM_TOKEN_KEYS = ["token", "jwt", "accessToken", "access_token", "authToken", "auth_token"];

  // --- Состояние ESM ---
  // Хранит данные после успешной проверки, используется для активации.
  var esmPendingActivation = null; // { username, password, hasIPTV, iptvCount, cpeId }

  // --- UI-хелперы (ЦСМ) ---

  function setStatus(type, message) {
    statusDiv.className = "status " + type;
    statusDiv.textContent = message;
    statusDiv.classList.remove("hidden");
  }

  function clearStatus() {
    statusDiv.className = "status hidden";
    statusDiv.textContent = "";
    responseDetails.classList.add("hidden");
    responseBody.textContent = "";
  }

  function setLoading(isLoading) {
    activateBtn.disabled    = isLoading;
    cpeIdInput.disabled     = isLoading;
    activateBtn.textContent = isLoading ? "Отправка…" : "Активировать ЦСМ";
  }

  function showRawResponseObject(obj) {
    responseBody.textContent = JSON.stringify(obj, null, 2);
    responseDetails.classList.remove("hidden");
  }

  // --- Основная логика ЦСМ ---

  function activateService() {
    var cpeId   = cpeIdInput.value.trim();

    if (!cpeId) {
      setStatus("error", "Введите CPE ID.");
      cpeIdInput.focus();
      return;
    }

    // Всегда используем первый сервис из конфига (CSM_GPON).
    var service = SERVICES[0];
    if (!service) {
      setStatus("error", "Сервис ЦСМ не настроен в services.js.");
      return;
    }

    clearStatus();
    setLoading(true);
    setStatus("loading", "Очищаем сервисы CPE: " + cpeId + "…");

    var ACS_BASE = "http://acs.sibir.rt.ru:9673/live/SupportPortal";

    var fetchOpts = {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
    };

    var results = [];

    var clearUrl  = ACS_BASE + "/UI/CPEManager/AXServiceStorage/Interfaces/rest/v1/action//transferServices";
    var clearBody = JSON.stringify({
      NewServiceIdentifiers: { cpeid: "0" },
      ServiceIdentifiers:    { cpeid: cpeId },
      CommandOptions:        { Restore: true, Force: true },
    });

    fetch(clearUrl, Object.assign({}, fetchOpts, { body: clearBody }))
      .then(function (r) {
        return r.text().then(function (text) {
          results.push({ name: "Clear", ok: r.ok, status: r.status, body: text });
        });
      })
      .then(function () {
        setStatus("loading", "Активация ЦСМ для CPE: " + cpeId + "…");

        var url = service.buildUrl(cpeId);
        var activateOpts = {
          method: service.method || "POST",
          credentials: "include",
          headers: {
            "Accept": "application/json, text/plain, */*",
          },
        };

        if (service.body) {
          activateOpts.headers["Content-Type"] = "application/json";
          activateOpts.body = service.body(cpeId);
        }

        return fetch(url, activateOpts).then(function (r) {
          return r.text().then(function (text) {
            results.push({ name: "Activate", ok: r.ok, status: r.status, body: text });
          });
        });
      })
      .then(function () {
        var allOk   = results.every(function (r) { return r.ok; });
        var summary = results.map(function (r) {
          return r.name + " " + (r.ok ? "OK" : "ERR") + " (" + r.status + ")";
        }).join(", ");

        if (allOk) {
          setStatus("success", "ЦСМ активирован для CPE " + cpeId + ": " + summary + ".");
        } else {
          setStatus("error", "ЦСМ активирован частично: " + summary + ".");
        }

        var combined = {};
        results.forEach(function (r) {
          try { combined[r.name] = JSON.parse(r.body); }
          catch (_) { combined[r.name] = r.body; }
        });
        showRawResponseObject(combined);
      })
      .catch(function (err) {
        if (err instanceof TypeError && err.message.indexOf("Failed to fetch") !== -1) {
          setStatus(
            "error",
            "Сетевая ошибка: не удалось достучаться до ACS API. " +
            "Проверьте, что вы в нужной сети и ACS-панель доступна."
          );
        } else {
          setStatus("error", "Неожиданная ошибка: " + err.message);
        }
        console.error("[ACS Activator] fetch error:", err);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  // --- UI-хелперы (ESM) ---

  function setEsmStatus(type, message) {
    esmStatusDiv.className = "status " + type;
    esmStatusDiv.textContent = message;
    esmStatusDiv.classList.remove("hidden");
  }

  function clearEsmStatus() {
    esmStatusDiv.className = "status hidden";
    esmStatusDiv.textContent = "";
    mscInfoCard.classList.add("hidden");
    esmResponseDetails.classList.add("hidden");
    esmResponseBody.textContent = "";
    fttbVlanRow.classList.add("hidden");
    fttbTvVlanInput.value = "";
  }

  function showEsmResponse(data) {
    esmResponseBody.textContent = JSON.stringify(data, null, 2);
    esmResponseDetails.classList.remove("hidden");
    esmResponseDetails.open = true;
  }

  function setEsmBtnMode(mode) {
    checkEsmBtn.dataset.mode = mode;
    if (mode === "activate") {
      checkEsmBtn.textContent = "Активировать ESM";
      checkEsmBtn.classList.remove("btn-secondary");
      checkEsmBtn.classList.add("btn-esm-activate");
    } else {
      checkEsmBtn.textContent = "Проверить сервисы ESM";
      checkEsmBtn.classList.add("btn-secondary");
      checkEsmBtn.classList.remove("btn-esm-activate");
    }
  }

  // --- Segmented controls ---

  function initSegCtrl(ctrl, onSelect) {
    ctrl.addEventListener("click", function (e) {
      var btn = e.target.closest(".seg-btn");
      if (!btn) return;
      ctrl.querySelectorAll(".seg-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      onSelect(btn.dataset.value);
    });
  }

  initSegCtrl(portsCtrl, function (val) {
    selectedPorts = Number(val);
  });

  // Считает количество ТВ-приставок из поля stbs ответа MSC.
  // stbs — строка с MAC-адресами через запятую, напр. "fc449f2b4712,f4e578439fc7".
  function countStbs(stbs) {
    if (!stbs || typeof stbs !== "string") return 0;
    return stbs.split(",").map(function (s) { return s.trim(); }).filter(Boolean).length;
  }

  // Определяет технологию из поля techname ответа getMesuServiceMsc.
  function detectTech(techname) {
    var t = (techname || "").toLowerCase();
    if (t.indexOf("gepon") !== -1) return "gepon";
    if (t.indexOf("fttb") !== -1 || t.indexOf("etth") !== -1 || t.indexOf("fttx") !== -1) return "fttb";
    return "gpon";
  }

  // --- Helpers: построение payload активации ---

  function buildHsiPorts(iptvCount) {
    iptvCount = iptvCount || 0;
    var ports = [];
    // ТВ занимает порты с конца (4, 3, …), HSI берёт оставшиеся с начала
    var hsiEthCount = selectedPorts - iptvCount;
    for (var i = 1; i <= hsiEthCount; i++) {
      ports.push({ portNumber: i, portType: "ETH" });
    }
    ports.push({ portNumber: 1, portType: "Wi-Fi" });
    ports.push({ portNumber: 5, portType: "Wi-Fi" });
    return ports;
  }

  function getHsiSvlan() {
    if (selectedTech === "gepon") return 1;
    if (selectedTech === "fttb")  return 0;
    return 22; // gpon
  }

  // Возвращает ServiceParameters для IPTV или null при ошибке валидации.
  function buildIptvParams(iptvCount) {
    var ports = [];
    for (var i = 0; i < iptvCount; i++) {
      ports.push({ portNumber: selectedPorts - i, portType: "ETH" });
    }
    if (selectedTech === "gepon") {
      return { mVLAN: 2, sVLAN: 3, ports: ports };
    }
    if (selectedTech === "fttb") {
      var tvVlanRaw = fttbTvVlanInput.value.trim();
      var tvVlan = tvVlanRaw === "" ? 0 : parseInt(tvVlanRaw, 10);
      if (!Number.isFinite(tvVlan) || tvVlan < 0) return null;
      return { sVLAN: tvVlan, ports: ports };
    }
    return { sVLAN: 24, ports: ports }; // gpon
  }

  // Показывает карточку с данными абонента из ответа getMesuServiceMsc.
  function showMscInfo(data) {
    document.getElementById("mscClientName").textContent = data.clientName || "—";
    document.getElementById("mscTech").textContent       = data.techname   || "—";
    document.getElementById("mscBranch").textContent     = data.branch_id != null ? "#" + data.branch_id : "—";
    document.getElementById("mscPppoe").textContent      = data.pppoeLogin || "—";
    document.getElementById("mscAccount").textContent    = data.account    || "—";

    var addrParts = [data.city, data.street, data.house, data.flat ? "кв." + data.flat : ""];
    document.getElementById("mscAddress").textContent = addrParts.filter(Boolean).join(", ") || "—";

    // CPE: формат "model||mac1||mac2"
    var cpesEl  = document.getElementById("mscCpes");
    var cpesRow = document.getElementById("mscCpesRow");
    cpesEl.innerHTML = "";

    if (data.cpes) {
      var parts = data.cpes.split("||");
      var model = parts[0];
      var macs  = parts.slice(1);

      var modelSpan = document.createElement("span");
      modelSpan.className   = "cpe-model";
      modelSpan.textContent = model;
      cpesEl.appendChild(modelSpan);

      macs.forEach(function (mac) {
        var btn       = document.createElement("button");
        btn.type      = "button";
        btn.className = "cpe-tag";
        btn.textContent = mac;
        btn.title     = "Подставить в CPE ID";
        btn.addEventListener("click", function () {
          cpeIdInput.value = mac;
          cpeIdInput.focus();
        });
        cpesEl.appendChild(btn);
      });

      cpesRow.classList.remove("hidden");
    } else {
      cpesRow.classList.add("hidden");
    }

    mscInfoCard.classList.remove("hidden");
  }

  // Извлекает JWT из localStorage указанной вкладки.
  function readJwtFromTabId(tabId) {
    return new Promise(function (resolve) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          func: function (keys) {
            for (var i = 0; i < keys.length; i++) {
              var val = localStorage.getItem(keys[i]);
              if (val && val.length > 20) return val;
            }
            for (var j = 0; j < localStorage.length; j++) {
              var k = localStorage.key(j);
              if (k && k.toLowerCase().indexOf("token") !== -1) {
                var v = localStorage.getItem(k);
                if (v && v.length > 20) return v;
              }
            }
            return null;
          },
          args: [ESM_TOKEN_KEYS],
        },
        function (results) {
          if (chrome.runtime.lastError || !results || !results[0]) {
            resolve(null);
          } else {
            resolve(results[0].result || null);
          }
        }
      );
    });
  }

  // Ищет открытую вкладку портала и читает JWT из её localStorage.
  // Если вкладки портала нет — пробует активную вкладку как запасной вариант.
  function getJwtFromTab() {
    return new Promise(function (resolve) {
      chrome.tabs.query({ url: PORTAL_URL_PATTERN }, function (portalTabs) {
        if (portalTabs && portalTabs[0]) {
          readJwtFromTabId(portalTabs[0].id).then(resolve);
          return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (!tabs || !tabs[0]) { resolve(null); return; }
          readJwtFromTabId(tabs[0].id).then(resolve);
        });
      });
    });
  }

  // --- Индикатор авторизации ---

  function setAuthState(state) {
    // state: "checking" | "ok" | "fail"
    authDot.classList.remove("ok", "fail");
    authLabel.classList.remove("ok", "fail");

    if (state === "ok") {
      authDot.classList.add("ok");
      authLabel.classList.add("ok");
      authLabel.textContent = "ACS авторизован";
      authLoginBtn.classList.add("hidden");
    } else if (state === "fail") {
      authDot.classList.add("fail");
      authLabel.classList.add("fail");
      authLabel.textContent = "ACS не авторизован";
      authLoginBtn.classList.remove("hidden");
    } else {
      authLabel.textContent = "Проверка авторизации ACS…";
      authLoginBtn.classList.add("hidden");
    }
  }

  // Проверяет наличие валидной сессии ACS через реальный API-эндпоинт.
  // Шлём POST с пустым JSON-телом: сервер до прикладной логики валидирует
  // авторизацию. Логика интерпретации ответа:
  //   - 401 / 403                          → сессии нет
  //   - Content-Type содержит text/html    → сессии нет (отдали HTML логина)
  //   - финальный URL содержит /login      → редирект на логин-страницу
  //   - всё остальное (JSON 2xx или 4xx)   → сессия валидна, ошибка прикладного
  //                                          уровня (например, 400 на пустом теле)
  function checkAcsAuth() {
    return fetch(ACS_AUTH_PROBE_URL, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: "{}",
    })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) return false;
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.indexOf("text/html") !== -1) return false;
        var u = (r.url || "").toLowerCase();
        if (u.indexOf("/login") !== -1 || u.indexOf("signin") !== -1) return false;
        return true;
      })
      .catch(function () { return false; });
  }

  function checkAuth() {
    setAuthState("checking");
    checkAcsAuth().then(function (ok) {
      setAuthState(ok ? "ok" : "fail");
    });
  }

  authLoginBtn.addEventListener("click", function () {
    chrome.tabs.create({ url: ACS_LEGACY_UI_URL });
  });

  // Клик по лейблу — ручное обновление статуса (на случай, если только что
  // переавторизовались и хочется убедиться, что сессия валидна).
  authLabel.addEventListener("click", function () {
    checkAuth();
  });
  authLabel.title = "Кликните для повторной проверки";

  checkAuth();

  // --- ESM: двухшаговая проверка ---

  function checkEsmServices() {
    var vnRaw = vnInput.value.trim();
    if (!vnRaw) {
      setEsmStatus("error", "Введите VN абонента.");
      vnInput.focus();
      return;
    }

    var vn = Number(vnRaw);
    if (!Number.isFinite(vn) || vn <= 0) {
      setEsmStatus("error", "VN должен быть числом.");
      vnInput.focus();
      return;
    }

    clearEsmStatus();
    esmPendingActivation = null;
    setEsmBtnMode("check");

    checkEsmBtn.disabled    = true;
    checkEsmBtn.textContent = "Запрос…";
    setEsmStatus("loading", "Получаем токен из портала…");

    var savedJwt;
    var savedMscData;
    var savedRows;
    var combinedRaw = {};

    getJwtFromTab()
      .then(function (jwt) {
        if (!jwt) {
          setEsmStatus("error", "JWT не найден. Убедитесь, что вкладка с порталом открыта и вы авторизованы.");
          return Promise.reject(null);
        }
        savedJwt = jwt;

        setEsmStatus("loading", "Запрашиваем данные абонента (VN " + vn + ")…");

        return fetch(ESM_MSC_URL, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "version-app": ESM_VERSION_APP,
            "Authorization": "JWT " + jwt,
          },
          body: JSON.stringify({
            ccInfo: [{ vnManual: String(vn) }],
            branches: ESM_MSC_BRANCHES,
          }),
        }).then(function (r) { return r.json(); });
      })
      .then(function (mscResult) {
        if (mscResult.err) {
          setEsmStatus("error", "Ошибка MSC: " + mscResult.err);
          return Promise.reject(null);
        }

        savedMscData = mscResult.data;
        selectedTech = detectTech(savedMscData.techname);
        showMscInfo(savedMscData);

        var branchId = savedMscData.branch_id;
        setEsmStatus("loading", "Запрашиваем сервисы ESM (branch #" + branchId + ")…");

        return fetch(ESM_PREDICTS_URL, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "version-app": ESM_VERSION_APP,
            "Authorization": "JWT " + savedJwt,
          },
          body: JSON.stringify({ vn: vn, branch_id: branchId }),
        }).then(function (r) {
          return r.json().then(function (json) {
            return { ok: r.ok, status: r.status, json: json };
          });
        });
      })
      .then(function (result) {
        if (result.json.err) {
          setEsmStatus("error", "ESM вернул ошибку: " + result.json.err);
          showEsmResponse(result.json);
          return Promise.reject(null);
        }

        var rows = (result.json.data && result.json.data.raw) || [];
        if (rows.length === 0) {
          setEsmStatus("error", "Сервисы не найдены для VN " + vn + ".");
          showEsmResponse(result.json);
          return Promise.reject(null);
        }

        savedRows = rows;
        combinedRaw.predicts = result.json;

        // Количество ТВ берём из поля stbs ответа MSC — это источник истины
        // (список MAC-адресов приставок через запятую). Если stbs пуст —
        // fallback на эвристику по именам сервисов из предиктов.
        var iptvCount = countStbs(savedMscData.stbs);
        if (iptvCount === 0) {
          rows.forEach(function (row) {
            var sn = (row.serviceName || row.serviceType || "").toLowerCase();
            if (
              sn.indexOf("iptv") !== -1 ||
              sn === "tv" ||
              sn.indexOf("television") !== -1 ||
              sn.indexOf("тв") !== -1 ||
              sn.indexOf("телевид") !== -1
            ) {
              iptvCount++;
            }
          });
        }

        // Показываем поле sVLAN ТВ только для FTTB с IPTV
        if (selectedTech === "fttb" && iptvCount > 0) {
          fttbVlanRow.classList.remove("hidden");
        } else {
          fttbVlanRow.classList.add("hidden");
          fttbTvVlanInput.value = "";
        }

        // pppoeLogin может отсутствовать в ответе MSC (например, для FTTB).
        // В этом случае берём login из ответа предиктов.
        var predictsLogin = (savedRows[0] && savedRows[0].login) ||
                            (result.json.data && result.json.data.byVn &&
                             Object.keys(result.json.data.byVn).reduce(function (acc, k) {
                               var l = result.json.data.byVn[k].logins;
                               return acc || (l && l[0]) || null;
                             }, null)) || null;
        var username = savedMscData.pppoeLogin || predictsLogin;
        if (!username) {
          setEsmStatus("error", "Логин не найден ни в MSC (pppoeLogin), ни в предиктах (login) — невозможно запросить пароль.");
          showEsmResponse(combinedRaw);
          return Promise.reject(null);
        }

        setEsmStatus("loading", "Запрашиваем пароль для " + username + "…");

        return fetch(ESM_SESSION_URL, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "version-app": ESM_VERSION_APP,
            "Authorization": "JWT " + savedJwt,
          },
          body: JSON.stringify({
            loginsStart: [username],
            branch_id: savedMscData.branch_id,
          }),
        })
          .then(function (r) { return r.json(); })
          .then(function (sessionJson) {
            combinedRaw.session = sessionJson;

            // Ответ: { data: { passwd, login, branch_id, raw: [...] } }
            var password = (sessionJson.data && sessionJson.data.passwd) || null;

            var names    = savedRows.map(function (r) { return r.serviceName; }).join(", ");
            var iptvNote = iptvCount > 0
              ? " · ТВ: " + iptvCount + " шт."
              : "";
            var techNote = " [" + selectedTech.toUpperCase() + "]";

            esmPendingActivation = {
              username:  username,
              password:  password,
              hasIPTV:   iptvCount > 0,
              iptvCount: iptvCount,
            };

            if (!password) {
              // Данные получены, но пароль не распознан — показываем raw для отладки
              setEsmStatus(
                "success",
                "Сервисы: " + names + iptvNote + techNote + ". Пароль не распознан — см. ответ сессии."
              );
            } else {
              setEsmStatus("success", "Готово: " + names + iptvNote + techNote + ". Пароль получен.");
            }

            showEsmResponse(combinedRaw);

            // Трансформируем кнопку
            setEsmBtnMode("activate");
          });   // конец .then(sessionJson)
      })         // конец .then(result)
      .catch(function (err) {
        if (err === null) return; // статус уже выставлен
        if (err instanceof TypeError && err.message.indexOf("Failed to fetch") !== -1) {
          setEsmStatus("error", "Сетевая ошибка: недоступен API (10.143.52.18:3012). Проверьте сеть.");
        } else {
          setEsmStatus("error", "Ошибка: " + err.message);
        }
        console.error("[ACS Activator] ESM fetch error:", err);
      })
      .finally(function () {
        checkEsmBtn.disabled = false;
        // Текст кнопки уже выставлен через setEsmBtnMode — не перезаписываем.
        if (checkEsmBtn.dataset.mode !== "activate") {
          checkEsmBtn.textContent = "Проверить сервисы ESM";
        }
      });
  }

  // --- ESM: активация HSI + IPTV ---

  function activateEsmServices() {
    var cpeId = cpeIdInput.value.trim();
    if (!cpeId) {
      setEsmStatus("error", "Введите CPE ID перед активацией ESM.");
      cpeIdInput.focus();
      return;
    }

    if (!esmPendingActivation) {
      setEsmStatus("error", "Сначала выполните проверку сервисов ESM.");
      return;
    }

    var data = esmPendingActivation;

    if (!data.username) {
      setEsmStatus("error", "Логин (pppoeLogin) не найден в данных ESM — активация невозможна.");
      return;
    }
    if (!data.password) {
      setEsmStatus("error", "Пароль не найден в данных ESM — активация невозможна.");
      return;
    }

    // Для FTTB с IPTV — sVLAN ТВ может быть пустым или 0; проверяем только формат
    if (data.hasIPTV && selectedTech === "fttb") {
      var tvVlanRaw = fttbTvVlanInput.value.trim();
      if (tvVlanRaw !== "") {
        var tvVlanCheck = parseInt(tvVlanRaw, 10);
        if (!Number.isFinite(tvVlanCheck) || tvVlanCheck < 0) {
          setEsmStatus("error", "sVLAN ТВ должен быть числом ≥ 0 или пустым.");
          fttbTvVlanInput.focus();
          return;
        }
      }
    }

    checkEsmBtn.disabled    = true;
    checkEsmBtn.textContent = "Активация…";
    setEsmStatus("loading", "Очищаем сервисы CPE: " + cpeId + "…");

    var ACS_BASE = "http://acs.sibir.rt.ru:9673/live/SupportPortal";

    var fetchOpts = {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
    };

    var results = [];

    var clearUrl  = ACS_BASE + "/UI/CPEManager/AXServiceStorage/Interfaces/rest/v1/action//transferServices";
    var clearBody = JSON.stringify({
      NewServiceIdentifiers: { cpeid: "0" },
      ServiceIdentifiers:    { cpeid: cpeId },
      CommandOptions:        { Restore: true, Force: true },
    });

    fetch(clearUrl, Object.assign({}, fetchOpts, { body: clearBody }))
      .then(function (r) {
        return r.text().then(function (text) {
          results.push({ name: "Clear", ok: r.ok, status: r.status, body: text });
        });
      })
      .then(function () {
        setEsmStatus("loading", "Активируем HSI для CPE: " + cpeId + "…");

        var hsiUrl  = ACS_BASE + "/LEGACYUI/CPEManager/AXServiceStorage/Interfaces/rest/v1/services/HSI/cpeid/" +
                      encodeURIComponent(cpeId) + "/action/activate";

        var hsiBody = JSON.stringify({
          ServiceIdentifiers: { cpeid: cpeId },
          ServiceParameters: {
            username: data.username,
            password: data.password,
            connectionType: "Routing",
            sVLAN: getHsiSvlan(),
            ports: buildHsiPorts(data.hasIPTV ? data.iptvCount : 0),
          },
          CommandOptions: {},
        });

        return fetch(hsiUrl, Object.assign({}, fetchOpts, { body: hsiBody }))
          .then(function (r) {
            return r.text().then(function (text) {
              results.push({ name: "HSI", ok: r.ok, status: r.status, body: text });
            });
          });
      })
      .then(function () {
        if (!data.hasIPTV) return Promise.resolve();

        setEsmStatus("loading", "Активируем IPTV (" + data.iptvCount + " шт.) для CPE: " + cpeId + "…");

        var iptvUrl = ACS_BASE + "/UI/CPEManager/AXServiceStorage/Interfaces/rest/v1/services/IPTV/cpeid/" +
                     encodeURIComponent(cpeId) + "/action/activate";

        var iptvBody = JSON.stringify({
          ServiceIdentifiers: { cpeid: cpeId },
          ServiceParameters: buildIptvParams(data.iptvCount),
          CommandOptions: {},
        });

        return fetch(iptvUrl, Object.assign({}, fetchOpts, { body: iptvBody }))
          .then(function (r) {
            return r.text().then(function (text) {
              results.push({ name: "IPTV", ok: r.ok, status: r.status, body: text });
            });
          });
      })
      .then(function () {
        var allOk   = results.every(function (r) { return r.ok; });
        var summary = results.map(function (r) {
          return r.name + " " + (r.ok ? "OK" : "ERR") + " (" + r.status + ")";
        }).join(", ");

        setEsmStatus(
          allOk ? "success" : "error",
          (allOk ? "ESM активирован: " : "ESM активирован частично: ") + summary
        );

        var combined = {};
        results.forEach(function (r) {
          try { combined[r.name] = JSON.parse(r.body); }
          catch (_) { combined[r.name] = r.body; }
        });
        showEsmResponse(combined);
      })
      .catch(function (err) {
        if (err instanceof TypeError && err.message.indexOf("Failed to fetch") !== -1) {
          setEsmStatus("error", "Сетевая ошибка при активации ESM. Проверьте сеть.");
        } else {
          setEsmStatus("error", "Ошибка активации: " + err.message);
        }
        console.error("[ACS Activator] ESM activate error:", err);
      })
      .finally(function () {
        checkEsmBtn.disabled = false;
        checkEsmBtn.textContent = "Активировать ESM";
      });
  }

  // --- Сброс режима кнопки при изменении VN ---

  vnInput.addEventListener("input", function () {
    if (checkEsmBtn.dataset.mode === "activate") {
      esmPendingActivation = null;
      setEsmBtnMode("check");
      clearEsmStatus();
    }
  });

  // --- Обработчики событий ---

  activateBtn.addEventListener("click", activateService);

  cpeIdInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") activateService();
  });

  checkEsmBtn.addEventListener("click", function () {
    if (checkEsmBtn.dataset.mode === "activate") {
      activateEsmServices();
    } else {
      checkEsmServices();
    }
  });

  vnInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") checkEsmServices();
  });

  // --- VN из URL вкладки ---

  function fillVnFromTab(overwrite) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url) return;
      try {
        var url = new URL(tabs[0].url);
        var vn  = url.searchParams.get("vn");
        if (vn && vn.length > 0 && (overwrite || !vnInput.value.trim())) {
          vnInput.value = vn;
          // Сброс ESM-состояния если VN изменился
          if (checkEsmBtn.dataset.mode === "activate") {
            esmPendingActivation = null;
            setEsmBtnMode("check");
            clearEsmStatus();
          }
        }
      } catch (_) {}
    });
  }

  vnFromTabBtn.addEventListener("click", function () { fillVnFromTab(true); });

  // При открытии — заполняем только если поле пустое
  fillVnFromTab(false);

  cpeIdInput.focus();
})();
