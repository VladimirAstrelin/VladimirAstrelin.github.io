function loadProject(path) {
    document.getElementById('projectFrame').src = path;
    
    // Закрываем меню на мобильных после выбора проекта
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('menuToggle').classList.remove('active');
    }
}

// Обработка гамбургер-меню
document.getElementById('menuToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    document.getElementById('sidebar').classList.toggle('active');
});