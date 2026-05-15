// ============================================================================
// Web Bluetooth API - Управление ESP32-STM32 Bridge
// ============================================================================

// UUID для BLE сервиса и характеристик (должны совпадать с кодом ESP32)
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COMMAND_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const STATUS_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

// DOM элементы
let device = null;
let commandCharacteristic = null;
let statusCharacteristic = null;

// Состояние подключения
let isConnected = false;

// Текущие статусы (для отображения)
let currentStatus = {
    espLed: false,
    stmLed: false,
    espButton: false,
    stmButton: false
};

// Элементы управления
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const controlPanel = document.getElementById('controlPanel');
const connectionText = document.getElementById('connectionText');
const connectionStatusDot = document.getElementById('connectionStatus');
const bleStatus = document.getElementById('bleStatus');

// Кнопки управления
const espLedOnBtn = document.getElementById('espLedOnBtn');
const espLedOffBtn = document.getElementById('espLedOffBtn');
const stmLedOnBtn = document.getElementById('stmLedOnBtn');
const stmLedOffBtn = document.getElementById('stmLedOffBtn');

// Элементы статусов
const espLedStatus = document.getElementById('espLedStatus');
const stmLedStatus = document.getElementById('stmLedStatus');
const espButtonStatus = document.getElementById('espButtonStatus');
const stmButtonStatus = document.getElementById('stmButtonStatus');

// ============================================================================
// Обновление UI статусов
// ============================================================================
function updateUI() {
    // ESP32 LED
    if (currentStatus.espLed) {
        espLedStatus.textContent = 'ВКЛ';
        espLedStatus.className = 'status-badge status-on';
    } else {
        espLedStatus.textContent = 'ВЫКЛ';
        espLedStatus.className = 'status-badge status-off';
    }
    
    // STM32 LED
    if (currentStatus.stmLed) {
        stmLedStatus.textContent = 'ВКЛ';
        stmLedStatus.className = 'status-badge status-on';
    } else {
        stmLedStatus.textContent = 'ВЫКЛ';
        stmLedStatus.className = 'status-badge status-off';
    }
    
    // ESP32 Button
    if (currentStatus.espButton) {
        espButtonStatus.textContent = 'НАЖАТА';
        espButtonStatus.className = 'status-badge status-on';
    } else {
        espButtonStatus.textContent = 'ОТПУЩЕНА';
        espButtonStatus.className = 'status-badge status-off';
    }
    
    // STM32 Button
    if (currentStatus.stmButton) {
        stmButtonStatus.textContent = 'НАЖАТА';
        stmButtonStatus.className = 'status-badge status-on';
    } else {
        stmButtonStatus.textContent = 'ОТПУЩЕНА';
        stmButtonStatus.className = 'status-badge status-off';
    }
}

// ============================================================================
// Отправка команды на ESP32
// ============================================================================
async function sendCommand(command) {
    if (!commandCharacteristic) {
        console.error("Characteristic not available");
        return false;
    }
    
    try {
        const encoder = new TextEncoder();
        await commandCharacteristic.writeValue(encoder.encode(command));
        console.log(`Command sent: ${command}`);
        return true;
    } catch (error) {
        console.error("Error sending command:", error);
        return false;
    }
}

// ============================================================================
// Обработка входящих уведомлений (статусов)
// ============================================================================
function handleStatusNotification(event) {
    const decoder = new TextDecoder();
    const value = decoder.decode(event.target.value);
    
    console.log("Status received:", value);
    
    try {
        // Парсим JSON
        const status = JSON.parse(value);
        
        currentStatus.espLed = status.espLed === 1;
        currentStatus.stmLed = status.stmLed === 1;
        currentStatus.espButton = status.espButton === 1;
        currentStatus.stmButton = status.stmButton === 1;
        
        updateUI();
    } catch (e) {
        console.error("Error parsing status:", e);
    }
}

// ============================================================================
// Подключение к BLE устройству
// ============================================================================
async function connect() {
    try {
        // Запрашиваем BLE устройство
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: "ESP32-STM32-Bridge" }],
            optionalServices: [SERVICE_UUID]
        });
        
        // Подключаемся
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        
        // Получаем характеристики
        commandCharacteristic = await service.getCharacteristic(COMMAND_CHAR_UUID);
        statusCharacteristic = await service.getCharacteristic(STATUS_CHAR_UUID);
        
        // Подписываемся на уведомления о статусе
        await statusCharacteristic.startNotifications();
        statusCharacteristic.addEventListener('characteristicvaluechanged', handleStatusNotification);
        
        isConnected = true;
        
        // Обновляем UI
        connectionText.textContent = `Подключено: ${device.name}`;
        connectionStatusDot.classList.add('connected');
        bleStatus.textContent = 'ПОДКЛЮЧЕН';
        bleStatus.className = 'status-badge status-on';
        controlPanel.style.display = 'flex';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        // Запрашиваем текущий статус
        await sendCommand("GET_STATUS");
        
        console.log("Connected successfully!");
        
    } catch (error) {
        console.error("Connection error:", error);
        alert("Ошибка подключения: " + error.message);
    }
}

// ============================================================================
// Отключение от BLE устройства
// ============================================================================
async function disconnect() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
    
    isConnected = false;
    commandCharacteristic = null;
    statusCharacteristic = null;
    device = null;
    
    // Сбрасываем UI
    connectionText.textContent = "Не подключено";
    connectionStatusDot.classList.remove('connected');
    bleStatus.textContent = 'ОТКЛЮЧЕН';
    bleStatus.className = 'status-badge status-off';
    controlPanel.style.display = 'none';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    
    // Сбрасываем статусы
    currentStatus = {
        espLed: false,
        stmLed: false,
        espButton: false,
        stmButton: false
    };
    updateUI();
    
    console.log("Disconnected");
}

// ============================================================================
// Обработчики событий от кнопок
// ============================================================================
function setupEventListeners() {
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    
    espLedOnBtn.addEventListener('click', () => sendCommand("ESP_LED_ON"));
    espLedOffBtn.addEventListener('click', () => sendCommand("ESP_LED_OFF"));
    stmLedOnBtn.addEventListener('click', () => sendCommand("STM_LED_ON"));
    stmLedOffBtn.addEventListener('click', () => sendCommand("STM_LED_OFF"));
}

// ============================================================================
// Инициализация при загрузке страницы
// ============================================================================
function init() {
    setupEventListeners();
    updateUI();
    console.log("Web Bluetooth controller ready");
    console.log("Looking for device: ESP32-STM32-Bridge");
}

// Запускаем при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}