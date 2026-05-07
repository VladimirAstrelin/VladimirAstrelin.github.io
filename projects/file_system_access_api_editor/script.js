/**
 * Webbie Editor - Демонстрация File System Access API
 * 
 * Автор: Ваш проект
 * Лицензия: MIT
 * 
 * Возможности:
 * - Открытие текстовых файлов (.txt, .md, .js, .html, .css, .json, .xml, .csv)
 * - Сохранение изменений обратно в файл
 * - Сохранение под новым именем
 * - Создание новых файлов
 * - Регулировка размера шрифта
 * - Тёмная тема
 */

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

let currentFileHandle = null;      // Хендл текущего открытого файла
let currentFileName = null;         // Имя текущего файла
let isModified = false;             // Флаг: были ли изменения после последнего сохранения
let fontSize = 14;                  // Текущий размер шрифта

// Ссылки на DOM элементы
const editor = document.getElementById('editor');
const fileNameSpan = document.getElementById('fileName');
const fileSizeSpan = document.getElementById('fileSize');
const fileInfoSpan = document.getElementById('fileInfo');

// Настройки типов файлов, которые мы можем открывать
const allowedFileTypes = {
    description: 'Текстовые файлы',
    accept: {
        'text/plain': ['.txt', '.md', '.text'],
        'text/javascript': ['.js', '.mjs'],
        'text/html': ['.html', '.htm'],
        'text/css': ['.css'],
        'application/json': ['.json'],
        'text/xml': ['.xml', '.svg'],
        'text/csv': ['.csv']
    }
};

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Обновляет статусную строку с информацией о файле
 */
function updateStatusBar() {
    if (currentFileName) {
        fileNameSpan.textContent = currentFileName;
        
        // Считаем количество символов и строк
        const content = editor.value;
        const charCount = content.length;
        const lineCount = content.split('\n').length;
        const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
        
        fileInfoSpan.textContent = `${lineCount} строк, ${wordCount} слов, ${charCount} символов`;
        
        // Если есть хендл файла, показываем размер файла (асинхронно)
        if (currentFileHandle) {
            currentFileHandle.getFile().then(file => {
                const sizeKB = (file.size / 1024).toFixed(2);
                fileSizeSpan.textContent = `${sizeKB} KB`;
            }).catch(() => {
                fileSizeSpan.textContent = '';
            });
        } else {
            fileSizeSpan.textContent = '';
        }
    } else {
        fileNameSpan.textContent = isModified ? 'Новый документ (изменён)' : 'Новый документ';
        fileSizeSpan.textContent = '';
        fileInfoSpan.textContent = `${editor.value.split('\n').length} строк`;
    }
    
    // Меняем заголовок окна браузера
    const modifiedMark = isModified ? '● ' : '';
    if (currentFileName) {
        document.title = `${modifiedMark}${currentFileName} - Webbie Editor`;
    } else {
        document.title = `${modifiedMark}Новый документ - Webbie Editor`;
    }
}

/**
 * Показывает временное уведомление
 */
function showNotification(message, isError = false) {
    // Создаём элемент уведомления
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 60px;
        right: 20px;
        background: ${isError ? '#f44336' : '#4CAF50'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    // Добавляем анимацию через CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

/**
 * Устанавливает размер шрифта в редакторе
 */
function setFontSize(size) {
    fontSize = Math.min(24, Math.max(10, size));
    editor.style.fontSize = fontSize + 'px';
    showNotification(`Размер шрифта: ${fontSize}px`);
}

/**
 * Чтение файла и загрузка его содержимого в редактор
 */
async function loadFileIntoEditor(fileHandle) {
    try {
        const file = await fileHandle.getFile();
        const contents = await file.text();
        
        editor.value = contents;
        currentFileHandle = fileHandle;
        currentFileName = file.name;
        isModified = false;
        
        updateStatusBar();
        showNotification(`Открыт файл: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
        
        // Устанавливаем фокус в редактор
        editor.focus();
        
        return true;
    } catch (error) {
        console.error('Ошибка при чтении файла:', error);
        showNotification('Ошибка при чтении файла: ' + error.message, true);
        return false;
    }
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ
// ============================================================================

/**
 * Создание нового файла
 */
function newFile() {
    // Проверяем, не потеряем ли мы изменения
    if (isModified && editor.value.trim()) {
        const confirmed = confirm('У вас есть несохранённые изменения. Создать новый файл без сохранения?');
        if (!confirmed) return;
    }
    
    // Сбрасываем состояние
    editor.value = '';
    currentFileHandle = null;
    currentFileName = null;
    isModified = false;
    
    updateStatusBar();
    showNotification('Создан новый документ');
    editor.focus();
}

/**
 * Открытие файла через диалог выбора
 */
async function openFile() {
    // Проверка поддержки API
    if (!window.showOpenFilePicker) {
        alert('Ваш браузер не поддерживает File System Access API.\nПожалуйста, используйте Chrome, Edge или Opera.');
        return;
    }
    
    // Проверяем, не потеряем ли мы изменения
    if (isModified && editor.value.trim()) {
        const confirmed = confirm('У вас есть несохранённые изменения. Открыть другой файл без сохранения?');
        if (!confirmed) return;
    }
    
    try {
        // Показываем диалог выбора файла
        const [fileHandle] = await window.showOpenFilePicker({
            types: [allowedFileTypes],
            multiple: false
        });
        
        await loadFileIntoEditor(fileHandle);
        
    } catch (error) {
        // Пользователь отменил выбор
        if (error.name !== 'AbortError') {
            console.error('Ошибка при открытии файла:', error);
            showNotification('Ошибка при открытии файла: ' + error.message, true);
        }
    }
}

/**
 * Сохранение файла (если есть хендл — перезаписываем, иначе вызываем saveAs)
 */
async function saveFile() {
    if (!currentFileHandle) {
        // Если нет открытого файла — сохраняем как новый
        await saveAsFile();
        return;
    }
    
    try {
        // Создаём поток для записи
        const writable = await currentFileHandle.createWritable();
        
        // Записываем содержимое редактора
        await writable.write(editor.value);
        
        // Закрываем поток
        await writable.close();
        
        isModified = false;
        updateStatusBar();
        showNotification(`Сохранён: ${currentFileName}`);
        
    } catch (error) {
        console.error('Ошибка при сохранении:', error);
        showNotification('Ошибка при сохранении файла: ' + error.message, true);
    }
}

/**
 * Сохранение файла под новым именем (Save As)
 */
async function saveAsFile() {
    if (!window.showSaveFilePicker) {
        alert('Ваш браузер не поддерживает File System Access API.\nПожалуйста, используйте Chrome, Edge или Opera.');
        return;
    }
    
    try {
        // Предлагаем имя по умолчанию
        const suggestedName = currentFileName || 'Новый_документ.txt';
        
        // Показываем диалог сохранения
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [allowedFileTypes]
        });
        
        // Сохраняем
        const writable = await fileHandle.createWritable();
        await writable.write(editor.value);
        await writable.close();
        
        // Обновляем текущий хендл
        currentFileHandle = fileHandle;
        currentFileName = fileHandle.name;
        isModified = false;
        
        updateStatusBar();
        showNotification(`Сохранён как: ${currentFileName}`);
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Ошибка при сохранении:', error);
            showNotification('Ошибка при сохранении: ' + error.message, true);
        }
    }
}

/**
 * Загрузка последнего открытого файла (если сохранили хендл)
 * Демонстрация сохранения состояния в localStorage
 */
async function loadLastFile() {
    const lastFileHandleId = localStorage.getItem('lastFileHandleId');
    if (!lastFileHandleId) return;
    
    // В реальном приложении нужно было бы сохранять весь хендл в indexedDB,
    // но для простоты примера пропустим. Полное восстановление требует
    // storeFileHandle/lookupFileHandle в indexedDB (можно показать при желании)
    console.log('Для восстановления последнего файла нужен IndexedDB');
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

/**
 * Отслеживаем изменения в редакторе
 */
function onEditorChange() {
    if (!isModified) {
        isModified = true;
        updateStatusBar();
    }
}

/**
 * Обработка клавиатурных сокращений
 */
function onKeyDown(event) {
    // Ctrl+S (или Cmd+S на Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveFile();
    }
    // Ctrl+O
    else if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
        event.preventDefault();
        openFile();
    }
    // Ctrl+N
    else if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        newFile();
    }
    // Ctrl+Shift+S (Save As)
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        saveAsFile();
    }
    // Ctrl++ (увеличение шрифта)
    else if ((event.ctrlKey || event.metaKey) && event.key === '=') {
        event.preventDefault();
        setFontSize(fontSize + 1);
    }
    // Ctrl+- (уменьшение шрифта)
    else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        setFontSize(fontSize - 1);
    }
    // Ctrl+0 (сброс шрифта)
    else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        setFontSize(14);
    }
}

/**
 * Увеличение шрифта
 */
function increaseFont() {
    setFontSize(fontSize + 1);
}

/**
 * Уменьшение шрифта
 */
function decreaseFont() {
    setFontSize(fontSize - 1);
}

/**
 * Переключение тёмной/светлой темы
 */
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('toggleDarkModeBtn');
    btn.textContent = isDark ? '☀️' : '🌙';
    showNotification(isDark ? 'Тёмная тема включена' : 'Светлая тема включена');
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

function init() {
    // Проверяем поддержку API
    if (!window.showOpenFilePicker) {
        showNotification('⚠️ Ваш браузер не поддерживает File System Access API. Функции открытия/сохранения будут недоступны.', true);
        document.querySelectorAll('#openBtn, #saveBtn, #saveAsBtn').forEach(btn => {
            btn.disabled = true;
            btn.title = 'Не поддерживается в вашем браузере';
        });
    }
    
    // Назначаем обработчики кнопок
    document.getElementById('newBtn').addEventListener('click', newFile);
    document.getElementById('openBtn').addEventListener('click', openFile);
    document.getElementById('saveBtn').addEventListener('click', saveFile);
    document.getElementById('saveAsBtn').addEventListener('click', saveAsFile);
    document.getElementById('increaseFontBtn').addEventListener('click', increaseFont);
    document.getElementById('decreaseFontBtn').addEventListener('click', decreaseFont);
    document.getElementById('toggleDarkModeBtn').addEventListener('click', toggleDarkMode);
    
    // Назначаем обработчики редактора
    editor.addEventListener('input', onEditorChange);
    editor.addEventListener('keydown', onKeyDown);
    
    // Устанавливаем начальный размер шрифта
    setFontSize(14);
    
    // Приветственное сообщение
    showNotification('Добро пожаловать в Webbie Editor! Открывайте и сохраняйте файлы прямо в браузере.');
    updateStatusBar();
}

// Запускаем приложение после загрузки страницы
window.addEventListener('DOMContentLoaded', init);