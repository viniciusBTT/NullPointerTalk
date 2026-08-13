const STORAGE_KEY = 'npt.username';

const nameGate = document.getElementById('name-gate');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const usernameDisplay = document.getElementById('username-display');
const changeNameBtn = document.getElementById('change-name-btn');

function showGate() {
    nameGate.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
}

function hideGate(name) {
    nameGate.classList.add('hidden');
    usernameDisplay.textContent = name;
}

const storedName = localStorage.getItem(STORAGE_KEY);
if (storedName) {
    hideGate(storedName);
} else {
    showGate();
}

nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
        return;
    }
    localStorage.setItem(STORAGE_KEY, name);
    hideGate(name);
});

changeNameBtn.addEventListener('click', () => {
    showGate();
});
