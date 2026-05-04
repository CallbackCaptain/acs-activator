// services.js
// Конфигурация активируемых сервисов ACS.
//
// Чтобы добавить новый сервис — достаточно добавить объект в массив SERVICES.
// Остальные файлы трогать не нужно.
//
// Поля каждого объекта:
//   id       {string}   — уникальный ключ, используется в DOM
//   label    {string}   — название в выпадающем списке
//   buildUrl {function} — (cpeId: string) => string  — полный URL запроса
//   method   {string}   — HTTP-метод ('POST', 'PUT', 'GET' …)
//   body     {null|function} — null = без тела; или (cpeId) => string для тела запроса

// Общее тело запроса для всех CSM-сервисов.
// Структура фиксирована; подставляется только cpeid.
function buildCsmBody(cpeId) {
  return JSON.stringify({
    ServiceIdentifiers: { cpeid: cpeId },
    ServiceParameters: {
      connectionMode: "PPPoE",
      sVLAN: 10,
      ports: [
        { portNumber: 1, portType: "ETH" },
        { portNumber: 2, portType: "ETH" },
        { portNumber: 3, portType: "ETH" },
        { portNumber: 4, portType: "ETH" },
        { portNumber: 1, portType: "Wi-Fi" },
        { portNumber: 5, portType: "Wi-Fi" },
      ],
    },
    CommandOptions: {},
  });
}

const SERVICES = [
  {
    id: "CSM_GPON",
    label: "ЦСМ (CSM_GPON)",
    buildUrl: (cpeId) =>
      "http://acs.sibir.rt.ru:9673/live/SupportPortal/UI/CPEManager/" +
      "AXServiceStorage/Interfaces/rest/v1/services/CSM_GPON/cpeid/" +
      encodeURIComponent(cpeId) +
      "/action/activate",
    method: "POST",
    body: buildCsmBody,
  },

  // Пример добавления второго сервиса (раскомментируйте и заполните URL):
  // {
  //   id: "CSM_IPTV",
  //   label: "ЦСМ IPTV",
  //   buildUrl: (cpeId) =>
  //     "http://acs.sibir.rt.ru:9673/.../services/CSM_IPTV/cpeid/" +
  //     encodeURIComponent(cpeId) + "/action/activate",
  //   method: "POST",
  //   body: buildCsmBody,
  // },
];
