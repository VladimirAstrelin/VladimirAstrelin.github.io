// ============================================================================
// НАСТРОЙКИ BLE (должны совпадать с UUID в прошивке main.cpp)
// ============================================================================
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const DEVICE_NAME = 'ESP32_Demo_Device';

// ============================================================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
let device = null;
let characteristic = null;
let isConnected = false;

// ============================================================================
// DOM-ЭЛЕМЕНТЫ
// ============================================================================
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const ledOnBtn = document.getElementById('ledOnBtn');
const ledOffBtn = document.getElementById('ledOffBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

const linkStatus = document.getElementById('linkStatus');
const linkStatusText = document.getElementById('linkStatusText');

const eventScreen = document.getElementById('eventScreen');
const eventValue = document.getElementById('eventValue');
const eventMeta = document.getElementById('eventMeta');

const logContent = document.getElementById('logContent');
const compatHint = document.getElementById('compatHint');

// ============================================================================
// ЛОГ СОБЫТИЙ
// ============================================================================
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `console__entry console__entry--${type}`;

  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false });

  const msg = document.createElement('span');
  msg.className = 'console__msg';
  msg.textContent = message;

  entry.append(time, msg);
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
}

function clearLog() {
  logContent.innerHTML = '';
  addLog('Log cleared', 'info');
}

// ============================================================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
// ============================================================================
function setLinkState(state) {
  // state: 'offline' | 'connecting' | 'online'
  linkStatus.dataset.state = state;
  linkStatusText.textContent =
    state === 'online' ? 'Online' : state === 'connecting' ? 'Connecting…' : 'Offline';
}

function updateControlsAvailability() {
  connectBtn.disabled = isConnected;
  disconnectBtn.disabled = !isConnected;
  ledOnBtn.disabled = !isConnected;
  ledOffBtn.disabled = !isConnected;
}

function showEvent(valueText, metaText) {
  eventValue.textContent = valueText;
  eventMeta.textContent = metaText;
  eventScreen.dataset.empty = 'false';

  // Короткая вспышка, чтобы новое событие было заметно на экране
  eventScreen.classList.remove('flash');
  // reflow, чтобы анимация перезапустилась при повторных одинаковых событиях
  void eventScreen.offsetWidth;
  eventScreen.classList.add('flash');
}

// ============================================================================
// ОБРАБОТКА ДАННЫХ ОТ ESP32
// ============================================================================
function handleDataFromESP32(data) {
  addLog(`Received: ${data}`, 'info');

  switch (data) {
    case 'SHORT_PRESS':
      showEvent('SHORT PRESS', 'Button tapped');
      addLog('Button: short press', 'event');
      break;

    case 'LONG_PRESS':
      showEvent('LONG PRESS', 'Held ≥ 2s');
      addLog('Button: long press', 'event');
      break;

    case 'LED_ON_OK':
      addLog('Onboard LED is on', 'success');
      break;

    case 'LED_OFF_OK':
      addLog('Onboard LED is off', 'success');
      break;

    default:
      addLog(`Unrecognised payload: ${data}`, 'error');
  }
}

// ============================================================================
// ОТПРАВКА КОМАНД НА ESP32
// ============================================================================
async function sendCommand(command) {
  if (!characteristic || !isConnected) {
    addLog('Not connected to device', 'error');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(command));
    addLog(`Sent: ${command}`, 'send');
    return true;
  } catch (error) {
    addLog(`Send failed: ${error.message}`, 'error');
    return false;
  }
}

function handleLEDOn() { sendCommand('LED_ON'); }
function handleLEDOff() { sendCommand('LED_OFF'); }

// ============================================================================
// УВЕДОМЛЕНИЯ (NOTIFY) ОТ ESP32
// ============================================================================
async function setupNotifications() {
  if (!characteristic) return;

  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', (event) => {
    const text = new TextDecoder().decode(event.target.value);
    handleDataFromESP32(text);
  });

  addLog('Notifications enabled', 'success');
}

// ============================================================================
// ОБРАБОТКА НЕОЖИДАННОГО ОТКЛЮЧЕНИЯ
// (в исходном коде такого обработчика не было — интерфейс мог "зависать"
// в состоянии "подключено", даже если плата пропала из радиуса действия
// или перезагрузилась)
// ============================================================================
function onUnexpectedDisconnect() {
  isConnected = false;
  characteristic = null;
  setLinkState('offline');
  updateControlsAvailability();
  eventScreen.dataset.empty = 'true';
  eventMeta.textContent = 'Waiting for connection';
  addLog('Device disconnected unexpectedly', 'error');
}

// ============================================================================
// ПОДКЛЮЧЕНИЕ К ESP32
// ============================================================================
async function connectToESP32() {
  if (!navigator.bluetooth) {
    compatHint.hidden = false;
    addLog('Web Bluetooth is not supported in this browser', 'error');
    return;
  }

  setLinkState('connecting');
  addLog('Requesting device…', 'info');

  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID],
    });

    device.addEventListener('gattserverdisconnected', onUnexpectedDisconnect);

    addLog(`Found: ${device.name || 'unnamed device'}`, 'success');

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    isConnected = true;
    setLinkState('online');
    updateControlsAvailability();

    await setupNotifications();
    addLog('Ready', 'success');
  } catch (error) {
    addLog(`Connection failed: ${error.message}`, 'error');

    if (device && device.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    }

    isConnected = false;
    setLinkState('offline');
    updateControlsAvailability();
  }
}

// ============================================================================
// ОТКЛЮЧЕНИЕ (по кнопке пользователя)
// ============================================================================
async function disconnect() {
  if (device && device.gatt.connected) {
    device.removeEventListener('gattserverdisconnected', onUnexpectedDisconnect);
    device.gatt.disconnect();
    addLog('Disconnected', 'info');
  }

  device = null;
  characteristic = null;
  isConnected = false;

  setLinkState('offline');
  updateControlsAvailability();
  eventScreen.dataset.empty = 'true';
  eventMeta.textContent = 'Waiting for connection';
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
connectBtn.addEventListener('click', connectToESP32);
disconnectBtn.addEventListener('click', disconnect);
ledOnBtn.addEventListener('click', handleLEDOn);
ledOffBtn.addEventListener('click', handleLEDOff);
clearLogBtn.addEventListener('click', clearLog);

if (!navigator.bluetooth) {
  compatHint.hidden = false;
}

updateControlsAvailability();
addLog('Page loaded. Click "Connect device" to begin.', 'info');
