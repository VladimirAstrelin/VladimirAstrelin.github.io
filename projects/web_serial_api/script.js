let port = null;
let reader = null;
let writer = null;
let isConnected = false;
let isReading = false;
let currentFrequency = 5;

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const clearBtn = document.getElementById('clearBtn');
const logDiv = document.getElementById('log');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const displayInput = document.getElementById('displayInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const ledVisual = document.getElementById('ledVisual');
const frequencySlider = document.getElementById('frequencySlider');
const frequencyValue = document.getElementById('frequencyValue');

displayInput.addEventListener('input', () => {
    charCount.textContent = displayInput.value.length;
});

frequencySlider.addEventListener('input', function() {
    const value = this.value;
    frequencyValue.textContent = value;
    currentFrequency = value;
    if (isConnected && document.getElementById('ledBlink').checked) {
        sendFrequency(value);
    }
});

function sendFrequency(freq) {
    if (!isConnected) return;
    const command = `LED:FREQ:${freq}`;
    sendCommand(command).then(success => {
        if (success) {
            addLog(`📊 Частота мигания: ${freq}`, 'system');
            updateLedVisualAnimation(freq);
        }
    });
}

function updateLedVisualAnimation(freq) {
    const animationSpeed = (11 - freq) / 5;
    ledVisual.style.animationDuration = `${animationSpeed}s`;
}

function addLog(text, type = 'system') {
    const time = new Date().toLocaleTimeString();
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `<span class="time">[${time}]</span> ${text}`;
    logDiv.appendChild(message);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function updateStatus(connected) {
    isConnected = connected;
    if (connected) {
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Подключено';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        displayInput.disabled = false;
        sendBtn.disabled = false;
        document.querySelectorAll('input[name="ledMode"]').forEach(el => el.disabled = false);
        frequencySlider.disabled = true;
    } else {
        statusIndicator.className = 'status-indicator disconnected';
        statusText.textContent = 'Не подключено';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        displayInput.disabled = true;
        sendBtn.disabled = true;
        document.querySelectorAll('input[name="ledMode"]').forEach(el => el.disabled = true);
        frequencySlider.disabled = true;
        updateLedVisual('off');
    }
}

function updateLedVisual(mode) {
    ledVisual.className = 'led-visual';
    switch(mode) {
        case 'off':
            ledVisual.innerHTML = '<i class="fas fa-power-off"></i>';
            ledVisual.style.animationDuration = '';
            frequencySlider.disabled = true;
            break;
        case 'on':
            ledVisual.classList.add('on');
            ledVisual.innerHTML = '<i class="fas fa-lightbulb"></i>';
            ledVisual.style.animationDuration = '';
            frequencySlider.disabled = true;
            break;
        case 'blink':
            ledVisual.classList.add('on', 'pulse');
            ledVisual.innerHTML = '<i class="fas fa-bolt"></i>';
            frequencySlider.disabled = false;
            updateLedVisualAnimation(currentFrequency);
            break;
        case 'breath':
            ledVisual.classList.add('on', 'breathing');
            ledVisual.innerHTML = '<i class="fas fa-wind"></i>';
            ledVisual.style.animationDuration = '';
            frequencySlider.disabled = true;
            break;
    }
}

document.querySelectorAll('input[name="ledMode"]').forEach(radio => {
    radio.addEventListener('change', async function() {
        if (!isConnected) return;
        const mode = this.value;
        let command = '';
        switch(mode) {
            case 'on':    command = 'LED:ON';   break;
            case 'off':   command = 'LED:OFF';  break;
            case 'blink': command = 'LED:BLINK'; break;
            case 'breath': command = 'LED:FADE'; break;
        }
        if (await sendCommand(command)) {
            updateLedVisual(mode);
            if (mode === 'blink') {
                setTimeout(() => sendFrequency(currentFrequency), 100);
            }
        }
    });
});

async function sendCommand(command) {
    if (!writer) {
        addLog('❌ Нет подключения к Arduino', 'error');
        return false;
    }
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(`${command}\n`);
        await writer.write(data);
        console.log(`Команда отправлена: ${command}`);
        return true;
    } catch (error) {
        console.error('Ошибка отправки команды:', error);
        addLog(`❌ Ошибка отправки: ${error.message}`, 'error');
        return false;
    }
}

async function hardResetConnection() {
    console.log('Сбрасываем соединение...');
    isReading = false;

    if (reader) {
        try { await reader.cancel(); } catch (e) { console.log('Ошибка отмены reader:', e.message); }
        try { reader.releaseLock(); } catch (e) { console.log('Ошибка освобождения reader:', e.message); }
        reader = null;
    }

    if (writer) {
        try { writer.releaseLock(); } catch (e) { console.log('Ошибка освобождения writer:', e.message); }
        writer = null;
    }

    if (port) {
        try {
            if (port.readable) {
                try { await port.readable.cancel(); } catch (e) { console.log('Ошибка отмены readable:', e.message); }
            }
            if (port.writable) {
                try { await port.writable.close(); } catch (e) { console.log('Ошибка закрытия writable:', e.message); }
            }
            await port.close();
            console.log('Порт успешно закрыт');
        } catch (e) {
            console.log('Ошибка закрытия порта:', e.message);
        } finally {
            port = null;
        }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    isConnected = false;
    isReading = false;
    console.log('Сброс соединения завершен');
    return true;
}

async function sendToDisplay(text) {
    if (!writer) {
        addLog('❌ Нет подключения к Arduino', 'error');
        return;
    }
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(`DISPLAY:${text}\n`);
        await writer.write(data);
        addLog(`📤 Отправлено на дисплей: <strong>${text}</strong>`, 'sent');
        displayInput.value = '';
        charCount.textContent = '0';
    } catch (error) {
        console.error('Ошибка отправки:', error);
        addLog(`❌ Ошибка отправки: ${error.message}`, 'error');
    }
}

sendBtn.addEventListener('click', () => {
    const text = displayInput.value.trim();
    if (text) {
        sendToDisplay(text);
    } else {
        addLog('⚠️ Введите текст для отправки', 'warning');
    }
});

displayInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) {
        sendBtn.click();
    }
});

connectBtn.addEventListener('click', async () => {
    try {
        await hardResetConnection();
        addLog('🔄 Устанавливаем соединение...', 'warning');

        if (!('serial' in navigator)) {
            addLog('❌ Ваш браузер не поддерживает Web Serial API', 'error');
            addLog('💡 Используйте Chrome/Edge версии 89+ или Opera 76+', 'warning');
            return;
        }

        port = await navigator.serial.requestPort();
        await port.open({ 
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            flowControl: "none"
        });

        writer = port.writable.getWriter();

        isReading = true;
        updateStatus(true);
        addLog('✅ Подключение установлено!', 'success');
        readData();

    } catch (error) {
        console.error('Ошибка подключения:', error);
        if (error.name === 'NotFoundError') {
            addLog('❌ Порт не выбран', 'error');
        } else if (error.name === 'SecurityError') {
            addLog('❌ Web Serial API требует HTTPS или localhost', 'error');
            addLog('💡 Откройте страницу через http://localhost/', 'warning');
        } else if (error.name === 'InvalidStateError') {
            addLog('❌ Порт уже открыт', 'error');
        } else {
            addLog(`❌ Ошибка подключения: ${error.message}`, 'error');
        }
        await hardResetConnection();
        updateStatus(false);
    }
});

disconnectBtn.addEventListener('click', async () => {
    const originalHTML = disconnectBtn.innerHTML;
    disconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отключаем...';
    disconnectBtn.disabled = true;

    try {
        await hardResetConnection();
        updateStatus(false);
        addLog('✅ Соединение разорвано', 'success');
    } catch (error) {
        console.error('Ошибка при отключении:', error);
        addLog('⚠️ Соединение было прервано', 'warning');
        updateStatus(false);
    } finally {
        disconnectBtn.innerHTML = originalHTML;
        disconnectBtn.disabled = true;
    }
});

clearBtn.addEventListener('click', () => {
    logDiv.innerHTML = '';
    addLog('🗑️ Лог очищен', 'system');
});

async function readData() {
    try {
        reader = port.readable.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isReading) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    console.log('Поток чтения завершен');
                    break;
                }
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        console.log('Получено:', trimmed);

                        if (trimmed === 'BTN1_PRESSED') {
                            addLog('🎮 Кнопка D2 нажата', 'btn1');
                        } else if (trimmed === 'BTN2_PRESSED') {
                            addLog('🎮 Кнопка D3 нажата', 'btn2');
                        } else if (trimmed === 'BTN3_PRESSED') {
                            addLog('🎮 Кнопка D4 нажата', 'btn3');
                        } else if (trimmed === 'ARDUINO_READY') {
                            addLog('🚀 ESP32 готов к работе!', 'success');
                        } else if (trimmed === 'DISPLAY_OK') {
                            addLog('✅ Текст отображён на дисплее', 'success');
                        } else if (trimmed === 'LED_ON_OK') {
                            addLog('💡 LED включён', 'success');
                        } else if (trimmed === 'LED_OFF_OK') {
                            addLog('💡 LED выключен', 'success');
                        } else if (trimmed === 'LED_BLINK_OK') {
                            addLog('⚡ LED: режим мигания', 'success');
                        } else if (trimmed === 'LED_FADE_OK') {
                            addLog('🌬️ LED: режим дыхания', 'success');
                        } else if (trimmed === 'LED_FREQ_OK') {
                            addLog('📊 Частота мигания обновлена', 'success');
                        } else {
                            addLog(`📨 Arduino: ${trimmed}`, 'system');
                        }
                    }
                }
            } catch (error) {
                if (isReading) {
                    console.error('Ошибка чтения:', error);
                    addLog(`❌ Ошибка чтения: ${error.message}`, 'error');
                }
                break;
            }
        }
    } catch (error) {
        if (isReading) {
            console.error('Ошибка потока:', error);
            addLog(`❌ Ошибка потока: ${error.message}`, 'error');
        }
    } finally {
        if (isConnected) {
            updateStatus(false);
            addLog('⚠️ Соединение потеряно', 'warning');
        }
    }
}