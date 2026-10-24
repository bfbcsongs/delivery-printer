// ============================================================
// EMERGENCY SERVICE WORKER KILLER (PANG-CLEAN NG LUMANG CACHE)
// ============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister();
        }
    });
}
if ('caches' in window) {
    caches.keys().then(names => {
        names.forEach(name => {
            caches.delete(name);
        });
    });
}

// ============================================================
// DEFAULT CUSTOMER NAMES
// ============================================================
const DEFAULT_NAMES = [
    "Rassel", "Cess", "Ed", "Risa", "Rakel", "Lina", 
    "7/11", "Leah", "Jeny", 
    "Sweet", "Lany", "Jean", "Ling²", "Flor"
];

// ============================================================
// PWA INSTALL PROMPT HANDLER
// ============================================================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'block';
    }
});

function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
        const btn = document.getElementById('installBtn');
        if (btn) {
            btn.style.display = 'none';
        }
    });
}

// ============================================================
// SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=3', {
            scope: './'
        })
        .then(reg => {
            console.log('Service Worker Registered!', reg);
        })
        .catch(err => {
            console.log('Service Worker Registration Failed:', err);
        });
    });
}

// ============================================================
// GLOBAL STATE, DYNAMIC ROWS & UNDO/REDO
// ============================================================

let activeRow = 1;
let customerRows = [
    { name: DEFAULT_NAMES[0] || "", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }
];

let tapCount = 0;
let tapTimer = null;
let isLocked = false; 

let priceTapCount = 0;
let priceTapTimer = null;
let isPriceLocked = true;

let currentSessionDate = "";
let currentSessionName = "";

let modalMode = "OPEN";

let inactivityTimer = null;
let isEditingActive = false;

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// PREVIEW STATE
let isPreviewMode = false;
let previewDateKey = null;
let previewBackup = null;

// ROW UTANG MODE TRACKER
let rowUtangMode = {};
let rowTapCounts = {};
let rowTapTimers = {};

// PRINT COUNTER TRACKER
let printCounters = {};

// UNDO / REDO STACKS
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;
const MAX_UNDO_LIMIT = 50;

// EXIT CONFIRMATION STATE
let allowExit = false;

// ============================================================
// APP INITIALIZATION (DOM CONTENT LOADED)
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    setupViewSwitcher();
    setupKeyboardShortcuts();
    setupInstantBackIntercept();
    loadLedger();
    
    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        const container = document.querySelector(".name-bar-container");
        if (container && !container.contains(e.target)) {
            hideNameDropdown();
        }
    });
});

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            if (e.shiftKey) {
                e.preventDefault();
                redo();
            } else {
                e.preventDefault();
                undo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        }
    });
}

// ============================================================
// INSTANT & CONTINUOUS BACK BUTTON INTERCEPT
// ============================================================

function ensureHistoryBuffer() {
    window.history.pushState({ page: 'miki_ledger' }, '', window.location.href);
    window.history.pushState({ page: 'miki_ledger' }, '', window.location.href);
}

function setupInstantBackIntercept() {
    ensureHistoryBuffer();

    ['touchstart', 'click', 'keydown'].forEach(evt => {
        document.addEventListener(evt, () => {
            if (!allowExit) {
                window.history.pushState({ page: 'miki_ledger' }, '', window.location.href);
            }
        }, { passive: true });
    });

    window.addEventListener('popstate', (e) => {
        if (allowExit) return;

        window.history.pushState({ page: 'miki_ledger' }, '', window.location.href);

        // 1. Switch Print History back to Customers table
        if (typeof currentTableViewMode !== 'undefined' && currentTableViewMode === "PRINT_HISTORY") {
            currentTableViewMode = "CUSTOMERS";
            document.body.classList.remove("print-history-active");
            restoreCustomersToTable();
            updateToggleBtnUI();
            return;
        }

        // 2. Exit Preview Mode
        if (isPreviewMode) {
            exitHistoryPreview();
            return;
        }

        // 3. Close setup modal if open
        const setupModal = document.getElementById("setupModal");
        if (setupModal && setupModal.style.display === "flex") {
            closeSetupModal();
            return;
        }

        // 4. Hide name bar dropdown
        hideNameDropdown();

        // 5. Always trigger Exit Modal when on main screen
        showExitModal();
    });
}

function showExitModal() {
    const exitModal = document.getElementById("exitConfirmModal");
    if (exitModal) exitModal.style.display = "flex";
}

function cancelExitApp() {
    const exitModal = document.getElementById("exitConfirmModal");
    if (exitModal) exitModal.style.display = "none";
    ensureHistoryBuffer();
}

function confirmExitApp() {
    allowExit = true;
    const exitModal = document.getElementById("exitConfirmModal");
    if (exitModal) exitModal.style.display = "none";

    window.history.go(-2);
    setTimeout(() => {
        window.close();
    }, 150);
}

// ============================================================
// UNDO / REDO SYSTEM
// ============================================================

function pushUndoState() {
    if (isUndoRedoAction || isPreviewMode || currentTableViewMode === "PRINT_HISTORY" || !isEditingActive) return;

    const currentSnapshot = JSON.stringify(getCurrentLedgerSnapshot());
    
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === currentSnapshot) {
        return;
    }

    undoStack.push(currentSnapshot);
    if (undoStack.length > MAX_UNDO_LIMIT) {
        undoStack.shift();
    }

    redoStack = []; 
    updateUndoRedoButtonsUI();
}

function undo() {
    if (undoStack.length === 0 || isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    isUndoRedoAction = true;
    const currentState = JSON.stringify(getCurrentLedgerSnapshot());
    redoStack.push(currentState);

    const previousState = JSON.parse(undoStack.pop());
    restoreLedgerData(previousState);

    saveLedger();
    isUndoRedoAction = false;
    updateUndoRedoButtonsUI();
}

function redo() {
    if (redoStack.length === 0 || isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    isUndoRedoAction = true;
    const currentState = JSON.stringify(getCurrentLedgerSnapshot());
    undoStack.push(currentState);

    const nextState = JSON.parse(redoStack.pop());
    restoreLedgerData(nextState);

    saveLedger();
    isUndoRedoAction = false;
    updateUndoRedoButtonsUI();
}

function updateUndoRedoButtonsUI() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    if (undoBtn) undoBtn.disabled = undoStack.length === 0 || isPreviewMode;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0 || isPreviewMode;
}

// ============================================================
// CUSTOM NAME DROPDOWN SYSTEM FOR ACTIVE NAME BAR
// ============================================================

function buildNameDropdown(filterText = "") {
    const dropdown = document.getElementById("customNameDropdown");
    if (!dropdown) return;

    dropdown.innerHTML = "";
    const filterLower = filterText.trim().toLowerCase();

    const filtered = DEFAULT_NAMES.filter(name => 
        name && name.trim() !== "" && name.toLowerCase().includes(filterLower)
    );

    if (filtered.length === 0) {
        dropdown.style.display = "none";
        return;
    }

    filtered.forEach(name => {
        const item = document.createElement("div");
        item.className = "custom-dropdown-item";
        item.textContent = name;
        item.onmousedown = (e) => {
            e.preventDefault();
            selectDropdownName(name);
        };
        dropdown.appendChild(item);
    });

    dropdown.style.display = "block";
}

function showNameDropdown() {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY" || !isEditingActive) return;
    const inputVal = document.getElementById("activeCustomerInput")?.value || "";
    buildNameDropdown(inputVal);
}

function filterNameDropdown(val) {
    buildNameDropdown(val);
}

function hideNameDropdown() {
    const dropdown = document.getElementById("customNameDropdown");
    if (dropdown) dropdown.style.display = "none";
}

function selectDropdownName(name) {
    pushUndoState();
    const topInput = document.getElementById("activeCustomerInput");
    if (topInput) {
        topInput.value = name;
    }
    handleActiveCustomerNameChange(name);
    hideNameDropdown();
}

// ============================================================
// DYNAMIC CUSTOMER TABLE RENDERING
// ============================================================

function harvestTableValues() {
    customerRows.forEach((row, index) => {
        const i = index + 1;
        const nameEl = document.getElementById(`ledgerName_${i}`);
        const dryEl = document.getElementById(`ledgerDry_${i}`);
        const freshEl = document.getElementById(`ledgerFresh_${i}`);
        const cabEl = document.getElementById(`ledgerCab_${i}`);
        const boEl = document.getElementById(`ledgerBo_${i}`);
        const balEl = document.getElementById(`ledgerBal_${i}`);
        const billingEl = document.getElementById(`ledgerBilling_${i}`);
        const payEl = document.getElementById(`ledgerPay_${i}`);
        const remEl = document.getElementById(`ledgerRem_${i}`);

        if (nameEl) row.name = nameEl.value;
        if (dryEl) row.dry = dryEl.value;
        if (freshEl) row.fresh = freshEl.value;
        if (cabEl) row.cab = cabEl.value;
        if (boEl) row.bo = boEl.value;
        if (balEl) row.bal = balEl.value;
        if (billingEl) row.billing = billingEl.value;
        if (payEl) row.pay = payEl.value;
        if (remEl) row.rem = remEl.value;
    });
}

function renderCustomerTableBody() {
    const tbody = document.getElementById("customerTableBody");
    if (!tbody) return;

    let html = "";
    customerRows.forEach((row, index) => {
        const i = index + 1;
        html += `
            <tr id="rowTr_${i}">
                <td>
                    <input type="text" class="name-input" id="ledgerName_${i}" 
                           value="${escapeHtml(row.name)}"
                           oninput="pushUndoState(); updateActiveCustomerName(${i}); saveLedger();" 
                           onfocus="loadRowToMain(${i})" readonly style="background-color:${activeRow === i ? 'white' : '#e5e7eb'};">
                </td>
                <td><input type="text" class="readonly-col" id="ledgerDry_${i}" value="${escapeHtml(row.dry)}" readonly onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col" id="ledgerFresh_${i}" value="${escapeHtml(row.fresh)}" readonly onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col" id="ledgerCab_${i}" value="${escapeHtml(row.cab)}" readonly onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col" id="ledgerBo_${i}" value="${escapeHtml(row.bo)}" readonly onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col" id="ledgerBal_${i}" value="${escapeHtml(row.bal)}" readonly onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col amount" id="ledgerBilling_${i}" value="${escapeHtml(row.billing)}" readonly></td>
                <td><input type="text" class="readonly-col colln-input" id="ledgerPay_${i}" value="${escapeHtml(row.pay)}" readonly onclick="handleRowCollTap(${i})" onfocus="loadRowToMain(${i})"></td>
                <td><input type="text" class="readonly-col amount" id="ledgerRem_${i}" value="${escapeHtml(row.rem)}" readonly></td>
            </tr>
        `;
    });

    // Add Row button
    html += `
        <tr id="addRowTr" style="background-color: #f0fdf4; cursor: pointer;" onclick="addNewCustomerRow()">
            <td colspan="9" style="text-align: center; font-weight: bold; color: #16a34a; padding: 12px; font-size: 14px;">
                ➕ TAP HERE TO ADD NEW ROW
            </td>
        </tr>
    `;

    // Net Total row
    html += `
        <tr>
            <td class="miki" style="color:#dc2626; font-size:9px; padding:0 1px;">NET TOTAL</td>
            <td class="net-total-red" id="totalDry">0</td>
            <td class="net-total-red" id="totalFresh">0</td>
            <td class="net-total-red" id="totalCab">0</td>
            <td class="net-total-red" id="totalBo">0</td>
            <td class="net-total-red" id="totalBal">0</td>
            <td class="net-total-red" id="totalBilling">0</td>
            <td class="net-total-red" id="totalColln">0</td>
            <td class="net-total-red" id="totalRem">0</td>
        </tr>
    `;

    tbody.innerHTML = html;
    toggleLockState(isLocked);
    calculateLedgerTotals();
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function addNewCustomerRow() {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY" || !isEditingActive) return;

    pushUndoState();
    harvestTableValues();

    customerRows.push({
        name: "",
        dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false
    });

    renderCustomerTableBody();
    loadRowToMain(customerRows.length);
    saveLedger();

    setTimeout(() => {
        const topInput = document.getElementById("activeCustomerInput");
        if (topInput) {
            topInput.focus();
            showNameDropdown();
        }
    }, 100);
}

// ============================================================
// SINGLE-TAP VIEW SWITCHER & PRINT AUDIT LOG SYSTEM
// ============================================================
let currentTableViewMode = "CUSTOMERS";

function setupViewSwitcher() {
    const viewToggleBtn = document.getElementById("viewToggleBtn");

    if (viewToggleBtn) {
        const newBtn = viewToggleBtn.cloneNode(true);
        viewToggleBtn.parentNode.replaceChild(newBtn, viewToggleBtn);

        // Single tap switch listener
        newBtn.addEventListener("click", (e) => {
            e.preventDefault();
            toggleTableViewMode();
        });
    }
}

function toggleTableViewMode() {
    if (currentTableViewMode === "CUSTOMERS") {
        currentTableViewMode = "PRINT_HISTORY";
        document.body.classList.add("print-history-active");
        renderPrintHistoryToTable();
    } else {
        currentTableViewMode = "CUSTOMERS";
        document.body.classList.remove("print-history-active");
        restoreCustomersToTable();
    }
    updateToggleBtnUI();
    updateUndoRedoButtonsUI();
}

function updateToggleBtnUI() {
    const viewToggleBtn = document.getElementById("viewToggleBtn");
    if (!viewToggleBtn) return;
    
    if (currentTableViewMode === "CUSTOMERS") {
        viewToggleBtn.innerText = "📋 VIEW: CUSTOMERS TABLE (Tap to Switch)";
        viewToggleBtn.style.backgroundColor = "#2563eb";
    } else {
        viewToggleBtn.innerText = "🖨️ VIEW: PRINT HISTORY LOG (Tap to Switch)";
        viewToggleBtn.style.backgroundColor = "#d97706";
    }
}

function recordPrintLog(rowNum, customerName, dry, fresh, cab, bo, bal, billing, payment, utang, copyCount) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const sessionDate = currentSessionDate || todayDate;
    const logKey = `miki_print_log_${sessionDate}`;

    let logs = JSON.parse(localStorage.getItem(logKey) || "[]");
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const logEntry = {
        printId: logs.length + 1,
        time: timeStr,
        rowNum: rowNum,
        customerName: customerName,
        dry: dry,
        fresh: fresh,
        cab: cab,
        bo: bo,
        bal: bal,
        billing: billing,
        payment: payment,
        utang: utang,
        copyCount: copyCount
    };

    logs.push(logEntry);
    localStorage.setItem(logKey, JSON.stringify(logs));

    if (currentTableViewMode === "PRINT_HISTORY") {
        renderPrintHistoryToTable();
    }
}

function renderPrintHistoryToTable() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const sessionDate = currentSessionDate || todayDate;
    const logKey = `miki_print_log_${sessionDate}`;
    const logs = JSON.parse(localStorage.getItem(logKey) || "[]");

    setEncodingEditable(false);

    let tempRows = logs.map(log => ({
        name: log.customerName || "",
        dry: log.dry || "",
        fresh: log.fresh || "",
        cab: log.cab || "",
        bo: log.bo || "",
        bal: log.bal || "",
        billing: formatMoney(log.billing),
        pay: formatMoney(log.payment),
        rem: formatMoney(log.utang),
        utangMode: false
    }));

    if (tempRows.length === 0) {
        tempRows = [{ name: "No print logs yet", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }];
    }

    const tbody = document.getElementById("customerTableBody");
    if (!tbody) return;

    let html = "";
    tempRows.forEach((row, index) => {
        const i = index + 1;
        html += `
            <tr>
                <td><input type="text" class="name-input" value="${escapeHtml(row.name)}" readonly style="background-color:#e5e7eb;"></td>
                <td><input type="text" class="readonly-col" value="${escapeHtml(row.dry)}" readonly></td>
                <td><input type="text" class="readonly-col" value="${escapeHtml(row.fresh)}" readonly></td>
                <td><input type="text" class="readonly-col" value="${escapeHtml(row.cab)}" readonly></td>
                <td><input type="text" class="readonly-col" value="${escapeHtml(row.bo)}" readonly></td>
                <td><input type="text" class="readonly-col" value="${escapeHtml(row.bal)}" readonly></td>
                <td><input type="text" class="readonly-col amount" value="${escapeHtml(row.billing)}" readonly></td>
                <td><input type="text" class="readonly-col colln-input" value="${escapeHtml(row.pay)}" readonly></td>
                <td><input type="text" class="readonly-col amount" value="${escapeHtml(row.rem)}" readonly></td>
            </tr>
        `;
    });

    html += `
        <tr>
            <td class="miki" style="color:#dc2626; font-size:9px; padding:0 1px;">NET TOTAL</td>
            <td class="net-total-red" id="totalDry">0</td>
            <td class="net-total-red" id="totalFresh">0</td>
            <td class="net-total-red" id="totalCab">0</td>
            <td class="net-total-red" id="totalBo">0</td>
            <td class="net-total-red" id="totalBal">0</td>
            <td class="net-total-red" id="totalBilling">0</td>
            <td class="net-total-red" id="totalColln">0</td>
            <td class="net-total-red" id="totalRem">0</td>
        </tr>
    `;

    tbody.innerHTML = html;
    calculateLedgerTotals();
}

function restoreCustomersToTable() {
    const activeDraft = JSON.parse(localStorage.getItem("miki_ledger_data"));
    if (activeDraft && activeDraft.customerRows) {
        restoreLedgerData(activeDraft);
    } else {
        renderCustomerTableBody();
    }
    setEncodingEditable(true);
}

// ============================================================
// SESSION DATE DISPLAY
// ============================================================

function updateSessionDateDisplay() {
    const dateEl = document.getElementById("displayFileDate");
    const nameEl = document.getElementById("displayFileName");
    const dayEl = document.getElementById("displayFileDay");
    const watermarkEl = document.getElementById("customerDayWatermark");

    if (!dateEl || !nameEl) return;

    if (!currentSessionDate) {
        dateEl.textContent = "--";
        nameEl.textContent = currentSessionName || "--";
        if (dayEl) dayEl.textContent = "---";
        if (watermarkEl) watermarkEl.textContent = "--";
        return;
    }

    const date = new Date(currentSessionDate + "T00:00:00");

    if (isNaN(date.getTime())) {
        dateEl.textContent = currentSessionDate;
        nameEl.textContent = currentSessionName || "--";
        if (dayEl) dayEl.textContent = "---";
        if (watermarkEl) watermarkEl.textContent = "--";
        return;
    }

    const dayNumber = String(date.getDate()).padStart(2, "0");
    const weekdayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    const formattedDate = monthNames[date.getMonth()] + " " + dayNumber + ", " + date.getFullYear();

    dateEl.textContent = formattedDate;
    nameEl.textContent = currentSessionName || "--";
    if (dayEl) dayEl.textContent = weekdayNames[date.getDay()];
    if (watermarkEl) watermarkEl.textContent = dayNumber;
}

// ============================================================
// INACTIVITY
// ============================================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        autoSaveAndReset();
    }, INACTIVITY_LIMIT_MS);
}

let lastActivityTime = 0;
function throttledResetInactivityTimer() {
    const now = Date.now();
    if (now - lastActivityTime > 1000) {
        lastActivityTime = now;
        resetInactivityTimer();
    }
}

['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, throttledResetInactivityTimer, true);
});

// ============================================================
// ENABLE / DISABLE ENCODING
// ============================================================

function setEncodingEditable(editable) {
    isEditingActive = editable;
    const inputs = document.querySelectorAll(
        '.main-wrapper input:not(.price-input):not(#modalDateInput):not(#modalNameInput)'
    );

    inputs.forEach(input => {
        if (!input.classList.contains('readonly-col')) {
            input.disabled = !editable;
        }
    });

    const nameInputs = document.querySelectorAll('.name-input');
    nameInputs.forEach(input => {
        input.disabled = !editable;
        input.readOnly = false;
        input.style.backgroundColor = "white";
    });

    updateUndoRedoButtonsUI();
}

// ============================================================
// PREVIEW MODE INPUT CONTROL
// ============================================================

function setPreviewMode(preview) {
    isPreviewMode = preview;
    document.body.classList.toggle("preview-mode", preview);

    if (preview) {
        isEditingActive = false;
        const inputs = document.querySelectorAll(
            '.main-wrapper input:not(#modalDateInput):not(#modalNameInput)'
        );
        inputs.forEach(input => {
            input.disabled = true;
        });
    } else {
        document.body.classList.remove("preview-mode");
    }
    updateUndoRedoButtonsUI();
}

// ============================================================
// MODALS
// ============================================================

function showOpenModal() {
    modalMode = "OPEN";
    document.getElementById("modalTitle").textContent = "Start New Ledger File";
    document.getElementById("modalSubtext").textContent = "System date is automatically set to today. Enter Salesman/Route name.";
    document.getElementById("modalActionBtn").textContent = "Open Ledger";

    document.getElementById("modalNameInput").value = "";
    document.getElementById("setupModal").style.display = "flex";
}

function openSaveConfirmationModal() {
    if (!currentSessionDate || !currentSessionName) {
        alert("No active session to save. Please start a session first.");
        return;
    }

    if (isPreviewMode) {
        alert("Preview mode is read-only.");
        return;
    }

    modalMode = "SAVE";
    document.getElementById("modalTitle").textContent = "Confirm & Save Ledger File";
    document.getElementById("modalSubtext").textContent = "Review Salesman/Route name before saving.";
    document.getElementById("modalActionBtn").textContent = "Save File";

    document.getElementById("modalNameInput").value = currentSessionName;
    document.getElementById("setupModal").style.display = "flex";
}

function handleModalSubmit() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;

    const nameVal = document.getElementById("modalNameInput").value.trim();

    if (!nameVal) {
        alert("Please enter Salesman / Route Name!");
        return;
    }

    if (modalMode === "SAVE") {
        currentSessionDate = todayDate;
        currentSessionName = nameVal;
        updateSessionDateDisplay();
        document.getElementById("setupModal").style.display = "none";

        forceSaveCurrentDay();
        clearAllLedgerInputs();

        currentSessionDate = "";
        currentSessionName = "";
        updateSessionDateDisplay();

        localStorage.removeItem("miki_ledger_data");
        setEncodingEditable(false);
        alert("Ledger saved successfully!");
    } else {
        const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
        const existingFile = history.find(item => item.date === todayDate);

        if (existingFile) {
            const confirmContinue = confirm(
                `A saved ledger for TODAY (${todayDate}) already exists.\n\n` +
                `Click OK (CONTINUE) to edit today's file.`
            );

            if (confirmContinue) {
                document.getElementById("setupModal").style.display = "none";
                loadHistoryFile(todayDate);
                return;
            } else {
                return;
            }
        }

        currentSessionDate = todayDate;
        currentSessionName = nameVal;

        updateSessionDateDisplay();
        document.getElementById("setupModal").style.display = "none";

        setPreviewMode(false);
        setEncodingEditable(true);
        resetInactivityTimer();

        clearAllLedgerInputs();
        applyDefaultNamesIfEmpty();
        saveLedger();
        forceSaveCurrentDay();
        loadRowToMain(1);
    }
}

function closeSetupModal() {
    document.getElementById("setupModal").style.display = "none";
}

function promptNewFile() {
    resetLedgerState();
}

// ============================================================
// AUTO SAVE & RESET
// ============================================================

function autoSaveAndReset() {
    if (currentSessionDate && currentSessionName && !isPreviewMode) {
        forceSaveCurrentDay();
        alert("System auto-saved due to 15 minutes of inactivity.");
        resetLedgerState();
    }
}

function resetLedgerState() {
    setPreviewMode(false);
    previewBackup = null;
    previewDateKey = null;

    currentSessionDate = "";
    currentSessionName = "";
    rowUtangMode = {};
    printCounters = {};
    customerRows = [{ name: DEFAULT_NAMES[0] || "", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }];

    undoStack = [];
    redoStack = [];

    updateSessionDateDisplay();
    clearAllLedgerInputs();

    localStorage.removeItem("miki_ledger_data");
    setEncodingEditable(false);
    renderHistoryUI();
    showOpenModal();
}

// ============================================================
// DEFAULT NAMES & CLEAR
// ============================================================

function applyDefaultNamesIfEmpty() {
    if (customerRows.length > 0 && (!customerRows[0].name || customerRows[0].name.trim() === "")) {
        customerRows[0].name = DEFAULT_NAMES[0] || "";
    }
    renderCustomerTableBody();
    updateActiveCustomerName(activeRow);
}

function clearAllLedgerInputs() {
    clearMainInputs();

    customerRows = [
        { name: DEFAULT_NAMES[0] || "", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }
    ];

    rowUtangMode = {};
    printCounters = {};

    renderCustomerTableBody();

    for (let i = 1; i <= 8; i++) {
        if (document.getElementById(`extraItem_${i}`)) document.getElementById(`extraItem_${i}`).value = "";
        if (document.getElementById(`extraAmount_${i}`)) document.getElementById(`extraAmount_${i}`).value = "";
    }

    if (document.getElementById("inputCOH")) document.getElementById("inputCOH").value = "0";

    const note = document.getElementById("newTableNote");
    if (note) note.value = "";

    activeRow = 1;
    updateActiveCustomerName(1);

    calculateLedgerTotals();
    calculateExtraTable();
}

// ============================================================
// LOCKS & TAPS
// ============================================================

function handleKeyClick() {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    tapCount++;
    clearTimeout(tapTimer);

    tapTimer = setTimeout(() => {
        tapCount = 0;
    }, 1000);

    if (tapCount >= 5) {
        tapCount = 0;
        isLocked = !isLocked;
        toggleLockState(isLocked);
    }
}

function toggleLockState(locked) {
    const header = document.getElementById("lockHeader");
    if (header) header.textContent = locked ? "🔒" : "🔑";

    const nameInputs = document.querySelectorAll(".name-input");
    nameInputs.forEach(field => {
        field.readOnly = locked;
        field.style.backgroundColor = locked ? "#e5e7eb" : "white";
    });
}

function handlePriceKeyClick() {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    priceTapCount++;
    clearTimeout(priceTapTimer);

    priceTapTimer = setTimeout(() => {
        priceTapCount = 0;
    }, 1000);

    if (priceTapCount >= 5) {
        priceTapCount = 0;
        isPriceLocked = !isPriceLocked;
        togglePriceLockState(isPriceLocked);
    }
}

function togglePriceLockState(locked) {
    const header = document.getElementById("priceLockHeader");
    if (header) header.textContent = locked ? "Price 🔒" : "Price 🔑";

    const priceInputs = document.querySelectorAll(".price-input");
    priceInputs.forEach(field => {
        field.readOnly = locked;
        field.style.backgroundColor = locked ? "#e5e7eb" : "white";
    });
}

function handleRowCollTap(row) {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    if (!rowTapCounts[row]) rowTapCounts[row] = 0;
    rowTapCounts[row]++;

    clearTimeout(rowTapTimers[row]);
    rowTapTimers[row] = setTimeout(() => {
        rowTapCounts[row] = 0;
    }, 1000);

    if (rowTapCounts[row] >= 5) {
        pushUndoState();
        rowTapCounts[row] = 0;
        rowUtangMode[row] = !rowUtangMode[row];

        if (row === activeRow) {
            calculateMain();
        } else {
            const billingEl = document.getElementById(`ledgerBilling_${row}`);
            const payEl = document.getElementById(`ledgerPay_${row}`);
            const remEl = document.getElementById(`ledgerRem_${row}`);

            if (billingEl && payEl && remEl) {
                const billingVal = parseFloat(billingEl.value.replace(/,/g, '')) || 0;
                if (rowUtangMode[row]) {
                    payEl.value = "";
                    remEl.value = formatMoney(billingVal);
                } else {
                    payEl.value = formatMoney(billingVal);
                    remEl.value = "0";
                }
                calculateLedgerTotals();
            }
        }
    }
}

// ============================================================
// HELPERS
// ============================================================

function getVal(id) {
    const element = document.getElementById(id);
    if (!element) return 0;
    const val = parseFloat(element.value);
    return isNaN(val) ? 0 : val;
}

function formatMoney(value) {
    return Math.round(value).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// ============================================================
// SYNC & MAIN CALCULATION
// ============================================================

function syncFromPanel(type) {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;
    
    pushUndoState();
    let targetType = type;
    if (type.toUpperCase() === "BO") targetType = "Bo";

    const val = document.getElementById("sync" + targetType).value;
    const targetId = targetType === "Dry" ? "qtyReg" : "qty" + targetType;
    
    const targetInput = document.getElementById(targetId);
    if (targetInput) {
        targetInput.value = val;
    }
    calculateMain();
}

function syncFromTable(type) {
    if (isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    pushUndoState();
    let targetType = type;
    if (type.toUpperCase() === "BO") targetType = "Bo";

    const targetId = (type === "Reg" || type === "Dry") ? "syncDry" : "sync" + targetType;
    const val = document.getElementById("qty" + targetType).value;
    
    const syncInput = document.getElementById(targetId);
    if (syncInput) {
        syncInput.value = val;
    }
    calculateMain();
}

function clearMainInputs() {
    pushUndoState();
    document.getElementById("qtyReg").value = "";
    document.getElementById("syncDry").value = "";

    document.getElementById("qtyFresh").value = "";
    document.getElementById("syncFresh").value = "";

    document.getElementById("qtyCab").value = "";
    document.getElementById("syncCab").value = "";

    document.getElementById("qtyBo").value = "";
    document.getElementById("syncBo").value = "";

    document.getElementById("inputBal").value = "";
    document.getElementById("inputPay").value = "";

    calculateMain();
}

function calculateMain() {
    if (currentTableViewMode === "PRINT_HISTORY") return;

    const regQty = getVal("qtyReg");
    const regPrice = getVal("priceReg");
    const regAmount = Math.round(regQty * regPrice);

    const freshQty = getVal("qtyFresh");
    const freshPrice = getVal("priceFresh");
    const freshAmount = Math.round(freshQty * freshPrice);

    const cabQty = getVal("qtyCab");
    const cabPrice = getVal("priceCab");
    const cabAmount = Math.round(cabQty * cabPrice);

    const boQty = getVal("qtyBo");
    const boPrice = getVal("priceBo");
    const boAmount = Math.round((boQty / 2) * boPrice);

    const totalOrdersAmount = regAmount + freshAmount + cabAmount - boAmount;
    const balAmount = Math.round(getVal("inputBal"));
    const payAmount = Math.round(getVal("inputPay"));

    const grandTotalAmount = totalOrdersAmount + balAmount;
    const netTotal = grandTotalAmount - payAmount;

    document.getElementById("amountReg").textContent = formatMoney(regAmount);
    document.getElementById("amountFresh").textContent = formatMoney(freshAmount);
    document.getElementById("amountCab").textContent = formatMoney(cabAmount);
    document.getElementById("amountBo").textContent = formatMoney(boAmount);
    document.getElementById("totalAmount").textContent = formatMoney(totalOrdersAmount);
    document.getElementById("netTotalAmount").textContent = formatMoney(netTotal);

    if (document.getElementById(`ledgerDry_${activeRow}`)) document.getElementById(`ledgerDry_${activeRow}`).value = document.getElementById("qtyReg").value;
    if (document.getElementById(`ledgerFresh_${activeRow}`)) document.getElementById(`ledgerFresh_${activeRow}`).value = document.getElementById("qtyFresh").value;
    if (document.getElementById(`ledgerCab_${activeRow}`)) document.getElementById(`ledgerCab_${activeRow}`).value = document.getElementById("qtyCab").value;
    if (document.getElementById(`ledgerBo_${activeRow}`)) document.getElementById(`ledgerBo_${activeRow}`).value = document.getElementById("qtyBo").value;
    if (document.getElementById(`ledgerBal_${activeRow}`)) document.getElementById(`ledgerBal_${activeRow}`).value = document.getElementById("inputBal").value;
    
    if (document.getElementById(`ledgerBilling_${activeRow}`)) document.getElementById(`ledgerBilling_${activeRow}`).value = formatMoney(totalOrdersAmount);

    const hasPayEntry = document.getElementById("inputPay").value.trim() !== "";
    let collnVal = 0;
    let remVal = 0;

    if (rowUtangMode[activeRow]) {
        collnVal = 0;
        remVal = grandTotalAmount;
        if (document.getElementById(`ledgerPay_${activeRow}`)) document.getElementById(`ledgerPay_${activeRow}`).value = "";
    } else {
        collnVal = hasPayEntry ? payAmount : grandTotalAmount;
        remVal = grandTotalAmount - collnVal;
        if (document.getElementById(`ledgerPay_${activeRow}`)) document.getElementById(`ledgerPay_${activeRow}`).value = formatMoney(collnVal);
    }

    if (document.getElementById(`ledgerRem_${activeRow}`)) document.getElementById(`ledgerRem_${activeRow}`).value = formatMoney(remVal);

    saveGlobalPrices();
    calculateLedgerTotals();
    saveLedger();
}

function saveGlobalPrices() {
    const pReg = document.getElementById("priceReg")?.value;
    const pFresh = document.getElementById("priceFresh")?.value;
    const pCab = document.getElementById("priceCab")?.value;
    const pBo = document.getElementById("priceBo")?.value;

    if (pReg !== undefined && pFresh !== undefined && pCab !== undefined && pBo !== undefined) {
        localStorage.setItem("miki_saved_prices", JSON.stringify({
            reg: pReg,
            fresh: pFresh,
            cab: pCab,
            bo: pBo
        }));
    }
}

function restoreGlobalPrices() {
    const savedPrices = JSON.parse(localStorage.getItem("miki_saved_prices"));
    
    if (document.getElementById("priceReg")) {
        document.getElementById("priceReg").value = savedPrices?.reg || "50";
    }
    if (document.getElementById("priceFresh")) {
        document.getElementById("priceFresh").value = savedPrices?.fresh || "50";
    }
    if (document.getElementById("priceCab")) {
        document.getElementById("priceCab").value = savedPrices?.cab || "40";
    }
    if (document.getElementById("priceBo")) {
        document.getElementById("priceBo").value = savedPrices?.bo || "50";
    }
}

function calculateLedgerTotals() {
    let sumDry = 0, sumFresh = 0, sumCab = 0, sumBo = 0;
    let sumBal = 0, sumBilling = 0, sumColln = 0, sumRem = 0;

    for (let i = 1; i <= customerRows.length; i++) {
        const dryEl = document.getElementById(`ledgerDry_${i}`);
        if (!dryEl) continue;

        sumDry += parseFloat(dryEl.value) || 0;
        sumFresh += parseFloat(document.getElementById(`ledgerFresh_${i}`).value) || 0;
        sumCab += parseFloat(document.getElementById(`ledgerCab_${i}`).value) || 0;
        sumBo += parseFloat(document.getElementById(`ledgerBo_${i}`).value) || 0;
        sumBal += parseFloat(document.getElementById(`ledgerBal_${i}`).value) || 0;

        const billStr = document.getElementById(`ledgerBilling_${i}`).value.replace(/,/g, '');
        sumBilling += parseFloat(billStr) || 0;

        const collnStr = document.getElementById(`ledgerPay_${i}`).value.replace(/,/g, '');
        sumColln += parseFloat(collnStr) || 0;

        const remStr = document.getElementById(`ledgerRem_${i}`).value.replace(/,/g, '');
        sumRem += parseFloat(remStr) || 0;
    }

    document.getElementById("totalDry").textContent = formatMoney(sumDry);
    document.getElementById("totalFresh").textContent = formatMoney(sumFresh);
    document.getElementById("totalCab").textContent = formatMoney(sumCab);
    document.getElementById("totalBo").textContent = sumBo % 1 === 0 ? sumBo : sumBo.toFixed(1);
    document.getElementById("totalBal").textContent = formatMoney(sumBal);
    document.getElementById("totalBilling").textContent = formatMoney(sumBilling);
    document.getElementById("totalColln").textContent = formatMoney(sumColln);
    document.getElementById("totalRem").textContent = formatMoney(sumRem);

    calculateExtraTable();
}

function calculateExtraTable() {
    let leftTotal = 0;
    let allAmounts = 0;

    const c2Ids = ["extraAmount_1", "extraAmount_3", "extraAmount_5", "extraAmount_7"];
    c2Ids.forEach(id => {
        const element = document.getElementById(id);
        if (element) leftTotal += parseFloat(element.value) || 0;
    });

    for (let i = 1; i <= 8; i++) {
        const element = document.getElementById(`extraAmount_${i}`);
        if (element) allAmounts += parseFloat(element.value) || 0;
    }

    const totalCollnElement = document.getElementById("totalColln");
    const secondTableColln = totalCollnElement ? parseFloat(totalCollnElement.textContent.replace(/,/g, '')) || 0 : 0;
    const collectionPlusExtra = secondTableColln - allAmounts;

    const cohElement = document.getElementById("inputCOH");
    const coh = cohElement ? parseFloat(cohElement.value) || 0 : 0;

    const grandTotal = collectionPlusExtra - coh;

    const c2Total = document.getElementById("extraColumn2Total");
    if (c2Total) c2Total.textContent = formatMoney(leftTotal);

    const c4Total = document.getElementById("extraColumn4Total");
    if (c4Total) c4Total.textContent = formatMoney(allAmounts);

    const collectionDisplay = document.getElementById("collectionPlusExtra");
    if (collectionDisplay) collectionDisplay.textContent = formatMoney(collectionPlusExtra);

    const grandDisplay = document.getElementById("grandTotalAmount");
    if (grandDisplay) grandDisplay.textContent = formatMoney(grandTotal);
}

// ============================================================
// STORAGE & HISTORY (AUTO SAVING FULLY RESTORED)
// ============================================================

function saveLedger() {
    if (!currentSessionDate || !currentSessionName || !isEditingActive || isPreviewMode || currentTableViewMode === "PRINT_HISTORY") {
        return;
    }

    harvestTableValues();
    const noteElement = document.getElementById("newTableNote");

    const ledgerData = {
        date: currentSessionDate,
        name: currentSessionName,
        customerRows: customerRows,
        utangModes: rowUtangMode,
        printCounters: printCounters,
        extraTable: {
            note: noteElement ? noteElement.value : ""
        },
        prices: {
            reg: document.getElementById("priceReg")?.value || "",
            fresh: document.getElementById("priceFresh")?.value || "",
            cab: document.getElementById("priceCab")?.value || "",
            bo: document.getElementById("priceBo")?.value || ""
        }
    };

    for (let i = 1; i <= 8; i++) {
        ledgerData.extraTable[`item_${i}`] = document.getElementById(`extraItem_${i}`)?.value || "";
        ledgerData.extraTable[`amount_${i}`] = document.getElementById(`extraAmount_${i}`)?.value || "";
    }

    ledgerData.extraTable.coh = document.getElementById("inputCOH")?.value || "0";

    localStorage.setItem("miki_ledger_data", JSON.stringify(ledgerData));

    let history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const existingIndex = history.findIndex(item => item.date === ledgerData.date);

    if (existingIndex !== -1) {
        history[existingIndex] = ledgerData;
    } else {
        history.unshift(ledgerData);
    }

    if (history.length > 30) {
        history = history.slice(0, 30);
    }

    localStorage.setItem("miki_30day_history", JSON.stringify(history));
    renderHistoryUI();
}

function forceSaveCurrentDay() {
    saveLedger();
}

function getCurrentLedgerSnapshot() {
    harvestTableValues();
    const snapshot = {
        date: currentSessionDate,
        name: currentSessionName,
        customerRows: JSON.parse(JSON.stringify(customerRows)),
        utangModes: { ...rowUtangMode },
        printCounters: { ...printCounters },
        extraTable: {
            note: document.getElementById("newTableNote")?.value || ""
        },
        prices: {
            reg: document.getElementById("priceReg")?.value || "",
            fresh: document.getElementById("priceFresh")?.value || "",
            cab: document.getElementById("priceCab")?.value || "",
            bo: document.getElementById("priceBo")?.value || ""
        }
    };

    for (let i = 1; i <= 8; i++) {
        snapshot.extraTable[`item_${i}`] = document.getElementById(`extraItem_${i}`)?.value || "";
        snapshot.extraTable[`amount_${i}`] = document.getElementById(`extraAmount_${i}`)?.value || "";
    }

    snapshot.extraTable.coh = document.getElementById("inputCOH")?.value || "0";

    return snapshot;
}

function restoreLedgerData(data) {
    if (!data) return;

    clearAllLedgerInputs();

    currentSessionDate = data.date || "";
    currentSessionName = data.name || "";
    rowUtangMode = data.utangModes ? { ...data.utangModes } : {};
    printCounters = data.printCounters ? { ...data.printCounters } : {};

    if (data.customerRows && Array.isArray(data.customerRows)) {
        customerRows = JSON.parse(JSON.stringify(data.customerRows));
    } else if (data.rows) {
        customerRows = [];
        for (let i = 1; i <= 50; i++) {
            if (data.rows[`name_${i}`]) {
                customerRows.push({
                    name: data.rows[`name_${i}`] || "",
                    dry: data.rows[`dry_${i}`] || "",
                    fresh: data.rows[`fresh_${i}`] || "",
                    cab: data.rows[`cab_${i}`] || "",
                    bo: data.rows[`bo_${i}`] || "",
                    bal: data.rows[`bal_${i}`] || "",
                    billing: data.rows[`billing_${i}`] || "0",
                    pay: data.rows[`pay_${i}`] || "",
                    rem: data.rows[`rem_${i}`] || "0"
                });
            }
        }
        if (customerRows.length === 0) {
            customerRows = [{ name: DEFAULT_NAMES[0] || "", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }];
        }
    }

    updateSessionDateDisplay();
    restoreGlobalPrices();

    if (data.prices) {
        if (data.prices.reg && document.getElementById("priceReg")) document.getElementById("priceReg").value = data.prices.reg;
        if (data.prices.fresh && document.getElementById("priceFresh")) document.getElementById("priceFresh").value = data.prices.fresh;
        if (data.prices.cab && document.getElementById("priceCab")) document.getElementById("priceCab").value = data.prices.cab;
        if (data.prices.bo && document.getElementById("priceBo")) document.getElementById("priceBo").value = data.prices.bo;
    }

    renderCustomerTableBody();

    if (data.extraTable) {
        for (let i = 1; i <= 8; i++) {
            if (data.extraTable[`item_${i}`] !== undefined) document.getElementById(`extraItem_${i}`).value = data.extraTable[`item_${i}`];
            if (data.extraTable[`amount_${i}`] !== undefined) document.getElementById(`extraAmount_${i}`).value = data.extraTable[`amount_${i}`];
        }
        if (data.extraTable.coh !== undefined) document.getElementById("inputCOH").value = data.extraTable.coh;

        const noteElement = document.getElementById("newTableNote");
        if (noteElement) noteElement.value = data.extraTable.note || "";
    }

    calculateLedgerTotals();
    calculateExtraTable();
}

function loadHistoryFile(dateKey) {
    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const selectedFile = history.find(item => item.date === dateKey);

    if (!selectedFile) return;

    previewBackup = null;
    previewDateKey = null;

    setPreviewMode(false);
    restoreLedgerData(selectedFile);

    document.getElementById("setupModal").style.display = "none";
    setEncodingEditable(true);

    loadRowToMain(1);
    calculateLedgerTotals();
    calculateExtraTable();

    saveLedger();
    renderHistoryUI(dateKey);
    resetInactivityTimer();
}

function previewHistoryFile(dateKey) {
    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const selectedFile = history.find(item => item.date === dateKey);

    if (!selectedFile) return;

    if (isPreviewMode && previewDateKey === dateKey) {
        exitHistoryPreview();
        return;
    }

    if (!isPreviewMode) {
        if (currentSessionDate && currentSessionName) {
            previewBackup = getCurrentLedgerSnapshot();
        } else {
            previewBackup = null;
        }
    }

    previewDateKey = dateKey;
    restoreLedgerData(selectedFile);

    document.getElementById("setupModal").style.display = "none";
    setPreviewMode(true);

    updateSessionDateDisplay();
    calculateLedgerTotals();
    calculateExtraTable();

    renderHistoryUI(dateKey);
    resetInactivityTimer();
}

function exitHistoryPreview() {
    if (!isPreviewMode) return;

    const backup = previewBackup;

    previewBackup = null;
    previewDateKey = null;

    setPreviewMode(false);

    if (backup) {
        restoreLedgerData(backup);
        setEncodingEditable(true);

        loadRowToMain(activeRow || 1);
        calculateLedgerTotals();
        calculateExtraTable();

        updateSessionDateDisplay();
        renderHistoryUI();
        resetInactivityTimer();
        return;
    }

    currentSessionDate = "";
    currentSessionName = "";
    rowUtangMode = {};
    printCounters = {};
    customerRows = [{ name: DEFAULT_NAMES[0] || "", dry: "", fresh: "", cab: "", bo: "", bal: "", billing: "0", pay: "", rem: "0", utangMode: false }];

    updateSessionDateDisplay();
    clearAllLedgerInputs();
    setEncodingEditable(false);
    renderHistoryUI();
}

// ============================================================
// HISTORY UI WITH PREVIEW, EDIT & DELETE BUTTONS
// ============================================================

function renderHistoryUI(selectedDateKey = null) {
    const historyContainer = document.getElementById("historyContainer");
    const historyCount = document.getElementById("historyCount");

    if (!historyContainer || !historyCount) return;

    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");

    historyCount.textContent = `${history.length} / 30`;
    history.sort((a, b) => b.date.localeCompare(a.date));

    if (history.length === 0) {
        historyContainer.innerHTML = `<p style="color:#9ca3af;text-align:center;margin:10px 0;">No saved files yet.</p>`;
        return;
    }

    const highlightKey = selectedDateKey || (isPreviewMode ? previewDateKey : currentSessionDate);
    historyContainer.innerHTML = "";

    history.forEach(item => {
        const div = document.createElement("div");
        const isSelected = item.date === highlightKey;
        const isPreviewFile = isPreviewMode && item.date === previewDateKey;

        div.className = `history-item ${isSelected ? 'selected-file' : ''} ${isPreviewFile ? 'preview-file' : ''}`;
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";

        const infoDiv = document.createElement("div");
        infoDiv.style.flex = "1";
        infoDiv.style.cursor = "pointer";
        infoDiv.addEventListener("click", function() {
            previewHistoryFile(item.date);
        });

        const strong = document.createElement("strong");
        const savedDate = new Date(item.date + "T00:00:00");
        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

        const formattedSavedDate = !isNaN(savedDate.getTime())
            ? monthNames[savedDate.getMonth()] + " " + String(savedDate.getDate()).padStart(2, "0") + ", " + savedDate.getFullYear()
            : item.date;

        strong.textContent = formattedSavedDate;
        infoDiv.appendChild(strong);
        infoDiv.appendChild(document.createTextNode(" - " + item.name));
        div.appendChild(infoDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "4px";

        const prevBtn = document.createElement("button");
        prevBtn.textContent = "👁️";
        prevBtn.title = "Preview File";
        prevBtn.className = "btn-sm";
        prevBtn.style.padding = "2px 6px";
        prevBtn.style.fontSize = "10px";
        prevBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            previewHistoryFile(item.date);
        });
        actionsDiv.appendChild(prevBtn);

        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.title = "Edit File";
        editBtn.className = "btn-sm";
        editBtn.style.padding = "2px 6px";
        editBtn.style.fontSize = "10px";
        editBtn.style.backgroundColor = "#2563eb";
        editBtn.style.color = "white";
        editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            editHistoryFile(item.date);
        });
        actionsDiv.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.title = "Delete File";
        delBtn.className = "btn-sm";
        delBtn.style.padding = "2px 6px";
        delBtn.style.fontSize = "10px";
        delBtn.style.backgroundColor = "#dc2626";
        delBtn.style.color = "white";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteHistoryFile(item.date);
        });
        actionsDiv.appendChild(delBtn);

        div.appendChild(actionsDiv);
        historyContainer.appendChild(div);
    });
}

function editHistoryFile(dateKey) {
    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const selectedFile = history.find(item => item.date === dateKey);

    if (!selectedFile) return;

    previewBackup = null;
    previewDateKey = null;

    setPreviewMode(false);
    restoreLedgerData(selectedFile);

    document.getElementById("setupModal").style.display = "none";
    setEncodingEditable(true);

    loadRowToMain(1);
    calculateLedgerTotals();
    calculateExtraTable();

    saveLedger();
    renderHistoryUI(dateKey);
    resetInactivityTimer();

    alert(`Opened ${dateKey} (${selectedFile.name}) for editing.`);
}

function deleteHistoryFile(dateKey) {
    if (!confirm(`Are you sure you want to delete the saved file for ${dateKey}?`)) return;

    let history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    history = history.filter(item => item.date !== dateKey);
    localStorage.setItem("miki_30day_history", JSON.stringify(history));

    if (currentSessionDate === dateKey) {
        currentSessionDate = "";
        currentSessionName = "";
        localStorage.removeItem("miki_ledger_data");
        clearAllLedgerInputs();
        setEncodingEditable(false);
        updateSessionDateDisplay();
        showOpenModal();
    } else if (previewDateKey === dateKey) {
        exitHistoryPreview();
    }

    renderHistoryUI();
    alert(`File for ${dateKey} has been deleted.`);
}

function loadLedger() {
    restoreGlobalPrices();
    
    renderCustomerTableBody();
    renderHistoryUI();

    const priceInputs = document.querySelectorAll('.price-input');
    priceInputs.forEach(input => {
        input.addEventListener('input', () => {
            pushUndoState();
            calculateMain();
        });
    });

    setPreviewMode(false);
    setEncodingEditable(false);
    updateSessionDateDisplay();

    const activeDraft = JSON.parse(localStorage.getItem("miki_ledger_data"));
    if (activeDraft && activeDraft.date) {
        restoreLedgerData(activeDraft);
        setEncodingEditable(true);
        loadRowToMain(1);
    } else {
        showOpenModal();
    }
}

// ============================================================
// DIRECT WEB BLUETOOTH PRINTER MANAGEMENT
// ============================================================

let bluetoothDevice = null;
let bluetoothCharacteristic = null;

async function connectBluetoothPrinter() {
    try {
        console.log("Searching for Bluetooth Thermal Printer...");
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'PT' },
                { namePrefix: 'MTP' },
                { namePrefix: 'POS' },
                { namePrefix: 'Printer' },
                { namePrefix: 'BlueTooth Printer' }
            ],
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                '00001101-0000-1000-8000-00805f9b34fb'
            ]
        });

        alert("Pairing with: " + (bluetoothDevice.name || "Printer"));
        const server = await bluetoothDevice.gatt.connect();
        
        const services = await server.getPrimaryServices();
        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    bluetoothCharacteristic = char;
                    break;
                }
            }
            if (bluetoothCharacteristic) break;
        }

        if (bluetoothCharacteristic) {
            alert("SUCCESS! Printer Connected.");
        } else {
            alert("Printer connected, but write channel was not found.");
        }
    } catch (error) {
        console.error("Bluetooth Connection Error:", error);
        alert("Bluetooth Error: " + error.message);
    }
}

async function sendToPrinter(textData) {
    if (!bluetoothCharacteristic) {
        const connectNow = confirm("Printer not connected yet. Do you want to pair/connect your Bluetooth Printer now?");
        if (connectNow) {
            await connectBluetoothPrinter();
        }
        if (!bluetoothCharacteristic) return false;
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(textData);
        
        const chunkSize = 256; 
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            if (bluetoothCharacteristic.properties.writeWithoutResponse) {
                await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
            } else {
                await bluetoothCharacteristic.writeValue(chunk);
            }
        }
        return true;
    } catch (err) {
        console.error("Print Error:", err);
        alert("Printing failed. Reconnecting...");
        bluetoothCharacteristic = null;
        return false;
    }
}

// ============================================================
// PRINT ACTIVE ROW RECEIPT — SAFE WRAPPER WITH ERROR CATCHING
// ============================================================
let isPrintingActive = false;

async function printActiveRowReceipt() {
    if (isPrintingActive) return;
    
    if (activeRow) {
        isPrintingActive = true;
        try {
            await printRowReceipt(activeRow);
        } catch (err) {
            console.error("Print execution error:", err);
            alert("Print Error: " + err.message);
        } finally {
            setTimeout(() => {
                isPrintingActive = false;
            }, 1200);
        }
    } else {
        alert("Pumili muna ng customer bago mag-print!");
    }
}

async function printRowReceipt(rowNum) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;

    const sessionDate = currentSessionDate || todayDate;
    const storageKey = `miki_counter_${sessionDate}_global`;

    let currentCount = parseInt(localStorage.getItem(storageKey)) || 0;
    currentCount += 1;
    localStorage.setItem(storageKey, currentCount.toString());

    saveLedger();

    // ========================================================
    // CUSTOMER DATA
    // ========================================================
    const nameInput = document.getElementById(`ledgerName_${rowNum}`);
    const customerName =
        (nameInput && nameInput.value.trim())
            ? nameInput.value.trim()
            : `Customer ${rowNum}`;

    const dry = parseFloat(
        document.getElementById(`ledgerDry_${rowNum}`)?.value
    ) || 0;

    const fresh = parseFloat(
        document.getElementById(`ledgerFresh_${rowNum}`)?.value
    ) || 0;

    const cab = parseFloat(
        document.getElementById(`ledgerCab_${rowNum}`)?.value
    ) || 0;

    const bo = parseFloat(
        document.getElementById(`ledgerBo_${rowNum}`)?.value
    ) || 0;

    const bal = parseFloat(
        document.getElementById(`ledgerBal_${rowNum}`)?.value
    ) || 0;

    // ========================================================
    // PRICES
    // ========================================================
    const priceReg =
        parseFloat(document.getElementById("priceReg")?.value) || 50;

    const priceFresh =
        parseFloat(document.getElementById("priceFresh")?.value) || 50;

    const priceCab =
        parseFloat(document.getElementById("priceCab")?.value) || 40;

    const priceBo =
        parseFloat(document.getElementById("priceBo")?.value) || 50;

    // ========================================================
    // CALCULATIONS
    // ========================================================
    const dryAmt = dry * priceReg;
    const freshAmt = fresh * priceFresh;
    const cabAmt = cab * priceCab;
    const boAmt = (bo / 2) * priceBo;

    const billingStr =
        document.getElementById(`ledgerBilling_${rowNum}`)
        ?.value
        .replace(/,/g, '') || "";

    const billing = parseFloat(billingStr) || 0;

    const paymentStr =
        document.getElementById(`ledgerPay_${rowNum}`)
        ?.value
        .replace(/,/g, '') || "";

    const payment = parseFloat(paymentStr) || 0;

    const utangStr =
        document.getElementById(`ledgerRem_${rowNum}`)
        ?.value
        .replace(/,/g, '') || "";

    const utang = parseFloat(utangStr) || 0;

    const grandTotal = billing + bal;

    // ========================================================
    // PRINT LOG
    // ========================================================
    recordPrintLog(
        rowNum,
        customerName,
        dry,
        fresh,
        cab,
        bo,
        bal,
        billing,
        payment,
        utang,
        currentCount
    );

    // ========================================================
    // HEADER INFORMATION
    // ========================================================
    const dateVal =
        document.getElementById("displayFileDate")?.innerText || "TODAY";

    const routeName =
        document.getElementById("displayFileName")?.innerText || "Paul";

    const now = new Date();

    const timeVal = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    // ========================================================
    // ESC/POS COMMANDS
    // ========================================================
    const ESC_INIT = "\x1B\x40";
    const ESC_ALIGN_CENTER = "\x1B\x61\x01";
    const ESC_ALIGN_LEFT = "\x1B\x61\x00";
    const ESC_FONT_A = "\x1B\x21\x00";

    const LINE = "------------------------------";
    const EQUAL = "==============================";

    function money(value) {
        return Number(value).toFixed(2);
    }

    function centerText(text, width = 30) {
        text = String(text);

        if (text.length >= width) {
            return text.substring(0, width);
        }

        const left = Math.floor((width - text.length) / 2);
        return " ".repeat(left) + text;
    }

    function formatItemLine(item, qty, amount) {
        const itemCol = String(item).padEnd(9, " ");
        const qtyCol = String(qty).padStart(4, " ");
        const amountCol = ("P " + money(amount)).padStart(12, " ");

        return itemCol + qtyCol + "   " + amountCol;
    }

    const itemLine1 = formatItemLine("DRY", dry, dryAmt);
    const itemLine2 = formatItemLine("FRESH", fresh, freshAmt);
    const itemLine3 = formatItemLine("CAB", cab, cabAmt);
    const itemLine4 = formatItemLine("BO", bo, boAmt);

    const billingText = "P " + money(billing);
    const balText = "P " + money(bal);
    const grandText = "P " + money(grandTotal);
    const paymentText = "P " + money(payment);
    const utangText = "P " + money(utang);

    const singleReceiptText =
        ESC_INIT +
        ESC_FONT_A +
        ESC_ALIGN_CENTER +
        EQUAL + "\n" +
        centerText("Blessed Day po") + "\n" +
        EQUAL + "\n" +
        ESC_ALIGN_LEFT +
        "Date: " + dateVal + "\n" +
        "Time: " + timeVal + "\n" +
        "Route: " + routeName + "\n" +
        "Customer: " + customerName + "\n" +
        "Print Copy #" + currentCount + "\n" +
        LINE + "\n" +
        "ITEM       QTY      AMOUNT\n" +
        LINE + "\n" +
        itemLine1 + "\n" +
        itemLine2 + "\n" +
        itemLine3 + "\n" +
        itemLine4 + "\n" +
        LINE + "\n" +
        "BILLING:     " + billingText.padStart(17, " ") + "\n" +
        "PREV. BAL:   " + balText.padStart(17, " ") + "\n" +
        LINE + "\n" +
        "GRAND TOTAL: " + grandText.padStart(15, " ") + "\n" +
        LINE + "\n" +
        "Payment:     " + paymentText.padStart(17, " ") + "\n" +
        LINE + "\n" +
        "Balance:     " + utangText.padStart(17, " ") + "\n" +
        EQUAL + "\n" +
        ESC_ALIGN_CENTER +
        centerText("Salamat po sa Pagtangkilik!") + "\n" +
        EQUAL + "\n\n\n\n\n\n";

    await sendToPrinter(singleReceiptText);
}

// ============================================================
// TARGETED SCREENSHOT FUNCTION
// ============================================================
function takeScreenshot() {
    harvestTableValues();
    const sessionBar = document.querySelector('.session-bar');
    const table2 = document.querySelector('.table-box-2');
    const table3 = document.querySelector('.table-box-3');
    const noteBar = document.getElementById('newTableNoteBar');

    if (!table2 || !table3) {
        alert("Hindi mahanap ang tables para sa screenshot.");
        return;
    }

    const captureContainer = document.createElement('div');
    captureContainer.style.padding = '10px';
    captureContainer.style.backgroundColor = '#f3f4f6';
    captureContainer.style.width = document.querySelector('.main-wrapper').clientWidth + 'px';

    if (sessionBar) captureContainer.appendChild(sessionBar.cloneNode(true));

    const clonedTable2 = table2.cloneNode(true);
    
    const addRowTr = clonedTable2.querySelector('#addRowTr');
    if (addRowTr) addRowTr.style.display = 'none';

    const scrollBox = clonedTable2.querySelector('.table-scroll-container');
    if (scrollBox) {
        scrollBox.style.maxHeight = 'none';
        scrollBox.style.overflow = 'visible';
    }

    const rows = clonedTable2.querySelectorAll('tbody tr');
    rows.forEach(tr => {
        if (tr.querySelector('.net-total-red')) return;

        const nameInput = tr.querySelector('.name-input');
        const dryInput = tr.querySelector('[id^="ledgerDry_"]');
        const billingInput = tr.querySelector('[id^="ledgerBilling_"]');

        const nameVal = nameInput ? nameInput.value.trim() : '';
        const dryVal = dryInput ? dryInput.value.trim() : '';
        const billingVal = billingInput ? billingInput.value.trim() : '';

        const hasData = (nameVal !== '') || (dryVal !== '' && dryVal !== '0') || (billingVal !== '' && billingVal !== '0');

        if (!hasData) {
            tr.style.display = 'none';
        }
    });

    captureContainer.appendChild(clonedTable2);
    captureContainer.appendChild(table3.cloneNode(true));
    if (noteBar) captureContainer.appendChild(noteBar.cloneNode(true));

    captureContainer.style.position = 'absolute';
    captureContainer.style.left = '-9999px';
    captureContainer.style.top = '-9999px';
    document.body.appendChild(captureContainer);

    html2canvas(captureContainer, {
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        const fileName = `miki-summary-${currentSessionDate || 'shot'}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        document.body.removeChild(captureContainer);
    }).catch(err => {
        console.error("Screenshot Error:", err);
        if (captureContainer.parentNode) {
            document.body.removeChild(captureContainer);
        }
        alert("Hindi makagawa ng screenshot. Subukan ulit.");
    });
}

// ============================================================
// NAME SYNCING BETWEEN MAIN NAME BAR & CUSTOMER TABLE
// ============================================================

function handleActiveCustomerNameChange(val) {
    if (currentTableViewMode === "PRINT_HISTORY") return;
    const currentNameEl = document.getElementById(`ledgerName_${activeRow}`);
    if (currentNameEl) {
        currentNameEl.value = val;
    }
    if (customerRows[activeRow - 1]) {
        customerRows[activeRow - 1].name = val;
    }
    saveLedger();
}

function updateActiveCustomerName(row) {
    if (row === activeRow) {
        const nameEl = document.getElementById(`ledgerName_${row}`);
        const topInput = document.getElementById("activeCustomerInput");
        
        if (nameEl && topInput) {
            topInput.value = nameEl.value;
        }
    }
}

function loadRowToMain(row) {
    if (!isEditingActive || isPreviewMode || currentTableViewMode === "PRINT_HISTORY") return;

    harvestTableValues();
    activeRow = row;

    for (let i = 1; i <= customerRows.length; i++) {
        const nameInput = document.getElementById(`ledgerName_${i}`);
        if (nameInput) {
            nameInput.style.backgroundColor = (i === activeRow) ? 'white' : '#e5e7eb';
        }
    }
    
    const currentName = document.getElementById(`ledgerName_${row}`)?.value || "";
    const topInput = document.getElementById("activeCustomerInput");
    if (topInput) {
        topInput.value = currentName;
    }

    if (document.getElementById(`ledgerDry_${row}`)) {
        document.getElementById("qtyReg").value = document.getElementById(`ledgerDry_${row}`).value;
        document.getElementById("syncDry").value = document.getElementById(`ledgerDry_${row}`).value;
    }
    if (document.getElementById(`ledgerFresh_${row}`)) {
        document.getElementById("qtyFresh").value = document.getElementById(`ledgerFresh_${row}`).value;
        document.getElementById("syncFresh").value = document.getElementById(`ledgerFresh_${row}`).value;
    }
    if (document.getElementById(`ledgerCab_${row}`)) {
        document.getElementById("qtyCab").value = document.getElementById(`ledgerCab_${row}`).value;
        document.getElementById("syncCab").value = document.getElementById(`ledgerCab_${row}`).value;
    }
    if (document.getElementById(`ledgerBo_${row}`)) {
        document.getElementById("qtyBo").value = document.getElementById(`ledgerBo_${row}`).value;
        document.getElementById("syncBo").value = document.getElementById(`ledgerBo_${row}`).value;
    }
    if (document.getElementById(`ledgerBal_${row}`)) {
        document.getElementById("inputBal").value = document.getElementById(`ledgerBal_${row}`).value;
    }

    const payEl = document.getElementById(`ledgerPay_${row}`);
    if (payEl) {
        const rawColln = payEl.value.replace(/,/g, '');
        document.getElementById("inputPay").value = rawColln !== "" ? rawColln : "";
    }

    calculateMain();
    saveLedger();
}
