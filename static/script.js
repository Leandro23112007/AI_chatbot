// Adiciona mensagem do usuário imediatamente
// Mostra indicador de carregamento discreto (três pontinhos) no rodapé enquanto espera a IA
// Quando a resposta chega, remove o indicador e mostra a resposta com efeito typewriter

let currentChatId = null;
let pendingNewChat = false;
let aiAbortController = null;
let isProcessing = false;

// Função para garantir que Enter envia mensagem
function setupInputEnter() {
    const input = document.getElementById('chat-input');
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            document.getElementById('send-btn').click();
        }
    };
}

window.onload = async function() {
    await loadChats();
    document.getElementById('chat-input').focus();

    // Recupera o último chat selecionado do localStorage
    const lastChatId = localStorage.getItem('lastChatId');
    const res = await fetch('/chats');
    const chats = await res.json();
    if (lastChatId && chats.some(chat => chat.id === lastChatId)) {
        await selectChat(lastChatId);
    } else if (chats.length > 0) {
        await selectChat(chats[0].id);
    }

    const newChatBtn = document.getElementById('new-chat-btn');
    const chatInput = document.getElementById('chat-input');
    const minHeight = 20; // altura mínima da caixa de mensagem
    const sendBtn = document.getElementById('send-btn');

    // Ao clicar em Novo chat: apenas limpa a área, prepara novo chat, mas não cria nada no backend
    newChatBtn.addEventListener('click', function() {
        currentChatId = null;
        pendingNewChat = true;
        document.getElementById('chat-area').innerHTML = '<div id="fim-chat"></div>';
        chatInput.value = '';
        chatInput.focus();
    });

    // Envio de mensagem: cria chat só se necessário
    sendBtn.addEventListener('click', async function() {
        if (isProcessing) {
            if (aiAbortController) aiAbortController.abort();
            // Notifica o backend do cancelamento
            if (currentChatId) {
                fetch(`/chat/${currentChatId}/cancel`, {method: 'POST'});
            }
            return;
        }
        const msg = chatInput.value.trim();
        if (!msg) return;
        // Verificação extra: garantir que o chat existe antes de enviar
        if (!currentChatId) {
            pendingNewChat = true;
        }
        let chatIdToUse = currentChatId;
        if (pendingNewChat) {
            const res = await fetch('/chat', {method: 'POST'});
            const data = await res.json();
            chatIdToUse = data.id;
            currentChatId = data.id;
            pendingNewChat = false;
            await loadChats();
            await selectChat(chatIdToUse);
        }
        // Só depois de garantir que o chat foi criado e selecionado, faça a verificação:
        if (typeof window.chatListCache === 'object' && !window.chatListCache[chatIdToUse]) {
            addTypewriterBubble('Erro: Este chat não existe mais. Crie um novo chat.', 'bot');
            return;
        }
        chatInput.value = '';
        chatInput.style.height = minHeight + 'px'; // Reseta altura ao mínimo após enviar
        // Só adiciona a bolha se a última mensagem do usuário for diferente
        const chatArea = document.getElementById('chat-area');
        const bubbles = chatArea.querySelectorAll('.bubble.user');
        if (!bubbles.length || bubbles[bubbles.length - 1].innerText !== msg) {
            addBubble(msg, 'user');
        }
        showLoadingIndicator();
        isProcessing = true;
        sendBtn.innerHTML = '◼';
        localStorage.setItem('lastChatId', chatIdToUse);

        aiAbortController = new AbortController();
        let data = null;
        let aborted = false;
        try {
            const res = await fetch(`/chat/${chatIdToUse}/send`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: msg}),
                signal: aiAbortController.signal
            });
            data = await res.json();
            if (!res.ok) {
                hideLoadingIndicator();
                addTypewriterBubble(data.error || 'Erro ao processar resposta.', 'bot');
                isProcessing = false;
                sendBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                aiAbortController = null;
                chatInput.focus();
                return;
            }
        } catch (err) {
            hideLoadingIndicator();
            if (err.name === 'AbortError') {
                addTypewriterBubble('⏹️ Resposta cancelada pelo usuário.', 'bot');
                aborted = true;
            } else {
                addTypewriterBubble('Erro ao processar resposta.', 'bot');
            }
            isProcessing = false;
            sendBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            aiAbortController = null;
            chatInput.focus();
            return;
        }
        // Só agora, depois de tudo pronto, atualize a interface (se não foi abortado):
        if (!aborted) {
            hideLoadingIndicator();
            addTypewriterBubble(data.ai_text, 'bot', true, msg);
            if (data.memoria_atualizada) {
                showMemoryNotification('A Memória foi atualizada!');
            }
        }
        isProcessing = false;
        sendBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        aiAbortController = null;
        chatInput.focus();
    });

    // Enter envia mensagem, Shift+Enter faz nova linha
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
};

// --- Funções globais para manipulação de chats ---
async function loadChats() {
    try {
        const response = await fetch(`/chats`);
        const chats = await response.json();
        // Atualiza cache global de chats
        window.chatListCache = {};
        const chatList = document.getElementById('chat-list');
        chatList.innerHTML = '';
        chats.forEach(chat => { window.chatListCache[chat.id] = true; });
        chats.forEach(chat => {
            const li = document.createElement('li');
            li.className = 'chat-list-item';
            li.dataset.id = chat.id;
            li.textContent = truncateChatName(chat.name);
            li.title = chat.name; // mostra nome completo ao passar o mouse
            li.addEventListener('click', () => {
                if (isProcessing) return; // Bloqueia troca de chat durante envio
                selectChat(chat.id);
            });
            // Botão apagar
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-chat-btn';
            const icon = document.createElement('img');
            icon.className = 'trash-icon';
            icon.alt = 'Delete';
            icon.src = getTrashIconSrc();
            deleteBtn.appendChild(icon);
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteChat(chat.id); };
            li.appendChild(deleteBtn);
            // Botão editar (agora à direita do botão de remover)
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-chat-btn';
            editBtn.title = 'Editar nome do chat';
            editBtn.innerHTML = '<span style="font-size:16px;">✏️</span>';
            editBtn.onclick = (e) => { e.stopPropagation(); renameChatPrompt(chat.id, li); };
            li.appendChild(editBtn);
            chatList.appendChild(li);
        });
        // Seleciona chat inicial se necessário
        if (!currentChatId && chats.length > 0) {
            await selectChat(chats[0].id);
        } else if (currentChatId) {
            await selectChat(currentChatId);
        } else if (chats.length === 0) {
            document.getElementById('chat-area').innerHTML = '<div id="fim-chat"></div>';
        }
        highlightSelectedChat(currentChatId);
    } catch (error) { console.error('Erro ao carregar chats:', error); }
}

async function selectChat(chatId) {
    currentChatId = chatId;
    pendingNewChat = false;
    document.getElementById('chat-area').innerHTML = '<div id="fim-chat"></div>';
    const res = await fetch(`/chat/${chatId}`);
    const blocks = await res.json();
    for (const block of blocks) {
        addBubble(block.user_variants[block.selected], 'user');
        // Só mostra a resposta da IA se ela existir e não for vazia
        const aiResp = block.ai_responses[block.selected];
        if (aiResp && typeof aiResp === 'string' && aiResp.trim() !== '') {
            addTypewriterBubble(aiResp, 'bot', false);
        }
    }
    setTimeout(() => {
        forceScrollToBottom();
    }, 100);
    localStorage.setItem('lastChatId', chatId);
    highlightSelectedChat(chatId);
    await loadFileList(chatId);
}

function getChatNameById(chatId) {
    const li = Array.from(document.querySelectorAll('#chat-list .chat-list-item')).find(li => li.onclick && li.onclick.toString().includes(chatId));
    return li ? li.childNodes[0].textContent.trim() : '';
}

// Apagar chat
async function deleteChat(chatId) {
    await fetch(`/chat/${chatId}`, {method: 'DELETE'});
    if (currentChatId === chatId) currentChatId = null;
    await loadChats();
    document.getElementById('chat-area').innerHTML = '<div id="fim-chat"></div>';
    document.getElementById('chat-input').focus();
}

// Renomear chat
function renameChatPrompt(chatId, li) {
    const oldName = li.childNodes[0].textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'rename-input';
    li.replaceChild(input, li.childNodes[0]);
    input.focus();
    input.onblur = async function() {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            await fetch(`/chat/${chatId}/rename`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: newName})
            });
            await loadChats();
        } else {
            li.replaceChild(document.createTextNode(oldName), input);
        }
        document.getElementById('chat-input').focus();
    };
    input.onkeydown = function(e) {
        if (e.key === 'Enter') input.blur();
    };
}

function addBubble(text, who) {
    const div = document.createElement('div');
    div.className = 'bubble ' + who;
    // Se for imagem, mostra inline
    if (typeof text === 'string' && /(https?:\/\/|\/files\/)[^\s]+\.(png|jpg|jpeg|webp|gif)/i.test(text)) {
        const imgUrl = text.match(/(https?:\/\/|\/files\/)[^\s]+\.(png|jpg|jpeg|webp|gif)/i)[0];
        div.innerHTML = `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" alt="Imagem gerada" style="max-width:320px;max-height:320px;display:block;margin-bottom:8px;border-radius:10px;"></a><br>` + text;
    } else {
        div.innerText = text;
    }
    document.getElementById('chat-area').appendChild(div);
    setTimeout(() => {
        forceScrollToBottom();
    }, 50);
}

// Função para formatar texto da IA com negrito, títulos e itálico
function formatAIText(text) {
    if (!text || typeof text !== 'string') return '';

    // 1. Extrai blocos de código com linguagem e substitui por placeholders
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, function(match, lang, code) {
        lang = lang ? 'language-' + lang : '';
        codeBlocks.push({ code, lang });
        return `[[CODEBLOCK_${codeBlocks.length - 1}]]`;
    });

    // 2. Aplica formatação Markdown no texto restante
    // Código inline (`code`)
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Citações (blockquote)
    text = text.replace(/^> ?(.*)$/gm, '<blockquote>$1</blockquote>');

    // Títulos Markdown até nível 4
    text = text.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
    text = text.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*)$/gm, '<h1>$1</h1>');

    // Sublistas e listas (indentação com dois espaços)
    text = text.replace(/^(  - .*)$/gm, '<ul class="sublist">$1</ul>');
    text = text.replace(/^  - (.*)$/gm, '<li class="subitem">$1</li>');
    text = text.replace(/^(?:- |• )(.*)$/gm, '<li>$1</li>');
    text = text.replace(/(<li.*?>.*<\/li>\n?)+/g, function(match) {
        return '<ul>' + match.replace(/\n/g, '') + '</ul>';
    });

    // Listas numeradas
    text = text.replace(/^(\d+)\. (.*)$/gm, '<li>$2</li>');
    text = text.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
        return '<ol>' + match.replace(/\n/g, '') + '</ol>';
    });

    // Negrito + itálico ***texto***
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
    // Negrito alternativo __texto__
    text = text.replace(/__(.+?)__/g, '<b>$1</b>');
    // Riscado ~~texto~~
    text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');
    // Negrito **texto**
    text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    // Itálico *texto*
    text = text.replace(/\*(.+?)\*/g, '<i>$1</i>');
    // Itálico _texto_ (Markdown)
    text = text.replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>');

    // Links [texto](url)
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Imagens ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;">');

    // Quebras de linha
    text = text.replace(/\n/g, '<br>');

    // 3. Reinsere os blocos de código sem formatação extra, com a linguagem
    text = text.replace(/\[\[CODEBLOCK_(\d+)\]\]/g, function(match, idx) {
        const block = codeBlocks[parseInt(idx, 10)] || { code: '', lang: '' };
        return `<pre><code class="${block.lang}">${block.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    });

    return text;
}

function addTypewriterBubble(text, who, useTypewriter = false, userMsg = '') {
    if (!text || typeof text !== 'string') text = '';
    const div = document.createElement('div');
    div.className = 'bubble ' + who;
    div.innerHTML = '';
    document.getElementById('chat-area').appendChild(div);

    // Mensagens automáticas que não devem mostrar feedback
    const autoMessages = [
        '⏹️ Resposta cancelada pelo usuário.',
        'Erro ao processar resposta.',
        'Mensagem demasiado longa (máx 10000 caracteres)',
        'Mensagem demasiado longa (máx 10000 caraters)',
        'Mensagem demasiado longa (máx 10000 carateres)',
        'Mensagem demasiado longa (máx 10000 carácteres)',
        'Mensagem demasiado longa (máx 10000 caracteres).',
        'Chat não encontrado',
        'Erro: Este chat não existe mais. Crie um novo chat.'
    ];
    const isAutoMessage = autoMessages.some(msg => text.trim().toLowerCase().includes(msg.toLowerCase()));

    // Cria bloco de feedback (mas só adiciona depois do texto)
    let feedbackDiv = null;
    if (who === 'bot' && !isAutoMessage) {
        feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback-btns';
        feedbackDiv.style.marginTop = '6px';
        feedbackDiv.style.display = 'flex';
        feedbackDiv.style.gap = '8px';
        // Botão positivo
        const btnPos = document.createElement('button');
        btnPos.innerText = '👍';
        btnPos.title = 'Resposta útil';
        // Botão negativo
        const btnNeg = document.createElement('button');
        btnNeg.innerText = '👎';
        btnNeg.title = 'Resposta não foi útil';
        // Permitir alternar feedback
        btnPos.onclick = function() {
            enviarFeedback('positivo', userMsg, text);
            btnPos.classList.add('selected');
            btnNeg.classList.remove('selected');
        };
        btnNeg.onclick = function() {
            enviarFeedback('negativo', userMsg, text);
            btnNeg.classList.add('selected');
            btnPos.classList.remove('selected');
        };
        feedbackDiv.appendChild(btnPos);
        feedbackDiv.appendChild(btnNeg);
    }

    // Se for imagem, mostra inline
    if (typeof text === 'string' && /(https?:\/\/|\/files\/)[^\s]+\.(png|jpg|jpeg|webp|gif)/i.test(text)) {
        const imgUrl = text.match(/(https?:\/\/|\/files\/)[^\s]+\.(png|jpg|jpeg|webp|gif)/i)[0];
        div.innerHTML = `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" alt="Imagem gerada" style="max-width:320px;max-height:320px;display:block;margin-bottom:8px;border-radius:10px;"></a><br>` + formatAIText(text);
        setTimeout(() => {
            if (feedbackDiv) div.appendChild(feedbackDiv);
            forceScrollToBottom();
        }, 50);
        return;
    }

    if (who === 'bot' && useTypewriter) {
        typewriter(div, text, 0, 12, function() {
            if (feedbackDiv) div.appendChild(feedbackDiv);
            // Aplica highlight.js nos blocos de código recém-adicionados
            if (window.hljs) {
                div.querySelectorAll('pre code').forEach((block) => {
                    window.hljs.highlightElement(block);
                });
            }
        });
    } else {
        div.innerHTML = formatAIText(text);
        setTimeout(() => {
            if (feedbackDiv) div.appendChild(feedbackDiv);
            forceScrollToBottom();
            // Aplica highlight.js nos blocos de código recém-adicionados
            if (window.hljs) {
                div.querySelectorAll('pre code').forEach((block) => {
                    window.hljs.highlightElement(block);
                });
            }
        }, 50);
    }
}

function typewriter(element, text, i, speed, onFinish) {
    if (i < text.length) {
        // Aplica a formatação ao texto já digitado
        element.innerHTML = formatAIText(text.slice(0, i + 1));
        // Aplica syntax highlighting nos blocos de código
        if (window.hljs) {
            element.querySelectorAll('pre code').forEach((block) => {
                window.hljs.highlightElement(block);
            });
        }
        setTimeout(function() {
            typewriter(element, text, i + 1, speed, onFinish);
            forceScrollToBottom();
        }, speed);
    } else {
        forceScrollToBottom();
        if (onFinish) onFinish();
    }
}

// Função para mostrar indicador de loading (três pontinhos)
function showLoadingIndicator() {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loading-indicator';
        indicator.className = 'loading-indicator';
        indicator.innerHTML = '<span>.</span><span>.</span><span>.</span>';
        document.getElementById('chat-area').appendChild(indicator);
        animateDots(indicator);
    }
}
function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.remove();
}
function animateDots(indicator) {
    const spans = indicator.querySelectorAll('span');
    let visible = 0;
    setInterval(() => {
        spans.forEach((s, i) => s.style.opacity = (i <= visible ? '1' : '0.2'));
        visible = (visible + 1) % 3;
    }, 400);
}

// Abrir modal de definições
document.getElementById('settings-btn').onclick = async function() {
    document.getElementById('settings-modal').style.display = 'flex';
    // Carregar user_info
    const res = await fetch('/user_info');
    const info = await res.json();
};
// Fechar modal (para todos os botões de fechar)
document.querySelectorAll('.close-button').forEach(btn => {
    btn.onclick = function() {
        // Fecha o modal pai
        btn.closest('.modal').style.display = 'none';
    };
});
// Salvar definições (remover ou comentar pois não há settings-form)
// document.getElementById('settings-form').onsubmit = async function(e) {
//     e.preventDefault();
//     const info = {
//         name: document.getElementById('user-name').value,
//         email: document.getElementById('user-email').value,
//         preferences: document.getElementById('user-preferences').value
//     };
//     await fetch('/user_info', {
//         method: 'POST',
//         headers: {'Content-Type': 'application/json'},
//         body: JSON.stringify(info)
//     });
//     document.getElementById('settings-modal').style.display = 'none';
//     alert('Definições salvas!');
// };

document.addEventListener('DOMContentLoaded', function() {
    // --- ELEMENTOS DO DOM ---
    const chatList = document.getElementById('chat-list');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatArea = document.getElementById('chat-area');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatTitle = document.querySelector('title');

    // Modais
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const userInfoModal = document.getElementById('user-info-modal');
    const closeButtons = document.querySelectorAll('.close-button');
    const manageMemoriesBtn = document.getElementById('manage-memories-btn');

    // Inputs das Definições
    const themeSelect = document.getElementById('setting-theme');
    const memorySavedToggle = document.getElementById('setting-memory-saved');
    const memoryHistoryToggle = document.getElementById('setting-memory-history');

    // Inputs de User Info
    const saveUserInfoBtn = document.getElementById('save-user-info');
    const userNameInput = document.getElementById('user-name');
    const userEmailInput = document.getElementById('user-email');
    const userInterestsInput = document.getElementById('user-interests');
    const userPreferencesInput = document.getElementById('user-preferences');

    // --- ESTADO DA APLICAÇÃO ---
    const API_URL = 'http://127.0.0.1:5000';

    // --- FUNÇÕES ---

    // --- LÓGICA DE CHAT ---

    async function createNewChat() {
        try {
            const response = await fetch(`${API_URL}/chat`, { method: 'POST' });
            const chat = await response.json();
            await loadChats();
            await selectChat(chat.id);
        } catch (error) { console.error('Erro ao criar novo chat:', error); }
    }

    async function renameChat(chatId, newName) {
        try {
            await fetch(`${API_URL}/chat/${chatId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            await loadChats();
        } catch (error) { console.error('Erro ao renomear chat:', error); }
    }

    // --- LÓGICA DOS MODAIS E DEFINIÇÕES ---

    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'block';
        loadSettings();
    });

    closeButtons.forEach(btn => btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
    }));

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
        if (e.target === userInfoModal) userInfoModal.style.display = 'none';
    });

    manageMemoriesBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
        userInfoModal.style.display = 'block';
        loadUserInfo();
    });

    async function loadSettings() {
        try {
            const response = await fetch(`${API_URL}/api/settings`);
            const settings = await response.json();
            
            themeSelect.value = settings.theme;
            document.body.className = settings.theme === 'light' ? 'light-theme' : '';

            memorySavedToggle.checked = settings.memory.reference_saved_memories;
            memoryHistoryToggle.checked = settings.memory.reference_chat_history;
        } catch (error) { console.error('Erro ao carregar definições:', error); }
    }

    async function saveSettings() {
        const settings = {
            theme: themeSelect.value,
            memory: {
                reference_saved_memories: memorySavedToggle.checked,
                reference_chat_history: memoryHistoryToggle.checked,
            }
        };
        try {
            await fetch(`${API_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            document.body.className = settings.theme === 'light' ? 'light-theme' : '';
            updateTrashIcons();
        } catch (error) { console.error('Erro ao guardar definições:', error); }
    }

    async function loadUserInfo() {
        try {
            const response = await fetch(`${API_URL}/user_info`);
            const info = await response.json();

            // Mostrar frases de memórias resumidas (gostos, etc) como lista editável
            let memoriasHtml = '';
            if (info.memorias_resumidas && Array.isArray(info.memorias_resumidas) && info.memorias_resumidas.length > 0) {
                memoriasHtml = '<div style="margin-top:10px;margin-bottom:10px;"><b>Memórias e gostos detectados pela IA:</b>';
                memoriasHtml += '<ul id="memorias-list" style="margin:6px 0 0 0; padding:0; list-style:none; max-height:180px; overflow-y:auto;">';
                info.memorias_resumidas.forEach((frase, idx) => {
                    memoriasHtml += `<li style='display:flex;align-items:center;justify-content:space-between;background:#222328;margin-bottom:6px;padding:8px 12px;border-radius:6px;'>` +
                        `<span style='flex:1;'>${frase}</span>` +
                        `<button class='delete-memoria-btn' data-idx='${idx}' style='background:none;border:none;color:#bbb;font-size:18px;cursor:pointer;margin-left:12px;' title='Eliminar'><span style='font-size:18px;'>🗑️</span></button>` +
                    `</li>`;
                });
                memoriasHtml += '</ul>';
                memoriasHtml += `<button id='delete-all-memorias-btn' style='margin-top:8px;background:#2d2d2f;color:#ff4d4f;border:none;padding:6px 18px;border-radius:8px;cursor:pointer;float:right;'>Eliminar tudo</button>`;
                memoriasHtml += '<div style="clear:both"></div></div>';
            }
            document.getElementById('user-memories-summary').innerHTML = memoriasHtml;

            // Listeners para apagar memórias
            document.querySelectorAll('.delete-memoria-btn').forEach(btn => {
                btn.onclick = async function() {
                    const idx = btn.getAttribute('data-idx');
                    await fetch('/user_memory/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({idx})
                    });
                    loadUserInfo();
                };
            });
            const delAllBtn = document.getElementById('delete-all-memorias-btn');
            if (delAllBtn) {
                delAllBtn.onclick = async function() {
                    if (confirm('Tem certeza que deseja eliminar todas as memórias detectadas pela IA?')) {
                        await fetch('/user_memory/delete_all', {method: 'POST'});
                        loadUserInfo();
                    }
                };
            }
        } catch (error) { console.error('Erro ao carregar info do utilizador:', error); }
    }

    // --- EVENT LISTENERS ---
    // Remover ou comentar a linha abaixo para evitar criação de chat ao clicar em Novo chat
    // newChatBtn.addEventListener('click', createNewChat);

    // --- Ajuste dinâmico da altura do chatInput ---
    const minHeight = 40; // igual ao min-height do CSS
    chatInput.style.minHeight = minHeight + 'px';
    chatInput.addEventListener('input', () => {
        chatInput.style.height = minHeight + 'px'; // sempre reseta para o mínimo
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });
    
    themeSelect.addEventListener('change', saveSettings);
    memorySavedToggle.addEventListener('change', saveSettings);
    memoryHistoryToggle.addEventListener('change', saveSettings);

    // --- INICIALIZAÇÃO ---
    loadSettings();
    loadChats();

    // Força scroll para o fim do chat-area sempre que houver modificação
    function forceScrollToBottom() {
        const fim = document.getElementById('fim-chat');
        if (fim) {
            fim.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Adiciona observer após o DOM estar pronto
    if (chatArea) {
        const observer = new MutationObserver(() => {
            forceScrollToBottom();
        });
        observer.observe(chatArea, { childList: true, subtree: true });
    }
});

function getTrashIconSrc() {
    return document.body.classList.contains('light-theme')
        ? '/static/light_bin.png'
        : '/static/dark_bin.png';
}

function updateTrashIcons() {
    document.querySelectorAll('.trash-icon').forEach(icon => {
        icon.src = getTrashIconSrc();
    });
}

function showMemoryNotification(msg) {
    let notif = document.createElement('div');
    notif.className = 'memory-toast';
    notif.innerText = msg;
    document.body.appendChild(notif);
    setTimeout(() => {
        notif.classList.add('fadeout');
        setTimeout(() => notif.remove(), 600);
    }, 2000);
}

function highlightSelectedChat(chatId) {
    document.querySelectorAll('.chat-list-item').forEach(li => {
        if (li.dataset.id === chatId) {
            li.classList.add('selected');
        } else {
            li.classList.remove('selected');
        }
    });
}

function truncateChatName(name, maxlen = 40) {
    return name.length > maxlen ? name.slice(0, maxlen - 3) + '...' : name;
}

function enviarFeedback(tipo, mensagem_usuario, resposta_ai) {
    // Aqui você pode melhorar para pegar o tema do chat, se desejar
    const tema = 'geral';
    fetch('/feedback', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            user_id: 'default_user',
            tema: tema,
            feedback: tipo,
            comentario: '',
            mensagem_usuario: mensagem_usuario,
            resposta_ai: resposta_ai
        })
    });
}

async function loadFileList(chatId) {
    const fileListDiv = document.getElementById('file-list');
    fileListDiv.innerHTML = '<span style="color:#aaa;">A carregar ficheiros...</span>';
    try {
        const res = await fetch(`/api/files?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            fileListDiv.innerHTML = '<b>Ficheiros deste chat:</b><ul style="margin:6px 0 0 0; padding:0; list-style:none;">' +
                data.files.map(f => `<li style='margin-bottom:4px;'><a href="/api/download?chat_id=${encodeURIComponent(chatId)}&filename=${encodeURIComponent(f)}" target="_blank" style="color:#4a90e2;">${f}</a></li>`).join('') +
                '</ul>';
        } else {
            fileListDiv.innerHTML = '<span style="color:#aaa;">Nenhum ficheiro neste chat.</span>';
        }
    } catch (e) {
        fileListDiv.innerHTML = '<span style="color:#f55;">Erro ao carregar ficheiros.</span>';
    }
}

// Atualizar file list ao selecionar chat
const oldSelectChat = selectChat;
selectChat = async function(chatId) {
    await oldSelectChat(chatId);
    await loadFileList(chatId);
};

// Upload de ficheiro
const fileForm = document.getElementById('file-upload-form');
if (fileForm) {
    fileForm.onsubmit = async function(e) {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        if (!fileInput.files.length) return;
        if (!currentChatId) {
            alert('Selecione ou crie um chat antes de enviar ficheiros.');
            return;
        }
        const file = fileInput.files[0];
        if (!['application/pdf', 'text/plain'].includes(file.type) && !file.name.match(/\.(pdf|txt)$/i)) {
            alert('Apenas ficheiros PDF ou TXT são permitidos.');
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chat_id', currentChatId);
        document.getElementById('upload-btn').innerText = 'A enviar...';
        document.getElementById('upload-btn').disabled = true;
        try {
            const res = await fetch('/api/upload', {method: 'POST', body: formData});
            const data = await res.json();
            if (data.ok) {
                fileInput.value = '';
                await loadFileList(currentChatId);
            } else {
                alert(data.error || 'Erro ao enviar ficheiro.');
            }
        } catch (e) {
            alert('Erro ao enviar ficheiro.');
        }
        document.getElementById('upload-btn').innerText = 'Enviar ficheiro';
        document.getElementById('upload-btn').disabled = false;
    };
} 