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

// Função para extrair ID da planilha do Google Sheets
function extractSheetId(url) {
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Função para converter link do Google Sheets para CSV
function convertToCSVUrl(sheetUrl) {
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
        throw new Error('URL da planilha inválida');
    }
    
    // URL para exportar como CSV
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
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

// Função para carregar a planilha
async function loadSheet() {
    const url = sheetUrlInput.value.trim();
    
    if (!url) {
        showStatus('Por favor, insira o link da planilha', 'error');
        return;
    }
    
    try {
        toggleLoading(true);
        showStatus('Carregando dados da planilha...', 'loading');
        
        const csvUrl = convertToCSVUrl(url);
        
        // Fazer requisição para obter os dados CSV
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            throw new Error('Erro ao acessar a planilha. Verifique se ela está pública.');
        }
        
        const csvText = await response.text();
        
        // Processar os dados CSV
        const processedData = processCSVData(csvText);
        
        if (processedData.length === 0) {
            throw new Error('Nenhum dado encontrado na planilha');
        }
        
        sheetData = processedData;
        
        // Habilitar campo de busca
        searchInput.disabled = false;
        searchInput.focus();
        
        showStatus(`Planilha carregada com sucesso! ${sheetData.length} registros encontrados.`, 'success');
        
        // Mostrar informações do set se disponível
        if (setInfo) {
            setInfoDiv.textContent = setInfo;
            setInfoDiv.style.display = 'block';
        }
        
        // Limpar busca anterior
        searchInput.value = '';
        hideResults();
        
    } catch (error) {
        console.error('Erro ao carregar planilha:', error);
        showStatus(error.message, 'error');
        searchInput.disabled = true;
        sheetData = [];
        hideResults();
    } finally {
        toggleLoading(false);
    }
}

// Função para processar dados CSV
function processCSVData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const processedData = [];
    let currentSet = '';
    let currentName = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const columns = parseCSVLine(line);
        
        // Verificar se é uma linha de cabeçalho do SET
        if (columns[0] && columns[0].includes('SET') && columns[0].includes('MPCS')) {
            currentSet = columns[0].trim();
            setInfo = currentSet; // Armazenar informação do set
            continue;
        }
        
        // Verificar se é uma linha de cabeçalho de colunas
        if (columns[0] && (columns[0].toLowerCase().includes('nome') || columns[0].toLowerCase().includes('user'))) {
            continue;
        }
        
        // Processar linha de dados
        if (columns.length >= 4) {
            const nameColumn = columns[0] ? columns[0].trim() : '';
            const itemColumn = columns[1] ? columns[1].trim() : '';
            const priceColumn = columns[2] ? columns[2].trim() : '';
            const paymentColumn = columns[3] ? columns[3].trim() : '';
            
            // Se há nome na primeira coluna, atualizar o nome atual
            if (nameColumn && nameColumn !== '') {
                currentName = nameColumn;
            }
            
            // Se há item e preço, criar registro
            if (itemColumn && priceColumn) {
                processedData.push({
                    set: currentSet,
                    name: currentName,
                    item: itemColumn,
                    price: priceColumn,
                    payment: paymentColumn,
                    searchText: `${currentName} ${itemColumn}`.toLowerCase()
                });
            }
        }
    }
    
    return processedData;
}

// Função para fazer parse de linha CSV (lidando com vírgulas dentro de aspas)
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
    return result.map(item => item.replace(/^"|"$/g, ''));
}

// Função para realizar busca
function performSearch() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    
    if (!searchTerm) {
        hideResults();
        return;
    }
    
    if (sheetData.length === 0) {
        showNoResults('Carregue uma planilha primeiro');
        return;
    }
    
    // Filtrar dados
    const filteredData = sheetData.filter(item => {
        return item.searchText.includes(searchTerm) || 
               item.name.toLowerCase().includes(searchTerm);
    });
    
    if (filteredData.length === 0) {
        showNoResults('Nenhum resultado encontrado');
        return;
    }
    
    // Mostrar resultados
    displayResults(filteredData);
}

// Função para exibir resultados
function displayResults(data) {
    // Limpar tabela
    resultsTbody.innerHTML = '';
    
    // Adicionar linhas
    data.forEach(item => {
        const row = document.createElement('tr');
        
        // Formatar status de pagamento
        const paymentStatus = formatPaymentStatus(item.payment);
        
        row.innerHTML = `
            <td>${item.set || ''}</td>
            <td>${item.name || ''}</td>
            <td>${item.item || ''}</td>
            <td>${item.price || ''}</td>
            <td>${paymentStatus}</td>
        `;
        
        resultsTbody.appendChild(row);
    });
    
    // Mostrar tabela
    noResults.style.display = 'none';
    resultsTable.style.display = 'table';
}

// Função para formatar status de pagamento
function formatPaymentStatus(payment) {
    if (!payment) return '';
    
    const paymentLower = payment.toLowerCase();
    
    if (paymentLower.includes('pago') || paymentLower === 'pago') {
        return '<span class="payment-status paid">✅ Pago</span>';
    } else {
        return '<span class="payment-status unpaid">❌ Não pago</span>';
    }
}

// Função para esconder resultados
function hideResults() {
    resultsTable.style.display = 'none';
    noResults.style.display = 'block';
    noResults.textContent = 'Carregue uma planilha e digite algo para buscar';
}

// Função para mostrar mensagem de "sem resultados"
function showNoResults(message) {
    resultsTable.style.display = 'none';
    noResults.style.display = 'block';
    noResults.textContent = message;
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Focar no campo de URL da planilha
    sheetUrlInput.focus();
    
    // Adicionar exemplo de URL no placeholder
    sheetUrlInput.placeholder = 'https://docs.google.com/spreadsheets/d/SEU_ID_DA_PLANILHA/edit#gid=0';
});

// Função para detectar Enter no campo de URL
sheetUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        loadSheet();
    }
});

// Função para detectar Enter no campo de busca
searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performSearch();
    }
});

