function loadProject(path) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const projectFrame = document.getElementById('projectFrame');
    
    welcomeScreen.style.display = 'none';
    projectFrame.style.display = 'block';
    projectFrame.src = path;
}