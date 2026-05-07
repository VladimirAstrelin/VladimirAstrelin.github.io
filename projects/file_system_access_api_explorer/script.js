/**
 * Webbie Explorer - Файловый менеджер в браузере
 * 
 * Функционал:
 * - Навигация по папкам
 * - Копирование/вставка/удаление/переименование
 * - Запуск файлов (через открытие в новой вкладке)
 * - Работа с корневой системой через File System Access API
 */

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

let currentDirectoryHandle = null;  // Хендл текущей открытой папки
let currentDirectoryPath = '';       // Путь к текущей папке (для отображения)
let currentFiles = [];               // Массив файлов/папок в текущей директории
let selectedIndices = new Set();     // Индексы выбранных элементов
let clipboard = null;                // Буфер обмена для копирования/вырезания
let history = [];                    // История навигации
let historyIndex = -1;               // Текущая позиция в истории

// Кэш для иконок
const fileIcons = {
    'folder': '📁',
    'txt': '📄',
    'md': '📝',
    'js': '⚡',
    'html': '🌐',
    'css': '🎨',
    'json': '{ }',
    'jpg': '🖼',
    'jpeg': '🖼',
    'png': '🖼',
    'gif': '🖼',
    'mp3': '🎵',
    'wav': '🎵',
    'mp4': '🎬',
    'avi': '🎬',
    'exe': '⚙',
    'default': '📄'
};

// DOM элементы
const fileListBody = document.getElementById('fileListBody');
const currentPathSpan = document.getElementById('currentPath');
const selectedCountSpan = document.getElementById('selectedCount');
const totalItemsSpan = document.getElementById('totalItems');
const freeSpaceSpan = document.getElementById('freeSpace');
const propertiesModal = document.getElementById('propertiesModal');

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Показывает уведомление
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 50px;
        right: 20px;
        background: ${isError ? '#f44336' : '#0f0'};
        color: ${isError ? 'white' : 'black'};
        padding: 10px 20px;
        border-radius: 5px;
        font-family: monospace;
        z-index: 1000;
        animation: fadeInOut 2s;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

/**
 * Форматирует размер файла
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Форматирует дату
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU');
}

/**
 * Получает иконку для файла по расширению
 */
function getFileIcon(name, isDirectory) {
    if (isDirectory) return '📁';
    
    const ext = name.split('.').pop().toLowerCase();
    return fileIcons[ext] || fileIcons.default;
}

/**
 * Определяет тип файла для отображения
 */
function getFileType(name, isDirectory) {
    if (isDirectory) return 'Папка';
    
    const ext = name.split('.').pop().toLowerCase();
    const types = {
        'txt': 'Текстовый файл',
        'md': 'Markdown',
        'js': 'JavaScript',
        'html': 'HTML',
        'css': 'CSS',
        'json': 'JSON',
        'jpg': 'Изображение',
        'jpeg': 'Изображение',
        'png': 'Изображение',
        'mp3': 'Аудио',
        'mp4': 'Видео',
        'exe': 'Приложение'
    };
    return types[ext] || 'Файл';
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ
// ============================================================================

/**
 * Загрузка содержимого папки
 */
async function loadDirectory(directoryHandle) {
    if (!directoryHandle) return;
    
    try {
        const files = [];
        // Используем async iterator для обхода содержимого папки
        for await (const entry of directoryHandle.values()) {
            const isDirectory = entry.kind === 'directory';
            let size = 0;
            let modifiedTime = 0;
            
            if (!isDirectory) {
                const file = await entry.getFile();
                size = file.size;
                modifiedTime = file.lastModified;
            } else {
                // Для папок можно попробовать получить время модификации через getFile()
                try {
                    const dirFile = await entry.getFile();
                    modifiedTime = dirFile.lastModified;
                } catch {
                    modifiedTime = Date.now();
                }
            }
            
            files.push({
                name: entry.name,
                handle: entry,
                isDirectory: isDirectory,
                size: size,
                modifiedTime: modifiedTime,
                type: getFileType(entry.name, isDirectory)
            });
        }
        
        // Сортируем: сначала папки, потом файлы, затем по алфавиту
        files.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        
        currentFiles = files;
        renderFileList();
        updateStatusBar();
        
        // Сохраняем путь для отображения
        currentDirectoryPath = directoryHandle.name || 'Корень';
        try {
            // Пытаемся получить полный путь (не всегда доступно)
            if (directoryHandle.getFile) {
                const file = await directoryHandle.getFile();
                currentPathSpan.textContent = file.path || directoryHandle.name;
            } else {
                currentPathSpan.textContent = directoryHandle.name;
            }
        } catch {
            currentPathSpan.textContent = directoryHandle.name || '/';
        }
        
        // Сбрасываем выделение
        selectedIndices.clear();
        updateSelectedCount();
        
    } catch (error) {
        console.error('Ошибка загрузки папки:', error);
        showNotification('Ошибка загрузки папки: ' + error.message, true);
    }
}

/**
 * Отображение списка файлов в таблице
 */
function renderFileList() {
    if (!currentFiles.length) {
        fileListBody.innerHTML = '<tr><td colspan="4" class="loading">Папка пуста</td></tr>';
        totalItemsSpan.textContent = '0';
        return;
    }
    
    let html = '';
    currentFiles.forEach((file, index) => {
        const isSelected = selectedIndices.has(index);
        const icon = getFileIcon(file.name, file.isDirectory);
        const sizeStr = file.isDirectory ? '—' : formatFileSize(file.size);
        const dateStr = formatDate(file.modifiedTime);
        
        html += `
            <tr class="${isSelected ? 'selected' : ''}" data-index="${index}">
                <td class="col-name" data-type="name">
                    <span class="file-icon">${icon}</span> ${file.name}
                </td>
                <td class="col-size">${sizeStr}</td>
                <td class="col-modified">${dateStr}</td>
                <td class="col-type">${file.type}</td>
            </tr>
        `;
    });
    
    fileListBody.innerHTML = html;
    totalItemsSpan.textContent = currentFiles.length;
    
    // Назначаем обработчики событий
    attachRowEvents();
}

/**
 * Прикрепляет обработчики к строкам таблицы
 */
function attachRowEvents() {
    const rows = fileListBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const index = parseInt(row.dataset.index);
        const file = currentFiles[index];
        
        // Одиночный клик для выделения
        row.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                // Ctrl+клик — переключение выделения
                if (selectedIndices.has(index)) {
                    selectedIndices.delete(index);
                } else {
                    selectedIndices.add(index);
                }
            } else if (e.shiftKey && lastSelectedIndex !== undefined) {
                // Shift+клик — выделение диапазона
                // (упрощённая версия)
                const start = Math.min(lastSelectedIndex, index);
                const end = Math.max(lastSelectedIndex, index);
                for (let i = start; i <= end; i++) {
                    selectedIndices.add(i);
                }
            } else {
                // Обычный клик — снимаем всё, выделяем текущий
                selectedIndices.clear();
                selectedIndices.add(index);
            }
            
            lastSelectedIndex = index;
            renderFileList(); // Перерисовываем для обновления выделения
            updateSelectedCount();
        });
        
        // Двойной клик для открытия/запуска
        row.addEventListener('dblclick', () => {
            if (file.isDirectory) {
                openDirectory(file.handle);
            } else {
                openFile(file);
            }
        });
    });
}

/**
 * Открытие папки (навигация)
 */
async function openDirectory(directoryHandle) {
    if (!directoryHandle) return;
    
    // Сохраняем текущую позицию в истории
    if (currentDirectoryHandle) {
        history = history.slice(0, historyIndex + 1);
        history.push(currentDirectoryHandle);
        historyIndex++;
    }
    
    currentDirectoryHandle = directoryHandle;
    await loadDirectory(directoryHandle);
}

/**
 * Открытие файла (запуск в новой вкладке или скачивание)
 */
function openFile(file) {
    // Для разных типов файлов разное поведение
    const ext = file.name.split('.').pop().toLowerCase();
    
    // Текстовые файлы — можно открыть в отдельном окне или редакторе
    const textExts = ['txt', 'md', 'js', 'html', 'css', 'json', 'xml'];
    if (textExts.includes(ext)) {
        openTextFile(file);
        return;
    }
    
    // Изображения — открыть в новой вкладке
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
    if (imageExts.includes(ext)) {
        openImageFile(file);
        return;
    }
    
    // Для остальных — предложить скачать
    downloadFile(file);
}

/**
 * Открытие текстового файла в отдельном окне
 */
async function openTextFile(file) {
    try {
        const content = await file.handle.getFile();
        const text = await content.text();
        
        // Создаём новое окно
        const win = window.open();
        win.document.write(`
            <html>
            <head>
                <title>${file.name}</title>
                <style>
                    body {
                        font-family: monospace;
                        padding: 20px;
                        background: #1e1e2f;
                        color: #eee;
                        white-space: pre-wrap;
                    }
                </style>
            </head>
            <body>${escapeHtml(text)}</body>
            </html>
        `);
    } catch (error) {
        showNotification('Ошибка при открытии файла: ' + error.message, true);
    }
}

/**
 * Открытие изображения в новой вкладке
 */
async function openImageFile(file) {
    try {
        const fileBlob = await file.handle.getFile();
        const url = URL.createObjectURL(fileBlob);
        const win = window.open();
        win.document.write(`
            <html>
            <head><title>${file.name}</title></head>
            <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh">
                <img src="${url}" style="max-width:100%;max-height:100%">
            </body>
            </html>
        `);
    } catch (error) {
        showNotification('Ошибка при открытии изображения: ' + error.message, true);
    }
}

/**
 * Скачивание файла
 */
async function downloadFile(file) {
    try {
        const fileObj = await file.handle.getFile();
        const url = URL.createObjectURL(fileObj);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        showNotification(`Скачивание: ${file.name}`);
    } catch (error) {
        showNotification('Ошибка при скачивании: ' + error.message, true);
    }
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// ОПЕРАЦИИ С ФАЙЛАМИ
// ============================================================================

/**
 * Создание новой папки
 */
async function createNewFolder() {
    if (!currentDirectoryHandle) {
        showNotification('Сначала выберите корневую папку', true);
        return;
    }
    
    const folderName = prompt('Введите имя новой папки:', 'Новая папка');
    if (!folderName) return;
    
    try {
        await currentDirectoryHandle.getDirectoryHandle(folderName, { create: true });
        await loadDirectory(currentDirectoryHandle);
        showNotification(`Папка "${folderName}" создана`);
    } catch (error) {
        showNotification('Ошибка создания папки: ' + error.message, true);
    }
}

/**
 * Создание нового файла
 */
async function createNewFile() {
    if (!currentDirectoryHandle) {
        showNotification('Сначала выберите корневую папку', true);
        return;
    }
    
    const fileName = prompt('Введите имя нового файла:', 'новый_файл.txt');
    if (!fileName) return;
    
    try {
        const fileHandle = await currentDirectoryHandle.getFileHandle(fileName, { create: true });
        await loadDirectory(currentDirectoryHandle);
        showNotification(`Файл "${fileName}" создан`);
    } catch (error) {
        showNotification('Ошибка создания файла: ' + error.message, true);
    }
}

/**
 * Копирование выбранных файлов в буфер обмена
 */
function copySelected(isCut = false) {
    const selected = getSelectedFiles();
    if (selected.length === 0) {
        showNotification('Ничего не выбрано', true);
        return;
    }
    
    clipboard = {
        files: selected,
        isCut: isCut,
        sourceDirectory: currentDirectoryHandle
    };
    
    showNotification(`${selected.length} элемент(ов) скопировано${isCut ? ' (вырезано)' : ''}`);
}

/**
 * Вставка из буфера обмена
 */
async function pasteFromClipboard() {
    if (!clipboard || !clipboard.files.length) {
        showNotification('Буфер обмена пуст', true);
        return;
    }
    
    if (!currentDirectoryHandle) {
        showNotification('Сначала выберите корневую папку', true);
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of clipboard.files) {
        try {
            if (clipboard.isCut) {
                // Перемещение
                await item.handle.move(currentDirectoryHandle, item.name);
            } else {
                // Копирование
                if (item.isDirectory) {
                    await copyDirectory(item.handle, currentDirectoryHandle, item.name);
                } else {
                    await copyFile(item.handle, currentDirectoryHandle, item.name);
                }
            }
            successCount++;
        } catch (error) {
            errorCount++;
            console.error(`Ошибка при работе с ${item.name}:`, error);
        }
    }
    
    await loadDirectory(currentDirectoryHandle);
    showNotification(`Готово: скопировано ${successCount}, ошибок: ${errorCount}`);
    
    if (clipboard.isCut && clipboard.sourceDirectory === currentDirectoryHandle) {
        // После перемещения очищаем буфер, чтобы не было дублей
        clipboard = null;
    }
}

/**
 * Копирование файла
 */
async function copyFile(sourceHandle, targetDirectory, newName) {
    const sourceFile = await sourceHandle.getFile();
    const targetHandle = await targetDirectory.getFileHandle(newName, { create: true });
    const writable = await targetHandle.createWritable();
    await writable.write(await sourceFile.arrayBuffer());
    await writable.close();
}

/**
 * Рекурсивное копирование папки
 */
async function copyDirectory(sourceDir, targetDirectory, newName) {
    const newDir = await targetDirectory.getDirectoryHandle(newName, { create: true });
    
    for await (const entry of sourceDir.values()) {
        if (entry.kind === 'file') {
            await copyFile(entry, newDir, entry.name);
        } else {
            await copyDirectory(entry, newDir, entry.name);
        }
    }
}

/**
 * Удаление выбранных файлов
 */
async function deleteSelected() {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    
    const confirmed = confirm(`Удалить ${selected.length} элемент(ов)?`);
    if (!confirmed) return;
    
    let successCount = 0;
    for (const item of selected) {
        try {
            await currentDirectoryHandle.removeEntry(item.name, { recursive: item.isDirectory });
            successCount++;
        } catch (error) {
            console.error(`Ошибка удаления ${item.name}:`, error);
        }
    }
    
    await loadDirectory(currentDirectoryHandle);
    showNotification(`Удалено ${successCount} элементов`);
}

/**
 * Переименование выбранного файла
 */
async function renameSelected() {
    const selected = getSelectedFiles();
    if (selected.length !== 1) {
        showNotification('Выберите один элемент для переименования', true);
        return;
    }
    
    const item = selected[0];
    const newName = prompt('Введите новое имя:', item.name);
    if (!newName || newName === item.name) return;
    
    try {
        if (item.isDirectory) {
            await currentDirectoryHandle.move(item.handle, newName);
        } else {
            await currentDirectoryHandle.move(item.handle, newName);
        }
        await loadDirectory(currentDirectoryHandle);
        showNotification(`Переименовано в "${newName}"`);
    } catch (error) {
        showNotification('Ошибка переименования: ' + error.message, true);
    }
}

/**
 * Показ свойств файла/папки
 */
async function showProperties() {
    const selected = getSelectedFiles();
    if (selected.length !== 1) {
        showNotification('Выберите один элемент для просмотра свойств', true);
        return;
    }
    
    const item = selected[0];
    const content = document.getElementById('propertiesContent');
    
    let propertiesHtml = `
        <div class="property-row">
            <span class="property-label">Имя:</span>
            <span class="property-value">${item.name}</span>
        </div>
        <div class="property-row">
            <span class="property-label">Тип:</span>
            <span class="property-value">${item.isDirectory ? 'Папка' : item.type}</span>
        </div>
    `;
    
    if (!item.isDirectory) {
        propertiesHtml += `
            <div class="property-row">
                <span class="property-label">Размер:</span>
                <span class="property-value">${formatFileSize(item.size)}</span>
            </div>
        `;
    }
    
    propertiesHtml += `
        <div class="property-row">
            <span class="property-label">Дата изменения:</span>
            <span class="property-value">${formatDate(item.modifiedTime)}</span>
        </div>
    `;
    
    content.innerHTML = propertiesHtml;
    propertiesModal.style.display = 'flex';
}

// ============================================================================
// УПРАВЛЕНИЕ СОСТОЯНИЕМ
// ============================================================================

/**
 * Получение выбранных файлов
 */
function getSelectedFiles() {
    const selected = [];
    for (const index of selectedIndices) {
        if (currentFiles[index]) {
            selected.push(currentFiles[index]);
        }
    }
    return selected;
}

/**
 * Обновление счётчика выбранных элементов
 */
function updateSelectedCount() {
    const count = selectedIndices.size;
    selectedCountSpan.textContent = count;
}

/**
 * Обновление статусной строки
 */
function updateStatusBar() {
    // Для свободного места потребуется дополнительный API
    freeSpaceSpan.textContent = '';
}

/**
 * Выбор корневой папки
 */
async function selectRootDirectory() {
    if (!window.showDirectoryPicker) {
        showNotification('Ваш браузер не поддерживает File System Access API', true);
        return;
    }
    
    try {
        const dirHandle = await window.showDirectoryPicker();
        currentDirectoryHandle = dirHandle;
        await loadDirectory(dirHandle);
        
        // Сохраняем в историю
        history = [dirHandle];
        historyIndex = 0;
        
        showNotification(`Выбрана корневая папка: ${dirHandle.name}`);
    } catch (error) {
        if (error.name !== 'AbortError') {
            showNotification('Ошибка выбора папки: ' + error.message, true);
        }
    }
}

/**
 * Переход на уровень вверх
 */
async function goUpDirectory() {
    // В File System Access API нет прямого способа получить родительскую папку
    // Поэтому используем историю или предлагаем выбрать заново
    if (historyIndex > 0) {
        historyIndex--;
        currentDirectoryHandle = history[historyIndex];
        await loadDirectory(currentDirectoryHandle);
    } else {
        showNotification('Вы уже в корневой папке выбора', true);
    }
}

/**
 * Обновление текущей директории
 */
async function refreshDirectory() {
    if (currentDirectoryHandle) {
        await loadDirectory(currentDirectoryHandle);
        showNotification('Обновлено');
    }
}

/**
 * Инициализация приложения
 */
function init() {
    // Проверка поддержки API
    if (!window.showDirectoryPicker) {
        showNotification('⚠️ Ваш браузер не поддерживает File System Access API', true);
        document.querySelectorAll('button').forEach(btn => {
            if (!btn.id || !['propertiesModal', 'close'].includes(btn.id)) {
                btn.disabled = true;
            }
        });
        fileListBody.innerHTML = '<tr><td colspan="4" class="loading">Ваш браузер не поддерживает File System Access API</td></tr>';
        return;
    }
    
    // Назначение обработчиков
    document.getElementById('selectRootBtn').addEventListener('click', selectRootDirectory);
    document.getElementById('newFolderBtn').addEventListener('click', createNewFolder);
    document.getElementById('newFileBtn').addEventListener('click', createNewFile);
    document.getElementById('copyBtn').addEventListener('click', () => copySelected(false));
    document.getElementById('pasteBtn').addEventListener('click', pasteFromClipboard);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
    document.getElementById('renameBtn').addEventListener('click', renameSelected);
    document.getElementById('refreshBtn').addEventListener('click', refreshDirectory);
    document.getElementById('upBtn').addEventListener('click', goUpDirectory);
    document.getElementById('propertiesBtn').addEventListener('click', showProperties);
    
    // Навигация
    document.getElementById('backBtn').addEventListener('click', () => {
        if (historyIndex > 0) goUpDirectory();
    });
    
    // Закрытие модального окна
    document.querySelector('.close').addEventListener('click', () => {
        propertiesModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === propertiesModal) propertiesModal.style.display = 'none';
    });
    
    showNotification('Нажмите "Выбрать корень" и выберите папку для начала работы');
}

// Запускаем
window.addEventListener('DOMContentLoaded', init);