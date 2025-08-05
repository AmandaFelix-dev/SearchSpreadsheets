// Sua chave de API do Google
const API_KEY = 'AIzaSyA_eoKahvKrAbKvWsxvO6vEmLifkKUSfWw';

// Variáveis globais
let sheetData = [];
let setInfo = '';

// Elementos DOM
const sheetUrlInput = document.getElementById('sheet-url');
const loadSheetBtn = document.getElementById('load-sheet-btn');
const sheetStatus = document.getElementById('sheet-status');
const searchInput = document.getElementById('search-input');
const setInfoDiv = document.getElementById('set-info');
const resultsTable = document.getElementById('results-table');
const resultsTbody = document.getElementById('results-tbody');
const noResults = document.getElementById('no-results');
const loadingOverlay = document.getElementById('loading-overlay');

// Event listeners
loadSheetBtn.addEventListener('click', loadSheet);
searchInput.addEventListener('input', performSearch);
sheetUrlInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') loadSheet();
});
searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') performSearch();
});

// Função para extrair o ID da planilha
function extractSheetId(url) {
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Função para mostrar status
function showStatus(message, type) {
    sheetStatus.textContent = message;
    sheetStatus.className = `status-message ${type}`;
}

// Função para mostrar/esconder loading
function toggleLoading(show) {
    loadingOverlay.style.display = show ? 'block' : 'none';
}

// Função principal para carregar todas as abas da planilha
async function loadSheet() {
    const url = sheetUrlInput.value.trim();
    if (!url) return showStatus('Por favor, insira o link da planilha', 'error');

    const sheetId = extractSheetId(url);
    if (!sheetId) return showStatus('Link inválido', 'error');

    toggleLoading(true);
    showStatus('Carregando planilha...', 'loading');

    try {
        // Obter lista de abas
        const metadataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${API_KEY}`);
        const metadataJson = await metadataRes.json();

        const sheets = metadataJson.sheets || [];
        if (sheets.length === 0) throw new Error('Nenhuma aba encontrada');

        sheetData = [];
        for (const sheet of sheets) {
            const title = sheet.properties.title;

            const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(title)}?key=${API_KEY}`);
            const valuesJson = await valuesRes.json();

            if (!valuesJson.values || valuesJson.values.length <= 1) continue;

            const csvText = convertToCSV(valuesJson.values);
            const processed = processCSVData(csvText, title);
            sheetData.push(...processed);
        }

        if (sheetData.length === 0) {
            showStatus('Nenhum dado encontrado nas abas da planilha', 'error');
            searchInput.disabled = true;
            return;
        }

        setInfo = metadataJson.properties.title;
        searchInput.disabled = false;
        searchInput.focus();
        setInfoDiv.textContent = setInfo;
        setInfoDiv.style.display = 'block';
        showStatus(`Planilha carregada com sucesso: ${sheetData.length} registros.`, 'success');
        searchInput.value = '';
        hideResults();

    } catch (err) {
        console.error(err);
        showStatus(`Erro: ${err.message}`, 'error');
        sheetData = [];
        searchInput.disabled = true;
        hideResults();
    } finally {
        toggleLoading(false);
    }
}

// Converte array JSON para CSV (para reusar a função existente de parser)
function convertToCSV(array) {
    return array.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Processa os dados do CSV para estrutura legível
function processCSVData(csvText, abaNome) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const processedData = [];
    let currentName = '';

    const startRow = lines[0].toLowerCase().includes('nome') ? 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
        const line = lines[i];
        const columns = parseCSVLine(line);

        if (columns.length >= 4) {
            const nameColumn = columns[0]?.trim();
            const itemColumn = columns[1]?.trim();
            const priceColumn = columns[2]?.trim();
            const paymentColumn = columns[3]?.trim();

            if (nameColumn) currentName = nameColumn;

            if (itemColumn && priceColumn) {
                processedData.push({
                    name: currentName,
                    item: itemColumn,
                    price: priceColumn,
                    payment: paymentColumn,
                    searchText: `${currentName} ${itemColumn}`.toLowerCase(),
                    sheetName: abaNome
                });
            }
        }
    }

    return processedData;
}

// Faz parse de linha CSV (respeitando vírgulas entre aspas)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result.map(cell => cell.replace(/^"|"$/g, ''));
}

// Realiza busca por nome ou telefone
function performSearch() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (!searchTerm) return hideResults();

    if (sheetData.length === 0) {
        return showNoResults('Carregue uma planilha primeiro');
    }

    const filteredData = sheetData.filter(item =>
        item.searchText.includes(searchTerm) ||
        item.name.toLowerCase().includes(searchTerm)
    );

    if (filteredData.length === 0) {
        return showNoResults('Nenhum resultado encontrado');
    }

    displayResults(filteredData);
}

// Exibe resultados encontrados
function displayResults(data) {
    resultsTbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        const paymentStatus = formatPaymentStatus(item.payment);

        row.innerHTML = `
            <td>${item.sheetName || 'Planilha'}</td>
            <td>${item.name || ''}</td>
            <td>${item.item || ''}</td>
            <td>${item.price || ''}</td>
            <td>${paymentStatus}</td>
        `;

        resultsTbody.appendChild(row);
    });

    noResults.style.display = 'none';
    resultsTable.style.display = 'table';
}

// Formata o status de pagamento
function formatPaymentStatus(payment) {
    if (!payment) return '';
    const p = payment.toLowerCase();
    return p.includes('pago') ? '✅ Pago' : '❌ Não pago';
}

// Oculta resultados
function hideResults() {
    resultsTable.style.display = 'none';
    noResults.style.display = 'block';
    noResults.textContent = 'Carregue uma planilha e digite algo para buscar';
}

// Exibe mensagem de "nenhum resultado"
function showNoResults(message) {
    resultsTable.style.display = 'none';
    noResults.style.display = 'block';
    noResults.textContent = message;
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    sheetUrlInput.placeholder = 'https://docs.google.com/spreadsheets/d/SEU_ID_DA_PLANILHA/edit#gid=0';
    sheetUrlInput.focus();
});
