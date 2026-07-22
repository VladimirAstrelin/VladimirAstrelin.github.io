let port = null;
let reader = null;
let writer = null;
let connected = false;

const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const ledOnBtn = document.getElementById('ledOn');
const ledOffBtn = document.getElementById('ledOff');
const ledBlinkBtn = document.getElementById('ledBlink');
const logDiv = document.getElementById('log');
const clearLogBtn = document.getElementById('clearLog');
const ledVisual = document.getElementById('ledVisual');

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `<span class="time">[${time}]</span> <span class="${type}">${msg}</span>`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function updateStatus(connectedState) {
    connected = connectedState;
    if (connected) {
        statusEl.textContent = 'Подключено';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        ledOnBtn.disabled = false;
        ledOffBtn.disabled = false;
        ledBlinkBtn.disabled = false;
    } else {
        statusEl.textContent = 'Отключено';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        ledOnBtn.disabled = true;
        ledOffBtn.disabled = true;
        ledBlinkBtn.disabled = true;
        ledVisual.className = 'led-circle';
    }
}

async function connect() {
    try {
        if (!('serial' in navigator)) {
            addLog('Ваш браузер не поддерживает Web Serial API', 'error');
            return;
        }
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
        updateStatus(true);
        addLog('Подключено к STM32', 'ok');
        readLoop();
    } catch (err) {
        addLog('Ошибка подключения: ' + err.message, 'error');
    }
}

async function disconnect() {
    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
            reader = null;
        }
        if (writer) {
            await writer.close();
            writer.releaseLock();
            writer = null;
        }
        if (port) {
            await port.close();
            port = null;
        }
        updateStatus(false);
        addLog('Отключено', 'info');
    } catch (err) {
        addLog('Ошибка отключения: ' + err.message, 'error');
    }
}

async function readLoop() {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // последний неполный кусок
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        addLog(trimmed, 'info');
                        // Обновляем индикатор по ответам
                        if (trimmed.startsWith('OK LED ON')) {
                            ledVisual.className = 'led-circle on';
                        } else if (trimmed.startsWith('OK LED OFF')) {
                            ledVisual.className = 'led-circle';
                        } else if (trimmed.startsWith('OK LED BLINK')) {
                            ledVisual.className = 'led-circle blink';
                        }
                    }
                }
            }
        }
    } catch (err) {
        if (err.name !== 'CancelError') {
            addLog('Ошибка чтения: ' + err.message, 'error');
        }
    } finally {
        if (connected) {
            updateStatus(false);
            addLog('Соединение потеряно', 'error');
        }
    }
}

async function sendCommand(cmd) {
    if (!connected || !writer) {
        addLog('Не подключено', 'error');
        return;
    }
    try {
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(cmd + '\n'));
        addLog('Отправлено: ' + cmd, 'info');
    } catch (err) {
        addLog('Ошибка отправки: ' + err.message, 'error');
    }
}

// Обработчики
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);

ledOnBtn.addEventListener('click', () => sendCommand('LED_ON'));
ledOffBtn.addEventListener('click', () => sendCommand('LED_OFF'));
ledBlinkBtn.addEventListener('click', () => sendCommand('LED_BLINK'));

clearLogBtn.addEventListener('click', () => {
    logDiv.innerHTML = '';
});

// Инициализация
updateStatus(false);
addLog('Готов к подключению. Нажмите "Подключиться" и выберите COM-порт.', 'info');