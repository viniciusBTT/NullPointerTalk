/**
 * CRUD de salas: aberto pra qualquer visitante, sem senha - igual ao resto do app (sem
 * login em lugar nenhum). Um modal só serve tanto criar quanto editar; apagar usa
 * window.confirm() simples, de proposito (MVP pragmatico, da pra evoluir depois).
 *
 * Não atualiza a sidebar diretamente: quem faz isso é o listener de 'roomcatalog' em
 * app.js, alimentado por /topic/room-catalog - a própria ação do usuário volta por ali
 * também, então o caminho é único nas duas situações (eu mudei / alguém mais mudou).
 */

export function initRoomAdmin({
    listEl,
    addButtonEl,
    modalEl,
    formEl,
    titleEl,
    idInputEl,
    nameInputEl,
    iconInputEl,
    iconTriggerEl,
    errorEl,
    submitBtnEl,
    closeButtons,
    roomsById,
    openIconPicker,
    onError,
}) {
    let editingRoomId = null;

    function openCreate() {
        editingRoomId = null;
        titleEl.textContent = 'Nova sala';
        submitBtnEl.textContent = 'Criar';
        idInputEl.value = '';
        idInputEl.disabled = false;
        nameInputEl.value = '';
        iconInputEl.value = '';
        hideError();
        show();
    }

    function openEdit(roomId) {
        const room = roomsById.get(roomId);
        if (!room) {
            return;
        }
        editingRoomId = roomId;
        titleEl.textContent = `Editar "${room.name}"`;
        submitBtnEl.textContent = 'Salvar';
        idInputEl.value = room.id;
        idInputEl.disabled = true; // o id vira nome da sala no LiveKit e tópico STOMP - não muda depois de criado
        nameInputEl.value = room.name;
        iconInputEl.value = room.icon;
        hideError();
        show();
    }

    function show() {
        modalEl.classList.remove('hidden');
        nameInputEl.focus();
    }

    function hide() {
        modalEl.classList.add('hidden');
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideError() {
        errorEl.classList.add('hidden');
    }

    addButtonEl.addEventListener('click', openCreate);
    closeButtons.forEach((button) => button.addEventListener('click', hide));
    iconTriggerEl.addEventListener('click', () => openIconPicker(iconInputEl.value));

    // Delegado no container: as linhas de canal são criadas/removidas em runtime (ver
    // sidebar.js), então um listener por linha teria que ser religado a cada CRUD.
    listEl.addEventListener('click', (event) => {
        const editBtn = event.target.closest('.channel__edit');
        const deleteBtn = event.target.closest('.channel__delete');
        if (!editBtn && !deleteBtn) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const roomId = event.target.closest('.channel')?.dataset.roomId;
        if (!roomId) {
            return;
        }
        if (editBtn) {
            openEdit(roomId);
        } else {
            deleteRoom(roomId);
        }
    });

    async function deleteRoom(roomId) {
        const room = roomsById.get(roomId);
        if (!window.confirm(`Apagar a sala "${room?.name ?? roomId}"? Isso remove o histórico de chat dela.`)) {
            return;
        }
        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('Falha ao apagar a sala.');
            }
        } catch (error) {
            onError?.(error.message ?? 'Falha ao apagar a sala.');
        }
    }

    formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError();
        if (!iconInputEl.value.trim()) {
            // required nativo não basta: o input é readonly, e navegadores isentam
            // campos readonly da validação de constraint (ver FR-007).
            showError('Escolha um ícone para a sala.');
            return;
        }
        const body = {
            name: nameInputEl.value.trim(),
            icon: iconInputEl.value.trim(),
        };
        const isCreate = editingRoomId === null;
        const url = isCreate ? '/api/rooms' : `/api/rooms/${encodeURIComponent(editingRoomId)}`;
        if (isCreate) {
            body.id = idInputEl.value.trim();
        }

        try {
            const response = await fetch(url, {
                method: isCreate ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const problem = await response.json().catch(() => null);
                showError(problem?.message ?? 'Não foi possível salvar a sala.');
                return;
            }
            hide();
        } catch {
            showError('Falha de rede ao salvar a sala.');
        }
    });

    return { openCreate, openEdit };
}
